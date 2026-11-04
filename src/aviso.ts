// The notice the docente accepts before the extension takes any grades (Chrome Web
// Store «Disclosure Requirements»). A new wording gets a new version, and asks again.

export const VERSION_DEL_AVISO = 1;

export async function avisoAceptado(): Promise<boolean> {
  const { aviso } = (await chrome.storage.local.get("aviso")) as { aviso?: number };
  return aviso === VERSION_DEL_AVISO;
}
