/**
 * Plantillas (WhatsApp y correo) del link de pago de la diferencia de un cambio de pedido.
 * Con la marca de la tienda: nombre visible del negocio y su color principal si lo hay.
 * Pura, sin I/O.
 */
export interface DatosPlantillaCambio {
  negocio: string;
  numeroPedido: string;
  nombreCliente: string;
  montoTexto: string;
  url: string;
  vence?: string | null;
  colorMarca?: string | null;
}

const escapar = (t: string): string =>
  t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const colorSeguro = (c?: string | null): string => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#111827');

export function textoWhatsappCambio(d: DatosPlantillaCambio): string {
  return [
    `Hola ${d.nombreCliente || ''}`.trim() + ',',
    `actualizamos tu pedido ${d.numeroPedido} en ${d.negocio}.`,
    `La diferencia a pagar es ${d.montoTexto}. Puedes pagarla aquí: ${d.url}`,
    d.vence ? `El link vence ${d.vence}.` : '',
  ].filter(Boolean).join('\n');
}

/** wa.me con el texto; el teléfono se normaliza a dígitos (sin él, WhatsApp pide el contacto). */
export function urlWhatsappCambio(telefono: string | null | undefined, d: DatosPlantillaCambio): string {
  const digitos = String(telefono ?? '').replace(/\D/g, '');
  const destino = digitos.length === 10 ? `57${digitos}` : digitos;
  return `https://wa.me/${destino}?text=${encodeURIComponent(textoWhatsappCambio(d))}`;
}

export function correoCambio(d: DatosPlantillaCambio): { asunto: string; html: string; text: string } {
  const color = colorSeguro(d.colorMarca);
  const asunto = `Diferencia por pagar — Pedido ${d.numeroPedido} · ${d.negocio}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
<div style="padding:28px;text-align:center;border-bottom:3px solid ${color};">
<h1 style="margin:0;color:${color};font-size:20px;">${escapar(d.negocio)}</h1></div>
<div style="padding:24px;">
<p style="color:#333;font-size:15px;">Hola <strong>${escapar(d.nombreCliente || 'cliente')}</strong>,</p>
<p style="color:#555;font-size:14px;">Actualizamos los productos de tu pedido <strong>${escapar(d.numeroPedido)}</strong>. La diferencia a pagar es <strong>${escapar(d.montoTexto)}</strong>.</p>
<div style="text-align:center;margin:28px 0;"><a href="${escapar(d.url)}" style="display:inline-block;background:${color};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Pagar diferencia</a></div>
${d.vence ? `<p style="color:#888;font-size:12px;text-align:center;">El link vence ${escapar(d.vence)}.</p>` : ''}
</div></div>`;
  return { asunto, html, text: textoWhatsappCambio(d) };
}
