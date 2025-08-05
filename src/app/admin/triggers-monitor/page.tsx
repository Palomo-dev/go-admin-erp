'use client';

/**
 * 📊 DASHBOARD DE MONITOREO DE TRIGGERS AUTOMÁTICOS
 * 
 * Permite visualizar y monitorear todos los triggers automáticos
 * ejecutados en el sistema, incluyendo estadísticas y logs.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  CheckCircle2, 
  AlertCircle, 
  Activity, 
  Mail, 
  DollarSign, 
  Users, 
  Package,
  Calendar,
  RefreshCw,
  TrendingUp,
  Clock
} from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { UniversalInvoiceTriggerService } from '@/lib/services/universalInvoiceTriggerService';
import { toast } from 'sonner';

interface TriggerStat {
  type: string;
  count: number;
  lastExecuted: string | null;
  status: 'active' | 'error' | 'inactive';
  icon: any;
  description: string;
}

interface TriggerLog {
  id: string;
  title: string;
  type: string;
  created_at: string;
  source_module: string;
  metadata?: any;
}

export default function TriggersMonitorPage() {
  const [stats, setStats] = useState<TriggerStat[]>([]);
  const [logs, setLogs] = useState<TriggerLog[]>([]);
  const [universalStats, setUniversalStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const triggerTypes = [
    {
      type: 'invoice.created',
      icon: DollarSign,
      description: 'Facturas creadas automáticamente',
      color: 'bg-green-500'
    },
    {
      type: 'invoice.paid', 
      icon: CheckCircle2,
      description: 'Pagos de facturas procesados',
      color: 'bg-blue-500'
    },
    {
      type: 'inventory.low_stock',
      icon: Package,
      description: 'Alertas de stock bajo',
      color: 'bg-orange-500'
    },
    {
      type: 'user.created',
      icon: Users,
      description: 'Nuevos usuarios registrados',
      color: 'bg-purple-500'
    },
    {
      type: 'reservation.created',
      icon: Calendar,
      description: 'Reservas PMS creadas',
      color: 'bg-cyan-500'
    }
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadTriggerStats(),
        loadTriggerLogs(),
        loadUniversalStats()
      ]);
    } catch (error) {
      console.error('Error cargando datos de triggers:', error);
      toast.error('Error cargando datos de triggers');
    } finally {
      setLoading(false);
    }
  };

  const loadTriggerStats = async () => {
    try {
      const { data } = await supabase
        .from('notifications')
        .select('title, type, created_at, source_module, metadata')
        .eq('source_module', 'triggers')
        .order('created_at', { ascending: false })
        .limit(100);

      if (data) {
        const statsByType = triggerTypes.map(triggerType => {
          const triggersOfType = data.filter(n => 
            n.title.toLowerCase().includes(triggerType.type.split('.')[0]) ||
            (n.metadata && n.metadata.trigger_type === triggerType.type)
          );
          
          return {
            type: triggerType.type,
            count: triggersOfType.length,
            lastExecuted: triggersOfType[0]?.created_at || null,
            status: triggersOfType.length > 0 ? 'active' : 'inactive',
            icon: triggerType.icon,
            description: triggerType.description
          } as TriggerStat;
        });

        setStats(statsByType);
      }
    } catch (error) {
      console.error('Error cargando estadísticas de triggers:', error);
    }
  };

  const loadTriggerLogs = async () => {
    try {
      const { data } = await supabase
        .from('notifications')
        .select('id, title, type, created_at, source_module, metadata')
        .in('source_module', ['triggers', 'universal_interceptor', 'automatic_triggers'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (data) {
        setLogs(data);
      }
    } catch (error) {
      console.error('Error cargando logs de triggers:', error);
    }
  };

  const loadUniversalStats = async () => {
    try {
      const stats = await UniversalInvoiceTriggerService.getStats();
      setUniversalStats(stats);
    } catch (error) {
      console.error('Error cargando estadísticas del interceptor universal:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    toast.success('Datos actualizados');
  };

  const testUniversalInterceptor = async () => {
    try {
      await UniversalInvoiceTriggerService.testInterceptor(1); // Organización ID 1
      toast.success('Prueba del interceptor iniciada, revisa los logs');
      setTimeout(() => loadData(), 3000); // Recargar datos después de 3 segundos
    } catch (error) {
      console.error('Error probando interceptor:', error);
      toast.error('Error probando interceptor universal');
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex items-center space-x-2">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span>Cargando datos de triggers...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">📊 Monitor de Triggers Automáticos</h1>
        <div className="flex space-x-2">
          <Button 
            onClick={handleRefresh} 
            disabled={refreshing}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button onClick={testUniversalInterceptor} variant="outline">
            🧪 Probar Interceptor
          </Button>
        </div>
      </div>

      {/* Estadísticas del Interceptor Universal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Activity className="h-5 w-5 mr-2" />
            Interceptor Universal de Facturas
          </CardTitle>
          <CardDescription>
            Sistema que captura automáticamente TODAS las facturas creadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${universalStats?.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="font-medium">
                Estado: {universalStats?.isActive ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span>Interceptadas hoy: {universalStats?.interceptedToday || 0}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-gray-500" />
              <span>
                Último procesado: {
                  universalStats?.lastProcessed 
                    ? formatDateTime(universalStats.lastProcessed)
                    : 'Nunca'
                }
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="stats" className="space-y-4">
        <TabsList>
          <TabsTrigger value="stats">📈 Estadísticas</TabsTrigger>
          <TabsTrigger value="logs">📋 Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="stats" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.map((stat, index) => {
              const IconComponent = stat.icon;
              const triggerConfig = triggerTypes.find(t => t.type === stat.type);
              
              return (
                <Card key={index}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      {stat.type}
                    </CardTitle>
                    <div className={`p-2 rounded-full ${triggerConfig?.color || 'bg-gray-500'}`}>
                      <IconComponent className="h-4 w-4 text-white" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stat.count}</div>
                    <p className="text-xs text-muted-foreground">
                      {stat.description}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <Badge 
                        variant={stat.status === 'active' ? 'default' : 'secondary'}
                      >
                        {stat.status === 'active' ? 'Activo' : 'Inactivo'}
                      </Badge>
                      {stat.lastExecuted && (
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(stat.lastExecuted)}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>📋 Log de Triggers Ejecutados</CardTitle>
              <CardDescription>
                Últimos 50 triggers automáticos ejecutados en el sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha/Hora</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-sm">
                        {formatDateTime(log.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {log.metadata?.trigger_type || log.type || 'General'}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md truncate">
                        {log.title}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {log.source_module}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="default" className="bg-green-500">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Ejecutado
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {logs.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No hay logs de triggers disponibles
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
