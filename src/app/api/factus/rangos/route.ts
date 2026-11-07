/**
 * Resoluciones y numeración (Configuración › Facturación electrónica).
 *
 * GET  /api/factus/rangos  (`finance.view`)
 *   Rangos de `invoice_sequences` de la organización con el nombre de la
 *   sucursal. La clave técnica NO viaja: solo `tieneClaveTecnica`.
 *
 * POST /api/factus/rangos  (administrador o `finance.approve`, como sincronizar)
 *   { id, ...campos }: edita un rango existente de la organización. Antes el
 *   navegador escribía la tabla directamente y, al guardar, movía el rango a la
 *   sucursal guardada en `localStorage` (o a la sucursal «2»): aquí la sucursal
 *   solo cambia si se envía y es de la organización. `technicalKey` ausente =
 *   no se toca. Crear rangos no se ofrece: los registra GO Admin ante el
 *   proveedor y llegan con «Sincronizar» (decisión Q-FE2 del diseño).
 *
 * Organización de la sesión; permisos en el servidor.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrg, readOrgBody, requireOrgAdminOrPermission, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { validarRango, type DatosRango } from '@/lib/finanzas/facturacionElectronica/resolucionesLogica';

const RUTA = 'factus/rangos';

export const dynamic = 'force-dynamic';

const COLUMNAS =
  'id, branch_id, document_type, prefix, resolution_number, resolution_date, range_start, range_end, current_number, valid_from, valid_until, is_active, alert_threshold, factus_numbering_range_id, test_set_id, technical_key, branch:branches(name)';

const dia = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]);

const esquema = z.object({
  id: z.number().int().positive(),
  branchId: z.number().int().positive().optional(),
  documentType: z.enum(['invoice', 'credit_note', 'debit_note', 'support_document']),
  prefix: z.string().max(10),
  rangeStart: z.number().int().min(0),
  rangeEnd: z.number().int().min(0),
  currentNumber: z.number().int().min(0),
  resolutionNumber: z.string().max(40),
  resolutionDate: dia,
  validFrom: dia,
  validUntil: dia,
  technicalKey: z.string().max(200).optional(),
  testSetId: z.string().max(100),
  factusNumberingRangeId: z.number().int().positive().nullable(),
  isActive: z.boolean(),
  alertThreshold: z.number().int().min(0).max(1_000_000),
});

type Fila = Record<string, unknown> & { technical_key?: string | null };

function sinClave(f: Fila) {
  const { technical_key, ...resto } = f;
  return { ...resto, tieneClaveTecnica: !!(technical_key && String(technical_key).trim()) };
}

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);
    const [{ data, error }, puedeEditar] = await Promise.all([
      ctx.supabase.from('invoice_sequences').select(COLUMNAS).eq('organization_id', ctx.organizationId).order('document_type').order('id', { ascending: false }),
      hasOrgAdminOrPermission(ctx, PERMISOS_FINANZAS.APROBAR),
    ]);
    if (error) return NextResponse.json({ error: 'No se pudieron leer los rangos' }, { status: 500 });
    return NextResponse.json({ rangos: ((data ?? []) as Fila[]).map(sinClave), puedeEditar }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    return routeErrorResponse('Factus rangos GET', error);
  }
});

export const POST = withOrg(async (ctx, request) => {
  try {
    const raw = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });
    await requireOrgAdminOrPermission(ctx, PERMISOS_FINANZAS.APROBAR);
    // `readOrgBody` ya rechazó una organización ajena; zod descarta las claves que no conoce.
    const parsed = esquema.safeParse(raw ?? {});
    if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos', code: 'datos_invalidos' }, { status: 400 });
    const d = parsed.data;

    const datos: DatosRango = { ...d, technicalKey: d.technicalKey ?? '' };
    const errores = validarRango(datos);
    if (errores.length > 0) return NextResponse.json({ error: 'Datos inválidos', code: 'datos_invalidos', campos: errores }, { status: 400 });

    const { data: actual } = await ctx.supabase
      .from('invoice_sequences')
      .select('id')
      .eq('id', d.id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (!actual) return NextResponse.json({ error: 'Rango no encontrado', code: 'no_encontrado' }, { status: 404 });

    if (d.branchId !== undefined) {
      const { data: sucursal } = await ctx.supabase.from('branches').select('id').eq('id', d.branchId).eq('organization_id', ctx.organizationId).maybeSingle();
      if (!sucursal) return NextResponse.json({ error: 'Sucursal no encontrada', code: 'sucursal_no_encontrada' }, { status: 404 });
    }

    const cambios: Record<string, unknown> = {
      document_type: d.documentType,
      prefix: d.prefix.trim(),
      range_start: d.rangeStart,
      range_end: d.rangeEnd,
      current_number: d.currentNumber,
      resolution_number: d.resolutionNumber.trim() || null,
      resolution_date: d.resolutionDate || null,
      valid_from: d.validFrom || null,
      valid_until: d.validUntil || null,
      test_set_id: d.testSetId.trim() || null,
      factus_numbering_range_id: d.factusNumberingRangeId,
      is_active: d.isActive,
      alert_threshold: d.alertThreshold,
      updated_at: new Date().toISOString(),
      ...(d.branchId !== undefined ? { branch_id: d.branchId } : {}),
      ...(d.technicalKey !== undefined ? { technical_key: d.technicalKey.trim() || null } : {}),
    };

    const { data, error } = await ctx.supabase
      .from('invoice_sequences')
      .update(cambios)
      .eq('id', d.id)
      .eq('organization_id', ctx.organizationId)
      .select(COLUMNAS)
      .maybeSingle();
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Ya existe ese prefijo para la sucursal y el tipo', code: 'duplicado' }, { status: 409 });
      return NextResponse.json({ error: 'No se pudo guardar el rango', code: 'error' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Rango no encontrado', code: 'no_encontrado' }, { status: 404 });
    return NextResponse.json({ rango: sinClave(data as Fila) });
  } catch (error: unknown) {
    return routeErrorResponse('Factus rangos POST', error);
  }
});
