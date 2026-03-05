#!/usr/bin/env node

/**
 * VirtualSMS MCP Server
 * Receive SMS verification codes with AI agents
 * https://virtualsms.io
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
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
  handleWaitForCode,
  handleFindCheapest,
  handleSearchService,
  handleActiveOrders,
} from './tools.js';

// ─── Configuration ────────────────────────────────────────────────────────────

const API_KEY = process.env.VIRTUALSMS_API_KEY;
const BASE_URL = (process.env.VIRTUALSMS_BASE_URL || 'https://virtualsms.io').replace(/\/$/, '');

const client = new VirtualSMSClient(BASE_URL, API_KEY);

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new Server(
  {
    name: 'virtualsms-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOL_DEFINITIONS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_services':
        return await handleListServices(client);

      case 'list_countries':
        return await handleListCountries(client);

      case 'check_price': {
        const parsed = CheckPriceInput.parse(args);
        return await handleCheckPrice(client, parsed);
      }

      case 'get_balance':
        return await handleGetBalance(client);

      case 'buy_number': {
        const parsed = BuyNumberInput.parse(args);
        return await handleBuyNumber(client, parsed);
      }

      case 'check_sms': {
        const parsed = CheckSmsInput.parse(args);
        return await handleCheckSms(client, parsed);
      }

      case 'cancel_order': {
        const parsed = CancelOrderInput.parse(args);
        return await handleCancelOrder(client, parsed);
      }

      case 'wait_for_code': {
        const parsed = WaitForCodeInput.parse(args);
        return await handleWaitForCode(client, parsed);
      }

      case 'find_cheapest': {
        const parsed = FindCheapestInput.parse(args);
        return await handleFindCheapest(client, parsed);
      }

      case 'search_service': {
        const parsed = SearchServiceInput.parse(args);
        return await handleSearchService(client, parsed);
      }

      case 'active_orders': {
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

// ─── Start Server ─────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
