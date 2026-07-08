(() => {
  const DEBOUNCE_MS = 300;
  const STORAGE_KEY_API_KEY = 'openaiApiKey';
  const REQUEST_PREFIX = 'ai-autocomplete';

  let overlay = null;
  let activeTarget = null;
  let activeSuggestion = '';
  let pendingTimer = null;
  let pendingRequestId = null;
  let mutationObserver = null;

  init();

  function init() {
    createOverlay();
    attachListeners();
    observeDom();
  }

  function createOverlay() {
    if (overlay) {
      return;
    }

    overlay = document.createElement('div');
    overlay.className = 'ai-autocomplete-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.textContent = '';
    document.body.appendChild(overlay);
  }

  function attachListeners() {
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    document.addEventListener('input', handleInputEvent);
    document.addEventListener('beforeinput', handleInputEvent);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('click', handleClick);
    document.addEventListener('paste', handleInputEvent);
    document.addEventListener('cut', handleInputEvent);
    document.addEventListener('compositionend', handleInputEvent);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('selectionchange', handleSelectionChange);
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);
  }

  function observeDom() {
    if (mutationObserver) {
      return;
    }

    mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          if (activeTarget && !document.contains(activeTarget)) {
            hideSuggestion();
          }
        }
      }
    });

    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function handleFocusIn(event) {
    const target = event.target;
    if (!isEditableElement(target)) {
      return;
    }

    activeTarget = target;
    scheduleSuggestionUpdate(target);
  }

  function handleFocusOut(event) {
    if (event.target === activeTarget) {
      hideSuggestion();
      activeTarget = null;
    }
  }

  function handleInputEvent(event) {
    const target = event.target;
    if (!isEditableElement(target)) {
      return;
    }

    activeTarget = target;
    scheduleSuggestionUpdate(target);
  }

  function handleKeyUp(event) {
    const target = event.target;
    if (!isEditableElement(target)) {
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'Home' || event.key === 'End') {
      scheduleSuggestionUpdate(target, true);
    }
  }

  function handleClick(event) {
    const target = event.target;
    if (!isEditableElement(target)) {
      return;
    }

    activeTarget = target;
    scheduleSuggestionUpdate(target, true);
  }

  function handleSelectionChange() {
    if (!activeTarget || !isEditableElement(activeTarget)) {
      return;
    }

    if (!isCaretAtEnd(activeTarget)) {
      hideSuggestion();
      return;
    }

    if (overlay && overlay.style.display === 'block') {
      positionOverlay(activeTarget);
    }
  }

  function handleViewportChange() {
    if (overlay && overlay.style.display === 'block' && activeTarget && isEditableElement(activeTarget)) {
      positionOverlay(activeTarget);
    }
  }

  function handleKeyDown(event) {
    if (!activeTarget || !isOverlayVisible()) {
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      acceptSuggestion();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      hideSuggestion();
    }
  }

  function scheduleSuggestionUpdate(target, immediate = false) {
    if (!isEditableElement(target)) {
      return;
    }

    const value = getEditorValue(target);
    if (!value || !isCaretAtEnd(target)) {
      hideSuggestion();
      return;
    }

    if (!shouldRequestSuggestion(target, value)) {
      hideSuggestion();
      return;
    }

    if (pendingTimer) {
      clearTimeout(pendingTimer);
    }

    const run = () => requestSuggestion(target, value);
    if (immediate) {
      run();
      return;
    }

    pendingTimer = setTimeout(run, DEBOUNCE_MS);
  }

  function shouldRequestSuggestion(target, value) {
    if (!value || value.trim().length < 1) {
      return false;
    }

    if (target.isContentEditable) {
      return true;
    }

    const type = (target.type || '').toLowerCase();
    return type === 'text' || type === 'search';
  }

  function requestSuggestion(target, currentValue) {
    if (!target || !isEditableElement(target)) {
      console.log('[AI Autocomplete] Target not editable');
      return;
    }

    if (!isCaretAtEnd(target)) {
      console.log('[AI Autocomplete] Caret not at end');
      hideSuggestion();
      return;
    }

    const normalized = currentValue.trim();
    if (!normalized) {
      hideSuggestion();
      return;
    }

    const currentRequestId = `${REQUEST_PREFIX}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    pendingRequestId = currentRequestId;

    chrome.runtime.sendMessage({
      type: 'requestAutocomplete',
      requestId: currentRequestId,
      text: normalized
    }, (response) => {
      if (!response) {
        return;
      }

      if (response.status === 'aborted' || response.status === 'missing-key') {
        hideSuggestion();
        return;
      }

      if (response.status !== 'ok' || response.requestId !== currentRequestId) {
        return;
      }

      const completion = sanitizeCompletion(response.completion || '');
      if (!completion) {
        hideSuggestion();
        return;
      }

      if (!target.isConnected || !isEditableElement(target) || getEditorValue(target) !== currentValue || !isCaretAtEnd(target)) {
        hideSuggestion();
        return;
      }

      activeSuggestion = completion;
      showSuggestion(target, completion);
    });
  }

  function sanitizeCompletion(text) {
    return String(text)
      .replace(/^['"`]+|['"`]+$/g, '')
      .trim();
  }

  function showSuggestion(target, suggestion) {
    if (!target || !isEditableElement(target)) {
      return;
    }

    activeTarget = target;
    activeSuggestion = suggestion;
    overlay.textContent = suggestion;
    overlay.style.display = 'block';
    positionOverlay(target);
  }

  function hideSuggestion() {
    activeSuggestion = '';
    overlay.style.display = 'none';
    overlay.textContent = '';
  }

  function acceptSuggestion() {
    if (!activeTarget || !activeSuggestion) {
      return;
    }

    applySuggestion(activeTarget, activeSuggestion);
    hideSuggestion();
  }

  function applySuggestion(target, suggestion) {
    if (target.isContentEditable) {
      insertIntoContentEditable(target, suggestion);
      return;
    }

    const currentValue = target.value || '';
    const nextValue = `${currentValue}${suggestion}`;
    target.value = nextValue;
    const end = nextValue.length;
    target.setSelectionRange(end, end);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function insertIntoContentEditable(target, suggestion) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      target.textContent += suggestion;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(suggestion));
    range.setStartAfter(range.endContainer);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function positionOverlay(target) {
    if (!overlay || !activeSuggestion) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const style = getComputedStyle(target);

    overlay.style.font = style.font;
    overlay.style.fontFamily = style.fontFamily;
    overlay.style.fontSize = style.fontSize;
    overlay.style.fontStyle = style.fontStyle;
    overlay.style.fontWeight = style.fontWeight;
    overlay.style.lineHeight = style.lineHeight;
    overlay.style.letterSpacing = style.letterSpacing;
    overlay.style.textTransform = style.textTransform;
    overlay.style.color = '#FF0000';
    overlay.style.fontWeight = 'bold';
    overlay.style.whiteSpace = target.tagName === 'TEXTAREA' ? 'pre-wrap' : 'nowrap';
    overlay.style.padding = '0';
    overlay.style.margin = '0';
    overlay.style.border = '0';
    overlay.style.boxSizing = 'border-box';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '2147483647';
    overlay.style.opacity = '1';
    overlay.style.display = 'block';

    if (target.isContentEditable) {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount || !selection.isCollapsed) {
        hideSuggestion();
        return;
      }

      const range = selection.getRangeAt(0).cloneRange();
      range.collapse(false);
      const caretRect = range.getClientRects()[0] || range.getBoundingClientRect();
      overlay.style.position = 'fixed';
      overlay.style.left = `${caretRect.left + window.scrollX}px`;
      overlay.style.top = `${caretRect.top + window.scrollY}px`;
      return;
    }

    const caretPosition = getCaretPosition(target);
    overlay.style.position = 'fixed';
    overlay.style.left = `${caretPosition.left}px`;
    overlay.style.top = `${caretPosition.top}px`;

    const maxWidth = Math.max(rect.width - 8, 120);
    overlay.style.maxWidth = `${maxWidth}px`;
    overlay.style.overflow = 'hidden';
  }

  function getCaretPosition(target) {
    const rect = target.getBoundingClientRect();
    const style = getComputedStyle(target);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const contentWidth = Math.max(target.clientWidth - paddingLeft - parseFloat(style.paddingRight || 0) - borderLeft - parseFloat(style.borderRightWidth || 0), 0);
    const contentHeight = Math.max(target.clientHeight - paddingTop - parseFloat(style.paddingBottom || 0) - borderTop - parseFloat(style.borderBottomWidth || 0), 0);

    const mirror = document.createElement('div');
    mirror.className = 'ai-autocomplete-caret-mirror';
    mirror.textContent = (target.value || '').slice(0, target.selectionStart || 0) || '';
    mirror.style.position = 'fixed';
    mirror.style.visibility = 'hidden';
    mirror.style.pointerEvents = 'none';
    mirror.style.left = `${rect.left + borderLeft + paddingLeft + window.scrollX}px`;
    mirror.style.top = `${rect.top + borderTop + paddingTop + window.scrollY}px`;
    mirror.style.width = `${contentWidth}px`;
    mirror.style.height = `${contentHeight}px`;
    mirror.style.overflow = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.font = style.font;
    mirror.style.fontFamily = style.fontFamily;
    mirror.style.fontSize = style.fontSize;
    mirror.style.fontStyle = style.fontStyle;
    mirror.style.fontWeight = style.fontWeight;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.textTransform = style.textTransform;
    mirror.style.padding = '0';
    mirror.style.margin = '0';
    mirror.style.border = '0';
    mirror.style.boxSizing = 'border-box';

    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    const markerRect = marker.getBoundingClientRect();
    mirror.remove();

    return {
      left: markerRect.left + window.scrollX,
      top: markerRect.top + window.scrollY
    };
  }

  function isEditableElement(target) {
    if (!target || !(target instanceof HTMLElement)) {
      return false;
    }

    if (target.isContentEditable) {
      return true;
    }

    if (target.tagName === 'TEXTAREA') {
      return true;
    }

    if (target.tagName === 'INPUT') {
      const type = (target.type || '').toLowerCase();
      return type === 'text' || type === 'search' || type === 'email' || type === '';
    }

    const role = target.getAttribute('role');
    if (role === 'textbox') {
      return true;
    }

    return false;
  }

  function getEditorValue(target) {
    if (!target) {
      return '';
    }

    if (target.isContentEditable) {
      return target.textContent || '';
    }

    return target.value || '';
  }

  function isCaretAtEnd(target) {
    if (!target || !isEditableElement(target)) {
      return false;
    }

    if (target.isContentEditable) {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
        return false;
      }

      const range = selection.getRangeAt(0).cloneRange();
      const beforeCaret = document.createRange();
      beforeCaret.selectNodeContents(target);
      beforeCaret.setEnd(range.endContainer, range.endOffset);
      return beforeCaret.toString() === (target.textContent || '');
    }

    return typeof target.selectionStart === 'number' && target.selectionStart === target.value.length && target.selectionEnd === target.value.length;
  }

  function isOverlayVisible() {
    return overlay && overlay.style.display === 'block' && activeSuggestion;
  }

  function withAlpha(color, alpha) {
    if (!color || color === 'rgba(0, 0, 0, 0)') {
      return `rgba(0, 0, 0, ${alpha})`;
    }

    if (color.startsWith('rgb')) {
      const values = color.match(/\d+/g);
      if (!values || values.length < 3) {
        return `rgba(0, 0, 0, ${alpha})`;
      }
      return `rgba(${values[0]}, ${values[1]}, ${values[2]}, ${alpha})`;
    }

    return color;
  }
})();
