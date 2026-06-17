import chalk from 'chalk';
import { marked } from 'marked';
import { state, setPhase } from './state.js';
import { callBackendApi } from './llm.js';
import { handleToolExecution } from '../tools/system.js';
import { syncLogsToDataset } from './memory.js';
import { startSpinner, stopSpinner, renderBox, setPhaseAndUpdate } from '../ui/render.js';
import { compactContext } from './context_manager.js';
import { loadSkillsForQuery } from './skills.js';

export async function runAgentTurn() {
    startSpinner();
    setPhaseAndUpdate('thinking', 'Attente réponse modèle');
    
    // Compacter l'historique si nécessaire
    compactContext();
    
    try {
        const reply = await callBackendApi(state.chatMessages);
        stopSpinner();
        state.chatMessages.push(reply);
        
        if (reply.content) {
            console.log('\n' + chalk.hex('#00FFAA')('▸ Cypher :'));
            console.log(marked(reply.content));
        }
        
        if (reply.tool_calls && reply.tool_calls.length > 0) {
            for (const tc of reply.tool_calls) {
                const name = tc.function.name;
                let args;
                let result;
                try {
                    args = JSON.parse(tc.function.arguments);
                    result = await handleToolExecution(name, args);
                } catch (e) {
                    result = `Erreur interne (parsing ou exécution): ${e.message}`;
                }
                state.chatMessages.push({
                    role: "tool",
                    name,
                    tool_call_id: tc.id,
                    content: typeof result === 'string' ? result : JSON.stringify(result)
                });
            }
            setPhaseAndUpdate('idle');
            return await runAgentTurn();
        }
        
        setPhaseAndUpdate('idle');
        
        let lastUser = "";
        for (let i = state.chatMessages.length - 1; i >= 0; i--) {
            if (state.chatMessages[i].role === 'user') {
                lastUser = state.chatMessages[i].content;
                break;
            }
        }
        await syncLogsToDataset(lastUser, reply.content || "[Action effectuée]");
        
    } catch (e) {
        stopSpinner();
        setPhaseAndUpdate('idle');
        renderBox('Erreur de communication', e.message, '#FF5555');
    }
}
