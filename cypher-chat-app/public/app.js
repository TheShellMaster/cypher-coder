// App State
let username = localStorage.getItem("cypher_username") || "invité";
let hfToken = localStorage.getItem("cypher_token") || "";
let appMode = (window.location.protocol === "file:") ? "direct" : "local";
localStorage.setItem("cypher_mode", appMode);

let conversations = JSON.parse(localStorage.getItem("cypher_conversations")) || [];
let currentConversationId = localStorage.getItem("cypher_current_id") || null;
let currentMessages = [];
let attachedFiles = []; // Holds { name, textContent }

// Settings parameters
let selectedModel = localStorage.getItem("cypher_model_name") || "Qwen/Qwen2.5-Coder-7B-Instruct";
let selectedTemperature = parseFloat(localStorage.getItem("cypher_temperature")) || 0.7;
let selectedMaxTokens = parseInt(localStorage.getItem("cypher_max_tokens")) || 2048;
let activeTheme = localStorage.getItem("cypher_theme") || "dark";
let activeFontSize = localStorage.getItem("cypher_font_size") || "medium";
let activeSearchMode = "web";

// Artifacts State
let artifacts = {}; // { filename: { lang, versions: [content1, content2, ...] } }
let activeArtifactFilename = null;
let activeArtifactVersionIndex = 0;
let activeResponseArtifacts = []; // Artifacts generated in the current assistant message

// Context Menu Target
let contextMenuConversationId = null;

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
const modelSelect = document.getElementById("modelSelect");
const temperatureSlider = document.getElementById("temperatureSlider");
const maxTokensSlider = document.getElementById("maxTokensSlider");
const fontSizeSelect = document.getElementById("fontSizeSelect");
const connectionStatus = document.getElementById("connectionStatus");

// Export & Context Elements
const exportChatBtn = document.getElementById("exportChatBtn");
const exportDropdown = document.getElementById("exportDropdown");
const contextMenu = document.getElementById("contextMenu");
const sidebarSearch = document.getElementById("sidebarSearch");
const searchModeWrapper = document.getElementById("searchModeWrapper");

const DEFAULT_HF_TOKEN = "";

// Updated system prompt ensuring credit to DJAKOUA student of IUT Douala and current year 2026
const SYSTEM_PROMPT = `Tu es Cypher AI, une intelligence artificielle d'élite spécialisée dans la programmation, l'algorithmie et la conception de logiciels.
Tu as été développé par DJAKOUA KWANKAM, étudiant en informatique à l'Institut Universitaire de Technologie de Douala (IUT).
Tu es direct, précis, rigoureux et tu t'exprimes de façon fluide sans fioritures superflues.

[INSTRUCTION TEMPORELLE IMPORTANTE] : L'année actuelle est STRICTEMENT 2026. Si l'utilisateur te demande la date actuelle ou l'année en cours, réponds avec assurance que nous sommes en 2026. Ne dis jamais que tu es en 2023 ou 2024.

[CITATIONS INLINE ET RAG] : Si tu effectues des recherches sur le web, cite tes sources en utilisant le format [1], [2], etc. Insère ces citations de manière concise dans tes explications aux endroits appropriés.

[ARTIFACTS DE CONCEPTION] : Lorsque tu écris du code d'application web complet (HTML responsive, SVG autonome, scripts CSS/JS, ou diagrammes Mermaid détaillés), débute ton bloc de code par une ligne de commentaire contenant le nom du fichier ciblé (ex: \`<!-- index.html -->\` ou \`// script.js\`). Écris du code complet, prêt à l'emploi.`;

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();
    initThemeAndSettings();
    renderConversationsList();
    setupArtifactsPanelEvents();
    setupContextMenu();
    
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
        }, 1200);
    }
});

// Settings & Theme Initialization
function initThemeAndSettings() {
    usernameInput.value = username;
    tokenInput.value = hfToken;
    modeSelect.value = appMode;
    modelSelect.value = selectedModel;
    temperatureSlider.value = selectedTemperature;
    document.getElementById("temperatureValue").innerText = selectedTemperature;
    maxTokensSlider.value = selectedMaxTokens;
    document.getElementById("maxTokensValue").innerText = selectedMaxTokens;
    fontSizeSelect.value = activeFontSize;
    
    applyTheme(activeTheme);
    applyFontSize(activeFontSize);
    updateStatusText();
    
    // Highlight the active theme card
    document.querySelectorAll(".theme-option").forEach(opt => {
        if (opt.getAttribute("data-theme") === activeTheme) {
            opt.classList.add("active");
        } else {
            opt.classList.remove("active");
        }
    });
}

function applyTheme(theme) {
    const body = document.body;
    if (theme === "light") {
        body.classList.add("light-theme");
    } else if (theme === "dark") {
        body.classList.remove("light-theme");
    } else if (theme === "system") {
        const isLight = window.matchMedia('(prefers-color-scheme: light)').matches;
        if (isLight) {
            body.classList.add("light-theme");
        } else {
            body.classList.remove("light-theme");
        }
    }
}

