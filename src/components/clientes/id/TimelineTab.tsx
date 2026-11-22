'use client';

/**
 * Pestaña «Actividad» de la ficha (Figma 06 Clientes 331:114345; móvil
 * 332:118462): ventas, reservas, actividades del CRM (del cliente y de sus
 * oportunidades) y pedidos web, agrupados por día («Hoy», «Ayer», fecha) en
 * la zona de la organización, cada uno como `TimelineEntry`.
 */

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { HtmlContentRenderer } from '@/components/shared/HtmlContentRenderer';
import { Activity, CalendarDays, Mail, MessageSquare, Phone, ShoppingBag, ShoppingCart, StickyNote, type LucideIcon } from 'lucide-react';
import { EmptyState, StatusBadge } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { addPlainDays, toPlainDate, todayInTz } from '@/lib/utils/dateDisplay';
import { EntradaHistorial, unirPartes } from './EntradaHistorial';
import { mensajeError, useFechasFicha } from './useFechasFicha';

// Interfaces para los elementos del timeline
// Los textos (título, descripción, estados) se arman al pintar, en el idioma activo.
interface TimelineItem {
  id: string;
  type: 'sale' | 'reservation' | 'activity' | 'web_order';
  date: Date;
  amount?: number;
  /** Número de venta o de pedido web. */
  referencia?: string;
  /** Notas de la reserva o de la actividad (pueden traer HTML). */
  notas?: string | null;
  /** Fin de la reserva (timestamptz). */
  fin?: string;
  tipoActividad?: string;
  oportunidad?: string;
  tipoEntrega?: string | null;
  originalStatus?: string;
  originalPaymentStatus?: string;
  // Campos para reservas enriquecidas
  checkin?: string;
  checkout?: string;
  spaces?: string[];
  spaceTypes?: string[];
  folioBalance?: number;
  folioItemsCount?: number;
  folioPendingItems?: number;
  folioPendingAmount?: number;
  reservationId?: string;
}

interface TimelineTabProps {
  clienteId: string;
  organizationId: number;
}

interface FolioLinea {
  id: string;
  reservation_id: string;
  balance: number | string | null;
  status: string;
}

interface ItemFolioLinea {
  id: string;
  folio_id: string;
  amount: number | string | null;
  payment_status: string;
}

interface ReservaLinea {
  id: string;
  start_date: string;
  end_date: string;
  checkin?: string;
  checkout?: string;
  status: string;
  notes?: string | null;
  reservation_spaces?: { spaces?: { label?: string; space_types?: { name?: string } | null } | null }[] | null;
}

interface ActividadLinea {
  id: string;
  activity_type: string;
  notes?: string | null;
  occurred_at: string;
  related_type: string;
  related_id: string;
}

// Formato de fecha y hora de la línea de tiempo (instantes: zona de la organización)
const FECHA_HORA: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

const DIA_MES_ANIO: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

