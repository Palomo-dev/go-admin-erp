/**
 * Guía / rótulo de envío estándar (Figma «21 Logística» 3223:15627, aprobado 2026-11-25): los
 * datos y los textos salen de una sola función para la vista previa, el PDF y la térmica.
 * - Un solo número en el papel: la guía (`shipment_number`); el TRK interno no sale.
 * - Contraentrega = saldo (ya restado el anticipo) en «COBRAR AL ENTREGAR»; sin cobro, «PAGADO · NO COBRAR».
 * - Sin productos, precios, SKU ni textos internos; campos vacíos no salen.
 * - Indicaciones sin «País: COL (05)» ni los datos de la factura electrónica.
 * - «FRÁGIL» (3224:15741) cuando el envío lo marca; encomienda a la terminal (3224:15906) cuando va
 *   en un viaje de Transporte que se pudo leer; sin viaje, la guía normal.
 */
import {
  buildPlainTextShipmentGuide,
  buildShipmentGuidesHTML,
  getPaperSpec,
  DEFAULT_PAPER_WIDTH,
  rasterToBmpDataUrl,
  writeRasterPage,
  type MonochromeRaster,
} from '@printing';
import es from '../../../../messages/es.json';
import { limpiarIndicaciones } from '../indicacionesEntrega';
import type { SupabaseClient } from '@supabase/supabase-js';
import { enviosParaGuias } from '@/lib/services/logistica/despachoService';
import {
  contraentregaPendiente,
  datosRotuloDeEnvio,
  esTrabajoRotulos,
  hojasA4,
  numeroGuia,
  payloadAgenteDeRotulo,
  rotulosParaImprimir,
  textosRotulo,
  tipoEntregaDe,
  type EnvioParaRotulo,
  type TraducirRotulo,
  type ViajeParaRotulo,
} from '../rotuloEnvio';

type Arbol = { [k: string]: string | Arbol };
const mensajes = (es as unknown as { logistica: { rotulo: Arbol } }).logistica.rotulo;
/** Traductor mínimo con los textos reales en español (sin plurales: el rótulo no los usa). */
const t: TraducirRotulo = (clave, valores = {}) => {
  const m = clave.split('.').reduce<string | Arbol>((n, k) => (n as Arbol)[k], mensajes);
  if (typeof m !== 'string') throw new Error(`Falta ${clave}`);
  return m.replace(/\{(\w+)\}/g, (_, k: string) => String(valores[k] ?? `{${k}}`));
};
const peso = (kg: number) => kg.toLocaleString('es-CO');

const ctx = {
  formatearMonto: (monto: number) => `$ ${monto.toLocaleString('es-CO')}`,
  formatearFecha: (iso: string) => (iso.startsWith('2026-11-25') ? '25 nov 2026, 10:40' : '24 nov 2026, 11:52'),
};

const envio = (p: Partial<EnvioParaRotulo> = {}): EnvioParaRotulo => ({
  id: 'e1',
  shipment_number: 'DEL-WO-412-0031',
  tracking_number: 'TRKMWVS6ZH3SXME',
  source_type: 'web_order',
  source_id: 'p1',
  created_at: '2026-11-24T16:52:00Z',
  dispatched_at: '2026-11-25T15:40:00Z',
  fulfillment_mode: 'own',
  delivery_address: 'Cra 45 # 12-30, apto 502',
  delivery_city: 'Bogotá D.C.',
  delivery_department: 'Cundinamarca',
  delivery_contact_name: 'Valentina Rojas Pérez',
  delivery_contact_phone: '300 555 1234',
  delivery_instructions: 'dejar en portería con el vigilante. | País: COL (11)',
  package_count: 1,
  weight_kg: '1.2',
  cod_amount: '128900',
  cod_status: 'pending',
  currency: 'COP',
  delivery_code_required: false,
  metadata: { web_order_number: 'WO-412', delivery_neighborhood: 'Barrio Chapinero Alto', delivery_type: 'delivery_own', vehiculo: { tipo: 'motorcycle', placa: 'KLM48F' } },
  branch: { name: 'Sede Chapinero', city: 'Bogotá', phone: '601 555 0142', website_logo_url: null },
  organization: [{ name: 'Tienda Ejemplo', logo_url: null, phone: null }],
  carrier: null,
  ...p,
});

