'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { useToast } from '@/components/ui/use-toast';
import { PageHeaderSkeleton, StatsSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import {
  reservasMesasService,
  ReservasHeader,
  ReservasStats,
  ReservasList,
  ReservaFormDialog,
  ReservasConfiguracion,
  ReservasAgenda,
  ConfirmarReservaDialog,
  useMensajeErrorReserva,
  type RestaurantReservation,
  type VentaDeReserva,
  type ReservationFilters,
  type ReservationStats as StatsType,
  type ReservationStatus,
  type ReservationSource,
  type CreateReservationInput,
  type UpdateReservationInput,
} from '@/components/pos/reservas-mesas';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { todayInTz } from '@/lib/utils/dateDisplay';
import { TabBar, DialogoMotivo, idPanel, idPestana } from '@/components/kit';
import type { AjustesReservaDto } from '@/lib/services/restaurantBookingSettingsService';

/** Figma 1801:169066: Agenda · Lista · Configuración. */
type Pestana = 'agenda' | 'reservas' | 'configuracion';
const PESTANAS: readonly Pestana[] = ['agenda', 'reservas', 'configuracion'];
const ID_PESTANAS = 'reservas-mesas';

/**
 * `?tab=agenda|lista|configuracion` y `?reserva=<id>` (enlaces de la campana y
 * del editor del sitio). Con `?reserva` se abre la Lista, que resalta la tarjeta.
 */
function leerQuery(): { tab: Pestana; reserva: string | null } {
  if (typeof window === 'undefined') return { tab: 'agenda', reserva: null };
  const q = new URLSearchParams(window.location.search);
  const reserva = q.get('reserva');
  const valida = reserva && /^[0-9a-f-]{36}$/i.test(reserva) ? reserva : null;
  const tab = q.get('tab');
  return {
    tab: tab === 'configuracion' ? 'configuracion' : tab === 'lista' || valida ? 'reservas' : 'agenda',
    reserva: valida,
  };
}

export default function ReservasMesasPage() {
  const { organization } = useOrganization();
  const { branchFilter, branches } = useBranch();
  const { toast } = useToast();
  const { timezone, resolveFor } = useOrgTimezone();
  const t = useTranslations('posReservasMesas');
  const mensajeError = useMensajeErrorReserva();

  const [pestana, setPestana] = useState<Pestana>('agenda');
  const [porConfirmar, setPorConfirmar] = useState<RestaurantReservation | null>(null);
  const [porRechazar, setPorRechazar] = useState<RestaurantReservation | null>(null);
  const [rechazando, setRechazando] = useState(false);
  const [serviceHours, setServiceHours] = useState<AjustesReservaDto['service_hours'] | null>(null);
  const [resaltada, setResaltada] = useState<string | null>(null);
  const [ventas, setVentas] = useState<Map<string, VentaDeReserva>>(new Map());
  const [inasistencias, setInasistencias] = useState<Map<string, number>>(new Map());
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const q = leerQuery();
    setPestana(q.tab);
    setResaltada(q.reserva);
  }, []);

  // El aviso «no ha llegado» avanza solo.
  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const cambiarPestana = (valor: Pestana) => {
    setPestana(valor);
    try {
      const url = new URL(window.location.href);
      if (valor === 'agenda') url.searchParams.delete('tab');
      else url.searchParams.set('tab', valor === 'reservas' ? 'lista' : valor);
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* noop */
    }
  };

  // Estado principal
  const [reservations, setReservations] = useState<RestaurantReservation[]>([]);
  const [stats, setStats] = useState<StatsType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filtros
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  // Día calendario de la organización, no el día UTC (regla de fechas).
  const today = todayInTz(timezone);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);

  // Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState<RestaurantReservation | null>(null);

  // ── Carga de datos ─────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      const filters: ReservationFilters = {};

      if (statusFilter !== 'all') {
        filters.status = [statusFilter as ReservationStatus];
      }
      if (sourceFilter !== 'all') {
        filters.source = sourceFilter as ReservationSource;
      }
      if (dateFrom) filters.date_from = dateFrom;
      if (dateTo) filters.date_to = dateTo;
      if (search.trim()) filters.search = search.trim();
      filters.branch_id = branchFilter;

      const [reservationsData, statsData] = await Promise.all([
        reservasMesasService.getReservations(filters),
        reservasMesasService.getStats(dateFrom || undefined, dateTo || undefined, branchFilter),
      ]);

      setReservations(reservationsData);
      setStats(statsData);
      // Venta de la mesa e inasistencias: informativos, no bloquean la lista.
      void Promise.all([
        reservasMesasService.getVentasDeReservas(reservationsData),
        reservasMesasService.getInasistenciasPorCliente(
          reservationsData.map((r) => r.customer_id).filter((id): id is string => !!id),
        ),
      ])
        .then(([v, i]) => {
          setVentas(v);
          setInasistencias(i);
        })
        .catch((e) => console.error('Error cargando ventas e inasistencias de reservas:', e));
    } catch (error) {
      console.error('Error cargando reservas:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las reservas',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, statusFilter, sourceFilter, dateFrom, dateTo, search, toast, branchFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Turnos de la sede para la Agenda: la configuración efectiva (sede → organización → defecto).
  useEffect(() => {
    if (!organization?.id) return;
    let cancelado = false;
    const qs = branchFilter != null ? `?branchId=${branchFilter}` : '';
    fetch(`/api/pos/reservas-mesas/configuracion${qs}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { sede?: { efectiva?: AjustesReservaDto } } | null) => {
        if (!cancelado) setServiceHours(d?.sede?.efectiva?.service_hours ?? null);
      })
      .catch(() => {
        if (!cancelado) setServiceHours(null);
      });
    return () => {
      cancelado = true;
    };
  }, [organization?.id, branchFilter, pestana]);

  // Tiempo real: una reserva nueva del sitio avisa con un toast y recarga.
  const loadRef = useRef(loadData);
  loadRef.current = loadData;
  useEffect(() => {
    if (!organization?.id) return;
    const cancelar = reservasMesasService.subscribeToReservations(({ tipo, reserva }) => {
      if (tipo === 'INSERT' && reserva.source === 'website') {
        toast({
          title: t('tiempoReal.nueva'),
          description: t('tiempoReal.detalle', {
            nombre: reserva.customer_name ?? '',
            personas: reserva.party_size ?? 0,
            hora: (reserva.reservation_time ?? '').slice(0, 5),
          }),
        });
      }
      void loadRef.current();
    }, branchFilter);
    return cancelar;
  }, [organization?.id, branchFilter, toast, t]);

  // Llegando desde la campana: lleva la tarjeta a la vista.
  useEffect(() => {
    if (!resaltada || isLoading) return;
    document.getElementById(`reserva-${resaltada}`)?.scrollIntoView({ block: 'center' });
  }, [resaltada, isLoading]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleCreate = async (data: CreateReservationInput | UpdateReservationInput) => {
    // Si branchFilter es null (Todas), se requiere una sucursal concreta
    if (branchFilter == null) {
      toast({
        title: 'Sucursal requerida',
        description: 'Selecciona una sucursal concreta para crear una reserva. No se puede crear con "Todas" seleccionado.',
        variant: 'destructive',
      });
      throw new Error('Se requiere una sucursal concreta para crear una reserva');
    }
    try {
      await reservasMesasService.createReservation(data as CreateReservationInput, branchFilter);
      toast({ title: 'Reserva creada', description: 'La reserva se creó exitosamente' });
      loadData();
    } catch (error) {
      toast({
        title: t('errores.titulo'),
        description: mensajeError(error, t('errores.crear')),
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleUpdate = async (data: CreateReservationInput | UpdateReservationInput) => {
    if (!editingReservation) return;
    try {
      await reservasMesasService.updateReservation(editingReservation.id, data as UpdateReservationInput);
      toast({ title: 'Reserva actualizada', description: 'Los cambios se guardaron exitosamente' });
      setEditingReservation(null);
      loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: (error as Error | null)?.message || 'No se pudo actualizar la reserva',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleChangeStatus = async (id: string, status: ReservationStatus, reason?: string) => {
    try {
      await reservasMesasService.changeStatus(id, status, reason);
      toast({ title: 'Estado actualizado' });
      loadData();
    } catch (error) {
      toast({
        title: t('errores.titulo'),
        description: mensajeError(error, t('errores.estado')),
        variant: 'destructive',
      });
    }
  };

  const handleSentar = async (reservation: RestaurantReservation) => {
    if (!reservation.restaurant_table_id) return;
    try {
      await reservasMesasService.sentarReserva(reservation.id, reservation.restaurant_table_id, reservation.party_size);
      toast({ title: t('sentada', { mesa: reservation.restaurant_table?.name ?? '' }) });
      loadData();
    } catch (error) {
      toast({ title: t('errores.titulo'), description: mensajeError(error, t('errorSentar')), variant: 'destructive' });
    }
  };

  // «Confirmar y asignar mesa» / «Rechazar con motivo» de una pendiente (Figma 1801:169066, paso 4).
  const handleConfirmarPendiente = async (reserva: RestaurantReservation, mesaId: string | null) => {
    try {
      await reservasMesasService.confirmarConMesa(reserva, mesaId);
      toast({ title: t('pendiente.confirmada', { nombre: reserva.customer_name }) });
      setPorConfirmar(null);
      loadData();
    } catch (error) {
      toast({ title: t('errores.titulo'), description: mensajeError(error, t('errores.confirmar')), variant: 'destructive' });
    }
  };

  const handleRechazar = async (motivo: string) => {
    if (!porRechazar) return;
    setRechazando(true);
    try {
      // Cancelar del equipo (p_forzar): queda «Cancelada» con el motivo, que ve el cliente en su enlace.
      await reservasMesasService.changeStatus(porRechazar.id, 'cancelled', motivo);
      toast({ title: t('pendiente.rechazada', { nombre: porRechazar.customer_name }) });
      setPorRechazar(null);
      loadData();
    } catch (error) {
      toast({ title: t('errores.titulo'), description: mensajeError(error, t('errores.estado')), variant: 'destructive' });
    } finally {
      setRechazando(false);
    }
  };

  const handleEsperar = async (reserva: RestaurantReservation, minutos: number) => {
    try {
      return await reservasMesasService.esperarLlegada(reserva.id, minutos);
    } catch (error) {
      toast({ title: t('errores.titulo'), description: mensajeError(error, t('errores.estado')), variant: 'destructive' });
      throw error;
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await reservasMesasService.deleteReservation(id);
      toast({ title: 'Reserva eliminada' });
      loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: (error as Error | null)?.message || 'No se pudo eliminar la reserva',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (reservation: RestaurantReservation) => {
    setEditingReservation(reservation);
    setFormOpen(true);
  };

  const handleNewReservation = () => {
    setEditingReservation(null);
    setFormOpen(true);
  };

  // ── Loading inicial ────────────────────────────────────────────────────

  if (!organization) {
    return (
      <div className="min-h-[calc(100vh-4rem)] space-y-4 bg-canvas p-4 sm:space-y-6 sm:p-6 lg:p-8">
        <PageHeaderSkeleton />
        <StatsSkeleton count={4} />
        <CardListSkeleton cards={4} columns="1" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen space-y-6 bg-canvas p-4 sm:p-6">
      {/* Header + filtros (la sucursal activa va en la cabecera: BranchBadgeActiva) */}
      <ReservasHeader
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        onRefresh={loadData}
        onNewReservation={handleNewReservation}
        isLoading={isLoading}
      />

      <TabBar
        id={ID_PESTANAS}
        etiqueta={t('pestanas.etiqueta')}
        valor={pestana}
        onValorChange={cambiarPestana}
        pestanas={PESTANAS.map((valor) => ({
          valor,
          etiqueta:
            valor === 'agenda' && (stats?.pending ?? 0) > 0
              ? t('pestanas.agendaConPendientes', { n: stats?.pending ?? 0 })
              : t(`pestanas.${valor}`),
        }))}
      />

      {pestana === 'configuracion' ? (
        <div role="tabpanel" id={idPanel(ID_PESTANAS, 'configuracion')} aria-labelledby={idPestana(ID_PESTANAS, 'configuracion')}>
          <ReservasConfiguracion
            branchId={branchFilter}
            nombreSede={branches.find((b) => b.id === branchFilter)?.name ?? null}
          />
        </div>
      ) : pestana === 'agenda' ? (
        <div role="tabpanel" id={idPanel(ID_PESTANAS, 'agenda')} aria-labelledby={idPestana(ID_PESTANAS, 'agenda')} className="space-y-6">
          <ReservasStats stats={stats} isLoading={isLoading} />
          <ReservasAgenda
            reservations={reservations}
            isLoading={isLoading}
            serviceHours={serviceHours}
            ventas={ventas}
            onAbrir={handleEdit}
            onConfirmarPendiente={setPorConfirmar}
            onRechazar={setPorRechazar}
          />
        </div>
      ) : (
        <div role="tabpanel" id={idPanel(ID_PESTANAS, 'reservas')} aria-labelledby={idPestana(ID_PESTANAS, 'reservas')} className="space-y-6">
          {/* Stats */}
          <ReservasStats stats={stats} isLoading={isLoading} />

          {/* Lista */}
          <ReservasList
            reservations={reservations}
            isLoading={isLoading}
            onEdit={handleEdit}
            onChangeStatus={handleChangeStatus}
            onDelete={handleDelete}
            onSentar={handleSentar}
            ventas={ventas}
            inasistencias={inasistencias}
            ahora={ahora}
            zonaDe={(branchId) => resolveFor(branchId).timezone}
            resaltada={resaltada}
            onConfirmarPendiente={setPorConfirmar}
            onRechazar={setPorRechazar}
            onEsperar={handleEsperar}
          />
        </div>
      )}

      <ConfirmarReservaDialog
        reserva={porConfirmar}
        onAbiertoChange={(a) => !a && setPorConfirmar(null)}
        onConfirmar={handleConfirmarPendiente}
      />

      <DialogoMotivo
        abierto={!!porRechazar}
        onAbiertoChange={(a) => !a && !rechazando && setPorRechazar(null)}
        titulo={t('pendiente.rechazarTitulo', { nombre: porRechazar?.customer_name ?? '' })}
        descripcion={t('pendiente.rechazarDescripcion')}
        textoConfirmar={t('pendiente.rechazarConfirmar')}
        motivosRapidos={[t('pendiente.motivos.sinMesas'), t('pendiente.motivos.grupoGrande'), t('pendiente.motivos.eventoPrivado')]}
        onConfirmar={handleRechazar}
        cargando={rechazando}
      />

      {/* Formulario */}
      <ReservaFormDialog
        open={formOpen}
        onOpenChange={(isOpen: boolean) => {
          setFormOpen(isOpen);
          if (!isOpen) setEditingReservation(null);
        }}
        reservation={editingReservation}
        onSubmit={editingReservation ? handleUpdate : handleCreate}
      />
    </div>
  );
}
