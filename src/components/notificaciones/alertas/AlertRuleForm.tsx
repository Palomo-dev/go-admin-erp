'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Shield, 
  AlertTriangle, 
  Info, 
  XCircle,
  Mail,
  MessageSquare,
  Smartphone,
  Webhook,
  Phone,
  CheckCircle,
  X
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { 
  AlertRule, 
  AlertRuleFormData, 
  AlertSeverity, 
  SourceModule, 
  AlertChannel 
} from '@/types/alert';

interface AlertRuleFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: AlertRuleFormData) => void;
  initialData?: AlertRule | null;
  loading?: boolean;
}

// Configuración de severidad
const severityOptions: { value: AlertSeverity; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'info', label: 'Información', icon: Info, color: 'blue' },
  { value: 'warning', label: 'Advertencia', icon: AlertTriangle, color: 'yellow' },
  { value: 'critical', label: 'Crítico', icon: Shield, color: 'red' }
];

// Configuración de módulos
const moduleOptions: { value: SourceModule; label: string; description: string }[] = [
  { value: 'sistema', label: 'Sistema', description: 'Alertas del sistema general' },
  { value: 'ventas', label: 'Ventas', description: 'Oportunidades, propuestas y ventas' },
  { value: 'inventario', label: 'Inventario', description: 'Stock bajo, productos agotados' },
  { value: 'pms', label: 'PMS', description: 'Reservas, check-in/out, ocupación' },
  { value: 'rrhh', label: 'RR.HH.', description: 'Empleados, nóminas, permisos' },
  { value: 'crm', label: 'CRM', description: 'Clientes, actividades, tareas' },
  { value: 'finanzas', label: 'Finanzas', description: 'Facturas, pagos, presupuestos' },
  { value: 'transporte', label: 'Transporte', description: 'Rutas, vehículos, entregas' }
];

// Configuración de canales
const channelOptions: { value: AlertChannel; label: string; icon: React.ElementType; description: string }[] = [
  { value: 'email', label: 'Email', icon: Mail, description: 'Notificación por correo electrónico' },
  { value: 'sms', label: 'SMS', icon: Phone, description: 'Mensaje de texto' },
  { value: 'push', label: 'Push', icon: Smartphone, description: 'Notificación push en la app' },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, description: 'Mensaje por WhatsApp' },
  { value: 'webhook', label: 'Webhook', icon: Webhook, description: 'Llamada a API externa' }
];

// Ejemplos de condiciones SQL por módulo
const conditionExamples: Record<SourceModule, string[]> = {
  sistema: [
    "SELECT COUNT(*) FROM system_logs WHERE level = 'ERROR' AND created_at > NOW() - INTERVAL '1 hour'",
    "SELECT COUNT(*) FROM failed_jobs WHERE created_at > NOW() - INTERVAL '30 minutes'"
  ],
  inventario: [
    "SELECT COUNT(*) FROM products WHERE stock_quantity <= minimum_stock AND active = true",
    "SELECT COUNT(*) FROM products WHERE stock_quantity = 0 AND active = true"
  ],
  ventas: [
    "SELECT COUNT(*) FROM opportunities WHERE stage_id IN (SELECT id FROM stages WHERE name LIKE '%perdido%') AND updated_at > NOW() - INTERVAL '1 day'",
    "SELECT SUM(amount) FROM opportunities WHERE created_at >= CURRENT_DATE AND amount > 10000"
  ],
  finanzas: [
    "SELECT COUNT(*) FROM invoices WHERE status = 'overdue' AND due_date < CURRENT_DATE",
    "SELECT COUNT(*) FROM payments WHERE status = 'failed' AND created_at > NOW() - INTERVAL '2 hours'"
  ],
  pms: [
    "SELECT COUNT(*) FROM bookings WHERE check_in_date = CURRENT_DATE AND status = 'confirmed'",
    "SELECT COUNT(*) FROM rooms WHERE status = 'out_of_order'"
  ],
  crm: [
    "SELECT COUNT(*) FROM tasks WHERE due_date < CURRENT_DATE AND status = 'open'",
    "SELECT COUNT(*) FROM customers WHERE created_at >= CURRENT_DATE"
  ],
  rrhh: [
    "SELECT COUNT(*) FROM employees WHERE status = 'inactive' AND updated_at > NOW() - INTERVAL '1 day'",
    "SELECT COUNT(*) FROM leave_requests WHERE status = 'pending' AND requested_date < CURRENT_DATE + INTERVAL '3 days'"
  ],
  transporte: [
    "SELECT COUNT(*) FROM deliveries WHERE status = 'delayed' AND scheduled_date = CURRENT_DATE",
    "SELECT COUNT(*) FROM vehicles WHERE status = 'maintenance_required'"
  ]
};

