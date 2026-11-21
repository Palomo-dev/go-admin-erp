'use client';

/**
 * «Pagar comisiones de …» (Figma 1012:89017): resumen de lo que se paga, de
 * dónde sale el dinero y la referencia. El pago lo hace la ruta de siempre
 * (`/api/crm/commissions/bulk-pay`, vía `useComisiones.payMany`): cada comisión
 * valida que siga pendiente y el asiento lo genera `fn_auto_journal_commission`.
 *
 * La fecha del pago es la de hoy: la ruta no admite otra (paid_at = ahora).
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BadgePercent } from 'lucide-react';
import { AvisoTonal, Dialogo, FilaDato, FormField, ListaDatos } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import type { MoneyAccountOption } from '@/lib/services/crm/commissionAdminService';
import { CuentaPagoComision } from './CuentaPagoComision';
import { totalesPorMoneda, type CuentaPagoValor, type FilaAgrupable } from './comisionesModel';

interface Props {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** Comisiones pendientes que se van a pagar (instantánea al abrir). */
  filas: readonly (FilaAgrupable & { accrued_at?: string | null })[];
  /** Vendedor, o null si son de varios. */
  vendedor: string | null;
  monedaBase: string | null;
  cuentas: MoneyAccountOption[];
  ocupado: boolean;
  onConfirmar: (cuenta: CuentaPagoValor, referencia: string) => Promise<void>;
}

export function PagarComisionesDialog({ abierto, onAbiertoChange, filas, vendedor, monedaBase, cuentas, ocupado, onConfirmar }: Props) {
  const t = useTranslations('finanzasComisiones.pagar');
  const { paraDocumento } = useMonedaOrganizacion();
  const { getToday } = useFormatDate();
  const [cuenta, setCuenta] = useState<CuentaPagoValor>('rule');
  const [referencia, setReferencia] = useState('');

  useEffect(() => {
    if (abierto) {
      setCuenta('rule');
      setReferencia('');
    }
  }, [abierto]);

  const fmt = (valor: number, moneda: string | null) => formatMoneda(valor, paraDocumento(moneda ?? monedaBase));
  const totales = totalesPorMoneda(filas, monedaBase);
  const vendedores = new Set(filas.map((f) => f.payee_id ?? f.payee_name ?? '')).size;
  const unaMoneda = totales.length === 1;
  const total = unaMoneda ? fmt(totales[0].comision, totales[0].moneda) : null;
  const hoy = getToday();

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !ocupado && onAbiertoChange(v)}
      titulo={vendedor ? t('titulo', { nombre: vendedor }) : t('tituloVarios', { count: vendedores })}
      descripcion={t('subtitulo', { count: filas.length })}
      icono={BadgePercent}
      ancho={560}
      primario={{
        etiqueta: total ? t('confirmarTotal', { total }) : t('confirmar'),
        onClick: () => void onConfirmar(cuenta, referencia),
        cargando: ocupado,
        deshabilitada: filas.length === 0,
        motivo: filas.length === 0 ? t('nadaPendiente') : undefined,
      }}
    >
      <div className="flex flex-col gap-4">
        <ListaDatos>
          {totales.map((m) => (
            <FilaDato key={`base-${m.moneda}`} etiqueta={totales.length > 1 ? t('baseMoneda', { moneda: m.moneda ?? '' }) : t('base')} valor={fmt(m.base, m.moneda)} />
          ))}
          {totales.map((m) => (
            <FilaDato
              key={`com-${m.moneda}`}
              etiqueta={totales.length > 1 ? t('totalMoneda', { moneda: m.moneda ?? '' }) : t('total')}
              valor={fmt(m.comision, m.moneda)}
              tamano="lg"
            />
          ))}
        </ListaDatos>
        {!unaMoneda && totales.length > 1 && <AvisoTonal tono="informacion" compacto titulo={t('variasMonedas')} />}

        <CuentaPagoComision value={cuenta} onChange={setCuenta} accounts={cuentas} disabled={ocupado} />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('fecha')} ayuda={t('fechaAyuda')}>
            {(c) => (
              <p id={c.id} className="flex h-10 items-center rounded-lg border border-line bg-subtle px-3 text-sm text-fg">
                {formatPlainDate(hoy, { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            )}
          </FormField>
          <FormField etiqueta={t('referencia')}>
            {(c) => (
              <Input {...c} value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={120} placeholder={t('referenciaEjemplo')} className="h-10" disabled={ocupado} />
            )}
          </FormField>
        </div>

        <AvisoTonal tono="neutro" compacto titulo={t('asiento')} />
      </div>
    </Dialogo>
  );
}
