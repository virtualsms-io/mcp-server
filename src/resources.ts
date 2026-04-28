/**
 * VirtualSMS MCP Resources
 * Static reference data and documentation resources
 */

export const RESOURCE_DEFINITIONS = [
  {
    uri: 'virtualsms://docs/quickstart',
    name: 'Quickstart Guide',
    description: 'Step-by-step guide to get your first SMS verification code with VirtualSMS MCP.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'virtualsms://docs/popular-services',
    name: 'Popular Services Reference',
    description: 'Commonly used service codes for WhatsApp, Telegram, Google, and other top services.',
    mimeType: 'text/markdown',
  },
  {
    uri: 'virtualsms://docs/pricing-tips',
    name: 'Pricing Tips',
    description: 'Tips on finding the cheapest virtual numbers and maximizing your VirtualSMS budget.',
    mimeType: 'text/markdown',
  },
];

export function getResourceContent(uri: string): string {
  switch (uri) {
    case 'virtualsms://docs/quickstart':
      return `# VirtualSMS MCP — Quickstart Guide

## What is VirtualSMS?
VirtualSMS provides disposable virtual phone numbers for SMS verification. Use it to verify accounts on Telegram, WhatsApp, Google, and 2500 other services.

## Quick Start (3 steps)

### Option A: One-step (recommended)
Use \`wait_for_code\` — it buys a number AND waits for the SMS automatically:
\`\`\`
wait_for_code(service="telegram", country="RU")
\`\`\`

### Option B: Manual flow
1. **Check price**: \`check_price(service="telegram", country="RU")\`
2. **Buy number**: \`buy_number(service="telegram", country="RU")\` → returns \`order_id\` + \`phone_number\`
3. **Wait for SMS**: \`check_sms(order_id="...")\` — poll every 5-10 seconds

## Common Service Codes
| Service | Code |
|---------|------|
| Telegram | telegram |
| WhatsApp | whatsapp |
| Google | google |
| Facebook | facebook |
| Twitter/X | twitter |
| Instagram | instagram |
| Uber | uber |
| Binance | binance |

## Tips
- Use \`find_cheapest(service="telegram")\` to compare prices across countries
- Use \`search_service(query="uber")\` if you don't know the exact code
- Use \`swap_number\` if your number isn't receiving SMS
- Use \`active_orders\` to recover from interrupted sessions

## Pricing
Numbers start from $0.05. Check current prices at [virtualsms.io](https://virtualsms.io).
`;

    case 'virtualsms://docs/popular-services':
      return `# Popular Services Reference

Use these service codes with \`buy_number\`, \`wait_for_code\`, \`check_price\`, and \`find_cheapest\`.

## Messaging Apps
| Service | Code | Avg. Price |
|---------|------|------------|
| Telegram | telegram | $0.05-0.20 |
| WhatsApp | whatsapp | $0.05-0.30 |
| Signal | signal | $0.10-0.40 |
| Viber | viber | $0.05-0.20 |
| Line | line | $0.10-0.30 |

## Social Media
| Service | Code | Avg. Price |
|---------|------|------------|
| Facebook | facebook | $0.05-0.20 |
| Instagram | instagram | $0.05-0.25 |
| Twitter/X | twitter | $0.10-0.30 |
| TikTok | tiktok | $0.05-0.25 |
| Snapchat | snapchat | $0.10-0.30 |

## Google Services
| Service | Code | Avg. Price |
|---------|------|------------|
| Google/Gmail | google | $0.05-0.30 |
| YouTube | youtube | $0.05-0.20 |

## Finance & Crypto
| Service | Code | Avg. Price |
|---------|------|------------|
| Binance | binance | $0.10-0.50 |
| Coinbase | coinbase | $0.20-0.80 |
| PayPal | paypal | $0.10-0.40 |

## Ride-sharing & Delivery
| Service | Code | Avg. Price |
|---------|------|------------|
| Uber | uber | $0.05-0.20 |
| Lyft | lyft | $0.10-0.30 |

## Gaming
| Service | Code | Avg. Price |
|---------|------|------------|
| Steam | steam | $0.05-0.20 |

## Tips
- Prices vary by country and availability
- Use \`find_cheapest(service="<code>")\` to compare current prices
- Use \`search_service(query="<name>")\` to find codes for services not listed here (2500 supported)
`;

    case 'virtualsms://docs/pricing-tips':
      return `# VirtualSMS Pricing Tips

## How to Find the Cheapest Numbers

### 1. Use find_cheapest
The fastest way to compare prices:
\`\`\`
find_cheapest(service="telegram", limit=10)
\`\`\`
Returns all countries sorted by price with stock levels.

### 2. Best Value Countries (General)
These countries typically offer the lowest prices:
- **Russia (RU)** — Often cheapest for Russian/European services
- **Kazakhstan (KZ)** — Good cheap alternative
- **India (IN)** — Good for Indian and some global services
- **Indonesia (ID)** — Budget option for Asian services
- **Ukraine (UA)** — Good prices for EU-facing services

### 3. Check Stock Before Buying
A country might be cheap but have 0 stock. Always check the \`count\` field in \`find_cheapest\` results.

### 4. When to Use Swap
If you buy a number and it doesn't receive SMS after 2-3 minutes:
- Use \`swap_number(order_id="...")\` to get a fresh number at NO extra charge
- You get one free swap per order

### 5. Timeout Strategy
- Default timeout is 120 seconds
- For slow services (Google, Facebook), use \`timeout_seconds=300\`
- If timed out, use \`check_sms\` with the \`order_id\` to keep checking

## Typical Price Ranges
| Budget | Countries | Use Case |
|--------|-----------|----------|
| $0.05-0.10 | RU, KZ, IN | Telegram, WhatsApp basics |
| $0.10-0.30 | Most countries | Google, Facebook |
| $0.30-0.80 | US, GB, DE | Premium/US-only services |

## Account Management
- Check balance with \`get_balance\` before bulk operations
- Cancelled orders are refunded if no SMS was received
- Minimum top-up: $1
`;

    default:
      return `Resource not found: ${uri}`;
  }
}
