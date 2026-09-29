'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus, Settings, GitMerge, MoveRight, RefreshCw, Layers, LogOut, Users, UtensilsCrossed, LayoutGrid, Map as MapIcon, Receipt, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  PageHeader,
  BranchBadgeActiva,
  KpiCompacto,
  ListToolbar,
  SearchInput,
  FilterPanel,
  FilterChips,
  SegmentedControl,
  RowActionsMenu,
  EmptyState,
  Dialogo,
  FormField,
  CampoNumero,
  Tarjeta,
  type AccionFila,
  type ChipFiltro,
} from '@/components/kit';
import { MesaCard } from '@/components/pos/mesas/MesaCard';
import { ZonaHeader } from '@/components/pos/mesas/ZonaHeader';
import { MesaFormDialog } from '@/components/pos/mesas/MesaFormDialog';
import { ZonasManager } from '@/components/pos/mesas/ZonasManager';
import { CombinarMesasDialog } from '@/components/pos/mesas/CombinarMesasDialog';
import { MoverPedidoDialog } from '@/components/pos/mesas/MoverPedidoDialog';
import { MesasService } from '@/components/pos/mesas/mesasService';
import { PageHeaderSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import { MesasFloorMap } from '@/components/pos/mesas/MesasFloorMap';
import { HistorialMesasDialog } from '@/components/pos/mesas/HistorialMesasDialog';
import { useBranch } from '@/lib/context/BranchContext';
import type { TableWithSession, MesaFormData, RestaurantTable } from '@/components/pos/mesas/types';
import { LiberarMesaDialog, useAvisoLiberacion } from '@/components/pos/mesas/LiberarMesaDialog';
import type { ResultadoLiberacion } from '@/components/pos/mesas/liberacionMesaCliente';

export default function MesasPage() {
  const avisoLiberacion = useAvisoLiberacion();
  const t = useTranslations('posMesas');
  const router = useRouter();
  const { toast } = useToast();
  const { branchFilter, isLoading: branchLoading } = useBranch();
  const [mesas, setMesas] = useState<TableWithSession[]>([]);
  const [zonas, setZonas] = useState<string[]>([]);
  const [zonaFiltro, setZonaFiltro] = useState<string>('todas');
  const [estadoFiltro, setEstadoFiltro] = useState<'todos' | 'free' | 'occupied' | 'bill_requested' | 'reserved'>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isFirstLoadRef = useRef(true);
  const [zoneLayouts, setZoneLayouts] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({});

  // Estados de modales
  const [showMesaForm, setShowMesaForm] = useState(false);
  const [showZonasManager, setShowZonasManager] = useState(false);
  const [showCombinar, setShowCombinar] = useState(false);
  const [showMover, setShowMover] = useState(false);
  const [mesaEditar, setMesaEditar] = useState<RestaurantTable | null>(null);
  const [mesaEliminar, setMesaEliminar] = useState<RestaurantTable | null>(null);
  const [mesaParaComensales, setMesaParaComensales] = useState<TableWithSession | null>(null);
  const [mesaParaLiberar, setMesaParaLiberar] = useState<TableWithSession | null>(null);
  const [showHistorial, setShowHistorial] = useState(false);
  // `null` mientras el campo está vacío: el diálogo no deja guardar.
  const [comensales, setComensales] = useState<number | null>(2);

  // Estados para abrir sesión
  const [mesaParaAbrirSesion, setMesaParaAbrirSesion] = useState<TableWithSession | null>(null);
  const [comensalesNuevaSesion, setComensalesNuevaSesion] = useState<number | null>(2);
  
  // Modo de combinación rápida
  const [modoCombinar, setModoCombinar] = useState(false);
  const [mesasParaCombinar, setMesasParaCombinar] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  // Cargar datos iniciales y al cambiar de sucursal
  useEffect(() => {
    if (!branchLoading) {
      cargarDatos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter, branchLoading]);

  const cargarDatos = async () => {
    if (isFirstLoadRef.current) {
      setIsLoading(true);
    }
    setIsRefreshing(true);
    try {
      const [mesasData, zonasData, zoneLayoutsData] = await Promise.all([
        MesasService.obtenerMesasConSesiones(),
        MesasService.obtenerZonas(),
        MesasService.obtenerZoneLayouts(),
      ]);

      setMesas(mesasData);
      setZonas(zonasData);
      setZoneLayouts(zoneLayoutsData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las mesas',
        variant: 'destructive',
      });
    } finally {
      isFirstLoadRef.current = false;
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Filtrar mesas por zona, estado y búsqueda por nombre
  const mesasFiltradas = mesas
    .filter((m) =>
      zonaFiltro === 'todas'
        ? true
        : zonaFiltro === 'sin-zona'
        ? !m.zone
        : m.zone === zonaFiltro
    )
    .filter((m) => {
      if (estadoFiltro === 'todos') return true;
      if (estadoFiltro === 'bill_requested') return m.session?.status === 'bill_requested';
      return m.state === estadoFiltro;
    })
    .filter((m) =>
      busqueda.trim() === '' ? true : m.name.toLowerCase().includes(busqueda.trim().toLowerCase())
    );

  // Sin paginación (POS-MESAS-VISTAS §3.2): el salón se ve entero, por zonas.

  // Handlers
  const handleCrearMesa = async (data: MesaFormData) => {
    try {
      await MesasService.crearMesa(data);
      await cargarDatos();
      toast({
        title: 'Mesa creada',
        description: `Mesa ${data.name} creada exitosamente`,
      });
    } catch (error) {
      console.error('Error creando mesa:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear la mesa',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleEditarMesa = async (data: MesaFormData) => {
    if (!mesaEditar) return;

    try {
      await MesasService.actualizarMesa(mesaEditar.id, data);
      await cargarDatos();
      toast({
        title: 'Mesa actualizada',
        description: `Mesa ${data.name} actualizada exitosamente`,
      });
      setMesaEditar(null);
    } catch (error) {
      console.error('Error actualizando mesa:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la mesa',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleEliminarMesa = async () => {
    if (!mesaEliminar) return;

    try {
      await MesasService.eliminarMesa(mesaEliminar.id);
      await cargarDatos();
      toast({
        title: 'Mesa eliminada',
        description: `Mesa ${mesaEliminar.name} eliminada exitosamente`,
      });
      setMesaEliminar(null);
    } catch (error: any) {
      console.error('Error eliminando mesa:', error);
      toast({
        title: 'Error',
        description:
          error.message || 'No se pudo eliminar la mesa',
        variant: 'destructive',
      });
    }
  };

  const handleEditarZona = async (zonaAntigua: string, zonaNueva: string) => {
    try {
      await MesasService.actualizarZona(zonaAntigua, zonaNueva);
      await cargarDatos();
      toast({
        title: 'Zona actualizada',
        description: `Zona renombrada a ${zonaNueva}`,
      });
    } catch (error) {
      console.error('Error actualizando zona:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la zona',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleEliminarZona = async (zona: string) => {
    try {
      await MesasService.eliminarZona(zona);
      await cargarDatos();
      toast({
        title: 'Zona eliminada',
        description: 'Las mesas ahora están sin zona asignada',
      });
    } catch (error) {
      console.error('Error eliminando zona:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la zona',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleCombinarMesas = async (
    mesaPrincipalId: string,
    mesasACombinar: string[]
  ) => {
    try {
      await MesasService.combinarMesas(mesaPrincipalId, mesasACombinar);
      await cargarDatos();
      toast({
        title: 'Mesas combinadas',
        description: 'Las mesas han sido combinadas exitosamente',
      });
    } catch (error: any) {
      console.error('Error combinando mesas:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudieron combinar las mesas',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleMoverPedido = async (sesionId: string, mesaDestinoId: string) => {
    try {
      await MesasService.moverPedido(sesionId, mesaDestinoId);
      await cargarDatos();
      toast({
        title: 'Pedido movido',
        description: 'El pedido ha sido movido exitosamente',
      });
    } catch (error) {
      console.error('Error moviendo pedido:', error);
      toast({
        title: 'Error',
        description: 'No se pudo mover el pedido',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleSolicitarCuenta = async (mesa: TableWithSession) => {
    if (!mesa.session) return;
    try {
      await MesasService.solicitarCuenta(mesa.session.id);
      await cargarDatos();
      toast({
        title: 'Cuenta solicitada',
        description: `Se marcó ${mesa.name} para cierre de cuenta`,
      });
    } catch (error: any) {
      console.error('Error solicitando cuenta:', error);
      toast({
        title: 'Error',
        description: error?.message || 'No se pudo solicitar la cuenta',
        variant: 'destructive',
      });
    }
  };

  const handleLiberarMesa = (mesa: TableWithSession) => {
    setMesaParaLiberar(mesa);
  };

  // La mesa quedó libre desde el diálogo «Liberar mesa» (con o sin saldo).
  const handleMesaLiberada = async (resultado: ResultadoLiberacion) => {
    toast(avisoLiberacion(resultado, mesaParaLiberar?.name ?? ''));
    setMesaParaLiberar(null);
    await cargarDatos();
  };

  const handleActualizarComensales = async () => {
    if (!mesaParaComensales?.session?.id || comensales === null) return;

    try {
      await MesasService.actualizarComensales(mesaParaComensales.session.id, comensales);
      await cargarDatos();
      toast({
        title: 'Comensales actualizados',
        description: `Ahora hay ${comensales} comensales en ${mesaParaComensales.name}`,
      });
      setMesaParaComensales(null);
    } catch (error) {
      console.error('Error actualizando comensales:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron actualizar los comensales',
        variant: 'destructive',
      });
    }
  };

  const handleAbrirSesion = async () => {
    if (!mesaParaAbrirSesion || comensalesNuevaSesion === null) return;

    const mesaId = mesaParaAbrirSesion.id;
    const mesaName = mesaParaAbrirSesion.name;

    try {
      await MesasService.abrirSesion(mesaId, {
        customers: comensalesNuevaSesion
      });
      // Cerrar diálogo inmediatamente antes de navegar
      setMesaParaAbrirSesion(null);
      toast({
        title: 'Sesión abierta',
        description: `Mesa ${mesaName} ahora está ocupada`,
      });
      // Navegar a la mesa inmediatamente, sin esperar cargarDatos()
      // (la página de detalle carga su propia sesión desde la BD)
      router.push(`/app/pos/mesas/${mesaId}`);
      // Recargar datos en background para que al volver todo esté actualizado
      cargarDatos();
    } catch (error: any) {
      console.error('Error abriendo sesión:', error);
      toast({
        title: 'Error',
        description: error?.message || 'No se pudo abrir la sesión',
        variant: 'destructive',
      });
    }
  };

  const handleMesaClick = (mesa: TableWithSession) => {
    if (modoCombinar) {
      handleToggleMesaCombinar(mesa.id);
      return;
    }
    
    if (mesa.state === 'free' && !mesa.session) {
      // Mesa libre - preguntar si desea abrir sesión
      setMesaParaAbrirSesion(mesa);
      setComensalesNuevaSesion(2);
    } else {
      // Mesa ocupada - ir a detalle
      router.push(`/app/pos/mesas/${mesa.id}`);
    }
  };

  const handleToggleModoCombinar = () => {
    setModoCombinar(!modoCombinar);
    setMesasParaCombinar([]);
  };

  const handleToggleMesaCombinar = (mesaId: string) => {
    setMesasParaCombinar(prev => 
      prev.includes(mesaId) 
        ? prev.filter(id => id !== mesaId)
        : [...prev, mesaId]
    );
  };

  const handleCombinarRapido = async () => {
    if (mesasParaCombinar.length < 2) {
      toast({
        title: 'Selección insuficiente',
        description: 'Debes seleccionar al menos 2 mesas para combinar',
        variant: 'destructive',
      });
      return;
    }

    // La primera mesa seleccionada será la principal
    const [mesaPrincipal, ...mesasACombinar] = mesasParaCombinar;
    
    try {
      await handleCombinarMesas(mesaPrincipal, mesasACombinar);
      setModoCombinar(false);
      setMesasParaCombinar([]);
    } catch {
      // El error ya se maneja en handleCombinarMesas
    }
  };

  const handleSavePositions = async (batch: { id: string; position_x: number; position_y: number; rotation?: number }[]) => {
    try {
      await MesasService.actualizarPosiciones(batch);
      // Actualizar estado local sin recarga completa
      setMesas((prev) => prev.map((m) => {
        const updated = batch.find((b) => b.id === m.id);
        if (updated) {
          return {
            ...m,
            position_x: updated.position_x,
            position_y: updated.position_y,
            rotation: updated.rotation ?? m.rotation,
          };
        }
        return m;
      }));
      toast({ title: 'Posiciones guardadas', description: 'El plano se actualizó correctamente' });
    } catch {
      toast({ title: 'Error', description: 'No se pudieron guardar las posiciones', variant: 'destructive' });
    }
  };

  const handleSaveZoneLayouts = async (layouts: { zone_name: string; position_x: number; position_y: number; width: number; height: number }[]) => {
    try {
      await MesasService.guardarZoneLayouts(layouts);
      // Actualizar estado local
      const newLayouts: Record<string, { x: number; y: number; w: number; h: number }> = {};
      layouts.forEach((l) => {
        newLayouts[l.zone_name] = { x: l.position_x, y: l.position_y, w: l.width, h: l.height };
      });
      setZoneLayouts((prev) => ({ ...prev, ...newLayouts }));
    } catch {
      toast({ title: 'Error', description: 'No se pudieron guardar las zonas', variant: 'destructive' });
    }
  };

  if (branchLoading || (isLoading && mesas.length === 0)) {
    return (
      <div className="min-h-screen space-y-4 bg-canvas p-4 sm:space-y-6 sm:p-6 lg:p-8">
        <PageHeaderSkeleton />
        <CardListSkeleton cards={6} columns="1" />
      </div>
    );
  }

  // Conteos de la leyenda-filtro (interina hasta `LeyendaEstadosMesa`).
  const nLibres = mesas.filter((m) => m.state === 'free').length;
  const nOcupadas = mesas.filter((m) => m.state === 'occupied').length;
  const nCuenta = mesas.filter((m) => m.session?.status === 'bill_requested').length;
  const nReservadas = mesas.filter((m) => m.state === 'reserved').length;

  const hayFiltros = busqueda.trim() !== '' || zonaFiltro !== 'todas' || estadoFiltro !== 'todos';
  const limpiarFiltros = () => {
    setBusqueda('');
    setZonaFiltro('todas');
    setEstadoFiltro('todos');
  };
  const chips: ChipFiltro[] = [];
  if (zonaFiltro !== 'todas') {
    chips.push({ clave: 'zona', etiqueta: t('filtros.chipZona', { zona: zonaFiltro === 'sin-zona' ? t('zona.sinZona') : zonaFiltro }) });
  }
  if (estadoFiltro !== 'todos') {
    chips.push({ clave: 'estado', etiqueta: t('filtros.chipEstado', { estado: t(`estados.${estadoFiltro}`) }) });
  }

  const accionesMas: AccionFila[] = [
    { id: 'zonas', etiqueta: t('acciones.gestionarZonas'), icono: Layers, onSelect: () => setShowZonasManager(true) },
    { id: 'mover', etiqueta: t('acciones.moverPedido'), icono: MoveRight, onSelect: () => setShowMover(true) },
    {
      id: 'combinar',
      etiqueta: modoCombinar ? t('acciones.cancelarCombinacion') : t('acciones.combinar'),
      icono: GitMerge,
      onSelect: handleToggleModoCombinar,
    },
    { id: 'historial', etiqueta: t('acciones.historial'), icono: History, onSelect: () => setShowHistorial(true), separadorAntes: true },
  ];

  const tarjetasDe = (lista: TableWithSession[]) =>
    lista.map((mesa) => (
      <MesaCardWithMenu
        key={mesa.id}
        mesa={mesa}
        onEdit={() => {
          setMesaEditar(mesa);
          setShowMesaForm(true);
        }}
        onLiberar={() => handleLiberarMesa(mesa)}
        onSolicitarCuenta={() => handleSolicitarCuenta(mesa)}
        onEditarComensales={() => {
          setMesaParaComensales(mesa);
          setComensales(mesa.session?.customers || 2);
        }}
        onClick={() => handleMesaClick(mesa)}
        modoCombinar={modoCombinar}
        isSelected={mesasParaCombinar.includes(mesa.id)}
        selectionIndex={mesasParaCombinar.indexOf(mesa.id)}
        onToggleSelect={() => handleToggleMesaCombinar(mesa.id)}
      />
    ));

  const CLASES_GRILLA = 'grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';

  return (
    <div className="min-h-screen space-y-6 bg-canvas p-4 sm:p-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo', { n: mesas.length })}
        icono={UtensilsCrossed}
        cargando={isRefreshing}
        debajo={<BranchBadgeActiva />}
        acciones={
          <>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10"
              onClick={cargarDatos}
              disabled={isRefreshing}
              aria-label={t('acciones.actualizar')}
              title={t('acciones.actualizar')}
            >
              <RefreshCw aria-hidden="true" className={isRefreshing ? 'size-4 animate-spin' : 'size-4'} strokeWidth={1.5} />
            </Button>
            <RowActionsMenu orientacion="horizontal" tamano="md" acciones={accionesMas} />
            <Button className="h-10 gap-2" onClick={() => setShowMesaForm(true)}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('acciones.nuevaMesa')}
            </Button>
          </>
        }
        movil={{
          accion: (
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={t('titulo')}
              acciones={[
                { id: 'nueva', etiqueta: t('acciones.nuevaMesa'), icono: Plus, onSelect: () => setShowMesaForm(true) },
                { id: 'actualizar', etiqueta: t('acciones.actualizar'), icono: RefreshCw, onSelect: cargarDatos },
                ...accionesMas.map((a, i) => (i === 0 ? { ...a, separadorAntes: true } : a)),
              ]}
            />
          ),
        }}
      />

      {/* Leyenda-filtro por estado (interina: `LeyendaEstadosMesa` es GRANDE) */}
      <KpiCompacto
        etiqueta={t('leyenda.etiqueta')}
        cifras={[
          { id: 'todos', etiqueta: t('leyenda.todas'), valor: mesas.length, onClick: () => setEstadoFiltro('todos') },
          { id: 'free', etiqueta: t('leyenda.libres'), valor: nLibres, tono: 'exito', onClick: () => setEstadoFiltro('free') },
          { id: 'occupied', etiqueta: t('leyenda.ocupadas'), valor: nOcupadas, tono: 'peligro', onClick: () => setEstadoFiltro('occupied') },
          { id: 'bill', etiqueta: t('leyenda.porCobrar'), valor: nCuenta, tono: 'advertencia', onClick: () => setEstadoFiltro('bill_requested') },
          { id: 'reserved', etiqueta: t('leyenda.reservadas'), valor: nReservadas, tono: 'informacion', onClick: () => setEstadoFiltro('reserved') },
        ]}
      />

      {/* Barra: buscador, filtros y vista (común a cuadrícula y plano: el plano también filtra) */}
      <ListToolbar
        busqueda={
          <SearchInput
            value={busqueda}
            onChange={setBusqueda}
            onValueChange={setBusqueda}
            placeholder={t('filtros.buscar')}
            atajo={false}
          />
        }
        filtros={
          <>
            <FilterPanel conteo={chips.length} onLimpiar={() => { setZonaFiltro('todas'); setEstadoFiltro('todos'); }}>
              <FormField etiqueta={t('filtros.zona')}>
                {(c) => (
                  <Select value={zonaFiltro} onValueChange={setZonaFiltro}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">{t('filtros.todasZonas')}</SelectItem>
                      <SelectItem value="sin-zona">{t('zona.sinZona')}</SelectItem>
                      {zonas.map((zona) => (
                        <SelectItem key={zona} value={zona}>
                          {zona}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('filtros.estado')}>
                {(c) => (
                  <Select value={estadoFiltro} onValueChange={(v) => setEstadoFiltro(v as typeof estadoFiltro)}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">{t('filtros.todosEstados')}</SelectItem>
                      <SelectItem value="free">{t('estados.free')}</SelectItem>
                      <SelectItem value="occupied">{t('estados.occupied')}</SelectItem>
                      <SelectItem value="bill_requested">{t('estados.bill_requested')}</SelectItem>
                      <SelectItem value="reserved">{t('estados.reserved')}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            </FilterPanel>
            {/* SelectorVista (Figma `868:31799`): con texto en escritorio, solo icono en móvil */}
            <SegmentedControl
              etiqueta={t('vista.etiqueta')}
              tamano="md"
              valor={viewMode}
              onValorChange={setViewMode}
              className="hidden shrink-0 sm:inline-flex"
              opciones={[
                { valor: 'list', etiqueta: t('vista.cuadricula'), icono: LayoutGrid },
                { valor: 'map', etiqueta: t('vista.plano'), icono: MapIcon },
              ]}
            />
            <SegmentedControl
              etiqueta={t('vista.etiqueta')}
              tamano="md"
              valor={viewMode}
              onValorChange={setViewMode}
              className="shrink-0 sm:hidden"
              opciones={[
                { valor: 'list', etiqueta: t('vista.cuadricula'), icono: LayoutGrid, soloIcono: true },
                { valor: 'map', etiqueta: t('vista.plano'), icono: MapIcon, soloIcono: true },
              ]}
            />
          </>
        }
        chips={
          <FilterChips
            chips={chips}
            onQuitar={(c) => (c === 'zona' ? setZonaFiltro('todas') : setEstadoFiltro('todos'))}
            onLimpiarTodo={limpiarFiltros}
          />
        }
      />

      {/* Modo combinar: instrucciones y confirmación (antes dentro de «Acciones rápidas») */}
      {modoCombinar && (
        <Tarjeta
          tono="informacion"
          icono={GitMerge}
          titulo={t('combinar.titulo')}
          descripcion={t('combinar.instrucciones')}
          accion={
            <>
              {mesasParaCombinar.length > 0 && (
                <span className="text-sm font-medium text-fg">{t('combinar.seleccionadas', { n: mesasParaCombinar.length })}</span>
              )}
              <Button variant="outline" size="sm" onClick={handleToggleModoCombinar}>
                {t('acciones.cancelarCombinacion')}
              </Button>
              <Button size="sm" onClick={handleCombinarRapido} disabled={mesasParaCombinar.length < 2}>
                {t('combinar.combinarAhora')}
              </Button>
            </>
          }
        />
      )}

      {/* === VISTA MAPA === */}
      {viewMode === 'map' && (
        <MesasFloorMap
          mesas={mesasFiltradas}
          onSavePositions={handleSavePositions}
          onSaveZoneLayouts={handleSaveZoneLayouts}
          onMesaClick={(mesa) => handleMesaClick(mesa)}
          initialZoneLayouts={zoneLayouts}
        />
      )}

      {/* === VISTA CUADRÍCULA === */}
      {viewMode === 'list' &&
        (mesasFiltradas.length === 0 ? (
          hayFiltros ? (
            <EmptyState variante="search" termino={busqueda.trim() || undefined} onLimpiarFiltros={limpiarFiltros} />
          ) : (
            <EmptyState
              variante="empty"
              titulo={t('vacio.titulo')}
              descripcion={t('vacio.descripcion')}
              icono={UtensilsCrossed}
              accion={{ etiqueta: t('acciones.nuevaMesa'), icono: Plus, onClick: () => setShowMesaForm(true) }}
            />
          )
        ) : (
          <div className="space-y-6">
            {zonaFiltro === 'todas' ? (
              <>
                {/* Mesas sin zona */}
                {mesasFiltradas.some((m) => !m.zone) && (
                  <section>
                    <ZonaHeader zona={null} mesas={mesasFiltradas.filter((m) => !m.zone)} />
                    <div className={CLASES_GRILLA}>{tarjetasDe(mesasFiltradas.filter((m) => !m.zone))}</div>
                  </section>
                )}

                {/* Mesas agrupadas por zona */}
                {zonas.map((zona) => {
                  const mesasZona = mesasFiltradas.filter((m) => m.zone === zona);
                  if (mesasZona.length === 0) return null;
                  return (
                    <section key={zona}>
                      <ZonaHeader zona={zona} mesas={mesasZona} />
                      <div className={CLASES_GRILLA}>{tarjetasDe(mesasZona)}</div>
                    </section>
                  );
                })}
              </>
            ) : (
              // Zona específica
              <div className={CLASES_GRILLA}>{tarjetasDe(mesasFiltradas)}</div>
            )}
          </div>
        ))}

      {/* Modales */}
      <MesaFormDialog
        open={showMesaForm && !mesaEditar}
        onOpenChange={(open) => {
          setShowMesaForm(open);
          if (!open) setMesaEditar(null);
        }}
        onSubmit={handleCrearMesa}
        zonas={zonas}
      />

      <MesaFormDialog
        open={!!mesaEditar}
        onOpenChange={(open) => {
          if (!open) setMesaEditar(null);
        }}
        onSubmit={handleEditarMesa}
        mesa={mesaEditar}
        zonas={zonas}
      />

      <ZonasManager
        open={showZonasManager}
        onOpenChange={setShowZonasManager}
        zonas={zonas}
        onEditarZona={handleEditarZona}
        onEliminarZona={handleEliminarZona}
      />

      <CombinarMesasDialog
        open={showCombinar}
        onOpenChange={setShowCombinar}
        mesas={mesas}
        onCombinar={handleCombinarMesas}
      />

      <MoverPedidoDialog
        open={showMover}
        onOpenChange={setShowMover}
        mesas={mesas}
        onMover={handleMoverPedido}
      />

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

      <HistorialMesasDialog
        open={showHistorial}
        onOpenChange={setShowHistorial}
      />

      {/* Liberar mesa: con saldo pide resolverlo; «Cobrar ahora» abre el cobro en el detalle */}
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

      {/* Editar comensales */}
      <Dialogo
        abierto={!!mesaParaComensales}
        onAbiertoChange={(open) => !open && setMesaParaComensales(null)}
        titulo={t('comensales.tituloEditar', { mesa: mesaParaComensales?.name ?? '' })}
        icono={Users}
        ancho={440}
        primario={{ etiqueta: t('comun.guardar'), onClick: handleActualizarComensales, deshabilitada: comensales === null }}
      >
        <FormField
          etiqueta={t('comensales.numero')}
          ayuda={t('comensales.capacidad', { n: mesaParaComensales?.capacity ?? 0 })}
        >
          <CampoNumero
            valor={comensales}
            onValorChange={setComensales}
            minimo={1}
            maximo={mesaParaComensales?.capacity || 20}
            decimales={0}
            alinear="izquierda"
          />
        </FormField>
      </Dialogo>

      {/* Abrir sesión de mesa */}
      <Dialogo
        abierto={!!mesaParaAbrirSesion}
        onAbiertoChange={(open) => !open && setMesaParaAbrirSesion(null)}
        titulo={t('abrir.titulo', { mesa: mesaParaAbrirSesion?.name ?? '' })}
        descripcion={t('abrir.descripcion')}
        icono={UtensilsCrossed}
        ancho={440}
        primario={{ etiqueta: t('abrir.confirmar'), onClick: handleAbrirSesion, deshabilitada: comensalesNuevaSesion === null }}
      >
        <FormField
          etiqueta={t('comensales.numero')}
          ayuda={t('comensales.capacidad', { n: mesaParaAbrirSesion?.capacity ?? 0 })}
        >
          <CampoNumero
            valor={comensalesNuevaSesion}
            onValorChange={setComensalesNuevaSesion}
            minimo={1}
            maximo={mesaParaAbrirSesion?.capacity || 20}
            decimales={0}
            alinear="izquierda"
            autoFocus
          />
        </FormField>
      </Dialogo>
    </div>
  );
}

// Componente para Mesa con menú contextual
interface MesaCardWithMenuProps {
  mesa: TableWithSession;
  onClick: () => void;
  onEdit: () => void;
  onLiberar: () => void;
  onSolicitarCuenta?: () => void;
  onEditarComensales: () => void;
  modoCombinar?: boolean;
  isSelected?: boolean;
  selectionIndex?: number;
  onToggleSelect?: () => void;
}

function MesaCardWithMenu({
  mesa,
  onClick,
  onEdit,
  onLiberar,
  onSolicitarCuenta,
  onEditarComensales,
  modoCombinar = false,
  isSelected = false,
  selectionIndex,
  onToggleSelect
}: MesaCardWithMenuProps) {
  const t = useTranslations('posMesas');
  const handleClick = (e: React.MouseEvent) => {
    if (modoCombinar && mesa.session) {
      e.stopPropagation();
      onToggleSelect?.();
    } else {
      onClick();
    }
  };

  // Menú ⋯ siempre visible (antes solo con hover: inalcanzable en táctil).
  const acciones: AccionFila[] = [
    { id: 'editar', etiqueta: t('acciones.editarMesa'), icono: Settings, onSelect: onEdit },
    ...(mesa.session
      ? [
          ...(onSolicitarCuenta
            ? [
                {
                  id: 'cuenta',
                  etiqueta: t('acciones.solicitarCuenta'),
                  icono: Receipt,
                  onSelect: onSolicitarCuenta,
                  deshabilitada: mesa.session.status !== 'active',
                },
              ]
            : []),
          { id: 'comensales', etiqueta: t('acciones.editarComensales'), icono: Users, onSelect: onEditarComensales },
          { id: 'liberar', etiqueta: t('acciones.liberarMesa'), icono: LogOut, onSelect: onLiberar, destructiva: true, separadorAntes: true },
        ]
      : []),
  ];

  return (
    <div
      className={`relative ${modoCombinar && mesa.session ? 'cursor-pointer' : ''} ${isSelected ? 'rounded-lg ring-2 ring-brand ring-offset-2' : ''}`}
      onClick={handleClick}
    >
      <MesaCard mesa={mesa} onClick={!modoCombinar ? onClick : undefined} />

      {/* Casilla en modo combinar */}
      {modoCombinar && mesa.session && (
        <div className="absolute left-2 top-2 z-20 flex flex-col items-center gap-1">
          <button
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-label={t('combinar.seleccionar', { mesa: mesa.name })}
            className={`flex h-8 w-8 items-center justify-center rounded-md border-2 shadow-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              isSelected
                ? selectionIndex === 0
                  ? 'border-transparent bg-solid-success text-on-solid'
                  : 'border-transparent bg-brand-action text-fg-on-brand'
                : 'border-line-strong bg-surface hover:border-line-brand'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.();
            }}
          >
            {isSelected ? (
              <span className="text-sm font-bold">
                {selectionIndex !== undefined ? selectionIndex + 1 : '✓'}
              </span>
            ) : (
              <span aria-hidden="true" className="h-3 w-3 rounded border border-line-strong" />
            )}
          </button>
          {isSelected && selectionIndex === 0 && (
            <Badge tono="exito" apariencia="solido" tamano="sm">
              {t('combinar.principal')}
            </Badge>
          )}
        </div>
      )}

      {/* Menú ⋯ de la tarjeta (fuera del modo combinar); abajo a la derecha para no tapar el estado */}
      {!modoCombinar && (
        <div className="absolute bottom-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
          <RowActionsMenu orientacion="vertical" tamano="sm" titulo={mesa.name} acciones={acciones} />
        </div>
      )}
    </div>
  );
}
