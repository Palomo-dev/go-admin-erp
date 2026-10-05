import {
  calculateStageForecasts,
  getForecastByStage,
  getMonthlyForecast,
  getPipelineGoal,
  getStageForecasts,
} from '@/lib/services/forecastService';

type Etapa = { name?: string; probability?: number | string | null; color?: string | null; position?: number | null };
interface Oportunidad {
  id: string;
  name: string;
  organization_id: number;
  pipeline_id: string;
  stage_id: string;
  status: string;
  amount: number | string | null;
  currency: string | null;
  expected_close_date: string | null;
  stages: Etapa | Etapa[] | null;
  customers: { full_name: string } | { full_name: string }[] | null;
}
interface Meta {
  id: string;
  organization_id: number;
  goal_amount: number | string | null;
  goal_period: string | null;
  goal_currency: string | null;
}
interface Consulta {
  tabla: string;
  columnas?: string;
  filtros: Array<{ operador: string; columna: string; valor: unknown }>;
  ordenes: Array<{ columna: string; opciones?: { ascending?: boolean; nullsFirst?: boolean } }>;
  rango?: [number, number];
}

let mockOrganizationId: number | null = 120;
let mockOportunidades: Oportunidad[] = [];
let mockMetas: Meta[] = [];
let mockError: Error | null = null;
let mockErrorDesdeOffset: number | null = null;
let mockPaginaInvalidaDesdeOffset: number | null = null;
const mockConsultas: Consulta[] = [];
const mockTasa = jest.fn<Promise<number | null>, [number, string, string]>();
const mockZona = jest.fn<Promise<string>, [number]>();
const mockMoneda = jest.fn(async () => ({ code: 'MXN' }));

class ConsultaSimulada {
  private registro: Consulta;
  constructor(tabla: string) {
    this.registro = { tabla, filtros: [], ordenes: [] };
    mockConsultas.push(this.registro);
  }
  select(columnas: string) { this.registro.columnas = columnas; return this; }
  eq(columna: string, valor: unknown) { return this.filtrar('eq', columna, valor); }
  in(columna: string, valor: unknown) { return this.filtrar('in', columna, valor); }
  gte(columna: string, valor: unknown) { return this.filtrar('gte', columna, valor); }
  lt(columna: string, valor: unknown) { return this.filtrar('lt', columna, valor); }
  private filtrar(operador: string, columna: string, valor: unknown) {
    this.registro.filtros.push({ operador, columna, valor });
    return this;
  }
  private filas() {
    const filas = this.registro.tabla === 'pipelines' ? mockMetas : mockOportunidades;
    return filas.filter(fila => this.registro.filtros.every(({ operador, columna, valor }) => {
      const dato = (fila as unknown as Record<string, unknown>)[columna];
      if (operador === 'eq') return dato === valor;
      if (operador === 'in') return (valor as unknown[]).includes(dato);
      if (typeof dato !== 'string' || typeof valor !== 'string') return false;
      return operador === 'gte' ? dato >= valor : dato < valor;
    }));
  }
  order(columna: string, opciones?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.registro.ordenes.push({ columna, opciones });
    return this;
  }
  async range(inicio: number, fin: number) {
    this.registro.rango = [inicio, fin];
    if (mockErrorDesdeOffset !== null && inicio >= mockErrorDesdeOffset)
      return { data: null, error: new Error('Falló una página posterior') };
    if (mockPaginaInvalidaDesdeOffset !== null && inicio >= mockPaginaInvalidaDesdeOffset)
      return { data: null, error: null };
    // El transporte simula el máximo de 1000 filas de PostgREST incluso al pedir más.
    return { data: this.filas().slice(inicio, Math.min(fin + 1, inicio + 1000)), error: mockError };
  }
  async maybeSingle() { return { data: this.filas()[0] ?? null, error: mockError }; }
}

