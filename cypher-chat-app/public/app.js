// App State
let username = localStorage.getItem("cypher_username") || "invité";
let hfToken = localStorage.getItem("cypher_token") || "";
let appMode = (window.location.protocol === "file:") ? "direct" : "local";
localStorage.setItem("cypher_mode", appMode);
let conversations = JSON.parse(localStorage.getItem("cypher_conversations")) || [];
let currentConversationId = localStorage.getItem("cypher_current_id") || null;
let currentMessages = [];
let attachedFiles = []; // Holds { name, textContent }

// DOM Elements
const sidebar = document.getElementById("sidebar");
const menuToggleBtn = document.getElementById("menuToggleBtn");
const closeSidebarBtn = document.getElementById("closeSidebarBtn");
const newChatBtn = document.getElementById("newChatBtn");
const chatHistoryList = document.getElementById("chatHistoryList");
const settingsBtn = document.getElementById("settingsBtn");
const clearChatBtn = document.getElementById("clearChatBtn");
const statusText = document.getElementById("statusText");
const messagesContainer = document.getElementById("messagesContainer");
const welcomeView = document.getElementById("welcomeView");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const webSearchToggle = document.getElementById("webSearchToggle");

// Attachment Elements
const fileInput = document.getElementById("fileInput");
const attachBtn = document.getElementById("attachBtn");
const attachmentPreviewContainer = document.getElementById("attachmentPreviewContainer");

// Settings Modal Elements
const settingsModal = document.getElementById("settingsModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const usernameInput = document.getElementById("usernameInput");
const tokenInput = document.getElementById("tokenInput");
const modeSelect = document.getElementById("modeSelect");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");

const DEFAULT_HF_TOKEN = "";

// Updated prompt suppressing 2022 training info and enforcing DJAKOUA student credit
const SYSTEM_PROMPT = `Tu es Cypher AI, une intelligence artificielle d'élite spécialisée dans la programmation, l'algorithmie et la conception de logiciels.
Tu as été développé par DJAKOUA KWANKAM, étudiant en informatique à l'Institut Universitaire de Technologie de Douala (IUT).
Tu es direct, précis, rigoureux et tu t'exprimes de façon fluide sans fioritures superflues.

[INSTRUCTION TEMPORELLE IMPORTANTE] : L'année actuelle est STRICTEMENT 2026. Si l'utilisateur te demande la date actuelle ou l'année en cours, réponds avec assurance que nous sommes en 2026. Ne dis jamais que tu es en 2023 ou 2024.

Ne mentionne jamais tes dates de coupure de connaissances ou de fin d'entraînement (comme 2022) et n'explique jamais à l'utilisateur que tu n'as pas accès à internet ou au web, car l'application effectue les recherches pour toi et t'injecte les résultats directement. Utilise simplement les résultats de recherche fournis pour répondre de façon actualisée.`;

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();
    initThemeAndSettings();
    renderConversationsList();
    
    if (currentConversationId) {
        loadConversation(currentConversationId);
    } else {
        startNewConversation();
    }
    
    setupEventListeners();

    // Hide startup loader smoothly
    const loader = document.getElementById("startupLoader");
    if (loader) {
        setTimeout(() => {
            loader.classList.add("fade-out");
            setTimeout(() => loader.remove(), 600);
        }, 1500); // 1.5 seconds premium delay
    }
});

// Settings & Theme Initialization
function initThemeAndSettings() {
    usernameInput.value = username;
    tokenInput.value = hfToken;
    modeSelect.value = appMode;
    updateStatusText();
}

