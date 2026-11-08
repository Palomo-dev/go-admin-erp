/**
 * IVA · servidor del borrador del formulario 300 por casillas y de la
 * clasificación fiscal por línea (migraciones 20261108150000, 20261108150500 y
 * 20261108151000). Siempre con el cliente de la SESIÓN (`ctx.supabase`: RLS y
 * `auth.uid()` en las RPC) y la organización de la sesión.
 *
 * Mientras las migraciones no estén aplicadas, «función inexistente» vuelve como
 * `pendiente_activar`: la pantalla lo dice así y nunca pinta ceros.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { esObjetoInexistente } from '@/lib/finanzas/tributario/perfil';
import {
  leerFormulario300,
  leerLineasFiscales,
  type Formulario300,
  type LineaFiscal,
  type NaturalezaMovimiento,
  type SolicitudClasificacion,
  type TipoDocumentoLineas,
} from '@/lib/finanzas/tributario/formulario300';
import { ErrorTributario } from './tributario.server';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'supabase'>;
type ErrorBase = { code?: string; message?: string } | null;

/** Error de la RPC → `ErrorTributario` con un código estable para la pantalla. */
function traducir(error: ErrorBase): ErrorTributario {
  const code = error?.code ?? '';
  const msg = (error?.message ?? '').trim();
  if (esObjetoInexistente(error)) return new ErrorTributario('pendiente_activar', 501);
  if (code === '42501') return new ErrorTributario('sin_permiso', 403);
  if (code === 'P0002') return new ErrorTributario('no_encontrado', 404);
  if (code === '23P01') return new ErrorTributario('periodo_solapado', 409);
  if (code === '22023' && /^[A-Z_]+$/.test(msg)) return new ErrorTributario(msg.toLowerCase(), 400);
  return new ErrorTributario('desconocido', 500);
}

export type LecturaFormulario300 = { estado: 'listo'; formulario: Formulario300 } | { estado: 'pendiente_activar' };

export async function leerFormulario300Servidor(ctx: Ctx, desde: string, hasta: string): Promise<LecturaFormulario300> {
  const { data, error } = await ctx.supabase.rpc('fn_tributario_borrador_iva_300', {
    p_organization_id: ctx.organizationId,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) {
    const e = traducir(error as ErrorBase);
    if (e.codigo === 'pendiente_activar') return { estado: 'pendiente_activar' };
    if (e.status >= 500) console.error('[iva300] fn_tributario_borrador_iva_300', { organizationId: ctx.organizationId, code: (error as ErrorBase)?.code });
    throw e;
  }
  return { estado: 'listo', formulario: leerFormulario300(data) };
}

export type LecturaLineas = { estado: 'listo'; lineas: LineaFiscal[] } | { estado: 'pendiente_activar' };

export async function leerLineasDocumento(ctx: Ctx, tipo: TipoDocumentoLineas, id: string): Promise<LecturaLineas> {
  const { data, error } = await ctx.supabase.rpc('fn_iva_lineas_documento', {
    p_organization_id: ctx.organizationId,
    p_tipo: tipo,
    p_id: id,
  });
  if (error) {
    const e = traducir(error as ErrorBase);
    if (e.codigo === 'pendiente_activar') return { estado: 'pendiente_activar' };
    throw e;
  }
  return { estado: 'listo', lineas: leerLineasFiscales(data) };
}

export async function clasificarLinea(ctx: Ctx, tabla: 'invoice_items' | 'sale_items', id: string, datos: SolicitudClasificacion): Promise<unknown> {
  const { data, error } = await ctx.supabase.rpc('fn_iva_clasificar_linea', {
    p_organization_id: ctx.organizationId,
    p_tabla: tabla,
    p_linea_id: id,
    p_datos: datos,
  });
  if (error) throw traducir(error as ErrorBase);
  return data;
}

export interface SolicitudNaturaleza {
  naturaleza: NaturalezaMovimiento;
  invoice_purchase_id: string | null;
  base: number | null;
  soporte: string | null;
  nota: string | null;
}

export async function guardarNaturaleza(ctx: Ctx, asiento: number, datos: SolicitudNaturaleza | null): Promise<unknown> {
  const { data, error } = await ctx.supabase.rpc('fn_iva_naturaleza_asiento_guardar', {
    p_organization_id: ctx.organizationId,
    p_journal_entry_id: asiento,
    p_datos: datos,
  });
  if (error) throw traducir(error as ErrorBase);
  return data;
}

export interface SolicitudDeclaracion {
  numero_formulario: string | null;
  presentada_en: string;
  nota: string | null;
}

export async function guardarDeclaracion(ctx: Ctx, desde: string, hasta: string, datos: SolicitudDeclaracion | null): Promise<unknown> {
  const { data, error } = await ctx.supabase.rpc('fn_tributario_iva_declaracion_guardar', {
    p_organization_id: ctx.organizationId,
    p_desde: desde,
    p_hasta: hasta,
    p_datos: datos,
  });
  if (error) throw traducir(error as ErrorBase);
  return data;
}
