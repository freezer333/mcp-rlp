const { z } = require('zod');

/**
 * Example tool: Echo back a message
 * Demonstrates how context can be used within tools
 */
const echo = (context) => {
    return {
        name: 'echo',
        description: 'Echoes back the provided message, optionally with context info.',
        schema: {
            message: z.string().describe('The message to echo'),
            includeContext: z.boolean().optional().describe('Include context info in response'),
        },
        outputSchema: {
            echo: z.string().describe('The echoed message'),
            context: z.any().optional().describe('Context information if requested'),
        },
        handler: async (args) => {
            const response = {
                echo: args.message
            };

            if (args.includeContext && context) {
                response.context = context;
            }

            return response;
        }
    };
};

module.exports = {
    echo
};