function updateStatusText() {
    if (appMode === "local") {
        statusText.innerText = "Serveur local (RAG Web)";
    } else {
        statusText.innerText = "Direct Hugging Face (Sans serveur)";
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Sidebar Mobile Toggles
    menuToggleBtn.addEventListener("click", () => sidebar.classList.add("active"));
    closeSidebarBtn.addEventListener("click", () => sidebar.classList.remove("active"));
    
    // New Chat Action
    newChatBtn.addEventListener("click", () => {
        startNewConversation();
        sidebar.classList.remove("active");
    });
    
    // Textarea auto-growing & enabling send button
    userInput.addEventListener("input", updateSendButtonState);
    
    userInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (userInput.value.trim() !== "" || attachedFiles.length > 0) {
                sendMessage();
            }
        }
    });
    
    // Send Message Button Action
    sendBtn.addEventListener("click", sendMessage);
    
    // Clear Chat
    clearChatBtn.addEventListener("click", () => {
        if (confirm("Effacer la conversation actuelle ?")) {
            clearCurrentConversation();
        }
    });
    
    // File Attach Operations
    attachBtn.addEventListener("click", () => {
        fileInput.click();
    });
    
    fileInput.addEventListener("change", handleFileSelection);
    
    // Settings modal triggers
    settingsBtn.addEventListener("click", () => {
        settingsModal.classList.add("active");
    });
    
    closeModalBtn.addEventListener("click", () => {
        settingsModal.classList.remove("active");
    });
    
    settingsModal.addEventListener("click", (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove("active");
        }
    });
    
    saveSettingsBtn.addEventListener("click", saveSettings);
    
    // Drag and Drop File support
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", handleFileDrop);
}

// Check state to enable/disable send button
function updateSendButtonState() {
    userInput.style.height = "auto";
    userInput.style.height = userInput.scrollHeight + "px";
    sendBtn.disabled = userInput.value.trim() === "" && attachedFiles.length === 0;
}

// Handle local file uploads
function handleFileSelection(e) {
    const files = e.target.files;
    processFiles(files);
}

// Handle Drag-and-Drop file uploads
function handleFileDrop(e) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    processFiles(files);
}

// Process selected/dropped files
function processFiles(files) {
    if (!files || files.length === 0) return;
    
    Array.from(files).forEach(file => {
        // File size limit 500KB to avoid blowing context window
        if (file.size > 500 * 1024) {
            showToast(`Le fichier "${file.name}" est trop volumineux (max 500 Ko).`, "error");
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const textContent = event.target.result;
            // Check if file is text-based (rough heuristic: check for null bytes)
            if (textContent.includes("\0")) {
                showToast(`Le fichier "${file.name}" semble être binaire. Seuls les fichiers texte sont acceptés.`, "error");
                return;
            }
            
            // Add to state if not already attached
            if (!attachedFiles.some(f => f.name === file.name)) {
                attachedFiles.push({
                    name: file.name,
                    textContent: textContent
                });
                renderAttachmentChips();
                updateSendButtonState();
            }
        };
        reader.readAsText(file);
    });
    
    // Reset file input value to allow re-uploading same file
    fileInput.value = "";
}

// Render uploaded file chips above input
function renderAttachmentChips() {
    attachmentPreviewContainer.innerHTML = "";
    
    if (attachedFiles.length === 0) {
        attachmentPreviewContainer.style.display = "none";
        return;
    }
    
    attachmentPreviewContainer.style.display = "flex";
    
    attachedFiles.forEach((file, index) => {
        const chip = document.createElement("div");
        chip.className = "attachment-chip";
        chip.innerHTML = `
            <i data-lucide="file-text" size="14"></i>
            <span>${file.name}</span>
            <button class="remove-attach-btn" type="button" onclick="removeAttachedFile(${index})">
                <i data-lucide="x" size="12"></i>
            </button>
        `;
        attachmentPreviewContainer.appendChild(chip);
    });
    
    lucide.createIcons();
}

// Global removal function accessible from inline onclick
window.removeAttachedFile = function(index) {
    attachedFiles.splice(index, 1);
    renderAttachmentChips();
    updateSendButtonState();
};

// Start New Chat Session
function startNewConversation() {
    currentConversationId = "chat_" + Date.now();
    currentMessages = [];
    attachedFiles = [];
    localStorage.setItem("cypher_current_id", currentConversationId);
    
    messagesContainer.innerHTML = "";
    messagesContainer.appendChild(welcomeView);
    welcomeView.style.display = "flex";
    
    userInput.value = "";
    userInput.style.height = "auto";
    renderAttachmentChips();
    sendBtn.disabled = true;
}

// Load Selected Conversation from Storage
function loadConversation(id) {
    const conv = conversations.find(c => c.id === id);
    if (!conv) {
        startNewConversation();
        return;
    }
    
    currentConversationId = id;
    currentMessages = conv.messages || [];
    attachedFiles = [];
    localStorage.setItem("cypher_current_id", currentConversationId);
    
    redrawCurrentConversation();
    renderAttachmentChips();
    renderConversationsList();
}

