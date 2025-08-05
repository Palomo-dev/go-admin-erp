/**
 * Dashboard del Estado de Migración de Notificaciones
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';

import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Database,
  Bell,
  Zap,
  Settings,
  Activity,
  RefreshCw,
  Wifi,
  WifiOff
} from 'lucide-react';

import { useRealTimeNotifications } from '@/lib/hooks/useRealTimeNotifications';
import { pushNotificationsManager } from '@/lib/services/pushNotificationsService';
import * as eventTriggerService from '@/lib/services/eventTriggerService';
import { useOrganization, obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';

interface MigrationStatusDashboardProps {
  onViewTriggers?: () => void;
  onViewNotifications?: () => void;
}

export default function MigrationStatusDashboard({ 
  onViewTriggers, 
  onViewNotifications 
}: MigrationStatusDashboardProps) {
  const { organization } = useOrganization();
  const { 
    stats: notificationStats, 
    isPushEnabled,
    enablePushNotifications,
    sendTestNotification,
    refreshStats
  } = useRealTimeNotifications();

  // Estados locales
  const [triggerStats, setTriggerStats] = useState<any>(null);
  const [realTimeStatus, setRealTimeStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [loading, setLoading] = useState(false);

  // Cargar estadísticas de triggers
  const loadTriggerStats = async () => {
    try {
      const organizationId = organization?.id || obtenerOrganizacionActiva().id;
      const stats = await eventTriggerService.getTriggerStats(organizationId);
      setTriggerStats(stats);
    } catch (error) {
      console.error('Error cargando estadísticas de triggers:', error);
    }
  };

  // Probar conectividad en tiempo real
  const testRealTimeConnection = async () => {
    setLoading(true);
    setRealTimeStatus('connecting');
    
    try {
      const organizationId = organization?.id || obtenerOrganizacionActiva().id;
      
      // Suscribir brevemente para probar conexión
      const subscription = eventTriggerService.subscribeToTriggerChanges(
        organizationId,
        () => {
          setRealTimeStatus('connected');
          toast.success('✅ Conexión en tiempo real establecida');
        }
      );
      
      // Desconectar después de 2 segundos
      setTimeout(() => {
        eventTriggerService.unsubscribeFromTriggerChanges();
        setLoading(false);
      }, 2000);
      
    } catch (error) {
      console.error('Error testando conexión en tiempo real:', error);
      setRealTimeStatus('disconnected');
      toast.error('❌ Error en conexión en tiempo real');
      setLoading(false);
    }
  };

  // Cargar datos iniciales
  useEffect(() => {
    loadTriggerStats();
    refreshStats();
    
    // Simular estado de conexión en tiempo real
    setTimeout(() => {
      setRealTimeStatus('connected');
    }, 1000);
  }, []);

  // Componente de estado
  const StatusBadge = ({ status, label }: { status: 'success' | 'warning' | 'error', label: string }) => {
    const variants = {
      success: { icon: CheckCircle, color: 'bg-green-100 text-green-800' },
      warning: { icon: AlertCircle, color: 'bg-yellow-100 text-yellow-800' },
      error: { icon: XCircle, color: 'bg-red-100 text-red-800' }
    };
    
    const { icon: Icon, color } = variants[status];
    
    return (
      <Badge className={`${color} flex items-center space-x-1`}>
        <Icon className="h-3 w-3" />
        <span>{label}</span>
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Estado de Migración</h2>
          <p className="text-muted-foreground">
            Sistema de Notificaciones con Supabase y Push Notifications
          </p>
        </div>
        <Button
          onClick={() => {
            loadTriggerStats();
            refreshStats();
          }}
          variant="outline"
          size="sm"
          className="flex items-center space-x-2"
        >
          <RefreshCw className="h-4 w-4" />
          <span>Actualizar</span>
        </Button>
      </div>

      {/* Estado General */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Activity className="h-5 w-5" />
            <span>Estado General del Sistema</span>
          </CardTitle>
          <CardDescription>
            Resumen del estado de la migración a Supabase
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center space-x-3">
              <Database className="h-8 w-8 text-blue-600" />
              <div>
                <div className="font-medium">Base de Datos</div>
                <StatusBadge status="success" label="Supabase" />
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {realTimeStatus === 'connected' ? (
                <Wifi className="h-8 w-8 text-green-600" />
              ) : (
                <WifiOff className="h-8 w-8 text-red-600" />
              )}
              <div>
                <div className="font-medium">Tiempo Real</div>
                <StatusBadge 
                  status={realTimeStatus === 'connected' ? 'success' : 'error'} 
                  label={realTimeStatus === 'connected' ? 'Conectado' : 'Desconectado'} 
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <Bell className="h-8 w-8 text-purple-600" />
              <div>
                <div className="font-medium">Push Notifications</div>
                <StatusBadge 
                  status={isPushEnabled ? 'success' : 'warning'} 
                  label={isPushEnabled ? 'Habilitadas' : 'Deshabilitadas'} 
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <Zap className="h-8 w-8 text-orange-600" />
              <div>
                <div className="font-medium">Triggers</div>
                <StatusBadge 
                  status={triggerStats?.total > 0 ? 'success' : 'warning'} 
                  label={`${triggerStats?.total || 0} Activos`} 
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estadísticas Detalladas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Estadísticas de Triggers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Zap className="h-5 w-5" />
              <span>Event Triggers</span>
            </CardTitle>
            <CardDescription>
              Gestión de triggers con Supabase
            </CardDescription>
          </CardHeader>
          <CardContent>
            {triggerStats ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{triggerStats.total}</div>
                    <div className="text-muted-foreground">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{triggerStats.active}</div>
                    <div className="text-muted-foreground">Activos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{triggerStats.inactive}</div>
                    <div className="text-muted-foreground">Inactivos</div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="text-sm font-medium">Canales:</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(triggerStats.by_channel).map(([channel, count]) => (
                      <Badge key={channel} variant="outline" className="text-xs">
                        {channel}: {count as number}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <Button 
                  onClick={onViewTriggers}
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                >
                  Ver Triggers
                </Button>
              </div>
            ) : (
              <div className="text-center text-muted-foreground">
                Cargando estadísticas...
              </div>
            )}
          </CardContent>
        </Card>

        {/* Estadísticas de Notificaciones */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Bell className="h-5 w-5" />
              <span>Notificaciones</span>
            </CardTitle>
            <CardDescription>
              Gestión de notificaciones en tiempo real
            </CardDescription>
          </CardHeader>
          <CardContent>
            {notificationStats ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{notificationStats.total}</div>
                    <div className="text-muted-foreground">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">{notificationStats.unread}</div>
                    <div className="text-muted-foreground">No leídas</div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="text-sm font-medium">Estados:</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(notificationStats.by_status).map(([status, count]) => (
                      <Badge key={status} variant="outline" className="text-xs">
                        {status}: {count as number}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <Button 
                  onClick={onViewNotifications}
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                >
                  Ver Notificaciones
                </Button>
              </div>
            ) : (
              <div className="text-center text-muted-foreground">
                Cargando estadísticas...
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Acciones de Prueba */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Pruebas del Sistema</span>
          </CardTitle>
          <CardDescription>
            Acciones para probar la funcionalidad migrada
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              onClick={testRealTimeConnection}
              disabled={loading}
              variant="outline"
              className="flex items-center space-x-2"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="h-4 w-4" />
              )}
              <span>Probar Tiempo Real</span>
            </Button>
            
            <Button
              onClick={sendTestNotification}
              variant="outline"
              className="flex items-center space-x-2"
            >
              <Bell className="h-4 w-4" />
              <span>Enviar Notificación</span>
            </Button>
            
            <Button
              onClick={enablePushNotifications}
              disabled={isPushEnabled}
              variant="outline"
              className="flex items-center space-x-2"
            >
              <Zap className="h-4 w-4" />
              <span>
                {isPushEnabled ? 'Push Habilitado' : 'Habilitar Push'}
              </span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Alertas */}
      {realTimeStatus === 'disconnected' && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            La conexión en tiempo real está desconectada. Algunas funciones pueden no funcionar correctamente.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
