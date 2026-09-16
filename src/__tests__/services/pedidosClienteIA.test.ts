/**
 * Consulta de pedidos desde el chat de atencion al cliente.
 *
 * Casos tomados de la auditoria del 2026-09-14: 88 de 88 preguntas por un
 * pedido con correo escrito en el chat se respondieron sin datos porque el
 * correo escrito se ignoraba frente al `visitor_*@widget.local` de la
 * conversacion.
 */
import {
  correoParaBuscar,
  correosDelChat,
  decidirCorreoDelChat,
  describirEstadoPedido,
  esCorreoDelWidget,
  escaparLike,
  extraerCorreoDelChat,
  extraerNumeroDePedido,
  fechaEnZona,
  formatearFacturas,
  formatearPedidosWeb,
} from '../../../supabase/functions/_shared/ai-chat/pedidosCliente';

const cliente = (content: string) => ({ role: 'customer', content });
const bot = (content: string) => ({ role: 'ai', content });

describe('extraerNumeroDePedido', () => {
  it('encuentra el numero de pedido web y lo normaliza a mayusculas', () => {
    const msgs = [cliente('hola'), cliente('mi pedido es wo-135-mtnhmtqp-ynia y no llega')];
    expect(extraerNumeroDePedido(msgs)).toBe('WO-135-MTNHMTQP-YNIA');
  });

  it('toma el mas reciente que dijo el cliente, no el que repitio el bot', () => {
    const msgs = [
      cliente('WO-135-AAAA-BBBB'),
      bot('Tu pedido WO-135-AAAA-BBBB esta en camino'),
      cliente('y el WO-135-CCCC-DDDD?'),
    ];
    expect(extraerNumeroDePedido(msgs)).toBe('WO-135-CCCC-DDDD');
  });

  it('tolera puntuacion pegada al numero', () => {
    expect(extraerNumeroDePedido([cliente('es el WO-135-ABCD-EFGH.')])).toBe('WO-135-ABCD-EFGH');
    expect(extraerNumeroDePedido([cliente('(WO-135-ABCD-EFGH)')])).toBe('WO-135-ABCD-EFGH');
  });

  it('no inventa numeros con textos parecidos', () => {
    expect(extraerNumeroDePedido([cliente('quiero saber de mi pedido'), cliente('WO-12')])).toBeNull();
  });
});

describe('extraerCorreoDelChat', () => {
  it('devuelve el ultimo correo real escrito por el cliente, en minusculas', () => {
    const msgs = [cliente('Mi correo es Ana.Perez@Gmail.com'), bot('gracias'), cliente('sigo esperando')];
    expect(extraerCorreoDelChat(msgs)).toBe('ana.perez@gmail.com');
  });

  it('ignora el correo ficticio del widget', () => {
    expect(extraerCorreoDelChat([cliente('soy visitor_abc@widget.local')])).toBeNull();
  });

  it('lista los correos distintos del mas reciente al mas antiguo', () => {
    const msgs = [cliente('a@x.com'), cliente('A@x.com y b@x.com'), cliente('c@x.com')];
    expect(correosDelChat(msgs)).toEqual(['c@x.com', 'a@x.com', 'b@x.com']);
  });
});

describe('decidirCorreoDelChat (tope de sondeo)', () => {
  it('con uno o dos correos busca por el mas reciente', () => {
    expect(decidirCorreoDelChat([cliente('a@x.com'), cliente('b@x.com')])).toEqual({ correo: 'b@x.com', sondeo: false });
  });

  it('al tercer correo distinto deja de buscar y marca sondeo', () => {
    const msgs = [cliente('a@x.com'), cliente('b@x.com'), cliente('c@x.com')];
    expect(decidirCorreoDelChat(msgs)).toEqual({ correo: null, sondeo: true });
  });

  it('repetir el mismo correo no cuenta como sondeo', () => {
    const msgs = [cliente('a@x.com'), cliente('A@X.com'), cliente('a@x.com otra vez')];
    expect(decidirCorreoDelChat(msgs)).toEqual({ correo: 'a@x.com', sondeo: false });
  });
});

describe('escaparLike', () => {
  it('escapa guion bajo, porcentaje y barra invertida', () => {
    expect(escaparLike('ana_perez@x.com')).toBe('ana\\_perez@x.com');
    expect(escaparLike('%@gmail.com')).toBe('\\%@gmail.com');
    expect(escaparLike('a\\b')).toBe('a\\\\b');
  });

  it('deja intacto un correo normal', () => {
    expect(escaparLike('ana.perez@gmail.com')).toBe('ana.perez@gmail.com');
  });
});

describe('correoParaBuscar', () => {
  it('el correo escrito en el chat manda sobre el de la conversacion', () => {
    expect(correoParaBuscar('ana@gmail.com', 'visitor_1@widget.local')).toBe('ana@gmail.com');
    expect(correoParaBuscar('ana@gmail.com', 'otro@gmail.com')).toBe('ana@gmail.com');
  });

  it('usa el de la conversacion si es real y el cliente no escribio ninguno', () => {
    expect(correoParaBuscar(null, 'otro@gmail.com')).toBe('otro@gmail.com');
  });

  it('nunca busca por el correo del widget', () => {
    expect(correoParaBuscar(null, 'visitor_1@widget.local')).toBeNull();
    expect(esCorreoDelWidget('visitor_1@WIDGET.local')).toBe(true);
  });
});