// Clear Current Chat
function clearCurrentConversation() {
    currentMessages = [];
    attachedFiles = [];
    conversations = conversations.filter(c => c.id !== currentConversationId);
    saveConversationsToStorage();
    startNewConversation();
    renderConversationsList();
}

// Render Single Message in Chat Area
function renderMessage(role, content) {
    welcomeView.style.display = "none";
    
    const wrapper = document.createElement("div");
    wrapper.classList.add("message-wrapper", role);
    
    const label = document.createElement("div");
    label.classList.add("message-label");
    label.innerText = role === "user" ? username : "Cypher AI";
    
    const bubble = document.createElement("div");
    bubble.classList.add("message-bubble");
    
    // Check if message content has file markers to display them nicely
    let displayContent = content;
    bubble.innerHTML = parseMarkdown(displayContent);
    
    wrapper.appendChild(label);
    wrapper.appendChild(bubble);
    
    // Create Toolbar Actions Row
    const actionsRow = document.createElement("div");
    actionsRow.className = "message-actions";
    
    if (role === "assistant") {
        actionsRow.innerHTML = `
            <button class="action-btn copy-btn" title="Copier la réponse">
                <i data-lucide="copy" size="14"></i>
            </button>
            <button class="action-btn like-btn" title="Aimer la réponse">
                <i data-lucide="thumbs-up" size="14"></i>
            </button>
            <button class="action-btn dislike-btn" title="Détester la réponse">
                <i data-lucide="thumbs-down" size="14"></i>
            </button>
            <button class="action-btn share-btn" title="Partager la discussion">
                <i data-lucide="share-2" size="14"></i>
            </button>
        `;
        
        // Copy action
        const copyBtn = actionsRow.querySelector(".copy-btn");
        copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(content).then(() => {
                const icon = copyBtn.querySelector("i");
                icon.setAttribute("data-lucide", "check");
                lucide.createIcons({ scope: copyBtn });
                setTimeout(() => {
                    icon.setAttribute("data-lucide", "copy");
                    lucide.createIcons({ scope: copyBtn });
                }, 2000);
            });
        });
        
        // Like action
        const likeBtn = actionsRow.querySelector(".like-btn");
        const dislikeBtn = actionsRow.querySelector(".dislike-btn");
        likeBtn.addEventListener("click", () => {
            likeBtn.classList.toggle("active");
            dislikeBtn.classList.remove("active");
        });
        
        // Dislike action
        dislikeBtn.addEventListener("click", () => {
            dislikeBtn.classList.toggle("active");
            likeBtn.classList.remove("active");
        });
        
        // Share action
        const shareBtn = actionsRow.querySelector(".share-btn");
        shareBtn.addEventListener("click", () => {
            let shareText = `--- Discussion Cypher AI ---\n\n`;
            currentMessages.forEach(m => {
                shareText += `${m.role === 'user' ? 'Utilisateur' : 'Cypher AI'}:\n${m.content}\n\n`;
            });
            navigator.clipboard.writeText(shareText).then(() => {
                showToast("Discussion copiée dans le presse-papiers !", "success");
            });
        });
        
    } else { // user
        actionsRow.innerHTML = `
            <button class="action-btn copy-btn" title="Copier le message">
                <i data-lucide="copy" size="14"></i>
            </button>
            <button class="action-btn edit-btn" title="Modifier le message">
                <i data-lucide="edit-3" size="14"></i>
            </button>
            <button class="action-btn retry-btn" title="Réessayer l'envoi">
                <i data-lucide="refresh-cw" size="14"></i>
            </button>
        `;
        
        // Copy action
        const copyBtn = actionsRow.querySelector(".copy-btn");
        copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(content).then(() => {
                const icon = copyBtn.querySelector("i");
                icon.setAttribute("data-lucide", "check");
                lucide.createIcons({ scope: copyBtn });
                setTimeout(() => {
                    icon.setAttribute("data-lucide", "copy");
                    lucide.createIcons({ scope: copyBtn });
                }, 2000);
            });
        });
        
        // Edit Action
        const editBtn = actionsRow.querySelector(".edit-btn");
        editBtn.addEventListener("click", () => {
            if (bubble.querySelector(".edit-textarea")) return;
            
            const originalText = content;
            bubble.innerHTML = `
                <textarea class="edit-textarea">${originalText}</textarea>
                <div class="edit-actions">
                    <button class="edit-save-btn">Enregistrer & Renvoyer</button>
                    <button class="edit-cancel-btn">Annuler</button>
                </div>
            `;
            
            const textarea = bubble.querySelector(".edit-textarea");
            textarea.focus();
            textarea.style.height = "auto";
            textarea.style.height = textarea.scrollHeight + "px";
            textarea.addEventListener("input", () => {
                textarea.style.height = "auto";
                textarea.style.height = textarea.scrollHeight + "px";
            });
            
            bubble.querySelector(".edit-cancel-btn").addEventListener("click", (e) => {
                e.stopPropagation();
                bubble.innerHTML = parseMarkdown(originalText);
                addCopyCodeButtons(bubble);
            });
            
            bubble.querySelector(".edit-save-btn").addEventListener("click", async (e) => {
                e.stopPropagation();
                const newText = textarea.value.trim();
                if (!newText) return;
                
                const msgIndex = currentMessages.findIndex(m => m.role === "user" && m.content === originalText);
                if (msgIndex > -1) {
                    currentMessages[msgIndex].content = newText;
                    currentMessages = currentMessages.slice(0, msgIndex + 1);
                    redrawCurrentConversation();
                    await streamAIResponse();
                }
            });
        });
        
        // Retry Action
        const retryBtn = actionsRow.querySelector(".retry-btn");
        retryBtn.addEventListener("click", async () => {
            const msgIndex = currentMessages.findIndex(m => m.role === "user" && m.content === content);
            if (msgIndex > -1) {
                currentMessages = currentMessages.slice(0, msgIndex + 1);
                redrawCurrentConversation();
                await streamAIResponse();
            }
        });
    }
    
    wrapper.appendChild(actionsRow);
    messagesContainer.appendChild(wrapper);
    
    lucide.createIcons({ scope: actionsRow });
    if (role === "assistant") {
        injectFileHeaders(bubble);
    } else {
        addCopyCodeButtons(bubble);
    }
    return bubble;
}

