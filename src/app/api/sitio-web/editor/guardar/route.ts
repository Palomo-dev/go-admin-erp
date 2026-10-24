/**
 * POST /api/sitio-web/editor/guardar — «Guardar y publicar» del editor en los sitios
 * sin borrador V2 (Figma A/05n: «Retirar handleSave en N llamadas»).
 *
 * Body: `LoteLegacy` (src/lib/website/editorLegacy.ts). La organización sale de la
 * sesión (`withOrg`); si el body trae otra, `readOrgBody` responde 403 y lo registra.
 * Exige `website.sites.edit` y `website.sites.publish` en el servidor: en legacy
 * guardar sale en vivo.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, ORG_BODY_KEYS } from '@/lib/utils/orgContext';
import { esquemaLoteLegacy } from '@/lib/website/editorLegacy';
import { guardarLegacyServidor } from '@/lib/website/editorLegacy.server';
import { manejarError, respuestaError } from '@/lib/website/v2/respuestasApi';
import { revalidarEstructuraWeb } from '@/lib/services/website/revalidarPublicacionWeb';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RUTA = 'sitio-web/editor/guardar';

export const POST = withOrg(async (ctx, request) => {
  try {
    const raw = (await readOrgBody(ctx, request, { route: RUTA })) as Record<string, unknown> | null;
    const limpio = raw && typeof raw === 'object'
      ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
      : raw;
    const r = esquemaLoteLegacy.safeParse(limpio);
    if (!r.success) {
      return respuestaError('peticion_invalida', 'Revisa los cambios del editor.', r.error.issues.map((i) => i.path.join('.')));
    }
    const resultado = await guardarLegacyServidor(ctx, r.data);
    if (!(await revalidarEstructuraWeb(ctx.organizationId))) {
      return respuestaError('no_disponible', 'Los cambios se guardaron, pero no se pudo confirmar la actualización de la web. Reintenta guardar y publicar.');
    }
    return NextResponse.json(resultado, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return manejarError(error, RUTA);
  }
});