const textos = (p: Partial<EnvioParaRotulo> = {}, servidor?: Parameters<typeof datosRotuloDeEnvio>[1]['servidor']) =>
  rotulosParaImprimir([datosRotuloDeEnvio(envio(p), { ...ctx, servidor })], 1).map((d) => textosRotulo(d, t, peso));

describe('indicaciones de entrega', () => {
  test('quita «País: COL (xx)» y los datos de la factura electrónica, conserva lo del cliente', () => {
    expect(limpiarIndicaciones('País: COL (05)')).toBeNull();
    expect(limpiarIndicaciones('País: COL')).toBeNull();
    expect(limpiarIndicaciones('Timbre 2 | País: CO (ANT)')).toBe('Timbre 2');
    expect(limpiarIndicaciones('Llamar cuando esté cerca  | País: COL (05)')).toBe('Llamar cuando esté cerca');
    expect(limpiarIndicaciones('[Factura electrónica] Cédula 1.000.000 · Nombre · correo@x.co')).toBeNull();
    expect(limpiarIndicaciones('Casa azul [Factura electrónica] Cédula 1 · x@y.co | País: COL')).toBe('Casa azul');
    expect(limpiarIndicaciones('El país: Colombia, al lado del parque')).toBe('El país: Colombia, al lado del parque');
    expect(limpiarIndicaciones(null)).toBeNull();
  });
});

