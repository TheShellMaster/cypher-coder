#!/usr/bin/env node

import chalk from 'chalk';
import readline from 'readline';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

const theme = {
    agent: chalk.hex('#00FFAA'),
    user: chalk.hex('#C792EA'),
    command: chalk.hex('#FFD700'),
    error: chalk.hex('#FF5555'),
    info: chalk.hex('#569CD6'),
    border: chalk.hex('#2A2A2A'),
    text: chalk.hex('#E0E0E0'),
    dim: chalk.hex('#444444'),
    tool: chalk.hex('#FFD700'),
    done: chalk.hex('#3ddc97'),
};

marked.setOptions({
    renderer: new TerminalRenderer({
        code: theme.command,
        blockquote: theme.agent,
        html: theme.agent,
        heading: theme.info,
        firstHeading: theme.info,
        listitem: theme.agent,
        table: theme.agent,
        strong: theme.agent,
        em: theme.agent,
        link: theme.info,
        href: theme.info,
        unstyled: theme.agent,
        tab: 2
    })
});

const AUTHOR = "DJAKOUA KWANKAM";
const APP_NAME = "Cypher Coder";
const VERSION = "1.0.0";

let chatMessages = [];
let lastUserInput = "";
let lastAssistantResponse = "";
let commandHistory = [];
let historyIndex = -1;
let savedContexts = {};
let loadedFiles = [];
let macros = {};
let logs = [];

const sessionConfig = {
    model: "Qwen/Qwen2.5-Coder-7B-Instruct",
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 2048,
    stream: false,
    sandbox: false,
    verbose: false,
    silent: false,
    color: true,
    theme: "dark",
    format: "md",
    lang: "fr",
    env: {}
};

