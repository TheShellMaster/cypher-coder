export const PHASES = {
    idle: { label: '[idle]', color: '#888888' },
    thinking: { label: '[thinking]', color: '#00FFFF' },
    searching: { label: '[searching]', color: '#569CD6' },
    code_investigator: { label: '[code_investigator]', color: '#C792EA' },
    reading: { label: '[reading]', color: '#FFD700' },
    writing: { label: '[writing]', color: '#FFD700' },
    bash: { label: '[bash]', color: '#FF5555' },
    planning: { label: '[planning]', color: '#3ddc97' },
    reviewing: { label: '[reviewing]', color: '#00FFAA' },
    memory_sync: { label: '[memory_sync]', color: '#888888' }
};

export const state = {
    currentPhase: 'idle',
    phaseDetails: '',
    activeSubagent: null,
    chatMessages: [],
    commandHistory: [],
    historyIndex: -1,
    sessionId: `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
    contextFiles: new Set(),
    plannerMode: false,
    updateCallback: null as any
};

export function setPhase(phaseId, details = '') {
    state.currentPhase = phaseId;
    state.phaseDetails = details;
    if (state.updateCallback) {
        state.updateCallback(state);
    }
}
