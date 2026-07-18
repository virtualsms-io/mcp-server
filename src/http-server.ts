#!/usr/bin/env node

/**
 * VirtualSMS MCP HTTP Server
 * Streamable HTTP transport for Smithery integration
 * https://virtualsms.io
 */

import http from 'node:http';
import { realpathSync } from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';

import { VirtualSMSClient } from './client.js';
import { MockVirtualSMSClient, isSandboxEnabled } from './sandbox/mock-http.js';
import {
  TOOL_DEFINITIONS,
  getToolDefinitions,
  GetPriceInput,
  CreateOrderInput,
  GetSmsInput,
  CancelOrderInput,
  SwapNumberInput,
  WaitForSmsInput,
  FindCheapestInput,
  SearchServicesInput,
  ActiveOrdersInput,
  GetOrderInput,
  OrderHistoryInput,
  GetStatsInput,
  GetTransactionsInput,
  BuyProxyInput,
  RotateProxyInput,
  GetProxyUsageInput,
  GetProxyUsageHistoryInput,
  SetProxyTargetingInput,
  TestProxyInput,
  ListProxyLocationsInput,
  GenerateProxyEndpointInput,
  StartManualRegistrationSessionInput,
  StopSessionInput,
  NavigateSessionInput,
  SessionViewerInput,
  RentalsAvailableInput,
  RentalsServicesInput,
  RentalsPriceInput,
  CreateRentalInput,
  ListRentalsInput,
  GetRentalInput,
  ExtendRentalInput,
  CancelRentalInput,
  ReleaseRentalInput,
  RetryOrderInput,
  CheckNumberInput,
  handleListProxyCatalog,
  handleListProxies,
  handleBuyProxy,
  handleRotateProxy,
  handleGetProxyUsage,
  handleGetProxyUsageHistory,
  handleSetProxyTargeting,
  handleTestProxy,
  handleListProxyLocations,
  handleGenerateProxyEndpoint,
  handleStartManualRegistrationSession,
  handleStopSession,
  handleNavigateSession,
  handleSessionViewer,
  handleListServices,
  handleListCountries,
  handleCheckPrice,
  handleGetBalance,
  handleCreateOrder,
  handleGetSms,
  handleCancelOrder,
  handleSwapNumber,
  handleWaitForSms,
  handleFindCheapest,
  handleSearchService,
  handleActiveOrders,
  handleGetOrder,
  handleCancelAllOrders,
  handleOrderHistory,
  handleGetStats,
  handleGetProfile,
  handleGetTransactions,
  handleRentalsPricing,
  handleRentalsAvailable,
  handleRentalsServices,
  handleRentalsPrice,
  handleCreateRental,
  handleListRentals,
  handleGetRental,
  handleExtendRental,
  handleCancelRental,
  handleReleaseRental,
  handleRetryOrder,
  handleCheckNumber,
} from './tools.js';

import { PROMPT_DEFINITIONS, getPromptMessages } from './prompts.js';
import { RESOURCE_DEFINITIONS, getResourceContent } from './resources.js';
import { SERVER_INSTRUCTIONS } from './instructions.js';
import { mapToolCallError } from './error-utils.js';
import { VERSION } from './version.js';

const PORT = parseInt(process.env.MCP_HTTP_PORT || '3456', 10);
const DEFAULT_BASE_URL = (process.env.VIRTUALSMS_BASE_URL || 'https://virtualsms.io').replace(/\/$/, '');
const DEFAULT_COUNTRY = process.env.VIRTUALSMS_DEFAULT_COUNTRY || 'US';
const DEFAULT_TIMEOUT = parseInt(process.env.VIRTUALSMS_TIMEOUT || '30', 10);

// Session-drive tools (stop/navigate/session_viewer) are gated behind this
// flag, default OFF. Truthy = "1" / "true" / "yes" (case-insensitive).
const ENABLE_SESSIONS = /^(1|true|yes)$/i.test(process.env.VIRTUALSMS_ENABLE_SESSIONS ?? '');

// release_rental is gated behind this flag, default OFF, pending an unmade
// refund-pricing decision (10% fee + store-credit payout are undocumented and
// unsettled). Same semantics as ENABLE_SESSIONS. See VSMS-486.
const ENABLE_RELEASE = /^(1|true|yes)$/i.test(process.env.VIRTUALSMS_ENABLE_RELEASE ?? '');

