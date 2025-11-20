/* ==============================================
   Streamlit-Style Interactive Transcript Viewer
   ============================================== */
document.addEventListener("DOMContentLoaded", () => {
  
  // --- CONFIGURATION ---
  // This is the correct path since you are opening discobench/index.html
  const TRANSCRIPT_FILE_PATH = "claude.jsonl"; 
  
  // --- DOM ELEMENTS ---
  const container = document.getElementById("transcript-stepper");
  if (!container) {
    console.warn("Transcript stepper element not found. Skipping init.");
    return;
  }
  
  const contentEl = document.getElementById("transcript-content");
  const loadingEl = document.getElementById("transcript-loading");
  const nextBtn = document.getElementById("next-step");
  const prevBtn = document.getElementById("prev-step");
  const counterEl = document.getElementById("step-counter");

  // --- STATE ---
  let allMessages = [];
  let steps = [];
  let currentStep = -1;

  // --- 1. INITIALIZE ---
  async function init() {
    // Add listeners
    nextBtn.addEventListener("click", () => navigate(1));
    prevBtn.addEventListener("click", () => navigate(-1));

    // Load data
    try {
      const response = await fetch(TRANSCRIPT_FILE_PATH);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status} - Check that the file path "${TRANSCRIPT_FILE_PATH}" is correct.`);
      }
      const text = await response.text();
      
      allMessages = text.trim().split('\n')
        .map(line => { try { return JSON.parse(line); } catch (e) { return null; } })
        .filter(msg => msg && (msg.message || msg.type === 'tool_use' || msg.type === 'tool_result' || msg.type === 'thinking'));

      groupMessagesIntoSteps();

      if (steps.length > 0) {
        currentStep = 0;
        renderStep(currentStep);
        updateNavState();
        loadingEl.style.display = "none";
        container.style.opacity = 1;
      } else {
        counterEl.textContent = "No steps found in file.";
        loadingEl.style.display = "none";
      }
    } catch (error) {
      console.error("Error loading transcript:", error);
      contentEl.innerHTML = `<div class="alert alert-danger"><strong>Error:</strong> Could not load transcript.<br><small>${escapeHTML(error.message)}</small></div>`;
      loadingEl.style.display = "none";
      container.style.opacity = 1;
    }
  }

  // --- 2. GROUPING LOGIC ---
  // Groups messages into "turns" (User prompt + full Assistant response)
  function groupMessagesIntoSteps() {
    steps = [];
    let i = 0;
    while (i < allMessages.length) {
      const msg = allMessages[i];
      const role = msg.message?.role;

      if (role === 'user') {
        // Start a new step
        const currentTurn = [msg];
        i++;
        // Add all following messages until the next user message
        while (i < allMessages.length && allMessages[i].message?.role !== 'user') {
          // Only add messages we care about
          const type = allMessages[i].type;
          if (type === 'thinking' || type === 'tool_use' || type === 'tool_result' || allMessages[i].message?.role === 'assistant') {
            currentTurn.push(allMessages[i]);
          }
          i++;
        }
        steps.push(currentTurn);
      } else {
        // Ignore messages before the first user message
        i++;
      }
    }
  }
  
  // --- 3. RENDERING LOGIC ---
  function renderStep(index) {
    if (index < 0 || index >= steps.length) return;
    const stepMessages = steps[index];
    // Render all messages in this "turn"
    contentEl.innerHTML = stepMessages.map(createCardHtml).join('');
    // Ensure syntax highlighting is applied if Prism.js is available
    if (window.Prism) {
      window.Prism.highlightAllUnder(contentEl);
    }
  }

  function createCardHtml(msg) {
    const role = msg.message?.role;
    const type = msg.type;
    const content = msg.message?.content;

    if (role === 'user' && content) {
      return createUserCard(content);
    }
    if (role === 'assistant') {
      const textPart = content.find(p => p.type === 'text');
      return textPart ? createAssistantCard(textPart.text) : ''; // Only render if there's text
    }
    if (type === 'thinking') {
      const thinkingText = msg.message?.content?.[0]?.thinking || (typeof content === 'string' ? content : 'Thinking...');
      return createCollapsedCard('💭 Thinking...', thinkingText);
    }
    if (type === 'tool_use') {
      const toolCall = msg.message.content[0];
      return createCollapsedCard(`🛠️ Tool Use: ${toolCall.name}`, toolCall.input ? JSON.stringify(toolCall.input, null, 2) : '', 'json');
    }
    if (type === 'tool_result') {
      const toolResult = msg.message.content[0];
      const isError = toolResult.is_error || false;
      const title = isError ? '🧰 Tool Error' : '🧰 Tool Result';
      return createCollapsedCard(title, toolResult.content, 'bash', isError);
    }
    return ''; // Fallback for unhandled types
  }

  // --- 4. CARD TEMPLATES ---
  
  function createUserCard(content) {
    return `
    <div class="chat-message user-message">
      <div class="d-flex align-items-center mb-2">
        <i class="bi bi-person-fill me-2" style="font-size: 1.2rem;"></i>
        <strong class="fs-6">User</strong>
      </div>
      <pre style="white-space: pre-wrap; word-wrap: break-word; margin: 0; font-family: var(--font-monospace); font-size: 0.9rem;"><code>${escapeHTML(String(content))}</code></pre>
    </div>`;
  }

  function createAssistantCard(text) {
    // Enhanced markdown parser
    let html = escapeHTML(text)
      .replace(/```(javascript|js|python|html|css|json|bash|sh|)(\n?)([\s\S]*?)```/g, (match, lang, nl, code) => {
          const language = lang || 'plaintext';
          return `</p><pre class="bg-dark text-white p-3 rounded" style="font-family: var(--font-monospace);"><code class="language-${language}">${code}</code></pre><p>`;
      })
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="background-color: #e9ecef; padding: .2em .4em; border-radius: .25rem;">$1</code>')
      .replace(/(\n- (.*))/g, (match, p1, p2) => `<li>${p2}</li>`)
      .replace(/(<li>.*<\/li\>)/gs, (match) => `<ul style="padding-left: 1.2rem; margin-top: 0.5rem; margin-bottom: 0.5rem;">${match}</ul>`)
      .replace(/<\/ul>\n/g, '</ul>')
      .replace(/\n/g, '<br>')
      .replace(/<br><br>/g, '</p><p>')
      .replace(/<\/ul><br>/g, '</ul>');

    return `
    <div class="chat-message assistant-message">
      <div class="d-flex align-items-center mb-2">
        <i class="bi bi-robot me-2" style="font-size: 1.2rem; color: #0d6efd;"></i>
        <strong class="fs-6" style="color: #0d6efd;">Assistant</strong>
      </div>
      <p style="white-space: pre-wrap; word-wrap: break-word; margin-bottom: 0;">${html}</p>
    </div>`;
  }
  
  function createCollapsedCard(title, content, lang = 'plaintext', isError = false) {
    const errorClass = isError ? 'is-error' : '';
    return `
    <div class="collapsed-message ${errorClass}">
      <details>
        <summary>${escapeHTML(title)}</summary>
        <div class="tool-result ${errorClass}">
          <pre><code class="language-${lang}">${escapeHTML(String(content))}</code></pre>
        </div>
      </details>
    </div>`;
  }

  // --- 5. NAVIGATION ---
  function navigate(direction) {
    const newStep = currentStep + direction;
    if (newStep >= 0 && newStep < steps.length) {
      currentStep = newStep;
      renderStep(currentStep);
      updateNavState();
      
      // THIS IS THE FIX for the scroll jump
      // We scroll to the top of the *content area*, not the whole page
      const contentTop = contentEl.getBoundingClientRect().top + window.scrollY - 80; // 80px offset for nav
      window.scrollTo({ top: contentTop, behavior: 'smooth' });
    }
  }

  function updateNavState() {
    counterEl.textContent = `Turn ${currentStep + 1} of ${steps.length}`;
    prevBtn.disabled = currentStep <= 0;
    nextBtn.disabled = currentStep >= steps.length - 1;
  }
  
  // --- 6. UTILITIES ---
  function escapeHTML(str) {
      if (typeof str !== 'string') return '';
      return str.replace(/[&<>"']/g, match => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[match]));
  }

  // --- 7. RUN ---
  init();
});