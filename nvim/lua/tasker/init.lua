require("tasker.set") -- install plugins

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
    {
        "artemave/workspace-diagnostics.nvim"
    },
    -- treesitter
    {
        'nvim-treesitter/nvim-treesitter',
        build = ":TSUpdate",
        config = function()
            require 'nvim-treesitter.configs'.setup {
                ensure_installed = { "vimdoc", "javascript", "typescript", "c", "lua", "rust", "swift", "go", "bash" },
                sync_install = false,
                -- Automatically install missing parsers when entering buffer
                auto_install = true,

                highlight = {
                    enable = true,
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
        dependencies = { 'nvim-lua/plenary.nvim' },
    },
    -- trouble
    {
        "folke/trouble.nvim",
        dependencies = { "nvim-tree/nvim-web-devicons" },
    },
    -- color prevew
    {
        "brenoprata10/nvim-highlight-colors",
        config = function()
            require('nvim-highlight-colors').setup {
                render = "virtual",
                virtual_symbol = '■',
            }
        end
    },
    {
        'MeanderingProgrammer/render-markdown.nvim',
        dependencies = { 'nvim-treesitter/nvim-treesitter', 'echasnovski/mini.nvim' },
        ---@module 'render-markdown'
        opts = {},
    },
    {
        'nvim-flutter/flutter-tools.nvim',
        lazy = false,
        dependencies = {
            'nvim-lua/plenary.nvim',
            'stevearc/dressing.nvim', -- optional for vim.ui.select
        },
        config = true,
    }
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

vim.cmd([[filetype plugin indent on]])

local lspconfig = require('lspconfig')

lsp.on_attach(function(client, bufnr)
    -- see :help lsp-zero-keybindings
    -- to learn the available actions
    lsp.default_keymaps({ buffer = bufnr })
    vim.keymap.set("n", "g<CR>", function() vim.lsp.buf.code_action() end, { buffer = bufnr, desc = "vim.lsp.buf.code_action" })
    vim.keymap.set("n", "<leader>r", function() vim.lsp.buf.rename() end, { buffer = bufnr, desc = "vim.lsp.buf.rename" })
    vim.keymap.set("n", "K", function() vim.lsp.buf.hover() end, { buffer = bufnr, desc = "vim.lsp.buf.hover"} )
    vim.keymap.set("n", "gf", function() vim.lsp.buf.format() end, { buffer = bufnr, desc = "vim.lsp.buf.format"} )
    -- note that enabling workspace diagnostics can get a little resource intensive in large codebases
    vim.keymap.set("n", "gw",
        function() require("workspace-diagnostics").populate_workspace_diagnostics(client, bufnr) end, { buffer = bufnr, desc = "populate_workspace_diagnostics" })

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

lspconfig.kotlin_language_server.setup {
    cmd                 = { 'kotlin-ls', '--stdio' },
    filetypes           = { 'kotlin' },
    single_file_support = true,
    root_dir            = lspconfig.util.root_pattern(
        'build.gradle',
        'settings.gradle',
        'settings.gradle.kts',
        '.git'
    ),
    on_attach           = function(client, bufnr)
        require('lsp-zero').default_keymaps({ buffer = bufnr })
    end,
}

-- buf LSP for protobuf files (custom server setup)
local configs = require('lspconfig.configs')

if not configs.buf_ls then
    configs.buf_ls = {
        default_config = {
            cmd = { 'buf', 'lsp', 'serve' },
            filetypes = { 'proto' },
            root_dir = lspconfig.util.root_pattern('buf.yaml', 'buf.work.yaml', '.git'),
            single_file_support = true,
        },
    }
end

lspconfig.buf_ls.setup {}

require("flutter-tools").setup {} -- use defaults

-- only show diagnostics after hover for some time
vim.cmd('autocmd CursorHold * lua vim.diagnostic.open_float()')
vim.o.updatetime = 400

-- clipboard integration
vim.api.nvim_set_keymap('v', '<leader>y', '"+y', { noremap = true, silent = true })

-- clear highlights
vim.keymap.set("n", "<ESC>", ":nohlsearch<CR>", { silent = true })

vim.keymap.set('n', '[d', vim.diagnostic.goto_prev, { desc = 'Go to previous [D]iagnostic message' })
vim.keymap.set('n', ']d', vim.diagnostic.goto_next, { desc = 'Go to next [D]iagnostic message' })

vim.keymap.set('n', '<C-j>', ':cnext<CR>', { desc = 'Go to next quickfix item' })
vim.keymap.set('n', '<C-k>', ':cprev<CR>', { desc = 'Go to previous quickfix item' })

-- telescope
local telescope = require('telescope.builtin')
vim.keymap.set('n', '<C-f>', telescope.find_files, { desc = "telescope.find_files" })
vim.keymap.set('n', '<C-s>', telescope.live_grep, { desc = "telescope.live_grep" })
vim.keymap.set('n', '<C-h>', telescope.help_tags, { desc = "telescope.help_tags" })
vim.keymap.set('n', '<C-g>', telescope.git_status, { desc = "telescope.git_status" })
vim.keymap.set('n', '<C-e>', telescope.lsp_document_symbols, { desc = "telescope.lsp_document_symbols" })
vim.keymap.set('n', '<C-q>', telescope.diagnostics, { desc = "telescope.diagnostics" })

vim.api.nvim_set_hl(0, 'FloatBorder', { fg = '#333333' })
