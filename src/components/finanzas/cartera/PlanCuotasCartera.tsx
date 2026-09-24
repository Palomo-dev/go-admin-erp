'use client';

/**
 * Plan de cuotas de una cuenta (Figma X1 `740:49675`, X1b `740:51002`): número,
 * vencimiento (columna `date`: `formatPlain`), valor, pagado, saldo y estado,
 * con «Pagar cuota» en las pendientes. El pago va por el diálogo único
 * (`fn_registrar_pago` con `cuota_id`): esta tabla no escribe nada.
 */
import { useTranslations } from 'next-intl';
import { CircleDollarSign } from 'lucide-react';
import { StatusBadge, clasesBoton } from '@/components/kit';
import type { CuotaCartera } from '@/lib/finanzas/cartera/contratoCartera';

export interface PlanCuotasCarteraProps {
  cuotas: readonly CuotaCartera[];
  formatear: (v: number) => string;
  formatearDia: (dia: string | null | undefined) => string;
  onPagar?: (cuota: CuotaCartera) => void;
}

export function PlanCuotasCartera({ cuotas, formatear, formatearDia, onPagar }: PlanCuotasCarteraProps) {
  const t = useTranslations('cartera.cuotas');
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <caption className="sr-only">{t('titulo')}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-fg-secondary">
            <th scope="col" className="px-4 py-2 font-medium">#</th>
            <th scope="col" className="px-4 py-2 font-medium">{t('vence')}</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">{t('valor')}</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">{t('pagado')}</th>
            <th scope="col" className="px-4 py-2 text-right font-medium">{t('saldo')}</th>
            <th scope="col" className="px-4 py-2 font-medium">{t('estado')}</th>
            <th scope="col" className="px-4 py-2">
              <span className="sr-only">{t('acciones')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {cuotas.map((q) => {
            const pendiente = q.estado !== 'paid' && q.estado !== 'written_off' && q.saldo > 0;
            return (
              <tr key={q.id} className="border-b border-line last:border-b-0">
                <td className="px-4 py-2.5 tabular-nums text-fg-secondary">{q.numero}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">{formatearDia(q.vencimiento)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatear(q.monto)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-fg-secondary">{formatear(q.pagado)}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatear(q.saldo)}</td>
                <td className="px-4 py-2.5">
                  {q.estado === 'overdue' && q.dias > 0 ? (
                    <StatusBadge estado="overdue" etiqueta={t('vencidaDias', { dias: q.dias })} />
                  ) : (
                    <StatusBadge estado={q.estado} />
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {pendiente && onPagar && (
                    <button
                      type="button"
                      onClick={() => onPagar(q)}
                      aria-label={t('pagarCuotaN', { numero: q.numero })}
                      className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                    >
                      <CircleDollarSign aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      {t('pagar')}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
