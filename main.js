document.addEventListener('DOMContentLoaded', () => {
    // ──────────────────────────────────────────
    // CONFIGURATION
    // ──────────────────────────────────────────
    const API_URL = 'http://127.0.0.1:5000/api';
    let authToken = localStorage.getItem('authToken');
    let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

    // DOM Elements
    const messageContainer = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const typingStatus = document.querySelector('.typing-status');
    const themeToggle = document.getElementById('theme-toggle');
    const historyList = document.getElementById('history-list');
    const newChatBtn = document.getElementById('new-chat-btn');

    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const systemPromptInput = document.getElementById('system-prompt-input');
    const modelSelect = document.getElementById('model-select');

    const themeSelect = document.getElementById('theme-select');
    const fontSizeSelect = document.getElementById('font-size-select');
    const enterToSendToggle = document.getElementById('enter-to-send-toggle');
    const showTimestampsToggle = document.getElementById('show-timestamps-toggle');
    const clearChatsBtn = document.getElementById('clear-chats-btn');
    const attachmentBtn = document.getElementById('attachment-btn');
    const imageUpload = document.getElementById('image-upload');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imagePreview = document.getElementById('image-preview');
    const removeImageBtn = document.getElementById('remove-image-btn');

    // Auth elements
    const authOverlay = document.getElementById('auth-overlay');
    const authTitle = document.getElementById('auth-title');
    const authEmail = document.getElementById('auth-email');
    const authPassword = document.getElementById('auth-password');
    const authUsername = document.getElementById('auth-username-group');
    const authUsernameInput = document.getElementById('auth-username');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authToggleBtn = document.getElementById('auth-toggle-btn');
    const authError = document.getElementById('auth-error');
    const profileName = document.querySelector('.profile-name');
    const logoutBtn = document.getElementById('logout-btn');

    let isLoginMode = true;
    let selectedImageBase64 = null;
    let mermaidTheme = null;
    let mermaidRenderSequence = 0;
    let currentSessionId = null;

    // ──────────────────────────────────────────
    // SETTINGS
    // ──────────────────────────────────────────

    let settings = {
        systemPrompt: '',
        preferredModel: 'gemini',
        theme: 'dark',
        fontSize: '15px',
        enterToSend: true,
        showTimestamps: true
    };


    function loadSettings() {
        const saved = localStorage.getItem('chat_settings');
        if (saved) {
            settings = { ...settings, ...JSON.parse(saved) };
        }
        if (systemPromptInput) systemPromptInput.value = settings.systemPrompt;
        if (modelSelect) modelSelect.value = settings.preferredModel || 'gemini';
        if (themeSelect) themeSelect.value = settings.theme;
        if (fontSizeSelect) fontSizeSelect.value = settings.fontSize;
        if (enterToSendToggle) enterToSendToggle.checked = settings.enterToSend;
        if (showTimestampsToggle) showTimestampsToggle.checked = settings.showTimestamps;

        applyVisualSettings();
    }

    function saveSettings() {
        settings = {
            systemPrompt: systemPromptInput ? systemPromptInput.value : '',
            preferredModel: modelSelect ? modelSelect.value : 'gemini',
            theme: themeSelect ? themeSelect.value : 'dark',
            fontSize: fontSizeSelect ? fontSizeSelect.value : '15px',
            enterToSend: enterToSendToggle ? enterToSendToggle.checked : true,
            showTimestamps: showTimestampsToggle ? showTimestampsToggle.checked : true
        };

        localStorage.setItem('chat_settings', JSON.stringify(settings));
        applyVisualSettings();
    }

    function applyVisualSettings() {
        const previousTheme = document.documentElement.getAttribute('data-theme');

        if (settings.theme === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
            document.documentElement.setAttribute('data-theme', settings.theme);
        }

        document.documentElement.style.setProperty('--font-size-base', settings.fontSize);
        document.body.classList.toggle('hide-timestamps', !settings.showTimestamps);

        const currentTheme = document.documentElement.getAttribute('data-theme');
        if (previousTheme !== currentTheme) {
            initializeMermaid(true);
            rerenderBotMessages();
        }

        // Update active model badge
        const activeModelBadge = document.getElementById('active-model-badge');
        if (activeModelBadge) {
            const modelNames = {
                'gemini': 'Gemini 2.0',
                'claude': 'Claude 3.5',
                'openai': 'GPT-4',
                'gemma': 'Gemma 4'
            };
            activeModelBadge.textContent = modelNames[settings.preferredModel] || 'Gemini 2.0';
        }
    }

    // Modal Events
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            settingsModal.style.display = 'flex';
        });
    }

    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => {
            settingsModal.style.display = 'none';
            saveSettings();
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
            saveSettings();
        }
    });

    // ──────────────────────────────────────────
    // AUTHENTICATION
    // ──────────────────────────────────────────

    function showAuth() {
        if (authOverlay) authOverlay.style.display = 'flex';
    }

    function hideAuth() {
        if (authOverlay) authOverlay.style.display = 'none';
    }

    function toggleAuthMode() {
        isLoginMode = !isLoginMode;
        if (authTitle) authTitle.textContent = isLoginMode ? 'Welcome Back' : 'Create Account';
        if (authSubmitBtn) authSubmitBtn.textContent = isLoginMode ? 'Sign In' : 'Sign Up';
        if (authToggleBtn) authToggleBtn.innerHTML = isLoginMode
            ? "Don't have an account? <strong>Sign Up</strong>"
            : "Already have an account? <strong>Sign In</strong>";
        if (authUsername) authUsername.style.display = isLoginMode ? 'none' : 'block';
        if (authError) authError.style.display = 'none';
    }

    if (authToggleBtn) {
        authToggleBtn.addEventListener('click', toggleAuthMode);
    }

    if (authSubmitBtn) {
        authSubmitBtn.addEventListener('click', handleAuth);
    }

    const guestLoginBtn = document.getElementById('guest-login-btn');
    if (guestLoginBtn) {
        guestLoginBtn.addEventListener('click', async () => {
            try {
                const response = await fetch(`${API_URL}/auth/guest`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!response.ok) throw new Error('Guest login failed');

                const data = await response.json();
                if (data.access_token) {
                    authToken = data.access_token;
                    currentUser = data.user;
                    localStorage.setItem('authToken', authToken);
                    localStorage.setItem('currentUser', JSON.stringify(currentUser));
                    hideAuth();
                    initializeApp();
                }
            } catch (error) {
                showAuthError("Can't connect to server. Check your backend.");
            }
        });
    }

    // Allow Enter to submit auth form
    [authEmail, authPassword, authUsernameInput].forEach(el => {
        if (el) {
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') handleAuth();
            });
        }
    });

    async function handleAuth() {
        const email = authEmail ? authEmail.value.trim() : '';
        const password = authPassword ? authPassword.value.trim() : '';
        const username = authUsernameInput ? authUsernameInput.value.trim() : '';

        if (!email || !password) {
            showAuthError('Please enter email and password');
            return;
        }

        authSubmitBtn.disabled = true;
        authSubmitBtn.textContent = 'Loading...';

        try {
            const endpoint = isLoginMode ? '/auth/login' : '/auth/register';
            const body = isLoginMode
                ? { email, password }
                : { email, password, username: username || email.split('@')[0] };

            const response = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Authentication failed');
            }

            if (data.access_token) {
                authToken = data.access_token;
                currentUser = data.user;
                localStorage.setItem('authToken', authToken);
                localStorage.setItem('currentUser', JSON.stringify(currentUser));

                hideAuth();
                initializeApp();
            }
        } catch (error) {
            showAuthError(error.message);
        } finally {
            authSubmitBtn.disabled = false;
            authSubmitBtn.textContent = isLoginMode ? 'Sign In' : 'Sign Up';
        }
    }

    function showAuthError(message) {
        if (authError) {
            authError.textContent = message;
            authError.style.display = 'block';
        }
    }

    function logout() {
        authToken = null;
        currentUser = null;
        currentSessionId = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        messageContainer.innerHTML = '';
        if (historyList) historyList.innerHTML = '';
        showAuth();
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // Helper for authenticated API calls
    async function apiFetch(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers
        });

        if (response.status === 401 || response.status === 403) {
            logout();
            throw new Error('Session expired. Please log in again.');
        }

        return response;
    }

    // ──────────────────────────────────────────
    // CLEAR CHATS
    // ──────────────────────────────────────────

    if (clearChatsBtn) {
        clearChatsBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to delete all conversations? This cannot be undone.')) {
                try {
                    await apiFetch('/chat/sessions', { method: 'DELETE' });
                    currentSessionId = null;
                    messageContainer.innerHTML = '';
                    loadSidebar();
                    addMessage("Hello! I'm IntelliChat. How can I help you today?", 'bot');
                } catch (err) {
                    console.error('Error clearing chats:', err);
                    alert('Failed to clear chats: ' + err.message);
                }
            }
        });
    }

    loadSettings();

    // Image Attachment Logic
    if (attachmentBtn) attachmentBtn.addEventListener('click', () => imageUpload.click());

    if (imageUpload) {
        imageUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    selectedImageBase64 = event.target.result;
                    imagePreview.src = selectedImageBase64;
                    imagePreviewContainer.style.display = 'flex';
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (removeImageBtn) {
        removeImageBtn.addEventListener('click', () => {
            selectedImageBase64 = null;
            imagePreview.src = '';
            imagePreviewContainer.style.display = 'none';
            imageUpload.value = '';
        });
    }

    // Theme Toggle (legacy)
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            themeSelect.value = newTheme;
            saveSettings();
        });
    }

    // ──────────────────────────────────────────
    // MARKDOWN / MERMAID / HIGHLIGHTING
    // ──────────────────────────────────────────

    if (window.marked) {
        const markedOptions = {
            breaks: true,
            gfm: true
        };
        
        if (window.hljs) {
            // Newer marked versions use extensions or don't support highlight in setOptions
            // but for compatibility with older ones:
            if (typeof marked.setOptions === 'function') {
                marked.setOptions({
                    ...markedOptions,
                    highlight: function (codeOrObj, language) {
                        let code = typeof codeOrObj === 'object' ? codeOrObj.text : codeOrObj;
                        let lang = typeof codeOrObj === 'object' ? (codeOrObj.lang || codeOrObj.language) : language;
                        
                        if (lang === 'mermaid') return code;
                        if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
                        return hljs.highlightAuto(code).value;
                    }
                });
            }
        } else if (typeof marked.setOptions === 'function') {
            marked.setOptions(markedOptions);
        }
    }

    function escapeHtml(value) {
        if (!value) return '';
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function isMermaidStartLine(line) {
        const startLine = (line || '').trim();
        if (!startLine) return false;
        const patterns = [
            /^graph(?:\s+(?:TB|BT|RL|LR|TD))?\b/i, /^flowchart\b/i, /^sequenceDiagram\b/i,
            /^classDiagram\b/i, /^stateDiagram(?:-v2)?\b/i, /^erDiagram\b/i, /^journey\b/i,
            /^gantt\b/i, /^pie\b/i, /^mindmap\b/i, /^timeline\b/i, /^gitGraph\b/i,
            /^quadrantChart\b/i, /^requirementDiagram\b/i, /^C4(?:Context|Container|Component|Dynamic|Deployment)\b/i
        ];
        return patterns.some((p) => p.test(startLine));
    }

    function extractImplicitMermaidFromParagraph(paragraphEl) {
        if (!paragraphEl) return null;
        const rawText = (paragraphEl.innerText || '').replace(/\r/g, '').replace(/\u00a0/g, ' ');
        if (!rawText.trim()) return null;
        const lines = rawText.split('\n').map((l) => l.replace(/\s+$/g, ''));
        while (lines.length && !lines[0].trim()) lines.shift();
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
        if (lines.length < 2) return null;
        let labelLine = null;
        let firstLine = lines[0].trim();
        if (/mermaid/i.test(firstLine) && lines[1] && isMermaidStartLine(lines[1].trim())) {
            labelLine = lines.shift().trim();
            firstLine = lines[0] ? lines[0].trim() : '';
        }
        if (!isMermaidStartLine(firstLine)) return null;
        const hasDiagramSignal = lines.slice(1).some((l) => /(-->|==>|--|::|:|[\[\]{}()|])/g.test(l));
        if (!hasDiagramSignal) return null;
        return { source: lines.join('\n').trim(), labelLine };
    }

    function getActiveTheme() {
        return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }

    function initializeMermaid(force = false) {
        if (!window.mermaid) return false;
        const activeTheme = getActiveTheme();
        if (!force && mermaidTheme === activeTheme) return true;
        window.mermaid.initialize({ startOnLoad: false, theme: activeTheme === 'light' ? 'default' : 'dark', securityLevel: 'loose', suppressErrorRendering: true });
        mermaidTheme = activeTheme;
        return true;
    }

    function highlightCodeBlocks(scopeEl) {
        if (!window.hljs || !scopeEl) return;
        scopeEl.querySelectorAll('pre code').forEach((block) => {
            if (block.classList.contains('language-mermaid') || block.classList.contains('lang-mermaid')) return;
            hljs.highlightElement(block);
        });
    }

    async function renderMermaidDiagrams(scopeEl) {
        if (!scopeEl || !initializeMermaid()) return;
        const renderItems = [];
        scopeEl.querySelectorAll('pre code.language-mermaid, pre code.lang-mermaid, pre code[class*="language-mermaid"]').forEach((codeBlock) => {
            const preBlock = codeBlock.closest('pre');
            if (!preBlock) return;
            const source = codeBlock.textContent.trim();
            if (!source) return;
            renderItems.push({ source, targetEl: preBlock });
        });
        scopeEl.querySelectorAll('.message-text p').forEach((paragraphEl) => {
            const detected = extractImplicitMermaidFromParagraph(paragraphEl);
            if (!detected || !detected.source) return;
            if (detected.labelLine) {
                paragraphEl.textContent = detected.labelLine;
                const placeholder = document.createElement('div');
                paragraphEl.insertAdjacentElement('afterend', placeholder);
                renderItems.push({ source: detected.source, targetEl: placeholder });
                return;
            }
            renderItems.push({ source: detected.source, targetEl: paragraphEl });
        });
        if (renderItems.length === 0) return;
        const tasks = renderItems.map(async ({ source, targetEl }) => {
            if (!targetEl || !targetEl.isConnected) return;
            const wrapper = document.createElement('div');
            wrapper.className = 'mermaid-wrapper';
            const diagramHost = document.createElement('div');
            diagramHost.className = 'mermaid-diagram';
            wrapper.appendChild(diagramHost);
            targetEl.replaceWith(wrapper);
            const renderId = `mermaid-${Date.now()}-${++mermaidRenderSequence}`;
            try {
                const { svg, bindFunctions } = await window.mermaid.render(renderId, source);
                diagramHost.innerHTML = svg;
                if (typeof bindFunctions === 'function') bindFunctions(diagramHost);
            } catch (error) {
                console.warn('Mermaid render failed', error);
                wrapper.classList.add('mermaid-error');
                wrapper.innerHTML = `<pre><code class="language-mermaid">${escapeHtml(source)}</code></pre>`;
            }
        });
        await Promise.allSettled(tasks);
        highlightCodeBlocks(scopeEl);
    }

    function renderBotMessage(messageDiv, text, options = {}) {
        if (!messageDiv) return;
        const { renderMermaid = true } = options;
        const contentDiv = messageDiv.querySelector('.message-text');
        if (!contentDiv) return;
        const contentText = String(text || '');
        contentDiv.innerHTML = window.marked ? marked.parse(contentText) : contentText;
        highlightCodeBlocks(messageDiv);
        if (renderMermaid) void renderMermaidDiagrams(messageDiv);
    }

    function rerenderBotMessages() {
        const botMessages = messageContainer.querySelectorAll('.message.bot[data-raw-bot-text]');
        botMessages.forEach((messageDiv) => {
            renderBotMessage(messageDiv, messageDiv.dataset.rawBotText || '', { renderMermaid: true });
        });
    }

    initializeMermaid();

    // ──────────────────────────────────────────
    // MESSAGE DISPLAY
    // ──────────────────────────────────────────

    function addMessage(text, role = 'user', imageUrl = null, id = null, options = {}) {
        let messageDiv = id ? document.getElementById(id) : null;
        if (!messageDiv) {
            messageDiv = document.createElement('div');
            messageDiv.className = `message ${role}`;
            if (id) messageDiv.id = id;
            messageContainer.appendChild(messageDiv);
        }
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const { renderMermaid = true } = options;
        const isBot = role === 'bot';
        const safeText = String(text || '');
        const formattedText = isBot && safeText && window.marked ? marked.parse(safeText) : safeText;
        let imageHtml = '';
        if (imageUrl) imageHtml = `<img src="${imageUrl}" class="message-image" alt="Uploaded image">`;

        messageDiv.innerHTML = `
            <div class="message-content">
                ${imageHtml}
                ${formattedText ? `<div class="message-text">${formattedText}</div>` : '<div class="message-text"></div>'}
                <span class="timestamp">${timestamp}</span>
            </div>
        `;

        if (isBot) {
            messageDiv.dataset.rawBotText = text || '';
            highlightCodeBlocks(messageDiv);
            if (renderMermaid) void renderMermaidDiagrams(messageDiv);
        }
        messageContainer.scrollTop = messageContainer.scrollHeight;
        return messageDiv;
    }

    function showTyping() {
        typingStatus.textContent = 'Thinking...';
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot typing';
        typingDiv.id = 'typing-indicator';
        typingDiv.innerHTML = `<div class="message-content"><div class="typing-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>`;
        messageContainer.appendChild(typingDiv);
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }

    function hideTyping() {
        typingStatus.textContent = 'Ready to assist';
        const typingDiv = document.getElementById('typing-indicator');
        if (typingDiv) typingDiv.remove();
    }

    // ──────────────────────────────────────────
    // SIDEBAR (backend-backed)
    // ──────────────────────────────────────────

    async function loadSidebar() {
        if (!historyList || !authToken) return;

        try {
            const response = await apiFetch('/chat/sessions');
            if (!response.ok) return;
            const sessions = await response.json();

            historyList.innerHTML = '';
            sessions.forEach(session => {
                const item = document.createElement('div');
                item.className = `history-item ${session.id === currentSessionId ? 'active' : ''}`;

                const titleDiv = document.createElement('div');
                titleDiv.className = 'history-title';
                titleDiv.textContent = session.title || 'New Chat';

                const snippetDiv = document.createElement('div');
                snippetDiv.className = 'history-snippet';
                snippetDiv.textContent = new Date(session.created_at).toLocaleDateString();

                item.appendChild(titleDiv);
                item.appendChild(snippetDiv);
                item.onclick = () => switchSession(session.id);
                historyList.appendChild(item);
            });
        } catch (err) {
            console.error('Error loading sidebar:', err);
        }
    }

    async function switchSession(id) {
        if (currentSessionId === id) return;
        currentSessionId = id;
        messageContainer.innerHTML = '';

        try {
            const response = await apiFetch(`/chat/sessions/${id}/messages`);
            if (!response.ok) return;
            const messages = await response.json();

            messages.forEach(msg => {
                addMessage(msg.content, msg.role === 'assistant' ? 'bot' : 'user');
            });
        } catch (err) {
            console.error('Error loading messages:', err);
        }

        loadSidebar();
    }

    if (newChatBtn) {
        newChatBtn.addEventListener('click', async () => {
            if (!authToken) return showAuth();

            try {
                const response = await apiFetch('/chat/sessions', {
                    method: 'POST',
                    body: JSON.stringify({ title: 'New Chat' })
                });

                if (!response.ok) throw new Error('Failed to create session');
                const session = await response.json();

                currentSessionId = session.id;
                messageContainer.innerHTML = '';
                addMessage("Hello! I'm IntelliChat. How can I help you today?", 'bot');
                loadSidebar();
            } catch (err) {
                console.error('Error creating session:', err);
                alert('Failed to create new chat: ' + err.message);
            }
        });
    }

    // ──────────────────────────────────────────
    // AI RESPONSE (streaming via backend)
    // ──────────────────────────────────────────

    async function fetchAIResponse(userMsg, imageBase64 = null) {
        showTyping();

        try {
            if (!authToken) throw new Error('Please log in first.');

            // Create session if none exists
            if (!currentSessionId) {
                const sessionRes = await apiFetch('/chat/sessions', {
                    method: 'POST',
                    body: JSON.stringify({ title: userMsg.substring(0, 50) || 'New Chat' })
                });
                if (!sessionRes.ok) throw new Error('Failed to create chat session');
                const session = await sessionRes.json();
                currentSessionId = session.id;
            }

            // Clear image preview
            if (selectedImageBase64) {
                removeImageBtn.click();
                selectedImageBase64 = null;
            }

            // Call streaming endpoint
            const response = await fetch(`${API_URL}/chat/sessions/${currentSessionId}/messages/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    message: userMsg || "Analyzing the attached image.",
                    model: settings.preferredModel || "gemini"
                })

            });

            if (response.status === 401 || response.status === 403) {
                logout();
                throw new Error('Session expired. Please log in again.');
            }

            if (!response.ok) {
                let errorMsg = `Error ${response.status}: `;
                try {
                    const errorData = await response.json();
                    errorMsg += errorData.detail || response.statusText;
                } catch (e) {
                    errorMsg += await response.text() || response.statusText;
                }
                throw new Error(errorMsg);
            }

            hideTyping();

            // Handle streaming response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = "";
            const botMessageId = 'bot-msg-' + Date.now();
            let messageAdded = false;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                fullText += chunk;

                if (!messageAdded) {
                    const messageDiv = addMessage(fullText, 'bot', null, botMessageId, { renderMermaid: false });
                    messageDiv.classList.add('streaming');
                    messageAdded = true;
                } else {
                    const messageDiv = document.getElementById(botMessageId);
                    if (messageDiv) {
                        messageDiv.dataset.rawBotText = fullText;
                        renderBotMessage(messageDiv, fullText, { renderMermaid: false });
                    }
                }
                messageContainer.scrollTop = messageContainer.scrollHeight;
            }

            // Final render
            const finalMessageDiv = document.getElementById(botMessageId);
            if (finalMessageDiv) {
                finalMessageDiv.classList.remove('streaming');
                finalMessageDiv.dataset.rawBotText = fullText;
                renderBotMessage(finalMessageDiv, fullText, { renderMermaid: true });
            }

            // Refresh sidebar to show updated title
            loadSidebar();
        } catch (error) {
            console.error("AI Error:", error);
            hideTyping();
            addMessage(`I apologize, but I encountered an error: ${error.message}`, 'bot');
        }
    }

    function handleSend() {
        const text = userInput.value.trim();
        if (text || selectedImageBase64) {
            addMessage(text, 'user', selectedImageBase64);
            const currentImage = selectedImageBase64;
            userInput.value = '';
            fetchAIResponse(text, currentImage);
        }
    }

    sendBtn.addEventListener('click', handleSend);
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && settings.enterToSend && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    // ──────────────────────────────────────────
    // INITIALIZATION
    // ──────────────────────────────────────────

    async function initializeApp() {
        if (profileName && currentUser) {
            profileName.textContent = currentUser.username || currentUser.email;
        }

        await loadSidebar();

        // Load first session or show welcome
        try {
            const response = await apiFetch('/chat/sessions');
            if (response.ok) {
                const sessions = await response.json();
                if (sessions.length > 0) {
                    await switchSession(sessions[0].id);
                } else {
                    addMessage("Hello! I'm IntelliChat. How can I help you today?", 'bot');
                }
            }
        } catch (err) {
            addMessage("Hello! I'm IntelliChat. How can I help you today?", 'bot');
        }
    }

    // Initialize UX/UI Enhancements
    if (typeof initializeUXEnhancements === 'function') {
        initializeUXEnhancements();
    }

    // Check auth state
    if (authToken && currentUser) {
        hideAuth();
        initializeApp();
    } else {
        showAuth();
    }

    console.log("IntelliChat UI Initialized. Ready for support.");
});
