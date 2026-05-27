import { describe, expect, it } from 'vitest';
import { maskToken, shortMask } from '../src/log.js';

const TOKEN = 'sk_speakup_' + 'a'.repeat(39) + 'wxyz';

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
});

describe('shortMask', () => {
  it('returns prefix + last 4 chars for a valid token', () => {
    expect(shortMask(TOKEN)).toBe('sk_speakup_***wxyz');
  });

  it('returns safe placeholder for non-token input', () => {
    expect(shortMask('garbage')).toBe('sk_speakup_********');
  });
});
