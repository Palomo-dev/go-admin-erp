'use client';

/**
 * POS › Reservas de mesa › Agenda (Figma 1801:169066, paso 3): las reservas del
 * rango agrupadas por día y por turno de la sede («Almuerzo · 12:00 – 15:00»),
 * con la pendiente resaltada y sus acciones «Confirmar y asignar mesa» y
 * «Rechazar». Los turnos salen de la configuración efectiva de la sede con la
 * misma regla que la base (`turnosDeFecha` ≙ `fn_restaurant_franjas`).
 */
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarRange, CheckCircle, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { minutosDeHora, turnosDeFecha, type AjustesReservaDto } from '@/lib/services/restaurantBookingSettingsService';
import {
  RESERVATION_STATUS_LABELS,
  type RestaurantReservation,
  type ReservationStatus,
  type VentaDeReserva,
} from './reservasMesasService';

interface Props {
  reservations: readonly RestaurantReservation[];
  isLoading: boolean;
  /** `service_hours` efectivo de la sede (null: turnos por defecto). */
  serviceHours: AjustesReservaDto['service_hours'] | null;
  ventas?: ReadonlyMap<string, VentaDeReserva>;
  onAbrir: (reservation: RestaurantReservation) => void;
  onConfirmarPendiente: (reservation: RestaurantReservation) => void;
  onRechazar: (reservation: RestaurantReservation) => void;
}

const CLASE_ESTADO: Record<ReservationStatus, string> = {
  pending: 'border-line-warning bg-warning-subtle',
  confirmed: 'border-line bg-surface',
  seated: 'border-line-success bg-success-subtle',
  completed: 'border-line bg-canvas',
  cancelled: 'border-line bg-canvas opacity-60',
  no_show: 'border-line bg-canvas opacity-60',
};

interface Grupo {
  clave: string;
  desde: string | null;
  hasta: string | null;
  reservas: RestaurantReservation[];
}

/** Agrupa las reservas de un día en sus turnos; las que no caen en ninguno, al final. */
export function agruparPorTurno(
  reservas: readonly RestaurantReservation[],
  serviceHours: AjustesReservaDto['service_hours'] | null,
  fecha: string,
): Grupo[] {
  const turnos = turnosDeFecha(serviceHours, fecha);
  const grupos: Grupo[] = turnos.map((t) => ({ clave: `${t.from}-${t.to}`, desde: t.from, hasta: t.to, reservas: [] }));
  const fuera: Grupo = { clave: 'fuera', desde: null, hasta: null, reservas: [] };
  const ordenadas = [...reservas].sort((a, b) => a.reservation_time.localeCompare(b.reservation_time));
  for (const r of ordenadas) {
    const min = minutosDeHora(r.reservation_time.slice(0, 5));
    const g = grupos.find((x) => min >= minutosDeHora(x.desde as string) && min < minutosDeHora(x.hasta as string));
    (g ?? fuera).reservas.push(r);
  }
  return [...grupos, ...(fuera.reservas.length ? [fuera] : [])];
}

export function ReservasAgenda({ reservations, isLoading, serviceHours, ventas, onAbrir, onConfirmarPendiente, onRechazar }: Props) {
  const t = useTranslations('posReservasMesas.agenda');
  const tr = useTranslations('posReservasMesas');
  const { formatPlain: formatPlainDate } = useFormatDate();

  const dias = useMemo(() => {
    const porDia = new Map<string, RestaurantReservation[]>();
    for (const r of reservations) {
      const lista = porDia.get(r.reservation_date) ?? [];
      lista.push(r);
      porDia.set(r.reservation_date, lista);
    }
    return Array.from(porDia.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [reservations]);

  if (isLoading) {
    return (
      <div className="space-y-3" aria-hidden="true">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (dias.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState variante="empty" icono={CalendarRange} titulo={tr('vacio.titulo')} descripcion={tr('vacio.descripcion')} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {dias.map(([fecha, delDia]) => (
        <section key={fecha} aria-label={formatPlainDate(fecha)} className="space-y-3">
          {dias.length > 1 && <h3 className="text-sm font-semibold text-fg">{formatPlainDate(fecha)}</h3>}
          {agruparPorTurno(delDia, serviceHours, fecha).map((g) => (
            <div key={g.clave} className="rounded-xl border border-line bg-surface p-4">
              <p className="mb-3 text-sm font-medium text-fg-secondary">
                {g.desde ? t('turno', { desde: g.desde, hasta: g.hasta as string }) : t('fueraDeTurno')}
                {' · '}
                {t('nReservas', { n: g.reservas.length })}
              </p>
              {g.reservas.length === 0 ? (
                <p className="text-sm text-fg-muted">{t('sinReservas')}</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {g.reservas.map((r) => {
                    const venta = ventas?.get(r.id);
                    return (
                      <li key={r.id} className={`rounded-lg border p-3 ${CLASE_ESTADO[r.status]}`}>
                        <button type="button" className="w-full text-left" onClick={() => onAbrir(r)}>
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-fg">{r.reservation_time.slice(0, 5)}</span>
                            <Badge variant="outline" className="text-xs">
                              {RESERVATION_STATUS_LABELS[r.status]}
                            </Badge>
                          </span>
                          <span className="mt-1 block break-words text-sm text-fg">
                            {t('cliente', { nombre: r.customer_name, n: r.party_size })}
                          </span>
                          <span className="block text-xs text-fg-secondary">
                            {r.restaurant_table
                              ? t('mesa', { mesa: r.restaurant_table.name, zona: r.restaurant_table.zone ?? '—' })
                              : t('sinMesa')}
                          </span>
                          {venta && (
                            <span className="mt-1 flex items-center gap-1 text-xs text-fg-secondary">
                              <Receipt className="h-3 w-3" aria-hidden="true" />
                              {venta.numero ? tr('venta', { numero: venta.numero }) : tr('ventaSinNumero')}
                            </span>
                          )}
                        </button>
                        {r.status === 'pending' && (
                          <span className="mt-2 flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => onConfirmarPendiente(r)}>
                              <CheckCircle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                              {tr('pendiente.confirmarYAsignar')}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => onRechazar(r)}>
                              {tr('pendiente.rechazar')}
                            </Button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
