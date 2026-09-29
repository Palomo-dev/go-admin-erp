// ============================================================================
// Las 16 violaciones que aparecieron al ENCENDER de verdad el guardarraíl
// ============================================================================
// El bloque `{"files": ["src/**"]}` con `warn` de `.eslintrc.json` estaba
// declarado ENTRE los bloques con `error`. En ESLint gana el último `override`
// que casa, así que degradaba a `warn` todas las rutas declaradas antes: el
// guardarraíl de fechas nunca había roto un solo build. Al reordenarlo (bloque
// general primero) salieron 16 errores en rutas que tandas anteriores habían
// dado por cerradas.
//
// Trece de los dieciséis son el mismo patrón —`new Date().toISOString()
// .split('T')[0]` para el día de un NOMBRE DE ARCHIVO DE DESCARGA (P3 del
// inventario, §3.4)— y dos son los `import` prohibidos de `@/utils/Utils`.
//
// Riesgo real, por sitio:
//
//   ALTO   `CuentasPorPagarService.exportarParaBancaOnline` escribe el día
//          dentro de `bank_files.file_name`, o sea que se PERSISTE.
//   ALTO   `FacturasTable` usaba `parseLocalDate` para FILTRAR por fecha de
//          emisión: `invoice_sales.issue_date` es **timestamptz** y
//          `parseLocalDate` se queda con su día UTC, así que una factura
//          emitida a las 20:00 de Bogotá se filtraba como del día siguiente.
//   MEDIO  los dos `exportToCSV` de servicio (inventario y POS): el día ya no
//          sale del reloj del navegador sino de la zona de la organización.
//   BAJO   el resto de nombres de descarga y el `formatDate` de HRM.
//
// Tipos de columna verificados por MCP el 2026-09-23 (`information_schema`):
//   accounts_payable.due_date            timestamptz   (y SÍ tiene branch_id)
//   invoice_sales.issue_date / .due_date timestamptz
//   timesheets.work_date                 date
//   leave_requests.start_date/.end_date  date
//   bank_files                           LA TABLA NO EXISTE (ver abajo)
// ============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ORG = 120;
const BOGOTA = 'America/Bogota';
const KATMANDU = 'Asia/Kathmandu';
const MADRID = 'Europe/Madrid';

/** Zona que devolverá el `resolveTimezone` doblado en cada caso. */
const zonas = { actual: BOGOTA, llamadas: [] as Array<{ org: number; branch?: number | null }> };

jest.mock('@/lib/services/timezoneResolver', () => ({
  resolveTimezone: async (organizationId: number, branchId?: number | null): Promise<string> => {
    zonas.llamadas.push({ org: organizationId, branch: branchId });
    return zonas.actual;
  },
}));

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => ORG,
  getCurrentBranchId: () => null,
  getCurrentUserId: async () => '00000000-0000-0000-0000-000000000001',
}));

import { DobleSupabase } from './dobleSupabase';

let doble = new DobleSupabase();

jest.mock('@/lib/supabase/config', () => ({
  get supabase() {
    return doble;
  },
  createSupabaseClient: () => doble,
}));

import { CuentasPorPagarService } from '@/components/finanzas/cuentas-por-pagar/CuentasPorPagarService';
import { ReportesService as ReportesInventario } from '@/components/inventario/reportes/ReportesService';
import { ReportesService as ReportesPos } from '@/components/pos/reportes/reportesService';

import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { todayInTz, toPlainDate } from '@/lib/utils/dateCore';
import { resolveTimezoneForBranch } from '@/lib/utils/branchTimezoneCascade';

/**
 * Dia UTC de un instante. Se escribe con `substring` y no con `slice`/`split`
 * A PROPOSITO: este archivo existe para defender el guardarrail, y no puede ser
 * el que lo dispare. Es la lectura EQUIVOCADA, y aqui solo se usa para
 * demostrar que difiere de la buena.
 */
function diaUTC(fecha: Date): string {
  return fecha.toISOString().substring(0, 10);
}

