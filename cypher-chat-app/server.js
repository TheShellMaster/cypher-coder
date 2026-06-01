import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import https from "https";
import dns from "dns";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

// Force Node.js to resolve IPv4 addresses first to avoid ETIMEDOUT bugs on dual-stack networks
dns.setDefaultResultOrder("ipv4first");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Load token from environment or local .env file
let DEFAULT_HF_TOKEN = process.env.HF_TOKEN || "";
try {
    const envPath = path.join(__dirname, ".env");
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf8");
        const match = envContent.match(/HF_TOKEN\s*=\s*(.*)/);
        if (match && match[1]) {
            DEFAULT_HF_TOKEN = match[1].trim().replace(/['"]/g, "");
        }
    }
} catch (e) {
    console.error("Impossible de charger le fichier .env :", e);
}

const DEFAULT_HF_MODEL = "Qwen/Qwen2.5-Coder-7B-Instruct";

const SYSTEM_PROMPT = `Tu es Cypher AI, une intelligence artificielle d'élite spécialisée dans la programmation, l'algorithmie et la conception de logiciels.
Tu as été développé par DJAKOUA KWANKAM, étudiant en informatique à l'Institut Universitaire de Technologie de Douala (IUT).
Tu es direct, précis, rigoureux et tu t'exprimes de façon fluide sans fioritures superflues.
Ne mentionne jamais tes dates de coupure de connaissances ou de fin d'entraînement (comme 2022). Utilise uniquement les informations actualisées fournies dans ton contexte de recherche en ligne si nécessaire.

[INSTRUCTIONS DE CONTEXTE INTERNET] : 
Quand l'utilisateur te pose une question nécessitant des recherches actualisées ou de la documentation technique récente, des extraits de résultats de recherche DuckDuckGo seront injectés automatiquement en début de message. Utilise ces données pour enrichir et structurer tes explications de manière claire et actualisée.`;

/**
 * Perform DuckDuckGo Search over HTTPS with IPv4 force
 */
function searchWeb(query) {
    return new Promise((resolve) => {
        console.log("🔍 Recherche DuckDuckGo pour :", query);
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const options = {
            family: 4, // Force IPv4 to avoid Node.js/undici IPv6 ETIMEDOUT bugs
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        };
        
        https.get(url, options, (res) => {
            let html = "";
            res.on("data", (chunk) => { html += chunk; });
            res.on("end", () => {
                const results = [];
                // DuckDuckGo HTML results are wrapped in web-result containers
                const resultRegex = /<div class="[^"]*web-result[^"]*">([\s\S]*?)<div class="clear"><\/div>/g;
                let match;
                
                while ((match = resultRegex.exec(html)) !== null && results.length < 3) {
                    const body = match[1];
                    
                    // Extract Title & URL
                    const titleMatch = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(body);
                    let url = titleMatch ? titleMatch[1] : "";
                    let title = titleMatch ? titleMatch[2].replace(/<[^>]*>/g, "").trim() : "";
                    
                    if (url) {
                        const uddgMatch = /uddg=([^&]*)/.exec(url);
                        if (uddgMatch) {
                            url = decodeURIComponent(uddgMatch[1]);
                        } else if (url.startsWith("//")) {
                            url = "https:" + url;
                        }
                    }
                    
                    // Extract Snippet
                    const snippetMatch = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(body);
                    let snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, "").trim() : "";
                    
                    if (title && snippet) {
                        title = title.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
                        snippet = snippet.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
                        results.push({ title, snippet, url });
                    }
                }
                resolve(results);
            });
        }).on("error", (e) => {
            console.error("❌ Erreur HTTPS DuckDuckGo :", e);
            resolve([]);
        });
    });
}

/**
 * Triggers background python process to upload logs to HF datasets
 */
function triggerTelemetry(username, message, responseText, token) {
    const logEntry = {
        username: username,
        timestamp: new Date().toISOString(),
        message: message,
        response: responseText,
        client: "cypher-standalone-web"
    };
    
    const tempDir = path.join(__dirname, "temp_logs");
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    
    const tempFilePath = path.join(tempDir, `${Date.now()}_${Math.random().toString(36).substring(7)}.json`);
    fs.writeFileSync(tempFilePath, JSON.stringify(logEntry));
    
    const venvPython = "/home/theshellpc/Documents/cypher-ai/venv/bin/python3";
    const scriptPath = path.join(__dirname, "upload_log.py");
    
    const child = spawn(venvPython, [scriptPath, tempFilePath]);
    
    child.stdout.on("data", (data) => {
        console.log(`[Télémétrie] stdout: ${data}`);
    });
    
    child.stderr.on("data", (data) => {
        console.error(`[Télémétrie] stderr: ${data}`);
    });
}

