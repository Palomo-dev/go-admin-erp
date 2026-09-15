'use client';

/**
 * F14 — matemática comercial: CAC, LTV, LTV/CAC, payback, churn, retención
 * neta y ARPA, calculados en el servidor (`revenueMath.ts`) y mostrados con su
 * fórmula. Lo que no se puede calcular dice por qué (`math.missing`).
 *
 * Insumos que no existen en la base (gasto de adquisición, margen bruto): se
 * piden aquí y se guardan en `organization_settings` (clave `crm_revenue_math`)
 * por `PUT /api/crm/revenue/inputs`; solo administradores (decidido en servidor).
 */

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { RevenueInputs, RevenueMathResult } from '@/lib/services/crm/revenueOsService';
import { fmtMoney, fmtNumber, fmtPct, fmtRatio, SIN_DATOS } from './formatters';

interface Props {
  math: RevenueMathResult;
  inputs: RevenueInputs;
  canEdit: boolean;
  onSaved: () => void;
  /** Moneda base de la organización; null → cifras sin símbolo (la página lo avisa). */
  currency: string | null;
}

type MetricKey = keyof RevenueMathResult['missing'];
type Cur = string | null;

const METRICS: Array<{ key: MetricKey; label: string; formula: string; format: (m: RevenueMathResult, c: Cur) => string; health?: (m: RevenueMathResult) => string | null }> = [
  { key: 'arpa', label: 'ARPA', formula: 'Ticket medio por factura pagada del periodo (ponderado por facturas)', format: (m, c) => fmtMoney(m.arpa, c) },
  { key: 'cac', label: 'CAC', formula: 'Gasto de adquisición del periodo ÷ oportunidades ganadas en el periodo', format: (m, c) => fmtMoney(m.cac, c) },
  { key: 'churnRatePct', label: 'Churn mensual', formula: '100 − retención M1 ponderada por cohorte', format: (m) => fmtPct(m.churnRatePct, 1) },
  { key: 'ltv', label: 'LTV', formula: 'ARPA × margen bruto × (1 ÷ churn)', format: (m, c) => fmtMoney(m.ltv, c) },
  {
    key: 'ltvCacRatio',
    label: 'LTV / CAC',
    formula: 'LTV ÷ CAC (saludable ≥ 3)',
    format: (m) => fmtRatio(m.ltvCacRatio),
    health: (m) => (m.ltvCacRatio === null ? null : m.ltvCacRatio >= 3 ? 'Saludable' : 'Por debajo de 3'),
  },
  { key: 'paybackMonths', label: 'Payback', formula: 'CAC ÷ (ARPA × margen bruto), en meses', format: (m) => (m.paybackMonths === null ? SIN_DATOS : `${fmtNumber(m.paybackMonths, 1)} meses`) },
  { key: 'netRevenueRetentionPct', label: 'Retención neta de ingresos', formula: '(MRR inicial + expansión − contracción − churn) ÷ MRR inicial', format: (m) => fmtPct(m.netRevenueRetentionPct, 1) },
];

export function RevenueMathPanel({ math, inputs, canEdit, onSaved, currency }: Props) {
  const spendId = useId();
  const marginId = useId();
  const errId = useId();
  const { formatDateTime } = useFormatDate();
  const [spend, setSpend] = useState(inputs.acquisition_spend === null ? '' : String(inputs.acquisition_spend));
  const [margin, setMargin] = useState(inputs.gross_margin_pct === null ? '' : String(inputs.gross_margin_pct));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const spendValue = spend.trim() === '' ? null : Number(spend);
    const marginValue = margin.trim() === '' ? null : Number(margin);
    if ((spendValue !== null && (!Number.isFinite(spendValue) || spendValue < 0)) || (marginValue !== null && (!Number.isFinite(marginValue) || marginValue < 0 || marginValue > 100))) {
      setError('Gasto ≥ 0 y margen entre 0 y 100.');
      document.getElementById(spendId)?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/crm/revenue/inputs', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acquisition_spend: spendValue, gross_margin_pct: marginValue }),
      });
      const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!res.ok || !body?.success) throw new Error(body?.error || `Error ${res.status}`);
      toast({ title: 'Insumos guardados', description: 'CAC, LTV y payback se recalculan con los nuevos valores.' });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <ul className="grid gap-3 sm:grid-cols-2" aria-label="Métricas de matemática comercial">
        {METRICS.map((m) => {
          const value = m.format(math, currency);
          const reason = math.missing[m.key];
          const health = m.health?.(math) ?? null;
          return (
            <li key={m.key} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-300">{m.label}</p>
              <p className={`mt-1 text-xl font-semibold ${value === SIN_DATOS ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-50'}`}>{value}</p>
              {health && (
                <p className="mt-0.5 text-xs text-gray-700 dark:text-gray-200">
                  {health === 'Saludable' ? '✓ ' : '⚠ '}
                  {health}
                </p>
              )}
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{m.formula}</p>
              {reason && <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-200">{reason}</p>}
            </li>
          );
        })}
      </ul>

      <section aria-labelledby={`${spendId}-title`} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <h3 id={`${spendId}-title`} className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Insumos del periodo
        </h3>
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
          No existen en la base: se guardan en la configuración de la organización y alimentan CAC, LTV y payback.
          Oportunidades ganadas en el periodo (denominador del CAC): {fmtNumber(math.newCustomers)}.
        </p>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={spendId} className="text-xs text-gray-700 dark:text-gray-200">
              Gasto de adquisición (marketing + ventas)
            </Label>
            <Input id={spendId} type="number" inputMode="decimal" min={0} step="any" value={spend} onChange={(e) => setSpend(e.target.value)} disabled={!canEdit || saving} aria-describedby={error ? errId : undefined} aria-invalid={error ? true : undefined} className="h-9 bg-white dark:bg-gray-900 dark:text-gray-100" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={marginId} className="text-xs text-gray-700 dark:text-gray-200">
              Margen bruto (%)
            </Label>
            <Input id={marginId} type="number" inputMode="decimal" min={0} max={100} step="any" value={margin} onChange={(e) => setMargin(e.target.value)} disabled={!canEdit || saving} aria-describedby={error ? errId : undefined} aria-invalid={error ? true : undefined} className="h-9 bg-white dark:bg-gray-900 dark:text-gray-100" />
          </div>
          {error && (
            <p id={errId} role="alert" className="text-xs text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
          {canEdit ? (
            <Button type="submit" size="sm" className="bg-blue-600 text-white hover:bg-blue-700" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar insumos'}
            </Button>
          ) : (
            <p className="text-xs text-gray-600 dark:text-gray-300">Solo un administrador de la organización puede cambiar estos insumos.</p>
          )}
          {inputs.updated_at && <p className="text-[11px] text-gray-500 dark:text-gray-400">Última actualización: {formatDateTime(inputs.updated_at)}</p>}
        </form>
      </section>
    </div>
  );
}
