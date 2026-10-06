'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, RowActionsMenu, type AccionFila } from '@/components/kit';
import {
  Users,
  Clock,
  Phone,
  Mail,
  MapPin,
  Edit,
  Trash2,
  CheckCircle,
  UserCheck,
  XCircle,
  AlertTriangle,
  CalendarRange,
  Receipt,
  BellRing,
} from 'lucide-react';
import {
  RESERVATION_STATUS_LABELS,
  RESERVATION_SOURCE_LABELS,
  type RestaurantReservation,
  type ReservationStatus,
  type VentaDeReserva,
} from './reservasMesasService';
import { debeAvisarRetraso, enlaceTelefono, minutosDeRetraso, MINUTOS_TOLERANCIA_LLEGADA } from './retrasoReserva';

interface ReservasListProps {
  reservations: RestaurantReservation[];
  isLoading: boolean;
  onEdit: (reservation: RestaurantReservation) => void;
  onChangeStatus: (id: string, status: ReservationStatus, reason?: string) => void;
  onDelete: (id: string) => void;
  /** Sentar con mesa: abre la cuenta y vincula la reserva (pos_reserva_sentar). */
  onSentar?: (reservation: RestaurantReservation) => void;
  /** Venta de la mesa de cada reserva sentada o completada. */
  ventas?: ReadonlyMap<string, VentaDeReserva>;
  /** Inasistencias previas de cada cliente (por customer_id). */
  inasistencias?: ReadonlyMap<string, number>;
  /** «Ahora» de la pantalla (avanza cada minuto) y zona de cada sucursal. */
  ahora?: Date;
  zonaDe?: (branchId: number) => string;
  /** Reserva a resaltar (enlace de la notificación: ?reserva=<id>). */
  resaltada?: string | null;
  /** Pendiente: «Confirmar y asignar mesa» y «Rechazar» (Figma 1801:169066, paso 4). */
  onConfirmarPendiente?: (reservation: RestaurantReservation) => void;
  onRechazar?: (reservation: RestaurantReservation) => void;
  /** «Esperar 15 min»: persiste `arrival_wait_until` (D5); devuelve null si aún no hay columna. */
  onEsperar?: (reservation: RestaurantReservation, minutos: number) => Promise<string | null>;
}

function getStatusBadgeClasses(status: ReservationStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'confirmed':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'seated':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300';
    case 'completed':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'cancelled':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'no_show':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
}

