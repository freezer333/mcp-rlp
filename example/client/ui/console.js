/**
 * Console UI - Simple readline-based interface for debugging
 *
 * This provides the same interface as TerminalUI but uses
 * plain console output so you can see all debug messages.
 */

import * as readline from 'readline';
import Table from 'cli-table3';

export class ConsoleUI {
    #rl;
    #onSubmit;

    constructor() {
        this.#onSubmit = null;
    }

    init() {
        this.#rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.#rl.on('close', () => {
            process.exit(0);
        });

        this.#prompt();
    }

    #prompt() {
        this.#rl.question('\n> ', (input) => {
            if (input.trim() && this.#onSubmit) {
                this.#onSubmit(input.trim());
            } else {
                this.#prompt();
            }
        });
    }

    onSubmit(callback) {
        this.#onSubmit = async (input) => {
            await callback(input);
            this.#prompt();
        };
    }

    setStatus(text) {
        console.log(`[Status] ${text}`);
    }

    appendOutput(text) {
        // Strip blessed formatting tags
        const clean = text.replace(/\{[^}]+\}/g, '');
        console.log(clean);
    }

    appendTable(title, columns, rows) {
        if (title) {
            console.log(`\n${title}`);
        }

        const table = new Table({
            head: columns,
            style: {
                head: ['cyan'],
                border: ['grey']
            }
        });

        for (const row of rows) {
            const rowArray = Array.isArray(row)
                ? row.map(cell => String(cell ?? ''))
                : columns.map(col => String(row[col] ?? ''));
            table.push(rowArray);
        }

        console.log(table.toString());
    }

    appendUserMessage(text) {
        console.log(`\nYou: ${text}`);
    }

    appendAssistantMessage(text) {
        console.log(`\nAssistant: ${text}`);
    }

    appendToolCall(toolName, args) {
        const argsStr = Object.keys(args).length > 0
            ? ` with ${JSON.stringify(args)}`
            : '';
        console.log(`[Tool Call] ${toolName}${argsStr}`);
    }

    appendError(text) {
        console.error(`[Error] ${text}`);
    }

    clearOutput() {
        console.clear();
    }

    enableInput() {
        // No-op for console mode
    }

    disableInput() {
        // No-op for console mode
    }

    destroy() {
        this.#rl.close();
    }
}
