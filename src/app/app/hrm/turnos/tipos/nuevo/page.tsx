'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { ArrowLeft, Clock, Save, Loader2, Palette, Moon, Sun, Coffee } from 'lucide-react';

const PRESET_COLORS = [
  { name: 'Verde', value: '#22c55e' },
  { name: 'Azul', value: '#3b82f6' },
  { name: 'Índigo', value: '#6366f1' },
  { name: 'Púrpura', value: '#8b5cf6' },
  { name: 'Rosa', value: '#ec4899' },
  { name: 'Rojo', value: '#ef4444' },
  { name: 'Naranja', value: '#f97316' },
  { name: 'Amarillo', value: '#f59e0b' },
  { name: 'Verde azulado', value: '#14b8a6' },
  { name: 'Gris', value: '#64748b' },
];

const PRESET_SHIFTS = [
  { name: 'Turno Mañana', code: 'MAN', start: '06:00', end: '14:00', color: '#22c55e', isNight: false },
  { name: 'Turno Tarde', code: 'TAR', start: '14:00', end: '22:00', color: '#3b82f6', isNight: false },
  { name: 'Turno Noche', code: 'NOC', start: '22:00', end: '06:00', color: '#6366f1', isNight: true },
  { name: 'Turno Administrativo', code: 'ADM', start: '08:00', end: '17:00', color: '#8b5cf6', isNight: false },
  { name: 'Media Jornada Mañana', code: 'MJM', start: '08:00', end: '12:00', color: '#14b8a6', isNight: false },
  { name: 'Media Jornada Tarde', code: 'MJT', start: '14:00', end: '18:00', color: '#f59e0b', isNight: false },
  { name: 'Turno Partido', code: 'PAR', start: '08:00', end: '12:00', color: '#ec4899', isNight: false },
  { name: 'Turno Fin de Semana', code: 'FDS', start: '09:00', end: '18:00', color: '#ef4444', isNight: false },
];

export default function NuevoTipoTurnoPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    start_time: '08:00',
    end_time: '17:00',
    break_minutes: 60,
    paid_break: false,
    is_night_shift: false,
    is_split_shift: false,
    color: '#3b82f6',
    is_active: true,
  });

  const handlePresetClick = (preset: typeof PRESET_SHIFTS[0]) => {
    setFormData({
      ...formData,
      name: preset.name,
      code: preset.code,
      start_time: preset.start,
      end_time: preset.end,
      color: preset.color,
      is_night_shift: preset.isNight,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!organization?.id) {
      toast({ title: 'Error', description: 'Organización no encontrada', variant: 'destructive' });
      return;
    }

    if (!formData.name || !formData.start_time || !formData.end_time) {
      toast({ title: 'Error', description: 'Completa los campos requeridos', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('shift_templates')
        .insert({
          organization_id: organization.id,
          ...formData,
        });

      if (error) throw error;

      toast({ title: 'Tipo de turno creado correctamente' });
      router.push('/app/hrm/turnos');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo crear el tipo de turno',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/app/hrm/turnos">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Clock className="h-7 w-7 text-blue-600" />
            Nuevo Tipo de Turno
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            HRM / Turnos / Tipos / Nuevo
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
        {/* Plantillas predefinidas */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-lg">Plantillas Rápidas</CardTitle>
            <CardDescription>Selecciona una plantilla para autocompletar los campos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {PRESET_SHIFTS.map((preset) => (
                <Button
                  key={preset.code}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-start text-left h-auto py-2"
                  onClick={() => handlePresetClick(preset)}
                >
                  <div
                    className="w-3 h-3 rounded-full mr-2 flex-shrink-0"
                    style={{ backgroundColor: preset.color }}
                  />
                  <div className="truncate">
                    <div className="font-medium text-xs">{preset.name}</div>
                    <div className="text-xs text-gray-500">{preset.start} - {preset.end}</div>
                  </div>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Información básica */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              Información del Turno
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre <span className="text-red-500">*</span></Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Turno Mañana"
                  className="bg-white dark:bg-gray-900"
                />
              </div>
              <div className="space-y-2">
                <Label>Código</Label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="Ej: MAN"
                  maxLength={5}
                  className="bg-white dark:bg-gray-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Hora Inicio <span className="text-red-500">*</span></Label>
                <Input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  className="bg-white dark:bg-gray-900"
                />
              </div>
              <div className="space-y-2">
                <Label>Hora Fin <span className="text-red-500">*</span></Label>
                <Input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  className="bg-white dark:bg-gray-900"
                />
              </div>
              <div className="space-y-2">
                <Label>Descanso (min)</Label>
                <Input
                  type="number"
                  value={formData.break_minutes}
                  onChange={(e) => setFormData({ ...formData, break_minutes: parseInt(e.target.value) || 0 })}
                  min={0}
                  max={120}
                  className="bg-white dark:bg-gray-900"
                />
              </div>
            </div>

            {/* Color */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Color del turno
              </Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      formData.color === color.value
                        ? 'border-gray-900 dark:border-white scale-110'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: color.value }}
                    onClick={() => setFormData({ ...formData, color: color.value })}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Opciones */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-lg">Opciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
              <div className="flex items-center gap-3">
                <Moon className="h-5 w-5 text-indigo-500" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Turno Nocturno</p>
                  <p className="text-sm text-gray-500">Aplica recargo nocturno según reglas del país</p>
                </div>
              </div>
              <Switch
                checked={formData.is_night_shift}
                onCheckedChange={(checked) => setFormData({ ...formData, is_night_shift: checked })}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
              <div className="flex items-center gap-3">
                <Coffee className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Descanso Pagado</p>
                  <p className="text-sm text-gray-500">El tiempo de descanso se incluye como hora trabajada</p>
                </div>
              </div>
              <Switch
                checked={formData.paid_break}
                onCheckedChange={(checked) => setFormData({ ...formData, paid_break: checked })}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
              <div className="flex items-center gap-3">
                <Sun className="h-5 w-5 text-orange-500" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Turno Partido</p>
                  <p className="text-sm text-gray-500">El turno tiene un descanso largo entre bloques</p>
                </div>
              </div>
              <Switch
                checked={formData.is_split_shift}
                onCheckedChange={(checked) => setFormData({ ...formData, is_split_shift: checked })}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-green-500" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Activo</p>
                  <p className="text-sm text-gray-500">Disponible para asignar a empleados</p>
                </div>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Acciones */}
        <div className="flex items-center justify-end gap-3">
          <Link href="/app/hrm/turnos">
            <Button type="button" variant="outline" disabled={isSubmitting}>
              Cancelar
            </Button>
          </Link>
          <Button type="submit" disabled={isSubmitting} className="min-w-[150px]">
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Crear Tipo de Turno
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
