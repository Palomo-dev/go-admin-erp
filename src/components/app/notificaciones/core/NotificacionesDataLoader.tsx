/**
 * Componente para cargar y mostrar datos de notificaciones y alertas
 * Maneja estados de carga, errores, filtros y la integración con tiempo real
 */

'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Loader2, 
  Search, 
  Filter, 
  X, 
  Calendar, 
  Tag, 
  User,
  AlertCircle,
  Info,
  CheckCircle2,
  Clock,
  Archive
} from 'lucide-react';

import { cn } from '@/utils/Utils';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { NotificacionItem, NotificacionAlert, NotificacionesList } from '@/components/app/notificaciones';

import type { 
  Notification, 
  SystemAlert, 
  NotificationFilter, 
  SystemAlertFilter,
  NotificationChannel,
  AlertSeverity,
  SourceModule,
  ActionResult
} from '@/types/notification';

// ========================
// TIPOS Y CONFIGURACIÓN
// ========================

/**
 * Props del componente
 */
interface NotificacionesDataLoaderProps {
  type: 'notifications' | 'alerts';
  data: Notification[] | SystemAlert[];
  loading: boolean;
  filters: NotificationFilter | SystemAlertFilter;
  showFilters: boolean;
  onFiltersChange: (filters: Partial<NotificationFilter | SystemAlertFilter>) => void;
  onClearFilters: () => void;
  className?: string;
  // Props de acciones individuales
  onMarkAsRead?: (id: string) => Promise<ActionResult>;
  onDelete?: (id: string) => Promise<ActionResult>;
  onResolve?: (id: string) => Promise<ActionResult>;
  // Props de paginación
  pagination?: {
    notifications: {
      hasMore: boolean;
      loading: boolean;
      totalPages: number;
      currentPage: number;
      total: number;
    };
    alerts: {
      hasMore: boolean;
      loading: boolean;
      totalPages: number;
      currentPage: number;
      total: number;
    };
  };
  loadMoreNotifications?: () => Promise<void>;
  loadMoreAlerts?: () => Promise<void>;
  goToNotificationPage?: (page: number) => Promise<void>;
  goToAlertPage?: (page: number) => Promise<void>;
}

/**
 * Configuración de canales de notificación
 */
const NOTIFICATION_CHANNELS: Record<NotificationChannel, { label: string; color: string }> = {
  email: { label: 'Email', color: 'bg-blue-100 text-blue-800' },
  sms: { label: 'SMS', color: 'bg-green-100 text-green-800' },
  push: { label: 'Push', color: 'bg-purple-100 text-purple-800' },
  whatsapp: { label: 'WhatsApp', color: 'bg-green-100 text-green-800' },
  webhook: { label: 'Webhook', color: 'bg-gray-100 text-gray-800' },
};

/**
 * Configuración de severidad de alertas
 */
const ALERT_SEVERITIES: Record<AlertSeverity, { label: string; color: string; icon: React.ElementType }> = {
  info: { label: 'Información', color: 'bg-blue-100 text-blue-800', icon: Info },
  warning: { label: 'Advertencia', color: 'bg-yellow-100 text-yellow-800', icon: AlertCircle },
  error: { label: 'Error', color: 'bg-red-100 text-red-800', icon: AlertCircle },
  critical: { label: 'Crítico', color: 'bg-red-200 text-red-900', icon: AlertCircle },
};

/**
 * Configuración de módulos del sistema
 */
const SOURCE_MODULES: Record<SourceModule, { label: string; color: string }> = {
  sistema: { label: 'Sistema', color: 'bg-gray-100 text-gray-800' },
  ventas: { label: 'Ventas', color: 'bg-green-100 text-green-800' },
  inventario: { label: 'Inventario', color: 'bg-blue-100 text-blue-800' },
  pms: { label: 'PMS', color: 'bg-purple-100 text-purple-800' },
  rrhh: { label: 'RR.HH.', color: 'bg-orange-100 text-orange-800' },
  crm: { label: 'CRM', color: 'bg-teal-100 text-teal-800' },
  finanzas: { label: 'Finanzas', color: 'bg-indigo-100 text-indigo-800' },
};

