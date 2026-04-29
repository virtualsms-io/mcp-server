# Example 3 — Claude Desktop Configuration

A copy-paste guide for adding the VirtualSMS MCP server to [Claude Desktop](https://www.anthropic.com/claude). After ~60 seconds of setup, you can ask Claude things like *"What's my VirtualSMS balance?"* or *"Buy a Telegram number from Pakistan and wait for the code"*.

## Two install paths

| Path | When to use | Speed | Maintenance |
|------|-------------|-------|-------------|
| **Hosted (recommended)** | You want zero local setup. | Instant. | Patches roll out automatically on `mcp.virtualsms.io`. |
| **Local stdio (npm)** | You need air-gapped or want full control over the binary. | Requires Node.js 18+ on the host. | You upgrade with `npm i -g virtualsms-mcp`. |

## Path A — Hosted (recommended)

1. Open Claude Desktop's MCP config file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
2. Paste the contents of [`claude_desktop_config.json`](./claude_desktop_config.json) in this directory, replacing `vsms_your_api_key_here` with the API key you copied from [virtualsms.io](https://virtualsms.io).
3. Fully quit Claude Desktop (not just close the window) and reopen.
4. In a new chat, type `/` and you should see the VirtualSMS tools listed.

## Path B — Local stdio (npm)

1. Install Node.js 18 or newer.
2. Use this config block instead:

   ```json
   {
     "mcpServers": {
       "virtualsms": {
         "command": "npx",
         "args": ["virtualsms-mcp"],
         "env": {
           "VIRTUALSMS_API_KEY": "vsms_your_api_key_here"
         }
       }
     }
   }
   ```

3. Quit and reopen Claude Desktop. The first run downloads the package via `npx` (~5–10 seconds).

## Try it out

Once Claude Desktop has loaded the server, try these prompts:

> *"What's my VirtualSMS balance?"*
>
> Claude should call `virtualsms_get_balance` and reply with something like *"Your balance is $5.00."*

> *"Find the cheapest country to buy a Telegram number."*
>
> Claude calls `virtualsms_find_cheapest` and shows the top 5 cheapest options.

> *"Buy me a Telegram number from Pakistan and wait for the verification code."*
>
> Claude calls `virtualsms_wait_for_code` with `service: "telegram", country: "PK"`. The number appears in the chat, and the SMS code is delivered as soon as it arrives via WebSocket — usually within 15 seconds.

> *"Cancel all my active VirtualSMS orders."*
>
> Claude calls `virtualsms_cancel_all_orders`.

## Troubleshooting

- **Tools don't appear in the `/` menu.** Quit Claude Desktop fully (Cmd+Q on macOS, right-click tray icon → Quit on Windows) then reopen. Restarting reloads MCP servers.
- **"Authentication failed".** Double-check the `vsms_` prefix and that your API key is active in the [VirtualSMS dashboard](https://virtualsms.io/settings).
- **Hosted endpoint unreachable.** Status page: [status.virtualsms.io](https://status.virtualsms.io). Fall back to Path B (local stdio) if you suspect a transient hosted issue.
- **`npx virtualsms-mcp` hangs.** Run `npx clear-npx-cache` then retry. On rare occasions the npm package cache gets stale.

## Files in this directory

- [`claude_desktop_config.json`](./claude_desktop_config.json) — drop-in config for Path A (hosted).
