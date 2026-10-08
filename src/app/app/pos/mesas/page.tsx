'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Check,
  Copy,
  Edit3,
  GitMerge,
  History,
  LayoutGrid,
  Layers,
  LogOut,
  MapPin,
  MoveRight,
  Plus,
  QrCode,
  RefreshCw,
  Grid3x3,
  Ellipsis,
  Settings,
  Users,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ActionSheet,
  CampoNumero,
  Dialogo,
  EmptyState,
  FilterChips,
  FormField,
  KbdButton,
  PageHeader,
  RowActionsMenu,
  SearchInput,
  SegmentedControl,
  type AccionFila,
  type ChipFiltro,
} from '@/components/kit';
import { useBranch } from '@/lib/context/BranchContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { MesaFormDialog } from '@/components/pos/mesas/MesaFormDialog';
import { ZonasManager } from '@/components/pos/mesas/ZonasManager';
import { CombinarMesasDialog } from '@/components/pos/mesas/CombinarMesasDialog';
import { MoverPedidoDialog } from '@/components/pos/mesas/MoverPedidoDialog';
import { HistorialMesasDialog } from '@/components/pos/mesas/HistorialMesasDialog';
import { MesasService } from '@/components/pos/mesas/mesasService';
import type { MesaFormData, RestaurantTable, TableWithSession } from '@/components/pos/mesas/types';
import { LiberarMesaDialog, useAvisoLiberacion } from '@/components/pos/mesas/LiberarMesaDialog';
import type { ResultadoLiberacion } from '@/components/pos/mesas/liberacionMesaCliente';
import { useReservasMesas } from '@/components/pos/mesas/useReservasMesas';
import { estadoVisualMesa, type ReservaActivaMesa } from '@/components/pos/mesas/reservasProximas';
import { ReservaMesaPanel } from '@/components/pos/mesas/ReservaMesaPanel';
import { CambiarMesaReservaDialog } from '@/components/pos/mesas/CambiarMesaReservaDialog';
import { reservasMesasService } from '@/components/pos/reservas-mesas/reservasMesasService';
import { useMensajeErrorReserva } from '@/components/pos/reservas-mesas/useMensajeErrorReserva';
import { MesaQrDialog, type MesaParaQr } from '@/components/pos/mesas/MesaQrDialog';
import { AbrirMesaFlujo } from '@/components/pos/mesas/cuenta/AbrirMesaFlujo';
import { MesaTile } from '@/components/pos/mesas/plano/MesaTile';
import { LeyendaEstadosMesa } from '@/components/pos/mesas/plano/LeyendaEstadosMesa';
import { SeccionZonaMesas } from '@/components/pos/mesas/plano/SeccionZonaMesas';
import { PlanoMesas, TODAS } from '@/components/pos/mesas/plano/PlanoMesas';
import { ResumenMesaPlano } from '@/components/pos/mesas/plano/ResumenMesaPlano';
import { MesasVacio } from '@/components/pos/mesas/plano/MesasVacio';
import { LoteMesasDialog } from '@/components/pos/mesas/plano/LoteMesasDialog';
import { conteoEstados, resumenZona, vistaMesaPlano, type EstadoMesaPlano, type VistaMesaPlano } from '@/components/pos/mesas/plano/estadoMesaPlano';
import { colorDeZona, type ZonaEnPlano } from '@/components/pos/mesas/plano/planoMesasLogica';
import { crearMesasEnLote, guardarPlano, marcarMesaLista, obtenerZonasPlano, type ZonaGuardada } from '@/components/pos/mesas/plano/planoService';
import { SolicitudesMesaBanda } from '@/components/pos/mesas/solicitudes/SolicitudesMesaBanda';
import { useSolicitudesMesa } from '@/components/pos/mesas/solicitudes/useSolicitudesMesa';
import { useTextosCartaQr } from '@/components/pos/mesas/solicitudes/textosCartaQr';
import { cn } from '@/utils/Utils';

/**
 * Mesas de la sede (Figma «POS — Mesas: cuadrícula y plano», 870:98618):
 * cabecera con la sede y la hora de la última carga, leyenda de estados que
 * filtra, buscador («/»), zona, vista (cuadrícula o plano) y densidad
 * (compacta o cómoda); secciones por zona; el plano con su editor; y los
 * estados vacío, cargando, error y sin permiso. En el celular: chips de zona y
 * la hoja de la mesa.
 */
type Vista = 'cuadricula' | 'plano';
type Densidad = 'compacta' | 'comoda';
type EstadoPagina = 'cargando' | 'lista' | 'error' | 'sinPermiso';

const CLAVE_PREFERENCIAS = 'pos-mesas-vista';

function leerPreferencias(): { vista: Vista; densidad: Densidad } {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_PREFERENCIAS) ?? '{}') as { vista?: Vista; densidad?: Densidad };
    return { vista: v.vista === 'plano' ? 'plano' : 'cuadricula', densidad: v.densidad === 'comoda' ? 'comoda' : 'compacta' };
  } catch {
    return { vista: 'cuadricula', densidad: 'compacta' };
  }
}

function esSinPermiso(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === '42501' || /permission denied|sin_acceso/i.test(e?.message ?? '');
}