// Sandbox mode (VIRTUALSMS_SANDBOX=1): zero-key, in-memory mock. Same flag
// semantics as index.ts (stdio transport). When active, the HTTP transport's
// H-005 "reject unauthenticated requests" gate is bypassed (see below) since
// there's no real API key to protect and no real backend call to make.
const SANDBOX_MODE = isSandboxEnabled(process.env);

// ─── Rate limiting (Tier-A hardening) ────────────────────────────────────────
// Simple in-memory token bucket, keyed per-API-key AND per-IP. A request
// must have a token available in BOTH buckets to proceed. In-memory is fine
// for this server's shape: single process, stateless per-request MCP
// server/transport, no external cache dependency worth adding just for this.
// Buckets reset on restart: this is abuse-throttling, not a hard security
// boundary (that's the API-key check below).
interface TokenBucket {
  tokens: number;
  lastRefillMs: number;
}

export const RATE_LIMIT_CAPACITY = parseInt(process.env.VIRTUALSMS_RATE_LIMIT_CAPACITY || '30', 10);
export const RATE_LIMIT_REFILL_PER_SEC = parseFloat(process.env.VIRTUALSMS_RATE_LIMIT_REFILL_PER_SEC || '1');

const rateLimitBuckets = new Map<string, TokenBucket>();

export function takeToken(
  key: string,
  capacity: number = RATE_LIMIT_CAPACITY,
  refillPerSec: number = RATE_LIMIT_REFILL_PER_SEC,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  let bucket = rateLimitBuckets.get(key);
  if (!bucket) {
    bucket = { tokens: capacity, lastRefillMs: now };
    rateLimitBuckets.set(key, bucket);
  }
  const elapsedSec = Math.max(0, (now - bucket.lastRefillMs) / 1000);
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSec);
  bucket.lastRefillMs = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const deficitTokens = 1 - bucket.tokens;
  const retryAfterSeconds = Math.max(1, Math.ceil(deficitTokens / refillPerSec));
  return { allowed: false, retryAfterSeconds };
}

// Test-only escape hatch: lets the rate-limit test suite start each case
// from a clean slate without needing to reach into module internals.
export function __resetRateLimitForTests(): void {
  rateLimitBuckets.clear();
}

// Forget idle buckets periodically so this Map can't grow unbounded under a
// slow-drip distributed scan (one bucket per distinct API key / IP ever
// seen). .unref() so this timer never keeps the process (or a test runner)
// alive on its own.
const RATE_LIMIT_BUCKET_TTL_MS = 10 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_BUCKET_TTL_MS;
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.lastRefillMs < cutoff) rateLimitBuckets.delete(key);
  }
}, RATE_LIMIT_BUCKET_TTL_MS).unref();

function clientIp(req: http.IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) return xff.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

interface ServerConfig {
  apiKey: string | undefined;
  baseUrl: string;
  defaultCountry: string;
  timeout: number;
}

