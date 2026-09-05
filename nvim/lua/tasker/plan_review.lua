local M = {}

local comment_namespace = vim.api.nvim_create_namespace("tasker_plan_review_comments")
local state = nil

local function selected_line_range(use_visual_selection)
    if not use_visual_selection then
        local current_line = vim.fn.line(".")
        return current_line, current_line
    end

    local start_line = vim.fn.line("'<")
    local end_line = vim.fn.line("'>")
    if start_line > end_line then
        start_line, end_line = end_line, start_line
    end
    return start_line, end_line
end

local function selected_plan_text(start_line, end_line)
    return table.concat(vim.api.nvim_buf_get_lines(state.plan_buffer, start_line - 1, end_line, false), "\n")
end

local function add_review_comment(start_line, end_line, body, thread_session_id)
    local comment = {
        id = "C" .. tostring(#state.comments + 1),
        startLine = start_line,
        endLine = end_line,
        excerpt = selected_plan_text(start_line, end_line),
        body = body,
        threadSessionIDs = thread_session_id and { thread_session_id } or {},
    }
    table.insert(state.comments, comment)
    vim.api.nvim_buf_set_extmark(state.plan_buffer, comment_namespace, start_line - 1, 0, {
        end_row = end_line,
        hl_group = "Visual",
        virt_text = { { " " .. comment.id, "DiagnosticWarn" } },
        virt_text_pos = "eol",
    })
    vim.notify(comment.id .. " added to plan feedback", vim.log.levels.INFO)
end

local function prompt_for_comment(use_visual_selection)
    local start_line, end_line = selected_line_range(use_visual_selection)
    vim.ui.input({ prompt = "Comment for planning agent: " }, function(body)
        if body and body ~= "" then add_review_comment(start_line, end_line, body) end
    end)
end

local function show_discussion(response, session_id, start_line, end_line)
    state.thread = {
        sessionID = session_id,
        startLine = start_line,
        endLine = end_line,
        latestResponse = response,
    }
    local discussion_buffer = state.discussion_buffer
    if not discussion_buffer or not vim.api.nvim_buf_is_valid(discussion_buffer) then
        vim.cmd("botright vsplit")
        vim.cmd("vertical resize 52")
        discussion_buffer = vim.api.nvim_create_buf(false, true)
        state.discussion_buffer = discussion_buffer
        vim.api.nvim_win_set_buf(0, discussion_buffer)
    end
    vim.bo[discussion_buffer].modifiable = true
    vim.bo[discussion_buffer].filetype = "markdown"
    vim.bo[discussion_buffer].bufhidden = "wipe"
    vim.api.nvim_buf_set_lines(discussion_buffer, 0, -1, false, {
        "# Plan discussion",
        "",
        "Session: `" .. session_id .. "`",
        "",
        response,
        "",
        "---",
        "`<leader>pd` follow up · `<leader>pp` promote response to comment",
    })
    vim.bo[discussion_buffer].modifiable = false

    vim.keymap.set("n", "<leader>pd", function()
        vim.ui.input({ prompt = "Follow-up question: " }, function(question)
            if question and question ~= "" then M.discuss(question) end
        end)
    end, { buffer = discussion_buffer, desc = "Continue plan discussion" })
    vim.keymap.set("n", "<leader>pp", function()
        vim.ui.input({
            prompt = "Comment for planning agent: ",
            default = state.thread.latestResponse,
        }, function(body)
            if body and body ~= "" then
                add_review_comment(start_line, end_line, body, session_id)
            end
        end)
    end, { buffer = discussion_buffer, desc = "Promote discussion to plan comment" })
end

function M.discuss(question)
    local start_line, end_line
    local selection
    if state.thread then
        start_line = state.thread.startLine
        end_line = state.thread.endLine
        selection = selected_plan_text(start_line, end_line)
    else
        start_line, end_line = selected_line_range()
        selection = selected_plan_text(start_line, end_line)
    end

    local payload = {
        sessionID = state.thread and state.thread.sessionID or nil,
        section = "lines " .. start_line .. "-" .. end_line,
        plan = table.concat(vim.api.nvim_buf_get_lines(state.plan_buffer, 0, -1, false), "\n"),
        selection = selection,
        question = question,
    }
    vim.notify("Asking OpenCode…", vim.log.levels.INFO)
    vim.system({ "opencode-plan-thread" }, { stdin = vim.json.encode(payload), text = true }, function(result)
        vim.schedule(function()
            if result.code ~= 0 then
                vim.notify(result.stderr, vim.log.levels.ERROR)
                return
            end
            local ok, discussion = pcall(vim.json.decode, result.stdout)
            if not ok then
                vim.notify("Plan discussion returned invalid JSON", vim.log.levels.ERROR)
                return
            end
            show_discussion(discussion.response, discussion.sessionID, start_line, end_line)
        end)
    end)
end

local function prompt_for_discussion(use_visual_selection)
    local start_line, end_line = selected_line_range(use_visual_selection)
    vim.ui.input({ prompt = "Discuss selected plan section: " }, function(question)
        if question and question ~= "" then
            state.thread = {
                startLine = start_line,
                endLine = end_line,
            }
            M.discuss(question)
        end
    end)
end

local function finish_review(decision)
    local result = vim.json.encode({ decision = decision, comments = state.comments })
    vim.fn.writefile({ result }, state.result_path)
    vim.cmd("qa")
end

function M.open(request_path)
    local request = vim.json.decode(table.concat(vim.fn.readfile(request_path), "\n"))
    vim.cmd("edit " .. vim.fn.fnameescape(request.planPath))
    state = {
        comments = {},
        plan_buffer = vim.api.nvim_get_current_buf(),
        result_path = request.resultPath,
        root_session_id = request.rootSessionID,
        thread = nil,
        discussion_buffer = nil,
    }

    vim.bo[state.plan_buffer].modifiable = false
    vim.bo[state.plan_buffer].buflisted = false
    vim.wo.number = false
    vim.wo.relativenumber = false
    vim.wo.signcolumn = "no"
    vim.wo.wrap = true
    vim.wo.linebreak = true
    vim.wo.breakindent = true
    vim.wo.colorcolumn = ""

    vim.keymap.set("n", "<leader>pc", function() prompt_for_comment(false) end,
        { buffer = state.plan_buffer, desc = "Comment on current plan line" })
    vim.keymap.set("v", "<leader>pc", function() prompt_for_comment(true) end,
        { buffer = state.plan_buffer, desc = "Comment on plan selection" })
    vim.keymap.set("n", "<leader>pd", function() prompt_for_discussion(false) end,
        { buffer = state.plan_buffer, desc = "Discuss current plan line with OpenCode" })
    vim.keymap.set("v", "<leader>pd", function() prompt_for_discussion(true) end,
        { buffer = state.plan_buffer, desc = "Discuss plan selection with OpenCode" })
    vim.keymap.set("n", "<leader>pa", function() finish_review("approve") end,
        { buffer = state.plan_buffer, desc = "Approve reviewed plan" })
    vim.keymap.set("n", "<leader>pr", function() finish_review("request_changes") end,
        { buffer = state.plan_buffer, desc = "Request plan changes" })

    vim.notify("Plan review: <leader>pc comment · <leader>pd discuss · <leader>pa approve · <leader>pr request changes")
end

return M
