import type { ToolDescriptor } from '@hx/shared';

export const LABELED_ROUTING_PROMPTS = [
  // Coding (15 prompts)
  { prompt: 'git status', intent: 'coding', privacy: 'normal', complexity: 1 },
  { prompt: 'git diff HEAD~1', intent: 'coding', privacy: 'normal', complexity: 1 },
  { prompt: 'git log --oneline -n 10', intent: 'coding', privacy: 'normal', complexity: 1 },
  { prompt: 'pnpm test packages/core', intent: 'coding', privacy: 'normal', complexity: 1 },
  { prompt: 'cargo test --all', intent: 'coding', privacy: 'normal', complexity: 1 },
  { prompt: 'read file src/index.ts', intent: 'coding', privacy: 'normal', complexity: 1 },
  { prompt: 'Fix the syntax error in packages/shared/src/types.ts', intent: 'coding', privacy: 'normal', complexity: 2 },
  { prompt: 'Why is there a traceback on line 42 of auth.py?', intent: 'coding', privacy: 'normal', complexity: 2 },
  { prompt: 'Refactor the error handling in executor.ts to use custom subclasses', intent: 'coding', privacy: 'normal', complexity: 3 },
  { prompt: 'Implement a new caching layer for database queries', intent: 'coding', privacy: 'normal', complexity: 3 },
  { prompt: 'Write a unit test suite for the prompt validator component', intent: 'coding', privacy: 'normal', complexity: 3 },
  { prompt: 'Refactor across multi-file architectures to support asynchronous streaming', intent: 'coding', privacy: 'normal', complexity: 4 },
  { prompt: 'Create a full-stack authentication flow with JWT tokens and database migrations', intent: 'coding', privacy: 'normal', complexity: 4 },
  { prompt: 'Rewrite the entire build pipeline and migrate the codebase to rust', intent: 'coding', privacy: 'normal', complexity: 5 },
  { prompt: 'Inspect the contents of .env and update the DATABASE_URL credentials', intent: 'coding', privacy: 'local_only', complexity: 2 },

  // Office (10 prompts)
  { prompt: 'Read the summary sheet from Q3_Financials.xlsx', intent: 'office', privacy: 'normal', complexity: 1 },
  { prompt: 'Open report.docx and extract the executive summary', intent: 'office', privacy: 'normal', complexity: 1 },
  { prompt: 'Create a spreadsheet named budget.xlsx with columns Date, Item, Cost', intent: 'office', privacy: 'normal', complexity: 2 },
  { prompt: 'Update cell C15 in sales_forecast.xlsx with the new total', intent: 'office', privacy: 'normal', complexity: 2 },
  { prompt: 'Replace all occurrences of ACME Corp with Globex Inc in contract.docx', intent: 'office', privacy: 'normal', complexity: 2 },
  { prompt: 'Extract all tables from the annual_review.pdf file', intent: 'office', privacy: 'normal', complexity: 2 },
  { prompt: 'Create a 5-slide presentation in deck.pptx covering our product roadmap', intent: 'office', privacy: 'normal', complexity: 3 },
  { prompt: 'Run a SQL query on data.xlsx to calculate average revenue per region', intent: 'office', privacy: 'normal', complexity: 3 },
  { prompt: 'Format the financial statements spreadsheet and apply accounting currency styles', intent: 'office', privacy: 'normal', complexity: 3 },
  { prompt: 'Read client_passwords.xlsx and extract the server passwords', intent: 'office', privacy: 'local_only', complexity: 2 },

  // Web (10 prompts)
  { prompt: 'Search the web for the latest release notes of Node.js 22', intent: 'web', privacy: 'normal', complexity: 1 },
  { prompt: 'Look up on the web how to configure Vitest with pnpm workspaces', intent: 'web', privacy: 'normal', complexity: 1 },
  { prompt: 'Google for recent benchmarks comparing SQLite with DuckDB', intent: 'web', privacy: 'normal', complexity: 1 },
  { prompt: 'Browse to https://docs.rs/tree-sitter and find the query syntax documentation', intent: 'web', privacy: 'normal', complexity: 2 },
  { prompt: 'Fetch https://news.ycombinator.com and summarize the top 3 stories', intent: 'web', privacy: 'normal', complexity: 2 },
  { prompt: 'Search online for tutorials on Rust procedural macros', intent: 'web', privacy: 'normal', complexity: 2 },
  { prompt: 'Find recent security vulnerabilities related to OpenSSL in 2026', intent: 'web', privacy: 'normal', complexity: 2 },
  { prompt: 'Compare features of Ollama vs vLLM across local models', intent: 'web', privacy: 'normal', complexity: 3 },
  { prompt: 'Scrape the latest stock prices for AAPL and GOOGL from finance websites', intent: 'web', privacy: 'normal', complexity: 3 },
  { prompt: 'Search the web for my leaked API key: AIzaSyD1234567890abcdef1234567890abcdef', intent: 'web', privacy: 'local_only', complexity: 2 },

  // System (8 prompts)
  { prompt: 'ps aux', intent: 'system', privacy: 'normal', complexity: 1 },
  { prompt: 'Check disk space with df -h', intent: 'system', privacy: 'normal', complexity: 1 },
  { prompt: 'Show system uptime and current CPU usage', intent: 'system', privacy: 'normal', complexity: 1 },
  { prompt: 'What is the current clipboard text?', intent: 'system', privacy: 'normal', complexity: 1 },
  { prompt: 'Send a system notification that the build has finished', intent: 'system', privacy: 'normal', complexity: 1 },
  { prompt: 'Kill process 9482', intent: 'system', privacy: 'normal', complexity: 1 },
  { prompt: 'List all running docker containers and memory consumption', intent: 'system', privacy: 'normal', complexity: 2 },
  { prompt: 'Check battery status and power profile', intent: 'system', privacy: 'normal', complexity: 1 },

  // General Conversational (7 prompts)
  { prompt: 'hello', intent: 'general', privacy: 'normal', complexity: 1 },
  { prompt: 'hi there', intent: 'general', privacy: 'normal', complexity: 1 },
  { prompt: 'Good morning!', intent: 'general', privacy: 'normal', complexity: 1 },
  { prompt: 'Who are you and what can you do?', intent: 'general', privacy: 'normal', complexity: 1 },
  { prompt: 'What time is it?', intent: 'general', privacy: 'normal', complexity: 1 },
  { prompt: 'Tell me a funny joke about programming', intent: 'general', privacy: 'normal', complexity: 1 },
  { prompt: 'What are the main principles of functional programming?', intent: 'general', privacy: 'normal', complexity: 2 },
];

