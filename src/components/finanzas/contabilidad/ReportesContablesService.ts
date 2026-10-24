import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { resolveTimezone } from '@/lib/services/timezoneResolver';
import { getDateRange, getDayRange, todayInTz } from '@/lib/utils/timezone';
import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';
import { armarArbolContable, anidarResultado, presentarNiif } from '@/lib/finanzas/arbolBalance';
import { cuentasBajoPrefijo } from '@/lib/finanzas/pucPrefijo';

// ============================================================
// `journal_entries.entry_date` es **timestamptz**, no `date` (verificado en
// `information_schema.columns`). Comparar la columna contra un `'YYYY-MM-DD'`
// hace que Postgres lo lea como medianoche UTC: en Bogota ese corte cae a las
// 19:00 del dia anterior, y el balance de un dia se come cinco horas del
// siguiente. Por eso cada filtro se convierte al par de INSTANTES que cubre el
// dia en la zona de la organizacion (ADR-003: el servicio recibe identidad y
// resuelve la zona; aqui la identidad es `organization_id` de la sesion).
// ============================================================


export interface TrialBalanceRow {
  account_code: string;
  name: string;
  type: string;
  parent_code: string | null;
  initial_debit: number;
  initial_credit: number;
  period_debit: number;
  period_credit: number;
  final_debit: number;
  final_credit: number;
}

export interface IncomeStatementRow {
  account_code: string;
  name: string;
  type: string;
  parent_code: string | null;
  amount: number;
  children: IncomeStatementRow[];
}

export interface BalanceSheetRow {
  account_code: string;
  name: string;
  type: string;
  parent_code: string | null;
  amount: number;
  children: BalanceSheetRow[];
}

export interface LedgerEntry {
  journal_entry_id: number;
  entry_date: string;
  account_code: string;
  memo: string | null;
  source: string | null;
  posted: boolean;
  debit: number;
  credit: number;
  running_balance: number;
}

export interface LedgerAccount {
  account_code: string;
  name: string;
  type: string;
  opening_balance: number;
  entries: LedgerEntry[];
  total_debit: number;
  total_credit: number;
  closing_balance: number;
  /** El detalle muestra a lo sumo 400 líneas. Los totales siguen siendo del periodo. */
  truncated: boolean;
}

export interface LineaLibroDiario {
  entry_id: number;
  entry_date: string;
  memo: string | null;
  account_code: string;
  account_name: string | null;
  debit: number;
  credit: number;
  tercero_nit: string | null;
  tercero_nombre: string | null;
}

export interface FilaAuxiliarRpc {
  tercero_nit: string;
  tercero_nombre: string;
  account_code: string;
  debit: number;
  credit: number;
}

export interface ExchangeRateInfo {
  currency_code: string;
  rate: number;
  rate_date: string;
  source: string;
}


// Formas crudas que devuelve PostgREST en este archivo. Estaban como `any`;
// se nombran para que el compilador ayude en vez de mirar hacia otro lado.
interface FilaCuenta {
  account_code: string;
  name: string;
  type: string;
  parent_code: string | null;
  presentacion_niif?: string | null;
}

interface FilaAsiento {
  id?: number;
  entry_date?: string;
  memo?: string | null;
  source?: string | null;
  posted?: boolean;
}

// Todos los campos opcionales: cada `select` trae un subconjunto distinto y
// el cliente tipado de Supabase infiere una forma por consulta.
interface FilaLinea {
  id?: number;
  account_code?: string;
  debit: string;
  credit: string;
  description?: string | null;
  journal_entry_id?: number;
  journal_entries?: FilaAsiento | FilaAsiento[] | null;
}

interface SaldoCuenta {
  account_code: string;
  debito: number | string;
  credito: number | string;
}

/**
 * Débitos y créditos por cuenta de los asientos publicados en el rango,
 * sumados en la base (`fn_saldos_cuentas`). Antes se traían las líneas sin
 * paginar y PostgREST las cortaba en 1.000 filas: en cualquier organización con
 * más movimiento los informes salían truncados sin avisar (ADR-CC-012).
 * La función corre como su dueño y resuelve la sucursal una sola vez: leerla
 * como invocador recorría la RLS en cada línea, pasaba el tope de 8 s y el
 * estado de resultados se quedaba en blanco.
 */