jest.mock('@/lib/supabase/config', () => ({
  supabase: { from: (tabla: string) => new ConsultaSimulada(tabla) },
}));
jest.mock('@/lib/services/kanbanService', () => ({ getOrganizationId: () => mockOrganizationId }));
jest.mock('@/lib/services/currencyService', () => ({
  currencyService: { getExchangeRate: (org: number, origen: string, destino: string) => mockTasa(org, origen, destino) },
}));
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolveOrgCurrency: () => mockMoneda() }));
jest.mock('@/lib/services/timezoneResolver', () => ({ resolveTimezone: (org: number) => mockZona(org) }));

const oportunidad = (id: string, cambios: Partial<Oportunidad> = {}): Oportunidad => ({
  id, name: `Oportunidad ${id}`, organization_id: 120, pipeline_id: 'pipeline-a', stage_id: 'etapa-a',
  status: 'open', amount: 100, currency: 'MXN', expected_close_date: '2026-10-01',
  stages: { name: 'Propuesta', probability: 50 }, customers: { full_name: 'Contacto A' }, ...cambios,
});

beforeEach(() => {
  mockOrganizationId = 120;
  mockOportunidades = [];
  mockMetas = [];
  mockError = null;
  mockErrorDesdeOffset = null;
  mockPaginaInvalidaDesdeOffset = null;
  mockConsultas.length = 0;
  mockTasa.mockReset().mockResolvedValue(20);
  mockZona.mockReset().mockResolvedValue('America/Bogota');
  mockMoneda.mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('pronóstico mensual compartido', () => {
  it('lee más de 1000 oportunidades sin truncar y conserva filtros y orden estable en cada página', async () => {
    mockOportunidades = Array.from({ length: 1501 }, (_, indice) => oportunidad(`o-${indice}`, {
      amount: 2, currency: 'USD', stages: { probability: 50 },
    }));
    mockOportunidades.push(oportunidad('otro-tenant', { organization_id: 121 }),
      oportunidad('otro-pipeline', { pipeline_id: 'pipeline-b' }),
      oportunidad('otro-periodo', { expected_close_date: '2026-11-01' }));
    const resultado = await getMonthlyForecast('pipeline-a', {
      startDay: '2026-10-01', endDay: '2026-11-01', baseCurrency: 'MXN',
    });
    expect(resultado?.totals).toMatchObject({ totalAmount: 60040, weightedAmount: 30020, opportunityCount: 1501 });
    expect(resultado?.monthlyForecasts[0]).toMatchObject({ totalValue: 60040, weightedValue: 30020, opportunityCount: 1501 });
    expect(new Set(resultado?.monthlyForecasts[0].opportunities.map(fila => fila.id)).size).toBe(1501);
    expect(mockConsultas.map(consulta => consulta.rango)).toEqual([[0, 499], [500, 999], [1000, 1499], [1500, 1999]]);
    for (const consulta of mockConsultas) {
      expect(consulta.filtros).toEqual([
        { operador: 'eq', columna: 'organization_id', valor: 120 },
        { operador: 'in', columna: 'status', valor: ['open'] },
        { operador: 'eq', columna: 'pipeline_id', valor: 'pipeline-a' },
        { operador: 'gte', columna: 'expected_close_date', valor: '2026-10-01' },
        { operador: 'lt', columna: 'expected_close_date', valor: '2026-11-01' },
      ]);
      expect(consulta.ordenes).toEqual([
        { columna: 'expected_close_date', opciones: { ascending: true, nullsFirst: false } },
        { columna: 'id', opciones: { ascending: true } },
      ]);
    }
    expect(mockTasa).toHaveBeenCalledTimes(1);
  });

  it.each(['error', 'invalid'] as const)('un fallo %s posterior aborta todo sin devolver ni convertir un total parcial', async fallo => {
    mockOportunidades = Array.from({ length: 1501 }, (_, indice) => oportunidad(`o-${indice}`, { currency: 'USD' }));
    if (fallo === 'error') mockErrorDesdeOffset = 1000;
    else mockPaginaInvalidaDesdeOffset = 1000;
    expect(await getMonthlyForecast('pipeline-a')).toBeNull();
    expect(mockConsultas.map(consulta => consulta.rango)).toEqual([[0, 499], [500, 999], [1000, 1499]]);
    expect(mockTasa).not.toHaveBeenCalled();
  });

  it('respeta 0, 50 y 100 % y acepta relaciones objeto, arreglo o ausentes', async () => {
    mockOportunidades = [
      oportunidad('cero', { stages: { probability: 0 } }),
      oportunidad('mitad', { stages: [{ name: 'Evaluación', probability: 50, color: '#4361EE', position: 0 }], customers: [{ full_name: 'Contacto B' }] }),
      oportunidad('completa', { stages: { probability: 100 } }),
      oportunidad('sin-etapa', { stages: null, customers: null }),
      oportunidad('sin-probabilidad', { stages: [] }),
    ];
    const resultado = await getMonthlyForecast('pipeline-a');
    expect(resultado?.totals).toMatchObject({ totalAmount: 500, weightedAmount: 150, opportunityCount: 5 });
    const filas = resultado!.monthlyForecasts[0].opportunities;
    expect(filas.map(fila => fila.weightedAmount)).toEqual([0, 50, 100, 0, 0]);
    expect(filas[1]).toMatchObject({ stage_name: 'Evaluación', stage_color: '#4361EE', stage_position: 0, customer_name: 'Contacto B', probability: 50 });
    expect(filas[3]).toMatchObject({ stage_name: 'Sin etapa', customer_name: 'Sin cliente', probability: 0 });
    expect(mockTasa).not.toHaveBeenCalled();
  });

  it('una abierta al 100 % permanece abierta y las cerradas no suman al ponderado', async () => {
    mockOportunidades = [
      oportunidad('abierta', { stages: { probability: 100 } }),
      oportunidad('ganada', { status: 'won', amount: 300, stages: [{ probability: 100 }] }),
      oportunidad('perdida', { status: 'lost', amount: 900, stages: { probability: 100 } }),
    ];
    const abiertas = await getMonthlyForecast('pipeline-a');
    expect(abiertas?.totals).toMatchObject({ totalAmount: 100, weightedAmount: 100, opportunityCount: 1 });
    expect(abiertas?.monthlyForecasts[0].opportunities[0].status).toBe('open');
    expect(mockConsultas[0].filtros).toContainEqual({ operador: 'in', columna: 'status', valor: ['open'] });
    const historico = await getMonthlyForecast('pipeline-a', { includeWon: true, includeLost: true });
    expect(historico?.totals).toMatchObject({ totalAmount: 1300, weightedAmount: 100, opportunityCount: 3 });
    expect(historico?.monthlyForecasts[0].opportunities.map(fila => fila.weightedAmount)).toEqual([100, 0, 0]);
  });

  it('agrupa una sola vez, conserva el día DATE y deja sin fecha al final', async () => {
    mockOportunidades = [
      oportunidad('octubre', { expected_close_date: '2026-10-01' }),
      oportunidad('noviembre', { expected_close_date: '2026-11-01', amount: 200 }),
      oportunidad('sin-fecha', { expected_close_date: null, amount: 300 }),
      oportunidad('otro-octubre', { expected_close_date: '2026-10-31', amount: 400 }),
    ];
    const resultado = await getMonthlyForecast('pipeline-a', { locale: 'en', noDateLabel: 'No closing date' });
    expect(resultado?.monthlyForecasts.map(mes => [mes.month, mes.totalValue, mes.weightedValue, mes.opportunityCount]))
      .toEqual([['2026-10', 500, 250, 2], ['2026-11', 200, 100, 1], ['sin-fecha', 300, 150, 1]]);
    expect(resultado?.monthlyForecasts.map(mes => mes.monthName)).toEqual(['October 2026', 'November 2026', 'No closing date']);
    expect(resultado?.totals).toMatchObject({ totalAmount: 1000, weightedAmount: 500, opportunityCount: 4 });
    expect(resultado?.monthlyForecasts.flatMap(mes => mes.opportunities).map(fila => fila.id)).toHaveLength(4);
    expect(mockZona).not.toHaveBeenCalled();
  });

  it('el período incluye el inicio, excluye el fin y no incluye cierres sin fecha', async () => {
    mockOportunidades = [
      oportunidad('previa', { expected_close_date: '2026-09-30' }),
      oportunidad('inicio', { expected_close_date: '2026-10-01' }),
      oportunidad('ultimo', { expected_close_date: '2026-10-31' }),
      oportunidad('fin', { expected_close_date: '2026-11-01' }),
      oportunidad('sin-fecha', { expected_close_date: null }),
    ];
    const resultado = await getMonthlyForecast('pipeline-a', { startDay: '2026-10-01', endDay: '2026-11-01' });
    expect(resultado?.totals).toMatchObject({ totalAmount: 200, weightedAmount: 100, opportunityCount: 2 });
    expect(resultado?.monthlyForecasts[0].opportunities.map(fila => fila.id)).toEqual(['inicio', 'ultimo']);
    expect(mockConsultas[0].filtros).toContainEqual({ operador: 'gte', columna: 'expected_close_date', valor: '2026-10-01' });
    expect(mockConsultas[0].filtros).toContainEqual({ operador: 'lt', columna: 'expected_close_date', valor: '2026-11-01' });
  });

  it('las opciones Date legado se traducen al día de la organización, no al día UTC', async () => {
    mockOportunidades = [oportunidad('inicio')];
    const resultado = await getMonthlyForecast('pipeline-a', {
      startDate: new Date('2026-10-02T01:00:00Z'), endDate: new Date('2026-11-02T01:00:00Z'),
    });
    expect(resultado?.totals.opportunityCount).toBe(1);
    expect(mockZona).toHaveBeenCalledWith(120);
    expect(mockConsultas[0].filtros).toContainEqual({ operador: 'gte', columna: 'expected_close_date', valor: '2026-10-01' });
    expect(mockConsultas[0].filtros).toContainEqual({ operador: 'lt', columna: 'expected_close_date', valor: '2026-11-01' });
  });

  it.each([
    { startDay: '2026-02-31' },
    { startDay: '2026-10-02', endDay: '2026-10-01' },
    { startDay: '2026-10-01T00:00:00Z' },
  ])('rechaza un rango inválido antes de consultar: %j', async opciones => {
    expect(await getMonthlyForecast('pipeline-a', opciones)).toBeNull();
    expect(mockConsultas).toHaveLength(0);
  });

  it('consolida monedas con una tasa válida por par y conserva la distribución original', async () => {
    mockOportunidades = [
      oportunidad('usd-a', { amount: '10', currency: 'USD' }),
      oportunidad('usd-b', { amount: 20, currency: 'USD', stages: { probability: '100' } }),
      oportunidad('local', { amount: 100 }),
    ];
    const resultado = await getMonthlyForecast('pipeline-a', { baseCurrency: 'MXN' });
    expect(resultado?.totals).toEqual({
      totalAmount: 700, weightedAmount: 550, opportunityCount: 3, currencyDistribution: { USD: 30, MXN: 100 },
    });
    expect(mockTasa).toHaveBeenCalledTimes(1);
    expect(mockTasa).toHaveBeenCalledWith(120, 'USD', 'MXN');
    expect(mockMoneda).not.toHaveBeenCalled();
  });

  it.each([null, 0, -1, NaN])('si falta una tasa válida (%s), falla sin mezclar monedas', async tasa => {
    mockOportunidades = [oportunidad('extranjera', { amount: 100, currency: 'USD' })];
    mockTasa.mockResolvedValue(tasa);
    expect(await getMonthlyForecast('pipeline-a')).toBeNull();
  });

  it('limita siempre al pipeline y organización de la sesión y distingue vacío de error', async () => {
    mockOportunidades = [
      oportunidad('propia'), oportunidad('otra-org', { organization_id: 121 }),
      oportunidad('otro-pipeline', { pipeline_id: 'pipeline-b' }),
    ];
    expect((await getMonthlyForecast('pipeline-a'))?.totals.opportunityCount).toBe(1);
    expect(mockConsultas[0].filtros).toContainEqual({ operador: 'eq', columna: 'organization_id', valor: 120 });
    expect(mockConsultas[0].filtros).toContainEqual({ operador: 'eq', columna: 'pipeline_id', valor: 'pipeline-a' });
    mockOportunidades = [];
    expect(await getMonthlyForecast('pipeline-a')).toMatchObject({ monthlyForecasts: [], totals: { opportunityCount: 0 } });
    mockError = new Error('Lectura fallida');
    expect(await getMonthlyForecast('pipeline-a')).toBeNull();
    mockOrganizationId = null;
    mockConsultas.length = 0;
    expect(await getMonthlyForecast('pipeline-a')).toBeNull();
    expect(mockConsultas).toHaveLength(0);
  });
});

describe('pronóstico por etapa', () => {
  it('las tres entradas usan las mismas probabilidades, estados y filtro de tenant', async () => {
    mockOportunidades = [
      oportunidad('abierta', { stages: [{ probability: 50 }] }),
      oportunidad('ganada', { status: 'won', amount: 300, stages: { probability: 100 } }),
      oportunidad('otra-etapa', { stage_id: 'etapa-b' }),
      oportunidad('otro-tenant', { organization_id: 121 }),
    ];
    const esperado = { totalAmount: 400, weightedAmount: 50, opportunityCount: 2 };
    expect(await getForecastByStage('pipeline-a', 'etapa-a', { includeWon: true })).toEqual(esperado);
    expect(await calculateStageForecasts('pipeline-a', 'etapa-a', { includeWon: true })).toEqual(esperado);
    expect(await getStageForecasts('etapa-a', { includeWon: true })).toEqual(esperado);
    for (const consulta of mockConsultas) {
      expect(consulta.filtros).toContainEqual({ operador: 'eq', columna: 'organization_id', valor: 120 });
      expect(consulta.filtros).toContainEqual({ operador: 'eq', columna: 'stage_id', valor: 'etapa-a' });
    }
  });
});

describe('meta del pipeline', () => {
  it('lee monto, período y moneda únicamente del pipeline de la organización', async () => {
    mockMetas = [
      { id: 'pipeline-a', organization_id: 121, goal_amount: 999, goal_period: 'monthly', goal_currency: 'USD' },
      { id: 'pipeline-a', organization_id: 120, goal_amount: '5000', goal_period: 'quarterly', goal_currency: 'MXN' },
    ];
    expect(await getPipelineGoal('pipeline-a')).toEqual({ goalAmount: 5000, goalPeriod: 'quarterly', goalCurrency: 'MXN' });
    expect(mockConsultas[0]).toMatchObject({ tabla: 'pipelines', columnas: 'goal_amount, goal_period, goal_currency' });
    expect(mockConsultas[0].filtros).toContainEqual({ operador: 'eq', columna: 'organization_id', valor: 120 });
    expect(mockConsultas[0].filtros).toContainEqual({ operador: 'eq', columna: 'id', valor: 'pipeline-a' });
  });

  it('distingue meta ausente, cero válido y error de lectura', async () => {
    expect(await getPipelineGoal('pipeline-a')).toBeNull();
    mockMetas = [{ id: 'pipeline-a', organization_id: 120, goal_amount: 0, goal_period: null, goal_currency: null }];
    expect(await getPipelineGoal('pipeline-a')).toEqual({ goalAmount: 0, goalPeriod: 'monthly', goalCurrency: null });
    mockMetas[0].goal_amount = null;
    expect(await getPipelineGoal('pipeline-a')).toBeNull();
    mockError = new Error('Sin acceso a la meta');
    await expect(getPipelineGoal('pipeline-a')).rejects.toThrow('Sin acceso a la meta');
  });
});
