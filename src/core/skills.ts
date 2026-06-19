import fs from 'fs';
import path from 'path';
import { state } from './state.js';
import { renderBox } from '../ui/render.js';

// Système inspiré de Gemini CLI / Antigravity SDK
// Permet de charger des "compétences" spécifiques de manière dynamique (Progressive Disclosure)

const SKILLS_DIR = path.join(process.cwd(), 'skills');

export function loadSkillsForQuery(query) {
    if (!fs.existsSync(SKILLS_DIR)) return;
    
    // Si la requête de l'utilisateur contient des mots-clés, on injecte les skills pertinents
    const queryLower = query.toLowerCase();
    
    const skillsToInject = [];
    
    try {
        const files = fs.readdirSync(SKILLS_DIR);
        for (const file of files) {
            if (file.endsWith('.md') || file.endsWith('.txt')) {
                const skillName = file.split('.')[0].toLowerCase();
                // Si la requête mentionne le skill
                if (queryLower.includes(skillName)) {
                    const content = fs.readFileSync(path.join(SKILLS_DIR, file), 'utf8');
                    skillsToInject.push({ name: skillName, content });
                }
            }
        }
    } catch (e) {
        // Ignorer les erreurs de lecture
    }
    
    if (skillsToInject.length > 0) {
        let skillPrompt = "[SKILLS DYNAMIQUES CHARGÉS]\n";
        for (const skill of skillsToInject) {
            skillPrompt += `--- Skill: ${skill.name} ---\n${skill.content}\n`;
        }
        skillPrompt += "Utilise ces compétences pour répondre à la requête.";
        
        state.chatMessages.push({ role: "system", content: skillPrompt });
        renderBox('Skills', `Compétence(s) chargée(s) dynamiquement : ${skillsToInject.map(s => s.name).join(', ')}`, '#00FFAA');
    }
}
