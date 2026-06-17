import chalk from 'chalk';
import path from 'path';
import { state, PHASES } from '../core/state.js';
import { sessionConfig, localConfig } from '../config/settings.js';

function stripAnsi(str) {
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

export function renderBox(title, content, colorHex = '#00FFAA') {
    const cols = process.stdout.columns || 80;
    const border = chalk.hex(colorHex);
    const borderChar = {
        topL: '╭', topR: '╮', botL: '╰', botR: '╯',
        horiz: '─', vert: '│'
    };
    
    const titleStr = title ? ` ${title} ` : '';
    const topBorder = borderChar.topL + titleStr + borderChar.horiz.repeat(Math.max(0, cols - 2 - titleStr.length)) + borderChar.topR;
    console.log(border(topBorder));
    
    const lines = content.split('\n');
    const MAX_LINES = 15;
    
    let displayLines = lines;
    let hiddenCount = 0;
    if (lines.length > MAX_LINES) {
        displayLines = lines.slice(0, MAX_LINES);
        hiddenCount = lines.length - MAX_LINES;
    }

    for (let line of displayLines) {
        const maxLen = cols - 4;
        while (line.length > maxLen) {
            const chunk = line.slice(0, maxLen);
            console.log(border(borderChar.vert) + ' ' + chunk.padEnd(maxLen) + ' ' + border(borderChar.vert));
            line = line.slice(maxLen);
        }
        console.log(border(borderChar.vert) + ' ' + line.padEnd(maxLen) + ' ' + border(borderChar.vert));
    }
    
    if (hiddenCount > 0) {
        const hiddenMsg = chalk.gray(`... et ${hiddenCount} autres lignes masquées (transmises à l'IA) ...`);
        console.log(border(borderChar.vert) + ' ' + hiddenMsg.padEnd(cols - 4 + stripAnsi(hiddenMsg).length - hiddenMsg.length) + ' ' + border(borderChar.vert));
    }
    
    const botBorder = borderChar.botL + borderChar.horiz.repeat(cols - 2) + borderChar.botR;
    console.log(border(botBorder));
}

export function renderDiffBox(title, search, replace) {
    const cols = process.stdout.columns || 80;
    const border = chalk.yellow;
    const borderChar = {
        topL: '╭', topR: '╮', botL: '╰', botR: '╯',
        horiz: '─', vert: '│'
    };
    
    const titleStr = ` Diff: ${title} `;
    const topBorder = borderChar.topL + titleStr + borderChar.horiz.repeat(Math.max(0, cols - 2 - titleStr.length)) + borderChar.topR;
    console.log(border(topBorder));
    
    const delLines = search.split('\n');
    for (const line of delLines) {
        const textLine = chalk.red(`- ${line}`);
        const cleanLen = stripAnsi(textLine).length;
        const padding = Math.max(0, cols - 4 - cleanLen);
        console.log(border(borderChar.vert) + ' ' + textLine + ' '.repeat(padding) + ' ' + border(borderChar.vert));
    }
    
    console.log(border(borderChar.vert) + ' ' + chalk.gray('─'.repeat(cols - 4)) + ' ' + border(borderChar.vert));
    
    const addLines = replace.split('\n');
    for (const line of addLines) {
        const textLine = chalk.green(`+ ${line}`);
        const cleanLen = stripAnsi(textLine).length;
        const padding = Math.max(0, cols - 4 - cleanLen);
        console.log(border(borderChar.vert) + ' ' + textLine + ' '.repeat(padding) + ' ' + border(borderChar.vert));
    }
    
    const botBorder = borderChar.botL + borderChar.horiz.repeat(cols - 2) + borderChar.botR;
    console.log(border(botBorder));
}

export function renderFooter() {
    if (!process.stdout.isTTY) return;
    const rows = process.stdout.rows;
    const cols = process.stdout.columns;
    
    process.stdout.write('\x1b[s'); // save cursor
    process.stdout.write(`\x1b[${rows};1H`); // move to bottom
    process.stdout.write('\x1b[2K'); // clear line
    
    const project = path.basename(process.cwd());
    const mode = localConfig.yolo ? 'YOLO' : 'Normal';
    const planMode = state.plannerMode ? ' | [PLAN]' : '';
    const subagentStr = state.activeSubagent ? ` | Agent: ${state.activeSubagent.name}` : '';
    
    const footerText = ` Cypher Coder | Modèle: ${sessionConfig.model} | Mode: ${mode}${planMode} | Projet: ${project}${subagentStr} | Phase: ${state.currentPhase} `;
    const padded = footerText.padEnd(cols - 2).slice(0, cols - 2);
    const formatted = chalk.bgHex('#00FFAA').black(padded);
    
    process.stdout.write(formatted);
    process.stdout.write('\x1b[u'); // restore cursor
}

export function setPhaseAndUpdate(phaseId, details = '') {
    state.currentPhase = phaseId;
    state.phaseDetails = details;
    renderFooter();
}

let spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIndex = 0;
let spinnerInterval = null;

export function startSpinner() {
    if (spinnerInterval) clearInterval(spinnerInterval);
    spinnerInterval = setInterval(() => {
        spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
        drawSpinnerLine();
    }, 80);
}

export function stopSpinner() {
    if (spinnerInterval) {
        clearInterval(spinnerInterval);
        spinnerInterval = null;
    }
    if (process.stdout.isTTY) {
        process.stdout.write('\r\x1b[K');
    }
}

function drawSpinnerLine() {
    if (!process.stdout.isTTY) return;
    const phase = PHASES[state.currentPhase] || PHASES.idle;
    const frame = spinnerFrames[spinnerIndex];
    process.stdout.write(`\r${chalk.hex(phase.color)(frame)} ${chalk.hex(phase.color)(phase.label)} ${state.phaseDetails}...`);
}
