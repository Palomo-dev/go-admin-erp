/**
 * URL de webhook que se le muestra al cliente para pegar en el panel del proveedor.
 *
 * Antes (`StepSettings.tsx`) se armaba `/api/webhooks/<connector.code>` sobre el origen de la app:
 * esa ruta no existe en este repositorio para 15 conectores. Aquí solo hay rutas REALES; la prueba
 * `urlsWebhook.test.ts` comprueba que cada una tiene su `route.ts`. Un conector sin receptor
 * devuelve null y la UI no muestra URL.
 */
import { hostSitio, type DominioDelSitio } from '@/lib/website/hostSitio';

export const RUTA_WEBHOOK_POR_CONECTOR: Readonly<Record<string, string>> = {
  wompi_co: '/api/integrations/wompi/webhook',
  mp_checkout: '/api/integrations/mercadopago/webhook',
  payu_co: '/api/integrations/payu/webhook',
  stripe_payments: '/api/integrations/stripe/webhook',
  paypal_checkout: '/api/integrations/paypal/webhook',
  sendgrid_email: '/api/integrations/sendgrid/webhook',
  bold_link: '/api/integrations/bold/webhook',
  bold_pos: '/api/integrations/bold/webhook',
  bancolombia_qr: '/api/integrations/bancolombia/webhook',
  breb_mono: '/api/integrations/breb/webhook',
  redeban_qr: '/api/integrations/redeban/webhook',
  meta_marketing: '/api/integrations/meta/webhook',
  tiktok_marketing: '/api/integrations/tiktok/webhook',
  whatsapp_cloud: '/api/integrations/whatsapp/webhook',
};

/** Origen público de la app: `NEXT_PUBLIC_APP_URL` o, en el navegador, el origen actual. */
export function origenPublico(): string {
  const env = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/+$/, '');
  if (env) return env;
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export function urlWebhookDeConector(connectorCode: string | null | undefined, origen: string = origenPublico()): string | null {
  const ruta = connectorCode ? RUTA_WEBHOOK_POR_CONECTOR[connectorCode] : undefined;
  if (!ruta || !origen) return null;
  return `${origen.replace(/\/+$/, '')}${ruta}`;
}

// ─── Wompi: la URL de eventos es la de la tienda ─────────────────────────────
//
// Wompi admite UNA sola «URL de eventos» por comercio y ambiente. Decisión del dueño (2026-11-08):
// se pega la del dominio de la tienda (`goadmin-websites`, `app/api/webhooks/wompi_co`), que
// procesa los eventos de la tienda y reenvía al ERP —cuerpo crudo y firma intactos— los demás
// (sesiones QR del POS y del folio, links de pago, pagos pendientes). El ERP sigue identificando
// la conexión POR LA FIRMA: el reenvío no le dice qué organización es.

/** Receptor de Wompi en la tienda (otro repositorio: no entra en RUTA_WEBHOOK_POR_CONECTOR). */
export const RUTA_WEBHOOK_WOMPI_TIENDA = '/api/webhooks/wompi_co';

/** Conectores cuya URL de eventos es la de la tienda cuando la organización tiene dominio. */
const POR_DOMINIO_DE_TIENDA: Readonly<Record<string, string>> = { wompi_co: RUTA_WEBHOOK_WOMPI_TIENDA };

export function usaDominioDeTienda(connectorCode: string | null | undefined): boolean {
  return !!connectorCode && connectorCode in POR_DOMINIO_DE_TIENDA;
}

/**
 * Host del dominio PRINCIPAL, verificado y activo de la organización (propio o subdominio del
 * sistema: los dos los sirve la tienda). `null` si no hay. Normaliza con la misma regla que
 * `hostSitio` y nunca cae a `organizations.subdomain` (eso no está verificado).
 */
export function hostPrincipalVerificado(dominios: readonly DominioDelSitio[]): string | null {
  const principales = dominios.filter(
    (d) =>
      d.is_primary === true &&
      d.is_active === true &&
      d.status === 'verified' &&
      (d.domain_type === 'custom_domain' || d.domain_type === 'system_subdomain'),
  );
  return principales.length > 0 ? hostSitio(principales, null) : null;
}

/** De dónde sale la URL mostrada: la tienda (dominio verificado) o el ERP. */
export type OrigenWebhook = 'tienda' | 'erp';

export interface WebhookDeConexion {
  url: string | null;
  origen: OrigenWebhook | null;
  /** Solo Wompi sin dominio verificado: la UI explica por qué se muestra la del ERP. */
  sinDominioVerificado: boolean;
}

/**
 * URL que se le muestra a la organización para pegar en el proveedor. Wompi con dominio
 * principal verificado → `https://{dominio}/api/webhooks/wompi_co`; sin él, la del ERP (como
 * antes) marcada `sinDominioVerificado`. El resto de conectores, sin cambios.
 */
export function webhookDeConexion(
  connectorCode: string | null | undefined,
  hostPrincipal: string | null | undefined,
  origen: string = origenPublico(),
): WebhookDeConexion {
  const rutaTienda = connectorCode ? POR_DOMINIO_DE_TIENDA[connectorCode] : undefined;
  const host = hostPrincipal ? hostSitio([{ host: hostPrincipal, domain_type: 'custom_domain', status: 'verified', is_primary: true, is_active: true }], null) : null;
  if (rutaTienda && host) return { url: `https://${host}${rutaTienda}`, origen: 'tienda', sinDominioVerificado: false };
  const url = urlWebhookDeConector(connectorCode, origen);
  return { url, origen: url ? 'erp' : null, sinDominioVerificado: !!rutaTienda && !!url };
}
