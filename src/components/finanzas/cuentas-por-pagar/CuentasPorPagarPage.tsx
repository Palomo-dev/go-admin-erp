'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AlertCircle, 
  Calendar, 
  CreditCard, 
  Download, 
  FileText, 
  Plus,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/utils/Utils';

import { CuentasPorPagarService } from './CuentasPorPagarService';
import { CuentasPorPagarTable } from './CuentasPorPagarTable';
import { CuentasPorPagarFiltros } from './CuentasPorPagarFiltros';
import { ResumenCuentasPorPagar } from './ResumenCuentasPorPagar';
import { RegistrarPagoModal } from './RegistrarPagoModal';
import { ProgramarPagoModal } from './ProgramarPagoModal';
import { AprobacionPagosModal } from './AprobacionPagosModal';
import { ExportarBancaModal } from './ExportarBancaModal';
import { 
  AccountPayable, 
  FiltrosCuentasPorPagar, 
  AccountsPayableSummary,
  PaymentWithRelations
} from './types';

interface CuentasPorPagarPageProps {}

export function CuentasPorPagarPage({}: CuentasPorPagarPageProps) {
  // Estados principales
  const [cuentas, setCuentas] = useState<AccountPayable[]>([]);
  const [pagosProgramados, setPagosProgramados] = useState<PaymentWithRelations[]>([]);
  const [resumen, setResumen] = useState<AccountsPayableSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Estados de paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [pageSize] = useState(10);

  // Estados de filtros
  const [filtros, setFiltros] = useState<FiltrosCuentasPorPagar>({
    busqueda: '',
    estado: 'todos',
    proveedor: 'todos',
    fechaDesde: '',
    fechaHasta: '',
    vencimiento: 'todos',
    montoMinimo: null,
    montoMaximo: null
  });

  // Estados de modales
  const [mostrarModalProgramar, setMostrarModalProgramar] = useState(false);
  const [mostrarModalRegistrar, setMostrarModalRegistrar] = useState(false);
  const [mostrarModalAprobacion, setMostrarModalAprobacion] = useState(false);
  const [mostrarModalExportar, setMostrarModalExportar] = useState(false);
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState<AccountPayable | null>(null);
  const [cuentasSeleccionadas, setCuentasSeleccionadas] = useState<string[]>([]);

  // Estados de tab activo
  const [tabActivo, setTabActivo] = useState('todas');

  const { toast } = useToast();

  // Efectos
  useEffect(() => {
    cargarDatos();
  }, [filtros, currentPage]);

  useEffect(() => {
    cargarResumen();
  }, []);

  // Funciones de carga
  const cargarDatos = async () => {
    try {
      setLoading(true);
      
      const response = await CuentasPorPagarService.obtenerCuentasPorPagar(
        filtros,
        currentPage,
        pageSize
      );
      
      setCuentas(response.cuentas);
      setTotalPages(response.totalPages);
      setTotalRecords(response.total);
    } catch (error) {
      console.error('Error cargando cuentas por pagar:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las cuentas por pagar",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const cargarResumen = async () => {
    try {
      const resumenData = await CuentasPorPagarService.obtenerResumen();
      setResumen(resumenData);
    } catch (error) {
      console.error('Error cargando resumen:', error);
    }
  };

  const cargarPagosProgramados = async () => {
    try {
      const pagos = await CuentasPorPagarService.obtenerPagosProgramados({
        status: 'pending'
      });
      setPagosProgramados(pagos);
    } catch (error) {
      console.error('Error cargando pagos programados:', error);
    }
  };

  const actualizarDatos = async () => {
    setRefreshing(true);
    await Promise.all([
      cargarDatos(),
      cargarResumen(),
      cargarPagosProgramados()
    ]);
    setRefreshing(false);
    
    toast({
      title: "Datos actualizados",
      description: "La información se ha actualizado correctamente",
    });
  };

  // Handlers de filtros
  const handleFiltrosChange = (nuevosFiltros: FiltrosCuentasPorPagar) => {
    setFiltros(nuevosFiltros);
    setCurrentPage(1); // Reset a la primera página
  };

  const limpiarFiltros = () => {
    const filtrosLimpios: FiltrosCuentasPorPagar = {
      busqueda: '',
      estado: 'todos',
      proveedor: 'todos',
      fechaDesde: '',
      fechaHasta: '',
      vencimiento: 'todos',
      montoMinimo: null,
      montoMaximo: null
    };
    setFiltros(filtrosLimpios);
    setCurrentPage(1);
  };

  // Handlers de acciones
  const handlePagoRegistrado = () => {
    actualizarDatos();
    cerrarModales();
    toast({
      title: "Pago registrado",
      description: "El pago se ha registrado correctamente",
    });
  };

  const handlePagoProgramado = () => {
    cargarPagosProgramados();
    cerrarModales();
    toast({
      title: "Pago programado",
      description: "El pago se ha programado para revisión",
    });
  };

  const handleSeleccionarCuentas = (cuentasIds: string[]) => {
    setCuentasSeleccionadas(cuentasIds);
  };

  const abrirModalExportar = () => {
    if (cuentasSeleccionadas.length === 0) {
      toast({
        title: "Seleccionar cuentas",
        description: "Debe seleccionar al menos una cuenta para exportar",
        variant: "destructive",
      });
      return;
    }
    setMostrarModalExportar(true);
  };

  // Filtros por tab
  const getFiltrosPorTab = (tab: string): FiltrosCuentasPorPagar => {
    const baseFilters = { ...filtros };
    
    switch (tab) {
      case 'vencidas':
        return { ...baseFilters, vencimiento: 'vencidas' };
      case 'proximas':
        return { ...baseFilters, vencimiento: 'proximas' };
      case 'pendientes':
        return { ...baseFilters, estado: 'pending' };
      default:
        return baseFilters;
    }
  };

  const cerrarModales = () => {
    setMostrarModalProgramar(false);
    setMostrarModalRegistrar(false);
    setMostrarModalAprobacion(false);
    setMostrarModalExportar(false);
    setCuentaSeleccionada(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Cuentas por Pagar
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Gestiona pagos a proveedores y obligaciones pendientes
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={actualizarDatos}
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMostrarModalAprobacion(true)}
          >
            <Calendar className="w-4 h-4 mr-2" />
            Aprobaciones
            {pagosProgramados.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pagosProgramados.length}
              </Badge>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={abrirModalExportar}
            disabled={cuentasSeleccionadas.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Resumen */}
      {resumen && (
        <ResumenCuentasPorPagar resumen={resumen} />
      )}

      {/* Filtros */}
      <CuentasPorPagarFiltros
        filtros={filtros}
        onFiltrosChange={handleFiltrosChange}
        onLimpiarFiltros={limpiarFiltros}
      />

      {/* Contenido principal con tabs */}
      <Tabs value={tabActivo} onValueChange={setTabActivo} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="todas">
            <FileText className="w-4 h-4 mr-2" />
            Todas
          </TabsTrigger>
          <TabsTrigger value="vencidas">
            <AlertCircle className="w-4 h-4 mr-2" />
            Vencidas
          </TabsTrigger>
          <TabsTrigger value="proximas">
            <Calendar className="w-4 h-4 mr-2" />
            Próximas
          </TabsTrigger>
          <TabsTrigger value="pendientes">
            <Wallet className="w-4 h-4 mr-2" />
            Pendientes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="todas" className="mt-6">
          <CuentasPorPagarTable
            cuentas={cuentas}
            loading={loading}
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={totalRecords}
            onPageChange={setCurrentPage}
            onProgramarPago={(cuenta: AccountPayable) => {
              setCuentaSeleccionada(cuenta);
              setMostrarModalProgramar(true);
            }}
            onRegistrarPago={(cuenta: AccountPayable) => {
              setCuentaSeleccionada(cuenta);
              setMostrarModalRegistrar(true);
            }}
            onSeleccionarCuentas={handleSeleccionarCuentas}
            cuentasSeleccionadas={cuentasSeleccionadas}
          />
        </TabsContent>

        <TabsContent value="vencidas" className="mt-6">
          <CuentasPorPagarTable
            cuentas={cuentas.filter(c => c.days_overdue && c.days_overdue > 0)}
            loading={loading}
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={totalRecords}
            onPageChange={setCurrentPage}
            onProgramarPago={(cuenta: AccountPayable) => {
              setCuentaSeleccionada(cuenta);
              setMostrarModalProgramar(true);
            }}
            onRegistrarPago={(cuenta: AccountPayable) => {
              setCuentaSeleccionada(cuenta);
              setMostrarModalRegistrar(true);
            }}
            onSeleccionarCuentas={handleSeleccionarCuentas}
            cuentasSeleccionadas={cuentasSeleccionadas}
          />
        </TabsContent>

        <TabsContent value="proximas" className="mt-6">
          <CuentasPorPagarTable
            cuentas={cuentas.filter(c => {
              if (!c.due_date) return false;
              const dueDate = new Date(c.due_date);
              const today = new Date();
              const in15Days = new Date();
              in15Days.setDate(today.getDate() + 15);
              return dueDate >= today && dueDate <= in15Days;
            })}
            loading={loading}
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={totalRecords}
            onPageChange={setCurrentPage}
            onProgramarPago={(cuenta: AccountPayable) => {
              setCuentaSeleccionada(cuenta);
              setMostrarModalProgramar(true);
            }}
            onRegistrarPago={(cuenta: AccountPayable) => {
              setCuentaSeleccionada(cuenta);
              setMostrarModalRegistrar(true);
            }}
            onSeleccionarCuentas={handleSeleccionarCuentas}
            cuentasSeleccionadas={cuentasSeleccionadas}
          />
        </TabsContent>

        <TabsContent value="pendientes" className="mt-6">
          <CuentasPorPagarTable
            cuentas={cuentas.filter(c => c.status === 'pending')}
            loading={loading}
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={totalRecords}
            onPageChange={setCurrentPage}
            onProgramarPago={(cuenta: AccountPayable) => {
              setCuentaSeleccionada(cuenta);
              setMostrarModalProgramar(true);
            }}
            onRegistrarPago={(cuenta: AccountPayable) => {
              setCuentaSeleccionada(cuenta);
              setMostrarModalRegistrar(true);
            }}
            onSeleccionarCuentas={handleSeleccionarCuentas}
            cuentasSeleccionadas={cuentasSeleccionadas}
          />
        </TabsContent>
      </Tabs>

      {/* Modales */}
      {cuentaSeleccionada && (
        <>
          <RegistrarPagoModal
            cuenta={cuentaSeleccionada}
            isOpen={mostrarModalRegistrar}
            onClose={() => {
              setMostrarModalRegistrar(false);
              setCuentaSeleccionada(null);
            }}
            onPagoRegistrado={() => {
              cargarDatos();
              setMostrarModalRegistrar(false);
              setCuentaSeleccionada(null);
            }}
          />
          
          <ProgramarPagoModal
            cuenta={cuentaSeleccionada}
            isOpen={mostrarModalProgramar}
            onClose={() => {
              setMostrarModalProgramar(false);
              setCuentaSeleccionada(null);
            }}
            onPagoProgramado={() => {
              cargarDatos();
              setMostrarModalProgramar(false);
              setCuentaSeleccionada(null);
            }}
          />
        </>
      )}
      
      <AprobacionPagosModal
        isOpen={mostrarModalAprobacion}
        onClose={() => setMostrarModalAprobacion(false)}
        onPagoAprobado={() => {
          cargarDatos();
          setMostrarModalAprobacion(false);
        }}
      />
      
      <ExportarBancaModal
        cuentasSeleccionadas={cuentasSeleccionadas}
        isOpen={mostrarModalExportar}
        onClose={() => setMostrarModalExportar(false)}
        onExportado={() => {
          cargarDatos();
          setMostrarModalExportar(false);
          setCuentasSeleccionadas([]);
        }}
      />
    </div>
  );
}
