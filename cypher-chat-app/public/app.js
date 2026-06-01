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
            alert(`Le fichier "${file.name}" est trop volumineux (max 500 Ko pour les fichiers de code).`);
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const textContent = event.target.result;
            // Check if file is text-based (rough heuristic: check for null bytes)
            if (textContent.includes("\0")) {
                alert(`Le fichier "${file.name}" semble être binaire. Seuls les fichiers de texte/code sont acceptés.`);
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
    renderAttachmentChips();
    scrollToBottom();
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
    // Format: [Fichier attaché : name]\n```\ncontent\n```
    let displayContent = content;
    const fileHeaderRegex = /\[Fichier attaché : ([^\]]+)\]\n```[\s\S]*?```\n\n/g;
    
    // We clean the display text slightly if we want, or just let marked parse it.
    // Standard markdown code blocks parsed by marked look excellent, so we just let it run.
    bubble.innerHTML = parseMarkdown(displayContent);
    
    wrapper.appendChild(label);
    wrapper.appendChild(bubble);
    messagesContainer.appendChild(wrapper);
    
    addCopyCodeButtons(bubble);
    return bubble;
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
    
    // 2. Add empty bot bubble for streaming response
    const botBubble = renderMessage("assistant", "...");
    let botResponseText = "";
    
    // 3. Render loading status indicator if web search triggers
    let statusIndicator = null;
    const keywords = [
        "cherche sur le web", "recherche sur le web", "cherche sur internet", "recherche sur internet",
        "actualités", "actualité", "dernière version", "nouveautés de", "nouveautés sur",
        "météo", "cours de l'action", "dernières nouvelles"
    ];
    let isSearchTriggered = webSearchToggle.checked;
    if (!isSearchTriggered) {
        const lowerText = text.toLowerCase();
        isSearchTriggered = keywords.some(k => lowerText.includes(k)) || text.startsWith("/web ") || text.startsWith("/search ");
    }
    
    if (isSearchTriggered && appMode === "local") {
        statusIndicator = renderSystemStatus("Recherche en cours sur le web...");
    }

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
            // Direct Client-to-API Mode
            const activeToken = hfToken || DEFAULT_HF_TOKEN;
            response = await fetch("https://router.huggingface.co/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${activeToken}`
                },
                body: JSON.stringify({
                    model: "Qwen/Qwen2.5-Coder-7B-Instruct",
                    messages: [
                        { role: "system", content: SYSTEM_PROMPT },
                        ...currentMessages
                    ],
                    max_tokens: 2048,
                    stream: true
                })
            });
        }

        if (statusIndicator) {
            statusIndicator.remove();
        }

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Erreur API: ${errText || response.statusText}`);
        }

        // Initialize parser stream reader
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        botBubble.innerHTML = ""; // Clear loader dots

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
                        const tokenText = parsed.choices[0]?.delta?.content || "";
                        botResponseText += tokenText;
                        botBubble.innerHTML = parseMarkdown(botResponseText);
                        addCopyCodeButtons(botBubble);
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
        if (statusIndicator) statusIndicator.remove();
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