// ─── LISTE COMPLÈTE DES COMMANDES SLASH (pour autocomplete) ──────────────────
const SLASH_COMMANDS = [
    // Session
    { cmd: '/help',              desc: 'Afficher toutes les commandes' },
    { cmd: '/exit',              desc: 'Quitter Cypher Coder' },
    { cmd: '/quit',              desc: 'Quitter Cypher Coder' },
    { cmd: '/clear',             desc: 'Vider l\'écran du terminal' },
    { cmd: '/reset',             desc: 'Réinitialiser session et contexte' },
    { cmd: '/restart',           desc: 'Redémarrer proprement l\'agent' },
    { cmd: '/version',           desc: 'Afficher la version de Cypher' },
    { cmd: '/about',             desc: 'Infos sur le projet et l\'auteur' },
    { cmd: '/status',            desc: 'Statut complet de la session' },
    // Mémoire et contexte
    { cmd: '/context',           desc: 'Voir les fichiers chargés en contexte' },
    { cmd: '/context clear',     desc: 'Effacer le contexte de fichiers' },
    { cmd: '/context save',      desc: 'Sauvegarder la session : /context save <nom>' },
    { cmd: '/context load',      desc: 'Charger une session : /context load <nom>' },
    { cmd: '/context list',      desc: 'Lister les sessions sauvegardées' },
    { cmd: '/memory',            desc: 'Afficher la mémoire et les messages' },
    { cmd: '/memory clear',      desc: 'Effacer les messages de l\'historique' },
    { cmd: '/tokens',            desc: 'Statistiques de tokens de la session' },
    // Historique
    { cmd: '/history',           desc: 'Afficher l\'historique de la session' },
    { cmd: '/history clear',     desc: 'Effacer l\'historique enregistré' },
    { cmd: '/history save',      desc: 'Exporter l\'historique : /history save <fichier>' },
    { cmd: '/history load',      desc: 'Importer un historique : /history load <fichier>' },
    { cmd: '/history search',    desc: 'Chercher dans l\'historique : /history search <terme>' },
    { cmd: '/last',              desc: 'Afficher la dernière réponse de l\'agent' },
    { cmd: '/redo',              desc: 'Relancer la dernière requête utilisateur' },
    { cmd: '/undo',              desc: 'Annuler la dernière interaction' },
    // Modèle
    { cmd: '/model',             desc: 'Afficher le modèle actuellement utilisé' },
    { cmd: '/model list',        desc: 'Lister tous les modèles disponibles' },
    { cmd: '/model set',         desc: 'Changer de modèle : /model set <nom>' },
    { cmd: '/model info',        desc: 'Infos détaillées sur le modèle actif' },
    { cmd: '/temperature',       desc: 'Ajuster la température : /temperature <0.0-1.0>' },
    { cmd: '/top_p',             desc: 'Modifier le top_p : /top_p <valeur>' },
    { cmd: '/max_tokens',        desc: 'Limite de tokens : /max_tokens <n>' },
    { cmd: '/system',            desc: 'Afficher le system prompt actif' },
    { cmd: '/system set',        desc: 'Modifier le system prompt' },
    { cmd: '/system reset',      desc: 'Réinitialiser le system prompt par défaut' },
    { cmd: '/stream',            desc: 'Streaming : /stream on|off' },
    // Fichiers
    { cmd: '/file load',         desc: 'Charger un fichier en contexte : /file load <chemin>' },
    { cmd: '/file read',         desc: 'Lire et afficher un fichier : /file read <chemin>' },
    { cmd: '/file write',        desc: 'Écrire la dernière réponse dans un fichier' },
    { cmd: '/file append',       desc: 'Ajouter la dernière réponse à un fichier' },
    { cmd: '/file list',         desc: 'Lister les fichiers chargés en contexte' },
    { cmd: '/file clear',        desc: 'Retirer tous les fichiers du contexte' },
    { cmd: '/file diff',         desc: 'Comparer deux fichiers : /file diff <f1> <f2>' },
    { cmd: '/upload',            desc: 'Uploader un fichier vers l\'agent' },
    { cmd: '/download',          desc: 'Télécharger un fichier généré' },
    // Code et exécution
    { cmd: '/run',               desc: 'Exécuter le dernier bloc de code généré' },
    { cmd: '/exec',              desc: 'Exécuter une commande shell : /exec <cmd>' },
    { cmd: '/shell',             desc: 'Basculer en mode shell interactif' },
    { cmd: '/repl',              desc: 'Ouvrir un REPL : /repl <python|node|...>' },
    { cmd: '/eval',              desc: 'Évaluer une expression mathématique' },
    { cmd: '/sandbox',           desc: 'Isolation : /sandbox on|off' },
    { cmd: '/output',            desc: 'Afficher la dernière sortie d\'exécution' },
    { cmd: '/output clear',      desc: 'Effacer la dernière sortie affichée' },
    // Outils et web
    { cmd: '/tools',             desc: 'Lister tous les outils disponibles' },
    { cmd: '/tool enable',       desc: 'Activer un outil : /tool enable <nom>' },
    { cmd: '/tool disable',      desc: 'Désactiver un outil : /tool disable <nom>' },
    { cmd: '/tool info',         desc: 'Description d\'un outil : /tool info <nom>' },
    { cmd: '/plugin list',       desc: 'Lister les plugins installés' },
    { cmd: '/plugin install',    desc: 'Installer un plugin : /plugin install <nom>' },
    { cmd: '/plugin remove',     desc: 'Supprimer un plugin : /plugin remove <nom>' },
    { cmd: '/web search',        desc: 'Recherche web : /web search <requête>' },
    { cmd: '/web fetch',         desc: 'Récupérer une URL : /web fetch <url>' },
    // Affichage
    { cmd: '/theme',             desc: 'Thème : /theme dark|light' },
    { cmd: '/theme list',        desc: 'Lister les thèmes disponibles' },
    { cmd: '/format',            desc: 'Format de sortie : /format md|plain|json' },
    { cmd: '/wrap',              desc: 'Retour à la ligne : /wrap on|off' },
    { cmd: '/verbose',           desc: 'Mode verbeux : /verbose on|off' },
    { cmd: '/silent',            desc: 'Mode silencieux : /silent on|off' },
    { cmd: '/color',             desc: 'Colorisation : /color on|off' },
    { cmd: '/lang',              desc: 'Langue : /lang fr|en' },
    // Config et credentials
    { cmd: '/config',            desc: 'Afficher la configuration actuelle' },
    { cmd: '/config set',        desc: 'Modifier une config : /config set <cle> <valeur>' },
    { cmd: '/config reset',      desc: 'Réinitialiser la config par défaut' },
    { cmd: '/config export',     desc: 'Exporter la config dans un fichier' },
    { cmd: '/config import',     desc: 'Importer une config depuis un fichier' },
    { cmd: '/api key set',       desc: 'Définir une clé API' },
    { cmd: '/api key show',      desc: 'Afficher la clé API (masquée)' },
    { cmd: '/api key clear',     desc: 'Supprimer la clé API stockée' },
    { cmd: '/env set',           desc: 'Variable d\'env : /env set <VAR> <valeur>' },
    { cmd: '/env list',          desc: 'Lister les variables d\'environnement' },
    // Monitoring et debug
    { cmd: '/debug',             desc: 'Mode debug : /debug on|off' },
    { cmd: '/log',               desc: 'Afficher les logs de l\'agent' },
    { cmd: '/log clear',         desc: 'Effacer les logs' },
    { cmd: '/log save',          desc: 'Exporter les logs : /log save <fichier>' },
    { cmd: '/benchmark',         desc: 'Mesurer la latence API' },
    { cmd: '/ping',              desc: 'Tester la connexion à l\'API du modèle' },
    { cmd: '/stats',             desc: 'Statistiques de la session' },
    { cmd: '/trace',             desc: 'Trace des appels internes (debug)' },
    { cmd: '/inspect',           desc: 'Inspecter une variable : /inspect <var>' },
    // Automatisation
    { cmd: '/macro save',        desc: 'Sauvegarder une macro : /macro save <nom>' },
    { cmd: '/macro run',         desc: 'Exécuter une macro : /macro run <nom>' },
    { cmd: '/macro list',        desc: 'Lister toutes les macros' },
    { cmd: '/macro delete',      desc: 'Supprimer une macro : /macro delete <nom>' },
    { cmd: '/pipe',              desc: 'Chaîner des commandes : /pipe <cmd1> | <cmd2>' },
    { cmd: '/loop',              desc: 'Répéter N fois : /loop <n> <commande>' },
    { cmd: '/schedule',          desc: 'Planifier : /schedule <cron> <cmd>' },
    { cmd: '/watch',             desc: 'Surveiller les changements' },
    { cmd: '/batch',             desc: 'Exécuter depuis un fichier : /batch <fichier>' },
];

// ─── COMPLETER pour readline ─────────────────────────────────────────────────
function slashCompleter(line) {
    if (!line.startsWith('/')) return [[], line];
    const lowerLine = line.toLowerCase();
    const hits = SLASH_COMMANDS
        .filter(c => c.cmd.toLowerCase().startsWith(lowerLine))
        .map(c => c.cmd);
    return [hits.length ? hits : [], line];
}

