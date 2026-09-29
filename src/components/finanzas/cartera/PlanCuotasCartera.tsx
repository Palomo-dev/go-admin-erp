'use client';

/**
 * Plan de cuotas de una cuenta (Figma X1 `740:49675`, X1b `740:51002`: celdas
 * `740:50169`, estado `740:50110`, «Pagar cuota» `740:50138`): número,
 * vencimiento (columna `date`: `formatPlain`), valor, pagado, saldo y estado,
 * con «Pagar cuota» en las pendientes. El pago va por el diálogo único
 * (`fn_registrar_pago` con `cuota_id`): esta tabla no escribe nada.
 */
import { useTranslations } from 'next-intl';
import { CircleDollarSign } from 'lucide-react';
import { DataTable, StatusBadge, clasesBoton, type ColumnaTabla } from '@/components/kit';
import type { CuotaCartera } from '@/lib/finanzas/cartera/contratoCartera';

export interface PlanCuotasCarteraProps {
  cuotas: readonly CuotaCartera[];
  formatear: (v: number) => string;
  formatearDia: (dia: string | null | undefined) => string;
  onPagar?: (cuota: CuotaCartera) => void;
}

/** Va dentro de una `Tarjeta sinRelleno`: sin su propio marco, con la raya superior como separador. */
const TABLA_EN_TARJETA = '[&>div]:rounded-none [&>div]:border-x-0 [&>div]:border-b-0';

const pendiente = (q: CuotaCartera) => q.estado !== 'paid' && q.estado !== 'written_off' && q.saldo > 0;

export function PlanCuotasCartera({ cuotas, formatear, formatearDia, onPagar }: PlanCuotasCarteraProps) {
  const t = useTranslations('cartera.cuotas');

  const columnas: ColumnaTabla<CuotaCartera>[] = [
    { id: 'numero', encabezado: '#', ancho: 48, celda: (q) => <span className="tabular-nums text-fg-secondary">{q.numero}</span> },
    { id: 'vence', encabezado: t('vence'), celda: (q) => <span className="whitespace-nowrap">{formatearDia(q.vencimiento)}</span> },
    { id: 'valor', encabezado: t('valor'), variante: 'importe', celda: (q) => formatear(q.monto) },
    { id: 'pagado', encabezado: t('pagado'), variante: 'importe', ocultarDebajo: 'sm', celda: (q) => <span className="text-fg-secondary">{formatear(q.pagado)}</span> },
    { id: 'saldo', encabezado: t('saldo'), variante: 'importe', celda: (q) => <span className="font-medium">{formatear(q.saldo)}</span> },
    {
      id: 'estado',
      encabezado: t('estado'),
      celda: (q) =>
        q.estado === 'overdue' && q.dias > 0 ? <StatusBadge estado="overdue" etiqueta={t('vencidaDias', { dias: q.dias })} /> : <StatusBadge estado={q.estado} />,
    },
  ];

  return (
    <DataTable
      etiqueta={t('titulo')}
      densidad="compacta"
      className={TABLA_EN_TARJETA}
      columnas={columnas}
      filas={cuotas}
      obtenerId={(q) => q.id}
      accionesRapidas={
        onPagar
          ? (q) =>
              pendiente(q) ? (
                // Botón con texto (Figma 740:50138) y nombre accesible con el número de la cuota.
                <button
                  type="button"
                  onClick={() => onPagar(q)}
                  aria-label={t('pagarCuotaN', { numero: q.numero })}
                  className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                >
                  <CircleDollarSign aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('pagar')}
                </button>
              ) : null
          : undefined
      }
    />
  );
}
