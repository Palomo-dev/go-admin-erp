/**
 * Lógica pura de las pantallas de Membresías (src/components/membresias/logica.ts): filtros de
 * la URL, tono de badges, días calendario y el cálculo del diálogo «Congelar» (espejo de
 * fn_membresia_congelar). Corre igual con TZ=UTC y TZ=America/Bogota: los días son de la
 * organización, nunca del proceso.
 */
import {
  TONO_ESTADO_MEMBRESIA,
  calcularCongelamiento,
  congelamientoVigente,
  diasEntre,
  diasSemana,
  esDiaPlano,
  estadoCongelable,
  formatearDiaPlano,
  leerCliente,
  leerFiltroEstado,
  leerFiltroMiembros,
  leerPlan,
  leerRangoPagos,
  metodoEntrada,
  motivoRechazo,
  progresoVigencia,
  rutaCobrarEnPos,
  rutaNuevaFactura,
  tipoEvento,
  tonoEstadoMembresia,
} from '@/components/membresias/logica';
import type { CongelamientoMembresia } from '@/lib/services/membresias/tipos';

const BOGOTA = 'America/Bogota';

describe('filtros de la URL (lista blanca)', () => {
  it('estado: solo valores conocidos; lo demás es «todas»', () => {
    expect(leerFiltroEstado('en_gracia')).toBe('en_gracia');
    expect(leerFiltroEstado('por_vencer')).toBe('por_vencer');
    expect(leerFiltroEstado('borrada')).toBe('todas');
    expect(leerFiltroEstado(null)).toBe('todas');
    expect(leerFiltroEstado("activa'--")).toBe('todas');
  });

  it('plan: entero positivo', () => {
    expect(leerPlan('12')).toBe(12);
    expect(leerPlan('0')).toBeNull();
    expect(leerPlan('-3')).toBeNull();
    expect(leerPlan('1e3')).toBeNull();
    expect(leerPlan('12,13')).toBeNull();
    expect(leerPlan(undefined)).toBeNull();
  });

  it('cliente: solo UUID', () => {
    expect(leerCliente('3F2A0C1B-1111-4222-8333-944455556666')).toBe('3f2a0c1b-1111-4222-8333-944455556666');
    expect(leerCliente('3f2a')).toBeNull();
    expect(leerCliente('3f2a0c1b-1111-4222-8333-944455556666),or(id.gt.0')).toBeNull();
  });

  it('miembros: todos · con_vigente · sin_vigente', () => {
    expect(leerFiltroMiembros('con_vigente')).toBe('con_vigente');
    expect(leerFiltroMiembros('sin_vigente')).toBe('sin_vigente');
    expect(leerFiltroMiembros('otro')).toBe('todos');
  });

  it('rango de pagos: por defecto el mes en curso; ordena y descarta días inválidos', () => {
    expect(leerRangoPagos(null, null, '2026-09-28')).toEqual({ desde: '2026-09-01', hasta: '2026-09-28' });
    expect(leerRangoPagos('2026-09-20', '2026-09-10', '2026-09-28')).toEqual({ desde: '2026-09-10', hasta: '2026-09-20' });
    expect(leerRangoPagos('2026-02-30', '2026-09-10', '2026-09-28')).toEqual({ desde: '2026-09-01', hasta: '2026-09-10' });
    expect(esDiaPlano('2026-02-29')).toBe(false);
    expect(esDiaPlano('2028-02-29')).toBe(true);
  });
});

describe('badges (SISTEMA-BADGES §4)', () => {
  it('cada estado visual con su tono', () => {
    expect(TONO_ESTADO_MEMBRESIA).toEqual({
      pendiente_pago: 'advertencia',
      por_activar: 'informacion',
      activa: 'exito',
      congelada: 'informacion',
      en_gracia: 'advertencia',
      vencida: 'peligro',
      cancelada: 'neutro',
    });
    expect(tonoEstadoMembresia('desconocido')).toBe('neutro');
    expect(tonoEstadoMembresia(null)).toBe('neutro');
  });
});

describe('días calendario', () => {
  it('diasEntre cruza meses y años', () => {
    expect(diasEntre('2026-09-28', '2026-10-08')).toBe(10);
    expect(diasEntre('2026-12-31', '2027-01-01')).toBe(1);
    expect(diasEntre('2026-10-08', '2026-09-28')).toBe(-10);
  });

  it('formatearDiaPlano no corre el día con la zona del proceso', () => {
    expect(formatearDiaPlano('2026-10-08', 'es-CO')).toMatch(/^8 .*oct.* 2026$/);
    expect(formatearDiaPlano('2026-10-08', 'en-US')).toBe('Oct 8, 2026');
    expect(formatearDiaPlano('no-es-dia', 'es-CO')).toBe('');
  });

  it('diasSemana: 1 = lunes … 7 = domingo, sin repetir y en orden', () => {
    expect(diasSemana([5, 1, 1], 'en-US')).toEqual(['Mon', 'Fri']);
    expect(diasSemana([7], 'en-US')).toEqual(['Sun']);
    expect(diasSemana([0, 8], 'en-US')).toEqual([]);
    expect(diasSemana(undefined, 'es-CO')).toEqual([]);
  });

  it('progresoVigencia: «Día 28 de 38» en la zona de la organización', () => {
    // Desde el 1 sep (00:00 Bogotá) hasta el 8 oct 23:59:59 Bogotá; hoy 28 sep 20:00 Bogotá (29 sep UTC).
    const p = progresoVigencia('2026-09-01T05:00:00Z', '2026-10-09T04:59:59Z', new Date('2026-09-29T01:00:00Z'), BOGOTA);
    expect(p).toEqual({ dia: 28, total: 38, porcentaje: 74 });
    expect(progresoVigencia(null, '2026-10-09T04:59:59Z', new Date(), BOGOTA)).toBeNull();
    // Antes de empezar: día 0; después de vencer: tope en el total.
    expect(progresoVigencia('2026-09-01T05:00:00Z', '2026-10-09T04:59:59Z', new Date('2026-08-20T12:00:00Z'), BOGOTA)?.dia).toBe(0);
    expect(progresoVigencia('2026-09-01T05:00:00Z', '2026-10-09T04:59:59Z', new Date('2026-11-20T12:00:00Z'), BOGOTA)?.dia).toBe(38);
  });
});