function addLog(level, message) {
    logs.push(`[${new Date().toISOString()}] [${level}] ${message}`);
}

// ─── BANNER ───────────────────────────────────────────────────────────────────
const BANNER = chalk.hex('#1a6e5a')(`
   _____             _---------------+
  / ____|           | |  ____  _      |
 | |    _   _ _ __  | |__|  _ \\| |    |`) + theme.info(`  CYPHER CODER CLI`) + chalk.hex('#1a6e5a')(`
 | |   | | | | '_ \\ |  __  |_) | |    |`) + theme.agent(`  L'IA experte en développement local`) + chalk.hex('#1a6e5a')(`
 | |___| |_| | |_) || |  |  __/| |___ |`) + theme.agent(`  Créé par ${AUTHOR}`) + chalk.hex('#1a6e5a')(`
    \\_____\\__, | .__/ |_|  |_|   |_____|
          __/ | |
         |___/|_|                      `) + chalk.hex('#1a6e5a')(`+-----------------------+`);

// ─── OUTILS ───────────────────────────────────────────────────────────────────
const tools = [
    { type: "function", function: { name: "read_file",    description: "Lit le contenu complet d'un fichier local.", parameters: { type: "object", properties: { path: { type: "string", description: "Chemin du fichier." } }, required: ["path"] } } },
    { type: "function", function: { name: "write_file",   description: "Crée ou écrase un fichier local.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } },
    { type: "function", function: { name: "patch_file",   description: "Modifie de manière ciblée un bloc de texte (Search & Replace).", parameters: { type: "object", properties: { path: { type: "string" }, search: { type: "string" }, replace: { type: "string" } }, required: ["path", "search", "replace"] } } },
    { type: "function", function: { name: "list_dir",     description: "Liste les fichiers et dossiers d'un répertoire.", parameters: { type: "object", properties: { path: { type: "string" }, recursive: { type: "boolean" } }, required: ["path"] } } },
    { type: "function", function: { name: "find_files",   description: "Recherche des fichiers par nom (pattern).", parameters: { type: "object", properties: { pattern: { type: "string" }, path: { type: "string" } }, required: ["pattern"] } } },
    { type: "function", function: { name: "grep_search",  description: "Recherche textuelle récursive dans les fichiers.", parameters: { type: "object", properties: { query: { type: "string" }, path: { type: "string" } }, required: ["query"] } } },
    { type: "function", function: { name: "run_command",  description: "Exécute une commande système dans le terminal.", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } } },
];

// ─── API via curl ─────────────────────────────────────────────────────────────
function callApiViaCurl(messages, clientTools) {
    const payload = JSON.stringify({
        messages,
        tools: clientTools,
        model: sessionConfig.model,
        temperature: sessionConfig.temperature,
        top_p: sessionConfig.top_p,
        max_tokens: sessionConfig.max_tokens,
        username: os.userInfo().username || "local-user"
    });
    const escapedPayload = payload.replace(/'/g, "'\\''");
    const command = `curl -s -X POST -H "Content-Type: application/json" -d '${escapedPayload}' https://theshellmaster-cypher-coder.hf.space/api/chat`;
    addLog("DEBUG", `Appel API: modèle=${sessionConfig.model}`);
    const output = execSync(command, { maxBuffer: 10 * 1024 * 1024 }).toString();
    try {
        const responseJson = JSON.parse(output);
        if (responseJson.error) throw new Error(responseJson.error);
        return responseJson.message;
    } catch (e) {
        throw new Error(`Erreur de connexion: ${e.message}\nRéponse brute: ${output.slice(0, 200)}`);
    }
}

// ─── Helpers fichiers ─────────────────────────────────────────────────────────
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
                if (currentDepth < maxDepth) results = results.concat(listFilesRecursive(filePath, maxDepth, currentDepth + 1));
            } else {
                results.push({ path: relativePath, type: 'fichier', sizeBytes: stat.size });
            }
        }
    } catch (_) {}
    return results;
}

// ─── Confirmation utilisateur (sans inquirer) ─────────────────────────────────
async function confirm(rl, question, defaultYes = true) {
    const hint = defaultYes ? '[O/n]' : '[o/N]';
    return new Promise(resolve => {
        rl.question(theme.info(`  ${question} ${hint} `), answer => {
            const a = answer.trim().toLowerCase();
            if (a === '') resolve(defaultYes);
            else resolve(a === 'o' || a === 'oui' || a === 'y' || a === 'yes');
        });
    });
}