export function createMCPServer(config: ServerConfig) {
  const client: VirtualSMSClient | MockVirtualSMSClient = SANDBOX_MODE
    ? new MockVirtualSMSClient(config.baseUrl)
    : new VirtualSMSClient(config.baseUrl, config.apiKey, config.timeout);

  const server = new Server(
    { name: 'virtualsms-mcp', version: VERSION },
    { capabilities: { tools: {}, prompts: {}, resources: {} }, instructions: SERVER_INSTRUCTIONS }
  );

  // ─── Tools ────────────────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: getToolDefinitions(ENABLE_SESSIONS, ENABLE_RELEASE) };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'virtualsms_list_proxy_catalog':
          return await handleListProxyCatalog(client);
        case 'virtualsms_list_proxies':
          return await handleListProxies(client);
        case 'virtualsms_buy_proxy': {
          const parsed = BuyProxyInput.parse(args);
          return await handleBuyProxy(client, parsed);
        }
        case 'virtualsms_rotate_proxy': {
          const parsed = RotateProxyInput.parse(args);
          return await handleRotateProxy(client, parsed);
        }
        case 'virtualsms_get_proxy_usage': {
          const parsed = GetProxyUsageInput.parse(args);
          return await handleGetProxyUsage(client, parsed);
        }
        case 'virtualsms_get_proxy_usage_history': {
          const parsed = GetProxyUsageHistoryInput.parse(args);
          return await handleGetProxyUsageHistory(client, parsed);
        }
        case 'virtualsms_set_proxy_targeting': {
          const parsed = SetProxyTargetingInput.parse(args);
          return await handleSetProxyTargeting(client, parsed);
        }
        case 'virtualsms_test_proxy': {
          const parsed = TestProxyInput.parse(args);
          return await handleTestProxy(client, parsed);
        }
        case 'virtualsms_list_proxy_locations': {
          const parsed = ListProxyLocationsInput.parse(args);
          return await handleListProxyLocations(client, parsed);
        }
        case 'virtualsms_generate_proxy_endpoint': {
          const parsed = GenerateProxyEndpointInput.parse(args);
          return await handleGenerateProxyEndpoint(client, parsed);
        }
        case 'virtualsms_start_manual_registration_session': {
          const parsed = StartManualRegistrationSessionInput.parse(args);
          return await handleStartManualRegistrationSession(client, parsed);
        }
        case 'virtualsms_stop_session': {
          if (!ENABLE_SESSIONS) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
          const parsed = StopSessionInput.parse(args);
          return await handleStopSession(client, parsed);
        }
        case 'virtualsms_navigate_session': {
          if (!ENABLE_SESSIONS) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
          const parsed = NavigateSessionInput.parse(args);
          return await handleNavigateSession(client, parsed);
        }
        case 'virtualsms_session_viewer': {
          if (!ENABLE_SESSIONS) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
          const parsed = SessionViewerInput.parse(args);
          return await handleSessionViewer(client, parsed);
        }
        case 'virtualsms_list_services':
          return await handleListServices(client);
        case 'virtualsms_list_countries':
          return await handleListCountries(client);
        case 'virtualsms_get_price': {
          const parsed = GetPriceInput.parse(args);
          return await handleCheckPrice(client, parsed);
        }
        case 'virtualsms_get_balance':
          return await handleGetBalance(client);
        case 'virtualsms_create_order': {
          const parsed = CreateOrderInput.parse(args);
          return await handleCreateOrder(client, parsed);
        }
        case 'virtualsms_get_sms': {
          const parsed = GetSmsInput.parse(args);
          return await handleGetSms(client, parsed);
        }
        case 'virtualsms_cancel_order': {
          const parsed = CancelOrderInput.parse(args);
          return await handleCancelOrder(client, parsed);
        }
        case 'virtualsms_swap_number': {
          const parsed = SwapNumberInput.parse(args);
          return await handleSwapNumber(client, parsed);
        }
        case 'virtualsms_wait_for_sms': {
          const parsed = WaitForSmsInput.parse(args);
          return await handleWaitForSms(client, parsed);
        }
        case 'virtualsms_find_cheapest': {
          const parsed = FindCheapestInput.parse(args);
          return await handleFindCheapest(client, parsed);
        }
        case 'virtualsms_search_services': {
          const parsed = SearchServicesInput.parse(args);
          return await handleSearchService(client, parsed);
        }
        case 'virtualsms_list_orders': {
          const parsed = ActiveOrdersInput.parse(args);
          return await handleActiveOrders(client, parsed);
        }
        case 'virtualsms_get_order': {
          const parsed = GetOrderInput.parse(args);
          return await handleGetOrder(client, parsed);
        }
        case 'virtualsms_cancel_all_orders':
          return await handleCancelAllOrders(client);
        case 'virtualsms_order_history': {
          const parsed = OrderHistoryInput.parse(args);
          return await handleOrderHistory(client, parsed);
        }
        case 'virtualsms_get_stats': {
          const parsed = GetStatsInput.parse(args);
          return await handleGetStats(client, parsed);
        }
        case 'virtualsms_get_profile':
          return await handleGetProfile(client);
        case 'virtualsms_get_transactions': {
          const parsed = GetTransactionsInput.parse(args);
          return await handleGetTransactions(client, parsed);
        }
        case 'virtualsms_rentals_pricing':
          return await handleRentalsPricing(client);
        case 'virtualsms_rentals_available': {
          const parsed = RentalsAvailableInput.parse(args);
          return await handleRentalsAvailable(client, parsed);
        }
        case 'virtualsms_rentals_services': {
          const parsed = RentalsServicesInput.parse(args);
          return await handleRentalsServices(client, parsed);
        }
        case 'virtualsms_rentals_price': {
          const parsed = RentalsPriceInput.parse(args);
          return await handleRentalsPrice(client, parsed);
        }
        case 'virtualsms_create_rental': {
          const parsed = CreateRentalInput.parse(args);
          return await handleCreateRental(client, parsed);
        }
        case 'virtualsms_list_rentals': {
          const parsed = ListRentalsInput.parse(args);
          return await handleListRentals(client, parsed);
        }
        case 'virtualsms_get_rental': {
          const parsed = GetRentalInput.parse(args);
          return await handleGetRental(client, parsed);
        }
        case 'virtualsms_extend_rental': {
          const parsed = ExtendRentalInput.parse(args);
          return await handleExtendRental(client, parsed);
        }
        case 'virtualsms_cancel_rental': {
          const parsed = CancelRentalInput.parse(args);
          return await handleCancelRental(client, parsed);
        }
        case 'virtualsms_release_rental': {
          if (!ENABLE_RELEASE) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
          const parsed = ReleaseRentalInput.parse(args);
          return await handleReleaseRental(client, parsed);
        }
        case 'virtualsms_retry_order': {
          const parsed = RetryOrderInput.parse(args);
          return await handleRetryOrder(client, parsed);
        }
        case 'virtualsms_check_number': {
          const parsed = CheckNumberInput.parse(args);
          return await handleCheckNumber(client, parsed);
        }
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (err) {
      throw mapToolCallError(err);
    }
  });

  // ─── Prompts ──────────────────────────────────────────────────────────────

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts: PROMPT_DEFINITIONS };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const prompt = PROMPT_DEFINITIONS.find((p) => p.name === name);
    if (!prompt) {
      throw new McpError(ErrorCode.InvalidRequest, `Unknown prompt: ${name}`);
    }
    const messages = getPromptMessages(name, (args as Record<string, string>) || {});
    return { description: prompt.description, messages };
  });

  // ─── Resources ────────────────────────────────────────────────────────────

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: RESOURCE_DEFINITIONS };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const resource = RESOURCE_DEFINITIONS.find((r) => r.uri === uri);
    if (!resource) {
      throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
    }
    const content = getResourceContent(uri);
    return {
      contents: [
        {
          uri,
          mimeType: resource.mimeType,
          text: content,
        },
      ],
    };
  });

  return server;
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

