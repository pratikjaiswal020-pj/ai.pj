// ===================================
// UX/UI ENHANCEMENTS FOR INTELLICHAT
// Add these functions to your main.js
// ===================================

// 1️⃣ COPY CODE BLOCK FUNCTIONALITY
function setupCodeBlockEnhancements() {
    const style = document.createElement('style');
    style.textContent = `
    .code-block-wrapper {
      position: relative;
      margin: 1rem 0;
      border-radius: 8px;
      overflow: hidden;
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.05);
    }

    .code-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 1rem;
      background: rgba(0,0,0,0.4);
      font-size: 0.75rem;
      color: var(--text-secondary);
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }

    .language-label {
      font-weight: 600;
      text-transform: uppercase;
    }

    .copy-code-btn {
      background: var(--accent);
      color: white;
      border: none;
      padding: 0.4rem 0.8rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 600;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .copy-code-btn:hover {
      background: var(--accent-hover);
      transform: scale(1.05);
    }

    .copy-code-btn.copied {
      background: #10b981;
      animation: pulse 0.6s ease;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }

    .message-content pre {
      margin: 1rem 0 !important;
      padding: 1.5rem !important;
      border-radius: 6px !important;
      scrollbar-width: thin;
      scrollbar-color: rgba(99,102,241,0.3) transparent;
    }

    .message-content pre::-webkit-scrollbar {
      height: 6px;
    }

    .message-content pre::-webkit-scrollbar-track {
      background: transparent;
    }

    .message-content pre::-webkit-scrollbar-thumb {
      background: rgba(99,102,241,0.3);
      border-radius: 3px;
    }

    .message-content pre::-webkit-scrollbar-thumb:hover {
      background: rgba(99,102,241,0.5);
    }
  `;
    document.head.appendChild(style);

    // Intercept marked to add copy buttons
    // Handle marked v11+ breaking changes where renderer methods take an object
    const originalCodeRenderer = marked.Renderer.prototype.code;
    
    marked.Renderer.prototype.code = function (codeOrObj, language, escaped) {
        let code = codeOrObj;
        let lang = language;
        
        // Check if we are in marked v11+ (single object argument)
        if (typeof codeOrObj === 'object' && codeOrObj !== null && codeOrObj.text !== undefined) {
            code = codeOrObj.text;
            lang = codeOrObj.lang || codeOrObj.language;
        }

        // Safety check for code string
        const safeCode = String(code || '');
        const safeLang = String(lang || '');

        let highlightedCode;
        try {
            highlightedCode = (safeLang && hljs.getLanguage(safeLang))
                ? hljs.highlight(safeCode, { language: safeLang, ignoreIllegals: true }).value
                : hljs.highlightAuto(safeCode).value;
        } catch (err) {
            console.warn('Highlight.js error:', err);
            highlightedCode = escapeHtml(safeCode);
        }

        const languageLabel = safeLang ? `<span class="language-label">${safeLang}</span>` : '';

        return `
      <div class="code-block-wrapper">
        <div class="code-header">
          ${languageLabel}
          <button class="copy-code-btn" title="Copy code">
            <span>📋</span>
            <span>Copy</span>
          </button>
        </div>
        <pre><code class="hljs language-${safeLang}">${highlightedCode}</code></pre>
      </div>
    `;
    };

    // Handle copy button clicks
    document.addEventListener('click', (e) => {
        if (e.target.closest('.copy-code-btn')) {
            const btn = e.target.closest('.copy-code-btn');
            const codeBlock = btn.closest('.code-block-wrapper').querySelector('code');
            const text = codeBlock.textContent;

            const originalHTML = btn.innerHTML;
            navigator.clipboard.writeText(text).then(() => {
                btn.innerHTML = '<span>✓</span><span>Copied!</span>';
                btn.classList.add('copied');

                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                    btn.classList.remove('copied');
                }, 2000);
            }).catch(err => {
                console.error('Copy failed:', err);
                btn.innerHTML = '<span>✗</span><span>Failed</span>';
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                }, 2000);
            });
        }
    });
}

