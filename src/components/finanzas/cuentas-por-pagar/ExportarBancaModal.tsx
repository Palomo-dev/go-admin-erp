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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Download,
  Upload,
  FileText,
  Calendar,
  AlertTriangle,
  Loader2,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';

import { CuentasPorPagarService } from './CuentasPorPagarService';
import { AccountPayable, BankFileTransaction } from './types';
import { FORMATOS_BANCO, buscarFormato, generarContenidoArchivo } from './formatosBanca';
import { formatCurrency } from '@/utils/Utils';
import { describeError } from '@/lib/utils/errorMessage';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';

/**
 * Lo que la pantalla puede prometer hoy sobre el archivo de confirmación
 * bancaria: leerlo y enseñarlo. Nada más.
 *
 * Aquí había un `conciliarPagos` que hacía `setTimeout` + `console.log` y
 * resolvía, y la interfaz remataba con «Conciliación completada — Se
 * conciliaron N pagos correctamente». No se escribía absolutamente nada: ni un
 * `payment`, ni un movimiento de cartera. Un usuario que creyera el mensaje
 * daba por cobradas facturas que seguían abiertas. Se retiró entero. Lo que
 * haría falta para la conciliación de verdad está en `docs/hallazgos/F-69.md`.
 */
const AVISO_SIN_CONCILIAR =
  'Vista previa: esto NO se ha aplicado. Los registros solo se muestran; ninguna cuenta por pagar se ha marcado como pagada y no se ha creado ningún pago. Para registrar un pago, hazlo desde la cuenta por pagar correspondiente.';

// Lee el archivo de confirmación del banco y lo convierte en filas mostrables.
// No cruza nada contra `accounts_payable`: por eso cada registro nace sin
// pareja (`unmatched`) y se muestra como «Sin cruzar».
const procesarArchivoBanco = async (file: File): Promise<BankFileTransaction[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const texto = e.target?.result as string;
        const lineas = texto.split('\n').filter(linea => linea.trim() !== '');
        
        const registros: BankFileTransaction[] = [];
        
        lineas.forEach((linea, index) => {
          if (index === 0 && (linea.includes('REFERENCIA') || linea.includes('NIT'))) {
            return; // Saltar encabezado
          }
          
          const partes = linea.split(/[;,\t]/);
          if (partes.length >= 3) {
            registros.push({
              id: `temp_${index}`,
              bank_file_id: 'temp',
              reference: partes[0]?.trim() || '',
              amount: parseFloat(partes[2]?.replace(/[^\d.-]/g, '')) || 0,
              transaction_date: new Date().toISOString(),
              description: partes[1]?.trim() || '',
              status: 'unmatched'
            });
          }
        });
        
        resolve(registros);
      } catch (error) {
        reject(new Error('Error al procesar el archivo'));
      }
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsText(file);
  });
};

interface ExportarBancaModalProps {
  cuentasSeleccionadas: string[];
  isOpen: boolean;
  onClose: () => void;
  onExportado: () => void;
}

