/**
 * bridge.js — Content script injetado no admin.html (falaw.com.br)
 * Faz a ponte entre os botões da página e o background service worker.
 */

// Escuta mensagens do background e repassa para a página
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'FALAW_SYNC_PROGRESS' || msg.type === 'FALAW_SYNC_DONE') {
    window.dispatchEvent(new CustomEvent('falaw-ext-msg', { detail: msg }));
  }
});

// Escuta pedidos da página (admin.html chama window.dispatchEvent)
window.addEventListener('falaw-sync-request', () => {
  chrome.runtime.sendMessage({ type: 'FALAW_START_SYNC' }, (resp) => {
    window.dispatchEvent(new CustomEvent('falaw-ext-msg', {
      detail: { type: 'FALAW_SYNC_STARTED', ok: resp?.ok, msg: resp?.msg },
    }));
  });
});

// Sinaliza para a página que a extensão está instalada
window.dispatchEvent(new CustomEvent('falaw-ext-ready'));