export default function MesasPage() {
  const avisoLiberacion = useAvisoLiberacion();
  const t = useTranslations('posMesas');
  const tp = useTranslations('posMesasPlano');
  const router = useRouter();
  const { branchFilter, branches, selectedBranchId, isLoading: branchLoading } = useBranch();
  const { formatear } = useMonedaOrganizacion();
  const movil = !useMediaQuery('(min-width: 640px)');
  const tableta = !useMediaQuery('(min-width: 1280px)');

  const [mesas, setMesas] = useState<TableWithSession[]>([]);
  const [zonasMesas, setZonasMesas] = useState<string[]>([]);
  const [zonasGuardadas, setZonasGuardadas] = useState<ZonaGuardada[]>([]);
  const [estado, setEstado] = useState<EstadoPagina>('cargando');
  const [refrescando, setRefrescando] = useState(false);
  const [actualizadoEn, setActualizadoEn] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => new Date());

  // Filtros y vista
  const [busqueda, setBusqueda] = useState('');
  const [zonaFiltro, setZonaFiltro] = useState<string>('todas');
  const [estadosFiltro, setEstadosFiltro] = useState<EstadoMesaPlano[]>([]);
  const [vista, setVista] = useState<Vista>('cuadricula');
  const [densidad, setDensidad] = useState<Densidad>('compacta');
  // Pestaña del plano: la primera zona hasta que la persona elija otra (Figma: «Salón principal»).
  const [zonaPlanoElegida, setZonaPlano] = useState<string | null>(null);
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    const p = leerPreferencias();
    setVista(p.vista);
    setDensidad(p.densidad);
  }, []);
  // La vista y la densidad se recuerdan por persona (solo cuando las cambia).
  const recordar = (cambio: { vista?: Vista; densidad?: Densidad }) => {
    try {
      localStorage.setItem(CLAVE_PREFERENCIAS, JSON.stringify({ ...leerPreferencias(), ...cambio }));
    } catch {
      /* sin almacenamiento: la vista no se recuerda */
    }
  };
  const cambiarVista = (v: Vista) => {
    setVista(v);
    recordar({ vista: v });
  };
  const cambiarDensidad = (d: Densidad) => {
    setDensidad(d);
    recordar({ densidad: d });
  };

  // Diálogos
  const [showMesaForm, setShowMesaForm] = useState(false);
  const [mesaEditar, setMesaEditar] = useState<RestaurantTable | null>(null);
  const [mesaEliminar, setMesaEliminar] = useState<RestaurantTable | null>(null);
  const [showZonasManager, setShowZonasManager] = useState(false);
  const [showCombinar, setShowCombinar] = useState(false);
  const [showMover, setShowMover] = useState(false);
  const [showHistorial, setShowHistorial] = useState(false);
  const [showLote, setShowLote] = useState(false);
  const [zonaLote, setZonaLote] = useState<string | null>(null);
  const [crearZona, setCrearZona] = useState(false);
  const [nombreZonaNueva, setNombreZonaNueva] = useState('');
  const [mesaParaComensales, setMesaParaComensales] = useState<TableWithSession | null>(null);
  const [comensales, setComensales] = useState<number | null>(2);
  const [mesaParaLiberar, setMesaParaLiberar] = useState<TableWithSession | null>(null);
  const [mesaParaAbrir, setMesaParaAbrir] = useState<TableWithSession | null>(null);
  const [hojaId, setHojaId] = useState<string | null>(null);
  const [accionesHoja, setAccionesHoja] = useState<TableWithSession | null>(null);
  const [qr, setQr] = useState<{ mesas: MesaParaQr[]; titulo: string } | null>(null);

  // Reservas confirmadas que apartan una mesa ahora (ventana de 60 min).
  const tReservas = useTranslations('posReservasMesas');
  const mensajeErrorReserva = useMensajeErrorReserva();
  const { activas: reservasActivas, recargar: recargarReservas } = useReservasMesas(mesas, branchFilter, (reserva) =>
    toast(tReservas('tiempoReal.nueva'), {
      description: tReservas('tiempoReal.detalle', {
        nombre: reserva.customer_name ?? '',
        personas: reserva.party_size ?? 0,
        hora: (reserva.reservation_time ?? '').slice(0, 5),
      }),
    }),
  );
  // Solicitudes de la Carta QR («Llamar al mesero», «Pedir la cuenta») en tiempo real.
  const tq = useTextosCartaQr();
  const nombreMesaRef = useRef<(id: string) => string>(() => '');
  const solicitudes = useSolicitudesMesa(branchFilter ?? null, (s) => {
    toast.warning(tq('solicitudes.nuevaTitulo', { mesa: nombreMesaRef.current(s.mesaId), tipo: tq(`solicitudes.tipo.${s.tipo}`) }), {
      description: s.motivo ? `«${s.motivo}»` : tq('solicitudes.nuevaDetalle'),
    });
    // «Pedir la cuenta» cambia el estado de la mesa a «Por cobrar».
    if (s.tipo === 'bill') void cargarDatosRef.current();
  });
  const cargarDatosRef = useRef<() => Promise<void>>(async () => undefined);
  const [mesaReservada, setMesaReservada] = useState<TableWithSession | null>(null);
  const [showCambiarMesaReserva, setShowCambiarMesaReserva] = useState(false);
  const [confirmarNoShow, setConfirmarNoShow] = useState(false);
  const [accionReservaEnCurso, setAccionReservaEnCurso] = useState(false);
  const reservaDelPanel: ReservaActivaMesa | undefined = mesaReservada ? reservasActivas.get(mesaReservada.id) : undefined;
  const mesasNoDisponibles = useMemo(
    () => new Set(mesas.filter((m) => estadoVisualMesa(m, reservasActivas.get(m.id)) !== 'free').map((m) => m.id)),
    [mesas, reservasActivas],
  );

  const primeraCarga = useRef(true);
  const cargarDatos = useCallback(async () => {
    if (primeraCarga.current) setEstado('cargando');
    setRefrescando(true);
    try {
      const [mesasData, zonasData, zonasPlano] = await Promise.all([MesasService.obtenerMesasConSesiones(), MesasService.obtenerZonas(), obtenerZonasPlano()]);
      setMesas(mesasData);
      setZonasMesas(zonasData);
      setZonasGuardadas(zonasPlano);
      setActualizadoEn(Date.now());
      setEstado('lista');
      recargarReservas();
    } catch (error) {
      console.error('Error cargando mesas:', error);
      if (esSinPermiso(error)) setEstado('sinPermiso');
      else if (primeraCarga.current) setEstado('error');
      else toast.error(tp('errores.cargar'));
    } finally {
      primeraCarga.current = false;
      setRefrescando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tp]);

  cargarDatosRef.current = cargarDatos;

  useEffect(() => {
    if (!branchLoading) void cargarDatos();
  }, [branchFilter, branchLoading, cargarDatos]);

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);

  // ── Datos derivados ──────────────────────────────────────────────────────
  const vistas = useMemo(() => mesas.map((m) => vistaMesaPlano(m, reservasActivas.get(m.id), ahora)), [mesas, reservasActivas, ahora]);
  const mesaPorId = useMemo(() => new Map(mesas.map((m) => [m.id, m])), [mesas]);
  nombreMesaRef.current = (id: string) => mesaPorId.get(id)?.name ?? '';
  const atenderSolicitud = (s: Parameters<typeof solicitudes.atender>[0], estado: 'ack' | 'done') => {
    solicitudes.atender(s, estado).catch(() => toast.error(tq('solicitudes.errorAtender')));
  };

  const zonas: ZonaEnPlano[] = useMemo(() => {
    const nombres = [...new Set([...zonasMesas, ...zonasGuardadas.map((z) => z.nombre)])];
    const guardada = new Map(zonasGuardadas.map((z) => [z.nombre, z]));
    return nombres
      .map((nombre, i) => ({ nombre, color: colorDeZona(nombre, guardada.get(nombre)?.color), orden: guardada.get(nombre)?.orden ?? 100 + i, original: nombre }))
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
      .map((z, i) => ({ ...z, orden: i }));
  }, [zonasMesas, zonasGuardadas]);

  const zonaPlano = zonaPlanoElegida ?? zonas[0]?.nombre ?? TODAS;
  const q = busqueda.trim().toLowerCase();
  const pasaBusqueda = (v: VistaMesaPlano) => !q || v.nombre.toLowerCase().includes(q) || v.numero.toLowerCase() === q;
  const pasaZona = (v: VistaMesaPlano) => zonaFiltro === 'todas' || (zonaFiltro === 'sin-zona' ? !v.zona : v.zona === zonaFiltro);
  const pasaEstado = (v: VistaMesaPlano) => estadosFiltro.length === 0 || estadosFiltro.includes(v.estado);
  const filtradas = vistas.filter((v) => pasaBusqueda(v) && pasaZona(v) && pasaEstado(v));
  const conteos = useMemo(() => conteoEstados(vistas), [vistas]);

  const sede = branches.find((b) => b.id === (selectedBranchId ?? branchFilter))?.name ?? null;
  const hace = actualizadoEn ? Math.max(0, Math.round((ahora.getTime() - actualizadoEn) / 1000)) : null;
  const subtitulo =
    estado === 'cargando'
      ? [sede, tp('cabecera.cargando')].filter(Boolean).join(' · ')
      : estado === 'sinPermiso'
        ? sede ?? ''
      : editando
        ? [sede, tp('cabecera.editando', { zona: zonaPlano === TODAS ? tp('plano.todas') : zonaPlano })].filter(Boolean).join(' · ')
        : [
            sede,
            t('subtitulo', { n: mesas.length }),
            !movil && hace != null ? (hace < 60 ? tp('cabecera.haceSeg', { n: Math.max(hace, 1) }) : tp('cabecera.haceMin', { n: Math.round(hace / 60) })) : null,
          ]
            .filter(Boolean)
            .join(' · ');

  // ── Acciones ─────────────────────────────────────────────────────────────
  const irACuenta = (id: string) => router.push(`/app/pos/mesas/${id}`);

  const alMarcarLista = async (m: TableWithSession) => {
    try {
      await marcarMesaLista(m.id);
      toast.success(tp('toast.lista', { mesa: m.name }));
      setHojaId(null);
      setSeleccionId(null);
      await cargarDatos();
    } catch {
      toast.error(tp('errores.lista'));
    }
  };

  const alPedirCuenta = async (m: TableWithSession) => {
    if (!m.session) return;
    try {
      await MesasService.solicitarCuenta(m.session.id);
      toast.success(tp('toast.cuentaPedida', { mesa: m.name }));
      await cargarDatos();
    } catch {
      toast.error(tp('errores.cuenta'));
    }
  };

  /** Acción principal de una mesa (tocarla en la cuadrícula o «Ver cuenta»/«Abrir» en su resumen). */
  const abrirMesaDe = (v: VistaMesaPlano) => {
    const m = mesaPorId.get(v.id);
    if (!m) return;
    setHojaId(null);
    setSeleccionId(null);
    // Libre o reservada: «Abrir mesa» (D1); con reserva, el diálogo la ofrece para sentarla y «Ver reserva» abre su panel.
    if (v.estado === 'libre' || v.estado === 'reservada') setMesaParaAbrir(m);
    else if (v.estado === 'por_limpiar') void alMarcarLista(m);
    else irACuenta(m.id);
  };

  const alTocarMesa = (v: VistaMesaPlano) => {
    if (movil) setHojaId(v.id);
    else abrirMesaDe(v);
  };

  const accionesMesa = (m: TableWithSession): AccionFila[] => [
    { id: 'editar', etiqueta: t('acciones.editarMesa'), icono: Settings, onSelect: () => { setMesaEditar(m); setShowMesaForm(true); } },
    { id: 'qr', etiqueta: t('qr.accion'), icono: QrCode, onSelect: () => setQr({ mesas: [{ id: m.id, name: m.name, zone: m.zone ?? null, branchId: m.branch_id }], titulo: m.name }) },
    ...(m.session
      ? [
          { id: 'comensales', etiqueta: t('acciones.editarComensales'), icono: Users, onSelect: () => { setMesaParaComensales(m); setComensales(m.session?.customers || 2); } },
          { id: 'liberar', etiqueta: t('acciones.liberarMesa'), icono: LogOut, onSelect: () => setMesaParaLiberar(m), destructiva: true, separadorAntes: true },
        ]
      : [{ id: 'eliminar', etiqueta: t('eliminar.confirmar'), icono: LogOut, onSelect: () => setMesaEliminar(m), destructiva: true, separadorAntes: true }]),
  ];

  const accionesMas: AccionFila[] = [
    { id: 'zonas', etiqueta: t('acciones.gestionarZonas'), icono: Layers, onSelect: () => setShowZonasManager(true) },
    { id: 'lote', etiqueta: tp('acciones.lote'), icono: Copy, onSelect: () => { setZonaLote(null); setShowLote(true); } },
    { id: 'editarPlano', etiqueta: tp('acciones.editarPlano'), icono: Edit3, onSelect: () => { cambiarVista('plano'); setEditando(true); }, deshabilitada: movil },
    { id: 'mover', etiqueta: t('acciones.moverPedido'), icono: MoveRight, onSelect: () => setShowMover(true), separadorAntes: true },
    { id: 'combinar', etiqueta: t('acciones.combinar'), icono: GitMerge, onSelect: () => setShowCombinar(true) },
    { id: 'historial', etiqueta: t('acciones.historial'), icono: History, onSelect: () => setShowHistorial(true), separadorAntes: true },
    {
      id: 'qr',
      etiqueta: t('qr.todas'),
      icono: QrCode,
      onSelect: () => setQr({ mesas: filtradas.map((v) => ({ id: v.id, name: v.nombre, zone: v.zona, branchId: mesaPorId.get(v.id)?.branch_id ?? null })), titulo: zonaFiltro !== 'todas' ? zonaFiltro : t('qr.tituloTodas') }),
    },
  ];

  const accionesZona = (zona: string | null): AccionFila[] => [
    { id: 'plano', etiqueta: tp('zona.verPlano'), icono: MapPin, onSelect: () => { cambiarVista('plano'); setZonaPlano(zona ?? ''); } },
    { id: 'lote', etiqueta: tp('acciones.loteZona'), icono: Plus, onSelect: () => { setZonaLote(zona); setShowLote(true); } },
    {
      id: 'qr',
      etiqueta: tp('zona.qr'),
      icono: QrCode,
      onSelect: () => setQr({ mesas: vistas.filter((v) => v.zona === zona).map((v) => ({ id: v.id, name: v.nombre, zone: v.zona, branchId: mesaPorId.get(v.id)?.branch_id ?? null })), titulo: zona ?? t('zona.sinZona') }),
    },
    { id: 'gestionar', etiqueta: t('acciones.gestionarZonas'), icono: Layers, onSelect: () => setShowZonasManager(true), separadorAntes: true },
  ];

  // CRUD de siempre (formulario de mesa, zonas, combinar, mover)
  const conRecarga = async (fn: () => Promise<unknown>, ok: string, error: string) => {
    try {
      await fn();
      toast.success(ok);
      await cargarDatos();
    } catch (e) {
      toast.error((e as { message?: string } | null)?.message || error);
      throw e;
    }
  };
  const handleCrearMesa = (data: MesaFormData) => conRecarga(() => MesasService.crearMesa(data), tp('toast.mesaCreada', { mesa: data.name }), tp('errores.guardar'));
  const handleEditarMesa = async (data: MesaFormData) => {
    if (!mesaEditar) return;
    await conRecarga(() => MesasService.actualizarMesa(mesaEditar.id, data), tp('toast.mesaGuardada', { mesa: data.name }), tp('errores.guardar'));
    setMesaEditar(null);
  };
  const handleEliminarMesa = async () => {
    if (!mesaEliminar) return;
    await conRecarga(() => MesasService.eliminarMesa(mesaEliminar.id), tp('toast.mesaEliminada', { mesa: mesaEliminar.name }), tp('errores.eliminar')).catch(() => undefined);
    setMesaEliminar(null);
  };
  const handleMesaLiberada = async (resultado: ResultadoLiberacion) => {
    const aviso = avisoLiberacion(resultado, mesaParaLiberar?.name ?? '');
    toast.success(aviso.title, { description: aviso.description });
    setMesaParaLiberar(null);
    await cargarDatos();
  };
  const handleActualizarComensales = async () => {
    if (!mesaParaComensales?.session?.id || comensales === null) return;
    await conRecarga(() => MesasService.actualizarComensales(mesaParaComensales.session!.id, comensales), tp('toast.comensales', { mesa: mesaParaComensales.name, n: comensales }), tp('errores.guardar')).catch(() => undefined);
    setMesaParaComensales(null);
  };

  // Reservas (panel de la mesa reservada)
  const handleSentarReserva = async () => {
    const mesa = mesaReservada;
    const activa = reservaDelPanel;
    if (!mesa || !activa) return;
    setAccionReservaEnCurso(true);
    try {
      await reservasMesasService.sentarReserva(activa.reserva.id, mesa.id, activa.reserva.party_size);
      toast.success(t('reserva.avisos.sentadaTitulo'), { description: t('reserva.avisos.sentada', { mesa: mesa.name, nombre: activa.reserva.customer_name }) });
      setMesaReservada(null);
      irACuenta(mesa.id);
      void cargarDatos();
    } catch (error) {
      toast.error(t('reserva.avisos.error'), { description: mensajeErrorReserva(error, t('reserva.avisos.errorSentar')) });
    } finally {
      setAccionReservaEnCurso(false);
    }
  };
  const handleCambiarMesaReserva = async (mesaDestinoId: string, mesaDestinoNombre: string) => {
    const activa = reservaDelPanel;
    if (!activa) return;
    try {
      await reservasMesasService.updateReservation(activa.reserva.id, { restaurant_table_id: mesaDestinoId });
      toast.success(t('reserva.avisos.mesaCambiada', { mesa: mesaDestinoNombre }));
      setShowCambiarMesaReserva(false);
      setMesaReservada(null);
      recargarReservas();
    } catch {
      toast.error(t('reserva.avisos.errorCambiar'));
    }
  };
  const handleNoSePresento = async () => {
    const activa = reservaDelPanel;
    if (!mesaReservada || !activa) return;
    setAccionReservaEnCurso(true);
    try {
      await reservasMesasService.changeStatus(activa.reserva.id, 'no_show');
      toast.success(t('reserva.avisos.noShow', { nombre: activa.reserva.customer_name }));
      setConfirmarNoShow(false);
      setMesaReservada(null);
      await cargarDatos();
    } catch {
      toast.error(t('reserva.avisos.errorNoShow'));
    } finally {
      setAccionReservaEnCurso(false);
    }
  };

  // ── Piezas ───────────────────────────────────────────────────────────────
  const resumenDe = (v: VistaMesaPlano, apilado = false) => {
    const m = mesaPorId.get(v.id);
    if (!m) return null;
    return (
      <ResumenMesaPlano
        vista={v}
        formatear={formatear}
        conZona={apilado}
        apilado={apilado}
        acciones={accionesMesa(m)}
        onPrincipal={() => abrirMesaDe(v)}
        onPedirCuenta={() => void alPedirCuenta(m)}
        onAgregar={() => irACuenta(m.id)}
        onMarcarLista={() => void alMarcarLista(m)}
        onMasAcciones={() => {
          setHojaId(null);
          setAccionesHoja(m);
        }}
      />
    );
  };

  const densidadVista: Densidad = movil ? 'compacta' : densidad;
  const tiles = (lista: VistaMesaPlano[]) =>
    lista.map((v) => (
      <MesaTile key={v.id} vista={v} densidad={densidadVista} formatear={formatear} solicitud={solicitudes.porMesa.get(v.id) ?? null} onClick={() => alTocarMesa(v)} />
    ));

  const secciones = () => {
    const grupos: Array<{ nombre: string | null; color: string; vistas: VistaMesaPlano[] }> = [
      ...zonas.map((z) => ({ nombre: z.nombre as string | null, color: z.color, vistas: filtradas.filter((v) => v.zona === z.nombre) })),
      { nombre: null, color: '#64748B', vistas: filtradas.filter((v) => !v.zona) },
    ].filter((g) => g.vistas.length > 0);
    if (grupos.length === 0) {
      return <EmptyState variante="search" termino={q || undefined} onLimpiarFiltros={limpiarFiltros} />;
    }
    return (
      <div className="flex flex-col gap-6">
        {grupos.map((g) => (
          <SeccionZonaMesas
            key={g.nombre ?? 'sin-zona'}
            nombre={g.nombre ?? t('zona.sinZona')}
            color={g.color}
            resumen={resumenZona(g.vistas)}
            totalZona={vistas.filter((v) => (v.zona ?? null) === g.nombre).length}
            filtrada={q !== '' || estadosFiltro.length > 0}
            densidad={densidadVista}
            corto={movil}
            acciones={accionesZona(g.nombre)}
          >
            {tiles(g.vistas)}
          </SeccionZonaMesas>
        ))}
      </div>
    );
  };

  const limpiarFiltros = () => {
    setBusqueda('');
    setZonaFiltro('todas');
    setEstadosFiltro([]);
  };
  const chips: ChipFiltro[] = [];
  if (estadosFiltro.length > 0) chips.push({ clave: 'estado', etiqueta: tp('filtros.chipEstado', { estados: estadosFiltro.map((e) => tp(`mesa.estados.${e}`)).join(', ') }) });
  if (zonaFiltro !== 'todas' && !movil) chips.push({ clave: 'zona', etiqueta: t('filtros.chipZona', { zona: zonaFiltro === 'sin-zona' ? t('zona.sinZona') : zonaFiltro }) });

  const vistaHoja = hojaId ? vistas.find((v) => v.id === hojaId) ?? null : null;
  const siguienteNumero = useMemo(() => vistas.reduce((max, v) => Math.max(max, Number(v.numero) || 0), 0) + 1, [vistas]);

  const botonRefrescar = (
    <button
      type="button"
      onClick={() => void cargarDatos()}
      disabled={refrescando}
      aria-label={t('acciones.actualizar')}
      title={t('acciones.actualizar')}
      className="flex size-10 items-center justify-center rounded-lg border border-line-strong bg-surface text-fg hover:bg-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <RefreshCw aria-hidden="true" className={cn('size-4', refrescando && 'animate-spin')} strokeWidth={1.5} />
    </button>
  );

  const selectorVista = (
    <SegmentedControl<Vista>
      etiqueta={t('vista.etiqueta')}
      tamano="md"
      valor={vista}
      onValorChange={(v) => {
        cambiarVista(v);
        setSeleccionId(null);
        if (v === 'cuadricula') setEditando(false);
      }}
      className="shrink-0"
      opciones={[
        { valor: 'cuadricula', etiqueta: t('vista.cuadricula'), icono: LayoutGrid, soloIcono: movil },
        { valor: 'plano', etiqueta: t('vista.plano'), icono: MapPin, soloIcono: movil },
      ]}
    />
  );

  const cuerpo = () => {
    if (estado === 'cargando') {
      return (
        <div className="flex flex-col gap-6" aria-busy="true" aria-label={tp('cabecera.cargando')}>
          {[2, 1].map((filas, i) => (
            <div key={i} className="flex flex-col gap-3">
              <Skeleton className="h-3 w-24 rounded" />
              <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
                {Array.from({ length: filas * 10 }, (_, k) => (
                  <Skeleton key={k} className="h-[72px] rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (estado === 'error') {
      return (
        <div className="rounded-xl border border-line bg-surface py-12">
          <EmptyState variante="error" titulo={tp('estados.errorTitulo')} descripcion={tp('estados.errorDescripcion')} onReintentar={() => void cargarDatos()} />
        </div>
      );
    }
    if (estado === 'sinPermiso') {
      return (
        <div className="rounded-xl border border-line bg-surface py-12">
          <EmptyState
            variante="forbidden"
            titulo={tp('estados.sinPermisoTitulo')}
            descripcion={tp('estados.sinPermisoDescripcion')}
            accion={{ etiqueta: tp('estados.volverPos'), icono: ArrowLeft, onClick: () => router.push('/app/pos') }}
          />
        </div>
      );
    }
    if (mesas.length === 0 && zonas.length === 0) {
      return <MesasVacio onCrearZona={() => { setNombreZonaNueva(''); setCrearZona(true); }} onLote={() => { setZonaLote(null); setShowLote(true); }} />;
    }
    if (vista === 'plano') {
      return (
        <PlanoMesas
          vistas={filtradas}
          todas={vistas}
          zonas={zonas}
          zonaActiva={movil ? (zonaFiltro === 'todas' ? TODAS : zonaFiltro) : zonaPlano}
          onZonaActivaChange={setZonaPlano}
          reflujo={movil ? 3 : undefined}
          formatear={formatear}
          seleccionId={seleccionId}
          onSeleccionar={(id) => {
            if (movil && id) setHojaId(id);
            else setSeleccionId(id);
          }}
          resumen={(v) => resumenDe(v)}
          movil={movil}
          solicitudes={solicitudes.porMesa}
          puedeEditar={!movil}
          editando={editando}
          onEditandoChange={setEditando}
          prefijoMesa={tp('editor.prefijoMesa')}
          onGuardar={async (cambios, estadoEditor) => {
            try {
              const r = await guardarPlano(cambios, estadoEditor);
              if (r.noBorradas.length > 0) toast.warning(tp('toast.noBorradas', { n: r.noBorradas.length }));
              if (r.sinColumnasNuevas) toast.info(tp('toast.sinColumnas'));
              else toast.success(tp('toast.planoGuardado'));
              await cargarDatos();
              return true;
            } catch {
              toast.error(tp('errores.plano'));
              return false;
            }
          }}
        />
      );
    }
    return secciones();
  };

  const listo = estado === 'lista' && (mesas.length > 0 || zonas.length > 0);

  return (
    <div className="min-h-screen space-y-4 bg-canvas p-4 sm:space-y-5 sm:p-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={subtitulo}
        acciones={
          <>
            {botonRefrescar}
            <RowActionsMenu orientacion="horizontal" tamano="md" acciones={accionesMas} etiquetaBoton={tableta ? undefined : tp('acciones.mas')} iconoBoton={Ellipsis} />
            <KbdButton variante="primario" tamano="md" icono={Plus} onClick={() => setShowMesaForm(true)}>
              {t('acciones.nuevaMesa')}
            </KbdButton>
          </>
        }
        movil={{
          accion: (
            <RowActionsMenu
              orientacion="vertical"
              tamano="md"
              titulo={t('titulo')}
              acciones={[
                { id: 'nueva', etiqueta: t('acciones.nuevaMesa'), icono: Plus, onSelect: () => setShowMesaForm(true) },
                { id: 'actualizar', etiqueta: t('acciones.actualizar'), icono: RefreshCw, onSelect: () => void cargarDatos() },
                ...accionesMas.map((a, i) => (i === 0 ? { ...a, separadorAntes: true } : a)),
              ]}
            />
          ),
        }}
      />

      {listo && !editando && !movil && <LeyendaEstadosMesa conteos={conteos} seleccion={estadosFiltro} onSeleccionChange={setEstadosFiltro} />}

      {(estado === 'cargando' || estado === 'error' || listo) && !editando && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <SearchInput value={busqueda} onChange={setBusqueda} onValueChange={setBusqueda} placeholder={movil ? tp('filtros.buscarCorto') : tp('filtros.buscar')} className={cn('min-w-0 flex-1', !tableta && 'sm:w-[320px] sm:flex-none')} />
            {!tableta && vista === 'cuadricula' && (
              <Select value={zonaFiltro} onValueChange={setZonaFiltro}>
                <SelectTrigger aria-label={t('filtros.zona')} className="h-10 w-[220px] border-line-strong bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">{t('filtros.todasZonas')}</SelectItem>
                  {zonas.map((z) => (
                    <SelectItem key={z.nombre} value={z.nombre}>
                      {z.nombre}
                    </SelectItem>
                  ))}
                  {vistas.some((v) => !v.zona) && <SelectItem value="sin-zona">{t('zona.sinZona')}</SelectItem>}
                </SelectContent>
              </Select>
            )}
            <span className="hidden flex-1 sm:block" />
            {selectorVista}
            {!movil && vista === 'cuadricula' && (
              <SegmentedControl<Densidad>
                etiqueta={tp('densidad.etiqueta')}
                tamano="md"
                valor={densidad}
                onValorChange={cambiarDensidad}
                className="shrink-0"
                opciones={[
                  { valor: 'comoda', etiqueta: tp('densidad.comoda'), icono: LayoutGrid, soloIcono: true },
                  { valor: 'compacta', etiqueta: tp('densidad.compacta'), icono: Grid3x3, soloIcono: true },
                ]}
              />
            )}
          </div>

          {movil && listo && (
            <>
              <div role="group" aria-label={t('filtros.zona')} className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
                {[{ valor: 'todas', etiqueta: tp('plano.todas'), n: vistas.length }, ...zonas.map((z) => ({ valor: z.nombre, etiqueta: z.nombre, n: vistas.filter((v) => v.zona === z.nombre).length }))].map((c) => {
                  const activo = zonaFiltro === c.valor;
                  return (
                    <button
                      key={c.valor}
                      type="button"
                      aria-pressed={activo}
                      onClick={() => {
                        setZonaFiltro(c.valor);
                        setZonaPlano(c.valor === 'todas' ? TODAS : c.valor);
                      }}
                      className={cn(
                        'inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                        activo ? 'border-line-brand bg-brand-tint font-medium text-brand' : 'border-line-strong bg-surface text-fg',
                      )}
                    >
                      {activo && <Check aria-hidden="true" className="size-3.5" strokeWidth={2} />}
                      {c.etiqueta} {c.n}
                    </button>
                  );
                })}
              </div>
              <LeyendaEstadosMesa conteos={conteos} seleccion={estadosFiltro} onSeleccionChange={setEstadosFiltro} className="-mx-4 rounded-none border-x-0 px-4" />
            </>
          )}

          {chips.length > 0 && (
            <FilterChips chips={chips} onQuitar={(c) => (c === 'zona' ? setZonaFiltro('todas') : setEstadosFiltro([]))} onLimpiarTodo={limpiarFiltros} />
          )}
        </div>
      )}

      {listo && !editando && (
        <SolicitudesMesaBanda
          solicitudes={solicitudes.solicitudes}
          nombreMesa={(id) => mesaPorId.get(id)?.name ?? ''}
          ahora={ahora}
          enCurso={solicitudes.enCurso}
          onAtender={atenderSolicitud}
          onVerMesa={irACuenta}
        />
      )}

      {cuerpo()}

      {/* Celular: hoja de la mesa (870:582569) */}
      <Sheet open={!!vistaHoja} onOpenChange={(o) => !o && setHojaId(null)}>
        <SheetContent side="bottom" hideCloseButton className="rounded-t-2xl border-line bg-surface px-4 pb-6 pt-3" aria-describedby={undefined}>
          <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-line-strong" />
          <SheetTitle className="sr-only">{vistaHoja?.nombre ?? ''}</SheetTitle>
          {vistaHoja && resumenDe(vistaHoja, true)}
        </SheetContent>
      </Sheet>
      <ActionSheet abierto={!!accionesHoja} onAbiertoChange={(o) => !o && setAccionesHoja(null)} titulo={accionesHoja?.name ?? ''} acciones={accionesHoja ? accionesMesa(accionesHoja) : []} />

      {/* Abrir mesa (D1 / T1) */}
      <AbrirMesaFlujo
        abierto={!!mesaParaAbrir}
        onAbiertoChange={(o) => !o && setMesaParaAbrir(null)}
        mesa={mesaParaAbrir ? { id: mesaParaAbrir.id, nombre: mesaParaAbrir.name, zona: mesaParaAbrir.zone ?? null, capacidad: mesaParaAbrir.capacity } : null}
        reserva={mesaParaAbrir ? reservasActivas.get(mesaParaAbrir.id) : undefined}
        onVerReserva={() => {
          const m = mesaParaAbrir;
          setMesaParaAbrir(null);
          if (m) setMesaReservada(m);
        }}
        tableta={tableta}
        onAbierta={() => {
          const id = mesaParaAbrir?.id;
          setMesaParaAbrir(null);
          if (id) irACuenta(id);
          void cargarDatos();
        }}
      />

      <LoteMesasDialog
        abierto={showLote}
        onAbiertoChange={setShowLote}
        zonas={zonaLote ? [zonaLote, ...zonas.map((z) => z.nombre).filter((z) => z !== zonaLote)] : zonas.map((z) => z.nombre)}
        desdeSugerido={siguienteNumero}
        onCrear={async (d) => {
          try {
            await crearMesasEnLote({ ...d, prefijo: tp('editor.prefijoMesa') });
            toast.success(tp('toast.lote', { n: d.cantidad }));
            await cargarDatos();
          } catch (e) {
            toast.error(tp('errores.lote'));
            throw e;
          }
        }}
      />

      <Dialogo
        abierto={crearZona}
        onAbiertoChange={setCrearZona}
        titulo={tp('vacio.crearZona')}
        icono={Layers}
        ancho={440}
        primario={{
          etiqueta: tp('vacio.crearYAgregar'),
          deshabilitada: nombreZonaNueva.trim() === '',
          onClick: () => {
            setCrearZona(false);
            setZonaLote(nombreZonaNueva.trim());
            setShowLote(true);
          },
        }}
      >
        <FormField etiqueta={tp('editor.zona.nombre')} ayuda={tp('vacio.zonaAyuda')}>
          {(c) => (
            <input
              id={c.id}
              autoFocus
              value={nombreZonaNueva}
              maxLength={40}
              onChange={(e) => setNombreZonaNueva(e.target.value)}
              className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          )}
        </FormField>
      </Dialogo>

      <MesaFormDialog
        open={showMesaForm && !mesaEditar}
        onOpenChange={(open) => {
          setShowMesaForm(open);
          if (!open) setMesaEditar(null);
        }}
        onSubmit={handleCrearMesa}
        zonas={zonas.map((z) => z.nombre)}
      />
      <MesaFormDialog open={!!mesaEditar} onOpenChange={(open) => !open && setMesaEditar(null)} onSubmit={handleEditarMesa} mesa={mesaEditar} zonas={zonas.map((z) => z.nombre)} />

      <ZonasManager
        open={showZonasManager}
        onOpenChange={setShowZonasManager}
        zonas={zonasMesas}
        onEditarZona={(a, b) => conRecarga(() => MesasService.actualizarZona(a, b), tp('toast.zonaRenombrada', { zona: b }), tp('errores.guardar'))}
        onEliminarZona={(z) => conRecarga(() => MesasService.eliminarZona(z), tp('toast.zonaEliminada'), tp('errores.guardar'))}
      />
      <CombinarMesasDialog
        open={showCombinar}
        onOpenChange={setShowCombinar}
        mesas={mesas}
        onCombinar={(principal, otras) => conRecarga(() => MesasService.combinarMesas(principal, otras), tp('toast.combinadas'), tp('errores.guardar'))}
      />
      <MoverPedidoDialog open={showMover} onOpenChange={setShowMover} mesas={mesas} onMover={(s, d) => conRecarga(() => MesasService.moverPedido(s, d), tp('toast.movida'), tp('errores.guardar'))} />
      <HistorialMesasDialog open={showHistorial} onOpenChange={setShowHistorial} />

      <ConfirmDialog
        open={!!mesaEliminar}
        onOpenChange={(open) => !open && setMesaEliminar(null)}
        title={t('eliminar.titulo')}
        description={t('eliminar.descripcion', { mesa: mesaEliminar?.name ?? '' })}
        confirmLabel={t('eliminar.confirmar')}
        cancelLabel={t('comun.cancelar')}
        variant="destructive"
        onConfirm={handleEliminarMesa}
      />

      <LiberarMesaDialog
        abierto={!!mesaParaLiberar}
        onAbiertoChange={(open) => !open && setMesaParaLiberar(null)}
        tableId={mesaParaLiberar?.id ?? null}
        mesaNombre={mesaParaLiberar?.name}
        cajaAbierta
        onCobrar={() => {
          const id = mesaParaLiberar?.id;
          setMesaParaLiberar(null);
          if (id) router.push(`/app/pos/mesas/${id}?cobrar=1`);
        }}
        onLiberada={handleMesaLiberada}
      />

      <ReservaMesaPanel
        mesa={mesaReservada}
        activa={reservaDelPanel}
        onAbiertoChange={(open) => !open && setMesaReservada(null)}
        onSentar={handleSentarReserva}
        onCambiarMesa={() => setShowCambiarMesaReserva(true)}
        onNoSePresento={() => setConfirmarNoShow(true)}
        ocupado={accionReservaEnCurso}
      />
      <CambiarMesaReservaDialog
        activa={reservaDelPanel}
        abierto={showCambiarMesaReserva && !!reservaDelPanel}
        onAbiertoChange={setShowCambiarMesaReserva}
        mesasNoDisponibles={mesasNoDisponibles}
        onConfirmar={handleCambiarMesaReserva}
      />
      <ConfirmDialog
        open={confirmarNoShow && !!reservaDelPanel}
        onOpenChange={(open) => !open && setConfirmarNoShow(false)}
        title={t('reserva.noShowTitulo')}
        description={t('reserva.noShowDescripcion', { nombre: reservaDelPanel?.reserva.customer_name ?? '', mesa: mesaReservada?.name ?? '' })}
        confirmLabel={t('reserva.noShowConfirmar')}
        cancelLabel={t('comun.cancelar')}
        variant="destructive"
        loading={accionReservaEnCurso}
        onConfirm={handleNoSePresento}
      />

      <MesaQrDialog abierto={!!qr} onAbiertoChange={(abierto) => !abierto && setQr(null)} mesas={qr?.mesas ?? []} titulo={qr?.titulo ?? ''} />

      <Dialogo
        abierto={!!mesaParaComensales}
        onAbiertoChange={(open) => !open && setMesaParaComensales(null)}
        titulo={t('comensales.tituloEditar', { mesa: mesaParaComensales?.name ?? '' })}
        icono={Users}
        ancho={440}
        primario={{ etiqueta: t('comun.guardar'), onClick: () => void handleActualizarComensales(), deshabilitada: comensales === null }}
      >
        <FormField etiqueta={t('comensales.numero')} ayuda={t('comensales.capacidad', { n: mesaParaComensales?.capacity ?? 0 })}>
          {() => <CampoNumero valor={comensales} onValorChange={setComensales} minimo={1} maximo={mesaParaComensales?.capacity || 20} decimales={0} alinear="izquierda" />}
        </FormField>
      </Dialogo>
    </div>
  );
}