// 2️⃣ MESSAGE ACTION MENU
function setupMessageActions() {
    const style = document.createElement('style');
    style.textContent = `
    .message {
      position: relative;
      transition: all 0.2s ease;
    }

    .message:hover .message-actions {
      opacity: 1;
      pointer-events: auto;
    }

    .message-actions {
      display: flex;
      gap: 0.4rem;
      position: absolute;
      right: 1rem;
      top: 0.5rem;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
      background: var(--bg-surface-hover);
      padding: 0.5rem;
      border-radius: 6px;
      backdrop-filter: blur(10px);
      border: 1px solid var(--border-color);
      z-index: 5;
    }

    .msg-action-btn {
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      width: 32px;
      height: 32px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      font-size: 0.9rem;
      padding: 0;
    }

    .msg-action-btn:hover {
      background: var(--accent);
      color: white;
      border-color: var(--accent);
      transform: translateY(-2px);
    }

    .msg-action-btn:active {
      transform: translateY(0);
    }

    @media (max-width: 768px) {
      .message-actions {
        opacity: 1;
        position: relative;
        right: auto;
        top: auto;
        justify-content: flex-end;
        margin-top: 0.5rem;
      }

      .message:hover .message-actions {
        opacity: 1;
      }
    }
  `;
    document.head.appendChild(style);
}

// 3️⃣ ANIMATED TYPING INDICATOR
function setupAnimatedTypingIndicator() {
    const style = document.createElement('style');
    style.textContent = `
    .typing-indicator {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 16px;
    }

    .typing-indicator span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
      animation: typingBounce 1.4s infinite;
    }

    .typing-indicator span:nth-child(2) {
      animation-delay: 0.2s;
    }

    .typing-indicator span:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes typingBounce {
      0%, 80%, 100% {
        opacity: 0.4;
        transform: translateY(0);
      }
      40% {
        opacity: 1;
        transform: translateY(-8px);
      }
    }
  `;
    document.head.appendChild(style);

    // Replace showTyping function to use animated indicator
    window.originalShowTyping = window.showTyping;
    window.showTyping = function () {
        const typingStatus = document.querySelector('.typing-status');
        if (typingStatus) {
            typingStatus.innerHTML = `
        <span>Thinking</span>
        <div class="typing-indicator" style="display: inline-flex; margin-left: 4px;">
          <span></span>
          <span></span>
          <span></span>
        </div>
      `;
        }
    };
}

// 4️⃣ BETTER MESSAGE ANIMATIONS
function setupMessageAnimations() {
    const style = document.createElement('style');
    style.textContent = `
    .message {
      animation: slideIn 0.3s ease forwards;
      opacity: 0;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .message.user .message-content {
      animation: userMessageSlideIn 0.3s ease;
    }

    @keyframes userMessageSlideIn {
      from {
        opacity: 0;
        transform: translateX(20px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    .message.bot .message-content {
      animation: botMessageSlideIn 0.3s ease;
    }

    @keyframes botMessageSlideIn {
      from {
        opacity: 0;
        transform: translateX(-20px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    .message.streaming {
      position: relative;
    }

    .message.streaming::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      height: 2px;
      width: 0;
      background: linear-gradient(90deg, var(--accent), transparent);
      animation: streamingProgress 2s infinite;
      border-radius: 1px;
    }

    @keyframes streamingProgress {
      0% { width: 0; }
      50% { width: 100%; }
      100% { width: 100%; }
    }
  `;
    document.head.appendChild(style);
}

// 5️⃣ EMPTY STATE DESIGN
function setupEmptyState() {
    const style = document.createElement('style');
    style.textContent = `
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 2rem;
      color: var(--text-secondary);
      padding: 2rem;
    }

    .empty-icon {
      font-size: 5rem;
      opacity: 0.4;
      animation: float 3s ease-in-out infinite;
    }

    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }

    .empty-state h2 {
      color: var(--text-primary);
      font-size: 1.5rem;
      margin: 0;
    }

    .empty-state p {
      margin: 0;
      font-size: 1rem;
    }

    .suggestion-chips {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      justify-content: center;
      max-width: 600px;
    }

    .chip {
      background: var(--bg-surface-hover);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 0.75rem 1.5rem;
      border-radius: 20px;
      cursor: pointer;
      transition: all 0.3s ease;
      font-size: 0.9rem;
      font-weight: 500;
    }

    .chip:hover {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
      transform: translateY(-3px);
      box-shadow: 0 8px 16px rgba(99, 102, 241, 0.3);
    }

    .chip:active {
      transform: translateY(-1px);
    }
  `;
    document.head.appendChild(style);
}