function applyFontSize(size) {
    if (size === "small") {
        messagesContainer.style.fontSize = "13px";
    } else if (size === "medium") {
        messagesContainer.style.fontSize = "15px";
    } else if (size === "large") {
        messagesContainer.style.fontSize = "17px";
    }
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
    
    // Textarea auto-growing
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
    attachBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", handleFileSelection);
    
    // Settings modal triggers
    settingsBtn.addEventListener("click", () => {
        settingsModal.classList.add("active");
        checkServerHealth();
    });
    
    closeModalBtn.addEventListener("click", () => settingsModal.classList.remove("active"));
    settingsModal.addEventListener("click", (e) => {
        if (e.target === settingsModal) settingsModal.classList.remove("active");
    });
    
    saveSettingsBtn.addEventListener("click", saveSettings);
    
    // Settings tab switching
    document.querySelectorAll(".settings-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".settings-tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".settings-tab-content").forEach(c => c.classList.remove("active"));
            
            tab.classList.add("active");
            const tabName = tab.getAttribute("data-settings-tab");
            document.querySelector(`.settings-tab-content[data-tab-content="${tabName}"]`).classList.add("active");
        });
    });
    
    // Sliders input events
    temperatureSlider.addEventListener("input", () => {
        document.getElementById("temperatureValue").innerText = temperatureSlider.value;
    });
    maxTokensSlider.addEventListener("input", () => {
        document.getElementById("maxTokensValue").innerText = maxTokensSlider.value;
    });
    
    // Theme options triggers
    document.querySelectorAll(".theme-option").forEach(opt => {
        opt.addEventListener("click", () => {
            document.querySelectorAll(".theme-option").forEach(o => o.classList.remove("active"));
            opt.classList.add("active");
            activeTheme = opt.getAttribute("data-theme");
        });
    });
    
    // Suggestion Cards Action
    document.querySelectorAll(".example-card").forEach(card => {
        card.addEventListener("click", () => {
            const promptText = card.getAttribute("data-prompt");
            userInput.value = promptText;
            updateSendButtonState();
            userInput.focus();
        });
    });
    
    // Drag and Drop File support
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", handleFileDrop);
    
    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.key === "n") {
            e.preventDefault();
            startNewConversation();
            showToast("Nouvelle discussion créée !", "info");
        } else if (e.ctrlKey && e.key === "/") {
            e.preventDefault();
            userInput.focus();
        } else if (e.key === "Escape") {
            settingsModal.classList.remove("active");
            const artifactsPanel = document.getElementById("artifactsPanel");
            artifactsPanel.classList.remove("active");
            artifactsPanel.classList.remove("fullscreen");
            document.querySelectorAll(".context-menu").forEach(m => m.style.display = "none");
        }
    });
    
    // Sidebar search filtering
    sidebarSearch.addEventListener("input", renderConversationsList);
    
    // Search focus mode buttons toggles
    document.querySelectorAll(".search-mode-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".search-mode-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeSearchMode = btn.getAttribute("data-mode");
        });
    });
    
    webSearchToggle.addEventListener("change", () => {
        if (webSearchToggle.checked) {
            searchModeWrapper.classList.remove("disabled");
        } else {
            searchModeWrapper.classList.add("disabled");
        }
    });
    
    // Export Dropdown anchored positioning
    exportChatBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isHidden = exportDropdown.style.display === "none";
        exportDropdown.style.display = isHidden ? "flex" : "none";
        
        const rect = exportChatBtn.getBoundingClientRect();
        exportDropdown.style.left = `${rect.left + window.scrollX - 120}px`;
        exportDropdown.style.top = `${rect.bottom + window.scrollY + 8}px`;
    });
    
    document.addEventListener("click", () => {
        exportDropdown.style.display = "none";
    });
    
    exportDropdown.querySelectorAll(".export-option").forEach(btn => {
        btn.addEventListener("click", () => {
            const format = btn.getAttribute("data-format");
            exportConversation(format);
        });
    });
    
    // Click events in message bubbles (delegation for citation badges and artifact cards)
    messagesContainer.addEventListener("click", (e) => {
        const artCard = e.target.closest(".artifact-suggestion-card");
        if (artCard) {
            const filename = artCard.getAttribute("data-filename");
            const art = artifacts[filename];
            if (art) {
                showArtifactsPanel(filename, art.versions.length - 1);
            }
        }
    });
}

// Check state to enable/disable send button
function updateSendButtonState() {
    userInput.style.height = "auto";
    userInput.style.height = userInput.scrollHeight + "px";
    sendBtn.disabled = userInput.value.trim() === "" && attachedFiles.length === 0;
}

// Handle file selections
function handleFileSelection(e) {
    const files = e.target.files;
    processFiles(files);
}

function handleFileDrop(e) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    processFiles(files);
}

function processFiles(files) {
    if (!files || files.length === 0) return;
    
    Array.from(files).forEach(file => {
        if (file.size > 500 * 1024) {
            showToast(`Le fichier "${file.name}" est trop volumineux (max 500 Ko).`, "error");
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const textContent = event.target.result;
            if (textContent.includes("\0")) {
                showToast(`Le fichier "${file.name}" est binaire. Fichiers texte uniquement.`, "error");
                return;
            }
            
            if (!attachedFiles.some(f => f.name === file.name)) {
                attachedFiles.push({ name: file.name, textContent: textContent });
                renderAttachmentChips();
                updateSendButtonState();
            }
        };
        reader.readAsText(file);
    });
    
    fileInput.value = "";
}

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

window.removeAttachedFile = function(index) {
    attachedFiles.splice(index, 1);
    renderAttachmentChips();
    updateSendButtonState();
};

// Conversations Management
function startNewConversation() {
    currentConversationId = "chat_" + Date.now();
    currentMessages = [];
    attachedFiles = [];
    artifacts = {}; // Clear active artifacts context
    activeArtifactFilename = null;
    document.getElementById("artifactsPanel").classList.remove("active");
    localStorage.setItem("cypher_current_id", currentConversationId);
    
    messagesContainer.innerHTML = "";
    messagesContainer.appendChild(welcomeView);
    welcomeView.style.display = "flex";
    
    userInput.value = "";
    userInput.style.height = "auto";
    renderAttachmentChips();
    sendBtn.disabled = true;
}

