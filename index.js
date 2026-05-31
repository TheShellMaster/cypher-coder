#!/usr/bin/env node

import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

// Configurer le rendu Markdown pour le terminal (styles chalk)
marked.setOptions({
    renderer: new TerminalRenderer({
        code: chalk.yellow,
        blockquote: chalk.gray.italic,
        html: chalk.gray,
        heading: chalk.cyan.bold,
        firstHeading: chalk.cyan.bold,
        listitem: chalk.white,
        table: chalk.gray,
        tab: 2
    })
});

const AUTHOR = "DJAKOUA KWANKAM";
const APP_NAME = "Cypher Coder";

// Banner ASCII Art pour l'interface de démarrage
const BANNER = chalk.cyan.bold(`
   _____             _---------------+
  / ____|           | |  ____  _      |
 | |    _   _ _ __  | |__|  _ \\| |    |  CYPHER CODER CLI
 | |   | | | | '_ \\ |  __  |_) | |    |  L'IA experte en développement local
 | |___| |_| | |_) || |  |  __/| |___ |  Créé par ${AUTHOR}
  \\_____\\__, | .__/ |_|  |_|   |_____||  Institut Universitaire de Douala (IUD)
         __/ | |                      |
        |___/|_|                      +-----------------------+
`);

// -----------------------------------------------------
// Définition des Outils Globaux (Capabilities)
// -----------------------------------------------------
const tools = [
    {
        type: "function",
        function: {
            name: "read_file",
            description: "Lit le contenu complet d'un fichier local sur la machine de l'utilisateur.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "Le chemin du fichier à lire (relatif ou absolu)." }
                },
                required: ["path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "write_file",
            description: "Crée ou écrase un fichier local avec un nouveau contenu.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "Le chemin du fichier à écrire." },
                    content: { type: "string", description: "Le contenu textuel à écrire dans le fichier." }
                },
                required: ["path", "content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "patch_file",
            description: "Modifie de manière ciblée un bloc de texte unique dans un fichier existant (Search and Replace). Utile pour modifier des gros fichiers sans les réécrire complètement.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "Le chemin du fichier à modifier." },
                    search: { type: "string", description: "Le bloc exact de code à remplacer (doit être unique dans le fichier)." },
                    replace: { type: "string", description: "Le nouveau bloc de code qui le remplace." }
                },
                required: ["path", "search", "replace"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "list_dir",
            description: "Liste les fichiers et dossiers dans un répertoire local. Peut être récursif.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "Le chemin du dossier à lister (par défaut '.')." },
                    recursive: { type: "boolean", description: "Si vrai, liste les sous-dossiers de manière récursive." }
                },
                required: ["path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "find_files",
            description: "Recherche des fichiers récursivement par nom en utilisant un motif joker (ex: '*.js', 'package.json'). Permet de repérer rapidement des fichiers dans des sous-dossiers.",
            parameters: {
                type: "object",
                properties: {
                    pattern: { type: "string", description: "Le motif de recherche (ex: '*.py', '*test*')." },
                    path: { type: "string", description: "Le chemin de départ pour la recherche (par défaut '.')." }
                },
                required: ["pattern"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "grep_search",
            description: "Recherche textuelle récursive dans tous les fichiers d'un dossier pour trouver les occurrences d'une chaîne de caractères spécifique (similaire à ripgrep).",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "La chaîne de caractères ou le mot-clé à rechercher dans les fichiers." },
                    path: { type: "string", description: "Le chemin de départ pour la recherche (par défaut '.')." }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "run_command",
            description: "Exécute une commande système ou shell dans le terminal local de l'utilisateur.",
            parameters: {
                type: "object",
                properties: {
                    command: { type: "string", description: "La commande shell à exécuter." }
                },
                required: ["command"]
            }
        }
    }
];

// Outil d'exécution d'API robuste via curl pour contourner les problèmes de socket de Node.js
function callApiViaCurl(messages, clientTools) {
    const payload = JSON.stringify({ messages, tools: clientTools });
    const escapedPayload = payload.replace(/'/g, "'\\''");
    const command = `curl -s -X POST -H "Content-Type: application/json" -d '${escapedPayload}' https://theshellmaster-cypher-coder.hf.space/api/chat`;
    
    const output = execSync(command).toString();
    try {
        const responseJson = JSON.parse(output);
        if (responseJson.error) {
            throw new Error(responseJson.error);
        }
        return responseJson.message;
    } catch (e) {
        throw new Error(`Erreur de connexion avec le serveur Cypher: ${e.message}\nRéponse brute: ${output}`);
    }
}

// -----------------------------------------------------
// Implémentation algorithmique des résolveurs d'outils
// -----------------------------------------------------

// Helper de listing récursif propre
function listFilesRecursive(dir, maxDepth = 3, currentDepth = 1) {
    let results = [];
    try {
        const list = fs.readdirSync(dir);
        for (const file of list) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            const relativePath = path.relative(".", filePath);
            
            // Ignorer les dossiers indésirables
            if (file === 'node_modules' || file === '.git' || file === '.venv' || file === 'env' || file === '.cache' || file === 'package-lock.json') {
                continue;
            }
            
            if (stat.isDirectory()) {
                results.push({ path: relativePath, type: 'dossier' });
                if (currentDepth < maxDepth) {
                    results = results.concat(listFilesRecursive(filePath, maxDepth, currentDepth + 1));
                }
            } else {
                results.push({ path: relativePath, type: 'fichier', sizeBytes: stat.size });
            }
        }
    } catch (e) {
        // Ignorer les dossiers inaccessibles
    }
    return results;
}

// Résolveurs locaux pour les outils système
async function handleToolExecution(name, args) {
    const resolvedPath = path.resolve(args.path || ".");
    
    switch (name) {
        case 'read_file':
            try {
                const targetPath = path.resolve(args.path);
                if (!fs.existsSync(targetPath)) {
                    return `Erreur: Le fichier n'existe pas à l'emplacement ${targetPath}`;
                }
                const content = fs.readFileSync(targetPath, 'utf8');
                return content;
            } catch (err) {
                return `Erreur lors de la lecture du fichier: ${err.message}`;
            }
            
        case 'write_file':
            try {
                const targetPath = path.resolve(args.path);
                console.log(chalk.yellow(`\n📂 Cypher Coder veut modifier/créer le fichier : ${chalk.cyan(targetPath)}`));
                const { confirmWrite } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'confirmWrite',
                        message: 'Autoriser la création ou modification de ce fichier ?',
                        default: true
                    }
                ]);
                
                if (!confirmWrite) {
                    return "Action refusée par l'utilisateur.";
                }
                
                const dir = path.dirname(targetPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                
                fs.writeFileSync(targetPath, args.content, 'utf8');
                console.log(chalk.green(`✓ Fichier enregistré avec succès.`));
                return `Fichier écrit avec succès à l'emplacement ${targetPath}`;
            } catch (err) {
                return `Erreur lors de l'écriture du fichier: ${err.message}`;
            }
            
        case 'patch_file':
            try {
                const targetPath = path.resolve(args.path);
                console.log(chalk.yellow(`\n📝 Cypher Coder veut modifier un bloc de code dans : ${chalk.cyan(targetPath)}`));
                
                console.log(chalk.dim("--- BLOC À RECHERCHER ---"));
                console.log(chalk.red(args.search));
                console.log(chalk.dim("--- NOUVEAU BLOC ---"));
                console.log(chalk.green(args.replace));
                console.log(chalk.dim("------------------------"));

                const { confirmPatch } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'confirmPatch',
                        message: 'Autoriser ce remplacement ciblé ?',
                        default: true
                    }
                ]);
                
                if (!confirmPatch) {
                    return "Action refusée par l'utilisateur.";
                }
                
                if (!fs.existsSync(targetPath)) {
                    return `Erreur: Le fichier ${targetPath} n'existe pas.`;
                }
                
                const content = fs.readFileSync(targetPath, 'utf8');
                const occurrences = content.split(args.search).length - 1;
                
                if (occurrences === 0) {
                    return `Erreur: Le bloc de texte à remplacer n'a pas été trouvé. Assure-toi que les espaces et la mise en page correspondent exactement.`;
                }
                if (occurrences > 1) {
                    return `Erreur: Le bloc à remplacer apparaît ${occurrences} fois dans le fichier. Rends la recherche plus spécifique en englobant d'autres lignes.`;
                }
                
                const newContent = content.replace(args.search, args.replace);
                fs.writeFileSync(targetPath, newContent, 'utf8');
                console.log(chalk.green(`✓ Remplacement appliqué avec succès.`));
                return "Remplacement appliqué avec succès de manière unique.";
            } catch (err) {
                return `Erreur lors du remplacement: ${err.message}`;
            }
            
        case 'list_dir':
            try {
                const targetPath = path.resolve(args.path || ".");
                if (!fs.existsSync(targetPath)) {
                    return `Erreur: Le dossier n'existe pas à l'emplacement ${targetPath}`;
                }
                if (args.recursive) {
                    const files = listFilesRecursive(targetPath, 3, 1);
                    return JSON.stringify(files, null, 2);
                } else {
                    const items = fs.readdirSync(targetPath);
                    const list = items.map(item => {
                        const itemPath = path.join(targetPath, item);
                        const itemStats = fs.statSync(itemPath);
                        return {
                            name: item,
                            type: itemStats.isDirectory() ? 'dossier' : 'fichier',
                            sizeBytes: itemStats.size
                        };
                    });
                    return JSON.stringify(list, null, 2);
                }
            } catch (err) {
                return `Erreur lors de la liste du dossier: ${err.message}`;
            }
            
        case 'find_files':
            try {
                const startDir = path.resolve(args.path || ".");
                const escapedPattern = args.pattern
                    .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
                    .replace(/\\\*/g, '.*')
                    .replace(/\\\?/g, '.');
                const regex = new RegExp(`^${escapedPattern}$`, 'i');
                
                const allFiles = listFilesRecursive(startDir, 5, 1);
                const matched = allFiles
                    .filter(item => item.type === 'fichier' && regex.test(path.basename(item.path)))
                    .map(item => item.path);
                    
                return JSON.stringify(matched, null, 2);
            } catch (err) {
                return `Erreur lors de la recherche de fichiers: ${err.message}`;
            }
            
        case 'grep_search':
            try {
                const startDir = path.resolve(args.path || ".");
                const query = args.query.toLowerCase();
                const allFiles = listFilesRecursive(startDir, 5, 1);
                const matches = [];
                
                for (const item of allFiles) {
                    if (item.type !== 'fichier') continue;
                    if (item.sizeBytes > 1024 * 1024) continue; // max 1MB
                    
                    const content = fs.readFileSync(item.path, 'utf8');
                    if (content.includes('\u0000')) continue; // skip binary
                    
                    const lines = content.split('\n');
                    lines.forEach((line, idx) => {
                        if (line.toLowerCase().includes(query)) {
                            matches.push({
                                file: item.path,
                                lineNumber: idx + 1,
                                lineContent: line.trim()
                            });
                        }
                    });
                    
                    if (matches.length >= 50) break;
                }
                return JSON.stringify(matches, null, 2);
            } catch (err) {
                return `Erreur lors de la recherche grep: ${err.message}`;
            }
            
        case 'run_command':
            try {
                console.log(chalk.yellow(`\n🖥️ Cypher Coder veut exécuter la commande suivante :`));
                console.log(chalk.bgBlack.white(`  $ ${args.command}  `));
                
                const { confirmCommand } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'confirmCommand',
                        message: 'Autoriser l\'exécution de cette commande ?',
                        default: false
                    }
                ]);
                
                if (!confirmCommand) {
                    return "Action refusée par l'utilisateur.";
                }
                
                const stdout = execSync(args.command, { stdio: 'pipe' }).toString();
                console.log(chalk.dim(stdout));
                return `Commande exécutée avec succès.\nStdout:\n${stdout}`;
            } catch (err) {
                const errMsg = err.stderr ? err.stderr.toString() : err.message;
                console.log(chalk.red(`✖ Erreur de commande: ${errMsg}`));
                return `La commande a échoué.\nErreur:\n${errMsg}`;
            }
            
        default:
            return `Erreur: Outil inconnu '${name}'`;
    }
}

