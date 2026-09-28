import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { tripadvisorContentService } from '@/lib/services/integrations/tripadvisor';
import type { TripAdvisorHealthCheckResult } from '@/lib/services/integrations/tripadvisor';
import { textoDe } from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/tripadvisor/health-check';

/**
 * POST /api/integrations/tripadvisor/health-check
 * Verificar que la API Key de TripAdvisor es válida.
 * Body (opcional): { apiKey?: string } — prueba de una llave todavía SIN
 * guardar; sin ella se prueba la de la plataforma (entorno). La llave del body
 * solo se prueba contra TripAdvisor: no se guarda ni se usa para nada más.
 *
 * SEGURIDAD (GO-sec, 2026-09-24): antes no tenía autenticación en el handler.
 * Ahora sesión validada + administración (`withOrg({ admin: true })`) y una
 * organización ajena en body o query → 403 y registro.
 */
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });
    const apiKey = textoDe(body.apiKey) || undefined;
    const result: TripAdvisorHealthCheckResult = await tripadvisorContentService.healthCheck(apiKey);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    console.error('[API TripAdvisor HealthCheck] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Error al verificar' }, { status: 500 });
  }
}, { admin: true });
