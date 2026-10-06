'use client';

/**
 * POS › Reservas de mesas › Agenda (Figma 1801:169066, paso 3 «Llega al POS
 * en tiempo real»; celular 1811:146558):
 * - fila de filtros: sede (la del encabezado), día («Hoy · sáb 18 oct») e
 *   insignia «En vivo» mientras la suscripción en tiempo real está activa;
 * - 4 KPI: Por confirmar («llegó hace N min por la web»), Confirmadas,
 *   Sentadas y No se presentó;
 * - un bloque por turno de la sede («Almuerzo · 12:00 m. – 3:30 p. m.») con
 *   una tarjeta por reserva. Tocar una solicitud abre «Solicitud de reserva»;
 *   cualquier otra, su ficha.
 *
 * Los turnos salen de la configuración efectiva de la sede con la regla de la
 * base (`turnosDeFecha` ≙ `fn_restaurant_franjas`).
 */
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowUp, CalendarRange } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, KpiStrip, StatCard, StatusBadge } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { turnosDeFecha, type AjustesReservaDto } from '@/lib/services/restaurantBookingSettingsService';
import type { RestaurantReservation, ReservationStatus } from './reservasMesasService';
import { esSolicitudWeb, horaCorta, kpisAgenda, minutos, nombreCorto, nombreTurno, ordenarPorHora } from './reservasVista';

export interface OpcionSede {
  id: number;
  nombre: string;
}

export interface OpcionDia {
  /** `YYYY-MM-DD` (día calendario de la sede). */
  valor: string;
  /** «Hoy · sáb 18 oct». */
  etiqueta: string;
}

interface Props {
  reservations: readonly RestaurantReservation[];
  isLoading: boolean;
  /** `service_hours` efectivo de la sede (null: turnos por defecto). */
  serviceHours: AjustesReservaDto['service_hours'] | null;
  /** Día que se muestra (`YYYY-MM-DD`). */
  fecha: string;
  dias: readonly OpcionDia[];
  onFechaChange: (fecha: string) => void;
  sedes: readonly OpcionSede[];
  sedeId: number | null;
  onSedeChange: (id: number) => void;
  /** La suscripción en tiempo real está activa. */
  enVivo: boolean;
  ahora: Date;
  /** Reserva recién llegada (resaltada). */
  resaltada?: string | null;
  onAbrir: (reservation: RestaurantReservation) => void;
  onSolicitud: (reservation: RestaurantReservation) => void;
}

const BORDE: Record<ReservationStatus, string> = {
  pending: 'border-line-warning',
  confirmed: 'border-line-info',
  seated: 'border-line-success',
  completed: 'border-line',
  cancelled: 'border-line opacity-60',
  no_show: 'border-line-danger',
};

