/**
 * Correo al EQUIPO cuando se paga un pedido online (encargo 2026-11-25, Figma «05 POS y ventas»
 * 3326-211186, versión minimalista). Puro: sin Supabase ni proveedor de correo.
 *
 * Marca GO Admin (sale de la dirección de notificaciones del ERP, como los demás avisos al
 * equipo). Bloques: encabezado, Pago, Cliente y Entrega, y el botón «Ver pedido» que abre el
 * detalle en el ERP con sesión: nada se ejecuta desde el correo. Sin productos, sin comisión y
 * NUNCA datos de tarjeta (solo la franquicia, de una lista cerrada de marcas).
 */
import { AZUL_ACCION, AZUL_GO, FONDO, LINEA, PIZARRA, SUPERFICIE, TINTA, escapar } from './correo';

export type VariantePago =
  | 'linea'
  | 'contraentrega'
  | 'anticipo'
  | 'anticipo_reactivado'
  | 'anticipo_revisar'
  | 'devolucion';

/** Más de 10 pagos en una hora para la misma persona: el resto va en un resumen de esa hora. */
export const PAGOS_INDIVIDUALES_POR_HORA = 10;

/** La variante del correo. El anticipo tardío mira el estado del pedido AL despachar. */
export function varianteDe(evento: string, estadoPedido: string | null | undefined): VariantePago | null {
  switch (evento) {
    case 'pedido.pago.linea':
      return 'linea';
    case 'pedido.pago.contraentrega':
      return 'contraentrega';
    case 'pedido.pago.anticipo':
      return 'anticipo';
    case 'pedido.pago.anticipo_tarde':
      // fn_web_order_anticipo_tardio lo devuelve a «Pendiente» si había stock y llegó a tiempo
      // (24 h); si sigue vencido, decide una persona.
      return estadoPedido === 'expired' ? 'anticipo_revisar' : 'anticipo_reactivado';
    case 'pedido.pago.devolucion':
      return 'devolucion';
    default:
      return null;
  }
}

const MARCAS: Record<string, string> = {
  visa: 'Visa',
  debvisa: 'Visa Débito',
  visa_debit: 'Visa Débito',
  master: 'Mastercard',
  mastercard: 'Mastercard',
  debmaster: 'Mastercard Débito',
  mastercard_debit: 'Mastercard Débito',
  maestro: 'Maestro',
  amex: 'American Express',
  american_express: 'American Express',
  americanexpress: 'American Express',
  diners: 'Diners Club',
  diners_club: 'Diners Club',
  dinersclub: 'Diners Club',
  discover: 'Discover',
  jcb: 'JCB',
  codensa: 'Codensa',
  elo: 'Elo',
};

/**
 * La franquicia de la tarjeta, solo si es una marca conocida. Cualquier otro valor (números,
 * máscaras, nombres) se descarta: el correo nunca lleva datos de la tarjeta.
 */
export function franquiciaTarjeta(...candidatos: unknown[]): string | null {
  for (const candidato of candidatos) {
    if (typeof candidato !== 'string') continue;
    const clave = candidato.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (MARCAS[clave]) return MARCAS[clave];
  }
  return null;
}

/** Dónde buscar la franquicia en la respuesta de la pasarela (Wompi, Mercado Pago, Bold, PayU). */
export function franquiciaDeRespuesta(respuesta: unknown, ...extra: unknown[]): string | null {
  const r = (respuesta && typeof respuesta === 'object' ? respuesta : {}) as Record<string, unknown>;
  const datos = (r.data && typeof r.data === 'object' ? r.data : {}) as Record<string, unknown>;
  const tarjeta = (datos.card && typeof datos.card === 'object' ? datos.card : {}) as Record<string, unknown>;
  const transaccion = (datos.transaction && typeof datos.transaction === 'object' ? datos.transaction : {}) as Record<string, unknown>;
  const medio = (transaccion.payment_method && typeof transaccion.payment_method === 'object' ? transaccion.payment_method : {}) as Record<string, unknown>;
  const extraMedio = (medio.extra && typeof medio.extra === 'object' ? medio.extra : {}) as Record<string, unknown>;
  return franquiciaTarjeta(
    r.franchise, r.card_brand, r.brand, r.payment_method_id, r.franquicia,
    datos.franchise, datos.card_brand, tarjeta.brand, tarjeta.franchise, extraMedio.brand,
    ...extra,
  );
}

