// ============================================================
// Liberar una mesa con saldo (decisión del dueño, 2026-09-23).
//
// Lógica de decisión: qué opciones ofrece el diálogo y qué acepta la ruta
// según el saldo de la venta, el cliente, los pagos/factura y el permiso de
// anular. El saldo lo calcula la base (`fn_pos_mesa_saldo`); aquí se decide.
// ============================================================

import {
  decidirLiberacion,
  errorDeRpc,
  MOTIVO_MAX,
  validarAccion,
  type ResumenLiberacion,
  type VentaMesaSaldo,
} from '@/lib/pos/mesas/liberacionMesa';

function venta(parcial: Partial<VentaMesaSaldo> = {}): VentaMesaSaldo {
  return {
    sale_id: 'venta-1',
    estado: 'pending',
    customer_id: null,
    branch_id: 1,
    total: 30000,
    pagado: 0,
    saldo: 30000,
    division: false,
    facturas: 0,
    factura_saldo: 0,
    factura_con_cliente: false,
    ...parcial,
  };
}

function resumen(v: VentaMesaSaldo | null, extra: Partial<ResumenLiberacion> = {}): ResumenLiberacion {
  return {
    mesa: { id: 'mesa-1', nombre: 'Mesa 4', zona: 'Terraza', estado: 'occupied' },
    sesion: { id: 'ses-1', estado: 'active', abierta_en: null, minutos_abierta: 42, comensales: 2, mesero: 'Ana' },
    venta: v,
    cliente: v?.customer_id ? { id: v.customer_id, nombre: 'Cliente' } : null,
    cocina: [],
    otras_sesiones_con_saldo: 0,
    ...extra,
  };
}

const CON_PERMISO = { puedeAnular: true };
const SIN_PERMISO = { puedeAnular: false };

describe('decidirLiberacion — sin saldo', () => {
  test('mesa sin venta: confirmación simple, solo «liberar»', () => {
    const d = decidirLiberacion(resumen(null), SIN_PERMISO);
    expect(d.requiereResolucion).toBe(false);
    expect(d.opciones.liberar.disponible).toBe(true);
    expect(d.opciones.cartera).toEqual({ disponible: false, motivo: 'sin_saldo' });
    expect(d.opciones.anular).toEqual({ disponible: false, motivo: 'sin_saldo' });
  });

  test('venta pagada (saldo 0): liberar sin preguntar nada más', () => {
    const d = decidirLiberacion(resumen(venta({ estado: 'paid', pagado: 30000, saldo: 0, facturas: 1 })), CON_PERMISO);
    expect(d.requiereResolucion).toBe(false);
    expect(d.saldo).toBe(0);
    expect(d.opciones.liberar.disponible).toBe(true);
  });

  test('un saldo negativo o basura cuenta como 0', () => {
    expect(decidirLiberacion(resumen(venta({ saldo: -5 })), CON_PERMISO).requiereResolucion).toBe(false);
    expect(decidirLiberacion(resumen(venta({ saldo: Number.NaN })), CON_PERMISO).requiereResolucion).toBe(false);
  });
});

describe('decidirLiberacion — con saldo', () => {
  test('liberar a secas deja de estar disponible (era el defecto D1)', () => {
    const d = decidirLiberacion(resumen(venta()), CON_PERMISO);
    expect(d.requiereResolucion).toBe(true);
    expect(d.opciones.liberar).toEqual({ disponible: false, motivo: 'saldo_pendiente' });
    expect(d.opciones.cobrar.disponible).toBe(true);
  });

  test('cartera exige cliente', () => {
    expect(decidirLiberacion(resumen(venta()), CON_PERMISO).opciones.cartera).toEqual({ disponible: false, motivo: 'sin_cliente' });
    expect(decidirLiberacion(resumen(venta({ customer_id: 'c-1' })), CON_PERMISO).opciones.cartera).toEqual({
      disponible: true,
      modo: 'crear',
    });
  });

  test('cartera con pagos parciales sin factura no se ofrece', () => {
    const d = decidirLiberacion(resumen(venta({ customer_id: 'c-1', pagado: 10000, saldo: 20000 })), CON_PERMISO);
    expect(d.opciones.cartera).toEqual({ disponible: false, motivo: 'venta_con_pagos' });
  });

  test('ya facturada con el saldo y el cliente: la cartera ya existe', () => {
    const d = decidirLiberacion(
      resumen(venta({ customer_id: 'c-1', pagado: 10000, saldo: 20000, facturas: 1, factura_saldo: 20000, factura_con_cliente: true })),
      CON_PERMISO,
    );
    expect(d.opciones.cartera).toEqual({ disponible: true, modo: 'existente' });
  });

  test('ya facturada por otro saldo o sin cliente en la factura: no', () => {
    const otroSaldo = decidirLiberacion(
      resumen(venta({ customer_id: 'c-1', saldo: 20000, facturas: 1, factura_saldo: 0, factura_con_cliente: true })),
      CON_PERMISO,
    );
    expect(otroSaldo.opciones.cartera).toEqual({ disponible: false, motivo: 'venta_con_factura' });
    const sinCliente = decidirLiberacion(
      resumen(venta({ customer_id: 'c-1', saldo: 20000, facturas: 1, factura_saldo: 20000, factura_con_cliente: false })),
      CON_PERMISO,
    );
    expect(sinCliente.opciones.cartera.motivo).toBe('venta_con_factura');
  });

  test('anular exige el permiso resuelto en el servidor', () => {
    expect(decidirLiberacion(resumen(venta()), SIN_PERMISO).opciones.anular).toEqual({ disponible: false, motivo: 'sin_permiso' });
    expect(decidirLiberacion(resumen(venta()), CON_PERMISO).opciones.anular).toEqual({ disponible: true });
  });

  test('anular no se ofrece si ya hubo dinero o factura (va por devolución)', () => {
    expect(decidirLiberacion(resumen(venta({ pagado: 1 })), CON_PERMISO).opciones.anular.motivo).toBe('venta_con_pagos');
    expect(decidirLiberacion(resumen(venta({ facturas: 1 })), CON_PERMISO).opciones.anular.motivo).toBe('venta_con_pagos');
  });

  test('otra sesión abierta con saldo en la misma mesa: se bloquea todo menos cobrar', () => {
    const d = decidirLiberacion(resumen(venta({ customer_id: 'c-1' }), { otras_sesiones_con_saldo: 1 }), CON_PERMISO);
    expect(d.bloqueo).toBe('varias_ventas_con_saldo');
    expect(d.opciones.cartera.disponible).toBe(false);
    expect(d.opciones.anular.disponible).toBe(false);
    expect(d.opciones.liberar.disponible).toBe(false);
    expect(d.opciones.cobrar.disponible).toBe(true);
  });
});

