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

async function main() {
    const ui = DEBUG_MODE ? new ConsoleUI() : new TerminalUI();
    ui.init();

    ui.appendOutput('{bold}MCP Client Demo{/bold}');
    ui.appendOutput('Connecting to MCP server...\n');

    // Initialize MCP agent
    const agent = new MCPAgent(MCP_SERVER_URL);

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
    ui.appendOutput('Try: "What tables are in the database?" or "Show me some institutions in California"\n');

    // Handle user input
    ui.onSubmit(async (input) => {
        // Handle special commands
        if (input.toLowerCase() === '/clear') {
            ui.clearOutput();
            agent.clearHistory();
            return;
        }

        if (input.toLowerCase() === '/quit' || input.toLowerCase() === '/exit') {
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

            // Display any tables
            for (const table of response.tables) {
                ui.appendTable(table.title, table.columns, table.rows);
            }

        } catch (error) {
            ui.appendError(error.message);
        }

        ui.setStatus(`Connected - Ready`);
        ui.enableInput();
    });
}

main().catch(console.error);
