import { state, setPhase } from '../core/state.js';

export function startSpinner() {
    setPhase('thinking');
}

export function stopSpinner() {
    setPhase('idle');
}

export function setPhaseAndUpdate(phase: string, details: string = '') {
    setPhase(phase, details);
}

export function renderBox(title: string, content: string, color: string = '#00FFAA') {
    // Instead of rendering directly to stdout, push it as a system message so Ink renders it
    state.chatMessages.push({
        role: 'system',
        name: title,
        content: content,
        color: color
    });
    if (state.updateCallback) state.updateCallback(state);
}

export function renderDiffBox(title: string, diff: string) {
    state.chatMessages.push({
        role: 'system',
        name: title,
        content: diff,
        color: '#FFD700'
    });
    if (state.updateCallback) state.updateCallback(state);
}

export function drawFooter() {
    // No-op for Ink
}
