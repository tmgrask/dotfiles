# Cross-platform dotfiles

This repository configures three supported machine roles from one installer:

| Platform | Automatically selected profile | Intended role |
|---|---|---|
| macOS | `macos` | App-development agents |
| Ubuntu/Debian | `ubuntu-server` | Persistent server-side agents |
| Arch Linux/Omarchy | `arch-desktop` | Primary Ghostty and Herdr input machine |

## Fresh-machine setup

```bash
git clone https://github.com/tmgrask/dotfiles.git ~/checkout/tmgrask/dotfiles
cd ~/checkout/tmgrask/dotfiles
./install
```

The installer detects the platform, installs native packages, provisions Node.js 22 through `mise`, installs Herdr, and links the shared configuration. Existing non-symlink configuration files are moved to timestamped `.bak` files.

Override detection when testing a profile:

```bash
DOTFILES_PROFILE=arch-desktop ./install
DOTFILES_PROFILE=ubuntu-server ./install
DOTFILES_PROFILE=macos ./install
```

Skip operating-system package installation while testing links and application setup:

```bash
DOTFILES_SKIP_PACKAGES=1 ./install
```

## Herdr across machines

Run Herdr on the machine where each workload lives. Tailscale connectivity and SSH authentication are prerequisites because they require an interactive account login and machine-specific host aliases. From the Arch/Omarchy input laptop, attach over a Tailscale-backed SSH alias:

```bash
herdr --remote m5studio
herdr --remote ubuntu
```

Use two Ghostty splits to display both remote Herdr sessions simultaneously. Remote hosts keep their panes and agents alive after the input laptop disconnects.

## Agent harness

OpenCode skills, agents, and configuration live in the Psiphon `ai-commons`
repository (`personal/tasker/` on the `tasker/workstation` branch), not here.
The installer no longer links anything into `~/.agents/skills`. The skills
left in `agents/skills/` aren't installed.

## Private configuration

Keep credentials outside this repository:

- Shell secrets: `~/.zshrc_private/`
- ClickHouse MCP authorization: macOS Keychain, `pass`, or `CLICKHOUSE_MCP_TOKEN`

Never commit OAuth credentials, Teleport profiles, or environment files.