function loadConversation(id) {
    const conv = conversations.find(c => c.id === id);
    if (!conv) {
        startNewConversation();
        return;
    }
    
    currentConversationId = id;
    currentMessages = conv.messages || [];
    attachedFiles = [];
    
    // Reload artifacts from conversation context
    artifacts = conv.artifacts || {};
    activeArtifactFilename = null;
    document.getElementById("artifactsPanel").classList.remove("active");
    
    localStorage.setItem("cypher_current_id", currentConversationId);
    redrawCurrentConversation();
    renderAttachmentChips();
    renderConversationsList();
}

function clearCurrentConversation() {
    currentMessages = [];
    attachedFiles = [];
    artifacts = {};
    conversations = conversations.filter(c => c.id !== currentConversationId);
    saveConversationsToStorage();
    startNewConversation();
    renderConversationsList();
}

// Redraw entire chat history in view
function redrawCurrentConversation() {
    messagesContainer.innerHTML = "";
    if (currentMessages.length === 0) {
        messagesContainer.appendChild(welcomeView);
        welcomeView.style.display = "flex";
    } else {
        welcomeView.style.display = "none";
        currentMessages.forEach((msg, idx) => {
            const bubble = renderMessage(msg.role, msg.content, msg.sources);
            
            // Re-render citations click events
            setupCitationClickHandlers(bubble, msg.sources || []);
            
            // Re-render generated files cards or ZIP bundles
            if (msg.role === "assistant" && msg.artifactsGenerated) {
                renderResponseFiles(bubble, msg.artifactsGenerated);
            }
        });
    }
    scrollToBottom();
}

// Parse markdown securely with Prism syntax highlighter and citations
function parseMarkdown(text) {
    try {
        return marked.parse(text);
    } catch (e) {
        return text.replace(/\n/g, "<br>");
    }
}

// Replace citations markers [X] in the text
function parseCitationsInline(text) {
    return text.replace(/\[(\d+)\]/g, (match, num) => {
        return `<a class="citation-badge" data-index="${num}">${num}</a>`;
    });
}