async function saldosPorCuenta(
  organizationId: number,
  desde: string | null,
  hasta: string | null,
  centroId?: string | null,
): Promise<Map<string, { debit: number; credit: number }>> {
  const parametros: {
    p_organization_id: number;
    p_desde: string | null;
    p_hasta: string | null;
    p_cost_center_id?: string;
  } = {
    p_organization_id: organizationId,
    p_desde: desde,
    p_hasta: hasta,
  };
  // Sin centro se llama la función de tres argumentos: el informe sigue
  // sumando todos los centros, que es el comportamiento de siempre.
  if (centroId) parametros.p_cost_center_id = centroId;
  const { data, error } = await supabase.rpc('fn_saldos_cuentas', parametros);
  if (error) throw error;

  const saldos = new Map<string, { debit: number; credit: number }>();
  ((data as SaldoCuenta[] | null) || []).forEach((fila) => {
    saldos.set(fila.account_code, {
      debit: Number(fila.debito) || 0,
      credit: Number(fila.credito) || 0,
    });
  });
  return saldos;
}

/** Un instante antes del dado: el corte «antes del inicio» del saldo inicial. */
function instanteAnterior(instante: string): string {
  return new Date(new Date(instante).getTime() - 1).toISOString();
}

export type ModoBalance = 'puc' | 'niif';

export class ReportesContablesService {
  private static getOrganizationId(): number {
    const org = obtenerOrganizacionActiva();
    return org?.id || 0;
  }

  /**
   * Tasa vigente de una moneda para un dia contable.
   *
   * `currency_rates` es el catalogo GLOBAL: no tiene organizacion y su
   * `rate_date` lo escribe el sistema (ADR-004). Pero ADR-004 dice tambien que
   * eso "no autoriza LEER el catalogo con el dia UTC": quien pregunta por la
   * tasa de hoy para un informe contable pregunta por su dia de negocio. Por
   * eso el dia objetivo sale de la zona de la organizacion (ADR-003: la
   * identidad ya esta en la clase, `getOrganizationId()`), y la busqueda es
   * `rate_date <= dia` ordenada hacia atras: la vigente a ese dia, que es lo
   * unico que tiene sentido cuando el catalogo puede ir un dia por detras.
   */
  static async getExchangeRate(currencyCode: string, date?: string): Promise<ExchangeRateInfo | null> {
    const diaContable =
      date ?? todayInTz(await resolveTimezone(this.getOrganizationId()));

    if (!currencyCode || currencyCode === 'COP') {
      return { currency_code: 'COP', rate: 1.0, rate_date: diaContable, source: 'base' };
    }

    const targetDate = diaContable;

    const { data, error } = await supabase
      .from('currency_rates')
      .select('code, rate, rate_date, source')
      .eq('code', currencyCode)
      .lte('rate_date', targetDate)
      .order('rate_date', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      console.error('Error obteniendo tasa de cambio:', error);
      return null;
    }

    return {
      currency_code: data.code,
      rate: parseFloat(data.rate),
      rate_date: data.rate_date,
      source: data.source,
    };
  }

  static async getAvailableCurrencies(): Promise<string[]> {
    const { data, error } = await supabase
      .from('currency_rates')
      .select('code')
      .order('code');

    // Sin catálogo: al menos la moneda base de la organización (nunca COP supuesto).
    if (error || !data) return [(await resolveOrgCurrency(supabase, this.getOrganizationId())).code];

    const unique = [...new Set(data.map((d: { code: string }) => d.code))];
    return unique;
  }

