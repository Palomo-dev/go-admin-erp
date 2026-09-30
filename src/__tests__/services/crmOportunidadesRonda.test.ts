/**
 * Ronda CRM · Oportunidades (2026-09-23).
 *
 * Un test por cada error corregido. Todos FALLAN con el código anterior:
 *
 *  1. `updateOpportunity` borraba las líneas y las reinsertaba con
 *     `total_price`, que es `GENERATED ALWAYS` en las tres tablas hijas
 *     (verificado por MCP): Postgres rechazaba el insert con 428C9, nadie
 *     miraba el `error` y las líneas quedaban borradas.
 *  2. El formulario leía `expected_close_date` (columna `date`) con
 *     `new Date('YYYY-MM-DD')` —medianoche UTC— y guardaba `next_contact_at`
 *     (`timestamptz`) como `YYYY-MM-DD` desnudo. Un día corrido por guardado.
 *  3. «Marcar ganada» de la lista hacía `update({status:'won'})` a pelo: sin
 *     mover de etapa, sin ficha de venta y sin gate. Y «marcar perdida»
 *     REEMPLAZABA todo el `metadata`, borrando `gate_overrides`.
 *  4. El KPI «Monto Ponderado» multiplicaba por una probabilidad 0-100 sin
 *     dividir entre 100, y contaba también ganadas y perdidas.
 *  5. `stagePermissions` concedía por NOMBRE de rol (regla dura 6).
 *  6. El selector de clientes traía la organización entera (PostgREST corta en
 *     1.000 filas; hay 4 organizaciones por encima) y filtraba en memoria.
 *  7. Tres consultas pedían `activities.title`, columna que no existe.
 *  8. La moneda por defecto era el literal `'COP'` en vez de la moneda base de
 *     la organización.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// ── Mock de Supabase: registra cada llamada y deja guionizar la respuesta ────
type Operacion = 'select' | 'insert' | 'update' | 'delete' | 'rpc';
interface Llamada {
  tabla: string;
  op: Operacion;
  payload?: unknown;
}

const registro: Llamada[] = [];
const guionSelect: Record<string, { data: unknown; error: unknown }> = {};
/**
 * Respuesta del `insert` por tabla. Si es una lista, se consume una por
 * llamada: hace falta para probar «el insert falla y la restauración sí va».
 */
const guionInsert: Record<string, { error: unknown } | { error: unknown }[]> = {};
const guionUpdate: Record<string, { data: unknown; error: unknown }> = {};
const guionDelete: Record<string, { error: unknown }> = {};

function limpiarGuiones(): void {
  registro.length = 0;
  for (const g of [guionSelect, guionInsert, guionUpdate, guionDelete]) {
    for (const k of Object.keys(g)) delete (g as Record<string, unknown>)[k];
  }
}

jest.mock('@/lib/supabase/config', () => {
  const encadenables = [
    'eq', 'in', 'order', 'limit', 'is', 'neq', 'gte', 'lte', 'or', 'not', 'range', 'ilike',
  ];

  const crearChain = (tabla: string) => {
    let op: Operacion = 'select';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {};
    for (const m of encadenables) chain[m] = () => chain;

    chain.select = (cols?: string) => {
      registro.push({ tabla, op: 'select', payload: cols });
      return chain;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chain.insert = (filas: any) => {
      registro.push({ tabla, op: 'insert', payload: filas });
      op = 'insert';
      return chain;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chain.update = (valores: any) => {
      registro.push({ tabla, op: 'update', payload: valores });
      op = 'update';
      return chain;
    };
    chain.delete = () => {
      registro.push({ tabla, op: 'delete' });
      op = 'delete';
      return chain;
    };

    const resolver = (): { data: unknown; error: unknown } => {
      if (op === 'insert') {
        const guion = guionInsert[tabla];
        const respuesta = Array.isArray(guion) ? guion.shift() : guion;
        return { data: null, error: respuesta ? respuesta.error : null };
      }
      if (op === 'update') {
        const guion = guionUpdate[tabla];
        return { data: guion ? guion.data : {}, error: guion ? guion.error : null };
      }
      if (op === 'delete') {
        const guion = guionDelete[tabla];
        return { data: null, error: guion ? guion.error : null };
      }
      const guion = guionSelect[tabla];
      return { data: guion ? guion.data : [], error: guion ? guion.error : null };
    };

    chain.single = () => {
      const r = resolver();
      return Promise.resolve(Array.isArray(r.data) ? { ...r, data: r.data[0] ?? null } : r);
    };
    chain.maybeSingle = chain.single;
    chain.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
      Promise.resolve(resolver()).then(ok, ko);
    return chain;
  };

  return {
    supabase: {
      from: (tabla: string) => crearChain(tabla),
      rpc: async (fn: string, args: unknown) => {
        registro.push({ tabla: fn, op: 'rpc', payload: args });
        return { data: { total: 0, filas: [] }, error: null };
      },
      auth: { getUser: async () => ({ data: { user: { id: 'usuario-1' } } }) },
    },
  };
});

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => null,
}));