// Real-time Artifact extraction
function processMessageArtifacts(text, isAssistant, isFinished) {
    if (!isAssistant) return parseMarkdown(text);
    
    let processedText = text;
    let responseArtifacts = [];
    
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)(?:```|$)/g;
    let match;
    let lastBlockUnfinished = !text.trim().endsWith("```");
    const replacements = [];
    
    while ((match = codeBlockRegex.exec(text)) !== null) {
        const lang = match[1] ? match[1].toLowerCase() : "";
        const content = match[2];
        const isLast = (codeBlockRegex.lastIndex === text.length);
        
        const lines = content.split("\n");
        const firstLine = lines[0] ? lines[0].trim() : "";
        
        // Find filename
        const commentRegex = /^(?:\/\/\s*|\/\*\s*|#\s*|<!--\s*)([a-zA-Z0-9_\-\.\/]+)(?:\s*\*\/|\s*-->)?$/;
        const fileMatch = firstLine.match(commentRegex);
        let filename = fileMatch ? fileMatch[1] : null;
        
        const isArtifactLanguage = ["html", "css", "javascript", "js", "svg", "mermaid"].includes(lang);
        const isSubstantial = lines.length > 15;
        const hasFilename = filename !== null;
        
        if (isArtifactLanguage || isSubstantial || hasFilename) {
            if (!filename) {
                filename = `document.${lang || 'txt'}`;
                if (lang === "javascript" || lang === "js") filename = "script.js";
                if (lang === "html") filename = "index.html";
                if (lang === "css") filename = "style.css";
                if (lang === "mermaid") filename = "diagram.mermaid";
            }
            
            let cleanContent = content;
            if (fileMatch) {
                cleanContent = lines.slice(1).join("\n");
            }
            
            const isStreamingNow = isLast && lastBlockUnfinished && !isFinished;
            updateArtifactState(filename, lang, cleanContent, isFinished && !isStreamingNow);
            
            if (!responseArtifacts.includes(filename)) {
                responseArtifacts.push(filename);
            }
            
            replacements.push({
                raw: match[0],
                filename: filename,
                lang: lang,
                isStreaming: isStreamingNow
            });
        }
    }
    
    // Apply replacements in HTML
    replacements.forEach(rep => {
        const cardHtml = `
            <div class="artifact-suggestion-card animate-fade-in" data-filename="${rep.filename}">
                <div class="file-card-left">
                    <div class="file-card-icon">
                        <i data-lucide="file-code"></i>
                    </div>
                    <div class="file-card-info">
                        <h4 class="artifact-card-title">${rep.filename}</h4>
                        <span class="artifact-card-subtitle">
                            ${rep.isStreaming ? '⚡ Génération en cours...' : `Artifact ${rep.lang.toUpperCase()} • Cliquez pour ouvrir`}
                        </span>
                    </div>
                </div>
            </div>
        `;
        processedText = processedText.replace(rep.raw, cardHtml);
    });
    
    activeResponseArtifacts = responseArtifacts;
    
    // Render Markdown and resolve citations badges inline
    let html = parseMarkdown(processedText);
    return parseCitationsInline(html);
}

function updateArtifactState(filename, lang, content, commitNewVersion) {
    if (!artifacts[filename]) {
        artifacts[filename] = {
            lang: lang,
            versions: [content]
        };
        showArtifactsPanel(filename, 0);
    } else {
        const currentVersions = artifacts[filename].versions;
        const latestVersion = currentVersions[currentVersions.length - 1];
        
        if (commitNewVersion) {
            if (latestVersion !== content) {
                currentVersions.push(content);
                showArtifactsPanel(filename, currentVersions.length - 1);
            }
        } else {
            currentVersions[currentVersions.length - 1] = content;
            if (activeArtifactFilename === filename) {
                updateArtifactContentUI(content);
            }
        }
    }
}

// Artifact UI Panels Display
function showArtifactsPanel(filename, versionIndex) {
    activeArtifactFilename = filename;
    activeArtifactVersionIndex = versionIndex;
    
    const panel = document.getElementById("artifactsPanel");
    panel.classList.add("active");
    
    document.getElementById("artifactTitle").innerText = filename;
    
    const art = artifacts[filename];
    document.getElementById("artifactBadge").innerText = art.lang.toUpperCase();
    
    const tabSwitcher = document.getElementById("artifactTabSwitcher");
    const previewTab = tabSwitcher.querySelector('[data-tab="preview"]');
    
    // Set tabs display based on file type
    const isRenderable = ["html", "svg", "mermaid"].includes(art.lang);
    if (isRenderable) {
        previewTab.style.display = "flex";
    } else {
        previewTab.style.display = "none";
        tabSwitcher.querySelectorAll(".artifact-tab").forEach(t => t.classList.remove("active"));
        tabSwitcher.querySelector('[data-tab="code"]').classList.add("active");
    }
    
    updateArtifactVersionUI();
}

function updateArtifactVersionUI() {
    const art = artifacts[activeArtifactFilename];
    const versions = art.versions;
    const content = versions[activeArtifactVersionIndex];
    
    document.getElementById("artifactVersionLabel").innerText = `v${activeArtifactVersionIndex + 1}`;
    document.getElementById("artifactVersionBar").style.display = versions.length > 1 ? "flex" : "none";
    
    document.getElementById("artifactPrevVersion").disabled = activeArtifactVersionIndex === 0;
    document.getElementById("artifactNextVersion").disabled = activeArtifactVersionIndex === versions.length - 1;
    
    updateArtifactContentUI(content);
}

function updateArtifactContentUI(content) {
    const codeContentEl = document.getElementById("artifactCodeContent");
    codeContentEl.textContent = content;
    
    const art = artifacts[activeArtifactFilename];
    codeContentEl.className = `language-${art.lang} line-numbers`;
    Prism.highlightElement(codeContentEl);
    
    renderActiveTab(content);
}

function renderActiveTab(content) {
    const art = artifacts[activeArtifactFilename];
    const activeTabBtn = document.querySelector(".artifact-tab.active");
    if (!activeTabBtn) return;
    
    const activeTab = activeTabBtn.getAttribute("data-tab");
    
    const codeView = document.getElementById("artifactCodeView");
    const previewView = document.getElementById("artifactPreviewView");
    const mermaidView = document.getElementById("artifactMermaidView");
    
    if (activeTab === "code") {
        codeView.style.display = "block";
        previewView.style.display = "none";
        mermaidView.style.display = "none";
    } else if (activeTab === "preview") {
        if (art.lang === "mermaid") {
            codeView.style.display = "none";
            previewView.style.display = "none";
            mermaidView.style.display = "block";
            
            const mermaidContent = document.getElementById("artifactMermaidContent");
            mermaidContent.innerHTML = `<div class="mermaid">${content}</div>`;
            try {
                mermaid.init(undefined, mermaidContent.querySelectorAll(".mermaid"));
            } catch (err) {
                mermaidContent.innerHTML = `<span style="color:#ef4444;font-family:monospace;font-size:12px;">Mermaid Error: ${err.message}</span>`;
            }
        } else {
            codeView.style.display = "none";
            previewView.style.display = "block";
            mermaidView.style.display = "none";
            
            const iframe = document.getElementById("artifactPreviewFrame");
            if (art.lang === "html") {
                iframe.srcdoc = content;
            } else if (art.lang === "svg") {
                iframe.srcdoc = `<html><body style="margin:0;display:flex;align-items:center;justify-content:center;background:#0d1117;">${content}</body></html>`;
            }
        }
    }
}

function setupArtifactsPanelEvents() {
    const panel = document.getElementById("artifactsPanel");
    const closeBtn = document.getElementById("artifactCloseBtn");
    const fullscreenBtn = document.getElementById("artifactFullscreenBtn");
    const copyBtn = document.getElementById("artifactCopyBtn");
    const downloadBtn = document.getElementById("artifactDownloadBtn");
    const tabButtons = document.querySelectorAll(".artifact-tab");
    
    closeBtn.addEventListener("click", () => {
        panel.classList.remove("active");
        panel.classList.remove("fullscreen");
        activeArtifactFilename = null;
    });
    
    fullscreenBtn.addEventListener("click", () => {
        panel.classList.toggle("fullscreen");
        const isFullscreen = panel.classList.contains("fullscreen");
        fullscreenBtn.querySelector("i").setAttribute("data-lucide", isFullscreen ? "minimize-2" : "maximize-2");
        lucide.createIcons({ scope: fullscreenBtn });
    });
    
    copyBtn.addEventListener("click", () => {
        if (!activeArtifactFilename) return;
        const content = artifacts[activeArtifactFilename].versions[activeArtifactVersionIndex];
        navigator.clipboard.writeText(content).then(() => {
            showToast("Contenu de l'artifact copié !", "success");
        });
    });
    
    downloadBtn.addEventListener("click", () => {
        if (!activeArtifactFilename) return;
        const content = artifacts[activeArtifactFilename].versions[activeArtifactVersionIndex];
        downloadFile(activeArtifactFilename, content);
    });
    
    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            tabButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            if (activeArtifactFilename) {
                const content = artifacts[activeArtifactFilename].versions[activeArtifactVersionIndex];
                renderActiveTab(content);
            }
        });
    });
    
    document.getElementById("artifactPrevVersion").addEventListener("click", () => {
        if (activeArtifactVersionIndex > 0) {
            activeArtifactVersionIndex--;
            updateArtifactVersionUI();
        }
    });
    
    document.getElementById("artifactNextVersion").addEventListener("click", () => {
        const art = artifacts[activeArtifactFilename];
        if (activeArtifactVersionIndex < art.versions.length - 1) {
            activeArtifactVersionIndex++;
            updateArtifactVersionUI();
        }
    });
}

