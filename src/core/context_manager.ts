import { state } from './state.js';

const MAX_MESSAGES = 15;

export function compactContext() {
    // Si l'historique dépasse la limite, on compresse
    if (state.chatMessages.length > MAX_MESSAGES) {
        // Le premier message est toujours le system prompt
        const systemPrompt = state.chatMessages[0];
        
        // On conserve les 10 derniers messages
        const messagesToKeep = state.chatMessages.slice(-10);
        
        const summaryMessage = {
            role: 'system',
            content: '[SYSTÈME] L\'historique précédent a été compressé/tronqué automatiquement pour préserver les performances et le contexte (limite de tokens). Les outils et l\'environnement sont toujours actifs.'
        };
        
        // On remplace le tableau
        state.chatMessages = [systemPrompt, summaryMessage, ...messagesToKeep];
    }
}
