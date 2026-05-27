import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { ProxyConfig } from './config.js';
import { logger, maskToken, shortMask } from './log.js';

export const USER_AGENT = '@speakup/mcp-cli/0.1.0';

export type ExitCode = 0 | 1;

export type ExitReason = 'SIGINT' | 'SIGTERM' | 'stdio-close' | 'remote-close' | 'remote-error';

/**
 * Maps a terminal reason to a POSIX exit code. Operator visibility matters:
 * Claude Desktop logs the exit code, and a clean-looking exit 0 on every
 * failure mode (auth fail, backend drop, network) suppresses the signal the
 * operator needs to know that a retry / re-auth is warranted.
 *
 * - exit 0: clean shutdown — client disconnected or operator sent a signal.
 * - exit 1: unexpected remote termination (auth fail, network, backend crash).
 */
export function decideExitCode(reason: ExitReason): ExitCode {
  switch (reason) {
    case 'SIGINT':
    case 'SIGTERM':
    case 'stdio-close':
      return 0;
    case 'remote-close':
    case 'remote-error':
      return 1;
    default: {
      // Exhaustiveness check — adding a new ExitReason without a case here
      // is a compile-time error, not a silent runtime fall-through.
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

/** Hard ceiling for cleanup `Promise.allSettled` before we force-exit anyway. */
export const SHUTDOWN_TIMEOUT_MS = 5_000;

export interface ExitOnceDeps {
  exit: (code: ExitCode) => never;
  shutdown: (description: string) => Promise<void>;
  log: (msg: string) => void;
}

/**
 * Builds a one-shot terminator that maps the *first* terminal reason to a
 * decided exit code, runs `shutdown`, then calls `exit(code)`. Subsequent
 * calls are no-ops so a cascading close (stdio after remote, etc.) cannot
 * overwrite the original exit code — first-cause wins, which matters for
 * operator diagnostics in the Claude Desktop log.
 */
export function createExitOnce(
  deps: ExitOnceDeps,
): (reason: ExitReason, description: string) => void {
  let exited = false;
  return (reason, description) => {
    if (exited) return;
    exited = true;
    const code = decideExitCode(reason);
    deps.log(`exiting ${code} (${reason}): ${description}`);
    // `then(ok, fail)` rather than `finally` so a rejected shutdown does not
    // leak as an unhandled-rejection — `exit` is called identically either way.
    const onSettled = (): void => {
      deps.exit(code);
    };
    void deps.shutdown(description).then(onSettled, onSettled);
  };
}

export interface RunProxyOptions {
  /** Test seam — defaults to `process.exit`. */
  exit?: (code: ExitCode) => never;
}

export interface Bridge {
  shutdown(reason: string): Promise<void>;
}

export async function runProxy(cfg: ProxyConfig, opts: RunProxyOptions = {}): Promise<Bridge> {
  const exit = opts.exit ?? ((code: ExitCode): never => process.exit(code));
  logger.info(`starting proxy → ${cfg.url.toString()} (token ${shortMask(cfg.token)})`);

  const remote = new StreamableHTTPClientTransport(cfg.url, {
    requestInit: {
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'User-Agent': USER_AGENT,
      },
    },
  });

  const stdio = new StdioServerTransport();

  let closing = false;
  const shutdown = async (reason: string): Promise<void> => {
    if (closing) return;
    closing = true;
    logger.info(`shutdown: ${reason}`);
    // Race cleanup against a hard timeout: a dead remote can stall
    // `remote.close()` waiting on a TCP FIN ack that will never arrive.
    // We prefer a non-zero exit over a hung Claude Desktop child process.
    const cleanup = Promise.allSettled([remote.close(), stdio.close()]);
    const timeout = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), SHUTDOWN_TIMEOUT_MS).unref(),
    );
    const outcome = await Promise.race([cleanup, timeout]);
    if (outcome === 'timeout') {
      logger.warn(`shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms; forcing exit`);
      return;
    }
    for (const r of outcome) {
      if (r.status === 'rejected') {
        logger.warn(`close failed: ${maskToken(String(r.reason))}`);
      }
    }
  };

  const exitOnce = createExitOnce({
    exit,
    shutdown,
    log: (m) => logger.info(m),
  });

  stdio.onmessage = (msg: JSONRPCMessage): void => {
    if (cfg.debug) logger.debug(`stdin → http: ${truncate(JSON.stringify(msg))}`);
    remote.send(msg).catch((err: unknown) => {
      const m = err instanceof Error ? err.message : String(err);
      logger.error(`forward stdin→http failed: ${maskToken(m)}`);
    });
  };

  remote.onmessage = (msg: JSONRPCMessage): void => {
    if (cfg.debug) logger.debug(`http → stdout: ${truncate(JSON.stringify(msg))}`);
    stdio.send(msg).catch((err: unknown) => {
      const m = err instanceof Error ? err.message : String(err);
      logger.error(`forward http→stdout failed: ${maskToken(m)}`);
    });
  };

  stdio.onerror = (err: Error): void => logger.error(`stdio: ${maskToken(err.message)}`);
  remote.onerror = (err: Error): void => {
    // SDK does not contract that `onclose` always follows `onerror` — an
    // SSE drop mid-chunk or a fetch reject on a keep-alive connection can
    // leave the transport in a zombie state. Trigger exit ourselves;
    // `exitOnce` is idempotent so a follow-up `onclose` is a no-op.
    logger.error(`http: ${maskToken(err.message)}`);
    exitOnce('remote-error', `remote error: ${maskToken(err.message)}`);
  };

  stdio.onclose = (): void => exitOnce('stdio-close', 'Claude Desktop disconnected');
  remote.onclose = (): void => exitOnce('remote-close', 'remote closed unexpectedly');

  const onSignal = (sig: NodeJS.Signals): void => {
    const reason: ExitReason = sig === 'SIGINT' ? 'SIGINT' : 'SIGTERM';
    exitOnce(reason, `received ${sig}`);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  await remote.start();
  logger.info('http transport ready');
  await stdio.start();
  logger.info('stdio ready — waiting for client');

  return { shutdown };
}

function truncate(s: string, max = 200): string {
  return s.length > max ? `${s.slice(0, max)}…(+${s.length - max})` : s;
}