// Inline citation popovers tooltips
function setupCitationClickHandlers(bubbleElement, msgSources) {
    bubbleElement.querySelectorAll(".citation-badge").forEach(badge => {
        badge.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const index = parseInt(badge.getAttribute("data-index")) - 1;
            const source = msgSources[index];
            if (!source) return;
            
            document.querySelectorAll(".citation-tooltip").forEach(t => t.remove());
            
            const tooltip = document.createElement("div");
            tooltip.className = "citation-tooltip animate-fade-in";
            tooltip.innerHTML = `
                <strong style="display:block;margin-bottom:4px;font-size:12.5px;">${source.title}</strong>
                <p style="margin: 4px 0; color: var(--text-secondary); font-size: 11px; line-height:1.4;">${source.snippet || ""}</p>
                <a href="${source.url}" target="_blank" style="font-size:11px;">${new URL(source.url).hostname.replace("www.", "")} <i data-lucide="external-link" size="10" style="display:inline;vertical-align:middle;"></i></a>
            `;
            
            document.body.appendChild(tooltip);
            lucide.createIcons({ scope: tooltip });
            
            const rect = badge.getBoundingClientRect();
            tooltip.style.left = `${Math.min(window.innerWidth - 280, rect.left + window.scrollX)}px`;
            tooltip.style.top = `${rect.bottom + window.scrollY + 6}px`;
            
            const closeTooltip = () => {
                tooltip.remove();
                document.removeEventListener("click", closeTooltip);
            };
            setTimeout(() => document.addEventListener("click", closeTooltip), 10);
        });
    });
}

// Render horizontal scrollable sources above messages
function renderSourcesCarousel(container, msgSources) {
    if (!msgSources || msgSources.length === 0) return;
    
    let carousel = container.querySelector(".sources-carousel-container");
    if (!carousel) {
        carousel = document.createElement("div");
        carousel.className = "sources-carousel-container";
        container.insertBefore(carousel, container.firstChild);
    }
    
    carousel.innerHTML = "";
    msgSources.forEach((src, idx) => {
        const card = document.createElement("a");
        card.href = src.url;
        card.target = "_blank";
        card.className = "source-card animate-fade-in";
        card.innerHTML = `
            <div class="source-card-header">
                <span class="source-index">${idx + 1}</span>
                <span class="source-domain">${new URL(src.url).hostname.replace("www.", "")}</span>
            </div>
            <div class="source-title">${src.title}</div>
        `;
        carousel.appendChild(card);
    });
}

// Render generated files at bottom of assistant bubble
function renderResponseFiles(botBubble, fileList) {
    if (!fileList || fileList.length === 0) return;
    
    const fileContainer = document.createElement("div");
    fileContainer.className = "file-cards-container";
    fileContainer.style.display = "flex";
    fileContainer.style.flexDirection = "column";
    fileContainer.style.gap = "8px";
    fileContainer.style.marginTop = "14px";
    fileContainer.style.borderTop = "1px solid var(--border-color)";
    fileContainer.style.paddingTop = "12px";
    
    fileList.forEach(filename => {
        const art = artifacts[filename];
        if (!art) return;
        
        const latestContent = art.versions[art.versions.length - 1];
        const byteSize = new Blob([latestContent]).size;
        const kbSize = (byteSize / 1024).toFixed(1);
        
        const card = document.createElement("div");
        card.className = "generated-file-card";
        card.innerHTML = `
            <div class="file-card-left">
                <div class="file-card-icon">
                    <i data-lucide="file-code"></i>
                </div>
                <div class="file-card-info">
                    <h4>${filename}</h4>
                    <span>Fichier généré • ${kbSize} Ko</span>
                </div>
            </div>
            <button class="file-card-download-btn" data-filename="${filename}">
                <i data-lucide="download"></i> Télécharger
            </button>
        `;
        
        card.querySelector(".file-card-download-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            downloadFile(filename, latestContent);
        });
        
        fileContainer.appendChild(card);
    });
    
    if (fileList.length > 1) {
        const zipBanner = document.createElement("div");
        zipBanner.className = "zip-download-banner";
        zipBanner.innerHTML = `
            <div class="zip-banner-info">
                <i data-lucide="archive"></i>
                <span>Télécharger les ${fileList.length} fichiers en ZIP</span>
            </div>
            <button class="zip-banner-btn">
                <i data-lucide="file-archive"></i> Télécharger le ZIP
            </button>
        `;
        
        zipBanner.querySelector(".zip-banner-btn").addEventListener("click", () => {
            downloadZIP(fileList);
        });
        
        fileContainer.appendChild(zipBanner);
    }
    
    botBubble.appendChild(fileContainer);
    lucide.createIcons({ scope: fileContainer });
}

