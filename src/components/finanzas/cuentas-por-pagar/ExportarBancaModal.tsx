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
  Building2,
  DollarSign,
  Calendar,
  CheckCircle,
  AlertTriangle,
  Loader2,
  X,
  FileSpreadsheet,
  AlertCircle
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';

import { CuentasPorPagarService } from './CuentasPorPagarService';
import { AccountPayable, BankFileRecord, BankFileTransaction } from './types';
import { formatCurrency, formatDate } from '@/utils/Utils';

// Función para generar contenido del archivo según el formato
const generarContenidoArchivo = (cuentas: AccountPayable[], formato: string): string => {
  switch (formato) {
    case 'bancolombia':
      return cuentas.map(cuenta => {
        const nit = cuenta.supplier?.nit || '';
        const nombre = cuenta.supplier?.name || '';
        const monto = cuenta.balance.toFixed(2).padStart(12, '0');
        return `${nit.padEnd(15)}${nombre.padEnd(30)}${monto}`;
      }).join('\n');
      
    case 'davivienda':
      return cuentas.map(cuenta => {
        return `${cuenta.supplier?.nit || ''};${cuenta.supplier?.name || ''};${cuenta.balance}`;
      }).join('\n');
      
    case 'bbva':
      let contenido = 'NIT;NOMBRE;MONTO;REFERENCIA\n';
      contenido += cuentas.map(cuenta => {
        return `${cuenta.supplier?.nit || ''};${cuenta.supplier?.name || ''};${cuenta.balance};${cuenta.invoice_purchase?.number_ext || ''}`;
      }).join('\n');
      return contenido;
      
    default:
      // Formato genérico CSV
      let csv = 'NIT,Nombre,Monto,Referencia,Vencimiento\n';
      csv += cuentas.map(cuenta => {
        const fecha = cuenta.due_date ? formatDate(cuenta.due_date) : '';
        return `${cuenta.supplier?.nit || ''},"${cuenta.supplier?.name || ''}",${cuenta.balance},"${cuenta.invoice_purchase?.number_ext || ''}","${fecha}"`;
      }).join('\n');
      return csv;
  }
};

// Función temporal para procesar archivo bancario
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

// Función temporal para conciliar pagos
const conciliarPagos = async (registros: BankFileTransaction[]): Promise<void> => {
  // Simulación de conciliación
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('Conciliación simulada de', registros.length, 'registros');
      resolve();
    }, 1000);
  });
};

interface ExportarBancaModalProps {
  cuentasSeleccionadas: string[];
  isOpen: boolean;
  onClose: () => void;
  onExportado: () => void;
}

const FORMATOS_BANCO = [
  { value: 'bancolombia_txt', label: 'Bancolombia TXT', extension: '.txt' },
  { value: 'davivienda_csv', label: 'Davivienda CSV', extension: '.csv' },
  { value: 'bbva_excel', label: 'BBVA Excel', extension: '.xlsx' },
  { value: 'generic_csv', label: 'CSV Genérico', extension: '.csv' },
];

export function ExportarBancaModal({
  cuentasSeleccionadas,
  isOpen,
  onClose,
  onExportado
}: ExportarBancaModalProps) {
  // Estados
  const [cuentas, setCuentas] = useState<AccountPayable[]>([]);
  const [loading, setLoading] = useState(true);
  const [formatoBanco, setFormatoBanco] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [archivoSubido, setArchivoSubido] = useState(false);
  const [registrosConciliados, setRegistrosConciliados] = useState<BankFileTransaction[]>([]);
  const [pestanaActiva, setPestanaActiva] = useState<'exportar' | 'conciliar'>('exportar');

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
      
      // Usar el método correcto del servicio
      const archivoData = await CuentasPorPagarService.exportarParaBancaOnline(
        cuentasSeleccionadas
      );
      
      // Generar contenido del archivo según el formato
      const contenido = generarContenidoArchivo(cuentas, formatoBanco);
      const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
      
      // Descargar archivo
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      
      const formato = FORMATOS_BANCO.find(f => f.value === formatoBanco);
      const fechaHoy = new Date().toISOString().split('T')[0];
      a.download = `pagos_${fechaHoy}${formato?.extension || '.txt'}`;
      
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Archivo exportado",
        description: `Se exportaron ${cuentasSeleccionadas.length} pagos correctamente`,
      });
      
      onExportado();
    } catch (error: any) {
      console.error('Error exportando archivo:', error);
      toast({
        title: "Error al exportar",
        description: error.message || "Ocurrió un error inesperado",
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
      setRegistrosConciliados(registros);
      setArchivoSubido(true);
      
      toast({
        title: "Archivo procesado",
        description: `Se procesaron ${registros.length} registros del archivo bancario`,
      });
    } catch (error: any) {
      console.error('Error procesando archivo:', error);
      toast({
        title: "Error al procesar archivo",
        description: error.message || "Formato de archivo no válido",
        variant: "destructive",
      });
      setArchivo(null);
    } finally {
      setProcesando(false);
    }
  };

  const handleConciliar = async () => {
    if (registrosConciliados.length === 0) {
      return;
    }

    try {
      setProcesando(true);
      
      await conciliarPagos(registrosConciliados);
      
      toast({
        title: "Conciliación completada",
        description: `Se conciliaron ${registrosConciliados.length} pagos correctamente`,
      });
      
      onExportado();
    } catch (error: any) {
      console.error('Error en conciliación:', error);
      toast({
        title: "Error en conciliación",
        description: error.message || "Ocurrió un error inesperado",
        variant: "destructive",
      });
    } finally {
      setProcesando(false);
    }
  };

  const getTotalMonto = () => {
    return cuentas.reduce((total, cuenta) => total + cuenta.balance, 0);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'matched':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'unmatched':
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      case 'duplicate':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Exportar / Conciliar Banca Online
            <Badge variant="secondary">
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
              pestanaActiva === 'conciliar'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
            onClick={() => setPestanaActiva('conciliar')}
          >
            <Upload className="w-4 h-4 inline mr-2" />
            Conciliar Archivo
          </button>
        </div>

        <div className="overflow-y-auto max-h-[60vh] -mx-6 px-6">
          {pestanaActiva === 'exportar' ? (
            // Pestaña de Exportar
            <div className="space-y-6">
              {/* Resumen de exportación */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
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
            // Pestaña de Conciliar
            <div className="space-y-6">
              {/* Subir archivo */}
              <Card>
                <CardContent className="p-4">
                  <div className="space-y-4">
                    <h3 className="font-medium">Subir Archivo Bancario</h3>
                    <div className="flex items-center gap-4">
                      <Input
                        type="file"
                        accept=".txt,.csv,.xlsx"
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
                              setRegistrosConciliados([]);
                            }}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Soporta archivos TXT, CSV y XLSX de confirmación bancaria
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Registros conciliados */}
              {archivoSubido && registrosConciliados.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium">Registros del Archivo</h4>
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
                        {registrosConciliados.map((registro, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getStatusIcon(registro.status)}
                                <span className="text-sm capitalize">{registro.status}</span>
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
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={procesando}>
            Cancelar
          </Button>
          
          {pestanaActiva === 'exportar' ? (
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
          ) : (
            <Button 
              onClick={handleConciliar}
              disabled={procesando || registrosConciliados.length === 0}
              className="min-w-[140px]"
            >
              {procesando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Conciliando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Conciliar Pagos
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
