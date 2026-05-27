import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_URL, loadConfig } from '../src/config.js';

// Matches backend format: sk_speakup_ + 32-char base64url body (= secrets.token_urlsafe(24)).
const VALID_TOKEN = 'sk_speakup_' + 'a'.repeat(32);
const VALID_TOKEN_WITH_URLSAFE = 'sk_speakup_' + 'a'.repeat(28) + 'a-b_';

describe('loadConfig', () => {
  it('returns config with default URL when only token set', () => {
    const cfg = loadConfig({ SPEAKUP_MCP_TOKEN: VALID_TOKEN } as NodeJS.ProcessEnv);
    expect(cfg.token).toBe(VALID_TOKEN);
    expect(cfg.url.toString()).toBe(DEFAULT_URL);
    expect(cfg.serverName).toBe('speakup');
    expect(cfg.debug).toBe(false);
  });

  it('respects SPEAKUP_MCP_URL override', () => {
    const cfg = loadConfig({
      SPEAKUP_MCP_TOKEN: VALID_TOKEN,
      SPEAKUP_MCP_URL: 'https://api-staging.speakup.ltd/v2/mcp/transport/',
    } as NodeJS.ProcessEnv);
    expect(cfg.url.hostname).toBe('api-staging.speakup.ltd');
  });

  it('trims whitespace on token + URL', () => {
    const cfg = loadConfig({
      SPEAKUP_MCP_TOKEN: `  ${VALID_TOKEN}  `,
      SPEAKUP_MCP_URL: '  https://example.com/  ',
    } as NodeJS.ProcessEnv);
    expect(cfg.token).toBe(VALID_TOKEN);
    expect(cfg.url.hostname).toBe('example.com');
  });

  it('enables debug when SPEAKUP_MCP_DEBUG=1', () => {
    const cfg = loadConfig({
      SPEAKUP_MCP_TOKEN: VALID_TOKEN,
      SPEAKUP_MCP_DEBUG: '1',
    } as NodeJS.ProcessEnv);
    expect(cfg.debug).toBe(true);
  });

  it('throws when SPEAKUP_MCP_TOKEN is missing', () => {
    expect(() => loadConfig({} as NodeJS.ProcessEnv)).toThrow(ConfigError);
    expect(() => loadConfig({} as NodeJS.ProcessEnv)).toThrow(/SPEAKUP_MCP_TOKEN is required/);
  });

  it('throws when SPEAKUP_MCP_TOKEN is empty string', () => {
    expect(() => loadConfig({ SPEAKUP_MCP_TOKEN: '   ' } as NodeJS.ProcessEnv)).toThrow(
      ConfigError,
    );
  });

  it('accepts base64url chars (_ and -) in token body', () => {
    const cfg = loadConfig({
      SPEAKUP_MCP_TOKEN: VALID_TOKEN_WITH_URLSAFE,
    } as NodeJS.ProcessEnv);
    expect(cfg.token).toBe(VALID_TOKEN_WITH_URLSAFE);
  });

  it.each([
    ['wrong prefix', 'pk_speakup_' + 'a'.repeat(32)],
    ['too short', 'sk_speakup_' + 'a'.repeat(31)],
    ['too long', 'sk_speakup_' + 'a'.repeat(33)],
    ['invalid char +', 'sk_speakup_' + 'a'.repeat(31) + '+'],
    ['invalid char /', 'sk_speakup_' + 'a'.repeat(31) + '/'],
    ['invalid char !', 'sk_speakup_' + 'a'.repeat(31) + '!'],
    ['empty body', 'sk_speakup_'],
  ])('throws on malformed token (%s)', (_label, token) => {
    expect(() => loadConfig({ SPEAKUP_MCP_TOKEN: token } as NodeJS.ProcessEnv)).toThrow(
      /malformed/,
    );
  });

  it('throws on invalid URL', () => {
    expect(() =>
      loadConfig({
        SPEAKUP_MCP_TOKEN: VALID_TOKEN,
        SPEAKUP_MCP_URL: 'not a url',
      } as NodeJS.ProcessEnv),
    ).toThrow(/not a valid URL/);
  });

  it('throws on non-http(s) scheme', () => {
    expect(() =>
      loadConfig({
        SPEAKUP_MCP_TOKEN: VALID_TOKEN,
        SPEAKUP_MCP_URL: 'ftp://example.com/',
      } as NodeJS.ProcessEnv),
    ).toThrow(/must use http: or https:/);
  });

  it('refuses http:// for non-loopback', () => {
    expect(() =>
      loadConfig({
        SPEAKUP_MCP_TOKEN: VALID_TOKEN,
        SPEAKUP_MCP_URL: 'http://api.speak-up.pro/',
      } as NodeJS.ProcessEnv),
    ).toThrow(/refuses non-loopback http/);
  });

  it('allows http://localhost for dev', () => {
    const cfg = loadConfig({
      SPEAKUP_MCP_TOKEN: VALID_TOKEN,
      SPEAKUP_MCP_URL: 'http://localhost:8000/v2/mcp/transport/',
    } as NodeJS.ProcessEnv);
    expect(cfg.url.hostname).toBe('localhost');
  });

  it('allows http://127.0.0.1 for dev', () => {
    const cfg = loadConfig({
      SPEAKUP_MCP_TOKEN: VALID_TOKEN,
      SPEAKUP_MCP_URL: 'http://127.0.0.1:8000/',
    } as NodeJS.ProcessEnv);
    expect(cfg.url.hostname).toBe('127.0.0.1');
  });
});
