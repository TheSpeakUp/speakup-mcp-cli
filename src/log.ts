// Token body charset matches backend `secrets.token_urlsafe()` output: base64url.
const TOKEN_RE = /sk_speakup_[A-Za-z0-9_-]+/g;

export function maskToken(input: string): string {
  return input.replace(TOKEN_RE, (m) => {
    const tail = m.length >= 4 ? m.slice(-4) : '****';
    return `sk_speakup_***${tail}`;
  });
}

export function shortMask(token: string): string {
  if (!token.startsWith('sk_speakup_')) return 'sk_speakup_********';
  const tail = token.slice(-4);
  return `sk_speakup_***${tail}`;
}

let debugEnabled = false;

export function setDebug(on: boolean): void {
  debugEnabled = on;
}

function emit(level: string, msg: string): void {
  const line = `[speakup-mcp-cli] ${new Date().toISOString()} ${level} ${maskToken(msg)}\n`;
  process.stderr.write(line);
}

export const logger = {
  info: (msg: string): void => emit('INFO', msg),
  warn: (msg: string): void => emit('WARN', msg),
  error: (msg: string): void => emit('ERROR', msg),
  fatal: (msg: string): void => emit('FATAL', msg),
  debug: (msg: string): void => {
    if (debugEnabled) emit('DEBUG', msg);
  },
};
