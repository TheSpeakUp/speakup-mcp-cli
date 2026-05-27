# @speakup/mcp-cli

Static-token [Model Context Protocol](https://modelcontextprotocol.io/) transport proxy for SpeakUp.

Lets Claude Desktop, Claude Code, Cursor, and any other MCP client connect to
`api.speak-up.pro` without going through the OAuth flow that
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote) ships by default.

## Why this exists

The MCP protocol requires the client to receive a response to its `initialize`
JSON-RPC call within 60 seconds of attach. `mcp-remote`'s OAuth flow (open
browser → log in → consent → redirect back) often takes longer than that on a
cold start, causing Claude Desktop to fatal-crash before the user finishes the
login dance.

This proxy skips OAuth in the MCP transport entirely. You generate a long-lived
Personal Access Token (PAT) once via the SpeakUp web UI, paste it into your
Claude Desktop config under `env`, and the proxy sends it as a static
`Authorization: Bearer …` header on every outbound request — so `initialize`
returns immediately.

## Install

You don't need to install it. Claude Desktop will fetch it via `npx` on first
run. If you'd rather pin it locally:

```bash
npm install -g @speakup/mcp-cli
```

Requires Node ≥18.17. Claude Desktop bundles its own Node runtime, so this is
usually a no-op for desktop users.

## Get a token

1. Visit <https://app.speak-up.pro/settings/mcp>.
2. Click **Generate token**.
3. Copy the `sk_speakup_…` string. It's shown **once** — store it like any
   password.

## Claude Desktop config

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows) and add:

```json
{
  "mcpServers": {
    "speakup": {
      "command": "npx",
      "args": ["-y", "@speakup/mcp-cli@latest"],
      "env": {
        "SPEAKUP_MCP_TOKEN": "sk_speakup_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

Restart Claude Desktop. The **speakup** server should appear in the MCP picker
within ~5 seconds, with the full tool catalog listed.

### Claude Code

```bash
claude mcp add speakup -- npx -y @speakup/mcp-cli@latest \
  -e SPEAKUP_MCP_TOKEN=sk_speakup_xxx
```

### Cursor

In `~/.cursor/mcp.json` use the same shape as Claude Desktop above.

## Environment

| Variable                  | Required | Default                                      | Notes                                                 |
| ------------------------- | -------- | -------------------------------------------- | ----------------------------------------------------- |
| `SPEAKUP_MCP_TOKEN`       | yes      | —                                            | PAT from the SpeakUp web UI.                          |
| `SPEAKUP_MCP_URL`         | no       | `https://api.speak-up.pro/v2/mcp/transport/` | Override for staging or local dev.                    |
| `SPEAKUP_MCP_SERVER_NAME` | no       | `speakup`                                    | Reserved for future use; safe to ignore.              |
| `SPEAKUP_MCP_DEBUG`       | no       | unset                                        | Set to `1` to log JSON-RPC payload previews (masked). |

The token is **never** written to disk by this proxy and **never** appears in
logs unmasked. Token-like strings in error messages are redacted to
`sk_speakup_***xxxx` (last 4 chars only).

## Troubleshooting

Logs go to stderr, which Claude Desktop captures at
`~/Library/Logs/Claude/mcp-server-speakup.log`.

| Symptom                                 | Likely cause                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `SPEAKUP_MCP_TOKEN is required`         | Env var not set in `claude_desktop_config.json`. Restart Claude Desktop after editing the config. |
| `SPEAKUP_MCP_TOKEN is malformed`        | Token was truncated on paste. Regenerate via the web UI.                                          |
| Server shows up but tools list is empty | Token was revoked or expired. Regenerate via the web UI.                                          |
| `401 Unauthorized`                      | Same — backend rejected the PAT. Regenerate.                                                      |
| `ECONNREFUSED` / `ENOTFOUND`            | Network problem, or a custom `SPEAKUP_MCP_URL` is wrong.                                          |
| Logs flooded with `forward …` lines     | Set `SPEAKUP_MCP_DEBUG` only when you need it; remove the env var once done.                      |

## Local development

```bash
git clone https://github.com/TheSpeakUp/speakup-mcp-cli.git
cd speakup-mcp-cli
npm install
cp .env.example .env  # fill in your test PAT
npm run dev           # speaks MCP on stdio; useful with mcp-inspector
```

Tests:

```bash
npm test          # unit tests only
SPEAKUP_MCP_INTEGRATION_TOKEN=sk_speakup_xxx npm test  # + integration test against staging
```

Lint + build:

```bash
npm run lint
npm run build
```

## Security model

- The PAT is a bearer credential. Anyone with it can act as you against the
  SpeakUp MCP surface. Treat it like a password.
- The proxy refuses non-loopback `http://` URLs to prevent accidental
  plaintext token transmission. Use `https://` for any remote endpoint.
- Revoke tokens any time at <https://app.speak-up.pro/settings/mcp>.
- This proxy does **not** persist the token to disk. It lives in
  `process.env` only.

## Roadmap

This is a v0.x utility. Once Claude Desktop and friends ship native support
for sane OAuth UX (e.g. background refresh, response within 60s), this proxy
will be unnecessary. Until then we ship it as a stopgap.

## License

MIT — see [LICENSE](LICENSE).
