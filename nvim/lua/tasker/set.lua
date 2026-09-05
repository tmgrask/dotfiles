vim.opt.guicursor = ""

vim.opt.nu = true
vim.opt.relativenumber = true

vim.opt.tabstop = 4
vim.opt.softtabstop = 4
vim.opt.shiftwidth = 4
vim.opt.expandtab = true

vim.opt.smartindent = true

vim.opt.wrap = false

local markdown_reading_group = vim.api.nvim_create_augroup("tasker_markdown_reading", { clear = true })

local function configure_markdown_reading_window()
    local markdown_filetype = vim.bo.filetype == "markdown" or vim.bo.filetype == "markdown.mdx"

    vim.opt_local.wrap = markdown_filetype
    vim.opt_local.linebreak = markdown_filetype
    vim.opt_local.breakindent = markdown_filetype
    vim.opt_local.breakindentopt = markdown_filetype and "shift:2,min:40" or ""
    vim.opt_local.colorcolumn = markdown_filetype and "" or "80"
end

vim.api.nvim_create_autocmd({ "FileType", "BufWinEnter" }, {
    group = markdown_reading_group,
    pattern = "*",
    callback = configure_markdown_reading_window,
})

vim.opt.swapfile = false
vim.opt.backup = false
vim.opt.undodir = os.getenv("HOME") .. "/.vim/undodir"
vim.opt.undofile = true

vim.opt.hlsearch = true
vim.opt.incsearch = true

vim.opt.termguicolors = true

vim.opt.scrolloff = 8
vim.opt.signcolumn = "yes"
vim.opt.isfname:append("@-@")

vim.opt.updatetime = 50

vim.opt.colorcolumn = "80"

vim.g.netrw_browse_split = 0
--vim.g.netrw_banner = 0
vim.g.netrw_winsize = 25
