'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Settings, GitMerge, MoveRight, RefreshCw, Layers, MoreVertical, LogOut, Users, ArrowLeft, UtensilsCrossed, CheckCircle, Clock, Hash, List, Map } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MesaCard } from '@/components/pos/mesas/MesaCard';
import { MesaFormDialog } from '@/components/pos/mesas/MesaFormDialog';
import { ZonasManager } from '@/components/pos/mesas/ZonasManager';
import { CombinarMesasDialog } from '@/components/pos/mesas/CombinarMesasDialog';
import { MoverPedidoDialog } from '@/components/pos/mesas/MoverPedidoDialog';
import { MesasPagination } from '@/components/pos/mesas/MesasPagination';
import { MesasService } from '@/components/pos/mesas/mesasService';
import { MesasFloorMap } from '@/components/pos/mesas/MesasFloorMap';
import type { TableWithSession, MesaFormData, RestaurantTable } from '@/components/pos/mesas/types';

export default function MesasPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [mesas, setMesas] = useState<TableWithSession[]>([]);
  const [zonas, setZonas] = useState<string[]>([]);
  const [zonaFiltro, setZonaFiltro] = useState<string>('todas');
  const [isLoading, setIsLoading] = useState(true);

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Estados de modales
  const [showMesaForm, setShowMesaForm] = useState(false);
  const [showZonasManager, setShowZonasManager] = useState(false);
  const [showCombinar, setShowCombinar] = useState(false);
  const [showMover, setShowMover] = useState(false);
  const [mesaEditar, setMesaEditar] = useState<RestaurantTable | null>(null);
  const [mesaEliminar, setMesaEliminar] = useState<RestaurantTable | null>(null);
  const [mesaSeleccionada, setMesaSeleccionada] = useState<string | null>(null);
  const [mesaParaComensales, setMesaParaComensales] = useState<TableWithSession | null>(null);
  const [comensales, setComensales] = useState(2);
  
  // Estados para abrir sesión
  const [mesaParaAbrirSesion, setMesaParaAbrirSesion] = useState<TableWithSession | null>(null);
  const [comensalesNuevaSesion, setComensalesNuevaSesion] = useState(2);
  
  // Modo de combinación rápida
  const [modoCombinar, setModoCombinar] = useState(false);
  const [mesasParaCombinar, setMesasParaCombinar] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  // Cargar datos iniciales
  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setIsLoading(true);
    try {
      const [mesasData, zonasData] = await Promise.all([
        MesasService.obtenerMesasConSesiones(),
        MesasService.obtenerZonas(),
      ]);

      setMesas(mesasData);
      setZonas(zonasData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las mesas',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrar mesas por zona
  const mesasFiltradas =
    zonaFiltro === 'todas'
      ? mesas
      : zonaFiltro === 'sin-zona'
      ? mesas.filter((m) => !m.zone)
      : mesas.filter((m) => m.zone === zonaFiltro);

  // Calcular paginación
  const totalPages = Math.ceil(mesasFiltradas.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const mesasPaginadas = mesasFiltradas.slice(startIndex, endIndex);

  // Resetear página cuando cambia el filtro
  useEffect(() => {
    setCurrentPage(1);
  }, [zonaFiltro, pageSize]);

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

  const handleLiberarMesa = async (mesa: TableWithSession) => {
    try {
      await MesasService.liberarMesa(mesa.id);
      await cargarDatos();
      toast({
        title: 'Mesa liberada',
        description: `Mesa ${mesa.name} liberada exitosamente`,
      });
    } catch (error: any) {
      console.error('Error liberando mesa:', error);
      toast({
        title: 'Error al liberar mesa',
        description: error?.message || 'No se pudo liberar la mesa',
        variant: 'destructive',
      });
    }
  };

  const handleActualizarComensales = async () => {
    if (!mesaParaComensales?.session?.id) return;

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
    if (!mesaParaAbrirSesion) return;

    try {
      await MesasService.abrirSesion(mesaParaAbrirSesion.id, {
        customers: comensalesNuevaSesion
      });
      await cargarDatos();
      toast({
        title: 'Sesión abierta',
        description: `Mesa ${mesaParaAbrirSesion.name} ahora está ocupada`,
      });
      setMesaParaAbrirSesion(null);
      // Navegar a la mesa
      router.push(`/app/pos/mesas/${mesaParaAbrirSesion.id}`);
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
    } catch (error) {
      // El error ya se maneja en handleCombinarMesas
    }
  };

  const handleSavePositions = async (batch: { id: string; position_x: number; position_y: number }[]) => {
    try {
      await MesasService.actualizarPosiciones(batch);
      await cargarDatos();
      toast({ title: 'Posiciones guardadas', description: 'El plano se actualizó correctamente' });
    } catch {
      toast({ title: 'Error', description: 'No se pudieron guardar las posiciones', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/pos">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <UtensilsCrossed className="h-6 w-6 text-blue-600" />
              </div>
              Plano de Mesas
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              POS / Mesas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle Lista / Mapa */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className={viewMode === 'list' ? 'bg-white dark:bg-gray-700 shadow-sm' : ''}
            >
              <List className="h-4 w-4 mr-1" />
              Lista
            </Button>
            <Button
              variant={viewMode === 'map' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('map')}
              className={viewMode === 'map' ? 'bg-white dark:bg-gray-700 shadow-sm' : ''}
            >
              <Map className="h-4 w-4 mr-1" />
              Mapa
            </Button>
          </div>
          <Button variant="outline" size="icon" onClick={cargarDatos}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setShowMesaForm(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Mesa
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <div className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {mesas.filter((m) => m.state === 'free').length}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Libres</p>
              </div>
            </div>
          </div>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <div className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <Users className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {mesas.filter((m) => m.state === 'occupied').length}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Ocupadas</p>
              </div>
            </div>
          </div>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <div className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {mesas.filter((m) => m.session?.status === 'bill_requested').length}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Con Cuenta</p>
              </div>
            </div>
          </div>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <div className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Hash className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {mesas.length}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* === VISTA MAPA === */}
      {viewMode === 'map' && (
        <MesasFloorMap
          mesas={mesasFiltradas}
          onSavePositions={handleSavePositions}
          onMesaClick={(mesa) => handleMesaClick(mesa)}
        />
      )}

      {/* === VISTA LISTA === */}
      {viewMode === 'list' && (
      <>
      {/* Acciones rápidas */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowZonasManager(true)}>
              <Layers className="h-4 w-4 mr-2" />
              Gestionar Zonas
            </Button>
            <Button 
              variant={modoCombinar ? "default" : "outline"}
              onClick={handleToggleModoCombinar}
              className={modoCombinar ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
            >
              <GitMerge className="h-4 w-4 mr-2" />
              {modoCombinar ? 'Cancelar Combinación' : 'Combinar Mesas'}
            </Button>
            <Button variant="outline" onClick={() => setShowMover(true)}>
              <MoveRight className="h-4 w-4 mr-2" />
              Mover Pedido
            </Button>
          </div>

          {/* Barra de acción cuando está en modo combinar */}
          {modoCombinar && mesasParaCombinar.length > 0 && (
            <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 px-4 py-2 rounded-lg border border-blue-200 dark:border-blue-800">
              <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                {mesasParaCombinar.length} {mesasParaCombinar.length === 1 ? 'mesa seleccionada' : 'mesas seleccionadas'}
              </span>
              <Button
                size="sm"
                onClick={handleCombinarRapido}
                disabled={mesasParaCombinar.length < 2}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Combinar Ahora
              </Button>
            </div>
          )}
        </div>

        {/* Instrucciones cuando está en modo combinar */}
        {modoCombinar && (
          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-md">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              <strong>Modo Combinar:</strong> Selecciona las mesas haciendo clic en los checkboxes. 
              La primera mesa seleccionada será la principal (recibirá todos los pedidos).
            </p>
          </div>
        )}
      </Card>

      {/* Filtro por zona */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Filtrar por zona:
        </span>
        <Select value={zonaFiltro} onValueChange={setZonaFiltro}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las zonas</SelectItem>
            <SelectItem value="sin-zona">Sin zona</SelectItem>
            {zonas.map((zona) => (
              <SelectItem key={zona} value={zona}>
                {zona}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Grid de Mesas Organizado por Zonas */}
      {mesasFiltradas.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            No hay mesas para mostrar
          </p>
          <Button onClick={() => setShowMesaForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Crear Primera Mesa
          </Button>
        </Card>
      ) : (
        <>
          <div className="space-y-6">
            {/* Organizar mesas por zona */}
            {zonaFiltro === 'todas' ? (
              // Mostrar todas las zonas
              <>
                {/* Mesas sin zona */}
                {mesasPaginadas.filter(m => !m.zone).length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                    <Layers className="h-5 w-5 text-gray-500" />
                    Sin zona
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {mesasPaginadas.filter(m => !m.zone).map((mesa) => (
                      <MesaCardWithMenu
                        key={mesa.id}
                        mesa={mesa}
                        onEdit={() => {
                          setMesaEditar(mesa);
                          setShowMesaForm(true);
                        }}
                        onLiberar={() => handleLiberarMesa(mesa)}
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
                    ))}
                  </div>
                </div>
              )}

                {/* Mesas agrupadas por zona */}
                {zonas.map(zona => {
                  const mesasZona = mesasPaginadas.filter(m => m.zone === zona);
                  if (mesasZona.length === 0) return null;

                return (
                  <div key={zona}>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                      <Layers className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      {zona}
                      <Badge variant="secondary" className="ml-2">
                        {mesasZona.length} {mesasZona.length === 1 ? 'mesa' : 'mesas'}
                      </Badge>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {mesasZona.map((mesa) => (
                        <MesaCardWithMenu
                          key={mesa.id}
                          mesa={mesa}
                          onEdit={() => {
                            setMesaEditar(mesa);
                            setShowMesaForm(true);
                          }}
                          onLiberar={() => handleLiberarMesa(mesa)}
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
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            // Mostrar zona específica
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {mesasPaginadas.map((mesa) => (
                <MesaCardWithMenu
                  key={mesa.id}
                  mesa={mesa}
                  onEdit={() => {
                    setMesaEditar(mesa);
                    setShowMesaForm(true);
                  }}
                  onLiberar={() => handleLiberarMesa(mesa)}
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
              ))}
            </div>
          )}
        </div>

        {/* Paginación */}
        {mesasFiltradas.length > 0 && (
          <Card className="p-4">
            <MesasPagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={mesasFiltradas.length}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          </Card>
        )}
      </>
      )}
      </>
      )}

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

      <AlertDialog
        open={!!mesaEliminar}
        onOpenChange={() => setMesaEliminar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar mesa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La mesa {mesaEliminar?.name}{' '}
              será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEliminarMesa}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para editar comensales */}
      <Dialog open={!!mesaParaComensales} onOpenChange={(open) => !open && setMesaParaComensales(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Comensales - {mesaParaComensales?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="comensales">Número de comensales</Label>
              <Input
                id="comensales"
                type="number"
                min={1}
                max={mesaParaComensales?.capacity || 20}
                value={comensales}
                onChange={(e) => setComensales(parseInt(e.target.value) || 1)}
                className="text-lg"
              />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Capacidad máxima: {mesaParaComensales?.capacity} personas
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMesaParaComensales(null)}>
              Cancelar
            </Button>
            <Button onClick={handleActualizarComensales}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para abrir sesión de mesa */}
      <Dialog open={!!mesaParaAbrirSesion} onOpenChange={(open) => !open && setMesaParaAbrirSesion(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir Mesa - {mesaParaAbrirSesion?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="comensalesNuevaSesion">Número de comensales</Label>
              <Input
                id="comensalesNuevaSesion"
                type="number"
                min={1}
                max={mesaParaAbrirSesion?.capacity || 20}
                value={comensalesNuevaSesion}
                onChange={(e) => setComensalesNuevaSesion(parseInt(e.target.value) || 1)}
                className="text-lg"
              />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Capacidad máxima: {mesaParaAbrirSesion?.capacity} personas
              </p>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Se creará una nueva sesión y la mesa pasará a estado <strong>ocupada</strong>.
                Después podrás agregar productos desde el detalle de la mesa.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMesaParaAbrirSesion(null)}>
              Cancelar
            </Button>
            <Button onClick={handleAbrirSesion} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              Abrir Mesa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Componente para Mesa con menú contextual
interface MesaCardWithMenuProps {
  mesa: TableWithSession;
  onClick: () => void;
  onEdit: () => void;
  onLiberar: () => void;
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
  onEditarComensales,
  modoCombinar = false,
  isSelected = false,
  selectionIndex,
  onToggleSelect
}: MesaCardWithMenuProps) {
  const handleClick = (e: React.MouseEvent) => {
    if (modoCombinar && mesa.session) {
      e.stopPropagation();
      onToggleSelect?.();
    } else {
      onClick();
    }
  };

  return (
    <div 
      className={`relative group ${modoCombinar && mesa.session ? 'cursor-pointer' : ''} ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
      onClick={handleClick}
    >
      <MesaCard mesa={mesa} onClick={!modoCombinar ? onClick : undefined} />
      
      {/* Checkbox en modo combinar */}
      {modoCombinar && mesa.session && (
        <div className="absolute top-2 left-2 z-20 flex flex-col items-center gap-1">
          <div 
            className={`flex items-center justify-center h-8 w-8 rounded-md border-2 transition-all shadow-lg ${
              isSelected 
                ? selectionIndex === 0
                  ? 'bg-green-600 border-green-600'
                  : 'bg-blue-600 border-blue-600'
                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-blue-400'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.();
            }}
          >
            {isSelected ? (
              <span className="text-white font-bold text-sm">
                {selectionIndex !== undefined ? selectionIndex + 1 : '✓'}
              </span>
            ) : (
              <div className="h-3 w-3 rounded border border-gray-400" />
            )}
          </div>
          {isSelected && selectionIndex === 0 && (
            <Badge className="bg-green-600 text-white text-[10px] px-1 py-0">
              Principal
            </Badge>
          )}
        </div>
      )}
      
      {/* Menú contextual (solo si no está en modo combinar) */}
      {!modoCombinar && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="secondary"
                className="h-8 w-8 p-0 bg-white dark:bg-gray-800 shadow-md"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Settings className="h-4 w-4 mr-2" />
                Editar Mesa
              </DropdownMenuItem>

              {mesa.session && (
                <>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditarComensales();
                    }}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Editar Comensales
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`¿Liberar ${mesa.name}? Se cerrarán todas las sesiones activas.`)) {
                        onLiberar();
                      }
                    }}
                    className="text-red-600 dark:text-red-400"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Liberar Mesa
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