// ─── Exécuteur d'outils ───────────────────────────────────────────────────────
async function handleToolExecution(name, args, rl) {
    const resolvedPath = path.resolve(args.path || ".");
    switch (name) {
        case 'read_file': {
            const targetPath = path.resolve(args.path);
            if (!fs.existsSync(targetPath)) return `Erreur: fichier introuvable à ${targetPath}`;
            return fs.readFileSync(targetPath, 'utf8');
        }
        case 'write_file': {
            const targetPath = path.resolve(args.path);
            console.log(theme.info(`\n  Cypher veut créer/modifier : `) + chalk.cyan(targetPath));
            const ok = await confirm(rl, 'Autoriser ?', true);
            if (!ok) return "Action refusée par l'utilisateur.";
            const dir = path.dirname(targetPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(targetPath, args.content, 'utf8');
            console.log(theme.done(`  ✓ Fichier enregistré.\n`));
            return `Fichier écrit avec succès à ${targetPath}`;
        }
        case 'patch_file': {
            const targetPath = path.resolve(args.path);
            console.log(theme.info(`\n  Cypher veut modifier un bloc dans : `) + chalk.cyan(targetPath));
            console.log(theme.error(`  --- AVANT ---\n`) + args.search);
            console.log(theme.done(`  --- APRÈS ---\n`) + args.replace);
            const ok = await confirm(rl, 'Autoriser ce remplacement ?', true);
            if (!ok) return "Action refusée.";
            if (!fs.existsSync(targetPath)) return `Erreur: ${targetPath} introuvable.`;
            const content = fs.readFileSync(targetPath, 'utf8');
            const occ = content.split(args.search).length - 1;
            if (occ === 0) return "Erreur: bloc à remplacer introuvable.";
            if (occ > 1) return `Erreur: bloc trouvé ${occ} fois, sois plus spécifique.`;
            fs.writeFileSync(targetPath, content.replace(args.search, args.replace), 'utf8');
            console.log(theme.done(`  ✓ Remplacement appliqué.\n`));
            return "Remplacement appliqué avec succès.";
        }
        case 'list_dir': {
            const targetPath = path.resolve(args.path || ".");
            if (!fs.existsSync(targetPath)) return `Erreur: dossier introuvable à ${targetPath}`;
            if (args.recursive) return JSON.stringify(listFilesRecursive(targetPath, 3, 1), null, 2);
            const items = fs.readdirSync(targetPath).map(item => {
                const s = fs.statSync(path.join(targetPath, item));
                return { name: item, type: s.isDirectory() ? 'dossier' : 'fichier', sizeBytes: s.size };
            });
            return JSON.stringify(items, null, 2);
        }
        case 'find_files': {
            const startDir = path.resolve(args.path || ".");
            const escaped = args.pattern.replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\\\*/g, '.*').replace(/\\\?/g, '.');
            const regex = new RegExp(`^${escaped}$`, 'i');
            const all = listFilesRecursive(startDir, 5, 1);
            return JSON.stringify(all.filter(i => i.type === 'fichier' && regex.test(path.basename(i.path))).map(i => i.path), null, 2);
        }
        case 'grep_search': {
            const startDir = path.resolve(args.path || ".");
            const query = args.query.toLowerCase();
            const all = listFilesRecursive(startDir, 5, 1);
            const matches = [];
            for (const item of all) {
                if (item.type !== 'fichier' || item.sizeBytes > 1024 * 1024) continue;
                const content = fs.readFileSync(item.path, 'utf8');
                if (content.includes('\u0000')) continue;
                content.split('\n').forEach((line, idx) => {
                    if (line.toLowerCase().includes(query)) matches.push({ file: item.path, line: idx + 1, content: line.trim() });
                });
                if (matches.length >= 50) break;
            }
            return JSON.stringify(matches, null, 2);
        }
        case 'run_command': {
            console.log(theme.info(`\n  Cypher veut exécuter :`));
            console.log(chalk.bgBlack.white(`  $ ${args.command}  \n`));
            const ok = await confirm(rl, 'Autoriser cette commande ?', false);
            if (!ok) return "Action refusée par l'utilisateur.";
            try {
                const stdout = execSync(args.command, { stdio: 'pipe' }).toString();
                console.log(chalk.dim(stdout));
                return `Commande exécutée.\nStdout:\n${stdout}`;
            } catch (err) {
                const errMsg = err.stderr ? err.stderr.toString() : err.message;
                console.log(theme.error(`  ✖ Erreur: ${errMsg}\n`));
                return `Commande échouée.\nErreur:\n${errMsg}`;
            }
        }
        default:
            return `Erreur: outil inconnu '${name}'`;
    }
}

// ─── Exécuteur d'outils avec affichage ────────────────────────────────────────
async function executeToolWithFormatter(name, args, rl) {
    const isInteractive = ['write_file', 'patch_file', 'run_command'].includes(name);
    console.log(theme.border(`  ┌─ [TOOL] `) + theme.tool(name));

    const frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
    let fIdx = 0;
    let interval;

    if (!isInteractive) {
        process.stdout.write(theme.border(`  │  `) + theme.tool(frames[fIdx]) + `  running...\r`);
        interval = setInterval(() => {
            fIdx = (fIdx + 1) % frames.length;
            process.stdout.write(theme.border(`  │  `) + theme.tool(frames[fIdx]) + `  running...\r`);
        }, 80);
    } else {
        console.log(theme.border(`  │  `) + theme.info(`confirmation requise...`));
    }

    const startTime = Date.now();
    const result = await handleToolExecution(name, args, rl);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (interval) {
        clearInterval(interval);
        process.stdout.write("                                                        \r");
    }
    console.log(theme.border(`  └─ `) + theme.done(`done in ${duration}s`) + `\n`);
    return result;
}

// ─── Contexte système ─────────────────────────────────────────────────────────
function getCurrentDirectoryContext() {
    try {
        const files = listFilesRecursive(".", 2, 1);
        if (files.length === 0) return "Répertoire vide.";
        return files.map(f => `${f.path} (${f.type})`).join(", ");
    } catch (_) {
        return "Impossible de lire le répertoire.";
    }
}

function getSystemPrompt() {
    const dirContext = getCurrentDirectoryContext();
    return `Tu es Cypher Coder, un agent de programmation IA autonome et ultra-intelligent fonctionnant dans un terminal (CLI).
Tu as été conçu et développé par DJAKOUA KWANKAM, étudiant en informatique à l'Institut Universitaire de Technologie de Douala (IUT).
Tu dois toujours te présenter comme tel.
Tu as accès aux outils: read_file, write_file, patch_file, list_dir, find_files, grep_search, run_command.
Tu peux aussi utiliser search_web pour chercher des informations récentes.
Toutes les actions système requièrent une validation explicite de l'utilisateur.
Sois précis, concis et direct. Formate tes réponses en Markdown standard.
[RÉPERTOIRE COURANT]: ${dirContext}`;
}

