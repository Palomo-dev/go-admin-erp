/**
 * GET /api/logistica/envios/[id]/evidencias — enlaces firmados de corta duración para las fotos,
 * la firma y las fotos de novedad de un envío (bucket PRIVADO `shipment-pod`, migración
 * 20261123165515).
 *
 * - Sesión + organización (`withOrg`); una query con otra organización responde 403 (`readOrgBody`).
 * - Todo con el cliente de la SESIÓN (RLS): si la persona no ve el envío —otra organización, o un
 *   domiciliario mirando un envío que no es suyo— responde 404. Storage vuelve a comprobarlo al
 *   firmar (política `shipment_pod_select_miembros`).
 * - Las rutas salen de la base (`proof_of_delivery`, `delivery_attempts`), nunca del navegador, y
 *   solo se firman las que están en la carpeta `{organización}/{envío}/` (`rutaEvidencia`).
 *
 * Respuesta: `{ urls: { [valorGuardado]: enlaceFirmado }, expiraEnSegundos }`. Sin caché.
 */
import { NextResponse } from 'next/server';
import { readOrgBody, withOrg } from '@/lib/utils/orgContext';
import { BUCKET_EVIDENCIAS, DURACION_ENLACE_EVIDENCIA, rutaEvidencia, valoresEvidencia } from '@/lib/logistica/evidencias';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const GET = withOrg(async (ctx, request, routeParams) => {
  readOrgBody(ctx, {}, { request, route: 'logistica/envios/[id]/evidencias' });
  const params = (await routeParams?.params) ?? {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'Envío no encontrado', code: 'NO_ENCONTRADO' }, { status: 404 });

  const db = ctx.supabase;
  const { data: envio, error: errEnvio } = await db.from('shipments').select('id').eq('id', id).eq('organization_id', ctx.organizationId).maybeSingle();
  if (errEnvio) {
    console.error('[logistica/evidencias] lectura del envío falló', { organizationId: ctx.organizationId, message: errEnvio.message });
    return NextResponse.json({ error: 'Error interno', code: 'ERROR' }, { status: 500 });
  }
  if (!envio) return NextResponse.json({ error: 'Envío no encontrado', code: 'NO_ENCONTRADO' }, { status: 404 });

  const [prueba, intentos] = await Promise.all([
    db.from('proof_of_delivery').select('signature_url, photo_urls').eq('shipment_id', id).maybeSingle(),
    db.from('delivery_attempts').select('photo_urls').eq('shipment_id', id),
  ]);
  if (prueba.error || intentos.error) {
    console.error('[logistica/evidencias] lectura de evidencias falló', {
      organizationId: ctx.organizationId,
      message: prueba.error?.message ?? intentos.error?.message,
    });
    return NextResponse.json({ error: 'Error interno', code: 'ERROR' }, { status: 500 });
  }

  const porRuta = new Map<string, string[]>();
  for (const valor of valoresEvidencia(prueba.data, intentos.data)) {
    const ruta = rutaEvidencia(valor, ctx.organizationId, id);
    if (ruta) porRuta.set(ruta, [...(porRuta.get(ruta) ?? []), valor]);
  }

  const urls: Record<string, string> = {};
  if (porRuta.size > 0) {
    const { data: firmadas, error } = await db.storage.from(BUCKET_EVIDENCIAS).createSignedUrls([...porRuta.keys()], DURACION_ENLACE_EVIDENCIA);
    if (error) {
      console.error('[logistica/evidencias] firma falló', { organizationId: ctx.organizationId, message: error.message });
      return NextResponse.json({ error: 'Error interno', code: 'ERROR' }, { status: 500 });
    }
    for (const f of firmadas ?? []) {
      if (!f.signedUrl || !f.path) continue;
      for (const valor of porRuta.get(f.path) ?? []) urls[valor] = f.signedUrl;
    }
  }

  return NextResponse.json({ urls, expiraEnSegundos: DURACION_ENLACE_EVIDENCIA }, { headers: SIN_CACHE });
});