const ENTREGAS: Record<string, string> = {
  delivery_own: 'Domicilio propio',
  delivery_third_party: 'Transportadora',
  pickup: 'Recoger en tienda',
  dine_in: 'Comer aquí',
};

export function tipoEntrega(tipo: string | null | undefined): string {
  return (tipo && ENTREGAS[tipo]) || tipo || '—';
}

/** «Cra 12 #34-56 · Bogotá»: dirección y municipio, sin el resto del JSON. */
export function direccionResumida(direccion: unknown): string | null {
  if (!direccion || typeof direccion !== 'object') return typeof direccion === 'string' && direccion.trim() ? direccion.trim() : null;
  const d = direccion as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const calle = texto(d.address) ?? texto(d.street) ?? texto(d.line1) ?? texto(d.direccion);
  const municipio = texto(d.city) ?? texto(d.municipio) ?? texto(d.ciudad);
  const partes = [calle, municipio].filter(Boolean);
  return partes.length ? partes.join(' · ') : null;
}

export interface DatosCorreoPago {
  variante: VariantePago;
  numero: string;
  tienda: string;
  sede: string | null;
  /** Fecha y hora del pago, ya en la zona horaria de la organización. */
  cuando: string;
  total: string;
  /** Lo que entró (o se devolvió) en este evento. */
  monto: string;
  /** Lo que falta cobrar en la puerta (contraentrega y anticipo). */
  porCobrar: string | null;
  /** Qué se pagó en un anticipo: «El envío» o «20 % del pedido». */
  queSePago: string | null;
  medio: string | null;
  franquicia: string | null;
  referencia: string | null;
  cliente: { nombre: string | null; telefono: string | null; correo: string | null };
  entrega: { tipo: string; direccion: string | null };
  enlace: string;
}

export interface CorreoArmado {
  asunto: string;
  html: string;
  texto: string;
}

function encabezado(d: DatosCorreoPago): { asunto: string; titulo: string; entrada: string; etiqueta: string; alerta: string | null } {
  const n = d.numero;
  const quien = d.cliente.nombre || 'El cliente';
  switch (d.variante) {
    case 'linea':
      return {
        asunto: `Nuevo pago · ${n} · ${d.monto}`,
        titulo: `Nuevo pago · ${n} · ${d.monto}`,
        entrada: `${quien} pagó el pedido completo en línea.`,
        etiqueta: 'Pago en línea',
        alerta: null,
      };
    case 'contraentrega':
      return {
        asunto: `Nuevo pedido contraentrega · ${n} · ${d.porCobrar ?? d.total} por cobrar`,
        titulo: `Nuevo pedido contraentrega · ${n} · ${d.total}`,
        entrada: `${quien} eligió pagar al recibir. La sede no pide anticipo: se cobra todo en la puerta.`,
        etiqueta: 'Contraentrega · sin anticipo',
        alerta: null,
      };
    case 'anticipo':
      return {
        asunto: `Anticipo pagado · ${n} · ${d.monto} hoy, ${d.porCobrar ?? '—'} en puerta`,
        titulo: `Nuevo pago · ${n} · ${d.monto} de ${d.total}`,
        entrada: `${quien} pagó el anticipo de la contraentrega. El resto se cobra al entregar.`,
        etiqueta: 'Anticipo pagado',
        alerta: null,
      };
    case 'anticipo_reactivado':
      return {
        asunto: `Anticipo pagado tarde · ${n} · el pedido se reactivó solo`,
        titulo: `Pago tardío · ${n} · ${d.monto}`,
        entrada: `El anticipo llegó cuando el pedido ya había vencido.`,
        etiqueta: 'Pagado tarde · reactivado',
        alerta: 'Se reactivó solo: había stock de todo y el pedido siguió su curso.',
      };
    case 'anticipo_revisar':
      return {
        asunto: `Anticipo pagado tarde · ${n} · hay que revisar`,
        titulo: `Pago tardío · ${n} · ${d.monto}`,
        entrada: `El anticipo llegó cuando el pedido ya había vencido.`,
        etiqueta: 'Pagado tarde · revisar',
        alerta: 'Hay que revisar: no se pudo reactivar solo (sin stock o pasaron más de 24 h). Abre el pedido para reactivarlo o devolver el anticipo.',
      };
    case 'devolucion':
      return {
        asunto: `Devolución · ${n} · ${d.monto}`,
        titulo: `Devolución · ${n} · ${d.monto}`,
        entrada: `Se registró la devolución del pago de ${quien}.`,
        etiqueta: 'Devolución',
        alerta: null,
      };
  }
}

type Fila = [string, string | null];

