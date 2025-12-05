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

        // Fallback: check text content for resource:// URI
        if (toolResult?.content) {
            const content = Array.isArray(toolResult.content) ? toolResult.content : [toolResult.content];
            for (const item of content) {
                if (item?.type === 'text' && item?.text?.includes('resource://')) {
                    if (this.#debug) {
                        console.log('[DualResponse] Detected via content text resource:// URI');
                    }
                    return true;
                }
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
        const structured = toolResult?.structuredContent;

        if (!structured?.resource?.url) {
            if (this.#debug) {
                console.log('[DualResponse] Parse failed: no resource.url in structuredContent');
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
     * Fetch a page of data from a resource endpoint
     *
     * @param {string} resourceUrl - The REST endpoint URL
     * @param {Object} options - Fetch options
     * @param {number} options.offset - Starting row offset (default: 0)
     * @param {number} options.limit - Max rows to fetch (default: 100)
     * @param {Object} options.sort - Optional sort: { field, order: 'asc'|'desc' }
     * @returns {Promise<Object>} Fetch result with data and pagination info
     */
    async fetch(resourceUrl, options = {}) {
        const { offset = 0, limit = 100, sort } = options;

        if (this.#debug) {
            console.log('[DualResponse] Fetching:', resourceUrl);
            console.log('[DualResponse] Options:', { offset, limit, sort });
        }

        const response = await fetch(resourceUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ offset, limit, sort })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(error.message || `Fetch failed with status ${response.status}`);
        }

        const result = await response.json();

        if (this.#debug) {
            console.log('[DualResponse] Fetched:', result.returned_count, 'rows');
            console.log('[DualResponse] Offset:', result.offset);
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
        let offset = 0;
        let hasNext = true;
        let totalCount = 0;

        if (this.#debug) {
            console.log('[DualResponse] ========================================');
            console.log('[DualResponse] Fetching all data from:', resourceUrl);
            console.log('[DualResponse] Batch size:', batchSize);
        }

        while (hasNext) {
            const result = await this.fetch(resourceUrl, {
                offset,
                limit: batchSize
            });

            allRows.push(...result.data);
            hasNext = result.has_next;
            totalCount = result.total_count;
            offset = result.next_offset || (offset + result.data.length);

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
