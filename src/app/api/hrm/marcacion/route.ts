/**
 * Marcación del empleado (ADR-002 §2). La usa `/marcar`.
 *
 * GET  → estado: vínculo, mecanismos permitidos, autorización de ubicación y última marcación.
 * POST { qr: "<contenido del QR>" | nfc: "<url o código de la etiqueta>" | metodo: 'app', tipo?, remoto?, ubicacion?, dispositivo? }
 *
 * El QR se valida en la base (`fn_hr_marcar`), no en el navegador. La hora la
 * pone el servidor; el vínculo y la organización salen de la sesión. Un QR de
 * otra organización responde 403.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { datosDeMarcacion, MarcacionInvalida } from '@/lib/hrm/jornada/marcacion';
import { estado, marcar } from '@/lib/services/hrm/marcacionService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';
import { HrmError, contextoDePeticion } from '@/lib/services/hrm/tipos';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  try {
    return NextResponse.json(await estado(ctx), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'marcacion:estado');
  }
});

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<unknown>(ctx, req, { route: 'hrm/marcacion' });
    let datos;
    try {
      datos = datosDeMarcacion(body, ctx.organizationId);
    } catch (err) {
      if (err instanceof MarcacionInvalida) {
        throw new HrmError(err.code === 'qr_de_otra_organizacion' ? 403 : 422, err.code);
      }
      throw err;
    }
    return NextResponse.json(await marcar(ctx, datos, contextoDePeticion(req)), { headers: SIN_CACHE });
  } catch (err) {
    // Figma 20.30.5: la etiqueta de otra sede dice cuál es (es de la misma organización).
    if (err instanceof HrmError && err.code === 'etiqueta_otra_sede') {
      const sede = err.message.split(':').slice(1).join(':').trim().slice(0, 120) || null;
      return NextResponse.json({ error: err.code, code: err.code, sede }, { status: err.status, headers: SIN_CACHE });
    }
    return responderError(err, 'marcacion:marcar');
  }
});
