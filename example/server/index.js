require('dotenv').config();
const express = require('express');
const { MCPServer, Toolbox } = require('./mcp');

// Import tool factories
const { datetime, datetime_converter } = require('./tools/datetime');
const { tips, schema, query } = require('./tools/database');
const { queryDualResponse } = require('./tools/database-dual-response');

// Import resource store and router for dual-response
const { ResourceStore } = require('./resources/store');
const { createResourceRouter } = require('./resources/router');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const DEBUG = process.env.DEBUG === 'true' || process.argv.includes('--debug');
const USE_DUAL_RESPONSE = process.env.DUAL_RESPONSE !== 'false';

if (DEBUG) {
    console.log('[Server] ========================================');
    console.log('[Server] Debug mode: ENABLED');
    console.log('[Server] Dual-response mode:', USE_DUAL_RESPONSE ? 'ENABLED' : 'DISABLED');
    console.log('[Server] ========================================');
}

// Middleware
app.use(express.json());

// Create shared resource store for dual-response
const resourceStore = new ResourceStore({ debug: DEBUG });

// Context provider function - injects dependencies into tools
const contextProvider = async (req) => {
    return {
        requestId: Date.now().toString(36),
        userAgent: req.get('User-Agent'),
        // Dual-response dependencies
        resourceStore,
        debug: DEBUG,
        baseUrl: `http://localhost:${PORT}`
    };
};

// Create toolboxes
const systemTools = new Toolbox([datetime, datetime_converter]);

// Conditionally include query tool based on configuration
const dbToolFactories = [tips, schema];
if (USE_DUAL_RESPONSE) {
    dbToolFactories.push(queryDualResponse);
    console.log('[Server] Using dual-response query tool');
} else {
    dbToolFactories.push(query);
    console.log('[Server] Using standard query tool');
}
const dbTools = new Toolbox(dbToolFactories);

// Create MCP server with all toolboxes
const mcpServer = new MCPServer(
    [systemTools, dbTools],
    {
        name: 'insights-mcp',
        version: '1.0.0'
    }
);

// MCP endpoint - handles all MCP protocol requests
app.post('/mcp', mcpServer.streamingEndpoint(contextProvider));

// REST endpoint for resource retrieval (dual-response pattern)
if (USE_DUAL_RESPONSE) {
    app.use('/resources', createResourceRouter(resourceStore, { debug: DEBUG }));
    console.log('[Server] REST endpoint enabled: /resources/:guid');
}

// CORS preflight for MCP endpoint
app.options('/mcp', (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
});

// CORS preflight for resources endpoint
app.options('/resources/*', (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.sendStatus(204);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        mode: USE_DUAL_RESPONSE ? 'dual-response' : 'standard',
        debug: DEBUG
    });
});

// Start server
app.listen(PORT, () => {
    console.log('');
    console.log(`MCP Server running at http://localhost:${PORT}`);
    console.log(`MCP endpoint: POST http://localhost:${PORT}/mcp`);
    if (USE_DUAL_RESPONSE) {
        console.log(`Resources endpoint: http://localhost:${PORT}/resources/:guid`);
    }
    console.log('');
});
