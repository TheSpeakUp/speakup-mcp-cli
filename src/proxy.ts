import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { ProxyConfig } from './config.js';
import { logger, maskToken, shortMask } from './log.js';

export const USER_AGENT = '@speakup/mcp-cli/0.1.0';

export interface Bridge {
  shutdown(reason: string): Promise<void>;
}

export async function runProxy(cfg: ProxyConfig): Promise<Bridge> {
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
    const results = await Promise.allSettled([remote.close(), stdio.close()]);
    for (const r of results) {
      if (r.status === 'rejected') {
        logger.warn(`close failed: ${maskToken(String(r.reason))}`);
      }
    }
  };

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
  remote.onerror = (err: Error): void => logger.error(`http: ${maskToken(err.message)}`);

  stdio.onclose = (): void => {
    void shutdown('stdio closed (Claude Desktop disconnected)').then(() => process.exit(0));
  };
  remote.onclose = (): void => {
    void shutdown('remote closed').then(() => process.exit(0));
  };

  const onSignal = (sig: NodeJS.Signals): void => {
    void shutdown(sig).then(() => process.exit(0));
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
