"use client";

import React from "react";
import { Badge } from "@/components/pos/badge";
import { Button } from "@/components/pos/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/pos/dropdown-menu";
import { Clock, Users, Coffee, MoreVertical, MoveRight } from "lucide-react";
import { useRouter } from "next/navigation";

// Tipo de mesa con todos los datos necesarios
export interface TableViewProps {
  id: number;
  name: string;
  zone: string;
  capacity: number;
  state: 'free' | 'occupied' | 'reserved' | 'bill_requested';
  timeOccupied?: string;
  customers?: number;
  server_name?: string;
  position_x?: number;
  position_y?: number;
  onOpenSession: (tableId: number) => void;
  onRequestBill: (tableId: number) => void;
  onCloseSession: (tableId: number) => void;
  onCancelReservation: (tableId: number) => void;
  onMoveTable?: (tableId: number) => void;
  onCombineTables?: (tableId: number) => void;
  onSplitTable?: (tableId: number) => void;
  size?: 'sm' | 'md' | 'lg';
  interactive?: boolean;
}

export const TableView = ({
  id,
  name,
  zone,
  capacity,
  state,
  timeOccupied,
  customers,
  server_name,
  position_x,
  position_y,
  onOpenSession,
  onRequestBill,
  onCloseSession,
  onCancelReservation,
  onMoveTable,
  onCombineTables,
  onSplitTable,
  size = 'md',
  interactive = true,
}: TableViewProps) => {
  const router = useRouter();
  
  // Función para obtener variant del Badge según estado
  const getBadgeVariant = (estado: string) => {
    switch (estado) {
      case 'free': return 'success';
      case 'occupied': return 'warning';
      case 'reserved': return 'info';
      case 'bill_requested': return 'destructive';
      default: return 'default';
    }
  };

  // Texto para estado
  const getEstadoTexto = (estado: string) => {
    switch (estado) {
      case 'free': return 'Libre';
      case 'occupied': return 'Ocupada';
      case 'reserved': return 'Reservada';
      case 'bill_requested': return 'Cuenta solicitada';
      default: return 'Desconocido';
    }
  };
  
  // Estilos según tamaño
  const getSizeClasses = () => {
    switch (size) {
      case 'sm': return 'p-2 min-h-[80px] min-w-[80px]';
      case 'lg': return 'p-4 min-h-[150px] min-w-[150px]';
      default: return 'p-3 min-h-[120px] min-w-[120px]';
    }
  };
  
  // Clases para el borde según el estado
  const getBorderClasses = () => {
    switch (state) {
      case 'free': return 'border-green-300 dark:border-green-800';
      case 'occupied': return 'border-yellow-300 dark:border-yellow-800';
      case 'reserved': return 'border-blue-300 dark:border-blue-800';
      case 'bill_requested': return 'border-red-300 dark:border-red-800';
      default: return 'border-gray-200 dark:border-gray-700';
    }
  };

  // Clases para el fondo según el estado
  const getBackgroundClasses = () => {
    switch (state) {
      case 'free': return 'bg-green-50 dark:bg-green-900/20';
      case 'occupied': return 'bg-yellow-50 dark:bg-yellow-900/20';
      case 'reserved': return 'bg-blue-50 dark:bg-blue-900/20';
      case 'bill_requested': return 'bg-red-50 dark:bg-red-900/20';
      default: return 'bg-gray-50 dark:bg-gray-800/50';
    }
  };

  return (
    <div
      className={`flex flex-col border-2 rounded-lg transition-all ${getSizeClasses()} ${getBorderClasses()} ${getBackgroundClasses()} ${interactive ? 'hover:shadow-md cursor-pointer' : ''}`}
      style={{
        position: position_x && position_y ? 'absolute' : 'relative',
        top: position_y ? `${position_y}px` : 'auto',
        left: position_x ? `${position_x}px` : 'auto',
      }}
    >
      <div className="flex justify-between items-center mb-1">
        <h3 className={`font-medium ${size === 'sm' ? 'text-sm' : 'text-base'} dark:text-gray-200`}>
          {name}
        </h3>
        <div className="flex items-center gap-1">
          <Badge variant={getBadgeVariant(state)} className={size === 'sm' ? 'text-xs py-0 px-1' : ''}>
            {size === 'sm' ? getEstadoTexto(state).charAt(0) : getEstadoTexto(state)}
          </Badge>
          {interactive && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <span className="sr-only">Abrir menú</span>
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push(`/app/pos/mesa/${id}`)}>
                  Ver detalle
                </DropdownMenuItem>
                {state === 'free' && (
                  <DropdownMenuItem onClick={() => onOpenSession(id)}>
                    Abrir sesión
                  </DropdownMenuItem>
                )}
                {state === 'occupied' && (
                  <>
                    <DropdownMenuItem onClick={() => onRequestBill(id)}>
                      Solicitar cuenta
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onCloseSession(id)}>
                      Cerrar sesión
                    </DropdownMenuItem>
                  </>
                )}
                {state === 'bill_requested' && (
                  <DropdownMenuItem onClick={() => onCloseSession(id)}>
                    Cerrar sesión
                  </DropdownMenuItem>
                )}
                {state === 'reserved' && (
                  <>
                    <DropdownMenuItem onClick={() => onOpenSession(id)}>
                      Ocupar mesa
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onCancelReservation(id)}>
                      Cancelar reserva
                    </DropdownMenuItem>
                  </>
                )}
                {onMoveTable && (
                  <DropdownMenuItem onClick={() => onMoveTable(id)}>
                    Mover mesa <MoveRight className="ml-2 h-3 w-3" />
                  </DropdownMenuItem>
                )}
                {onCombineTables && state !== 'free' && (
                  <DropdownMenuItem onClick={() => onCombineTables(id)}>
                    Combinar mesas
                  </DropdownMenuItem>
                )}
                {onSplitTable && state === 'occupied' && (
                  <DropdownMenuItem onClick={() => onSplitTable(id)}>
                    Dividir mesa
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <div 
        className="flex flex-col flex-grow justify-end"
        onClick={() => interactive && router.push(`/app/pos/mesa/${id}`)}
      >
        <div className={`text-gray-500 dark:text-gray-400 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
          Cap: {capacity}
        </div>
        
        {timeOccupied && (
          <div className={`font-medium mt-1 ${size === 'sm' ? 'text-xs' : 'text-sm'} text-gray-600 dark:text-gray-300`}>
            <Clock className="inline mr-1" style={{ width: size === 'sm' ? 10 : 14, height: size === 'sm' ? 10 : 14 }} /> 
            {timeOccupied}
          </div>
        )}
        
        {customers && (
          <div className={`mt-1 ${size === 'sm' ? 'text-xs' : 'text-sm'} text-gray-600 dark:text-gray-300`}>
            <Users className="inline mr-1" style={{ width: size === 'sm' ? 10 : 14, height: size === 'sm' ? 10 : 14 }} /> 
            {customers}
          </div>
        )}
        
        {server_name && (
          <div className={`mt-1 truncate ${size === 'sm' ? 'text-[10px]' : 'text-xs'} text-gray-500 dark:text-gray-400`}>
            <Coffee className="inline mr-1" style={{ width: size === 'sm' ? 10 : 12, height: size === 'sm' ? 10 : 12 }} /> 
            {server_name}
          </div>
        )}
      </div>
    </div>
  );
};
