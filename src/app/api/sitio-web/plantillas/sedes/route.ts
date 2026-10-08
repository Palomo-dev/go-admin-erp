/**
 * /api/sitio-web/plantillas/sedes — sedes con sitio para el selector de Diseño › Plantillas
 * (Figma «16 Sitio web» › «Plantillas por sede», lámina A).
 *
 * GET → { sedes: SedeParaPlantillas[] }: nombre, tipo de negocio (la pestaña con que abre la
 *       galería), si hereda o tiene estilo propio y la plantilla en uso.
 *
 * La organización sale de la sesión (`withOrg`); una organización ajena en la query → 403 y
 * registro (`readOrgBody`). Lee con el cliente de la sesión (RLS por pertenencia) y filtra por la
 * organización. Usar una plantilla en una sede es `POST /api/sitio-web/sedes/<id>/plantilla`.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { manejarError } from '@/lib/website/v2/respuestasApi';
import { sedesParaPlantillas } from '@/lib/services/website/plantillaSedeService';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: 'sitio-web/plantillas/sedes' });
    return NextResponse.json({ sedes: await sedesParaPlantillas(ctx) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return manejarError(error, 'GET sitio-web/plantillas/sedes');
  }
});
