/**
 * Componente de filtros avanzados para notificaciones y alertas del sistema
 * Incluye filtrado por tipo, canal, severidad, módulo, estado, fechas y búsqueda
 */

'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { cn, debounce } from '@/utils/Utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { 
  Filter,
  ChevronDown,
  ChevronRight,
  X,
  Search,
  Calendar as CalendarIcon,
  RotateCcw,
  Mail,
  MessageSquare,
  Smartphone,
  Bell,
  AlertTriangle,
  Info,
  XCircle,
  AlertCircle,
  Package,
  Users,
  DollarSign,
  Building2,
  Shield
} from 'lucide-react';
// import { format } from 'date-fns';
// import { es } from 'date-fns/locale';
import type { 
  NotificationFilter,
  SystemAlertFilter,
  NotificationChannel,
  AlertSeverity,
  SourceModule 
} from '@/types/notification';

/**
 * Props para NotificacionesFilters
 */
interface NotificacionesFiltersProps {
  /** Tipo de filtros */
  type: 'notifications' | 'alerts';
  /** Filtros actuales */
  filters: NotificationFilter | SystemAlertFilter;
  /** Función para actualizar filtros */
  onFiltersChange: (filters: NotificationFilter | SystemAlertFilter) => void;
  /** Si está colapsado por defecto */
  defaultCollapsed?: boolean;
  /** Clase CSS adicional */
  className?: string;
}

/**
 * Configuración de canales de notificación
 */
const CHANNELS_CONFIG: Record<NotificationChannel, {
  label: string;
  icon: React.ReactNode;
  color: string;
}> = {
  email: {
    label: 'Email',
    icon: <Mail className="w-4 h-4" />,
    color: 'text-blue-600',
  },
  sms: {
    label: 'SMS',
    icon: <MessageSquare className="w-4 h-4" />,
    color: 'text-green-600',
  },
  push: {
    label: 'Push',
    icon: <Smartphone className="w-4 h-4" />,
    color: 'text-purple-600',
  },

  whatsapp: {
    label: 'WhatsApp',
    icon: <MessageSquare className="w-4 h-4" />,
    color: 'text-green-600',
  },
  webhook: {
    label: 'Webhook',
    icon: <Bell className="w-4 h-4" />,
    color: 'text-gray-600',
  },
};

/**
 * Configuración de severidad de alertas
 */
const SEVERITY_CONFIG: Record<AlertSeverity, {
  label: string;
  icon: React.ReactNode;
  color: string;
}> = {
  info: {
    label: 'Información',
    icon: <Info className="w-4 h-4" />,
    color: 'text-blue-600',
  },
  warning: {
    label: 'Advertencia',
    icon: <AlertTriangle className="w-4 h-4" />,
    color: 'text-yellow-600',
  },
  error: {
    label: 'Error',
    icon: <XCircle className="w-4 h-4" />,
    color: 'text-red-600',
  },
  critical: {
    label: 'Crítico',
    icon: <AlertCircle className="w-4 h-4" />,
    color: 'text-red-700',
  },
};

/**
 * Configuración de módulos del sistema
 */
const MODULES_CONFIG: Record<SourceModule, {
  label: string;
  icon: React.ReactNode;
  color: string;
}> = {
  sistema: {
    label: 'Sistema',
    icon: <Shield className="w-4 h-4" />,
    color: 'text-gray-600',
  },
  ventas: {
    label: 'Ventas',
    icon: <DollarSign className="w-4 h-4" />,
    color: 'text-green-600',
  },
  inventario: {
    label: 'Inventario',
    icon: <Package className="w-4 h-4" />,
    color: 'text-blue-600',
  },
  pms: {
    label: 'PMS',
    icon: <Building2 className="w-4 h-4" />,
    color: 'text-purple-600',
  },
  rrhh: {
    label: 'RR.HH.',
    icon: <Users className="w-4 h-4" />,
    color: 'text-orange-600',
  },
  crm: {
    label: 'CRM',
    icon: <Users className="w-4 h-4" />,
    color: 'text-indigo-600',
  },
  finanzas: {
    label: 'Finanzas',
    icon: <DollarSign className="w-4 h-4" />,
    color: 'text-emerald-600',
  },
};

/**
 * Componente de filtros avanzados
 */
