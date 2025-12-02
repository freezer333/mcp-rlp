const { z } = require('zod');

/**
 * Example tool: Get current datetime
 */
const datetime = (context) => {
    return {
        name: 'datetime',
        description: 'Returns the current date and time in ISO 8601 format.',
        schema: {},
        outputSchema: {
            date: z.string().describe('The current date and time in ISO 8601 format'),
        },
        handler: async (args) => {
            return {
                date: new Date().toISOString()
            };
        }
    };
};

/**
 * Example tool: Convert timestamp to ISO format
 */
const datetime_converter = (context) => {
    return {
        name: 'datetime-converter',
        description: 'Converts a UNIX timestamp (milliseconds) to ISO 8601 format.',
        schema: {
            timestamp: z.number().describe('The timestamp in UNIX milliseconds'),
        },
        outputSchema: {
            date: z.string().describe('The date in ISO 8601 format'),
        },
        handler: async (args) => {
            return {
                date: new Date(args.timestamp).toISOString()
            };
        }
    };
};

module.exports = {
    datetime,
    datetime_converter
};
