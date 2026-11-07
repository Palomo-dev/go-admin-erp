'use client';

/**
 * Cliente del navegador para documento soporte: solo `fetch` a los route
 * handlers. Nada se escribe desde el navegador. El envío a la DIAN y el borrado
 * en el proveedor siguen en `/api/factus/support-document` (cola y credenciales
 * de la organización, sin cambios).
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { ContextoSoporte, DatosSoporte, DetalleSoporte, ErrorSoporte, RespuestaListadoSoporte, ResultadoGuardarSoporte } from './contratoSoporte';

export class ErrorPeticionSoporte extends Error {
  constructor(
    public readonly codigo: ErrorSoporte | string,
    public readonly estado: number,
    public readonly mensaje: string | null = null,
  ) {
    super(codigo);
  }
}

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
    const c = (cuerpo ?? {}) as { codigo?: string; code?: string; error?: string };
    const codigo = c.codigo ?? (r.status === 403 ? 'sin_permiso' : r.status === 404 ? 'documento_no_encontrado' : 'error_desconocido');
    throw new ErrorPeticionSoporte(codigo, r.status, c.error ?? null);
  }
  return cuerpo as T;
}

const BASE = '/api/documentos-soporte';

export async function pedirListadoSoporte(consulta: URLSearchParams): Promise<RespuestaListadoSoporte> {
  const r = await fetch(`${BASE}?${consulta.toString()}`, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() });
  return leer<RespuestaListadoSoporte>(r);
}

export async function pedirDetalleSoporte(id: string): Promise<DetalleSoporte> {
  const r = await fetch(`${BASE}/${encodeURIComponent(id)}`, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() });
  return leer<DetalleSoporte>(r);
}

export async function pedirContextoSoporte(sucursal: number | null): Promise<ContextoSoporte> {
  const q = sucursal ? `?sucursal=${sucursal}` : '';
  const r = await fetch(`${BASE}/contexto${q}`, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() });
  return leer<ContextoSoporte>(r);
}

export async function guardarSoporte(id: string | null, datos: DatosSoporte): Promise<ResultadoGuardarSoporte> {
  const r = await fetch(id ? `${BASE}/${encodeURIComponent(id)}` : BASE, {
    method: id ? 'PUT' : 'POST',
    credentials: 'same-origin',
    headers: cabeceras(true),
    body: JSON.stringify(datos),
  });
  return (await leer<{ resultado: ResultadoGuardarSoporte }>(r)).resultado;
}

export async function eliminarSoporte(id: string): Promise<void> {
  const r = await fetch(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin', headers: cabeceras() });
  await leer<{ ok: true }>(r);
}

/** Borrado en el proveedor (rechazado o con error): best effort, como antes. */
export async function eliminarEnProveedor(referencia: string): Promise<void> {
  try {
    await fetch(`/api/factus/support-document?ref=${encodeURIComponent(referencia)}`, { method: 'DELETE', credentials: 'same-origin', headers: cabeceras() });
  } catch {
    /* se sigue aunque falle, como la pantalla vieja */
  }
}

export type ResultadoEnvioSoporte =
  | { tipo: 'aceptado' | 'enviado'; numero: string | null }
  | { tipo: 'en_cola' | 'retenido'; mensaje: string | null }
  | { tipo: 'rechazado'; mensaje: string | null };

/**
 * Envía a la DIAN por la ruta de siempre (`POST /api/factus/support-document`):
 * encola y, con el servicio activo, procesa ya. Traduce su respuesta
 * (`respuestaDeEnvio`) a un resultado para la pantalla.
 */
export async function enviarSoporteDian(id: string): Promise<ResultadoEnvioSoporte> {
  const r = await fetch('/api/factus/support-document', {
    method: 'POST',
    credentials: 'same-origin',
    headers: cabeceras(true),
    body: JSON.stringify({ supportDocumentId: id }),
  });
  const c = ((await r.json().catch(() => ({}))) ?? {}) as { status?: string; message?: string; error?: string; data?: { number?: string | null } };
  if (r.status === 422) return { tipo: 'rechazado', mensaje: c.error ?? null };
  if (!r.ok) throw new ErrorPeticionSoporte(r.status === 403 ? 'sin_permiso' : r.status === 404 ? 'documento_no_encontrado' : 'error_desconocido', r.status, c.error ?? null);
  if (c.status === 'accepted' || c.status === 'sent') return { tipo: c.status === 'accepted' ? 'aceptado' : 'enviado', numero: c.data?.number ?? null };
  if (c.status === 'pending_activation') return { tipo: 'retenido', mensaje: c.message ?? null };
  return { tipo: 'en_cola', mensaje: c.message ?? null };
}

/** XML del proveedor (solo aceptado y con número). */
export async function descargarXmlSoporte(numero: string): Promise<void> {
  const r = await fetch(`/api/factus/support-document/download?type=xml&number=${encodeURIComponent(numero)}`, { credentials: 'same-origin', headers: cabeceras() });
  if (!r.ok) throw new ErrorPeticionSoporte('error_desconocido', r.status);
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement('a');
  a.href = url;
  a.download = `documento-soporte-${numero}.xml`;
  window.document.body.appendChild(a);
  a.click();
  window.document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
