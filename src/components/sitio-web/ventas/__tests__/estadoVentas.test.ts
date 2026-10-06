/**
 * Reglas del tablero «Ventas en línea» (Figma B/10-01…10-05): estado por
 * tarjeta, «N de M listos para vender», «Falta: …» y validación del checkout.
 */
import {
  filaDeCambios,
  ordenarTablero,
  progresoVentas,
  tarjetaCheckout,
  tarjetaCupones,
  tarjetaEnvios,
  tarjetaPagos,
  tarjetaPasarela,
  tarjetaPedidos,
  tarjetaReservas,
  validarCambiosCheckout,
  type EnlaceVenta,
  type EntradaTablero,
} from '../estadoVentas';
import { enlacesVisibles, moduloDeRuta } from '@/lib/website/ventasSitio.server';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));
jest.mock('@/lib/services/website/paginasSitioService', () => ({ permisosSitio: jest.fn() }));
jest.mock('@/lib/navigation/navegacionServidor', () => ({ seccionesVisiblesServidor: jest.fn() }));
jest.mock('@/components/sitio-web/seoanalitica/seo.server', () => ({ direccionDelSitio: jest.fn() }));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: jest.fn() }));
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolverContextoMoneda: jest.fn() }));

const enlace = (visible = true, modulo = 'transport'): EnlaceVenta => ({ href: '/app/x', texto: 'irX', visible, modulo });

