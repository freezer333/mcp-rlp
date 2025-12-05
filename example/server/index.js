require('dotenv').config();
const express = require('express');
const { MCPServer, Toolbox } = require('./mcp');

// Import tool factories
const { datetime, datetime_converter } = require('./tools/datetime');
const { tips, schema, query } = require('./tools/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Create toolboxes
const systemTools = new Toolbox([datetime, datetime_converter]);
const dbTools = new Toolbox([tips, schema, query]);

// Create MCP server with all toolboxes
const mcpServer = new MCPServer(
    [systemTools, dbTools],
    {
        name: 'insights-mcp',
        version: '1.0.0'
    }
);

// Optional: Context provider function
// This is called for each request and can provide request-specific context
const contextProvider = async (req) => {
    return {
        requestId: Date.now().toString(36),
        userAgent: req.get('User-Agent'),
        // Add any custom context here
    };
};

// MCP endpoint - handles all MCP protocol requests
app.post('/mcp', mcpServer.streamingEndpoint(contextProvider));

// CORS preflight for MCP endpoint
app.options('/mcp', (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`MCP Server running at http://localhost:${PORT}`);
    console.log(`MCP endpoint: POST http://localhost:${PORT}/mcp`);
});
