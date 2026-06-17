import { execSync } from 'child_process';
import { SLASH_COMMANDS, customCommands } from './registry.js';
import { renderBox } from '../ui/render.js';
import { state } from '../core/state.js';
import { localConfig, sessionConfig } from '../config/settings.js';
import { runAgentTurn } from '../core/agent.js';
import { listFilesRecursive } from '../tools/system.js';

export async function handleSlashCommand(textInput) {
    const parts = textInput.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    if (parts.length === 0) return;
    const commandName = parts[0].toLowerCase();
    const cleanArgs = parts.slice(1).map(a => a.replace(/^["']|["']$/g, ''));
    
    // Custom Commands
    const matchedCustom = customCommands.find(c => c.cmd === commandName);
    if (matchedCustom) {
        let finalPrompt = matchedCustom.promptTemplate;
        const files = listFilesRecursive('.', 1, 1).filter(f => f.type === 'fichier');
        if (files.length > 0) {
            finalPrompt = finalPrompt.replace(/\{\{(file|fichier_courant)\}\}/g, files[0].path);
        }
        state.chatMessages.push({ role: "user", content: finalPrompt });
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
            process.exit(0);
            break;
            
        case '/clear':
            console.clear();
            break;
            
        case '/reset':
            state.chatMessages = [];
            state.contextFiles.clear();
            renderBox('Reset', 'Session et contexte réinitialisés.', '#FFD700');
            break;
            
        case '/status':
            renderBox('Status local', JSON.stringify({ yolo: localConfig.yolo, model: sessionConfig.model }, null, 2), '#00FFFF');
            break;
            
        case '/yolo':
            localConfig.yolo = !localConfig.yolo;
            renderBox('Mode YOLO', localConfig.yolo ? 'Activé (Aucune confirmation requise)' : 'Désactivé (Confirmations requises)', '#FFD700');
            break;
            
        case '/add':
            if (cleanArgs.length === 0) {
                renderBox('Erreur', 'Spécifiez un fichier : /add <fichier>', '#FF5555');
            } else {
                for (const file of cleanArgs) {
                    state.contextFiles.add(file);
                    renderBox('Contexte ajouté', `Fichier ${file} ajouté.`, '#00FFAA');
                }
            }
            break;
            
        case '/ls':
            if (state.contextFiles.size === 0) {
                renderBox('Contexte vide', 'Aucun fichier dans le contexte courant.', '#FFD700');
            } else {
                renderBox('Fichiers en contexte', Array.from(state.contextFiles).join('\n'), '#00FFAA');
            }
            break;
            
        case '/drop':
            if (cleanArgs.length === 0) {
                state.contextFiles.clear();
                renderBox('Contexte vidé', 'Tous les fichiers ont été retirés.', '#00FFAA');
            } else {
                for (const file of cleanArgs) {
                    if (state.contextFiles.has(file)) {
                        state.contextFiles.delete(file);
                        renderBox('Contexte retiré', `Fichier ${file} retiré.`, '#00FFAA');
                    }
                }
            }
            break;

        case '/commit':
            try {
                const diff = execSync('git diff --cached').toString();
                if (!diff) {
                    renderBox('Info', 'Aucun changement stagé. Utilisez git add d\'abord.', '#FFD700');
                    return;
                }
                const prompt = `Génère un message de commit très concis pour ce diff:\n\n${diff}`;
                state.chatMessages.push({ role: 'user', content: prompt });
                await runAgentTurn();
                // Assumer que le LLM retourne le message
                const reply = state.chatMessages[state.chatMessages.length - 1].content;
                execSync(`git commit -m "${reply.replace(/"/g, '\\"')}"`);
                renderBox('Commit', 'Commit effectué avec succès.', '#00FFAA');
            } catch (err) {
                renderBox('Erreur Git', err.message, '#FF5555');
            }
            break;

        case '/diff':
            try {
                const diff = execSync('git diff').toString();
                if (!diff) renderBox('Info', 'Aucun changement non stagé.', '#FFD700');
                else console.log(diff);
            } catch (err) {
                renderBox('Erreur Git', err.message, '#FF5555');
            }
            break;

        case '/undo':
            try {
                execSync('git reset HEAD~1');
                renderBox('Git', 'Dernier commit annulé, modifications conservées.', '#00FFAA');
            } catch (err) {
                renderBox('Erreur Git', err.message, '#FF5555');
            }
            break;
            
        default:
            renderBox('Erreur', `Commande inconnue : ${commandName}`, '#FF5555');
    }
}
