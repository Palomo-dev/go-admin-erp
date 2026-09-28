'use client';

/**
 * Selector «¿De dónde sale el dinero?» dentro de la confirmación de pago de
 * comisiones. No decide nada: traduce la elección al cuerpo que esperan las
 * rutas de pago (`payment_method` / `bank_account_id`). El asiento del pago
 * acredita esa cuenta (fn_auto_journal_commission); «Según la regla contable»
 * conserva el comportamiento anterior.
 */

import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
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
    <div className="space-y-1.5">
      <Label htmlFor="comision-cuenta-pago" className="text-sm text-gray-700 dark:text-gray-300">
        {t('cuentaLabel')}
      </Label>
      <Select value={value} onValueChange={(v) => onChange(v as CuentaPagoValor)} disabled={disabled}>
        <SelectTrigger id="comision-cuenta-pago" className="h-9">
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
      <p className="text-xs text-gray-500 dark:text-gray-400">{t('cuentaAyuda')}</p>
    </div>
  );
}
