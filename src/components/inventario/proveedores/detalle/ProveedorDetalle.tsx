'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supplierService, type Supplier, type PurchaseOrderSummary, type PurchaseInvoiceSummary } from '@/lib/services/supplierService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  Loader2, 
  Edit, 
  Building2, 
  User, 
  Phone, 
  Mail, 
  FileText,
  ShoppingCart,
  Receipt,
  Calendar,
  Plus
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/Utils';
import Link from 'next/link';

interface ProveedorDetalleProps {
  supplierUuid: string;
}

export function ProveedorDetalle({ supplierUuid }: ProveedorDetalleProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const { toast } = useToast();

  // Estados
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderSummary[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoiceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Cargar datos
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const organizationId = getOrganizationId();

      // Cargar proveedor
      const { data, error } = await supplierService.getSupplierByUuid(supplierUuid, organizationId);

      if (error) throw error;
      if (!data) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Proveedor no encontrado'
        });
        router.push('/app/inventario/proveedores');
        return;
      }

      setSupplier(data);

      // Cargar órdenes de compra e invoices en paralelo (usando el ID numérico interno)
      const [orders, invs] = await Promise.all([
        supplierService.getSupplierPurchaseOrders(data.id, organizationId),
        supplierService.getSupplierInvoices(data.id, organizationId)
      ]);

      setPurchaseOrders(orders);
      setInvoices(invs);
    } catch (error: any) {
      console.error('Error cargando proveedor:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error?.message || 'No se pudo cargar el proveedor'
      });
      router.push('/app/inventario/proveedores');
    } finally {
      setIsLoading(false);
    }
  }, [supplierUuid, router, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Función para obtener badge de estado
  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      draft: { label: 'Borrador', className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
      pending: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
      approved: { label: 'Aprobada', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
      completed: { label: 'Completada', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
      cancelled: { label: 'Cancelada', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
      paid: { label: 'Pagada', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' }
    };
    const config = statusMap[status] || statusMap.draft;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Cargando proveedor...</span>
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Proveedor no encontrado</p>
        <Link href="/app/inventario/proveedores">
          <Button className="mt-4">Volver a la lista</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/inventario/proveedores">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {supplier.name}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Proveedor #{supplier.id}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/app/inventario/proveedores/${supplier.id}/editar`}>
            <Button variant="outline" size="sm" className="dark:border-gray-700">
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </Button>
          </Link>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => router.push(`/app/inventario/ordenes-compra/nuevo?supplier=${supplier.id}`)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nueva Orden de Compra
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Información del proveedor */}
        <div className="lg:col-span-2 space-y-6">
          {/* Datos básicos */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-600" />
                Información del Proveedor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">NIT / Identificación</p>
                    <p className="font-medium dark:text-white">{supplier.nit || 'No registrado'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <User className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Persona de Contacto</p>
                    <p className="font-medium dark:text-white">{supplier.contact || 'No registrado'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <Phone className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Teléfono</p>
                    <p className="font-medium dark:text-white">{supplier.phone || 'No registrado'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                    <Mail className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Correo Electrónico</p>
                    <p className="font-medium dark:text-white">{supplier.email || 'No registrado'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <Calendar className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Fecha de Registro</p>
                    <p className="font-medium dark:text-white">{formatDate(supplier.created_at)}</p>
                  </div>
                </div>
              </div>

              {supplier.notes && (
                <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Notas</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{supplier.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Órdenes de compra */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-blue-600" />
                Órdenes de Compra Recientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {purchaseOrders.length === 0 ? (
                <p className="text-center py-4 text-gray-500 dark:text-gray-400">
                  No hay órdenes de compra registradas
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="dark:border-gray-700">
                        <TableHead className="dark:text-gray-300">Fecha</TableHead>
                        <TableHead className="dark:text-gray-300">Número</TableHead>
                        <TableHead className="dark:text-gray-300">Estado</TableHead>
                        <TableHead className="text-right dark:text-gray-300">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseOrders.map((order) => (
                        <TableRow key={order.id} className="dark:border-gray-700">
                          <TableCell className="text-gray-600 dark:text-gray-400">
                            {formatDate(order.created_at)}
                          </TableCell>
                          <TableCell className="font-medium dark:text-white">
                            {`OC-${order.id}`}
                          </TableCell>
                          <TableCell>{getStatusBadge(order.status)}</TableCell>
                          <TableCell className="text-right font-medium dark:text-white">
                            {formatCurrency(order.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Facturas de compra */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                <Receipt className="h-5 w-5 text-blue-600" />
                Facturas de Compra Recientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <p className="text-center py-4 text-gray-500 dark:text-gray-400">
                  No hay facturas de compra registradas
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="dark:border-gray-700">
                        <TableHead className="dark:text-gray-300">Fecha</TableHead>
                        <TableHead className="dark:text-gray-300">Número</TableHead>
                        <TableHead className="dark:text-gray-300">Estado</TableHead>
                        <TableHead className="text-right dark:text-gray-300">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((invoice) => (
                        <TableRow key={invoice.id} className="dark:border-gray-700">
                          <TableCell className="text-gray-600 dark:text-gray-400">
                            {formatDate(invoice.created_at)}
                          </TableCell>
                          <TableCell className="font-medium dark:text-white">
                            {invoice.number_ext || `FC-${invoice.id.slice(0, 8)}`}
                          </TableCell>
                          <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                          <TableCell className="text-right font-medium dark:text-white">
                            {formatCurrency(invoice.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Panel lateral - Resumen */}
        <div className="space-y-6">
          <Card className="dark:bg-gray-800 dark:border-gray-700 sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Órdenes de Compra</span>
                <span className="font-medium dark:text-white">{purchaseOrders.length}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Facturas</span>
                <span className="font-medium dark:text-white">{invoices.length}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Total Compras</span>
                <span className="font-medium text-green-600 dark:text-green-400">
                  {formatCurrency(purchaseOrders.reduce((sum, o) => sum + (o.total || 0), 0))}
                </span>
              </div>

              <div className="space-y-2 pt-4">
                <Link href={`/app/inventario/proveedores/${supplier.uuid}/editar`}>
                  <Button variant="outline" className="w-full dark:border-gray-700">
                    <Edit className="h-4 w-4 mr-2" />
                    Editar Proveedor
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default ProveedorDetalle;