export const httpServer = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (err) {
    // Tier-A hardening: an uncaught throw anywhere in handleRequest (JSON
    // parsing, MCP server construction, transport errors) used to become an
    // unhandled rejection that could crash the process or hang the client.
    // Log it and always return a well-formed JSON-RPC error instead.
    const message = err instanceof Error ? (err.stack || err.message) : String(err);
    process.stderr.write(`[http-server] request handler error: ${message}\n`);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      }));
    } else if (!res.writableEnded) {
      res.end();
    }
  }
});

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  // Health check
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: 'virtualsms-mcp' }));
    return;
  }

  // Serve server card for Smithery config discovery
  if (req.method === 'GET' && url.pathname === '/.well-known/mcp/server-card.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      serverInfo: {
        name: 'VirtualSMS',
        version: VERSION
      },
      configSchema: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            title: 'VirtualSMS API Key',
            description: 'Your VirtualSMS API key from virtualsms.io/dashboard',
            'x-from': { header: 'x-api-key' },
            'x-to': { header: 'x-api-key' }
          },
          defaultCountry: {
            type: 'string',
            title: 'Default Country',
            description: 'Default country code for number purchases (e.g. US, RU, IN)',
            default: 'US'
          },
          timeout: {
            type: 'number',
            title: 'Request Timeout',
            description: 'Request timeout in seconds',
            default: 30,
            minimum: 5,
            maximum: 120
          }
        }
      }
    }));
    return;
  }

  // Only handle /mcp path
  if (url.pathname !== '/mcp' && url.pathname !== '/') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  // Extract config from headers and query params (x-from mappings).
  // H-005: no env-var fallback for apiKey. Caller must provide their own key.
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
  const apiKeyQuery = url.searchParams.get('apiKey') || undefined;
  const apiKey = apiKeyHeader || apiKeyQuery;

  // Tier-A hardening: header-only auth is the supported path going forward.
  // The ?apiKey= query param still works this release (avoids breaking
  // existing integrators) but is deprecated: query strings land in proxy
  // access logs, browser history, and referrer headers. Warn, don't break.
  if (apiKeyQuery && !apiKeyHeader) {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Warning', '299 - "apiKey query parameter is deprecated; use the x-api-key header instead"');
    process.stderr.write('[http-server] DEPRECATED: apiKey query parameter used; prefer the x-api-key header (query-param auth will be removed in a future release)\n');
  }

  // H-005: reject unauthenticated requests before creating the MCP server.
  // Sandbox mode is the one exception: there's no real key to protect and
  // no real backend call to make, so it's safe to skip this gate.
  if (!apiKey && !SANDBOX_MODE) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API key required. Provide via x-api-key header or apiKey query parameter.' }));
    return;
  }

  // Tier-A hardening: rate limit BOTH by IP and by API key. A request needs
  // a token in each bucket. IP-based catches pre-auth/invalid-key abuse;
  // key-based catches one leaked/shared key hammering the backend. Applied
  // after the 401 gate's early-exit isn't needed since a missing key still
  // gets IP-limited; keyed limiting simply has nothing to check without one.
  const ip = clientIp(req);
  const ipCheck = takeToken(`ip:${ip}`);
  const keyCheck = apiKey ? takeToken(`key:${apiKey}`) : { allowed: true, retryAfterSeconds: 0 };
  if (!ipCheck.allowed || !keyCheck.allowed) {
    const retryAfterSeconds = Math.max(ipCheck.retryAfterSeconds, keyCheck.retryAfterSeconds);
    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Too many requests. Please slow down.',
      retry_after_seconds: retryAfterSeconds,
    }));
    return;
  }

  // H-005: baseUrl is always the hardcoded DEFAULT_BASE_URL. Never accept
  // caller-controlled baseUrl (prevents API key exfiltration to attacker servers).
  const baseUrl = DEFAULT_BASE_URL;
  const defaultCountry = url.searchParams.get('defaultCountry') || DEFAULT_COUNTRY;
  const timeoutParam = url.searchParams.get('timeout');
  const timeout = timeoutParam ? parseInt(timeoutParam, 10) : DEFAULT_TIMEOUT;

  // Create a per-request MCP server + transport (stateless mode)
  const mcpServer = createMCPServer({ apiKey, baseUrl, defaultCountry, timeout });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  // Connect and handle request
  await mcpServer.connect(transport);

  // Collect body for POST
  let body: unknown = undefined;
  if (req.method === 'POST') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(400);
      res.end('Invalid JSON');
      return;
    }
  }

  await transport.handleRequest(req, res, body);
}

