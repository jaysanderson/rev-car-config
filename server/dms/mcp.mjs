// mcp.mjs — the hosted MCP transport: Streamable HTTP at POST /dms/mcp.
//
// Stateless (like maintenanceOS apps/api/src/mcp.ts): every request builds a fresh
// Server + StreamableHTTPServerTransport, so there is no session state between calls.
// The tool catalogue comes from this app's own OpenAPI document (openapi(ROUTES)) and
// tool calls are dispatched by loopback fetch to the same Express server (127.0.0.1 on
// the port the request arrived on), so auth, RBAC, scoping, rate limits and validation
// are identical to REST. Auth: the caller's bearer token (session token from
// /dms/api/auth/login or a personal access token, hdms_…) is required on the HTTP
// request and forwarded on every dispatched API call.
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, fetchApiClient } from './mcp-core.mjs';
import { ROUTES, VERSION } from './index.mjs';
import { openapi } from './openapi.mjs';
import { userFromToken } from './auth.mjs';

let spec = null;
export const getSpec = () => (spec ||= openapi(ROUTES, { version: VERSION }));
const bearerOf = (req) => /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '')?.[1]?.trim();

/** POST /dms/mcp (express.json() must have parsed the body). */
export async function mcpPost(req, res) {
  const token = bearerOf(req);
  if (!token || !userFromToken(token)) {
    res.set('WWW-Authenticate', 'Bearer realm="harbourline-dms"');
    return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'authentication required: send Authorization: Bearer <DMS token or hdms_ personal access token>' }, id: req.body?.id ?? null });
  }
  const apiClient = fetchApiClient(`http://127.0.0.1:${req.socket.localPort}/dms/api`);
  const { server } = createServer({ spec: getSpec(), apiClient, bearerToken: token, version: VERSION });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error(`[dms mcp] ${e.message}`);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'MCP transport error' }, id: null });
  }
}

/** GET /dms/mcp — friendly probe for browsers / connector checks. */
export function mcpGet(req, res) {
  res.json({ service: 'harbourline-dms-mcp', transport: 'streamable-http (stateless)', message: 'POST JSON-RPC 2.0 frames to this URL with Authorization: Bearer <token>. Details: GET /dms/api/mcp/info', info: '/dms/api/mcp/info' });
}
