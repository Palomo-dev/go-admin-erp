/**
 * Periodos contables: rejilla del año, estado del año y checklist del cierre.
 * Datos inventados; sin base.
 */
import {
  aniosDisponibles,
  anioParaGenerar,
  checklistCierre,
  codigoErrorPeriodo,
  estadoDelAnio,
  mesesSinCerrar,
  rejillaDelAnio,
  situacionDelMes,
  yaGenerado,
  type PeriodoBasico,
} from '../periodosLogica';

const mes = (year: number, month: number, status: PeriodoBasico['status'] = 'open'): PeriodoBasico => ({
  id: `${year}-${month}`,
  year,
  month,
  period_type: 'monthly',
  start_date: `${year}-${String(month).padStart(2, '0')}-01`,
  end_date: `${year}-${String(month).padStart(2, '0')}-28`,
  status,
});

const anio2026 = Array.from({ length: 12 }, (_, i) => mes(2026, i + 1, i < 7 ? 'closed' : 'open'));

describe('rejilla del año', () => {
  it('pone los 12 meses con su periodo y marca el pasado abierto como pendiente de cierre', () => {
    const celdas = rejillaDelAnio(anio2026, 2026, '2026-09-28');
    expect(celdas).toHaveLength(12);
    expect(celdas[0].periodo?.status).toBe('closed');
    expect(celdas[7]).toMatchObject({ mes: 8, situacion: 'pasado', pendienteDeCierre: true });
    expect(celdas[8]).toMatchObject({ mes: 9, situacion: 'actual', pendienteDeCierre: false });
    expect(celdas[9].situacion).toBe('futuro');
    expect(mesesSinCerrar(celdas)).toEqual([8]);
  });

  it('un mes sin generar queda sin periodo (se puede crear desde la tarjeta)', () => {
    const celdas = rejillaDelAnio(anio2026.filter((p) => p.month !== 3), 2026, '2026-09-28');
    expect(celdas[2].periodo).toBeNull();
  });

  it('situacionDelMes compara días calendario, no instantes', () => {
    expect(situacionDelMes(2026, 1, '2026-01-31')).toBe('actual');
    expect(situacionDelMes(2025, 12, '2026-01-01')).toBe('pasado');
  });
});

describe('estado del año y años', () => {
  it('abierto mientras un mes siga abierto; cerrado con los 12 cerrados', () => {
    expect(estadoDelAnio(anio2026, 2026)).toBe('open');
    expect(estadoDelAnio(anio2026.map((p) => ({ ...p, status: 'closed' as const })), 2026)).toBe('closed');
    expect(estadoDelAnio(anio2026, 2027)).toBeNull();
  });

  it('el periodo anual manda sobre los meses', () => {
    const anual: PeriodoBasico = { ...mes(2025, 1, 'closed'), id: 'a', month: null, period_type: 'yearly' };
    expect(estadoDelAnio([anual, mes(2025, 5)], 2025)).toBe('closed');
  });

  it('años del más reciente al más antiguo, con el actual aunque no tenga periodos', () => {
    expect(aniosDisponibles([mes(2025, 1), mes(2026, 1)], 2027)).toEqual([2027, 2026, 2025]);
  });

  it('«Generar» propone el año siguiente al último y no duplica', () => {
    expect(anioParaGenerar(anio2026, 2026)).toBe(2027);
    expect(anioParaGenerar([], 2026)).toBe(2026);
    expect(yaGenerado(anio2026, 2026, 'monthly')).toBe(true);
    expect(yaGenerado(anio2026, 2026, 'yearly')).toBe(false);
  });
});

describe('checklist del cierre', () => {
  it('todo en orden: no bloquea', () => {
    const r = checklistCierre({ cuadre: { debitos: 100, creditos: 100 }, pendientes: { borradores: 0, pendientes: 0 }, saltosConsecutivo: 0 });
    expect(r.bloqueado).toBe(false);
    expect(r.items.map((i) => i.estado)).toEqual(['ok', 'ok', 'ok', 'ok']);
  });

  it('pendientes y borradores bloquean, como fn_cierre_periodo', () => {
    const r = checklistCierre({ cuadre: { debitos: 1, creditos: 1 }, pendientes: { borradores: 2, pendientes: 3 }, saltosConsecutivo: 0 });
    expect(r.bloqueado).toBe(true);
    expect(r.items.find((i) => i.id === 'pendientes')).toMatchObject({ estado: 'bloquea', cantidad: 3 });
    expect(r.items.find((i) => i.id === 'borradores')).toMatchObject({ estado: 'bloquea', cantidad: 2 });
  });

  it('los saltos de consecutivo solo avisan', () => {
    const r = checklistCierre({ cuadre: { debitos: 5, creditos: 5 }, pendientes: { borradores: 0, pendientes: 0 }, saltosConsecutivo: 4 });
    expect(r.bloqueado).toBe(false);
    expect(r.items.find((i) => i.id === 'consecutivos')).toMatchObject({ estado: 'aviso', cantidad: 4 });
  });

  it('un balance que no cuadra o un dato que no se pudo leer bloquea: no se cierra a ciegas', () => {
    expect(checklistCierre({ cuadre: { debitos: 10, creditos: 9 }, pendientes: { borradores: 0, pendientes: 0 }, saltosConsecutivo: 0 }).bloqueado).toBe(true);
    expect(checklistCierre({ cuadre: null, pendientes: { borradores: 0, pendientes: 0 }, saltosConsecutivo: 0 }).bloqueado).toBe(true);
    expect(checklistCierre({ cuadre: { debitos: 1, creditos: 1 }, pendientes: null, saltosConsecutivo: 0 }).bloqueado).toBe(true);
  });
});

describe('errores de las RPC', () => {
  it('traduce los códigos que lanza la base', () => {
    expect(codigoErrorPeriodo({ message: 'periodo_con_pendientes: 2 borradores, 0 pendientes' })).toBe('conPendientes');
    expect(codigoErrorPeriodo({ message: 'x', code: '42501' })).toBe('sinPermiso');
    expect(codigoErrorPeriodo({ message: 'faltan_cuentas_cierre' })).toBe('faltanCuentasCierre');
    expect(codigoErrorPeriodo({ code: '23505' })).toBe('duplicado');
    expect(codigoErrorPeriodo(new Error('otra cosa'))).toBe('desconocido');
  });
});
