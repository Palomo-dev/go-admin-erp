'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Calendar, Plus, Lock, Unlock, Loader2, Trash2, Edit, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PeriodosContablesService, FiscalPeriod } from './PeriodosContablesService';
import { getCurrentUserId } from '@/lib/hooks/useOrganization';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export function PeriodosContablesPage() {
  const [periodos, setPeriodos] = useState<FiscalPeriod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [selectedPeriodo, setSelectedPeriodo] = useState<FiscalPeriod | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [newPeriodo, setNewPeriodo] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    period_type: 'monthly' as const
  });
  const [generateYear, setGenerateYear] = useState(new Date().getFullYear());
  const [filterYear, setFilterYear] = useState<number | null>(null);

  useEffect(() => {
    loadPeriodos();
  }, []);

  const loadPeriodos = async () => {
    try {
      setIsLoading(true);
      const data = await PeriodosContablesService.obtenerPeriodos();
      setPeriodos(data);
    } catch (error) {
      console.error('Error cargando periodos:', error);
      toast.error('Error al cargar los periodos contables');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreatePeriodo = async () => {
    try {
      setIsProcessing(true);
      const startDate = new Date(newPeriodo.year, newPeriodo.month - 1, 1);
      const endDate = new Date(newPeriodo.year, newPeriodo.month, 0);

      await PeriodosContablesService.crearPeriodo({
        year: newPeriodo.year,
        month: newPeriodo.month,
        period_type: newPeriodo.period_type,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0]
      });

      toast.success('Periodo creado exitosamente');
      setShowNewDialog(false);
      loadPeriodos();
    } catch (error) {
      console.error('Error creando periodo:', error);
      toast.error('Error al crear el periodo');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGeneratePeriodos = async () => {
    try {
      setIsProcessing(true);
      await PeriodosContablesService.generarPeriodosAnuales(generateYear);
      toast.success(`Periodos del año ${generateYear} generados exitosamente`);
      setShowGenerateDialog(false);
      loadPeriodos();
    } catch (error) {
      console.error('Error generando periodos:', error);
      toast.error('Error al generar los periodos');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClosePeriodo = async () => {
    if (!selectedPeriodo) return;

    try {
      setIsProcessing(true);
      const userId = getCurrentUserId();
      await PeriodosContablesService.cerrarPeriodo(selectedPeriodo.id, userId || '');
      toast.success('Periodo cerrado exitosamente');
      setShowCloseDialog(false);
      setSelectedPeriodo(null);
      loadPeriodos();
    } catch (error) {
      console.error('Error cerrando periodo:', error);
      toast.error('Error al cerrar el periodo');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReopenPeriodo = async (periodo: FiscalPeriod) => {
    try {
      await PeriodosContablesService.reabrirPeriodo(periodo.id);
      toast.success('Periodo reabierto exitosamente');
      loadPeriodos();
    } catch (error) {
      console.error('Error reabriendo periodo:', error);
      toast.error('Error al reabrir el periodo');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Abierto</Badge>;
      case 'closing':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Cerrando</Badge>;
      case 'closed':
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">Cerrado</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const filteredPeriodos = filterYear 
    ? periodos.filter(p => p.year === filterYear)
    : periodos;

  const uniqueYears = [...new Set(periodos.map(p => p.year))].sort((a, b) => b - a);

  if (isLoading) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <Calendar className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Periodos Contables
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Gestión de apertura y cierre de periodos fiscales
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select
            value={filterYear?.toString() || 'all'}
            onValueChange={(value) => setFilterYear(value === 'all' ? null : parseInt(value))}
          >
            <SelectTrigger className="w-[140px] dark:bg-gray-800 dark:border-gray-700">
              <SelectValue placeholder="Filtrar año" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los años</SelectItem>
              {uniqueYears.map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="dark:border-gray-600 dark:hover:bg-gray-800">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Generar Año
              </Button>
            </DialogTrigger>
            <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
              <DialogHeader>
                <DialogTitle className="text-gray-900 dark:text-white">Generar Periodos Anuales</DialogTitle>
                <DialogDescription className="dark:text-gray-400">
                  Se crearán 12 periodos mensuales para el año seleccionado
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="text-gray-700 dark:text-gray-300">Año</Label>
                  <Input
                    type="number"
                    value={generateYear}
                    onChange={(e) => setGenerateYear(parseInt(e.target.value))}
                    className="dark:bg-gray-900 dark:border-gray-600"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowGenerateDialog(false)} className="dark:border-gray-600">
                  Cancelar
                </Button>
                <Button onClick={handleGeneratePeriodos} disabled={isProcessing} className="bg-blue-600 hover:bg-blue-700">
                  {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
                  Generar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Periodo
              </Button>
            </DialogTrigger>
            <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
              <DialogHeader>
                <DialogTitle className="text-gray-900 dark:text-white">Nuevo Periodo Contable</DialogTitle>
                <DialogDescription className="dark:text-gray-400">
                  Crea un nuevo periodo fiscal
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-700 dark:text-gray-300">Año</Label>
                    <Input
                      type="number"
                      value={newPeriodo.year}
                      onChange={(e) => setNewPeriodo({ ...newPeriodo, year: parseInt(e.target.value) })}
                      className="dark:bg-gray-900 dark:border-gray-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-700 dark:text-gray-300">Mes</Label>
                    <Select
                      value={newPeriodo.month.toString()}
                      onValueChange={(value) => setNewPeriodo({ ...newPeriodo, month: parseInt(value) })}
                    >
                      <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((month, index) => (
                          <SelectItem key={index} value={(index + 1).toString()}>{month}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNewDialog(false)} className="dark:border-gray-600">
                  Cancelar
                </Button>
                <Button onClick={handleCreatePeriodo} disabled={isProcessing} className="bg-blue-600 hover:bg-blue-700">
                  {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  Crear
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Periodos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{periodos.length}</div>
          </CardContent>
        </Card>
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Periodos Abiertos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {periodos.filter(p => p.status === 'open').length}
            </div>
          </CardContent>
        </Card>
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">Periodos Cerrados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600 dark:text-gray-300">
              {periodos.filter(p => p.status === 'closed').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabla */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">Lista de Periodos</CardTitle>
          <CardDescription className="dark:text-gray-400">
            {filteredPeriodos.length} periodos encontrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="dark:border-gray-700">
                <TableHead className="dark:text-gray-300">Periodo</TableHead>
                <TableHead className="dark:text-gray-300">Año</TableHead>
                <TableHead className="dark:text-gray-300">Fecha Inicio</TableHead>
                <TableHead className="dark:text-gray-300">Fecha Fin</TableHead>
                <TableHead className="dark:text-gray-300">Estado</TableHead>
                <TableHead className="dark:text-gray-300">Cerrado Por</TableHead>
                <TableHead className="text-right dark:text-gray-300">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPeriodos.map((periodo) => (
                <TableRow key={periodo.id} className="dark:border-gray-700">
                  <TableCell className="font-medium text-gray-900 dark:text-white">
                    {periodo.month ? MONTHS[periodo.month - 1] : 'Anual'}
                  </TableCell>
                  <TableCell className="text-gray-700 dark:text-gray-300">{periodo.year}</TableCell>
                  <TableCell className="text-gray-700 dark:text-gray-300">
                    {new Date(periodo.start_date).toLocaleDateString('es-CO')}
                  </TableCell>
                  <TableCell className="text-gray-700 dark:text-gray-300">
                    {new Date(periodo.end_date).toLocaleDateString('es-CO')}
                  </TableCell>
                  <TableCell>{getStatusBadge(periodo.status)}</TableCell>
                  <TableCell className="text-gray-500 dark:text-gray-400">
                    {periodo.closed_at 
                      ? new Date(periodo.closed_at).toLocaleDateString('es-CO')
                      : '-'
                    }
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {periodo.status === 'open' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedPeriodo(periodo);
                            setShowCloseDialog(true);
                          }}
                          className="text-yellow-600 border-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                        >
                          <Lock className="h-4 w-4" />
                        </Button>
                      )}
                      {periodo.status === 'closed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReopenPeriodo(periodo)}
                          className="text-green-600 border-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                        >
                          <Unlock className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog Cerrar Periodo */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">Cerrar Periodo</DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              ¿Estás seguro de cerrar este periodo? No se podrán registrar más movimientos.
            </DialogDescription>
          </DialogHeader>
          {selectedPeriodo && (
            <div className="py-4">
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  <span className="font-medium text-yellow-800 dark:text-yellow-300">
                    {selectedPeriodo.month ? MONTHS[selectedPeriodo.month - 1] : 'Anual'} {selectedPeriodo.year}
                  </span>
                </div>
                <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                  Esta acción bloqueará todos los registros contables de este periodo.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseDialog(false)} className="dark:border-gray-600">
              Cancelar
            </Button>
            <Button onClick={handleClosePeriodo} disabled={isProcessing} className="bg-yellow-600 hover:bg-yellow-700">
              {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
              Cerrar Periodo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
