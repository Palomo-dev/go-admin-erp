/**
 * POST /api/organizacion/dominios/[id]/verificar — verifica un dominio propio
 * consultando el DNS en el servidor (auditoría de Organización 2026-10, P0-8).
 *
 * - La organización sale de la sesión (`withOrg`), nunca del body ni de la URL:
 *   el id del dominio se busca DENTRO de esa organización.
 * - Administrar dominios es de administradores (super admin, rol 1/2 o
 *   `admin.full_access`, resuelto en el servidor).
 * - Límite de velocidad por organización: cada intento hace consultas DNS.
 * - Solo queda `verified` si el registro existe (`dominioVerificacionService`).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { checkRateLimits } from '@/lib/security/rateLimit';
import { getRateLimitStore } from '@/lib/security/rateLimitStore';
import { verificarDominio } from '@/lib/services/dominioVerificacionService';

export const dynamic = 'force-dynamic';

const RUTA = 'organizacion/dominios/verificar';
/** 20 intentos / 10 min por organización. */
const LIMITE_ORG = { limit: 20, windowMs: 10 * 60 * 1000 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withOrg(
  async (ctx, _req, routeParams) => {
    const params = routeParams ? await routeParams.params : {};
    const id = typeof params.id === 'string' ? params.id : '';
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Dominio no válido' }, { status: 400 });
    }

    const rl = await checkRateLimits([{ key: `dominios:verificar:org:${ctx.organizationId}`, opts: LIMITE_ORG }], {
      store: getRateLimitStore(),
    });
    if (!rl.allowed) {
      const espera = Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: 'Demasiados intentos de verificación. Espera unos minutos.', code: 'DEMASIADOS_INTENTOS' },
        { status: 429, headers: { 'Retry-After': String(espera) } }
      );
    }

    try {
      const r = await verificarDominio(getServiceClient(), ctx.organizationId, id);
      if (r.ok) return NextResponse.json({ success: true, status: r.estado, message: r.mensaje });
      if (r.codigo === 'NO_EXISTE') return NextResponse.json({ error: r.mensaje, code: r.codigo }, { status: 404 });
      if (r.codigo === 'DOMINIO_DE_OTRA') return NextResponse.json({ error: r.mensaje, code: r.codigo }, { status: 409 });
      // El registro todavía no está: no es un error del servidor, es el estado del dominio.
      return NextResponse.json({ success: false, status: r.estado, code: r.codigo, message: r.mensaje });
    } catch (err) {
      console.error(`[${RUTA}]`, err instanceof Error ? err.message : err);
      return NextResponse.json({ error: 'No se pudo verificar el dominio' }, { status: 500 });
    }
  },
  { admin: true }
);
