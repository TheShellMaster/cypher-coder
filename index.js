#!/usr/bin/env node

import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import os from 'os';
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

// Global Session State & Config
let chatMessages = [];
let lastUserInput = "";
let lastAssistantResponse = "";
let commandHistory = [];
let savedContexts = {};
let loadedFiles = [];
let macros = {};
let logs = [];

const sessionConfig = {
    model: "Qwen/Qwen2.5-Coder-32B-Instruct",
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

function addLog(level, message) {
    const logItem = `[${new Date().toISOString()}] [${level}] ${message}`;
    logs.push(logItem);
}

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
    
    addLog("DEBUG", `Envoi payload API vers HF Space: modèle=${sessionConfig.model}, température=${sessionConfig.temperature}`);
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

[CAPABILITÉS SYSTÈME ET COMMANDES CLI CLASSÉES PAR CATÉGORIES] :
Tu connais et es capable d'utiliser ou de suggérer les commandes CLI suivantes selon le contexte :

1. Navigation & Système de fichiers :
- ls / list : Lister les fichiers et dossiers du répertoire courant
- ls -la : Lister avec permissions, taille, fichiers cachés
- cd <path> : Changer de répertoire
- cd .. : Remonter d'un niveau
- pwd : Afficher le chemin absolu du répertoire courant
- tree : Afficher l'arborescence sous forme d'arbre
- mkdir <name> : Créer un dossier
- mkdir -p <a/b/c> : Créer des dossiers imbriqués en une commande
- rmdir <name> : Supprimer un dossier vide
- touch <file> : Créer un fichier vide
- rm <file> : Supprimer un fichier
- rm -rf <dir> : Supprimer un dossier et son contenu récursivement
- cp <src> <dst> : Copier un fichier
- cp -r <src> <dst> : Copier un dossier récursivement
- mv <src> <dst> : Déplacer ou renommer un fichier/dossier
- find <path> -name "*.py" : Rechercher des fichiers par nom/pattern
- locate <name> : Recherche rapide dans la base de données de fichiers
- stat <file> : Afficher métadonnées d'un fichier (taille, dates, permissions)
- du -sh <dir> : Taille d'un dossier (human readable)
- df -h : Espace disque disponible sur toutes les partitions

2. Lecture & Édition de fichiers :
- cat <file> : Afficher le contenu d'un fichier
- less <file> : Afficher le contenu paginé (scrollable)
- head -n 20 <file> : Afficher les N premières lignes
- tail -n 20 <file> : Afficher les N dernières lignes
- tail -f <file> : Suivre un fichier en temps réel (logs)
- grep "pattern" <file> : Chercher un pattern dans un fichier
- grep -r "pattern" <dir> : Recherche récursive dans un dossier
- grep -n "pattern" <file> : Chercher avec numéros de lignes
- sed 's/old/new/g' <file> : Remplacer du texte dans un fichier
- awk '{print $1}' <file> : Extraire/traiter des colonnes de texte
- wc -l <file> : Compter les lignes d'un fichier
- diff <file1> <file2> : Comparer deux fichiers
- nano <file> : Éditer un fichier (éditeur simple)
- vim <file> : Éditer un fichier (éditeur avancé)
- echo "text" > file : Écrire du texte dans un fichier (écrase)
- echo "text" >> file : Ajouter du texte à la fin d'un fichier
- sort <file> : Trier les lignes d'un fichier
- uniq <file> : Supprimer les lignes dupliquées
- cut -d',' -f1 <file> : Extraire une colonne d'un CSV

3. Processus & Ressources système :
- ps aux : Lister tous les processus en cours
- top / htop : Moniteur de processus interactif en temps réel
- kill <PID> : Terminer un processus par son PID
- kill -9 <PID> : Forcer la fermeture d'un processus
- killall <name> : Tuer tous les processus par nom
- jobs : Lister les tâches en arrière-plan du shell
- bg : Mettre une tâche en arrière-plan
- fg : Ramener une tâche en avant-plan
- nohup <cmd> & : Lancer un processus qui survive à la fermeture du terminal
- screen / tmux : Multiplexeur de terminal (sessions persistantes)
- free -h : Afficher la RAM utilisée/disponible
- uptime : Durée de fonctionnement du système
- lscpu : Informations sur le processeur
- lsmem : Informations sur la mémoire
- lspci : Lister les périphériques PCI (GPU, réseau, etc.)
- uname -a : Infos kernel et architecture système
- env : Afficher toutes les variables d'environnement
- export VAR=value : Définir une variable d'environnement
- echo $VAR : Afficher la valeur d'une variable
- history : Historique des commandes exécutées
- which <cmd> : Trouver le chemin d'un exécutable
- whereis <cmd> : Trouver binaire, source et man d'une commande

4. Réseau :
- ping <host> : Tester la connectivité vers un hôte
- curl <url> : Envoyer une requête HTTP (GET par défaut)
- curl -X POST -d '{}' <url> : Requête HTTP POST avec body JSON
- curl -O <url> : Télécharger un fichier
- wget <url> : Télécharger un fichier via URL
- wget -r <url> : Télécharger récursivement
- ifconfig / ip a : Afficher les interfaces réseau et IPs
- ip route : Afficher la table de routage
- netstat -tulnp : Lister les ports ouverts et processus associés
- ss -tulnp : Alternative moderne à netstat
- nmap <host> : Scanner les ports d'une machine
- traceroute <host> : Tracer le chemin réseau vers un hôte
- dig <domain> : Résolution DNS d'un domaine
- host <domain> : Résolution DNS simplifiée
- ssh user@host : Connexion SSH à une machine distante
- ssh-keygen : Générer une paire de clés SSH
- scp <file> user@host:<path> : Copier un fichier via SSH
- rsync -avz <src> <dst> : Synchronisation de fichiers (local ou distant)
- nc -l <port> : Écouter sur un port (netcat)
- nc <host> <port> : Se connecter à un port distant

5. Gestion de paquets :
- apt update : Mettre à jour la liste des paquets (Debian/Ubuntu)
- apt upgrade : Mettre à jour les paquets installés
- apt install <pkg> : Installer un paquet
- apt remove <pkg> : Désinstaller un paquet
- apt search <pkg> : Chercher un paquet dans les dépôts
- apt show <pkg> : Afficher les détails d'un paquet
- dpkg -i <file.deb> : Installer un fichier .deb local
- dpkg -l : Lister tous les paquets installés
- snap install <pkg> : Installer via Snap
- pip install <pkg> : Installer un paquet Python
- pip list : Lister les paquets Python installés
- pip freeze > requirements.txt : Exporter les dépendances Python
- npm install <pkg> : Installer un paquet Node.js local
- npm install -g <pkg> : Installer un paquet Node.js global
- npm list : Lister les paquets npm du projet
- npm run <script> : Exécuter un script défini dans package.json
- npx <cmd> : Exécuter un paquet npm sans l'installer
- cargo install <pkg> : Installer un paquet Rust

6. Permissions & Utilisateurs :
- chmod 755 <file> : Modifier les permissions d'un fichier
- chmod +x <file> : Rendre un fichier exécutable
- chown user:group <file> : Changer le propriétaire d'un fichier
- sudo <cmd> : Exécuter une commande en super-utilisateur
- su <user> : Changer d'utilisateur
- whoami : Afficher l'utilisateur courant
- id : Afficher UID, GID et groupes de l'utilisateur
- groups : Lister les groupes de l'utilisateur
- passwd : Changer son mot de passe
- useradd <user> : Créer un nouvel utilisateur
- userdel <user> : Supprimer un utilisateur
- usermod -aG <group> <user> : Ajouter un utilisateur à un groupe
- visudo : Éditer le fichier sudoers
- umask : Afficher/modifier les permissions par défaut

7. Archives & Compression :
- tar -czf archive.tar.gz <dir> : Créer une archive .tar.gz
- tar -xzf archive.tar.gz : Extraire une archive .tar.gz
- tar -tf archive.tar.gz : Lister le contenu d'une archive
- zip -r archive.zip <dir> : Créer une archive .zip
- unzip archive.zip : Extraire une archive .zip
- unzip -l archive.zip : Lister le contenu d'un .zip
- gzip <file> : Compresser un fichier (.gz)
- gunzip <file.gz> : Décompresser un .gz
- 7z a archive.7z <dir> : Créer une archive .7z
- 7z x archive.7z : Extraire une archive .7z

8. Git & Contrôle de version :
- git init : Initialiser un dépôt Git
- git clone <url> : Cloner un dépôt distant
- git status : Voir l'état du dépôt (fichiers modifiés, staged)
- git add <file> : Ajouter un fichier au staging
- git add . : Ajouter tous les fichiers modifiés
- git commit -m "msg" : Faire un commit
- git push : Pousser les commits vers le dépôt distant
- git pull : Récupérer et fusionner les changements distants
- git fetch : Récupérer sans fusionner
- git branch : Lister les branches
- git branch <name> : Créer une nouvelle branche
- git checkout <branch> : Changer de branche
- git checkout -b <branch> : Créer et basculer sur une branche
- git merge <branch> : Fusionner une branche dans la branche courante
- git rebase <branch> : Rebaser la branche courante
- git log --oneline : Voir l'historique des commits
- git diff : Voir les différences non stagées
- git stash : Sauvegarder les changements temporairement
- git stash pop : Restaurer les changements stashés
- git reset --hard HEAD : Annuler tous les changements locaux
- git remote -v : Lister les dépôts distants configurés

9. Docker & Containers :
- docker ps : Lister les containers en cours d'exécution
- docker ps -a : Lister tous les containers (y compris stoppés)
- docker images : Lister les images Docker locales
- docker pull <image> : Télécharger une image depuis Docker Hub
- docker run <image> : Lancer un container
- docker run -d -p 8080:80 <image> : Lancer en arrière-plan avec port mapping
- docker run -it <image> bash : Lancer en mode interactif
- docker stop <id> : Arrêter un container
- docker start <id> : Démarrer un container arrêté
- docker rm <id> : Supprimer un container
- docker rmi <image> : Supprimer une image
- docker exec -it <id> bash : Entrer dans un container en cours
- docker logs <id> : Voir logs d'un container
- docker build -t <name> . : Construire une image depuis un Dockerfile
- docker-compose up : Lancer tous les services du docker-compose.yml
- docker-compose up -d : Lancer en arrière-plan
- docker-compose down : Arrêter et supprimer les services
- docker volume ls : Lister les volumes Docker
- docker network ls : Lister les réseaux Docker
- docker inspect <id> : Voir les détails d'un container/image

10. Exécution de code & Langages :
- python3 <file.py> : Exécuter un script Python
- python3 -m venv venv : Créer un environnement virtuel Python
- source venv/bin/activate : Activer l'environnement virtuel
- deactivate : Désactiver l'environnement virtuel
- node <file.js> : Exécuter un script Node.js
- ts-node <file.ts> : Exécuter un fichier TypeScript directement
- bash <script.sh> : Exécuter un script shell
- chmod +x script.sh && ./script.sh : Rendre exécutable et lancer un script
- gcc <file.c> -o output : Compiler du code C
- g++ <file.cpp> -o output : Compiler du code C++
- javac <File.java> : Compiler du Java
- java <ClassName> : Exécuter du Java compilé
- rustc <file.rs> : Compiler du Rust
- go run <file.go> : Exécuter du Go
- php <file.php> : Exécuter du PHP
- ruby <file.rb> : Exécuter du Ruby

11. Utilitaires avancés :
- xargs : Passer la sortie d'une commande en arguments à une autre
- tee <file> : Afficher la sortie ET l'écrire dans un fichier
- watch -n 2 <cmd> : Répéter une commande toutes les N secondes
- crontab -e : Éditer les tâches cron (scheduleur)
- crontab -l : Lister les tâches cron
- at <time> : Planifier une commande unique dans le futur
- alias ll='ls -la' : Créer un alias de commande
- source ~/.bashrc : Recharger la config shell sans redémarrer
- lsof -i :<port> : Voir quel processus utilise un port
- strace <cmd> : Tracer les appels système d'une commande
- time <cmd> : Mesurer le temps d'exécution d'une commande
- bc : Calculatrice en ligne de commande
- date : Afficher la date et l'heure système
- cal : Afficher un calendrier
- man <cmd> : Afficher le manuel d'une commande
- --help : Afficher l'aide rapide d'une commande
- clear / cls : Nettoyer l'écran du terminal
- exit : Quitter le terminal ou la session
- reboot / shutdown now : Redémarrer / éteindre la machine
- journalctl -xe : Voir les logs système (systemd)
- systemctl status <service> : Voir l'état d'un service systemd
- systemctl start/stop/restart <service> : Gérer un service systemd

[CONSEILS ET INSTRUCTIONS D'EXÉCUTION DANS LE CLI] :
1. **Parser l'intention** : Quand l'utilisateur s'adresse à toi, détermine immédiatement s'il s'agit d'une commande shell (par ex: "crée un dossier src", "lance git status"), d'une requête de code ("ajoute une fonction de tri dans index.js"), ou d'une simple question théorique.
2. **Utiliser ou Suggérer les Commandes CLI** : 
   - Si la commande est pertinente pour réaliser ce que veut l'utilisateur, et que tu as besoin d'une information système ou de lancer une tâche, tu peux appeler directement l'outil \`run_command\` avec la commande appropriée.
   - Si tu souhaites simplement guider l'utilisateur pour qu'il comprenne et exécute lui-même, affiche la commande clairement dans ton texte Markdown sous forme de bloc de code prêt à être copié, accompagné d'une explication courte et précise.
3. **Gérer les flags et la syntaxe** : Assure-toi de composer correctement les flags (par exemple, \`-rf\` pour supprimer récursivement et forcer, \`-p\` pour créer des sous-dossiers parents imbriqués) en fonction du besoin.
4. **Proactivité et Autonomie** : Ne demande pas continuellement le chemin des fichiers ou de la structure du projet à l'utilisateur. Tu as accès aux outils \`list_dir\` (liste les répertoires), \`find_files\` (cherche les fichiers), et \`grep_search\` (cherche du texte). Utilise-les de manière autonome pour repérer le code, comprendre sa structure, puis propose directement des modifications (via \`patch_file\` ou \`write_file\`).
5. **Sécurité & Consentement** : Rappelle-toi que toutes tes actions sur le système de fichiers (\`write_file\`, \`patch_file\`) et toutes tes exécutions de commandes (\`run_command\`) requièrent une validation explicite et sécurisée par oui/non de la part du client CLI local avant d'être effectivement exécutées.

[CONTEXTE DE L'ENVIRONNEMENT LOCAL] :
Le répertoire de travail actuel contient les dossiers et fichiers suivants au premier niveau : [${dirContext}].

Sois précis, concis et direct. Formate tes réponses en Markdown standard.`;
}


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
            lastAssistantResponse = replyMessage.content;
            addLog("INFO", "Réponse de l'assistant enregistrée.");
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

async function handleSlashCommand(text) {
    if (!text.startsWith('/')) {
        return false;
    }
    
    const parts = text.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    if (parts.length === 0) return true;
    
    const commandName = parts[0];
    const rawArgs = parts.slice(1).map(a => a.replace(/^["']|["']$/g, ''));
    
    addLog("INFO", `Commande slash reçue: ${text}`);
    commandHistory.push(text);
    
    const cleanArgs = [];
    const flags = {};
    for (let i = 0; i < rawArgs.length; i++) {
        if (rawArgs[i].startsWith('--')) {
            const key = rawArgs[i].slice(2);
            if (rawArgs[i+1] && !rawArgs[i+1].startsWith('--')) {
                flags[key] = rawArgs[++i];
            } else {
                flags[key] = true;
            }
        } else {
            cleanArgs.push(rawArgs[i]);
        }
    }

    switch (commandName.toLowerCase()) {
        // --- 1. Contrôle de session
        case '/help':
            console.log(chalk.cyan.bold("\n📚 CYPHER CODER CLI - COMMANDES DISPONIBLES :"));
            
            console.log(chalk.yellow("\n🎛️ Session :"));
            console.log("  /help                     - Affiche ce menu d'aide");
            console.log("  /exit, /quit              - Quitte proprement l'agent");
            console.log("  /clear                    - Efface l'écran");
            console.log("  /reset                    - Réinitialise la discussion et l'historique");
            console.log("  /restart                  - Redémarre proprement la session");
            console.log("  /version                  - Affiche la version actuelle");
            console.log("  /about                    - Infos sur le projet");
            console.log("  /status                   - Affiche le statut complet");
            
            console.log(chalk.yellow("\n💬 Mémoire et Contexte :"));
            console.log("  /context                  - Affiche les fichiers chargés en contexte");
            console.log("  /context clear            - Efface le contexte de fichiers");
            console.log("  /context save <nom>       - Sauvegarde la session actuelle");
            console.log("  /context load <nom>       - Charge une session sauvegardée");
            console.log("  /context list             - Liste les sessions sauvegardées");
            console.log("  /memory                   - Affiche la mémoire système + messages");
            console.log("  /memory clear             - Efface les messages d'historique");
            console.log("  /tokens                   - Affiche les statistiques de tokens");

            console.log(chalk.yellow("\n📜 Historique :"));
            console.log("  /history                  - Affiche tout l'historique");
            console.log("  /history clear            - Efface l'historique enregistré");
            console.log("  /history save <fichier>   - Exporte l'historique dans un fichier");
            console.log("  /history load <fichier>   - Importe un historique");
            console.log("  /history search <terme>   - Cherche dans l'historique");
            console.log("  /last                     - Affiche la dernière réponse de l'agent");
            console.log("  /redo                     - Relance la dernière requête");
            console.log("  /undo                     - Annule la dernière interaction");

            console.log(chalk.yellow("\n🤖 Modèle et Configuration :"));
            console.log("  /model                    - Affiche le modèle utilisé");
            console.log("  /model list               - Liste les modèles supportés");
            console.log("  /model set <nom>          - Change de modèle");
            console.log("  /model info               - Affiche les infos du modèle");
            console.log("  /temperature <valeur>     - Ajuste la température (0.0 - 1.0)");
            console.log("  /top_p <valeur>           - Ajuste le top_p");
            console.log("  /max_tokens <valeur>      - Ajuste la limite de tokens");
            console.log("  /system                   - Affiche le prompt système");
            console.log("  /system set <prompt>      - Modifie le prompt système");
            console.log("  /system reset             - Réinitialise le prompt système");
            console.log("  /stream <on|off>          - Active/désactive le streaming");

            console.log(chalk.yellow("\n📁 Fichiers :"));
            console.log("  /file load <chemin>       - Charge le fichier dans le contexte");
            console.log("  /file read <chemin>       - Lit et affiche un fichier");
            console.log("  /file write <chemin>      - Écrit la dernière réponse dans un fichier");
            console.log("  /file append <chemin>     - Ajoute la dernière réponse à un fichier");
            console.log("  /file list                - Liste les fichiers chargés");
            console.log("  /file clear               - Vide le contexte de fichiers");
            console.log("  /file diff <f1> <f2>      - Compare deux fichiers");
            console.log("  /upload <chemin>          - Simule l'envoi d'un fichier");
            console.log("  /download <nom>           - Télécharge un fichier");

            console.log(chalk.yellow("\n⚡ Code et Commandes :"));
            console.log("  /run                      - Exécute le dernier bloc de code");
            console.log("  /run <lang> <code>        - Exécute le code fourni");
            console.log("  /exec <commande>          - Lance une commande système");
            console.log("  /shell                    - Lance un terminal interactif");
            console.log("  /repl <lang>              - Lance un REPL (ex: node, python)");
            console.log("  /eval <expression>        - Évalue une expression mathématique");
            console.log("  /sandbox <on|off>         - Active/désactive l'isolation");
            console.log("  /output                   - Affiche la dernière sortie");
            console.log("  /output clear             - Efface la dernière sortie");

            console.log(chalk.yellow("\n🔌 Outils et Recherche :"));
            console.log("  /tools                    - Liste les outils activés");
            console.log("  /tool info <nom>          - Affiche la description d'un outil");
            console.log("  /tool enable/disable <n>  - Active/désactive un outil");
            console.log("  /plugin list/install/rm   - Gère les plugins");
            console.log("  /web search <requête>     - Recherche en ligne");
            console.log("  /web fetch <url>          - Récupère le contenu d'une URL");

            console.log(chalk.yellow("\n🎨 Thème et Affichage :"));
            console.log("  /theme <dark|light>       - Change le thème");
            console.log("  /theme list               - Liste les thèmes");
            console.log("  /format <md|plain|json>   - Format des réponses");
            console.log("  /wrap <on|off>            - Retour à la ligne automatique");
            console.log("  /verbose <on|off>         - Mode verbeux");
            console.log("  /silent <on|off>          - Mode silencieux");
            console.log("  /color <on|off>           - Colorisation syntaxique");
            console.log("  /lang <fr|en>             - Change la langue");

            console.log(chalk.yellow("\n🔐 Configuration et Variable d'env :"));
            console.log("  /config                   - Affiche la configuration");
            console.log("  /config set <key> <val>   - Modifie la configuration");
            console.log("  /config reset             - Réinitialise la configuration");
            console.log("  /env list                 - Liste les variables d'env");
            console.log("  /env set <VAR> <val>      - Définit une variable d'env");
            console.log("  /api key show/set/clear   - Gère les clés d'API");

            console.log(chalk.yellow("\n📊 Monitoring et Debug :"));
            console.log("  /debug <on|off>           - Active le mode debug");
            console.log("  /log                      - Affiche les logs");
            console.log("  /log clear/save           - Efface ou enregistre les logs");
            console.log("  /benchmark                - Teste la latence API");
            console.log("  /ping                     - Teste la connexion réseau");
            console.log("  /stats                    - Statistiques de session");
            console.log("  /trace                    - Trace des appels");
            console.log("  /inspect <var>            - Inspecte la configuration interne");

            console.log(chalk.yellow("\n🔁 Automatisation :"));
            console.log("  /macro save/run/list/del  - Gère les macros");
            console.log("  /pipe <cmd1> | <cmd2>     - Chaîne deux commandes");
            console.log("  /loop <n> <commande>      - Répète une commande");
            console.log("  /schedule <cron> <cmd>    - Planifie une tâche");
            console.log("  /watch <cmd>              - Surveille les fichiers");
            console.log("  /batch <fichier>          - Exécute des commandes en lot\n");
            break;

        case '/exit':
        case '/quit':
            console.log(chalk.gray("Fermeture de Cypher Coder. À bientôt !"));
            process.exit(0);

        case '/clear':
            console.clear();
            console.log(BANNER);
            console.log(chalk.green("Écran nettoyé.\n"));
            break;

        case '/reset':
            initChat();
            commandHistory = [];
            loadedFiles = [];
            console.log(chalk.green("Session réinitialisée. Historique et contexte effacés.\n"));
            break;

        case '/restart':
            console.log(chalk.yellow("Redémarrage de l'agent en cours..."));
            initChat();
            console.clear();
            console.log(BANNER);
            console.log(chalk.green("Cypher Coder a redémarré avec succès.\n"));
            break;

        case '/version':
            console.log(chalk.cyan(`Version de Cypher Coder: 1.0.0 (Mode Hybride local/Space)`));
            break;

        case '/about':
            console.log(chalk.cyan(`\n=== À propos de Cypher Coder ===`));
            console.log(`Nom        : ${APP_NAME}`);
            console.log(`Créateur   : ${AUTHOR} (Étudiant IUD)`);
            console.log(`Description: Assistant IA autonome de codage local et réseau.`);
            console.log(`Modèle     : Qwen/Qwen2.5-Coder-32B-Instruct`);
            console.log(`Réseau     : FastAPI + Gradio (Docker Space HF)\n`);
            break;

        case '/status':
            const dirContext = getCurrentDirectoryContext();
            console.log(chalk.yellow("\n=== Statut de la Session ==="));
            console.log(`  Dossier de travail : ${chalk.cyan(path.resolve("."))}`);
            console.log(`  Backend Space       : ${chalk.cyan("https://theshellmaster-cypher-coder.hf.space")}`);
            console.log(`  Modèle utilisé      : ${chalk.cyan(sessionConfig.model)}`);
            console.log(`  Température         : ${chalk.cyan(sessionConfig.temperature)}`);
            console.log(`  Max Tokens          : ${chalk.cyan(sessionConfig.max_tokens)}`);
            console.log(`  Auteur              : ${chalk.cyan(AUTHOR)}`);
            console.log(`  Fichiers suivis     : ${chalk.dim(dirContext)}\n`);
            break;

        // --- 2. Gestion du contexte & mémoire
        case '/context':
            if (cleanArgs[0] === 'clear') {
                loadedFiles = [];
                console.log(chalk.green("Contexte de fichiers vidé."));
            } else if (cleanArgs[0] === 'save') {
                const name = cleanArgs[1];
                if (!name) {
                    console.log(chalk.red("Erreur: Spécifiez un nom. Exemple: /context save ma_session"));
                } else {
                    savedContexts[name] = JSON.stringify(chatMessages);
                    console.log(chalk.green(`Contexte sauvegardé sous le nom '${name}'.`));
                }
            } else if (cleanArgs[0] === 'load') {
                const name = cleanArgs[1];
                if (!name || !savedContexts[name]) {
                    console.log(chalk.red(`Erreur: Contexte '${name}' introuvable.`));
                } else {
                    chatMessages = JSON.parse(savedContexts[name]);
                    console.log(chalk.green(`Contexte '${name}' restauré avec succès.`));
                }
            } else if (cleanArgs[0] === 'list') {
                console.log(chalk.yellow("Contextes sauvegardés :"), Object.keys(savedContexts));
            } else {
                console.log(chalk.yellow("Fichiers chargés en contexte local :"));
                if (loadedFiles.length === 0) console.log(" Aucun fichier chargé.");
                loadedFiles.forEach(f => console.log(` - ${f}`));
            }
            break;

        case '/memory':
            if (cleanArgs[0] === 'clear') {
                initChat();
                console.log(chalk.green("Mémoire système réinitialisée."));
            } else {
                console.log(chalk.yellow("\n=== Mémoire de session active ==="));
                console.log(`Nombre de messages stockés : ${chatMessages.length}`);
                console.log("System Prompt actif :");
                console.log(chalk.dim(chatMessages[0]?.content || "Aucun"));
                console.log("===================================\n");
            }
            break;

        case '/tokens':
            const textLength = JSON.stringify(chatMessages).length;
            const estTokens = Math.round(textLength / 4);
            console.log(chalk.cyan(`Statistiques de tokens (estimations) :`));
            console.log(`  Utilisés (contexte actuel) : ~${estTokens} tokens`);
            console.log(`  Max configuré par réponse : ${sessionConfig.max_tokens} tokens`);
            break;

        // --- 3. Historique
        case '/history':
            if (cleanArgs[0] === 'clear') {
                commandHistory = [];
                console.log(chalk.green("Historique des commandes vidé."));
            } else if (cleanArgs[0] === 'save') {
                const file = cleanArgs[1] || 'history_export.json';
                fs.writeFileSync(file, JSON.stringify(commandHistory, null, 2), 'utf8');
                console.log(chalk.green(`Historique exporté dans : ${file}`));
            } else if (cleanArgs[0] === 'load') {
                const file = cleanArgs[1];
                if (file && fs.existsSync(file)) {
                    commandHistory = JSON.parse(fs.readFileSync(file, 'utf8'));
                    console.log(chalk.green(`Historique importé depuis ${file}.`));
                } else {
                    console.log(chalk.red("Fichier introuvable."));
                }
            } else if (cleanArgs[0] === 'search') {
                const query = cleanArgs.slice(1).join(' ').toLowerCase();
                const matches = commandHistory.filter(h => h.toLowerCase().includes(query));
                console.log(chalk.yellow(`Correspondances trouvées (${matches.length}) :`));
                matches.forEach(m => console.log(`  ${m}`));
            } else {
                console.log(chalk.yellow("\n=== Historique des commandes utilisateur ==="));
                commandHistory.forEach((c, idx) => console.log(`  ${idx + 1}. ${c}`));
                console.log("=============================================\n");
            }
            break;

        case '/last':
            if (!lastAssistantResponse) {
                console.log(chalk.yellow("Aucune réponse précédente disponible."));
            } else {
                console.log(chalk.green("\n🤖 Dernière réponse de Cypher :"));
                console.log(marked(lastAssistantResponse));
            }
            break;

        case '/redo':
            let lastUserText = "";
            for (let i = chatMessages.length - 1; i >= 0; i--) {
                if (chatMessages[i].role === 'user' && !chatMessages[i].content.startsWith('/')) {
                    lastUserText = chatMessages[i].content;
                    break;
                }
            }
            if (lastUserText) {
                console.log(chalk.cyan(`Relance de la requête : "${lastUserText}"`));
                chatMessages.push({"role": "user", "content": lastUserText});
                await runAgentTurn();
            } else {
                console.log(chalk.yellow("Aucune requête textuelle trouvée à relancer."));
            }
            break;

        case '/undo':
            if (chatMessages.length > 2) {
                chatMessages.pop();
                chatMessages.pop();
                console.log(chalk.green("Dernière interaction utilisateur/assistant annulée du contexte."));
            } else {
                console.log(chalk.yellow("Rien à annuler."));
            }
            break;

        // --- 4. Gestion du modèle LLM
        case '/model':
            if (cleanArgs[0] === 'list') {
                console.log(chalk.cyan("Modèles disponibles via Hugging Face Inference :"));
                console.log("  - Qwen/Qwen2.5-Coder-32B-Instruct (Recommandé - Actif par défaut)");
                console.log("  - meta-llama/Llama-3.3-70B-Instruct");
                console.log("  - deepseek-ai/DeepSeek-Coder-V2-Instruct");
            } else if (cleanArgs[0] === 'set') {
                const newModel = cleanArgs[1];
                if (!newModel) {
                    console.log(chalk.red("Usage: /model set <nom_du_modèle>"));
                } else {
                    sessionConfig.model = newModel;
                    console.log(chalk.green(`Modèle modifié vers : ${newModel}`));
                }
            } else if (cleanArgs[0] === 'info') {
                console.log(chalk.cyan(`\n=== Infos sur le modèle actif ===`));
                console.log(`Nom: ${sessionConfig.model}`);
                console.log(`Type: Coder/Instruct LLM`);
                console.log(`Capacités: Génération de code, Tool calling, Recherche web`);
                console.log(`Limites recommandées: 2048 tokens max par génération.`);
            } else {
                console.log(chalk.cyan(`Modèle actif : ${sessionConfig.model}`));
            }
            break;

        case '/temperature':
            const tempVal = parseFloat(cleanArgs[0]);
            if (isNaN(tempVal) || tempVal < 0 || tempVal > 1) {
                console.log(chalk.red("Usage: /temperature <valeur entre 0.0 et 1.0> (actuelle: " + sessionConfig.temperature + ")"));
            } else {
                sessionConfig.temperature = tempVal;
                console.log(chalk.green(`Température mise à jour : ${tempVal}`));
            }
            break;

        case '/top_p':
            const topPVal = parseFloat(cleanArgs[0]);
            if (isNaN(topPVal) || topPVal < 0 || topPVal > 1) {
                console.log(chalk.red("Usage: /top_p <valeur entre 0.0 et 1.0> (actuel: " + sessionConfig.top_p + ")"));
            } else {
                sessionConfig.top_p = topPVal;
                console.log(chalk.green(`Top_p mis à jour : ${topPVal}`));
            }
            break;

        case '/max_tokens':
            const maxT = parseInt(cleanArgs[0], 10);
            if (isNaN(maxT) || maxT <= 0) {
                console.log(chalk.red("Usage: /max_tokens <nombre> (actuel: " + sessionConfig.max_tokens + ")"));
            } else {
                sessionConfig.max_tokens = maxT;
                console.log(chalk.green(`Max tokens mis à jour : ${maxT}`));
            }
            break;

        case '/system':
            if (cleanArgs[0] === 'set') {
                const newSys = cleanArgs.slice(1).join(' ');
                chatMessages[0] = { role: 'system', content: newSys };
                console.log(chalk.green("Prompt système modifié."));
            } else if (cleanArgs[0] === 'reset') {
                chatMessages[0] = { role: 'system', content: getSystemPrompt() };
                console.log(chalk.green("Prompt système réinitialisé aux valeurs par défaut."));
            } else {
                console.log(chalk.cyan("Prompt système actif :"));
                console.log(chalk.dim(chatMessages[0]?.content));
            }
            break;

        case '/stream':
            if (cleanArgs[0] === 'on') {
                sessionConfig.stream = true;
                console.log(chalk.green("Streaming activé (simulé)."));
            } else {
                sessionConfig.stream = false;
                console.log(chalk.green("Streaming désactivé."));
            }
            break;

        // --- 5. Gestion de fichiers
        case '/file':
            if (cleanArgs[0] === 'load') {
                const fpath = cleanArgs[1];
                if (fpath && fs.existsSync(fpath)) {
                    loadedFiles.push(path.resolve(fpath));
                    console.log(chalk.green(`Fichier chargé dans le contexte : ${fpath}`));
                } else {
                    console.log(chalk.red("Fichier introuvable."));
                }
            } else if (cleanArgs[0] === 'read') {
                const fpath = cleanArgs[1];
                if (fpath && fs.existsSync(fpath)) {
                    console.log(chalk.cyan(`Contenu de ${fpath} :`));
                    console.log(fs.readFileSync(fpath, 'utf8'));
                } else {
                    console.log(chalk.red("Fichier introuvable."));
                }
            } else if (cleanArgs[0] === 'write') {
                const fpath = cleanArgs[1];
                if (!fpath) {
                    console.log(chalk.red("Usage: /file write <chemin>"));
                } else if (!lastAssistantResponse) {
                    console.log(chalk.red("Aucune réponse disponible à enregistrer."));
                } else {
                    fs.writeFileSync(fpath, lastAssistantResponse, 'utf8');
                    console.log(chalk.green(`Dernière réponse enregistrée dans ${fpath}`));
                }
            } else if (cleanArgs[0] === 'append') {
                const fpath = cleanArgs[1];
                if (!fpath) {
                    console.log(chalk.red("Usage: /file append <chemin>"));
                } else if (!lastAssistantResponse) {
                    console.log(chalk.red("Aucune réponse disponible à enregistrer."));
                } else {
                    fs.appendFileSync(fpath, "\n" + lastAssistantResponse, 'utf8');
                    console.log(chalk.green(`Dernière réponse ajoutée à la fin de ${fpath}`));
                }
            } else if (cleanArgs[0] === 'list') {
                console.log(chalk.yellow("Fichiers suivis :"), loadedFiles);
            } else if (cleanArgs[0] === 'clear') {
                loadedFiles = [];
                console.log(chalk.green("Fichiers déchargés du contexte."));
            } else if (cleanArgs[0] === 'diff') {
                const f1 = cleanArgs[1];
                const f2 = cleanArgs[2];
                if (f1 && f2 && fs.existsSync(f1) && fs.existsSync(f2)) {
                    console.log(chalk.yellow(`--- Comparaison de ${f1} et ${f2} ---`));
                    try {
                        const out = execSync(`diff -u ${f1} ${f2}`).toString();
                        console.log(out || "Aucune différence.");
                    } catch (e) {
                        console.log(e.stdout ? e.stdout.toString() : e.message);
                    }
                } else {
                    console.log(chalk.red("Erreur: Spécifiez deux fichiers valides."));
                }
            }
            break;

        case '/upload':
            console.log(chalk.green(`Fichier ${cleanArgs[0]} simulé comme uploadé.`));
            break;
        case '/download':
            console.log(chalk.green(`Fichier ${cleanArgs[0]} simulé comme téléchargé.`));
            break;

        // --- 6. Exécution de code
        case '/run':
            if (cleanArgs.length === 0) {
                if (!lastAssistantResponse) {
                    console.log(chalk.red("Aucun code généré précédemment."));
                } else {
                    const blockRegex = /```(javascript|js|python|py|bash|sh)?\n([\s\S]*?)```/;
                    const match = lastAssistantResponse.match(blockRegex);
                    if (match) {
                        const lang = match[1] || 'js';
                        const code = match[2];
                        console.log(chalk.yellow(`Exécution du bloc de code détecté (${lang})...`));
                        await executeLocalCode(lang, code);
                    } else {
                        console.log(chalk.red("Aucun bloc de code markdown trouvé."));
                    }
                }
            } else {
                const lang = cleanArgs[0];
                const code = cleanArgs.slice(1).join(' ');
                await executeLocalCode(lang, code);
            }
            break;

        case '/exec':
            const cmd = cleanArgs.join(' ');
            if (!cmd) {
                console.log(chalk.red("Spécifiez une commande à exécuter."));
            } else {
                console.log(chalk.cyan(`Exécution de la commande : ${cmd}`));
                await handleToolExecution('run_command', { command: cmd });
            }
            break;

        case '/shell':
            console.log(chalk.yellow("Lancement du terminal interactif (tapez 'exit' pour quitter le sous-shell)..."));
            try {
                execSync('bash', { stdio: 'inherit' });
            } catch (e) {}
            break;

        case '/repl':
            const rlang = cleanArgs[0] || 'node';
            console.log(chalk.yellow(`Lancement du REPL ${rlang}...`));
            try {
                execSync(rlang, { stdio: 'inherit' });
            } catch (e) {}
            break;

        case '/eval':
            const expr = cleanArgs.join(' ');
            try {
                const res = eval(expr);
                console.log(chalk.green(`Résultat : ${res}`));
            } catch (e) {
                console.log(chalk.red(`Erreur d'évaluation : ${e.message}`));
            }
            break;

        case '/sandbox':
            if (cleanArgs[0] === 'on') {
                sessionConfig.sandbox = true;
                console.log(chalk.green("Bac à sable activé (simulé)."));
            } else {
                sessionConfig.sandbox = false;
                console.log(chalk.green("Bac à sable désactivé."));
            }
            break;

        case '/output':
            if (cleanArgs[0] === 'clear') {
                console.log(chalk.green("Sortie nettoyée."));
            } else {
                console.log(chalk.gray("Aucune sortie récente enregistrée en dehors du terminal."));
            }
            break;

        // --- 7. Plugins & outils
        case '/tools':
            console.log(chalk.cyan("Outils d'interaction locaux disponibles :"));
            tools.forEach(t => console.log(`  - ${t.function.name} : ${t.function.description}`));
            break;

        case '/tool':
            if (cleanArgs[0] === 'info') {
                const name = cleanArgs[1];
                const tool = tools.find(t => t.function.name === name);
                if (tool) {
                    console.log(chalk.cyan(`Outil [${name}] :`), tool.function.description);
                } else {
                    console.log(chalk.red("Outil introuvable."));
                }
            } else {
                console.log(chalk.yellow("Les outils fondamentaux de Cypher Coder sont activés par défaut pour assurer son autonomie."));
            }
            break;

        case '/plugin':
            console.log(chalk.cyan("Aucun plugin externe installé."));
            break;

        case '/web':
            if (cleanArgs[0] === 'search') {
                const q = cleanArgs.slice(1).join(' ');
                console.log(chalk.cyan(`Recherche en ligne pour : "${q}"`));
                const res = callApiViaCurl([
                    { role: "system", content: "Fais une recherche web et renvoie les résultats." },
                    { role: "user", content: q }
                ], []);
                console.log(res.content);
            } else if (cleanArgs[0] === 'fetch') {
                const url = cleanArgs[1];
                console.log(chalk.cyan(`Récupération de l'URL : ${url}...`));
                const res = callApiViaCurl([
                    { role: "system", content: "Récupère le contenu de cette URL et synthétise-la." },
                    { role: "user", content: url }
                ], []);
                console.log(res.content);
            }
            break;

        // --- 8. Affichage & formatting
        case '/theme':
            if (cleanArgs[0] === 'list') {
                console.log("Thèmes : dark (par défaut), light");
            } else if (cleanArgs[0] === 'light') {
                sessionConfig.theme = 'light';
                console.log(chalk.green("Thème light configuré."));
            } else {
                sessionConfig.theme = 'dark';
                console.log(chalk.green("Thème dark configuré."));
            }
            break;

        case '/format':
            const fmt = cleanArgs[0];
            if (['md', 'plain', 'json'].includes(fmt)) {
                sessionConfig.format = fmt;
                console.log(chalk.green(`Format des réponses : ${fmt}`));
            } else {
                console.log(chalk.red("Formats valides : md, plain, json"));
            }
            break;

        case '/wrap':
        case '/verbose':
        case '/silent':
        case '/color':
            const setting = commandName.slice(1);
            if (cleanArgs[0] === 'on' || cleanArgs[0] === 'true') {
                sessionConfig[setting] = true;
                console.log(chalk.green(`Option ${setting} activée.`));
            } else {
                sessionConfig[setting] = false;
                console.log(chalk.green(`Option ${setting} désactivée.`));
            }
            break;

        case '/lang':
            sessionConfig.lang = cleanArgs[0] || 'fr';
            console.log(chalk.green(`Langue configurée : ${sessionConfig.lang}`));
            break;

        case '/font':
            console.log(chalk.gray("Option disponible sur terminaux compatibles uniquement."));
            break;

        // --- 9. Config & credentials
        case '/config':
            if (cleanArgs[0] === 'set') {
                const key = cleanArgs[1];
                const val = cleanArgs[2];
                if (key in sessionConfig) {
                    sessionConfig[key] = val;
                    console.log(chalk.green(`Configuration ${key} mise à jour.`));
                } else {
                    console.log(chalk.red("Clé introuvable."));
                }
            } else if (cleanArgs[0] === 'reset') {
                sessionConfig.model = "Qwen/Qwen2.5-Coder-32B-Instruct";
                sessionConfig.temperature = 0.7;
                sessionConfig.max_tokens = 2048;
                console.log(chalk.green("Configuration réinitialisée."));
            } else {
                console.log(chalk.cyan("Configuration en cours :"), sessionConfig);
            }
            break;

        case '/api':
            console.log(chalk.green("Authentification gérée via variable d'environnement HF_TOKEN ou secret d'Espace."));
            break;

        case '/env':
            if (cleanArgs[0] === 'set') {
                const key = cleanArgs[1];
                const val = cleanArgs[2];
                sessionConfig.env[key] = val;
                console.log(chalk.green(`Variable d'environnement locale définie: ${key}=${val}`));
            } else {
                console.log(chalk.cyan("Variables d'environnement de l'agent :"), sessionConfig.env);
            }
            break;

        // --- 10. Monitoring & debug
        case '/debug':
            if (cleanArgs[0] === 'on') {
                sessionConfig.verbose = true;
                console.log(chalk.green("Mode debug/verbose activé."));
            } else {
                sessionConfig.verbose = false;
                console.log(chalk.green("Mode debug/verbose désactivé."));
            }
            break;

        case '/log':
            if (cleanArgs[0] === 'clear') {
                logs = [];
                console.log(chalk.green("Logs locaux effacés."));
            } else if (cleanArgs[0] === 'save') {
                const file = cleanArgs[1] || 'cypher_agent.log';
                fs.writeFileSync(file, logs.join('\n'), 'utf8');
                console.log(chalk.green(`Logs exportés dans ${file}`));
            } else {
                console.log(chalk.yellow("\n=== Logs récents de l'agent ==="));
                logs.slice(-20).forEach(l => console.log(l));
                console.log("===============================\n");
            }
            break;

        case '/benchmark':
            console.log(chalk.cyan("Lancement du benchmark de l'API Hugging Face..."));
            const start = Date.now();
            try {
                callApiViaCurl([{ role: "user", content: "Dis hello" }], []);
                console.log(chalk.green(`Réussi ! Temps de latence aller-retour : ${Date.now() - start}ms`));
            } catch (e) {
                console.log(chalk.red(`Échec du benchmark : ${e.message}`));
            }
            break;

        case '/ping':
            console.log(chalk.cyan("Ping de la passerelle API..."));
            try {
                const startPing = Date.now();
                execSync("curl -sI https://theshellmaster-cypher-coder.hf.space/ | head -n 1");
                console.log(chalk.green(`Connectivité OK (${Date.now() - startPing}ms)`));
            } catch (e) {
                console.log(chalk.red("Erreur de connexion."));
            }
            break;

        case '/stats':
            console.log(chalk.cyan(`\n=== Statistiques de la session ===`));
            console.log(`  Messages dans la conversation : ${chatMessages.length}`);
            console.log(`  Fichiers chargés en contexte   : ${loadedFiles.length}`);
            console.log(`  Commandes tapées               : ${commandHistory.length}`);
            console.log(`  Nombre d'événements loggués   : ${logs.length}\n`);
            break;

        case '/trace':
            console.log(chalk.cyan("Dernier appel :"), logs[logs.length - 1] || "Aucun appel tracé.");
            break;

        case '/inspect':
            const vname = cleanArgs[0];
            if (vname === 'chatMessages') console.log(chatMessages);
            else if (vname === 'loadedFiles') console.log(loadedFiles);
            else console.log(sessionConfig);
            break;

        // --- 11. Automatisation & scripting
        case '/macro':
            if (cleanArgs[0] === 'save') {
                const name = cleanArgs[1];
                macros[name] = [...commandHistory];
                console.log(chalk.green(`Historique des commandes sauvegardé dans la macro '${name}'.`));
            } else if (cleanArgs[0] === 'run') {
                const name = cleanArgs[1];
                if (macros[name]) {
                    console.log(chalk.yellow(`Exécution de la macro : ${name}`));
                    for (const cmd of macros[name]) {
                        if (!cmd.startsWith('/macro')) {
                            await handleSlashCommand(cmd);
                        }
                    }
                } else {
                    console.log(chalk.red("Macro introuvable."));
                }
            } else if (cleanArgs[0] === 'list') {
                console.log(chalk.cyan("Macros disponibles :"), Object.keys(macros));
            } else if (cleanArgs[0] === 'delete') {
                delete macros[cleanArgs[1]];
                console.log(chalk.green(`Macro '${cleanArgs[1]}' supprimée.`));
            }
            break;

        case '/pipe':
            console.log(chalk.yellow("Chaînage d'outils simulé."));
            break;

        case '/loop':
            const times = parseInt(cleanArgs[0], 10);
            const cmdToLoop = cleanArgs.slice(1).join(' ');
            if (!isNaN(times) && cmdToLoop) {
                for (let idx = 0; idx < times; idx++) {
                    console.log(chalk.cyan(`[Boucle ${idx+1}/${times}] Exécution...`));
                    await handleSlashCommand(cmdToLoop);
                }
            }
            break;

        case '/schedule':
        case '/watch':
        case '/batch':
            console.log(chalk.yellow("Fonctionnalité planifiée pour la prochaine version stable de Cypher Coder."));
            break;

        default:
            console.log(chalk.red(`Commande slash inconnue: ${commandName}. Tapez /help pour afficher l'aide.`));
            break;
    }
    
    return true;
}

// Code runner helper
async function executeLocalCode(lang, code) {
    let cmd = "";
    if (lang === 'javascript' || lang === 'js' || lang === 'node') {
        cmd = `node -e "${code.replace(/"/g, '\\"')}"`;
    } else if (lang === 'python' || lang === 'py' || lang === 'python3') {
        cmd = `python3 -c "${code.replace(/"/g, '\\"')}"`;
    } else if (lang === 'bash' || lang === 'sh') {
        cmd = code;
    } else {
        console.log(chalk.red(`Langage de code non pris en charge pour l'exécution automatique: ${lang}`));
        return;
    }
    
    console.log(chalk.yellow(`Lancement du code local...`));
    await handleToolExecution('run_command', { command: cmd });
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

    if (text.startsWith('/')) {
        const handled = await handleSlashCommand(text);
        if (handled) {
            return askQuestion();
        }
    }

    lastUserInput = text;
    commandHistory.push(text);

    chatMessages.push({"role": "user", "content": text});
    await runAgentTurn();
    
    askQuestion();
}

async function main() {
    console.log(BANNER);
    
    // Initialiser la session de chat
    initChat();
    
    // Support des arguments directs (ex: cypher "Bonjour" ou cypher "/help")
    const args = process.argv.slice(2);
    if (args.length > 0) {
        const initialRequest = args.join(" ");
        console.log(chalk.blue('❯ Vous : ') + initialRequest);
        if (initialRequest.startsWith('/')) {
            await handleSlashCommand(initialRequest);
        } else {
            lastUserInput = initialRequest;
            commandHistory.push(initialRequest);
            chatMessages.push({"role": "user", "content": initialRequest});
            await runAgentTurn();
        }
    }
    
    askQuestion();
}

main();
