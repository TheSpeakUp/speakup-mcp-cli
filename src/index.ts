#!/usr/bin/env node
import { loadConfig, ConfigError } from './config.js';
import { logger, setDebug } from './log.js';
import { runProxy } from './proxy.js';

async function main(): Promise<void> {
  const cfg = loadConfig(process.env);
  setDebug(cfg.debug);
  await runProxy(cfg);
}

main().catch((err: unknown) => {
  if (err instanceof ConfigError) {
    logger.fatal(err.message);
    process.exit(2);
  }
  const msg = err instanceof Error ? err.message : String(err);
  logger.fatal(`startup failed: ${msg}`);
  process.exit(1);
});
