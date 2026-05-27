export interface ProxyConfig {
  url: URL;
  token: string;
  serverName: string;
  debug: boolean;
}

export const DEFAULT_URL = 'https://api.speak-up.pro/v2/mcp/transport/';

// Backend (`speak_up_backend` PR #879): plaintext = "sk_speakup_" + secrets.token_urlsafe(24)
// → 11-char fixed prefix + 32-char base64url body = 43 chars total.
const TOKEN_PATTERN = /^sk_speakup_[A-Za-z0-9_-]{32}$/;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv): ProxyConfig {
  const token = env.SPEAKUP_MCP_TOKEN?.trim();
  if (!token) {
    throw new ConfigError(
      'SPEAKUP_MCP_TOKEN is required. Generate one at https://app.speak-up.pro/settings/mcp and add it to your Claude Desktop config under env.SPEAKUP_MCP_TOKEN.',
    );
  }
  if (!TOKEN_PATTERN.test(token)) {
    throw new ConfigError(
      'SPEAKUP_MCP_TOKEN is malformed. Expected format: sk_speakup_<32 base64url chars>. Regenerate the token via the SpeakUp web UI.',
    );
  }

  const rawUrl = env.SPEAKUP_MCP_URL?.trim() || DEFAULT_URL;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ConfigError(`SPEAKUP_MCP_URL is not a valid URL: ${rawUrl}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigError(`SPEAKUP_MCP_URL must use http: or https: scheme, got ${url.protocol}`);
  }
  if (url.protocol === 'http:' && !isLoopback(url.hostname)) {
    throw new ConfigError(
      `SPEAKUP_MCP_URL refuses non-loopback http:// (got ${url.hostname}). Use https:// for remote hosts to prevent token leakage.`,
    );
  }

  const serverName = env.SPEAKUP_MCP_SERVER_NAME?.trim() || 'speakup';
  const debug = env.SPEAKUP_MCP_DEBUG === '1';

  return { url, token, serverName, debug };
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}
