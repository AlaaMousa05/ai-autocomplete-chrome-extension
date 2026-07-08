const STORAGE_KEY_API_KEY = 'openaiApiKey';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'openai/gpt-4o-mini';
const ACTIVE_REQUESTS = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'requestAutocomplete') {
    return false;
  }

  (async () => {
    const requestId = message.requestId;
    const previousController = ACTIVE_REQUESTS.get(requestId);
    if (previousController) {
      previousController.abort();
    }

    const controller = new AbortController();
    ACTIVE_REQUESTS.set(requestId, controller);

    try {
      const storage = await chrome.storage.local.get([STORAGE_KEY_API_KEY]);
      const apiKey = storage[STORAGE_KEY_API_KEY]?.trim();
      if (!apiKey) {
        sendResponse({ status: 'missing-key' });
        ACTIVE_REQUESTS.delete(requestId);
        return;
      }

      const prompt = buildPrompt(message.text);
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://chrome.google.com/webstore/category/extensions',
          'X-Title': 'AI Autocomplete Extension'
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          temperature: 0.2,
          max_tokens: 24,
          messages: [
            {
              role: 'system',
              content: 'You are an inline text completion assistant. Return only the missing completion text. Keep it short and natural, without explanations, quotes, or surrounding punctuation unless needed.'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`OpenRouter request failed with status ${response.status}`);
      }

      const data = await response.json();
      const completion = data?.choices?.[0]?.message?.content?.trim() || '';
      sendResponse({ status: 'ok', requestId, completion });
    } catch (error) {
      if (error.name === 'AbortError') {
        sendResponse({ status: 'aborted' });
      } else {
        sendResponse({ status: 'error', error: error.message || 'Unknown error' });
      }
    } finally {
      if (ACTIVE_REQUESTS.get(requestId) === controller) {
        ACTIVE_REQUESTS.delete(requestId);
      }
    }
  })();

  return true;
});

function buildPrompt(text) {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();
  const input = normalized.length > 180 ? normalized.slice(-180) : normalized;
  return `Complete the following partial text inline. Return only the missing completion text, not the entire sentence.\n\n${input}`;
}
