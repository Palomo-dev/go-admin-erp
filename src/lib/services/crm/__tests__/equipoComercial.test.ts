/**
 * Equipo comercial (Figma CRM «Red y gestión»): lógica pura de cuotas,
 * desempeño, ranking por porcentaje y la previsualización del reparto de los
 * últimos 50 leads.
 */
import {
  construirFilasDesempeno,
  diasRestantesMes,
  filaPromedio,
  limitesMes,
  mesAnterior,
  porcentajeCuota,
  rankingPorPorcentaje,
  resumirDesempeno,
  tonoBarraCuota,
  tonoVsCuota,
  ultimosMeses,
  type ConteosVendedor,
} from '../equipoComercialModel';
import { previsualizarReparto } from '../assignmentPreview';
import type { TerritorioEvaluable } from '../assignmentService';

const conteo = (c: Partial<ConteosVendedor> = {}): ConteosVendedor => ({ llamadas: 0, llamadasEfectivas: 0, reuniones: 0, leads: 0, ...c });

describe('cuotas y meses', () => {
  it('porcentaje entero de la cuota; sin cuota es null', () => {
    expect(porcentajeCuota(42_000_000, 40_000_000)).toBe(105);
    expect(porcentajeCuota(13_500_000, 30_000_000)).toBe(45);
    expect(porcentajeCuota(10, 0)).toBeNull();
    expect(porcentajeCuota(10, null)).toBeNull();
  });

  it('tonos de Figma: badge vs cuota y barra de Equipos', () => {
    expect([105, 99, 75, 45].map(tonoVsCuota)).toEqual(['exito', 'exito', 'advertencia', 'peligro']);
    expect(tonoVsCuota(null)).toBe('neutro');
    expect([105, 75, 45].map(tonoBarraCuota)).toEqual(['marca', 'marca', 'advertencia']);
  });

  it('meses calendario sin zona horaria', () => {
    expect(limitesMes('2026-02')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(mesAnterior('2026-01')).toBe('2025-12');
    expect(ultimosMeses('2026-11-15', 3)).toEqual(['2026-11', '2026-10', '2026-09']);
    expect(diasRestantesMes('2026-09-29', '2026-09-30')).toBe(1);
    expect(diasRestantesMes('2026-09-30', '2026-09-30')).toBe(0);
  });
});

describe('filas de desempeño', () => {
  const miembros = [
    { user_id: 'a', nombre: 'Ana Gómez', cuota: 40_000_000, moneda: 'COP' },
    { user_id: 'b', nombre: 'Carlos Ruiz', cuota: 28_000_000, moneda: 'COP' },
    { user_id: 'c', nombre: 'Laura Pérez', cuota: null, moneda: 'COP' },
  ];
  const ganadas = [
    { salesperson_id: 'a', amount: 30_000_000, created_at: '2026-09-01T00:00:00Z', closed_at: '2026-09-21T00:00:00Z' },
    { salesperson_id: 'a', amount: '12000000', created_at: '2026-08-10T00:00:00Z', closed_at: '2026-09-01T00:00:00Z' },
    { salesperson_id: 'b', amount: 21_000_000, created_at: null, closed_at: '2026-09-05T00:00:00Z' },
    // De otra persona: no cuenta.
    { salesperson_id: 'z', amount: 99, created_at: null, closed_at: null },
  ];
  const conteos = new Map([
    ['a', conteo({ llamadas: 312, llamadasEfectivas: 150, reuniones: 28, leads: 22 })],
    ['b', conteo({ llamadas: 141, llamadasEfectivas: 60, reuniones: 11, leads: 0 })],
  ]);
  const filas = construirFilasDesempeno({ miembros, ganadas, conteos });

  it('ordena por ganado, calcula %, conversión y ciclo', () => {
    expect(filas.map((f) => [f.rank, f.user_id, f.ganado, f.pct])).toEqual([
      [1, 'a', 42_000_000, 105],
      [2, 'b', 21_000_000, 75],
      [3, 'c', 0, null],
    ]);
    expect(filas[0].conversion).toBe(9.1); // 2 ganadas / 22 leads
    expect(filas[0].cicloMedio).toBe(21); // (20 + 22) / 2
    expect(filas[1].conversion).toBeNull(); // sin leads
    expect(filas[1].cicloMedio).toBeNull(); // sin created_at
  });

  it('resumen de las tarjetas y fila de promedio', () => {
    const r = resumirDesempeno(filas);
    expect(r).toMatchObject({ ganado: 63_000_000, cuota: 68_000_000, pct: 93, llamadas: 453, reuniones: 39, contactoEfectivo: 46, conversion: 9.1 });
    const p = filaPromedio(filas)!;
    expect(p.ganado).toBe(21_000_000);
    expect(p.pct).toBe(90);
    expect(filaPromedio([])).toBeNull();
  });

  it('ranking por porcentaje, sin montos, sin cuota al final', () => {
    const ranking = rankingPorPorcentaje(filas, 'b');
    expect(ranking).toEqual([
      { rank: 1, nombre: 'Ana Gómez', pct: 105, es_yo: false },
      { rank: 2, nombre: 'Carlos Ruiz', pct: 75, es_yo: true },
      { rank: 3, nombre: 'Laura Pérez', pct: null, es_yo: false },
    ]);
    expect(Object.keys(ranking[0])).not.toContain('ganado');
  });
});

describe('previsualización del reparto (últimos 50 leads)', () => {
  const miembros = [
    { user_id: 'a', nombre: 'Ana' },
    { user_id: 'b', nombre: 'Beto' },
    { user_id: 'c', nombre: 'Caro' },
  ];
  const leads = Array.from({ length: 7 }, (_, i) => ({ owner_id: i % 2 === 0 ? 'a' : null, datos: { city: i < 3 ? 'Medellín' : 'Cali' } }));
  const base = { orgId: 1, miembros, leads, territorios: [] as TerritorioEvaluable[], cargas: new Map<string, number>(), ultimoAsignado: null };

  it('por turnos: rota desde el siguiente al último asignado', () => {
    const r = previsualizarReparto({ ...base, estrategia: 'round_robin', ultimoAsignado: 'a' });
    expect(r.filas.map((f) => f.n)).toEqual([2, 3, 2]); // b, c, a, b, c, a, b
    expect(r.sinTerritorio).toBeNull();
    expect(r.total).toBe(7);
    expect(r.reales.map((f) => f.n)).toEqual([4, 0, 0]);
  });

  it('por carga: al de menor carga, sumando cada lead', () => {
    const r = previsualizarReparto({ ...base, estrategia: 'load_balance', cargas: new Map([['a', 5], ['b', 0], ['c', 1]]) });
    expect(r.filas.map((f) => f.n)).toEqual([0, 4, 3]);
  });

  it('por territorio: al responsable si es miembro; si no, «sin territorio → turnos»', () => {
    const territorios: TerritorioEvaluable[] = [
      { id: 't1', name: 'Valle de Aburrá', criteria: { rules: [{ field_key: 'customers.city', operator: 'in', value: ['Medellín'] }], assigned_user_id: 'c' } },
    ];
    const r = previsualizarReparto({ ...base, estrategia: 'territory', territorios });
    expect(r.filas.map((f) => f.n)).toEqual([0, 0, 3]);
    expect(r.sinTerritorio).toBe(4);
  });

  it('sin miembros no reparte nada', () => {
    const r = previsualizarReparto({ ...base, miembros: [], estrategia: 'round_robin' });
    expect(r.filas).toEqual([]);
    expect(r.total).toBe(7);
  });
});