// Only auto-listen when this file is the process entry point (`node
// dist/http-server.js`), NOT when it's imported as a module, e.g. by the
// sandbox integration test suite, which imports createMCPServer() directly
// and drives it over an in-memory transport. Without this guard, importing
// http-server.ts anywhere (a test file, a future re-export) would silently
// bind a real TCP port as a side effect.
//
// Tier-A hardening: process.argv[1] is compared against import.meta.url
// (which Node resolves through symlinks to a realpath). When launched via a
// symlinked entry point (the systemd deploy model: a version-pinned dist
// dir symlinked from a stable path), argv[1] stays the literal symlink path
// while import.meta.url is the realpath, so the strict equality never
// matched and the server silently never called .listen(). Resolving argv[1]
// through realpathSync before comparing fixes that; the try/catch falls
// back to the literal-path comparison if realpathSync fails (e.g. the path
// doesn't exist on disk for some non-standard invocation).
const argvPath = process.argv[1];
let isMainModule = false;
if (argvPath) {
  try {
    isMainModule = import.meta.url === new URL(realpathSync(argvPath), 'file:').href;
  } catch {
    isMainModule = import.meta.url === new URL(argvPath, 'file:').href;
  }
}

if (isMainModule) {
  httpServer.listen(PORT, () => {
    process.stderr.write(`VirtualSMS MCP HTTP server listening on port ${PORT}\n`);
  });
}

// Tier-A hardening: the per-request try/catch in httpServer's request
// listener covers request-scoped failures, but async work that escapes that
// scope (e.g. a rejection from a timer, or a throw between event-loop ticks)
// would otherwise be an unhandled rejection/exception. Node's default
// behavior is to crash the process, taking down every in-flight request.
// Each request already gets a fresh MCP server + stateless transport, so
// there's no shared mutable state one bad request can corrupt for the next;
// logging and staying up is the safer choice for this server's shape.
process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? (reason.stack || reason.message) : String(reason);
  process.stderr.write(`[http-server] unhandledRejection: ${message}\n`);
});

process.on('uncaughtException', (err) => {
  process.stderr.write(`[http-server] uncaughtException: ${err.stack || err.message}\n`);
});

process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  httpServer.close(() => process.exit(0));
});
