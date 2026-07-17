/**
 * Shared MCP server "instructions" string.
 *
 * Passed as the `instructions` field in the Server constructor options
 * (both the stdio server in index.ts and the hosted HTTP server in
 * http-server.ts). The MCP SDK surfaces this string in the `initialize`
 * response so connecting agents get a concise usage guide automatically,
 * on top of the raw tool schemas.
 */
export const SERVER_INSTRUCTIONS = `VirtualSMS lets you receive SMS verification codes and rent numbers/proxies on demand.

SMS verification: find the service and country, check the price, create an order, then poll or wait for the SMS code to arrive. Cancel the order if you no longer need the number.

Rentals (two tiers):
- Full Access: local SIM inventory, usable for any service, longer durations.
- Platform: sourced via our global supplier network, locked to one chosen service, short durations.
Both tiers carry the same refund terms: cancel for a full refund within 20 minutes of purchase and before the first SMS arrives. After that a rental runs to its natural expiry.
List availability and pricing before creating a rental. Extend an active rental if you need more time, or cancel it while it is still refundable.

Proxies: list the catalog, buy a proxy, and rotate it for a new IP when needed.

Account: check your balance and transaction history before spending, especially before buying numbers, rentals, or proxies.

Always check balance first and prefer the cheapest option that matches your requirements.`;
