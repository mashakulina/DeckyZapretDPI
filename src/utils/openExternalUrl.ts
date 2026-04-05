/** Открыть URL во внешнем браузере (Steam Deck / Big Picture). */
export function openExternalUrl(url: string): void {
  try {
    const sc = (window as unknown as { SteamClient?: { System?: { OpenInChrome?: (u: string) => void } } })
      .SteamClient;
    sc?.System?.OpenInChrome?.(url);
  } catch {
    /* ignore */
  }
  try {
    window.open(url, "_blank");
  } catch {
    /* ignore */
  }
}
