// Kleine UI-Helfer: HTML escapen, Meldungen, Formatierung.

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function toast(text: string, kind: 'ok' | 'error' = 'ok'): void {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, kind === 'error' ? 5000 : 2500);
}

export function when(ts: number): string {
  return new Date(ts * 1000).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Führt eine Aktion aus, sperrt den Knopf solange und zeigt Fehler als Meldung. */
export async function busy(btn: HTMLButtonElement | null, fn: () => Promise<unknown>): Promise<boolean> {
  if (btn) btn.disabled = true;
  try {
    await fn();
    return true;
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), 'error');
    return false;
  } finally {
    if (btn) btn.disabled = false;
  }
}

/** Datei auswählen lassen (Files-App auf dem iPad). */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export const ICONS: Record<string, string> = {
  play: '<path d="M8 5v14l11-7z"/>',
  saves: '<path d="M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7"/>',
  data: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
  cheats: '<path d="M12 2l2.4 6.9H22l-6 4.6 2.3 7L12 16.2 5.7 20.5 8 13.5 2 8.9h7.6z"/>',
  admin: '<path d="M12 2l8 4v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6z"/>',
  system: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
};
export const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">${ICONS[name] ?? ''}</svg>`;
