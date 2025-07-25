'use client';

import { useState, useEffect } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { OrdenCompraFiltros, EstadoOrdenCompra } from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Search, Filter, Calendar as CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';

interface FiltrosOrdenesCompraProps {
  onFiltrosChange: (filtros: OrdenCompraFiltros) => void;
}

export function FiltrosOrdenesCompra({ onFiltrosChange }: FiltrosOrdenesCompraProps) {
  const [filtros, setFiltros] = useState<OrdenCompraFiltros>({
    status: [],
    dateRange: { from: null, to: null }
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [proveedores, setProveedores] = useState<{ id: number; name: string }[]>([]);
  const [sucursales, setSucursales] = useState<{ id: number; name: string }[]>([]);
  const { organization } = useOrganization();
  
  const estadosOpciones: { value: EstadoOrdenCompra; label: string; color: string }[] = [
    { value: 'draft', label: 'Borrador', color: 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200' },
    { value: 'sent', label: 'Enviada', color: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200' },
    { value: 'partial', label: 'Parcial', color: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-200' },
    { value: 'received', label: 'Recibida', color: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-200' },
    { value: 'closed', label: 'Cerrada', color: 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200' },
    { value: 'cancelled', label: 'Cancelada', color: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200' },
  ];
  
  // Cargar datos iniciales
  useEffect(() => {
    if (organization?.id) {
      cargarProveedores();
      cargarSucursales();
    }
  }, [organization?.id]);
  
  // Cargar proveedores
  const cargarProveedores = async () => {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('organization_id', organization?.id)
        .order('name');
        
      if (error) throw error;
      setProveedores(data || []);
    } catch (err) {
      console.error('Error al cargar proveedores:', err);
    }
  };
  
  // Cargar sucursales
  const cargarSucursales = async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('organization_id', organization?.id)
        .eq('is_active', true)
        .order('name');
        
      if (error) throw error;
      setSucursales(data || []);
    } catch (err) {
      console.error('Error al cargar sucursales:', err);
    }
  };
  
  // Manejar cambios en los filtros
  const handleFiltrosChange = (key: keyof OrdenCompraFiltros, value: any) => {
    setFiltros(prev => {
      const newFiltros = { ...prev, [key]: value };
      onFiltrosChange(newFiltros);
      return newFiltros;
    });
  };
  
  // Manejar cambios en el término de búsqueda
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    
    // Debounce para evitar demasiadas consultas
    const timeout = setTimeout(() => {
      setFiltros(prev => {
        const newFiltros = { ...prev, searchTerm: e.target.value };
        onFiltrosChange(newFiltros);
        return newFiltros;
      });
    }, 300);
    
    return () => clearTimeout(timeout);
  };
  
  // Manejar toggle de estado en filtros
  const handleEstadoToggle = (estado: EstadoOrdenCompra) => {
    setFiltros(prev => {
      const currentEstados = prev.status || [];
      let newEstados: EstadoOrdenCompra[];
      
      if (currentEstados.includes(estado)) {
        newEstados = currentEstados.filter(e => e !== estado);
      } else {
        newEstados = [...currentEstados, estado];
      }
      
      const newFiltros = { ...prev, status: newEstados };
      onFiltrosChange(newFiltros);
      return newFiltros;
    });
  };
  
  // Limpiar todos los filtros
  const limpiarFiltros = () => {
    setSearchTerm('');
    setFiltros({
      status: [],
      dateRange: { from: null, to: null }
    });
    onFiltrosChange({});
  };

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-grow">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar órdenes de compra..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="pl-8"
          />
        </div>
        <div className="flex gap-2">
          <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="px-3">
                <Filter className="h-4 w-4 mr-2" />
                Filtrar
                {Object.values(filtros).some(v => 
                  Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined
                ) && (
                  <Badge variant="secondary" className="ml-2 px-1 py-0 h-5">
                    {(filtros.status?.length || 0) + 
                     (filtros.supplier_id ? 1 : 0) + 
                     (filtros.branch_id ? 1 : 0) + 
                     (filtros.dateRange?.from || filtros.dateRange?.to ? 1 : 0)}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Filtros</h3>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={limpiarFiltros}
                    className="h-auto p-0 text-xs text-muted-foreground"
                  >
                    Limpiar filtros
                  </Button>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium mb-1">Estado</h4>
                  <div className="flex flex-wrap gap-1">
                    {estadosOpciones.map(estado => (
                      <div 
                        key={estado.value}
                        onClick={() => handleEstadoToggle(estado.value)}
                        className={`cursor-pointer px-2 py-1 rounded-md text-xs whitespace-nowrap ${
                          filtros.status?.includes(estado.value) 
                            ? estado.color + ' ring-1 ring-inset ring-blue-700' 
                            : 'bg-muted hover:bg-muted/80'
                        }`}
                      >
                        {estado.label}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium mb-1">Proveedor</h4>
                  <Select
                    value={filtros.supplier_id?.toString() || undefined}
                    onValueChange={(value) => 
                      handleFiltrosChange('supplier_id', value ? parseInt(value) : undefined)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos los proveedores" />
                    </SelectTrigger>
                    <SelectContent>
                      {proveedores.map(proveedor => (
                        <SelectItem key={proveedor.id} value={proveedor.id.toString()}>
                          {proveedor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium mb-1">Sucursal</h4>
                  <Select
                    value={filtros.branch_id?.toString() || undefined}
                    onValueChange={(value) => 
                      handleFiltrosChange('branch_id', value ? parseInt(value) : undefined)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todas las sucursales" />
                    </SelectTrigger>
                    <SelectContent>
                      {sucursales.map(sucursal => (
                        <SelectItem key={sucursal.id} value={sucursal.id.toString()}>
                          {sucursal.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium mb-1">Rango de fechas</h4>
                  <div className="grid gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="justify-start text-left font-normal"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {filtros.dateRange?.from ? (
                            filtros.dateRange.to ? (
                              <>
                                {format(filtros.dateRange.from, "dd/MM/yyyy")} -{" "}
                                {format(filtros.dateRange.to, "dd/MM/yyyy")}
                              </>
                            ) : (
                              format(filtros.dateRange.from, "dd/MM/yyyy")
                            )
                          ) : (
                            <span>Seleccionar fechas</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          initialFocus
                          mode="range"
                          locale={es}
                          selected={{
                            from: filtros.dateRange?.from || undefined,
                            to: filtros.dateRange?.to || undefined,
                          }}
                          onSelect={(range) => {
                            handleFiltrosChange('dateRange', {
                              from: range?.from || null,
                              to: range?.to || null
                            });
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    {(filtros.dateRange?.from || filtros.dateRange?.to) && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="mt-1"
                        onClick={() => {
                          handleFiltrosChange('dateRange', { from: null, to: null });
                        }}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Limpiar fechas
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          {Object.values(filtros).some(v => 
            Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== ''
          ) && (
            <Button 
              variant="ghost" 
              size="sm"
              className="px-3" 
              onClick={limpiarFiltros}
            >
              <X className="h-4 w-4 mr-2" />
              Limpiar
            </Button>
          )}
        </div>
      </div>
      
      {/* Mostrar filtros activos */}
      {Object.values(filtros).some(v => 
        Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== ''
      ) && (
        <div className="flex flex-wrap gap-1">
          {filtros.status && filtros.status.length > 0 && filtros.status.map(estado => {
            const estadoInfo = estadosOpciones.find(e => e.value === estado);
            return (
              <Badge 
                key={estado} 
                variant="secondary" 
                className={estadoInfo?.color}
              >
                {estadoInfo?.label}
                <X 
                  className="h-3 w-3 ml-1 cursor-pointer" 
                  onClick={() => handleEstadoToggle(estado)} 
                />
              </Badge>
            );
          })}
          
          {filtros.supplier_id && (
            <Badge variant="secondary">
              Proveedor: {proveedores.find(p => p.id === filtros.supplier_id)?.name}
              <X 
                className="h-3 w-3 ml-1 cursor-pointer" 
                onClick={() => handleFiltrosChange('supplier_id', undefined)} 
              />
            </Badge>
          )}
          
          {filtros.branch_id && (
            <Badge variant="secondary">
              Sucursal: {sucursales.find(s => s.id === filtros.branch_id)?.name}
              <X 
                className="h-3 w-3 ml-1 cursor-pointer" 
                onClick={() => handleFiltrosChange('branch_id', undefined)} 
              />
            </Badge>
          )}
          
          {(filtros.dateRange?.from || filtros.dateRange?.to) && (
            <Badge variant="secondary">
              Fechas: {filtros.dateRange.from ? format(filtros.dateRange.from, "dd/MM/yyyy") : '...'} 
              {' - '} 
              {filtros.dateRange.to ? format(filtros.dateRange.to, "dd/MM/yyyy") : '...'}
              <X 
                className="h-3 w-3 ml-1 cursor-pointer" 
                onClick={() => handleFiltrosChange('dateRange', { from: null, to: null })} 
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
