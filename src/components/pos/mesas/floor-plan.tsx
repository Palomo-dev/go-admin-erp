"use client";

import React, { useState, useRef, useEffect } from 'react';
import { TableView, TableViewProps } from './table-view';
import { Button } from '@/components/pos/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/pos/select';
import { Grid, Move, Plus, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/pos/card';

// Omitimos las propiedades que manejará el FloorPlan
type TableFloorProps = Omit<
  TableViewProps, 
  'onOpenSession' | 'onRequestBill' | 'onCloseSession' | 'onCancelReservation' | 'onMoveTable' | 'onCombineTables' | 'onSplitTable'
>;

interface FloorPlanProps {
  tables: TableFloorProps[];
  zones: string[];
  selectedZone: string;
  onZoneChange: (zone: string) => void;
  onOpenSession: (tableId: number) => void;
  onRequestBill: (tableId: number) => void;
  onCloseSession: (tableId: number) => void;
  onCancelReservation: (tableId: number) => void;
  onMoveTable?: (tableId: number) => void;
  onCombineTables?: (tableId: number) => void;
  onSplitTable?: (tableId: number) => void;
  onTablePositionChange?: (tableId: number, x: number, y: number) => void;
  isEditing?: boolean;
}

export const FloorPlan = ({
  tables,
  zones,
  selectedZone,
  onZoneChange,
  onOpenSession,
  onRequestBill,
  onCloseSession,
  onCancelReservation,
  onMoveTable,
  onCombineTables,
  onSplitTable,
  onTablePositionChange,
  isEditing = false
}: FloorPlanProps) => {
  // Estado para la mesa seleccionada en modo edición
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const planRef = useRef<HTMLDivElement>(null);
  
  // Filtrar mesas por zona seleccionada
  const filteredTables = selectedZone === 'all' 
    ? tables 
    : tables.filter(table => table.zone === selectedZone);
  
  // Manejador de inicio de arrastre
  const handleDragStart = (e: React.MouseEvent, tableId: number, x: number, y: number) => {
    if (!isEditing) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Calcular el offset para mantener la posición relativa al cursor
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    
    setSelectedTableId(tableId);
    setIsDragging(true);
    setDragOffset({ x: offsetX, y: offsetY });
  };
  
  // Manejador del arrastre
  const handleDrag = (e: React.MouseEvent) => {
    if (!isEditing || !isDragging || !planRef.current || selectedTableId === null) return;
    
    const planRect = planRef.current.getBoundingClientRect();
    const x = e.clientX - planRect.left - dragOffset.x;
    const y = e.clientY - planRect.top - dragOffset.y;
    
    // Actualizar la posición de la mesa en tiempo real
    if (onTablePositionChange) {
      onTablePositionChange(selectedTableId, x, y);
    }
  };
  
  // Manejador del fin de arrastre
  const handleDragEnd = () => {
    setIsDragging(false);
    setSelectedTableId(null);
  };
  
  // Agregar escuchadores de eventos globales para el arrastre
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        handleDrag(e as unknown as React.MouseEvent);
      }
    };
    
    const handleMouseUp = () => {
      if (isDragging) {
        handleDragEnd();
      }
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);
  
  return (
    <Card className="w-full shadow-md dark:bg-gray-900 border dark:border-gray-800">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-bold text-blue-600 dark:text-blue-400">
            Plano de Mesas {isEditing && '(Modo Edición)'}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={selectedZone} onValueChange={onZoneChange}>
              <SelectTrigger className="w-[180px] h-8">
                <SelectValue placeholder="Seleccionar zona" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las zonas</SelectItem>
                {zones.map((zone) => (
                  <SelectItem key={zone} value={zone}>{zone || 'Sin zona'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {isEditing ? (
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Save className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Grid className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div 
          ref={planRef}
          className={`relative w-full min-h-[600px] border rounded-lg p-4 ${
            isEditing 
              ? 'bg-blue-50 dark:bg-blue-900/10 border-dashed border-blue-300 dark:border-blue-700/50' 
              : 'bg-gray-50 dark:bg-gray-800/30'
          }`}
        >
          {/* Mostrar plano de mesas */}
          {filteredTables.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-gray-500 dark:text-gray-400 mb-4">No hay mesas en esta zona</p>
              {isEditing && (
                <Button variant="outline" size="sm" className="gap-1">
                  <Plus className="h-4 w-4" /> Agregar mesa
                </Button>
              )}
            </div>
          ) : (
            <>
              {filteredTables.map((table) => (
                <div 
                  key={table.id}
                  onMouseDown={(e) => handleDragStart(e, table.id, table.position_x || 0, table.position_y || 0)}
                  className={`absolute ${isEditing ? 'cursor-move' : ''}`}
                  style={{
                    top: table.position_y ?? 50 + (table.id * 10) % 400,
                    left: table.position_x ?? 50 + (table.id * 15) % 800,
                    zIndex: selectedTableId === table.id ? 10 : 1,
                    opacity: isDragging && selectedTableId === table.id ? 0.8 : 1
                  }}
                >
                  <TableView
                    {...table}
                    onOpenSession={onOpenSession}
                    onRequestBill={onRequestBill}
                    onCloseSession={onCloseSession}
                    onCancelReservation={onCancelReservation}
                    onMoveTable={onMoveTable}
                    onCombineTables={onCombineTables}
                    onSplitTable={onSplitTable}
                    interactive={!isEditing}
                  />
                  {isEditing && (
                    <div className="absolute top-0 right-0 -mt-2 -mr-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs cursor-pointer">
                      <Move className="h-3 w-3" />
                    </div>
                  )}
                </div>
              ))}
              {isEditing && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="absolute bottom-4 right-4 gap-1"
                >
                  <Plus className="h-4 w-4" /> Agregar mesa
                </Button>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
