const fs = require('fs');
const path = require('path');
const { z } = require('zod');

// Check Node.js version requirement
const nodeVersion = process.versions.node;
const [major, minor] = nodeVersion.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 5)) {
    console.error(`Error: Node.js 22.5.0 or higher is required for native SQLite support.`);
    console.error(`Current version: ${nodeVersion}`);
    console.error(`Please upgrade Node.js to use the database tools.`);
}

const { DatabaseSync } = require('node:sqlite');

// Allowed table names
const ALLOWED_TABLES = [
    'institutions',
    'institution_details',
    'degrees_awarded',
    'occupations',
    'programs',
    'program_occupations'
];

// Database path
const DB_PATH = path.join(__dirname, '..', 'insights.sqlite');

// Initialize read-only database connection
let db = null;
function getDatabase() {
    if (!db) {
        try {
            db = new DatabaseSync(DB_PATH, { readonly: true });
        } catch (error) {
            throw new Error(`Failed to open database: ${error.message}`);
        }
    }
    return db;
}

/**
 * Tips tool - Returns database overview and query best practices
 */
const tips = (context) => {
    return {
        name: 'tips',
        description: 'Returns an overview of the insights database including table relationships, common query patterns, and best practices. Use this tool first to understand the database structure before querying.',
        schema: {},
        handler: async (args) => {
            const tipsFilePath = path.join(__dirname, 'insights-schema-tips.md');

            if (!fs.existsSync(tipsFilePath)) {
                throw new Error('Tips documentation not found');
            }

            const markdown = fs.readFileSync(tipsFilePath, 'utf-8');
            return markdown;
        }
    };
};

/**
 * Schema tool - Returns markdown documentation for a specified table
 */
const schema = (context) => {
    return {
        name: 'schema',
        description: 'Returns the schema documentation for a specified database table. Use this tool to understand table structure, column definitions, and relationships before tables before writing queries.',
        schema: {
            table: z.enum(ALLOWED_TABLES).describe(`Table name. Must be one of: ${ALLOWED_TABLES.join(', ')}`)
        },
        handler: async (args) => {
            const { table } = args;

            // Construct the markdown file path
            const schemaFilePath = path.join(__dirname, `insights-schema-${table}.md`);

            // Check if file exists
            if (!fs.existsSync(schemaFilePath)) {
                throw new Error(`Schema documentation not found for table: ${table}`);
            }

            // Read and return the markdown content
            const markdown = fs.readFileSync(schemaFilePath, 'utf-8');

            return markdown;
        }
    };
};

/**
 * Query tool - Executes read-only SQL queries against the database
 */
const query = (context) => {
    return {
        name: 'query',
        description: 'Execute a read-only SQL query against the insights database. The database connection is read-only, so only SELECT statements will work. Use the schema(table) tool first to understand table structures and relationships. The database contains IPEDS higher education data including institutions, programs, degrees awarded, occupations, and program-occupation mappings.',
        schema: {
            sql: z.string().describe('The SQL SELECT query to execute. Must be a valid SQLite query. Use LIMIT clauses to control result size. The connection is read-only so INSERT, UPDATE, DELETE, etc. will fail.')
        },
        outputSchema: {
            rows: z.array(z.record(z.any())).describe('Array of result rows, where each row is an object with column names as keys'),
            rowCount: z.number().describe('The number of rows returned by the query')
        },
        handler: async (args) => {
            const { sql } = args;

            try {
                // Get database connection
                const database = getDatabase();

                // Prepare and execute the query
                const stmt = database.prepare(sql);
                const rows = stmt.all();

                return {
                    rows: rows,
                    rowCount: rows.length
                };

            } catch (error) {
                // Return full SQLite error message for debugging
                throw new Error(`SQL execution failed: ${error.message}`);
            }
        }
    };
};

module.exports = { tips, schema, query };
