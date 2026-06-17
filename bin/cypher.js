#!/usr/bin/env node

import chalk from 'chalk';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import { loadConfig, localConfig, BANNER_COLOR, VERSION, AUTHOR } from '../src/config/settings.js';
import { setupTerminal, performGracefulShutdown } from '../src/ui/terminal.js';
import { detectHfUsername } from '../src/core/llm.js';
import { loadCustomCommands } from '../src/commands/registry.js';
import { handleSlashCommand } from '../src/commands/builtins.js';
import { runAgentTurn } from '../src/core/agent.js';
import { promptUser } from '../src/ui/prompt.js';
import { state } from '../src/core/state.js';
import { loadSkillsForQuery } from '../src/core/skills.js';

marked.setOptions({
    renderer: new TerminalRenderer({
        code: chalk.yellow,
        blockquote: chalk.cyan,
        html: chalk.cyan,
        heading: chalk.bold.green,
        firstHeading: chalk.bold.green,
        listitem: chalk.cyan,
        table: chalk.cyan,
        strong: chalk.bold.cyan,
        em: chalk.italic.cyan,
        link: chalk.blue,
        href: chalk.blue,
        unstyled: chalk.white,
        tab: 2
    })
});

const BANNER = chalk.hex(BANNER_COLOR)(`
    ╭───────────────────────────────────────────────╮
    │    _____             _                        │
    │   / ____|           | |                       │
    │  | |    _   _ _ __  | |__   ___ _ __          │
    │  | |   | | | | '_ \\ | '_ \\ / _ \\ '__|         │
    │  | |___| |_| | |_) || | | |  __/ |            │
    │   \\_____\\__, | .__/ |_| |_|\\___|_|            │
    │          __/ | |                              │
    │         |___/|_|                              │
    │                                               │
    │  Cypher Coder CLI v${VERSION.padEnd(5)} - par ${AUTHOR.padEnd(15)} │
    ╰───────────────────────────────────────────────╯
`);

function getSystemPrompt() {
    let ctx = '';
    if (state.contextFiles.size > 0) {
        ctx = "\n<context_files>\n" + Array.from(state.contextFiles).join('\n') + "\n</context_files>\n" +
              "Attention: Tu ne vois que le nom des fichiers ci-dessus. Utilise read_file pour lire leur contenu exact.";
    }

    let planCtx = '';
    if (state.plannerMode) {
        planCtx = "\n[MODE PLANIFICATEUR ACTIF]\nTu dois impérativement agir en mode multi-étapes :\n1. Analyser la situation.\n2. Établir un plan explicite.\n3. Utiliser les outils pas-à-pas.\n4. Attendre confirmation si nécessaire.";
    }

    return `Tu es Cypher Coder, un agent IA puissant spécialisé en ingénierie logicielle fonctionnant dans le terminal de l'utilisateur.
Tu as accès aux outils suivants pour accomplir tes tâches : read_file, write_file, patch_file, list_dir, find_files, grep_search, run_command.
Si l'utilisateur demande une action, N'ATTENDS PAS de permission pour utiliser run_command ou lire des fichiers, fais-le directement (le système local gérera les autorisations YOLO).
Tu dois répondre en Markdown. Utilise les blocs de code.${planCtx}
${ctx}`;
}

async function main() {
    setupTerminal();
    
    process.on('SIGINT', async () => {
        await performGracefulShutdown(0);
    });
    process.on('SIGTERM', async () => {
        await performGracefulShutdown(0);
    });
    process.on('exit', () => {
        // The restoreTerminal inside graceful shutdown will handle it
    });

    console.clear();
    console.log(BANNER);
    
    loadConfig();
    await detectHfUsername();
    loadCustomCommands();
    
    while (true) {
        const input = await promptUser(chalk.hex(BANNER_COLOR)('❯ '));
        const textInput = input.trim();
        if (!textInput) continue;
        
        state.commandHistory.push(textInput);
        state.historyIndex = -1;
        
        if (textInput.startsWith('/')) {
            await handleSlashCommand(textInput);
        } else if (textInput.startsWith('!')) {
            await handleSlashCommand('/yolo ' + textInput); // Map to yolo temporarily or pass direct
            // Note: simple implementation just pushes to chat
            const cmd = textInput.slice(1).trim();
            state.chatMessages.push({ role: "user", content: `Exécute cette commande bash :\n\`\`\`bash\n${cmd}\n\`\`\`` });
            await runAgentTurn();
        } else if (textInput.startsWith('@')) {
            const file = textInput.slice(1).trim();
            await handleSlashCommand(`/add ${file}`);
        } else {
            if (state.chatMessages.length === 0) {
                state.chatMessages.push({ role: "system", content: getSystemPrompt() });
            }
            state.chatMessages.push({ role: "user", content: textInput });
            loadSkillsForQuery(textInput);
            await runAgentTurn();
        }
    }
}

main().catch(console.error);
