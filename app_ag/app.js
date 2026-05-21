// Antigravity Chatbot Core Logic

// Global Error boundary catcher
window.addEventListener('error', function(event) {
  console.error("Uncaught exception caught by boundary:", event.error);
  const banner = document.getElementById("error-boundary-banner");
  const msgEl = document.getElementById("error-boundary-message");
  if (banner && msgEl) {
    banner.classList.remove("hidden");
    msgEl.innerText = `Error: ${event.message || (event.error ? event.error.message : 'Unknown script failure')} (Line ${event.lineno || '?'}, Col ${event.colno || '?'})`;
  }
});

function clearAllDataAndReset() {
  if (confirm("This will permanently delete all conversation history and API configuration keys from your browser's local storage. Are you sure you want to proceed?")) {
    localStorage.clear();
    location.reload();
  }
}

// ----------------------------------------------------
// 1. DEFAULT CONFIGURATION DEFINITIONS
// ----------------------------------------------------
const DEFAULT_CONFIG = {
  provider: "gemini",
  model: "gemini-1.5-flash",
  baseUrl: "https://generativelanguage.googleapis.com", // Gemini base URL
  apiKeys: {
    gemini: "",
    openai: ""
  },
  temperature: 0.7
};

const PROVIDER_MODELS = {
  gemini: {
    models: ["gemini-1.5-flash", "gemini-1.5-pro"],
    defaultUrl: "https://generativelanguage.googleapis.com"
  },
  openai: {
    models: ["gpt-4o", "gpt-4-turbo"],
    defaultUrl: "https://api.openai.com" // Resolved automatically if user provides openai.com
  }
};

// ----------------------------------------------------
// 2. SYSTEM INSTRUCTIONS & PERSONA DEFINITIONS
// ----------------------------------------------------
const PERSONAS = {
  developer: "Elite Senior Developer and AI pair-programming pioneer. Writes clean, DRY, SOLID, production-ready code with complete implementations.",
  reviewer: "Ultra-precise automated code auditor. Breaks feedback into: Critical/Security, Performance, and Style. Provides exact refactored code fixes.",
  architect: "Principal Systems Architect specializing in scalable, cloud-native distributed systems. Evaluates trade-offs using pros/cons matrices.",
  pm: "Agile Project Manager and Scrum Master. Drafts clear user stories, acceptance criteria, and breaks down tasks into sub-tasks.",
  ba: "Lead Business Analyst bridging business goals and technical teams. Formulates formal functional and non-functional requirements.",
  tester: "Lead QA Automation Engineer. Generates complete test plans and automation scripts using modern frameworks (Playwright/Jest).",
  writer: "Senior Technical Writer. Converts complex systems into accessible, perfectly structured Markdown documentation and API references."
};

const INTERACTION_MODES = {
  enhancer: "Injects instructions to expand the user's prompt into a highly detailed version before executing it. Take the user's input and expand it with deep reasoning, structural clarity, edge cases, and best practices. Present your expanded thoughts first in a collapsible 'Enhanced Prompt Specifications' dropdown detail, then perform the response under those high-fidelity specifications.",
  markdown: "Explicitly format your entire response in clear, beautifully spaced, highly structured Markdown. Use appropriate headings, standard bullet lists, tables, bold text, blockquotes, and code blocks for absolute clarity. Avoid plain text blocks.",
  qa: "Directly answer the question in a highly concise, rule-based direct format. Skip all conversational pleasantries, warnings, greetings, introductory remarks, and conclusion statements. Deliver only the precise answer or instructions requested.",
  code: "Prioritize code-based layouts. Explain your architecture briefly and wrap all outputs inside clean, syntax-highlighted code blocks. Write complete, non-placeholder implementations that the user can directly copy and run. Ensure all code blocks are properly labeled with their corresponding language."
};

// ----------------------------------------------------
// 3. CORE STATE MACHINE
// ----------------------------------------------------
let state = {
  settings: { ...DEFAULT_CONFIG },
  conversations: [],
  activeChatId: null,
  attachedFiles: [],
  isRecording: false
};

// Speech Recognition Instance
let recognition = null;

// ----------------------------------------------------
// 4. STORAGE FUNCTIONS
// ----------------------------------------------------
function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    console.warn("Failed to parse JSON for string:", str, e);
    // If it's a plain string that failed JSON parsing (e.g. raw activeChatId string without stringify quotes), return it directly!
    if (typeof str === 'string' && str.trim().startsWith("chat_")) {
      return str.trim();
    }
    return fallback;
  }
}

function saveStateToStorage() {
  try {
    localStorage.setItem("antigravity_settings", JSON.stringify(state.settings));
    localStorage.setItem("antigravity_conversations", JSON.stringify(state.conversations));
    localStorage.setItem("antigravity_active_id", JSON.stringify(state.activeChatId));
  } catch (err) {
    console.error("Failed to save state to storage:", err);
  }
}

