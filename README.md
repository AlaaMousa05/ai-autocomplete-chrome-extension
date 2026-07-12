# AI Autocomplete Extension

A Chrome Extension that adds AI-powered inline autocomplete to text fields on any website.

## Demo

<img width="1231" height="302" alt="Screenshot 2026-07-09 000456" src="https://github.com/user-attachments/assets/0999fac3-f836-4057-8765-30c72efba135" />


## Features

- AI autocomplete for text inputs, textareas, and contenteditable elements.
- Ghost-text suggestions while typing.
- Accept suggestions with `Tab` and dismiss with `Escape`.
- Supports dynamic elements using MutationObserver.
- Cancels outdated requests with AbortController.
- Secure API key storage using Chrome Storage.

## Tech Stack

- JavaScript (Vanilla)
- HTML & CSS
- Chrome Extension Manifest V3
- OpenAI / OpenRouter API

## Installation

1. Clone the repository.
2. Open `chrome://extensions`.
3. Enable **Developer Mode**.
4. Click **Load unpacked** and select the extension folder.
5. Add your API key from the extension popup.

## Future Improvements

- Add suggestion caching.
- Improve rich-text editor support.
- Add model and prompt customization.
