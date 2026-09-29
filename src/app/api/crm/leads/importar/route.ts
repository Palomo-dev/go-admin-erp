import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, hasOrgAdminOrPermission, OrgContextError, readOrgBody } from '@/lib/utils/orgContext';
import { leerEntradaImportacion, maxFilasPorArchivo } from '@/lib/crm/importacionLeads/entrada';
import { importarBloque, LEADS_CREATE_PERMISSION, validarImportacion } from '@/lib/services/crm/leadsImportService';

/** Cada bloque crea hasta 50 leads (≈ 10 consultas por alta). */
export const maxDuration = 60;

/**
 * POST /api/crm/leads/importar — importación de leads desde archivo.
 *
 * Body: { accion: 'validar' | 'importar', filas: FilaLeadEntrada[], opciones: {
 *   lote, tipoCliente?, monedaValor?, pais?, archivo? } }
 *
 *  - `validar`: vista previa sin escribir (hasta `LEADS_IMPORT_MAX_FILAS`, 1.000 por defecto).
 *  - `importar`: crea los leads de un bloque (hasta 50 filas por petición;
 *    el asistente manda bloques de 25). Idempotente por (organización, lote +
 *    id externo, teléfono, NIT, correo): reintentar un bloque no duplica.
 *
 * La organización sale de la sesión (`getServerOrgContext`); una organización
 * ajena en el body o en la query → 403 (`readOrgBody`). Sin el permiso → 403.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Cuerpo JSON inválido' }, { status: 400 });
    }
    readOrgBody(ctx, body, { request });

    if (!(await hasOrgAdminOrPermission(ctx, LEADS_CREATE_PERMISSION))) {
      console.warn('[CRM Leads importar] sin permiso %s (org %s, usuario %s)', LEADS_CREATE_PERMISSION, ctx.organizationId, ctx.userId);
      return NextResponse.json({ success: false, error: 'No tienes permiso para crear leads', code: 'FORBIDDEN' }, { status: 403 });
    }

    const entrada = leerEntradaImportacion(body, maxFilasPorArchivo());
    if (!entrada.ok) return NextResponse.json({ success: false, error: entrada.error }, { status: entrada.status });

    const importCtx = { organizationId: ctx.organizationId, userId: ctx.userId, supabase: ctx.supabase };
    if (entrada.accion === 'validar') {
      const r = await validarImportacion(importCtx, entrada.filas, entrada.opciones);
      return NextResponse.json({ success: true, ...r }, { status: 200 });
    }
    const r = await importarBloque(importCtx, entrada.filas, entrada.opciones);
    return NextResponse.json({ success: true, ...r }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Leads importar] POST error:', message);
    return NextResponse.json({ success: false, error: 'No se pudo procesar la importación' }, { status: 500 });
  }
}
