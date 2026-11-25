/**
 * Tarjeta «Pagos» con método elegido e intentos (diseño 2026-11-24): estados A–G, traducción del
 * `status_detail` de Mercado Pago, vencimiento en la zona de la organización, mensaje de WhatsApp
 * (C con motivo, C2 sin motivo) y la celda del listado. Pedidos e importes ficticios.
 */
import {
  CODIGOS_MOTIVO_MP,
  celdaPasarela,
  claveMensajeWhatsApp,
  claveMotivoMp,
  contarIntentos,
  estadoTarjetaPagos,
  historialIntentos,
  medioDelIntento,
  metodoElegido,
  motivoDelIntento,
  motivoEnFrase,
  muestraCeldaPasarela,
  partesTiempo,
  primerNombre,
  raizTienda,
  referenciaCorta,
  valoresMensaje,
  vencimiento,
  type IntentoPago,
  type PedidoPago,
  type ResumenPago,
} from '@/lib/pos/pedidosWeb/intentosPago';
import { textoMetodoPago, textoSubmetodo, type Submetodo } from '@/lib/pos/pedidosWeb/pagosDelPedido';

const BOGOTA = 'America/Bogota';

const pedido = (p: Partial<PedidoPago> & { id?: string } = {}): PedidoPago & { id: string; organization_id: number } => ({
  id: 'o-431',
  organization_id: 7,
  status: 'pending',
  payment_status: 'pending',
  payment_method: 'wompi',
  delivery_type: 'delivery_own',
  total: 128900,
  created_at: '2026-11-24T22:18:00Z', // 17:18 en Bogotá
  ...p,
});

let n = 0;
const intento = (p: Partial<IntentoPago>): IntentoPago => ({
  id: `i-${++n}`,
  organization_id: 7,
  web_order_id: 'o-431',
  concept: 'order',
  gateway: 'wompi',
  event: 'link_created',
  reason: null,
  reason_code: null,
  method: null,
  card_brand: null,
  card_last4: null,
  bank: null,
  reference: null,
  amount: null,
  currency: null,
  created_at: '2026-11-24T22:18:00Z',
  ...p,
});

const enlace = (gateway = 'wompi') => intento({ gateway, event: 'link_created', created_at: '2026-11-24T22:18:00Z' });

