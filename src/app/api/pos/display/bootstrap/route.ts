import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { authenticateDisplayRequest } from '@/lib/pos/display/server/displayAuth';
import { displayCostRateLimitStore } from '@/lib/pos/display/server/displayRateLimit';
import { BOOTSTRAP_RATE_LIMIT, bootstrapRateLimitKey, isDisplayTokenShape, readBearerToken } from '@/lib/pos/display/server/displayTokens';
import { issueDisplayRealtimeCredential } from '@/lib/pos/display/server/displayRealtime';
import { POS_CUSTOMER_DISPLAY_KEY, parseCustomerDisplaySettings } from '@/lib/pos/display/settingsSchema';
import { defaultLocale, isValidLocale } from '@/i18n/config';
import { DEFAULT_TIMEZONE, isSupportedTimeZone } from '@/lib/utils/timezone';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
/** Moneda de respaldo, la misma que usa la caja cuando no puede leer la suya (posDisplay.ts). */
const FALLBACK_CURRENCY = 'COP';

/**
 * GET /api/pos/display/bootstrap — lo que la pantalla remota necesita para
 * arrancar (PLAN §7 y §11). Fase 3, parte A. Autenticación por token
 * (`Authorization: Bearer`), sin sesión; la organización sale de la
 * terminal, nunca de la petición. Solo con el cliente service-role, y solo
 * DESPUÉS de validar el token.
 *
 * Devuelve, y nada más (sin datos de ventas: el carrito llega por Broadcast
 * desde la caja):
 * - `terminal`: id, nombre, código, sucursal.
 * - `brand`: organización (id, nombre, logo, colores, zona horaria).
 * - `settings`: `pos_customer_display` validado con el mismo esquema que la caja.
 * - `locale`: el de los ajustes si es uno de los idiomas de la app; si no, el
 *   idioma por defecto. `currency`: la moneda base de la organización.
 * - `realtime`: canal `pos-display:<terminalId>` y JWT HS256 de 5 minutos
 *   firmado con el secreto JWT del proyecto (`SUPABASE_JWT_SECRET`) para
 *   unirse SIN sesión de usuario; `/heartbeat` lo renueva en cada latido.
 *   Solo Broadcast: nada escribe en la base. El payload lleva SOLO los
 *   claims de `REALTIME_JWT_PAYLOAD_KEYS` (nunca `organization_id`: es un
 *   claim de confianza en políticas `to public`). Sin ese secreto la ruta
 *   responde 503 `REALTIME_NOT_CONFIGURED` (fail-closed: nunca se degrada en
 *   silencio a un acceso sin firmar).
 *
 * CUBO POR TOKEN (F3-B ronda 4 · 3). Es la ruta más cara de la fase —cinco
 * consultas service-role y un JWT firmado por llamada— y era la única sin
 * freno para un token VÁLIDO: el cubo de `authenticateDisplayRequest` solo lo
 * consumen los 401. `BOOTSTRAP_RATE_LIMIT` (10/min por token) se comprueba
 * ANTES de autenticar, así el 429 no cuesta ninguna consulta, y lo consumen
 * también las llamadas correctas: aquí se acota el COSTE, no el fracaso. El
 * cliente legítimo llama una vez por carga y reintenta con retroceso de 5 s a
 * 60 s, así que no lo roza. Petición sin token con forma válida: no gasta
 * cubo, cae directa en el 401 uniforme (y ahí manda el cubo por IP de la
 * parte A).
 */
export async function GET(request: Request) {
  // Freno por token ANTES de autenticar: un token válido que martillee esta
  // ruta costaba cinco lecturas service-role y un JWT por llamada, sin tope.
  const presented = readBearerToken(request);
  if (isDisplayTokenShape(presented)) {
    const rl = await checkRateLimit(bootstrapRateLimitKey(presented), BOOTSTRAP_RATE_LIMIT, { store: displayCostRateLimitStore() });
    if (!rl.allowed) {
      console.warn('[pos-display/bootstrap] cubo por token agotado; se rechaza sin tocar la base', { resetAt: rl.resetAt.toISOString() });
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: 'Demasiadas peticiones; espere un momento', code: 'RATE_LIMITED' },
        { status: 429, headers: { ...NO_STORE, 'Retry-After': String(retryAfter) } },
      );
    }
  }

  const auth = await authenticateDisplayRequest(request);
  if (!auth.ok) return auth.response;
  const { terminal } = auth;

  // Antes de leer nada: sin secreto JWT real no hay canal y no hay bootstrap (503).
  const issued = issueDisplayRealtimeCredential(terminal.id, 'bootstrap');
  if (!issued.ok) return issued.response;

  try {
    const service = getServiceClient();
    const [orgRes, settingsRes, currencyRes] = await Promise.all([
      service.from('organizations').select('id, name, logo_url, primary_color, secondary_color, timezone').eq('id', terminal.organizationId).maybeSingle(),
      service.from('organization_settings').select('settings').eq('organization_id', terminal.organizationId).eq('key', POS_CUSTOMER_DISPLAY_KEY).maybeSingle(),
      service.from('organization_currencies').select('currency_code, is_base').eq('organization_id', terminal.organizationId).order('is_base', { ascending: false }).limit(1),
    ]);
    if (orgRes.error || !orgRes.data) {
      console.error('[pos-display/bootstrap] lectura de la organización falló:', orgRes.error?.message ?? 'sin fila');
      return NextResponse.json({ error: 'No se pudo cargar la organización', code: 'BOOTSTRAP_UNAVAILABLE' }, { status: 503, headers: NO_STORE });
    }
    if (settingsRes.error) console.warn('[pos-display/bootstrap] ajustes no legibles; se usan los valores por defecto:', settingsRes.error.message);
    if (currencyRes.error) console.warn('[pos-display/bootstrap] moneda no legible; se usa la de respaldo:', currencyRes.error.message);

    const org = orgRes.data as { id: number; name: string | null; logo_url: string | null; primary_color: string | null; secondary_color: string | null; timezone: string | null };
    const settings = parseCustomerDisplaySettings((settingsRes.data as { settings?: unknown } | null)?.settings);
    const currencyRow = (currencyRes.data as Array<{ currency_code: string | null }> | null)?.[0];
    const currency = typeof currencyRow?.currency_code === 'string' && currencyRow.currency_code.trim().length > 0 ? currencyRow.currency_code.trim() : FALLBACK_CURRENCY;
    const localeBase = settings.locale ? settings.locale.split('-')[0].toLowerCase() : null;
    const locale = localeBase && isValidLocale(localeBase) ? localeBase : defaultLocale;

    return NextResponse.json(
      {
        data: {
          terminal: { id: terminal.id, name: terminal.name, code: terminal.code, branchId: terminal.branchId },
          brand: {
            organizationId: org.id,
            name: org.name ?? '',
            logoUrl: org.logo_url ?? null,
            primaryColor: org.primary_color ?? null,
            secondaryColor: org.secondary_color ?? null,
            timezone: isSupportedTimeZone(org.timezone) ? org.timezone : DEFAULT_TIMEZONE,
          },
          settings,
          locale,
          currency,
          realtime: issued.realtime,
        },
      },
      { headers: NO_STORE },
    );
  } catch (err: unknown) {
    console.error('[pos-display/bootstrap] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Error interno', code: 'INTERNAL' }, { status: 500, headers: NO_STORE });
  }
}