function bloquePago(d: DatosCorreoPago): Fila[] {
  const devolucion = d.variante === 'devolucion';
  return [
    ['Qué se pagó', d.queSePago],
    [devolucion ? 'Devuelto' : d.variante === 'contraentrega' ? 'Pagado hoy' : 'Monto', d.monto],
    ['Medio', d.medio],
    ['Franquicia', d.franquicia],
    ['Referencia', d.referencia],
    ['Por cobrar en puerta', d.porCobrar],
    ['Total del pedido', d.total],
  ];
}

function bloqueCliente(d: DatosCorreoPago): Fila[] {
  return [
    ['Nombre', d.cliente.nombre],
    ['Teléfono', d.cliente.telefono],
    ['Correo', d.cliente.correo],
  ];
}

function bloqueEntrega(d: DatosCorreoPago): Fila[] {
  return [
    ['Tipo', d.entrega.tipo],
    ['Dirección', d.entrega.direccion],
  ];
}

function seccionHtml(titulo: string, filas: Fila[]): string {
  const visibles = filas.filter(([, valor]) => valor != null && valor !== '');
  if (!visibles.length) return '';
  const cuerpo = visibles
    .map(([etiqueta, valor]) => `<tr>
          <td style="padding:5px 12px 5px 0;font-size:13px;line-height:1.4;color:${PIZARRA};vertical-align:top;width:40%;">${escapar(etiqueta)}</td>
          <td style="padding:5px 0;font-size:14px;line-height:1.4;color:${TINTA};vertical-align:top;">${escapar(String(valor))}</td>
        </tr>`)
    .join('');
  return `<tr>
      <td style="padding:16px 24px 8px;border-top:1px solid ${LINEA};">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;font-weight:600;color:${PIZARRA};">${escapar(titulo)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cuerpo}</table>
      </td>
    </tr>`;
}

function seccionTexto(titulo: string, filas: Fila[]): string {
  const visibles = filas.filter(([, valor]) => valor != null && valor !== '');
  if (!visibles.length) return '';
  return `${titulo.toUpperCase()}\n${visibles.map(([e, v]) => `${e}: ${v}`).join('\n')}`;
}

const PIE = 'Lo recibes porque eres dueño o administrador de la organización en GO Admin. Puedes apagar «Pagos de pedidos online» en tu perfil, en Notificaciones.';