/**
 * `requestStageChange` vive en un `.tsx` y `tsconfig.json` deja el JSX sin
 * transformar (`jsx: preserve`, como pide Next.js), así que jest no puede
 * cargar ese módulo en un entorno `node`. Se sustituye por un espía, que
 * además es lo que interesa comprobar: que cerrar como ganada pasa por el
 * PATCH del servidor y no por un UPDATE desde el navegador.
 */
const requestStageChangeMock = jest.fn();
jest.mock('@/components/crm/pipeline/drawer/StageSelect', () => ({
  requestStageChange: (...args: unknown[]) => requestStageChangeMock(...args),
}));

const g = globalThis as unknown as Record<string, unknown>;
g.window = globalThis;

import { opportunitiesService } from '@/components/crm/oportunidades/opportunitiesService';
import { diaCalendarioADate, dateADiaCalendario } from '@/components/crm/oportunidades/formDates';
import { canManageStages, canOverrideStageGate } from '@/lib/services/crm/stagePermissions';

const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');

/** Trozo de fuente que va desde `from('activities')` hasta el primer `;`. */
function consultaDeActividades(fuente: string): string[] {
  const trozos: string[] = [];
  let i = fuente.indexOf("from('activities')");
  while (i !== -1) {
    trozos.push(fuente.slice(i, fuente.indexOf(';', i)));
    i = fuente.indexOf("from('activities')", i + 1);
  }
  return trozos;
}

beforeEach(() => {
  limpiarGuiones();
  requestStageChangeMock.mockReset();
});

// ── 1 · Editar una oportunidad ya no borra sus líneas ───────────────────────
// CRM ola 3B (guardarraíl 36): las líneas ya no se reemplazan desde el
// navegador (borrar + reinsertar sin transacción). `updateOpportunity` manda
// productos, espacios y conceptos a `PATCH /api/crm/opportunities/[id]`, y la
// RPC `crm_update_opportunity` los aplica POR DIFERENCIA en la misma
// transacción (migraciones 20260930160600 y 20260930210000). Lo que se
// conserva de la ronda: nunca se envía `total_price` y nada se escribe en las
// tablas hijas desde el navegador.
describe('1 · líneas de la oportunidad', () => {
  const entradaConProducto = {
    products: [{ product_id: 7, quantity: 2, unit_price: 1500 }],
  };
  let llamadas: { url: string; method: string; body: Record<string, unknown> }[];
  beforeEach(() => {
    llamadas = [];
    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      llamadas.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : {} });
      return { ok: true, status: 200, json: async () => ({ success: true, data: { id: 'opp-1' } }) } as Response;
    }) as typeof fetch;
  });

  it('envía las tres clases de líneas al servidor en un solo PATCH, sin `total_price`', async () => {
    await opportunitiesService.updateOpportunity('opp-1', {
      ...entradaConProducto,
      spaces: [{ space_id: 'esp-1', nights: 3, unit_price: 200 }],
      customLines: [{ concept: 'Montaje', quantity: 1, unit_price: 90 }],
    });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toMatchObject({ url: '/api/crm/opportunities/opp-1', method: 'PATCH' });
    expect(llamadas[0].body).toEqual({
      products: [{ product_id: 7, quantity: 2, unit_price: 1500 }],
      spaces: [{ space_id: 'esp-1', nights: 3, unit_price: 200 }],
      custom_lines: [{ concept: 'Montaje', quantity: 1, unit_price: 90 }],
    });
    expect(JSON.stringify(llamadas[0].body)).not.toContain('total_price');
    expect(registro.filter((l) => l.op !== 'select')).toEqual([]);
  });

  it('propaga el rechazo del servidor en vez de dejar las líneas a medias', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({ success: false, error: 'linea_invalida' }) }) as Response) as typeof fetch;
    await expect(opportunitiesService.updateOpportunity('opp-1', entradaConProducto)).rejects.toThrow(/linea_invalida/);
    expect(registro.filter((l) => l.op !== 'select')).toEqual([]);
  });

  it('estado, cierre y ficha de venta no se escriben por aquí (van por …/win y …/lose)', async () => {
    await expect(opportunitiesService.updateOpportunity('opp-1', { status: 'won' } as never)).rejects.toThrow(/No editable/);
    expect(llamadas).toEqual([]);
  });
});

