const STORAGE_KEY = "kc_active_child_id";
const COOKIE_NAME = "kid_profile_id";

export function getStoredActiveChildId(): string | null {
  try {
    const fromStorage = localStorage.getItem(STORAGE_KEY)?.trim();
    if (fromStorage) return fromStorage;
    const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
    if (match?.[1]) return decodeURIComponent(match[1]);
  } catch {}
  return null;
}

export function setStoredActiveChildId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(id)}; Path=/; Secure; SameSite=Lax; Max-Age=31536000`;
  } catch {}
}

export function clearStoredActiveChildId(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    document.cookie = `${COOKIE_NAME}=; Path=/; Secure; SameSite=Lax; Max-Age=0`;
  } catch {}
}
