'use client';

/**
 * POS › Reservas de mesas (Figma «Reservas de mesas» 445:194862,
 * «Configuración (propuesta)» 1699:864094 y «flujo de punta a punta por sede
 * (propuesta)» 1801:169066): Agenda · Lista · Configuración.
 *
 * Contenedor: lee las reservas de la sede del encabezado (la del día en la
 * Agenda, el rango en la Lista), escucha en tiempo real (aviso «Nueva reserva
 * web» con «Revisar»), y conecta los diálogos: nueva / editar, solicitud web
 * (confirmar con mesa o rechazar con motivo y otra hora, avisando al cliente
 * por correo), cancelar con motivo, eliminar, sentar (abre la cuenta de la mesa
 * con `pos_reserva_sentar`, la misma transacción que usa «Abrir mesa» en Mesas)
 * y el reembolso del depósito.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarClock, MoreHorizontal, Plus, RefreshCw, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { PageHeaderSkeleton, StatsSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import { ConfirmDialog, DialogoMotivo, EmptyState, PageHeader, RowActionsMenu, TabBar, idPanel, idPestana } from '@/components/kit';
import type { ClientePicker } from '@/components/kit/CustomerPicker';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { formatPlainDate, todayInTz } from '@/lib/utils/dateDisplay';
import { supabase } from '@/lib/supabase/config';
import { buscarClientes } from '@/lib/services/customers/busquedaClientesService';
import { crearClienteRapido } from '@/lib/services/documentos/edicionDocumento';
import type { AjustesReservaDto } from '@/lib/services/restaurantBookingSettingsService';
import {
  reservasMesasService,
  useMensajeErrorReserva,
  type CreateReservationInput,
  type RestaurantReservation,
  type ReservationStatus,
  type UpdateReservationInput,
  type VentaDeReserva,
} from '@/components/pos/reservas-mesas';
import { ReservasAgenda, type OpcionDia } from '@/components/pos/reservas-mesas/ReservasAgenda';
import { ReservasTabla, type FiltrosLista } from '@/components/pos/reservas-mesas/ReservasTabla';
import { ReservaFormDialog, type MesaOpcion } from '@/components/pos/reservas-mesas/ReservaFormDialog';
import { ReservasConfiguracion } from '@/components/pos/reservas-mesas/ReservasConfiguracion';
import { SolicitudReservaDialog } from '@/components/pos/reservas-mesas/SolicitudReservaDialog';
import { RechazarSolicitudDialog } from '@/components/pos/reservas-mesas/RechazarSolicitudDialog';
import { horaCorta } from '@/components/pos/reservas-mesas/reservasVista';

type Pestana = 'agenda' | 'lista' | 'configuracion';
const PESTANAS: readonly Pestana[] = ['agenda', 'lista', 'configuracion'];
const ID_PESTANAS = 'reservas-mesas';

/** `?tab=agenda|lista|configuracion` y `?reserva=<id>` (campana y editor del sitio). */
function leerQuery(): { tab: Pestana; reserva: string | null } {
  if (typeof window === 'undefined') return { tab: 'agenda', reserva: null };
  const q = new URLSearchParams(window.location.search);
  const reserva = q.get('reserva');
  const valida = reserva && /^[0-9a-f-]{36}$/i.test(reserva) ? reserva : null;
  const tab = q.get('tab');
  return { tab: tab === 'configuracion' ? 'configuracion' : tab === 'lista' ? 'lista' : 'agenda', reserva: valida };
}

/** `YYYY-MM-DD` + n días (calendario puro, sin zona). */
function sumarDias(fecha: string, n: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + n));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
}

