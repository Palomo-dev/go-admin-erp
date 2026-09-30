/**
 * Piezas comunes de las rutas de reportes: el sujeto que corre los reportes
 * sale siempre del contexto de la sesión, y la respuesta de error reutiliza la
 * de compras añadiendo el id del cierre vigente cuando ya existe uno.
 */
import { NextResponse } from 'next/server';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { SIN_CACHE, respuestaError } from '@/lib/services/compras/rutas.server';
import { ErrorCierre } from './cierres/cierres.server';
import type { SujetoReportes } from './acceso.server';

export function sujetoDeContexto(ctx: ServerOrgContext): SujetoReportes {
  return {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    roleId: ctx.roleId,
    isSuperAdmin: ctx.isSuperAdmin,
    memberId: ctx.memberId ?? undefined,
    supabase: ctx.supabase,
  };
}

export function respuestaErrorReportes(etiqueta: string, err: unknown): Response {
  if (err instanceof ErrorCierre && err.existente) {
    return NextResponse.json(
      { error: err.message, codigo: err.code, code: err.code, existente: err.existente },
      { status: err.statusCode, headers: SIN_CACHE },
    );
  }
  return respuestaError(etiqueta, err);
}