// 6️⃣ KEYBOARD SHORTCUTS
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + K: Focus input
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('user-input').focus();
        }

        // Ctrl/Cmd + N: New chat
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            document.getElementById('new-chat-btn').click();
        }

        // Ctrl/Cmd + ,: Settings
        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
            e.preventDefault();
            document.getElementById('settings-btn').click();
        }

        // Escape: Close modals
        if (e.key === 'Escape') {
            const settingsModal = document.getElementById('settings-modal');
            if (settingsModal.style.display !== 'none') {
                settingsModal.style.display = 'none';
            }
        }
    });

    // Show hint on first key press
    if (!localStorage.getItem('shortcuts_hint_shown')) {
        const hint = document.createElement('div');
        hint.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      padding: 1rem;
      border-radius: 8px;
      font-size: 0.85rem;
      color: var(--text-secondary);
      max-width: 200px;
      z-index: 1000;
      animation: slideIn 0.3s ease;
    `;
        hint.innerHTML = `
      <strong>💡 Keyboard Shortcuts</strong>
      <div style="margin-top: 0.5rem; font-size: 0.8rem;">
        <div>⌘K - Focus input</div>
        <div>⌘N - New chat</div>
        <div>⌘, - Settings</div>
        <div>Esc - Close modal</div>
      </div>
    `;
        document.body.appendChild(hint);
        setTimeout(() => hint.remove(), 8000);
        localStorage.setItem('shortcuts_hint_shown', 'true');
    }
}

// 7️⃣ IMPROVED FOCUS STATES
function setupAccessibility() {
    const style = document.createElement('style');
    style.textContent = `
    button:focus-visible,
    input:focus-visible,
    select:focus-visible,
    textarea:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    #user-input {
      transition: all 0.2s ease;
    }

    #user-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }

    #user-input::placeholder {
      color: var(--text-muted);
    }

    /* Smooth transitions */
    * {
      transition: background-color 0.2s ease, color 0.2s ease;
    }

    button, input, select {
      transition: all 0.2s ease;
    }
  `;
    document.head.appendChild(style);
}

// 8️⃣ MOBILE RESPONSIVE SIDEBAR
function setupMobileResponsive() {
    const style = document.createElement('style');
    style.textContent = `
    @media (max-width: 768px) {
      .app-container {
        flex-direction: column;
        border-radius: 0;
      }

      .sidebar {
        max-width: 100%;
        width: 100%;
        height: auto;
        border-right: none;
        border-bottom: 1px solid var(--border-color);
        flex-shrink: 0;
        max-height: 60px;
        overflow-x: auto;
      }

      .sidebar-header {
        flex-direction: row;
      }

      .history {
        flex-direction: row;
        overflow-x: auto;
      }

      .history-list-container {
        display: flex;
        gap: 0.5rem;
        flex-wrap: nowrap;
        overflow-x: auto;
        padding: 0.5rem 0;
      }

      .chat-main {
        width: 100%;
        height: calc(100vh - 60px);
      }

      .message-actions {
        opacity: 1;
        position: relative;
        right: auto;
        top: auto;
        margin-top: 0.5rem;
      }
    }
  `;
    document.head.appendChild(style);
}

// 9️⃣ SEARCH FUNCTIONALITY
function setupHistorySearch() {
    const style = document.createElement('style');
    style.textContent = `
    .history-search {
      width: 100%;
      padding: 0.75rem 1rem;
      background: var(--bg-surface-hover);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-primary);
      margin-bottom: 1rem;
    }

    .history-search:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 2px var(--accent-glow);
    }

    .search-results {
      max-height: 300px;
      overflow-y: auto;
    }

    .search-result-item {
      padding: 0.75rem;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s ease;
      font-size: 0.9rem;
      color: var(--text-secondary);
    }

    .search-result-item:hover {
      background: var(--bg-surface-hover);
      color: var(--text-primary);
    }
  `;
    document.head.appendChild(style);
}

// 🔟 INITIALIZE ALL ENHANCEMENTS
function initializeUXEnhancements() {
    console.log('🎨 Initializing UX/UI Enhancements...');

    setupCodeBlockEnhancements();
    setupMessageActions();
    setupAnimatedTypingIndicator();
    setupMessageAnimations();
    setupEmptyState();
    setupKeyboardShortcuts();
    setupAccessibility();
    setupMobileResponsive();
    setupHistorySearch();

    console.log('✅ UX/UI Enhancements loaded!');
}

// Call this in your DOMContentLoaded event
// Add this line to the end of your existing DOMContentLoaded listener:
// initializeUXEnhancements();
