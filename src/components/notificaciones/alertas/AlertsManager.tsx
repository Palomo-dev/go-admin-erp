'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { 
  Plus, 
  Search, 
  Filter,
  RefreshCw,
  Shield,
  AlertTriangle,
  Settings
} from 'lucide-react';

// Componentes locales
import AlertRulesTable from './AlertRulesTable';
import SystemAlertsTable from './SystemAlertsTable';
import AlertRuleForm from './AlertRuleForm';
import AlertStats from './AlertStats';
import AlertAutomationControl from './AlertAutomationControl';

// Servicios
import {
  getAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  toggleAlertRule,
  getSystemAlerts,
  resolveSystemAlert,
  bulkActionAlerts,
  getAlertStats
} from '@/lib/services/alertService';

import type {
  AlertRule,
  SystemAlert,
  AlertRuleFormData,
  AlertFilter,
  AlertStats as AlertStatsType,
  AlertSeverity,
  AlertStatus,
  SourceModule
} from '@/types/alert';

export default function AlertsManager() {
  const { toast } = useToast();

  // Estados principales
  const [activeTab, setActiveTab] = useState<'stats' | 'rules' | 'alerts' | 'automation'>('stats');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Estados de reglas
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);

  // Estados de alertas
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [selectedAlerts, setSelectedAlerts] = useState<string[]>([]);
  const [alertFilters, setAlertFilters] = useState<AlertFilter>({
    limit: 20,
    offset: 0
  });
  const [alertPagination, setAlertPagination] = useState({
    total: 0,
    page: 1,
    totalPages: 0
  });

  // Estados de estadísticas
  const [stats, setStats] = useState<AlertStatsType | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Estados de filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all');
  const [moduleFilter, setModuleFilter] = useState<SourceModule | 'all'>('all');

  // Cargar datos iniciales
  useEffect(() => {
    loadInitialData();
  }, []);

  // Aplicar filtros de alertas
  useEffect(() => {
    if (activeTab === 'alerts') {
      loadAlerts();
    }
  }, [activeTab, alertFilters, searchTerm, statusFilter, severityFilter, moduleFilter]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadStats(),
        loadRules(),
        loadAlerts()
      ]);
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const response = await getAlertStats();
      if (response.success) {
        setStats(response.data);
      } else {
        toast({
          title: "Error",
          description: response.error || "Error al cargar estadísticas",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const loadRules = async () => {
    setRulesLoading(true);
    try {
      const response = await getAlertRules();
      if (response.success) {
        setRules(response.data);
      } else {
        toast({
          title: "Error",
          description: response.error || "Error al cargar reglas",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error loading rules:', error);
    } finally {
      setRulesLoading(false);
    }
  };

  const loadAlerts = async () => {
    setAlertsLoading(true);
    try {
      const filters: AlertFilter = {
        ...alertFilters,
        search: searchTerm || undefined,
        status: statusFilter !== 'all' ? [statusFilter] : undefined,
        severity: severityFilter !== 'all' ? [severityFilter] : undefined,
        source_module: moduleFilter !== 'all' ? [moduleFilter] : undefined
      };

      const response = await getSystemAlerts(filters);
      setAlerts(response.data);
      setAlertPagination({
        total: response.total,
        page: response.page,
        totalPages: response.totalPages
      });
    } catch (error) {
      console.error('Error loading alerts:', error);
      toast({
        title: "Error",
        description: "Error al cargar alertas",
        variant: "destructive"
      });
    } finally {
      setAlertsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadInitialData();
      toast({
        title: "Actualizado",
        description: "Datos actualizados correctamente"
      });
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Handlers de reglas
  const handleCreateRule = async (data: AlertRuleFormData) => {
    try {
      const response = await createAlertRule(data);
      if (response.success) {
        setRules(prev => [response.data, ...prev]);
        setShowRuleForm(false);
        await loadStats(); // Actualizar estadísticas
        toast({
          title: "Éxito",
          description: response.message || "Regla creada correctamente"
        });
      } else {
        toast({
          title: "Error",
          description: response.error || "Error al crear la regla",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error creating rule:', error);
      toast({
        title: "Error",
        description: "Error interno al crear la regla",
        variant: "destructive"
      });
    }
  };

  const handleEditRule = (rule: AlertRule) => {
    setEditingRule(rule);
    setShowRuleForm(true);
  };

  const handleUpdateRule = async (data: AlertRuleFormData) => {
    if (!editingRule) return;
    
    try {
      const response = await updateAlertRule(editingRule.id, data);
      if (response.success) {
        setRules(prev => prev.map(rule => 
          rule.id === editingRule.id ? response.data : rule
        ));
        setShowRuleForm(false);
        setEditingRule(null);
        await loadStats();
        toast({
          title: "Éxito",
          description: response.message || "Regla actualizada correctamente"
        });
      } else {
        toast({
          title: "Error",
          description: response.error || "Error al actualizar la regla",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error updating rule:', error);
      toast({
        title: "Error",
        description: "Error interno al actualizar la regla",
        variant: "destructive"
      });
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta regla?')) return;
    
    try {
      const response = await deleteAlertRule(id);
      if (response.success) {
        setRules(prev => prev.filter(rule => rule.id !== id));
        await loadStats();
        toast({
          title: "Éxito",
          description: response.message || "Regla eliminada correctamente"
        });
      } else {
        toast({
          title: "Error",
          description: response.error || "Error al eliminar la regla",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error deleting rule:', error);
      toast({
        title: "Error",
        description: "Error interno al eliminar la regla",
        variant: "destructive"
      });
    }
  };

  const handleToggleRule = async (id: string, active: boolean) => {
    try {
      const response = await toggleAlertRule(id, active);
      if (response.success) {
        setRules(prev => prev.map(rule => 
          rule.id === id ? { ...rule, active } : rule
        ));
        await loadStats();
        toast({
          title: "Éxito",
          description: response.message || `Regla ${active ? 'activada' : 'desactivada'} correctamente`
        });
      } else {
        toast({
          title: "Error",
          description: response.error || "Error al cambiar estado de la regla",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error toggling rule:', error);
      toast({
        title: "Error",
        description: "Error interno al cambiar estado de la regla",
        variant: "destructive"
      });
    }
  };

  // Handlers de alertas
  const handleSelectAlert = (id: string, selected: boolean) => {
    setSelectedAlerts(prev => 
      selected 
        ? [...prev, id]
        : prev.filter(alertId => alertId !== id)
    );
  };

  const handleSelectAllAlerts = (selected: boolean) => {
    setSelectedAlerts(selected ? alerts.map(alert => alert.id) : []);
  };

  const handleResolveAlert = async (id: string) => {
    try {
      const response = await resolveSystemAlert(id, 'user-id', 'Resuelto desde la interfaz');
      if (response.success) {
        setAlerts(prev => prev.map(alert => 
          alert.id === id 
            ? { ...alert, status: 'resolved', resolved_at: new Date().toISOString() }
            : alert
        ));
        await loadStats();
        toast({
          title: "Éxito",
          description: "Alerta resuelta correctamente"
        });
      } else {
        toast({
          title: "Error",
          description: response.error || "Error al resolver la alerta",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error resolving alert:', error);
      toast({
        title: "Error",
        description: "Error interno al resolver la alerta",
        variant: "destructive"
      });
    }
  };

  const handleViewAlert = (alert: SystemAlert) => {
    // TODO: Implementar modal de vista detallada
    console.log('View alert:', alert);
  };

  const handleBulkAction = async (action: 'resolve' | 'dismiss' | 'delete') => {
    if (selectedAlerts.length === 0) return;
    
    try {
      const response = await bulkActionAlerts({
        alert_ids: selectedAlerts,
        action,
        reason: `Acción masiva desde la interfaz: ${action}`
      });

      if (response.success) {
        await loadAlerts();
        await loadStats();
        setSelectedAlerts([]);
        toast({
          title: "Éxito",
          description: response.message || "Acción completada correctamente"
        });
      } else {
        toast({
          title: "Error",
          description: response.error || "Error al procesar la acción",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error bulk action:', error);
      toast({
        title: "Error",
        description: "Error interno al procesar la acción",
        variant: "destructive"
      });
    }
  };

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setSeverityFilter('all');
    setModuleFilter('all');
    setAlertFilters({ limit: 20, offset: 0 });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Alertas Automáticas
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Gestiona reglas de alerta y monitorea el estado del sistema
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          
          {activeTab === 'rules' && (
            <Button
              onClick={() => setShowRuleForm(true)}
              disabled={loading}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nueva Regla
            </Button>
          )}
          
          {activeTab === 'alerts' && selectedAlerts.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {selectedAlerts.length} seleccionadas
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkAction('resolve')}
              >
                Resolver
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkAction('dismiss')}
              >
                Descartar
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'stats' | 'rules' | 'alerts' | 'automation')}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="stats" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Estadísticas
          </TabsTrigger>
          <TabsTrigger value="rules" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Reglas ({rules.length})
          </TabsTrigger>
          <TabsTrigger value="alerts" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Alertas ({alertPagination.total})
          </TabsTrigger>
          <TabsTrigger value="automation" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Automatización
          </TabsTrigger>
        </TabsList>

        {/* Contenido de Estadísticas */}
        <TabsContent value="stats" className="space-y-6">
          {stats && (
            <AlertStats 
              stats={stats} 
              loading={statsLoading}
            />
          )}
        </TabsContent>

        {/* Contenido de Reglas */}
        <TabsContent value="rules" className="space-y-6">
          <AlertRulesTable
            rules={rules}
            loading={rulesLoading}
            onEdit={handleEditRule}
            onDelete={handleDeleteRule}
            onToggle={handleToggleRule}
          />
        </TabsContent>

        {/* Contenido de Alertas */}
        <TabsContent value="alerts" className="space-y-6">
          {/* Filtros de alertas */}
          <div className="flex flex-col sm:flex-row gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar alertas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as AlertStatus | 'all')}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="active">Activa</SelectItem>
                <SelectItem value="resolved">Resuelta</SelectItem>
                <SelectItem value="dismissed">Descartada</SelectItem>
              </SelectContent>
            </Select>

            <Select value={severityFilter} onValueChange={(value) => setSeverityFilter(value as AlertSeverity | 'all')}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Severidad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Advertencia</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="critical">Crítico</SelectItem>
              </SelectContent>
            </Select>

            <Select value={moduleFilter} onValueChange={(value) => setModuleFilter(value as SourceModule | 'all')}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Módulo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="sistema">Sistema</SelectItem>
                <SelectItem value="ventas">Ventas</SelectItem>
                <SelectItem value="inventario">Inventario</SelectItem>
                <SelectItem value="pms">PMS</SelectItem>
                <SelectItem value="rrhh">RR.HH.</SelectItem>
                <SelectItem value="crm">CRM</SelectItem>
                <SelectItem value="finanzas">Finanzas</SelectItem>
                <SelectItem value="transporte">Transporte</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={resetFilters}>
              <Filter className="h-4 w-4 mr-2" />
              Limpiar
            </Button>
          </div>

          <SystemAlertsTable
            alerts={alerts}
            loading={alertsLoading}
            selectedAlerts={selectedAlerts}
            onSelectAlert={handleSelectAlert}
            onSelectAll={handleSelectAllAlerts}
            onResolve={handleResolveAlert}
            onView={handleViewAlert}
          />
        </TabsContent>

        {/* Contenido de Automatización */}
        <TabsContent value="automation" className="space-y-6">
          <AlertAutomationControl />
        </TabsContent>
      </Tabs>

      {/* Modal de formulario de regla */}
      <AlertRuleForm
        open={showRuleForm}
        onClose={() => {
          setShowRuleForm(false);
          setEditingRule(null);
        }}
        onSubmit={editingRule ? handleUpdateRule : handleCreateRule}
        initialData={editingRule}
        loading={loading}
      />
    </div>
  );
}
