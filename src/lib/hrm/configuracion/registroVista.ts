/**
 * Lógica pura del «Registro de accesos» (diseño 10.RH.3): el navegador y el
 * sistema a partir del agente guardado, sin librerías ni red.
 */

const NAVEGADORES: readonly [RegExp, string][] = [
  [/edg\//i, 'Edge'],
  [/opr\/|opera/i, 'Opera'],
  [/firefox\//i, 'Firefox'],
  [/chrome\/|crios\//i, 'Chrome'],
  [/safari\//i, 'Safari'],
];

const SISTEMAS: readonly [RegExp, string][] = [
  [/android/i, 'Android'],
  [/iphone|ipad|ios/i, 'iOS'],
  [/windows/i, 'Windows'],
  [/mac os|macintosh/i, 'macOS'],
  [/linux/i, 'Linux'],
];

/** «Chrome · Windows», «App · Android» o null si no se reconoce nada. */
export function agenteCorto(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const app = /goadmin|capacitor|electron/i.test(ua) ? 'App' : null;
  const navegador = app ?? NAVEGADORES.find(([re]) => re.test(ua))?.[1] ?? null;
  const sistema = SISTEMAS.find(([re]) => re.test(ua))?.[1] ?? null;
  const partes = [navegador, sistema].filter(Boolean);
  return partes.length > 0 ? partes.join(' · ') : null;
}
