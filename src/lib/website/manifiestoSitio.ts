/**
 * Contrato del manifiesto de secciones que publica el sitio.
 * Puro: el route handler lo usa para no aceptar HTML ni un JSON de otra forma.
 */
import type { SectionManifest } from '@/lib/services/website/sectionContract';

/** Host DNS público, sin puerto, usuario ni ruta. */
const HOST_PUBLICO = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function hostPublicoSeguro(host: string | null | undefined): string | null {
  if (!host) return null;
  const limpio = host.trim().toLowerCase().replace(/\.$/, '');
  if (limpio.length === 0 || limpio.length > 253 || limpio.includes('..')) return null;
  return HOST_PUBLICO.test(limpio) ? limpio : null;
}

function listaDeTextos(valor: unknown): string[] | null {
  if (!Array.isArray(valor)) return null;
  if (!valor.every((item) => typeof item === 'string')) return null;
  return valor;
}

/** Manifiesto si el cuerpo tiene la forma del contrato; si no, `null`. */
export function manifiestoDeCuerpo(cuerpo: unknown): SectionManifest | null {
  if (!cuerpo || typeof cuerpo !== 'object') return null;
  const fila = cuerpo as { version?: unknown; sections?: unknown };
  if (typeof fila.version !== 'string' || fila.version.length === 0 || fila.version.length > 32) return null;
  if (!Array.isArray(fila.sections)) return null;
  const sections: SectionManifest['sections'] = [];
  for (const item of fila.sections) {
    if (!item || typeof item !== 'object') return null;
    const entrada = item as { type?: unknown; variants?: unknown; contentKeys?: unknown };
    if (typeof entrada.type !== 'string' || entrada.type.length === 0) return null;
    const variants = listaDeTextos(entrada.variants);
    const contentKeys = listaDeTextos(entrada.contentKeys);
    if (!variants || !contentKeys) return null;
    sections.push({ type: entrada.type, variants, contentKeys });
  }
  return { version: fila.version, sections };
}

export function manifiestoValido(cuerpo: unknown): cuerpo is SectionManifest {
  return manifiestoDeCuerpo(cuerpo) !== null;
}