function downloadFile(filename, content) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Fichier "${filename}" téléchargé !`, "success");
}

async function downloadZIP(fileList) {
    const zip = new JSZip();
    fileList.forEach(filename => {
        const art = artifacts[filename];
        if (art) {
            const content = art.versions[art.versions.length - 1];
            zip.file(filename, content);
        }
    });
    
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cypher_bundle_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("ZIP des fichiers téléchargé !", "success");
}

// Redraw conversation list with search and grouping
function renderConversationsList() {
    chatHistoryList.innerHTML = "";
    const searchVal = sidebarSearch.value.toLowerCase();
    
    const filtered = conversations.filter(c => c.title.toLowerCase().includes(searchVal));
    
    if (filtered.length === 0) {
        chatHistoryList.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 13px; padding-top: 20px;">Aucune conversation</div>`;
        return;
    }
    
    const pinned = filtered.filter(c => c.pinned);
    const unpinned = filtered.filter(c => !c.pinned);
    
    const groups = {
        today: [],
        yesterday: [],
        week: [],
        older: []
    };
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
    const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;
    
    unpinned.forEach(c => {
        const time = c.timestamp || Date.now();
        if (time >= todayStart) groups.today.push(c);
        else if (time >= yesterdayStart) groups.yesterday.push(c);
        else if (time >= weekStart) groups.week.push(c);
        else groups.older.push(c);
    });
    
    const appendGroup = (title, items) => {
        if (items.length === 0) return;
        
        const label = document.createElement("div");
        label.className = "sidebar-group-label";
        label.innerText = title;
        chatHistoryList.appendChild(label);
        
        items.forEach(c => {
            const item = document.createElement("button");
            item.className = `chat-history-item ${c.id === currentConversationId ? "active" : ""} ${c.pinned ? "pinned" : ""}`;
            item.setAttribute("data-id", c.id);
            item.innerHTML = `
                <i data-lucide="message-square" size="14"></i>
                <span class="chat-history-title">${c.title}</span>
                <i data-lucide="pin" size="12" class="pin-icon"></i>
            `;
            
            item.addEventListener("click", () => {
                loadConversation(c.id);
                sidebar.classList.remove("active");
            });
            
            chatHistoryList.appendChild(item);
        });
    };
    
    appendGroup("Épinglées", pinned);
    appendGroup("Aujourd'hui", groups.today);
    appendGroup("Hier", groups.yesterday);
    appendGroup("7 derniers jours", groups.week);
    appendGroup("Plus ancien", groups.older);
    
    lucide.createIcons();
}

// Right Click Context Menu operations
function setupContextMenu() {
    document.addEventListener("contextmenu", (e) => {
        const item = e.target.closest(".chat-history-item");
        if (item) {
            e.preventDefault();
            contextMenuConversationId = item.getAttribute("data-id");
            
            contextMenu.style.display = "flex";
            contextMenu.style.left = `${e.clientX}px`;
            contextMenu.style.top = `${e.clientY}px`;
            
            // Set text for pin option based on state
            const conv = conversations.find(c => c.id === contextMenuConversationId);
            const pinBtn = contextMenu.querySelector('[data-action="pin"]');
            if (conv && pinBtn) {
                pinBtn.innerHTML = conv.pinned ? `<i data-lucide="pin-off" size="14"></i> Désépingler` : `<i data-lucide="pin" size="14"></i> Épingler`;
                lucide.createIcons({ scope: pinBtn });
            }
        } else {
            contextMenu.style.display = "none";
        }
    });
    
    document.addEventListener("click", () => {
        contextMenu.style.display = "none";
    });
    
    contextMenu.querySelectorAll(".context-menu-item").forEach(btn => {
        btn.addEventListener("click", () => {
            const action = btn.getAttribute("data-action");
            if (action === "rename") {
                renameConversationPrompt(contextMenuConversationId);
            } else if (action === "pin") {
                togglePinConversation(contextMenuConversationId);
            } else if (action === "delete") {
                deleteConversation(contextMenuConversationId);
            }
        });
    });
}

function renameConversationPrompt(id) {
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    const newTitle = prompt("Renommer la conversation :", conv.title);
    if (newTitle && newTitle.trim()) {
        conv.title = newTitle.trim();
        saveConversationsToStorage();
        renderConversationsList();
        showToast("Conversation renommée !", "success");
    }
}

function togglePinConversation(id) {
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    conv.pinned = !conv.pinned;
    saveConversationsToStorage();
    renderConversationsList();
    showToast(conv.pinned ? "Discussion épinglée !" : "Discussion désépinglée !", "success");
}

function deleteConversation(id) {
    if (confirm("Supprimer cette conversation ?")) {
        conversations = conversations.filter(c => c.id !== id);
        saveConversationsToStorage();
        if (currentConversationId === id) {
            startNewConversation();
        } else {
            renderConversationsList();
        }
        showToast("Conversation supprimée !", "success");
    }
}

