'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Settings, Shield } from 'lucide-react';
import { MembershipPlan } from '@/lib/services/gymService';
import { AccessRulesEditor, AccessRules } from './AccessRulesEditor';

interface PlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan?: MembershipPlan | null;
  onSave: (data: Partial<MembershipPlan>) => Promise<void>;
}

const DURATION_PRESETS = [
  { label: '1 día', value: 1 },
  { label: '1 semana', value: 7 },
  { label: '2 semanas', value: 14 },
  { label: '1 mes', value: 30 },
  { label: '2 meses', value: 60 },
  { label: '3 meses', value: 90 },
  { label: '6 meses', value: 180 },
  { label: '1 año', value: 365 },
  { label: 'Personalizado', value: -1 },
];

export function PlanDialog({ open, onOpenChange, plan, onSave }: PlanDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    duration_days: 30,
    price: 0,
    frequency: 'monthly',
    is_active: true
  });
  const [accessRules, setAccessRules] = useState<AccessRules | null>(null);
  const [durationPreset, setDurationPreset] = useState('30');
  const [customDuration, setCustomDuration] = useState(false);

  useEffect(() => {
    if (plan) {
      setFormData({
        name: plan.name,
        description: plan.description || '',
        duration_days: plan.duration_days,
        price: plan.price,
        frequency: plan.frequency || 'monthly',
        is_active: plan.is_active
      });
      setAccessRules((plan.access_rules as unknown) as AccessRules || null);
      
      const preset = DURATION_PRESETS.find(p => p.value === plan.duration_days);
      if (preset) {
        setDurationPreset(String(preset.value));
        setCustomDuration(false);
      } else {
        setDurationPreset('-1');
        setCustomDuration(true);
      }
    } else {
      setFormData({
        name: '',
        description: '',
        duration_days: 30,
        price: 0,
        frequency: 'monthly',
        is_active: true
      });
      setAccessRules(null);
      setDurationPreset('30');
      setCustomDuration(false);
    }
    setActiveTab('general');
  }, [plan, open]);

  const handleDurationChange = (value: string) => {
    setDurationPreset(value);
    if (value === '-1') {
      setCustomDuration(true);
    } else {
      setCustomDuration(false);
      setFormData(prev => ({ ...prev, duration_days: parseInt(value) }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setIsSaving(true);
      await onSave({
        ...formData,
        access_rules: accessRules as unknown as Record<string, unknown> | undefined
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error guardando plan:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden bg-white dark:bg-gray-800">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">
            {plan ? 'Editar Plan' : 'Nuevo Plan de Membresía'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="general" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                General
              </TabsTrigger>
              <TabsTrigger value="access" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Reglas de Acceso
              </TabsTrigger>
            </TabsList>

            <div className="mt-4 max-h-[50vh] overflow-y-auto pr-2">
              <TabsContent value="general" className="space-y-4 mt-0">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre del plan *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ej: Mensual Premium"
                    required
                    className="bg-gray-50 dark:bg-gray-900"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descripción</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Descripción del plan..."
                    rows={2}
                    className="bg-gray-50 dark:bg-gray-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Duración</Label>
                    <Select value={durationPreset} onValueChange={handleDurationChange}>
                      <SelectTrigger className="bg-gray-50 dark:bg-gray-900">
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {DURATION_PRESETS.map(preset => (
                          <SelectItem key={preset.value} value={String(preset.value)}>
                            {preset.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {customDuration && (
                    <div className="space-y-2">
                      <Label htmlFor="custom_duration">Días</Label>
                      <Input
                        id="custom_duration"
                        type="number"
                        min="1"
                        value={formData.duration_days}
                        onChange={(e) => setFormData(prev => ({ 
                          ...prev, 
                          duration_days: parseInt(e.target.value) || 1 
                        }))}
                        className="bg-gray-50 dark:bg-gray-900"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="price">Precio *</Label>
                    <Input
                      id="price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        price: parseFloat(e.target.value) || 0 
                      }))}
                      required
                      className="bg-gray-50 dark:bg-gray-900"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 border-t border-gray-100 dark:border-gray-700">
                  <div>
                    <Label htmlFor="is_active" className="text-sm font-medium">
                      Plan activo
                    </Label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Los planes inactivos no se muestran en ventas
                    </p>
                  </div>
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                  />
                </div>
              </TabsContent>

              <TabsContent value="access" className="mt-0">
                <AccessRulesEditor
                  value={accessRules}
                  onChange={setAccessRules}
                />
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="pt-4 border-t border-gray-100 dark:border-gray-700 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSaving || !formData.name}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                plan ? 'Guardar Cambios' : 'Crear Plan'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default PlanDialog;
