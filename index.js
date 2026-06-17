#!/usr/bin/env node

import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { execSync, spawn, exec } from 'child_process';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import { 
    intro, 
    outro, 
    select, 
    confirm, 
    text,
    note,
    isCancel
} from '@clack/prompts';

// Setup Markdown rendering in the terminal
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

const AUTHOR = "DJAKOUA KWANKAM";
const APP_NAME = "Cypher Coder";
const VERSION = "2.0.0";
const BANNER_COLOR = '#00FFAA';

let chatMessages = [];
let commandHistory = [];
let historyIndex = -1;
let sessionId = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

// Initial config
let sessionConfig = {
    model: "Qwen/Qwen2.5-72B-Instruct",
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 2048,
};

let localConfig = {
    token: '',
    defaultModel: 'Qwen/Qwen2.5-72B-Instruct',
    yolo: false,
    permissions: {
        read: true,
        write: false,
        execute: false
    }
};

const CONFIG_DIR = path.join(os.homedir(), '.cypher');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// ─── TERMINAL SCROLL MARGINS MANAGEMENT ─────────────────────────────────────
function setupTerminal() {
    if (!process.stdout.isTTY) return;
    const rows = process.stdout.rows;
    // Set scroll margins: 1 to rows - 1
    process.stdout.write(`\x1b[1;${rows - 1}r`);
}

function restoreTerminal() {
    if (!process.stdout.isTTY) return;
    // Reset scroll margins
    process.stdout.write('\x1b[r');
    // Clear bottom line
    const rows = process.stdout.rows;
    process.stdout.write(`\x1b[${rows};1H\x1b[2K`);
    // Put cursor back to a clean position
    process.stdout.write('\r\n');
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────
function stripAnsi(str) {
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

function loadConfig() {
    try {
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }
        if (fs.existsSync(CONFIG_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            localConfig = { ...localConfig, ...parsed };
            if (localConfig.defaultModel) {
                sessionConfig.model = localConfig.defaultModel;
            }
        }
    } catch (e) {
        // Ignored
    }
}

function saveConfig() {
    try {
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(localConfig, null, 2), 'utf8');
    } catch (e) {
        // Ignored
    }
}

// ─── DYNAMIC ENV DETECTION ───────────────────────────────────────────────────
let localEnv = {
    os: `${os.type()} (${os.arch()})`,
    shell: process.env.SHELL || process.env.COMSPEC || 'unknown',
    tools: {}
};

function detectEnvironment() {
    const checkList = ['git', 'docker', 'python3', 'node', 'npm', 'gcc'];
    for (const tool of checkList) {
        try {
            const cmd = os.platform() === 'win32' ? `where ${tool}` : `which ${tool}`;
            execSync(cmd, { stdio: 'ignore' });
            // Get version
            let version = 'installed';
            try {
                version = execSync(`${tool} --version`, { stdio: 'pipe' }).toString().trim().split('\n')[0];
            } catch (_) {
                try {
                    version = execSync(`${tool} -v`, { stdio: 'pipe' }).toString().trim().split('\n')[0];
                } catch (_) {}
            }
            localEnv.tools[tool] = version;
        } catch (_) {
            localEnv.tools[tool] = null;
        }
    }
}

// ─── COMMANDS SLASH SYSTEM ───────────────────────────────────────────────────
const SLASH_COMMANDS = [
    { cmd: '/help',              desc: 'Afficher toutes les commandes disponibles' },
    { cmd: '/exit',              desc: 'Quitter Cypher Coder' },
    { cmd: '/clear',             desc: 'Vider l\'écran du terminal et réafficher la bannière' },
    { cmd: '/reset',             desc: 'Réinitialiser la session de chat et le contexte' },
    { cmd: '/status',            desc: 'Afficher le diagnostic complet du système local' },
    { cmd: '/model',             desc: 'Sélectionner le modèle d\'IA actif' },
    { cmd: '/permissions',       desc: 'Configurer les autorisations de lecture/écriture/shell' },
    { cmd: '/yolo',              desc: 'Activer ou désactiver le mode exécution sans confirmation' },
    { cmd: '/resume',            desc: 'Reprendre une session de chat archivée depuis Hugging Face' },
    { cmd: '/usage',             desc: 'Afficher la consommation et l\'historique des jetons' },
    { cmd: '/rename',            desc: 'Renommer la session courante' },
    { cmd: '/agents',            desc: 'Gérer les sous-agents (list, create, enable, disable)' }
];

const customCommands = [];

function loadCustomCommands() {
    customCommands.length = 0;
    const pathsToScan = [
        path.join(os.homedir(), '.cypher', 'commands'),
        path.join(process.cwd(), '.cypher', 'commands')
    ];
    for (const p of pathsToScan) {
        try {
            if (fs.existsSync(p)) {
                const files = fs.readdirSync(p);
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const content = JSON.parse(fs.readFileSync(path.join(p, file), 'utf8'));
                        if (content.cmd && content.prompt) {
                            customCommands.push({
                                cmd: content.cmd.toLowerCase(),
                                desc: content.desc || `Commande personnalisée (${file})`,
                                promptTemplate: content.prompt
                            });
                        }
                    }
                }
            }
        } catch (_) {}
    }
}

// ─── SUBAGENTS SYSTEM ────────────────────────────────────────────────────────
let activeSubagent = null;

