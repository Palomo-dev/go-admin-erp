import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { resolveTimezone } from '@/lib/services/timezoneResolver';
import { getDateRange, getDayRange, todayInTz } from '@/lib/utils/timezone';
import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';

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
 */
async function saldosPorCuenta(
  organizationId: number,
  desde: string | null,
  hasta: string | null
): Promise<Map<string, { debit: number; credit: number }>> {
  const { data, error } = await supabase.rpc('fn_saldos_cuentas', {
    p_organization_id: organizationId,
    p_desde: desde,
    p_hasta: hasta,
  });
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
    endDate: string
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

    const saldos = await saldosPorCuenta(organizationId, start, end);

    const totals = new Map<string, number>();
    (accounts || []).forEach((acc: FilaCuenta) => {
      const saldo = saldos.get(acc.account_code);
      if (!saldo) return;
      totals.set(
        acc.account_code,
        acc.type === 'income' ? saldo.credit - saldo.debit : saldo.debit - saldo.credit
      );
    });

    const buildTree = (type: string): IncomeStatementRow[] => {
      const typeAccounts = (accounts || []).filter((a: FilaCuenta) => a.type === type);
      const nodeMap = new Map<string, IncomeStatementRow>();
      const roots: IncomeStatementRow[] = [];

      typeAccounts.forEach((acc: FilaCuenta) => {
        nodeMap.set(acc.account_code, {
          account_code: acc.account_code,
          name: acc.name,
          type: acc.type,
          parent_code: acc.parent_code,
          amount: totals.get(acc.account_code) || 0,
          children: [],
        });
      });

      typeAccounts.forEach((acc: FilaCuenta) => {
        const node = nodeMap.get(acc.account_code)!;
        if (acc.parent_code && nodeMap.has(acc.parent_code)) {
          nodeMap.get(acc.parent_code)!.children.push(node);
        } else {
          roots.push(node);
        }
      });

      // Una cuenta padre también puede tener movimientos propios: su saldo es
      // el propio más el de sus hijas (antes se descartaba el propio).
      const sumAmounts = (node: IncomeStatementRow): number => {
        const childrenSum = node.children.reduce((sum, child) => sum + sumAmounts(child), 0);
        node.amount = (totals.get(node.account_code) || 0) + childrenSum;
        return node.amount;
      };

      roots.forEach(r => sumAmounts(r));
      return roots;
    };

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

  static async getBalanceSheet(asOfDate: string): Promise<{ assets: BalanceSheetRow[]; liabilities: BalanceSheetRow[]; equity: BalanceSheetRow[]; totalAssets: number; totalLiabilities: number; totalEquity: number; balanced: boolean }> {
    const organizationId = this.getOrganizationId();
    const timezone = await resolveTimezone(organizationId);
    // Corte «a fecha de»: el ultimo instante de ese dia en la zona del negocio.
    const { end: cierreDelDia } = getDayRange(asOfDate, timezone);

    const { data: accounts, error: accountsError } = await supabase
      .from('chart_of_accounts')
      .select('account_code, name, type, parent_code')
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

    const buildTree = (type: string): BalanceSheetRow[] => {
      const typeAccounts = (accounts || []).filter((a: FilaCuenta) => a.type === type);
      const nodeMap = new Map<string, BalanceSheetRow>();
      const roots: BalanceSheetRow[] = [];

      typeAccounts.forEach((acc: FilaCuenta) => {
        nodeMap.set(acc.account_code, {
          account_code: acc.account_code,
          name: acc.name,
          type: acc.type,
          parent_code: acc.parent_code,
          amount: 0,
          children: [],
        });
      });

      typeAccounts.forEach((acc: FilaCuenta) => {
        const node = nodeMap.get(acc.account_code)!;
        if (acc.parent_code && nodeMap.has(acc.parent_code)) {
          nodeMap.get(acc.parent_code)!.children.push(node);
        } else {
          roots.push(node);
        }
      });

      // Saldo propio de la cuenta más el de sus hijas (antes el padre perdía el propio).
      const sumAmounts = (node: BalanceSheetRow): number => {
        const ownAmount = totals.get(node.account_code) || 0;
        const childrenSum = node.children.reduce((sum, child) => sum + sumAmounts(child), 0);
        node.amount = ownAmount + childrenSum;
        return node.amount;
      };

      roots.forEach(r => sumAmounts(r));
      return roots;
    };

    const assets = buildTree('asset');
    const liabilities = buildTree('liability');
    const equity = buildTree('equity');
    if (Math.abs(resultadoEjercicio) >= 0.005) {
      equity.push({
        account_code: 'RESULTADO',
        name: 'Resultado del ejercicio (sin cerrar)',
        type: 'equity',
        parent_code: null,
        amount: resultadoEjercicio,
        children: [],
      });
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

    // Saldo inicial sumado en la base: antes se traían las líneas sin paginar
    // y PostgREST las cortaba en 1.000 filas.
    const saldoPrevio = (await saldosPorCuenta(organizationId, null, instanteAnterior(start))).get(accountCode)
      ?? { debit: 0, credit: 0 };
    const openingBalance = account.type === 'asset' || account.type === 'expense'
      ? saldoPrevio.debit - saldoPrevio.credit
      : saldoPrevio.credit - saldoPrevio.debit;

    // Movimientos del periodo en páginas de 1.000 (el tope de PostgREST).
    const TAMANO_PAGINA = 1000;
    const lines: FilaLinea[] = [];
    for (let desde = 0; ; desde += TAMANO_PAGINA) {
      const { data: pagina, error: linesError } = await supabase
        .from('journal_lines')
        .select(`
          id,
          debit,
          credit,
          description,
          journal_entry_id,
          journal_entries!inner(id, entry_date, memo, source, posted)
        `)
        .eq('organization_id', organizationId)
        .eq('account_code', accountCode)
        .gte('journal_entries.entry_date', start)
        .lte('journal_entries.entry_date', end)
        .eq('journal_entries.posted', true)
        .order('id')
        .range(desde, desde + TAMANO_PAGINA - 1);

      if (linesError) throw linesError;
      lines.push(...((pagina || []) as FilaLinea[]));
      if (!pagina || pagina.length < TAMANO_PAGINA) break;
    }

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
        memo: je?.memo || null,
        source: je?.source || null,
        posted: je?.posted || false,
        debit,
        credit,
        running_balance: runningBalance,
      };
    });

    const totalDebit = entries.reduce((sum, e) => sum + e.debit, 0);
    const totalCredit = entries.reduce((sum, e) => sum + e.credit, 0);

    return {
      account_code: account.account_code,
      name: account.name,
      type: account.type,
      opening_balance: openingBalance,
      entries,
      total_debit: totalDebit,
      total_credit: totalCredit,
      closing_balance: runningBalance,
    };
  }
}
