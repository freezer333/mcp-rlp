/**
 * Toolbox - A container for MCP tools
 *
 * Tools are factory functions that accept a context and return a tool definition.
 * This allows tools to be context-aware (e.g., for multi-tenant scenarios).
 */
class Toolbox {
    #tools;

    constructor(tools) {
        if (Array.isArray(tools)) {
            this.#tools = tools;
        } else if (tools) {
            this.#tools = [tools];
        } else {
            this.#tools = [];
        }
    }

    /**
     * Load all tools with the given context
     * @param {Object} context - Context object passed to each tool factory
     * @returns {Array} Array of instantiated tools
     */
    async load(context) {
        return this.#tools.map((toolFactory) => toolFactory(context));
    }
}

module.exports = { Toolbox };
