import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { resolveTimezone } from '@/lib/services/timezoneResolver';
import { getDateRange, getDayRange } from '@/lib/utils/timezone';

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

export class ReportesContablesService {
  private static getOrganizationId(): number {
    const org = obtenerOrganizacionActiva();
    return org?.id || 0;
  }

  static async getExchangeRate(currencyCode: string, date?: string): Promise<ExchangeRateInfo | null> {
    if (!currencyCode || currencyCode === 'COP') {
      return { currency_code: 'COP', rate: 1.0, rate_date: date || new Date().toISOString().split('T')[0], source: 'base' };
    }

    const targetDate = date || new Date().toISOString().split('T')[0];

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

    if (error || !data) return ['COP'];

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

    const { data: lines, error: linesError } = await supabase
      .from('journal_lines')
      .select(`
        debit,
        credit,
        account_code,
        journal_entries!inner(entry_date, posted)
      `)
      .eq('organization_id', organizationId)
      .gte('journal_entries.entry_date', start)
      .lte('journal_entries.entry_date', end)
      .eq('journal_entries.posted', true);

    if (linesError) throw linesError;

    const periodTotals = new Map<string, { debit: number; credit: number }>();
    (lines || []).forEach((line: FilaLinea) => {
      const code = line.account_code ?? '';
      const current = periodTotals.get(code) || { debit: 0, credit: 0 };
      current.debit += parseFloat(line.debit) || 0;
      current.credit += parseFloat(line.credit) || 0;
      periodTotals.set(code, current);
    });

    const { data: priorLines, error: priorError } = await supabase
      .from('journal_lines')
      .select(`
        debit,
        credit,
        account_code,
        journal_entries!inner(entry_date, posted)
      `)
      .eq('organization_id', organizationId)
      .lt('journal_entries.entry_date', start)
      .eq('journal_entries.posted', true);

    if (priorError) throw priorError;

    const initialTotals = new Map<string, { debit: number; credit: number }>();
    (priorLines || []).forEach((line: FilaLinea) => {
      const code = line.account_code ?? '';
      const current = initialTotals.get(code) || { debit: 0, credit: 0 };
      current.debit += parseFloat(line.debit) || 0;
      current.credit += parseFloat(line.credit) || 0;
      initialTotals.set(code, current);
    });

    return (accounts || []).map((acc: FilaCuenta) => {
      const initial = initialTotals.get(acc.account_code) || { debit: 0, credit: 0 };
      const period = periodTotals.get(acc.account_code) || { debit: 0, credit: 0 };

      let initialDebit = initial.debit;
      let initialCredit = initial.credit;
      if (acc.type === 'asset' || acc.type === 'expense') {
        initialDebit = initial.debit - initial.credit;
        initialCredit = 0;
      } else {
        initialCredit = initial.credit - initial.debit;
        initialDebit = 0;
      }

      const finalDebit = initialDebit + period.debit;
      const finalCredit = initialCredit + period.credit;

      return {
        account_code: acc.account_code,
        name: acc.name,
        type: acc.type,
        parent_code: acc.parent_code,
        initial_debit: initialDebit,
        initial_credit: initialCredit,
        period_debit: period.debit,
        period_credit: period.credit,
        final_debit: Math.max(0, finalDebit - finalCredit),
        final_credit: Math.max(0, finalCredit - finalDebit),
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

    const { data: lines, error: linesError } = await supabase
      .from('journal_lines')
      .select(`
        debit,
        credit,
        account_code,
        journal_entries!inner(entry_date, posted)
      `)
      .eq('organization_id', organizationId)
      .gte('journal_entries.entry_date', start)
      .lte('journal_entries.entry_date', end)
      .eq('journal_entries.posted', true);

    if (linesError) throw linesError;

    const totals = new Map<string, number>();
    (lines || []).forEach((line: FilaLinea) => {
      const code = line.account_code ?? '';
      const acc = (accounts || []).find((a: FilaCuenta) => a.account_code === code);
      if (!acc) return;

      const current = totals.get(code) || 0;
      if (acc.type === 'income') {
        totals.set(code, current + (parseFloat(line.credit) || 0) - (parseFloat(line.debit) || 0));
      } else {
        totals.set(code, current + (parseFloat(line.debit) || 0) - (parseFloat(line.credit) || 0));
      }
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

      const sumAmounts = (node: IncomeStatementRow): number => {
        node.amount = (totals.get(node.account_code) || 0);
        const childrenSum = node.children.reduce((sum, child) => sum + sumAmounts(child), 0);
        if (node.children.length > 0) {
          node.amount = childrenSum;
        }
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

    const { data: lines, error: linesError } = await supabase
      .from('journal_lines')
      .select(`
        debit,
        credit,
        account_code,
        journal_entries!inner(entry_date, posted)
      `)
      .eq('organization_id', organizationId)
      .lte('journal_entries.entry_date', cierreDelDia)
      .eq('journal_entries.posted', true);

    if (linesError) throw linesError;

    const totals = new Map<string, number>();
    (lines || []).forEach((line: FilaLinea) => {
      const code = line.account_code ?? '';
      const acc = (accounts || []).find((a: FilaCuenta) => a.account_code === code);
      if (!acc) return;

      const current = totals.get(code) || 0;
      if (acc.type === 'asset') {
        totals.set(code, current + (parseFloat(line.debit) || 0) - (parseFloat(line.credit) || 0));
      } else {
        totals.set(code, current + (parseFloat(line.credit) || 0) - (parseFloat(line.debit) || 0));
      }
    });

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

      const sumAmounts = (node: BalanceSheetRow): number => {
        const ownAmount = totals.get(node.account_code) || 0;
        const childrenSum = node.children.reduce((sum, child) => sum + sumAmounts(child), 0);
        node.amount = node.children.length > 0 ? childrenSum : ownAmount;
        return node.amount;
      };

      roots.forEach(r => sumAmounts(r));
      return roots;
    };

    const assets = buildTree('asset');
    const liabilities = buildTree('liability');
    const equity = buildTree('equity');

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

    const { data: priorLines, error: priorError } = await supabase
      .from('journal_lines')
      .select(`
        debit,
        credit,
        journal_entries!inner(entry_date, posted)
      `)
      .eq('organization_id', organizationId)
      .eq('account_code', accountCode)
      .lt('journal_entries.entry_date', start)
      .eq('journal_entries.posted', true);

    if (priorError) throw priorError;

    let openingBalance = 0;
    (priorLines || []).forEach((line: FilaLinea) => {
      if (account.type === 'asset' || account.type === 'expense') {
        openingBalance += (parseFloat(line.debit) || 0) - (parseFloat(line.credit) || 0);
      } else {
        openingBalance += (parseFloat(line.credit) || 0) - (parseFloat(line.debit) || 0);
      }
    });

    const { data: lines, error: linesError } = await supabase
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
      .order('journal_entries.entry_date');

    if (linesError) throw linesError;

    let runningBalance = openingBalance;
    const entries: LedgerEntry[] = (lines || []).map((line: FilaLinea) => {
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
