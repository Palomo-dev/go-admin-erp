/**
 * Lógica del selector ÚNICO de organización (R4, decisión v2-9;
 * docs/design/AUTH-ACCESO-V2.md §6): orden, búsqueda, estado y el código de
 * invitación pegado por la persona (R6).
 */
import { esFormatoCodigoValido } from '@/lib/auth/formatoCodigoInvitacion';

export interface OrganizacionSeleccion {
  id: number;
  name: string;
  status?: string | null;
}

/** Clave `acceso.seleccion.estado.*` para el estado de la organización. */
export function estadoOrganizacion(status: string | null | undefined): 'active' | 'frozen' | 'deleted' | 'inactive' {
  if (!status || status === 'active') return 'active';
  if (status === 'suspended' || status === 'frozen' || status === 'trial_expired') return 'frozen';
  if (status === 'deleted') return 'deleted';
  return 'inactive';
}

/**
 * Orden: la principal (`profiles.last_org_id`) primero, luego las favoritas,
 * luego por nombre. Con `texto`, solo las que lo contienen (sin distinguir
 * mayúsculas ni tildes).
 */
export function ordenarOrganizaciones<T extends OrganizacionSeleccion>(
  organizaciones: T[],
  opciones: { principalId?: number | null; favoritas?: number[]; texto?: string } = {},
): T[] {
  const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = sinTildes(opciones.texto?.trim() ?? '');
  const favoritas = new Set(opciones.favoritas ?? []);
  const peso = (o: T) => (o.id === opciones.principalId ? 0 : favoritas.has(o.id) ? 1 : 2);
  return organizaciones
    .filter((o) => !q || sinTildes(o.name).includes(q))
    .sort((a, b) => peso(a) - peso(b) || a.name.localeCompare(b.name, 'es'));
}

/**
 * Código de invitación a partir de lo que pegue la persona: el enlace completo
 * del correo (`…/auth/invite?invite_code=XXXX`) o solo el código. `null` si no
 * tiene el formato de un código.
 */
export function extraerCodigoInvitacion(texto: string): string | null {
  const limpio = texto.trim();
  if (!limpio) return null;
  let candidato = limpio;
  const m = /[?&](?:invite_code|code)=([^&#\s]+)/.exec(limpio);
  if (m) {
    try {
      candidato = decodeURIComponent(m[1]);
    } catch {
      candidato = m[1];
    }
  }
  return esFormatoCodigoValido(candidato) ? candidato : null;
}

/** Favoritas guardadas en este navegador (misma clave que el popup de antes). */
export const CLAVE_FAVORITAS = 'favoriteOrgIds';

export function leerFavoritas(storage: Pick<Storage, 'getItem'> | null | undefined): number[] {
  try {
    const crudo = storage?.getItem(CLAVE_FAVORITAS);
    const lista = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(lista) ? lista.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}
