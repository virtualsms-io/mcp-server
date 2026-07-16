/**
 * Shared tool-call error handling — used by BOTH the stdio transport
 * (index.ts) and the HTTP transport (http-server.ts) so error mapping can
 * never silently drift between them (same motivation as the transport-parity
 * test for tool dispatch).
 */
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const MAX_ERROR_MESSAGE_LENGTH = 500;

/**
 * Strips stack-trace frames, absolute filesystem paths, and loopback/private
 * network hosts from an error string before it's returned through an MCP
 * tool response. Tool responses are read directly by the calling model/agent
 * (and often relayed to an end user) — leaking a Node stack trace or a
 * server-local file path is an information-disclosure smell, not just noise.
 *
 * Public product references (e.g. "https://virtualsms.io/dashboard") are
 * intentionally left untouched — only stack-trace shapes, filesystem paths,
 * and loopback/private-network hosts are redacted.
 */
export function sanitizeErrorMessage(raw: string | undefined | null): string {
  if (!raw) return 'An unexpected error occurred.';
  let msg = String(raw);

  // Drop stack-trace frames ("    at Foo (bar.js:1:2)" / "at async ...").
  msg = msg
    .split('\n')
    .filter((line) => !/^\s*at\s/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Redact absolute filesystem paths (Windows drive-letter and POSIX forms).
  msg = msg.replace(/[A-Za-z]:\\(?:[^\s"'\\]+\\)*[^\s"'\\]+/g, '[path]');
  msg = msg.replace(/(?:\/[\w.-]+){2,}/g, '[path]');

  // Redact loopback/private-network hosts. Public domains (virtualsms.io,
  // etc.) are untouched — this only matches localhost/RFC1918 shapes.
  msg = msg.replace(/\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0|::1)(?::\d+)?\b/gi, '[host]');
  msg = msg.replace(/\b(?:10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})\b/g, '[host]');

  if (msg.length > MAX_ERROR_MESSAGE_LENGTH) {
    msg = `${msg.slice(0, MAX_ERROR_MESSAGE_LENGTH)}… [truncated]`;
  }

  return msg || 'An unexpected error occurred.';
}

/**
 * Maps whatever a tool handler threw into a well-formed McpError, running
 * the message through sanitizeErrorMessage() first. Extracted from the
 * (previously duplicated, one copy per transport) catch-block tail in
 * index.ts and http-server.ts.
 */
export function mapToolCallError(err: unknown): McpError {
  if (err instanceof McpError) return err;

  const rawMessage = err instanceof Error ? (err.message ?? String(err)) : String(err);
  const message = sanitizeErrorMessage(rawMessage);

  if (rawMessage.includes('ZodError') || (err as { name?: string } | undefined)?.name === 'ZodError') {
    return new McpError(ErrorCode.InvalidParams, `Invalid parameters: ${message}`);
  }

  if (rawMessage.includes('API key') || rawMessage.includes('VIRTUALSMS_API_KEY')) {
    return new McpError(ErrorCode.InvalidRequest, message);
  }

  return new McpError(ErrorCode.InternalError, message);
}