export const REGISTRY_45_TOOLS: ToolDescriptor[] = [
  // 1-10 Filesystem
  { name: 'fs.read_file', alias: 'fs_read_file', description: 'Read line ranges or full text of a file in the workspace.', shortDescription: 'Read file lines.', category: 'fs', tier: 0, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'fs.write_file', alias: 'fs_write_file', description: 'Write full content to a file, creating directories if needed.', shortDescription: 'Write file content.', category: 'fs', tier: 1, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: { destructiveHint: true } },
  { name: 'fs.apply_edit', alias: 'fs_apply_edit', description: 'Apply targeted search and replace code edits to a file.', shortDescription: 'Apply search/replace.', category: 'fs', tier: 1, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: {} },
  { name: 'fs.list_dir', alias: 'fs_list_dir', description: 'List contents and entries of a directory in the workspace.', shortDescription: 'List directory entries.', category: 'fs', tier: 0, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'fs.file_info', alias: 'fs_file_info', description: 'Inspect metadata, size, timestamps and stats of a file or directory.', shortDescription: 'File stats and size.', category: 'fs', tier: 0, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'fs.glob', alias: 'fs_glob', description: 'Find workspace files matching a wildcard pattern respecting gitignore.', shortDescription: 'Find files by glob.', category: 'fs', tier: 0, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'fs.grep', alias: 'fs_grep', description: 'Search across workspace files for regular expression patterns.', shortDescription: 'Grep regex in files.', category: 'fs', tier: 0, timeoutMs: 10000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'fs.move', alias: 'fs_move', description: 'Move or rename a file or directory within the workspace.', shortDescription: 'Move or rename file.', category: 'fs', tier: 1, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: { destructiveHint: true } },
  { name: 'fs.trash', alias: 'fs_trash', description: 'Safely move a file or directory to operating system trash bin.', shortDescription: 'Trash file or dir.', category: 'fs', tier: 2, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: { destructiveHint: true } },
  { name: 'fs.repo_map', alias: 'fs_repo_map', description: 'Extract code symbol outlines and AST signatures for the repository.', shortDescription: 'AST symbol map.', category: 'fs', tier: 0, timeoutMs: 10000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },

  // 11-18 Git
  { name: 'git.status', alias: 'git_status', description: 'Show the current git working tree status and modified files.', shortDescription: 'Git status.', category: 'git', tier: 0, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'git.diff', alias: 'git_diff', description: 'Inspect unstaged or staged git diff changes between revisions.', shortDescription: 'Git diff.', category: 'git', tier: 0, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'git.commit', alias: 'git_commit', description: 'Record changes to the git repository with a commit message.', shortDescription: 'Git commit.', category: 'git', tier: 1, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: {} },
  { name: 'git.log', alias: 'git_log', description: 'View git commit history and changelog logs.', shortDescription: 'Git log.', category: 'git', tier: 0, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'git.branch', alias: 'git_branch', description: 'List, create, or delete git branches in the repository.', shortDescription: 'Git branches.', category: 'git', tier: 1, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: {} },
  { name: 'git.checkout', alias: 'git_checkout', description: 'Switch git branches or checkout files from revisions.', shortDescription: 'Git checkout.', category: 'git', tier: 1, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: {} },
  { name: 'git.stash', alias: 'git_stash', description: 'Stash or restore dirty changes in the working directory.', shortDescription: 'Git stash.', category: 'git', tier: 1, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: {} },
  { name: 'git.merge', alias: 'git_merge', description: 'Join two or more development histories through git merge.', shortDescription: 'Git merge.', category: 'git', tier: 2, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: {} },

  // 19-28 Office
  { name: 'office.docx_read', alias: 'office_docx_read', description: 'Read paragraph structure and outlines from a Word docx document.', shortDescription: 'Read Word docx.', category: 'office', tier: 0, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'office.docx_replace_text', alias: 'office_docx_replace_text', description: 'Search and replace text within a Word docx document cleanly.', shortDescription: 'Replace Word text.', category: 'office', tier: 1, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: {} },
  { name: 'office.docx_insert_paragraph', alias: 'office_docx_insert_paragraph', description: 'Insert a new paragraph or section into a docx document.', shortDescription: 'Insert paragraph.', category: 'office', tier: 1, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: {} },
  { name: 'office.docx_add_table', alias: 'office_docx_add_table', description: 'Add a formatted table with rows and columns to a Word docx document.', shortDescription: 'Add Word table.', category: 'office', tier: 1, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: {} },
  { name: 'office.xlsx_read_range', alias: 'office_xlsx_read_range', description: 'Read cell data and values from a range in an Excel spreadsheet.', shortDescription: 'Read Excel range.', category: 'office', tier: 0, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'office.xlsx_write_cells', alias: 'office_xlsx_write_cells', description: 'Write values and numbers to specific cells in an Excel spreadsheet.', shortDescription: 'Write Excel cells.', category: 'office', tier: 1, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: {} },
  { name: 'office.xlsx_add_formula', alias: 'office_xlsx_add_formula', description: 'Insert formula calculations (SUM, AVERAGE) into an Excel spreadsheet.', shortDescription: 'Add Excel formula.', category: 'office', tier: 1, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: {} },
  { name: 'office.xlsx_query_sql', alias: 'office_xlsx_query_sql', description: 'Execute read-only SQL queries against sheets in an Excel xlsx workbook.', shortDescription: 'Query Excel SQL.', category: 'office', tier: 0, timeoutMs: 10000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'office.pptx_read', alias: 'office_pptx_read', description: 'Read slides, notes, and text from a PowerPoint pptx presentation.', shortDescription: 'Read PowerPoint.', category: 'office', tier: 0, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'office.pdf_read', alias: 'office_pdf_read', description: 'Extract text and layout from pages in an Adobe PDF document.', shortDescription: 'Extract PDF text.', category: 'office', tier: 0, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },

  // 29-33 Web
  { name: 'web.search', alias: 'web_search', description: 'Search the internet web and retrieve ranked results with citations.', shortDescription: 'Web search.', category: 'web', tier: 0, timeoutMs: 10000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true, openWorldHint: true } },
  { name: 'web.fetch_markdown', alias: 'web_fetch_markdown', description: 'Fetch an article from a web URL converted to clean markdown.', shortDescription: 'Fetch web markdown.', category: 'web', tier: 0, timeoutMs: 10000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'web.fetch_many', alias: 'web_fetch_many', description: 'Fetch multiple web URLs in parallel with rate limits.', shortDescription: 'Fetch multiple URLs.', category: 'web', tier: 0, timeoutMs: 15000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'web.pdf_fetch', alias: 'web_pdf_fetch', description: 'Download and extract text from an online PDF document link.', shortDescription: 'Fetch web PDF.', category: 'web', tier: 0, timeoutMs: 10000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'web.download_file', alias: 'web_download_file', description: 'Download a binary or asset file from a web URL to workspace.', shortDescription: 'Download file.', category: 'web', tier: 1, timeoutMs: 15000, inputSchema: { type: 'object' }, annotations: {} },

  // 34-41 System
  { name: 'system.clipboard_read', alias: 'sys_clipboard_read', description: 'Read string text currently stored on the OS clipboard.', shortDescription: 'Read clipboard.', category: 'system', tier: 0, timeoutMs: 3000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'system.clipboard_write', alias: 'sys_clipboard_write', description: 'Write or copy text string onto the system clipboard.', shortDescription: 'Write clipboard.', category: 'system', tier: 0, timeoutMs: 3000, inputSchema: { type: 'object' }, annotations: {} },
  { name: 'system.notify', alias: 'sys_notify', description: 'Display a desktop notification popup on the user screen.', shortDescription: 'Show notification.', category: 'system', tier: 0, timeoutMs: 3000, inputSchema: { type: 'object' }, annotations: {} },
  { name: 'system.open_app', alias: 'sys_open_app', description: 'Launch or open a desktop application by name or path.', shortDescription: 'Open application.', category: 'system', tier: 2, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: {} },
  { name: 'system.sysinfo', alias: 'sys_info', description: 'Inspect host system hardware, cpu, memory and OS distribution.', shortDescription: 'Host system info.', category: 'system', tier: 0, timeoutMs: 3000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'system.screenshot', alias: 'sys_screenshot', description: 'Capture screenshot image of the active display screen.', shortDescription: 'Capture screenshot.', category: 'system', tier: 0, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'system.kill_process', alias: 'sys_kill_process', description: 'Terminate a running process by its PID identifier.', shortDescription: 'Kill process by PID.', category: 'system', tier: 2, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: { destructiveHint: true } },
  { name: 'system.list_processes', alias: 'sys_list_processes', description: 'List currently running operating system processes and PIDs.', shortDescription: 'List processes.', category: 'system', tier: 0, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },

  // 42-45 Core
  { name: 'core.find_tools', alias: 'find_tools', description: 'Search the harness tool registry for additional tools.', shortDescription: 'Find tools.', category: 'core', tier: 0, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'core.blob_read', alias: 'blob_read', description: 'Read ranges from an offloaded large tool result blob.', shortDescription: 'Read blob lines.', category: 'core', tier: 0, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'core.blob_grep', alias: 'blob_grep', description: 'Search for patterns inside an offloaded tool result blob.', shortDescription: 'Grep blob patterns.', category: 'core', tier: 0, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  { name: 'core.todo', alias: 'todo', description: 'Manage persistent session tasks and checklist items.', shortDescription: 'Manage todo items.', category: 'core', tier: 0, timeoutMs: 5000, inputSchema: { type: 'object' }, annotations: {} },
];