function marcoHtml(tienda: string, cuerpo: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:16px;background:${FONDO};font-family:Inter,Arial,sans-serif;color:${TINTA};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:${SUPERFICIE};border:1px solid ${LINEA};border-radius:12px;">
    <tr>
      <td style="padding:16px 24px;border-bottom:1px solid ${LINEA};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="28" height="28" align="center" valign="middle" style="width:28px;height:28px;background:${AZUL_GO};border-radius:8px;color:#ffffff;font-weight:700;font-size:10px;line-height:28px;font-family:Inter,Arial,sans-serif;">GO</td>
            <td style="padding-left:10px;font-size:16px;line-height:28px;color:${TINTA};"><span style="font-weight:700;">GO</span><span style="font-weight:500;"> Admin</span></td>
            <td align="right" style="font-size:12px;line-height:1.3;color:${PIZARRA};">${escapar(tienda)}</td>
          </tr>
        </table>
      </td>
    </tr>
${cuerpo}
    <tr>
      <td style="padding:14px 24px;border-top:1px solid ${LINEA};background:${FONDO};border-radius:0 0 12px 12px;font-size:12px;line-height:1.45;color:${PIZARRA};">
        ${escapar(PIE)}
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function boton(enlace: string, texto: string): string {
  return `<a href="${escapar(enlace)}" style="display:inline-block;background:${AZUL_ACCION};color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;font-size:14px;">${escapar(texto)}</a>`;
}

export function correoPagoPedido(d: DatosCorreoPago): CorreoArmado {
  const e = encabezado(d);
  const tienda = [d.tienda, d.sede].filter(Boolean).join(' · ');
  const alerta = e.alerta
    ? `<p style="margin:0 0 16px;padding:12px 14px;border-radius:8px;font-size:14px;line-height:1.45;${d.variante === 'anticipo_revisar' ? 'background:#FEF2F2;border:1px solid #FECACA;color:#991B1B;' : 'background:#FFFBEB;border:1px solid #FDE68A;color:#92400E;'}">${escapar(e.alerta)}</p>`
    : '';
  const cuerpo = `    <tr>
      <td style="padding:20px 24px 18px;">
        <p style="margin:0 0 10px;font-size:12px;line-height:1.4;color:${PIZARRA};"><span style="display:inline-block;padding:2px 10px;border-radius:999px;background:#EEF2FF;color:${AZUL_ACCION};font-weight:600;">${escapar(e.etiqueta)}</span>&nbsp; ${escapar(d.cuando)}</p>
        <h1 style="margin:0 0 6px;font-size:20px;line-height:1.3;font-weight:700;color:${TINTA};">${escapar(e.titulo)}</h1>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:${PIZARRA};">${escapar(e.entrada)}</p>
        ${alerta}
        ${boton(d.enlace, 'Ver pedido')}
      </td>
    </tr>
${seccionHtml(d.variante === 'devolucion' ? 'Devolución' : 'Pago', bloquePago(d))}
${seccionHtml('Cliente', bloqueCliente(d))}
${seccionHtml('Entrega', bloqueEntrega(d))}`;
  const texto = [
    e.titulo,
    `${tienda} · ${d.cuando}`,
    e.entrada,
    e.alerta,
    seccionTexto(d.variante === 'devolucion' ? 'Devolución' : 'Pago', bloquePago(d)),
    seccionTexto('Cliente', bloqueCliente(d)),
    seccionTexto('Entrega', bloqueEntrega(d)),
    `Ver pedido: ${d.enlace}`,
    PIE,
  ].filter(Boolean).join('\n\n');
  return { asunto: e.asunto, html: marcoHtml(tienda, cuerpo), texto };
}

export interface DatosResumenPagos {
  tienda: string;
  /** «3:00 p. m. – 4:00 p. m.» en la zona de la organización. */
  hora: string;
  lineas: string[];
  enlace: string;
}

/** Un solo correo con los pagos que pasaron del tope de la hora. */
export function correoResumenPagos(d: DatosResumenPagos): CorreoArmado {
  const n = d.lineas.length;
  const asunto = `${n} ${n === 1 ? 'pago más' : 'pagos más'} de pedidos online · ${d.hora}`;
  const entrada = `Llegaron más de ${PAGOS_INDIVIDUALES_POR_HORA} pagos en esta hora. Para no llenar tu bandeja, estos van juntos.`;
  const lista = d.lineas
    .map((linea) => `<tr><td style="padding:6px 0;border-bottom:1px solid ${LINEA};font-size:14px;line-height:1.4;color:${TINTA};">${escapar(linea)}</td></tr>`)
    .join('');
  const cuerpo = `    <tr>
      <td style="padding:20px 24px 18px;">
        <h1 style="margin:0 0 6px;font-size:20px;line-height:1.3;font-weight:700;color:${TINTA};">${escapar(asunto)}</h1>
        <p style="margin:0 0 14px;font-size:14px;line-height:1.5;color:${PIZARRA};">${escapar(entrada)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">${lista}</table>
        ${boton(d.enlace, 'Ver pedidos online')}
      </td>
    </tr>`;
  const texto = [asunto, entrada, d.lineas.join('\n'), `Ver pedidos online: ${d.enlace}`, PIE].join('\n\n');
  return { asunto, html: marcoHtml(d.tienda, cuerpo), texto };
}

/**
 * La hora (en la zona de la organización) a la que pertenece un instante: clave estable e
 * intervalo [inicio, fin). `minutoLocal` es el minuto del día en esa zona (`minutosEnZona`).
 */
export function ventanaHora(instante: Date, minutoLocal: number, diaLocal: string): { clave: string; inicio: Date; fin: Date } {
  const minutoDeLaHora = ((minutoLocal % 60) + 60) % 60;
  const inicio = new Date(instante.getTime());
  inicio.setUTCSeconds(0, 0);
  inicio.setTime(inicio.getTime() - minutoDeLaHora * 60_000);
  const hora = Math.floor(minutoLocal / 60);
  return {
    clave: `${diaLocal}T${String(hora).padStart(2, '0')}`,
    inicio,
    fin: new Date(inicio.getTime() + 60 * 60_000),
  };
}

/**
 * Las primeras 10 de la hora salen una por una; desde la 11 esperan a que la hora cierre y salen
 * en un solo resumen.
 */
export function modoEnvioPago(posicionEnLaHora: number, ahora: Date, finHora: Date): 'individual' | 'esperar' | 'resumen' {
  if (posicionEnLaHora < PAGOS_INDIVIDUALES_POR_HORA) return 'individual';
  return ahora.getTime() >= finHora.getTime() ? 'resumen' : 'esperar';
}
