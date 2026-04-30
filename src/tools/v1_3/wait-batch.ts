/**
 * virtualsms_wait_for_sms_batch — wait for SMS on N orders in parallel.
 *
 * STATUS: v1.3.0 STUB — signatures only, no implementation logic.
 * See docs/v1.3.0-design.md §4.2 and docs/v1.3.0-plan.md Task 4.
 */

import { z } from 'zod';
import WebSocket from 'ws';
import type { VirtualSMSClient, Order } from '../../client.js';

export const WaitForSmsBatchInput = z.object({
  order_ids: z
    .array(z.string())
    .min(1)
    .max(20)
    .describe('Array of 1-20 order IDs returned from buy_batch or create_order'),
  timeout_seconds: z
    .number()
    .int()
    .min(5)
    .max(600)
    .default(120)
    .describe('Per-order timeout in seconds (default 120)'),
  return_partial: z
    .boolean()
    .default(true)
    .describe('Return what arrived even if some timed out (default true)'),
});

export const WAIT_FOR_SMS_BATCH_TOOL_DEF = {
  name: 'virtualsms_wait_for_sms_batch',
  title: 'Wait for SMS on Batch',
  description:
    'Wait for SMS verification codes to arrive on N orders in parallel. ' +
    'Uses WebSocket for each order with polling fallback. ' +
    'Returns received[], timed_out[], and errors[] arrays. ' +
    'Pair with buy_batch for the canonical batch agentic pattern.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      order_ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 20 },
      timeout_seconds: { type: 'number', minimum: 5, maximum: 600, default: 120 },
      return_partial: { type: 'boolean', default: true },
    },
    required: ['order_ids'],
  },
  annotations: {
    title: 'Wait for SMS on Batch',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
};

function extractCode(text: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/\b(\d{4,8})\b/);
  return m ? m[1] : undefined;
}

interface PerOrderResult {
  order_id: string;
  status: 'received' | 'timed_out' | 'errored';
  code?: string;
  sms_text?: string;
  delivery_method?: 'websocket' | 'polling' | 'instant';
  error?: string;
  elapsed_ms?: number;
}

/**
 * Wait for SMS on a single order, racing WebSocket against polling, with a
 * shared deadline. Returns a structured per-order result. Never throws.
 */