function loadStateFromStorage() {
  try {
    const savedSettings = localStorage.getItem("antigravity_settings");
    const savedConversations = localStorage.getItem("antigravity_conversations");
    const savedActiveId = localStorage.getItem("antigravity_active_id");

    if (savedSettings) {
      const parsed = safeJsonParse(savedSettings, null);
      if (parsed) {
        state.settings = { ...DEFAULT_CONFIG, ...parsed };
      }
    }
    if (savedConversations) {
      state.conversations = safeJsonParse(savedConversations, []);
    }
    if (savedActiveId) {
      state.activeChatId = safeJsonParse(savedActiveId, null);
    }

    updateHeaderStatus();
    renderHistory();
    
    // Check if activeChatId is valid and exists in state.conversations
    const activeChat = Array.isArray(state.conversations) ? state.conversations.find(c => c.id === state.activeChatId) : null;
    if (state.activeChatId && activeChat) {
      restoreActiveChat();
    } else {
      createNewChat();
    }
  } catch (err) {
    console.error("Critical error in loadStateFromStorage:", err);
    // Fall back to clean slate if storage load failed catastrophically
    state.settings = { ...DEFAULT_CONFIG };
    state.conversations = [];
    state.activeChatId = null;
    createNewChat();
  }
}

// ----------------------------------------------------
// 5. FILE PARSING IMPLEMENTATIONS
// ----------------------------------------------------
async function handleFileSelection(files) {
  const bar = document.getElementById("attached-files-bar");
  
  for (let file of files) {
    const extension = file.name.split('.').pop().toLowerCase();
    
    // Prevent duplicate uploads
    if (state.attachedFiles.some(f => f.name === file.name)) continue;

    const fileObj = {
      name: file.name,
      size: formatBytes(file.size),
      type: file.type || extension,
      text: ""
    };

    showInlineSpinner("Parsing " + file.name + "...");

    try {
      if (extension === "pdf") {
        fileObj.text = await parsePdfText(file);
      } else {
        fileObj.text = await parseTextFile(file);
      }

      state.attachedFiles.push(fileObj);
      renderAttachedFiles();
    } catch (err) {
      alert(`Error parsing file: ${file.name}. Code: ${err.message}`);
      console.error(err);
    } finally {
      hideInlineSpinner();
    }
  }
}

function parseTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error("File reading failed."));
    reader.readAsText(file);
  });
}

async function parsePdfText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const typedarray = new Uint8Array(e.target.result);
        // Load the PDF via PDFJS
        const loadingTask = pdfjsLib.getDocument({ data: typedarray });
        const pdf = await loadingTask.promise;
        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageStrings = textContent.items.map(item => item.str);
          fullText += pageStrings.join(" ") + "\n";
        }
        resolve(fullText.trim());
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (e) => reject(new Error("PDF reading failed."));
    reader.readAsArrayBuffer(file);
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ----------------------------------------------------
// 6. SPEECH INPUT FUNCTIONS (WEB SPEECH API)
// ----------------------------------------------------
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    console.warn("Speech recognition is not supported in this browser.");
    const micBtn = document.getElementById("btn-microphone");
    if (micBtn) micBtn.style.display = "none";
    return;
  }

  try {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      state.isRecording = true;
      const micBtn = document.getElementById("btn-microphone");
      if (micBtn) micBtn.classList.add("mic-active");
    };

    recognition.onend = () => {
      state.isRecording = false;
      const micBtn = document.getElementById("btn-microphone");
      if (micBtn) micBtn.classList.remove("mic-active");
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      state.isRecording = false;
      const micBtn = document.getElementById("btn-microphone");
      if (micBtn) micBtn.classList.remove("mic-active");
      if (event.error !== 'no-speech') {
        alert(`Speech Recognition Error: ${event.error}`);
      }
    };

    recognition.onresult = (event) => {
      const resultText = event.results[0][0].transcript;
      const textarea = document.getElementById("chat-textarea");
      
      // Insert text at cursor position or append
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const originalText = textarea.value;
      
      textarea.value = originalText.substring(0, start) + resultText + originalText.substring(end);
      textarea.focus();
      autoResizeTextarea(textarea);
    };
  } catch (err) {
    console.warn("Speech recognition instantiation failed:", err);
    recognition = null;
    const micBtn = document.getElementById("btn-microphone");
    if (micBtn) micBtn.style.display = "none";
  }
}

function toggleMicrophone() {
  if (!recognition) {
    alert("Speech recognition is not available in your current browser browser environment. Please try Google Chrome or Edge.");
    return;
  }

  if (state.isRecording) {
    recognition.stop();
  } else {
    recognition.start();
  }
}

// ----------------------------------------------------
// 7. CONVERSATION STATE CONTROLLER
// ----------------------------------------------------
function createNewChat() {
  const newId = "chat_" + Date.now();
  const defaultObj = "General Purpose";
  
  const newChat = {
    id: newId,
    title: "New Conversation",
    objective: defaultObj,
    mode: "markdown",
    persona: "developer",
    messages: [],
    files: [],
    timestamp: new Date().toLocaleString()
  };

  state.conversations.unshift(newChat);
  state.activeChatId = newId;
  state.attachedFiles = [];
  
  saveStateToStorage();
  renderHistory();
  restoreActiveChat();

  // Reset objective input & drop-downs in UI
  document.getElementById("input-objective").value = defaultObj;
  document.getElementById("select-persona").value = "developer";
  document.getElementById("select-interaction-mode").value = "markdown";
  
  // Shift focus
  document.getElementById("chat-textarea").focus();
}