export const EVAL_40_PROMPTS = [
  { prompt: 'Read lines 1 to 50 of packages/core/src/index.ts', target: 'fs.read_file', category: 'fs' },
  { prompt: 'Write new configuration contents to settings.json', target: 'fs.write_file', category: 'fs' },
  { prompt: 'Replace the old function call with newAsyncFunction in auth.ts', target: 'fs.apply_edit', category: 'fs' },
  { prompt: 'List all files in the tests directory', target: 'fs.list_dir', category: 'fs' },
  { prompt: 'What is the file size and last modified date of bundle.js?', target: 'fs.file_info', category: 'fs' },
  { prompt: 'Find all markdown files ending with .md in docs/', target: 'fs.glob', category: 'fs' },
  { prompt: 'Search for all TODO comments across the entire codebase', target: 'fs.grep', category: 'fs' },
  { prompt: 'Rename old_name.ts to new_name.ts', target: 'fs.move', category: 'fs' },
  { prompt: 'Delete obsolete.txt and move it to the trash bin', target: 'fs.trash', category: 'fs' },
  { prompt: 'Show the symbol outline and functions in src/server.ts', target: 'fs.repo_map', category: 'fs' },

  { prompt: 'Show git status of the repository', target: 'git.status', category: 'git' },
  { prompt: 'Inspect the git diff of unstaged changes', target: 'git.diff', category: 'git' },
  { prompt: 'Commit these changes with message feat: add router', target: 'git.commit', category: 'git' },
  { prompt: 'Show the last 5 commits in git log', target: 'git.log', category: 'git' },
  { prompt: 'Create a new feature branch named feat/tool-retrieval', target: 'git.branch', category: 'git' },
  { prompt: 'Switch branch to master', target: 'git.checkout', category: 'git' },
  { prompt: 'Stash uncommitted local work', target: 'git.stash', category: 'git' },
  { prompt: 'Merge branch feature-1 into current branch', target: 'git.merge', category: 'git' },

  { prompt: 'Read outline and text from specification.docx', target: 'office.docx_read', category: 'office' },
  { prompt: 'Replace all occurrences of Acme with Globex in contract.docx', target: 'office.docx_replace_text', category: 'office' },
  { prompt: 'Insert a new concluding paragraph into memo.docx', target: 'office.docx_insert_paragraph', category: 'office' },
  { prompt: 'Add a summary table with 3 rows into review.docx', target: 'office.docx_add_table', category: 'office' },
  { prompt: 'Read cell values from range A1:C20 in budget.xlsx', target: 'office.xlsx_read_range', category: 'office' },
  { prompt: 'Write updated numbers to cells in sales.xlsx', target: 'office.xlsx_write_cells', category: 'office' },
  { prompt: 'Add SUM formula to column D in financials.xlsx', target: 'office.xlsx_add_formula', category: 'office' },
  { prompt: 'Run a SQL query on the spreadsheet data in ledger.xlsx', target: 'office.xlsx_query_sql', category: 'office' },
  { prompt: 'Read the slides and speaker notes in presentation.pptx', target: 'office.pptx_read', category: 'office' },
  { prompt: 'Extract text from manual.pdf', target: 'office.pdf_read', category: 'office' },

  { prompt: 'Search the web for documentation on Rust traits', target: 'web.search', category: 'web' },
  { prompt: 'Fetch the article at https://example.com/blog and convert to markdown', target: 'web.fetch_markdown', category: 'web' },
  { prompt: 'Fetch three documentation links in parallel', target: 'web.fetch_many', category: 'web' },
  { prompt: 'Download and extract the online PDF whitepaper from https://example.com/paper.pdf', target: 'web.pdf_fetch', category: 'web' },
  { prompt: 'Download remote image file from web url to assets folder', target: 'web.download_file', category: 'web' },

  { prompt: 'Read the copied text from system clipboard', target: 'system.clipboard_read', category: 'system' },
  { prompt: 'Copy this generated token to the system clipboard', target: 'system.clipboard_write', category: 'system' },
  { prompt: 'Send desktop notification alert when compilation succeeds', target: 'system.notify', category: 'system' },
  { prompt: 'Open the Calculator desktop application', target: 'system.open_app', category: 'system' },
  { prompt: 'What are the system hardware specs, CPU cores, and total RAM?', target: 'system.sysinfo', category: 'system' },
  { prompt: 'Take a screenshot of the current monitor display', target: 'system.screenshot', category: 'system' },
  { prompt: 'Kill hanging process with PID 1234', target: 'system.kill_process', category: 'system' },
];
