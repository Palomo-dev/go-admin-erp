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
      return <Badge variant="destructive" className="text-xs">Crítico</Badge>;
    } else if (daysOverdue >= 60) {
      return <Badge variant="secondary" className="text-xs bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">Urgente</Badge>;
    } else if (daysOverdue >= 30) {
      return <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400">Importante</Badge>;
    }
    return <Badge variant="outline" className="text-xs">Normal</Badge>;
  };

  if (isLoading) {
    return (
      <Card className="dark:bg-gray-800/50 dark:border-gray-700 light:bg-white">
        <CardHeader>
          <CardTitle className="text-lg text-gray-900 dark:text-white">
            Cargando recordatorios...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/4 animate-pulse" />
                <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/4 animate-pulse" />
                <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/4 animate-pulse" />
                <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/4 animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700 light:bg-white">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg text-gray-900 dark:text-white flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Recordatorios Automáticos ({recordatorios.length})
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadRecordatorios}
              disabled={isLoading}
              className="dark:border-gray-600 dark:hover:bg-gray-700"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
            <Button
              size="sm"
              onClick={handleEnviarRecordatorios}
              disabled={selectedRecordatorios.size === 0}
              className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              <Send className="h-4 w-4 mr-2" />
              Enviar ({selectedRecordatorios.size})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {recordatorios.length === 0 ? (
          <div className="text-center py-8">
            <div className="flex flex-col items-center gap-3">
              <Bell className="h-12 w-12 text-gray-400 dark:text-gray-600" />
              <div className="text-gray-500 dark:text-gray-400">
                <p className="text-lg font-medium">No hay recordatorios pendientes</p>
                <p className="text-sm">Todas las cuentas están al día o ya tienen recordatorios recientes</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Resumen */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Recordatorios</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {recordatorios.length}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">Monto Total</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(recordatorios.reduce((sum, r) => sum + r.amount, 0))}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">Promedio Días</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {recordatorios.length > 0 ? Math.round(recordatorios.reduce((sum, r) => sum + r.days_overdue, 0) / recordatorios.length) : 0}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">Con Email</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {recordatorios.filter(r => r.customer_email).length}
                </p>
              </div>
            </div>

            {/* Tabla de recordatorios */}
            <div className="rounded-md border dark:border-gray-700">
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-700">
                    <TableHead className="dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={selectedRecordatorios.size === recordatorios.length && recordatorios.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300 dark:border-gray-600"
                      />
                    </TableHead>
                    <TableHead className="dark:text-gray-300">Cliente</TableHead>
                    <TableHead className="dark:text-gray-300">Contacto</TableHead>
                    <TableHead className="dark:text-gray-300">Monto</TableHead>
                    <TableHead className="dark:text-gray-300">Vencimiento</TableHead>
                    <TableHead className="dark:text-gray-300">Días Vencidos</TableHead>
                    <TableHead className="dark:text-gray-300">Último Recordatorio</TableHead>
                    <TableHead className="dark:text-gray-300">Urgencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recordatorios.map((recordatorio) => (
                    <TableRow key={recordatorio.id} className="dark:border-gray-700">
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedRecordatorios.has(recordatorio.id)}
                          onChange={() => handleSelectRecordatorio(recordatorio.id)}
                          className="rounded border-gray-300 dark:border-gray-600"
                        />
                      </TableCell>
                      <TableCell className="font-medium dark:text-white">
                        {recordatorio.customer_name}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <div className="flex flex-col space-y-1">
                          {recordatorio.customer_email ? (
                            <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                              <Mail className="h-3 w-3 mr-1" />
                              {recordatorio.customer_email}
                            </div>
                          ) : (
                            <div className="flex items-center text-sm text-gray-400 dark:text-gray-500">
                              <Mail className="h-3 w-3 mr-1" />
                              Sin email
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <span className="font-medium text-red-600 dark:text-red-400">
                          {formatCurrency(recordatorio.amount)}
                        </span>
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <div className="flex items-center text-sm">
                          <Calendar className="h-3 w-3 mr-1" />
                          {new Date(recordatorio.due_date).toLocaleDateString('es-ES')}
                        </div>
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 text-red-500" />
                          <span className="font-medium text-red-600 dark:text-red-400">
                            {recordatorio.days_overdue}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <span className="text-sm">
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
