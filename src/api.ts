// Zugriff auf hosting/api.php. Läuft die App ohne Server (GitHub Pages), gibt es keine API: dann nur Diagnose.

export interface Me {
  user: string | null;
  admin: boolean;
  mustChangePassword: boolean;
  zip: boolean;
  perUser: boolean;
}
export interface FileEntry {
  name: string;
  size: number;
  mtime: number;
}
export interface Dlc {
  name: string;
  enabled: boolean;
}
export interface UserEntry {
  user: string;
  admin: boolean;
  mustChangePassword: boolean;
}
export interface CheatEntry {
  id: string;
  label: string;
  created: number | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const url = (route: string) => `./api/${route}`;

async function parse<T>(r: Response): Promise<T> {
  const type = r.headers.get('content-type') || '';
  const body = type.includes('json') ? await r.json() : null;
  // Anmeldung unterwegs verloren (Netzwechsel o. Ä.): gleich zur Anmeldung, statt Fehler über Fehler zu zeigen
  if (r.status === 401) setTimeout(() => location.replace('./?login=' + Date.now()), 3000);
  if (!r.ok) throw new ApiError(r.status, (body && body.error) || `Fehler ${r.status}`);
  return body as T;
}

export const api = {
  get: <T>(route: string) => fetch(url(route), { credentials: 'same-origin' }).then((r) => parse<T>(r)),
  post: <T = { ok: true }>(route: string, body?: unknown, raw?: Blob | ArrayBuffer) =>
    fetch(url(route), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-FONV': '1', 'Content-Type': raw ? 'application/octet-stream' : 'application/json' },
      body: raw ?? JSON.stringify(body ?? {}),
    }).then((r) => parse<T>(r)),
  /** Link für Downloads (Speicherstand, Backup) – der Browser schickt die Anmeldung mit. */
  link: (route: string) => url(route),
};

/** Diagnose-Version ohne eigenen Server (GitHub Pages oder lokale Entwicklung). */
export const isDiagnosticHost = (host = location.hostname) =>
  host.endsWith('github.io') || host === 'localhost' || host === '127.0.0.1';

export interface ServerProblem {
  status: number;
  text: string;
}

/** Läuft die App auf dem eigenen Server (mit API)? null = keine API; ServerProblem = API kaputt (z. B. PHP). */
export async function detectServer(): Promise<Me | null | ServerProblem> {
  try {
    const r = await fetch(url('me'), { credentials: 'same-origin' });
    const type = r.headers.get('content-type') || '';
    if (r.ok && type.includes('json')) return (await r.json()) as Me;
    if (isDiagnosticHost()) return null;
    return { status: r.status, text: (await r.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400) };
  } catch (e) {
    return isDiagnosticHost() ? null : { status: 0, text: String(e) };
  }
}
