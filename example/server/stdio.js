#!/usr/bin/env node

/**
 * MCP Server - stdio transport for Claude Desktop
 * This file is used by Claude Desktop to launch the MCP server via stdio
 */

require('dotenv').config();
const { MCPServer, Toolbox } = require('./mcp');

// Import tool factories
const { datetime, datetime_converter } = require('./tools/datetime');
const { tips, schema, query } = require('./tools/database');

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
const contextProvider = async () => {
    return {
        mode: 'stdio',
        startTime: new Date().toISOString()
    };
};

// Start stdio server
mcpServer.runStdio(contextProvider).catch(console.error);
