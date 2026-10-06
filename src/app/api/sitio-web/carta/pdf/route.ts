/**
 * POST /api/sitio-web/carta/pdf (multipart, campo `archivo`) — «PDF de la carta
 * (opcional)» (Figma B/13-02). Sube el PDF al almacenamiento público de la
 * organización y devuelve su URL; la carta la guarda con «Guardar» (lote único
 * de `guardar_carta`), no aquí.
 *
 * Exige `website.sites.edit` (resuelto en la base) y escribe con service role
 * SOLO bajo el prefijo de la organización de la sesión (`<org>/carta/…`). Solo
 * PDF, hasta 10 MB.
 */
import { NextResponse } from 'next/server';
import { withOrg, OrgContextError } from '@/lib/utils/orgContext';
import { permisosSitio } from '@/lib/services/website/paginasSitioService';
import { getServiceClient } from '@/lib/supabase/server-service';
import { ErrorCarta, respuestaErrorCarta } from '@/lib/website/carta.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RUTA = 'sitio-web/carta/pdf';
const BUCKET = 'organization_images';
const MAX_BYTES = 10 * 1024 * 1024;

export const POST = withOrg(async (ctx, request) => {
  try {
    const permisos = await permisosSitio(ctx);
    if (!permisos.editar) throw new ErrorCarta('sin_permiso', 403, 'No tienes permiso para editar la carta.');
    const form = await request.formData().catch(() => null);
    const archivo = form?.get('archivo');
    if (!(archivo instanceof File)) throw new ErrorCarta('peticion_invalida', 400, 'Adjunta el PDF de la carta.');
    if (archivo.type !== 'application/pdf' || archivo.size === 0 || archivo.size > MAX_BYTES) {
      throw new ErrorCarta('peticion_invalida', 400, 'Usa un archivo PDF de menos de 10 MB.');
    }
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    // Firma «%PDF-»: el tipo del navegador no basta.
    if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
      throw new ErrorCarta('peticion_invalida', 400, 'El archivo no es un PDF.');
    }
    const ruta = `${ctx.organizationId}/carta/carta-${Date.now()}.pdf`;
    const servicio = getServiceClient();
    const { error } = await servicio.storage.from(BUCKET).upload(ruta, bytes, { contentType: 'application/pdf', upsert: false });
    if (error) throw error;
    const { data } = servicio.storage.from(BUCKET).getPublicUrl(ruta);
    return NextResponse.json({ url: data.publicUrl }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorCarta(error, RUTA, ctx.organizationId);
  }
});
