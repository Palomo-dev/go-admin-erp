/**
 * POST /api/feedback — «Reportar un problema o sugerencia» del header
 * (Figma `02 Componentes` › FeedbackDialog 68:3208).
 *
 * Recibe `multipart/form-data`:
 * - `tipo`: error | sugerencia | pregunta
 * - `descripcion`: texto (1–4000)
 * - `ruta`, `contexto` (JSON): lo que el diálogo adjunta solo
 * - `sucursalId` (opcional), `incluirCorreo` ('1' | '0')
 * - `adjuntos`: hasta 5 imágenes PNG/JPEG/WebP de 5 MB
 *
 * La organización sale de la sesión (`withOrg`). Si el formulario trae otra,
 * 403 y queda registrado (regla 5). La sucursal se acepta solo si pertenece a
 * la organización. La escritura va con el cliente de servicio porque la tabla
 * no tiene política de INSERT: esta ruta es la única puerta.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';

export const dynamic = 'force-dynamic';

const TIPOS = ['error', 'sugerencia', 'pregunta'] as const;
const MAX_ADJUNTOS = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const MIME = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);
/** Tope de reportes por persona en 10 minutos: el botón está en todas las páginas. */
const MAX_POR_VENTANA = 10;

function texto(v: FormDataEntryValue | null, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export const POST = withOrg(async (ctx, req) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Formulario inválido' }, { status: 400 });
  }

  const orgDelCuerpo = form.get('organizationId') ?? form.get('organization_id');
  if (orgDelCuerpo !== null && Number(orgDelCuerpo) !== ctx.organizationId) {
    console.warn('[api/feedback] organización del formulario distinta de la sesión', {
      userId: ctx.userId,
      sesion: ctx.organizationId,
      cuerpo: String(orgDelCuerpo).slice(0, 20),
    });
    return NextResponse.json({ error: 'Organización no permitida' }, { status: 403 });
  }

  const tipo = texto(form.get('tipo'), 20) as (typeof TIPOS)[number];
  if (!TIPOS.includes(tipo)) {
    return NextResponse.json({ error: 'Tipo de reporte inválido' }, { status: 400 });
  }
  const descripcion = texto(form.get('descripcion'), 4000);
  if (!descripcion) {
    return NextResponse.json({ error: 'Cuéntanos qué pasó' }, { status: 400 });
  }

  const archivos = form.getAll('adjuntos').filter((a): a is File => typeof a !== 'string' && a.size > 0);
  if (archivos.length > MAX_ADJUNTOS) {
    return NextResponse.json({ error: `Máximo ${MAX_ADJUNTOS} imágenes` }, { status: 400 });
  }
  for (const a of archivos) {
    if (!MIME.has(a.type)) return NextResponse.json({ error: 'Solo PNG, JPG o WebP' }, { status: 400 });
    if (a.size > MAX_BYTES) return NextResponse.json({ error: 'Cada imagen puede pesar hasta 5 MB' }, { status: 400 });
  }

  let contexto: Record<string, unknown> = {};
  try {
    const crudo = JSON.parse(texto(form.get('contexto'), 4000) || '{}');
    if (crudo && typeof crudo === 'object' && !Array.isArray(crudo)) contexto = crudo as Record<string, unknown>;
  } catch {
    // El contexto es de ayuda: si llega mal, el reporte vale igual.
  }

  const servicio = getServiceClient();

  const desde = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count: recientes } = await servicio
    .from('problem_reports')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.userId)
    .gte('created_at', desde);
  if ((recientes ?? 0) >= MAX_POR_VENTANA) {
    return NextResponse.json({ error: 'Has enviado muchos reportes seguidos. Intenta en unos minutos.' }, { status: 429 });
  }

  // La sucursal solo se guarda si es de la organización de la sesión.
  let sucursalId: number | null = null;
  const sucursal = Number(form.get('sucursalId'));
  if (Number.isInteger(sucursal) && sucursal > 0) {
    const { data } = await ctx.supabase
      .from('branches')
      .select('id')
      .eq('id', sucursal)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    sucursalId = data?.id ?? null;
  }

  const { data: reporte, error } = await servicio
    .from('problem_reports')
    .insert({
      organization_id: ctx.organizationId,
      branch_id: sucursalId,
      user_id: ctx.userId,
      tipo,
      descripcion,
      ruta: texto(form.get('ruta'), 500) || null,
      contexto,
      correo_respuesta: form.get('incluirCorreo') === '1' ? ctx.userEmail : null,
    })
    .select('id')
    .single();

  if (error || !reporte) {
    console.error('[api/feedback] insertar', error?.message);
    return NextResponse.json({ error: 'No se pudo enviar el reporte' }, { status: 500 });
  }

  // Las imágenes se suben después de tener el id: la ruta lo lleva. Si alguna
  // falla, el reporte se conserva con las que sí subieron.
  const rutas: string[] = [];
  for (const [i, archivo] of archivos.entries()) {
    const ruta = `${ctx.organizationId}/${reporte.id}/${i + 1}.${MIME.get(archivo.type)}`;
    const { error: errorSubida } = await servicio.storage
      .from('problem-reports')
      .upload(ruta, Buffer.from(await archivo.arrayBuffer()), { contentType: archivo.type, upsert: false });
    if (errorSubida) console.warn('[api/feedback] adjunto', ruta, errorSubida.message);
    else rutas.push(ruta);
  }
  if (rutas.length > 0) {
    const { error: errorAdjuntos } = await servicio.from('problem_reports').update({ adjuntos: rutas }).eq('id', reporte.id);
    if (errorAdjuntos) console.warn('[api/feedback] guardar adjuntos', errorAdjuntos.message);
  }

  return NextResponse.json(
    { id: reporte.id, correo: form.get('incluirCorreo') === '1' ? ctx.userEmail : null, adjuntos: rutas.length },
    { status: 201 }
  );
});
