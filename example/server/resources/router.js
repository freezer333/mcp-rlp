const express = require('express');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'insights.sqlite');

// Shared database connection
let db = null;
function getDatabase() {
    if (!db) {
        db = new DatabaseSync(DB_PATH, { readonly: true });
    }
    return db;
}

/**
 * Create Express router for resource REST endpoints
 *
 * Provides out-of-band access to full query results for the dual-response pattern.
 *
 * @param {ResourceStore} resourceStore - The shared resource store
 * @param {Object} options - Configuration options
 * @param {boolean} options.debug - Enable debug logging
 * @returns {express.Router}
 */
function createResourceRouter(resourceStore, options = {}) {
    const router = express.Router();
    const debug = options.debug || false;

    /**
     * GET /resources/:guid
     * Returns data for the resource with optional pagination
     *
     * Query parameters:
     *   skip: number (default: 0) - rows to skip
     *   limit: number (optional) - max rows to return (omit for all)
     */
    router.get('/:guid', (req, res) => {
        const { guid } = req.params;
        const skip = parseInt(req.query.skip) || 0;
        const limit = req.query.limit ? parseInt(req.query.limit) : null;

        if (debug) {
            console.log('[REST] GET /resources/' + guid);
            console.log('[REST] Pagination:', { skip, limit });
        }

        const resource = resourceStore.get(guid);

        if (!resource) {
            if (debug) {
                console.log('[REST] Resource not found:', guid);
            }
            return res.status(404).json({
                error: 'not_found',
                message: 'Resource not found or expired'
            });
        }

        try {
            const database = getDatabase();

            // Build query with pagination
            let paginatedSql = resource.sql;
            if (limit !== null) {
                paginatedSql = `SELECT * FROM (${resource.sql}) LIMIT ${limit} OFFSET ${skip}`;
            } else if (skip > 0) {
                paginatedSql = `SELECT * FROM (${resource.sql}) LIMIT -1 OFFSET ${skip}`;
            }

            if (debug) {
                console.log('[REST] Executing SQL:', paginatedSql.substring(0, 150) + (paginatedSql.length > 150 ? '...' : ''));
            }

            const stmt = database.prepare(paginatedSql);
            const rows = stmt.all();

            if (debug) {
                console.log('[REST] Returned rows:', rows.length);
            }

            const hasNext = limit !== null && (skip + rows.length) < resource.totalCount;
            const hasPrev = skip > 0;

            res.json({
                data: rows,
                total_count: resource.totalCount,
                returned_count: rows.length,
                skip,
                limit,
                has_next: hasNext,
                has_prev: hasPrev
            });

        } catch (error) {
            if (debug) {
                console.error('[REST] Query error:', error.message);
            }
            res.status(500).json({
                error: 'query_failed',
                message: error.message
            });
        }
    });

    /**
     * POST /resources/:guid
     * Retrieves paginated data from the stored query
     *
     * Request body:
     * {
     *   offset: number (default: 0),
     *   limit: number (default: 100),
     *   sort?: { field: string, order: 'asc' | 'desc' }
     * }
     */
    router.post('/:guid', (req, res) => {
        const { guid } = req.params;
        const { offset = 0, limit = 100, sort } = req.body;

        if (debug) {
            console.log('[REST] POST /resources/' + guid);
            console.log('[REST] Pagination:', { offset, limit, sort });
        }

        const resource = resourceStore.get(guid);

        if (!resource) {
            if (debug) {
                console.log('[REST] Resource not found:', guid);
            }
            return res.status(404).json({
                error: 'not_found',
                message: 'Resource not found or expired'
            });
        }

        try {
            const database = getDatabase();

            // Build paginated query from stored SQL
            let paginatedSql = resource.sql;

            // Add ORDER BY if sort specified
            if (sort && sort.field) {
                const order = sort.order === 'desc' ? 'DESC' : 'ASC';
                // Wrap original query and add ordering
                paginatedSql = `SELECT * FROM (${resource.sql}) ORDER BY "${sort.field}" ${order}`;
            }

            // Add pagination
            paginatedSql = `${paginatedSql} LIMIT ${limit} OFFSET ${offset}`;

            if (debug) {
                console.log('[REST] Executing paginated SQL:', paginatedSql.substring(0, 150) + '...');
            }

            const stmt = database.prepare(paginatedSql);
            const rows = stmt.all();

            const hasNext = offset + rows.length < resource.totalCount;
            const nextOffset = hasNext ? offset + rows.length : null;

            if (debug) {
                console.log('[REST] Returned rows:', rows.length);
                console.log('[REST] Has next:', hasNext);
            }

            res.json({
                data: rows,
                total_count: resource.totalCount,
                returned_count: rows.length,
                offset,
                has_next: hasNext,
                next_offset: nextOffset
            });

        } catch (error) {
            if (debug) {
                console.error('[REST] Query error:', error.message);
            }
            res.status(500).json({
                error: 'query_failed',
                message: error.message
            });
        }
    });

    /**
     * DELETE /resources/:guid
     * Deletes a resource
     */
    router.delete('/:guid', (req, res) => {
        const { guid } = req.params;

        if (debug) {
            console.log('[REST] DELETE /resources/' + guid);
        }

        const deleted = resourceStore.delete(guid);

        if (!deleted) {
            return res.status(404).json({
                error: 'not_found',
                message: 'Resource not found'
            });
        }

        res.status(204).send();
    });

    // Debug endpoint - list all resources
    if (debug) {
        router.get('/', (req, res) => {
            console.log('[REST] GET /resources/ (debug listing)');
            res.json(resourceStore.stats());
        });
    }

    return router;
}

module.exports = { createResourceRouter };