// ── 2 · Las fechas no corren un día ─────────────────────────────────────────
describe('2 · fechas del formulario', () => {
  it('el día calendario va y vuelve intacto (sirve con TZ=UTC y TZ=America/Bogota)', () => {
    for (const dia of ['2026-09-23', '2026-01-01', '2026-12-31', '2026-03-01']) {
      expect(dateADiaCalendario(diaCalendarioADate(dia))).toBe(dia);
    }
  });

  it('un `Date` de medianoche UTC NO se usa como día calendario', () => {
    // El camino viejo: `new Date('2026-09-23')` es medianoche UTC. En Bogotá
    // sus campos locales son el día 22, así que formatearlo corría la fecha.
    const viejo = new Date('2026-09-23');
    const nuevo = diaCalendarioADate('2026-09-23') as Date;
    // El nuevo tiene los campos LOCALES puestos en el día pedido, pase lo que
    // pase con la zona del entorno.
    expect(nuevo.getFullYear()).toBe(2026);
    expect(nuevo.getMonth()).toBe(8);
    expect(nuevo.getDate()).toBe(23);
    expect(dateADiaCalendario(nuevo)).toBe('2026-09-23');
    // Y el viejo solo coincide por casualidad cuando el entorno está en UTC.
    if (viejo.getTimezoneOffset() !== 0) {
      expect(dateADiaCalendario(viejo)).not.toBe('2026-09-23');
    }
  });

  it('rechaza lo que no es un día calendario', () => {
    expect(diaCalendarioADate('')).toBeUndefined();
    expect(diaCalendarioADate(null)).toBeUndefined();
    expect(diaCalendarioADate('2026-02-31')).toBeUndefined();
    expect(dateADiaCalendario(undefined)).toBe('');
  });

  it('OpportunityForm ya no construye un `Date` desde el día calendario ni guarda el instante desnudo', () => {
    const src = leer('src/components/crm/oportunidades/OpportunityForm.tsx');
    expect(src).not.toMatch(/new Date\(opportunity\.expected_close_date\)/);
    expect(src).toContain('diaCalendarioADate');
    expect(src).toContain('dateADiaCalendario');
    // `next_contact_at` es timestamptz: se convierte con el offset de la org.
    expect(src).toMatch(/toInstant\(nextContactAt\)/);
    expect(src).not.toMatch(/next_contact_at: nextContactAt \|\| undefined/);
    // Y nada de la prohibición global.
    expect(src).not.toMatch(/toISOString\(\)\s*\.\s*(split|slice)/);
  });
});

