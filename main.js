document.addEventListener('DOMContentLoaded', () => {
    const messageContainer = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const typingStatus = document.querySelector('.typing-status');
    const themeToggle = document.getElementById('theme-toggle');
    const sunIcon = themeToggle.querySelector('.sun');
    const moonIcon = themeToggle.querySelector('.moon');
    const historyList = document.getElementById('history-list');
    const newChatBtn = document.getElementById('new-chat-btn');

    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const modelSelect = document.getElementById('model-select');
    const systemPromptInput = document.getElementById('system-prompt-input');
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

    let selectedImageBase64 = null;

    // Default Settings
    let settings = {
        model: 'gemini-2.0-flash',
        systemPrompt: '',
        theme: 'dark',
        fontSize: '15px',
        enterToSend: true,
        showTimestamps: true
    };

    // Load Settings
    function loadSettings() {
        const saved = localStorage.getItem('chat_settings');
        if (saved) {
            settings = { ...settings, ...JSON.parse(saved) };
        }
        
        // Update UI
        modelSelect.value = settings.model;
        systemPromptInput.value = settings.systemPrompt;
        themeSelect.value = settings.theme;
        fontSizeSelect.value = settings.fontSize;
        enterToSendToggle.checked = settings.enterToSend;
        showTimestampsToggle.checked = settings.showTimestamps;

        applyVisualSettings();
    }

    function saveSettings() {
        settings = {
            model: modelSelect.value,
            systemPrompt: systemPromptInput.value,
            theme: themeSelect.value,
            fontSize: fontSizeSelect.value,
            enterToSend: enterToSendToggle.checked,
            showTimestamps: showTimestampsToggle.checked
        };
        localStorage.setItem('chat_settings', JSON.stringify(settings));
        applyVisualSettings();
    }

    function applyVisualSettings() {
        // Apply Theme
        if (settings.theme === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
            document.documentElement.setAttribute('data-theme', settings.theme);
        }

        // Apply Font Size
        document.documentElement.style.setProperty('--font-size-base', settings.fontSize);
        // We'll update the CSS to use this variable for message content
        
        // Toggle timestamps visibility
        document.body.classList.toggle('hide-timestamps', !settings.showTimestamps);
    }

    // Modal Events
    settingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'flex';
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none';
        saveSettings();
    });

    window.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
            saveSettings();
        }
    });
    
    // Clear Chats logic
    clearChatsBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to delete all conversations? This cannot be undone.')) {
            try {
                // 1. Count rows before delete so we can identify RLS-blocked deletes.
                const { count: existingMsgCount, error: existingMsgError } = await supabase
                    .from('chat_messages')
                    .select('id', { count: 'exact', head: true });

                if (existingMsgError) throw existingMsgError;

                const { count: existingSessionCount, error: existingSessionError } = await supabase
                    .from('chat_sessions')
                    .select('id', { count: 'exact', head: true });

                if (existingSessionError) throw existingSessionError;

                if ((existingMsgCount ?? 0) === 0 && (existingSessionCount ?? 0) === 0) {
                    alert('No chats found to delete.');
                    localStorage.removeItem('chat_session_id');
                    location.reload();
                    return;
                }

                // 2. Delete all messages first
                const { error: msgError, count: msgCount } = await supabase
                    .from('chat_messages')
                    .delete({ count: 'exact' })
                    .not('id', 'is', 'null');
                
                if (msgError) throw msgError;

                // 3. Delete all sessions
                const { error: sessionError, count: sessionCount } = await supabase
                    .from('chat_sessions')
                    .delete({ count: 'exact' })
                    .not('id', 'is', 'null');
                
                if (sessionError) throw sessionError;

                console.log(`Deleted ${msgCount} messages and ${sessionCount} sessions.`);

                const deletedMessages = msgCount ?? 0;
                const deletedSessions = sessionCount ?? 0;

                if (deletedMessages === 0 && deletedSessions === 0) {
                    alert(
                        `No chats were deleted.\n\n` +
                        `Supabase still had ${existingMsgCount ?? 0} messages and ${existingSessionCount ?? 0} sessions before delete.\n\n` +
                        `This usually means Row Level Security (RLS) allows SELECT but blocks DELETE. ` +
                        `Add DELETE policies for chat_messages and chat_sessions, then try again.`
                    );
                    return;
                }

                // 4. Clear local session state and reload
                localStorage.removeItem('chat_session_id');
                location.reload();
            } catch (err) {
                console.error('Error clearing chats:', err);
                alert('Failed to clear chats: ' + (err.message || 'Unknown error'));
            }
        }
    });

    loadSettings();

    // Image Attachment Logic
    attachmentBtn.addEventListener('click', () => imageUpload.click());

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

    removeImageBtn.addEventListener('click', () => {
        selectedImageBase64 = null;
        imagePreview.src = '';
        imagePreviewContainer.style.display = 'none';
        imageUpload.value = '';
    });

    // Theme Toggle Logic (DEPRECATED: Now handled via settings modal, but keeping for compatibility if button exists)
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            themeSelect.value = newTheme;
            saveSettings();
        });
    }

    function addMessage(text, role = 'user', imageUrl = null) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;

        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Parse markdown only for the bot
        let formattedText = text;
        if (role === 'bot') {
            formattedText = marked.parse(text);
        }

        let imageHtml = '';
        if (imageUrl) {
            imageHtml = `<img src="${imageUrl}" class="message-image" alt="Uploaded image">`;
        }

        messageDiv.innerHTML = `
            <div class="message-content">
                ${imageHtml}
                ${formattedText ? `<div>${formattedText}</div>` : ''}
                <span class="timestamp">${timestamp}</span>
            </div>
        `;

        messageContainer.appendChild(messageDiv);
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }

    function showTyping() {
        typingStatus.textContent = 'Typing...';
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot typing';
        typingDiv.id = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="message-content">
                <div class="typing-dots">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div>
            </div>
        `;
        messageContainer.appendChild(typingDiv);
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }

    function hideTyping() {
        typingStatus.textContent = 'Ready to assist';
        const typingDiv = document.getElementById('typing-indicator');
        if (typingDiv) {
            typingDiv.remove();
        }
    }

    const SUPABASE_URL = "https://ftxpnywtllgklbpxgcxu.supabase.co"; // REPLACE: Found in Supabase Project Settings > API
    const SUPABASE_ANON_KEY = "sb_publishable_AMGOrzoXnukOQAQA_fPywQ_W3jN2TLH"; // REPLACE: Found in Supabase Project Settings > API

    // Initialize Supabase Client
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Sidebar Logic
    async function loadSidebar() {
        const { data, error } = await supabase
            .from('chat_sessions')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (data && historyList) {
            historyList.innerHTML = '';
            data.forEach(session => {
                const item = document.createElement('div');
                item.className = `history-item ${session.id === sessionId ? 'active' : ''}`;
                
                const titleDiv = document.createElement('div');
                titleDiv.className = 'history-title';
                titleDiv.textContent = session.title || 'New Chat';
                
                const snippetDiv = document.createElement('div');
                snippetDiv.className = 'history-snippet';
                snippetDiv.textContent = '...';
                
                item.appendChild(titleDiv);
                item.appendChild(snippetDiv);
                
                item.onclick = () => switchSession(session.id);
                historyList.appendChild(item);

                // Fetch latest message asynchronously
                supabase.from('chat_messages')
                    .select('content')
                    .eq('session_id', session.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .then(({ data: msgData }) => {
                        if (msgData && msgData.length > 0) {
                            const snippet = msgData[0].content;
                            snippetDiv.textContent = snippet.length > 35 ? snippet.substring(0, 35) + '...' : snippet;
                        } else {
                            snippetDiv.textContent = 'New conversation';
                        }
                    })
                    .catch(() => {
                        snippetDiv.textContent = 'New conversation';
                    });
            });
        }
    }

    function switchSession(id) {
        if (sessionId === id) return;
        sessionId = id;
        localStorage.setItem('chat_session_id', id);
        chatHistory = [];
        messageContainer.innerHTML = '';
        loadSidebar();
        loadChatHistory();
    }

    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            const newId = crypto.randomUUID();
            sessionId = newId;
            localStorage.setItem('chat_session_id', newId);
            chatHistory = [];
            messageContainer.innerHTML = ''; // Start pristine
            supabase.from('chat_sessions').insert({ id: newId, title: 'New Chat' }).then(() => loadSidebar());
            addMessage("Hello! I'm IntelliChat. How can I help you today?", 'bot');
        });
    }

    // Get or Create Session ID
    let sessionId = localStorage.getItem('chat_session_id');
    if (!sessionId) {
        sessionId = crypto.randomUUID();
        localStorage.setItem('chat_session_id', sessionId);
        // Create session in database
        supabase.from('chat_sessions').insert({ id: sessionId }).then();
    }

    // Keep track of the conversation history for the AI model
    let chatHistory = [];

    // Load existing history from database
    async function loadChatHistory() {
        const { data, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });
        
        if (data && data.length > 0) {
            messageContainer.innerHTML = ''; // clear default greeting
            data.forEach(msg => {
                chatHistory.push({ role: msg.role === 'model' ? 'model' : 'user', parts: [{ text: msg.content }] });
                // Pass false to prevent infinite scrolling on load, mostly optional
                addMessage(msg.content, msg.role === 'model' ? 'bot' : 'user');
            });
        }
    }
    loadSidebar();
    loadChatHistory();

    async function fetchAIResponse(userMsg, imageBase64 = null) {
        showTyping();

        try {
            const isFirstMessage = chatHistory.length === 0;

            // Append the new user message to the history
            const parts = [{ text: userMsg || "Analyzing the attached image." }];
            chatHistory.push({ role: "user", parts: parts });
            
            // Save to Supabase Database
            supabase.from('chat_messages').insert({ 
                session_id: sessionId, 
                role: 'user', 
                content: userMsg || "[Image Attached]" 
            }).then();

            if (isFirstMessage) {
                // Background task to generate title (always use Gemini for this to keep it consistent and server-side)
                fetch(`${SUPABASE_URL}/functions/v1/chat`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
                        "apikey": SUPABASE_ANON_KEY
                    },
                    body: JSON.stringify({ messages: chatHistory, is_title_generation: true })
                }).then(res => res.json()).then(data => {
                    if (data.response) {
                        const newTitle = data.response.replace(/["']/g, "").trim();
                        supabase.from('chat_sessions').update({ title: newTitle }).eq('id', sessionId).then(() => loadSidebar());
                    }
                });
            }

            let generatedText = "";

            // Call Gemini via Supabase
            const response = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
                    "apikey": SUPABASE_ANON_KEY
                },
                body: JSON.stringify({ 
                    messages: chatHistory, 
                    custom_system_prompt: settings.systemPrompt,
                    model: settings.model,
                    image: imageBase64
                })
            });
            
            // Clear image preview UI
            if (selectedImageBase64) {
                removeImageBtn.click();
                selectedImageBase64 = null;
            }

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Gemini API error");
            generatedText = data.response;

            hideTyping();

            if (generatedText) {
                addMessage(generatedText, 'bot');
                // Append the AI's response to the history so it remembers what it said
                chatHistory.push({ role: "model", parts: [{ text: generatedText }] });
                // Save AI response to Supabase Database
                supabase.from('chat_messages').insert({ session_id: sessionId, role: 'model', content: generatedText }).then();
            }
        } catch (error) {
            console.error("AI Error: ", error);
            hideTyping();
            addMessage(`I apologize, but I encountered an error: ${error.message}`, 'bot');
        }
    }

    function handleSend() {
        const text = userInput.value.trim();
        if (text || selectedImageBase64) {
            addMessage(text, 'user', selectedImageBase64);
            const currentImage = selectedImageBase64; // local copy before cleanup
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

    // Initial greeting hover effect or something extra
    console.log("IntelliChat UI Initialized. Ready for support.");
});
