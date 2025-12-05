/**
 * MCP Client Demo - Entry Point
 *
 * This demonstrates using MCP tools with OpenAI's Agent SDK.
 * The code is organized into:
 *   - /mcp   - MCP agent integration (the interesting part)
 *   - /ui    - Terminal UI code (separate concern)
 */

import { MCPAgent } from './mcp/index.js';
import { TerminalUI, ConsoleUI } from './ui/index.js';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000/mcp';
const DEBUG_MODE = process.argv.includes('--debug');
const PAGE_SIZE = 25;

// Track current dual-response for pagination
let currentDualResponse = null;
let currentPage = 0;

async function main() {
    const ui = DEBUG_MODE ? new ConsoleUI() : new TerminalUI();
    ui.init();

    ui.appendOutput('{bold}MCP Client Demo{/bold}');
    ui.appendOutput('Connecting to MCP server...\n');

    // Initialize MCP agent with debug mode
    const agent = new MCPAgent(MCP_SERVER_URL, { debug: DEBUG_MODE });

    try {
        const tools = await agent.connect();
        ui.setStatus(`Connected - ${tools.length} tools available`);
        ui.appendOutput(`Connected to MCP server at ${MCP_SERVER_URL}`);
        ui.appendOutput(`Available tools: ${tools.map(t => t.name).join(', ')}\n`);
    } catch (error) {
        ui.appendError(`Failed to connect to MCP server: ${error.message}`);
        ui.setStatus('Disconnected');
        ui.appendOutput('\nMake sure the server is running: cd ../server && npm start');
        return;
    }

    ui.appendOutput('Type your questions about higher education data.');
    ui.appendOutput('Try: "What tables are in the database?" or "Show me some institutions in California"');
    ui.appendOutput('Pagination: /next, /prev, /page N, /all, /done\n');

    /**
     * Display a page of dual-response results
     */
    async function displayPage(dr, page) {
        const skip = page * PAGE_SIZE;
        const totalPages = Math.ceil(dr.totalCount / PAGE_SIZE);

        ui.setStatus(`Fetching page ${page + 1}/${totalPages}...`);

        try {
            const result = await agent.fetchDualResponsePage(dr, {
                skip,
                limit: PAGE_SIZE
            });

            const columns = dr.columns.map(c => c.name);
            const rows = result.data.map(row => columns.map(col => row[col]));

            const startRow = skip + 1;
            const endRow = skip + result.returned_count;
            ui.appendTable(
                `Results (${startRow}-${endRow} of ${dr.totalCount}) - Page ${page + 1}/${totalPages}`,
                columns,
                rows
            );

            // Show pagination hints
            const hints = [];
            if (result.has_prev) hints.push('/prev');
            if (result.has_next) hints.push('/next');
            hints.push('/page N');
            hints.push('/all');
            hints.push('/done');
            ui.appendOutput(`{cyan-fg}Navigation: ${hints.join(' | ')}{/cyan-fg}`);

            currentDualResponse = dr;
            currentPage = page;

        } catch (fetchError) {
            ui.appendError(`Failed to fetch page: ${fetchError.message}`);
        }

        ui.setStatus('Connected - Ready');
    }

    // Handle user input
    ui.onSubmit(async (input) => {
        const cmd = input.toLowerCase().trim();

        // Handle pagination commands
        if (cmd === '/next') {
            if (!currentDualResponse) {
                ui.appendOutput('{yellow-fg}No results to paginate. Run a query first.{/yellow-fg}');
                return;
            }
            const totalPages = Math.ceil(currentDualResponse.totalCount / PAGE_SIZE);
            if (currentPage < totalPages - 1) {
                ui.disableInput();
                await displayPage(currentDualResponse, currentPage + 1);
                ui.enableInput();
            } else {
                ui.appendOutput('{yellow-fg}Already on last page{/yellow-fg}');
            }
            return;
        }

        if (cmd === '/prev') {
            if (!currentDualResponse) {
                ui.appendOutput('{yellow-fg}No results to paginate. Run a query first.{/yellow-fg}');
                return;
            }
            if (currentPage > 0) {
                ui.disableInput();
                await displayPage(currentDualResponse, currentPage - 1);
                ui.enableInput();
            } else {
                ui.appendOutput('{yellow-fg}Already on first page{/yellow-fg}');
            }
            return;
        }

        if (cmd.startsWith('/page ')) {
            if (!currentDualResponse) {
                ui.appendOutput('{yellow-fg}No results to paginate. Run a query first.{/yellow-fg}');
                return;
            }
            const pageNum = parseInt(cmd.split(' ')[1]) - 1; // Convert to 0-indexed
            const totalPages = Math.ceil(currentDualResponse.totalCount / PAGE_SIZE);
            if (pageNum >= 0 && pageNum < totalPages) {
                ui.disableInput();
                await displayPage(currentDualResponse, pageNum);
                ui.enableInput();
            } else {
                ui.appendOutput(`{yellow-fg}Invalid page. Valid range: 1-${totalPages}{/yellow-fg}`);
            }
            return;
        }

        if (cmd === '/all') {
            if (!currentDualResponse) {
                ui.appendOutput('{yellow-fg}No results to fetch. Run a query first.{/yellow-fg}');
                return;
            }
            ui.disableInput();
            ui.appendOutput(`\n{yellow-fg}Fetching all ${currentDualResponse.totalCount} rows...{/yellow-fg}`);
            ui.setStatus(`Fetching all ${currentDualResponse.totalCount} rows...`);

            try {
                const allRows = await agent.fetchDualResponse(currentDualResponse, {
                    batchSize: 500,
                    onProgress: (fetched, total) => {
                        ui.setStatus(`Fetching: ${fetched}/${total} rows`);
                    }
                });

                const columns = currentDualResponse.columns.map(c => c.name);
                const rows = allRows.map(row => columns.map(col => row[col]));
                ui.appendTable(`All Results (${allRows.length} rows)`, columns, rows);
                ui.appendOutput(`{green-fg}Fetched ${allRows.length} rows via REST endpoint{/green-fg}`);
            } catch (fetchError) {
                ui.appendError(`Failed to fetch all results: ${fetchError.message}`);
            }

            ui.setStatus('Connected - Ready');
            ui.enableInput();
            return;
        }

        if (cmd === '/done') {
            if (currentDualResponse) {
                currentDualResponse = null;
                currentPage = 0;
                ui.appendOutput('{green-fg}Pagination cleared. Ready for new query.{/green-fg}');
            } else {
                ui.appendOutput('{yellow-fg}No active pagination to clear.{/yellow-fg}');
            }
            return;
        }

        // Handle other special commands
        if (cmd === '/clear') {
            ui.clearOutput();
            agent.clearHistory();
            currentDualResponse = null;
            currentPage = 0;
            return;
        }

        if (cmd === '/quit' || cmd === '/exit') {
            await agent.disconnect();
            ui.destroy();
            process.exit(0);
        }

        ui.appendUserMessage(input);
        ui.setStatus('Thinking...');
        ui.disableInput();

        try {
            const response = await agent.chat(
                input,
                // onToolCall callback
                (toolName, args) => {
                    ui.appendToolCall(toolName, args);
                },
                // onToolResult callback
                (toolName, result) => {
                    ui.setStatus(`Tool ${toolName} completed`);
                }
            );

            // Display text response
            if (response.text) {
                ui.appendAssistantMessage(response.text);
            }

            // Display any tables from LLM response
            for (const table of response.tables) {
                ui.appendTable(table.title, table.columns, table.rows);
            }

            // Handle dual-responses: fetch first page
            if (response.dualResponses && response.dualResponses.length > 0) {
                // Use the last dual-response for pagination
                const dr = response.dualResponses[response.dualResponses.length - 1];
                ui.appendOutput(`\n{yellow-fg}Query returned {/yellow-fg}{bold}${dr.totalCount}{/bold}{yellow-fg} rows{/yellow-fg}`);
                await displayPage(dr, 0);
            }

        } catch (error) {
            ui.appendError(error.message);
        }

        ui.setStatus('Connected - Ready');
        ui.enableInput();
    });
}

main().catch(console.error);