// ── 3 · Ganar y perder ─────────────────────────────────────────────────────
describe('3 · cierre ganado y perdido', () => {
  it('markAsWon mueve a la etapa ganadora por el PATCH del servidor', async () => {
    guionSelect.opportunities = { data: [{ id: 'opp-1', pipeline_id: 'pip-1' }], error: null };
    guionSelect.stages = { data: [{ id: 'etapa-ganadora', pipeline_id: 'pip-1', is_won: true, position: 9 }], error: null };
    requestStageChangeMock.mockResolvedValue({ ok: true, opportunity: {} });

    await opportunitiesService.markAsWon('opp-1', { amount: 1000 });

    expect(requestStageChangeMock).toHaveBeenCalledTimes(1);
    expect(requestStageChangeMock).toHaveBeenCalledWith('opp-1', {
      stage_id: 'etapa-ganadora',
      won_data: { amount: 1000 },
    });
    // Y NO se escribe `status:'won'` a pelo desde el navegador.
    const updates = registro.filter((l) => l.tabla === 'opportunities' && l.op === 'update');
    expect(updates).toHaveLength(0);
  });

  it('markAsWon avisa si el pipeline no tiene etapa ganadora', async () => {
    guionSelect.opportunities = { data: [{ id: 'opp-1', pipeline_id: 'pip-1' }], error: null };
    guionSelect.stages = { data: [], error: null };
    await expect(opportunitiesService.markAsWon('opp-1')).rejects.toThrow(/etapa marcada como ganadora/);
    expect(requestStageChangeMock).not.toHaveBeenCalled();
  });

  it('markAsWon no da por cerrada la oportunidad si el servidor pide la ficha de venta', async () => {
    guionSelect.opportunities = { data: [{ id: 'opp-1', pipeline_id: 'pip-1' }], error: null };
    guionSelect.stages = { data: [{ id: 'etapa-ganadora', is_won: true, position: 9 }], error: null };
    requestStageChangeMock.mockResolvedValue({ ok: false, reason: 'needs_won', stage: {} });

    await expect(opportunitiesService.markAsWon('opp-1')).rejects.toThrow(/ficha de venta/);
  });

  it('markAsLost pasa por el servidor (POST …/lose, ola 1): ningún UPDATE de opportunities desde el navegador', async () => {
    // Antes escribía `status='lost'` con el cliente de navegador y FUSIONABA
    // el metadata; ahora la ruta mueve a la etapa `is_lost` con
    // `opportunityStageService`, que conserva `gate_overrides`.
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: { opportunity: { id: 'opp-1', status: 'lost' } } }) }));
    const original = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const r = await opportunitiesService.markAsLost('opp-1', { lossReasonId: 'precio', lossReasonLabel: 'Precio', notes: 'pidió descuento' });
      expect(r).toMatchObject({ status: 'lost' });
    } finally {
      global.fetch = original;
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/crm/opportunities/opp-1/lose');
    expect(JSON.parse(String(init.body))).toEqual({ loss_data: { lossReasonId: 'precio', lossReasonLabel: 'Precio', notes: 'pidió descuento' } });
    expect(registro.filter((l) => l.tabla === 'opportunities' && l.op === 'update')).toHaveLength(0);
  });
});

// ── 4 · KPI «Monto Ponderado» ──────────────────────────────────────────────
describe('4 · monto ponderado', () => {
  it('divide la probabilidad entre 100 y solo cuenta las abiertas', async () => {
    guionSelect.opportunities = {
      data: [
        { id: 'a', amount: 1000, status: 'open', stage: { probability: 50 } },
        { id: 'b', amount: 400, status: 'open', stage: { probability: 25 } },
        { id: 'c', amount: 900, status: 'won', stage: { probability: 100 } },
        { id: 'd', amount: 700, status: 'lost', stage: { probability: 10 } },
      ],
      error: null,
    };

    const stats = await opportunitiesService.getStats();

    // 1000×0,50 + 400×0,25 = 600. El código viejo daba 1000×50 + 400×25 +
    // 900×100 + 700×10 = 157.000.
    expect(stats.weightedAmount).toBe(600);
    expect(stats.totalAmount).toBe(3000);
  });
});

