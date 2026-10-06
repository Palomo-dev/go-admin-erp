/**
 * Detección de la plataforma de una tienda por su HTML y sus cabeceras. Es
 * una pista para el ORDEN de los sondeos: la plataforma se confirma después
 * pidiendo su endpoint público (un HTML puede citar «shopify» en un blog).
 */

import type { PlataformaDetectada } from './tipos';

const SENALES: Array<[PlataformaDetectada, RegExp[]]> = [
  ['shopify', [/cdn\.shopify\.com/i, /Shopify\.theme/i, /shopify-section/i, /myshopify\.com/i]],
  ['vtex', [/vteximg\.com\.br/i, /vtexassets\.com/i, /vtex\.render-server/i, /\bvtex-/i, /__RUNTIME__|vtex\.store/i]],
  ['woocommerce', [/wp-content\/plugins\/woocommerce/i, /\bwoocommerce\b/i, /wc-block/i, /\/wp-json\/wc\//i]],
  ['magento', [/Magento_[A-Z]/, /mage\/cookies/i, /\/static\/version\d+\/frontend\//i, /"Magento_Ui\/js\/core\/app"/i]],
  ['prestashop', [/\bvar\s+prestashop\s*=/i, /content=["']PrestaShop/i, /\/modules\/ps_[a-z]/i, /prestashop\.(min\.)?js/i]],
  ['tiendanube', [/d26lpennugtm8s\.cloudfront\.net/i, /\bLS\.store\b/i, /tiendanube|nuvemshop/i, /mitiendanube\.com/i]],
  ['jumpseller', [/jumpseller/i, /assets\.jumpseller\.com/i]],
  ['wix', [/static\.wixstatic\.com/i, /wix-code|wixBiSession|_wixCssImports/i, /<meta[^>]+generator[^>]+Wix/i]],
  ['squarespace', [/static1\.squarespace\.com/i, /Squarespace\.Constants|squarespace-cdn/i]],
  ['bigcommerce', [/cdn\d*\.bigcommerce\.com/i, /stencil-utils|BCData/i]],
];

const CABECERAS: Array<[PlataformaDetectada, RegExp]> = [
  ['shopify', /^(x-shopid|x-shopify-stage|x-shardid)$/i],
  ['vtex', /^x-vtex-/i],
  ['magento', /^x-magento-/i],
  ['wix', /^x-wix-/i],
  ['bigcommerce', /^x-bc-/i],
];

/** Plataformas candidatas, de la más probable a la menos (puede ir vacía). */
export function detectarPlataforma(html: string, cabeceras: Record<string, string> = {}): PlataformaDetectada[] {
  const puntos = new Map<PlataformaDetectada, number>();
  const sumar = (p: PlataformaDetectada, n: number) => puntos.set(p, (puntos.get(p) ?? 0) + n);
  for (const nombre of Object.keys(cabeceras)) {
    for (const [p, re] of CABECERAS) if (re.test(nombre)) sumar(p, 3);
  }
  if (/shopify/i.test(cabeceras['powered-by'] ?? '')) sumar('shopify', 3);
  if (/prestashop/i.test(cabeceras['powered-by'] ?? '')) sumar('prestashop', 3);
  const muestra = html.slice(0, 400_000);
  for (const [p, senales] of SENALES) {
    for (const re of senales) if (re.test(muestra)) sumar(p, 1);
  }
  return Array.from(puntos.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p);
}
