'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Settings,
  Building2,
  Users,
  Clock,
  Shield,
  Bell,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

interface BranchConfig {
  auto_assign_employees: boolean;
  max_employees_per_branch: number;
  require_manager_approval: boolean;
  enable_time_tracking: boolean;
  default_work_hours_start: string;
  default_work_hours_end: string;
  enable_notifications: boolean;
  notification_types: string[];
  backup_frequency: string;
  data_retention_days: number;
}

export default function ConfiguracionSucursalesPage() {
  const [config, setConfig] = useState<BranchConfig>({
    auto_assign_employees: false,
    max_employees_per_branch: 50,
    require_manager_approval: true,
    enable_time_tracking: true,
    default_work_hours_start: '09:00',
    default_work_hours_end: '18:00',
    enable_notifications: true,
    notification_types: ['employee_assignment', 'schedule_changes', 'capacity_alerts'],
    backup_frequency: 'daily',
    data_retention_days: 365
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setSaveStatus('idle');
      
      // TODO: Implementar llamada a la API para guardar configuración
      console.log('Saving config:', config);
      
      // Simular delay de API
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Error saving config:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  const updateConfig = (key: keyof BranchConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const toggleNotificationType = (type: string) => {
    setConfig(prev => ({
      ...prev,
      notification_types: prev.notification_types.includes(type)
        ? prev.notification_types.filter(t => t !== type)
        : [...prev.notification_types, type]
    }));
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configuración de Sucursales</h1>
          <p className="text-muted-foreground">
            Configura las políticas y parámetros globales para todas las sucursales
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === 'success' && (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm">Configuración guardada</span>
            </div>
          )}
          {saveStatus === 'error' && (
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">Error al guardar</span>
            </div>
          )}
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Guardar Cambios
              </>
            )}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="empleados">Empleados</TabsTrigger>
          <TabsTrigger value="notificaciones">Notificaciones</TabsTrigger>
          <TabsTrigger value="seguridad">Seguridad</TabsTrigger>
        </TabsList>

        {/* Configuración General */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Configuración General
              </CardTitle>
              <CardDescription>
                Parámetros básicos para la gestión de sucursales
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="max-employees">Máximo empleados por sucursal</Label>
                  <Input
                    id="max-employees"
                    type="number"
                    value={config.max_employees_per_branch}
                    onChange={(e) => updateConfig('max_employees_per_branch', parseInt(e.target.value))}
                    min="1"
                    max="1000"
                  />
                  <p className="text-sm text-muted-foreground">
                    Límite máximo de empleados que pueden ser asignados a una sucursal
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="retention-days">Días de retención de datos</Label>
                  <Input
                    id="retention-days"
                    type="number"
                    value={config.data_retention_days}
                    onChange={(e) => updateConfig('data_retention_days', parseInt(e.target.value))}
                    min="30"
                    max="3650"
                  />
                  <p className="text-sm text-muted-foreground">
                    Tiempo que se conservan los datos históricos (en días)
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Asignación automática de empleados</Label>
                    <p className="text-sm text-muted-foreground">
                      Los empleados se asignan automáticamente a la sucursal más cercana
                    </p>
                  </div>
                  <Switch
                    checked={config.auto_assign_employees}
                    onCheckedChange={(checked) => updateConfig('auto_assign_employees', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Seguimiento de tiempo</Label>
                    <p className="text-sm text-muted-foreground">
                      Habilita el registro de horas de trabajo por sucursal
                    </p>
                  </div>
                  <Switch
                    checked={config.enable_time_tracking}
                    onCheckedChange={(checked) => updateConfig('enable_time_tracking', checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Horarios Predeterminados
              </CardTitle>
              <CardDescription>
                Configuración de horarios de trabajo por defecto
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start-time">Hora de inicio</Label>
                  <Input
                    id="start-time"
                    type="time"
                    value={config.default_work_hours_start}
                    onChange={(e) => updateConfig('default_work_hours_start', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end-time">Hora de fin</Label>
                  <Input
                    id="end-time"
                    type="time"
                    value={config.default_work_hours_end}
                    onChange={(e) => updateConfig('default_work_hours_end', e.target.value)}
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Estos horarios se aplicarán por defecto a nuevas sucursales
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configuración de Empleados */}
        <TabsContent value="empleados" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Gestión de Empleados
              </CardTitle>
              <CardDescription>
                Políticas para la asignación y gestión de empleados
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Requerir aprobación del gerente</Label>
                  <p className="text-sm text-muted-foreground">
                    Las reasignaciones de empleados requieren aprobación del gerente
                  </p>
                </div>
                <Switch
                  checked={config.require_manager_approval}
                  onCheckedChange={(checked) => updateConfig('require_manager_approval', checked)}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Políticas de Asignación</h4>
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">Balanceo automático de carga</p>
                      <p className="text-sm text-muted-foreground">
                        Distribuye empleados equitativamente entre sucursales
                      </p>
                    </div>
                    <Badge variant="outline">Próximamente</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">Asignación por proximidad</p>
                      <p className="text-sm text-muted-foreground">
                        Asigna empleados a la sucursal más cercana a su domicilio
                      </p>
                    </div>
                    <Badge variant="outline">Próximamente</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configuración de Notificaciones */}
        <TabsContent value="notificaciones" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notificaciones
              </CardTitle>
              <CardDescription>
                Configura qué eventos generan notificaciones
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Habilitar notificaciones</Label>
                  <p className="text-sm text-muted-foreground">
                    Activa el sistema de notificaciones para sucursales
                  </p>
                </div>
                <Switch
                  checked={config.enable_notifications}
                  onCheckedChange={(checked) => updateConfig('enable_notifications', checked)}
                />
              </div>

              {config.enable_notifications && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Tipos de Notificaciones</h4>
                    <div className="space-y-3">
                      {[
                        { id: 'employee_assignment', label: 'Asignación de empleados', description: 'Cuando se asigna o reasigna un empleado' },
                        { id: 'schedule_changes', label: 'Cambios de horario', description: 'Modificaciones en horarios de sucursales' },
                        { id: 'capacity_alerts', label: 'Alertas de capacidad', description: 'Cuando se alcanza el límite de empleados' },
                        { id: 'new_branch', label: 'Nueva sucursal', description: 'Cuando se registra una nueva sucursal' },
                        { id: 'branch_status', label: 'Estado de sucursal', description: 'Cambios en el estado activo/inactivo' }
                      ].map((notif) => (
                        <div key={notif.id} className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label>{notif.label}</Label>
                            <p className="text-sm text-muted-foreground">{notif.description}</p>
                          </div>
                          <Switch
                            checked={config.notification_types.includes(notif.id)}
                            onCheckedChange={() => toggleNotificationType(notif.id)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configuración de Seguridad */}
        <TabsContent value="seguridad" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Seguridad y Respaldos
              </CardTitle>
              <CardDescription>
                Configuración de seguridad y respaldos de datos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="backup-frequency">Frecuencia de respaldos</Label>
                <Select
                  value={config.backup_frequency}
                  onValueChange={(value) => updateConfig('backup_frequency', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Cada hora</SelectItem>
                    <SelectItem value="daily">Diario</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="monthly">Mensual</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Frecuencia con la que se realizan respaldos automáticos
                </p>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Políticas de Acceso</h4>
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">Autenticación de dos factores</p>
                      <p className="text-sm text-muted-foreground">
                        Requerida para acciones críticas en sucursales
                      </p>
                    </div>
                    <Badge variant="outline">Próximamente</Badge>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">Auditoría de cambios</p>
                      <p className="text-sm text-muted-foreground">
                        Registro detallado de todas las modificaciones
                      </p>
                    </div>
                    <Badge variant="default">Activo</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