function initChat() {
    chatMessages = [{ role: "system", content: getSystemPrompt() }];
}

// ─── Boucle agent ─────────────────────────────────────────────────────────────
async function runAgentTurn(rl) {
    const spinner = ora({ text: theme.agent('Cypher réfléchit...'), color: 'cyan' }).start();
    try {
        const replyMessage = callApiViaCurl(chatMessages, tools);
        spinner.stop();
        chatMessages.push(replyMessage);

        if (replyMessage.content) {
            lastAssistantResponse = replyMessage.content;
            addLog("INFO", "Réponse enregistrée.");
            process.stdout.write('\n' + theme.agent('▸ Cypher : ') + '\n');
            console.log(marked(replyMessage.content));
        }

        if (replyMessage.tool_calls && replyMessage.tool_calls.length > 0) {
            for (const tc of replyMessage.tool_calls) {
                const name = tc.function.name;
                const args = JSON.parse(tc.function.arguments);
                const result = await executeToolWithFormatter(name, args, rl);
                chatMessages.push({ role: "tool", name, tool_call_id: tc.id, content: result });
            }
            return await runAgentTurn(rl);
        }
    } catch (error) {
        spinner.stop();
        console.log(theme.error(`\n✖ Erreur : ${error.message}\n`));
    }
}