/**
 * `parseLocalDate` de `@/utils/Utils`, copiado aqui en vez de importado: el
 * import esta prohibido por el guardarrail y este archivo no puede saltarselo
 * ni con un aviso. Es la implementacion vieja, la que se quiere enterrar:
 * se queda con el dia UTC del timestamptz y lo reinterpreta como medianoche
 * del reloj del proceso.
 */
function parseLocalDateViejo(dateString: string): Date {
  if (!dateString) return new Date(NaN);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return new Date(dateString + 'T00:00:00');
  const soloDia = dateString.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(soloDia)) return new Date(soloDia + 'T00:00:00');
  return new Date(dateString);
}

const RAIZ = join(__dirname, '..', '..', '..');
const leer = (ruta: string): string => readFileSync(join(RAIZ, ruta), 'utf8');

function conReloj(iso: string, fn: () => void | Promise<void>): Promise<void> {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(iso));
  return Promise.resolve(fn()).finally(() => {
    jest.useRealTimers();
  });
}

// ---------------------------------------------------------------------------
// Instantes elegidos para que las tres lecturas posibles den DÍAS DISTINTOS
// ---------------------------------------------------------------------------
// 2026-09-24T02:30Z  ->  UTC: 24/09   Bogotá (−05): 23/09   Katmandú: 24/09
// 2026-06-15T18:30Z  ->  UTC: 15/06   Bogotá:      15/06    Katmandú (+05:45): 16/06
//
// El primero mata cualquier mutación que devuelva el día UTC; el segundo mata
// las que "restan horas" en vez de convertir de verdad (Katmandú va por DELANTE
// de UTC, así que un arreglo que solo sepa retroceder falla aquí).
const NOCHE_BOGOTA = '2026-09-24T02:30:00.000Z';
const TARDE_KATMANDU = '2026-06-15T18:30:00.000Z';

// ---------------------------------------------------------------------------
// Doble mínimo del DOM para los dos `exportToCSV` de servicio
// ---------------------------------------------------------------------------

interface EnlaceFalso {
  href: string;
  download: string;
  click: () => void;
}

let enlaces: EnlaceFalso[] = [];
let documentoOriginal: unknown;
let crearObjectURLOriginal: unknown;

beforeAll(() => {
  documentoOriginal = (globalThis as Record<string, unknown>).document;
  crearObjectURLOriginal = (URL as unknown as Record<string, unknown>).createObjectURL;

  (globalThis as Record<string, unknown>).document = {
    createElement: (): EnlaceFalso => {
      const enlace: EnlaceFalso = { href: '', download: '', click: () => undefined };
      enlaces.push(enlace);
      return enlace;
    },
  };
  (URL as unknown as Record<string, unknown>).createObjectURL = () => 'blob:prueba';
});

afterAll(() => {
  (globalThis as Record<string, unknown>).document = documentoOriginal;
  (URL as unknown as Record<string, unknown>).createObjectURL = crearObjectURLOriginal;
});

beforeEach(() => {
  enlaces = [];
  zonas.llamadas.length = 0;
  zonas.actual = BOGOTA;
});

// ---------------------------------------------------------------------------
// 1. Cartera (P0): el día que se PERSISTE en `bank_files.file_name`
// ---------------------------------------------------------------------------

function guionBanca(): DobleSupabase {
  return new DobleSupabase({
    accounts_payable: [{ data: [{ id: 'cta-1', balance: 100 }], error: null }],
    bank_files: [{ data: { id: 'archivo-1' }, error: null }],
  });
}