// -----------------------------------------------------
// Prompt Système Dynamique & Intelligent
// -----------------------------------------------------
function getCurrentDirectoryContext() {
    try {
        const files = listFilesRecursive(".", 2, 1);
        if (files.length === 0) return "Répertoire vide.";
        return files.map(f => `${f.path} (${f.type})`).join(", ");
    } catch (e) {
        return "Impossible de lire le répertoire.";
    }
}

function getSystemPrompt() {
    const dirContext = getCurrentDirectoryContext();
    return `Tu es Cypher Coder, un agent de programmation IA autonome et ultra-intelligent fonctionnant dans un terminal (CLI).
Tu as été conçu et développé par DJAKOUA KWANKAM, étudiant en informatique à l'Institut Universitaire de Douala (IUD).
Tu dois toujours te présenter comme tel.

Tu as accès à des outils locaux pour interagir avec le projet de l'utilisateur :
- read_file : Lit le code d'un fichier.
- write_file : Écrit un fichier.
- patch_file : Modifie de manière ciblée un bloc (Search & Replace), à privilégier pour les fichiers existants.
- list_dir : Inspecte l'arborescence.
- find_files : Recherche des fichiers par nom récursivement dans les sous-dossiers.
- grep_search : Recherche textuelle récursive dans le contenu des fichiers (comme grep/ripgrep).
- run_command : Exécute des commandes système.
Tu peux aussi utiliser search_web pour chercher des informations récentes sur internet.

[CAPABILITÉS SYSTÈME CLASSIFIÉES PAR CATÉGORIES] :
Tu es pleinement capable d'interagir avec le système de l'utilisateur via 'run_command' pour exécuter les commandes suivantes en cas de besoin :

1. Navigation & FS : ls, pwd, mkdir (-p), rmdir, touch, rm (-rf), cp (-r), mv, stat, du -sh, df -h (Note : Préfère list_dir ou find_files pour l'exploration de code).
2. Lecture & Édition : cat, less, head, tail (-f), grep (-rn), sed, awk, wc -l, diff, nano, vim, echo, sort, uniq, cut. (Note : Préfère read_file, patch_file, ou write_file pour modifier/lire directement).
3. Processus & Ressources : ps aux, top/htop, kill (-9), killall, jobs, bg, fg, free -h, uptime, lscpu, lsmem, uname -a, env, export, which, whereis, history.
4. Réseau : ping, curl, wget, ifconfig/ip a, ip route, netstat -tulnp, ss -tulnp, nmap, traceroute, dig, host, ssh (-keygen), scp, rsync, nc.
5. Gestion de paquets : apt (update/upgrade/install/remove/show), dpkg, snap, pip (install/list/freeze), npm (install/list/run), npx, cargo.
6. Permissions & Utilisateurs : chmod, chown, sudo, su, whoami, id, groups, passwd, useradd/userdel, usermod.
7. Archives & Compression : tar (-czf / -xzf), zip/unzip, gzip/gunzip, 7z.
8. Git : git init, git clone, git status, git add, git commit, git push, git pull, git fetch, git branch, git checkout (-b), git merge, git rebase, git log, git diff, git stash (pop), git reset --hard, git remote.
9. Docker : docker ps (-a), docker images, docker pull, docker run, docker stop/start, docker rm/rmi, docker exec, docker logs, docker build, docker-compose (up/down), docker volume, docker network.
10. Exécution & Compilation : python3, node, ts-node, bash, gcc/g++, javac/java, rustc, go run, php, ruby.
11. Utilitaires : watch, crontab, alias, source, lsof -i, strace, time, date, man.

[DIRECTIVE CRITIQUE DE PROACTIVITÉ ET D'AUTONOMIE] :
Tu es pleinement autonome et proactif. Si l'utilisateur te pose une question sur son code, son projet ou te demande de faire une modification :
1. N'ATTENDS PAS que l'utilisateur te donne manuellement les chemins des fichiers ou te demande de les lire.
2. N'EXIGE PAS de lui qu'il t'indique la structure.
3. Utilise directement et immédiatement tes outils de recherche :
   - Si tu cherches un fichier dans des sous-dossiers, appelle 'find_files' avec un motif.
   - Si tu cherches une fonction ou une variable, appelle 'grep_search' pour savoir dans quel fichier elle se trouve.
   - Si tu as besoin de voir la structure récursive complète, appelle 'list_dir' avec 'recursive: true'.
4. Lis les fichiers pertinents de toi-même puis réponds directement en proposant tes solutions ou en faisant les modifications.

[CONTEXTE DE L'ENVIRONNEMENT LOCAL] :
Le répertoire de travail actuel contient les dossiers et fichiers suivants au premier niveau : [${dirContext}].
Sers-toi de cette liste pour cibler tes recherches sans demander de précisions !

Sois précis, concis et direct. Formate tes réponses en Markdown standard.`;
}

