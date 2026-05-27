import { describe, expect, it } from 'vitest';

/**
 * Live integration smoke. Only runs when SPEAKUP_MCP_INTEGRATION_TOKEN is set
 * (CI exports it from a secret; locally you set it yourself). Skipped otherwise.
 *
 * Target defaults to api-staging.speakup.ltd; override via
 * SPEAKUP_MCP_INTEGRATION_URL to point at a local dev backend.
 */
const integrationToken = process.env.SPEAKUP_MCP_INTEGRATION_TOKEN;
const integrationUrl =
  process.env.SPEAKUP_MCP_INTEGRATION_URL ?? 'https://api-staging.speakup.ltd/v2/mcp/transport/';

const enabled = Boolean(integrationToken);

describe.skipIf(!enabled)('integration: live backend', () => {
  it('initialize round-trips through the bridge in under 5s', async () => {
    const { StreamableHTTPClientTransport } =
      await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
    const transport = new StreamableHTTPClientTransport(new URL(integrationUrl), {
      requestInit: {
        headers: { Authorization: `Bearer ${integrationToken}` },
      },
    });

    const initResponse = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('initialize timeout >5s')), 5_000);
      transport.onmessage = (msg) => {
        clearTimeout(timer);
        resolve(msg);
      };
      transport.onerror = (err) => {
        clearTimeout(timer);
        reject(err);
      };
      transport
        .start()
        .then(() =>
          transport.send({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2025-06-18',
              capabilities: {},
              clientInfo: { name: '@speakup/mcp-cli-test', version: '0.1.0' },
            },
          }),
        )
        .catch(reject);
    });

    expect(initResponse).toMatchObject({ jsonrpc: '2.0', id: 1 });
    await transport.close();
  }, 10_000);
});