describe('describirEstadoPedido', () => {
  const base = { order_number: 'WO-1-X', status: 'pending', payment_status: 'pending', total: 0, created_at: '2026-09-04T21:50:38Z' };

  it('explica un pedido expirado como pago no completado', () => {
    expect(describirEstadoPedido({ ...base, status: 'expired', payment_status: 'failed' })).toMatch(/EXPIRADO/);
  });

  it('un pedido confirmado y pagado esta en preparacion', () => {
    expect(describirEstadoPedido({ ...base, status: 'confirmed', payment_status: 'paid', confirmed_at: '2026-09-04T22:00:00Z' }))
      .toBe('CONFIRMADO, EN PREPARACIÓN');
  });

  it('la cancelacion gana a cualquier otra marca', () => {
    expect(describirEstadoPedido({ ...base, status: 'confirmed', cancelled_at: '2026-09-05T00:00:00Z' })).toBe('CANCELADO');
  });

  it('pendiente de pago, y pagado sin confirmar', () => {
    expect(describirEstadoPedido(base)).toBe('PENDIENTE DE PAGO');
    expect(describirEstadoPedido({ ...base, payment_status: 'paid' })).toBe('PAGADO, PENDIENTE DE CONFIRMACIÓN');
  });

  it('estados de envio y entrega', () => {
    expect(describirEstadoPedido({ ...base, status: 'shipped' })).toBe('EN CAMINO');
    expect(describirEstadoPedido({ ...base, status: 'confirmed', ready_at: '2026-09-05T00:00:00Z' })).toBe('LISTO PARA ENTREGA/RECOGIDA');
    expect(describirEstadoPedido({ ...base, status: 'confirmed', delivered_at: '2026-09-06T00:00:00Z' })).toBe('ENTREGADO');
  });
});

describe('fechaEnZona', () => {
  it('un pedido de las 23:30 en Bogota es del mismo dia, no del siguiente (UTC)', () => {
    // 2026-09-04 23:30 Bogota == 2026-09-05 04:30 UTC
    expect(fechaEnZona('2026-09-05T04:30:00Z', 'America/Bogota')).toBe('4 de septiembre de 2026');
    expect(fechaEnZona('2026-09-05T04:30:00Z', 'UTC')).toBe('5 de septiembre de 2026');
  });

  it('sin zona usa Bogota; con zona invalida no revienta', () => {
    expect(fechaEnZona('2026-09-05T04:30:00Z', null)).toBe('4 de septiembre de 2026');
    expect(fechaEnZona('2026-09-05T04:30:00Z', 'Marte/Olympus')).toBe('4 de septiembre de 2026');
    expect(fechaEnZona(null, 'America/Bogota')).toBe('');
  });
});

describe('formatearPedidosWeb / formatearFacturas', () => {
  it('redacta el pedido con estado, pago, entrega y fecha', () => {
    const texto = formatearPedidosWeb([{
      order_number: 'WO-135-MTNHMTQP-YNIA', status: 'confirmed', payment_status: 'paid', total: 51000,
      delivery_type: 'delivery_own', delivery_partner: null, created_at: '2026-09-04T21:50:38Z', confirmed_at: '2026-09-04T21:51:00Z',
    }], 'Pedidos web asociados al correo ana@gmail.com', 'America/Bogota');
    expect(texto).toContain('Pedidos web asociados al correo ana@gmail.com:');
    expect(texto).toContain('Pedido WO-135-MTNHMTQP-YNIA | $51.000 | CONFIRMADO, EN PREPARACIÓN | pagado | domicilio | Fecha: 4 de septiembre de 2026');
  });

  it('incluye transportadora y entrega estimada cuando existen', () => {
    const texto = formatearPedidosWeb([{
      order_number: 'WO-1-A', status: 'shipped', payment_status: 'paid', total: '10000',
      delivery_type: 'delivery_third_party', delivery_partner: 'Servientrega', created_at: '2026-09-01T12:00:00Z',
      estimated_delivery_at: '2026-09-03T12:00:00Z',
    }], 'T', 'America/Bogota');
    expect(texto).toContain('EN CAMINO | pagado | transportadora vía Servientrega | Fecha: 1 de septiembre de 2026 | Entrega estimada: 3 de septiembre de 2026');
  });

  it('avisa cuando hay mas pedidos de los que muestra', () => {
    const pedido = (n: number) => ({ order_number: `WO-1-${n}`, status: 'confirmed', payment_status: 'paid', total: 1000, created_at: '2026-09-01T12:00:00Z' });
    const texto = formatearPedidosWeb([1, 2, 3, 4].map(pedido), 'T', 'America/Bogota');
    expect(texto).toContain('WO-1-3');
    expect(texto).not.toContain('WO-1-4');
    expect(texto).toContain('Hay más pedidos con este correo');
    expect(formatearPedidosWeb([1, 2, 3].map(pedido), 'T', 'America/Bogota')).not.toContain('Hay más pedidos');
  });

  it('un tipo de entrega desconocido se muestra tal cual, sin reventar', () => {
    const texto = formatearPedidosWeb([{ order_number: 'WO-1-A', status: 'confirmed', payment_status: 'paid', total: 1000, delivery_type: 'dron', created_at: '2026-09-01T12:00:00Z' }], 'T', null);
    expect(texto).toContain('| dron |');
  });

  it('las facturas conservan su formato', () => {
    const texto = formatearFacturas([{ number: 'F-12', total: 25000, status: 'paid', created_at: '2026-09-01T12:00:00Z' }], 'America/Bogota');
    expect(texto).toBe('FACTURAS DEL CLIENTE:\n- Factura #F-12 | $25.000 | Estado: paid | Fecha: 1 de septiembre de 2026\n');
  });
});