// Render Single Message in Chat Area
function renderMessage(role, content, msgSources = []) {
    welcomeView.style.display = "none";
    
    const wrapper = document.createElement("div");
    wrapper.className = `message-wrapper ${role}`;
    
    const label = document.createElement("div");
    label.className = "message-label";
    label.innerText = role === "user" ? username : "Cypher AI";
    
    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    
    // Set content (initial loader dots or processed markdown)
    if (content === "...") {
        bubble.innerHTML = `
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;
    } else {
        bubble.innerHTML = processMessageArtifacts(content, role === "assistant", true);
        if (role === "assistant" && msgSources && msgSources.length > 0) {
            renderSourcesCarousel(bubble, msgSources);
        }
    }
    
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
        
        const copyBtn = actionsRow.querySelector(".copy-btn");
        copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(content).then(() => {
                copyBtn.innerHTML = `<i data-lucide="check" size="14"></i>`;
                lucide.createIcons({ scope: copyBtn });
                setTimeout(() => {
                    copyBtn.innerHTML = `<i data-lucide="copy" size="14"></i>`;
                    lucide.createIcons({ scope: copyBtn });
                }, 2000);
            });
        });
        
        const likeBtn = actionsRow.querySelector(".like-btn");
        const dislikeBtn = actionsRow.querySelector(".dislike-btn");
        likeBtn.addEventListener("click", () => {
            likeBtn.classList.toggle("active");
            dislikeBtn.classList.remove("active");
        });
        
        dislikeBtn.addEventListener("click", () => {
            dislikeBtn.classList.toggle("active");
            likeBtn.classList.remove("active");
        });
        
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
    } else {
        // user bubble actions
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
        
        const copyBtn = actionsRow.querySelector(".copy-btn");
        copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(content).then(() => {
                copyBtn.innerHTML = `<i data-lucide="check" size="14"></i>`;
                lucide.createIcons({ scope: copyBtn });
                setTimeout(() => {
                    copyBtn.innerHTML = `<i data-lucide="copy" size="14"></i>`;
                    lucide.createIcons({ scope: copyBtn });
                }, 2000);
            });
        });
        
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
                bubble.innerHTML = processMessageArtifacts(originalText, false, true);
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

// Inject copy/download headers for non-artifact standard code blocks
function injectFileHeaders(bubbleElement) {
    const preBlocks = bubbleElement.querySelectorAll("pre");
    preBlocks.forEach((pre, index) => {
        if (pre.parentElement.classList.contains("code-block-wrapper") || pre.closest(".artifact-suggestion-card")) {
            return;
        }
        
        const codeElement = pre.querySelector("code");
        if (!codeElement) return;
        const codeText = codeElement.innerText;
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
            if (determinedLanguage === "javascript" || determinedLanguage === "js") filename = `script.js`;
            else if (determinedLanguage === "html") filename = `index.html`;
            else if (determinedLanguage === "css") filename = `style.css`;
            else if (determinedLanguage === "python" || determinedLanguage === "py") filename = `script.py`;
            else if (determinedLanguage === "json") filename = `data.json`;
            else if (determinedLanguage === "markdown" || determinedLanguage === "md") filename = `document.md`;
            else if (determinedLanguage === "shell" || determinedLanguage === "bash" || determinedLanguage === "sh") filename = `script.sh`;
            else filename = `code_${index + 1}.txt`;
        }
        
        let iconName = "file-code";
        const ext = filename.split(".").pop().toLowerCase();
        if (["py", "pyw"].includes(ext)) iconName = "terminal";
        else if (["js", "ts", "jsx", "tsx"].includes(ext)) iconName = "file-json";
        else if (["html", "xml"].includes(ext)) iconName = "file-type-2";
        else if ("css" === ext) iconName = "file-spreadsheet";
        else if ("json" === ext) iconName = "file-json";
        else if ("md" === ext) iconName = "file-text";
        
        const wrapper = document.createElement("div");
        wrapper.className = "code-block-wrapper";
        
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
        
        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(header);
        wrapper.appendChild(pre);
        
        const oldCopyBtn = pre.querySelector(".copy-code-btn");
        if (oldCopyBtn) oldCopyBtn.remove();
        
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
            downloadFile(filename, codeText);
        });
        
        lucide.createIcons({ scope: header });
        
        // Add syntax highlighting line numbers
        pre.classList.add("line-numbers");
        Prism.highlightElement(codeElement);
    });
}

function addCopyCodeButtons(bubbleElement) {
    const preBlocks = bubbleElement.querySelectorAll("pre");
    preBlocks.forEach(pre => {
        if (pre.querySelector(".copy-code-btn") || pre.parentElement.classList.contains("code-block-wrapper")) return;
        
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

// Send Message Handler & SSE Streaming
async function sendMessage() {
    const text = userInput.value.trim();
    if (!text && attachedFiles.length === 0) return;
    
    let displayContent = "";
    let finalPayloadContent = "";
    
    if (attachedFiles.length > 0) {
        const fileBlocks = attachedFiles.map(file => `[Fichier attaché : ${file.name}]\n\`\`\`\n${file.textContent}\n\`\`\``).join("\n\n");
        if (text) {
            displayContent = `${fileBlocks}\n\n${text}`;
            finalPayloadContent = `${fileBlocks}\n\n${text}`;
        } else {
            displayContent = `${fileBlocks}\n\n*Analyse des fichiers ci-dessus.*`;
            finalPayloadContent = `${fileBlocks}\n\nAnalyse les fichiers joints ci-dessus.`;
        }
    } else {
        displayContent = text;
        finalPayloadContent = text;
    }
    
    renderMessage("user", displayContent);
    currentMessages.push({ role: "user", content: finalPayloadContent });
    
    attachedFiles = [];
    renderAttachmentChips();
    
    userInput.value = "";
    userInput.style.height = "auto";
    sendBtn.disabled = true;
    scrollToBottom();
    
    await streamAIResponse();
}

