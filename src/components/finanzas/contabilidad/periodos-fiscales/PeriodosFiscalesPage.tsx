'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {CalendarClock, Plus, Unlock, CheckCircle2} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  PeriodosFiscalesService,
  FiscalPeriod,
  ConsecutivoComprobante,
  motivoReaperturaValido,
} from './PeriodosFiscalesService';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { PageHeaderSkeleton, StatsSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { usePermissionContext } from '@/hooks/usePermissionContext';
import {
  PERMISO_CERRAR_EJERCICIO,
  PERMISO_CERRAR_PERIODO,
  avisoPeriodo,
  botonesDePeriodo,
} from '@/lib/finanzas/permisosCierre';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function PeriodosFiscalesPage() {
  const { formatDate } = useFormatDate();
  const { organization } = useOrganization();
  const { checker, loading: cargandoPermisos } = usePermissionContext(organization?.id);
  const puede = (codigo: string) => checker.can(codigo);
  const puedeCerrarEjercicio = !cargandoPermisos && puede(PERMISO_CERRAR_EJERCICIO);
  const [periodos, setPeriodos] = useState<FiscalPeriod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showCierre, setShowCierre] = useState(false);
  const [anioCierre, setAnioCierre] = useState(new Date().getFullYear());
  const [cerrando, setCerrando] = useState(false);
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [newPeriodType, setNewPeriodType] = useState<'monthly' | 'yearly'>('monthly');
  const [closePeriod, setClosePeriod] = useState<FiscalPeriod | null>(null);
  const [closeNotes, setCloseNotes] = useState('');
  const [pendientesCierre, setPendientesCierre] = useState<{ borradores: number; pendientes: number } | null>(null);
  const [consecutivos, setConsecutivos] = useState<ConsecutivoComprobante[]>([]);
  const [reopenPeriod, setReopenPeriod] = useState<FiscalPeriod | null>(null);
  const [reopenReason, setReopenReason] = useState('');

  useEffect(() => {
    if (!closePeriod) {
      setPendientesCierre(null);
      setConsecutivos([]);
      return;
    }
    let vigente = true;
    void PeriodosFiscalesService.pendientesDelPeriodo(closePeriod.id).then((p) => { if (vigente) setPendientesCierre(p); });
    void PeriodosFiscalesService.consecutivosDelPeriodo(closePeriod.id).then((c) => { if (vigente) setConsecutivos(c); });
    return () => { vigente = false; };
  }, [closePeriod]);

  const cierreBloqueado = !!pendientesCierre && (pendientesCierre.borradores > 0 || pendientesCierre.pendientes > 0);

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
      toast.error(avisoPeriodo(error, 'Error al cerrar período'));
    }
  };

  const handleReopen = async () => {
    const periodo = reopenPeriod;
    if (!periodo) return;
    const motivo = motivoReaperturaValido(reopenReason);
    if (!motivo) {
      toast.error('Escriba el motivo de la reapertura (mínimo 5 caracteres).');
      return;
    }
    try {
      await PeriodosFiscalesService.reabrirPeriodo(periodo.id, motivo);
      toast.success('Período reabierto');
      setReopenPeriod(null);
      setReopenReason('');
      loadPeriodos();
    } catch (error) {
      console.error('Error:', error);
      toast.error(avisoPeriodo(error, 'Error al reabrir período'));
    }
  };

  const cerrarEjercicio = async () => {
    try {
      setCerrando(true);
      const resultado = await PeriodosFiscalesService.cerrarEjercicio(anioCierre);
      toast.success(`Ejercicio ${anioCierre} cerrado en ${resultado.cuenta_resultado} (${resultado.asientos} asientos)`);
      setShowCierre(false);
      loadPeriodos();
    } catch (error) {
      console.error(error);
      toast.error(avisoPeriodo(error, 'No se pudo cerrar el ejercicio'));
    } finally {
      setCerrando(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Abierto</Badge>;
      case 'closed':
        return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Cerrado</Badge>;
      case 'closing':
        return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">En cierre</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPeriodLabel = (periodo: FiscalPeriod) => {
    if (periodo.period_type === 'yearly') return `Año ${periodo.year}`;
    if (periodo.month) return `${MESES[periodo.month - 1]} ${periodo.year}`;
    return `${periodo.year}`;
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <StatsSkeleton count={4} />
        <CardListSkeleton cards={3} columns="1" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex flex-wrap items-center justify-between">
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
          {puedeCerrarEjercicio && (
            <Button variant="outline" onClick={() => setShowCierre(true)}>
              Cerrar ejercicio
            </Button>
          )}
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
          {periodos.map((periodo) => {
            const acciones = botonesDePeriodo(periodo, puede, cargandoPermisos);
            return (
            <Card key={periodo.id} className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between">
                      <CardTitle className="text-base font-semibold text-gray-900 dark:text-white">
                        {getPeriodLabel(periodo)}
                      </CardTitle>
                      {getStatusBadge(periodo.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      <p>Inicio: {formatPlainDate(periodo.start_date)}</p>
                      <p>Fin: {formatPlainDate(periodo.end_date)}</p>
                      <p>Tipo: {periodo.period_type === 'yearly' ? 'Anual' : periodo.period_type === 'quarterly' ? 'Trimestral' : 'Mensual'}</p>
                      {periodo.closed_at && (
                        <p>Cerrado: {formatDate(periodo.closed_at)}</p>
                      )}
                      {periodo.reopened_at && (
                        <p title={periodo.reopen_reason ?? undefined}>
                          Reabierto: {formatDate(periodo.reopened_at)}{periodo.reopen_reason ? ` — ${periodo.reopen_reason}` : ''}
                        </p>
                      )}
                    </div>
                    {periodo.notes && (
                      <p className="text-xs text-gray-400 italic border-t pt-2">{periodo.notes}</p>
                    )}
                    <div className="flex gap-2 pt-2">
                      {acciones.cerrar && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setClosePeriod(periodo); setCloseNotes(''); }}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Cerrar
                        </Button>
                      )}
                      {acciones.reabrir && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setReopenPeriod(periodo); setReopenReason(''); }}
                        >
                          <Unlock className="h-3.5 w-3.5 mr-1" />
                          Reabrir
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
            );
            })
            }
          </div>
      )}

      <Dialog open={showCierre} onOpenChange={setShowCierre}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerrar ejercicio</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Cancela las cuentas de resultado contra 3605. Si el año queda en pérdida, ese saldo pasa a 3610. Los periodos del año quedan cerrados. Si se reabre y se vuelve a cerrar, solo se cancela el saldo que siga abierto.
            </p>
            <div className="space-y-2">
              <Label>Año</Label>
              <Input type="number" value={anioCierre} onChange={(e) => setAnioCierre(parseInt(e.target.value, 10) || anioCierre)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCierre(false)}>Cancelar</Button>
            <Button onClick={() => { void cerrarEjercicio(); }} disabled={cerrando || !puedeCerrarEjercicio}>
              {cerrando ? 'Cerrando...' : 'Cerrar ejercicio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <Select value={newPeriodType} onValueChange={(v: 'monthly' | 'yearly') => setNewPeriodType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensuales (12 períodos)</SelectItem>
                  <SelectItem value="yearly">Anual (1 período)</SelectItem>
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
            {cierreBloqueado && pendientesCierre && (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                No se puede cerrar: hay {pendientesCierre.borradores} borrador(es) y {pendientesCierre.pendientes} asiento(s)
                pendiente(s) con fecha en el periodo. Contabilícelos o anúlelos primero.
              </p>
            )}
            {consecutivos.length > 0 && (
              <div className="space-y-1">
                <Label>Consecutivo por tipo de comprobante</Label>
                <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                  {consecutivos.map((c) => (
                    <li key={`${c.comprobante_tipo}-${c.comprobante_prefijo}`}>
                      <strong>{c.comprobante_tipo.replace(/_/g, ' ')}{c.comprobante_prefijo ? ` ${c.comprobante_prefijo}` : ''}</strong>:
                      {' '}del {c.desde} al {c.hasta} ({c.cantidad})
                      {c.saltos.length > 0 ? (
                        <span className="text-red-600 dark:text-red-400"> — faltan {c.saltos.slice(0, 20).join(', ')}{c.saltos.length > 20 ? '…' : ''}</span>
                      ) : (
                        <span className="text-green-600 dark:text-green-400"> — sin saltos</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
            <Button onClick={handleClose} disabled={!puede(PERMISO_CERRAR_PERIODO) || cierreBloqueado}>Cerrar Período</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Reabrir Período: el motivo es obligatorio */}
      <Dialog open={!!reopenPeriod} onOpenChange={(v) => !v && setReopenPeriod(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir Período</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Reabrir <strong>{reopenPeriod && getPeriodLabel(reopenPeriod)}</strong> permite volver a registrar asientos con fecha en ese periodo.
              Reabrir no reversa el asiento de cierre. Queda registrado quién lo reabrió, cuándo y por qué.
            </p>
            <div className="space-y-2">
              <Label htmlFor="motivo-reapertura">Motivo (obligatorio)</Label>
              <Textarea
                id="motivo-reapertura"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="Ej.: ajuste de una factura de proveedor recibida tarde"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenPeriod(null)}>Cancelar</Button>
            <Button onClick={() => { void handleReopen(); }} disabled={!motivoReaperturaValido(reopenReason)}>Reabrir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
