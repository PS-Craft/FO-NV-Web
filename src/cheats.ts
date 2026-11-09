// Cheats: Liste (gemeinsam mit public/addons.js im Spiel) und Freischalt-Zustand dieser Sitzung.
import list from '../public/cheats.json';

export interface Cheat {
  id: string;
  label: string;
  cmd: string;
  help: string;
}
export const CHEATS: Cheat[] = list;

/** Bezeichnung des Cheat-Passworts, mit dem in dieser Sitzung freigeschaltet wurde – oder null. */
export function cheatLabel(): string | null {
  try {
    return sessionStorage.getItem('fonv.cheats');
  } catch {
    return null;
  }
}
export function lockCheats(): void {
  try {
    sessionStorage.removeItem('fonv.cheats');
  } catch {
    /* egal */
  }
}
