"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutGrid, Grid, Settings } from "lucide-react";
import { customToast } from "@/components/pos/custom-toast";
import { FloorPlan } from "./floor-plan";
import { TableActionsModal, TableData } from "./table-actions-modal";
import { supabase } from "@/lib/supabase/config";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface Mesa {
  id: number;
  name: string;
  zone: string;
  capacity: number;
  state: 'free' | 'occupied' | 'reserved' | 'bill_requested';
  organization_id: number;
  branch_id: number;
  position_x?: number;
  position_y?: number;
  timeOccupied?: string;
  customers?: number;
  server_name?: string;
}

interface MesasManagerProps {
  mesas: Mesa[];
  loading: boolean;
  error: string | null;
  organizationId: number | null;
  branchId: number | null;
  onLoadMesas: (orgId: number, branchId: number) => Promise<void>;
  onOpenSession: (mesa: Mesa, customerCount: number) => Promise<void>;
  onRequestBill: (mesa: Mesa) => Promise<void>;
  onCloseSession: (mesa: Mesa) => Promise<void>;
  onCancelReservation: (mesa: Mesa) => Promise<void>;
}

export function MesasManager({
  mesas,
  loading,
  error,
  organizationId,
  branchId,
  onLoadMesas,
  onOpenSession,
  onRequestBill,
  onCloseSession,
  onCancelReservation
}: MesasManagerProps) {
  const router = useRouter();
  
  // Estados para gestión de la UI
  const [viewMode, setViewMode] = useState<'grid' | 'floor'>('floor');
  const [selectedZone, setSelectedZone] = useState<string>('all');
  const [isEditing, setIsEditing] = useState(false);
  const [showOccupiedOnly, setShowOccupiedOnly] = useState(false);
  
  // Estados para modales
  const [modalOpen, setModalOpen] = useState(false);
  const [actionType, setActionType] = useState<'open' | 'combine' | 'split' | 'move'>('open');
  const [selectedMesa, setSelectedMesa] = useState<Mesa | null>(null);
  
  // Obtener zonas únicas de las mesas
  const zones = Array.from(new Set(mesas.map(mesa => mesa.zone))).filter(Boolean);
  
  // Filtrar mesas según vista y estados
  const filteredMesas = mesas
    .filter(mesa => selectedZone === 'all' || mesa.zone === selectedZone)
    .filter(mesa => !showOccupiedOnly || ['occupied', 'bill_requested'].includes(mesa.state));
    
  // Convertir mesas al formato esperado por FloorPlan
  const tablePlanProps = filteredMesas.map(mesa => ({
    id: mesa.id,
    name: mesa.name,
    zone: mesa.zone,
    capacity: mesa.capacity,
    state: mesa.state,
    position_x: mesa.position_x,
    position_y: mesa.position_y,
    timeOccupied: mesa.timeOccupied,
    customers: mesa.customers,
    server_name: mesa.server_name
  }));
  
  // Manejadores para acciones de mesas
  const handleOpenSession = (tableId: number) => {
    const mesa = mesas.find(m => m.id === tableId);
    if (mesa) {
      setSelectedMesa(mesa);
      setActionType('open');
      setModalOpen(true);
    }
  };
  
  const handleRequestBill = (tableId: number) => {
    const mesa = mesas.find(m => m.id === tableId);
    if (mesa) {
      onRequestBill(mesa);
    }
  };
  
  const handleCloseSession = (tableId: number) => {
    const mesa = mesas.find(m => m.id === tableId);
    if (mesa) {
      onCloseSession(mesa);
    }
  };
  
  const handleCancelReservation = (tableId: number) => {
    const mesa = mesas.find(m => m.id === tableId);
    if (mesa) {
      onCancelReservation(mesa);
    }
  };
  
  const handleMoveTable = (tableId: number) => {
    const mesa = mesas.find(m => m.id === tableId);
    if (mesa) {
      setSelectedMesa(mesa);
      setActionType('move');
      setModalOpen(true);
    }
  };
  
  const handleCombineTables = (tableId: number) => {
    const mesa = mesas.find(m => m.id === tableId);
    if (mesa) {
      setSelectedMesa(mesa);
      setActionType('combine');
      setModalOpen(true);
    }
  };
  
  const handleSplitTable = (tableId: number) => {
    const mesa = mesas.find(m => m.id === tableId);
    if (mesa) {
      setSelectedMesa(mesa);
      setActionType('split');
      setModalOpen(true);
    }
  };
  
  // Actualizar posición de mesa en modo edición
  const handleTablePositionChange = async (tableId: number, x: number, y: number) => {
    if (!isEditing) return;
    
    try {
      // Actualizar la mesa en Supabase
      const { error } = await supabase
        .from("restaurant_tables")
        .update({
          position_x: x,
          position_y: y
        })
        .eq("id", tableId);
      
      if (error) throw error;
      
      // Actualizar el estado local
      if (organizationId && branchId) {
        onLoadMesas(organizationId, branchId);
      }
    } catch (error: any) {
      console.error("Error al actualizar posición de mesa:", error);
      customToast.error(`Error: ${error.message || 'No se pudo actualizar la posición'}`);
    }
  };
  
  // Manejar confirmación de acciones en modal
  const handleModalConfirm = async (data: any) => {
    if (!selectedMesa) return;
    
    try {
      switch (actionType) {
        case 'open':
          await onOpenSession(selectedMesa, data.customerCount);
          break;
        case 'move':
          // TODO: Implementar mover pedidos entre mesas
          customToast.info("Funcionalidad de mover pedido disponible próximamente");
          break;
        case 'combine':
          // TODO: Implementar combinar mesas
          customToast.info("Funcionalidad de combinar mesas disponible próximamente");
          break;
        case 'split':
          // TODO: Implementar dividir cuenta de mesa
          customToast.info("Funcionalidad de dividir cuenta disponible próximamente");
          break;
      }
      
      setModalOpen(false);
    } catch (error: any) {
      console.error("Error en acción de mesa:", error);
      customToast.error(`Error: ${error.message || 'Error al procesar la acción'}`);
    }
  };
  
  // Determinar qué mesas están disponibles para acciones como combinar o mover
  const getAvailableTables = () => {
    if (!selectedMesa) return [];
    
    // Para mover pedidos, solo las mesas libres están disponibles
    if (actionType === 'move') {
      return mesas.filter(m => m.id !== selectedMesa.id && m.state === 'free');
    }
    
    // Para combinar, solo mesas ocupadas o con cuenta solicitada
    if (actionType === 'combine') {
      return mesas.filter(
        m => m.id !== selectedMesa.id && 
        (m.state === 'occupied' || m.state === 'bill_requested')
      );
    }
    
    return [];
  };
  
  // Mapeo de mesa a formato para modal de acciones
  const mesaToTableData = (mesa: Mesa): TableData => {
    return {
      id: mesa.id,
      name: mesa.name,
      zone: mesa.zone,
      capacity: mesa.capacity,
      state: mesa.state,
      timeOccupied: mesa.timeOccupied,
      customers: mesa.customers,
      server_name: mesa.server_name
    };
  };
  
  return (
    <>
      <div className="space-y-4 w-full">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-4">
            {/* Selector de modo de vista */}
            <div className="flex items-center border rounded-md shadow-sm overflow-hidden">
              <Button
                variant={viewMode === 'floor' ? 'default' : 'outline'}
                size="sm"
                className="rounded-none"
                onClick={() => setViewMode('floor')}
              >
                <Grid className="h-4 w-4 mr-2" />
                Plano
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                className="rounded-none"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="h-4 w-4 mr-2" />
                Lista
              </Button>
            </div>
            
            {/* Filtro de ocupadas */}
            <div className="flex items-center space-x-2">
              <Switch
                id="occupied-filter"
                checked={showOccupiedOnly}
                onCheckedChange={setShowOccupiedOnly}
              />
              <Label htmlFor="occupied-filter">Solo ocupadas</Label>
            </div>
          </div>
          
          <div className="flex gap-2">
            {viewMode === 'floor' && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsEditing(!isEditing)}
                className={isEditing ? 'bg-blue-100 dark:bg-blue-900' : ''}
              >
                <Settings className="h-4 w-4 mr-2" />
                {isEditing ? "Finalizar edición" : "Editar plano"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => organizationId && branchId && onLoadMesas(organizationId, branchId)}
            >
              Actualizar
            </Button>
          </div>
        </div>
        
        {/* Leyenda de estados */}
        <div className="flex gap-4 mb-4">
          <Badge variant="success">🟢 Libre</Badge>
          <Badge variant="warning">🔴 Ocupada</Badge>
          <Badge variant="info">🔵 Reservada</Badge>
          <Badge variant="destructive">⏳ Cuenta solicitada</Badge>
        </div>

        {/* Vista según modo seleccionado */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
              <p className="mt-2">Cargando mesas...</p>
            </div>
          </div>
        ) : error ? (
          <div className="p-4 border border-red-200 rounded-lg bg-red-50 text-red-500 text-center">
            <p>{error}</p>
            <button 
              onClick={() => organizationId && branchId && onLoadMesas(organizationId, branchId)}
              className="mt-2 px-4 py-2 bg-red-100 hover:bg-red-200 rounded-md text-red-800 transition-colors"
            >
              Reintentar
            </button>
          </div>
        ) : filteredMesas.length === 0 ? (
          <div className="p-4 border rounded-lg bg-blue-50 text-blue-500 text-center">
            <p>No hay mesas {selectedZone !== 'all' ? 'en esta zona' : 'configuradas'}.</p>
          </div>
        ) : (
          <>
            {viewMode === 'floor' ? (
              <FloorPlan
                tables={tablePlanProps}
                zones={zones}
                selectedZone={selectedZone}
                onZoneChange={setSelectedZone}
                onOpenSession={handleOpenSession}
                onRequestBill={handleRequestBill}
                onCloseSession={handleCloseSession}
                onCancelReservation={handleCancelReservation}
                onMoveTable={handleMoveTable}
                onCombineTables={handleCombineTables}
                onSplitTable={handleSplitTable}
                onTablePositionChange={handleTablePositionChange}
                isEditing={isEditing}
              />
            ) : (
              <div className="grid gap-4">
                <Tabs defaultValue={selectedZone === 'all' ? zones[0] || 'all' : selectedZone}>
                  <TabsList className="grid grid-cols-5">
                    <TabsTrigger 
                      value="all" 
                      onClick={() => setSelectedZone('all')}
                      className={selectedZone === 'all' ? 'data-[state=active]:bg-blue-500 data-[state=active]:text-white' : ''}
                    >
                      Todas
                    </TabsTrigger>
                    {zones.map(zone => (
                      <TabsTrigger 
                        key={zone} 
                        value={zone}
                        onClick={() => setSelectedZone(zone)}
                        className={selectedZone === zone ? 'data-[state=active]:bg-blue-500 data-[state=active]:text-white' : ''}
                      >
                        {zone}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <TabsContent value="all" className="mt-4">
                    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {filteredMesas.map(mesa => (
                        <Card key={mesa.id} className="shadow-sm">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-lg">Mesa {mesa.name}</CardTitle>
                            <Badge variant={getBadgeVariant(mesa.state)}>
                              {getEstadoTexto(mesa.state)}
                            </Badge>
                          </CardHeader>
                          <CardContent>
                            <Button
                              className="w-full"
                              onClick={() => router.push(`/app/pos/mesa/${mesa.id}`)}
                            >
                              Ver detalle
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </TabsContent>
                  {zones.map(zone => (
                    <TabsContent key={zone} value={zone} className="mt-4">
                      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                        {filteredMesas
                          .filter(mesa => mesa.zone === zone)
                          .map(mesa => (
                            <Card key={mesa.id} className="shadow-sm">
                              <CardHeader className="pb-2">
                                <CardTitle className="text-lg">Mesa {mesa.name}</CardTitle>
                                <Badge variant={getBadgeVariant(mesa.state)}>
                                  {getEstadoTexto(mesa.state)}
                                </Badge>
                              </CardHeader>
                              <CardContent>
                                <Button
                                  className="w-full"
                                  onClick={() => router.push(`/app/pos/mesa/${mesa.id}`)}
                                >
                                  Ver detalle
                                </Button>
                              </CardContent>
                            </Card>
                          ))
                        }
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Modal para acciones de mesa */}
      {selectedMesa && (
        <TableActionsModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          actionType={actionType}
          table={mesaToTableData(selectedMesa)}
          availableTables={getAvailableTables().map(mesaToTableData)}
          onConfirm={handleModalConfirm}
        />
      )}
    </>
  );
}

// Funciones auxiliares
function getBadgeVariant(estado: string) {
  switch (estado) {
    case 'free': return 'success';
    case 'occupied': return 'warning';
    case 'reserved': return 'info';
    case 'bill_requested': return 'destructive';
    default: return 'default';
  }
}

function getEstadoTexto(estado: string) {
  switch (estado) {
    case 'free': return 'Libre';
    case 'occupied': return 'Ocupada';
    case 'reserved': return 'Reservada';
    case 'bill_requested': return 'Cuenta solicitada';
    default: return 'Desconocido';
  }
}
