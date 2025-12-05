/**
 * DualResponseClient - Handles detection and fetching of dual-response resources
 *
 * The dual-response pattern separates LLM query validation from data retrieval:
 * - LLM receives sample data (10 rows) for query validation
 * - Client fetches full results via REST for display
 *
 * This dramatically reduces token usage while maintaining query quality.
 */

export class DualResponseClient {
    #debug;

    constructor(options = {}) {
        this.#debug = options.debug || false;
    }

    /**
     * Check if a tool result contains a dual-response
     *
     * Detection criteria:
     * - Has structuredContent with resource.url
     * - Or has content with resource:// URI
     * - Or is a parsed object with resource.url (from JSON text)
     * - Or is a string containing JSON with resource.url
     *
     * @param {Object} toolResult - The raw result from an MCP tool call
     * @returns {boolean}
     */
    isDualResponse(toolResult) {
        // Check structuredContent for resource URL (preferred)
        if (toolResult?.structuredContent?.resource?.url) {
            if (this.#debug) {
                console.log('[DualResponse] Detected via structuredContent.resource.url');
            }
            return true;
        }

        // Check if result itself has resource.url (direct object)
        if (toolResult?.resource?.url) {
            if (this.#debug) {
                console.log('[DualResponse] Detected via resource.url on result object');
            }
            return true;
        }

        // Check text content for resource:// URI or JSON with resource
        if (toolResult?.content) {
            const content = Array.isArray(toolResult.content) ? toolResult.content : [toolResult.content];
            for (const item of content) {
                if (item?.type === 'text') {
                    if (item?.text?.includes('resource://')) {
                        if (this.#debug) {
                            console.log('[DualResponse] Detected via content text resource:// URI');
                        }
                        return true;
                    }
                    // Try to parse as JSON
                    try {
                        const parsed = JSON.parse(item.text);
                        if (parsed?.resource?.url) {
                            if (this.#debug) {
                                console.log('[DualResponse] Detected via parsed JSON in content text');
                            }
                            return true;
                        }
                    } catch {
                        // Not JSON, continue
                    }
                }
            }
        }

        // Check if toolResult is a string containing JSON with resource
        if (typeof toolResult === 'string') {
            try {
                const parsed = JSON.parse(toolResult);
                if (parsed?.resource?.url) {
                    if (this.#debug) {
                        console.log('[DualResponse] Detected via parsed JSON string');
                    }
                    return true;
                }
            } catch {
                // Not JSON
            }
        }

        return false;
    }

    /**
     * Parse dual-response data from a tool result
     *
     * @param {Object} toolResult - The raw result from an MCP tool call
     * @returns {Object|null} Parsed dual-response data or null if not a dual-response
     */
    parse(toolResult) {
        // Try to extract the structured data from various formats
        let structured = null;

        // 1. Check structuredContent (MCP format)
        if (toolResult?.structuredContent?.resource?.url) {
            structured = toolResult.structuredContent;
        }
        // 2. Check if result itself has resource.url (direct object)
        else if (toolResult?.resource?.url) {
            structured = toolResult;
        }
        // 3. Check text content for JSON
        else if (toolResult?.content) {
            const content = Array.isArray(toolResult.content) ? toolResult.content : [toolResult.content];
            for (const item of content) {
                if (item?.type === 'text') {
                    try {
                        const parsed = JSON.parse(item.text);
                        if (parsed?.resource?.url) {
                            structured = parsed;
                            break;
                        }
                    } catch {
                        // Not JSON
                    }
                }
            }
        }
        // 4. Check if toolResult is a string
        else if (typeof toolResult === 'string') {
            try {
                const parsed = JSON.parse(toolResult);
                if (parsed?.resource?.url) {
                    structured = parsed;
                }
            } catch {
                // Not JSON
            }
        }

        if (!structured?.resource?.url) {
            if (this.#debug) {
                console.log('[DualResponse] Parse failed: no resource.url found');
            }
            return null;
        }

        const parsed = {
            // Sample data for display (what LLM saw)
            sample: structured.results || [],

            // Metadata
            totalCount: structured.metadata?.total_count || 0,
            sampleCount: structured.metadata?.sample_count || structured.results?.length || 0,

            // Resource access
            resourceUri: structured.resource.uri,
            resourceUrl: structured.resource.url,

            // Column information
            columns: structured.metadata?.columns || [],

            // Timestamps
            executedAt: structured.metadata?.executed_at,
            expiresAt: structured.metadata?.expires_at
        };

        if (this.#debug) {
            console.log('[DualResponse] ========================================');
            console.log('[DualResponse] Parsed dual-response:');
            console.log('[DualResponse] Total count:', parsed.totalCount);
            console.log('[DualResponse] Sample count:', parsed.sampleCount);
            console.log('[DualResponse] Resource URL:', parsed.resourceUrl);
            console.log('[DualResponse] Columns:', parsed.columns.map(c => c.name).join(', '));
            console.log('[DualResponse] ========================================');
        }

        return parsed;
    }