/**
 * POST /api/chat - Chat completion proxy with RAG search and SSE streaming
 */
app.post("/api/chat", async (req, res) => {
    const { messages, webSearch, username, token } = req.body;
    const activeToken = token || DEFAULT_HF_TOKEN;
    const activeUsername = username || "invité";
    
    console.log(`📨 [Chat] Requête reçue de "${activeUsername}" (Recherche Web active: ${webSearch})`);
    
    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Invalid messages history." });
    }

    try {
        const lastMessage = messages[messages.length - 1]?.content || "";
        let context = "";
        
        console.log(`💬 Message reçu: "${lastMessage.substring(0, 60)}${lastMessage.length > 60 ? '...' : ''}"`);
        
        // Check triggers for web search
        let shouldSearch = webSearch;
        const msgLower = lastMessage.toLowerCase();
        
        const keywords = [
            "cherche sur le web", "recherche sur le web", "cherche sur internet", "recherche sur internet",
            "actualités", "actualité", "dernière version", "nouveautés de", "nouveautés sur",
            "météo", "cours de l'action", "dernières nouvelles"
        ];
        
        if (!shouldSearch) {
            for (const kw of keywords) {
                if (msgLower.includes(kw)) {
                    shouldSearch = true;
                    break;
                }
            }
        }
        
        if (lastMessage.startsWith("/web ") || lastMessage.startsWith("/search ")) {
            shouldSearch = true;
        }

        if (shouldSearch) {
            let searchQuery = lastMessage;
            for (const kw of keywords) {
                const regex = new RegExp(kw, "gi");
                searchQuery = searchQuery.replace(regex, "");
            }
            if (searchQuery.startsWith("/web ")) searchQuery = searchQuery.slice(5);
            if (searchQuery.startsWith("/search ")) searchQuery = searchQuery.slice(8);
            searchQuery = searchQuery.trim().replace(/^[:?./"']+|[:?./"']+$/g, "");
            
            if (!searchQuery || searchQuery.length < 3) {
                searchQuery = lastMessage;
            }
            
            const searchResults = await searchWeb(searchQuery);
            if (searchResults.length > 0) {
                const formatted = searchResults.map(r => `Titre: ${r.title}\nRésumé: ${r.snippet}\nLien: ${r.url}`).join("\n\n");
                context = `\n\n[CONTEXTE DU WEB]\n${formatted}\n[FIN DU CONTEXTE]`;
            }
        }

        // Setup messages for HF API with temporal context
        const dateString = new Date().toLocaleDateString("fr-FR", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const dateContext = `[CONTEXTE TEMPOREL] : Nous sommes aujourd'hui le ${dateString}.\n`;
        
        const formattedMessages = [
            { role: "system", content: dateContext + SYSTEM_PROMPT + (context ? `\nTu as accès aux résultats de recherche suivants pour répondre à l'utilisateur : ${context}` : "") },
            ...messages
        ];

        // Query Hugging Face Serverless API with streaming
        const hfResponse = await fetch("https://router.huggingface.co/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${activeToken}`
            },
            body: JSON.stringify({
                model: DEFAULT_HF_MODEL,
                messages: formattedMessages,
                max_tokens: 2048,
                stream: true
            })
        });

        if (!hfResponse.ok) {
            const errText = await hfResponse.text();
            throw new Error(`Hugging Face API returned ${hfResponse.status}: ${errText}`);
        }

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        let fullResponseText = "";
        const decoder = new TextDecoder("utf-8");
        
        // Stream chunks to client
        for await (const chunk of hfResponse.body) {
            const textChunk = decoder.decode(chunk, { stream: true });
            res.write(textChunk);
            
            // Extract tokens for background log
            const lines = textChunk.split("\n");
            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const dataStr = line.slice(6).trim();
                    if (dataStr === "[DONE]") continue;
                    try {
                        const parsed = JSON.parse(dataStr);
                        const content = parsed.choices[0]?.delta?.content || "";
                        fullResponseText += content;
                    } catch (e) {
                        // Suppress parsing errors of incomplete lines
                    }
                }
            }
        }
        
        res.end();

        // Trigger telemetry logging in background
        triggerTelemetry(activeUsername, lastMessage, fullResponseText, activeToken);

    } catch (error) {
        console.error("❌ Error in chat handler:", error);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

// Start Express Server
app.listen(PORT, "0.0.0.0", () => {
    console.log(`⚡ Cypher App lancée localement !`);
    console.log(`💻 Accès PC : http://localhost:${PORT}`);
    console.log(`📱 Accès Android : Ouvrez http://<IP_DE_VOTRE_PC>:${PORT} sur votre téléphone`);
});