describe('estadoTarjetaPagos', () => {
  test('A · pasarela elegida sin intentos (Bold link)', () => {
    const o = pedido({ payment_method: 'bold_link' });
    expect(estadoTarjetaPagos(o, [])).toBe('A');
    expect(estadoTarjetaPagos(o, [enlace('bold')])).toBe('A');
  });

  test('B · el último intento está pendiente (PSE esperando al banco)', () => {
    const o = pedido();
    const i = [enlace(), intento({ event: 'pending', method: 'pse', bank: 'Bancolombia', created_at: '2026-11-24T22:24:00Z' })];
    expect(estadoTarjetaPagos(o, i)).toBe('B');
    // Un reintento pendiente después de un rechazo también es B (no se reenvía mientras responde el banco).
    const tras = [
      ...i,
      intento({ event: 'declined', reason: 'Fondos insuficientes', created_at: '2026-11-24T22:25:00Z' }),
      intento({ event: 'pending', method: 'pse', created_at: '2026-11-24T22:27:00Z' }),
    ];
    expect(estadoTarjetaPagos(pedido({ payment_status: 'failed' }), tras)).toBe('B');
  });

  test('C · rechazado con motivo (Wompi en texto, Mercado Pago en código)', () => {
    const o = pedido({ payment_status: 'failed' });
    expect(estadoTarjetaPagos(o, [enlace(), intento({ event: 'declined', reason: 'Fondos insuficientes', created_at: '2026-11-24T22:21:00Z' })])).toBe('C');
    expect(
      estadoTarjetaPagos(pedido({ payment_status: 'failed', payment_method: 'mp' }), [
        intento({ gateway: 'mercadopago', event: 'declined', reason_code: 'cc_rejected_high_risk' }),
      ]),
    ).toBe('C');
  });

  test('C2 · rechazado sin motivo (Bold), o sin filas de intentos', () => {
    const o = pedido({ payment_status: 'failed', payment_method: 'bold_link' });
    expect(estadoTarjetaPagos(o, [enlace('bold'), intento({ gateway: 'bold', event: 'declined', method: 'nequi' })])).toBe('C2');
    expect(estadoTarjetaPagos(o, [])).toBe('C2');
  });

  test('un rechazo registrado con el pago aún «pending» también es C', () => {
    expect(estadoTarjetaPagos(pedido(), [intento({ event: 'declined', reason: 'Transacción rechazada por el usuario' })])).toBe('C');
  });

  test('D · pagado por pasarela (con o sin intentos)', () => {
    const o = pedido({ status: 'confirmed', payment_status: 'paid', payment_method: 'mp' });
    expect(estadoTarjetaPagos(o, [])).toBe('D');
    expect(estadoTarjetaPagos(o, [intento({ gateway: 'mercadopago', event: 'approved' })])).toBe('D');
  });

  test('E · venció sin pagar (expired + failed, o cancelado por vencimiento antes de existir «expired»)', () => {
    expect(estadoTarjetaPagos(pedido({ status: 'expired', payment_status: 'failed', payment_method: 'bold_link' }), [])).toBe('E');
    expect(
      estadoTarjetaPagos(
        pedido({ status: 'cancelled', payment_status: 'failed', cancellation_reason: 'Expirado por falta de pago' }),
        [],
      ),
    ).toBe('E');
    // Cancelado a mano: la tarjeta de hoy.
    expect(estadoTarjetaPagos(pedido({ status: 'cancelled', payment_status: 'failed', cancellation_reason: 'Cliente desistió' }), [])).toBeNull();
  });

  test('F · contraentrega con anticipo (solo mientras no esté pagado del todo)', () => {
    const cod = pedido({ payment_method: 'cash', advance_amount: 9000, advance_status: 'pending', advance_due_at: '2026-11-24T22:48:00Z' });
    expect(estadoTarjetaPagos(cod, [])).toBe('F');
    expect(estadoTarjetaPagos({ ...cod, payment_status: 'paid' }, [])).toBeNull();
    // Contraentrega sin anticipo: la tarjeta de hoy.
    expect(estadoTarjetaPagos(pedido({ payment_method: 'cash' }), [])).toBeNull();
  });

  test('G · transferencia sin pasarela pendiente; el efectivo en recoger queda como hoy', () => {
    expect(estadoTarjetaPagos(pedido({ payment_method: 'transfer', delivery_type: 'pickup' }), [])).toBe('G');
    expect(estadoTarjetaPagos(pedido({ payment_method: 'transferencia_bancaria' }), [])).toBe('G');
    expect(estadoTarjetaPagos(pedido({ payment_method: 'cash', delivery_type: 'pickup' }), [])).toBeNull();
    expect(estadoTarjetaPagos(pedido({ payment_method: 'transfer', status: 'confirmed' }), [])).toBeNull();
  });

  test('otros estados: la tarjeta de hoy (null)', () => {
    expect(estadoTarjetaPagos(pedido({ status: 'confirmed', payment_status: 'pending' }), [])).toBeNull();
    expect(estadoTarjetaPagos(pedido({ payment_status: 'refunded', status: 'refunded' }), [])).toBeNull();
    expect(estadoTarjetaPagos(pedido({ payment_status: 'partial' }), [])).toBeNull();
  });

  test('un pedido sin método de pasarela pero con intentos de una pasarela es de pasarela', () => {
    expect(estadoTarjetaPagos(pedido({ payment_method: undefined, delivery_type: 'pickup' }), [enlace('bold')])).toBe('A');
  });
});

describe('historialIntentos', () => {
  test('orden por hora y solo el concepto del estado', () => {
    const i = [
      intento({ event: 'declined', reason: 'Fondos insuficientes', created_at: '2026-11-24T22:21:00Z' }),
      enlace(),
      intento({ concept: 'advance', event: 'link_created', created_at: '2026-11-24T22:19:00Z' }),
    ];
    expect(historialIntentos('C', pedido(), i).map((x) => x.event)).toEqual(['link_created', 'declined']);
    expect(historialIntentos('F', pedido({ payment_method: 'cash', advance_amount: 9000 }), i).map((x) => x.concept)).toEqual(['advance']);
  });

  test('E sin fila «expired» (pedido viejo): se pinta igual con cancelled_at', () => {
    const o = pedido({ status: 'expired', payment_status: 'failed', cancelled_at: '2026-11-24T22:48:00Z' });
    const h = historialIntentos('E', o, [enlace('bold')]);
    expect(h.map((x) => x.event)).toEqual(['link_created', 'expired']);
    expect(h[1].created_at).toBe('2026-11-24T22:48:00Z');
    // Con la fila real, no se duplica.
    expect(historialIntentos('E', o, [enlace('bold'), intento({ event: 'expired', created_at: '2026-11-24T22:48:30Z' })]).filter((x) => x.event === 'expired')).toHaveLength(1);
  });

  test('contarIntentos no cuenta el enlace creado ni el vencimiento', () => {
    expect(contarIntentos([enlace(), intento({ event: 'declined' }), intento({ event: 'pending' }), intento({ event: 'expired' })])).toBe(2);
  });
});