let chatMessages = [];

function initChat() {
    chatMessages = [{"role": "system", "content": getSystemPrompt()}];
}

// -----------------------------------------------------
// Boucle Agent d'interaction CLI
// -----------------------------------------------------
async function runAgentTurn() {
    const spinner = ora(chalk.magenta('Cypher réfléchit...')).start();
    
    try {
        const replyMessage = callApiViaCurl(chatMessages, tools);
        spinner.stop();
        
        // Ajouter le message de l'assistant à l'historique
        chatMessages.push(replyMessage);
        
        if (replyMessage.content) {
            console.log(chalk.green(`\n🤖 Cypher : `));
            // Rendre le Markdown de l'IA avec formatage ANSI coloré
            console.log(marked(replyMessage.content));
        }
        
        // S'il y a des appels d'outils locaux à exécuter
        if (replyMessage.tool_calls && replyMessage.tool_calls.length > 0) {
            for (const tc of replyMessage.tool_calls) {
                const name = tc.function.name;
                const args = JSON.parse(tc.function.arguments);
                
                console.log(chalk.cyan(`⚙️ Exécution locale de l'outil [${name}]...`));
                const result = await handleToolExecution(name, args);
                
                // Ajouter le résultat de l'outil à la conversation
                chatMessages.push({
                    role: "tool",
                    name: name,
                    tool_call_id: tc.id,
                    content: result
                });
            }
            
            // Relancer le tour d'agent avec les retours d'outils
            return await runAgentTurn();
        }
        
    } catch (error) {
        spinner.stop();
        console.log(chalk.red("\n✖ Erreur : " + error.message + "\n"));
    }
}

