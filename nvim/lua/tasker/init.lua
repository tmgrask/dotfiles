require("tasker.set")
-- install plugins and manage all keymaps in this one file

-- setup lazy vim
local lazypath = vim.fn.stdpath('data') .. '/lazy/lazy.nvim'
local uv = vim.uv or vim.loop

-- Auto-install lazy.nvim if not present
if not uv.fs_stat(lazypath) then
    print('Installing lazy.nvim....')
    vim.fn.system({
        'git',
        'clone',
        '--filter=blob:none',
        'https://github.com/folke/lazy.nvim.git',
        '--branch=stable', -- latest stable release
        lazypath,
    })
    print('Done.')
end

vim.opt.rtp:prepend(lazypath)

require('lazy').setup({
    -- colors
    {
        'rose-pine/neovim',
        name = "rose-pine"
    },
    -- LSP Support
    {
        'VonHeikemen/lsp-zero.nvim',
        branch = 'v3.x',
        lazy = false,
        config = false
    },
    { 'williamboman/mason.nvim' },
    { 'williamboman/mason-lspconfig.nvim' },
    {
        'neovim/nvim-lspconfig',
        dependencies = {
            { 'hrsh7th/cmp-nvim-lsp' },
        },
    },
    -- Autocompletion for LSP
    {
        'hrsh7th/nvim-cmp',
        dependencies = {
            { 'L3MON4D3/LuaSnip' }
        },
    },
    -- nvim-tree
    {
        "nvim-tree/nvim-tree.lua",
        dependencies = {
            "nvim-tree/nvim-web-devicons"
        },
        config = function()
            -- disable netrw at the very start of your init.lua
            vim.g.loaded_netrw = 1
            vim.g.loaded_netrwPlugin = 1
            -- optionally enable 24-bit colour
            vim.opt.termguicolors = true
            require("nvim-tree").setup({
                sort = {
                    sorter = "case_sensitive",
                },
                view = {
                    width = 50,
                },
                renderer = {
                    group_empty = true,
                },
                filters = {
                    dotfiles = true,
                },
                diagnostics = {
                    enable = true,
                    show_on_dirs = true,
                    show_on_open_dirs = true,
                    icons = {
                        hint = "",
                        info = "",
                        warning = "",
                        error = ""
                    }
                }
            })
        end
    },
    -- workplace diagnostics to make nvim-tree more useful
    {
        "artemave/workspace-diagnostics.nvim"
    },
    -- treesitter
    {
        'nvim-treesitter/nvim-treesitter',
        build = ":TSUpdate",
        config = function()
            require 'nvim-treesitter.configs'.setup {
                -- A list of parser names, or "all"
                ensure_installed = { "vimdoc", "javascript", "typescript", "c", "lua", "rust", "swift" },

                -- Install parsers synchronously (only applied to `ensure_installed`)
                sync_install = false,

                -- Automatically install missing parsers when entering buffer
                -- Recommendation: set to false if you don't have `tree-sitter` CLI installed locally
                auto_install = true,

                highlight = {
                    -- `false` will disable the whole extension
                    enable = true,

                    -- Setting this to true will run `:h syntax` and tree-sitter at the same time.
                    -- Set this to `true` if you depend on 'syntax' being enabled (like for indentation).
                    -- Using this option may slow down your editor, and you may see some duplicate highlights.
                    -- Instead of true it can also be a list of languages
                    additional_vim_regex_highlighting = false,
                },
            }

            -- Highlighting for Treesitter Context
            vim.api.nvim_command [[
            autocmd ColorScheme * highlight TreesitterContextLineNumberBottom gui=underline guisp=Grey
            ]]
        end
    },
    {
        "nvim-treesitter/nvim-treesitter-context",
    },
    -- telescope
    {
        'nvim-telescope/telescope.nvim',
        tag = '0.1.5',
        dependencies = { 'nvim-lua/plenary.nvim' },
        config = function()
            local builtin = require('telescope.builtin')
            vim.keymap.set('n', '<C-f>', builtin.find_files, {})
            vim.keymap.set('n', '<C-s>', builtin.live_grep, {})
        end
    },
    -- trouble
    {
        "folke/trouble.nvim",
        dependencies = { "nvim-tree/nvim-web-devicons" },
        config = function()
            vim.keymap.set("n", "<leader>xx", function() require("trouble").toggle() end)
            vim.keymap.set("n", "<leader>xw", function() require("trouble").toggle("workspace_diagnostics") end)
            vim.keymap.set("n", "<leader>xd", function() require("trouble").toggle("document_diagnostics") end)
            vim.keymap.set("n", "<leader>xq", function() require("trouble").toggle("quickfix") end)
            vim.keymap.set("n", "<leader>xl", function() require("trouble").toggle("loclist") end)
            vim.keymap.set("n", "gR", function() require("trouble").toggle("lsp_references") end)
        end
    },
    -- color preview
    {
        "brenoprata10/nvim-highlight-colors",
        config = function()
            require('nvim-highlight-colors').setup {
                render = "virtual",
                virtual_symbol = '■',
            }
        end
    },
    -- jenkins
    {
        'https://git.sr.ht/~imraniq/jenkinsfile.nvim',
        dependencies = "nvim-lua/plenary.nvim",
        config = function()
            require("jenkinsfile").setup({
                username = os.getenv("JENKINS_USERNAME") or "notset",
                password_cmd = { "pass", "jenkins/token" }, -- command to run to get password/token
                jenkins_host = os.getenv("JENKINS_HOST") or "notset",
                insecure = true,                            -- sets --insecure on curl, useful if ssl certs are giving issues
            })
        end,
    },
    -- this is mostly to make tmux-sessionizer work from within vim
    {
        "voldikss/vim-floaterm"
    },
    {
        'stevearc/dressing.nvim',
        opts = {},
    },
    {
        'MeanderingProgrammer/render-markdown.nvim',
        dependencies = { 'nvim-treesitter/nvim-treesitter', 'echasnovski/mini.nvim' }, -- if you use the mini.nvim suite
        -- dependencies = { 'nvim-treesitter/nvim-treesitter', 'echasnovski/mini.icons' }, -- if you use standalone mini plugins
        -- dependencies = { 'nvim-treesitter/nvim-treesitter', 'nvim-tree/nvim-web-devicons' }, -- if you prefer nvim-web-devicons
        ---@module 'render-markdown'
        opts = {},
    },
    {
      "supermaven-inc/supermaven-nvim",
      config = function()
        require("supermaven-nvim").setup({
            keymaps = {
                accept_suggestion = "<S-Tab>",
            }
        })
      end,
    },
})