    /**
     * Fetch a page of data from a resource endpoint using GET with query params
     *
     * @param {string} resourceUrl - The REST endpoint URL
     * @param {Object} options - Fetch options
     * @param {number} options.skip - Rows to skip (default: 0)
     * @param {number} options.limit - Max rows to fetch (omit for all)
     * @returns {Promise<Object>} Fetch result with data and pagination info
     */
    async fetch(resourceUrl, options = {}) {
        const { skip = 0, limit } = options;

        // Build URL with query parameters
        const url = new URL(resourceUrl);
        if (skip > 0) {
            url.searchParams.set('skip', skip.toString());
        }
        if (limit !== undefined && limit !== null) {
            url.searchParams.set('limit', limit.toString());
        }

        if (this.#debug) {
            console.log('[DualResponse] Fetching:', url.toString());
            console.log('[DualResponse] Options:', { skip, limit });
        }

        const response = await fetch(url.toString());

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(error.message || `Fetch failed with status ${response.status}`);
        }

        const result = await response.json();

        if (this.#debug) {
            console.log('[DualResponse] Fetched:', result.returned_count, 'rows');
            console.log('[DualResponse] Skip:', result.skip);
            console.log('[DualResponse] Has next:', result.has_next);
        }

        return result;
    }

    /**
     * Fetch all data from a resource (handles pagination automatically)
     *
     * @param {string} resourceUrl - The REST endpoint URL
     * @param {Object} options - Fetch options
     * @param {number} options.batchSize - Rows per batch (default: 500)
     * @param {Function} options.onProgress - Progress callback: (fetched, total) => void
     * @returns {Promise<Array>} All rows from the resource
     */
    async fetchAll(resourceUrl, options = {}) {
        const { batchSize = 500, onProgress } = options;
        const allRows = [];
        let skip = 0;
        let hasNext = true;
        let totalCount = 0;

        if (this.#debug) {
            console.log('[DualResponse] ========================================');
            console.log('[DualResponse] Fetching all data from:', resourceUrl);
            console.log('[DualResponse] Batch size:', batchSize);
        }

        while (hasNext) {
            const result = await this.fetch(resourceUrl, {
                skip,
                limit: batchSize
            });

            allRows.push(...result.data);
            hasNext = result.has_next;
            totalCount = result.total_count;
            skip = skip + result.data.length;

            if (onProgress) {
                onProgress(allRows.length, totalCount);
            }

            if (this.#debug) {
                console.log(`[DualResponse] Progress: ${allRows.length}/${totalCount} rows`);
            }
        }

        if (this.#debug) {
            console.log('[DualResponse] Fetch complete:', allRows.length, 'total rows');
            console.log('[DualResponse] ========================================');
        }

        return allRows;
    }

    /**
     * Get resource metadata without fetching data
     *
     * @param {string} resourceUrl - The REST endpoint URL
     * @returns {Promise<Object>} Resource metadata
     */
    async getMetadata(resourceUrl) {
        if (this.#debug) {
            console.log('[DualResponse] Getting metadata:', resourceUrl);
        }

        const response = await fetch(resourceUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(error.message || `Metadata fetch failed with status ${response.status}`);
        }

        return response.json();
    }
}
