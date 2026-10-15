import { collectPageData, type PageData } from './page';
import { startPopup } from './popup';
import './popup.css';

const STORAGE_KEY = 'appUrl';

/** Liga a janelinha às APIs do Chrome. */
void startPopup(document.getElementById('app')!, {
  async getActiveTab() {
    // `popup.html?aba=<id>`: abre a janelinha numa aba para testar com outra
    // aba (docs/features/21-extension.md). Sem o parâmetro, a aba ativa.
    const forced = Number(new URLSearchParams(location.search).get('aba'));
    if (Number.isInteger(forced) && forced > 0) {
      const tab = await chrome.tabs.get(forced);
      return { id: tab.id, url: tab.url, title: tab.title };
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return { id: tab?.id, url: tab?.url, title: tab?.title };
  },
  // Só roda quando você clica na extensão (permissão activeTab), na aba
  // aberta, e só fora dos sites restritos (page.ts decide).
  async readPage(tabId) {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: collectPageData,
    });
    return (result?.result as PageData | undefined) ?? null;
  },
  fetch: (...args) => fetch(...args),
  async loadAppUrl() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return typeof stored[STORAGE_KEY] === 'string' ? stored[STORAGE_KEY] : null;
  },
  async saveAppUrl(url) {
    await chrome.storage.local.set({ [STORAGE_KEY]: url });
  },
  openTab(url) {
    void chrome.tabs.create({ url });
    window.close();
  },
});
