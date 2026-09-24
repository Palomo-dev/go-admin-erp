'use client';

/**
 * Cliente del navegador para la cartera (Finanzas y POS): solo `fetch` a
 * `/api/cartera`. La organización la resuelve el servidor desde la sesión.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { DetalleCuentaPorCobrar } from './contratoCartera';
import type { RespuestaListadoCartera } from './listadoCartera';

export class ErrorPeticionCartera extends Error {
  constructor(
    public readonly codigo: string,
    public readonly estado: number,
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
  if (!r.ok) throw new ErrorPeticionCartera((cuerpo as { codigo?: string } | null)?.codigo ?? 'error_desconocido', r.status);
  return cuerpo as T;
}

export async function pedirListadoCartera(query: URLSearchParams): Promise<RespuestaListadoCartera> {
  const r = await fetch(`/api/cartera?${query.toString()}`, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() });
  return leer<RespuestaListadoCartera>(r);
}

export async function pedirDetalleCuenta(id: string, origen: 'pos' | 'finanzas'): Promise<DetalleCuentaPorCobrar> {
  const q = origen === 'pos' ? '?origen=pos' : '';
  const r = await fetch(`/api/cartera/${encodeURIComponent(id)}${q}`, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() });
  return leer<DetalleCuentaPorCobrar>(r);
}

export async function enviarRecordatorio(
  id: string,
  cuerpo: { canal: 'correo'; mensaje?: string | null; origen?: 'pos' | 'finanzas' },
): Promise<{ enviado: boolean; destino: string | null }> {
  const r = await fetch(`/api/cartera/${encodeURIComponent(id)}/recordatorio`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: cabeceras(true),
    body: JSON.stringify(cuerpo),
  });
  return (await leer<{ resultado: { enviado: boolean; destino: string | null } }>(r)).resultado;
}