describe('rótulo de envío', () => {
  test('la guía es shipment_number; el tracking interno nunca la reemplaza', () => {
    expect(numeroGuia(envio())).toBe('DEL-WO-412-0031');
    expect(numeroGuia(envio({ shipment_number: '' }))).toBe('e1');
  });

  test('arma el rótulo del Figma: remitente de la tienda, destinatario, paquete, peso, entrega, cobro y pie', () => {
    const [l] = textos({}, { e1: { seguimiento: 'https://tienda.example.co/pedido/WO-412?t=abc', anticipoPagado: true } });
    expect(l).toMatchObject({
      storeName: 'Tienda Ejemplo',
      initials: 'TE',
      branchLine: 'Sede Chapinero · Bogotá · Tel. 601 555 0142',
      receiverName: 'Valentina Rojas Pérez',
      address: 'Cra 45 # 12-30, apto 502',
      neighborhood: 'Barrio Chapinero Alto',
      destination: 'BOGOTÁ D.C. · CUNDINAMARCA',
      phone: 'Tel. 300 555 1234',
      instructions: 'Indicaciones: dejar en portería con el vigilante.',
      packageText: '1 de 1',
      weightText: '1,2 kg',
      deliveryText: 'Domicilio propio',
      carrierGuideText: null,
      charge: { kind: 'collect', title: 'COBRAR AL ENTREGAR', amount: '$ 128.900', note: 'Saldo después del anticipo pagado en línea. No entregue sin cobrar.' },
      guideNumber: 'DEL-WO-412-0031',
      qrData: 'https://tienda.example.co/pedido/WO-412?t=abc',
      qrCaption: 'Sigue tu pedido',
      footer: 'Despachado 25 nov 2026, 10:40 · Pedido web WO-412 · Moto KLM48F',
    });
    // Un solo número en el papel.
    expect(JSON.stringify(l)).not.toContain('TRKMWVS6ZH3SXME');
  });

  test('sin contraentrega: «PAGADO · NO COBRAR»; cobrada o consignada tampoco se vuelve a pedir', () => {
    expect(textos({ cod_amount: 0 })[0].charge).toEqual({ kind: 'paid', title: 'PAGADO · NO COBRAR', amount: null, note: 'El cliente ya pagó. No reciba dinero.' });
    expect(contraentregaPendiente({ cod_amount: 5000, cod_status: 'collected' })).toBe(0);
    expect(contraentregaPendiente({ cod_amount: 5000, cod_status: 'remitted' })).toBe(0);
    expect(textos({ cod_status: 'collected' })[0].charge.kind).toBe('paid');
  });

  test('sin anticipo la nota es la general; con código de entrega se pide el código', () => {
    expect(textos()[0].charge.note).toBe('No entregue sin cobrar.');
    expect(textos({ delivery_code_required: true })[0].charge.note).toBe('No entregue sin cobrar. Pida el código de entrega.');
  });

  test('campos vacíos no salen: sin peso, barrio, indicaciones reales, vehículo ni fecha de despacho', () => {
    const [l] = textos({
      weight_kg: 0,
      delivery_instructions: 'País: COL (05)',
      metadata: { web_order_number: 'WO-415' },
      dispatched_at: null,
    });
    expect(l.weightText).toBeNull();
    expect(l.neighborhood).toBeNull();
    expect(l.instructions).toBeNull();
    // Sin despacho: el pie dice cuándo se imprimió solo si hay fecha de impresión; aquí no la hay.
    expect(l.footer).toBe('Pedido web WO-415');
    // Sin seguimiento firmado, el QR lleva la guía y no promete «Sigue tu pedido».
    expect(l.qrData).toBe('DEL-WO-412-0031');
    expect(l.qrCaption).toBeNull();
  });

  test('varios paquetes: un rótulo por paquete con sufijo y el cobro una sola vez por el total', () => {
    const lista = textos({ package_count: 3 });
    expect(lista.map((l) => [l.guideNumber, l.packageText])).toEqual([
      ['DEL-WO-412-0031-1', '1 de 3'],
      ['DEL-WO-412-0031-2', '2 de 3'],
      ['DEL-WO-412-0031-3', '3 de 3'],
    ]);
    expect(lista[1].charge).toMatchObject({ title: 'COBRAR AL ENTREGAR · UNA VEZ', note: 'Total del envío de 3 paquetes. Entregue los 3 juntos.' });
  });

  test('transportadora: tipo en palabras, su guía con su código y el pie «Entregado a la transportadora»', () => {
    const e = { fulfillment_mode: 'national_carrier', tracking_number: '7012 4455 9981', carrier: { name: 'Rápido Andino' }, cod_amount: 0 };
    const [l] = textos(e);
    expect(l.deliveryText).toBe('Transportadora: Rápido Andino');
    expect(l.carrierGuideText).toBe('Rápido Andino · 7012 4455 9981');
    expect(l.carrierGuideCode).toBe('7012 4455 9981');
    expect(l.footer).toMatch(/^Entregado a la transportadora 25 nov 2026, 10:40 · Pedido web WO-412$/);
    expect(tipoEntregaDe({ fulfillment_mode: 'own', metadata: { delivery_type: 'pickup' } })).toBe('recoger');
  });

  test('copias por envío: seguidas, entre 1 y 10', () => {
    const a = datosRotuloDeEnvio(envio(), ctx);
    const b = datosRotuloDeEnvio(envio({ id: 'e2', shipment_number: 'DEL-2' }), ctx);
    expect(rotulosParaImprimir([a, b], 2).map((r) => r.numero)).toEqual(['DEL-WO-412-0031', 'DEL-WO-412-0031', 'DEL-2', 'DEL-2']);
    expect(rotulosParaImprimir([a], 50)).toHaveLength(10);
    expect(rotulosParaImprimir([a], 0)).toHaveLength(1);
  });

  test('A4: cuatro por hoja, la última con cuartos libres', () => {
    expect(hojasA4([1, 2, 3, 4, 5]).map((h) => h.length)).toEqual([4, 1]);
    expect(hojasA4([])).toEqual([]);
  });

  test('el trabajo de la página de impresión se valida antes de pintarse', () => {
    expect(esTrabajoRotulos({ version: 2, creadoEn: 1, formato: 'a4', rotulos: textos() })).toBe(true);
    expect(esTrabajoRotulos({ version: 2, creadoEn: 1, formato: 'carta', rotulos: textos() })).toBe(false);
    expect(esTrabajoRotulos({ version: 1, rotulos: [{}] })).toBe(false);
    expect(esTrabajoRotulos(null)).toBe(false);
  });
});

