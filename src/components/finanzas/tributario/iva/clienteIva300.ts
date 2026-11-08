/**
 * Cliente del navegador para el borrador del 300 por casillas y los datos
 * fiscales de las líneas (`/api/finanzas/tributario/iva/{300,lineas,naturaleza,declaracion}`).
 * La organización viaja solo como cabecera de la sesión; el servidor la vuelve
 * a resolver y decide permisos. Errores como `ErrorTributarioCliente`.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { Formulario300, LineaFiscal, SolicitudClasificacion, TipoDocumentoLineas } from '@/lib/finanzas/tributario/formulario300';
import { ErrorTributarioCliente } from '../tributarioCliente';

function cabeceras(json = false): HeadersInit {
  const org = getOrganizationId();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(org > 0 ? { 'x-organization-id': String(org) } : {}),
  };
}

async function leer<T>(r: Response): Promise<T> {
  let cuerpo: unknown = null;
  try {
    cuerpo = await r.json();
  } catch {
    cuerpo = null;
  }
  if (!r.ok) {
    const c = (cuerpo ?? {}) as { codigo?: unknown };
    throw new ErrorTributarioCliente(typeof c.codigo === 'string' ? c.codigo : r.status === 403 ? 'sin_permiso' : 'desconocido', r.status);
  }
  return cuerpo as T;
}

const get = <T>(ruta: string) => fetch(ruta, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() }).then((r) => leer<T>(r));
const post = <T>(ruta: string, cuerpo: unknown) =>
  fetch(ruta, { method: 'POST', credentials: 'same-origin', headers: cabeceras(true), body: JSON.stringify(cuerpo) }).then((r) => leer<T>(r));

export type Formulario300Cliente = ({ estado: 'listo'; formulario: Formulario300 } | { estado: 'pendiente_activar' }) & {
  puedeClasificar: boolean;
  puedeAprobar: boolean;
};

export type LineasCliente = ({ estado: 'listo'; lineas: LineaFiscal[] } | { estado: 'pendiente_activar' }) & { puedeClasificar: boolean };

const q = (o: Record<string, string>) => new URLSearchParams(o).toString();

export const clienteIva300 = {
  formulario: (desde: string, hasta: string) => get<Formulario300Cliente>(`/api/finanzas/tributario/iva/300?${q({ desde, hasta })}`),
  lineas: (tipo: TipoDocumentoLineas, id: string) => get<LineasCliente>(`/api/finanzas/tributario/iva/lineas?${q({ tipo, id })}`),
  clasificar: (tabla: LineaFiscal['tabla'], id: string, datos: SolicitudClasificacion) =>
    post<{ clasificacion: unknown }>('/api/finanzas/tributario/iva/lineas', { tabla, id, datos }),
  naturaleza: (cuerpo: Record<string, unknown>) => post<{ naturaleza: unknown }>('/api/finanzas/tributario/iva/naturaleza', cuerpo),
  declaracion: (cuerpo: Record<string, unknown>) => post<{ declaracion: unknown }>('/api/finanzas/tributario/iva/declaracion', cuerpo),
};
