'use client';

/**
 * Peticiones de la bandeja de envíos y del servicio de facturación electrónica.
 * Todas a rutas con `withOrg` (organización de la sesión); el encabezado
 * `x-organization-id` solo ayuda a elegir la organización activa, el servidor
 * la valida contra la sesión.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { ConteosBandeja, EventoCrudo, FilaEnvio, PasoLinea, TipoDocumentoFe } from '@/lib/finanzas/facturacionElectronica/bandejaLogica';
import type { TipoDocumento } from '@/components/kit/documento/documentos';

export class ErrorPeticion extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string | null,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

export async function pedirJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const org = getOrganizationId();
  const res = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(org > 0 ? { 'x-organization-id': String(org) } : {}),
      ...(init.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ErrorPeticion(res.status, typeof json.code === 'string' ? json.code : null, typeof json.error === 'string' ? json.error : String(res.status));
  }
  return json as T;
}

export interface RespuestaListado {
  filas: FilaEnvio[];
  total: number;
}

export interface RespuestaResumen {
  servicio: { estado: 'active' | 'pending_activation' | 'suspended'; activoDesde: string | null };
  mes: string;
  conteos: ConteosBandeja;
  exito: number | null;
}

export interface RespuestaDetalle {
  fila: FilaEnvio;
  pasos: PasoLinea[];
  tecnico: { codigo: string | null; mensaje: string | null } | null;
}

export type { EventoCrudo };

export const pedirListado = (consulta: string) => pedirJson<RespuestaListado>(`/api/factus/jobs?${consulta}`);
export const pedirResumen = () => pedirJson<RespuestaResumen>('/api/factus/jobs/resumen');
export const pedirDetalle = (id: string) => pedirJson<RespuestaDetalle>(`/api/factus/jobs/${encodeURIComponent(id)}`);

/** Reintentar (POST /api/factus/jobs, `finance.create`). */
export const reintentarEnvio = (jobId: string) =>
  pedirJson<{ success: boolean }>('/api/factus/jobs', { method: 'POST', body: JSON.stringify({ jobId, action: 'retry' }) });

/** Cancelar (DELETE /api/factus/jobs, `finance.void`). */
export const cancelarEnvio = (jobId: string) => pedirJson<{ success: boolean }>(`/api/factus/jobs?jobId=${encodeURIComponent(jobId)}`, { method: 'DELETE' });

/** Enviar retenidos con la fecha de hoy (POST /api/factus/config `liberar`; administrador o `finance.approve`). */
export const liberarRetenidos = (jobIds: readonly string[]) =>
  pedirJson<{ liberados: number; fallidos: number; resultados: Array<{ jobId: string; ok: boolean }> }>('/api/factus/config', {
    method: 'POST',
    body: JSON.stringify({ action: 'liberar', jobIds }),
  });

export const TIPO_CHIP: Readonly<Record<TipoDocumentoFe, TipoDocumento>> = {
  invoice: 'factura',
  credit_note: 'notaCredito',
  debit_note: 'notaDebito',
  support_document: 'documentoSoporte',
};

/** Pantalla del documento (detalle). */
export function rutaDocumento(f: Pick<FilaEnvio, 'tipo' | 'documentoId'>): string | null {
  if (!f.documentoId) return null;
  const id = encodeURIComponent(f.documentoId);
  switch (f.tipo) {
    case 'invoice':
      return `/app/finanzas/facturas-venta/${id}`;
    case 'credit_note':
      return `/app/finanzas/notas-credito/${id}`;
    case 'debit_note':
      return `/app/finanzas/notas-debito/${id}`;
    case 'support_document':
      return `/app/finanzas/documentos-soporte/${id}`;
  }
}

/** Ficha del tercero, para «Corregir el cliente» de un rechazo. */
export function rutaTercero(f: Pick<FilaEnvio, 'tipo' | 'terceroId'>): string | null {
  if (!f.terceroId) return null;
  return f.tipo === 'support_document' ? `/app/inventario/proveedores/${encodeURIComponent(f.terceroId)}` : `/app/clientes/${encodeURIComponent(f.terceroId)}`;
}

/**
 * Descarga el PDF o el XML oficial de un documento aceptado. Las rutas ya
 * existían: factura y notas por id (el servidor resuelve el número DIAN),
 * documento soporte por número.
 */
export async function descargarOficial(f: FilaEnvio, tipo: 'pdf' | 'xml'): Promise<void> {
  const url =
    f.tipo === 'support_document'
      ? `/api/factus/support-document/download?type=${tipo}&number=${encodeURIComponent(f.numeroDian ?? f.numero ?? '')}`
      : `/api/factus/download?type=${tipo}&invoiceId=${encodeURIComponent(f.documentoId ?? '')}`;
  const org = getOrganizationId();
  const res = await fetch(url, { credentials: 'same-origin', headers: org > 0 ? { 'x-organization-id': String(org) } : undefined });
  if (!res.ok) throw new ErrorPeticion(res.status, null, String(res.status));
  const blob = await res.blob();
  const enlace = document.createElement('a');
  const href = URL.createObjectURL(blob);
  enlace.href = href;
  enlace.download = `${f.numeroDian ?? f.numero ?? 'documento'}.${tipo}`;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(href);
}
