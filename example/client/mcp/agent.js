/**
 * Agent - OpenAI Agent with MCP server integration
 *
 * This module uses @openai/agents to connect to an MCP server
 * and run an agent that can use MCP tools.
 */

import { Agent, run, MCPServerStreamableHttp } from '@openai/agents';
import { DualResponseClient } from './dual-response.js';

export class MCPAgent {
    #mcpServer;
    #agent;
    #serverUrl;
    #model;
    #history;
    #dualResponseClient;
    #pendingDualResponses;
    #debug;

    constructor(serverUrl, options = {}) {
        this.#serverUrl = serverUrl;
        this.#model = options.model || process.env.OPENAI_MODEL || 'gpt-4o';
        this.#history = [];
        this.#debug = options.debug || false;
        this.#dualResponseClient = new DualResponseClient({ debug: this.#debug });
        this.#pendingDualResponses = [];
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
     * @returns {Promise<{text: string, tables: Array, dualResponses: Array}>}
     */
    async chat(prompt, onToolCall, onToolResult) {
        if (this.#debug) {
            console.log('[DEBUG] Starting chat with prompt:', prompt);
            console.log('[DEBUG] History length:', this.#history.length);
        }

        // Clear pending dual-responses for this chat turn
        this.#pendingDualResponses = [];

        // Build input: if we have history, append the new user message to it
        // Otherwise just use the prompt string
        const input = this.#history.length > 0
            ? [...this.#history, { role: 'user', content: prompt }]
            : prompt;

        const result = await run(this.#agent, input, {
            onToolCall: (toolCall) => {
                if (this.#debug) {
                    console.log('[DEBUG] Tool call:', toolCall);
                }
                if (onToolCall) {
                    onToolCall(toolCall.name, toolCall.arguments || {});
                }
            },
            onToolResult: (toolResult) => {
                if (this.#debug) {
                    console.log('[DEBUG] Tool result:', toolResult);
                }

                // Check for dual-response pattern
                if (this.#dualResponseClient.isDualResponse(toolResult.result)) {
                    const parsed = this.#dualResponseClient.parse(toolResult.result);
                    if (parsed) {
                        if (this.#debug) {
                            console.log('[DEBUG] Dual-response detected:', {
                                totalCount: parsed.totalCount,
                                sampleCount: parsed.sampleCount,
                                resourceUrl: parsed.resourceUrl
                            });
                        }
                        this.#pendingDualResponses.push({
                            toolName: toolResult.name,
                            ...parsed
                        });
                    }
                }

                if (onToolResult) {
                    onToolResult(toolResult.name, toolResult.result);
                }
            }
        });

        if (this.#debug) {
            console.log('[DEBUG] Run result:', result);
            console.log('[DEBUG] Pending dual-responses:', this.#pendingDualResponses.length);
        }

        // Save history for next turn
        this.#history = result.history || [];

        // Parse the JSON response
        let text = '';
        let tables = [];
        try {
            const parsed = JSON.parse(result.finalOutput);
            text = parsed.text || '';
            tables = parsed.tables || [];
        } catch {
            // If not valid JSON, return as plain text
            text = result.finalOutput;
        }

        return {
            text,
            tables,
            dualResponses: [...this.#pendingDualResponses]
        };
    }

    /**
     * Fetch full data for a dual-response
     *
     * @param {Object} dualResponse - Parsed dual-response from chat()
     * @param {Object} options - Fetch options
     * @param {number} options.batchSize - Rows per batch (default: 500)
     * @param {Function} options.onProgress - Progress callback: (fetched, total) => void
     * @returns {Promise<Array>} All rows from the resource
     */
    async fetchDualResponse(dualResponse, options = {}) {
        return this.#dualResponseClient.fetchAll(dualResponse.resourceUrl, options);
    }

    /**
     * Fetch a single page of data for a dual-response
     *
     * @param {Object} dualResponse - Parsed dual-response from chat()
     * @param {Object} options - Fetch options
     * @param {number} options.offset - Starting row offset
     * @param {number} options.limit - Max rows to fetch
     * @param {Object} options.sort - Sort options: { field, order }
     * @returns {Promise<Object>} Page of data with pagination info
     */
    async fetchDualResponsePage(dualResponse, options = {}) {
        return this.#dualResponseClient.fetch(dualResponse.resourceUrl, options);
    }
}
