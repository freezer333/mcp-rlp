/**
 * Terminal UI - Text-based interface using blessed
 *
 * This module handles all UI rendering and user input.
 * It is independent of MCP and LLM code.
 */

import blessed from 'blessed';
import Table from 'cli-table3';

export class TerminalUI {
    #screen;
    #outputBox;
    #inputBox;
    #statusBar;
    #onSubmit;

    constructor() {
        this.#onSubmit = null;
    }

    /**
     * Initialize the terminal UI
     */
    init() {
        this.#screen = blessed.screen({
            smartCSR: true,
            title: 'MCP Client Demo'
        });

        // Output area (scrollable)
        this.#outputBox = blessed.box({
            top: 0,
            left: 0,
            width: '100%',
            height: '100%-4',
            scrollable: true,
            alwaysScroll: true,
            scrollbar: {
                ch: ' ',
                bg: 'blue'
            },
            keys: true,
            vi: true,
            mouse: true,
            tags: true,
            border: {
                type: 'line'
            },
            style: {
                border: {
                    fg: 'blue'
                }
            }
        });

        // Status bar
        this.#statusBar = blessed.box({
            bottom: 3,
            left: 0,
            width: '100%',
            height: 1,
            tags: true,
            style: {
                bg: 'blue',
                fg: 'white'
            }
        });
        this.setStatus('Initializing...');

        // Input area
        this.#inputBox = blessed.textbox({
            bottom: 0,
            left: 0,
            width: '100%',
            height: 3,
            keys: true,
            mouse: true,
            inputOnFocus: true,
            border: {
                type: 'line'
            },
            style: {
                border: {
                    fg: 'green'
                },
                focus: {
                    border: {
                        fg: 'yellow'
                    }
                }
            }
        });

        this.#screen.append(this.#outputBox);
        this.#screen.append(this.#statusBar);
        this.#screen.append(this.#inputBox);

        // Handle input submission
        this.#inputBox.on('submit', (value) => {
            if (value.trim() && this.#onSubmit) {
                this.#onSubmit(value.trim());
            }
            this.#inputBox.clearValue();
            this.#inputBox.focus();
            this.#screen.render();
        });

        // Escape to quit
        this.#screen.key(['escape', 'C-c'], () => {
            process.exit(0);
        });

        // Tab to switch focus
        this.#screen.key(['tab'], () => {
            if (this.#screen.focused === this.#inputBox) {
                this.#outputBox.focus();
            } else {
                this.#inputBox.focus();
            }
            this.#screen.render();
        });

        this.#inputBox.focus();
        this.#screen.render();
    }

    /**
     * Set callback for when user submits input
     */
    onSubmit(callback) {
        this.#onSubmit = callback;
    }

    /**
     * Set status bar text
     */
    setStatus(text) {
        this.#statusBar.setContent(` ${text} | Tab: switch focus | Esc: quit`);
        this.#screen.render();
    }

    /**
     * Append text to output area
     */
    appendOutput(text) {
        const current = this.#outputBox.getContent();
        this.#outputBox.setContent(current + text + '\n');
        this.#outputBox.setScrollPerc(100);
        this.#screen.render();
    }

    /**
     * Append a formatted table to output
     */
    appendTable(title, columns, rows) {
        if (title) {
            this.appendOutput(`\n{bold}${title}{/bold}`);
        }

        const table = new Table({
            head: columns,
            style: {
                head: ['cyan'],
                border: ['grey']
            },
            wordWrap: true,
            wrapOnWordBoundary: false
        });

        for (const row of rows) {
            // Ensure row is an array
            const rowArray = Array.isArray(row)
                ? row.map(cell => String(cell ?? ''))
                : columns.map(col => String(row[col] ?? ''));
            table.push(rowArray);
        }

        this.appendOutput(table.toString());
    }

    /**
     * Append user message
     */
    appendUserMessage(text) {
        this.appendOutput(`\n{green-fg}{bold}You:{/bold}{/green-fg} ${text}`);
    }

    /**
     * Append assistant message
     */
    appendAssistantMessage(text) {
        this.appendOutput(`\n{blue-fg}{bold}Assistant:{/bold}{/blue-fg} ${text}`);
    }

    /**
     * Append tool call info
     */
    appendToolCall(toolName, args) {
        const argsStr = Object.keys(args).length > 0
            ? ` with ${JSON.stringify(args)}`
            : '';
        this.appendOutput(`{yellow-fg}[Calling tool: ${toolName}${argsStr}]{/yellow-fg}`);
    }

    /**
     * Append error message
     */
    appendError(text) {
        this.appendOutput(`{red-fg}{bold}Error:{/bold} ${text}{/red-fg}`);
    }

    /**
     * Clear output
     */
    clearOutput() {
        this.#outputBox.setContent('');
        this.#screen.render();
    }

    /**
     * Enable input
     */
    enableInput() {
        this.#inputBox.focus();
        this.#screen.render();
    }

    /**
     * Disable input (while processing)
     */
    disableInput() {
        // blessed doesn't have a direct disable, we just don't focus
        this.#screen.render();
    }

    /**
     * Destroy the UI
     */
    destroy() {
        this.#screen.destroy();
    }
}