  static async getTrialBalance(
    startDate: string,
    endDate: string
  ): Promise<TrialBalanceRow[]> {
    const organizationId = this.getOrganizationId();
    const timezone = await resolveTimezone(organizationId);
    const { start, end } = getDateRange(startDate, endDate, timezone);

    const { data: accounts, error: accountsError } = await supabase
      .from('chart_of_accounts')
      .select('account_code, name, type, parent_code')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('account_code');

    if (accountsError) throw accountsError;

    const [periodTotals, initialTotals] = await Promise.all([
      saldosPorCuenta(organizationId, start, end),
      saldosPorCuenta(organizationId, null, instanteAnterior(start)),
    ]);

    return (accounts || []).map((acc: FilaCuenta) => {
      const initial = initialTotals.get(acc.account_code) || { debit: 0, credit: 0 };
      const period = periodTotals.get(acc.account_code) || { debit: 0, credit: 0 };

      // Saldo neto (débito − crédito) en la columna que le toca por su signo,
      // sin importar la naturaleza de la cuenta: un 1305 con saldo acreedor se
      // ve en «crédito», no como un débito negativo.
      const inicialNeto = initial.debit - initial.credit;
      const finalNeto = inicialNeto + period.debit - period.credit;

      return {
        account_code: acc.account_code,
        name: acc.name,
        type: acc.type,
        parent_code: acc.parent_code,
        initial_debit: Math.max(0, inicialNeto),
        initial_credit: Math.max(0, -inicialNeto),
        period_debit: period.debit,
        period_credit: period.credit,
        final_debit: Math.max(0, finalNeto),
        final_credit: Math.max(0, -finalNeto),
      };
    });
  }

  static async getIncomeStatement(
    startDate: string,
    endDate: string,
    centroId?: string | null,
  ): Promise<{ income: IncomeStatementRow[]; expenses: IncomeStatementRow[]; totalIncome: number; totalExpenses: number; netIncome: number }> {
    const organizationId = this.getOrganizationId();
    const timezone = await resolveTimezone(organizationId);
    const { start, end } = getDateRange(startDate, endDate, timezone);

    const { data: accounts, error: accountsError } = await supabase
      .from('chart_of_accounts')
      .select('account_code, name, type, parent_code')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .in('type', ['income', 'expense'])
      .order('account_code');

    if (accountsError) throw accountsError;

    const saldos = await saldosPorCuenta(organizationId, start, end, centroId);

    const totals = new Map<string, number>();
    (accounts || []).forEach((acc: FilaCuenta) => {
      const saldo = saldos.get(acc.account_code);
      if (!saldo) return;
      totals.set(
        acc.account_code,
        acc.type === 'income' ? saldo.credit - saldo.debit : saldo.debit - saldo.credit
      );
    });

    const buildTree = (type: string): IncomeStatementRow[] =>
      armarArbolContable(
        (accounts || []).filter((a: FilaCuenta) => a.type === type),
        (codigo) => totals.get(codigo) || 0,
      );

    const income = buildTree('income');
    const expenses = buildTree('expense');

    const totalIncome = income.reduce((sum, r) => sum + r.amount, 0);
    const totalExpenses = expenses.reduce((sum, r) => sum + r.amount, 0);

    return {
      income,
      expenses,
      totalIncome,
      totalExpenses,
      netIncome: totalIncome - totalExpenses,
    };
  }

