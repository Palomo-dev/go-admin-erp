'use client';

/**
 * Cliente de `/api/sitio-web/legales/*`. La organización sale de la sesión.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { ErrorApiPaginas, type ContextoEscritura } from '../paginas/apiPaginas';
import type { RespuestaEscrituraPaginas } from '../paginas/tiposPaginas';
import type { ClaveLegal } from '@/lib/website/configuracionSitio';

export interface VistaLegal {
  usados: { etiqueta: string; valor: string }[];
  faltantes: string[];
  origenPrevisto: 'ia' | 'plantilla';
}

export interface ConfirmacionLegal {
  actual: string;
  propuesto: string;
  origen: 'ia' | 'plantilla';
  faltantes: string[];
  diff: string;
}

export interface AplicadoLegal extends RespuestaEscrituraPaginas {
  origen: 'ia' | 'plantilla';
  faltantes: string[];
}

export class ErrorConfirmacionLegal extends Error {
  constructor(public readonly confirmacion: ConfirmacionLegal) {
    super('requiere_confirmacion');
    this.name = 'ErrorConfirmacionLegal';
  }
}

async function pedir<T>(ruta: string, body: unknown): Promise<T> {
  const org = getOrganizationId();
  const respuesta = await fetch(ruta, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(org > 0 ? { 'x-organization-id': String(org) } : {}) },
    body: JSON.stringify(body),
  });
  const cuerpo = (await respuesta.json().catch(() => null)) as {
    error?: { code?: string; message?: string; details?: ConfirmacionLegal };
  } | null;
  if (!respuesta.ok) {
    const code = cuerpo?.error?.code ?? 'error_interno';
    if (code === 'requiere_confirmacion' && cuerpo?.error?.details) throw new ErrorConfirmacionLegal(cuerpo.error.details);
    throw new ErrorApiPaginas(respuesta.status, code, cuerpo?.error?.message ?? '');
  }
  return cuerpo as T;
}

export const apiLegales = {
  vista(clave: ClaveLegal): Promise<VistaLegal> {
    return pedir('/api/sitio-web/legales/generar', { accion: 'vista', clave, sitio: 'principal' });
  },
  aplicar(
    ctx: ContextoEscritura,
    entrada: { clave: ClaveLegal; confirmar?: boolean; texto?: string; origen?: 'ia' | 'plantilla' },
  ): Promise<AplicadoLegal> {
    return pedir('/api/sitio-web/legales/generar', {
      accion: 'aplicar',
      sitio: ctx.branchId ?? 'principal',
      version: ctx.version,
      ...entrada,
    });
  },
};

export async function urlPoliticaPublica(): Promise<string | null> {
  const org = getOrganizationId();
  const respuesta = await fetch('/api/sitio-web/legales/politica', {
    credentials: 'same-origin',
    headers: org > 0 ? { 'x-organization-id': String(org) } : {},
  });
  if (!respuesta.ok) return null;
  const cuerpo = (await respuesta.json()) as { url?: string | null };
  return typeof cuerpo.url === 'string' ? cuerpo.url : null;
}
