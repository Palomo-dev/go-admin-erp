'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Plus, Lock, Unlock, Loader2, Ban, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PeriodosFiscalesService, FiscalPeriod } from './PeriodosFiscalesService';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function PeriodosFiscalesPage() {
  const [periodos, setPeriodos] = useState<FiscalPeriod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [newPeriodType, setNewPeriodType] = useState<'monthly' | 'annual'>('monthly');
  const [closePeriod, setClosePeriod] = useState<FiscalPeriod | null>(null);
  const [closeNotes, setCloseNotes] = useState('');

  useEffect(() => {
    loadPeriodos();
  }, []);

  const loadPeriodos = async () => {
    try {
      setIsLoading(true);
      const data = await PeriodosFiscalesService.obtenerPeriodos();
      setPeriodos(data);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cargar períodos fiscales');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async () => {
    try {
      if (newPeriodType === 'monthly') {
        await PeriodosFiscalesService.generarPeriodosMensuales(newYear);
        toast.success(`12 períodos mensuales generados para ${newYear}`);
      } else {
        await PeriodosFiscalesService.generarPeriodoAnual(newYear);
        toast.success(`Período anual generado para ${newYear}`);
      }
      setShowGenerate(false);
      loadPeriodos();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al generar períodos');
    }
  };

  const handleClose = async () => {
    if (!closePeriod) return;
    try {
      await PeriodosFiscalesService.cerrarPeriodo(closePeriod.id, closeNotes);
      toast.success('Período cerrado correctamente');
      setClosePeriod(null);
      setCloseNotes('');
      loadPeriodos();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cerrar período');
    }
  };

  const handleReopen = async (periodo: FiscalPeriod) => {
    try {
      await PeriodosFiscalesService.reabrirPeriodo(periodo.id);
      toast.success('Período reabierto');
      loadPeriodos();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al reabrir período');
    }
  };

  const handleLock = async (periodo: FiscalPeriod) => {
    try {
      await PeriodosFiscalesService.bloquearPeriodo(periodo.id);
      toast.success('Período bloqueado');
      loadPeriodos();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al bloquear período');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Abierto</Badge>;
      case 'closed':
        return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Cerrado</Badge>;
      case 'locked':
        return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Bloqueado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPeriodLabel = (periodo: FiscalPeriod) => {
    if (periodo.period_type === 'annual') return `Año ${periodo.year}`;
    if (periodo.month) return `${MESES[periodo.month - 1]} ${periodo.year}`;
    return `${periodo.year}`;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
            <CalendarClock className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Períodos Fiscales</h1>
            <p className="text-gray-500 dark:text-gray-400">Gestión de períodos contables</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowGenerate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Generar Períodos
          </Button>
        </div>
      </div>

      {periodos.length === 0 ? (
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="py-12 text-center">
            <CalendarClock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              No hay períodos fiscales creados
            </p>
            <Button onClick={() => setShowGenerate(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Generar Períodos
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {periodos.map((periodo) => (
            <Card key={periodo.id} className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-semibold text-gray-900 dark:text-white">
                        {getPeriodLabel(periodo)}
                      </CardTitle>
                      {getStatusBadge(periodo.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      <p>Inicio: {new Date(periodo.start_date).toLocaleDateString('es')}</p>
                      <p>Fin: {new Date(periodo.end_date).toLocaleDateString('es')}</p>
                      <p>Tipo: {periodo.period_type === 'annual' ? 'Anual' : 'Mensual'}</p>
                      {periodo.closed_at && (
                        <p>Cerrado: {new Date(periodo.closed_at).toLocaleDateString('es')}</p>
                      )}
                    </div>
                    {periodo.notes && (
                      <p className="text-xs text-gray-400 italic border-t pt-2">{periodo.notes}</p>
                    )}
                    <div className="flex gap-2 pt-2">
                      {periodo.status === 'open' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setClosePeriod(periodo); setCloseNotes(''); }}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Cerrar
                        </Button>
                      )}
                      {periodo.status === 'closed' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReopen(periodo)}
                          >
                            <Unlock className="h-3.5 w-3.5 mr-1" />
                            Reabrir
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleLock(periodo)}
                          >
                            <Lock className="h-3.5 w-3.5 mr-1" />
                            Bloquear
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            }
          </div>
      )}

      {/* Dialog Generar Períodos */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar Períodos Fiscales</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Año</Label>
              <Input
                type="number"
                value={newYear}
                onChange={(e) => setNewYear(parseInt(e.target.value) || new Date().getFullYear())}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Período</Label>
              <Select value={newPeriodType} onValueChange={(v: 'monthly' | 'annual') => setNewPeriodType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensuales (12 períodos)</SelectItem>
                  <SelectItem value="annual">Anual (1 período)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerate(false)}>Cancelar</Button>
            <Button onClick={handleGenerate}>Generar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Cerrar Período */}
      <Dialog open={!!closePeriod} onOpenChange={(v) => !v && setClosePeriod(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerrar Período</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Está por cerrar el período <strong>{closePeriod && getPeriodLabel(closePeriod)}</strong>.
              Una vez cerrado, no se podrán crear asientos en este período.
            </p>
            <div className="space-y-2">
              <Label>Notas (opcional)</Label>
              <Textarea
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                placeholder="Notas sobre el cierre..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosePeriod(null)}>Cancelar</Button>
            <Button onClick={handleClose}>Cerrar Período</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