  static async getBalanceSheet(asOfDate: string, modo: ModoBalance = 'puc'): Promise<{ assets: BalanceSheetRow[]; liabilities: BalanceSheetRow[]; equity: BalanceSheetRow[]; totalAssets: number; totalLiabilities: number; totalEquity: number; balanced: boolean; modo: ModoBalance }> {
    const organizationId = this.getOrganizationId();
    const timezone = await resolveTimezone(organizationId);
    // Corte «a fecha de»: el ultimo instante de ese dia en la zona del negocio.
    const { end: cierreDelDia } = getDayRange(asOfDate, timezone);

    const { data: accounts, error: accountsError } = await supabase
      .from('chart_of_accounts')
      .select('account_code, name, type, parent_code, presentacion_niif')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .in('type', ['asset', 'liability', 'equity'])
      .order('account_code');

    if (accountsError) throw accountsError;

    const saldos = await saldosPorCuenta(organizationId, null, cierreDelDia);

    const totals = new Map<string, number>();
    (accounts || []).forEach((acc: FilaCuenta) => {
      const saldo = saldos.get(acc.account_code);
      if (!saldo) return;
      totals.set(
        acc.account_code,
        acc.type === 'asset' ? saldo.debit - saldo.credit : saldo.credit - saldo.debit
      );
    });

    // Resultado acumulado no cerrado contra patrimonio: ingresos − gastos de
    // todas las cuentas de resultado hasta la fecha de corte. Sin él, el
    // balance general «descuadra» siempre por el importe de la utilidad.
    const { data: cuentasResultado, error: cuentasResultadoError } = await supabase
      .from('chart_of_accounts')
      .select('account_code, type')
      .eq('organization_id', organizationId)
      .in('type', ['income', 'expense']);
    if (cuentasResultadoError) throw cuentasResultadoError;
    const resultadoEjercicio = (cuentasResultado || []).reduce(
      (acumulado: number, cuenta: { account_code: string; type: string }) => {
        const saldo = saldos.get(cuenta.account_code);
        if (!saldo) return acumulado;
        // Ingresos suman (crédito − débito) y gastos restan (débito − crédito): en ambos casos, crédito − débito.
        return acumulado + saldo.credit - saldo.debit;
      },
      0
    );

    const buildTree = (type: string): BalanceSheetRow[] =>
      armarArbolContable(
        (accounts || []).filter((a: FilaCuenta) => a.type === type),
        (codigo) => totals.get(codigo) || 0,
      );

    let assets = buildTree('asset');
    let liabilities = buildTree('liability');
    const equity = buildTree('equity');
    anidarResultado(equity, resultadoEjercicio);
    if (modo === 'niif') {
      const explicita = new Map(
        (accounts || []).map((cuenta: FilaCuenta) => [cuenta.account_code, cuenta.presentacion_niif ?? null]),
      );
      assets = presentarNiif(assets, explicita);
      liabilities = presentarNiif(liabilities, explicita);
    }

    const totalAssets = assets.reduce((sum, r) => sum + r.amount, 0);
    const totalLiabilities = liabilities.reduce((sum, r) => sum + r.amount, 0);
    const totalEquity = equity.reduce((sum, r) => sum + r.amount, 0);

    return {
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
      balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
      modo,
    };
  }