describe('tarjetas', () => {
  test('checkout: con ajustes está configurado; filas de la captura', () => {
    const t = tarjetaCheckout({
      modo: 'steps',
      tiposEntrega: ['pickup'],
      invitado: true,
      pedidoMinimo: 30000,
      sellos: true,
      logosPago: true,
      ventaEnLinea: true,
      hayAjustes: true,
      editable: true,
    });
    expect(t.estado).toBe('configurado');
    expect(t.filas.map((f) => f.clave)).toEqual(['compraInvitado', 'pedidoMinimo', 'sellosLogos']);
    expect(t.editable).toBe(true);
    expect(t.resumen).toEqual({ tipo: 'checkout', invitado: true, minimo: 30000 });
  });

  test('checkout: sin la migración, invitado se lee como el comportamiento actual (sí)', () => {
    const t = tarjetaCheckout({ modo: 'steps', tiposEntrega: [], invitado: null, pedidoMinimo: undefined, sellos: false, logosPago: false, ventaEnLinea: false, hayAjustes: true, editable: false });
    expect(t.filas[0].valor).toEqual({ tipo: 'si_no', valor: true });
    expect(t.filas[1].valor).toEqual({ tipo: 'importe', valor: null });
    expect(t.editable).toBe(false);
  });

  test('pagos: configurado con al menos un método visible; falta sin ninguno; disponible sin Finanzas', () => {
    const metodos = [
      { nombre: 'Wompi', visible: true, activo: true, conPasarela: true },
      { nombre: 'Transferencia', visible: false, activo: true, conPasarela: false },
      { nombre: 'Viejo', visible: true, activo: false, conPasarela: false },
    ];
    const t = tarjetaPagos(metodos, enlace());
    expect(t.estado).toBe('configurado');
    expect(t.filas.map((f) => f.etiquetaLibre)).toEqual(['Wompi', 'Transferencia']);
    expect(tarjetaPagos([{ nombre: 'Efectivo', visible: false, activo: true, conPasarela: false }], enlace()).estado).toBe('falta');
    expect(tarjetaPagos([], enlace(false)).estado).toBe('disponible');
  });

  test('envíos: con Transporte y sin tarifas por zona falta («hoy solo tarifa plana»)', () => {
    const t = tarjetaEnvios({ enlace: enlace(), envioActivo: true, tiposEntrega: ['delivery_own'], tarifaPlana: 12000, envioGratisDesde: 200000, tarifasZonaWeb: 0 });
    expect(t.estado).toBe('falta');
    expect(t.falta).toBe('enviosSoloPlana');
    expect(t.filas.find((f) => f.clave === 'tarifasZona')?.marca).toBe('alerta');
  });

  test('envíos: con tarifas por zona está configurado', () => {
    expect(tarjetaEnvios({ enlace: enlace(), envioActivo: true, tiposEntrega: ['delivery_own'], tarifaPlana: null, envioGratisDesde: null, tarifasZonaWeb: 3 }).estado).toBe('configurado');
  });

  test('envíos: sin Transporte la tarifa plana es la alternativa; sin ella, «Disponible con Transporte»', () => {
    const conPlana = tarjetaEnvios({ enlace: enlace(false), envioActivo: true, tiposEntrega: ['delivery_own'], tarifaPlana: 10000, envioGratisDesde: null, tarifasZonaWeb: 0 });
    expect(conPlana.estado).toBe('configurado');
    expect(conPlana.origen).toBe('enviosPlana');
    expect(conPlana.filas.some((f) => f.clave === 'tarifasZona')).toBe(false);
    expect(tarjetaEnvios({ enlace: enlace(false), envioActivo: true, tiposEntrega: ['delivery_own'], tarifaPlana: null, envioGratisDesde: null, tarifasZonaWeb: 0 }).estado).toBe('disponible');
  });

  test('envíos: solo retiro en tienda → opcional', () => {
    expect(tarjetaEnvios({ enlace: enlace(), envioActivo: true, tiposEntrega: ['pickup'], tarifaPlana: 1, envioGratisDesde: null, tarifasZonaWeb: 0 }).estado).toBe('opcional');
  });

  test('cupones siempre opcional; pedidos falta si el sitio no recibe pedidos', () => {
    expect(tarjetaCupones({ enlace: enlace(), cuponesUsables: 2, promocionesWeb: 0 }).estado).toBe('opcional');
    expect(tarjetaPedidos({ enlace: enlace(), ventaEnLinea: false, pendientes: 0, pagadosHoy: 0, totalHoy: 0, avisosCliente: [] }).estado).toBe('falta');
    const p = tarjetaPedidos({ enlace: enlace(), ventaEnLinea: true, pendientes: 12, pagadosHoy: 8, totalHoy: 1240000, avisosCliente: ['correo'] });
    expect(p.estado).toBe('configurado');
    expect(p.filas[1].valor).toEqual({ tipo: 'pedidos_hoy', cantidad: 8, total: 1240000 });
    // Captura B/10-01: la tercera fila es «Avisos al cliente», con los canales reales.
    expect(p.filas.map((f) => f.clave)).toEqual(['pendientes', 'pagadosHoy', 'avisosCliente']);
    expect(p.filas[2]).toMatchObject({ marca: 'ok', valor: { tipo: 'avisos', canales: ['correo'] } });
  });

  test('reservas: configurado si alguna sede recibe; interruptor solo con sedes configuradas y permiso', () => {
    const r = tarjetaReservas({ enlace: enlace(), sedes: [{ nombre: 'Centro', recibiendo: true }, { nombre: 'Norte', recibiendo: false }] }, true);
    expect(r.estado).toBe('configurado');
    expect(r.interruptor).toEqual({ valor: true, habilitado: true });
    const vacia = tarjetaReservas({ enlace: enlace(), sedes: [] }, true);
    expect(vacia.estado).toBe('opcional');
    expect(vacia.interruptor?.habilitado).toBe(false);
  });

  test('pasarela: lista solo si está conectada Y enlazada a un método visible', () => {
    const base = { enlace: enlace(), conexiones: [{ proveedor: 'Wompi', estado: 'connected', entorno: 'production' }], firma: 'match' as const, ultimoPago: '2026-10-08T10:00:00Z' };
    expect(tarjetaPasarela({ ...base, enlazadaAlSitio: true }).estado).toBe('configurado');
    const sinEnlace = tarjetaPasarela({ ...base, enlazadaAlSitio: false });
    expect(sinEnlace.estado).toBe('falta');
    expect(sinEnlace.filas.some((f) => f.clave === 'pasarelaNoVisible')).toBe(true);
    const nada = tarjetaPasarela({ enlace: enlace(), conexiones: [], firma: null, ultimoPago: null, enlazadaAlSitio: false });
    expect(nada.estado).toBe('falta');
    expect(nada.resumen).toEqual({ tipo: 'pasarela', proveedor: null, firmaVerificada: false });
  });
});

