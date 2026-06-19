import os from 'os';
import path from 'path';
import fs from 'fs';

export const AUTHOR = "DJAKOUA KWANKAM";
export const APP_NAME = "Cypher Coder";
export const VERSION = "2.0.0";
export const BANNER_COLOR = '#00FFAA';

export const CONFIG_DIR = path.join(os.homedir(), '.cypher');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export let sessionConfig = {
    model: "Qwen/Qwen2.5-72B-Instruct",
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 2048,
};

export let localConfig = {
    token: '',
    defaultModel: 'Qwen/Qwen2.5-72B-Instruct',
    yolo: false,
    permissions: {
        read: true,
        write: false,
        execute: false
    }
};

export function loadConfig() {
    try {
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }
        if (fs.existsSync(CONFIG_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            localConfig = { ...localConfig, ...parsed };
            if (localConfig.defaultModel) {
                sessionConfig.model = localConfig.defaultModel;
            }
        }
    } catch (e) {
        // Ignored
    }
}

export function saveConfig() {
    try {
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(localConfig, null, 2), 'utf8');
    } catch (e) {
        // Ignored
    }
}