function loadSubagents() {
    const list = [];
    const pathsToScan = [
        path.join(os.homedir(), '.cypher', 'agents'),
        path.join(process.cwd(), '.cypher', 'agents')
    ];
    for (const p of pathsToScan) {
        try {
            if (fs.existsSync(p)) {
                const files = fs.readdirSync(p);
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const content = JSON.parse(fs.readFileSync(path.join(p, file), 'utf8'));
                        if (content.name && content.role) {
                            list.push(content);
                        }
                    }
                }
            }
        } catch (_) {}
    }
    return list;
}

// ─── VISUAL RENDERERS (BOXES & DIFFS) ─────────────────────────────────────────
function renderBox(title, content, colorHex = '#00FFAA') {
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
    for (let line of lines) {
        const maxLen = cols - 4;
        while (line.length > maxLen) {
            const chunk = line.slice(0, maxLen);
            console.log(border(borderChar.vert) + ' ' + chunk.padEnd(maxLen) + ' ' + border(borderChar.vert));
            line = line.slice(maxLen);
        }
        console.log(border(borderChar.vert) + ' ' + line.padEnd(maxLen) + ' ' + border(borderChar.vert));
    }
    
    const botBorder = borderChar.botL + borderChar.horiz.repeat(cols - 2) + borderChar.botR;
    console.log(border(botBorder));
}

function renderDiffBox(title, search, replace) {
    const cols = process.stdout.columns || 80;
    const border = chalk.yellow;
    const borderChar = {
        topL: '╭', topR: '╮', botL: '╰', botR: '╯',
        horiz: '─', vert: '│'
    };
    
    const titleStr = ` Diff: ${title} `;
    const topBorder = borderChar.topL + titleStr + borderChar.horiz.repeat(Math.max(0, cols - 2 - titleStr.length)) + borderChar.topR;
    console.log(border(topBorder));
    
    // Draw deletions (red)
    const delLines = search.split('\n');
    for (const line of delLines) {
        const textLine = chalk.red(`- ${line}`);
        const cleanLen = stripAnsi(textLine).length;
        const padding = Math.max(0, cols - 4 - cleanLen);
        console.log(border(borderChar.vert) + ' ' + textLine + ' '.repeat(padding) + ' ' + border(borderChar.vert));
    }
    
    // Separator line
    console.log(border(borderChar.vert) + ' ' + chalk.gray('─'.repeat(cols - 4)) + ' ' + border(borderChar.vert));
    
    // Draw additions (green)
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

// ─── STATE PHASES & DYNAMIC SPINNER ──────────────────────────────────────────
const PHASES = {
    idle: { label: '[idle]', color: '#888888' },
    thinking: { label: '[thinking]', color: '#00FFFF' },
    searching: { label: '[searching]', color: '#569CD6' },
    code_investigator: { label: '[code_investigator]', color: '#C792EA' },
    reading: { label: '[reading]', color: '#FFD700' },
    writing: { label: '[writing]', color: '#FFD700' },
    bash: { label: '[bash]', color: '#FF5555' },
    planning: { label: '[planning]', color: '#3ddc97' },
    reviewing: { label: '[reviewing]', color: '#00FFAA' },
    memory_sync: { label: '[memory_sync]', color: '#888888' }
};

let currentPhase = 'idle';
let phaseDetails = '';
let spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIndex = 0;
let spinnerInterval = null;

function setPhase(phaseId, details = '') {
    currentPhase = phaseId;
    phaseDetails = details;
    renderFooter();
}

function startSpinner() {
    if (spinnerInterval) clearInterval(spinnerInterval);
    spinnerInterval = setInterval(() => {
        spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
        drawSpinnerLine();
    }, 80);
}

function stopSpinner() {
    if (spinnerInterval) {
        clearInterval(spinnerInterval);
        spinnerInterval = null;
    }
    // Clear spinner line
    if (process.stdout.isTTY) {
        process.stdout.write('\r\x1b[K');
    }
}

function drawSpinnerLine() {
    if (!process.stdout.isTTY) return;
    const phase = PHASES[currentPhase] || PHASES.idle;
    const frame = spinnerFrames[spinnerIndex];
    process.stdout.write(`\r${chalk.hex(phase.color)(frame)} ${chalk.hex(phase.color)(phase.label)} ${phaseDetails}...`);
}

// ─── STICKY ANSI STATUS BAR FOOTER ────────────────────────────────────────────
function renderFooter() {
    if (!process.stdout.isTTY) return;
    const rows = process.stdout.rows;
    const cols = process.stdout.columns;
    
    // Save cursor
    process.stdout.write('\x1b[s');
    // Move to bottom line
    process.stdout.write(`\x1b[${rows};1H`);
    // Clear bottom line
    process.stdout.write('\x1b[2K');
    
    const project = path.basename(process.cwd());
    const mode = localConfig.yolo ? 'YOLO' : 'Normal';
    const subagentStr = activeSubagent ? ` | Agent: ${activeSubagent.name}` : '';
    
    const footerText = ` Cypher Coder | Modèle: ${sessionConfig.model} | Mode: ${mode} | Projet: ${project}${subagentStr} | Phase: ${currentPhase} `;
    // Use cols - 2 to prevent automatic terminal scroll-up when writing to the bottom-right cell
    const padded = footerText.padEnd(cols - 2).slice(0, cols - 2);
    const formatted = chalk.bgHex('#00FFAA').black(padded);
    process.stdout.write(formatted);
    
    // Restore cursor
    process.stdout.write('\x1b[u');
}

// ─── LOCAL PERMISSIONS CHECK ─────────────────────────────────────────────────
async function checkPermission(actionType, detail) {
    if (localConfig.yolo) return true;
    if (actionType === 'read' && localConfig.permissions.read) return true;
    if (actionType === 'write' && localConfig.permissions.write) return true;
    if (actionType === 'execute' && localConfig.permissions.execute) return true;
    
    const allowed = await confirm({
        message: `Autoriser l'action [${actionType}] : ${detail} ?`,
        active: 'Oui',
        inactive: 'Non'
    });
    
    if (isCancel(allowed)) {
        return false;
    }
    return allowed;
}

// ─── HUGGING FACE SPACE ENDPOINT RESOLVER ─────────────────────────────────────
let hfUsername = "TheShellMaster";
let dynamicSpaceUrl = "https://theshellmaster-cypher-coder.hf.space/api/chat";

async function detectHfUsername() {
    const token = process.env.HF_TOKEN || localConfig.token;
    if (!token) return;
    try {
        const cmd = `curl -s -H "Authorization: Bearer ${token}" https://huggingface.co/api/whoami-v2`;
        const res = execSync(cmd).toString();
        const data = JSON.parse(res);
        if (data.name) {
            hfUsername = data.name;
            dynamicSpaceUrl = `https://${hfUsername.toLowerCase()}-cypher-coder.hf.space/api/chat`;
        }
    } catch (_) {}
}

// ─── API CONNECTIVITY (VIA CURL FOR IPV6 BYPASS) ─────────────────────────────
function callBackendApi(messages) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            messages,
            tools: [
                { type: "function", function: { name: "read_file",    description: "Lit le contenu complet d'un fichier local.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
                { type: "function", function: { name: "write_file",   description: "Crée ou écrase un fichier local.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } },
                { type: "function", function: { name: "patch_file",   description: "Modifie de manière ciblée un bloc de texte (Search & Replace).", parameters: { type: "object", properties: { path: { type: "string" }, search: { type: "string" }, replace: { type: "string" } }, required: ["path", "search", "replace"] } } },
                { type: "function", function: { name: "list_dir",     description: "Liste les fichiers et dossiers d'un répertoire.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
                { type: "function", function: { name: "find_files",   description: "Recherche des fichiers par nom (pattern).", parameters: { type: "object", properties: { pattern: { type: "string" }, path: { type: "string" } }, required: ["pattern"] } } },
                { type: "function", function: { name: "grep_search",  description: "Recherche textuelle récursive dans les fichiers.", parameters: { type: "object", properties: { query: { type: "string" }, path: { type: "string" } }, required: ["query"] } } },
                { type: "function", function: { name: "run_command",  description: "Exécute une commande système dans le terminal.", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } } }
            ],
            model: sessionConfig.model,
            temperature: sessionConfig.temperature,
            top_p: sessionConfig.top_p,
            max_tokens: sessionConfig.max_tokens,
            username: os.userInfo().username || "local-user"
        });
        
        const escapedPayload = payload.replace(/'/g, "'\\''");
        const command = `curl -s -X POST -H "Content-Type: application/json" -d '${escapedPayload}' ${dynamicSpaceUrl}`;
        
        exec(command, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) {
                reject(new Error(`Erreur de connexion Space: ${err.message}`));
                return;
            }
            try {
                const responseJson = JSON.parse(stdout);
                if (responseJson.error) {
                    reject(new Error(responseJson.error));
                } else {
                    resolve(responseJson.message);
                }
            } catch (e) {
                reject(new Error(`Erreur parsing réponse: ${e.message} (Raw: ${stdout.slice(0, 200)})`));
            }
        });
    });
}

