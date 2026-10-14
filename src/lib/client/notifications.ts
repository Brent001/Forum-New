export type ToastTone = 'success' | 'error' | 'info' | 'warning';

/** Dispatch a site-wide toast without coupling pages to the global viewport. */
export function notify(message: string, tone: ToastTone = 'info', title?: string) {
  if (typeof window === 'undefined' || !message.trim()) return;
  window.dispatchEvent(new CustomEvent('nexus:toast', {
    detail: { message: message.trim(), tone, title }
  }));
}

/** Show a toast after the next full-page navigation/reload (for redirecting forms). */
export function notifyOnNextPage(message: string, tone: ToastTone = 'info', title?: string) {
  if (typeof window === 'undefined' || !message.trim()) return;
  try { sessionStorage.setItem('nexus:flash-toast', JSON.stringify({ message: message.trim(), tone, title })); } catch { /* storage can be unavailable in privacy modes */ }
}