// Redraw entire chat history in view
function redrawCurrentConversation() {
    messagesContainer.innerHTML = "";
    if (currentMessages.length === 0) {
        messagesContainer.appendChild(welcomeView);
        welcomeView.style.display = "flex";
    } else {
        welcomeView.style.display = "none";
        currentMessages.forEach(msg => {
            renderMessage(msg.role, msg.content);
        });
    }
    scrollToBottom();
}

// Parse markdown securely
function parseMarkdown(text) {
    try {
        return marked.parse(text);
    } catch (e) {
        return text.replace(/\n/g, "<br>");
    }
}

// Inject Copy buttons into Markdown Code Blocks
function addCopyCodeButtons(bubbleElement) {
    const preBlocks = bubbleElement.querySelectorAll("pre");
    preBlocks.forEach(pre => {
        if (pre.querySelector(".copy-code-btn")) return;
        
        const copyBtn = document.createElement("button");
        copyBtn.className = "copy-code-btn";
        copyBtn.innerText = "Copier";
        
        copyBtn.addEventListener("click", () => {
            const code = pre.querySelector("code").innerText;
            navigator.clipboard.writeText(code).then(() => {
                copyBtn.innerText = "Copié !";
                setTimeout(() => { copyBtn.innerText = "Copier"; }, 2000);
            });
        });
        
        pre.appendChild(copyBtn);
    });
}