describe('frágil (Figma 3224:15741)', () => {
  test('el envío marcado lleva el aviso; sin marca no sale nada', () => {
    expect(textos({ is_fragile: true })[0].handling).toBe('FRÁGIL · MANIPULAR CON CUIDADO · ESTE LADO ARRIBA');
    expect(textos({ is_fragile: false })[0].handling).toBeNull();
    expect(textos()[0].handling).toBeNull();
  });

  test('los envíos que lo guardaron en la metadata (antes de la columna) también lo llevan', () => {
    expect(textos({ metadata: { is_fragile: true } })[0].handling).toBe('FRÁGIL · MANIPULAR CON CUIDADO · ESTE LADO ARRIBA');
  });

  test('cada paquete del envío lo lleva', () => {
    expect(textos({ is_fragile: true, package_count: 2 }).map((l) => l.handling)).toEqual([
      'FRÁGIL · MANIPULAR CON CUIDADO · ESTE LADO ARRIBA',
      'FRÁGIL · MANIPULAR CON CUIDADO · ESTE LADO ARRIBA',
    ]);
  });
});

describe('encomienda a la terminal (Figma 3224:15906)', () => {
  const viaje: ViajeParaRotulo = {
    codigo: 'V-1118',
    salida: '2026-11-24T20:00:00Z',
    placa: 'WNP103',
    terminal: { nombre: 'Terminal de Tunja', direccion: 'oficina 4', ciudad: 'Tunja', departamento: 'Boyacá' },
  };
  const encomienda = (p: Partial<EnvioParaRotulo> = {}) =>
    textos({
      source_type: 'manual',
      source_id: null,
      delivery_address: 'Calle 10 # 5-20',
      delivery_city: 'Tunja',
      delivery_department: 'Boyacá',
      delivery_contact_name: 'Laura Medina',
      delivery_contact_phone: '314 222 9010',
      delivery_instructions: 'Llamar al llegar',
      cod_amount: '120000',
      metadata: { trip_id: '0f0e0d0c-0b0a-4908-8706-050403020100', vehiculo: { tipo: 'motorcycle', placa: 'KLM48F' } },
      viaje,
      ...p,
    })[0];

  test('destino = la oficina de la terminal, entrega en palabras, cobro en la oficina y el pie con el viaje y el bus', () => {
    expect(encomienda()).toMatchObject({
      receiverName: 'Laura Medina',
      address: 'Terminal de Tunja · oficina 4',
      neighborhood: null,
      destination: 'TUNJA · BOYACÁ',
      phone: 'Tel. 314 222 9010',
      instructions: 'Recoge en oficina presentando cédula.',
      deliveryText: 'Encomienda · recoge en oficina',
      charge: { kind: 'collect', title: 'COBRAR AL ENTREGAR', amount: '$ 120.000', note: 'Cobrar en la oficina antes de entregar.' },
      footer: 'Despachado 25 nov 2026, 10:40 · Viaje V-1118 · Bus WNP103',
    });
  });

  test('nunca el conductor ni la moto del domiciliario; sin despachar, el pie dice cuándo sale el viaje', () => {
    const l = encomienda({ dispatched_at: null });
    expect(l.footer).toBe('Viaje V-1118, sale 24 nov 2026, 11:52 · Bus WNP103');
    expect(l.footer).not.toContain('Moto');
  });

  test('sin parada de destino conocida: la dirección del envío, pero sigue siendo encomienda', () => {
    const l = encomienda({ viaje: { ...viaje, terminal: null } });
    expect(l.address).toBe('Calle 10 # 5-20');
    expect(l.instructions).toBe('Indicaciones: Llamar al llegar');
    expect(l.deliveryText).toBe('Encomienda · recoge en oficina');
    expect(l.charge.note).toBe('No entregue sin cobrar.');
  });

  test('sin datos del viaje: la guía normal', () => {
    const l = encomienda({ viaje: null });
    expect(l.deliveryText).toBe('Domicilio propio');
    expect(l.address).toBe('Calle 10 # 5-20');
    expect(l.footer).toBe('Despachado 25 nov 2026, 10:40 · Moto KLM48F');
  });
});