describe('exportarParaBancaOnline escribe el día de la organización, no el de UTC', () => {
  it('a las 21:30 de Bogotá el lote se archiva con el día de HOY, no el de mañana', async () => {
    await conReloj(NOCHE_BOGOTA, async () => {
      doble = guionBanca();
      zonas.actual = BOGOTA;

      await CuentasPorPagarService.exportarParaBancaOnline(['cta-1']);

      const escritura = doble.ultimaEscritura('bank_files');
      const payload = escritura?.payload as { file_name: string; organization_id: number };

      // El día UTC en este instante ya es el 24.
      expect(diaUTC(new Date())).toBe('2026-09-24');
      // Pero para la organización todavía es el 23, y es el que va al nombre.
      expect(payload.file_name).toBe('pagos_2026-09-23.csv');
      expect(payload.organization_id).toBe(ORG);
    });
  });

  it('en una zona por delante de UTC (Katmandú) el día es el SIGUIENTE al de UTC', async () => {
    await conReloj(TARDE_KATMANDU, async () => {
      doble = guionBanca();
      zonas.actual = KATMANDU;

      await CuentasPorPagarService.exportarParaBancaOnline(['cta-1']);

      const payload = doble.ultimaEscritura('bank_files')?.payload as { file_name: string };
      expect(diaUTC(new Date())).toBe('2026-06-15');
      expect(payload.file_name).toBe('pagos_2026-06-16.csv');
    });
  });

  it('la zona se pide por IDENTIDAD: se le pasa la organización', async () => {
    await conReloj(NOCHE_BOGOTA, async () => {
      doble = guionBanca();
      await CuentasPorPagarService.exportarParaBancaOnline(['cta-1']);
      expect(zonas.llamadas).toContainEqual({ org: ORG, branch: undefined });
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Los dos `exportToCSV` de servicio
// ---------------------------------------------------------------------------

describe('el nombre del CSV lleva el día de la organización', () => {
  const datos = [{ sku: 'A-1', unidades: 3 }];

  it('inventario: 21:30 de Bogotá -> día de hoy, no el día UTC de mañana', async () => {
    await conReloj(NOCHE_BOGOTA, async () => {
      zonas.actual = BOGOTA;
      await ReportesInventario.exportToCSV(datos, 'rotacion');
      expect(enlaces).toHaveLength(1);
      expect(enlaces[0].download).toBe('rotacion_2026-09-23.csv');
    });
  });

  it('inventario: Katmandú va por delante de UTC', async () => {
    await conReloj(TARDE_KATMANDU, async () => {
      zonas.actual = KATMANDU;
      await ReportesInventario.exportToCSV(datos, 'rotacion');
      expect(enlaces[0].download).toBe('rotacion_2026-06-16.csv');
    });
  });

  it('POS: 21:30 de Bogotá -> día de hoy, no el día UTC de mañana', async () => {
    await conReloj(NOCHE_BOGOTA, async () => {
      zonas.actual = BOGOTA;
      await ReportesPos.exportToCSV(datos, 'ventas_diarias');
      expect(enlaces).toHaveLength(1);
      expect(enlaces[0].download).toBe('ventas_diarias_2026-09-23.csv');
    });
  });

  it('POS: Katmandú va por delante de UTC', async () => {
    await conReloj(TARDE_KATMANDU, async () => {
      zonas.actual = KATMANDU;
      await ReportesPos.exportToCSV(datos, 'ventas_diarias');
      expect(enlaces[0].download).toBe('ventas_diarias_2026-06-16.csv');
    });
  });

  it('los dos piden la zona por identidad (organización de la sesión)', async () => {
    await conReloj(NOCHE_BOGOTA, async () => {
      await ReportesInventario.exportToCSV(datos, 'x');
      await ReportesPos.exportToCSV(datos, 'y');
      expect(zonas.llamadas.filter((l) => l.org === ORG)).toHaveLength(2);
    });
  });

  it('sin datos no se crea ningún enlace (y no se pide zona)', async () => {
    await conReloj(NOCHE_BOGOTA, async () => {
      await ReportesInventario.exportToCSV([], 'vacio');
      await ReportesPos.exportToCSV([], 'vacio');
      expect(enlaces).toHaveLength(0);
      expect(zonas.llamadas).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. FacturasTable: el filtro de fecha de emisión sobre un timestamptz
// ---------------------------------------------------------------------------
// `FacturasTable` es un componente y este proyecto no tiene entorno DOM en
// Jest, así que aquí se fija la DIVERGENCIA entre las dos implementaciones
// (la vieja con `parseLocalDate`, la nueva con `toPlainDate` en la zona de la
// organización) y más abajo hay una guarda estática que ata el archivo a la
// nueva. Documentar la divergencia es lo que explica por qué el cambio importa.

/** Predicado viejo: el `parseLocalDate` del timestamptz contra el Date del picker. */
function pasaFiltroViejo(issueDate: string, desde?: Date, hasta?: Date): boolean {
  if (desde && parseLocalDateViejo(issueDate) < desde) return false;
  if (hasta && parseLocalDateViejo(issueDate) > hasta) return false;
  return true;
}

/** Predicado nuevo: día calendario de la organización a los dos lados. */
function pasaFiltroNuevo(issueDate: string, zona: string, desde?: Date, hasta?: Date): boolean {
  const dia = toPlainDate(new Date(issueDate), zona);
  if (desde && dia < toPlainDate(desde, zona)) return false;
  if (hasta && dia > toPlainDate(hasta, zona)) return false;
  return true;
}

describe('el filtro por fecha de emisión usa el día de la organización', () => {
  // Factura emitida el 23/09/2026 a las 21:30 en Bogotá. En UTC ya es el 24.
  const FACTURA_DE_NOCHE = '2026-09-24T02:30:00.000Z';

  // Los extremos del filtro se construyen a MEDIODIA UTC a proposito: ese
  // instante cae en el mismo dia calendario en todas las zonas con offset menor
  // que 12 h, asi que el caso mide lo que quiere medir (el dia de la factura) y
  // no el reloj del proceso que corre la prueba.
  const DIA_23 = new Date('2026-09-23T12:00:00.000Z');
  const DIA_24 = new Date('2026-09-24T12:00:00.000Z');

  it('el día de la factura es el de la organización, no el de UTC', () => {
    expect(toPlainDate(new Date(FACTURA_DE_NOCHE), BOGOTA)).toBe('2026-09-23');
    expect(diaUTC(new Date(FACTURA_DE_NOCHE))).toBe('2026-09-24');
  });

  it('«hasta el 23/09» la incluye con el filtro nuevo y la excluía con el viejo', () => {
    expect(pasaFiltroNuevo(FACTURA_DE_NOCHE, BOGOTA, undefined, DIA_23)).toBe(true);
    expect(pasaFiltroViejo(FACTURA_DE_NOCHE, undefined, DIA_23)).toBe(false);
  });

  it('«desde el 24/09» la excluye: para la organización es del 23', () => {
    expect(pasaFiltroNuevo(FACTURA_DE_NOCHE, BOGOTA, DIA_24)).toBe(false);
  });

  it('el veredicto cambia con la zona de la organización, no con la del runtime', () => {
    // En Madrid ese mismo instante ya es el 24, así que «hasta el 23» la deja
    // fuera. Las dos afirmaciones valen corra la prueba en el TZ que corra.
    expect(pasaFiltroNuevo(FACTURA_DE_NOCHE, BOGOTA, undefined, DIA_23)).toBe(true);
    expect(pasaFiltroNuevo(FACTURA_DE_NOCHE, MADRID, undefined, DIA_23)).toBe(false);
  });

  it('los extremos son inclusivos por los dos lados', () => {
    expect(pasaFiltroNuevo(FACTURA_DE_NOCHE, BOGOTA, DIA_23, DIA_23)).toBe(true);
  });

  it('sin extremos no filtra nada', () => {
    expect(pasaFiltroNuevo(FACTURA_DE_NOCHE, BOGOTA)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. HRM: tres columnas `date` formateadas sin convertir
// ---------------------------------------------------------------------------

describe('ReportTable formatea días calendario sin convertirlos', () => {
  it('`formatPlainDate` devuelve el mismo día en cualquier runtime', () => {
    // timesheets.work_date y leave_requests.start_date/.end_date son `date`.
    expect(formatPlainDate('2026-01-01')).toBe('01/01/2026');
    expect(formatPlainDate('2026-12-31')).toBe('31/12/2026');
  });

  it('no inventa una conversión: un `date` no tiene zona que aplicar', () => {
    // Si alguien lo cambiara a `formatDateInTz`, un `date` se interpretaría
    // como medianoche UTC y en Bogotá saldría el día anterior. Esta es la
    // distinción crítica de `docs/reglas-fechas-timezone.md` §5.
    expect(formatPlainDate('2026-03-01')).toBe('01/03/2026');
  });
});

// ---------------------------------------------------------------------------
// 5. Cartera (P0): la zona sale de la SUCURSAL dueña de la cuenta
// ---------------------------------------------------------------------------
// `AccountActionsCard` y `CuentaPorPagarDetailPage` son componentes; lo que se
// puede probar de verdad aquí es la cascada que ahora consultan, más la guarda
// estática de que le pasan `account.branch_id`.

describe('la zona de una cuenta por pagar es la de su sucursal', () => {
  const mapa = { 7: MADRID, 8: null };

  it('con sucursal propia manda la sucursal, no la organización', () => {
    expect(resolveTimezoneForBranch(7, mapa, BOGOTA).timezone).toBe(MADRID);
  });

  it('sin sucursal (o con una sin zona propia) cae en la organización', () => {
    expect(resolveTimezoneForBranch(null, mapa, BOGOTA).timezone).toBe(BOGOTA);
    expect(resolveTimezoneForBranch(8, mapa, BOGOTA).timezone).toBe(BOGOTA);
  });

  it('y el día propuesto por el formulario cambia con ella', () => {
    // 2026-09-24T02:30Z: en Madrid ya es el 24; en Bogotá todavía es el 23.
    return conReloj(NOCHE_BOGOTA, () => {
      expect(todayInTz(resolveTimezoneForBranch(7, mapa, BOGOTA).timezone)).toBe('2026-09-24');
      expect(todayInTz(resolveTimezoneForBranch(null, mapa, BOGOTA).timezone)).toBe('2026-09-23');
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Guardas estáticas — una por archivo, nombrando el sitio exacto
// ---------------------------------------------------------------------------
// La lección de la tanda 2: una guarda «el archivo contiene el helper» no
// prueba que el helper esté DONDE hace falta. Cada guarda de aquí nombra la
// expresión concreta del call-site que se arregló.

const ARCHIVOS = [
  'src/components/finanzas/cuentas-por-pagar/CuentasPorPagarService.ts',
  'src/components/finanzas/cuentas-por-pagar/ExportarBancaModal.tsx',
  'src/components/finanzas/cuentas-por-pagar/id/AccountActionsCard.tsx',
  'src/components/finanzas/cuentas-por-pagar/id/CuentaPorPagarDetailPage.tsx',
  'src/components/finanzas/facturas-venta/listado/ListadoFacturasVenta.tsx',
  'src/components/hrm/reportes/ReportTable.tsx',
  'src/components/inventario/TopSKUTable.tsx',
  'src/components/inventario/productos/CatalogoProductos.tsx',
  'src/components/inventario/proveedores/CatalogoProveedores.tsx',
  'src/components/inventario/reportes/ReportesService.ts',
  'src/components/inventario/reportes/costo-recetas/CostoRecetasPage.tsx',
  'src/components/inventario/reportes/trazabilidad/TrazabilidadPage.tsx',
  'src/components/pos/reportes/reportesService.ts',
];

describe('ninguno de los 13 archivos vuelve a derivar un día de toISOString()', () => {
  it.each(ARCHIVOS)('%s', (ruta) => {
    const texto = leer(ruta);
    expect(texto).not.toMatch(/toISOString\(\)\s*\.\s*split\(/);
    expect(texto).not.toMatch(/toISOString\(\)\s*\.\s*slice\(/);
  });
});

describe('los dos import prohibidos de @/utils/Utils están fuera', () => {
  // 2026-09-24 (P15): `FacturasTable` se retiró; su sucesor es el listado del kit.
  it('el listado de facturas de venta no importa parseLocalDate', () => {
    const texto = leer('src/components/finanzas/facturas-venta/listado/ListadoFacturasVenta.tsx');
    // Se mira la linea de `import`, no el archivo entero: el archivo puede (y
    // debe) seguir NOMBRANDO el helper enterrado en un comentario que explique
    // por que lo esta.
    expect(texto).not.toMatch(/^\s*import .*parseLocalDate/m);
    // Hasta el 2026-09-24 se exigía aquí que quedara `import { formatCurrency }
    // from '@/utils/Utils'`. Ese import se retiró a propósito: suponía COP y la
    // tabla pinta ahora cada factura en su moneda (guardarraíl 28b).
    // Y no queda ninguna LLAMADA al helper enterrado.
    expect(texto).not.toMatch(/[^a-zA-Z]parseLocalDate\(/);
  });

  it('ReportTable ya no importa formatDate', () => {
    const texto = leer('src/components/hrm/reportes/ReportTable.tsx');
    expect(texto).not.toMatch(/^\s*import .*\bformatDate\b/m);
    expect(texto).toContain("import { formatCurrency } from '@/utils/Utils'");
    // Y no queda ninguna LLAMADA al helper enterrado.
    expect(texto).not.toMatch(/[^a-zA-Z]formatDate\(/);
  });
});

describe('cada call-site usa el helper que le toca, en su sitio', () => {
  // La extension dejo de ser `.csv` fija el 2026-09-24: el rastro de
  // `bank_files` registra ahora el archivo REALMENTE descargado (Bancolombia
  // TXT bajaba un .txt y se anotaba como .csv). Lo que este guardarrail
  // defiende —el DIA sale de `todayInTz(zona)` y no de UTC— sigue exigido
  // igual de fuerte, incluida la ausencia de cualquier lectura UTC del dia.
  it('bank_files.file_name se compone con todayInTz(zona resuelta)', () => {
    const texto = leer('src/components/finanzas/cuentas-por-pagar/CuentasPorPagarService.ts');
    expect(texto).toContain('const zona = await resolveTimezone(organizationId);');
    expect(texto).toContain('file_name: `pagos_${todayInTz(zona)}${extension}`');
    expect(texto).not.toMatch(/file_name:.*toISOString/);
  });

  it('ExportarBancaModal toma el día del contexto de la organización', () => {
    const texto = leer('src/components/finanzas/cuentas-por-pagar/ExportarBancaModal.tsx');
    expect(texto).toContain('const { formatDate, getToday } = useFormatDate();');
    expect(texto).toContain('const fechaHoy = getToday();');
  });

  it('AccountActionsCard resuelve la zona por la SUCURSAL de la cuenta', () => {
    const texto = leer('src/components/finanzas/cuentas-por-pagar/id/AccountActionsCard.tsx');
    expect(texto).toContain('useTimezoneFor(account.branch_id)');
    expect(texto).not.toMatch(/useOrgTimezone/);
    expect(texto).toContain('_${todayInTz(timezone)}.txt`');
  });

  it('CuentaPorPagarDetailPage resuelve la zona por la SUCURSAL de la cuenta', () => {
    const texto = leer('src/components/finanzas/cuentas-por-pagar/id/CuentaPorPagarDetailPage.tsx');
    expect(texto).toContain('useTimezoneFor(account?.branch_id)');
    expect(texto).not.toMatch(/useOrgTimezone/);
    expect(texto).toContain('_${todayInTz(timezone)}.txt`');
  });

  it('el filtro por emisión compara DÍAS de la organización, en la base', () => {
    // El listado manda días `YYYY-MM-DD` (lista blanca en consultaFacturasDesde)
    // y la RPC compara el día de emisión en la zona de la organización.
    const consulta = leer('src/lib/finanzas/ventas/listadoFacturas.ts');
    expect(consulta).toMatch(/\\d\{4\}-\\d\{2\}-\\d\{2\}/);
    const rpc = leer('supabase/migrations/20260924081336_listados_facturas_venta_y_cartera.sql');
    expect(rpc).toContain('(i.issue_date at time zone z.tz)::date as dia_emision');
    expect(rpc).toContain('dia_emision >= v_desde');
    expect(rpc).toContain('dia_emision <= v_hasta');
  });

  it('ReportTable usa formatPlainDate en las tres columnas `date`', () => {
    const texto = leer('src/components/hrm/reportes/ReportTable.tsx');
    expect(texto).toContain('{formatPlainDate(row.work_date)}');
    expect(texto).toContain('{formatPlainDate(row.start_date)}');
    expect(texto).toContain('{formatPlainDate(row.end_date)}');
    // first_check_in SÍ es timestamptz y sigue convirtiéndose.
    expect(texto).toContain('formatTimeInTz(row.first_check_in, timezone)');
  });

  it('TopSKUTable toma el día del contexto', () => {
    const texto = leer('src/components/inventario/TopSKUTable.tsx');
    expect(texto).toContain('const { getToday } = useFormatDate();');
    expect(texto).toContain('`top_skus_${getToday()}.csv`');
  });

  it('CatalogoProductos: el nombre de descarga, y ningun dia por otra via', () => {
    // El feed de Facebook salio de este archivo el 2026-09-23: otra sesion lo
    // unifico con la exportacion de Meta y ambos se generan ahora en el
    // servidor, que no compone ningun nombre con fecha (comprobado en
    // src/app/api/inventario/productos/facebook/route.ts y
    // src/app/api/facebook-feed/route.ts: no derivan dia). Por eso ya no existe
    // el `dateStr` que esta guarda exigia. La asercion se ata a de donde sale
    // el dia y a que no reaparezca por otra via, no a la forma del codigo.
    const texto = leer('src/components/inventario/productos/CatalogoProductos.tsx');
    expect(texto).toContain('const { getToday } = useFormatDate();');
    expect(texto).toContain('link.download = `productos_${getToday()}.csv`;');
    expect(texto).not.toMatch(/toISOString\(\)\s*\.\s*(split|slice)/);
  });

  it('CatalogoProveedores: el nombre de descarga (csv, xlsx y pdf)', () => {
    // Este archivo lo reescribió otra sesión el 2026-09-23 mientras corría esta
    // tanda: los tres `link.download` separados son ahora uno solo con la
    // extensión parametrizada. La guarda se ata a lo que importa —de dónde sale
    // el día— y no a la forma del código, que no es asunto de esta tanda.
    const texto = leer('src/components/inventario/proveedores/CatalogoProveedores.tsx');
    expect(texto).toContain('const { getToday } = useFormatDate();');
    expect(texto).toMatch(/download = `proveedores_\$\{getToday\(\)\}\./);
  });

  it('los dos exportToCSV de servicio resuelven la zona por identidad', () => {
    for (const ruta of [
      'src/components/inventario/reportes/ReportesService.ts',
      'src/components/pos/reportes/reportesService.ts',
    ]) {
      const texto = leer(ruta);
      expect(texto).toContain('static async exportToCSV(data: any[], filename: string): Promise<void>');
      expect(texto).toContain('const zona = await resolveTimezone(getOrganizationId());');
      expect(texto).toContain('link.download = `${filename}_${todayInTz(zona)}.csv`;');
    }
  });

  it('los llamadores de exportToCSV lo esperan (si no, el aviso llega antes)', () => {
    expect(leer('src/components/inventario/reportes/ReportesPage.tsx')).toContain(
      'await ReportesService.exportToCSV(data, filename);',
    );
    const pos = leer('src/components/pos/reportes/ReportesPage.tsx');
    expect(pos).toContain("await ReportesService.exportToCSV(dailySales, 'ventas_diarias');");
    expect(pos).toContain("await ReportesService.exportToCSV(topProducts, 'productos_mas_vendidos');");
  });

  it('CostoRecetasPage y TrazabilidadPage toman el día del contexto', () => {
    for (const [ruta, nombre] of [
      ['src/components/inventario/reportes/costo-recetas/CostoRecetasPage.tsx', 'costo_recetas'],
      ['src/components/inventario/reportes/trazabilidad/TrazabilidadPage.tsx', 'trazabilidad'],
    ] as const) {
      const texto = leer(ruta);
      expect(texto).toContain('const { getToday } = useFormatDate();');
      expect(texto).toContain('link.download = `' + nombre + '_${getToday()}.csv`;');
    }
  });
});

describe('ninguno de los 13 archivos añade un parámetro timezone opcional', () => {
  // ADR-003: la zona entra por identidad. Un `timezone?: string` que nadie
  // rellena no arregla nada y no falla de forma visible.
  it.each(ARCHIVOS)('%s', (ruta) => {
    expect(leer(ruta)).not.toMatch(/timezone\?\s*:\s*string/);
  });
});
