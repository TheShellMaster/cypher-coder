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