export const NotificacionesFilters: React.FC<NotificacionesFiltersProps> = ({
  type,
  filters,
  onFiltersChange,
  defaultCollapsed = false,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(!defaultCollapsed);
  
  /**
   * Estado local para el input de búsqueda (separado de los filtros)
   */
  const [searchValue, setSearchValue] = useState<string>(filters.search || '');
  
  /**
   * Estado para controlar si la búsqueda se ejecuta automáticamente o manualmente
   */
  const [autoSearch, setAutoSearch] = useState<boolean>(true);

  /**
   * Estado para el rango de fechas
   */
  const [dateRange, setDateRange] = useState<{
    from?: Date;
    to?: Date;
  }>({
    from: filters.date_from ? new Date(filters.date_from) : undefined,
    to: filters.date_to ? new Date(filters.date_to) : undefined,
  });

  /**
   * Determinar si es para notificaciones o alertas
   */
  const isNotifications = type === 'notifications';
  const isAlerts = type === 'alerts';

  /**
   * Contar filtros activos
   */
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.date_from) count++;
    if (filters.date_to) count++;
    
    if (isNotifications) {
      const notifFilters = filters as NotificationFilter;
      if (notifFilters.channel) count++;
      if (notifFilters.status) count++;
      if (notifFilters.is_read !== undefined) count++;
      if (notifFilters.source_module) count++; // Nuevo filtro por módulo
    } else {
      const alertFilters = filters as SystemAlertFilter;
      if (alertFilters.severity) count++;
      if (alertFilters.source_module) count++;
      if (alertFilters.status) count++;
    }
    
    return count;
  }, [filters, isNotifications]);

  /**
   * Ref para manejar el timeout del debounce
   */
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Efecto para sincronizar el estado local con los filtros externos
   * Solo cuando no hay búsqueda activa y está en modo automático
   */
  useEffect(() => {
    if (autoSearch && !searchTimeoutRef.current) {
      setSearchValue(filters.search || '');
    }
  }, [filters.search, autoSearch]);

  /**
   * Cleanup del timeout al desmontar el componente
   */
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Manejar cambios en el input de búsqueda
   */
  const handleSearchChange = useCallback((value: string) => {
    // Actualizar inmediatamente el estado visual
    setSearchValue(value);
    
    // Solo ejecutar la búsqueda automáticamente si autoSearch está activado
    if (autoSearch) {
      // Limpiar timeout anterior si existe
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      
      // Establecer nuevo timeout para la búsqueda
      searchTimeoutRef.current = setTimeout(() => {
        onFiltersChange({
          ...filters,
          search: value || undefined,
        });
        searchTimeoutRef.current = null;
      }, 300);
    }
  }, [filters, onFiltersChange, autoSearch]);
  
  /**
   * Ejecutar búsqueda manualmente (botón o Enter)
   */
  const executeSearch = useCallback(() => {
    // Limpiar cualquier timeout pendiente
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    
    // Ejecutar la búsqueda inmediatamente
    onFiltersChange({
      ...filters,
      search: searchValue || undefined,
    });
  }, [filters, onFiltersChange, searchValue]);
  
  /**
   * Manejar tecla Enter en el input de búsqueda
   */
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeSearch();
    }
  }, [executeSearch]);

  /**
   * Manejar cambios en filtros
   */
  const handleFilterChange = useCallback((key: string, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value || undefined,
    });
  }, [filters, onFiltersChange]);

  /**
   * Manejar cambios en el rango de fechas
   */
  const handleDateRangeChange = useCallback((newRange: { from?: Date; to?: Date }) => {
    setDateRange(newRange);
    
    const updatedFilters = {
      ...filters,
      date_from: newRange.from ? newRange.from.toISOString() : undefined,
      date_to: newRange.to ? newRange.to.toISOString() : undefined,
    };
    
    onFiltersChange(updatedFilters);
  }, [filters, onFiltersChange]);

  /**
   * Limpiar todos los filtros
   */
  const clearAllFilters = useCallback(() => {
    // Limpiar timeout de búsqueda si existe
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    
    setDateRange({});
    setSearchValue(''); // Limpiar búsqueda local
    onFiltersChange({
      page: filters.page || 1,
      limit: filters.limit || 50,
    });
  }, [filters.page, filters.limit, onFiltersChange]);

  /**
   * Renderiza los filtros específicos para notificaciones
   */
  const renderNotificationFilters = () => {
    const notifFilters = filters as NotificationFilter;
    console.log(' [NotificacionesFilters] Renderizando filtros de notificaciones:', notifFilters);
    console.log(' [NotificacionesFilters] MODULES_CONFIG disponible:', MODULES_CONFIG);

    return (
      <>
        {/* Filtro por módulo - PRIMER LUGAR para mayor visibilidad */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Módulo</Label>
          <Select
            value={notifFilters.source_module || ''}
            onValueChange={(value) => handleFilterChange('source_module', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos los módulos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos los módulos</SelectItem>
              {Object.entries(MODULES_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center space-x-2">
                    <div className={config.color}>{config.icon}</div>
                    <span>{config.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Canal */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Canal</Label>
          <Select
            value={notifFilters.channel || ''}
            onValueChange={(value) => handleFilterChange('channel', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos los canales" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos los canales</SelectItem>
              {Object.entries(CHANNELS_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center space-x-2">
                    <div className={config.color}>{config.icon}</div>
                    <span>{config.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Estado de notificación */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Estado de envío</Label>
          <Select
            value={notifFilters.status || ''}
            onValueChange={(value) => handleFilterChange('status', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos los estados</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="sent">Enviado</SelectItem>
              <SelectItem value="delivered">Entregado</SelectItem>
              <SelectItem value="failed">Fallido</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Estado de lectura */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Estado de lectura</Label>
          <Select
            value={notifFilters.is_read === undefined ? '' : notifFilters.is_read.toString()}
            onValueChange={(value) => handleFilterChange('is_read', value === '' ? undefined : value === 'true')}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todas</SelectItem>
              <SelectItem value="false">No leídas</SelectItem>
              <SelectItem value="true">Leídas</SelectItem>
            </SelectContent>
          </Select>
        </div>


      </>
    );
  };

  /**
   * Renderizar filtros para alertas del sistema
   */
  const renderAlertFilters = () => {
    const alertFilters = filters as SystemAlertFilter;

    return (
      <>
        {/* Severidad */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Severidad</Label>
          <Select
            value={alertFilters.severity || ''}
            onValueChange={(value) => handleFilterChange('severity', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todas las severidades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todas las severidades</SelectItem>
              {Object.entries(SEVERITY_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center space-x-2">
                    <div className={config.color}>{config.icon}</div>
                    <span>{config.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Módulo de origen */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Módulo</Label>
          <Select
            value={alertFilters.source_module || ''}
            onValueChange={(value) => handleFilterChange('source_module', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos los módulos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos los módulos</SelectItem>
              {Object.entries(MODULES_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center space-x-2">
                    <div className={config.color}>{config.icon}</div>
                    <span>{config.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Estado de alerta */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Estado</Label>
          <Select
            value={alertFilters.status || ''}
            onValueChange={(value) => handleFilterChange('status', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos los estados</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="active">Activa</SelectItem>
              <SelectItem value="resolved">Resuelta</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </>
    );
  };

  /**
   * Renderizar badges de filtros activos
   */
  const renderActiveFiltersBadges = () => {
    if (activeFiltersCount === 0) return null;

    const badges: React.ReactNode[] = [];

    // Búsqueda
    if (filters.search) {
      badges.push(
        <Badge key="search" variant="secondary" className="flex items-center space-x-1">
          <Search className="w-3 h-3" />
          <span>"{filters.search}"</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0 hover:bg-transparent"
            onClick={() => {
              // Limpiar timeout si existe
              if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
                searchTimeoutRef.current = null;
              }
              setSearchValue('');
              handleFilterChange('search', '');
            }}
          >
            <X className="w-3 h-3" />
          </Button>
        </Badge>
      );
    }

    // Fechas
    if (filters.date_from || filters.date_to) {
      const fromDate = filters.date_from ? new Date(filters.date_from).toLocaleDateString() : '';
      const toDate = filters.date_to ? new Date(filters.date_to).toLocaleDateString() : '';
      const dateText = fromDate && toDate ? `${fromDate} - ${toDate}` : fromDate || toDate;
      
      badges.push(
        <Badge key="dates" variant="secondary" className="flex items-center space-x-1">
          <CalendarIcon className="w-3 h-3" />
          <span>{dateText}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0 hover:bg-transparent"
            onClick={() => handleDateRangeChange({})}
          >
            <X className="w-3 h-3" />
          </Button>
        </Badge>
      );
    }

    // Filtros específicos por tipo
    if (isNotifications) {
      const notifFilters = filters as NotificationFilter;
      
      if (notifFilters.channel) {
        const config = CHANNELS_CONFIG[notifFilters.channel];
        badges.push(
          <Badge key="channel" variant="secondary" className="flex items-center space-x-1">
            <div className={config.color}>{config.icon}</div>
            <span>{config.label}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 hover:bg-transparent"
              onClick={() => handleFilterChange('channel', '')}
            >
              <X className="w-3 h-3" />
            </Button>
          </Badge>
        );
      }
      
      if (notifFilters.is_read !== undefined) {
        badges.push(
          <Badge key="read_status" variant="secondary" className="flex items-center space-x-1">
            <span>{notifFilters.is_read ? 'Leídas' : 'No leídas'}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 hover:bg-transparent"
              onClick={() => handleFilterChange('is_read', undefined)}
            >
              <X className="w-3 h-3" />
            </Button>
          </Badge>
        );
      }
      
      // Badge para filtro por módulo en notificaciones
      if (notifFilters.source_module) {
        const config = MODULES_CONFIG[notifFilters.source_module];
        badges.push(
          <Badge key="source_module" variant="secondary" className="flex items-center space-x-1">
            <div className={config.color}>{config.icon}</div>
            <span>{config.label}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 hover:bg-transparent"
              onClick={() => handleFilterChange('source_module', '')}
            >
              <X className="w-3 h-3" />
            </Button>
          </Badge>
        );
      }
    } else {
      const alertFilters = filters as SystemAlertFilter;
      
      if (alertFilters.severity) {
        const config = SEVERITY_CONFIG[alertFilters.severity];
        badges.push(
          <Badge key="severity" variant="secondary" className="flex items-center space-x-1">
            <div className={config.color}>{config.icon}</div>
            <span>{config.label}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 hover:bg-transparent"
              onClick={() => handleFilterChange('severity', '')}
            >
              <X className="w-3 h-3" />
            </Button>
          </Badge>
        );
      }
      
      if (alertFilters.source_module) {
        const config = MODULES_CONFIG[alertFilters.source_module];
        badges.push(
          <Badge key="module" variant="secondary" className="flex items-center space-x-1">
            <div className={config.color}>{config.icon}</div>
            <span>{config.label}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 hover:bg-transparent"
              onClick={() => handleFilterChange('source_module', '')}
            >
              <X className="w-3 h-3" />
            </Button>
          </Badge>
        );
      }
    }

    return (
      <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <Filter className="w-4 h-4" />
          <span>Filtros activos ({activeFiltersCount}):</span>
        </div>
        {badges}
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAllFilters}
          className="h-auto px-2 py-1 text-xs"
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          Limpiar todo
        </Button>
      </div>
    );
  };

  return (
    <div className={cn('border rounded-lg', className)}>
      <div>
        <Button 
          variant="ghost" 
          className="w-full justify-between p-4 h-auto"
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4" />
            <span className="font-medium">
              Filtros {isNotifications ? 'de Notificaciones' : 'de Alertas'}
            </span>
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeFiltersCount}
              </Badge>
            )}
          </div>
          {isOpen ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </Button>
        
        {isOpen && (
          <div className="p-4 space-y-6">
            {/* Búsqueda */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Búsqueda</Label>
                <div className="flex items-center space-x-2">
                  <Label className="text-xs text-muted-foreground">Modo:</Label>
                  <Button
                    variant={autoSearch ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAutoSearch(true)}
                    className="h-6 px-2 text-xs"
                  >
                    Automático
                  </Button>
                  <Button
                    variant={!autoSearch ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAutoSearch(false)}
                    className="h-6 px-2 text-xs"
                  >
                    Manual
                  </Button>
                </div>
              </div>
              
              <div className="flex space-x-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={`Buscar en ${isNotifications ? 'notificaciones' : 'alertas'}... ${!autoSearch ? '(Presiona Enter o click Aplicar)' : ''}`}
                    value={searchValue}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="pl-10"
                  />
                </div>
                {!autoSearch && (
                  <Button
                    onClick={executeSearch}
                    size="sm"
                    className="shrink-0"
                    disabled={searchValue === (filters.search || '')}
                  >
                    Aplicar
                  </Button>
                )}
              </div>
              
              {!autoSearch && (
                <p className="text-xs text-muted-foreground">
                  💡 En modo manual: escribe tu búsqueda y presiona <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Enter</kbd> o click <strong>Aplicar</strong>
                </p>
              )}
            </div>

            <Separator />

            {/* Filtros específicos por tipo */}
            <div className={cn(
              "grid grid-cols-1 gap-4",
              isNotifications ? "sm:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"
            )}>
              {(() => {
                console.log('📊 [NotificacionesFilters] Renderizando filtros, isNotifications:', isNotifications);
                const result = isNotifications ? renderNotificationFilters() : renderAlertFilters();
                console.log('📊 [NotificacionesFilters] Resultado de filtros:', result);
                return result;
              })()}
            </div>

            <Separator />

            {/* Rango de fechas */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Rango de fechas</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="date-from"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateRange.from && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.from ? (
                        dateRange.from.toLocaleDateString()
                      ) : (
                        'Fecha desde'
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dateRange.from}
                      onSelect={(date) => handleDateRangeChange({ ...dateRange, from: date })}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="date-to"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateRange.to && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.to ? (
                        dateRange.to.toLocaleDateString()
                      ) : (
                        'Fecha hasta'
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dateRange.to}
                      onSelect={(date) => handleDateRangeChange({ ...dateRange, to: date })}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                
                {(dateRange.from || dateRange.to) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDateRangeChange({})}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Botón para limpiar filtros */}
            {activeFiltersCount > 0 && (
              <>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    {activeFiltersCount} filtro{activeFiltersCount !== 1 ? 's' : ''} activo{activeFiltersCount !== 1 ? 's' : ''}
                  </span>
                  <Button variant="outline" size="sm" onClick={clearAllFilters}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Limpiar filtros
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Badges de filtros activos */}
      {isOpen && renderActiveFiltersBadges()}
    </div>
  );
};
