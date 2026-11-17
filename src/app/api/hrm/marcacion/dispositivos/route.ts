/**
 * Marcación › Dispositivos (Figma 20.28; en M0 solo pantallas de QR y etiquetas NFC).
 * GET ?sede= → lista (`hr.attendance.view`).
 * POST { tipo: 'pantalla_qr' | 'etiqueta_nfc', nombre, sede_id, chip?, descripcion? }
 *   → alta (`hr.attendance.manage`). La etiqueta devuelve su código UNA vez.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { sedeDeQuery } from '@/lib/services/hrm/asistenciaService.server';
import { crearDispositivo, dispositivos } from '@/lib/services/hrm/marcacionGestionService.server';
import { responderError, SIN_CACHE } from '@/lib/services/hrm/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  try {
    const sede = sedeDeQuery(new URL(req.url).searchParams.get('sede'));
    return NextResponse.json(await dispositivos(ctx, sede), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'marcacion:dispositivos');
  }
});

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = await readOrgBody<unknown>(ctx, req, { route: 'hrm/marcacion/dispositivos' });
    return NextResponse.json(await crearDispositivo(ctx, body), { headers: SIN_CACHE });
  } catch (err) {
    return responderError(err, 'marcacion:dispositivo-crear');
  }
});
