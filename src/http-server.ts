#!/usr/bin/env node

/**
 * VirtualSMS MCP HTTP Server
 * Streamable HTTP transport for Smithery integration
 * https://virtualsms.io
 */

import http from 'node:http';
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
import {
  TOOL_DEFINITIONS,
  CheckPriceInput,
  BuyNumberInput,
  CheckSmsInput,
  CancelOrderInput,
  SwapNumberInput,
  WaitForCodeInput,
  FindCheapestInput,
  SearchServiceInput,
  ActiveOrdersInput,
  handleListServices,
  handleListCountries,
  handleCheckPrice,
  handleGetBalance,
  handleBuyNumber,
  handleCheckSms,
  handleCancelOrder,
  handleSwapNumber,
  handleWaitForCode,
  handleFindCheapest,
  handleSearchService,
  handleActiveOrders,
} from './tools.js';

import { PROMPT_DEFINITIONS, getPromptMessages } from './prompts.js';
import { RESOURCE_DEFINITIONS, getResourceContent } from './resources.js';

const PORT = parseInt(process.env.MCP_HTTP_PORT || '3456', 10);
const DEFAULT_BASE_URL = (process.env.VIRTUALSMS_BASE_URL || 'https://virtualsms.io').replace(/\/$/, '');
const DEFAULT_COUNTRY = process.env.VIRTUALSMS_DEFAULT_COUNTRY || 'US';
const DEFAULT_TIMEOUT = parseInt(process.env.VIRTUALSMS_TIMEOUT || '30', 10);

interface ServerConfig {
  apiKey: string | undefined;
  baseUrl: string;
  defaultCountry: string;
  timeout: number;
}

function createMCPServer(config: ServerConfig) {
  const client = new VirtualSMSClient(config.baseUrl, config.apiKey, config.timeout);

  const server = new Server(
    { name: 'virtualsms-mcp', version: '1.0.0' },
    { capabilities: { tools: {}, prompts: {}, resources: {} } }
  );

  // ─── Tools ────────────────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOL_DEFINITIONS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'list_services':
          return await handleListServices(client);
        case 'list_countries':
          return await handleListCountries(client);
        case 'get_price': {
          const parsed = CheckPriceInput.parse(args);
          return await handleCheckPrice(client, parsed);
        }
        case 'get_balance':
          return await handleGetBalance(client);
        case 'create_number_order': {
          const parsed = BuyNumberInput.parse(args);
          return await handleBuyNumber(client, parsed);
        }
        case 'get_sms_code': {
          const parsed = CheckSmsInput.parse(args);
          return await handleCheckSms(client, parsed);
        }
        case 'cancel_order': {
          const parsed = CancelOrderInput.parse(args);
          return await handleCancelOrder(client, parsed);
        }
        case 'swap_phone_number': {
          const parsed = SwapNumberInput.parse(args);
          return await handleSwapNumber(client, parsed);
        }
        case 'wait_for_sms_code': {
          const parsed = WaitForCodeInput.parse(args);
          return await handleWaitForCode(client, parsed);
        }
        case 'find_cheapest_countries': {
          const parsed = FindCheapestInput.parse(args);
          return await handleFindCheapest(client, parsed);
        }
        case 'search_services': {
          const parsed = SearchServiceInput.parse(args);
          return await handleSearchService(client, parsed);
        }
        case 'list_active_orders': {
          const parsed = ActiveOrdersInput.parse(args);
          return await handleActiveOrders(client, parsed);
        }
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (err) {
      if (err instanceof McpError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('ZodError') || (err as { name?: string }).name === 'ZodError') {
        throw new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${message}`);
      }
      if (message.includes('API key') || message.includes('VIRTUALSMS_API_KEY')) {
        throw new McpError(ErrorCode.InvalidRequest, message);
      }
      throw new McpError(ErrorCode.InternalError, message);
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

const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  // Health check
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: 'virtualsms-mcp' }));
    return;
  }

  // Only handle /mcp path
  if (url.pathname !== '/mcp' && url.pathname !== '/') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  // Extract config from headers and query params (x-from mappings)
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
  const apiKeyQuery = url.searchParams.get('apiKey') || undefined;
  const apiKey = apiKeyHeader || apiKeyQuery || process.env.VIRTUALSMS_API_KEY;

  // Optional config from query params (with env var fallbacks)
  const baseUrl = (url.searchParams.get('baseUrl') || DEFAULT_BASE_URL).replace(/\/$/, '');
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
});

httpServer.listen(PORT, () => {
  process.stderr.write(`VirtualSMS MCP HTTP server listening on port ${PORT}\n`);
});

process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  httpServer.close(() => process.exit(0));
});