describe('motivo del rechazo', () => {
  test('Wompi: el texto tal cual', () => {
    expect(motivoDelIntento(intento({ event: 'declined', reason: 'Fondos insuficientes' }))).toEqual({ tipo: 'texto', texto: 'Fondos insuficientes' });
  });

  test('Mercado Pago: código conocido → su clave; desconocido → genérico con el código', () => {
    expect(motivoDelIntento(intento({ gateway: 'mercadopago', event: 'declined', reason_code: 'cc_rejected_insufficient_amount' }))).toEqual({
      tipo: 'codigo',
      clave: 'motivos.cc_rejected_insufficient_amount',
      codigo: 'cc_rejected_insufficient_amount',
    });
    expect(claveMotivoMp('cc_rejected_high_risk')).toBe('motivos.cc_rejected_high_risk');
    expect(claveMotivoMp('bank_error')).toBe('motivos.bank_error');
    expect(claveMotivoMp('pending_waiting_transfer')).toBe('motivos.pending_waiting_transfer');
    expect(claveMotivoMp('CC_REJECTED_HIGH_RISK')).toBe('motivos.cc_rejected_high_risk');
    expect(claveMotivoMp('cc_rejected_algo_nuevo')).toBe('motivos.otro');
  });

  test('la lista de códigos cubre los rechazos y pendientes documentados y no repite', () => {
    for (const c of ['cc_rejected_bad_filled_card_number', 'cc_rejected_call_for_authorize', 'cc_rejected_card_disabled', 'cc_rejected_duplicated_payment', 'cc_rejected_max_attempts', 'cc_rejected_other_reason', 'rejected_by_bank', 'pending_contingency', 'pending_review_manual', 'accredited']) {
      expect(CODIGOS_MOTIVO_MP).toContain(c);
    }
    expect(new Set(CODIGOS_MOTIVO_MP).size).toBe(CODIGOS_MOTIVO_MP.length);
    // Claves i18n válidas: sin puntos.
    expect(CODIGOS_MOTIVO_MP.every((c) => /^[a-z0-9_]+$/.test(c))).toBe(true);
  });

  test('Bold: rechazo sin motivo → «Bold no lo informa»; un aviso sin motivo que no es rechazo, nada', () => {
    expect(motivoDelIntento(intento({ gateway: 'bold', event: 'declined' }))).toEqual({ tipo: 'noInforma', pasarela: 'Bold' });
    expect(motivoDelIntento(intento({ gateway: 'bold_link', event: 'error' }))).toEqual({ tipo: 'noInforma', pasarela: 'Bold' });
    expect(motivoDelIntento(intento({ gateway: null, event: 'declined' }))).toEqual({ tipo: 'noInforma', pasarela: null });
    expect(motivoDelIntento(intento({ gateway: 'bold', event: 'approved' }))).toBeNull();
  });

  test('motivoEnFrase baja la inicial salvo en siglas', () => {
    expect(motivoEnFrase('Fondos insuficientes.')).toBe('fondos insuficientes');
    expect(motivoEnFrase('PSE no respondió')).toBe('PSE no respondió');
  });
});

