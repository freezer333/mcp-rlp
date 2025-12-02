const { z } = require('zod');

/**
 * Example tool: Add two numbers
 */
const add = (context) => {
    return {
        name: 'add',
        description: 'Adds two numbers together.',
        schema: {
            a: z.number().describe('First number'),
            b: z.number().describe('Second number'),
        },
        outputSchema: {
            result: z.number().describe('Sum of a and b'),
        },
        handler: async (args) => {
            return {
                result: args.a + args.b
            };
        }
    };
};

/**
 * Example tool: Multiply two numbers
 */
const multiply = (context) => {
    return {
        name: 'multiply',
        description: 'Multiplies two numbers.',
        schema: {
            a: z.number().describe('First number'),
            b: z.number().describe('Second number'),
        },
        outputSchema: {
            result: z.number().describe('Product of a and b'),
        },
        handler: async (args) => {
            return {
                result: args.a * args.b
            };
        }
    };
};

module.exports = {
    add,
    multiply
};