  static async getLedger(
    accountCode: string,
    startDate: string,
    endDate: string
  ): Promise<LedgerAccount | null> {
    const organizationId = this.getOrganizationId();
    const timezone = await resolveTimezone(organizationId);
    const { start, end } = getDateRange(startDate, endDate, timezone);

    const { data: account, error: accountError } = await supabase
      .from('chart_of_accounts')
      .select('account_code, name, type')
      .eq('organization_id', organizationId)
      .eq('account_code', accountCode)
      .single();

    if (accountError || !account) return null;

    const { data: plan, error: planError } = await supabase
      .from('chart_of_accounts')
      .select('account_code')
      .eq('organization_id', organizationId);
    if (planError) throw planError;
    const codigos = cuentasBajoPrefijo(
      accountCode,
      (plan || []).map((fila: { account_code: string }) => fila.account_code),
    );
    if (!codigos.includes(accountCode)) codigos.push(accountCode);
    const sumarCodigos = (
      saldos: Map<string, { debit: number; credit: number }>,
    ): { debit: number; credit: number } => {
      let debit = 0;
      let credit = 0;
      for (const codigo of codigos) {
        const saldo = saldos.get(codigo);
        if (!saldo) continue;
        debit += saldo.debit;
        credit += saldo.credit;
      }
      return { debit, credit };
    };

    // Saldo inicial sumado en la base: antes se traían las líneas sin paginar
    // y PostgREST las cortaba en 1.000 filas. Una cuenta que no es hoja
    // arrastra el saldo de todo su prefijo.
    const saldoPrevio = sumarCodigos(await saldosPorCuenta(organizationId, null, instanteAnterior(start)));
    const openingBalance = account.type === 'asset' || account.type === 'expense'
      ? saldoPrevio.debit - saldoPrevio.credit
      : saldoPrevio.credit - saldoPrevio.debit;

    // El mayor no recorre el libro entero: 400 líneas alcanzan para la pantalla
    // y los totales salen del agregado, no de esa página.
    const TOPE_LINEAS = 400;
    const periodo = sumarCodigos(await saldosPorCuenta(organizationId, start, end));
    const { data: pagina, error: linesError } = await supabase
      .from('journal_lines')
      .select(`
        id,
        account_code,
        debit,
        credit,
        description,
        journal_entry_id,
        journal_entries!inner(id, entry_date, memo, source, posted)
      `)
      .eq('organization_id', organizationId)
      .in('account_code', codigos)
      .gte('journal_entries.entry_date', start)
      .lte('journal_entries.entry_date', end)
      .eq('journal_entries.posted', true)
      .order('id')
      .limit(TOPE_LINEAS + 1);

    if (linesError) throw linesError;
    const crudas = (pagina || []) as FilaLinea[];
    const truncated = crudas.length > TOPE_LINEAS;
    const lines = crudas.slice(0, TOPE_LINEAS);

    // El orden por la columna de la tabla relacionada no ordena las líneas:
    // el saldo corrido exige ordenarlas aquí por fecha del asiento y luego id.
    const fechaDe = (line: FilaLinea): string => {
      const je = Array.isArray(line.journal_entries) ? line.journal_entries[0] : line.journal_entries;
      return je?.entry_date || '';
    };
    lines.sort((a, b) => {
      const fa = new Date(fechaDe(a)).getTime();
      const fb = new Date(fechaDe(b)).getTime();
      return fa !== fb ? fa - fb : (a.id ?? 0) - (b.id ?? 0);
    });

    let runningBalance = openingBalance;
    const entries: LedgerEntry[] = lines.map((line: FilaLinea) => {
      const debit = parseFloat(line.debit) || 0;
      const credit = parseFloat(line.credit) || 0;

      if (account.type === 'asset' || account.type === 'expense') {
        runningBalance += debit - credit;
      } else {
        runningBalance += credit - debit;
      }

      const je = Array.isArray(line.journal_entries) ? line.journal_entries[0] : line.journal_entries;

      return {
        journal_entry_id: line.journal_entry_id ?? 0,
        entry_date: je?.entry_date || '',
        account_code: line.account_code || accountCode,
        memo: je?.memo || null,
        source: je?.source || null,
        posted: je?.posted || false,
        debit,
        credit,
        running_balance: runningBalance,
      };
    });

    const totalDebit = periodo.debit;
    const totalCredit = periodo.credit;
    const movimiento = account.type === 'asset' || account.type === 'expense'
      ? periodo.debit - periodo.credit
      : periodo.credit - periodo.debit;

    return {
      account_code: account.account_code,
      name: account.name,
      type: account.type,
      opening_balance: openingBalance,
      entries,
      total_debit: totalDebit,
      total_credit: totalCredit,
      closing_balance: openingBalance + movimiento,
      truncated,
    };
  }

  static async getLibroDiario(
    startDate: string,
    endDate: string,
    limite = 500,
  ): Promise<{ filas: LineaLibroDiario[]; truncado: boolean }> {
    const organizationId = this.getOrganizationId();
    const timezone = await resolveTimezone(organizationId);
    const { start, end } = getDateRange(startDate, endDate, timezone);
    const { data, error } = await supabase.rpc('fn_libro_diario', {
      p_organization_id: organizationId,
      p_desde: start,
      p_hasta: end,
      p_limite: limite,
    });
    if (error) throw error;
    const filas = ((data || []) as LineaLibroDiario[]).map((fila) => ({
      ...fila,
      debit: Number(fila.debit) || 0,
      credit: Number(fila.credit) || 0,
    }));
    return { filas, truncado: filas.length >= limite };
  }

  static async getAuxiliarTercero(
    startDate: string,
    endDate: string,
    cuenta?: string,
    limite = 500,
  ): Promise<{ filas: FilaAuxiliarRpc[]; truncado: boolean }> {
    const organizationId = this.getOrganizationId();
    const timezone = await resolveTimezone(organizationId);
    const { start, end } = getDateRange(startDate, endDate, timezone);
    const { data, error } = await supabase.rpc('fn_auxiliar_tercero', {
      p_organization_id: organizationId,
      p_desde: start,
      p_hasta: end,
      p_cuenta: cuenta?.trim() || null,
      p_limite: limite,
    });
    if (error) throw error;
    const filas = ((data || []) as FilaAuxiliarRpc[]).map((fila) => ({
      ...fila,
      tercero_nit: fila.tercero_nit || '—',
      debit: Number(fila.debit) || 0,
      credit: Number(fila.credit) || 0,
    }));
    return { filas, truncado: filas.length >= limite };
  }
}
