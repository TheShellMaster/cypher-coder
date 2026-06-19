import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import { state, setPhaseAndUpdate } from './core/state.js';
import { runAgentTurn } from './core/agent.js';
import { handleSlashCommand } from './commands/builtins.js';

const App = () => {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<any[]>([]);
    const [phase, setPhase] = useState('idle');
    const [phaseText, setPhaseText] = useState('');

    useEffect(() => {
        state.updateCallback = (newState: any) => {
            setMessages([...newState.chatMessages]);
            setPhase(newState.phase);
            setPhaseText(newState.phaseText);
        };
        // Initial system prompt setup if needed
    }, []);

    const handleSubmit = async (query: string) => {
        if (!query.trim()) return;
        setInput('');
        
        if (query.startsWith('/')) {
            await handleSlashCommand(query);
            return;
        }

        state.chatMessages.push({ role: 'user', content: query });
        state.updateCallback(state);
        
        await runAgentTurn();
    };

    return (
        <Box flexDirection="column">
            {/* Header */}
            <Box borderStyle="round" borderColor="cyan" paddingX={2}>
                <Text color="cyan" bold> Cypher Coder CLI (Ink React Edition) </Text>
            </Box>

            {/* Chat Messages */}
            <Box flexDirection="column" marginY={1}>
                {messages.map((m, i) => {
                    if (m.role === 'user') return <Text key={i} color="blue">❯ {m.content}</Text>;
                    if (m.role === 'assistant' && m.content) return <Text key={i} color="green">▸ Cypher : {m.content}</Text>;
                    if (m.role === 'tool') return <Text key={i} color="gray">[Tool: {m.name}]</Text>;
                    return null;
                })}
            </Box>

            {/* Status / Spinner */}
            {phase !== 'idle' && (
                <Box>
                    <Text color="yellow"><Spinner type="dots" /> {phaseText}</Text>
                </Box>
            )}

            {/* Input */}
            {phase === 'idle' && (
                <Box>
                    <Text color="magenta">❯ </Text>
                    <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
                </Box>
            )}
        </Box>
    );
};

render(<App />);
