/**
 * Agent - OpenAI Agent with MCP server integration
 *
 * This module uses @openai/agents to connect to an MCP server
 * and run an agent that can use MCP tools.
 */

import { Agent, run, MCPServerStreamableHttp } from '@openai/agents';

export class MCPAgent {
    #mcpServer;
    #agent;
    #serverUrl;
    #model;
    #history;

    constructor(serverUrl, options = {}) {
        this.#serverUrl = serverUrl;
        this.#model = options.model || process.env.OPENAI_MODEL || 'gpt-4o';
        this.#history = [];
    }

    /**
     * Initialize connection to MCP server and create agent
     */
    async connect() {
        // Create MCP server connection
        this.#mcpServer = new MCPServerStreamableHttp({
            name: 'insights-mcp',
            url: this.#serverUrl
        });

        // Connect to the MCP server first
        await this.#mcpServer.connect();

        // Get tools list
        const tools = await this.#mcpServer.listTools();

        // Create agent with MCP server as tool source
        this.#agent = new Agent({
            name: 'insights-agent',
            model: this.#model,
            instructions: `You are a helpful assistant with access to a database of higher education data (IPEDS).

When queries return tabular data, respond with JSON in this format:
{
  "text": "Your explanation here",
  "tables": [
    {
      "title": "Table title",
      "columns": ["col1", "col2"],
      "rows": [["val1", "val2"], ...]
    }
  ]
}

If no tables are needed, just respond with: {"text": "Your response here", "tables": []}

Always use the tools available to answer questions about institutions, programs, degrees, and occupations.
Start by calling the 'tips' tool to understand the database structure if this is a new conversation.`,
            mcpServers: [this.#mcpServer]
        });

        return tools;
    }

    /**
     * Disconnect from MCP server
     */
    async disconnect() {
        if (this.#mcpServer) {
            await this.#mcpServer.close();
        }
    }

    /**
     * Clear conversation history
     */
    clearHistory() {
        this.#history = [];
    }

    /**
     * Run a prompt through the agent
     *
     * @param {string} prompt - User's input
     * @param {function} onToolCall - Callback when a tool is called: (toolName, args) => void
     * @param {function} onToolResult - Callback when tool returns: (toolName, result) => void
     * @returns {Promise<{text: string, tables: Array<{title: string, columns: string[], rows: any[]}>}>}
     */
    async chat(prompt, onToolCall, onToolResult) {
        console.log('[DEBUG] Starting chat with prompt:', prompt);
        console.log('[DEBUG] History length:', this.#history.length);

        // Build input: if we have history, append the new user message to it
        // Otherwise just use the prompt string
        const input = this.#history.length > 0
            ? [...this.#history, { role: 'user', content: prompt }]
            : prompt;

        const result = await run(this.#agent, input, {
            onToolCall: (toolCall) => {
                console.log('[DEBUG] Tool call:', toolCall);
                if (onToolCall) {
                    onToolCall(toolCall.name, toolCall.arguments || {});
                }
            },
            onToolResult: (toolResult) => {
                console.log('[DEBUG] Tool result:', toolResult);
                if (onToolResult) {
                    onToolResult(toolResult.name, toolResult.result);
                }
            }
        });

        console.log('[DEBUG] Run result:', result);

        // Save history for next turn
        this.#history = result.history || [];

        // Parse the JSON response
        try {
            const parsed = JSON.parse(result.finalOutput);
            return {
                text: parsed.text || '',
                tables: parsed.tables || []
            };
        } catch {
            // If not valid JSON, return as plain text
            return {
                text: result.finalOutput,
                tables: []
            };
        }
    }
}
