const assert = require('assert');
const { z } = require('zod');

class MCPServer {
    #server_name;
    #server_version;
    #ToolBoxes;

    constructor(toolboxes, options = {}) {
        this.#server_name = options.name || process.env.MCP_SERVER_NAME || 'mcp-server';
        this.#server_version = options.version || process.env.MCP_SERVER_VERSION || '1.0.0';

        if (Array.isArray(toolboxes)) {
            this.#ToolBoxes = toolboxes;
        } else if (toolboxes && typeof toolboxes.load === 'function') {
            this.#ToolBoxes = [toolboxes];
        } else {
            this.#ToolBoxes = [];
        }
    }

    async #buildServer(context, config) {
        const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");

        // Load all tools from toolboxes with the provided context
        const toolArrays = await Promise.all(
            config.ToolBoxes.map(tbx => tbx.load(context))
        );
        const tools = toolArrays.flat();

        const server = new McpServer({
            name: config.server_name,
            version: config.server_version,
        });

        // Register each tool with the MCP server
        for (const tool of tools) {
            server.registerTool(
                tool.name,
                {
                    title: tool.name,
                    description: tool.description,
                    inputSchema: tool.schema,
                },
                async (args) => {
                    const inputSchema = z.object(tool.schema);
                    const validatedInput = inputSchema.parse(args);
                    const results = await tool.handler(validatedInput);

                    // Build text content - stringify if object, otherwise use as-is
                    const textContent = typeof results === 'string'
                        ? results
                        : JSON.stringify(results, null, 2);

                    const response = {
                        content: [{
                            type: "text",
                            text: textContent,
                        }]
                    };

                    // Only include structuredContent if there's an outputSchema
                    if (tool.outputSchema) {
                        response.structuredContent = z.object(tool.outputSchema).parse(results);
                    }

                    return response;
                }
            );
        }

        return server;
    }

    /**
     * Starts MCP server with stdio transport for Claude Desktop integration.
     * @param {Function} contextProvider - Optional async function () => context
     */
    async runStdio(contextProvider) {
        const { StdioServerTransport } = await import(
            "@modelcontextprotocol/sdk/server/stdio.js"
        );

        const config = {
            server_name: this.#server_name,
            server_version: this.#server_version,
            ToolBoxes: this.#ToolBoxes
        };

        // Get context from provider or use empty object
        const context = contextProvider
            ? await contextProvider()
            : {};

        const server = await this.#buildServer(context, config);
        const transport = new StdioServerTransport();

        await server.connect(transport);

        // Handle shutdown gracefully
        process.on('SIGINT', async () => {
            await server.close();
            process.exit(0);
        });
    }

    /**
     * Returns Express middleware for the MCP streaming endpoint.
     * @param {Function} contextProvider - Optional async function (req) => context
     */
    streamingEndpoint(contextProvider) {
        const buildServer = this.#buildServer.bind(this);
        const config = {
            server_name: this.#server_name,
            server_version: this.#server_version,
            ToolBoxes: this.#ToolBoxes
        };

        return async (req, res, next) => {
            const { StreamableHTTPServerTransport } = await import(
                "@modelcontextprotocol/sdk/server/streamableHttp.js"
            );

            try {
                // Get context from provider or use empty object
                const context = contextProvider
                    ? await contextProvider(req)
                    : {};

                const server = await buildServer(context, config);
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: undefined,
                    enableJsonResponse: true,
                });

                res.on('close', () => {
                    transport.close();
                    server.close();
                });

                res.setHeader("Access-Control-Allow-Origin", "*");
                res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

                await server.connect(transport);
                await transport.handleRequest(req, res, req.body);
            } catch (error) {
                console.error('MCP Server Error:', error);
                if (!res.headersSent) {
                    res.status(500).json({
                        jsonrpc: '2.0',
                        error: {
                            code: -32603,
                            message: 'Internal server error',
                        },
                        id: null,
                    });
                }
            }
        };
    }
}

module.exports = MCPServer;
