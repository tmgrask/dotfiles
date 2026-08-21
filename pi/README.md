# Pi agent setup

This setup is adapted from [dmmulroy/.dotfiles](https://github.com/dmmulroy/.dotfiles) and keeps the current OpenAI model choice while adopting the reusable parts of Dillon's Pi workflow.

## Included

- Packages: `pi-extmgr`, Plannotator, `dmmulroy/pi-web-tools`, and the lazy-proxy `pi-mcp-adapter`
- Local extensions: lightweight post-compaction continuation, git safety, handoff, Herdr state reporting, secret cloaking, skill toggling, worktree management, divided user messages, and `/save-md`
- Catppuccin Macchiato plus a Basalt Bloom variant with high-contrast divided user messages
- Shared workflow skills under `agents/skills/`
- Plannotator review/diff preferences under `plannotator/config.json`

Cloudflare/account-specific extensions, paste services, Workday automation, and personal diagram integrations were intentionally left out.

## Install and update

Run the repository's `./install`. It installs this workspace's npm dependencies and links tracked files into `~/.pi`, `~/.agents`, and `~/.plannotator` without replacing Pi's runtime credentials.

MCP servers are configured in `agent/mcp.json`. Linear authenticates through OAuth on first use. The `clickhouse-mcp-authorization` helper reads the ClickHouse token from the first available source:

1. `CLICKHOUSE_MCP_TOKEN`
2. macOS Keychain service `clickhouse-mcp-token`
3. `pass` entry `clickhouse-mcp-token`

Never commit the token. On macOS, store a rotated token with:

```bash
security add-generic-password -U -a "$USER" -s clickhouse-mcp-token -w
```

On Linux, store it with:

```bash
pass insert clickhouse-mcp-token
```

These commands prompt for the value instead of exposing it in shell history.

After changing extensions or settings, run `/reload` in Pi. Validate local extension code with:

```bash
npm --prefix pi run check
npm --prefix pi test
```

Third-party Pi packages execute with your user permissions. Review package updates before accepting them.