// ── 5 · Permisos de etapa ──────────────────────────────────────────────────
describe('5 · permisos de etapa (regla dura 6)', () => {
  it('no concede por el NOMBRE del rol', () => {
    const impostor = { roleId: 99, roleName: 'Manager' };
    expect(canManageStages(impostor)).toBe(false);
    expect(canOverrideStageGate(impostor)).toBe(false);
    expect(canManageStages({ roleId: 99, roleName: 'Admin de organización' })).toBe(false);
    expect(canOverrideStageGate({ roleId: 99, roleName: 'Super Admin' })).toBe(false);
  });

  it('concede por id de rol y por is_super_admin', () => {
    for (const roleId of [1, 2, 5]) {
      expect(canManageStages({ roleId, roleName: 'da igual' })).toBe(true);
      expect(canOverrideStageGate({ roleId, roleName: 'da igual' })).toBe(true);
    }
    expect(canManageStages({ roleId: 4, roleName: 'Empleado' })).toBe(false);
    expect(canManageStages({ roleId: 4, roleName: 'Empleado', isSuperAdmin: true })).toBe(true);
  });

  it('el módulo no decide mirando `roleName`', () => {
    const src = leer('src/lib/services/crm/stagePermissions.ts');
    const decision = src.slice(src.indexOf('function isStageManager'));
    expect(decision).not.toMatch(/roleName/);
  });
});

// ── 6 · Selector de clientes contra el servidor ────────────────────────────
describe('6 · selector de clientes', () => {
  it('searchCustomers usa la búsqueda única (RPC): el término viaja como parámetro y con límite', async () => {
    await opportunitiesService.searchCustomers('Pérez, Juan');
    const rpc = registro.find((l) => l.tabla === 'fn_clientes_buscar' && l.op === 'rpc');
    expect(rpc?.payload).toMatchObject({ p_organization_id: 120, p_q: 'Pérez, Juan', p_limit: 20 });
    expect(registro.some((l) => l.tabla === 'customers')).toBe(false);
  });

  it('OpportunityForm busca contra el servidor con debounce, no trae la organización entera', () => {
    const src = leer('src/components/crm/oportunidades/OpportunityForm.tsx');
    expect(src).toContain('opportunitiesService.searchCustomers');
    expect(src).not.toMatch(/opportunitiesService\.getCustomers\(\)/);
    expect(src).toContain('DEBOUNCE_BUSQUEDA_MS');
    expect(src).toContain('onSearchChange={setCustomerSearch}');
  });
});

// ── 7 · `activities` no tiene `title` ──────────────────────────────────────
describe('7 · columnas reales de activities', () => {
  const archivos = [
    'src/app/api/crm/ia/discovery-summary/route.ts',
    'src/app/api/crm/ia/next-action/route.ts',
    // `src/app/app/crm/clientes/[id]/page.tsx` salió de la lista: desde la ola 3A (D1)
    // solo redirige a la ficha única `/app/clientes/[id]` (prueba abajo).
  ];

  it('la ficha del CRM redirige a la ficha única del cliente (D1)', () => {
    const src = leer('src/app/app/crm/clientes/[id]/page.tsx');
    expect(src).toMatch(/redirect\(`\/app\/clientes\/\$\{encodeURIComponent\(id\)\}`\)/);
    expect(src).not.toMatch(/from\('activities'\)/);
  });

  it('ninguna consulta pide `title` ni `description`', () => {
    for (const archivo of archivos) {
      const consultas = consultaDeActividades(leer(archivo));
      expect(consultas.length).toBeGreaterThan(0);
      for (const consulta of consultas) {
        const select = /\.select\('([^']*)'\)/.exec(consulta);
        expect(select).toBeTruthy();
        const columnas = (select as RegExpExecArray)[1].split(',').map((c) => c.trim());
        expect(columnas).not.toContain('title');
        expect(columnas).not.toContain('description');
        expect(columnas).toContain('notes');
      }
    }
  });
});

// ── 8 · Moneda base de la organización ─────────────────────────────────────
describe('8 · moneda por defecto', () => {
  it('OpportunityForm no cablea COP: sale de la moneda base de la organización', () => {
    const src = leer('src/components/crm/oportunidades/OpportunityForm.tsx');
    expect(src).toContain('useOrgCurrency');
    expect(src).not.toMatch(/useState\(opportunity\?\.currency \|\| 'COP'\)/);
    // Y sin moneda resuelta no se guarda: se obliga a elegir.
    expect(src).toContain('La organización no tiene moneda base configurada');
  });
});
