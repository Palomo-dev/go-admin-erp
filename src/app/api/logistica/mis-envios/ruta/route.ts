/**
 * GET /api/logistica/mis-envios/ruta — «Ver la ruta de» del supervisor de despacho (Figma
 * «21 Logística» c 3216-110925 y celular «20»).
 *
 * - Sin `domiciliario`: los domiciliarios activos con su carga del día, su vehículo por defecto y
 *   el peor documento (para el selector y los chips).
 * - Con `domiciliario=<id>`: ese domiciliario y su ruta de hoy (la MISMA lectura que «Mis envíos»
 *   del domiciliario: `listarMisEnvios`).
 *
 * Sesión + organización (`withOrg`, la organización nunca sale de la URL). Permiso resuelto aquí
 * (regla dura 6): `fn_logistica_gestiona` (`logistica.manage`, el cargo de quien despacha); sin él,
 * 403. Se lee con el cliente de la sesión (RLS) y filtrando por la organización de la sesión: el id
 * de otra organización no existe para esta consulta (404). Solo lee: reasignar y registrar novedad
 * van por sus RPC, que vuelven a validar.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { puedeGestionarDomiciliarios } from '@/lib/logistica/permisosDomiciliarios.server';
import { opcionesRutaDe, type DomiciliarioParaSelector } from '@/lib/logistica/supervisorRuta';
import { listarDomiciliarios } from '@/lib/services/logistica/domiciliariosService';
import { enviosDeDomiciliarios } from '@/lib/services/logistica/despachoService';
import { listarMisEnvios } from '@/lib/services/logistica/misEnviosService';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { addPlainDays, startOfDayInstant, toPlainDate } from '@/lib/utils/dateCore';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withOrg(async (ctx, request) => {
  if (!(await puedeGestionarDomiciliarios(ctx))) {
    return NextResponse.json({ error: 'Sin permiso', code: 'SIN_PERMISO' }, { status: 403 });
  }
  const domiciliario = new URL(request.url).searchParams.get('domiciliario');
  if (domiciliario && !UUID.test(domiciliario)) {
    return NextResponse.json({ error: 'Domiciliario inválido', code: 'DOMICILIARIO_INVALIDO' }, { status: 400 });
  }
  try {
    const zona = await getOrganizationTimezone(ctx.organizationId, ctx.supabase);
    const hoy = toPlainDate(new Date(), zona);

    if (!domiciliario) {
      const [lista, envios] = await Promise.all([
        listarDomiciliarios(ctx.supabase, ctx.organizationId),
        enviosDeDomiciliarios(ctx.supabase, ctx.organizationId, startOfDayInstant(hoy, zona).toISOString()),
      ]);
      // Vencimientos del vehículo por defecto (el listado trae placa y tipo, no los documentos).
      const ids = [...new Set(lista.map((d) => d.default_vehicle_id).filter((x): x is string => !!x))];
      const vencimientos = new Map<string, { soat_expiry: string | null; techno_expiry: string | null }>();
      if (ids.length > 0) {
        const { data, error } = await ctx.supabase
          .from('vehicles')
          .select('id, soat_expiry, techno_expiry')
          .eq('organization_id', ctx.organizationId)
          .in('id', ids);
        if (error) throw error;
        for (const v of (data ?? []) as Array<{ id: string; soat_expiry: string | null; techno_expiry: string | null }>) vencimientos.set(v.id, v);
      }
      const conDocs: DomiciliarioParaSelector[] = lista.map((d) => ({
        ...d,
        vehiculo: d.vehiculo ? { ...d.vehiculo, ...(vencimientos.get(d.vehiculo.id) ?? {}) } : null,
      }));
      return NextResponse.json({ hoy, opciones: opcionesRutaDe(conDocs, envios, hoy, zona) });
    }

    const { data: driver, error } = await ctx.supabase
      .from('driver_credentials')
      .select('id, organization_id, branch_id, full_name, phone, vehicle_type, default_vehicle_id, license_category, license_expiry, is_active, metadata')
      .eq('organization_id', ctx.organizationId)
      .eq('id', domiciliario)
      .maybeSingle();
    if (error) throw error;
    if (!driver) return NextResponse.json({ error: 'No existe', code: 'NO_ENCONTRADO' }, { status: 404 });

    // Desde el inicio de AYER en la zona de la organización (igual que la app del domiciliario).
    const desde = startOfDayInstant(addPlainDays(hoy, -1), zona).toISOString();
    const envios = await listarMisEnvios(ctx.supabase, ctx.organizationId, domiciliario, desde);
    return NextResponse.json({ hoy, domiciliario: driver, envios });
  } catch (err) {
    console.error('[logistica/mis-envios/ruta] falló', {
      organizationId: ctx.organizationId,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Error interno', code: 'ERROR' }, { status: 500 });
  }
});
