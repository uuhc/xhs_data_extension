import { ref, onMounted, onUnmounted } from 'vue';

export function useActiveTabUrl() {
  const url = ref('');
  let timer: number | null = null;

  async function refresh() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    url.value = tabs[0]?.url || '';
  }

  function onActivated() {
    refresh();
  }
  function onUpdated(_id: number, changeInfo: chrome.tabs.TabChangeInfo) {
    if (changeInfo.url || changeInfo.status === 'complete') refresh();
  }

  onMounted(() => {
    refresh();
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    timer = setInterval(refresh, 2000) as unknown as number;
  });
  onUnmounted(() => {
    chrome.tabs.onActivated.removeListener(onActivated);
    chrome.tabs.onUpdated.removeListener(onUpdated);
    if (timer) clearInterval(timer);
  });

  return { url, refresh };
}
