'use client';

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, X, Calendar, CreditCard, User, FileText, ArrowDownUp, Tag } from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';

interface FiltrosFacturas {
  busqueda: string;
  estado: string;
  fechaInicio?: Date;
  fechaFin?: Date;
  montoMin?: number;
  montoMax?: number;
  customer_id?: string;
  payment_method?: string;
}

interface FacturasFiltrosProps {
  onFiltrosChange?: (filtros: FiltrosFacturas) => void;
}

export function FacturasFiltros({ onFiltrosChange }: FacturasFiltrosProps = {}) {
  const [filtros, setFiltros] = useState<FiltrosFacturas>({
    busqueda: '',
    estado: 'todos',
    montoMin: undefined,
    montoMax: undefined,
    customer_id: '',
    payment_method: 'todos'
  });
  const [fechaInicio, setFechaInicio] = useState<Date | undefined>(undefined);
  const [fechaFin, setFechaFin] = useState<Date | undefined>(undefined);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [filtrosActivos, setFiltrosActivos] = useState<number>(0);
  
  // Actualiza el contador de filtros activos
  useEffect(() => {
    let contadorActivos = 0;
    if (filtros.busqueda) contadorActivos++;
    if (filtros.estado && filtros.estado !== 'todos') contadorActivos++;
    if (fechaInicio || fechaFin) contadorActivos++;
    if (filtros.montoMin || filtros.montoMax) contadorActivos++;
    if (filtros.customer_id) contadorActivos++;
    if (filtros.payment_method && filtros.payment_method !== 'todos') contadorActivos++;
    
    setFiltrosActivos(contadorActivos);
    
    // Ya no notificamos cambios automáticamente en el useEffect
    // para evitar un bucle infinito de actualizaciones
  }, [filtros, fechaInicio, fechaFin]);
  
  const toggleFiltros = () => {
    setFiltrosAbiertos(!filtrosAbiertos);
    // No necesitamos notificar al padre aquí porque solo cambia la UI
  };
  
  const limpiarFiltros = () => {
    const filtrosVacios = {
      busqueda: '',
      estado: 'todos',
      montoMin: undefined,
      montoMax: undefined,
      customer_id: '',
      payment_method: 'todos'
    };
    
    setFiltros(filtrosVacios);
    setFechaInicio(undefined);
    setFechaFin(undefined);
    
    // Notificar al componente padre después de limpiar los filtros
    if (onFiltrosChange) {
      onFiltrosChange({
        ...filtrosVacios,
        fechaInicio: undefined,
        fechaFin: undefined
      });
    }
  };
  
  // Cuando cambia un filtro, actualizamos el estado local y notificamos al padre
  const actualizarFiltro = (campo: keyof FiltrosFacturas, valor: any) => {
    const nuevosFiltros = {
      ...filtros,
      [campo]: valor
    };
    
    setFiltros(nuevosFiltros);
    
    // Notificar al componente padre después de actualizar el filtro
    if (onFiltrosChange) {
      onFiltrosChange({
        ...nuevosFiltros,
        fechaInicio,
        fechaFin
      });
    }
  };

  return (
    <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-4 bg-white dark:bg-gray-800 shadow-sm transition-all">
      <div className="flex flex-col gap-2 sm:gap-3">
        {/* Búsqueda */}
        <div className="relative flex-grow">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
          <Input
            placeholder="Buscar por número, cliente o referencia..."
            className="
              pl-9 w-full text-sm
              bg-white dark:bg-gray-900/70 
              border-gray-300 dark:border-gray-600
              text-gray-900 dark:text-gray-100
              placeholder:text-gray-500 dark:placeholder:text-gray-400
              focus-visible:ring-blue-500/60 dark:focus-visible:ring-blue-400/60
            "
            value={filtros.busqueda}
            onChange={(e) => actualizarFiltro('busqueda', e.target.value)}
          />
        </div>
        
        {/* Botones de acción */}
        <div className="flex flex-row gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant={filtrosAbiertos ? "secondary" : "outline"}
                  size="sm"
                  onClick={toggleFiltros}
                  className="
                    flex items-center justify-center gap-2 flex-1 sm:flex-initial relative
                    bg-white dark:bg-gray-800 
                    border-gray-300 dark:border-gray-600
                    hover:bg-gray-50 dark:hover:bg-gray-700
                    text-gray-700 dark:text-gray-200
                    transition-all
                  "
                >
                  <Filter className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm">Filtros</span>
                  {filtrosActivos > 0 && (
                    <Badge 
                      variant="default" 
                      className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs font-bold bg-blue-600 dark:bg-blue-500"
                    >
                      {filtrosActivos}
                    </Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-gray-900 dark:bg-gray-700 text-white">
                <p className="text-xs">{filtrosActivos > 0 ? `${filtrosActivos} filtros aplicados` : 'Sin filtros aplicados'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <Select 
            value={filtros.estado} 
            onValueChange={(value) => actualizarFiltro('estado', value)}
          >
            <SelectTrigger className="
              flex-1 sm:min-w-[160px] sm:max-w-[200px] text-sm
              bg-white dark:bg-gray-800 
              border-gray-300 dark:border-gray-600
              text-gray-900 dark:text-gray-100
            ">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <SelectItem value="todos" className="text-gray-900 dark:text-gray-100">Todos los estados</SelectItem>
              <SelectItem value="draft" className="text-gray-900 dark:text-gray-100">Borrador</SelectItem>
              <SelectItem value="issued" className="text-gray-900 dark:text-gray-100">Emitida</SelectItem>
              <SelectItem value="paid" className="text-gray-900 dark:text-gray-100">Pagada</SelectItem>
              <SelectItem value="partial" className="text-gray-900 dark:text-gray-100">Pago parcial</SelectItem>
              <SelectItem value="void" className="text-gray-900 dark:text-gray-100">Anulada</SelectItem>
              <SelectItem value="overdue" className="text-gray-900 dark:text-gray-100">Vencida</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {filtrosAbiertos && (
        <div className="animate-in fade-in-0 zoom-in-95 duration-200 ease-out">
          <Separator className="my-4 opacity-50" />
          
          {/* Primera fila de filtros - Estado y Método de pago */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mt-3 mb-4 sm:mb-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Tag size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Estado de factura</p>
              </div>
              <Select 
                value={filtros.estado} 
                onValueChange={(valor) => actualizarFiltro('estado', valor)}
              >
                <SelectTrigger className="w-full text-sm bg-white dark:bg-gray-900/70 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <SelectItem value="todos" className="text-gray-900 dark:text-gray-100">Todos los estados</SelectItem>
                  <SelectItem value="draft" className="text-gray-900 dark:text-gray-100">Borrador</SelectItem>
                  <SelectItem value="issued" className="text-gray-900 dark:text-gray-100">Emitida</SelectItem>
                  <SelectItem value="paid" className="text-gray-900 dark:text-gray-100">Pagada</SelectItem>
                  <SelectItem value="partial" className="text-gray-900 dark:text-gray-100">Pago parcial</SelectItem>
                  <SelectItem value="void" className="text-gray-900 dark:text-gray-100">Anulada</SelectItem>
                  <SelectItem value="overdue" className="text-gray-900 dark:text-gray-100">Vencida</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CreditCard size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Método de pago</p>
              </div>
              <Select
                value={filtros.payment_method}
                onValueChange={(valor) => actualizarFiltro('payment_method', valor)}
              >
                <SelectTrigger className="w-full text-sm bg-white dark:bg-gray-900/70 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                  <SelectValue placeholder="Todos los métodos de pago" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <SelectItem value="todos" className="text-gray-900 dark:text-gray-100">Todos los métodos de pago</SelectItem>
                  <SelectItem value="cash" className="text-gray-900 dark:text-gray-100">Efectivo</SelectItem>
                  <SelectItem value="transfer" className="text-gray-900 dark:text-gray-100">Transferencia bancaria</SelectItem>
                  <SelectItem value="card" className="text-gray-900 dark:text-gray-100">Tarjeta crédito/débito</SelectItem>
                  <SelectItem value="check" className="text-gray-900 dark:text-gray-100">Cheque</SelectItem>
                  <SelectItem value="credit" className="text-gray-900 dark:text-gray-100">Crédito</SelectItem>
                  <SelectItem value="stripe" className="text-gray-900 dark:text-gray-100">Stripe</SelectItem>
                  <SelectItem value="paypal" className="text-gray-900 dark:text-gray-100">PayPal</SelectItem>
                  <SelectItem value="mp" className="text-gray-900 dark:text-gray-100">MercadoPago</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Segunda fila de filtros - Periodo de emisión y Cliente */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Periodo de emisión</p>
              </div>
              <div className="grid grid-cols-2 gap-2 items-start">
                <div>
                  <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-1">Desde</p>
                  <DatePicker
                    date={fechaInicio}
                    onSelect={(date) => {
                      setFechaInicio(date);
                      if (onFiltrosChange) {
                        onFiltrosChange({
                          ...filtros,
                          fechaInicio: date,
                          fechaFin
                        });
                      }
                    }}
                  />
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-1">Hasta</p>
                  <DatePicker
                    date={fechaFin}
                    onSelect={(date) => {
                      setFechaFin(date);
                      if (onFiltrosChange) {
                        onFiltrosChange({
                          ...filtros,
                          fechaInicio,
                          fechaFin: date
                        });
                      }
                    }}
                  />
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium flex items-center gap-2">
                <User size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <span className="text-gray-700 dark:text-gray-300">Cliente</span>
              </label>
              <Input 
                placeholder="ID o nombre del cliente" 
                className="
                  text-sm w-full
                  bg-white dark:bg-gray-900/70 
                  border-gray-300 dark:border-gray-600
                  text-gray-900 dark:text-gray-100
                  placeholder:text-gray-500 dark:placeholder:text-gray-400
                " 
                value={filtros.customer_id}
                onChange={(e) => actualizarFiltro('customer_id', e.target.value)}
              />
            </div>
          </div>
          
          {/* Tercera fila - Rango de monto */}
          <div className="grid grid-cols-1 gap-4 sm:gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Rango de monto</p>
              </div>
              <div className="flex flex-row gap-2 items-center">
                <Input 
                  type="number" 
                  placeholder="Mínimo" 
                  className="
                    text-sm flex-1 sm:w-[150px]
                    bg-white dark:bg-gray-900/70 
                    border-gray-300 dark:border-gray-600
                    text-gray-900 dark:text-gray-100
                    placeholder:text-gray-500 dark:placeholder:text-gray-400
                  "
                  value={filtros.montoMin || ''}
                  onChange={(e) => actualizarFiltro('montoMin', e.target.value ? Number(e.target.value) : undefined)}
                />
                <span className="text-gray-500 dark:text-gray-400 text-sm">-</span>
                <Input 
                  type="number" 
                  placeholder="Máximo" 
                  className="
                    text-sm flex-1 sm:w-[150px]
                    bg-white dark:bg-gray-900/70 
                    border-gray-300 dark:border-gray-600
                    text-gray-900 dark:text-gray-100
                    placeholder:text-gray-500 dark:placeholder:text-gray-400
                  "
                  value={filtros.montoMax || ''}
                  onChange={(e) => actualizarFiltro('montoMax', e.target.value ? Number(e.target.value) : undefined)}
                />
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row justify-between gap-2 mt-4 sm:mt-6">
            <Button 
              variant="outline" 
              size="sm"
              onClick={limpiarFiltros} 
              className="
                flex items-center justify-center gap-2 w-full sm:w-auto
                bg-white dark:bg-gray-800
                border-gray-300 dark:border-gray-600
                hover:bg-gray-50 dark:hover:bg-gray-700
                text-gray-700 dark:text-gray-200
              "
            >
              <X className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm">Limpiar filtros</span>
            </Button>
            
            <Button 
              size="sm"
              className="
                flex items-center justify-center gap-2 w-full sm:w-auto
                bg-blue-600 hover:bg-blue-700
                dark:bg-blue-600 dark:hover:bg-blue-500
                text-white
              "
              onClick={() => {
                if (onFiltrosChange) {
                  onFiltrosChange({
                    ...filtros,
                    fechaInicio,
                    fechaFin
                  });
                }
              }}
            >
              <ArrowDownUp className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm">Aplicar ordenamiento</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