-- colorscheme
vim.cmd("colorscheme rose-pine")

-- LSP configuration
local cmp = require('cmp')
local cmp_select = { behavior = cmp.SelectBehavior.Select }
cmp.setup({
    mapping = cmp.mapping.preset.insert({
        ['<C-p>'] = cmp.mapping.select_prev_item(cmp_select),
        ['<C-n>'] = cmp.mapping.select_next_item(cmp_select),
        ['<C-y>'] = cmp.mapping.confirm({ select = true }),
    })
})
vim.diagnostic.config({
    virtual_text = false
})

local lsp = require('lsp-zero')
lsp.preset("recommended")

require('mason').setup({})
require('mason-lspconfig').setup({
    handlers = {
        lsp.default_setup,
    },
})

local lspconfig = require("lspconfig")

lspconfig.sourcekit.setup {
}

lsp.on_attach(function(client, bufnr)
    -- see :help lsp-zero-keybindings
    -- to learn the available actions
    local opts = { buffer = bufnr, remap = false }
    lsp.default_keymaps({ buffer = bufnr })
    vim.keymap.set("n", "<leader>d", function() vim.diagnostic.open_float() end, opts)
    vim.keymap.set("n", "g<CR>", function() vim.lsp.buf.code_action() end, opts)
    vim.keymap.set("n", "<leader>r", function() vim.lsp.buf.rename() end, opts)
    vim.keymap.set("n", "<leader>s", function() vim.lsp.buf.workspace_symbol("<cword>") end, opts)
    vim.keymap.set("n", "K", function() vim.lsp.buf.hover() end, opts)
    vim.keymap.set("n", "gf", function() vim.lsp.buf.format() end, opts)
    -- note that enabling workspace diagnostics can get a little resource intensive in large codebases
    vim.keymap.set("n", "gw",
        function() require("workspace-diagnostics").populate_workspace_diagnostics(client, bufnr) end, opts)

    -- stop tsserver in deno projects
    if lspconfig.util.root_pattern("deno.json", "import_map.json")(vim.fn.getcwd()) then
        if client.name == "ts_ls" then
            client.stop()
            return
        end
    end

    -- stop deno in tsprojects projects
    if lspconfig.util.root_pattern("package.json")(vim.fn.getcwd()) then
        if client.name == "denols" then
            if not lspconfig.util.root_pattern("deno.json", "import_map.json")(vim.fn.getcwd()) then
                client.stop()
                return
            end
        end
    end
end)

-- enable gofumpt for gopls
--lspconfig.gopls.setup {
--    settings = {
--        gopls = {
--            gofumpt = true
--        }
--    }
--}

-- only show diagnostics after hover for some time
vim.cmd('autocmd CursorHold * lua vim.diagnostic.open_float()')
vim.o.updatetime = 400

-- Misc keybinds

-- clipboard integration
vim.api.nvim_set_keymap('v', '<leader>y', '"+y', { noremap = true, silent = true })

-- open current shell dir in nimv-tree
vim.api.nvim_set_keymap('n', '<leader>c', ':vsplit .<CR>', { noremap = true, silent = true })
-- open relative dir in nvim-tree
vim.api.nvim_set_keymap('n', '<leader>n', ':vsplit %:h<CR>', { noremap = true, silent = true })

-- clear highlights
vim.keymap.set("n", "<ESC>", ":nohlsearch<CR>", { silent = true })

vim.keymap.set('n', '[d', vim.diagnostic.goto_prev, { desc = 'Go to previous [D]iagnostic message' })
vim.keymap.set('n', ']d', vim.diagnostic.goto_next, { desc = 'Go to next [D]iagnostic message' })

vim.keymap.set('n', '<C-j>', ':cnext<CR>', { desc = 'Go to next quickfix item' })
vim.keymap.set('n', '<C-k>', ':cprev<CR>', { desc = 'Go to previous quickfix item' })

vim.keymap.set('n', '<leader>jv', ':lua require("jenkinsfile").validate()', { desc = 'Validate Jenkinsfile' })

-- setup for Floaterm
vim.keymap.set('t', '<Esc>', [[<C-\><C-n>]])
vim.keymap.set('n', '<C-x>', ":FloatermToggle<CR>", { silent = true })
vim.keymap.set('t', '<C-x>', "<C-\\><C-n>:FloatermToggle<CR>", { silent = true })

-- make tmux-sessionizer work from within nvim
vim.keymap.set('n', '<C-t>',
    ":FloatermNew --width=1.0 --height=1.0 --title=tmux-sessionizer --disposable --autoclose=1 tmux-sessionizer<CR>")

-- some git basics from within vim
vim.keymap.set('n', '<leader>gs', ":FloatermNew! --title=git git status<CR>")
