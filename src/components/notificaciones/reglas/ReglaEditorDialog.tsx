'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, Code, ListChecks } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { AlertRule, RuleFormData } from './types';
import { SOURCE_MODULES, SEVERITY_OPTIONS, CHANNEL_OPTIONS } from './types';

// ── Condiciones predefinidas por módulo ──────────────────
interface PresetCondition {
  label: string;
  description: string;
  sql: string;
  severity: 'info' | 'warning' | 'critical';
  name: string;
}

const PRESET_CONDITIONS: Record<string, PresetCondition[]> = {
  inventario: [
    { label: 'Stock por debajo del mínimo', description: 'Productos con stock menor al mínimo configurado', sql: "SELECT COUNT(*) FROM products WHERE stock_quantity <= minimum_stock AND active = true", severity: 'warning', name: 'Stock Bajo en Productos' },
    { label: 'Productos agotados (stock = 0)', description: 'Productos sin unidades disponibles', sql: "SELECT COUNT(*) FROM products WHERE stock_quantity = 0 AND active = true", severity: 'critical', name: 'Productos Agotados' },
    { label: 'Stock crítico (< 5 unidades)', description: 'Productos con menos de 5 unidades', sql: "SELECT COUNT(*) FROM products WHERE stock_quantity < 5 AND stock_quantity > 0 AND active = true", severity: 'warning', name: 'Stock Crítico' },
  ],
  finanzas: [
    { label: 'Facturas vencidas sin pagar', description: 'Facturas que pasaron su fecha límite', sql: "SELECT COUNT(*) FROM invoices WHERE due_date < NOW() AND status = 'pending' AND organization_id = $1", severity: 'warning', name: 'Facturas Vencidas' },
    { label: 'Pagos fallidos (24h)', description: 'Pagos que fallaron en las últimas 24 horas', sql: "SELECT COUNT(*) FROM payments WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours'", severity: 'critical', name: 'Pagos Fallidos' },
    { label: 'Cuentas por cobrar vencidas', description: 'CxC con fecha límite pasada', sql: "SELECT COUNT(*) FROM accounts_receivable WHERE due_date < NOW() AND status = 'pending' AND organization_id = $1", severity: 'warning', name: 'CxC Vencidas' },
  ],
  pos: [
    { label: 'Cajas abiertas +8 horas', description: 'Sesiones de caja sin cerrar', sql: "SELECT COUNT(*) FROM cash_sessions WHERE status = 'open' AND opened_at < NOW() - INTERVAL '8 hours'", severity: 'warning', name: 'Cajas sin Cerrar' },
    { label: 'Ventas sin facturar hoy', description: 'Transacciones del día sin factura', sql: "SELECT COUNT(*) FROM pos_transactions WHERE created_at::date = CURRENT_DATE AND invoice_id IS NULL", severity: 'info', name: 'Ventas sin Facturar' },
  ],
  crm: [
    { label: 'Tareas vencidas', description: 'Tareas CRM que pasaron su fecha límite', sql: "SELECT COUNT(*) FROM tasks WHERE due_date < NOW() AND status != 'completed' AND organization_id = $1", severity: 'warning', name: 'Tareas Vencidas CRM' },
    { label: 'Leads sin contactar (48h)', description: 'Leads nuevos sin actividad', sql: "SELECT COUNT(*) FROM leads WHERE status = 'new' AND created_at < NOW() - INTERVAL '48 hours'", severity: 'info', name: 'Leads sin Contactar' },
  ],
  hrm: [
    { label: 'Contratos por vencer (30 días)', description: 'Contratos que vencen pronto', sql: "SELECT COUNT(*) FROM employee_contracts WHERE end_date <= NOW() + INTERVAL '30 days' AND status = 'active'", severity: 'warning', name: 'Contratos por Vencer' },
    { label: 'Ausencias no justificadas', description: 'Ausencias pendientes de justificación', sql: "SELECT COUNT(*) FROM attendance WHERE status = 'absent' AND justification IS NULL AND date = CURRENT_DATE", severity: 'info', name: 'Ausencias sin Justificar' },
  ],
  pms: [
    { label: 'Overbooking detectado', description: 'Más reservas que habitaciones', sql: "SELECT COUNT(*) FROM reservations WHERE status = 'confirmed' GROUP BY room_id, check_in HAVING COUNT(*) > 1", severity: 'critical', name: 'Overbooking Detectado' },
    { label: 'No-shows del día', description: 'Reservas confirmadas sin check-in', sql: "SELECT COUNT(*) FROM reservations WHERE status = 'confirmed' AND check_in = CURRENT_DATE AND CURRENT_TIME > '18:00'", severity: 'warning', name: 'No-Shows del Día' },
    { label: 'Housekeeping pendiente', description: 'Tareas de limpieza sin completar', sql: "SELECT COUNT(*) FROM housekeeping_tasks WHERE status = 'pending' AND scheduled_date = CURRENT_DATE", severity: 'info', name: 'Housekeeping Pendiente' },
  ],
  sistema: [
    { label: 'Usuarios inactivos (30 días)', description: 'Usuarios sin login reciente', sql: "SELECT COUNT(*) FROM users WHERE last_login < NOW() - INTERVAL '30 days'", severity: 'info', name: 'Usuarios Inactivos' },
    { label: 'Errores del sistema (1h)', description: 'Errores recientes del sistema', sql: "SELECT COUNT(*) FROM system_logs WHERE level = 'ERROR' AND created_at > NOW() - INTERVAL '1 hour'", severity: 'critical', name: 'Errores del Sistema' },
  ],
  transporte: [
    { label: 'Entregas retrasadas', description: 'Entregas que pasaron su ETA', sql: "SELECT COUNT(*) FROM deliveries WHERE status = 'in_transit' AND estimated_arrival < NOW()", severity: 'warning', name: 'Entregas Retrasadas' },
  ],
  calendario: [
    { label: 'Eventos sin confirmar (24h)', description: 'Eventos próximos sin confirmación', sql: "SELECT COUNT(*) FROM calendar_events WHERE status = 'pending' AND start_date <= NOW() + INTERVAL '24 hours'", severity: 'info', name: 'Eventos sin Confirmar' },
  ],
};