describe('congelar (espejo de fn_membresia_congelar)', () => {
  const base = {
    desde: '2026-09-29',
    dias: 7,
    hoy: '2026-09-28',
    // Vence el 8 oct 23:59:59 en Bogotá.
    vence: '2026-10-09T04:59:59Z',
    zona: BOGOTA,
    reglas: { freezeMaxTimes: 2, freezeMaxDays: 15 },
    usado: { dias: 8, veces: 1 },
  };

  it('Figma C3: 7 días desde el 29 sep → vuelve el 6 oct, vence el 15 oct', () => {
    const r = calcularCongelamiento(base);
    expect(r.hasta).toBe('2026-10-05');
    expect(r.vuelve).toBe('2026-10-06');
    expect(r.venceActual).toBe('2026-10-08');
    expect(r.nuevoVence).toBe('2026-10-15');
    expect(r.quedanVeces).toBe(0);
    expect(r.quedanDias).toBe(0);
    expect(r.disponiblesDias).toBe(7);
    expect(r.bloqueo).toBeNull();
  });

  it('pide más días de los que quedan → tope de días', () => {
    expect(calcularCongelamiento({ ...base, dias: 8 }).bloqueo).toBe('congelamiento_tope_dias');
  });

  it('ya usó todas las veces → tope de veces', () => {
    expect(calcularCongelamiento({ ...base, usado: { dias: 3, veces: 2 } }).bloqueo).toBe('congelamiento_tope_veces');
  });

  it('sin topes en el plan → sin bloqueo y «sin tope»', () => {
    const r = calcularCongelamiento({ ...base, dias: 60, reglas: { freezeMaxTimes: null, freezeMaxDays: null } });
    expect(r.bloqueo).toBeNull();
    expect(r.quedanVeces).toBeNull();
    expect(r.quedanDias).toBeNull();
  });

  it('empieza antes de hoy, después del vencimiento o sin días → bloqueado', () => {
    expect(calcularCongelamiento({ ...base, desde: '2026-09-27' }).bloqueo).toBe('congelamiento_en_el_pasado');
    expect(calcularCongelamiento({ ...base, desde: '2026-10-09' }).bloqueo).toBe('congelamiento_despues_del_vencimiento');
    expect(calcularCongelamiento({ ...base, desde: '2026-10-08', dias: 1 }).bloqueo).toBeNull();
    expect(calcularCongelamiento({ ...base, dias: 0 }).bloqueo).toBe('fechas_invalidas');
    expect(calcularCongelamiento({ ...base, dias: null }).bloqueo).toBe('fechas_invalidas');
    expect(calcularCongelamiento({ ...base, desde: '' }).bloqueo).toBe('fechas_invalidas');
  });

  it('congelable solo activa o en gracia; vigente = activo o programado', () => {
    expect(estadoCongelable('active')).toBe(true);
    expect(estadoCongelable('past_due')).toBe(true);
    expect(estadoCongelable('frozen')).toBe(false);
    expect(estadoCongelable('pending')).toBe(false);
    const c = (estado: CongelamientoMembresia['estado']): CongelamientoMembresia => ({ id: estado, desde: '2026-09-01', hasta: '2026-09-05', dias: 5, estado, motivo: null });
    expect(congelamientoVigente([c('ended'), c('cancelled')])).toBeNull();
    expect(congelamientoVigente([c('ended'), c('scheduled')])?.estado).toBe('scheduled');
    expect(congelamientoVigente([c('active')])?.estado).toBe('active');
  });
});

describe('textos del historial y de las entradas', () => {
  it('tipos de evento conocidos y respaldo «otro»', () => {
    expect(tipoEvento('grace_started')).toBe('grace_started');
    expect(tipoEvento('trimmed')).toBe('trimmed');
    expect(tipoEvento('algo_nuevo')).toBe('otro');
  });

  it('motivos de rechazo y métodos del check-in', () => {
    expect(motivoRechazo('fuera_de_horario')).toBe('fuera_de_horario');
    expect(motivoRechazo('x')).toBe('otro');
    expect(motivoRechazo(null)).toBe('otro');
    expect(metodoEntrada('qr')).toBe('qr');
    expect(metodoEntrada('card')).toBe('otro');
  });
});

describe('enlaces de renovar', () => {
  it('POS con cliente y producto; factura con cliente', () => {
    expect(rutaCobrarEnPos('3f2a0c1b-1111-4222-8333-944455556666', 42)).toBe('/app/pos?cliente=3f2a0c1b-1111-4222-8333-944455556666&producto=42');
    expect(rutaCobrarEnPos(null, null)).toBe('/app/pos');
    expect(rutaNuevaFactura('3f2a0c1b-1111-4222-8333-944455556666')).toBe(
      '/app/finanzas/facturas-venta/nuevo?cliente=3f2a0c1b-1111-4222-8333-944455556666',
    );
    expect(rutaNuevaFactura(null)).toBe('/app/finanzas/facturas-venta/nuevo');
  });
});
