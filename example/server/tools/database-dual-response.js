const path = require('path');
const { z } = require('zod');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'insights.sqlite');
const DEFAULT_SAMPLE_SIZE = 10;

// Shared database connection
let db = null;
function getDatabase() {
    if (!db) {
        db = new DatabaseSync(DB_PATH, { readonly: true });
    }
    return db;
}

/**
 * Dual-Response Query Tool
 *
 * Implements the dual-response pattern for MCP:
 * - Returns a SAMPLE of results to the LLM (for validation)
 * - Stores the full query for out-of-band REST retrieval
 * - Returns a resource link for the client to fetch complete results
 *
 * This separates the LLM's query generation/validation from the
 * application's data rendering, dramatically reducing token usage.
 */
const queryDualResponse = (context) => {
    // Get shared resourceStore from context (injected by server)
    const resourceStore = context.resourceStore;
    const debug = context.debug || false;
    const baseUrl = context.baseUrl || 'http://localhost:3000';

    if (!resourceStore) {
        throw new Error('resourceStore not provided in context');
    }

    return {
        name: 'query',
        description: `Execute a read-only SQL query against the insights database. Returns a SAMPLE of results (up to ${DEFAULT_SAMPLE_SIZE} rows) along with total count and a resource link for retrieving the full dataset. The database contains IPEDS higher education data including institutions, programs, degrees awarded, occupations, and program-occupation mappings. Use the schema(table) tool first to understand table structures.

IMPORTANT: Institution and program names are stored in UPPERCASE. When searching by name, always use case-insensitive matching:
- Use LIKE with UPPER(): WHERE UPPER(name) LIKE UPPER('%ramapo%')
- Or use LIKE with uppercase pattern: WHERE name LIKE '%RAMAPO%'
- Never use exact = comparisons for names unless you're certain of the exact case.`,

        schema: {
            sql: z.string().describe('The SQL SELECT query to execute. Must be a valid SQLite query. Do NOT include LIMIT clause - sampling is handled automatically. Use LIKE with UPPER() for case-insensitive name searches.')
        },

        // Output schema matches the dual-response spec
        outputSchema: {
            results: z.array(z.record(z.any())).describe('Sample rows from the query (for LLM validation)'),
            resource: z.object({
                uri: z.string().describe('Resource URI (resource://guid format)'),
                url: z.string().describe('HTTP URL for REST endpoint'),
                name: z.string(),
                mimeType: z.string()
            }).describe('Resource link for fetching full results'),
            metadata: z.object({
                total_count: z.number().describe('Total number of matching rows'),
                sample_count: z.number().describe('Number of rows in sample'),
                executed_at: z.string()
            }).describe('Query execution metadata')
        },

        handler: async (args) => {
            const { sql } = args;
            const sampleSize = DEFAULT_SAMPLE_SIZE;

            if (debug) {
                console.log('[query-dual-response] ========================================');
                console.log('[query-dual-response] Executing query');
                console.log('[query-dual-response] SQL:', sql);
                console.log('[query-dual-response] Sample size:', sampleSize);
            }

            try {
                const database = getDatabase();

                // Step 1: Get total count
                const countSql = `SELECT COUNT(*) as count FROM (${sql})`;
                if (debug) {
                    console.log('[query-dual-response] Count SQL:', countSql);
                }

                const countStmt = database.prepare(countSql);
                const countResult = countStmt.all();
                const totalCount = countResult[0].count;

                if (debug) {
                    console.log('[query-dual-response] Total count:', totalCount);
                }

                // Step 2: Get sample rows
                const sampleSql = `${sql} LIMIT ${sampleSize}`;
                if (debug) {
                    console.log('[query-dual-response] Sample SQL:', sampleSql);
                }

                const sampleStmt = database.prepare(sampleSql);
                const sampleRows = sampleStmt.all();

                if (debug) {
                    console.log('[query-dual-response] Sample rows returned:', sampleRows.length);
                }

                // Step 3: Store resource for REST retrieval
                const guid = resourceStore.create({
                    sql: sql,  // Store WITHOUT LIMIT for pagination
                    totalCount
                });

                const resourceUri = `resource://${guid}`;
                const resourceUrl = `${baseUrl}/resources/${guid}`;

                if (debug) {
                    console.log('[query-dual-response] Created resource:', guid);
                    console.log('[query-dual-response] Resource URL:', resourceUrl);
                    console.log('[query-dual-response] ========================================');
                }

                // Step 4: Return dual-response structure
                return {
                    results: sampleRows,
                    resource: {
                        uri: resourceUri,
                        url: resourceUrl,
                        name: 'Query Results',
                        mimeType: 'application/json'
                    },
                    metadata: {
                        total_count: totalCount,
                        sample_count: sampleRows.length,
                        executed_at: new Date().toISOString()
                    }
                };

            } catch (error) {
                if (debug) {
                    console.error('[query-dual-response] Error:', error.message);
                }
                throw new Error(`SQL execution failed: ${error.message}`);
            }
        }
    };
};

module.exports = { queryDualResponse };
