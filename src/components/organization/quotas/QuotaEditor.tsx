'use client';

/**
 * Editor de cuota del miembro (F13): periodo, tipo, meta y fecha del periodo;
 * la moneda es la de la organización. Cinco campos, errores junto al campo con
 * `aria-describedby` y foco al primer error (brief §3).
 */

import { useEffect, useId, useState } from 'react';
import { Target } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { describeError } from '@/lib/utils/errorMessage';
import { QUOTA_PERIODS, QUOTA_TYPES, periodBoundsFor, type QuotaInput, type QuotaPeriod, type QuotaType } from '@/lib/services/crm/quotaProgress';
import { defaultQuotaForm, formToPayload, validateQuotaForm, type QuotaFormError, type QuotaFormState } from './quotaForm';
import { useTextosCuota } from './useTextosCuota';
import { useTranslations } from 'next-intl';

interface Props {
  today: string;
  currency: string;
  busy: boolean;
  onCreate: (payload: QuotaInput) => Promise<unknown>;
  onCreated?: () => void;
}

const field = 'bg-white dark:bg-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600';

export function QuotaEditor({ today, currency, busy, onCreate, onCreated }: Props) {
  const tx = useTranslations('org.acceso.miembros');
  const tc = useTextosCuota();
  const id = useId();
  const [form, setForm] = useState<QuotaFormState>(() => defaultQuotaForm(today, currency));
  const [errors, setErrors] = useState<QuotaFormError[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [focusField, setFocusField] = useState<string | null>(null);

  useEffect(() => {
    setForm((f) => ({ ...f, anchor: f.anchor || today, target_currency: currency }));
  }, [today, currency]);

  useEffect(() => {
    if (!focusField) return;
    document.getElementById(`${id}-${focusField}`)?.focus();
    setFocusField(null);
  }, [focusField, id]);

  const update = (patch: Partial<QuotaFormState>) => {
    const next = { ...form, ...patch };
    setForm(next);
    if (errors.length) setErrors(validateQuotaForm(next));
  };

  const errorFor = (f: keyof QuotaFormState) => tc.error(errors.find((e) => e.field === f));
  const bounds = /^\d{4}-\d{2}-\d{2}$/.test(form.anchor) ? periodBoundsFor(form.period, form.anchor) : null;
  const isCount = form.target_type !== 'revenue';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateQuotaForm(form);
    setErrors(errs);
    setServerError(null);
    if (errs.length) {
      setFocusField(errs[0].field);
      return;
    }
    try {
      await onCreate(formToPayload(form));
      setForm(defaultQuotaForm(today, currency));
      onCreated?.();
    } catch (err) {
      setServerError(describeError(err));
    }
  };

  return (
    <form onSubmit={submit} noValidate aria-labelledby={`${id}-title`} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h3 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
        <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
        {tx('quotaEditor.nuevaCuota')}
      </h3>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${id}-period`} className="mb-1.5 block text-xs text-gray-700 dark:text-gray-300">{tx('quotaEditor.periodo')}</Label>
          <Select value={form.period} onValueChange={(v) => update({ period: v as QuotaPeriod })}>
            <SelectTrigger id={`${id}-period`} className={field}><SelectValue /></SelectTrigger>
            <SelectContent>
              {QUOTA_PERIODS.map((p) => <SelectItem key={p} value={p}>{tc.periodo(p)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor={`${id}-target_type`} className="mb-1.5 block text-xs text-gray-700 dark:text-gray-300">{tx('quotaEditor.tipoMeta')}</Label>
          <Select value={form.target_type} onValueChange={(v) => update({ target_type: v as QuotaType })}>
            <SelectTrigger id={`${id}-target_type`} className={field}><SelectValue /></SelectTrigger>
            <SelectContent>
              {QUOTA_TYPES.map((t) => <SelectItem key={t} value={t}>{tc.tipo(t)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor={`${id}-anchor`} className="mb-1.5 block text-xs text-gray-700 dark:text-gray-300">{tx('quotaEditor.diaPeriodo')}</Label>
          <Input
            id={`${id}-anchor`}
            type="date"
            value={form.anchor}
            onChange={(e) => update({ anchor: e.target.value })}
            aria-invalid={!!errorFor('anchor')}
            aria-describedby={errorFor('anchor') ? `${id}-anchor-error` : `${id}-anchor-hint`}
            className={field}
          />
          {errorFor('anchor') ? (
            <p id={`${id}-anchor-error`} role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">{errorFor('anchor')}</p>
          ) : (
            <p id={`${id}-anchor-hint`} className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {bounds ? `${tc.etiquetaPeriodo(form.period, bounds.period_start, bounds.period_end)} · ${bounds.period_start} → ${bounds.period_end}` : tx('quotaEditor.periodoCalculaPartirEsta')}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor={`${id}-target_amount`} className="mb-1.5 block text-xs text-gray-700 dark:text-gray-300">
            {tx('quotaEditor.meta')} {isCount ? tx('quotaEditor.cantidad') : `(${currency})`}
          </Label>
          <Input
            id={`${id}-target_amount`}
            inputMode={isCount ? 'numeric' : 'decimal'}
            placeholder={isCount ? '40' : '5.000.000'}
            value={form.target_amount}
            onChange={(e) => update({ target_amount: e.target.value })}
            aria-invalid={!!errorFor('target_amount')}
            aria-describedby={errorFor('target_amount') ? `${id}-target_amount-error` : undefined}
            className={field}
          />
          {errorFor('target_amount') && (
            <p id={`${id}-target_amount-error`} role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">{errorFor('target_amount')}</p>
          )}
        </div>
      </div>

      {serverError && (
        <Alert variant="destructive">
          <AlertTitle>{tx('quotaEditor.noGuardoCuota')}</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button type="submit" data-quota-submit="" disabled={busy} className="bg-blue-600 text-white hover:bg-blue-700">
          {busy ? tx('quotaEditor.guardando') : tx('quotaEditor.guardarCuota')}
        </Button>
      </div>
    </form>
  );
}