function restoreActiveChat() {
  try {
    const activeChat = Array.isArray(state.conversations) ? state.conversations.find(c => c.id === state.activeChatId) : null;
    if (!activeChat) return;

    // Bind values safely to UI
    const inputObj = document.getElementById("input-objective");
    if (inputObj) inputObj.value = activeChat.objective || "General Purpose";

    const selectPersona = document.getElementById("select-persona");
    if (selectPersona) selectPersona.value = activeChat.persona || "developer";

    const selectMode = document.getElementById("select-interaction-mode");
    if (selectMode) selectMode.value = activeChat.mode || "markdown";
    
    // Set attached context files
    state.attachedFiles = activeChat.files || [];
    renderAttachedFiles();

    // Highlight active sidebar item
    const items = document.querySelectorAll(".history-item");
    items.forEach(item => {
      if (item.dataset.id === state.activeChatId) {
        item.classList.add("bg-slate-800/60", "border-indigo-500/50");
        item.classList.remove("border-glassborder");
      } else {
        item.classList.remove("bg-slate-800/60", "border-indigo-500/50");
        item.classList.add("border-glassborder");
      }
    });

    // Load chat stream messages
    const stream = document.getElementById("message-stream-container");
    if (stream) {
      stream.innerHTML = "";

      const messages = activeChat.messages || [];
      const welcome = document.getElementById("welcome-container");
      if (messages.length === 0) {
        if (welcome) welcome.style.display = "block";
      } else {
        if (welcome) welcome.style.display = "none";
        messages.forEach(msg => {
          renderMessageBubble(msg.role, msg.content, msg.id || Math.random().toString());
        });
      }
      stream.scrollTop = stream.scrollHeight;
    }
  } catch (err) {
    console.error("Error in restoreActiveChat:", err);
  }
}

function deleteChat(id, event) {
  if (event) event.stopPropagation();
  
  if (!confirm("Are you sure you want to delete this conversation?")) return;

  state.conversations = state.conversations.filter(c => c.id !== id);
  
  if (state.activeChatId === id) {
    state.activeChatId = state.conversations.length > 0 ? state.conversations[0].id : null;
  }
  
  saveStateToStorage();
  renderHistory();

  if (state.activeChatId) {
    restoreActiveChat();
  } else {
    createNewChat();
  }
}