describe('progresoVentas', () => {
  const captura = (): EntradaTablero[] => [
    tarjetaCheckout({ modo: 'steps', tiposEntrega: ['delivery_own'], invitado: true, pedidoMinimo: 30000, sellos: true, logosPago: true, ventaEnLinea: true, hayAjustes: true, editable: true }),
    tarjetaPagos([{ nombre: 'Wompi', visible: true, activo: true, conPasarela: true }], enlace()),
    tarjetaEnvios({ enlace: enlace(), envioActivo: true, tiposEntrega: ['delivery_own'], tarifaPlana: 12000, envioGratisDesde: 200000, tarifasZonaWeb: 0 }),
    tarjetaCupones({ enlace: enlace(), cuponesUsables: 2, promocionesWeb: 0 }),
    tarjetaPedidos({ enlace: enlace(), ventaEnLinea: true, pendientes: 12, pagadosHoy: 8, totalHoy: 1, avisosCliente: ['correo'] }),
    tarjetaReservas({ enlace: enlace(), sedes: [{ nombre: 'Centro', recibiendo: true }] }, true),
    tarjetaPasarela({ enlace: enlace(), conexiones: [{ proveedor: 'Wompi', estado: 'connected', entorno: 'production' }], firma: 'match', ultimoPago: null, enlazadaAlSitio: true }),
  ];

  test('la captura B/10-01: «5 de 6 listos», falta tarifas por zona, cupones no cuenta', () => {
    expect(progresoVentas(captura())).toEqual({ listos: 5, total: 6, faltan: ['enviosSoloPlana'], sinVender: false });
  });

  test('una tarjeta con error no cuenta y no dispara el vacío', () => {
    const t = captura();
    t[2] = { tema: 'envios', error: true };
    expect(progresoVentas(t)).toEqual({ listos: 5, total: 5, faltan: [], sinVender: false });
  });

  test('ninguna obligatoria configurada → «Tu sitio todavía no vende»', () => {
    const t: EntradaTablero[] = [
      tarjetaPagos([], enlace()),
      tarjetaPasarela({ enlace: enlace(), conexiones: [], firma: null, ultimoPago: null, enlazadaAlSitio: false }),
      tarjetaCupones({ enlace: enlace(), cuponesUsables: 0, promocionesWeb: 0 }),
    ];
    expect(progresoVentas(t).sinVender).toBe(true);
  });

  test('ordenarTablero respeta el orden de la captura', () => {
    expect(ordenarTablero([{ tema: 'pasarela' }, { tema: 'checkout' }, { tema: 'envios' }]).map((x) => x.tema)).toEqual(['checkout', 'envios', 'pasarela']);
  });
});

describe('validarCambiosCheckout', () => {
  test('«Comer aquí» (dine_in) se suma a retiro o domicilio, pero no basta solo', () => {
    const ok = validarCambiosCheckout({ tiposEntrega: ['pickup', 'dine_in'] });
    expect(ok.ok && ok.cambios.tiposEntrega).toEqual(['pickup', 'dine_in']);
    expect(validarCambiosCheckout({ tiposEntrega: ['dine_in'] })).toEqual({ ok: false, campos: ['tiposEntrega'] });
  });

  test('acepta la lista blanca y mapea a columnas', () => {
    const v = validarCambiosCheckout({ modo: 'one_page', tiposEntrega: ['pickup', 'pickup'], pedidoMinimo: 30000, invitado: false, listaSellos: [{ icono: 'x', texto: ' Compra segura ' }] });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.cambios.tiposEntrega).toEqual(['pickup']);
    expect(filaDeCambios(v.cambios)).toEqual({
      checkout_mode: 'one_page',
      available_delivery_types: ['pickup'],
      checkout_min_order_amount: 30000,
      checkout_guest_enabled: false,
      checkout_trust_badges: [{ icon: 'x', text: 'Compra segura' }],
    });
  });

  test('rechaza claves desconocidas, importes negativos y tipos de entrega vacíos o raros', () => {
    const v = validarCambiosCheckout({ organization_id: 5, pedidoMinimo: -1, tiposEntrega: [], modo: 'x', custom_scripts: '<script>' });
    expect(v.ok).toBe(false);
    if (v.ok) return;
    expect(v.campos.sort()).toEqual(['custom_scripts', 'modo', 'organization_id', 'pedidoMinimo', 'tiposEntrega'].sort());
    expect(validarCambiosCheckout({ tiposEntrega: ['dron'] }).ok).toBe(false);
    expect(validarCambiosCheckout([]).ok).toBe(false);
  });

  test('null en un importe significa «sin mínimo» / «sin envío gratis»', () => {
    const v = validarCambiosCheckout({ pedidoMinimo: null, envioGratisDesde: null });
    expect(v.ok && filaDeCambios(v.cambios)).toEqual({ checkout_min_order_amount: null, free_shipping_threshold: null });
  });
});

describe('enlaces a los módulos dueños', () => {
  test('visibles solo si la persona ve la página; módulo del catálogo para «Disponible con…»', () => {
    const e = enlacesVisibles(new Set(['/app/transporte/tarifas-envio', '/app/pos/reservas-mesas']));
    expect(e.envios).toMatchObject({ visible: true, modulo: 'transport' });
    expect(e.reservas.visible).toBe(true);
    expect(e.pagos).toMatchObject({ visible: false, modulo: 'finance' });
    expect(moduloDeRuta('/app/pos/cupones')).toBe('pointOfSale');
    expect(moduloDeRuta('/app/integraciones/conexiones')).toBe('integrations');
  });
});
