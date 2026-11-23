/**
 * Despachos de hoy, planilla y documentos de la flota (Figma «23 Transporte» › 6 y 13).
 */
import {
  enmascararDocumento,
  estadoDespacho,
  excepcionCompleta,
  kpisDespachos,
  leerCumplimiento,
  leerResultadoDespacho,
  ocupacion,
  ordenarDespachos,
} from '../despachos';
import { diasEntre, documentosACsv, documentosFlota, estadoDocumento, kpisDocumentos } from '../documentosFlota';
import { generarPlanillaHTML, type DatosPlanilla } from '../planillaDespacho';

const crudo = {
  trip_id: 't1',
  fecha: '2026-11-23',
  bloqueos: [{ causa: 'soat', grupo: 'vehiculo', vence: '2026-11-20', excepcion: true }, { causa: 'inventada', grupo: 'x' }],
  avisos: [{ causa: 'licencia', grupo: 'conductor', vence: '2026-12-05', dias: 12 }],
  admite_excepcion: true,
  pide_pin: true,
};

describe('cumplimiento que devuelve la base', () => {
  test('se lee y lo desconocido se descarta', () => {
    const c = leerCumplimiento(crudo)!;
    expect(c.bloqueos).toEqual([{ causa: 'soat', grupo: 'vehiculo', vence: '2026-11-20', excepcion: true }]);
    expect(c.avisos).toEqual([{ causa: 'licencia', grupo: 'conductor', vence: '2026-12-05', dias: 12 }]);
    expect(c.admiteExcepcion && c.pidePin).toBe(true);
    expect(leerCumplimiento({ bloqueos: [] })).toBeNull();
  });

  test('estado de la salida', () => {
    const c = leerCumplimiento(crudo)!;
    const sinBloqueo = { ...c, bloqueos: [] };
    expect(estadoDespacho({ id: 't1', status: 'scheduled' }, c)).toBe('bloqueado');
    expect(estadoDespacho({ id: 't1', status: 'boarding' }, sinBloqueo)).toBe('listo');
    expect(estadoDespacho({ id: 't1', status: 'in_transit', dispatched_at: 'x' }, null)).toBe('despachado');
    expect(estadoDespacho({ id: 't1', status: 'in_transit', dispatched_at: 'x', dispatch_override_by: 'u' }, null)).toBe('excepcion');
    expect(estadoDespacho({ id: 't1', status: 'completed' }, null)).toBe('despachado');
    expect(estadoDespacho({ id: 't1', status: 'cancelled' }, c)).toBe('cancelado');
  });

  test('indicadores: 18 = 11 despachados + 7 por despachar (5 listos + 2 bloqueados), sin contar cancelados', () => {
    const filas = [
      ...Array.from({ length: 10 }, () => ({ estado: 'despachado' as const })),
      { estado: 'excepcion' as const },
      ...Array.from({ length: 5 }, () => ({ estado: 'listo' as const })),
      ...Array.from({ length: 2 }, () => ({ estado: 'bloqueado' as const, cumplimiento: leerCumplimiento(crudo) })),
      { estado: 'cancelado' as const },
    ];
    expect(kpisDespachos(filas)).toEqual({ total: 18, despachados: 11, porDespachar: 7, listos: 5, bloqueados: 2, porVencer: 2 });
  });

  test('orden: bloqueados, listos, luego los que salieron; por hora dentro de cada grupo', () => {
    const r = ordenarDespachos([
      { estado: 'despachado' as const, salida: '2026-11-23T12:00:00Z' },
      { estado: 'listo' as const, salida: '2026-11-23T15:00:00Z' },
      { estado: 'bloqueado' as const, salida: '2026-11-23T19:00:00Z' },
      { estado: 'listo' as const, salida: '2026-11-23T14:00:00Z' },
    ]);
    expect(r.map((x) => `${x.estado}@${x.salida.slice(11, 13)}`)).toEqual(['bloqueado@19', 'listo@14', 'listo@15', 'despachado@12']);
  });

  test('respuesta de despachar', () => {
    expect(leerResultadoDespacho({ estado: 'despachado', planilla: 'PD-2026-000001' })).toEqual({ estado: 'despachado', planilla: 'PD-2026-000001', cumplimiento: null });
    expect(leerResultadoDespacho({ estado: 'pin_rechazado' })?.estado).toBe('pin_rechazado');
    expect(leerResultadoDespacho({ estado: 'otra_cosa' })).toBeNull();
  });

  test('formulario de excepción: motivo de 10 a 500, supervisor con PIN y PIN de 6 dígitos si se pide', () => {
    const conPin = { tienePin: true };
    expect(excepcionCompleta('corto', '123456', true, conPin)).toBe(false);
    expect(excepcionCompleta('El SOAT se renovó hoy', '12345', true, conPin)).toBe(false);
    expect(excepcionCompleta('El SOAT se renovó hoy', '123456', true, conPin)).toBe(true);
    // Sin elegir supervisor, o si no tiene PIN asignado, no se puede autorizar.
    expect(excepcionCompleta('El SOAT se renovó hoy', '123456', true, null)).toBe(false);
    expect(excepcionCompleta('El SOAT se renovó hoy', '123456', true, { tienePin: false })).toBe(false);
    expect(excepcionCompleta('El SOAT se renovó hoy', '', false)).toBe(true);
    expect(leerResultadoDespacho({ estado: 'supervisor_sin_pin' })?.estado).toBe('supervisor_sin_pin');
  });

  test('documento enmascarado y ocupación', () => {
    expect(enmascararDocumento('1020304050')).toBe('••••••4050');
    expect(enmascararDocumento('123')).toBe('•••');
    expect(enmascararDocumento(null)).toBe('');
    expect(ocupacion(40, 12)).toEqual({ vendidos: 28, porcentaje: 70 });
    expect(ocupacion(0, 0)).toEqual({ vendidos: 0, porcentaje: 0 });
  });
});

