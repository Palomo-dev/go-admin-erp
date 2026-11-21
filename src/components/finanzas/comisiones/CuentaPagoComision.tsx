'use client';

/**
 * Selector «¿De dónde sale el dinero?» del diálogo de pago de comisiones
 * (Figma 1012:89017, «Sale de»). No decide nada: traduce la elección al cuerpo
 * que esperan las rutas de pago (`payment_method` / `bank_account_id`). El
 * asiento del pago acredita esa cuenta (fn_auto_journal_commission); «Según la
 * regla contable» conserva el comportamiento anterior.
 */

import { useTranslations } from 'next-intl';
import { FormField } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { MoneyAccountOption } from '@/lib/services/crm/commissionAdminService';
import type { CuentaPagoValor } from './comisionesModel';

interface Props {
  value: CuentaPagoValor;
  onChange: (v: CuentaPagoValor) => void;
  accounts: MoneyAccountOption[];
  disabled?: boolean;
}

export function CuentaPagoComision({ value, onChange, accounts, disabled }: Props) {
  const t = useTranslations('comisionesPago');
  return (
    <FormField etiqueta={t('cuentaLabel')} obligatorio ayuda={t('cuentaAyuda')}>
      {(c) => (
        <Select value={value} onValueChange={(v) => onChange(v as CuentaPagoValor)} disabled={disabled}>
          <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="h-10 border-line-strong bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rule">{t('opcionRegla')}</SelectItem>
            <SelectItem value="cash">{t('opcionEfectivo')}</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={`bank:${a.id}`}>
                {[a.name, a.bank_name, a.last4 ? `··${a.last4}` : null, a.currency].filter(Boolean).join(' · ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}