function formatTime(time: string): string {
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

export function ReservasList({
  reservations,
  isLoading,
  onEdit,
  onChangeStatus,
  onDelete,
  onSentar,
  ventas,
  inasistencias,
  ahora,
  zonaDe,
  resaltada,
  onConfirmarPendiente,
  onRechazar,
  onEsperar,
}: ReservasListProps) {
  const t = useTranslations('posReservasMesas');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // «Esperar 15 min»: se guarda en la reserva (`arrival_wait_until`, D5) y lo ven
  // todos los puestos; antes de D5 solo queda en esta pantalla.
  const [pospuestasLocales, setPospuestasLocales] = useState<Record<string, number>>({});
  const pospuestaDe = (r: RestaurantReservation): number | null => {
    const guardada = r.arrival_wait_until ? Date.parse(r.arrival_wait_until) : NaN;
    const local = pospuestasLocales[r.id];
    if (Number.isFinite(guardada)) return Math.max(guardada, local ?? 0);
    return local ?? null;
  };
  const esperar = async (r: RestaurantReservation) => {
    const local = Date.now() + MINUTOS_TOLERANCIA_LLEGADA * 60_000;
    setPospuestasLocales((p) => ({ ...p, [r.id]: local }));
    if (onEsperar) {
      try {
        await onEsperar(r, MINUTOS_TOLERANCIA_LLEGADA);
      } catch {
        /* el aviso ya quedó pospuesto en esta pantalla; la página muestra el error */
      }
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (reservations.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState variante="empty" icono={CalendarRange} titulo={t('vacio.titulo')} descripcion={t('vacio.descripcion')} />
      </div>
    );
  }

  // Menú ⋯ de cada reserva: mismas acciones y condiciones que el DropdownMenu anterior.
  const accionesDe = (r: RestaurantReservation): AccionFila[] => {
    const abierta = !['completed', 'cancelled', 'no_show'].includes(r.status);
    const cambiosDeEstado: AccionFila[] = [
      {
        id: 'confirmar',
        etiqueta: t('acciones.confirmar'),
        icono: CheckCircle,
        onSelect: () => (onConfirmarPendiente ? onConfirmarPendiente(r) : onChangeStatus(r.id, 'confirmed')),
        oculta: r.status !== 'pending',
      },
      {
        id: 'sentar',
        etiqueta: t('acciones.sentar'),
        icono: UserCheck,
        // Con mesa: abre la cuenta y deja la reserva unida a ella hasta «Completada».
        onSelect: () => (onSentar && r.restaurant_table_id ? onSentar(r) : onChangeStatus(r.id, 'seated')),
        oculta: !['pending', 'confirmed'].includes(r.status),
      },
      {
        id: 'completar',
        etiqueta: t('acciones.completar'),
        icono: CheckCircle,
        onSelect: () => onChangeStatus(r.id, 'completed'),
        oculta: r.status !== 'seated',
      },
      {
        id: 'cancelar',
        etiqueta: t('acciones.cancelar'),
        icono: XCircle,
        onSelect: () => onChangeStatus(r.id, 'cancelled'),
        oculta: !abierta,
      },
      {
        id: 'noShow',
        etiqueta: t('acciones.noShow'),
        icono: AlertTriangle,
        onSelect: () => onChangeStatus(r.id, 'no_show'),
        oculta: !abierta,
      },
    ].filter((a) => !a.oculta);
    // Divisor entre «Editar» y los cambios de estado, como antes.
    if (cambiosDeEstado.length) cambiosDeEstado[0] = { ...cambiosDeEstado[0], separadorAntes: true };
    return [
      { id: 'editar', etiqueta: t('acciones.editar'), icono: Edit, onSelect: () => onEdit(r) },
      ...cambiosDeEstado,
      {
        id: 'eliminar',
        etiqueta: t('acciones.eliminar'),
        icono: Trash2,
        onSelect: () => setDeleteId(r.id),
        destructiva: true,
      },
    ];
  };

  return (
    <>
      <div className="space-y-3">
        {reservations.map((r) => {
          const zona = zonaDe ? zonaDe(r.branch_id) : null;
          const tarde = !!(ahora && zona && debeAvisarRetraso(r, ahora, zona, pospuestaDe(r)));
          const venta = ventas?.get(r.id);
          const faltas = r.customer_id ? inasistencias?.get(r.customer_id) ?? 0 : 0;
          const tel = enlaceTelefono(r.customer_phone);
          return (
          <Card
            key={r.id}
            id={`reserva-${r.id}`}
            className={`bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors ${
              resaltada === r.id ? 'ring-2 ring-brand' : ''
            }`}
          >
            <div className="p-4">
              <div className="flex items-start justify-between gap-4">
                {/* Info principal */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-white break-words whitespace-normal">
                      {r.customer_name}
                    </span>
                    <Badge className={getStatusBadgeClasses(r.status)}>
                      {RESERVATION_STATUS_LABELS[r.status]}
                    </Badge>
                    <Badge variant="outline" className="text-xs border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400">
                      {RESERVATION_SOURCE_LABELS[r.source]}
                    </Badge>
                    {venta && (
                      <Badge variant="outline" className="text-xs">
                        <Receipt className="mr-1 h-3 w-3" aria-hidden="true" />
                        {venta.numero ? t('venta', { numero: venta.numero }) : t('ventaSinNumero')}
                      </Badge>
                    )}
                    {faltas > 0 && (
                      <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 text-xs">
                        {t('inasistencias', { n: faltas })}
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDate(r.reservation_date)} · {formatTime(r.reservation_time)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {r.party_size} {r.party_size === 1 ? 'persona' : 'personas'}
                    </span>
                    {r.restaurant_table && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {r.restaurant_table.name}
                        {r.restaurant_table.zone && ` (${r.restaurant_table.zone})`}
                      </span>
                    )}
                    {r.customer_phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" />
                        {r.customer_phone}
                      </span>
                    )}
                    {r.customer_email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5" />
                        {r.customer_email}
                      </span>
                    )}
                  </div>

                  {(r.notes || r.special_requests) && (
                    <p className="text-xs text-gray-500 dark:text-gray-500 italic break-words whitespace-normal">
                      {r.special_requests || r.notes}
                    </p>
                  )}

                  {r.status === 'pending' && (onConfirmarPendiente || onRechazar) && (
                    <div className="flex flex-col gap-2 rounded-lg border border-line-warning bg-warning-subtle p-3 text-sm text-warning-text sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-medium">
                        {r.restaurant_table ? t('pendiente.avisoConMesa', { mesa: r.restaurant_table.name }) : t('pendiente.avisoSinMesa')}
                      </span>
                      <span className="flex flex-wrap gap-2">
                        {onConfirmarPendiente && (
                          <Button size="sm" onClick={() => onConfirmarPendiente(r)}>
                            <CheckCircle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                            {t('pendiente.confirmarYAsignar')}
                          </Button>
                        )}
                        {onRechazar && (
                          <Button size="sm" variant="outline" onClick={() => onRechazar(r)}>
                            {t('pendiente.rechazar')}
                          </Button>
                        )}
                      </span>
                    </div>
                  )}

                  {tarde && ahora && zona && (
                    <div role="alert" className="flex flex-col gap-2 rounded-lg border border-line-warning bg-warning-subtle p-3 text-sm text-warning-text sm:flex-row sm:items-center sm:justify-between">
                      <span className="flex items-center gap-2 font-medium">
                        <BellRing className="h-4 w-4" aria-hidden="true" />
                        {t('retraso.titulo', { minutos: minutosDeRetraso(r, ahora, zona) })}
                      </span>
                      <span className="flex flex-wrap gap-2">
                        {tel && (
                          <Button asChild size="sm" variant="outline">
                            <a href={tel}>
                              <Phone className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                              {t('retraso.llamar')}
                            </a>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void esperar(r)}
                        >
                          {t('retraso.esperar', { minutos: MINUTOS_TOLERANCIA_LLEGADA })}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => onChangeStatus(r.id, 'no_show')}>
                          {t('retraso.noSePresento')}
                        </Button>
                      </span>
                    </div>
                  )}
                </div>

                {/* Acciones */}
                <RowActionsMenu orientacion="vertical" tamano="sm" titulo={r.customer_name} acciones={accionesDe(r)} />
              </div>
            </div>
          </Card>
          );
        })}
      </div>

      {/* Confirmación de eliminación */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title={t('eliminar.titulo')}
        description={t('eliminar.descripcion')}
        confirmLabel={t('eliminar.confirmar')}
        cancelLabel={t('eliminar.cancelar')}
        variant="destructive"
        onConfirm={() => {
          if (deleteId) onDelete(deleteId);
          setDeleteId(null);
        }}
      />
    </>
  );
}