describe('validarAccion', () => {
  const conSaldo = decidirLiberacion(resumen(venta({ customer_id: 'c-1' })), CON_PERMISO);

  test('liberar con saldo → 409 saldo_pendiente', () => {
    expect(validarAccion(conSaldo, 'liberar', null)).toEqual({ ok: false, status: 409, codigo: 'saldo_pendiente' });
  });

  test('anular sin permiso → 403', () => {
    const sin = decidirLiberacion(resumen(venta()), SIN_PERMISO);
    expect(validarAccion(sin, 'anular', 'se fue')).toEqual({ ok: false, status: 403, codigo: 'sin_permiso' });
  });

  test('anular exige motivo (recortado, mínimo 3)', () => {
    expect(validarAccion(conSaldo, 'anular', '   ')).toEqual({ ok: false, status: 400, codigo: 'motivo_requerido' });
    expect(validarAccion(conSaldo, 'anular', ' ab ')).toEqual({ ok: false, status: 400, codigo: 'motivo_requerido' });
    expect(validarAccion(conSaldo, 'anular', '  se fue  ')).toEqual({ ok: true, motivo: 'se fue' });
  });

  test('motivo demasiado largo → 400', () => {
    expect(validarAccion(conSaldo, 'cartera', 'x'.repeat(MOTIVO_MAX + 1))).toEqual({ ok: false, status: 400, codigo: 'motivo_invalido' });
  });

  test('cartera: el motivo es opcional', () => {
    expect(validarAccion(conSaldo, 'cartera', undefined)).toEqual({ ok: true, motivo: null });
  });

  test('cartera sin cliente → 409 sin_cliente', () => {
    const sinCliente = decidirLiberacion(resumen(venta()), CON_PERMISO);
    expect(validarAccion(sinCliente, 'cartera', null)).toEqual({ ok: false, status: 409, codigo: 'sin_cliente' });
  });

  test('sin saldo: liberar sí; cartera y anular no aplican', () => {
    const sinSaldo = decidirLiberacion(resumen(null), CON_PERMISO);
    expect(validarAccion(sinSaldo, 'liberar', null)).toEqual({ ok: true, motivo: null });
    expect(validarAccion(sinSaldo, 'anular', 'motivo')).toEqual({ ok: false, status: 409, codigo: 'sin_saldo' });
  });

  test('bloqueo manda sobre la acción', () => {
    const b = decidirLiberacion(resumen(venta(), { otras_sesiones_con_saldo: 2 }), CON_PERMISO);
    expect(validarAccion(b, 'cartera', null)).toEqual({ ok: false, status: 409, codigo: 'varias_ventas_con_saldo' });
  });
});

describe('errorDeRpc', () => {
  test('el SQLSTATE fija el estado y el mensaje es el código', () => {
    expect(errorDeRpc({ code: 'P0002', message: 'mesa_no_encontrada' })).toEqual({ status: 404, codigo: 'mesa_no_encontrada' });
    expect(errorDeRpc({ code: '42501', message: 'sin_permiso' })).toEqual({ status: 403, codigo: 'sin_permiso' });
    expect(errorDeRpc({ code: '22023', message: 'motivo_requerido' })).toEqual({ status: 400, codigo: 'motivo_requerido' });
    expect(errorDeRpc({ code: 'P0001', message: 'saldo_pendiente' })).toEqual({ status: 409, codigo: 'saldo_pendiente' });
  });

  test('un mensaje desconocido nunca se reenvía al cliente', () => {
    expect(errorDeRpc({ code: 'P0001', message: 'detalle interno de postgres' })).toEqual({ status: 500, codigo: 'error_interno' });
    expect(errorDeRpc({ code: '23505', message: 'duplicate key' })).toEqual({ status: 500, codigo: 'error_interno' });
  });
});
