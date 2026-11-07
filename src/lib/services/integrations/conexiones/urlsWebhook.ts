/**
 * URL de webhook que se le muestra al cliente para pegar en el panel del proveedor.
 *
 * Antes (`StepSettings.tsx`) se armaba `/api/webhooks/<connector.code>` sobre el origen de la app:
 * esa ruta no existe en este repositorio para 15 conectores. Aquí solo hay rutas REALES; la prueba
 * `urlsWebhook.test.ts` comprueba que cada una tiene su `route.ts`. Un conector sin receptor
 * devuelve null y la UI no muestra URL.
 */
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
