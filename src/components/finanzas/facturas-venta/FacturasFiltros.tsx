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
    <div className="mb-6 space-y-4 rounded-lg border border-gray-200 dark:border-gray-800 p-4 bg-white dark:bg-gray-900 shadow-sm transition-all">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-grow">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
          <Input
            placeholder="Buscar por número, cliente o referencia..."
            className="pl-9 w-full dark:bg-gray-900/70 dark:border-gray-700 focus-visible:ring-primary/60"
            value={filtros.busqueda}
            onChange={(e) => actualizarFiltro('busqueda', e.target.value)}
          />
        </div>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant={filtrosAbiertos ? "secondary" : "outline"}
                onClick={toggleFiltros}
                className="flex items-center gap-2 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 relative transition-all"
              >
                <Filter size={16} />
                <span className="hidden sm:inline">Filtros</span>
                {filtrosActivos > 0 && (
                  <Badge 
                    variant="default" 
                    className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs font-bold"
                  >
                    {filtrosActivos}
                  </Badge>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{filtrosActivos > 0 ? `${filtrosActivos} filtros aplicados` : 'Sin filtros aplicados'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <Select 
          value={filtros.estado} 
          onValueChange={(value) => actualizarFiltro('estado', value)}
        >
          <SelectTrigger className="max-w-[180px] dark:bg-gray-800 dark:border-gray-700">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="issued">Emitida</SelectItem>
            <SelectItem value="paid">Pagada</SelectItem>
            <SelectItem value="partial">Pago parcial</SelectItem>
            <SelectItem value="void">Anulada</SelectItem>
            <SelectItem value="overdue">Vencida</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {filtrosAbiertos && (
        <div className="animate-in fade-in-0 zoom-in-95 duration-200 ease-out">
          <Separator className="my-4 opacity-50" />
          
          {/* Primera fila de filtros - Estado y Método de pago */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-3 mb-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Tag size={14} className="text-primary" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Estado de factura</p>
              </div>
              <Select 
                value={filtros.estado} 
                onValueChange={(valor) => actualizarFiltro('estado', valor)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los estados</SelectItem>
                  <SelectItem value="draft">Borrador</SelectItem>
                  <SelectItem value="issued">Emitida</SelectItem>
                  <SelectItem value="paid">Pagada</SelectItem>
                  <SelectItem value="partial">Pago parcial</SelectItem>
                  <SelectItem value="void">Anulada</SelectItem>
                  <SelectItem value="overdue">Vencida</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-primary" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Método de pago</p>
              </div>
              <Select
                value={filtros.payment_method}
                onValueChange={(valor) => actualizarFiltro('payment_method', valor)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos los métodos de pago" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los métodos de pago</SelectItem>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="transfer">Transferencia bancaria</SelectItem>
                  <SelectItem value="card">Tarjeta crédito/débito</SelectItem>
                  <SelectItem value="check">Cheque</SelectItem>
                  <SelectItem value="credit">Crédito</SelectItem>
                  <SelectItem value="stripe">Stripe</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                  <SelectItem value="mp">MercadoPago</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Segunda fila de filtros - Periodo de emisión y Cliente */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-primary" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Periodo de emisión</p>
              </div>
              <div className="grid grid-cols-1 gap-2 items-start">
                <div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">Desde</p>
                  <div className="w-[120px]">
                    <DatePicker
                      date={fechaInicio}
                      onSelect={(date) => {
                        setFechaInicio(date);
                        // Notificar cambio inmediatamente
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
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">Hasta</p>
                  <div className="w-[120px]">
                    <DatePicker
                      date={fechaFin}
                      onSelect={(date) => {
                        setFechaFin(date);
                        // Notificar cambio inmediatamente
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
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <User size={14} className="text-primary" />
                <span className="text-gray-700 dark:text-gray-300">Cliente</span>
              </label>
              <Input 
                placeholder="ID o nombre del cliente" 
                className="dark:bg-gray-900/70 dark:border-gray-700 w-full" 
                value={filtros.customer_id}
                onChange={(e) => actualizarFiltro('customer_id', e.target.value)}
              />
            </div>
          </div>
          
          {/* Tercera fila - Rango de monto */}
          <div className="grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-1 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CreditCard size={14} className="text-primary" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Rango de monto</p>
              </div>
              <div className="flex flex-row gap-2 items-center">
                <Input 
                  type="number" 
                  placeholder="Mínimo" 
                  className="dark:bg-gray-900/70 dark:border-gray-700 w-[150px]"
                  value={filtros.montoMin || ''}
                  onChange={(e) => actualizarFiltro('montoMin', e.target.value ? Number(e.target.value) : undefined)}
                />
                <span className="text-gray-500 dark:text-gray-400 mx-1">-</span>
                <Input 
                  type="number" 
                  placeholder="Máximo" 
                  className="dark:bg-gray-900/70 dark:border-gray-700 w-[150px]"
                  value={filtros.montoMax || ''}
                  onChange={(e) => actualizarFiltro('montoMax', e.target.value ? Number(e.target.value) : undefined)}
                />
              </div>
            </div>
          </div>
          
          <div className="flex justify-between mt-6">
            <Button 
              variant="outline" 
              size="sm"
              onClick={limpiarFiltros} 
              className="flex items-center gap-2 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
            >
              <X size={14} />
              <span>Limpiar filtros</span>
            </Button>
            
            <Button 
              size="sm"
              className="flex items-center gap-2"
              onClick={() => {
                // Forzar la aplicación de filtros (útil si no se han notificado todos los cambios)
                if (onFiltrosChange) {
                  onFiltrosChange({
                    ...filtros,
                    fechaInicio,
                    fechaFin
                  });
                }
              }}
            >
              <ArrowDownUp size={14} />
              <span>Aplicar ordenamiento</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