async function askQuestion() {
    const { userInput } = await inquirer.prompt([
        {
            type: 'input',
            name: 'userInput',
            message: chalk.blue('❯ Vous :'),
            prefix: ''
        }
    ]);

    const text = userInput.trim();

    if (!text) {
        return askQuestion();
    }

    if (text === '/exit' || text === '/quit') {
        console.log(chalk.gray("Fermeture de Cypher Coder. À bientôt !"));
        process.exit(0);
    }

    if (text === '/clear') {
        console.clear();
        initChat();
        console.log(BANNER);
        console.log(chalk.green("Discussion réinitialisée et répertoire indexé.\n"));
        return askQuestion();
    }

    if (text === '/help') {
        console.log(chalk.yellow("\nCommandes disponibles :"));
        console.log("  /help   - Affiche ce menu d'aide");
        console.log("  /status - Affiche le dossier actif, le backend et l'index de fichiers");
        console.log("  /clear  - Efface l'écran et réinitialise la discussion et le contexte");
        console.log("  /exit   - Quitte l'application\n");
        return askQuestion();
    }

    if (text === '/status') {
        const dirContext = getCurrentDirectoryContext();
        console.log(chalk.yellow("\n=== Statut de la Session ==="));
        console.log(`  Dossier de travail : ${chalk.cyan(path.resolve("."))}`);
        console.log(`  Backend Space       : ${chalk.cyan("https://theshellmaster-cypher-coder.hf.space")}`);
        console.log(`  Modèle utilisé      : ${chalk.cyan("Qwen/Qwen2.5-Coder-32B-Instruct")}`);
        console.log(`  Auteur              : ${chalk.cyan("DJAKOUA KWANKAM (IUD)")}`);
        console.log(`  Fichiers suivis     : ${chalk.dim(dirContext)}\n`);
        return askQuestion();
    }

    // Ajouter le message utilisateur et démarrer le tour d'agent
    chatMessages.push({"role": "user", "content": text});
    await runAgentTurn();
    
    askQuestion();
}

async function main() {
    console.log(BANNER);
    
    // Initialiser la session de chat
    initChat();
    
    // Support des arguments directs (ex: cypher "Bonjour")
    const args = process.argv.slice(2);
    if (args.length > 0) {
        const initialRequest = args.join(" ");
        console.log(chalk.blue('❯ Vous : ') + initialRequest);
        chatMessages.push({"role": "user", "content": initialRequest});
        await runAgentTurn();
    }
    
    askQuestion();
}

main();
