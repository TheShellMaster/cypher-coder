import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { sessionConfig, localConfig } from '../config/settings.js';

export let hfUsername = "TheShellMaster";
export let dynamicSpaceUrl = "https://theshellmaster-cypher-coder.hf.space/api/chat";

export async function detectHfUsername() {
    const token = process.env.HF_TOKEN || localConfig.token;
    if (!token) return;
    try {
        const cmd = `curl -s -H "Authorization: Bearer ${token}" https://huggingface.co/api/whoami-v2`;
        const res = await new Promise((resolve) => {
            exec(cmd, (err, stdout) => {
                if (err) resolve("{}");
                else resolve(stdout);
            });
        });
        const data = JSON.parse(res);
        if (data.name) {
            hfUsername = data.name;
            dynamicSpaceUrl = `https://${hfUsername.toLowerCase()}-cypher-coder.hf.space/api/chat`;
        }
    } catch (_) {}
}

export function callBackendApi(messages) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            messages,
            tools: [
                { type: "function", function: { name: "read_file",    description: "Lit le contenu complet d'un fichier local.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
                { type: "function", function: { name: "write_file",   description: "Crée ou écrase un fichier local.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } },
                { type: "function", function: { name: "patch_file",   description: "Modifie de manière ciblée un bloc de texte (Search & Replace).", parameters: { type: "object", properties: { path: { type: "string" }, search: { type: "string" }, replace: { type: "string" } }, required: ["path", "search", "replace"] } } },
                { type: "function", function: { name: "list_dir",     description: "Liste les fichiers et dossiers d'un répertoire.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
                { type: "function", function: { name: "find_files",   description: "Recherche des fichiers par nom (pattern).", parameters: { type: "object", properties: { pattern: { type: "string" }, path: { type: "string" } }, required: ["pattern"] } } },
                { type: "function", function: { name: "grep_search",  description: "Recherche textuelle récursive dans les fichiers.", parameters: { type: "object", properties: { query: { type: "string" }, path: { type: "string" } }, required: ["query"] } } },
                { type: "function", function: { name: "run_command",  description: "Exécute une commande système dans le terminal.", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } } }
            ],
            model: sessionConfig.model,
            temperature: sessionConfig.temperature,
            top_p: sessionConfig.top_p,
            max_tokens: sessionConfig.max_tokens,
            username: os.userInfo().username || "local-user"
        });
        
        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, `cypher_payload_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.json`);
        try {
            fs.writeFileSync(tempFile, payload, 'utf8');
        } catch (err) {
            reject(new Error(`Impossible de créer le fichier temporaire de requête : ${err.message}`));
            return;
        }
        
        const command = `curl -s -X POST -H "Content-Type: application/json" -d @${tempFile} ${dynamicSpaceUrl}`;
        
        exec(command, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
            try {
                if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            } catch (_) {}
            
            if (err) {
                reject(new Error(`Erreur de connexion Space: ${err.message}`));
                return;
            }
            try {
                const responseJson = JSON.parse(stdout);
                if (responseJson.error) {
                    reject(new Error(responseJson.error));
                } else {
                    resolve(responseJson.message);
                }
            } catch (e) {
                reject(new Error(`Erreur parsing réponse: ${e.message} (Raw: ${stdout.slice(0, 200)})`));
            }
        });
    });
}