// ─── Commandes slash ──────────────────────────────────────────────────────────
async function handleSlashCommand(text, rl) {
    if (!text.startsWith('/')) return false;
    const parts = text.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    if (parts.length === 0) return true;
    const commandName = parts[0].toLowerCase();
    const rawArgs = parts.slice(1).map(a => a.replace(/^["']|["']$/g, ''));
    const cleanArgs = [];
    const flags = {};
    for (let i = 0; i < rawArgs.length; i++) {
        if (rawArgs[i].startsWith('--')) {
            const key = rawArgs[i].slice(2);
            flags[key] = (rawArgs[i+1] && !rawArgs[i+1].startsWith('--')) ? rawArgs[++i] : true;
        } else {
            cleanArgs.push(rawArgs[i]);
        }
    }
    addLog("INFO", `Commande slash: ${text}`);
    commandHistory.push(text);

    switch (commandName) {
        case '/help':
            console.log(theme.info('\n  CYPHER CODER CLI — COMMANDES DISPONIBLES\n'));
            const categories = [
                { title: 'Session', cmds: SLASH_COMMANDS.slice(0, 9) },
                { title: 'Mémoire & Contexte', cmds: SLASH_COMMANDS.slice(9, 17) },
                { title: 'Historique', cmds: SLASH_COMMANDS.slice(17, 25) },
                { title: 'Modèle & Config', cmds: SLASH_COMMANDS.slice(25, 37) },
                { title: 'Fichiers', cmds: SLASH_COMMANDS.slice(37, 46) },
                { title: 'Code & Exécution', cmds: SLASH_COMMANDS.slice(46, 55) },
                { title: 'Outils & Web', cmds: SLASH_COMMANDS.slice(55, 64) },
                { title: 'Affichage', cmds: SLASH_COMMANDS.slice(64, 72) },
                { title: 'Config & Credentials', cmds: SLASH_COMMANDS.slice(72, 82) },
                { title: 'Monitoring & Debug', cmds: SLASH_COMMANDS.slice(82, 92) },
                { title: 'Automatisation', cmds: SLASH_COMMANDS.slice(92) },
            ];
            for (const cat of categories) {
                console.log(theme.command(`  ${cat.title} :`));
                for (const c of cat.cmds) {
                    console.log(`    ${theme.tool(c.cmd.padEnd(24))} ${theme.dim(c.desc)}`);
                }
                console.log('');
            }
            break;
        case '/exit': case '/quit':
            console.log(theme.dim('\n  Fermeture de Cypher Coder. À bientôt !\n'));
            rl.close();
            process.exit(0);
        case '/clear':
            console.clear();
            console.log(BANNER + '\n');
            break;
        case '/reset':
            initChat(); commandHistory = []; loadedFiles = [];
            console.log(theme.done('  Session réinitialisée. Contexte et historique effacés.\n'));
            break;
        case '/restart':
            initChat(); console.clear(); console.log(BANNER + '\n');
            console.log(theme.done('  Cypher Coder redémarré.\n'));
            break;
        case '/version':
            console.log(theme.info(`\n  Cypher Coder v${VERSION}\n`));
            break;
        case '/about':
            console.log(theme.info('\n  === À propos de Cypher Coder ==='));
            console.log(`  Créateur  : ${theme.agent(AUTHOR)}`);
            console.log(`  Institut  : Institut Universitaire de Technologie de Douala (IUT)`);
            console.log(`  Modèle    : ${sessionConfig.model}`);
            console.log(`  Version   : ${VERSION}`);
            console.log(`  GitHub    : TheShellMaster\n`);
            break;
        case '/status':
            console.log(theme.info('\n  === Statut de la session ==='));
            console.log(`  Dossier de travail : ${chalk.cyan(path.resolve('.'))}`);
            console.log(`  Modèle actif       : ${theme.agent(sessionConfig.model)}`);
            console.log(`  Température        : ${sessionConfig.temperature}`);
            console.log(`  Max tokens         : ${sessionConfig.max_tokens}`);
            console.log(`  Messages en mémoire: ${chatMessages.length}`);
            console.log(`  Fichiers chargés   : ${loadedFiles.length}`);
            console.log(`  Commandes tapées   : ${commandHistory.length}\n`);
            break;
        case '/tokens':
            console.log(theme.info(`\n  Messages en contexte : ${chatMessages.length}`));
            console.log(theme.info(`  Fichiers chargés     : ${loadedFiles.length}\n`));
            break;
        case '/history':
            if (cleanArgs[0] === 'clear') { commandHistory = []; console.log(theme.done('  Historique effacé.\n')); break; }
            if (cleanArgs[0] === 'save') {
                const file = cleanArgs[1] || 'cypher_history.txt';
                fs.writeFileSync(file, commandHistory.join('\n'), 'utf8');
                console.log(theme.done(`  Historique exporté dans ${file}\n`));
                break;
            }
            if (cleanArgs[0] === 'search') {
                const term = cleanArgs.slice(1).join(' ').toLowerCase();
                const found = commandHistory.filter(h => h.toLowerCase().includes(term));
                found.forEach((h, i) => console.log(`  ${theme.dim(String(i+1).padStart(3))}  ${h}`));
                break;
            }
            console.log(theme.info('\n  Historique de la session :'));
            commandHistory.forEach((h, i) => console.log(`  ${theme.dim(String(i+1).padStart(3))}  ${h}`));
            console.log('');
            break;
        case '/last':
            console.log(theme.agent('\n▸ Cypher (dernier message) :'));
            console.log(lastAssistantResponse || theme.dim('  Aucune réponse enregistrée.'));
            console.log('');
            break;
        case '/redo':
            if (lastUserInput) {
                console.log(theme.user(`  ❯ Relancement : ${lastUserInput}\n`));
                chatMessages.push({ role: "user", content: lastUserInput });
                await runAgentTurn(rl);
            }
            break;
        case '/model':
            if (cleanArgs[0] === 'list') {
                console.log(theme.info('\n  Modèles disponibles :'));
                const models = ['Qwen/Qwen2.5-Coder-32B-Instruct','Qwen/Qwen2.5-Coder-7B-Instruct','bigcode/starcoder2-15b','deepseek-ai/deepseek-coder-33b-instruct'];
                models.forEach(m => {
                    const active = m === sessionConfig.model ? theme.agent(' [actif]') : '';
                    console.log(`  ${theme.command(m)}${active}`);
                });
                console.log('');
            } else if (cleanArgs[0] === 'set') {
                sessionConfig.model = cleanArgs.slice(1).join(' ');
                console.log(theme.done(`  Modèle changé : ${sessionConfig.model}\n`));
            } else {
                console.log(theme.info(`\n  Modèle actif : ${theme.agent(sessionConfig.model)}\n`));
            }
            break;
        case '/temperature':
            if (cleanArgs[0]) { sessionConfig.temperature = parseFloat(cleanArgs[0]); console.log(theme.done(`  Température : ${sessionConfig.temperature}\n`)); }
            else console.log(theme.info(`  Température actuelle : ${sessionConfig.temperature}\n`));
            break;
        case '/max_tokens':
            if (cleanArgs[0]) { sessionConfig.max_tokens = parseInt(cleanArgs[0], 10); console.log(theme.done(`  Max tokens : ${sessionConfig.max_tokens}\n`)); }
            break;
        case '/system':
            if (cleanArgs[0] === 'reset') { initChat(); console.log(theme.done('  System prompt réinitialisé.\n')); }
            else if (cleanArgs[0] === 'set') { chatMessages[0] = { role: 'system', content: cleanArgs.slice(1).join(' ') }; console.log(theme.done('  System prompt modifié.\n')); }
            else { console.log(theme.info('\n  System prompt actuel :\n')); console.log(theme.dim(chatMessages[0]?.content || 'Aucun')); console.log(''); }
            break;
        case '/file':
            if (cleanArgs[0] === 'load') {
                const fp = path.resolve(cleanArgs[1] || '');
                if (!fp || !fs.existsSync(fp)) { console.log(theme.error(`  Fichier introuvable: ${fp}\n`)); break; }
                const content = fs.readFileSync(fp, 'utf8');
                loadedFiles.push(fp);
                chatMessages.push({ role: 'user', content: `[Fichier chargé: ${fp}]\n\`\`\`\n${content}\n\`\`\`` });
                console.log(theme.done(`  Fichier chargé en contexte: ${fp}\n`));
            } else if (cleanArgs[0] === 'read') {
                const fp = path.resolve(cleanArgs[1] || '');
                if (!fp || !fs.existsSync(fp)) { console.log(theme.error(`  Fichier introuvable\n`)); break; }
                console.log(theme.info(`\n  === ${fp} ===\n`));
                console.log(fs.readFileSync(fp, 'utf8'));
            } else if (cleanArgs[0] === 'list') {
                console.log(theme.info('\n  Fichiers chargés en contexte :'));
                loadedFiles.length ? loadedFiles.forEach(f => console.log(`  - ${f}`)) : console.log(theme.dim('  Aucun fichier chargé.'));
                console.log('');
            } else if (cleanArgs[0] === 'clear') {
                loadedFiles = []; console.log(theme.done('  Contexte de fichiers effacé.\n'));
            } else if (cleanArgs[0] === 'write') {
                const fp = cleanArgs[1] || 'cypher_output.md';
                fs.writeFileSync(fp, lastAssistantResponse, 'utf8');
                console.log(theme.done(`  Réponse exportée dans ${fp}\n`));
            }
            break;
        case '/exec': {
            const cmd = cleanArgs.join(' ');
            if (!cmd) { console.log(theme.error('  Usage: /exec <commande>\n')); break; }
            await executeToolWithFormatter('run_command', { command: cmd }, rl);
            break;
        }
        case '/shell':
            console.log(theme.info('  Ouverture du shell... (Ctrl+D pour revenir)\n'));
            const sh = spawn('/bin/bash', { stdio: 'inherit' });
            await new Promise(r => sh.on('close', r));
            break;
        case '/tools':
            console.log(theme.info('\n  Outils disponibles :'));
            tools.forEach(t => console.log(`  ${theme.command(t.function.name.padEnd(16))} ${theme.dim(t.function.description)}`));
            console.log('');
            break;
        case '/config':
            if (cleanArgs[0] === 'set' && cleanArgs[1] && cleanArgs[2]) {
                sessionConfig[cleanArgs[1]] = cleanArgs[2];
                console.log(theme.done(`  Config : ${cleanArgs[1]} = ${cleanArgs[2]}\n`));
            } else if (cleanArgs[0] === 'reset') {
                console.log(theme.done('  Config réinitialisée.\n'));
            } else {
                console.log(theme.info('\n  Configuration actuelle :'));
                Object.entries(sessionConfig).forEach(([k, v]) => {
                    if (k !== 'env') console.log(`  ${theme.command(k.padEnd(16))} ${String(v)}`);
                });
                console.log('');
            }
            break;
        case '/env':
            if (cleanArgs[0] === 'list') {
                console.log(theme.info('\n  Variables d\'environnement :'));
                Object.entries(sessionConfig.env).forEach(([k, v]) => console.log(`  ${theme.command(k)} = ${v}`));
                if (!Object.keys(sessionConfig.env).length) console.log(theme.dim('  Aucune variable définie.'));
                console.log('');
            } else if (cleanArgs[0] === 'set' && cleanArgs[1] && cleanArgs[2]) {
                sessionConfig.env[cleanArgs[1]] = cleanArgs[2];
                console.log(theme.done(`  ${cleanArgs[1]} défini.\n`));
            }
            break;
        case '/debug':
            sessionConfig.verbose = cleanArgs[0] === 'on';
            console.log(theme.done(`  Mode debug : ${sessionConfig.verbose ? 'activé' : 'désactivé'}\n`));
            break;
        case '/verbose':
            sessionConfig.verbose = cleanArgs[0] === 'on';
            console.log(theme.done(`  Mode verbose : ${sessionConfig.verbose ? 'activé' : 'désactivé'}\n`));
            break;
        case '/log':
            if (cleanArgs[0] === 'clear') { logs = []; console.log(theme.done('  Logs effacés.\n')); }
            else if (cleanArgs[0] === 'save') {
                const file = cleanArgs[1] || 'cypher.log';
                fs.writeFileSync(file, logs.join('\n'), 'utf8');
                console.log(theme.done(`  Logs exportés dans ${file}\n`));
            } else {
                console.log(theme.info('\n  === Logs récents ==='));
                logs.slice(-20).forEach(l => console.log(theme.dim(`  ${l}`)));
                console.log('');
            }
            break;
        case '/stats':
            console.log(theme.info('\n  === Statistiques ==='));
            console.log(`  Messages en mémoire : ${chatMessages.length}`);
            console.log(`  Fichiers chargés    : ${loadedFiles.length}`);
            console.log(`  Commandes tapées    : ${commandHistory.length}`);
            console.log(`  Entrées de log      : ${logs.length}\n`);
            break;
        case '/benchmark': {
            console.log(theme.info('  Lancement du benchmark API...'));
            const start = Date.now();
            try {
                callApiViaCurl([{ role: "user", content: "Dis hello" }], []);
                console.log(theme.done(`  Latence aller-retour : ${Date.now() - start}ms\n`));
            } catch (e) { console.log(theme.error(`  Échec : ${e.message}\n`)); }
            break;
        }
        case '/ping': {
            console.log(theme.info('  Ping API...'));
            try {
                const s = Date.now();
                execSync("curl -sI https://theshellmaster-cypher-coder.hf.space/ | head -n 1");
                console.log(theme.done(`  Connectivité OK (${Date.now() - s}ms)\n`));
            } catch (_) { console.log(theme.error('  Connexion échouée.\n')); }
            break;
        }
        case '/trace':
            console.log(theme.info('  Dernier log :'), theme.dim(logs[logs.length - 1] || 'Aucun'));
            break;
        case '/inspect':
            const vname = cleanArgs[0];
            if (vname === 'chatMessages') console.log(chatMessages);
            else if (vname === 'loadedFiles') console.log(loadedFiles);
            else console.log(sessionConfig);
            break;
        case '/macro':
            if (cleanArgs[0] === 'save') {
                macros[cleanArgs[1]] = [...commandHistory];
                console.log(theme.done(`  Macro '${cleanArgs[1]}' sauvegardée.\n`));
            } else if (cleanArgs[0] === 'run') {
                if (macros[cleanArgs[1]]) {
                    for (const cmd of macros[cleanArgs[1]]) {
                        if (!cmd.startsWith('/macro')) await handleSlashCommand(cmd, rl);
                    }
                } else console.log(theme.error('  Macro introuvable.\n'));
            } else if (cleanArgs[0] === 'list') {
                console.log(theme.info('  Macros :'), Object.keys(macros).join(', ') || theme.dim('aucune'));
            } else if (cleanArgs[0] === 'delete') {
                delete macros[cleanArgs[1]];
                console.log(theme.done(`  Macro '${cleanArgs[1]}' supprimée.\n`));
            }
            break;
        case '/loop': {
            const times = parseInt(cleanArgs[0], 10);
            const cmdToLoop = cleanArgs.slice(1).join(' ');
            if (!isNaN(times) && cmdToLoop) {
                for (let idx = 0; idx < times; idx++) {
                    console.log(theme.info(`  [Boucle ${idx+1}/${times}]`));
                    await handleSlashCommand(cmdToLoop, rl);
                }
            }
            break;
        }
        case '/memory':
            if (cleanArgs[0] === 'clear') { chatMessages = [chatMessages[0]]; console.log(theme.done('  Mémoire effacée.\n')); }
            else {
                console.log(theme.info('\n  Mémoire de la session :'));
                chatMessages.forEach((m, i) => {
                    if (m.role !== 'system') console.log(`  ${theme.dim(String(i).padStart(3))} [${m.role}] ${String(m.content || '').slice(0, 80)}...`);
                });
                console.log('');
            }
            break;
        case '/context':
            if (cleanArgs[0] === 'clear') { loadedFiles = []; console.log(theme.done('  Contexte effacé.\n')); }
            else if (cleanArgs[0] === 'save') {
                savedContexts[cleanArgs[1]] = { messages: [...chatMessages], files: [...loadedFiles] };
                console.log(theme.done(`  Contexte '${cleanArgs[1]}' sauvegardé.\n`));
            } else if (cleanArgs[0] === 'load') {
                if (savedContexts[cleanArgs[1]]) {
                    chatMessages = [...savedContexts[cleanArgs[1]].messages];
                    loadedFiles = [...savedContexts[cleanArgs[1]].files];
                    console.log(theme.done(`  Contexte '${cleanArgs[1]}' chargé.\n`));
                } else console.log(theme.error('  Contexte introuvable.\n'));
            } else if (cleanArgs[0] === 'list') {
                console.log(theme.info('  Contextes :'), Object.keys(savedContexts).join(', ') || theme.dim('aucun'));
            } else {
                console.log(theme.info(`  Fichiers chargés : ${loadedFiles.length || 'aucun'}\n`));
            }
            break;
        default:
            console.log(theme.error(`  Commande inconnue : ${commandName}. Tape /help.\n`));
            break;
    }
    return true;
}

// ─── BOUCLE PRINCIPALE avec readline + autocomplete ───────────────────────────
async function startReadlineLoop() {
    const username = os.userInfo().username || "local-user";

    // rl avec autocomplete natif sur '/'
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        completer: slashCompleter,
        terminal: true,
        historySize: 500,
    });

    // Afficher le menu autocomplete dès que l'user tape '/'
    rl.on('line', () => {}); // nécessaire pour activer le mode interactif

    const prompt = () => {
        rl.question(theme.user(`❯ ${username} : `), async (text) => {
            text = text.trim();
            if (!text) { prompt(); return; }

            const time = new Date().toTimeString().split(' ')[0];
            console.log(theme.border(`  └ [${time}]`));

            if (text.startsWith('/')) {
                await handleSlashCommand(text, rl);
                prompt();
                return;
            }

            lastUserInput = text;
            commandHistory.push(text);
            chatMessages.push({ role: "user", content: text });
            await runAgentTurn(rl);
            prompt();
        });
    };

    // Historique navigable avec ↑↓ (readline le gère nativement via historySize)
    rl.on('close', () => {
        console.log(theme.dim('\n  Session terminée.\n'));
        process.exit(0);
    });

    prompt();
    return rl;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
    const username = os.userInfo().username || "local-user";
    const sessionId = `sess_${Math.random().toString(36).substring(2, 10)}`;

    console.log(BANNER);
    console.log('');
    console.log(theme.agent('  CYPHER CODER CLI — L\'IA experte en developpement local'));
    console.log(theme.agent(`  Cree par DJAKOUA KWANKAM — Institut Universitaire de Technologie de Douala (IUT)`));
    console.log(theme.border('  ─────────────────────────────────────────────────────────────────'));
    console.log(theme.info(`  Connecte en tant que : `) + theme.agent(`@${username}`));
    console.log(theme.info(`  Modele actif         : `) + theme.text(sessionConfig.model));
    console.log(theme.info(`  Session              : `) + theme.text(sessionId));
    console.log(theme.info(`  Jeu de donnees       : `) + theme.agent(`Collecte active pour entrainement`));
    console.log(theme.border('  ─────────────────────────────────────────────────────────────────'));
    console.log(theme.command('  Tape /help pour voir les commandes disponibles.\n'));

    initChat();

    // Support arguments directs
    const args = process.argv.slice(2);
    if (args.length > 0) {
        const initialRequest = args.join(" ");
        const time = new Date().toTimeString().split(' ')[0];
        console.log(theme.user(`❯ ${username} : `) + initialRequest);
        console.log(theme.border(`  └ [${time}]`));
        if (initialRequest.startsWith('/')) {
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            await handleSlashCommand(initialRequest, rl);
            rl.close();
        } else {
            lastUserInput = initialRequest;
            commandHistory.push(initialRequest);
            chatMessages.push({ role: "user", content: initialRequest });
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            await runAgentTurn(rl);
            rl.close();
        }
    }

    await startReadlineLoop();
}

main();