// ========================
// COMPONENTE PRINCIPAL
// ========================

/**
 * Componente para cargar y mostrar datos de notificaciones/alertas
 */
export const NotificacionesDataLoader: React.FC<NotificacionesDataLoaderProps> = ({
  type,
  data,
  loading,
  filters,
  showFilters,
  onFiltersChange,
  onClearFilters,
  className,
  onMarkAsRead,
  onDelete,
  onResolve,
  pagination,
  loadMoreNotifications,
  loadMoreAlerts,
  goToNotificationPage,
  goToAlertPage,
}) => {
  // ========================
  // ESTADO PARA BÚSQUEDA MANUAL
  // ========================
  
  /**
   * Estado INDEPENDIENTE para el input de búsqueda 
   * 🔥 NO depende de props externas para evitar resets
   */
  const [searchValue, setSearchValue] = useState<string>('');
  
  /**
   * Ref para el input (NO CONTROLADO para evitar re-renders)
   */
  const inputRef = useRef<HTMLInputElement>(null);
  
  /**
   * Ref para mantener el valor incluso durante re-renders
   */
  const searchValueRef = useRef<string>('');
  
  /**
   * EFECTO ELIMINADO - Causaba reset del input
   * 🚫 El useEffect estaba reseteando searchValue constantemente
   */
  
  /**
   * Manejar cambios en input NO CONTROLADO
   */
  const handleSearchChange = (value: string) => {
    console.log('🔍 [handleSearchChange] INPUT NO CONTROLADO con:', value);
    
    // Solo actualizar el ref - el input maneja su propio valor
    searchValueRef.current = value;
    
    console.log('🔍 [handleSearchChange] searchValueRef.current actualizado:', searchValueRef.current);
    console.log('🔍 [handleSearchChange] Valor en DOM:', inputRef.current?.value);
  };
  
  /**
   * Ejecutar búsqueda manualmente (DESDE INPUT NO CONTROLADO)
   */
  const executeSearch = () => {
    const inputValue = inputRef.current?.value || '';
    const refValue = searchValueRef.current;
    
    console.log('⚡ [executeSearch] Valor desde DOM:', inputValue);
    console.log('⚡ [executeSearch] Valor desde ref:', refValue);
    
    onFiltersChange({ search: inputValue || undefined });
  };
  
  /**
   * Manejar tecla Enter (INMEDIATO)
   */
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    console.log('⌨️ [NotificacionesDataLoader] Tecla presionada:', e.key);
    if (e.key === 'Enter') {
      e.preventDefault();
      executeSearch();
    }
  };
  
  // ========================
  // FUNCIONES DE ACCIONES
  // ========================
  
  // Funciones de acciones (recibidas como props desde el manager)
  const markNotificationAsRead = onMarkAsRead;
  const deleteNotification = onDelete;
  const resolveAlert = onResolve;
  const deleteAlert = onDelete; // Para alertas también usamos onDelete

  // Estado local
  const [processingItems, setProcessingItems] = useState<Set<string>>(new Set());

  // ========================
  // HANDLERS Y CALLBACKS
  // ========================

  /**
   * Maneja las acciones individuales
   */
  const handleItemAction = useCallback(async (
    itemId: string,
    action: 'mark_read' | 'delete' | 'resolve'
  ) => {
    console.log(`⚡ Ejecutando acción ${action} en item:`, itemId);
    
    // Marcar como procesando
    setProcessingItems(prev => new Set(prev).add(itemId));
    
    try {
      let result: ActionResult | undefined;
      
      switch (action) {
        case 'mark_read':
          if (markNotificationAsRead) {
            result = await markNotificationAsRead(itemId);
          } else {
            console.warn('⚠️ Función markNotificationAsRead no disponible');
            return;
          }
          break;
        case 'delete':
          if (type === 'notifications') {
            if (deleteNotification) {
              result = await deleteNotification(itemId);
            } else {
              console.warn('⚠️ Función deleteNotification no disponible');
              return;
            }
          } else {
            if (deleteAlert) {
              result = await deleteAlert(itemId);
            } else {
              console.warn('⚠️ Función deleteAlert no disponible');
              return;
            }
          }
          break;
        case 'resolve':
          if (resolveAlert) {
            result = await resolveAlert(itemId);
          } else {
            console.warn('⚠️ Función resolveAlert no disponible');
            return;
          }
          break;
        default:
          throw new Error('Acción no reconocida');
      }
      
      // Procesar resultado
      if (result) {
        if (result.success) {
          console.log('✅ Acción ejecutada correctamente:', result.message);
        } else {
          console.error('❌ Error en acción:', result.message);
        }
      }
    } catch (error) {
      console.error('❌ Error en acción individual:', error);
    } finally {
      // Quitar de procesando
      setProcessingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }
  }, [type, markNotificationAsRead, deleteNotification, resolveAlert, deleteAlert]);

  /**
   * Renderiza un item de notificación
   */
  const renderNotificationItem = useCallback((notification: Notification) => {
    const isProcessing = processingItems.has(notification.id);
    const channel = NOTIFICATION_CHANNELS[notification.channel];
    
    return (
      <Card key={notification.id} className={cn(
        'transition-all duration-200',

        notification.is_read && 'opacity-70'
      )}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* Header */}
              <div className="flex items-center gap-2 mb-2">
                <Badge className={cn('text-xs', channel?.color)}>
                  {channel?.label || notification.channel}
                </Badge>
                {notification.time_ago && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {notification.time_ago}
                  </span>
                )}
                {!notification.is_read && (
                  <div className="w-2 h-2 bg-blue-500 rounded-full" />
                )}
              </div>
              
              {/* Content */}
              <div className="space-y-1">
                <h4 className="font-medium text-sm leading-tight">
                  {notification.payload?.title || 'Notificación'}
                </h4>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {notification.payload?.message || 'Sin mensaje'}
                </p>
                {notification.user_name && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {notification.user_name}
                  </p>
                )}
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-1">
              {!notification.is_read && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleItemAction(notification.id, 'mark_read')}
                  disabled={isProcessing}
                  className="h-8 px-2"
                >
                  {isProcessing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleItemAction(notification.id, 'delete')}
                disabled={isProcessing}
                className="h-8 px-2 text-destructive hover:text-destructive"
              >
                {isProcessing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }, [processingItems, handleItemAction]);

  /**
   * Renderiza un item de alerta del sistema
   */
  const renderSystemAlertItem = useCallback((alert: SystemAlert) => {
    const isProcessing = processingItems.has(alert.id);
    const severity = ALERT_SEVERITIES[alert.severity];
    const module = SOURCE_MODULES[alert.source_module];
    const SeverityIcon = severity.icon;
    
    return (
      <Card key={alert.id} className={cn(
        'transition-all duration-200',


        alert.is_resolved && 'opacity-70'
      )}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* Header */}
              <div className="flex items-center gap-2 mb-2">
                <Badge className={cn('text-xs', severity.color)}>
                  <SeverityIcon className="h-3 w-3 mr-1" />
                  {severity.label}
                </Badge>
                <Badge className={cn('text-xs', module.color)}>
                  {module.label}
                </Badge>
                {alert.time_ago && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {alert.time_ago}
                  </span>
                )}
                {alert.is_resolved && (
                  <Badge variant="outline" className="text-xs text-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Resuelto
                  </Badge>
                )}
              </div>
              
              {/* Content */}
              <div className="space-y-1">
                <h4 className="font-medium text-sm leading-tight">
                  {alert.title}
                </h4>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {alert.message}
                </p>
                {alert.resolved_by_name && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" />
                    Resuelto por: {alert.resolved_by_name}
                  </p>
                )}
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-1">
              {!alert.is_resolved && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleItemAction(alert.id, 'resolve')}
                  disabled={isProcessing}
                  className="h-8 px-2"
                >
                  {isProcessing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleItemAction(alert.id, 'delete')}
                disabled={isProcessing}
                className="h-8 px-2 text-destructive hover:text-destructive"
              >
                {isProcessing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }, [processingItems, handleItemAction]);

  /**
   * Renderiza el panel de filtros
   */
  const renderFiltersPanel = useCallback(() => {
    if (!showFilters) return null;

    return (
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filtros
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="text-destructive hover:text-destructive"
            >
              Limpiar filtros
            </Button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Filtros específicos por tipo */}
            {type === 'notifications' && (
              <>
                <div>
                  <label className="text-sm font-medium mb-2 block">Canal</label>
                  <select
                    className="w-full p-2 border rounded-md text-sm"
                    value={(filters as NotificationFilter).channel || ''}
                    onChange={(e) => onFiltersChange({ 
                      channel: e.target.value as NotificationChannel || undefined 
                    })}
                  >
                    <option value="">Todos los canales</option>
                    {Object.entries(NOTIFICATION_CHANNELS).map(([key, config]) => (
                      <option key={key} value={key}>
                        {config.label}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-2 block">Estado de lectura</label>
                  <select
                    className="w-full p-2 border rounded-md text-sm"
                    value={(filters as NotificationFilter).is_read?.toString() || ''}
                    onChange={(e) => onFiltersChange({ 
                      is_read: e.target.value ? e.target.value === 'true' : undefined 
                    })}
                  >
                    <option value="">Todas</option>
                    <option value="false">Sin leer</option>
                    <option value="true">Leídas</option>
                  </select>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-2 block">Módulo</label>
                  <select
                    className="w-full p-2 border rounded-md text-sm"
                    value={(filters as NotificationFilter).source_module || ''}
                    onChange={(e) => onFiltersChange({ 
                      source_module: e.target.value as SourceModule || undefined 
                    })}
                  >
                    <option value="">Todos los módulos</option>
                    {Object.entries(SOURCE_MODULES).map(([key, config]) => (
                      <option key={key} value={key}>
                        {config.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            
            {type === 'alerts' && (
              <>
                <div>
                  <label className="text-sm font-medium mb-2 block">Severidad</label>
                  <select
                    className="w-full p-2 border rounded-md text-sm"
                    value={(filters as SystemAlertFilter).severity || ''}
                    onChange={(e) => onFiltersChange({ 
                      severity: e.target.value as AlertSeverity || undefined 
                    })}
                  >
                    <option value="">Todas las severidades</option>
                    {Object.entries(ALERT_SEVERITIES).map(([key, config]) => (
                      <option key={key} value={key}>
                        {config.label}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-2 block">Módulo</label>
                  <select
                    className="w-full p-2 border rounded-md text-sm"
                    value={(filters as SystemAlertFilter).source_module || ''}
                    onChange={(e) => onFiltersChange({ 
                      source_module: e.target.value as SourceModule || undefined 
                    })}
                  >
                    <option value="">Todos los módulos</option>
                    {Object.entries(SOURCE_MODULES).map(([key, config]) => (
                      <option key={key} value={key}>
                        {config.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            
            {/* Búsqueda de texto */}
            <div className="space-y-2">
              <label className="text-sm font-medium mb-2 block">Buscar</label>
              
              <div className="flex space-x-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={inputRef}
                    type="text"
                    placeholder="Buscar en título o mensaje... (Presiona Enter o click Aplicar)"
                    className="pl-10 h-10"
                    onChange={(e) => {
                      console.log('🔥 [INPUT NO CONTROLADO] Valor onChange:', e.target.value);
                      handleSearchChange(e.target.value);
                    }}
                    onKeyDown={handleSearchKeyDown}
                  />
                </div>
                <Button
                  onClick={executeSearch}
                  size="sm"
                  className="shrink-0"
                  disabled={searchValue === (filters.search || '')}
                >
                  Aplicar
                </Button>
              </div>
              
              <p className="text-xs text-muted-foreground">
                💡 Escribe tu búsqueda y presiona <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Enter</kbd> o click <strong>Aplicar</strong> para buscar
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }, [showFilters, type, filters, onFiltersChange, onClearFilters]);

  // ========================
  // RENDERIZADO PRINCIPAL
  // ========================

  // Logging de render (INPUT NO CONTROLADO)
  console.log('🔍 [RENDER] Valor en DOM:', inputRef.current?.value);
  console.log('🔍 [RENDER] searchValueRef.current:', searchValueRef.current);

  return (
    <div className={cn('w-full space-y-4 overflow-visible', className)}>
      {renderFiltersPanel()}
      
      {/* Lista de items */}
      <div className="space-y-3 min-h-0 flex-1">
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        
        {!loading && data.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="flex flex-col items-center gap-2">
                <Archive className="h-8 w-8 text-muted-foreground" />
                <h4 className="font-medium">
                  No hay {type === 'notifications' ? 'notificaciones' : 'alertas'}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {type === 'notifications' 
                    ? 'No tienes notificaciones en este momento' 
                    : 'No hay alertas del sistema pendientes'
                  }
                </p>
              </div>
            </CardContent>
          </Card>
        )}
        
        {!loading && data.length > 0 && (
          <NotificacionesList
            type={type}
            items={data}
            onMarkAsRead={markNotificationAsRead ? async (id: string) => {
              console.log('📁 DataLoader onMarkAsRead wrapper INICIADO:', { id, hasFn: !!markNotificationAsRead });
              const result = await markNotificationAsRead(id);
              console.log('📁 DataLoader resultado:', result);
              console.log(result.success ? '✅ Notificación marcada como leída' : '❌ Error:', result.message);
            } : undefined}
            onDelete={deleteNotification ? async (id: string) => {
              console.log('📁 DataLoader onDelete wrapper INICIADO:', { id, hasFn: !!deleteNotification, deleteNotificationName: deleteNotification?.name });
              try {
                const result = await deleteNotification(id);
                console.log('📁 DataLoader resultado deleteNotification:', result);
                console.log(result.success ? '✅ Elemento archivado' : '❌ Error al archivar:', result.message);
                return result; // Importante: retornar el resultado
              } catch (error) {
                console.error('💥 Error en wrapper deleteNotification:', error);
                return { success: false, message: 'Error inesperado al archivar' };
              }
            } : undefined}
            onResolve={resolveAlert ? async (id: string) => {
              console.log('📁 DataLoader onResolve wrapper INICIADO:', { id, hasFn: !!resolveAlert });
              const result = await resolveAlert(id);
              console.log('📁 DataLoader resultado:', result);
              console.log(result.success ? '✅ Alerta resuelta' : '❌ Error:', result.message);
            } : undefined}
            processingIds={[]}
            searchTerm=""
            pagination={{
              currentPage: type === 'notifications'
                ? pagination?.notifications.currentPage || 1
                : pagination?.alerts.currentPage || 1,
              totalPages: type === 'notifications'
                ? pagination?.notifications.totalPages || 1
                : pagination?.alerts.totalPages || 1,
              total: type === 'notifications'
                ? pagination?.notifications.total || 0
                : pagination?.alerts.total || 0,
              limit: 10, // Límite fijo de 10 elementos por página
              onPageChange: type === 'notifications'
                ? (page: number) => { goToNotificationPage?.(page); }
                : (page: number) => { goToAlertPage?.(page); },
              loading: type === 'notifications'
                ? pagination?.notifications.loading || false
                : pagination?.alerts.loading || false,
            }}
          />
        )}
      </div>
    </div>
  );
};
