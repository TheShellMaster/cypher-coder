import os from 'os';
import path from 'path';
import fs from 'fs';

export const SLASH_COMMANDS = [
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
    { cmd: '/agents',            desc: 'Gérer les sous-agents (list, create, enable, disable)' },
    { cmd: '/add',               desc: 'Ajouter des fichiers au contexte de discussion (ex: /add src/main.js)' },
    { cmd: '/drop',              desc: 'Retirer des fichiers du contexte' },
    { cmd: '/ls',                desc: 'Lister les fichiers actuellement dans le contexte' },
    { cmd: '/commit',            desc: 'Générer un message (IA) et commiter les changements (git)' },
    { cmd: '/diff',              desc: 'Afficher les modifications non commitées (git diff)' },
    { cmd: '/undo',              desc: 'Annuler le dernier commit (git reset HEAD~1)' }
];

export const customCommands = [];

export function loadCustomCommands() {
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