// Inject beautiful premium file headers and download buttons for code blocks
function injectFileHeaders(bubbleElement) {
    const preBlocks = bubbleElement.querySelectorAll("pre");
    preBlocks.forEach((pre, index) => {
        // Prevent duplicate injection
        if (pre.parentElement.classList.contains("code-block-wrapper")) {
            return;
        }
        
        const codeElement = pre.querySelector("code");
        if (!codeElement) return;
        const codeText = codeElement.innerText;
        
        // Extract filename from the first line
        const lines = codeText.split("\n");
        const firstLine = lines[0] ? lines[0].trim() : "";
        
        let filename = "";
        const commentRegex = /^(?:\/\/\s*|\/\*\s*|#\s*|<!--\s*)([a-zA-Z0-9_\-\.\/]+)(?:\s*\*\/|\s*-->)?$/;
        const match = firstLine.match(commentRegex);
        
        let determinedLanguage = "txt";
        const classes = Array.from(codeElement.classList);
        const langClass = classes.find(c => c.startsWith("language-"));
        if (langClass) {
            determinedLanguage = langClass.replace("language-", "");
        }
        
        if (match && match[1]) {
            filename = match[1];
        } else {
            // Fallback default filenames
            if (determinedLanguage === "javascript" || determinedLanguage === "js") filename = `script.js`;
            else if (determinedLanguage === "html") filename = `index.html`;
            else if (determinedLanguage === "css") filename = `style.css`;
            else if (determinedLanguage === "python" || determinedLanguage === "py") filename = `script.py`;
            else if (determinedLanguage === "json") filename = `data.json`;
            else if (determinedLanguage === "markdown" || determinedLanguage === "md") filename = `document.md`;
            else if (determinedLanguage === "shell" || determinedLanguage === "bash" || determinedLanguage === "sh") filename = `script.sh`;
            else filename = `code_${index + 1}.txt`;
        }
        
        // Determine file icon based on extension
        let iconName = "file-code";
        const ext = filename.split(".").pop().toLowerCase();
        if (["py", "pyw"].includes(ext)) iconName = "terminal";
        else if (["js", "ts", "jsx", "tsx"].includes(ext)) iconName = "file-json";
        else if (["html", "xml"].includes(ext)) iconName = "file-type-2";
        else if ("css" === ext) iconName = "file-spreadsheet";
        else if ("json" === ext) iconName = "file-json";
        else if ("md" === ext) iconName = "file-text";
        
        // Create wrapper
        const wrapper = document.createElement("div");
        wrapper.className = "code-block-wrapper";
        
        // Create Header
        const header = document.createElement("div");
        header.className = "code-block-header";
        header.innerHTML = `
            <div class="code-block-filename">
                <i data-lucide="${iconName}"></i>
                <span>${filename}</span>
            </div>
            <div class="code-block-actions">
                <button class="code-action-btn copy-btn" title="Copier le code">
                    <i data-lucide="copy" size="13"></i> Copier
                </button>
                <button class="code-action-btn download-btn" title="Télécharger le fichier">
                    <i data-lucide="download" size="13"></i> Télécharger
                </button>
            </div>
        `;
        
        // Insert wrapper around the pre block
        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(header);
        wrapper.appendChild(pre);
        
        // Remove old copy button if marked added it
        const oldCopyBtn = pre.querySelector(".copy-code-btn");
        if (oldCopyBtn) oldCopyBtn.remove();
        
        // Setup copy and download handlers
        const copyBtn = header.querySelector(".copy-btn");
        const downloadBtn = header.querySelector(".download-btn");
        
        copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(codeText).then(() => {
                copyBtn.innerHTML = `<i data-lucide="check" size="13"></i> Copié !`;
                lucide.createIcons({ scope: copyBtn });
                setTimeout(() => {
                    copyBtn.innerHTML = `<i data-lucide="copy" size="13"></i> Copier`;
                    lucide.createIcons({ scope: copyBtn });
                }, 2000);
            });
        });
        
        downloadBtn.addEventListener("click", () => {
            const blob = new Blob([codeText], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast(`Fichier "${filename}" téléchargé !`, "success");
        });
        
        lucide.createIcons({ scope: header });
    });
}

// Renders dynamic system indicators (like Web searching status)
function renderSystemStatus(text) {
    const statusEl = document.createElement("div");
    statusEl.classList.add("system-status-msg");
    statusEl.id = "systemStatusIndicator";
    statusEl.innerHTML = `<i data-lucide="loader" class="animate-spin" size="14"></i> <span>${text}</span>`;
    messagesContainer.appendChild(statusEl);
    lucide.createIcons();
    scrollToBottom();
    return statusEl;
}

