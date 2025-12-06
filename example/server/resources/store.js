const crypto = require('crypto');

/**
 * ResourceStore - In-memory storage for dual-response resources
 *
 * Maps GUIDs to query definitions, allowing the REST endpoint to
 * re-execute queries with pagination.
 *
 * NOTE: This is a simple in-memory implementation for demonstration.
 * In production, consider:
 * - Persistent storage (Redis, database)
 * - TTL-based expiration with cleanup intervals
 * - Resource pinning to prevent expiration
 * - Memory limits and LRU eviction
 */
class ResourceStore {
    #resources;
    #debug;

    constructor(options = {}) {
        this.#resources = new Map();
        this.#debug = options.debug || false;
    }

    /**
     * Create a new resource
     * @param {Object} queryDefinition - The query definition to store
     * @param {string} queryDefinition.sql - The SQL query (without LIMIT)
     * @param {number} queryDefinition.totalCount - Total row count
     * @returns {string} The generated GUID
     */
    create(queryDefinition) {
        const guid = crypto.randomUUID();

        const resource = {
            id: guid,
            sql: queryDefinition.sql,
            totalCount: queryDefinition.totalCount,
            createdAt: new Date().toISOString(),
            accessCount: 0,
            lastAccessedAt: null,
            // NOTE: In production, implement expiration:
            // expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
            expiresAt: null
        };

        this.#resources.set(guid, resource);

        if (this.#debug) {
            console.log('[ResourceStore] Created resource:', guid);
            console.log('[ResourceStore] SQL:', queryDefinition.sql.substring(0, 100) + '...');
            console.log('[ResourceStore] Total count:', queryDefinition.totalCount);
        }

        return guid;
    }

    /**
     * Get a resource by GUID
     * @param {string} guid - The resource GUID
     * @returns {Object|null} The resource or null if not found
     */
    get(guid) {
        const resource = this.#resources.get(guid);

        if (resource) {
            resource.accessCount++;
            resource.lastAccessedAt = new Date().toISOString();

            // NOTE: In production, check expiration here:
            // if (resource.expiresAt && new Date(resource.expiresAt) < new Date()) {
            //     this.delete(guid);
            //     return null;
            // }
        }

        if (this.#debug) {
            console.log('[ResourceStore] Get resource:', guid, resource ? 'found' : 'not found');
            if (resource) {
                console.log('[ResourceStore] Access count:', resource.accessCount);
            }
        }

        return resource || null;
    }

    /**
     * Delete a resource
     * @param {string} guid - The resource GUID
     * @returns {boolean} True if deleted, false if not found
     */
    delete(guid) {
        const existed = this.#resources.has(guid);
        this.#resources.delete(guid);

        if (this.#debug) {
            console.log('[ResourceStore] Delete resource:', guid, existed ? 'deleted' : 'not found');
        }

        return existed;
    }

    /**
     * List all resources (for debugging)
     * @returns {Array} Array of all resources
     */
    list() {
        return Array.from(this.#resources.values());
    }

    /**
     * Get store statistics
     * @returns {Object} Store stats
     */
    stats() {
        return {
            count: this.#resources.size,
            resources: this.list().map(r => ({
                id: r.id,
                totalCount: r.totalCount,
                accessCount: r.accessCount,
                createdAt: r.createdAt
            }))
        };
    }

    // NOTE: In production, add these methods:
    //
    // pin(guid) - Remove expiration from a resource
    // cleanup() - Remove expired resources (call on interval)
    // setExpiration(guid, ttlMs) - Update expiration time
}

module.exports = { ResourceStore };
