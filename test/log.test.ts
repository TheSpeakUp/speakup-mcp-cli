import { describe, expect, it } from 'vitest';
import { maskToken, shortMask } from '../src/log.js';

// Matches backend format: 11-char prefix + 32-char base64url body.
const TOKEN = 'sk_speakup_' + 'a'.repeat(28) + 'wxyz';
const TOKEN_WITH_URLSAFE = 'sk_speakup_' + 'a'.repeat(27) + '-_xyz';

describe('maskToken', () => {
  it('masks a token surrounded by other text', () => {
    const out = maskToken(`Authorization: Bearer ${TOKEN} OK`);
    expect(out).toBe('Authorization: Bearer sk_speakup_***wxyz OK');
    expect(out).not.toContain(TOKEN);
  });

  it('masks multiple occurrences', () => {
    const out = maskToken(`first=${TOKEN} second=${TOKEN}`);
    const matches = out.match(/sk_speakup_\*\*\*wxyz/g) ?? [];
    expect(matches.length).toBe(2);
    expect(out).not.toContain(TOKEN);
  });

  it('leaves plain text untouched', () => {
    expect(maskToken('hello world')).toBe('hello world');
  });

  it('does not mask non-token strings that share the prefix start', () => {
    expect(maskToken('sk_other_value')).toBe('sk_other_value');
  });

  it('handles empty input', () => {
    expect(maskToken('')).toBe('');
  });

  it('masks tokens containing base64url chars (_ and -) without leaking the tail', () => {
    const out = maskToken(`Bearer ${TOKEN_WITH_URLSAFE} done`);
    expect(out).toBe('Bearer sk_speakup_***_xyz done');
    expect(out).not.toContain(TOKEN_WITH_URLSAFE);
    expect(out).not.toContain('aaaa-_');
  });
});

describe('shortMask', () => {
  it('returns prefix + last 4 chars for a valid token', () => {
    expect(shortMask(TOKEN)).toBe('sk_speakup_***wxyz');
  });

  it('returns safe placeholder for non-token input', () => {
    expect(shortMask('garbage')).toBe('sk_speakup_********');
  });
});
