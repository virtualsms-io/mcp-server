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
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';

import { VirtualSMSClient } from './client.js';
import { PROMPT_DEFINITIONS, getPromptMessages } from './prompts.js';
import { RESOURCE_DEFINITIONS, getResourceContent } from './resources.js';
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
  GetOrderInput,
  OrderHistoryInput,
  GetStatsInput,
  GetTransactionsInput,
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
  handleGetOrder,
  handleCancelAllOrders,
  handleOrderHistory,
  handleGetStats,
  handleGetProfile,
  handleGetTransactions,
  // v1.3.0
  BuyBatchInput,
  handleBuyBatch,
  WaitForSmsBatchInput,
  handleWaitForSmsBatch,
  FindBestPickInput,
  handleFindBestPick,
  X402InfoInput,
  handleX402Info,
  PayAndBuyInput,
  handlePayAndBuy,
  SubscribeWebhookInput,
  handleSubscribeWebhook,
  ManageWebhooksInput,
  handleManageWebhooks,
} from './tools.js';

// ─── Configuration ────────────────────────────────────────────────────────────

const API_KEY = process.env.VIRTUALSMS_API_KEY;
const BASE_URL = (process.env.VIRTUALSMS_BASE_URL || 'https://virtualsms.io').replace(/\/$/, '');

const client = new VirtualSMSClient(BASE_URL, API_KEY);

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new Server(
  {
    name: 'virtualsms-mcp',
    version: '1.2.3',
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
      resources: {},
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
      case 'virtualsms_list_services':
        return await handleListServices(client);

      case 'virtualsms_list_countries':
        return await handleListCountries(client);

      case 'virtualsms_get_price': {
        const parsed = CheckPriceInput.parse(args);
        return await handleCheckPrice(client, parsed);
      }

      case 'virtualsms_get_balance':
        return await handleGetBalance(client);

      case 'virtualsms_create_order': {
        const parsed = BuyNumberInput.parse(args);
        return await handleBuyNumber(client, parsed);
      }

      case 'virtualsms_get_sms': {
        const parsed = CheckSmsInput.parse(args);
        return await handleCheckSms(client, parsed);
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
        const parsed = WaitForCodeInput.parse(args);
        return await handleWaitForCode(client, parsed);
      }

      case 'virtualsms_find_cheapest': {
        const parsed = FindCheapestInput.parse(args);
        return await handleFindCheapest(client, parsed);
      }

      case 'virtualsms_search_services': {
        const parsed = SearchServiceInput.parse(args);
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

      // ─── v1.3.0 tools ─────────────────────────────────────────────────────
      case 'virtualsms_buy_batch': {
        const parsed = BuyBatchInput.parse(args);
        return await handleBuyBatch(client, parsed);
      }
      case 'virtualsms_wait_for_sms_batch': {
        const parsed = WaitForSmsBatchInput.parse(args);
        return await handleWaitForSmsBatch(client, parsed);
      }
      case 'virtualsms_find_best_pick': {
        const parsed = FindBestPickInput.parse(args);
        return await handleFindBestPick(client, parsed);
      }
      case 'virtualsms_x402_info': {
        const parsed = X402InfoInput.parse(args ?? {});
        return await handleX402Info(client, parsed);
      }
      case 'virtualsms_pay_and_buy': {
        const parsed = PayAndBuyInput.parse(args);
        return await handlePayAndBuy(client, parsed);
      }
      case 'virtualsms_subscribe_webhook': {
        const parsed = SubscribeWebhookInput.parse(args);
        return await handleSubscribeWebhook(client, parsed);
      }
      case 'virtualsms_manage_webhooks': {
        const parsed = ManageWebhooksInput.parse(args);
        return await handleManageWebhooks(client, parsed);
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

// ─── Prompts ─────────────────────────────────────────────────────────────────

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

// ─── Resources ────────────────────────────────────────────────────────────────

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

// ─── Smithery Sandbox (for registry scanning) ────────────────────────────────

export function createSandboxServer() {
  const sandboxServer = new Server(
    {
      name: 'virtualsms-mcp',
      version: '1.2.3',
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
        resources: {},
      },
    }
  );

  sandboxServer.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOL_DEFINITIONS };
  });

  sandboxServer.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts: PROMPT_DEFINITIONS };
  });

  sandboxServer.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: RESOURCE_DEFINITIONS };
  });

  return sandboxServer;
}

// ─── Start Server ─────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

// Smithery config schema — exported so Smithery can detect optional config fields
import { z } from 'zod';
export const configSchema = z.object({
  virtualsmsApiKey: z.string()
    .describe("Your VirtualSMS API key. Get one at https://virtualsms.io/dashboard"),
  defaultTimeoutSeconds: z.number()
    .min(30).max(600).default(120)
    .describe("Default timeout in seconds for wait_for_sms_code tool"),
  pollingIntervalSeconds: z.number()
    .min(3).max(15).default(5)
    .describe("Polling interval in seconds when WebSocket delivery is unavailable"),
  environment: z.enum(["production", "sandbox"])
    .default("production")
    .describe("API environment — use sandbox for testing without real charges"),
  preferredCurrency: z.enum(["USD", "EUR", "GBP"])
    .default("USD")
    .describe("Preferred currency for displaying balances and prices"),
});