describe('medio y método elegido', () => {
  const traducir = (s: Submetodo) => `«${s}»`;

  test('Wompi con Visa: marca y últimos 4', () => {
    const m = medioDelIntento(intento({ gateway: 'wompi', method: 'card', card_brand: 'VISA', card_last4: '4417' }));
    expect(m).toEqual({ pasarela: 'wompi', submetodo: 'card', marcaTarjeta: 'Visa', ultimos4: '4417' });
    expect(textoSubmetodo(m, traducir)).toBe('Visa ••4417');
  });

  test('Mercado Pago guarda la marca como método (visa)', () => {
    const m = medioDelIntento(intento({ gateway: 'mercadopago', method: 'visa', card_last4: '4417' }));
    expect(m).toMatchObject({ submetodo: 'card', marcaTarjeta: 'Visa', ultimos4: '4417' });
  });

  test('Bold con Nequi; PSE con banco', () => {
    expect(medioDelIntento(intento({ gateway: 'bold', method: 'nequi' }))).toMatchObject({ pasarela: 'bold', submetodo: 'nequi', ultimos4: null });
    expect(medioDelIntento(intento({ method: 'pse', bank: 'Bancolombia' })).submetodo).toBe('pse');
  });

  test('método elegido: el medio más reciente; sin intentos, «Bold (link)»', () => {
    const o = pedido({ payment_status: 'failed' });
    const e = metodoElegido(o, [enlace(), intento({ event: 'declined', method: 'card', card_brand: 'visa', card_last4: '4417' })]);
    expect(e).toMatchObject({ pasarela: 'wompi', submetodo: 'card', marcaTarjeta: 'Visa', ultimos4: '4417', enlace: false });
    expect(
      textoMetodoPago({ id: 'x', metodo: 'wompi', referencia: null, fecha: null, monto: 0, estado: 'pending', ...e }, traducir, (c) => c),
    ).toBe('Wompi · Visa ••4417');
    expect(metodoElegido(pedido({ payment_method: 'bold_link' }), [])).toMatchObject({ pasarela: 'bold', submetodo: null, enlace: true });
    // Pedido viejo: el webhook pisó el método con el medio.
    expect(metodoElegido(pedido({ payment_method: 'wompi', payment_method_detail: 'nequi' }), [])).toMatchObject({ pasarela: 'wompi', submetodo: 'nequi' });
  });

  test('referencia corta: últimos 5', () => {
    expect(referenciaCorta('11982-1764022870-40211')).toBe('…40211');
    expect(referenciaCorta('ANT-431')).toBe('ANT-431');
    expect(referenciaCorta(null)).toBeNull();
  });
});

describe('vencimiento en la zona de la organización', () => {
  const vence = '2026-11-24T22:48:00Z'; // 17:48 en Bogotá

  test('faltan 18 min (redondeo hacia arriba)', () => {
    const v = vencimiento(vence, new Date('2026-11-24T22:30:00Z'), BOGOTA);
    expect(v).toEqual({ minutos: 18, vencido: false, otroDia: false });
    expect(vencimiento(vence, new Date('2026-11-24T22:29:30Z'), BOGOTA)?.minutos).toBe(19);
  });

  test('ya pasó: 0 min y vencido', () => {
    expect(vencimiento(vence, new Date('2026-11-24T22:50:00Z'), BOGOTA)).toMatchObject({ minutos: 0, vencido: true });
  });

  test('otro día según la zona de la organización, no la del servidor (TZ=UTC)', () => {
    // 23:30 del 24 en Bogotá = 04:30Z del 25: en UTC ya es otro día, en Bogotá no.
    const ahora = new Date('2026-11-25T03:00:00Z'); // 22:00 del 24 en Bogotá
    expect(vencimiento('2026-11-25T04:30:00Z', ahora, BOGOTA)?.otroDia).toBe(false);
    expect(vencimiento('2026-11-25T04:30:00Z', ahora, 'UTC')?.otroDia).toBe(false);
    // Transferencia: 24 h después, otro día.
    expect(vencimiento('2026-11-25T22:18:00Z', new Date('2026-11-24T22:30:00Z'), BOGOTA)?.otroDia).toBe(true);
  });

  test('sin hora: null', () => {
    expect(vencimiento(null, new Date(), BOGOTA)).toBeNull();
    expect(vencimiento('no-es-fecha', new Date(), BOGOTA)).toBeNull();
  });

  test('partes del tiempo', () => {
    expect(partesTiempo(18)).toEqual({ h: 0, m: 18 });
    expect(partesTiempo(80)).toEqual({ h: 1, m: 20 });
    expect(partesTiempo(1440)).toEqual({ h: 24, m: 0 });
  });
});

