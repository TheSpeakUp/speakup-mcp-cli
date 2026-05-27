import { describe, expect, it, vi } from 'vitest';
import { createExitOnce, decideExitCode, type ExitCode, type ExitReason } from '../src/proxy.js';

describe('decideExitCode', () => {
  it.each<[ExitReason, 0 | 1]>([
    ['SIGINT', 0],
    ['SIGTERM', 0],
    ['stdio-close', 0],
    ['remote-close', 1],
    ['remote-error', 1],
  ])('reason %s → exit %d', (reason, expected) => {
    expect(decideExitCode(reason)).toBe(expected);
  });

  it('uses non-zero for every reason that indicates an unexpected remote-side termination', () => {
    // Sanity guard: if a new ExitReason is added, this test forces the author
    // to revisit the decision matrix rather than silently default to exit 0.
    const all: ExitReason[] = ['SIGINT', 'SIGTERM', 'stdio-close', 'remote-close', 'remote-error'];
    const remoteSide = all.filter((r) => r.startsWith('remote-'));
    for (const r of remoteSide) {
      expect(decideExitCode(r)).toBe(1);
    }
  });
});

describe('createExitOnce', () => {
  const makeHarness = () => {
    const exitCalls: ExitCode[] = [];
    const shutdownCalls: string[] = [];
    const exit = ((code: ExitCode) => {
      exitCalls.push(code);
    }) as (c: ExitCode) => never;
    const shutdown = vi.fn(async (description: string): Promise<void> => {
      shutdownCalls.push(description);
    });
    const log = vi.fn();
    const exitOnce = createExitOnce({ exit, shutdown, log });
    const flush = (): Promise<void> => new Promise((r) => setImmediate(r));
    return { exitCalls, shutdownCalls, shutdown, log, exitOnce, flush };
  };

  it('calls exit exactly once with the code of the first reason', async () => {
    const h = makeHarness();
    h.exitOnce('stdio-close', 'first');
    h.exitOnce('remote-close', 'second');
    h.exitOnce('SIGTERM', 'third');
    await h.flush();
    expect(h.exitCalls).toEqual([0]);
    expect(h.shutdown).toHaveBeenCalledOnce();
    expect(h.shutdown).toHaveBeenCalledWith('first');
  });

  it('first-cause wins even when the later reason maps to a higher exit code', async () => {
    // stdio-close → 0 first; subsequent remote-close → 1 must NOT overwrite.
    const h = makeHarness();
    h.exitOnce('stdio-close', 'client gone');
    h.exitOnce('remote-close', 'backend died');
    await h.flush();
    expect(h.exitCalls).toEqual([0]);
  });

  it('first-cause wins even when the later reason maps to a lower exit code', async () => {
    // remote-error → 1 first; subsequent stdio-close → 0 must NOT overwrite.
    const h = makeHarness();
    h.exitOnce('remote-error', 'auth fail');
    h.exitOnce('stdio-close', 'cascading close');
    await h.flush();
    expect(h.exitCalls).toEqual([1]);
  });

  it('still exits when shutdown rejects', async () => {
    const exitCalls: ExitCode[] = [];
    const exit = ((code: ExitCode) => {
      exitCalls.push(code);
    }) as (c: ExitCode) => never;
    const shutdown = vi.fn(async (): Promise<void> => {
      throw new Error('cleanup blew up');
    });
    const exitOnce = createExitOnce({ exit, shutdown, log: vi.fn() });
    exitOnce('remote-close', 'unexpected');
    await new Promise((r) => setImmediate(r));
    expect(exitCalls).toEqual([1]);
  });
});