describe('enviosParaGuias: el viaje de la encomienda', () => {
  const TRIP = '0f0e0d0c-0b0a-4908-8706-050403020100';
  const PARADA = '1f0e0d0c-0b0a-4908-8706-050403020100';
  /** Cliente falso: responde por tabla y registra los filtros. */
  function db(respuestas: Record<string, unknown[] | Error>) {
    const llamadas: { tabla: string; metodos: [string, unknown[]][] }[] = [];
    return {
      llamadas,
      cliente: {
        from(tabla: string) {
          const llamada = { tabla, metodos: [] as [string, unknown[]][] };
          llamadas.push(llamada);
          const cadena: Record<string, unknown> = {};
          for (const m of ['select', 'eq', 'in']) {
            cadena[m] = (...a: unknown[]) => {
              llamada.metodos.push([m, a]);
              return cadena;
            };
          }
          const r = respuestas[tabla];
          cadena.then = (ok: (v: unknown) => unknown) => ok(r instanceof Error ? { data: null, error: r } : { data: r ?? [], error: null });
          return cadena;
        },
      } as unknown as SupabaseClient,
    };
  }

  test('lee el viaje, el bus y la parada (la del envío manda sobre la de la ruta), filtrado por la organización', async () => {
    const { cliente, llamadas } = db({
      shipments: [
        { id: 'a', metadata: { trip_id: TRIP, destination_stop_id: PARADA } },
        { id: 'b', metadata: { trip_id: TRIP } },
        { id: 'c', metadata: {} },
      ],
      trips: [
        {
          id: TRIP,
          trip_code: 'V-1118',
          scheduled_departure: '2026-11-25T15:00:00Z',
          vehicle: { plate: 'WNP103' },
          route: { destino: { id: 'r', name: 'Terminal Norte', address: null, city: 'Tunja', department: 'Boyacá' } },
        },
      ],
      transport_stops: [{ id: PARADA, name: 'Terminal de Tunja', address: 'oficina 4', city: 'Tunja', department: 'Boyacá' }],
    });
    const envios = await enviosParaGuias(cliente, 7, ['a', 'b', 'c']);
    expect(envios.map((e) => e.viaje?.terminal?.nombre ?? null)).toEqual(['Terminal de Tunja', 'Terminal Norte', null]);
    expect(envios[0].viaje).toMatchObject({ codigo: 'V-1118', placa: 'WNP103' });
    expect(envios[2].viaje).toBeNull();
    for (const l of llamadas) expect(l.metodos).toContainEqual(['eq', ['organization_id', 7]]);
    expect(llamadas.find((l) => l.tabla === 'trips')?.metodos).toContainEqual(['in', ['id', [TRIP]]]);
  });

  test('si el viaje no se puede leer, los envíos salen sin viaje (guía normal)', async () => {
    const aviso = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { cliente } = db({ shipments: [{ id: 'a', metadata: { trip_id: TRIP } }], trips: new Error('permiso') });
    const envios = await enviosParaGuias(cliente, 7, ['a']);
    expect(envios[0].viaje).toBeNull();
    aviso.mockRestore();
  });

  test('un trip_id que no es un uuid no se consulta', async () => {
    const { cliente, llamadas } = db({ shipments: [{ id: 'a', metadata: { trip_id: 'no-es-un-uuid' } }] });
    await enviosParaGuias(cliente, 7, ['a']);
    expect(llamadas.map((l) => l.tabla)).toEqual(['shipments']);
  });
});

