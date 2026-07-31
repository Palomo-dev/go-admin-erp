'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Calendar, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { RouteSchedule, transportRoutesService } from '@/lib/services/transportRoutesService';

interface GenerateTripsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: RouteSchedule | null;
  organizationId: number;
  onSuccess: () => void;
}

const DAYS_OF_WEEK = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function GenerateTripsDialog({
  open,
  onOpenChange,
  schedule,
  organizationId,
  onSuccess,
}: GenerateTripsDialogProps) {
  const today = new Date().toISOString().split('T')[0];
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(nextWeek);
  const [isGenerating, setIsGenerating] = useState(false);
  const [preview, setPreview] = useState<string[]>([]);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const [availability, setAvailability] = useState<{ conflicts: string[] } | null>(null);

  useEffect(() => {
    if (schedule && open) {
      // Calcular preview de fechas
      const dates = transportRoutesService.getScheduleDates(schedule, startDate, endDate);
      setPreview(dates);
      setResult(null);
      setAvailability(null);

      // Verificar disponibilidad para la primera fecha
      if (dates.length > 0 && (schedule.default_vehicle_id || schedule.default_driver_id)) {
        checkFirstDateAvailability(dates[0]);
      }
    }
  }, [schedule, startDate, endDate, open]);

  const checkFirstDateAvailability = async (date: string) => {
    if (!schedule) return;
    const result = await transportRoutesService.checkAvailability(
      schedule.default_vehicle_id,
      schedule.default_driver_id,
      date,
      schedule.departure_time,
      schedule.arrival_time
    );
    setAvailability(result);
  };

  const getRecurrenceDescription = () => {
    if (!schedule) return '';
    switch (schedule.recurrence_type) {
      case 'daily':
        return 'Todos los días';
      case 'weekly':
        return `Días: ${schedule.days_of_week?.map((d) => DAYS_OF_WEEK[d]).join(', ')}`;
      case 'specific_dates':
        return `${schedule.specific_dates?.length || 0} fechas específicas`;
      default:
        return schedule.recurrence_type;
    }
  };

  const handleGenerate = async () => {
    if (!schedule) return;

    setIsGenerating(true);
    try {
      const generationResult = await transportRoutesService.generateTripsFromSchedule(
        schedule,
        startDate,
        endDate,
        organizationId
      );
      setResult(generationResult);
      
      if (generationResult.created > 0) {
        onSuccess();
      }
    } catch (error) {
      console.error('Error generando viajes:', error);
      setResult({ created: 0, skipped: 0, errors: ['Error inesperado al generar viajes'] });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    setAvailability(null);
    onOpenChange(false);
  };

  if (!schedule) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Generar Viajes
          </DialogTitle>
          <DialogDescription>
            Crear viajes automáticamente desde el horario seleccionado
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info del horario */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">{schedule.schedule_name || 'Sin nombre'}</span>
              <Badge variant="outline">{schedule.departure_time}</Badge>
            </div>
            <p className="text-sm text-gray-500">
              {schedule.transport_routes?.name} • {getRecurrenceDescription()}
            </p>
          </div>

          {/* Rango de fechas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">Fecha inicio</Label>
              <Input
                id="start_date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={today}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">Fecha fin</Label>
              <Input
                id="end_date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
              />
            </div>
          </div>

          {/* Preview de fechas */}
          <div className="space-y-2">
            <Label>Viajes a generar: {preview.length}</Label>
            {preview.length > 0 ? (
              <div className="max-h-32 overflow-y-auto border rounded-lg p-2">
                <div className="flex flex-wrap gap-1">
                  {preview.slice(0, 20).map((date) => (
                    <Badge key={date} variant="secondary" className="text-xs">
                      {new Date(date + 'T00:00:00').toLocaleDateString('es-CO', { 
                        weekday: 'short', 
                        day: 'numeric', 
                        month: 'short' 
                      })}
                    </Badge>
                  ))}
                  {preview.length > 20 && (
                    <Badge variant="outline" className="text-xs">
                      +{preview.length - 20} más
                    </Badge>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                No hay fechas que coincidan con la programación
              </p>
            )}
          </div>

          {/* Alertas de disponibilidad */}
          {availability && availability.conflicts.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium">Conflictos de disponibilidad:</p>
                <ul className="list-disc list-inside text-sm mt-1">
                  {availability.conflicts.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Resultado de generación */}
          {result && (
            <Alert variant={result.created > 0 ? 'default' : 'destructive'}>
              {result.created > 0 ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                <div className="space-y-1">
                  <p>
                    <span className="font-medium text-green-600">{result.created}</span> viajes creados
                    {result.skipped > 0 && (
                      <span className="text-gray-500"> • {result.skipped} ya existían</span>
                    )}
                  </p>
                  {result.errors.length > 0 && (
                    <div className="text-sm text-red-600">
                      <p>Errores:</p>
                      <ul className="list-disc list-inside">
                        {result.errors.slice(0, 3).map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                        {result.errors.length > 3 && (
                          <li>...y {result.errors.length - 3} más</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isGenerating}>
            {result ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!result && (
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || preview.length === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isGenerating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Generar {preview.length} viaje{preview.length !== 1 ? 's' : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