describe('planilla de despacho', () => {
  const datos: DatosPlanilla = {
    numero: 'PD-2026-004812',
    organizacion: { nombre: 'org 358', nit: '900' },
    viaje: { codigo: 'V-1120', ruta: 'R-01 · <Bogotá → Tunja>', fecha: '23/11/2026', salida: '12:00' },
    vehiculo: { placa: 'WNP 101', tipo: 'Bus', documentos: [{ nombre: 'SOAT', vence: '01/03/2027' }] },
    conductor: { nombre: 'Conductor 1', documento: '79452118', licencia: 'C2' },
    pasajeros: [{ nombre: 'Pasajero 1', documento: '1020304050', puesto: '1', valor: '$ 38.000' }],
    total: '$ 38.000',
    despachado: { en: '23/11/2026 11:58' },
    excepcion: { motivo: 'SOAT renovado hoy', por: 'Supervisor 1' },
    textos: Object.fromEntries(
      ['titulo', 'viaje', 'ruta', 'fecha', 'salida', 'llegada', 'vehiculo', 'conductor', 'documento', 'licencia', 'vence', 'pasajeros', 'puesto', 'nombre', 'valor', 'total', 'sinPasajeros', 'excepcion', 'autorizo', 'despachado', 'firmaConductor', 'firmaDespachador'].map((k) => [k, k]),
    ) as DatosPlanilla['textos'],
  };

  test('escapa, enmascara documentos y lleva la excepción', () => {
    const html = generarPlanillaHTML(datos);
    expect(html).toContain('PD-2026-004812');
    expect(html).toContain('&lt;Bogotá → Tunja&gt;');
    expect(html).not.toContain('1020304050');
    expect(html).toContain('••••••4050');
    expect(html).toContain('SOAT renovado hoy');
    expect(html).toContain('size: letter');
  });

  test('sin pasajeros muestra el aviso', () => {
    expect(generarPlanillaHTML({ ...datos, pasajeros: [], excepcion: null })).toContain('sinPasajeros');
  });
});

describe('documentos de la flota', () => {
  test('días entre fechas sin zona horaria', () => {
    expect(diasEntre('2026-11-23', '2026-11-20')).toBe(-3);
    expect(diasEntre('2026-11-23', '2027-03-01')).toBe(98);
    expect(Number.isNaN(diasEntre('x', '2026-11-20'))).toBe(true);
    expect([estadoDocumento(-1), estadoDocumento(0), estadoDocumento(30), estadoDocumento(31)]).toEqual(['vencido', 'por_vencer', 'por_vencer', 'vigente']);
  });

  test('un documento por fecha registrada, ordenados por urgencia', () => {
    const docs = documentosFlota(
      [{ id: 'v1', plate: 'WNP 104', vehicle_type: 'bus', soat_expiry: '2026-11-20', techno_expiry: '2027-03-03', insurance_expiry: null, operating_card_expiry: '2026-12-01' }],
      [{ id: 'c1', full_name: 'Conductor 1', license_category: 'C2', license_expiry: '2026-12-05', medical_certificate_expiry: null }],
      '2026-11-23',
    );
    expect(docs.map((d) => [d.tipo, d.estado, d.dias])).toEqual([
      ['soat', 'vencido', -3],
      ['tarjeta_operacion', 'por_vencer', 8],
      ['licencia', 'por_vencer', 12],
      ['tecnomecanica', 'vigente', 100],
    ]);
    const k = kpisDocumentos(docs, 2);
    expect(k).toEqual({ vencidos: 1, porVencer: 2, vigentes: 1, total: 4, sinFecha: 2, primero: '2026-12-01' });
  });

  test('CSV con BOM, punto y coma y comillas', () => {
    const docs = documentosFlota([{ id: 'v1', plate: 'A;B', vehicle_type: null, soat_expiry: '2026-11-20', techno_expiry: null, insurance_expiry: null, operating_card_expiry: null }], [], '2026-11-23');
    const csv = documentosACsv(docs, ['Doc', 'De'], (d) => [d.tipo, d.nombre]);
    expect(csv.startsWith('﻿Doc;De\r\n')).toBe(true);
    expect(csv).toContain('soat;"A;B"');
  });
});
