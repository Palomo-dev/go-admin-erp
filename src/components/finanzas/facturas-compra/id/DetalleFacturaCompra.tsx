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
  Download
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

  const getEstadoBadge = (status: InvoicePurchase['status']) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary" className="dark:bg-gray-700">Borrador</Badge>;
      case 'received':
        return <Badge variant="default" className="bg-blue-500">Recibida</Badge>;
      case 'partial':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Parcial</Badge>;
      case 'paid':
        return <Badge variant="default" className="bg-green-500">Pagada</Badge>;
      case 'void':
        return <Badge variant="destructive">Anulada</Badge>;
      default:
        return <Badge variant="secondary">Desconocido</Badge>;
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
      <div className="container mx-auto p-4">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (!factura) {
    return (
      <div className="container mx-auto p-4">
        <Card className="dark:bg-gray-800/50 dark:border-gray-700">
          <CardContent className="p-8 text-center">
            <FileText className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h2 className="text-xl font-semibold mb-2 dark:text-white">
              Factura no encontrada
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              La factura solicitada no existe o ha sido eliminada.
            </p>
            <Button onClick={handleVolver} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver a Facturas
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const diasVencimiento = calcularDiasVencimiento();

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Button
            variant="ghost"
            onClick={handleVolver}
            className="dark:hover:bg-gray-700"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Factura {factura.number_ext}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Detalles de la factura de compra
            </p>
          </div>
        </div>
        
        <div className="flex space-x-2">
          {/* Botones de documentos */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleImprimir}
            className="dark:border-gray-600 dark:text-gray-300"
            title="Imprimir factura"
          >
            <Printer className="w-4 h-4 mr-1" />
            Imprimir
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleDescargarPDF}
            className="dark:border-gray-600 dark:text-gray-300"
            title="Descargar PDF"
          >
            <Download className="w-4 h-4 mr-1" />
            PDF
          </Button>
          
          {factura.status === 'received' && (
            <Button
              variant="outline"
              onClick={handleRecepcionar}
              className="dark:border-gray-600 dark:text-gray-300"
            >
              <Package className="w-4 h-4 mr-2" />
              Recepcionar
            </Button>
          )}
          
          {factura.balance > 0 && ['confirmed', 'received', 'partial'].includes(factura.status) && (
            <Button
              variant="outline"
              onClick={handleRegistrarPago}
              className="dark:border-gray-600 dark:text-gray-300"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Registrar Pago
            </Button>
          )}
          
          {/* Botón temporal para facturas en draft con balance (para testing) */}
          {factura.balance > 0 && factura.status === 'draft' && (
            <Button
              variant="outline"
              onClick={handleRegistrarPago}
              className="dark:border-gray-600 dark:text-gray-300 border-dashed"
              title="Registrar Pago (Factura en Borrador)"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Registrar Pago
            </Button>
          )}
          
          {factura.status === 'draft' && (
            <Button
              onClick={handleEditar}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Edit className="w-4 h-4 mr-2" />
              Editar
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Información principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Información básica */}
          <Card className="dark:bg-gray-800/50 dark:border-gray-700">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="dark:text-white">Información de la Factura</CardTitle>
                {getEstadoBadge(factura.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-3">
                  <FileText className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Número</p>
                    <p className="font-medium dark:text-white">{factura.number_ext}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Fecha Emisión</p>
                    <p className="font-medium dark:text-white">
                      {factura.issue_date ? formatDate(new Date(factura.issue_date)) : '-'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Clock className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Vencimiento</p>
                    <div className="flex items-center space-x-2">
                      <p className="font-medium dark:text-white">
                        {factura.due_date ? formatDate(new Date(factura.due_date)) : '-'}
                      </p>
                      {diasVencimiento !== null && factura.balance > 0 && (
                        <Badge 
                          variant={diasVencimiento < 0 ? "destructive" : diasVencimiento <= 7 ? "outline" : "secondary"}
                          className={cn(
                            diasVencimiento < 0 ? "border-red-500 text-red-600" :
                            diasVencimiento <= 7 ? "border-yellow-500 text-yellow-600" : ""
                          )}
                        >
                          {diasVencimiento < 0 ? 
                            `${Math.abs(diasVencimiento)} días vencida` : 
                            `${diasVencimiento} días`
                          }
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <DollarSign className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Moneda</p>
                    <p className="font-medium dark:text-white">{factura.currency}</p>
                  </div>
                </div>
              </div>

              {factura.notes && (
                <>
                  <Separator className="dark:border-gray-600" />
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Notas</p>
                    <p className="text-sm dark:text-gray-300">{factura.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Items de la factura */}
          <Card className="dark:bg-gray-800/50 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white">Items de la Factura</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-700">
                    <TableHead className="dark:text-gray-300">Descripción</TableHead>
                    <TableHead className="dark:text-gray-300 text-right">Cant.</TableHead>
                    <TableHead className="dark:text-gray-300 text-right">P. Unit.</TableHead>
                    <TableHead className="dark:text-gray-300 text-right">Desc.</TableHead>
                    <TableHead className="dark:text-gray-300 text-right">Imp.</TableHead>
                    <TableHead className="dark:text-gray-300 text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {factura.items?.map((item, index) => (
                    <TableRow key={item.id || index} className="dark:border-gray-700">
                      <TableCell className="dark:text-gray-300">
                        {item.description}
                      </TableCell>
                      <TableCell className="text-right dark:text-gray-300">
                        {item.qty}
                      </TableCell>
                      <TableCell className="text-right dark:text-gray-300">
                        {formatCurrency(item.unit_price, factura.currency)}
                      </TableCell>
                      <TableCell className="text-right dark:text-gray-300">
                        {item.discount_amount ? formatCurrency(item.discount_amount, factura.currency) : '-'}
                      </TableCell>
                      <TableCell className="text-right dark:text-gray-300">
                        {item.tax_amount ? formatCurrency(item.tax_amount, factura.currency) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium dark:text-white">
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
        <div className="space-y-6">
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