// Send Message Handler
async function sendMessage() {
    const text = userInput.value.trim();
    if (!text && attachedFiles.length === 0) return;
    
    // Formulate final message payload
    let displayContent = "";
    let finalPayloadContent = "";
    
    if (attachedFiles.length > 0) {
        const fileBlocks = attachedFiles.map(file => `[Fichier attaché : ${file.name}]\n\`\`\`\n${file.textContent}\n\`\`\``).join("\n\n");
        
        if (text) {
            displayContent = `${fileBlocks}\n\n${text}`;
            finalPayloadContent = `${fileBlocks}\n\n${text}`;
        } else {
            displayContent = `${fileBlocks}\n\n*J'ai joint ces fichiers de code pour analyse.*`;
            finalPayloadContent = `${fileBlocks}\n\nAnalyse les fichiers joints ci-dessus.`;
        }
    } else {
        displayContent = text;
        finalPayloadContent = text;
    }
    
    // 1. Add User message to UI & State
    renderMessage("user", displayContent);
    currentMessages.push({ role: "user", content: finalPayloadContent });
    
    // Clear attachment state and hide UI chips
    attachedFiles = [];
    renderAttachmentChips();
    
    // Reset inputs
    userInput.value = "";
    userInput.style.height = "auto";
    sendBtn.disabled = true;
    scrollToBottom();
    
    await streamAIResponse();
}

