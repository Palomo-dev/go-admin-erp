'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  ArrowLeft, 
  Edit, 
  CreditCard, 
  Package, 
  FileText,
  Calendar,
  DollarSign,
  Clock,
  Printer,
  Download,
  Send
} from 'lucide-react';
import { FacturasCompraService } from '../FacturasCompraService';
import { InvoicePurchase } from '../types';
import { RegistrarPagoModal } from '../RegistrarPagoModal';
import { ResumenTotalesFactura } from './ResumenTotalesFactura';
import { InfoProveedorFactura } from './InfoProveedorFactura';
import { CuentaPorPagarInfo } from './CuentaPorPagarInfo';
import { HistorialPagos } from './HistorialPagos';
import { formatCurrency, formatDate, cn } from '@/utils/Utils';

interface DetalleFacturaCompraProps {
  facturaId: string;
}

export function DetalleFacturaCompra({ facturaId }: DetalleFacturaCompraProps) {
  const router = useRouter();
  const [factura, setFactura] = useState<InvoicePurchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPagoModal, setShowPagoModal] = useState(false);
  
  // Estados para cuentas por pagar y pagos
  const [cuentaPorPagar, setCuentaPorPagar] = useState<any | null>(null);
  const [pagos, setPagos] = useState<any[]>([]);
  const [loadingCuentaPorPagar, setLoadingCuentaPorPagar] = useState(false);
  const [loadingPagos, setLoadingPagos] = useState(false);

  useEffect(() => {
    cargarFactura();
  }, [facturaId]);

  const cargarFactura = async () => {
    try {
      setLoading(true);
      const data = await FacturasCompraService.obtenerFacturaPorId(facturaId);
      setFactura(data);
      
      // Cargar datos adicionales en paralelo
      await Promise.all([
        cargarCuentaPorPagar(),
        cargarPagos()
      ]);
    } catch (error) {
      console.error('Error cargando factura:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const cargarCuentaPorPagar = async () => {
    try {
      setLoadingCuentaPorPagar(true);
      const cuenta = await FacturasCompraService.obtenerCuentaPorPagar(facturaId);
      setCuentaPorPagar(cuenta);
    } catch (error) {
      console.error('Error cargando cuenta por pagar:', error);
      setCuentaPorPagar(null);
    } finally {
      setLoadingCuentaPorPagar(false);
    }
  };
  
  const cargarPagos = async () => {
    try {
      setLoadingPagos(true);
      const pagosList = await FacturasCompraService.obtenerPagosFactura(facturaId);
      setPagos(pagosList);
    } catch (error) {
      console.error('Error cargando pagos:', error);
      setPagos([]);
    } finally {
      setLoadingPagos(false);
    }
  };

  const handleVolver = () => {
    router.push('/app/finanzas/facturas-compra');
  };

  const handleEditar = () => {
    router.push(`/app/finanzas/facturas-compra/${facturaId}/editar`);
  };

  const handleRegistrarPago = () => {
    setShowPagoModal(true);
  };

  const handleRecepcionar = () => {
    router.push(`/app/inventario/entradas/nueva?factura_id=${facturaId}`);
  };
  
  const handleImprimir = () => {
    window.print();
  };
  
  const handleDescargarPDF = () => {
    // TODO: Implementar generación de PDF
    console.log('Descargando PDF de factura:', facturaId);
    // Por ahora, usar la función de imprimir como alternativa
    window.print();
  };

  const handleConfirmarFactura = async () => {
    try {
      if (!factura) return;
      
      await FacturasCompraService.confirmarFactura(factura.id);
      
      // Recargar datos para mostrar el estado actualizado
      await cargarFactura();
      
      // Mostrar notificación de éxito
      console.log('Factura confirmada exitosamente');
      
    } catch (error: any) {
      console.error('Error al confirmar factura:', error);
      alert('Error al confirmar la factura: ' + (error.message || 'Error desconocido'));
    }
  };

  const getEstadoBadge = (status: InvoicePurchase['status']) => {
    const baseClasses = "text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5";
    switch (status) {
      case 'draft':
        return <Badge variant="secondary" className={`${baseClasses} dark:bg-gray-700 dark:text-gray-300`}>Borrador</Badge>;
      case 'received':
        return <Badge variant="default" className={`${baseClasses} bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700`}>Recibida</Badge>;
      case 'partial':
        return <Badge variant="outline" className={`${baseClasses} border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-400`}>Parcial</Badge>;
      case 'paid':
        return <Badge variant="default" className={`${baseClasses} bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700`}>Pagada</Badge>;
      case 'void':
        return <Badge variant="destructive" className={`${baseClasses} dark:bg-red-900/30 dark:text-red-400`}>Anulada</Badge>;
      default:
        return <Badge variant="secondary" className={`${baseClasses} dark:bg-gray-700 dark:text-gray-300`}>Desconocido</Badge>;
    }
  };

  const calcularDiasVencimiento = () => {
    if (!factura?.due_date) return null;
    const vencimiento = new Date(factura.due_date);
    const hoy = new Date();
    return Math.ceil((vencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return (
      <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4">
        <div className="flex justify-center items-center h-48 sm:h-64">
          <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600 dark:border-blue-400"></div>
        </div>
      </div>
    );
  }

  if (!factura) {
    return (
      <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4">
        <Card className="dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
          <CardContent className="p-6 sm:p-8 text-center">
            <FileText className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-gray-400 dark:text-gray-600" />
            <h2 className="text-lg sm:text-xl font-semibold mb-2 text-gray-900 dark:text-white">
              Factura no encontrada
            </h2>
            <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mb-3 sm:mb-4">
              La factura solicitada no existe o ha sido eliminada.
            </p>
            <Button onClick={handleVolver} variant="outline" className="h-9 text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
              <span>Volver a Facturas</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const diasVencimiento = calcularDiasVencimiento();

  return (
    <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4 md:py-6 space-y-4 sm:space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <Button
            variant="ghost"
            onClick={handleVolver}
            className="p-2 h-auto dark:hover:bg-gray-700 dark:text-gray-300"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 sm:mr-2" />
            <span className="hidden sm:inline">Volver</span>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 dark:text-white truncate">
              Factura {factura.number_ext}
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              Detalles de la factura de compra
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-1.5 sm:gap-2 w-full sm:w-auto">
          {/* Botones de documentos */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleImprimir}
            className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            title="Imprimir factura"
          >
            <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-1" />
            <span className="hidden sm:inline">Imprimir</span>
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleDescargarPDF}
            className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            title="Descargar PDF"
          >
            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-1" />
            <span className="hidden sm:inline">PDF</span>
          </Button>
          
          {factura.status === 'received' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRecepcionar}
              className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Recepcionar</span>
              <span className="sm:hidden">Recep.</span>
            </Button>
          )}
          
          {factura.balance > 0 && ['confirmed', 'received', 'partial'].includes(factura.status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegistrarPago}
              className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Registrar Pago</span>
              <span className="sm:hidden">Pago</span>
            </Button>
          )}
          
          {/* Botón temporal para facturas en draft con balance (para testing) */}
          {factura.balance > 0 && factura.status === 'draft' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegistrarPago}
              className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 border-dashed"
              title="Registrar Pago (Factura en Borrador)"
            >
              <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Registrar Pago</span>
              <span className="sm:hidden">Pago</span>
            </Button>
          )}
          
          {factura.status === 'draft' && (
            <>
              <Button 
                onClick={handleConfirmarFactura}
                className="h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white whitespace-nowrap"
              >
                <Send className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5" />
                <span className="hidden sm:inline">Confirmar Factura</span>
                <span className="sm:hidden">Confirmar</span>
              </Button>
              <Button
                onClick={handleEditar}
                size="sm"
                className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm bg-gray-600 hover:bg-gray-700 dark:bg-gray-600 dark:hover:bg-gray-700 text-white"
              >
                <Edit className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-2" />
                <span className="hidden sm:inline">Editar</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Información principal */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          {/* Información básica */}
          <Card className="dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
            <CardHeader className="pb-3 sm:pb-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <CardTitle className="text-base sm:text-lg text-gray-900 dark:text-white">Información de la Factura</CardTitle>
                {getEstadoBadge(factura.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Número</p>
                    <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white truncate">{factura.number_ext}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                  <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Fecha Emisión</p>
                    <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
                      {factura.issue_date ? formatDate(new Date(factura.issue_date)) : '-'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Vencimiento</p>
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
                        {factura.due_date ? formatDate(new Date(factura.due_date)) : '-'}
                      </p>
                      {diasVencimiento !== null && factura.balance > 0 && (
                        <Badge 
                          variant={diasVencimiento < 0 ? "destructive" : diasVencimiento <= 7 ? "outline" : "secondary"}
                          className={cn(
                            "text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 whitespace-nowrap",
                            diasVencimiento < 0 ? "border-red-500 text-red-600 dark:border-red-400 dark:text-red-400" :
                            diasVencimiento <= 7 ? "border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-400" : 
                            "dark:bg-gray-700 dark:text-gray-300"
                          )}
                        >
                          {diasVencimiento < 0 ? 
                            `${Math.abs(diasVencimiento)}d vencida` : 
                            `${diasVencimiento}d`
                          }
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                  <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Moneda</p>
                    <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">{factura.currency}</p>
                  </div>
                </div>
              </div>

              {factura.notes && (
                <>
                  <Separator className="dark:bg-gray-600" />
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1.5 sm:mb-2">Notas</p>
                    <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">{factura.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Items de la factura */}
          <Card className="dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
            <CardHeader className="pb-3 sm:pb-4">
              <CardTitle className="text-base sm:text-lg text-gray-900 dark:text-white">Items de la Factura</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto -mx-2 sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-800 border-b border-gray-200">
                    <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">Descripción</TableHead>
                    <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">Cant.</TableHead>
                    <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 text-right whitespace-nowrap hidden sm:table-cell">P. Unit.</TableHead>
                    <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 text-right whitespace-nowrap hidden md:table-cell">Desc.</TableHead>
                    <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 text-right whitespace-nowrap hidden lg:table-cell">Imp.</TableHead>
                    <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 text-right whitespace-nowrap">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {factura.items?.map((item, index) => (
                    <TableRow key={item.id || index} className="dark:border-gray-800 border-b border-gray-100">
                      <TableCell className="text-xs sm:text-sm text-gray-900 dark:text-gray-300 py-2 sm:py-3">
                        <span className="line-clamp-2">{item.description}</span>
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm text-right text-gray-900 dark:text-gray-300 py-2 sm:py-3 whitespace-nowrap">
                        {item.qty}
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm text-right text-gray-900 dark:text-gray-300 py-2 sm:py-3 whitespace-nowrap hidden sm:table-cell">
                        {formatCurrency(item.unit_price, factura.currency)}
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm text-right text-gray-900 dark:text-gray-300 py-2 sm:py-3 whitespace-nowrap hidden md:table-cell">
                        {item.discount_amount ? formatCurrency(item.discount_amount, factura.currency) : '-'}
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm text-right text-gray-900 dark:text-gray-300 py-2 sm:py-3 whitespace-nowrap hidden lg:table-cell">
                        {item.tax_amount ? formatCurrency(item.tax_amount, factura.currency) : '-'}
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm text-right font-medium text-gray-900 dark:text-white py-2 sm:py-3 whitespace-nowrap">
                        {formatCurrency(item.total_line, factura.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          
          {/* Cuenta por Pagar */}
          <CuentaPorPagarInfo 
            cuentaPorPagar={cuentaPorPagar}
            currency={factura.currency}
            loading={loadingCuentaPorPagar}
          />
          
          {/* Historial de Pagos */}
          <HistorialPagos 
            pagos={pagos}
            loading={loadingPagos}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-4 sm:space-y-6">
          {/* Información del proveedor */}
          <InfoProveedorFactura factura={factura} />

          {/* Totales */}
          <ResumenTotalesFactura factura={factura} />
        </div>
      </div>

      {/* Modal de registro de pago */}
      <RegistrarPagoModal
        open={showPagoModal}
        onOpenChange={setShowPagoModal}
        factura={factura}
        onPagoRegistrado={() => {
          cargarFactura(); // Recargar la factura para actualizar el balance
          cargarCuentaPorPagar(); // Recargar cuenta por pagar
          cargarPagos(); // Recargar historial de pagos
        }}
      />
    </div>
  );
}