export function ExportarBancaModal({
  cuentasSeleccionadas,
  isOpen,
  onClose,
  onExportado
}: ExportarBancaModalProps) {
  // Sin `branchId`: el lote mezcla cuentas de cualquier sucursal, asi que la
  // zona es la de la organizacion. `getToday()` sale del contexto (identidad),
  // nunca del reloj del navegador.
  const { formatDate, getToday } = useFormatDate();
  // Estados
  const [cuentas, setCuentas] = useState<AccountPayable[]>([]);
  const [loading, setLoading] = useState(true);
  const [formatoBanco, setFormatoBanco] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [archivoSubido, setArchivoSubido] = useState(false);
  const [registrosLeidos, setRegistrosLeidos] = useState<BankFileTransaction[]>([]);
  const [pestanaActiva, setPestanaActiva] = useState<'exportar' | 'revisar'>('exportar');

  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && cuentasSeleccionadas.length > 0) {
      cargarCuentas();
    }
  }, [isOpen, cuentasSeleccionadas]);

  const cargarCuentas = async () => {
    try {
      setLoading(true);
      // Obtener cuentas seleccionadas usando filtros básicos
      const cuentasData = await CuentasPorPagarService.obtenerCuentasPorPagar({
        busqueda: '',
        estado: 'todos',
        proveedor: 'todos',
        fechaDesde: '',
        fechaHasta: '',
        vencimiento: 'todos',
        montoMinimo: null,
        montoMaximo: null
      }, 1, 1000);
      // Filtrar solo las cuentas seleccionadas
      const cuentasFiltradas = cuentasData.cuentas.filter(cuenta => 
        cuentasSeleccionadas.includes(cuenta.id)
      );
      setCuentas(cuentasFiltradas);
    } catch (error) {
      console.error('Error cargando cuentas:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las cuentas seleccionadas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExportar = async () => {
    if (!formatoBanco) {
      toast({
        title: "Formato requerido",
        description: "Debe seleccionar un formato bancario",
        variant: "destructive",
      });
      return;
    }

    try {
      setProcesando(true);

      // 1. PRIMERO el archivo. Es lo que la persona vino a buscar y no puede
      //    depender de que la auditoria salga bien. Hasta el 2026-09-24 el
      //    orden era el contrario: se llamaba al servicio, el insert reventaba
      //    porque `bank_files` no existia, y la descarga no llegaba a ocurrir.
      const contenido = generarContenidoArchivo(cuentas, formatoBanco, formatDate);
      const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;

      const formato = buscarFormato(formatoBanco);
      const fechaHoy = getToday();
      a.download = `pagos_${fechaHoy}${formato?.extension || '.txt'}`;

      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Archivo exportado",
        description: `Se exportaron ${cuentasSeleccionadas.length} pagos correctamente`,
      });

      // 2. DESPUES el rastro. Si no se puede registrar, la persona conserva su
      //    archivo, pero se le dice: un fallo de auditoria no pasa en silencio.
      const registro = await CuentasPorPagarService.exportarParaBancaOnline(
        cuentasSeleccionadas,
        { extension: formato?.extension, tipo: formato?.tipo },
      );

      if (!registro.registrado) {
        toast({
          title: "El archivo se descargó, pero no quedó registrado",
          description: `No se pudo guardar el rastro de esta exportación: ${registro.error ?? 'motivo desconocido'}`,
          variant: "destructive",
        });
      }

      onExportado();
    } catch (error: unknown) {
      console.error('Error exportando archivo:', error);
      toast({
        title: "Error al exportar",
        description: describeError(error),
        variant: "destructive",
      });
    } finally {
      setProcesando(false);
    }
  };

  const handleSubirArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setArchivo(file);
    
    try {
      setProcesando(true);
      const registros = await procesarArchivoBanco(file);
      setRegistrosLeidos(registros);
      setArchivoSubido(true);

      toast({
        title: "Archivo leído",
        description: `Se leyeron ${registros.length} registros. No se ha conciliado nada: es solo una vista previa.`,
      });
    } catch (error: unknown) {
      console.error('Error procesando archivo:', error);
      toast({
        title: "Error al procesar archivo",
        description: describeError(error) || "Formato de archivo no válido",
        variant: "destructive",
      });
      setArchivo(null);
    } finally {
      setProcesando(false);
    }
  };

  const getTotalMonto = () => {
    return cuentas.reduce((total, cuenta) => total + cuenta.balance, 0);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-full sm:max-w-3xl lg:max-w-5xl max-h-[90vh] overflow-hidden dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader className="pb-3">
          <DialogTitle className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-base sm:text-lg text-gray-900 dark:text-white">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>Exportar a banca online</span>
            </div>
            <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 dark:bg-gray-700 dark:text-gray-300">
              {cuentasSeleccionadas.length} cuenta{cuentasSeleccionadas.length !== 1 ? 's' : ''}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              pestanaActiva === 'exportar'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => setPestanaActiva('exportar')}
          >
            <Download className="w-4 h-4 inline mr-2" />
            Exportar Pagos
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              pestanaActiva === 'revisar'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => setPestanaActiva('revisar')}
          >
            <Upload className="w-4 h-4 inline mr-2" />
            Revisar archivo del banco
          </button>
        </div>

        <div className="overflow-y-auto max-h-[60vh] -mx-6 px-6">
          {pestanaActiva === 'exportar' ? (
            // Pestaña de Exportar
            <div className="space-y-6">
              {/* Resumen de exportación */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between">
                    <div>
                      <h3 className="font-medium">Resumen de Exportación</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {cuentasSeleccionadas.length} cuenta{cuentasSeleccionadas.length !== 1 ? 's' : ''} seleccionada{cuentasSeleccionadas.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600 dark:text-gray-400">Total a pagar</p>
                      <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                        {formatCurrency(getTotalMonto())}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Formato de banco */}
              <div className="space-y-2">
                <Label>Formato Bancario *</Label>
                <Select value={formatoBanco} onValueChange={setFormatoBanco}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar formato de banco" />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMATOS_BANCO.map((formato) => (
                      <SelectItem key={formato.value} value={formato.value}>
                        <div className="flex items-center justify-between w-full">
                          <span>{formato.label}</span>
                          <Badge variant="outline" className="ml-2">
                            {formato.extension}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Lista de cuentas a exportar */}
              <div className="space-y-2">
                <h4 className="font-medium">Cuentas a Exportar</h4>
                <div className="border rounded-lg max-h-60 overflow-y-auto">
                  {loading ? (
                    <div className="p-4">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="flex items-center justify-between py-2">
                          <div className="space-y-1">
                            <Skeleton className="h-4 w-48" />
                            <Skeleton className="h-3 w-32" />
                          </div>
                          <Skeleton className="h-4 w-20" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Proveedor</TableHead>
                          <TableHead>Vencimiento</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cuentas.map((cuenta) => (
                          <TableRow key={cuenta.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">
                                  {cuenta.supplier?.name || 'Sin nombre'}
                                </p>
                                {cuenta.supplier?.nit && (
                                  <p className="text-sm text-gray-500">
                                    NIT: {cuenta.supplier.nit}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {cuenta.due_date ? (
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-4 h-4" />
                                  <span>{formatDate(cuenta.due_date)}</span>
                                  {cuenta.days_overdue && cuenta.days_overdue > 0 && (
                                    <Badge variant="destructive" className="ml-1">
                                      +{cuenta.days_overdue}d
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400">Sin vencimiento</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(cuenta.balance)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            </div>
          ) : (
            // Pestaña de revisión: LEER el archivo del banco, nada más.
            <div className="space-y-6">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>La conciliación automática todavía no existe</AlertTitle>
                <AlertDescription>{AVISO_SIN_CONCILIAR}</AlertDescription>
              </Alert>

              {/* Subir archivo */}
              <Card>
                <CardContent className="p-4">
                  <div className="space-y-4">
                    <h3 className="font-medium">Archivo de confirmación del banco</h3>
                    <div className="flex items-center gap-4">
                      <Input
                        type="file"
                        accept=".txt,.csv"
                        onChange={handleSubirArchivo}
                        disabled={procesando}
                      />
                      {archivo && (
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          <span className="text-sm">{archivo.name}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setArchivo(null);
                              setArchivoSubido(false);
                              setRegistrosLeidos([]);
                            }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Lee archivos de texto separados por <code>;</code>, <code>,</code> o tabulador.
                      Los .xlsx no se leen todavía.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Registros leídos: vista previa, sin cruzar contra nada */}
              {archivoSubido && registrosLeidos.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium">
                    Registros del archivo ({registrosLeidos.length}) — vista previa
                  </h4>
                  <div className="border rounded-lg max-h-60 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Estado</TableHead>
                          <TableHead>Referencia</TableHead>
                          <TableHead>Beneficiario</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                          <TableHead>Fecha</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {registrosLeidos.map((registro, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                                <span className="text-sm">Sin cruzar</span>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {registro.reference}
                            </TableCell>
                            <TableCell>{registro.description || 'Sin descripción'}</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(registro.amount)}
                            </TableCell>
                            <TableCell>{formatDate(registro.transaction_date)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Ninguno de estos registros se ha aplicado a una cuenta por pagar.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={procesando}>
            {pestanaActiva === 'exportar' ? 'Cancelar' : 'Cerrar'}
          </Button>

          {/*
            En la pestaña de revisión NO hay botón de acción, y esto es
            deliberado: había uno («Conciliar Pagos») que no escribía nada y
            anunciaba éxito. Un botón que no puede cumplir lo que promete es
            peor que no tener botón. Volverá cuando exista la conciliación de
            verdad (docs/hallazgos/F-69.md).
          */}
          {pestanaActiva === 'exportar' && (
            <Button
              onClick={handleExportar}
              disabled={procesando || !formatoBanco}
              className="min-w-[140px]"
            >
              {procesando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Exportando...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Exportar Archivo
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
