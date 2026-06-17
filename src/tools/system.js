import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { confirm, isCancel } from '@clack/prompts';
import { localConfig } from '../config/settings.js';
import { setPhaseAndUpdate, renderBox, renderDiffBox } from '../ui/render.js';

export function expandTilde(filepath) {
    if (!filepath) return filepath;
    if (filepath.startsWith('~/') || filepath === '~') {
        return path.join(os.homedir(), filepath.slice(1));
    }
    return filepath;
}

export function isBinaryFile(filePath) {
    try {
        const buffer = Buffer.alloc(1024);
        const fd = fs.openSync(filePath, 'r');
        const bytesRead = fs.readSync(fd, buffer, 0, 1024, 0);
        fs.closeSync(fd);
        for (let i = 0; i < bytesRead; i++) {
            if (buffer[i] === 0) return true;
        }
        return false;
    } catch (_) {
        return false;
    }
}

export async function checkPermission(actionType, detail) {
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

export function listFilesRecursive(dir, maxDepth = 3, currentDepth = 1) {
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

export async function handleToolExecution(name, args) {
    switch (name) {
        case 'read_file': {
            const targetPath = path.resolve(expandTilde(args.path));
            if (!fs.existsSync(targetPath)) return `Erreur: Fichier introuvable à ${targetPath}`;
            
            try {
                const stat = fs.statSync(targetPath);
                if (stat.isDirectory()) {
                    return `Erreur: "${args.path}" est un répertoire, pas un fichier.`;
                }
                if (isBinaryFile(targetPath)) {
                    return `Erreur: Le fichier "${args.path}" est un fichier binaire et ne peut pas être lu comme du texte.`;
                }
                if (stat.size > 1024 * 1024) {
                    return `Erreur: Le fichier "${args.path}" est trop lourd pour être lu en contexte (${(stat.size / 1024 / 1024).toFixed(2)} Mo).`;
                }
            } catch (err) {
                return `Erreur lors de la lecture des métadonnées du fichier : ${err.message}`;
            }

            const allowed = await checkPermission('read', `Lecture de ${args.path}`);
            if (!allowed) return "Action refusée par l'utilisateur.";
            setPhaseAndUpdate('reading', args.path);
            return fs.readFileSync(targetPath, 'utf8');
        }
        
        case 'write_file': {
            const targetPath = path.resolve(expandTilde(args.path));
            renderBox(`${args.path} (Écriture / Création)`, args.content, '#FFD700');
            const allowed = await checkPermission('write', `Écriture dans ${args.path}`);
            if (!allowed) return "Action refusée.";
            setPhaseAndUpdate('writing', args.path);
            const dir = path.dirname(targetPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(targetPath, args.content, 'utf8');
            return `Fichier écrit avec succès à ${targetPath}`;
        }
        
        case 'patch_file': {
            const targetPath = path.resolve(expandTilde(args.path));
            if (!fs.existsSync(targetPath)) return `Erreur: ${targetPath} introuvable.`;
            const content = fs.readFileSync(targetPath, 'utf8');
            const occurrences = content.split(args.search).length - 1;
            if (occurrences === 0) return "Erreur: Bloc de code cible introuvable dans le fichier.";
            if (occurrences > 1) return "Erreur: Bloc cible ambigu (trouvé plusieurs fois). Soyez plus spécifique.";
            
            renderDiffBox(args.path, args.search, args.replace);
            const allowed = await checkPermission('write', `Appliquer la modification dans ${args.path}`);
            if (!allowed) return "Action refusée.";
            setPhaseAndUpdate('writing', args.path);
            fs.writeFileSync(targetPath, content.replace(args.search, args.replace), 'utf8');
            return "Modification appliquée avec succès.";
        }
        
        case 'list_dir': {
            const targetPath = path.resolve(expandTilde(args.path || "."));
            if (!fs.existsSync(targetPath)) return `Erreur: Répertoire introuvable à ${targetPath}`;
            setPhaseAndUpdate('code_investigator', `Scan de ${args.path || '.'}`);
            try {
                const items = fs.readdirSync(targetPath).map(item => {
                    try {
                        const s = fs.statSync(path.join(targetPath, item));
                        return { name: item, type: s.isDirectory() ? 'dossier' : 'fichier', sizeBytes: s.size };
                    } catch (e) {
                        return { name: item, type: 'inconnu', error: e.message };
                    }
                });
                return JSON.stringify(items, null, 2);
            } catch (err) {
                return `Erreur lors de la lecture du répertoire: ${err.message}`;
            }
        }
        
        case 'find_files': {
            const startDir = path.resolve(expandTilde(args.path || "."));
            setPhaseAndUpdate('code_investigator', `Recherche de ${args.pattern}`);
            const escaped = args.pattern.replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\\\*/g, '.*').replace(/\\\?/g, '.');
            const regex = new RegExp(`^${escaped}$`, 'i');
            const all = listFilesRecursive(startDir, 5, 1);
            return JSON.stringify(all.filter(i => i.type === 'fichier' && regex.test(path.basename(i.path))).map(i => i.path), null, 2);
        }
        
        case 'grep_search': {
            const startDir = path.resolve(expandTilde(args.path || "."));
            setPhaseAndUpdate('code_investigator', `Recherche textuelle de: "${args.query}"`);
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
            setPhaseAndUpdate('bash', args.command);
            try {
                const stdout = execSync(args.command, { stdio: 'pipe' }).toString();
                renderBox(`Résultat de la commande`, stdout, '#00FFAA');
                const finalStdout = stdout.length > 50000 ? stdout.slice(0, 50000) + '\n... [TRONQUÉ CAR TROP LONG]' : stdout;
                return `Commande exécutée avec succès.\nStdout:\n${finalStdout}`;
            } catch (err) {
                const errMsg = err.stderr ? err.stderr.toString() : err.message;
                renderBox(`Erreur de commande`, errMsg, '#FF5555');
                const finalErr = errMsg.length > 50000 ? errMsg.slice(0, 50000) + '\n... [TRONQUÉ]' : errMsg;
                return `Échec de l'exécution.\nErreur:\n${finalErr}`;
            }
        }
        
        default:
            return `Erreur: Outil inconnu '${name}'`;
    }
}
