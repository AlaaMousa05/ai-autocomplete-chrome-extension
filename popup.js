const STORAGE_KEY_API_KEY = 'openaiApiKey';

async function loadApiKey() {
  const { openaiApiKey } = await chrome.storage.local.get([STORAGE_KEY_API_KEY]);
  document.getElementById('apiKey').value = openaiApiKey || '';
}

async function saveApiKey() {
  const apiKey = document.getElementById('apiKey').value.trim();
  await chrome.storage.local.set({ [STORAGE_KEY_API_KEY]: apiKey });
  const status = document.getElementById('status');
  status.textContent = apiKey ? 'API key saved.' : 'API key cleared.';
}

document.getElementById('saveButton').addEventListener('click', saveApiKey);
document.getElementById('apiKey').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    saveApiKey();
  }
});

loadApiKey();
