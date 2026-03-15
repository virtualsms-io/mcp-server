/**
 * VirtualSMS MCP Prompts
 * Pre-built workflows for common SMS verification use cases
 */

export const PROMPT_DEFINITIONS = [
  {
    name: 'verify-whatsapp',
    description: 'Complete workflow to get a WhatsApp verification code using a virtual number. Finds the cheapest available country, buys a number, and waits for the SMS code automatically.',
    arguments: [
      {
        name: 'country',
        description: 'Preferred country code (e.g. "US", "RU", "IN"). Leave empty to auto-select cheapest.',
        required: false,
      },
    ],
  },
  {
    name: 'verify-telegram',
    description: 'Complete workflow to verify a Telegram account with a virtual number. Automatically selects cheapest available country and waits for the SMS code.',
    arguments: [
      {
        name: 'country',
        description: 'Preferred country code (e.g. "US", "RU", "KZ"). Leave empty to auto-select cheapest.',
        required: false,
      },
    ],
  },
  {
    name: 'verify-google',
    description: 'Get a Google account verification code via virtual phone number. Useful for creating or recovering Google/Gmail accounts.',
    arguments: [
      {
        name: 'country',
        description: 'Preferred country code (e.g. "US", "GB"). Leave empty to auto-select cheapest.',
        required: false,
      },
    ],
  },
  {
    name: 'find-cheapest-number',
    description: 'Find the cheapest virtual phone number for any service. Returns top countries sorted by price with stock availability.',
    arguments: [
      {
        name: 'service',
        description: 'Service name or code to find cheapest number for (e.g. "telegram", "whatsapp", "google", "uber")',
        required: true,
      },
      {
        name: 'limit',
        description: 'Number of cheapest options to show (default: 5)',
        required: false,
      },
    ],
  },
  {
    name: 'verify-any-service',
    description: 'Universal SMS verification workflow. Searches for the service by name, finds the cheapest country, buys a number, and waits for the verification code.',
    arguments: [
      {
        name: 'service',
        description: 'Service to verify (e.g. "uber", "binance", "steam", "facebook", "twitter")',
        required: true,
      },
      {
        name: 'country',
        description: 'Preferred country (optional, auto-selects cheapest if not specified)',
        required: false,
      },
    ],
  },
  {
    name: 'recover-verification',
    description: 'Recover an interrupted SMS verification session. Lists active orders and checks for pending verification codes — useful after a crash or timeout.',
    arguments: [],
  },
  {
    name: 'check-account-status',
    description: 'Check your VirtualSMS account balance and list all active orders in one shot.',
    arguments: [],
  },
];

export function getPromptMessages(name: string, args: Record<string, string> = {}) {
  switch (name) {
    case 'verify-whatsapp': {
      const country = (args as Record<string, string>)['country'];
      const countryNote = country
        ? `Use country code "${country}" if available, otherwise pick the cheapest.`
        : 'Automatically select the cheapest available country.';
      return [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Please get me a WhatsApp verification code using a virtual phone number.

Steps to follow:
1. Use find_cheapest with service="whatsapp" to see pricing. ${countryNote}
2. Use wait_for_code with service="whatsapp" and the selected country to buy a number and wait for the SMS automatically.
3. Return the phone number and verification code when received.

If the first number doesn't receive an SMS, try swap_number to get a fresh one without extra charge.`,
          },
        },
      ];
    }

    case 'verify-telegram': {
      const country = (args as Record<string, string>)['country'];
      const countryNote = country
        ? `Use country code "${country}" if available, otherwise pick the cheapest.`
        : 'Automatically select the cheapest available country.';
      return [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Please get me a Telegram verification code using a virtual phone number.

Steps to follow:
1. Use find_cheapest with service="telegram" to see pricing. ${countryNote}
2. Use wait_for_code with service="telegram" and the selected country.
3. Return the phone number and the 5-digit Telegram code when received.

Note: Telegram codes arrive quickly (usually under 30 seconds).`,
          },
        },
      ];
    }

    case 'verify-google': {
      const country = (args as Record<string, string>)['country'];
      const countryNote = country
        ? `Use country code "${country}" if available, otherwise pick cheapest.`
        : 'Automatically select the cheapest available country.';
      return [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Please get me a Google/Gmail verification code using a virtual phone number.

Steps to follow:
1. Use find_cheapest with service="google" to see pricing. ${countryNote}
2. Use wait_for_code with service="google" and the selected country.
3. Return the phone number and the 6-digit Google verification code.

Note: Google may take up to 2 minutes to send the SMS.`,
          },
        },
      ];
    }

    case 'find-cheapest-number': {
      const service = (args as Record<string, string>)['service'] || 'telegram';
      const limit = (args as Record<string, string>)['limit'] || '5';
      return [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Find the cheapest virtual phone numbers for "${service}".

Steps:
1. First use search_service with query="${service}" to confirm the exact service code.
2. Then use find_cheapest with service=<code> and limit=${limit}.
3. Show me the top options with country, price, and stock availability.`,
          },
        },
      ];
    }

    case 'verify-any-service': {
      const service = (args as Record<string, string>)['service'] || 'any service';
      const country = (args as Record<string, string>)['country'];
      const countryNote = country
        ? `Prefer country "${country}" if available.`
        : 'Choose the cheapest available country.';
      return [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Please get me an SMS verification code for "${service}" using a virtual phone number.

Steps to follow:
1. Use search_service with query="${service}" to find the exact service code.
2. Use find_cheapest to see pricing. ${countryNote}
3. Use wait_for_code to buy a number and automatically wait for the SMS.
4. Return the phone number and verification code.

If no SMS arrives, try swap_number to get a different number.`,
          },
        },
      ];
    }

    case 'recover-verification': {
      return [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `My SMS verification session was interrupted. Please help me recover.

Steps:
1. Use active_orders to list all pending orders.
2. For each pending order, use check_sms to see if an SMS has arrived.
3. If an SMS is found, show me the phone number and verification code.
4. If no SMS yet, let me know the order IDs so I can decide to wait or cancel.`,
          },
        },
      ];
    }

    case 'check-account-status': {
      return [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Please check my VirtualSMS account status.

Steps:
1. Use get_balance to show my current account balance.
2. Use active_orders to list any pending or active orders.
3. Give me a summary of my balance and any ongoing verifications.`,
          },
        },
      ];
    }

    default:
      return [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Use the VirtualSMS MCP tools to help with SMS verification.`,
          },
        },
      ];
  }
}
