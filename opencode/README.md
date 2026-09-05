# Neovim plan review for OpenCode

The `neovim-plan-review` OpenCode 2 plugin replaces plan completion with a
review buffer opened in a focused Herdr split. The OpenCode tool waits until the
review is approved or returned with comments.

## Review controls

| Mapping | Action |
| --- | --- |
| `<leader>pc` | Add a comment for the planning agent to the current line or visual selection |
| `<leader>pd` | Start an OpenCode-backed discussion about the current line or visual selection |
| `<leader>pp` | In the discussion pane, promote the latest response to a comment |
| `<leader>pa` | Approve the plan |
| `<leader>pr` | Return comments and request changes |

Discussion transcripts remain in their separate OpenCode sessions. Returned
plan comments include the related session ID only when a discussion response is
explicitly promoted.

The dotfiles installer links the plugin under
`~/.config/opencode/plugins/neovim-plan-review` and installs the
`opencode-plan-thread` bridge on `PATH`.