export default function AlertRuleForm({
  open,
  onClose,
  onSubmit,
  initialData,
  loading = false
}: AlertRuleFormProps) {
  
  const [formData, setFormData] = useState<AlertRuleFormData>({
    name: '',
    description: '',
    source_module: 'sistema',
    sql_condition: '',
    channels: [],
    severity: 'warning',
    active: true
  });

  const [showExamples, setShowExamples] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        description: initialData.description || '',
        source_module: initialData.source_module,
        sql_condition: initialData.sql_condition,
        channels: initialData.channels,
        severity: initialData.severity,
        active: initialData.active
      });
    } else {
      setFormData({
        name: '',
        description: '',
        source_module: 'sistema',
        sql_condition: '',
        channels: [],
        severity: 'warning',
        active: true
      });
    }
  }, [initialData, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChannelToggle = (channel: AlertChannel, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      channels: checked
        ? [...prev.channels, channel]
        : prev.channels.filter(c => c !== channel)
    }));
  };

  const insertExample = (example: string) => {
    setFormData(prev => ({
      ...prev,
      sql_condition: example
    }));
    setShowExamples(false);
  };

  const getSeverityBadge = (severity: AlertSeverity) => {
    const option = severityOptions.find(s => s.value === severity);
    if (!option) return null;
    
    const Icon = option.icon;
    return (
      <Badge variant="outline" className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {option.label}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initialData ? 'Editar Regla de Alerta' : 'Nueva Regla de Alerta'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Información básica */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Información Básica</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ej: Stock bajo productos"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="module">Módulo *</Label>
                  <Select
                    value={formData.source_module}
                    onValueChange={(value: SourceModule) => 
                      setFormData(prev => ({ ...prev, source_module: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {moduleOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div>
                            <div className="font-medium">{option.label}</div>
                            <div className="text-xs text-gray-500">{option.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descripción opcional de la regla de alerta..."
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Condición SQL */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                Condición SQL
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowExamples(!showExamples)}
                >
                  {showExamples ? 'Ocultar' : 'Ver ejemplos'}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sql_condition">Consulta SQL *</Label>
                <Textarea
                  id="sql_condition"
                  value={formData.sql_condition}
                  onChange={(e) => setFormData(prev => ({ ...prev, sql_condition: e.target.value }))}
                  placeholder="SELECT COUNT(*) FROM tabla WHERE condicion..."
                  rows={4}
                  className="font-mono text-sm"
                  required
                />
                <p className="text-xs text-gray-500">
                  La consulta debe retornar un número. La alerta se activará cuando el resultado sea mayor a 0.
                </p>
              </div>

              {showExamples && (
                <div className="space-y-2">
                  <Label>Ejemplos para {moduleOptions.find(m => m.value === formData.source_module)?.label}:</Label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {conditionExamples[formData.source_module]?.map((example, index) => (
                      <div
                        key={index}
                        className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        onClick={() => insertExample(example)}
                      >
                        <code className="text-xs text-gray-700 dark:text-gray-300 break-all">
                          {example}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Configuración */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Configuración</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Severidad *</Label>
                  <Select
                    value={formData.severity}
                    onValueChange={(value: AlertSeverity) => 
                      setFormData(prev => ({ ...prev, severity: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {severityOptions.map((option) => {
                        const Icon = option.icon;
                        return (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              {option.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Estado</Label>
                  <div className="flex items-center space-x-2 pt-2">
                    <Switch
                      checked={formData.active}
                      onCheckedChange={(checked) => 
                        setFormData(prev => ({ ...prev, active: checked }))
                      }
                    />
                    <span className="text-sm">
                      {formData.active ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label>Canales de Notificación *</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {channelOptions.map((channel) => {
                    const Icon = channel.icon;
                    const isSelected = formData.channels.includes(channel.value);
                    
                    return (
                      <div
                        key={channel.value}
                        className={cn(
                          "flex items-center space-x-3 p-3 border rounded-lg cursor-pointer transition-colors",
                          isSelected 
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" 
                            : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                        )}
                        onClick={() => handleChannelToggle(channel.value, !isSelected)}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => 
                            handleChannelToggle(channel.value, checked as boolean)
                          }
                        />
                        <Icon className="h-4 w-4" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{channel.label}</div>
                          <div className="text-xs text-gray-500">{channel.description}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {formData.channels.length === 0 && (
                  <p className="text-sm text-red-500">
                    Debe seleccionar al menos un canal de notificación
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Vista previa */}
          {formData.name && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Vista Previa</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800">
                  <div className="flex-1">
                    <div className="font-medium">{formData.name}</div>
                    {formData.description && (
                      <div className="text-sm text-gray-500 mt-1">{formData.description}</div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline">
                        {moduleOptions.find(m => m.value === formData.source_module)?.label}
                      </Badge>
                      {getSeverityBadge(formData.severity)}
                      <Badge variant={formData.active ? "default" : "secondary"}>
                        {formData.active ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </div>
                    {formData.channels.length > 0 && (
                      <div className="text-xs text-gray-500 mt-2">
                        Canales: {formData.channels.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button 
            type="submit" 
            disabled={loading || !formData.name || !formData.sql_condition || formData.channels.length === 0}
            onClick={handleSubmit}
          >
            {loading ? 'Guardando...' : (initialData ? 'Actualizar' : 'Crear')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