// ----------------------------------------------------
// 8. RENDER HELPER LOGIC
// ----------------------------------------------------
function renderHistory() {
  try {
    const container = document.getElementById("chat-history-container");
    if (!container) return;
    container.innerHTML = "";

    const conversations = state.conversations || [];

    if (conversations.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8 text-slate-500 text-sm">
          <i class="fa-regular fa-comments text-3xl mb-2 block opacity-40"></i>
          No conversations yet
        </div>`;
      return;
    }

    conversations.forEach(chat => {
      const activeClass = chat.id === state.activeChatId ? "bg-slate-800/60 border-indigo-500/50" : "border-glassborder hover:bg-slate-900/40";
      const item = document.createElement("div");
      item.className = `history-item group px-4 py-3 border rounded-xl flex items-center justify-between cursor-pointer transition duration-150 ${activeClass}`;
      item.dataset.id = chat.id;
      item.onclick = () => {
        state.activeChatId = chat.id;
        saveStateToStorage();
        restoreActiveChat();
      };

      const hasContext = chat.files && chat.files.length > 0;
      const timestampString = chat.timestamp || new Date().toLocaleString();
      const formattedDate = timestampString.includes(',') ? timestampString.split(',')[0] : timestampString;

      item.innerHTML = `
        <div class="flex-1 min-w-0 pr-3">
          <div class="flex items-center space-x-1.5">
            <span class="text-xs font-semibold text-slate-200 truncate block">${chat.title || 'New Conversation'}</span>
            ${hasContext ? `<i class="fa-solid fa-paperclip text-[10px] text-indigo-400" title="Contains attachments"></i>` : ''}
          </div>
          <div class="flex items-center space-x-2 mt-1">
            <span class="text-[9px] text-slate-500 font-semibold uppercase tracking-wider">${chat.persona || 'developer'}</span>
            <span class="text-[9px] text-slate-600 font-bold">•</span>
            <span class="text-[9px] text-slate-500 font-semibold truncate block">${formattedDate}</span>
          </div>
        </div>
        <button onclick="deleteChat('${chat.id}', event)" class="w-7 h-7 rounded-lg hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 flex items-center justify-center transition opacity-0 group-hover:opacity-100 duration-150" title="Delete Chat">
          <i class="fa-regular fa-trash-can text-xs"></i>
        </button>
      `;
      container.appendChild(item);
    });
  } catch (err) {
    console.error("Error in renderHistory:", err);
  }
}

function renderAttachedFiles() {
  const bar = document.getElementById("attached-files-bar");
  const container = document.getElementById("attached-files-pills");
  
  if (state.attachedFiles.length === 0) {
    bar.classList.add("hidden");
    container.innerHTML = "";
    return;
  }

  bar.classList.remove("hidden");
  container.innerHTML = "";

  state.attachedFiles.forEach((file, index) => {
    const pill = document.createElement("div");
    pill.className = "flex items-center space-x-2 bg-slate-900 border border-glassborder/80 px-3 py-1.5 rounded-lg text-xs hover:border-slate-700 transition";
    
    let iconClass = "fa-file-lines text-slate-400";
    if (file.name.endsWith(".pdf")) iconClass = "fa-file-pdf text-rose-400";
    if (file.name.endsWith(".json")) iconClass = "fa-file-code text-amber-400";
    if (file.name.endsWith(".md")) iconClass = "fa-file-lines text-sky-400";

    pill.innerHTML = `
      <i class="fa-solid ${iconClass}"></i>
      <span class="text-slate-300 font-medium truncate max-w-[120px] cursor-pointer" onclick="viewFileContext(${index})">${file.name}</span>
      <span class="text-[10px] text-slate-500 font-mono">${file.size}</span>
      <button onclick="removeAttachedFile(${index})" class="text-slate-500 hover:text-rose-400 font-bold transition ml-1">&times;</button>
    `;
    container.appendChild(pill);
  });

  // Sync to active state
  const activeChat = state.conversations.find(c => c.id === state.activeChatId);
  if (activeChat) {
    activeChat.files = [...state.attachedFiles];
    saveStateToStorage();
    renderHistory(); // Re-render for icon badge sync
  }
}

function removeAttachedFile(index) {
  state.attachedFiles.splice(index, 1);
  renderAttachedFiles();
}

function viewFileContext(index) {
  const file = state.attachedFiles[index];
  if (!file) return;

  document.getElementById("preview-title").innerText = file.name;
  document.getElementById("preview-body").innerText = file.text || "Empty content";
  
  const wordCount = (file.text || "").trim().split(/\s+/).filter(w => w.length > 0).length;
  document.getElementById("preview-stats").innerText = `${file.text.length} characters | ${wordCount} words`;

  // Toggle View Modal
  const modal = document.getElementById("preview-modal");
  const content = document.getElementById("preview-content");
  modal.classList.remove("pointer-events-none", "opacity-0", "invisible");
  modal.classList.add("visible");
  content.classList.remove("translate-y-4");
}

// ----------------------------------------------------
// 9. API DISPATCHER & INTEGRATIONS
// ----------------------------------------------------
async function handleSend() {
  const textarea = document.getElementById("chat-textarea");
  const rawPrompt = textarea.value.trim();
  if (!rawPrompt) return;

  // Verify Config Keys
  const prov = state.settings.provider;
  const activeKey = state.settings.apiKeys[prov];
  if (!activeKey) {
    alert("API Key is missing. Please click settings (Gear icon) to enter your key.");
    openSettingsPanel();
    return;
  }

  // Hide welcome
  document.getElementById("welcome-container").style.display = "none";

  const userMsgId = "msg_" + Date.now();
  const botMsgId = "msg_" + (Date.now() + 1);

  // Render User Message
  renderMessageBubble("user", rawPrompt, userMsgId);
  
  // Wipe textarea input
  textarea.value = "";
  autoResizeTextarea(textarea);

  // Update current chat storage structure
  const activeChat = state.conversations.find(c => c.id === state.activeChatId);
  if (activeChat) {
    // If the conversation is still named default "New Conversation", auto-name it based on prompt
    if (activeChat.title === "New Conversation") {
      activeChat.title = rawPrompt.substring(0, 30) + (rawPrompt.length > 30 ? "..." : "");
    }
    
    // Save current active configurations
    activeChat.objective = document.getElementById("input-objective").value;
    activeChat.persona = document.getElementById("select-persona").value;
    activeChat.mode = document.getElementById("select-interaction-mode").value;

    activeChat.messages.push({ role: "user", content: rawPrompt, id: userMsgId });
    saveStateToStorage();
    renderHistory();
  }

  // Trigger loading spinner
  renderLoadingBubble(botMsgId);

  try {
    const systemPrompt = compileSystemPrompt(activeChat);
    const responseText = await queryLLM(rawPrompt, activeChat.messages, systemPrompt);
    
    // Remove loading indicator
    removeLoadingBubble();

    // Render Response
    renderMessageBubble("model", responseText, botMsgId);

    // Save Bot Response
    if (activeChat) {
      activeChat.messages.push({ role: "model", content: responseText, id: botMsgId });
      saveStateToStorage();
    }

    // Auto scroll bottom
    const stream = document.getElementById("message-stream-container");
    stream.scrollTop = stream.scrollHeight;

  } catch (err) {
    removeLoadingBubble();
    console.error("API error", err);
    renderMessageBubble("model", `⚠️ **API Execution Error**: ${err.message}`, botMsgId);
  }
}

function compileSystemPrompt(chat) {
  const objective = document.getElementById("input-objective").value || "General Purpose";
  const personaKey = document.getElementById("select-persona").value;
  const modeKey = document.getElementById("select-interaction-mode").value;

  const personaInstruction = PERSONAS[personaKey] || PERSONAS.developer;
  const modeInstruction = INTERACTION_MODES[modeKey] || INTERACTION_MODES.markdown;

  let fullPrompt = `You are playing the role of this expert persona:\n"${personaInstruction}"\n\n`;
  fullPrompt += `Current Workspace Goal/Objective:\n"${objective}"\n\n`;
  fullPrompt += `Behavior & Output Format Rules:\n${modeInstruction}\n\n`;
  fullPrompt += `Strict Constraint: Return all code snippets properly labeled with their coding language and fully detailed.`;

  return fullPrompt;
}

async function queryLLM(newPrompt, history, systemPrompt) {
  const settings = state.settings;
  
  // Format Context References
  let formattedContext = "";
  if (state.attachedFiles.length > 0) {
    formattedContext = "\n\n--- FILE CONTEXT REFERENCE ---\n";
    state.attachedFiles.forEach(file => {
      formattedContext += `\n[Filename: ${file.name} | Type: ${file.type}]\n`;
      formattedContext += "```\n" + file.text + "\n```\n";
    });
    formattedContext += "-------------------------------\n";
  }

  const promptWithContext = newPrompt + formattedContext;

  if (settings.provider === "gemini") {
    // ----------------------------------------------------
    // GEMINI CALL IMPLEMENTATION
    // ----------------------------------------------------
    const endpoint = `${settings.baseUrl}/v1beta/models/${settings.model}:generateContent?key=${settings.apiKeys.gemini}`;
    
    // Map standard roles: user -> user, assistant/model -> model
    const contents = [];
    
    // Build Gemini History (Last 10 messages for memory optimization)
    const contextHistory = history.slice(0, -1); // exclude current user message
    contextHistory.forEach(msg => {
      contents.push({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }]
      });
    });

    // Add current user prompt with injected file contexts
    contents.push({
      role: "user",
      parts: [{ text: promptWithContext }]
    });

    const payload = {
      contents: contents,
      generationConfig: {
        temperature: parseFloat(settings.temperature)
      }
    };

    if (systemPrompt) {
      payload.systemInstruction = {
        parts: [{ text: systemPrompt }]
      };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const message = errJson?.error?.message || response.statusText;
      throw new Error(`Gemini API: ${message}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;

  } else {
    // ----------------------------------------------------
    // OPENAI CALL IMPLEMENTATION
    // ----------------------------------------------------
    // Support relative paths/base URLs cleanly
    let cleanBaseUrl = settings.baseUrl.trim();
    if (cleanBaseUrl.endsWith("/")) cleanBaseUrl = cleanBaseUrl.slice(0, -1);
    
    // If the base URL was set to generic openai.com, auto-resolve it to official gateway
    if (cleanBaseUrl.includes("openai.com") && !cleanBaseUrl.includes("api.openai.com")) {
      cleanBaseUrl = "https://api.openai.com";
    }

    const endpoint = `${cleanBaseUrl}/v1/chat/completions`;
    
    // Compile messages list
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }

    // Add conversation history
    const contextHistory = history.slice(0, -1);
    contextHistory.forEach(msg => {
      messages.push({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content
      });
    });

    // Add current prompt
    messages.push({
      role: "user",
      content: promptWithContext
    });

    const payload = {
      model: settings.model,
      messages: messages,
      temperature: parseFloat(settings.temperature)
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.apiKeys.openai}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const message = errJson?.error?.message || response.statusText;
      throw new Error(`OpenAI API: ${message}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }
}

// ----------------------------------------------------
// 10. ELEMENT GENERATOR & INTERFACES (BUBBLES & ACTIONS)
// ----------------------------------------------------
function renderMessageBubble(role, content, id) {
  const container = document.getElementById("message-stream-container");
  const bubble = document.createElement("div");
  bubble.id = id;
  
  const isUser = role === "user";
  const bgClass = isUser ? "bg-accent/15 border-accent/25 text-slate-100" : "bg-cybercard border-glassborder text-slate-200";
  const alignmentClass = isUser ? "ml-auto" : "mr-auto";
  const userBorder = isUser ? "border-indigo-500/20" : "border-glassborder";

  // HTML content parse (Safe library execution)
  let parsedHtml = content;
  if (!isUser) {
    if (typeof marked !== 'undefined') {
      parsedHtml = marked.parse(content);
    } else {
      parsedHtml = escapeHtml(content).replace(/\n/g, '<br>');
    }
  } else {
    // For User messages, escape HTML tags to prevent injections, but preserve newlines
    parsedHtml = escapeHtml(content).replace(/\n/g, '<br>');
  }

  bubble.className = `max-w-3xl ${alignmentClass} flex flex-col space-y-2 animate-fade-in`;
  bubble.innerHTML = `
    <div class="flex items-center space-x-2 text-[10px] text-slate-500 font-semibold px-2 ${isUser ? 'justify-end' : 'justify-start'}">
      <i class="fa-solid ${isUser ? 'fa-user text-indigo-400' : 'fa-wand-magic-sparkles text-accent'}"></i>
      <span>${isUser ? 'You' : 'Assistant'}</span>
    </div>
    
    <div class="p-4 rounded-2xl border ${bgClass} shadow-xl relative leading-relaxed overflow-x-auto">
      <div class="markdown-content text-sm prose prose-invert max-w-none">${parsedHtml}</div>
    </div>
    
    <!-- Action Utility Bar -->
    <div class="flex items-center space-x-3 px-2 text-xs font-medium text-slate-500 ${isUser ? 'justify-end' : 'justify-start'}">
      <button onclick="copyMessageText('${id}')" class="hover:text-indigo-400 flex items-center space-x-1.5 transition">
        <i class="fa-regular fa-copy"></i>
        <span>Copy</span>
      </button>
      <span class="text-slate-700">|</span>
      <button onclick="exportMessageText('${id}', '${role}')" class="hover:text-indigo-400 flex items-center space-x-1.5 transition" title="Save as .md file">
        <i class="fa-regular fa-file-lines"></i>
        <span>Export</span>
      </button>
    </div>
  `;

  container.appendChild(bubble);

  // Apply syntax highlight if Prism loaded
  if (window.Prism && !isUser) {
    Prism.highlightAllUnder(bubble);
    injectCodeBlockHeaders(bubble);
  }
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function injectCodeBlockHeaders(bubble) {
  const preBlocks = bubble.querySelectorAll("pre");
  preBlocks.forEach((pre) => {
    // Avoid double header injections
    if (pre.previousElementSibling && pre.previousElementSibling.classList.contains("code-header")) return;

    const code = pre.querySelector("code");
    let lang = "Code";
    if (code) {
      const match = code.className.match(/language-(\w+)/);
      if (match) lang = match[1].toUpperCase();
    }

    const header = document.createElement("div");
    header.className = "code-header flex items-center justify-between bg-slate-950 border border-b-0 border-glassborder/80 px-4 py-2 rounded-t-lg text-xs font-bold font-mono text-slate-400 mt-2";
    header.innerHTML = `
      <span class="flex items-center space-x-2">
        <i class="fa-solid fa-code text-[10px] text-indigo-400"></i>
        <span>${lang}</span>
      </span>
      <button onclick="copyCodeSnippet(this)" class="hover:text-white transition flex items-center space-x-1 font-semibold">
        <i class="fa-regular fa-copy"></i>
        <span>Copy snippet</span>
      </button>
    `;
    
    // Style adjustments to pre block (make it match rounded bottoms)
    pre.style.borderTopLeftRadius = "0px";
    pre.style.borderTopRightRadius = "0px";
    pre.style.marginTop = "0px";

    pre.parentNode.insertBefore(header, pre);
  });
}

function copyCodeSnippet(button) {
  const pre = button.parentNode.nextElementSibling;
  if (!pre || pre.tagName !== "PRE") return;
  const code = pre.querySelector("code");
  const rawText = code ? code.innerText : pre.innerText;

  navigator.clipboard.writeText(rawText).then(() => {
    const label = button.querySelector("span");
    const icon = button.querySelector("i");
    
    label.innerText = "Copied!";
    icon.className = "fa-solid fa-check text-green-400";
    
    setTimeout(() => {
      label.innerText = "Copy snippet";
      icon.className = "fa-regular fa-copy";
    }, 1500);
  });
}

function renderLoadingBubble(id) {
  const container = document.getElementById("message-stream-container");
  const bubble = document.createElement("div");
  bubble.id = "active-loading-indicator";
  bubble.className = "max-w-2xl mr-auto flex flex-col space-y-2 animate-fade-in";
  bubble.innerHTML = `
    <div class="flex items-center space-x-2 text-[10px] text-slate-500 font-semibold px-2">
      <i class="fa-solid fa-wand-magic-sparkles text-accent"></i>
      <span>Assistant is typing...</span>
    </div>
    <div class="p-4 bg-cybercard border border-glassborder rounded-2xl shadow-xl flex items-center space-x-1">
      <span class="typing-dot w-2 h-2 rounded-full bg-indigo-400"></span>
      <span class="typing-dot w-2 h-2 rounded-full bg-indigo-400"></span>
      <span class="typing-dot w-2 h-2 rounded-full bg-indigo-400"></span>
    </div>
  `;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

function removeLoadingBubble() {
  const loader = document.getElementById("active-loading-indicator");
  if (loader) loader.remove();
}

function showInlineSpinner(label) {
  const loaderId = "inline-spinner-div";
  if (document.getElementById(loaderId)) return;

  const btnSubmit = document.getElementById("btn-submit");
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin text-sm"></i>`;
}

function hideInlineSpinner() {
  const btnSubmit = document.getElementById("btn-submit");
  btnSubmit.disabled = false;
  btnSubmit.innerHTML = `<i class="fa-solid fa-paper-plane text-sm"></i>`;
}

// ----------------------------------------------------
// 11. BUBBLE ACTIONS (COPY & EXPORT TO FILE)
// ----------------------------------------------------
function copyMessageText(id) {
  const chat = state.conversations.find(c => c.id === state.activeChatId);
  if (!chat) return;
  const msg = chat.messages.find(m => m.id === id);
  if (!msg) return;

  navigator.clipboard.writeText(msg.content).then(() => {
    alert("Message copied successfully to clipboard!");
  }).catch(err => {
    alert("Copy failed: " + err.message);
  });
}

function exportMessageText(id, role) {
  const chat = state.conversations.find(c => c.id === state.activeChatId);
  if (!chat) return;
  const msg = chat.messages.find(m => m.id === id);
  if (!msg) return;

  const blob = new Blob([msg.content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = `chat_${role}_response_${id.split('_').pop()}.md`;
  document.body.appendChild(a);
  a.click();
  
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ----------------------------------------------------
// 12. CONFIGURATION DRAWER MECHANICS
// ----------------------------------------------------
function openSettingsPanel() {
  const slideover = document.getElementById("settings-slideover");
  const backdrop = document.getElementById("settings-backdrop");
  const panel = document.getElementById("settings-panel");
  
  // Populate Fields
  const prov = state.settings.provider;
  document.getElementById("config-apikey").value = state.settings.apiKeys[prov] || "";
  document.getElementById("config-baseurl").value = state.settings.baseUrl;
  document.getElementById("config-temperature").value = state.settings.temperature;
  document.getElementById("temp-val-display").innerText = state.settings.temperature;

  loadSettingsModels(prov, state.settings.model);
  toggleProviderButtonStyles(prov);

  // Transitions
  slideover.classList.remove("pointer-events-none", "opacity-0", "invisible");
  slideover.classList.add("visible");
  backdrop.classList.add("opacity-100");
  panel.classList.remove("translate-x-full");
}

function closeSettingsPanel() {
  const slideover = document.getElementById("settings-slideover");
  const backdrop = document.getElementById("settings-backdrop");
  const panel = document.getElementById("settings-panel");

  slideover.classList.add("pointer-events-none", "opacity-0", "invisible");
  slideover.classList.remove("visible");
  backdrop.classList.remove("opacity-100");
  panel.classList.add("translate-x-full");
}

function loadSettingsModels(provider, activeModel) {
  const select = document.getElementById("config-model");
  select.innerHTML = "";

  const modelsList = PROVIDER_MODELS[provider]?.models || [];
  modelsList.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.innerText = m;
    if (m === activeModel) opt.selected = true;
    select.appendChild(opt);
  });
}

function toggleProviderButtonStyles(provider) {
  const btnGemini = document.getElementById("provider-gemini");
  const btnOpenai = document.getElementById("provider-openai");

  if (provider === "gemini") {
    btnGemini.className = "py-3 px-4 rounded-xl border border-accent bg-accent/10 text-white font-medium flex items-center justify-center space-x-2 transition duration-200";
    btnOpenai.className = "py-3 px-4 rounded-xl border border-glassborder bg-slate-900/40 text-slate-400 hover:text-slate-200 hover:border-slate-700 font-medium flex items-center justify-center space-x-2 transition duration-200";
  } else {
    btnOpenai.className = "py-3 px-4 rounded-xl border border-accent bg-accent/10 text-white font-medium flex items-center justify-center space-x-2 transition duration-200";
    btnGemini.className = "py-3 px-4 rounded-xl border border-glassborder bg-slate-900/40 text-slate-400 hover:text-slate-200 hover:border-slate-700 font-medium flex items-center justify-center space-x-2 transition duration-200";
  }
}

function saveSettings() {
  const provider = state.settings.provider; // Selected via buttons
  const model = document.getElementById("config-model").value;
  const baseUrl = document.getElementById("config-baseurl").value;
  const key = document.getElementById("config-apikey").value;
  const temp = document.getElementById("config-temperature").value;

  // Save current active key
  state.settings.apiKeys[provider] = key;
  state.settings.model = model;
  state.settings.baseUrl = baseUrl;
  state.settings.temperature = parseFloat(temp);

  saveStateToStorage();
  updateHeaderStatus();
  closeSettingsPanel();
}

function updateHeaderStatus() {
  document.getElementById("header-provider").innerText = state.settings.provider;
  document.getElementById("header-model").innerText = state.settings.model;

  const keySet = state.settings.apiKeys[state.settings.provider];
  const badge = document.getElementById("api-status-badge");
  
  if (keySet) {
    badge.className = "flex items-center space-x-1.5 text-emerald-400 font-medium";
    badge.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
      <span>Connected</span>
    `;
    
    const welcomeAlert = document.getElementById("welcome-config-alert");
    if (welcomeAlert) welcomeAlert.style.display = "none";
  } else {
    badge.className = "flex items-center space-x-1.5 text-rose-400 font-medium";
    badge.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
      <span>Unconfigured</span>
    `;
    
    const welcomeAlert = document.getElementById("welcome-config-alert");
    if (welcomeAlert) welcomeAlert.style.display = "flex";
  }
}

// ----------------------------------------------------
// 13. UI & EVENT HANDLERS BINDINGS
// ----------------------------------------------------
function autoResizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = (textarea.scrollHeight) + "px";
}

window.onload = function() {
  try {
    // 1. Initialize State & Configurations safely
    loadStateFromStorage();
  } catch (e) {
    console.error("Failed to load state from storage:", e);
  }

  try {
    initSpeechRecognition();
  } catch (e) {
    console.error("Failed to initialize speech recognition:", e);
  }

  // Helper Binders
  function safeBindClick(id, handler) {
    const el = document.getElementById(id);
    if (el) {
      el.onclick = handler;
    } else {
      console.warn(`Could not bind click handler to element with ID "${id}" - not found.`);
    }
  }

  function safeBindEvent(id, eventName, handler) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener(eventName, handler);
    } else {
      console.warn(`Could not bind event "${eventName}" to element with ID "${id}" - not found.`);
    }
  }

  // 2. Main Textarea Expanding Event Listener
  const textarea = document.getElementById("chat-textarea");
  if (textarea) {
    textarea.addEventListener("input", function() {
      autoResizeTextarea(this);
    });

    textarea.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
  }

  // 3. Floating submit button
  safeBindClick("btn-submit", handleSend);

  // 4. New chat trigger button
  safeBindClick("btn-new-chat", createNewChat);

  // 5. Drawer mechanics
  safeBindClick("btn-settings-trigger", openSettingsPanel);
  safeBindClick("btn-quick-settings", openSettingsPanel);
  safeBindClick("btn-close-settings", closeSettingsPanel);
  safeBindClick("settings-backdrop", closeSettingsPanel);

  // 6. Settings action items
  safeBindClick("btn-settings-save", saveSettings);
  safeBindClick("btn-settings-reset", () => {
    if (confirm("Reset configuration settings to default templates?")) {
      state.settings = { ...DEFAULT_CONFIG };
      saveStateToStorage();
      openSettingsPanel(); // re-load values
    }
  });

  // Provider button click handlers inside settings form
  safeBindClick("provider-gemini", () => {
    state.settings.provider = "gemini";
    const baseurlInput = document.getElementById("config-baseurl");
    if (baseurlInput) baseurlInput.value = PROVIDER_MODELS.gemini.defaultUrl;
    const apikeyInput = document.getElementById("config-apikey");
    if (apikeyInput) apikeyInput.value = state.settings.apiKeys.gemini || "";
    loadSettingsModels("gemini", PROVIDER_MODELS.gemini.models[0]);
    toggleProviderButtonStyles("gemini");
  });

  safeBindClick("provider-openai", () => {
    state.settings.provider = "openai";
    const baseurlInput = document.getElementById("config-baseurl");
    if (baseurlInput) baseurlInput.value = PROVIDER_MODELS.openai.defaultUrl;
    const apikeyInput = document.getElementById("config-apikey");
    if (apikeyInput) apikeyInput.value = state.settings.apiKeys.openai || "";
    loadSettingsModels("openai", PROVIDER_MODELS.openai.models[0]);
    toggleProviderButtonStyles("openai");
  });

  // API Key show/hide toggle
  safeBindClick("toggle-key-visibility", function() {
    const input = document.getElementById("config-apikey");
    if (input) {
      if (input.type === "password") {
        input.type = "text";
        this.innerText = "Hide Key";
      } else {
        input.type = "password";
        this.innerText = "Show Key";
      }
    }
  });

  // Temperature range display
  const tempInput = document.getElementById("config-temperature");
  if (tempInput) {
    tempInput.addEventListener("input", function() {
      const display = document.getElementById("temp-val-display");
      if (display) display.innerText = this.value;
    });
  }

  // 7. Context document modal view closer
  safeBindClick("btn-close-preview", () => {
    const modal = document.getElementById("preview-modal");
    if (modal) {
      modal.classList.add("pointer-events-none", "opacity-0", "invisible");
      modal.classList.remove("visible");
    }
    const content = document.getElementById("preview-content");
    if (content) content.classList.add("translate-y-4");
  });

  safeBindClick("preview-backdrop", () => {
    const modal = document.getElementById("preview-modal");
    if (modal) {
      modal.classList.add("pointer-events-none", "opacity-0", "invisible");
      modal.classList.remove("visible");
    }
    const content = document.getElementById("preview-content");
    if (content) content.classList.add("translate-y-4");
  });

  safeBindClick("btn-copy-preview", () => {
    const textEl = document.getElementById("preview-body");
    if (textEl) {
      navigator.clipboard.writeText(textEl.innerText).then(() => {
        alert("Extracted context text copied successfully!");
      });
    }
  });

  // 8. Multi-modal inputs triggers
  safeBindClick("btn-attach", () => {
    const uploader = document.getElementById("file-uploader");
    if (uploader) uploader.click();
  });

  const uploader = document.getElementById("file-uploader");
  if (uploader) {
    uploader.onchange = function(e) {
      if (e.target.files.length > 0) {
        handleFileSelection(e.target.files);
        e.target.value = ""; // Reset
      }
    };
  }

  safeBindClick("btn-clear-attachments", () => {
    state.attachedFiles = [];
    renderAttachedFiles();
  });

  safeBindClick("btn-microphone", toggleMicrophone);

  // 9. Synchronize values from Dropdowns to active state
  const personaSelect = document.getElementById("select-persona");
  if (personaSelect) {
    personaSelect.onchange = function() {
      const chat = state.conversations.find(c => c.id === state.activeChatId);
      if (chat) {
        chat.persona = this.value;
        saveStateToStorage();
        renderHistory();
      }
    };
  }

  const modeSelect = document.getElementById("select-interaction-mode");
  if (modeSelect) {
    modeSelect.onchange = function() {
      const chat = state.conversations.find(c => c.id === state.activeChatId);
      if (chat) {
        chat.mode = this.value;
        saveStateToStorage();
      }
    };
  }

  const objectiveInput = document.getElementById("input-objective");
  if (objectiveInput) {
    objectiveInput.oninput = function() {
      const chat = state.conversations.find(c => c.id === state.activeChatId);
      if (chat) {
        chat.objective = this.value;
        saveStateToStorage();
      }
    };
  }
};