export default function ReservasMesasPage() {
  const router = useRouter();
  const { organization } = useOrganization();
  const { branchFilter, branches, setSelectedBranch } = useBranch();
  const { toast } = useToast();
  const { timezone, resolveFor } = useOrgTimezone();
  const t = useTranslations('posReservasMesas');
  const tp = useTranslations('posReservasMesas.pagina');
  const mensajeError = useMensajeErrorReserva();

  const hoy = todayInTz(timezone);
  const [pestana, setPestana] = useState<Pestana>('agenda');
  const [resaltada, setResaltada] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => new Date());
  const [fecha, setFecha] = useState(hoy);
  const filtrosPorDefecto = useMemo<FiltrosLista>(() => ({ estado: 'all', origen: 'all', desde: hoy, hasta: sumarDias(hoy, 7) }), [hoy]);
  const [filtros, setFiltros] = useState<FiltrosLista>(filtrosPorDefecto);
  const [search, setSearch] = useState('');

  const [reservations, setReservations] = useState<RestaurantReservation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const [ventas, setVentas] = useState<Map<string, VentaDeReserva>>(new Map());
  const [inasistencias, setInasistencias] = useState<Map<string, number>>(new Map());
  const [ajustesSede, setAjustesSede] = useState<AjustesReservaDto | null>(null);
  const [mesasSede, setMesasSede] = useState<MesaOpcion[]>([]);
  const [enVivo, setEnVivo] = useState(false);

  // Diálogos
  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<RestaurantReservation | null>(null);
  const [solicitud, setSolicitud] = useState<RestaurantReservation | null>(null);
  const [rechazo, setRechazo] = useState<{ reserva: RestaurantReservation; proponiendo: boolean } | null>(null);
  const [horasLibres, setHorasLibres] = useState<string[]>([]);
  const [rechazando, setRechazando] = useState(false);
  const [cancelando, setCancelando] = useState<RestaurantReservation | null>(null);
  const [eliminando, setEliminando] = useState<RestaurantReservation | null>(null);
  const [reembolsando, setReembolsando] = useState<RestaurantReservation | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [visitas, setVisitas] = useState<number | null>(null);

  useEffect(() => {
    const q = leerQuery();
    setPestana(q.tab);
    setResaltada(q.reserva);
  }, []);
  useEffect(() => setFecha(hoy), [hoy]);
  useEffect(() => setFiltros(filtrosPorDefecto), [filtrosPorDefecto]);
  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const cambiarPestana = (valor: Pestana) => {
    setPestana(valor);
    try {
      const url = new URL(window.location.href);
      if (valor === 'agenda') url.searchParams.delete('tab');
      else url.searchParams.set('tab', valor);
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* noop */
    }
  };

  const sedes = useMemo(() => branches.map((b) => ({ id: Number(b.id), nombre: b.name })), [branches]);
  const nombreSede = (id: number | null | undefined) => sedes.find((s) => s.id === id)?.nombre ?? null;

  // ── Carga ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!organization?.id || pestana === 'configuracion') return;
    setIsLoading(true);
    setErrorCarga(false);
    try {
      const filas =
        pestana === 'agenda'
          ? await reservasMesasService.getReservations({ date_from: fecha, date_to: fecha, branch_id: branchFilter })
          : await reservasMesasService.getReservations({
              branch_id: branchFilter,
              date_from: filtros.desde || undefined,
              date_to: filtros.hasta || undefined,
              status: filtros.estado !== 'all' ? [filtros.estado] : undefined,
              source: filtros.origen !== 'all' ? filtros.origen : undefined,
              search: search.trim() || undefined,
            });
      setReservations(filas);
      void Promise.all([
        reservasMesasService.getVentasDeReservas(filas),
        reservasMesasService.getInasistenciasPorCliente(filas.map((r) => r.customer_id).filter((id): id is string => !!id)),
      ])
        .then(([v, i]) => {
          setVentas(v);
          setInasistencias(i);
        })
        .catch(() => undefined);
    } catch (error) {
      console.error('Error cargando reservas:', error);
      setErrorCarga(true);
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, pestana, fecha, branchFilter, filtros, search]);

  useEffect(() => {
    const id = setTimeout(() => void loadData(), search ? 300 : 0);
    return () => clearTimeout(id);
  }, [loadData, search]);

  // Ajustes efectivos (turnos de la agenda, grupo grande, recordatorio) y mesas de la sede.
  useEffect(() => {
    if (!organization?.id) return;
    let vivo = true;
    const qs = branchFilter != null ? `?branchId=${branchFilter}` : '';
    fetch(`/api/pos/reservas-mesas/configuracion${qs}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { sede?: { efectiva?: AjustesReservaDto } } | null) => vivo && setAjustesSede(d?.sede?.efectiva ?? null))
      .catch(() => vivo && setAjustesSede(null));
    if (branchFilter != null) {
      supabase
        .from('restaurant_tables')
        .select('id, name, zone, capacity')
        .eq('organization_id', organization.id)
        .eq('branch_id', branchFilter)
        .order('name')
        .then(({ data }) => vivo && setMesasSede((data ?? []) as MesaOpcion[]));
    } else {
      setMesasSede([]);
    }
    return () => {
      vivo = false;
    };
  }, [organization?.id, branchFilter, pestana]);

  // Tiempo real: «Nueva reserva web · <sede>» con «Revisar».
  const loadRef = useRef(loadData);
  loadRef.current = loadData;
  useEffect(() => {
    if (!organization?.id) return;
    setEnVivo(true);
    const cancelar = reservasMesasService.subscribeToReservations(({ tipo, reserva }) => {
      if (tipo === 'INSERT' && reserva.source === 'website') {
        toast({
          title: tp('toasts.nuevaWeb', { sede: nombreSede(reserva.branch_id ?? null) ?? '' }),
          description: tp('toasts.nuevaWebDetalle', {
            nombre: reserva.customer_name ?? '',
            n: reserva.party_size ?? 0,
            hora: horaCorta(reserva.reservation_time ?? ''),
            estado: reserva.status === 'pending' ? tp('toasts.porConfirmar') : tp('toasts.confirmada'),
          }),
          action: reserva.id ? (
            <ToastAction
              altText={tp('toasts.revisar')}
              onClick={() => {
                void reservasMesasService.getReservationById(String(reserva.id)).then((r) => r && (r.status === 'pending' ? setSolicitud(r) : abrirEditar(r)));
              }}
            >
              {tp('toasts.revisar')}
            </ToastAction>
          ) : undefined,
        });
      }
      void loadRef.current();
    }, branchFilter);
    return () => {
      setEnVivo(false);
      cancelar();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id, branchFilter, toast, tp]);

  // Visitas del cliente de la reserva que se edita («12 visitas»).
  useEffect(() => {
    setVisitas(null);
    if (!editando?.customer_id) return;
    let vivo = true;
    reservasMesasService
      .contarVisitas(editando.customer_id)
      .then((n) => vivo && setVisitas(n))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [editando?.customer_id]);

  // Desde la campana: abre la reserva.
  useEffect(() => {
    if (!resaltada) return;
    void reservasMesasService.getReservationById(resaltada).then((r) => {
      if (!r) return;
      setFecha(r.reservation_date);
      if (r.status === 'pending') setSolicitud(r);
    });
  }, [resaltada]);

  // ── Acciones ─────────────────────────────────────────────────────────
  const fallo = (error: unknown, defecto: string) =>
    toast({ title: t('errores.titulo'), description: mensajeError(error, defecto), variant: 'destructive' });

  const abrirEditar = (r: RestaurantReservation) => {
    setEditando(r);
    setFormAbierto(true);
  };
  const abrirNueva = () => {
    if (branchFilter == null) {
      toast({ title: tp('toasts.noCreada'), description: tp('toasts.sinSucursal'), variant: 'destructive' });
      return;
    }
    setEditando(null);
    setFormAbierto(true);
  };

  const guardarReserva = async (datos: CreateReservationInput | UpdateReservationInput, extra: { recordar: boolean }) => {
    try {
      if (editando) {
        await reservasMesasService.updateReservation(editando.id, datos as UpdateReservationInput);
        toast({ title: tp('toasts.actualizada') });
      } else {
        if (branchFilter == null) throw new Error('sede');
        const r = await reservasMesasService.createReservation(datos as CreateReservationInput, branchFilter);
        if (!extra.recordar) await reservasMesasService.omitirRecordatorio(r.id).catch(() => undefined);
        toast({
          title: tp('toasts.creada'),
          description: tp('toasts.creadaDetalle', {
            nombre: r.customer_name,
            fecha: formatPlainDate(r.reservation_date, { day: 'numeric', month: 'long' }),
            hora: horaCorta(r.reservation_time),
            mesa: r.restaurant_table?.name ?? tp('toasts.sinMesa'),
          }),
          action: (
            <ToastAction altText={tp('toasts.verAgenda')} onClick={() => { setFecha(r.reservation_date); cambiarPestana('agenda'); }}>
              {tp('toasts.verAgenda')}
            </ToastAction>
          ),
        });
      }
      void loadData();
    } catch (error) {
      fallo(error, t('errores.crear'));
      throw error;
    }
  };

  const cambiarEstado = async (r: RestaurantReservation, estado: ReservationStatus, motivo?: string) => {
    try {
      if (estado === 'confirmed' && r.status === 'pending') {
        setSolicitud(r);
        return;
      }
      if (estado === 'seated') {
        await sentar(r);
        return;
      }
      await reservasMesasService.changeStatus(r.id, estado, motivo);
      toast({ title: tp(`toasts.estado.${estado}`, { nombre: r.customer_name }) });
      setFormAbierto(false);
      void loadData();
    } catch (error) {
      fallo(error, t('errores.estado'));
    }
  };

  const sentar = async (r: RestaurantReservation) => {
    if (!r.restaurant_table_id) {
      setSolicitud(r);
      return;
    }
    try {
      await reservasMesasService.sentarReserva(r.id, r.restaurant_table_id, r.party_size);
      const mesaId = r.restaurant_table_id;
      toast({
        title: tp('toasts.sentada'),
        description: tp('toasts.sentadaDetalle', { mesa: r.restaurant_table?.name ?? '' }),
        action: (
          <ToastAction altText={tp('toasts.abrirCuenta')} onClick={() => router.push(`/app/pos/mesas/${mesaId}`)}>
            {tp('toasts.abrirCuenta')}
          </ToastAction>
        ),
      });
      setFormAbierto(false);
      void loadData();
    } catch (error) {
      fallo(error, t('errorSentar'));
    }
  };

  const confirmarSolicitud = async (r: RestaurantReservation, mesaId: string | null) => {
    try {
      await reservasMesasService.confirmarConMesa(r, mesaId);
      const avisado = await reservasMesasService.avisarCliente(r.id);
      toast({ title: tp('toasts.confirmada', { nombre: r.customer_name }), description: avisado ? tp('toasts.avisado') : tp('toasts.sinAviso') });
      setSolicitud(null);
      void loadData();
    } catch (error) {
      fallo(error, t('errores.confirmar'));
    }
  };

  const abrirRechazo = async (r: RestaurantReservation, proponiendo: boolean) => {
    setSolicitud(null);
    setHorasLibres([]);
    setRechazo({ reserva: r, proponiendo });
    setHorasLibres(await reservasMesasService.horasLibresCercanas(r));
  };

  const rechazar = async (r: RestaurantReservation, motivo: string, otraHora: string | null) => {
    setRechazando(true);
    try {
      await reservasMesasService.changeStatus(r.id, 'cancelled', motivo);
      const avisado = await reservasMesasService.avisarCliente(r.id, otraHora);
      toast({ title: tp('toasts.rechazada', { nombre: r.customer_name }), description: avisado ? tp('toasts.avisado') : tp('toasts.sinAviso') });
      setRechazo(null);
      void loadData();
    } catch (error) {
      fallo(error, t('errores.estado'));
    } finally {
      setRechazando(false);
    }
  };

  const esperar = async (r: RestaurantReservation, minutos: number) => {
    try {
      return await reservasMesasService.esperarLlegada(r.id, minutos);
    } catch (error) {
      fallo(error, t('errores.estado'));
      throw error;
    }
  };

  // Cliente para el formulario
  const buscarClientesReserva = useCallback(
    async (texto: string): Promise<ClientePicker[]> => {
      if (!organization?.id || texto.trim().length < 2) return [];
      const { filas } = await buscarClientes(supabase, { organizationId: organization.id, texto, limite: 20 });
      return filas.map((c) => ({
        id: c.id,
        nombre: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || c.id,
        documento: c.identification_number ?? null,
        correo: c.email ?? null,
        telefono: c.phone ?? null,
      }));
    },
    [organization?.id],
  );
  const buscarPorTelefono = useCallback(
    async (telefono: string) => {
      const encontrados = await buscarClientesReserva(telefono.replace(/\D/g, '').slice(-10));
      const c = encontrados[0];
      if (!c) return null;
      const visitas = await reservasMesasService.contarVisitas(c.id).catch(() => null);
      return { cliente: c, visitas };
    },
    [buscarClientesReserva],
  );
  const crearCliente = useCallback(
    async (d: { nombres: string; apellidos: string; telefono: string; correo: string }): Promise<ClientePicker> => {
      if (!organization?.id) throw new Error('organizacion');
      const fila = await crearClienteRapido(organization.id, branchFilter, {
        tipo: 'persona',
        tipoDocumento: '',
        numeroDocumento: '',
        dv: '',
        nombres: d.nombres,
        apellidos: d.apellidos,
        razonSocial: '',
        contacto: '',
        correo: d.correo,
        telefono: d.telefono,
        diasCredito: null,
      });
      return { id: fila.id, nombre: fila.full_name ?? `${d.nombres} ${d.apellidos}`, correo: fila.email ?? d.correo, telefono: fila.phone ?? d.telefono };
    },
    [organization?.id, branchFilter],
  );
  const mesasLibres = useCallback(
    async (f: string, h: string, n: number, dur: number, excluir?: string) => {
      if (branchFilter == null) return [];
      return reservasMesasService.getAvailableTables(f, h, n, branchFilter, excluir, dur);
    },
    [branchFilter],
  );

  // Días de la agenda: hoy y los próximos 13 («Hoy · sáb 18 oct»).
  const dias = useMemo<OpcionDia[]>(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const valor = sumarDias(hoy, i);
        const etiqueta = formatPlainDate(valor, { weekday: 'short', day: 'numeric', month: 'short' });
        return { valor, etiqueta: i === 0 ? tp('hoyEtiqueta', { fecha: etiqueta }) : i === 1 ? tp('mananaEtiqueta', { fecha: etiqueta }) : etiqueta };
      }),
    [hoy, tp],
  );
  if (!dias.some((d) => d.valor === fecha) && fecha) {
    dias.push({ valor: fecha, etiqueta: formatPlainDate(fecha, { weekday: 'short', day: 'numeric', month: 'short' }) });
  }

  const pendientesHoy = reservations.filter((r) => r.status === 'pending' && r.reservation_date === fecha).length;
  const personasDia = reservations.filter((r) => r.reservation_date === fecha && r.status !== 'cancelled').reduce((s, r) => s + r.party_size, 0);
  const subtitulo =
    pestana === 'configuracion'
      ? tp('subtituloConfig', { sede: nombreSede(branchFilter) ?? tp('todas') })
      : pestana === 'agenda'
        ? tp('subtituloAgenda', {
            sede: nombreSede(branchFilter) ?? tp('todas'),
            dia: fecha === hoy ? tp('hoy') : '',
            fecha: formatPlainDate(fecha, { weekday: 'long', day: 'numeric', month: 'long' }),
            n: reservations.filter((r) => r.status !== 'cancelled').length,
            personas: personasDia,
          })
        : tp('subtituloLista', {
            desde: formatPlainDate(filtros.desde, { day: 'numeric', month: 'long' }),
            hasta: formatPlainDate(filtros.hasta, { day: 'numeric', month: 'long' }),
            n: reservations.length,
          });

  if (!organization) {
    return (
      <div className="min-h-[calc(100vh-4rem)] space-y-4 bg-canvas p-4 sm:space-y-6 sm:p-6 lg:p-8">
        <PageHeaderSkeleton />
        <StatsSkeleton count={4} />
        <CardListSkeleton cards={4} columns="1" />
      </div>
    );
  }

  const sinSucursal = branchFilter == null && pestana !== 'lista';

  return (
    <div className="min-h-screen space-y-4 bg-canvas p-4 sm:p-6">
      <PageHeader
        migas={[{ etiqueta: tp('migaPos'), href: '/app/pos' }, { etiqueta: tp('miga') }]}
        titulo={tp('titulo')}
        subtitulo={subtitulo}
        icono={CalendarClock}
        cargando={isLoading && pestana !== 'configuracion'}
        acciones={
          <>
            <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => void loadData()} disabled={isLoading} aria-label={t('actualizar')} title={t('actualizar')}>
              <RefreshCw aria-hidden="true" className={isLoading ? 'size-4 animate-spin' : 'size-4'} strokeWidth={1.5} />
            </Button>
            <Button className="h-10 gap-2" onClick={abrirNueva}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('nueva')}
            </Button>
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={tp('titulo')}
              acciones={[{ id: 'config', etiqueta: tp('irConfiguracion'), icono: Settings, onSelect: () => cambiarPestana('configuracion') }]}
            />
          </>
        }
        movil={{
          accion: (
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={tp('titulo')}
              acciones={[
                { id: 'nueva', etiqueta: t('nueva'), icono: Plus, onSelect: abrirNueva },
                { id: 'actualizar', etiqueta: t('actualizar'), icono: RefreshCw, onSelect: () => void loadData() },
                { id: 'config', etiqueta: tp('irConfiguracion'), icono: MoreHorizontal, onSelect: () => cambiarPestana('configuracion') },
              ]}
            />
          ),
        }}
      />

      <TabBar
        id={ID_PESTANAS}
        etiqueta={t('pestanas.etiqueta')}
        valor={pestana}
        onValorChange={cambiarPestana}
        pestanas={PESTANAS.map((valor) => ({
          valor,
          etiqueta: tp(`pestanas.${valor}`),
          contador: valor === 'agenda' && pendientesHoy > 0 ? pendientesHoy : undefined,
        }))}
      />

      <div role="tabpanel" id={idPanel(ID_PESTANAS, pestana)} aria-labelledby={idPestana(ID_PESTANAS, pestana)}>
        {sinSucursal ? (
          <div className="rounded-xl border border-line bg-surface">
            <EmptyState variante="sinSucursal" titulo={tp('sinSucursal.titulo')} descripcion={tp('sinSucursal.descripcion')} />
          </div>
        ) : pestana === 'configuracion' ? (
          <ReservasConfiguracion branchId={branchFilter} sedes={sedes} onSedeChange={(id) => setSelectedBranch(id)} onIrAgenda={() => cambiarPestana('agenda')} />
        ) : pestana === 'agenda' ? (
          <ReservasAgenda
            reservations={reservations}
            isLoading={isLoading}
            serviceHours={ajustesSede?.service_hours ?? null}
            fecha={fecha}
            dias={dias}
            onFechaChange={setFecha}
            sedes={sedes}
            sedeId={branchFilter}
            onSedeChange={(id) => setSelectedBranch(id)}
            enVivo={enVivo}
            ahora={ahora}
            resaltada={resaltada}
            onAbrir={abrirEditar}
            onSolicitud={setSolicitud}
          />
        ) : (
          <ReservasTabla
            reservations={reservations}
            isLoading={isLoading}
            error={errorCarga}
            onReintentar={() => void loadData()}
            search={search}
            onSearchChange={setSearch}
            filtros={filtros}
            onFiltrosChange={setFiltros}
            filtrosPorDefecto={filtrosPorDefecto}
            ventas={ventas}
            inasistencias={inasistencias}
            ahora={ahora}
            zonaDe={(b) => resolveFor(b).timezone}
            resaltada={resaltada}
            onEsperar={esperar}
            onEditar={abrirEditar}
            onRevisarSolicitud={setSolicitud}
            onAsignarMesa={setSolicitud}
            onSentar={(r) => void sentar(r)}
            onCompletar={(r) => void cambiarEstado(r, 'completed')}
            onNoShow={(r) => void cambiarEstado(r, 'no_show')}
            onCancelar={setCancelando}
            onEliminar={setEliminando}
            onReembolsarDeposito={setReembolsando}
          />
        )}
      </div>

      <ReservaFormDialog
        open={formAbierto}
        onOpenChange={(a) => {
          setFormAbierto(a);
          if (!a) setEditando(null);
        }}
        reservation={editando}
        sede={nombreSede(editando?.branch_id ?? branchFilter)}
        horasRecordatorio={ajustesSede?.send_customer_email ? ajustesSede.reminder_hours_before : null}
        onSubmit={guardarReserva}
        onCambiarEstado={(r, e) => cambiarEstado(r, e)}
        mesasLibres={mesasLibres}
        mesasSede={mesasSede}
        buscarClientes={buscarClientesReserva}
        buscarPorTelefono={buscarPorTelefono}
        crearCliente={crearCliente}
        visitasCliente={visitas}
      />

      <SolicitudReservaDialog
        reserva={solicitud}
        sede={nombreSede(solicitud?.branch_id)}
        grupoGrande={ajustesSede?.large_party_threshold ?? null}
        ahora={ahora}
        onAbiertoChange={(a) => !a && setSolicitud(null)}
        onConfirmar={confirmarSolicitud}
        onRechazar={(r) => void abrirRechazo(r, false)}
        onProponerHora={(r) => void abrirRechazo(r, true)}
      />

      <RechazarSolicitudDialog
        reserva={rechazo?.reserva ?? null}
        sede={nombreSede(rechazo?.reserva.branch_id)}
        horasLibres={horasLibres}
        proponiendoHora={rechazo?.proponiendo}
        esHoy={rechazo?.reserva.reservation_date === hoy}
        cargando={rechazando}
        onAbiertoChange={(a) => !a && setRechazo(null)}
        onConfirmar={rechazar}
      />

      <DialogoMotivo
        abierto={!!cancelando}
        onAbiertoChange={(a) => !a && setCancelando(null)}
        titulo={tp('cancelar.titulo', { nombre: cancelando?.customer_name ?? '' })}
        descripcion={
          cancelando
            ? tp('cancelar.descripcion', {
                dia: cancelando.reservation_date === hoy ? tp('hoy') : formatPlainDate(cancelando.reservation_date, { day: 'numeric', month: 'long' }),
                hora: horaCorta(cancelando.reservation_time),
                n: cancelando.party_size,
                mesa: cancelando.restaurant_table?.name ?? tp('toasts.sinMesa'),
              })
            : undefined
        }
        textoConfirmar={tp('cancelar.confirmar')}
        motivosRapidos={[tp('cancelar.motivos.cliente'), tp('cancelar.motivos.noConfirmo'), tp('cancelar.motivos.cierre')]}
        cargando={ocupado}
        onConfirmar={async (motivo) => {
          if (!cancelando) return;
          setOcupado(true);
          try {
            await reservasMesasService.changeStatus(cancelando.id, 'cancelled', motivo);
            toast({ title: tp('toasts.estado.cancelled', { nombre: cancelando.customer_name }) });
            setCancelando(null);
            void loadData();
          } catch (error) {
            fallo(error, t('errores.estado'));
          } finally {
            setOcupado(false);
          }
        }}
      />

      <ConfirmDialog
        abierto={!!eliminando}
        onAbiertoChange={(a) => !a && setEliminando(null)}
        titulo={tp('eliminar.titulo', { nombre: eliminando?.customer_name ?? '' })}
        descripcion={tp('eliminar.descripcion')}
        textoConfirmar={tp('eliminar.confirmar')}
        tono="peligro"
        cargando={ocupado}
        onConfirmar={async () => {
          if (!eliminando) return;
          setOcupado(true);
          try {
            await reservasMesasService.deleteReservation(eliminando.id);
            toast({ title: tp('toasts.eliminada') });
            setEliminando(null);
            void loadData();
          } catch (error) {
            fallo(error, t('errores.generico'));
          } finally {
            setOcupado(false);
          }
        }}
      />

      <ConfirmDialog
        abierto={!!reembolsando}
        onAbiertoChange={(a) => !a && setReembolsando(null)}
        titulo={tp('reembolso.titulo')}
        descripcion={tp('reembolso.descripcion')}
        textoConfirmar={tp('reembolso.confirmar')}
        tono="advertencia"
        cargando={ocupado}
        onConfirmar={async () => {
          if (!reembolsando) return;
          setOcupado(true);
          try {
            await reservasMesasService.reembolsarDeposito(reembolsando.id, tp('reembolso.motivo'));
            toast({ title: tp('toasts.reembolso'), description: tp('toasts.reembolsoDetalle') });
            setReembolsando(null);
            void loadData();
          } catch (error) {
            toast({ title: t('errores.titulo'), description: (error as Error | null)?.message, variant: 'destructive' });
          } finally {
            setOcupado(false);
          }
        }}
      />
    </div>
  );
}