interface ReglaEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: AlertRule | null;
  activeChannels: { code: string; provider_name: string }[];
  onSave: (data: RuleFormData, id?: string) => Promise<boolean>;
}

const emptyForm: RuleFormData = {
  name: '',
  source_module: 'inventario',
  sql_condition: '',
  channels: ['app'],
  severity: 'warning',
  active: true,
};

export function ReglaEditorDialog({
  open, onOpenChange, rule, activeChannels, onSave,
}: ReglaEditorDialogProps) {
  const [form, setForm] = useState<RuleFormData>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [useCustomSQL, setUseCustomSQL] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('');

  const currentPresets = PRESET_CONDITIONS[form.source_module] || [];

  useEffect(() => {
    if (open) {
      if (rule) {
        setForm({
          name: rule.name,
          source_module: rule.source_module,
          sql_condition: rule.sql_condition,
          channels: rule.channels,
          severity: rule.severity as RuleFormData['severity'],
          active: rule.active,
        });
        // Detectar si es un preset o SQL personalizado
        const modulePresets = PRESET_CONDITIONS[rule.source_module] || [];
        const match = modulePresets.find((p) => p.sql === rule.sql_condition);
        if (match) {
          setSelectedPreset(match.label);
          setUseCustomSQL(false);
        } else {
          setSelectedPreset('');
          setUseCustomSQL(true);
        }
      } else {
        setForm(emptyForm);
        setUseCustomSQL(false);
        setSelectedPreset('');
      }
    }
  }, [open, rule]);

  const handleModuleChange = (mod: string) => {
    setForm((p) => ({ ...p, source_module: mod, sql_condition: '', name: '' }));
    setSelectedPreset('');
    setUseCustomSQL(false);
  };

  const handlePresetSelect = (preset: PresetCondition) => {
    setSelectedPreset(preset.label);
    setForm((p) => ({
      ...p,
      sql_condition: preset.sql,
      severity: preset.severity,
      name: p.name || preset.name,
    }));
  };

  const toggleChannel = (ch: string) => {
    setForm((prev) => ({
      ...prev,
      channels: prev.channels.includes(ch)
        ? prev.channels.filter((c) => c !== ch)
        : [...prev.channels, ch],
    }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.sql_condition.trim()) return;
    setIsSaving(true);
    const ok = await onSave(form, rule?.id);
    setIsSaving(false);
    if (ok) onOpenChange(false);
  };

  const isValid = form.name.trim() && form.sql_condition.trim() && form.channels.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto bg-white dark:bg-gray-900">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">
            {rule ? 'Editar Regla' : 'Nueva Regla de Alerta'}
          </DialogTitle>
          <DialogDescription>
            {rule ? 'Modifica la configuración de la regla.' : 'Selecciona un módulo y una condición predefinida.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Nombre */}
          <div className="space-y-1.5">
            <Label htmlFor="rule-name" className="text-sm font-medium text-gray-700 dark:text-gray-300">Nombre</Label>
            <Input
              id="rule-name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Ej: Stock Bajo en Productos"
              className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700"
            />
          </div>

          {/* Módulo */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Módulo origen</Label>
            <select
              value={form.source_module}
              onChange={(e) => handleModuleChange(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SOURCE_MODULES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Severidad */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Severidad</Label>
            <div className="flex gap-2">
              {SEVERITY_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setForm((p) => ({ ...p, severity: s.value as RuleFormData['severity'] }))}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all',
                    form.severity === s.value
                      ? `${s.color} border-current`
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 border-transparent hover:border-gray-300 dark:hover:border-gray-600',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Condición: toggle entre presets y SQL custom */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Condición</Label>
              <button
                onClick={() => setUseCustomSQL(!useCustomSQL)}
                className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
              >
                {useCustomSQL ? <><ListChecks className="h-3 w-3" /> Usar presets</> : <><Code className="h-3 w-3" /> SQL personalizado</>}
              </button>
            </div>

            {useCustomSQL ? (
              <>
                <textarea
                  value={form.sql_condition}
                  onChange={(e) => setForm((p) => ({ ...p, sql_condition: e.target.value }))}
                  placeholder="SELECT COUNT(*) FROM ... WHERE ..."
                  rows={4}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                  La consulta debe retornar un COUNT. Si resultado &gt; 0, la alerta se dispara. Usa $1 para organization_id.
                </p>
              </>
            ) : (
              <div className="space-y-1.5">
                {currentPresets.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-2">No hay condiciones predefinidas para este módulo. Usa SQL personalizado.</p>
                ) : (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {currentPresets.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => handlePresetSelect(preset)}
                        className={cn(
                          'w-full text-left px-3 py-2.5 rounded-lg border-2 transition-all',
                          selectedPreset === preset.label
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600',
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <p className={cn(
                            'text-sm font-medium',
                            selectedPreset === preset.label ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-200',
                          )}>
                            {preset.label}
                          </p>
                          <Badge variant="outline" className={cn(
                            'text-[10px] px-1.5',
                            preset.severity === 'critical' ? 'border-red-300 text-red-600' :
                            preset.severity === 'warning' ? 'border-amber-300 text-amber-600' :
                            'border-blue-300 text-blue-600'
                          )}>
                            {preset.severity}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{preset.description}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Canales */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Canales de notificación</Label>
            <div className="flex flex-wrap gap-2">
              {CHANNEL_OPTIONS.map((ch) => {
                const isActive = activeChannels.some((ac) => ac.code === ch.value);
                const isSelected = form.channels.includes(ch.value);
                return (
                  <button
                    key={ch.value}
                    onClick={() => toggleChannel(ch.value)}
                    disabled={!isActive && ch.value !== 'app'}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all',
                      isSelected
                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 border-transparent',
                      !isActive && ch.value !== 'app' && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    {ch.label}
                    {!isActive && ch.value !== 'app' && (
                      <span className="ml-1 text-[9px] text-gray-400">(inactivo)</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Activo */}
          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Regla activa</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">La regla se evaluará automáticamente</p>
            </div>
            <Switch
              checked={form.active}
              onCheckedChange={(v) => setForm((p) => ({ ...p, active: v }))}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || isSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            {rule ? 'Guardar' : 'Crear Regla'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
