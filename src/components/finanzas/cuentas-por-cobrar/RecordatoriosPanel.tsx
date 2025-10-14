'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Bell, Send, Calendar, AlertTriangle, RefreshCw, Mail, Phone } from 'lucide-react';
import { Recordatorio } from './types';
import { CuentasPorCobrarService } from './service';
import { formatCurrency } from '@/utils/Utils';
import { toast } from 'sonner';

interface RecordatoriosPanelProps {
  onRefresh: () => void;
}

export function RecordatoriosPanel({ onRefresh }: RecordatoriosPanelProps) {
  const [recordatorios, setRecordatorios] = useState<Recordatorio[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRecordatorios, setSelectedRecordatorios] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadRecordatorios();
  }, []);

  const loadRecordatorios = async () => {
    setIsLoading(true);
    try {
      const data = await CuentasPorCobrarService.obtenerCuentasParaRecordatorio();
      setRecordatorios(data);
    } catch (error) {
      console.error('Error al cargar recordatorios:', error);
      toast.error('Error al cargar los recordatorios');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectRecordatorio = (recordatorioId: string) => {
    const newSelected = new Set(selectedRecordatorios);
    if (newSelected.has(recordatorioId)) {
      newSelected.delete(recordatorioId);
    } else {
      newSelected.add(recordatorioId);
    }
    setSelectedRecordatorios(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedRecordatorios.size === recordatorios.length) {
      setSelectedRecordatorios(new Set());
    } else {
      setSelectedRecordatorios(new Set(recordatorios.map(r => r.id)));
    }
  };

  const handleEnviarRecordatorios = async () => {
    if (selectedRecordatorios.size === 0) {
      toast.error('Seleccione al menos un recordatorio');
      return;
    }

    const recordatoriosSeleccionados = recordatorios.filter(r => selectedRecordatorios.has(r.id));
    const recordatoriosConEmail = recordatoriosSeleccionados.filter(r => r.customer_email);

    if (recordatoriosConEmail.length === 0) {
      toast.error('Ninguno de los recordatorios seleccionados tiene email');
      return;
    }

    try {
      // Procesar recordatorios uno por uno
      let exitosos = 0;
      let fallidos = 0;

      for (const recordatorio of recordatoriosConEmail) {
        try {
          await CuentasPorCobrarService.actualizarFechaRecordatorio(recordatorio.id);
          exitosos++;
        } catch (error) {
          console.error(`Error al procesar recordatorio ${recordatorio.id}:`, error);
          fallidos++;
        }
      }

      if (exitosos > 0) {
        toast.success(`${exitosos} recordatorios enviados exitosamente`);
        if (fallidos > 0) {
          toast.warning(`${fallidos} recordatorios fallaron`);
        }
        await loadRecordatorios();
        onRefresh();
        setSelectedRecordatorios(new Set());
      } else {
        toast.error('No se pudo enviar ningún recordatorio');
      }
    } catch (error) {
      console.error('Error al enviar recordatorios:', error);
      toast.error('Error al enviar los recordatorios');
    }
  };

  const getUrgencyBadge = (daysOverdue: number) => {
    if (daysOverdue >= 90) {
      return <Badge variant="destructive" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 dark:bg-red-900/30 dark:text-red-400">Crítico</Badge>;
    } else if (daysOverdue >= 60) {
      return <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Urgente</Badge>;
    } else if (daysOverdue >= 30) {
      return <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Importante</Badge>;
    }
    return <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 dark:border-gray-600 dark:text-gray-400">Normal</Badge>;
  };

  if (isLoading) {
    return (
      <Card className="dark:bg-gray-800/50 dark:border-gray-700">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg text-gray-900 dark:text-white">
            Cargando recordatorios...
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/4 animate-pulse" />
                <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/4 animate-pulse" />
                <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/4 animate-pulse" />
                <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/4 animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700">
      <CardHeader className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
          <CardTitle className="text-base sm:text-lg text-gray-900 dark:text-white flex items-center gap-2">
            <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
            <span className="text-sm sm:text-base">Recordatorios ({recordatorios.length})</span>
          </CardTitle>
          <div className="flex gap-1.5 sm:gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={loadRecordatorios}
              disabled={isLoading}
              className="flex-1 sm:flex-none h-8 sm:h-9 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualizar</span>
            </Button>
            <Button
              size="sm"
              onClick={handleEnviarRecordatorios}
              disabled={selectedRecordatorios.size === 0}
              className="flex-1 sm:flex-none h-8 sm:h-9 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              <Send className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              <span>Enviar ({selectedRecordatorios.size})</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        {recordatorios.length === 0 ? (
          <div className="text-center py-6 sm:py-8">
            <div className="flex flex-col items-center gap-3">
              <Bell className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 dark:text-gray-600" />
              <div className="text-gray-500 dark:text-gray-400">
                <p className="text-base sm:text-lg font-medium">No hay recordatorios pendientes</p>
                <p className="text-xs sm:text-sm">Todas las cuentas están al día o ya tienen recordatorios recientes</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {/* Resumen */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 p-3 sm:p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <div className="text-center">
                <p className="text-[10px] sm:text-sm text-gray-600 dark:text-gray-400">Total Recordatorios</p>
                <p className="text-lg sm:text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {recordatorios.length}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] sm:text-sm text-gray-600 dark:text-gray-400">Monto Total</p>
                <p className="text-lg sm:text-2xl font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(recordatorios.reduce((sum, r) => sum + r.amount, 0))}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] sm:text-sm text-gray-600 dark:text-gray-400">Promedio Días</p>
                <p className="text-lg sm:text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {recordatorios.length > 0 ? Math.round(recordatorios.reduce((sum, r) => sum + r.days_overdue, 0) / recordatorios.length) : 0}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] sm:text-sm text-gray-600 dark:text-gray-400">Con Email</p>
                <p className="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-400">
                  {recordatorios.filter(r => r.customer_email).length}
                </p>
              </div>
            </div>

            {/* Vista móvil - Cards */}
            <div className="sm:hidden space-y-2">
              <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-900/50 rounded">
                <input
                  type="checkbox"
                  checked={selectedRecordatorios.size === recordatorios.length && recordatorios.length > 0}
                  onChange={handleSelectAll}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                <span className="text-xs text-gray-600 dark:text-gray-400">Seleccionar todos</span>
              </div>
              {recordatorios.map((recordatorio) => (
                <Card key={recordatorio.id} className="dark:bg-gray-700/50 dark:border-gray-600">
                  <CardContent className="p-3">
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={selectedRecordatorios.has(recordatorio.id)}
                          onChange={() => handleSelectRecordatorio(recordatorio.id)}
                          className="mt-1 rounded border-gray-300 dark:border-gray-600"
                        />
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-medium text-sm text-gray-900 dark:text-white">{recordatorio.customer_name}</h4>
                              {recordatorio.customer_email && (
                                <p className="text-[10px] text-gray-600 dark:text-gray-400 flex items-center mt-0.5">
                                  <Mail className="h-2 w-2 mr-0.5" />
                                  {recordatorio.customer_email}
                                </p>
                              )}
                            </div>
                            {getUrgencyBadge(recordatorio.days_overdue)}
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 mt-2 text-[10px]">
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Monto:</span>
                              <p className="font-medium text-red-600 dark:text-red-400">{formatCurrency(recordatorio.amount)}</p>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Días vencidos:</span>
                              <p className="font-medium text-red-600 dark:text-red-400 flex items-center gap-0.5">
                                <AlertTriangle className="h-2 w-2" />
                                {recordatorio.days_overdue}
                              </p>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Vence:</span>
                              <p className="font-medium text-gray-900 dark:text-white">{new Date(recordatorio.due_date).toLocaleDateString('es-ES')}</p>
                            </div>
                            <div>
                              <span className="text-gray-500 dark:text-gray-400">Último:</span>
                              <p className="font-medium text-gray-900 dark:text-white">
                                {recordatorio.last_reminder_date ? new Date(recordatorio.last_reminder_date).toLocaleDateString('es-ES') : 'Nunca'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            {/* Vista desktop - Tabla */}
            <div className="hidden sm:block rounded-md border dark:border-gray-700 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-700">
                    <TableHead className="text-xs dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={selectedRecordatorios.size === recordatorios.length && recordatorios.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300 dark:border-gray-600"
                      />
                    </TableHead>
                    <TableHead className="text-xs dark:text-gray-300">Cliente</TableHead>
                    <TableHead className="text-xs dark:text-gray-300">Contacto</TableHead>
                    <TableHead className="text-xs dark:text-gray-300">Monto</TableHead>
                    <TableHead className="text-xs dark:text-gray-300">Vencimiento</TableHead>
                    <TableHead className="text-xs dark:text-gray-300">Días Vencidos</TableHead>
                    <TableHead className="text-xs dark:text-gray-300">Último Recordatorio</TableHead>
                    <TableHead className="text-xs dark:text-gray-300">Urgencia</TableHead>
                  </TableRow>
                </TableHeader>
                  <TableBody>
                    {recordatorios.map((recordatorio) => (
                      <TableRow key={recordatorio.id} className="dark:border-gray-700 dark:hover:bg-gray-700/50">
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedRecordatorios.has(recordatorio.id)}
                            onChange={() => handleSelectRecordatorio(recordatorio.id)}
                            className="rounded border-gray-300 dark:border-gray-600"
                          />
                        </TableCell>
                        <TableCell className="text-sm font-medium dark:text-white">
                          {recordatorio.customer_name}
                        </TableCell>
                        <TableCell className="dark:text-gray-300">
                          <div className="flex flex-col space-y-1">
                            {recordatorio.customer_email ? (
                              <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                                <Mail className="h-2.5 w-2.5 mr-1" />
                                <span className="truncate max-w-[150px]">{recordatorio.customer_email}</span>
                              </div>
                            ) : (
                              <div className="flex items-center text-xs text-gray-400 dark:text-gray-500">
                                <Mail className="h-2.5 w-2.5 mr-1" />
                                Sin email
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="dark:text-gray-300">
                          <span className="text-sm font-medium text-red-600 dark:text-red-400">
                            {formatCurrency(recordatorio.amount)}
                          </span>
                        </TableCell>
                        <TableCell className="dark:text-gray-300">
                          <div className="flex items-center text-xs">
                            <Calendar className="h-2.5 w-2.5 mr-1 dark:text-gray-400" />
                            {new Date(recordatorio.due_date).toLocaleDateString('es-ES')}
                          </div>
                        </TableCell>
                        <TableCell className="dark:text-gray-300">
                          <div className="flex items-center gap-1">
                            <AlertTriangle className="h-2.5 w-2.5 text-red-500 dark:text-red-400" />
                            <span className="text-sm font-medium text-red-600 dark:text-red-400">
                              {recordatorio.days_overdue}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="dark:text-gray-300">
                          <span className="text-xs">
                            {recordatorio.last_reminder_date 
                              ? new Date(recordatorio.last_reminder_date).toLocaleDateString('es-ES')
                              : 'Nunca'
                            }
                          </span>
                        </TableCell>
                        <TableCell>
                          {getUrgencyBadge(recordatorio.days_overdue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