async function waitForOneOrder(
  client: VirtualSMSClient,
  orderId: string,
  timeoutMs: number
): Promise<PerOrderResult> {
  const start = Date.now();
  const apiKey = client.getApiKey();
  const baseUrl = client.getBaseUrl();

  // Short-circuit on the first poll.
  let initial: Order | undefined;
  try {
    initial = await client.getOrder(orderId);
  } catch (err) {
    return { order_id: orderId, status: 'errored', error: (err as Error).message };
  }
  const messages = initial.messages ?? [];
  if (messages.length > 0 || initial.sms_code || initial.sms_text) {
    const text = messages[0]?.content || initial.sms_text || initial.sms_code || '';
    return {
      order_id: orderId,
      status: 'received',
      code: initial.sms_code || extractCode(text),
      sms_text: text,
      delivery_method: 'instant',
      elapsed_ms: Date.now() - start,
    };
  }

  const remaining = () => Math.max(0, timeoutMs - (Date.now() - start));

  // WebSocket race (only if api key present)
  let wsResolved = false;
  const wsPromise = new Promise<PerOrderResult | null>((resolve) => {
    if (!apiKey) {
      resolve(null);
      return;
    }
    const wsUrl =
      baseUrl.replace(/^http/, 'ws') +
      `/ws/orders?order_id=${encodeURIComponent(orderId)}&api_key=${encodeURIComponent(apiKey)}`;
    let ws: WebSocket | null = null;
    const timer = setTimeout(() => {
      if (!wsResolved) {
        wsResolved = true;
        ws?.close();
        resolve(null);
      }
    }, remaining());
    try {
      ws = new WebSocket(wsUrl);
      ws.on('error', () => {
        if (!wsResolved) {
          wsResolved = true;
          clearTimeout(timer);
          resolve(null);
        }
      });
      ws.on('close', () => {
        if (!wsResolved) {
          wsResolved = true;
          clearTimeout(timer);
          resolve(null);
        }
      });
      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if ((msg.type === 'sms' || msg.type === 'sms_received') && msg.code) {
            if (!wsResolved) {
              wsResolved = true;
              clearTimeout(timer);
              ws?.close();
              const text = msg.full_text || msg.message || '';
              resolve({
                order_id: orderId,
                status: 'received',
                code: String(msg.code),
                sms_text: text,
                delivery_method: 'websocket',
                elapsed_ms: Date.now() - start,
              });
            }
          }
        } catch {
          // ignore parse errors
        }
      });
    } catch {
      if (!wsResolved) {
        wsResolved = true;
        clearTimeout(timer);
        resolve(null);
      }
    }
  });

  // Polling race
  const pollPromise = (async (): Promise<PerOrderResult> => {
    const intervalMs = 5000;
    while (remaining() > 0) {
      await new Promise((r) => setTimeout(r, Math.min(intervalMs, remaining())));
      if (remaining() <= 0) break;
      try {
        const status = await client.getOrder(orderId);
        const m = status.messages ?? [];
        if (m.length > 0 || status.sms_code || status.sms_text) {
          const text = m[0]?.content || status.sms_text || status.sms_code || '';
          return {
            order_id: orderId,
            status: 'received',
            code: status.sms_code || extractCode(text),
            sms_text: text,
            delivery_method: 'polling',
            elapsed_ms: Date.now() - start,
          };
        }
        if (status.status === 'cancelled' || status.status === 'failed') {
          return {
            order_id: orderId,
            status: 'errored',
            error: `Order ${orderId} was ${status.status} before SMS arrived.`,
          };
        }
      } catch (err) {
        const message = (err as Error).message;
        // Real errors (404 etc.) → bail
        if (!message.includes('waiting') && !message.includes('pending')) {
          return { order_id: orderId, status: 'errored', error: message };
        }
      }
    }
    return { order_id: orderId, status: 'timed_out', elapsed_ms: Date.now() - start };
  })();

  const winner = await Promise.race([
    wsPromise.then((r) => r ?? null),
    pollPromise,
  ]);
  if (winner && (winner as PerOrderResult).status === 'received') {
    return winner as PerOrderResult;
  }
  // WS resolved null (failed/timed out) → fall through to polling result.
  return await pollPromise;
}

export async function handleWaitForSmsBatch(
  client: VirtualSMSClient,
  args: z.infer<typeof WaitForSmsBatchInput>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const timeoutMs = args.timeout_seconds * 1000;
  const start = Date.now();

  const settled = await Promise.allSettled(
    args.order_ids.map((id) => waitForOneOrder(client, id, timeoutMs))
  );

  const received: Array<Record<string, unknown>> = [];
  const timedOut: string[] = [];
  const errors: Array<{ order_id: string; error: string }> = [];

  settled.forEach((r, i) => {
    const id = args.order_ids[i];
    if (r.status === 'fulfilled') {
      const v = r.value;
      if (v.status === 'received') {
        received.push({
          order_id: v.order_id,
          code: v.code,
          sms_text: v.sms_text,
          delivery_method: v.delivery_method,
          elapsed_ms: v.elapsed_ms,
        });
      } else if (v.status === 'timed_out') {
        timedOut.push(v.order_id);
      } else {
        errors.push({ order_id: v.order_id, error: v.error ?? 'unknown' });
      }
    } else {
      errors.push({ order_id: id, error: (r.reason as Error)?.message ?? String(r.reason) });
    }
  });

  if (!args.return_partial && (timedOut.length > 0 || errors.length > 0)) {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              error: 'partial_batch',
              message: 'return_partial=false and not all orders delivered.',
              received,
              timed_out: timedOut,
              errors,
              elapsed_seconds: Math.round((Date.now() - start) / 1000),
            },
            null,
            2
          ),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            received,
            timed_out: timedOut,
            errors,
            elapsed_seconds: Math.round((Date.now() - start) / 1000),
            tip:
              timedOut.length > 0
                ? 'Some orders timed out — call get_sms with each timed_out id later, or cancel_order to refund.'
                : received.length === args.order_ids.length
                  ? 'All SMS delivered.'
                  : undefined,
          },
          null,
          2
        ),
      },
    ],
  };
}
