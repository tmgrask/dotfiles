# Pi agent setup

This setup is adapted from [dmmulroy/.dotfiles](https://github.com/dmmulroy/.dotfiles) and keeps the current OpenAI model choice while adopting the reusable parts of Dillon's Pi workflow.

## Included

- Packages: `pi-extmgr`, Plannotator, and the lazy-proxy `pi-mcp-adapter`
- Local extensions: Kagi-backed web search (with Exa fallback), lightweight post-compaction continuation, git safety, handoff, Herdr state reporting, secret cloaking, skill toggling, worktree management, divided user messages, `/save-md`, and evolving session reminders
- Session reminders update Pi session names and Herdr tab labels after completed turns, and Pi's footer centers the three most recent topic changes from oldest to newest; press `Ctrl+Shift+R` or run `/remind-me` for a glanceable summary
- Catppuccin Macchiato plus a Basalt Bloom variant with high-contrast divided user messages
- Shared workflow skills under `agents/skills/`
- Plannotator review/diff preferences under `plannotator/config.json`

Cloudflare/account-specific extensions, paste services, Workday automation, and personal diagram integrations were intentionally left out.

## Install and update

Run the repository's `./install`. It installs this workspace's npm dependencies and links tracked files into `~/.pi`, `~/.agents`, and `~/.plannotator` without replacing Pi's runtime credentials.

The public `agent/mcp.json` intentionally contains no account- or company-specific servers. Keep private MCP definitions, authentication helpers, and internal service instructions in a separate private agent repository. Never commit tokens or Pi runtime credentials.

After changing extensions or settings, run `/reload` in Pi. Validate local extension code with:

```bash
npm --prefix pi run check
npm --prefix pi test
```

Third-party Pi packages execute with your user permissions. Review package updates before accepting them.
