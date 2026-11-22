'use client';

/**
 * Cliente del navegador para Devoluciones del POS: solo `fetch` a los route
 * handlers (`/api/pos/devoluciones/...`), que resuelven la organización de la
 * sesión. El header `x-organization-id` evita la ambigüedad con varias
 * pestañas (igual que `clienteVentas.ts`).
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { CifrasDevoluciones, PaginaDevoluciones, VentaParaDevolver } from './listadoServidor';
import type { DetalleDevolucion } from './detalleServidor';
import type { DiagnosticoAnulacion, FechaEspejo, ResultadoAnulacion } from './anularDevolucionLogica';

export class ErrorPeticionDevoluciones extends Error {
  constructor(
    readonly codigo: string,
    readonly estado: number,
  ) {
    super(codigo);
  }
}

function cabeceras(): HeadersInit {
  const org = getOrganizationId();
  return org > 0 ? { 'x-organization-id': String(org) } : {};
}

async function pedir<T>(ruta: string, senal?: AbortSignal): Promise<T> {
  const r = await fetch(ruta, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras(), signal: senal });
  const cuerpo = (await r.json().catch(() => null)) as (T & { codigo?: string }) | null;
  if (!r.ok || !cuerpo) throw new ErrorPeticionDevoluciones(cuerpo?.codigo ?? (r.status === 403 ? 'sin_permiso' : 'lectura_fallida'), r.status);
  return cuerpo;
}

export function pedirDevoluciones(consulta: URLSearchParams): Promise<PaginaDevoluciones> {
  return pedir<PaginaDevoluciones>(`/api/pos/devoluciones?${consulta.toString()}`);
}

export function pedirCifrasDevoluciones(consulta: URLSearchParams): Promise<CifrasDevoluciones> {
  return pedir<CifrasDevoluciones>(`/api/pos/devoluciones/cifras?${consulta.toString()}`);
}

export async function pedirVentasParaDevolver(busqueda: string, sucursal: number | null, senal?: AbortSignal): Promise<VentaParaDevolver[]> {
  const q = new URLSearchParams();
  if (busqueda.trim()) q.set('q', busqueda.trim());
  if (sucursal) q.set('sucursal', String(sucursal));
  const r = await pedir<{ ventas: VentaParaDevolver[] }>(`/api/pos/devoluciones/ventas?${q.toString()}`, senal);
  return r.ventas ?? [];
}

export async function pedirCajaParaDevolucion(sucursal: number): Promise<number | null> {
  const r = await pedir<{ sesion_id: number | null }>(`/api/pos/devoluciones/caja?sucursal=${encodeURIComponent(String(sucursal))}`);
  return r.sesion_id ?? null;
}

export function pedirDetalleDevolucion(id: string | number): Promise<DetalleDevolucion> {
  return pedir<DetalleDevolucion>(`/api/pos/devoluciones/${encodeURIComponent(String(id))}`);
}

/** «Anular devolución»: qué diálogo aplica (nota ante la DIAN, periodos, caja). */
export function pedirDiagnosticoAnulacion(id: string | number): Promise<DiagnosticoAnulacion> {
  return pedir<DiagnosticoAnulacion>(`/api/pos/devoluciones/${encodeURIComponent(String(id))}/anular`);
}

/** Anula la devolución; los errores llegan con el código de la RPC. */
export async function enviarAnulacionDevolucion(
  id: string | number,
  motivo: string,
  fechaEspejo: FechaEspejo,
  confirmaciones: { saldoUsado: boolean; mercanciaVuelve: boolean },
): Promise<ResultadoAnulacion> {
  const r = await fetch(`/api/pos/devoluciones/${encodeURIComponent(String(id))}/anular`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...cabeceras() },
    body: JSON.stringify({
      motivo,
      fecha_espejo: fechaEspejo,
      confirmar_saldo_usado: confirmaciones.saldoUsado,
      mercancia_vuelve: confirmaciones.mercanciaVuelve,
    }),
  });
  const cuerpo = (await r.json().catch(() => null)) as (ResultadoAnulacion & { codigo?: string }) | null;
  if (!r.ok || !cuerpo) throw new ErrorPeticionDevoluciones(cuerpo?.codigo ?? (r.status === 403 ? 'sin_permiso' : 'generico'), r.status);
  return cuerpo;
}
