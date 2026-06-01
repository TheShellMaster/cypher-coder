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
            <div class="export-dropdown-wrapper">
                <button class="action-btn export-trigger-btn" title="Exporter / Télécharger">
                    <i data-lucide="download" size="14"></i>
                </button>
                <div class="export-dropdown-content">
                    <button class="export-option-btn pdf-opt"><i data-lucide="file-text" size="12"></i> PDF stylisé</button>
                    <button class="export-option-btn docx-opt"><i data-lucide="file" size="12"></i> Word (DOCX)</button>
                    <button class="export-option-btn pptx-opt"><i data-lucide="presentation" size="12"></i> Présentation (PPTX)</button>
                    <button class="export-option-btn zip-opt"><i data-lucide="archive" size="12"></i> Code en ZIP</button>
                </div>
            </div>
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
        
        // Export Options
        actionsRow.querySelector(".pdf-opt").addEventListener("click", () => {
            exportMessageToPDF(bubble, content);
        });
        actionsRow.querySelector(".docx-opt").addEventListener("click", () => {
            exportMessageToDOCX(bubble, content);
        });
        actionsRow.querySelector(".pptx-opt").addEventListener("click", () => {
            exportMessageToPPTX(bubble, content);
        });
        actionsRow.querySelector(".zip-opt").addEventListener("click", () => {
            exportMessageToZIP(bubble, content);
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
    addCopyCodeButtons(bubble);
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
                                searchLogsBox.classList.add("collapsed");
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
                                
                                // Auto-collapse search panel when response streaming begins
                                if (searchLogsBox) {
                                    searchLogsBox.classList.add("completed");
                                    searchLogsBox.classList.add("collapsed");
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

// -----------------------------------------------------
// MULTI-FORMAT EXPORTERS (ZIP, PDF, DOCX, PPTX)
// -----------------------------------------------------

// 1. ZIP Exporter (combines all code blocks into a ZIP archive)
function exportMessageToZIP(bubbleElement, rawContent) {
    const preBlocks = bubbleElement.querySelectorAll("pre");
    if (preBlocks.length === 0) {
        showToast("Aucun bloc de code trouvé dans ce message.", "warning");
        return;
    }
    
    if (typeof JSZip === "undefined") {
        showToast("Le module ZIP n'est pas encore disponible.", "error");
        return;
    }
    
    const zip = new JSZip();
    let fileCount = 0;
    
    preBlocks.forEach((pre, index) => {
        const codeElement = pre.querySelector("code");
        if (!codeElement) return;
        const codeText = codeElement.innerText;
        
        // Extract filename from comment in first line
        const lines = codeText.split("\n");
        const firstLine = lines[0] ? lines[0].trim() : "";
        
        let filename = "";
        const commentRegex = /^(?:\/\/\s*|\/\*\s*|#\s*|<!--\s*)([a-zA-Z0-9_\-\.\/]+)(?:\s*\*\/|\s*-->)?$/;
        const match = firstLine.match(commentRegex);
        
        if (match && match[1]) {
            filename = match[1];
        } else {
            // Fallback to language class or index
            let ext = "txt";
            const classes = Array.from(codeElement.classList);
            const langClass = classes.find(c => c.startsWith("language-"));
            if (langClass) {
                const lang = langClass.replace("language-", "");
                if (lang === "javascript" || lang === "js") ext = "js";
                else if (lang === "html") ext = "html";
                else if (lang === "css") ext = "css";
                else if (lang === "python" || lang === "py") ext = "py";
                else if (lang === "json") ext = "json";
                else if (lang === "markdown" || lang === "md") ext = "md";
                else if (lang === "shell" || lang === "bash" || lang === "sh") ext = "sh";
            }
            filename = `fichier_${index + 1}.${ext}`;
        }
        
        zip.file(filename, codeText);
        fileCount++;
    });
    
    if (fileCount === 0) {
        showToast("Aucun fichier de code valide n'a pu être extrait.", "warning");
        return;
    }
    
    showToast(`Génération du ZIP (${fileCount} fichiers)...`, "info");
    
    zip.generateAsync({ type: "blob" }).then(content => {
        const url = URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = `cypher_projet_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Fichier ZIP téléchargé avec succès !", "success");
    }).catch(err => {
        showToast(`Erreur lors de l'export ZIP: ${err.message}`, "error");
    });
}

// 2. PDF Exporter (renders a beautiful, light-themed printable PDF report)
function exportMessageToPDF(bubbleElement, rawContent) {
    if (typeof html2pdf === "undefined") {
        showToast("Le module PDF n'est pas encore disponible.", "error");
        return;
    }
    
    showToast("Génération du document PDF...", "info");
    
    // Create a temporary container styled as a premium report page
    const tempContainer = document.createElement("div");
    tempContainer.style.padding = "40px 50px";
    tempContainer.style.background = "#FFFFFF";
    tempContainer.style.color = "#1E293B";
    tempContainer.style.fontFamily = "'Outfit', sans-serif";
    tempContainer.style.fontSize = "14px";
    tempContainer.style.lineHeight = "1.6";
    tempContainer.style.position = "absolute";
    tempContainer.style.left = "-9999px";
    
    // Custom document header
    tempContainer.innerHTML = `
        <div style="border-bottom: 2px solid #E2E8F0; padding-bottom: 15px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #0F172A; letter-spacing: 0.5px;">CYPHER AI — DOCUMENT DE TRAVAIL</h1>
                <p style="margin: 5px 0 0; font-size: 11px; color: #64748B; font-weight: 600; text-transform: uppercase;">Assistant technique d'élite</p>
            </div>
            <div style="text-align: right;">
                <p style="margin: 0; font-size: 12px; font-weight: 700; color: #0F172A;">DJAKOUA KWANKAM</p>
                <p style="margin: 3px 0 0; font-size: 10px; color: #64748B;">IUT de Douala</p>
            </div>
        </div>
        <div style="margin-bottom: 30px;">
            ${bubbleElement.innerHTML}
        </div>
        <div style="border-top: 1px solid #E2E8F0; padding-top: 10px; margin-top: 30px; text-align: center; font-size: 10px; color: #94A3B8;">
            Généré automatiquement par Cypher AI Chat. Le document d'origine est daté de 2026.
        </div>
    `;
    
    // Format all code blocks inside temp container for professional PDF printing
    const preBlocks = tempContainer.querySelectorAll("pre");
    preBlocks.forEach(pre => {
        pre.style.background = "#F8FAFC";
        pre.style.border = "1px solid #E2E8F0";
        pre.style.borderRadius = "8px";
        pre.style.padding = "14px";
        pre.style.margin = "16px 0";
        pre.style.position = "relative";
        pre.style.color = "#0F172A";
        
        // Remove copy button from PDF print
        const btn = pre.querySelector(".copy-code-btn");
        if (btn) btn.remove();
    });
    
    const inlineCodes = tempContainer.querySelectorAll("code:not(pre code)");
    inlineCodes.forEach(code => {
        code.style.background = "#F1F5F9";
        code.style.border = "1px solid #E2E8F0";
        code.style.color = "#0F172A";
        code.style.padding = "2px 5px";
        code.style.borderRadius = "4px";
        code.style.fontSize = "12px";
    });
    
    document.body.appendChild(tempContainer);
    
    const opt = {
        margin:       15,
        filename:     `cypher_rapport_${Date.now()}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(tempContainer).save().then(() => {
        document.body.removeChild(tempContainer);
        showToast("Rapport PDF généré et téléchargé !", "success");
    }).catch(err => {
        if (tempContainer.parentNode) document.body.removeChild(tempContainer);
        showToast(`Erreur d'export PDF: ${err.message}`, "error");
    });
}

// 3. DOCX Exporter (saves formatted content as a Microsoft Word document)
function exportMessageToDOCX(bubbleElement, rawContent) {
    showToast("Génération du fichier Word (DOCX)...", "info");
    
    // Style Word document
    const htmlHeader = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
        <meta charset="utf-8">
        <title>Rapport Cypher AI</title>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; color: #333333; line-height: 1.5; font-size: 11pt; padding: 20px; }
            h1 { color: #111b33; font-size: 18pt; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-top: 20pt; }
            h2 { color: #1B2035; font-size: 14pt; margin-top: 15pt; }
            pre { background-color: #f6f8fa; border: 1px solid #ddd; padding: 12px; font-family: 'Consolas', 'Courier New', monospace; font-size: 9.5pt; margin: 10pt 0; white-space: pre-wrap; }
            code { background-color: #f1f5f9; padding: 2px 4px; font-family: monospace; font-size: 9.5pt; }
            p { margin-bottom: 8pt; }
            a { color: #00E5FF; text-decoration: underline; }
            ul, ol { margin-bottom: 8pt; padding-left: 20px; }
            .copy-code-btn { display: none !important; }
        </style>
    </head>
    <body>
        <div style="border-bottom: 2px solid #1B2035; padding-bottom: 10px; margin-bottom: 20px;">
            <p style="font-size: 14pt; font-weight: bold; color: #1B2035; margin: 0;">CYPHER AI — ASSISTANT TECHNIQUE D'ÉLITE</p>
            <p style="font-size: 9pt; color: #666666; margin: 2px 0 0;">Développé par DJAKOUA KWANKAM • IUT de Douala</p>
        </div>
        <div>
            ${bubbleElement.innerHTML}
        </div>
    </body>
    </html>`;
    
    const blob = new Blob(['\ufeff' + htmlHeader], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cypher_document_${Date.now()}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Fichier Word exporté avec succès !", "success");
}

// 4. PPTX Exporter (constructs slide presentations step-by-step from headings and code blocks)
function exportMessageToPPTX(bubbleElement, rawContent) {
    if (typeof pptxgen === "undefined") {
        showToast("Le module PPTX n'est pas encore disponible.", "error");
        return;
    }
    
    showToast("Génération de la présentation PPTX...", "info");
    
    const pptx = new pptxgen();
    
    pptx.defineLayout({ name: 'CYPHER_STYLE', width: 10, height: 5.625 });
    pptx.layout = 'CYPHER_STYLE';
    
    // Slide 1: Title Slide
    const slide1 = pptx.addSlide();
    slide1.background = { color: '090A0F' };
    
    slide1.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.1, fill: { color: '00E5FF' } });
    slide1.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 5.525, w: 10, h: 0.1, fill: { color: '00FFAA' } });
    
    slide1.addText("CYPHER AI", {
        x: 0.5, y: 1.8, w: 9.0, h: 0.8,
        fontSize: 38, fontWeight: 'bold', fontFace: 'Trebuchet MS',
        color: '00E5FF', align: 'center'
    });
    
    slide1.addText("Synthèse technique de la discussion", {
        x: 0.5, y: 2.7, w: 9.0, h: 0.5,
        fontSize: 16, fontFace: 'Arial',
        color: 'F8FAFC', align: 'center'
    });
    
    slide1.addText("Conçu par DJAKOUA KWANKAM - Étudiant à l'IUT de Douala\nSession 2026", {
        x: 0.5, y: 4.2, w: 9.0, h: 0.6,
        fontSize: 11, fontFace: 'Arial',
        color: '94A3B8', align: 'center'
    });
    
    const sections = Array.from(bubbleElement.querySelectorAll("h1, h2, h3, p, pre"));
    let slideTitle = "";
    let slideBullets = [];
    let slideCode = "";
    
    function commitSlide() {
        if (!slideTitle && slideBullets.length === 0 && !slideCode) return;
        
        const newSlide = pptx.addSlide();
        newSlide.background = { color: '0C0E17' };
        
        newSlide.addText(slideTitle || "Détails Techniques", {
            x: 0.5, y: 0.4, w: 9.0, h: 0.6,
            fontSize: 22, fontWeight: 'bold', fontFace: 'Trebuchet MS',
            color: '00E5FF'
        });
        
        newSlide.addShape(pptx.shapes.RECTANGLE, { x: 0.5, y: 1.0, w: 9.0, h: 0.02, fill: { color: '1E2235' } });
        
        if (slideCode) {
            if (slideBullets.length > 0) {
                newSlide.addText(slideBullets.map(b => `• ${b}`).join("\n\n"), {
                    x: 0.5, y: 1.3, w: 4.2, h: 3.8,
                    fontSize: 12, fontFace: 'Arial',
                    color: '94A3B8', align: 'left',
                    valign: 'top'
                });
                
                newSlide.addText(slideCode.substring(0, 400) + (slideCode.length > 400 ? "\n..." : ""), {
                    x: 4.9, y: 1.3, w: 4.6, h: 3.8,
                    fontSize: 10, fontFace: 'Courier New',
                    color: '00FFAA', fill: { color: '06070D' },
                    lineSpacing: 1.1,
                    valign: 'top',
                    margin: 10
                });
            } else {
                newSlide.addText(slideCode.substring(0, 800) + (slideCode.length > 800 ? "\n..." : ""), {
                    x: 0.5, y: 1.3, w: 9.0, h: 3.8,
                    fontSize: 10, fontFace: 'Courier New',
                    color: '00FFAA', fill: { color: '06070D' },
                    lineSpacing: 1.1,
                    valign: 'top',
                    margin: 10
                });
            }
        } else {
            const textContent = slideBullets.length > 0 
                ? slideBullets.map(b => `• ${b}`).join("\n\n") 
                : "Consultez les détails de la réponse générée.";
                
            newSlide.addText(textContent, {
                x: 0.5, y: 1.3, w: 9.0, h: 3.8,
                fontSize: 13, fontFace: 'Arial',
                color: '94A3B8', align: 'left',
                valign: 'top'
            });
        }
        
        newSlide.addText("Cypher AI • DJAKOUA KWANKAM (IUT Douala)", {
            x: 0.5, y: 5.2, w: 9.0, h: 0.3,
            fontSize: 9, fontFace: 'Arial',
            color: '64748B', align: 'right'
        });
        
        slideBullets = [];
        slideCode = "";
        slideTitle = "";
    }
    
    sections.forEach(el => {
        if (el.tagName === "H1" || el.tagName === "H2" || el.tagName === "H3") {
            commitSlide();
            slideTitle = el.innerText.trim();
        } else if (el.tagName === "PRE") {
            const codeEl = el.querySelector("code");
            if (codeEl) {
                slideCode = codeEl.innerText.trim();
            }
        } else if (el.tagName === "P") {
            const pText = el.innerText.trim();
            if (pText && pText.length > 5) {
                slideBullets.push(pText.substring(0, 150) + (pText.length > 150 ? "..." : ""));
            }
        }
    });
    
    commitSlide();
    
    pptx.writeFile({ fileName: `cypher_slides_${Date.now()}.pptx` }).then(() => {
        showToast("Présentation PPTX téléchargée avec succès !", "success");
    }).catch(err => {
        showToast(`Erreur d'export PPTX: ${err.message}`, "error");
    });
}