async function streamAIResponse() {
    const botBubble = renderMessage("assistant", "...");
    let botResponseText = "";
    activeResponseArtifacts = [];
    
    let searchLogsBox = null;
    let searchLogsList = null;
    let searchSourcesList = null;
    let searchLogsCount = null;
    let sources = [];
    let firstToken = true;

    // Detect if we should scroll automatically
    let shouldAutoScroll = true;
    messagesContainer.addEventListener("scroll", () => {
        const threshold = 60; // pixels from bottom
        shouldAutoScroll = (messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight) < threshold;
    });

    try {
        let response;
        if (appMode === "local") {
            response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: currentMessages,
                    webSearch: webSearchToggle.checked,
                    username: username,
                    token: hfToken,
                    model: selectedModel,
                    temperature: selectedTemperature,
                    maxTokens: selectedMaxTokens,
                    searchMode: activeSearchMode
                })
            });
        } else {
            // Direct HF client mode
            const activeToken = hfToken || DEFAULT_HF_TOKEN;
            const dateString = new Date().toLocaleDateString("fr-FR", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const dateContext = `[INFO TEMPORELLE CRITIQUE] : Aujourd'hui nous sommes le ${dateString} (Année 2026). L'année en cours est STRICTEMENT 2026. Ignore toute donnée disant que nous sommes en 2023 ou 2024. Si on te demande la date ou l'année, réponds impérativement 2026.\n`;
            
            response = await fetch(`https://router.huggingface.co/v1/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${activeToken}`
                },
                body: JSON.stringify({
                    model: selectedModel,
                    messages: [
                        { role: "system", content: dateContext + SYSTEM_PROMPT },
                        ...currentMessages
                    ],
                    temperature: selectedTemperature,
                    max_tokens: selectedMaxTokens,
                    stream: true
                })
            });
        }

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Erreur API: ${errText || response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            
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
                        
                        // Handle server-side RAG search progress logs
                        if (parsed.type === "log") {
                            if (parsed.status === "thinking" && !searchLogsBox) continue;
                            
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
                                
                                searchLogsBox.querySelector(".search-logs-header").addEventListener("click", () => {
                                    searchLogsBox.classList.toggle("collapsed");
                                });
                            }
                            
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
                                searchLogsBox.querySelector(".search-logs-title").innerText = "Recherche terminée";
                                const globeIcon = searchLogsBox.querySelector(".search-globe-icon");
                                if (globeIcon) {
                                    globeIcon.className = "search-globe-icon check-icon";
                                    globeIcon.setAttribute("data-lucide", "check-circle");
                                    lucide.createIcons({ scope: searchLogsBox });
                                }
                            }
                            
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
                        
                        // Handle standard tokens
                        const tokenText = parsed.choices[0]?.delta?.content || "";
                        if (tokenText) {
                            if (firstToken) {
                                firstToken = false;
                                botBubble.innerHTML = "";
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
                            
                            // Perform real-time parsing with streaming artifact updates
                            botBubble.innerHTML = processMessageArtifacts(botResponseText, true, false);
                            
                            // Dynamically render permanent source carousels during stream if sources exist
                            if (sources.length > 0) {
                                renderSourcesCarousel(botBubble, sources);
                            }
                            
                            // Dynamic icons creation for streaming artifact cards
                            lucide.createIcons({ scope: botBubble });
                        }
                    } catch (e) {
                        // Fail silently for packet segment splits
                    }
                }
            }
            if (shouldAutoScroll) scrollToBottom();
        }
        
        // Stream completed
        botBubble.innerHTML = processMessageArtifacts(botResponseText, true, true);
        if (sources.length > 0) {
            renderSourcesCarousel(botBubble, sources);
            setupCitationClickHandlers(botBubble, sources);
        }
        
        // Save history with dynamic search logs sources context & generated artifacts details
        currentMessages.push({
            role: "assistant",
            content: botResponseText,
            sources: sources,
            artifactsGenerated: activeResponseArtifacts
        });
        
        injectFileHeaders(botBubble);
        renderResponseFiles(botBubble, activeResponseArtifacts);
        saveCurrentConversation();
        
    } catch (e) {
        botBubble.innerHTML = `<span style="color: #EF4444;">⚠️ Échec de connexion : ${e.message}</span>`;
        currentMessages.push({ role: "assistant", content: `Erreur: ${e.message}` });
    }
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Persist conversations
function saveCurrentConversation() {
    const existingIndex = conversations.findIndex(c => c.id === currentConversationId);
    let title = "Discussion";
    if (currentMessages.length > 0) {
        const firstMsg = currentMessages[0].content;
        const displayTitle = firstMsg.replace(/\[Fichier attaché : [^\]]+\]\n```[\s\S]*?```\n\n/g, "");
        title = displayTitle.substring(0, 30) + (displayTitle.length > 30 ? "..." : "");
        if (!title.trim()) title = "Discussion avec Fichier";
    }
    
    const convData = {
        id: currentConversationId,
        title: title,
        timestamp: Date.now(),
        messages: currentMessages,
        artifacts: artifacts // Save generated artifacts per conversation
    };
    
    if (existingIndex > -1) {
        conversations[existingIndex] = convData;
    } else {
        conversations.unshift(convData);
    }
    
    saveConversationsToStorage();
    renderConversationsList();
}

function saveConversationsToStorage() {
    localStorage.setItem("cypher_conversations", JSON.stringify(conversations));
}

// Health Checks
async function checkServerHealth() {
    try {
        const res = await fetch("/api/health");
        if (res.ok) {
            connectionStatus.className = "connection-status";
            connectionStatus.querySelector("span").innerText = "Serveur connecté (RAG actif)";
        } else {
            connectionStatus.className = "connection-status disconnected";
            connectionStatus.querySelector("span").innerText = "Erreur serveur";
        }
    } catch {
        connectionStatus.className = "connection-status disconnected";
        connectionStatus.querySelector("span").innerText = "Serveur hors ligne";
    }
}

// Save Settings modal content
function saveSettings() {
    username = usernameInput.value.trim() || "invité";
    hfToken = tokenInput.value.trim();
    appMode = modeSelect.value;
    selectedModel = modelSelect.value;
    selectedTemperature = parseFloat(temperatureSlider.value);
    selectedMaxTokens = parseInt(maxTokensSlider.value);
    activeFontSize = fontSizeSelect.value;
    
    localStorage.setItem("cypher_username", username);
    localStorage.setItem("cypher_token", hfToken);
    localStorage.setItem("cypher_mode", appMode);
    localStorage.setItem("cypher_model_name", selectedModel);
    localStorage.setItem("cypher_temperature", selectedTemperature);
    localStorage.setItem("cypher_max_tokens", selectedMaxTokens);
    localStorage.setItem("cypher_theme", activeTheme);
    localStorage.setItem("cypher_font_size", activeFontSize);
    
    applyTheme(activeTheme);
    applyFontSize(activeFontSize);
    updateStatusText();
    
    settingsModal.classList.remove("active");
    loadConversation(currentConversationId); // Rerender
    showToast("Réglages enregistrés !", "success");
}

// Premium Toast Notification
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
    
    setTimeout(() => {
        toast.classList.remove("animate-fade-in");
        toast.classList.add("animate-fade-out");
        toast.addEventListener("animationend", () => {
            toast.remove();
            if (container.children.length === 0) container.remove();
        });
    }, 4000);
}