describe('mensaje de WhatsApp', () => {
  test('C con motivo, C2 sin motivo, A esperando, E vencido; B, D, F y G sin mensaje', () => {
    expect(claveMensajeWhatsApp('C')).toBe('mensajes.rechazado');
    expect(claveMensajeWhatsApp('C2')).toBe('mensajes.rechazadoSinMotivo');
    expect(claveMensajeWhatsApp('A')).toBe('mensajes.esperando');
    expect(claveMensajeWhatsApp('E')).toBe('mensajes.vencido');
    for (const e of ['B', 'D', 'F', 'G'] as const) expect(claveMensajeWhatsApp(e)).toBeNull();
    expect(claveMensajeWhatsApp(null)).toBeNull();
  });

  test('valores: primer nombre, motivo en frase y enlace', () => {
    expect(valoresMensaje({ nombre: 'Ana Gómez', numero: 'WO-000431', motivo: 'Fondos insuficientes', hora: '17:48', url: 'https://tienda.test/pedido/WO-000431?t=x' })).toEqual({
      tieneNombre: 'si',
      nombre: 'Ana',
      numero: 'WO-000431',
      motivo: 'fondos insuficientes',
      hora: '17:48',
      tieneUrl: 'si',
      url: 'https://tienda.test/pedido/WO-000431?t=x',
    });
    expect(valoresMensaje({ nombre: '  ', numero: 'WO-1' })).toMatchObject({ tieneNombre: 'no', nombre: '', motivo: '', tieneUrl: 'no' });
    expect(primerNombre(null)).toBe('');
  });

  test('E invita a la tienda: la raíz del enlace del pedido', () => {
    expect(raizTienda('https://tienda.test/pedido/WO-1?t=abc')).toBe('https://tienda.test');
    expect(raizTienda(null)).toBeNull();
    expect(raizTienda('no es url')).toBeNull();
  });
});

describe('celda «Pago» del listado', () => {
  const resumen = (r: Partial<ResumenPago>): ResumenPago => ({
    web_order_id: 'o-431',
    vence_at: '2026-11-24T20:22:00Z',
    plazo_minutos: 30,
    intentos: 0,
    ultimo_evento: null,
    ultima_pasarela: null,
    ultimo_motivo: null,
    ultimo_codigo_motivo: null,
    ultimo_medio: null,
    ...r,
  });

  test('solo pedidos de pasarela pendientes o vencidos sin pagar', () => {
    expect(muestraCeldaPasarela(pedido({ payment_method: 'bold_link' }))).toBe(true);
    expect(muestraCeldaPasarela(pedido({ payment_status: 'failed' }))).toBe(true);
    expect(muestraCeldaPasarela(pedido({ status: 'expired', payment_status: 'failed' }))).toBe(true);
    expect(muestraCeldaPasarela(pedido({ payment_status: 'paid', status: 'confirmed' }))).toBe(false);
    expect(muestraCeldaPasarela(pedido({ status: 'confirmed' }))).toBe(false);
    expect(muestraCeldaPasarela(pedido({ payment_method: 'cash' }))).toBe(false);
    expect(muestraCeldaPasarela(pedido({ payment_method: 'transfer', delivery_type: 'pickup' }))).toBe(false);
  });

  test('rechazado (Wompi · vence), esperando (Bold · vence), en proceso y vencido (intentos)', () => {
    expect(celdaPasarela(pedido({ payment_status: 'failed' }), resumen({ ultima_pasarela: 'wompi', ultimo_evento: 'declined', intentos: 1 }))).toEqual({
      clave: 'rechazado',
      pasarela: 'Wompi',
      venceAt: '2026-11-24T20:22:00Z',
      intentos: 1,
    });
    expect(celdaPasarela(pedido({ payment_method: 'bold_link' }), resumen({}))).toMatchObject({ clave: 'esperando', pasarela: 'Bold' });
    expect(celdaPasarela(pedido(), resumen({ ultimo_evento: 'pending', intentos: 1 })).clave).toBe('enProceso');
    expect(celdaPasarela(pedido({ status: 'expired', payment_status: 'failed', payment_method: 'bold_link' }), resumen({ intentos: 0 }))).toMatchObject({
      clave: 'vencido',
      pasarela: 'Bold',
      intentos: 0,
    });
  });

  test('sin resumen (cargando): con lo que dice el pedido', () => {
    expect(celdaPasarela(pedido({ payment_status: 'failed' }), undefined)).toEqual({ clave: 'rechazado', pasarela: 'Wompi', venceAt: null, intentos: null });
    // Método que no es una pasarela conocida: la celda usa el nombre del método.
    expect(celdaPasarela(pedido({ payment_method: 'nequi' }), null).pasarela).toBeNull();
  });
});