// Stream AI Response with logs and sources
async function streamAIResponse() {
    // Add empty bot bubble for streaming response
    const botBubble = renderMessage("assistant", "...");
    let botResponseText = "";
    
    // Search logs UI variables
    let searchLogsBox = null;
    let searchLogsList = null;
    let searchSourcesList = null;
    let searchLogsCount = null;
    let sources = [];
    let firstToken = true;

    try {
        let response;
        if (appMode === "local") {
            // Server Proxy Mode
            response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: currentMessages,
                    webSearch: webSearchToggle.checked,
                    username: username,
                    token: hfToken
                })
            });
        } else {
            // Direct Client-to-API Mode with date injected
            const activeToken = hfToken || DEFAULT_HF_TOKEN;
            const dateString = new Date().toLocaleDateString("fr-FR", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const dateContext = `[INFO TEMPORELLE CRITIQUE] : Aujourd'hui nous sommes le ${dateString} (Année 2026). L'année en cours est STRICTEMENT 2026. Ignore toute donnée disant que nous sommes en 2023 ou 2024. Si on te demande la date ou l'année, réponds impérativement 2026.\n`;
            
            response = await fetch("https://router.huggingface.co/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${activeToken}`
                },
                body: JSON.stringify({
                    model: "Qwen/Qwen2.5-Coder-7B-Instruct",
                    messages: [
                        { role: "system", content: dateContext + SYSTEM_PROMPT },
                        ...currentMessages
                    ],
                    max_tokens: 2048,
                    stream: true
                })
            });
        }

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Erreur API: ${errText || response.statusText}`);
        }

        // Initialize parser stream reader
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            
            // Extract chunks
            const lines = chunk.split("\n");
            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const dataStr = line.slice(6).trim();
                    if (dataStr === "[DONE]") continue;
                    try {
                        const parsed = JSON.parse(dataStr);
                        if (parsed.error) {
                            botResponseText += `\n\n⚠️ Erreur: ${parsed.error}`;
                            break;
                        }
                        
                        // Handle custom server-side search logs
                        if (parsed.type === "log") {
                            // Don't show log box for plain system messages without RAG search
                            if (parsed.status === "thinking" && !searchLogsBox) {
                                continue;
                            }
                            
                            if (!searchLogsBox) {
                                const wrapper = botBubble.parentElement;
                                searchLogsBox = document.createElement("div");
                                searchLogsBox.className = "search-logs-box";
                                searchLogsBox.innerHTML = `
                                    <div class="search-logs-header">
                                        <div class="search-logs-header-left">
                                            <i data-lucide="globe" class="search-globe-icon animate-pulse"></i>
                                            <span class="search-logs-title">Recherche sur le web...</span>
                                        </div>
                                        <div class="search-logs-header-right">
                                            <span class="search-logs-count" style="display: none;">0 sources</span>
                                            <i data-lucide="chevron-down" class="logs-toggle-icon"></i>
                                        </div>
                                    </div>
                                    <div class="search-logs-list"></div>
                                    <div class="search-sources-list" style="display: none;"></div>
                                `;
                                wrapper.insertBefore(searchLogsBox, botBubble);
                                lucide.createIcons({ scope: searchLogsBox });
                                
                                searchLogsList = searchLogsBox.querySelector(".search-logs-list");
                                searchSourcesList = searchLogsBox.querySelector(".search-sources-list");
                                searchLogsCount = searchLogsBox.querySelector(".search-logs-count");
                                
                                const header = searchLogsBox.querySelector(".search-logs-header");
                                header.addEventListener("click", () => {
                                    searchLogsBox.classList.toggle("collapsed");
                                });
                            }
                            
                            // Update header details based on state
                            if (parsed.status === "start") {
                                searchLogsBox.querySelector(".search-logs-title").innerText = "Recherche sur le web...";
                            } else if (parsed.status === "searching") {
                                searchLogsBox.querySelector(".search-logs-title").innerText = parsed.message;
                            } else if (parsed.status === "reading") {
                                searchLogsBox.querySelector(".search-logs-title").innerText = "Analyse des sources...";
                            } else if (parsed.status === "source") {
                                if (parsed.source) {
                                    sources.push(parsed.source);
                                    searchLogsCount.style.display = "inline-block";
                                    searchLogsCount.innerText = `${sources.length} source${sources.length > 1 ? 's' : ''}`;
                                    
                                    const urlObj = new URL(parsed.source.url);
                                    const domain = urlObj.hostname.replace("www.", "");
                                    const sourceCard = document.createElement("a");
                                    sourceCard.href = parsed.source.url;
                                    sourceCard.target = "_blank";
                                    sourceCard.className = "source-card animate-fade-in";
                                    sourceCard.innerHTML = `
                                        <div class="source-card-header">
                                            <span class="source-index">${sources.length}</span>
                                            <span class="source-domain">${domain}</span>
                                        </div>
                                        <div class="source-title">${parsed.source.title}</div>
                                    `;
                                    searchSourcesList.appendChild(sourceCard);
                                    searchSourcesList.style.display = "grid";
                                }
                            } else if (parsed.status === "thinking") {
                                searchLogsBox.classList.add("completed");
                                // We keep the box open, only the logs list will collapse via CSS
                                searchLogsBox.querySelector(".search-logs-title").innerText = "Recherche terminée";
                                const globeIcon = searchLogsBox.querySelector(".search-globe-icon");
                                if (globeIcon) {
                                    globeIcon.className = "search-globe-icon check-icon";
                                    globeIcon.setAttribute("data-lucide", "check-circle");
                                    lucide.createIcons({ scope: searchLogsBox });
                                }
                            }
                            
                            // Append item to list of steps
                            if (parsed.status !== "source") {
                                const logEntry = document.createElement("div");
                                logEntry.className = "search-log-entry animate-slide-up";
                                
                                let iconHtml = '<span class="log-bullet">•</span>';
                                if (parsed.status === "start" || parsed.status === "searching") {
                                    iconHtml = '<i data-lucide="loader" class="animate-spin log-icon" size="12"></i>';
                                } else if (parsed.status === "reading" || parsed.status === "thinking") {
                                    iconHtml = '<i data-lucide="check" class="log-icon check" size="12"></i>';
                                }
                                
                                logEntry.innerHTML = `${iconHtml} <span>${parsed.message}</span>`;
                                searchLogsList.appendChild(logEntry);
                                lucide.createIcons({ scope: logEntry });
                                searchLogsList.scrollTop = searchLogsList.scrollHeight;
                            }
                            continue;
                        }
                        
                        // Handle standard completions
                        const tokenText = parsed.choices[0]?.delta?.content || "";
                        if (tokenText) {
                            if (firstToken) {
                                firstToken = false;
                                botBubble.innerHTML = ""; // Clear loader dots
                                
                                // Mark search panel as completed when response streaming begins (keep expanded)
                                if (searchLogsBox) {
                                    searchLogsBox.classList.add("completed");
                                    searchLogsBox.querySelector(".search-logs-title").innerText = "Recherche terminée";
                                    const globeIcon = searchLogsBox.querySelector(".search-globe-icon");
                                    if (globeIcon && !globeIcon.classList.contains("check-icon")) {
                                        globeIcon.className = "search-globe-icon check-icon";
                                        globeIcon.setAttribute("data-lucide", "check-circle");
                                        lucide.createIcons({ scope: searchLogsBox });
                                    }
                                }
                            }
                            botResponseText += tokenText;
                            botBubble.innerHTML = parseMarkdown(botResponseText);
                            addCopyCodeButtons(botBubble);
                        }
                    } catch (e) {
                        // Suppress parsing errors of split packets
                    }
                }
            }
            scrollToBottom();
        }
        
        // Save chatbot response to messages state
        currentMessages.push({ role: "assistant", content: botResponseText });
        injectFileHeaders(botBubble);
        saveCurrentConversation();
        
    } catch (e) {
        botBubble.innerHTML = `<span style="color: #EF4444;">⚠️ Échec de connexion : ${e.message}</span>`;
        currentMessages.push({ role: "assistant", content: `Erreur: ${e.message}` });
    }
}

// Scroll to bottom of chat area
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Save Current Chat History to LocalStorage List
function saveCurrentConversation() {
    const existingIndex = conversations.findIndex(c => c.id === currentConversationId);
    
    // First message as title
    let title = "Discussion";
    if (currentMessages.length > 0) {
        const firstMsg = currentMessages[0].content;
        // Ignore file contents when showing sidebar preview title
        const displayTitle = firstMsg.replace(/\[Fichier attaché : [^\]]+\]\n```[\s\S]*?```\n\n/g, "");
        title = displayTitle.substring(0, 30) + (displayTitle.length > 30 ? "..." : "");
        if (!title.trim()) title = "Discussion avec Fichier";
    }
    
    const convData = {
        id: currentConversationId,
        title: title,
        timestamp: Date.now(),
        messages: currentMessages
    };
    
    if (existingIndex > -1) {
        conversations[existingIndex] = convData;
    } else {
        conversations.unshift(convData); // Add to top
    }
    
    saveConversationsToStorage();
    renderConversationsList();
}

function saveConversationsToStorage() {
    localStorage.setItem("cypher_conversations", JSON.stringify(conversations));
}

// Render saved items in Sidebar History
function renderConversationsList() {
    chatHistoryList.innerHTML = "";
    if (conversations.length === 0) {
        chatHistoryList.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 13px; padding-top: 20px;">Aucune conversation</div>`;
        return;
    }
    
    conversations.forEach(c => {
        const item = document.createElement("button");
        item.className = `chat-history-item ${c.id === currentConversationId ? "active" : ""}`;
        item.innerHTML = `<i data-lucide="message-square" size="16"></i> <span class="chat-history-title">${c.title}</span>`;
        
        item.addEventListener("click", () => {
            loadConversation(c.id);
            sidebar.classList.remove("active"); // Hide sidebar overlay on mobile
        });
        
        chatHistoryList.appendChild(item);
    });
    
    lucide.createIcons();
}

// Settings Modal Operations
function saveSettings() {
    username = usernameInput.value.trim() || "invité";
    hfToken = tokenInput.value.trim();
    appMode = modeSelect.value;
    
    localStorage.setItem("cypher_username", username);
    localStorage.setItem("cypher_token", hfToken);
    localStorage.setItem("cypher_mode", appMode);
    
    updateStatusText();
    settingsModal.classList.remove("active");
    
    // Force rerender messages labels if username changed
    loadConversation(currentConversationId);
}

// Custom Premium Toast Notification System
function showToast(message, type = "info") {
    let container = document.getElementById("toastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.className = "toast-container";
        document.body.appendChild(container);
    }
    
    const toast = document.createElement("div");
    toast.className = `toast-message ${type} animate-fade-in`;
    
    let iconName = "info";
    if (type === "success") iconName = "check-circle";
    else if (type === "error") iconName = "alert-triangle";
    else if (type === "warning") iconName = "alert-circle";
    
    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    lucide.createIcons({ scope: toast });
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        toast.classList.remove("animate-fade-in");
        toast.classList.add("animate-fade-out");
        toast.addEventListener("animationend", () => {
            toast.remove();
            if (container.children.length === 0) {
                container.remove();
            }
        });
    }, 4000);
}