export default function TimelineTab({ clienteId, organizationId }: TimelineTabProps) {
  const t = useTranslations('clientes.ficha');
  // Ventas, folios y cartera no traen moneda propia: la base de la organización.
  const { formatear } = useMonedaOrganizacion();
  const { instante, plana, cuando, timezone } = useFechasFicha();
  const [vuelta, setVuelta] = useState(0);
  const formatDate = (date: Date | string) => instante(date, FECHA_HORA);

  // Estados de pedidos web y de pagos; lo desconocido se muestra tal cual.
  const traducirEstadoWebOrder = (estado: string | null | undefined): string => {
    if (!estado) return t('actividad.noAplica');
    const clave = estado.toLowerCase();
    return t.has(`actividad.estadosPedido.${clave}`) ? t(`actividad.estadosPedido.${clave}`) : estado;
  };
  const traducirEstadoPago = (estado: string | null | undefined): string => {
    if (!estado) return t('actividad.noAplica');
    const clave = estado.toLowerCase();
    return t.has(`actividad.estadosPago.${clave}`) ? t(`actividad.estadosPago.${clave}`) : estado;
  };

  const tituloDe = (item: TimelineItem): string => {
    switch (item.type) {
      case 'sale':
        return t('actividad.titulos.venta', { numero: item.referencia ?? '' });
      case 'reservation':
        return t('actividad.titulos.reserva', { fecha: formatDate(item.date) });
      case 'activity':
        return item.oportunidad
          ? t('actividad.titulos.actividadOportunidad', { tipo: item.tipoActividad ?? '', oportunidad: item.oportunidad })
          : t('actividad.titulos.actividad', { tipo: item.tipoActividad ?? '' });
      case 'web_order':
        return t('actividad.titulos.pedidoWeb', { numero: item.referencia ?? '' });
    }
  };

  const descripcionDe = (item: TimelineItem): string => {
    switch (item.type) {
      case 'sale':
        return t('actividad.descripcionVenta', {
          estado: traducirEstadoPago(item.originalStatus),
          pago: traducirEstadoPago(item.originalPaymentStatus),
        });
      case 'reservation':
        return item.notas || `${formatDate(item.date)} - ${formatDate(item.fin ?? '')}`;
      case 'activity':
        return item.notas || t('actividad.sinDetalles');
      case 'web_order':
        return `${traducirEstadoWebOrder(item.tipoEntrega)} | ${traducirEstadoWebOrder(item.originalStatus)}`;
    }
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ mensaje: string | null } | null>(null);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);

  useEffect(() => {
    const fetchTimelineData = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Obtener ventas del cliente
        const { data: salesData, error: salesError } = await supabase
          .from('sales')
          .select('id, total, sale_date, status, payment_status')
          .eq('customer_id', clienteId)
          .eq('organization_id', organizationId);

        if (salesError) throw salesError;

        // 2. Obtener reservas del cliente con espacios
        const { data: reservationsData, error: reservationsError } = await supabase
          .from('reservations')
          .select(`
            id, start_date, end_date, checkin, checkout, status, notes, total_estimated,
            reservation_spaces (
              space_id,
              spaces (
                label,
                space_types ( name )
              )
            )
          `)
          .eq('customer_id', clienteId)
          .eq('organization_id', organizationId);

        if (reservationsError) throw reservationsError;

        // 2b. Obtener folios de las reservas
        // PostgREST devuelve `spaces` como objeto (relación a uno); el tipo inferido lo pinta como arreglo.
        const reservas = (reservationsData ?? []) as unknown as ReservaLinea[];
        const reservationIds = reservas.map((r) => r.id);
        const foliosMap: Record<string, FolioLinea> = {};
        const folioItemsMap: Record<string, ItemFolioLinea[]> = {};

        if (reservationIds.length > 0) {
          const { data: foliosData } = await supabase
            .from('folios')
            .select('id, reservation_id, balance, status')
            .in('reservation_id', reservationIds);

          if (foliosData) {
            (foliosData as FolioLinea[]).forEach((f) => {
              foliosMap[f.reservation_id] = f;
            });

            const folioIds = (foliosData as FolioLinea[]).map((f) => f.id);
            if (folioIds.length > 0) {
              const { data: folioItemsData } = await supabase
                .from('folio_items')
                .select('id, folio_id, description, amount, payment_status, source')
                .in('folio_id', folioIds)
                .order('created_at', { ascending: false });

              if (folioItemsData) {
                (folioItemsData as ItemFolioLinea[]).forEach((item) => {
                  if (!folioItemsMap[item.folio_id]) {
                    folioItemsMap[item.folio_id] = [];
                  }
                  folioItemsMap[item.folio_id].push(item);
                });
              }
            }
          }
        }

        // 3. Obtener actividades relacionadas con el cliente
        const { data: activitiesData, error: activitiesError } = await supabase
          .from('activities')
          .select('id, activity_type, notes, occurred_at, related_type, related_id')
          .eq('related_id', clienteId)
          .eq('organization_id', organizationId);

        if (activitiesError) throw activitiesError;

        // 3b. Obtener IDs de oportunidades del cliente y sus actividades
        const { data: oppsData } = await supabase
          .from('opportunities')
          .select('id, name')
          .eq('customer_id', clienteId)
          .eq('organization_id', organizationId);

        const oppIds = (oppsData || []).map(o => o.id);
        const oppNameMap: Record<string, string> = {};
        (oppsData || []).forEach(o => { oppNameMap[o.id] = o.name; });

        let oppActivities: ActividadLinea[] = [];
        if (oppIds.length > 0) {
          const { data: oppActsData, error: oppActsError } = await supabase
            .from('activities')
            .select('id, activity_type, notes, occurred_at, related_type, related_id')
            .eq('related_type', 'opportunity')
            .in('related_id', oppIds)
            .eq('organization_id', organizationId);

          if (oppActsError) throw oppActsError;
          oppActivities = oppActsData || [];
        }

        // Combinar actividades del cliente y de oportunidades
        const allActivities: ActividadLinea[] = [...(activitiesData || []), ...oppActivities];

        // 4. Obtener pedidos web del cliente
        const { data: webOrdersData, error: webOrdersError } = await supabase
          .from('web_orders')
          .select('id, order_number, status, total, created_at, payment_status, delivery_type')
          .eq('customer_id', clienteId)
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });

        if (webOrdersError) throw webOrdersError;

        // 5. Transformar los datos en items de timeline
        const timeline: TimelineItem[] = [
          // Transformar ventas
          ...(salesData || []).map(sale => ({
            id: `sale-${sale.id}`,
            type: 'sale' as const,
            date: new Date(sale.sale_date),
            referencia: String(sale.id),
            // Original values for coloring
            originalStatus: sale.status,
            originalPaymentStatus: sale.payment_status,
            amount: parseFloat(sale.total) || 0,
          })),

          // Transformar reservas con info de folio y espacios
          ...reservas.map((reservation) => {
            const spaces = (reservation.reservation_spaces || []).map((rs) => rs.spaces?.label).filter(Boolean) as string[];
            const spaceTypes = Array.from(new Set((reservation.reservation_spaces || []).map((rs) => rs.spaces?.space_types?.name).filter(Boolean))) as string[];
            const folio = foliosMap[reservation.id];
            const folioItems = folio ? (folioItemsMap[folio.id] || []) : [];
            const pendingItems = folioItems.filter((i) => i.payment_status === 'pending');
            const pendingAmount = pendingItems.reduce((sum, i) => sum + Number(i.amount), 0);

            return {
              id: `reservation-${reservation.id}`,
              type: 'reservation' as const,
              date: new Date(reservation.start_date),
              fin: reservation.end_date,
              notas: reservation.notes,
              originalStatus: reservation.status,
              checkin: reservation.checkin,
              checkout: reservation.checkout,
              spaces,
              spaceTypes,
              folioBalance: folio ? Number(folio.balance) : undefined,
              folioItemsCount: folioItems.length,
              folioPendingItems: pendingItems.length,
              folioPendingAmount: pendingAmount,
              reservationId: reservation.id,
            } as TimelineItem;
          }),

          // Transformar actividades
          ...(allActivities).map(activity => ({
            id: `activity-${activity.id}`,
            type: 'activity' as const,
            date: new Date(activity.occurred_at),
            tipoActividad: activity.activity_type,
            oportunidad: activity.related_type === 'opportunity' ? oppNameMap[activity.related_id] || undefined : undefined,
            notas: activity.notes,
          })),
          // Transformar pedidos web
          ...(webOrdersData || []).map(order => ({
            id: `web_order-${order.id}`,
            type: 'web_order' as const,
            date: new Date(order.created_at),
            referencia: String(order.order_number),
            tipoEntrega: order.delivery_type,
            originalStatus: order.status,
            originalPaymentStatus: order.payment_status,
            amount: parseFloat(order.total) || 0,
          })),
        ];

        // 6. Ordenar el timeline por fecha, más reciente primero
        timeline.sort((a, b) => b.date.getTime() - a.date.getTime());

        setTimelineItems(timeline);
      } catch (err) {
        console.error('Error al cargar el timeline:', err);
        setError({ mensaje: mensajeError(err) });
      } finally {
        setLoading(false);
      }
    };

    fetchTimelineData();
  }, [clienteId, organizationId, vuelta]);

  const iconoActividad = (tipo?: string): LucideIcon => {
    const k = (tipo ?? '').toLowerCase();
    if (k.includes('call') || k.includes('llamada')) return Phone;
    if (k.includes('email') || k.includes('correo')) return Mail;
    if (k.includes('whatsapp') || k.includes('sms') || k.includes('message')) return MessageSquare;
    if (k.includes('meeting') || k.includes('reunion')) return CalendarDays;
    if (k.includes('note') || k.includes('nota')) return StickyNote;
    return Activity;
  };

  // Grupos por día calendario en la zona de la organización (Figma: «HOY», «AYER», fecha).
  const grupos = (() => {
    const hoy = todayInTz(timezone);
    const ayer = addPlainDays(hoy, -1);
    const lista: { dia: string; titulo: string; items: TimelineItem[] }[] = [];
    for (const item of timelineItems) {
      const dia = toPlainDate(item.date, timezone);
      let grupo = lista[lista.length - 1];
      if (!grupo || grupo.dia !== dia) {
        const titulo = dia === hoy ? t('actividad.hoy') : dia === ayer ? t('actividad.ayer') : instante(item.date, DIA_MES_ANIO);
        grupo = { dia, titulo, items: [] };
        lista.push(grupo);
      }
      grupo.items.push(item);
    }
    return lista;
  })();

  if (loading) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState variante="error" compacto descripcion={error.mensaje || t('actividad.errorCarga')} onReintentar={() => setVuelta((n) => n + 1)} />
      </div>
    );
  }

  if (timelineItems.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState titulo={t('actividad.vacioTitulo')} descripcion={t('actividad.vacioDescripcion')} />
      </div>
    );
  }

  const entrada = (item: TimelineItem) => {
    const meta = cuando(item.date);
    switch (item.type) {
      case 'sale':
        return (
          <EntradaHistorial
            key={item.id}
            icono={ShoppingCart}
            tono="exito"
            titulo={tituloDe(item)}
            meta={meta}
            estado={item.originalPaymentStatus || item.originalStatus ? <StatusBadge estado={item.originalPaymentStatus || item.originalStatus} /> : undefined}
            detalle={unirPartes([item.amount !== undefined ? formatear(item.amount) : null, item.originalStatus ? traducirEstadoPago(item.originalStatus) : null])}
          />
        );
      case 'web_order':
        return (
          <EntradaHistorial
            key={item.id}
            icono={ShoppingBag}
            tono="marca"
            titulo={tituloDe(item)}
            meta={meta}
            estado={item.originalStatus ? <StatusBadge estado={item.originalStatus} /> : undefined}
            detalle={unirPartes([item.tipoEntrega ? traducirEstadoWebOrder(item.tipoEntrega) : null, item.amount !== undefined ? formatear(item.amount) : null])}
          />
        );
      case 'activity':
        return (
          <EntradaHistorial key={item.id} icono={iconoActividad(item.tipoActividad)} tono="advertencia" titulo={tituloDe(item)} meta={meta}>
            <HtmlContentRenderer html={descripcionDe(item)} className="line-clamp-3 break-words text-xs leading-4 text-fg-secondary" />
          </EntradaHistorial>
        );
      case 'reservation':
        return (
          <EntradaHistorial
            key={item.id}
            icono={CalendarDays}
            tono="informacion"
            titulo={tituloDe(item)}
            estado={item.originalStatus ? <StatusBadge estado={item.originalStatus} /> : undefined}
            detalle={unirPartes([
              item.spaces && item.spaces.length > 0 ? item.spaces.join(', ') : null,
              item.checkin && item.checkout ? `${plana(item.checkin, DIA_MES_ANIO)} → ${plana(item.checkout, DIA_MES_ANIO)}` : null,
            ])}
          >
            {item.notas && <HtmlContentRenderer html={item.notas} className="line-clamp-2 break-words text-xs leading-4 text-fg-secondary" />}
            {item.reservationId && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {item.folioItemsCount !== undefined && item.folioItemsCount > 0 ? (
                  <>
                    <Badge tono="informacion" tamano="sm">
                      {t('actividad.folioItems', { count: item.folioItemsCount })}
                    </Badge>
                    {(item.folioPendingItems ?? 0) > 0 ? (
                      <Badge tono="advertencia" tamano="sm">
                        {t('actividad.folioPendientes', { count: item.folioPendingItems ?? 0, monto: formatear(item.folioPendingAmount || 0) })}
                      </Badge>
                    ) : (
                      <Badge tono="exito" tamano="sm">
                        {t('actividad.todoPagado')}
                      </Badge>
                    )}
                    {item.folioBalance !== undefined && item.folioBalance > 0 && (
                      <Badge tono="peligro" tamano="sm">
                        {t('actividad.saldo', { monto: formatear(item.folioBalance) })}
                      </Badge>
                    )}
                    <a
                      href={`/app/pms/folios?reservation=${item.reservationId}`}
                      className="ml-auto rounded text-xs font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {t('actividad.verFolio')}
                    </a>
                  </>
                ) : (
                  <span className="text-xs text-fg-muted">{t('actividad.sinConsumos')}</span>
                )}
              </div>
            )}
          </EntradaHistorial>
        );
    }
  };

  return (
    <section aria-label={t('actividad.titulo')} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      {grupos.map((g) => (
        <div key={g.dia} className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold uppercase leading-4 tracking-wide text-fg-muted">{g.titulo}</h3>
          <ul className="flex flex-col gap-2">{g.items.map(entrada)}</ul>
        </div>
      ))}
    </section>
  );
}
