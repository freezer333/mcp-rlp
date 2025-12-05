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
                    console.log('[DEBUG] Tool result:', JSON.stringify(toolResult, null, 2));
                    console.log('[DEBUG] Tool result.result:', JSON.stringify(toolResult.result, null, 2));
                }

                // Check for dual-response pattern
                // The result might be directly on toolResult or on toolResult.result
                const resultToCheck = toolResult.result || toolResult;
                if (this.#dualResponseClient.isDualResponse(resultToCheck)) {
                    const parsed = this.#dualResponseClient.parse(resultToCheck);
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

        // Extract dual-responses from generated items since callbacks may not fire
        // The SDK stores tool outputs in result.state._generatedItems
        if (result.state?._generatedItems) {
            for (const item of result.state._generatedItems) {
                // Only process tool call output items
                if (item.type !== 'tool_call_output_item') continue;

                // The output is at rawItem.output and may be nested:
                // { type: "text", text: "{\"type\":\"text\",\"text\":\"{...actual JSON...}\"}" }
                const rawOutput = item.rawItem?.output;
                if (!rawOutput) continue;

                // Unwrap the nested structure to get to the actual JSON
                let actualData = null;
                try {
                    // rawOutput is { type: "text", text: "..." }
                    if (rawOutput.type === 'text' && rawOutput.text) {
                        // Parse first level - might be another wrapper or actual data
                        const level1 = JSON.parse(rawOutput.text);
                        if (level1.type === 'text' && level1.text) {
                            // Another level of wrapping
                            actualData = JSON.parse(level1.text);
                        } else {
                            actualData = level1;
                        }
                    } else if (typeof rawOutput === 'string') {
                        actualData = JSON.parse(rawOutput);
                    } else {
                        actualData = rawOutput;
                    }
                } catch (e) {
                    if (this.#debug) {
                        console.log('[DEBUG] Failed to parse tool output:', e.message);
                    }
                    continue;
                }

                if (this.#debug) {
                    console.log('[DEBUG] Parsed tool output keys:', actualData ? Object.keys(actualData) : 'null');
                }

                // Check if this is a dual-response (has resource.url)
                if (actualData?.resource?.url) {
                    if (this.#debug) {
                        console.log('[DEBUG] Dual-response found:', {
                            totalCount: actualData.metadata?.total_count,
                            resourceUrl: actualData.resource.url
                        });
                    }

                    const parsed = {
                        sample: actualData.results || [],
                        totalCount: actualData.metadata?.total_count || 0,
                        sampleCount: actualData.metadata?.sample_count || actualData.results?.length || 0,
                        resourceUri: actualData.resource.uri,
                        resourceUrl: actualData.resource.url,
                        columns: actualData.metadata?.columns || [],
                        executedAt: actualData.metadata?.executed_at,
                        expiresAt: actualData.metadata?.expires_at
                    };

                    // Avoid duplicates
                    if (!this.#pendingDualResponses.some(dr => dr.resourceUrl === parsed.resourceUrl)) {
                        this.#pendingDualResponses.push({
                            toolName: item.rawItem?.name || 'query',
                            ...parsed
                        });
                    }
                }
            }
        }

        if (this.#debug) {
            console.log('[DEBUG] Final pending dual-responses:', this.#pendingDualResponses.length);
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
     * @param {number} options.skip - Rows to skip
     * @param {number} options.limit - Max rows to fetch
     * @returns {Promise<Object>} Page of data with pagination info
     */
    async fetchDualResponsePage(dualResponse, options = {}) {
        return this.#dualResponseClient.fetch(dualResponse.resourceUrl, options);
    }
}
