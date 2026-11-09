/**
 * POST /api/modules/acceso/avisar — «Avisar a los administradores» / «Pedir
 * acceso» (docs/design/MODULO-NO-HABILITADO.md §5.6).
 *
 * - La organización es la de la sesión (`withOrg`). Si el body trae otra:
 *   403 `FOREIGN_ORGANIZATION` y queda registrado (`readOrgBody`).
 * - El body solo trae la ruta; la causa, los destinatarios y el texto los
 *   decide el servidor (`avisarQuienResuelve`).
 * - Uno por persona, módulo (o página) y día: el segundo responde
 *   `repetida: true` sin notificar a nadie.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readOrgBody, withOrg, ORG_BODY_KEYS, OrgContextError } from '@/lib/utils/orgContext';
import { avisarQuienResuelve, rutaValida } from '@/lib/organizacion/accesoModulo.server';

export const dynamic = 'force-dynamic';

const RUTA = 'POST /api/modules/acceso/avisar';
const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const cuerpo = z.object({ ruta: z.string().max(300) });

export const POST = withOrg(async (ctx, req) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: RUTA });
  const limpio =
    typeof raw === 'object' && raw !== null
      ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
      : {};
  const datos = cuerpo.safeParse(limpio);
  const ruta = datos.success ? rutaValida(datos.data.ruta) : null;
  if (!ruta) return NextResponse.json({ error: 'ruta inválida', code: 'ruta_invalida' }, { status: 400, headers: SIN_CACHE });

  try {
    const resultado = await avisarQuienResuelve(ctx, ruta);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode, headers: SIN_CACHE });
    }
    console.error(`[${RUTA}]`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'No se pudo enviar el aviso', code: 'error' }, { status: 500, headers: SIN_CACHE });
  }
});
