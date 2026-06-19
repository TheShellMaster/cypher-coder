import chalk from 'chalk';
import { SLASH_COMMANDS } from '../commands/registry.js';
import { renderFooter, renderBox } from './render.js';
import { state } from '../core/state.js';
import { localConfig } from '../config/settings.js';

function stripAnsi(str) {
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

export function promptUser(promptMsg) {
    return new Promise((resolve) => {
        let input = '';
        let cursor = 0;
        let autoActive = false;
        let autoSelectIndex = 0;
        let filtered = [];
        
        process.stdin.removeAllListeners('keypress');
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
            process.stdin.resume();
        }
        
        function render() {
            if (!process.stdout.isTTY) {
                process.stdout.write(promptMsg);
                return;
            }
            
            process.stdout.write('\r\x1b[J');
            process.stdout.write(promptMsg + input);
            
            const cols = process.stdout.columns || 80;
            
            if (autoActive && filtered.length > 0) {
                process.stdout.write('\n');
                const boxWidth = Math.min(70, cols - 4);
                process.stdout.write(chalk.gray('  ╭' + '─'.repeat(boxWidth - 2) + '╮\n'));
                
                const MAX_ITEMS = 5;
                const startIndex = Math.max(0, Math.min(autoSelectIndex - 2, filtered.length - MAX_ITEMS));
                const visibleFiltered = filtered.slice(startIndex, startIndex + MAX_ITEMS);
                
                visibleFiltered.forEach((item, relativeIdx) => {
                    const idx = startIndex + relativeIdx;
                    let desc = item.desc || '';
                    const maxDescLen = Math.max(10, boxWidth - 4 - 15 - 3 - 2); 
                    if (desc.length > maxDescLen) {
                        desc = desc.slice(0, maxDescLen - 3) + '...';
                    }
                    
                    let line = `  │ `;
                    if (idx === autoSelectIndex) {
                        line += chalk.hex('#00FFAA')(`> ${item.cmd.padEnd(15)} - ${desc}`);
                    } else {
                        line += chalk.gray(`  ${item.cmd.padEnd(15)} - ${desc}`);
                    }
                    const plainText = `  │   ${item.cmd.padEnd(15)} - ${desc}`;
                    const padding = Math.max(0, boxWidth - plainText.length - 1);
                    process.stdout.write(line + ' '.repeat(padding) + chalk.gray('│\n'));
                });
                
                process.stdout.write(chalk.gray('  ╰' + '─'.repeat(boxWidth - 2) + '╯'));
                
                const linesToMoveUp = 2 + visibleFiltered.length;
                process.stdout.write(`\x1b[${linesToMoveUp}A`);
            }
            
            const promptLen = stripAnsi(promptMsg).length;
            process.stdout.write(`\x1b[${promptLen + cursor + 1}G`);
            
            renderFooter();
        }
        
        render();
        
        process.stdin.on('keypress', (str, key) => {
            const isCtrlC = key && key.ctrl && key.name === 'c';
            if (isCtrlC) {
                if (input.length > 0) {
                    input = '';
                    cursor = 0;
                    autoActive = false;
                    render();
                    return;
                }
                process.stdout.write('\n');
                process.exit(0);
            }
            
            if (key && key.ctrl && key.name === 'o') {
                process.stdout.write('\n\x1b[J');
                if (state.contextFiles.size === 0) {
                    renderBox('Contexte', 'Aucun fichier dans le contexte.', '#FFD700');
                } else {
                    renderBox('Contexte (Ctrl+O)', Array.from(state.contextFiles).join('\n'), '#00FFAA');
                }
                render();
                return;
            }

            if (key && key.ctrl && key.name === 'y') {
                localConfig.yolo = !localConfig.yolo;
                process.stdout.write('\n\x1b[J');
                renderBox('YOLO Mode', localConfig.yolo ? 'Activé' : 'Désactivé', '#FFD700');
                render();
                return;
            }

            if ((key && key.shift && key.name === 'tab') || str === '\x1b[Z') {
                state.plannerMode = !state.plannerMode;
                process.stdout.write('\n\x1b[J');
                renderBox('Mode Planificateur', state.plannerMode ? 'Activé (Auto Editor / Multi-étapes)' : 'Désactivé (Normal)', '#00FFFF');
                render();
                return;
            }
            
            const isEnter = (key && (key.name === 'return' || key.name === 'enter')) || str === '\r' || str === '\n';
            if (isEnter) {
                if (autoActive && filtered.length > 0) {
                    input = filtered[autoSelectIndex].cmd + ' ';
                    cursor = input.length;
                    autoActive = false;
                    render();
                } else {
                    const promptLen = stripAnsi(promptMsg).length;
                    process.stdout.write(`\x1b[${promptLen + input.length + 1}G`);
                    process.stdout.write('\x1b[J\n');
                    if (process.stdin.isTTY) process.stdin.pause();
                    resolve(input);
                }
                return;
            }
            
            const keyName = key ? key.name : '';
            
            if (keyName === 'escape') {
                autoActive = false;
                render();
                return;
            }
            
            if (keyName === 'tab') {
                if (autoActive && filtered.length > 0) {
                    input = filtered[autoSelectIndex].cmd + ' ';
                    cursor = input.length;
                    autoActive = false;
                    render();
                } else if (input.startsWith('/')) {
                    autoActive = true;
                    autoSelectIndex = 0;
                    filtered = SLASH_COMMANDS.filter(c => c.cmd.startsWith(input));
                    render();
                }
                return;
            }
            
            if (keyName === 'backspace') {
                if (cursor > 0) {
                    input = input.slice(0, cursor - 1) + input.slice(cursor);
                    cursor--;
                    
                    if (input.startsWith('/')) {
                        autoActive = true;
                        filtered = SLASH_COMMANDS.filter(c => c.cmd.startsWith(input));
                        autoSelectIndex = Math.min(autoSelectIndex, Math.max(0, filtered.length - 1));
                    } else {
                        autoActive = false;
                    }
                }
                render();
                return;
            }
            
            if (keyName === 'left') {
                if (cursor > 0) cursor--;
                render();
                return;
            }
            
            if (keyName === 'right') {
                if (cursor < input.length) cursor++;
                render();
                return;
            }
            
            if (keyName === 'up') {
                if (autoActive && filtered.length > 0) {
                    autoSelectIndex = (autoSelectIndex - 1 + filtered.length) % filtered.length;
                } else {
                    if (state.commandHistory.length > 0) {
                        if (state.historyIndex === -1) state.historyIndex = state.commandHistory.length;
                        if (state.historyIndex > 0) {
                            state.historyIndex--;
                            input = state.commandHistory[state.historyIndex];
                            cursor = input.length;
                        }
                    }
                }
                render();
                return;
            }
            
            if (keyName === 'down') {
                if (autoActive && filtered.length > 0) {
                    autoSelectIndex = (autoSelectIndex + 1) % filtered.length;
                } else {
                    if (state.historyIndex !== -1) {
                        if (state.historyIndex < state.commandHistory.length - 1) {
                            state.historyIndex++;
                            input = state.commandHistory[state.historyIndex];
                            cursor = input.length;
                        } else {
                            state.historyIndex = -1;
                            input = '';
                            cursor = 0;
                        }
                    }
                }
                render();
                return;
            }
            
            if (str && str.length === 1) {
                input = input.slice(0, cursor) + str + input.slice(cursor);
                cursor++;
                
                if (input.startsWith('/')) {
                    autoActive = true;
                    const cleanCmd = input.split(' ')[0];
                    filtered = SLASH_COMMANDS.filter(c => c.cmd.startsWith(cleanCmd));
                    autoSelectIndex = Math.min(autoSelectIndex, Math.max(0, filtered.length - 1));
                } else {
                    autoActive = false;
                }
            }
            
            render();
        });
    });
}