describe('agente de impresión: la misma plantilla', () => {
  const paper = getPaperSpec(DEFAULT_PAPER_WIDTH);

  test('sin imagen, el respaldo en texto dice lo mismo: sin productos, precios, TRK, estado crudo ni GO Admin', () => {
    const payload = { ...payloadAgenteDeRotulo('e1', textos()[0]), status: 'out_for_delivery', trackingNumber: 'TRKMWVS6ZH3SXME' };
    for (const salida of [buildShipmentGuidesHTML([payload], paper), buildPlainTextShipmentGuide(payload, paper)]) {
      expect(salida).toContain('DEL-WO-412-0031');
      expect(salida).toContain('Valentina Rojas Pérez');
      expect(salida).toContain('COBRAR AL ENTREGAR');
      expect(salida).toContain('$ 128.900');
      expect(salida).not.toMatch(/TRKMWVS6ZH3SXME|OUT_FOR_DELIVERY|GUIA DE ENVIO|Valor Items|SKU|Firma|GO Admin|goadmin|País: COL/i);
    }
    const pagado = buildPlainTextShipmentGuide(payloadAgenteDeRotulo('e1', textos({ cod_amount: 0 })[0]), paper);
    expect(pagado).toContain('PAGADO · NO COBRAR');
  });

  test('frágil también en el respaldo en texto y en el payload clásico (isFragile)', () => {
    const fragil = payloadAgenteDeRotulo('e1', textos({ is_fragile: true })[0]);
    expect(buildPlainTextShipmentGuide(fragil, paper)).toContain('FRÁGIL · MANIPULAR CON CUIDADO');
    expect(buildShipmentGuidesHTML([fragil], paper)).toContain('FRÁGIL · MANIPULAR CON CUIDADO');
    expect(buildPlainTextShipmentGuide(payloadAgenteDeRotulo('e1', textos()[0]), paper)).not.toContain('FRÁGIL');
    const clasico = { shipmentId: 'x', shipmentNumber: 'ENV-1', createdAt: '2026-11-25T15:00:00Z', isFragile: true };
    expect(buildPlainTextShipmentGuide(clasico, paper)).toContain('FRÁGIL · MANIPULAR CON CUIDADO');
  });

  test('con imagen, la impresora del sistema muestra esa imagen y la térmica la manda en bandas GS v 0', () => {
    // 16 × 300 puntos: 2 bytes por fila, una franja negra.
    const filas = 300;
    const bytes = Array.from({ length: 2 * filas }, (_, i) => (i % 2 === 0 ? 0xff : 0x00));
    const raster: MonochromeRaster = { width: 16, height: filas, data: Buffer.from(bytes).toString('base64') };
    const payload = payloadAgenteDeRotulo('e1', textos()[0], raster);
    const html = buildShipmentGuidesHTML([payload], paper);
    expect(html).toContain('data:image/bmp;base64,');
    expect(html).not.toContain('COBRAR AL ENTREGAR');

    const crudo: Buffer[] = [];
    expect(writeRasterPage({ raw: (b: Buffer) => crudo.push(b) }, raster, 576)).toBe(true);
    // 300 filas → bandas de 128, 128 y 44, cada una con su cabecera «GS v 0».
    expect(crudo.map((b) => [b[0], b[1], b[2], b[6] | (b[7] << 8)])).toEqual([
      [0x1d, 0x76, 0x30, 128],
      [0x1d, 0x76, 0x30, 128],
      [0x1d, 0x76, 0x30, 44],
    ]);
    expect(crudo.reduce((n, b) => n + b.length - 8, 0)).toBe(2 * filas);
    // Más ancho que el cabezal: no se imprime la imagen (sale el texto).
    expect(writeRasterPage({ raw: () => undefined }, raster, 8)).toBe(false);
    // BMP válido: firma «BM» y 1 bit por píxel.
    const bmp = Buffer.from((rasterToBmpDataUrl(raster, 576) ?? '').split(',')[1], 'base64');
    expect(bmp.subarray(0, 2).toString()).toBe('BM');
    expect(bmp.readUInt16LE(28)).toBe(1);
    expect(bmp.readInt32LE(18)).toBe(16);
  });
});
