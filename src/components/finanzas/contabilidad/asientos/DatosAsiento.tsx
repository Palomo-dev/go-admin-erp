'use client';

/**
 * «Datos del asiento» (Figma «asiento-compra-retenciones»): fecha contable,
 * sucursal, origen, moneda (y la tasa si no es la base), clave del hecho y
 * cuándo se creó. Las fechas pasan por la zona de la sucursal del asiento.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FilaDato, ListaDatos, Tarjeta } from '@/components/kit';
import { useFormatDateFor } from '@/lib/context/OrganizationTimezoneContext';
import { ContabilidadService, type JournalEntry } from '../ContabilidadService';

/** `journal_entries.source` con nombre; uno que no esté aquí se muestra tal cual. */
const ORIGENES = new Set([
  'manual',
  'reversal',
  'invoice_sales',
  'invoice_purchase',
  'sales',
  'payments',
  'stock_movements',
  'inventory_adjustment',
  'accounts_receivable',
  'accounts_payable',
  'purchase_orders',
  'cash_movements',
  'cash_sessions',
  'commissions',
  'credit_note',
]);

export function DatosAsiento({ asiento }: { asiento: JournalEntry }) {
  const t = useTranslations('asientoContable.datos');
  const { formatDate, formatDateTime } = useFormatDateFor(asiento.branch_id);
  const [sucursal, setSucursal] = useState<string | null>(null);

  useEffect(() => {
    if (!asiento.branch_id) return;
    let vigente = true;
    ContabilidadService.nombreSucursal(asiento.branch_id)
      .then((n) => vigente && setSucursal(n))
      .catch((e) => console.error('Error leyendo la sucursal del asiento:', e));
    return () => {
      vigente = false;
    };
  }, [asiento.branch_id]);

  const origen = asiento.source ?? 'manual';
  const moneda = asiento.currency_code ?? asiento.base_currency_code ?? null;
  const otraMoneda = !!asiento.currency_code && !!asiento.base_currency_code && asiento.currency_code !== asiento.base_currency_code;

  return (
    <Tarjeta titulo={t('titulo')}>
      <ListaDatos className="pb-3">
        <FilaDato etiqueta={t('fecha')} valor={formatDate(asiento.entry_date)} />
        <FilaDato etiqueta={t('sucursal')} valor={sucursal ?? '—'} />
        <FilaDato
          etiqueta={t('origen')}
          valor={ORIGENES.has(origen) ? t(`origenes.${origen}` as never) : origen}
          descripcion={asiento.source_id ? <span className="break-all">#{asiento.source_id}</span> : undefined}
        />
        {moneda && (
          <FilaDato
            etiqueta={t('moneda')}
            valor={moneda}
            descripcion={otraMoneda && asiento.exchange_rate ? t('tasa', { tasa: asiento.exchange_rate, base: asiento.base_currency_code ?? '' }) : undefined}
          />
        )}
        {asiento.fact_key && <FilaDato etiqueta={t('claveHecho')} valor={<span className="break-all font-mono text-xs">{asiento.fact_key}</span>} />}
        <FilaDato etiqueta={t('creado')} valor={formatDateTime(asiento.created_at)} />
      </ListaDatos>
    </Tarjeta>
  );
}
