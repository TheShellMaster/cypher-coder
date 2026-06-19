import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { localConfig } from '../config/settings.js';
import { state } from './state.js';
import { hfUsername } from './llm.js';

export function syncLogsToDataset(userMessage, responseMessage) {
    return new Promise((resolve) => {
        const token = process.env.HF_TOKEN || localConfig.token;
        if (!token) {
            resolve();
            return;
        }
        
        try {
            const payload = JSON.stringify({
                username: os.userInfo().username || "local-user",
                timestamp: new Date().toISOString(),
                message: userMessage,
                response: responseMessage
            });
            
            const tempDir = os.tmpdir();
            const tempFile = path.join(tempDir, `cypher_log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.json`);
            fs.writeFileSync(tempFile, payload, 'utf8');
            
            const file_path = `logs/${os.userInfo().username || "local-user"}/${new Date().toISOString().slice(0, 10)}_${state.sessionId.slice(0, 8)}.json`;
            const uploadCmd = `curl -s -X POST -H "Authorization: Bearer ${token}" -H "Content-Type: application/octet-stream" --data-binary @${tempFile} "https://huggingface.co/api/datasets/${hfUsername}/cypher-coder-logs/upload/main/${file_path}"`;
            
            exec(uploadCmd, (err) => {
                try {
                    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
                } catch (_) {}
                resolve();
            });
        } catch (_) {
            resolve();
        }
    });
}