export function ReservasAgenda({
  reservations,
  isLoading,
  serviceHours,
  fecha,
  dias,
  onFechaChange,
  sedes,
  sedeId,
  onSedeChange,
  enVivo,
  ahora,
  resaltada,
  onAbrir,
  onSolicitud,
}: Props) {
  const t = useTranslations('posReservasMesas.agenda');
  const te = useTranslations('posReservasMesas.estados');

  const delDia = useMemo(() => ordenarPorHora(reservations.filter((r) => r.reservation_date === fecha)), [reservations, fecha]);
  const k = useMemo(() => kpisAgenda(delDia, ahora), [delDia, ahora]);

  const grupos = useMemo(() => {
    const turnos = turnosDeFecha(serviceHours, fecha).map((x) => ({ desde: x.from, hasta: x.to, filas: [] as RestaurantReservation[] }));
    const fuera: RestaurantReservation[] = [];
    for (const r of delDia.filter((x) => x.status !== 'cancelled')) {
      const m = minutos(r.reservation_time);
      const g = turnos.find((x) => m >= minutos(x.desde) && m < minutos(x.hasta));
      if (g) g.filas.push(r);
      else fuera.push(r);
    }
    return { turnos, fuera };
  }, [delDia, serviceHours, fecha]);

  return (
    <div className="space-y-4">
      {/* Filtros: sede · día · en vivo (en el celular, en una sola fila: Figma 1811:146442) */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-wrap sm:gap-3">
        {sedes.length > 0 && (
          <Select value={sedeId != null ? String(sedeId) : undefined} onValueChange={(v) => onSedeChange(Number(v))}>
            <SelectTrigger aria-label={t('sede')} className="h-10 w-full border-line-strong bg-surface sm:w-[200px]">
              <SelectValue placeholder={t('elegirSede')} />
            </SelectTrigger>
            <SelectContent>
              {sedes.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={fecha} onValueChange={onFechaChange}>
          <SelectTrigger aria-label={t('dia')} className="h-10 w-full border-line-strong bg-surface sm:w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dias.map((d) => (
              <SelectItem key={d.valor} value={d.valor}>
                {d.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {enVivo && <StatusBadge estado="activo" tono="exito" etiqueta={t('enVivo')} />}
      </div>

      {/* KPI (el celular no los muestra: el contador de la pestaña ya dice cuántas faltan por confirmar) */}
      <div className="max-sm:hidden">
        <KpiStrip columnas={4} etiqueta={t('resumen')}>
          <StatCard
            tamano="sm"
            etiqueta={t('kpi.porConfirmar')}
            valor={k.porConfirmar}
            cargando={isLoading}
            tono={k.porConfirmar > 0 ? 'advertencia' : 'neutro'}
            iconoDetalle={k.porConfirmar > 0 ? AlertTriangle : undefined}
            detalle={
              k.porConfirmar === 0
                ? t('kpi.alDia')
                : k.ultimaWebHaceMin != null
                  ? t('kpi.llegoHace', { min: k.ultimaWebHaceMin })
                  : t('kpi.esperanConfirmacion')
            }
          />
          <StatCard
            tamano="sm"
            etiqueta={t('kpi.confirmadas')}
            valor={k.confirmadas}
            cargando={isLoading}
            detalle={t('kpi.personas', { n: k.personasConfirmadas })}
          />
          <StatCard
            tamano="sm"
            etiqueta={t('kpi.sentadas')}
            valor={k.sentadas}
            cargando={isLoading}
            tono={k.sentadas > 0 ? 'exito' : 'neutro'}
            iconoDetalle={k.sentadas > 0 ? ArrowUp : undefined}
            detalle={t('kpi.personas', { n: k.personasSentadas })}
          />
          <StatCard tamano="sm" etiqueta={t('kpi.noShow')} valor={k.noShow} cargando={isLoading} detalle={t('kpi.delDia')} />
        </KpiStrip>
      </div>

      {/* Turnos */}
      {isLoading ? (
        <div className="space-y-4" aria-busy="true">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-3 rounded-xl border border-line bg-surface p-4">
              <Skeleton className="h-4 w-56" />
              <div className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,236px))]">
                {[1, 2, 3].map((j) => (
                  <Skeleton key={j} className="h-[86px] rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : delDia.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="empty" icono={CalendarRange} titulo={t('vacioTitulo')} descripcion={t('vacioDescripcion')} />
        </div>
      ) : (
        <div className="space-y-4">
          {grupos.turnos.map((g) => (
            <section
              key={`${g.desde}-${g.hasta}`}
              className="rounded-xl border border-line bg-surface p-4 max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0"
              aria-label={t(`turnos.${nombreTurno(g.desde)}`)}
            >
              <h3 className="mb-3 text-[13px] font-medium leading-[18px] text-fg">
                {t('turnoTitulo', { nombre: t(`turnos.${nombreTurno(g.desde)}`), desde: horaCorta(g.desde), hasta: horaCorta(g.hasta) })}
              </h3>
              {g.filas.length === 0 ? (
                <p className="text-sm text-fg-muted">{t('sinReservas')}</p>
              ) : (
                <Tarjetas filas={g.filas} resaltada={resaltada} onAbrir={onAbrir} onSolicitud={onSolicitud} te={te} t={t} />
              )}
            </section>
          ))}
          {grupos.fuera.length > 0 && (
            <section
              className="rounded-xl border border-line bg-surface p-4 max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0"
              aria-label={t('fueraDeTurno')}
            >
              <h3 className="mb-3 text-[13px] font-medium leading-[18px] text-fg">{t('fueraDeTurno')}</h3>
              <Tarjetas filas={grupos.fuera} resaltada={resaltada} onAbrir={onAbrir} onSolicitud={onSolicitud} te={te} t={t} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

type T = ReturnType<typeof useTranslations>;

function Tarjetas({
  filas,
  resaltada,
  onAbrir,
  onSolicitud,
  te,
  t,
}: {
  filas: readonly RestaurantReservation[];
  resaltada?: string | null;
  onAbrir: (r: RestaurantReservation) => void;
  onSolicitud: (r: RestaurantReservation) => void;
  te: T;
  t: T;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,236px))]">
      {filas.map((r) => (
        <li key={r.id}>
          <ReservaTarjeta
            r={r}
            resaltada={resaltada === r.id || esSolicitudWeb(r)}
            onClick={() => (r.status === 'pending' ? onSolicitud(r) : onAbrir(r))}
            te={te}
            t={t}
          />
        </li>
      ))}
    </ul>
  );
}

/** Tarjeta de la agenda (escritorio y celular): hora, estado, «Laura M. · 4 personas» y mesa. */
export function ReservaTarjeta({ r, resaltada, onClick, te, t }: { r: RestaurantReservation; resaltada?: boolean; onClick: () => void; te: T; t: T }) {
  const mesa = r.restaurant_table
    ? [r.restaurant_table.name, r.restaurant_table.zone, r.status === 'completed' ? null : t('minutos', { n: r.duration_minutes || 90 })]
        .filter(Boolean)
        .join(' · ')
    : [t('sinMesa'), r.source === 'website' ? t('web') : null].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      id={`reserva-${r.id}`}
      onClick={onClick}
      className={cn(
        'flex w-full flex-col gap-1 rounded-lg border bg-surface p-3 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        resaltada ? 'border-2 border-brand' : BORDE[r.status],
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-medium leading-5 text-fg">{horaCorta(r.reservation_time)}</span>
        <StatusBadge estado={r.status} etiqueta={te(r.status)} tono={TONO_INSIGNIA[r.status]} />
      </span>
      <span className="truncate text-[13px] leading-[18px] text-fg-secondary">
        {t('clientePersonas', { nombre: nombreCorto(r.customer_name), n: r.party_size })}
      </span>
      <span className="truncate text-xs leading-4 text-fg-muted">{mesa}</span>
    </button>
  );
}

const TONO_INSIGNIA = {
  pending: 'advertencia',
  confirmed: 'informacion',
  seated: 'exito',
  completed: 'neutro',
  cancelled: 'neutro',
  no_show: 'peligro',
} as const;