// ─── SYNC LOGS TO HF DATASET ────────────────────────────────────────────────
function syncLogsToDataset(userMessage, responseMessage) {
    return new Promise((resolve) => {
        const token = process.env.HF_TOKEN || localConfig.token;
        if (!token) {
            resolve();
            return;
        }
        
        try {
            const payload = JSON.stringify({
                username: os.userInfo().username || "local-user",
                timestamp: new Date().toISOString(),
                message: userMessage,
                response: responseMessage
            });
            
            const escapedPayload = payload.replace(/'/g, "'\\''");
            const file_path = `logs/${os.userInfo().username || "local-user"}/${new Date().toISOString().slice(0, 10)}_${sessionId.slice(0, 8)}.json`;
            
            const uploadCmd = `curl -s -X POST -H "Authorization: Bearer ${token}" -H "Content-Type: application/octet-stream" --data-binary '${escapedPayload}' "https://huggingface.co/api/datasets/${hfUsername}/cypher-coder-logs/upload/main/${file_path}"`;
            
            exec(uploadCmd, (err) => {
                resolve();
            });
        } catch (_) {
            resolve();
        }
    });
}

// ─── LOCAL SYSTEM TOOLS IMPLEMENTATION ───────────────────────────────────────
function listFilesRecursive(dir, maxDepth = 3, currentDepth = 1) {
    let results = [];
    const IGNORED = new Set(['node_modules', '.git', '.venv', 'env', '.cache', 'package-lock.json', '__pycache__']);
    try {
        const list = fs.readdirSync(dir);
        for (const file of list) {
            if (IGNORED.has(file)) continue;
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            const relativePath = path.relative(".", filePath);
            if (stat.isDirectory()) {
                results.push({ path: relativePath, type: 'dossier' });
                if (currentDepth < maxDepth) {
                    results = results.concat(listFilesRecursive(filePath, maxDepth, currentDepth + 1));
                }
            } else {
                results.push({ path: relativePath, type: 'fichier', sizeBytes: stat.size });
            }
        }
    } catch (_) {}
    return results;
}

async function handleToolExecution(name, args) {
    switch (name) {
        case 'read_file': {
            const targetPath = path.resolve(args.path);
            if (!fs.existsSync(targetPath)) return `Erreur: Fichier introuvable à ${targetPath}`;
            const allowed = await checkPermission('read', `Lecture de ${args.path}`);
            if (!allowed) return "Action refusée par l'utilisateur.";
            setPhase('reading', args.path);
            return fs.readFileSync(targetPath, 'utf8');
        }
        
        case 'write_file': {
            const targetPath = path.resolve(args.path);
            renderBox(`${args.path} (Écriture / Création)`, args.content, '#FFD700');
            const allowed = await checkPermission('write', `Écriture dans ${args.path}`);
            if (!allowed) return "Action refusée.";
            setPhase('writing', args.path);
            const dir = path.dirname(targetPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(targetPath, args.content, 'utf8');
            return `Fichier écrit avec succès à ${targetPath}`;
        }
        
        case 'patch_file': {
            const targetPath = path.resolve(args.path);
            if (!fs.existsSync(targetPath)) return `Erreur: ${targetPath} introuvable.`;
            const content = fs.readFileSync(targetPath, 'utf8');
            const occurrences = content.split(args.search).length - 1;
            if (occurrences === 0) return "Erreur: Bloc de code cible introuvable dans le fichier.";
            if (occurrences > 1) return "Erreur: Bloc cible ambigu (trouvé plusieurs fois). Soyez plus spécifique.";
            
            renderDiffBox(args.path, args.search, args.replace);
            const allowed = await checkPermission('write', `Appliquer la modification dans ${args.path}`);
            if (!allowed) return "Action refusée.";
            setPhase('writing', args.path);
            fs.writeFileSync(targetPath, content.replace(args.search, args.replace), 'utf8');
            return "Modification appliquée avec succès.";
        }
        
        case 'list_dir': {
            const targetPath = path.resolve(args.path || ".");
            if (!fs.existsSync(targetPath)) return `Erreur: Répertoire introuvable à ${targetPath}`;
            setPhase('code_investigator', `Scan de ${args.path || '.'}`);
            const items = fs.readdirSync(targetPath).map(item => {
                const s = fs.statSync(path.join(targetPath, item));
                return { name: item, type: s.isDirectory() ? 'dossier' : 'fichier', sizeBytes: s.size };
            });
            return JSON.stringify(items, null, 2);
        }
        
        case 'find_files': {
            const startDir = path.resolve(args.path || ".");
            setPhase('code_investigator', `Recherche de ${args.pattern}`);
            const escaped = args.pattern.replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\\\*/g, '.*').replace(/\\\?/g, '.');
            const regex = new RegExp(`^${escaped}$`, 'i');
            const all = listFilesRecursive(startDir, 5, 1);
            return JSON.stringify(all.filter(i => i.type === 'fichier' && regex.test(path.basename(i.path))).map(i => i.path), null, 2);
        }
        
        case 'grep_search': {
            const startDir = path.resolve(args.path || ".");
            setPhase('code_investigator', `Recherche textuelle de: "${args.query}"`);
            const query = args.query.toLowerCase();
            const all = listFilesRecursive(startDir, 5, 1);
            const matches = [];
            for (const item of all) {
                if (item.type !== 'fichier' || item.sizeBytes > 1024 * 1024) continue;
                const content = fs.readFileSync(item.path, 'utf8');
                if (content.includes('\u0000')) continue; // Ignore binary
                content.split('\n').forEach((line, idx) => {
                    if (line.toLowerCase().includes(query)) {
                        matches.push({ file: item.path, line: idx + 1, content: line.trim() });
                    }
                });
                if (matches.length >= 50) break;
            }
            return JSON.stringify(matches, null, 2);
        }
        
        case 'run_command': {
            renderBox(`Commande Shell`, args.command, '#FF5555');
            const allowed = await checkPermission('execute', `Exécuter : ${args.command}`);
            if (!allowed) return "Action refusée par l'utilisateur.";
            setPhase('bash', args.command);
            try {
                const stdout = execSync(args.command, { stdio: 'pipe' }).toString();
                renderBox(`Résultat de la commande`, stdout, '#00FFAA');
                return `Commande exécutée avec succès.\nStdout:\n${stdout}`;
            } catch (err) {
                const errMsg = err.stderr ? err.stderr.toString() : err.message;
                renderBox(`Erreur de commande`, errMsg, '#FF5555');
                return `Échec de l'exécution.\nErreur:\n${errMsg}`;
            }
        }
        
        default:
            return `Erreur: Outil inconnu '${name}'`;
    }
}

// ─── AGENT EXECUTION LOOP ────────────────────────────────────────────────────
async function runAgentTurn() {
    startSpinner();
    setPhase('thinking', 'Attente réponse modèle');
    
    try {
        const reply = await callBackendApi(chatMessages);
        stopSpinner();
        chatMessages.push(reply);
        
        if (reply.content) {
            console.log('\n' + chalk.hex('#00FFAA')('▸ Cypher :'));
            console.log(marked(reply.content));
        }
        
        if (reply.tool_calls && reply.tool_calls.length > 0) {
            for (const tc of reply.tool_calls) {
                const name = tc.function.name;
                const args = JSON.parse(tc.function.arguments);
                const result = await handleToolExecution(name, args);
                chatMessages.push({
                    role: "tool",
                    name,
                    tool_call_id: tc.id,
                    content: result
                });
            }
            setPhase('idle');
            return await runAgentTurn();
        }
        
        setPhase('idle');
        
        // Sync to dataset
        let lastUser = "";
        for (let i = chatMessages.length - 1; i >= 0; i--) {
            if (chatMessages[i].role === 'user') {
                lastUser = chatMessages[i].content;
                break;
            }
        }
        await syncLogsToDataset(lastUser, reply.content || "[Action effectuée]");
        
    } catch (e) {
        stopSpinner();
        setPhase('idle');
        renderBox('Erreur de communication', e.message, '#FF5555');
    }
}

// ─── CUSTOM INTERACTIVE KEYPRESS PROMPT ──────────────────────────────────────
function promptUser(promptMsg) {
    return new Promise((resolve) => {
        let input = '';
        let cursor = 0;
        let autoActive = false;
        let autoSelectIndex = 0;
        let filtered = [];
        
        process.stdin.removeAllListeners('keypress');
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }
        
        function drawFooter() {
            renderFooter();
        }
        
        function render() {
            if (!process.stdout.isTTY) {
                process.stdout.write(promptMsg);
                return;
            }
            
            // Save cursor position
            process.stdout.write('\x1b[s');
            // Clear current prompt line downwards
            process.stdout.write('\r\x1b[J');
            // Print current prompt + input buffer
            process.stdout.write(promptMsg + input);
            
            const cols = process.stdout.columns || 80;
            
            // Draw autocomplete if active
            if (autoActive && filtered.length > 0) {
                process.stdout.write('\n');
                const boxWidth = Math.min(60, cols - 4);
                process.stdout.write(chalk.gray('  ╭' + '─'.repeat(boxWidth - 2) + '╮\n'));
                
                filtered.forEach((item, idx) => {
                    let line = `  │ `;
                    if (idx === autoSelectIndex) {
                        line += chalk.hex('#00FFAA')(`> ${item.cmd.padEnd(15)} - ${item.desc}`);
                    } else {
                        line += chalk.gray(`  ${item.cmd.padEnd(15)} - ${item.desc}`);
                    }
                    const plainText = `  │   ${item.cmd.padEnd(15)} - ${item.desc}`;
                    const padding = Math.max(0, boxWidth - plainText.length - 1);
                    process.stdout.write(line + ' '.repeat(padding) + chalk.gray('│\n'));
                });
                
                process.stdout.write(chalk.gray('  ╰' + '─'.repeat(boxWidth - 2) + '╯\n'));
                
                // Move cursor back up
                const linesToMoveUp = 3 + filtered.length;
                process.stdout.write(`\x1b[${linesToMoveUp}A`);
            }
            
            // Restore cursor
            process.stdout.write('\x1b[u');
            
            // Move cursor to proper horizontal column
            const promptLen = stripAnsi(promptMsg).length;
            process.stdout.write(`\x1b[${promptLen + cursor + 1}G`);
            
            drawFooter();
        }
        
        render();
        
        process.stdin.on('keypress', (str, key) => {
            const isCtrlC = key && key.ctrl && key.name === 'c';
            if (isCtrlC) {
                process.stdout.write('\n');
                process.exit(0);
            }
            
            const isEnter = (key && (key.name === 'return' || key.name === 'enter')) || str === '\r' || str === '\n';
            if (isEnter) {
                if (autoActive && filtered.length > 0) {
                    input = filtered[autoSelectIndex].cmd + ' ';
                    cursor = input.length;
                    autoActive = false;
                    render();
                } else {
                    process.stdout.write('\n');
                    if (autoActive) {
                        const linesToClear = 3 + filtered.length;
                        for (let i = 0; i < linesToClear; i++) {
                            process.stdout.write('\n\x1b[2K');
                        }
                        process.stdout.write(`\x1b[${linesToClear}A`);
                    }
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
                    if (commandHistory.length > 0) {
                        if (historyIndex === -1) historyIndex = commandHistory.length;
                        if (historyIndex > 0) {
                            historyIndex--;
                            input = commandHistory[historyIndex];
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
                    if (historyIndex !== -1) {
                        if (historyIndex < commandHistory.length - 1) {
                            historyIndex++;
                            input = commandHistory[historyIndex];
                            cursor = input.length;
                        } else {
                            historyIndex = -1;
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

// ─── SLASH COMMAND INTERPRETER ────────────────────────────────────────────────
async function handleSlashCommand(textInput) {
    const parts = textInput.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    if (parts.length === 0) return;
    const commandName = parts[0].toLowerCase();
    const cleanArgs = parts.slice(1).map(a => a.replace(/^["']|["']$/g, ''));
    
    // Check custom commands first
    const matchedCustom = customCommands.find(c => c.cmd === commandName);
    if (matchedCustom) {
        let finalPrompt = matchedCustom.promptTemplate;
        const files = listFilesRecursive('.', 1, 1).filter(f => f.type === 'fichier');
        if (files.length > 0) {
            finalPrompt = finalPrompt.replace(/\{\{(file|fichier_courant)\}\}/g, files[0].path);
        }
        chatMessages.push({ role: "user", content: finalPrompt });
        await runAgentTurn();
        return;
    }

    switch (commandName) {
        case '/help':
            let helpContent = '=== COMMANDES DISPONIBLES ===\n';
            SLASH_COMMANDS.forEach(c => {
                helpContent += `  ${c.cmd.padEnd(15)} : ${c.desc}\n`;
            });
            if (customCommands.length > 0) {
                helpContent += '\n=== COMMANDES PERSONNALISÉES ===\n';
                customCommands.forEach(c => {
                    helpContent += `  ${c.cmd.padEnd(15)} : ${c.desc} [perso]\n`;
                });
            }
            renderBox('Aide Cypher Coder', helpContent, '#00FFAA');
            break;
            
        case '/exit':
            outro(chalk.yellow('Fermeture de Cypher Coder. À bientôt !'));
            process.exit(0);
            
        case '/clear':
            console.clear();
            console.log(BANNER);
            break;
            
        case '/reset':
            initChat();
            note('La session de discussion et le contexte ont été réinitialisés.', 'Reset');
            break;
            
        case '/status':
            detectEnvironment();
            let statusText = `Dossier Actif  : ${process.cwd()}\n`;
            statusText += `Système d'Expl. : ${localEnv.os}\n`;
            statusText += `Shell Terminal  : ${localEnv.shell}\n\n`;
            statusText += `Modèle IA       : ${sessionConfig.model}\n`;
            statusText += `Mode YOLO       : ${localConfig.yolo ? 'ACTIF (sans confirmation)' : 'DÉSACTIVÉ'}\n\n`;
            statusText += `Outils Système Détectés :\n`;
            Object.keys(localEnv.tools).forEach(t => {
                statusText += `  - ${t.padEnd(10)}: ${localEnv.tools[t] ? chalk.green(localEnv.tools[t]) : chalk.red('non installé')}\n`;
            });
            renderBox('Diagnostic du Système Local', statusText, '#00FFAA');
            break;
            
        case '/model': {
            const selected = await select({
                message: 'Sélectionner le modèle d\'IA :',
                options: [
                    { value: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 72B Instruct (Recommandé - Free)' },
                    { value: 'meta-llama/Llama-3.3-70B-Instruct', label: 'Llama 3.3 70B Instruct (Fallback - Free)' },
                    { value: 'custom', label: 'Saisir un identifiant de modèle personnalisé...' }
                ]
            });
            if (!isCancel(selected)) {
                if (selected === 'custom') {
                    const manual = await text({ message: 'Entrez l\'identifiant du modèle Hugging Face :' });
                    if (!isCancel(manual) && manual) {
                        sessionConfig.model = manual;
                    }
                } else {
                    sessionConfig.model = selected;
                }
                localConfig.defaultModel = sessionConfig.model;
                saveConfig();
                note(`Modèle actif configuré sur : ${sessionConfig.model}`, 'Modèle');
            }
            break;
        }
        
        case '/permissions': {
            const selected = await select({
                message: 'Configurer les permissions :',
                options: [
                    { value: 'toggle_read', label: `Lecture fichiers  : ${localConfig.permissions.read ? 'AUTORISÉ' : 'CONFIRMER'}` },
                    { value: 'toggle_write', label: `Écriture fichiers : ${localConfig.permissions.write ? 'AUTORISÉ' : 'CONFIRMER'}` },
                    { value: 'toggle_execute', label: `Exécution Shell   : ${localConfig.permissions.execute ? 'AUTORISÉ' : 'CONFIRMER'}` },
                    { value: 'back', label: 'Retour' }
                ]
            });
            if (!isCancel(selected) && selected !== 'back') {
                if (selected === 'toggle_read') localConfig.permissions.read = !localConfig.permissions.read;
                if (selected === 'toggle_write') localConfig.permissions.write = !localConfig.permissions.write;
                if (selected === 'toggle_execute') localConfig.permissions.execute = !localConfig.permissions.execute;
                saveConfig();
                note('Permissions mises à jour avec succès.', 'Permissions');
            }
            break;
        }
        
        case '/yolo':
            localConfig.yolo = !localConfig.yolo;
            saveConfig();
            note(`Mode YOLO ${localConfig.yolo ? 'ACTIVÉ (exécute tout sans avertissement)' : 'DÉSACTIVÉ'}`, 'Config');
            break;
            
        case '/resume': {
            setPhase('memory_sync', 'Récupération sessions');
            try {
                const token = process.env.HF_TOKEN || localConfig.token;
                if (!token) {
                    note("Aucun token Hugging Face configuré.", "Mémoire");
                    break;
                }
                const user = os.userInfo().username || 'local-user';
                const cmd = `curl -s -H "Authorization: Bearer ${token}" https://huggingface.co/api/datasets/${hfUsername}/cypher-coder-logs/tree/main/logs/${user}`;
                const res = execSync(cmd).toString();
                const files = JSON.parse(res);
                if (!files || files.length === 0) {
                    note("Aucune session sauvegardée trouvée.", "Mémoire");
                    break;
                }
                
                const choices = files.map(f => ({ value: f.path, label: path.basename(f.path) }));
                const selectedFile = await select({
                    message: 'Choisir la session à charger :',
                    options: choices
                });
                
                if (!isCancel(selectedFile)) {
                    setPhase('memory_sync', 'Chargement session');
                    const downloadCmd = `curl -s -H "Authorization: Bearer ${token}" https://huggingface.co/datasets/${hfUsername}/cypher-coder-logs/raw/main/${selectedFile}`;
                    const fileContent = execSync(downloadCmd).toString();
                    const logData = JSON.parse(fileContent);
                    
                    initChat();
                    chatMessages.push({ role: 'user', content: logData.message });
                    chatMessages.push({ role: 'assistant', content: logData.response });
                    note(`Session restaurée. Dernier message : "${logData.message.slice(0, 40)}..."`, "Mémoire");
                }
            } catch (e) {
                note(`Erreur lors de la récupération : ${e.message}`, "Erreur");
            }
            break;
        }
        
        case '/usage':
            renderBox('Usage Session', `Messages actifs en contexte : ${chatMessages.length}\nSession ID : ${sessionId}`, '#00FFAA');
            break;
            
        case '/rename':
            const newName = await text({ message: 'Nouveau nom de session :' });
            if (!isCancel(newName) && newName) {
                sessionId = `${newName.replace(/\s+/g, '_')}_${Date.now()}`;
                note(`Session renommée : ${sessionId}`, 'Renommer');
            }
            break;
            
        case '/agents': {
            const list = loadSubagents();
            const choice = await select({
                message: 'Gérer les sous-agents :',
                options: [
                    { value: 'list', label: 'Lister les sous-agents disponibles' },
                    { value: 'create', label: 'Créer un nouveau sous-agent' },
                    { value: 'enable', label: 'Activer un sous-agent' },
                    { value: 'disable', label: 'Désactiver le sous-agent actif et revenir par défaut' },
                    { value: 'back', label: 'Retour' }
                ]
            });
            
            if (isCancel(choice) || choice === 'back') break;
            
            if (choice === 'list') {
                let text = `Agent Principal : Cypher Coder (Default)\n`;
                if (activeSubagent) {
                    text += `Agent Actif     : ${activeSubagent.name}\n\n`;
                }
                text += `Sous-agents Définis :\n`;
                list.forEach(a => {
                    text += `  - ${chalk.bold(a.name)} [modèle: ${a.model || 'default'}] : ${a.role.slice(0, 60)}...\n`;
                });
                renderBox('Catalogue des Sous-Agents', text, '#00FFAA');
            }
            
            else if (choice === 'create') {
                const name = await text({ message: 'Nom du sous-agent :' });
                if (isCancel(name) || !name) break;
                const role = await text({ message: 'Rôle / Instructions système :' });
                if (isCancel(role) || !role) break;
                const model = await select({
                    message: 'Modèle préféré :',
                    options: [
                        { value: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 72B Instruct' },
                        { value: 'meta-llama/Llama-3.3-70B-Instruct', label: 'Llama 3.3 70B Instruct' }
                    ]
                });
                if (isCancel(model)) break;
                const location = await select({
                    message: 'Sauvegarder dans :',
                    options: [
                        { value: 'global', label: 'Globalement (~/.cypher/agents/)' },
                        { value: 'local', label: 'Localement (./.cypher/agents/)' }
                    ]
                });
                if (isCancel(location)) break;
                
                const agentDef = { name, role, model };
                const dirPath = location === 'global' 
                    ? path.join(os.homedir(), '.cypher', 'agents') 
                    : path.join(process.cwd(), '.cypher', 'agents');
                
                if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
                fs.writeFileSync(path.join(dirPath, `${name.toLowerCase()}.json`), JSON.stringify(agentDef, null, 2), 'utf8');
                note(`Sous-agent ${name} créé avec succès.`, 'Agents');
            }
            
            else if (choice === 'enable') {
                if (list.length === 0) {
                    note("Aucun sous-agent disponible.", "Agents");
                    break;
                }
                const selectAgent = await select({
                    message: 'Sélectionner l\'agent à activer :',
                    options: list.map(a => ({ value: a, label: a.name }))
                });
                
                if (!isCancel(selectAgent)) {
                    activeSubagent = selectAgent;
                    if (activeSubagent.model) {
                        sessionConfig.model = activeSubagent.model;
                    }
                    initChat();
                    note(`Sous-agent ${activeSubagent.name} activé. Session réinitialisée avec les nouvelles instructions.`, 'Agents');
                }
            }
            
            else if (choice === 'disable') {
                activeSubagent = null;
                sessionConfig.model = localConfig.defaultModel;
                initChat();
                note("Sous-agent désactivé. Retour à l'agent principal Cypher Coder.", "Agents");
            }
            break;
        }
        
        default:
            console.log(chalk.red(`  Commande inconnue : ${commandName}. Tapez /help.`));
            break;
    }
}

// ─── SYSTEM PROMPT INJECTOR ──────────────────────────────────────────────────
function getSystemPrompt() {
    let dirContext = "Dossier vide.";
    try {
        const files = listFilesRecursive(".", 2, 1);
        if (files.length > 0) {
            dirContext = files.map(f => `${f.path} (${f.type})`).join(", ");
        }
    } catch (_) {}
    
    let instructions = "";
    if (activeSubagent) {
        instructions = `Tu es le sous-agent spécialisé "${activeSubagent.name}".
Rôle et instructions spécifiques :
${activeSubagent.role}`;
    } else {
        instructions = `Tu es Cypher Coder, un agent de programmation IA autonome et ultra-intelligent fonctionnant dans un terminal (CLI).
Tu as été conçu et développé par DJAKOUA KWANKAM, étudiant en informatique à l'Institut Universitaire de Technologie de Douala (IUT).
Tu dois toujours te présenter comme tel.

Tu as accès à des outils locaux (read_file, write_file, patch_file, list_dir, find_files, grep_search, run_command) et à la recherche web search_web.
Tu es rigoureux, direct et professionnel. Formate toutes les sorties contenant du code ou des réponses structurées en blocs clairs.

[RÈGLE DE TRAVAIL FONDAMENTALE] :
- Avant de générer du code ou de proposer une solution technique complexe, tu DOIS impérativement exécuter une recherche d'information externe (soit sur internet avec search_web, soit en scannant les fichiers locaux avec grep_search ou find_files) pour trouver des exemples similaires et confronter tes idées. Ne réponds jamais uniquement de mémoire.
- Indique toujours quelle recherche tu effectues dans ta réflexion.`;
    }
    
    return `${instructions}

[CONTEXTE DU SYSTÈME LOCAL] :
- OS : ${localEnv.os}
- Shell : ${localEnv.shell}
- Outils disponibles : ${Object.keys(localEnv.tools).filter(k => localEnv.tools[k] !== null).join(', ')}
- Répertoire courant : ${dirContext}`;
}

function initChat() {
    chatMessages = [{ role: "system", content: getSystemPrompt() }];
}

// ─── MAIN REPL LOOP ──────────────────────────────────────────────────────────
async function startInteractiveLoop() {
    const user = os.userInfo().username || "local-user";
    
    process.stdout.on('resize', () => {
        const rows = process.stdout.rows;
        process.stdout.write(`\x1b[1;${rows - 1}r`);
        renderFooter();
    });
    
    while (true) {
        renderFooter();
        
        let userInput = await promptUser(chalk.hex('#C792EA')(`❯ ${user} : `));
        
        userInput = userInput.trim();
        if (!userInput) continue;
        
        // Execute slash commands
        if (userInput.startsWith('/')) {
            await handleSlashCommand(userInput);
            continue;
        }
        
        // Direct shell passthrough (!)
        if (userInput.startsWith('!')) {
            const cmd = userInput.slice(1).trim();
            if (cmd) {
                await handleToolExecution('run_command', { command: cmd });
            }
            continue;
        }
        
        // Inject local file context (@file)
        let resolvedPrompt = userInput;
        const fileRegex = /@([^\s"']+|"[^"]+"Dependencies|'[^']+')/g;
        let match;
        let filesLoaded = [];
        
        while ((match = fileRegex.exec(userInput)) !== null) {
            const filePath = match[1].replace(/^["']|["']$/g, '');
            const abs = path.resolve(filePath);
            if (fs.existsSync(abs)) {
                try {
                    const content = fs.readFileSync(abs, 'utf8');
                    chatMessages.push({
                        role: 'user',
                        content: `[Fichier Context: ${filePath}]\n\`\`\`\n${content}\n\`\`\``
                    });
                    filesLoaded.push(filePath);
                } catch (e) {
                    note(`Impossible de charger le fichier ${filePath}: ${e.message}`, 'Erreur');
                }
            } else {
                note(`Fichier non trouvé : ${filePath}`, 'Avertissement');
            }
        }
        
        if (filesLoaded.length > 0) {
            note(`Fichiers injectés en contexte : ${filesLoaded.join(', ')}`, 'Contexte');
        }
        
        // Send to agent
        chatMessages.push({ role: "user", content: resolvedPrompt });
        commandHistory.push(resolvedPrompt);
        historyIndex = -1;
        await runAgentTurn();
    }
}

// ─── APP STARTUP ─────────────────────────────────────────────────────────────
async function main() {
    setupTerminal();
    
    process.on('SIGINT', () => {
        restoreTerminal();
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        restoreTerminal();
        process.exit(0);
    });
    process.on('exit', () => {
        restoreTerminal();
    });

    console.clear();
    console.log(BANNER);
    
    loadConfig();
    detectEnvironment();
    await detectHfUsername();
    loadCustomCommands();
    initChat();
    
    intro(chalk.bgHex(BANNER_COLOR).black(` BIENVENUE DANS CYPHER CODER CLI `));
    
    // Check command line arguments direct call
    const args = process.argv.slice(2);
    if (args.length > 0) {
        const directReq = args.join(" ");
        console.log(chalk.hex('#C792EA')(`❯ ${os.userInfo().username || 'user'} : `) + directReq);
        
        if (directReq.startsWith('/')) {
            await handleSlashCommand(directReq);
        } else if (directReq.startsWith('!')) {
            await handleToolExecution('run_command', { command: directReq.slice(1).trim() });
        } else {
            chatMessages.push({ role: "user", content: directReq });
            await runAgentTurn();
        }
    }
    
    // Enable raw mode for inputs
    if (process.stdin.isTTY) {
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
    }
    
    await startInteractiveLoop();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
