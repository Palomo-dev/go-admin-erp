'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Building2, 
  Clock, 
  Plus, 
  Trash2, 
  AlertCircle,
  CheckCircle2,
  Calendar
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

interface Branch {
  id: number;
  name: string;
  is_active: boolean;
}

interface TimeRange {
  start: string;
  end: string;
}

interface DaySchedule {
  enabled: boolean;
  ranges: TimeRange[];
}

export interface AccessRules {
  all_branches: boolean;
  allowed_branches: number[];
  schedule_enabled: boolean;
  schedule: {
    [key: string]: DaySchedule;
  };
  max_daily_checkins?: number;
  notes?: string;
}

interface AccessRulesEditorProps {
  value: AccessRules | null;
  onChange: (rules: AccessRules) => void;
}

const DAYS_OF_WEEK = [
  { key: 'monday', label: 'Lunes' },
  { key: 'tuesday', label: 'Martes' },
  { key: 'wednesday', label: 'Miércoles' },
  { key: 'thursday', label: 'Jueves' },
  { key: 'friday', label: 'Viernes' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
];

const DEFAULT_RULES: AccessRules = {
  all_branches: true,
  allowed_branches: [],
  schedule_enabled: false,
  schedule: {
    monday: { enabled: true, ranges: [{ start: '06:00', end: '22:00' }] },
    tuesday: { enabled: true, ranges: [{ start: '06:00', end: '22:00' }] },
    wednesday: { enabled: true, ranges: [{ start: '06:00', end: '22:00' }] },
    thursday: { enabled: true, ranges: [{ start: '06:00', end: '22:00' }] },
    friday: { enabled: true, ranges: [{ start: '06:00', end: '22:00' }] },
    saturday: { enabled: true, ranges: [{ start: '08:00', end: '18:00' }] },
    sunday: { enabled: false, ranges: [] },
  },
  max_daily_checkins: undefined,
};

export function AccessRulesEditor({ value, onChange }: AccessRulesEditorProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rules, setRules] = useState<AccessRules>(value || DEFAULT_RULES);

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    if (value) {
      setRules(value);
    }
  }, [value]);

  const loadBranches = async () => {
    try {
      const orgId = getOrganizationId();
      const { data } = await supabase
        .from('branches')
        .select('id, name, is_active')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('name');
      
      setBranches(data || []);
    } catch (error) {
      console.error('Error cargando sedes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateRules = (updates: Partial<AccessRules>) => {
    const newRules = { ...rules, ...updates };
    setRules(newRules);
    onChange(newRules);
  };

  const toggleBranch = (branchId: number) => {
    const allowed = rules.allowed_branches || [];
    const newAllowed = allowed.includes(branchId)
      ? allowed.filter(id => id !== branchId)
      : [...allowed, branchId];
    updateRules({ allowed_branches: newAllowed });
  };

  const updateDaySchedule = (day: string, updates: Partial<DaySchedule>) => {
    const currentSchedule = rules.schedule || DEFAULT_RULES.schedule;
    const daySchedule = currentSchedule[day] || { enabled: false, ranges: [] };
    updateRules({
      schedule: {
        ...currentSchedule,
        [day]: { ...daySchedule, ...updates }
      }
    });
  };

  const addTimeRange = (day: string) => {
    const currentSchedule = rules.schedule || DEFAULT_RULES.schedule;
    const daySchedule = currentSchedule[day] || { enabled: true, ranges: [] };
    updateDaySchedule(day, {
      ranges: [...daySchedule.ranges, { start: '09:00', end: '18:00' }]
    });
  };

  const removeTimeRange = (day: string, index: number) => {
    const currentSchedule = rules.schedule || DEFAULT_RULES.schedule;
    const daySchedule = currentSchedule[day];
    if (daySchedule) {
      updateDaySchedule(day, {
        ranges: daySchedule.ranges.filter((_, i) => i !== index)
      });
    }
  };

  const updateTimeRange = (day: string, index: number, field: 'start' | 'end', value: string) => {
    const currentSchedule = rules.schedule || DEFAULT_RULES.schedule;
    const daySchedule = currentSchedule[day];
    if (daySchedule) {
      const newRanges = [...daySchedule.ranges];
      newRanges[index] = { ...newRanges[index], [field]: value };
      updateDaySchedule(day, { ranges: newRanges });
    }
  };

  return (
    <div className="space-y-4">
      {/* Reglas de Sedes */}
      <Card className="border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-600" />
            Acceso por Sede
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Todas las sedes</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Permitir acceso en cualquier sede
              </p>
            </div>
            <Switch
              checked={rules.all_branches}
              onCheckedChange={(checked) => updateRules({ all_branches: checked })}
            />
          </div>

          {!rules.all_branches && (
            <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-700">
              <Label className="text-sm">Sedes permitidas</Label>
              {isLoading ? (
                <div className="text-sm text-gray-500">Cargando sedes...</div>
              ) : branches.length === 0 ? (
                <div className="text-sm text-gray-500">No hay sedes configuradas</div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {branches.map((branch) => (
                    <div
                      key={branch.id}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors",
                        rules.allowed_branches?.includes(branch.id)
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                      )}
                      onClick={() => toggleBranch(branch.id)}
                    >
                      <Checkbox
                        checked={rules.allowed_branches?.includes(branch.id)}
                        onCheckedChange={() => toggleBranch(branch.id)}
                      />
                      <span className="text-sm">{branch.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {!rules.all_branches && rules.allowed_branches?.length === 0 && (
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs">
                  <AlertCircle className="h-3 w-3" />
                  Selecciona al menos una sede
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reglas de Horario */}
      <Card className="border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-600" />
            Restricción de Horarios
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Habilitar restricción</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Limitar acceso a horarios específicos
              </p>
            </div>
            <Switch
              checked={rules.schedule_enabled}
              onCheckedChange={(checked) => updateRules({ schedule_enabled: checked })}
            />
          </div>

          {rules.schedule_enabled && (
            <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-700">
              {DAYS_OF_WEEK.map(({ key, label }) => {
                const daySchedule = rules.schedule?.[key] || { enabled: false, ranges: [] };
                
                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={daySchedule.enabled}
                          onCheckedChange={(checked) => 
                            updateDaySchedule(key, { enabled: !!checked })
                          }
                        />
                        <span className="text-sm font-medium w-24">{label}</span>
                      </div>
                      {daySchedule.enabled && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => addTimeRange(key)}
                          className="h-7 text-xs"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Agregar
                        </Button>
                      )}
                    </div>
                    
                    {daySchedule.enabled && daySchedule.ranges.length > 0 && (
                      <div className="ml-6 space-y-2">
                        {daySchedule.ranges.map((range, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="time"
                              value={range.start}
                              onChange={(e) => updateTimeRange(key, idx, 'start', e.target.value)}
                              className="text-sm px-2 py-1 border rounded dark:bg-gray-900 dark:border-gray-700"
                            />
                            <span className="text-gray-500">a</span>
                            <input
                              type="time"
                              value={range.end}
                              onChange={(e) => updateTimeRange(key, idx, 'end', e.target.value)}
                              className="text-sm px-2 py-1 border rounded dark:bg-gray-900 dark:border-gray-700"
                            />
                            {daySchedule.ranges.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeTimeRange(key, idx)}
                                className="h-7 w-7 p-0 text-red-500"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {daySchedule.enabled && daySchedule.ranges.length === 0 && (
                      <p className="ml-6 text-xs text-gray-500">
                        Sin horarios definidos (acceso todo el día)
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Límite de Check-ins */}
      <Card className="border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-600" />
            Límite de Check-ins
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label className="text-sm font-medium">Máximo check-ins por día</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Dejar vacío para ilimitado
              </p>
            </div>
            <Select
              value={rules.max_daily_checkins?.toString() || 'unlimited'}
              onValueChange={(val) => updateRules({ 
                max_daily_checkins: val === 'unlimited' ? undefined : parseInt(val) 
              })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unlimited">Ilimitado</SelectItem>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="2">2</SelectItem>
                <SelectItem value="3">3</SelectItem>
                <SelectItem value="5">5</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default AccessRulesEditor;
