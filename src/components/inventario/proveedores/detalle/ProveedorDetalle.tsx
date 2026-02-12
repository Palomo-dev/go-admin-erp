'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { supplierService, type Supplier, type PurchaseOrderSummary, type PurchaseInvoiceSummary } from '@/lib/services/supplierService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { 
  ArrowLeft, Loader2, Edit, Building2, User, Phone, Mail, FileText,
  ShoppingCart, Receipt, Calendar, Plus, MapPin, Globe, CreditCard,
  Landmark, Package, Star
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/Utils';
import Link from 'next/link';
import Image from 'next/image';

interface ProductSupplierRelation {
  id: number;
  product_id: number;
  cost: number;
  is_preferred: boolean;
  supplier_sku?: string;
  lead_time_days?: number;
  min_order_qty?: number;
  product?: {
    id: number;
    uuid: string;
    name: string;
    sku: string;
    is_active: boolean;
  };
}

interface ProveedorDetalleProps {
  supplierUuid: string;
}

export function ProveedorDetalle({ supplierUuid }: ProveedorDetalleProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderSummary[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoiceSummary[]>([]);
  const [products, setProducts] = useState<ProductSupplierRelation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const organizationId = getOrganizationId();

      const { data, error } = await supplierService.getSupplierByUuid(supplierUuid, organizationId);
      if (error) throw error;
      if (!data) {
        toast({ variant: 'destructive', title: 'Error', description: 'Proveedor no encontrado' });
        router.push('/app/inventario/proveedores');
        return;
      }
      setSupplier(data);

      const [orders, invs] = await Promise.all([
        supplierService.getSupplierPurchaseOrders(data.id, organizationId),
        supplierService.getSupplierInvoices(data.id, organizationId)
      ]);
      setPurchaseOrders(orders);
      setInvoices(invs);

      // Cargar productos relacionados via product_suppliers
      const { data: prodData } = await supabase
        .from('product_suppliers')
        .select('id, product_id, cost, is_preferred, supplier_sku, lead_time_days, min_order_qty, product:products(id, uuid, name, sku, is_active)')
        .eq('supplier_id', data.id);
      if (prodData) setProducts(prodData as any);
    } catch (error: any) {
      console.error('Error cargando proveedor:', error);
      toast({ variant: 'destructive', title: 'Error', description: error?.message || 'No se pudo cargar el proveedor' });
      router.push('/app/inventario/proveedores');
    } finally { setIsLoading(false); }
  }, [supplierUuid, router, toast]);

  useEffect(() => { loadData(); }, [loadData]);

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

  const paymentTermsLabel = (val?: string) => {
    const map: Record<string, string> = { contado: 'Contado', credito_15: 'Crédito 15 días', credito_30: 'Crédito 30 días', credito_60: 'Crédito 60 días', credito_90: 'Crédito 90 días' };
    return val ? map[val] || val : 'No definido';
  };

  const taxRegimeLabel = (val?: string) => {
    const map: Record<string, string> = { simple: 'Régimen Simple', comun: 'Régimen Común', gran_contribuyente: 'Gran Contribuyente', no_responsable: 'No Responsable de IVA' };
    return val ? map[val] || val : 'No definido';
  };

  const accountTypeLabel = (val?: string) => {
    const map: Record<string, string> = { ahorros: 'Ahorros', corriente: 'Corriente' };
    return val ? map[val] || val : 'No definido';
  };

  const InfoItem = ({ icon, iconBg, label, value }: { icon: React.ReactNode; iconBg: string; label: string; value: string }) => (
    <div className="flex items-start gap-3">
      <div className={`p-2 ${iconBg} rounded-lg`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="font-medium dark:text-white">{value}</p>
      </div>
    </div>
  );

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
        <Link href="/app/inventario/proveedores"><Button className="mt-4">Volver a la lista</Button></Link>
      </div>
    );
  }

  const fullAddress = [supplier.address, supplier.city, supplier.state, supplier.country, supplier.postal_code].filter(Boolean).join(', ');

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/inventario/proveedores">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Volver</Button>
          </Link>
          <div className="flex items-center gap-3">
            {supplier.logo_url && (
              <Image src={supplier.logo_url} alt={supplier.name} width={48} height={48} className="rounded-lg object-cover border dark:border-gray-700" />
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{supplier.name}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {supplier.nit ? `NIT: ${supplier.nit}` : `Proveedor #${supplier.id}`}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/app/inventario/proveedores/${supplier.uuid}/editar`}>
            <Button variant="outline" size="sm" className="dark:border-gray-700"><Edit className="h-4 w-4 mr-2" />Editar</Button>
          </Link>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => router.push(`/app/inventario/ordenes-compra/nuevo?supplier=${supplier.id}`)}>
            <Plus className="h-4 w-4 mr-2" />Nueva Orden de Compra
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Información básica + contacto */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-600" />Información del Proveedor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoItem icon={<Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />} iconBg="bg-blue-100 dark:bg-blue-900/30" label="NIT / Identificación" value={supplier.nit || 'No registrado'} />
                <InfoItem icon={<User className="h-4 w-4 text-purple-600 dark:text-purple-400" />} iconBg="bg-purple-100 dark:bg-purple-900/30" label="Persona de Contacto" value={supplier.contact || 'No registrado'} />
                <InfoItem icon={<Phone className="h-4 w-4 text-green-600 dark:text-green-400" />} iconBg="bg-green-100 dark:bg-green-900/30" label="Teléfono" value={supplier.phone || 'No registrado'} />
                <InfoItem icon={<Mail className="h-4 w-4 text-orange-600 dark:text-orange-400" />} iconBg="bg-orange-100 dark:bg-orange-900/30" label="Correo Electrónico" value={supplier.email || 'No registrado'} />
                {supplier.website && <InfoItem icon={<Globe className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />} iconBg="bg-cyan-100 dark:bg-cyan-900/30" label="Sitio Web" value={supplier.website} />}
                <InfoItem icon={<Calendar className="h-4 w-4 text-gray-600 dark:text-gray-400" />} iconBg="bg-gray-100 dark:bg-gray-700" label="Fecha de Registro" value={formatDate(supplier.created_at)} />
              </div>

              {supplier.description && (
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{supplier.description}</p>
                </div>
              )}

              {supplier.notes && (
                <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Notas</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{supplier.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dirección */}
          {fullAddress && (
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-blue-600" />Dirección
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {supplier.address && <InfoItem icon={<MapPin className="h-4 w-4 text-red-600 dark:text-red-400" />} iconBg="bg-red-100 dark:bg-red-900/30" label="Dirección" value={supplier.address} />}
                  {supplier.city && <InfoItem icon={<Building2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />} iconBg="bg-indigo-100 dark:bg-indigo-900/30" label="Ciudad" value={supplier.city} />}
                  {supplier.state && <InfoItem icon={<MapPin className="h-4 w-4 text-teal-600 dark:text-teal-400" />} iconBg="bg-teal-100 dark:bg-teal-900/30" label="Departamento" value={supplier.state} />}
                  {supplier.country && <InfoItem icon={<Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />} iconBg="bg-blue-100 dark:bg-blue-900/30" label="País" value={supplier.country} />}
                  {supplier.postal_code && <InfoItem icon={<Mail className="h-4 w-4 text-gray-600 dark:text-gray-400" />} iconBg="bg-gray-100 dark:bg-gray-700" label="Código Postal" value={supplier.postal_code} />}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Información fiscal y comercial */}
          {(supplier.tax_regime || supplier.payment_terms || supplier.credit_days) && (
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-blue-600" />Información Fiscal y Comercial
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {supplier.tax_regime && <InfoItem icon={<FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />} iconBg="bg-amber-100 dark:bg-amber-900/30" label="Régimen Tributario" value={taxRegimeLabel(supplier.tax_regime)} />}
                  {supplier.payment_terms && <InfoItem icon={<CreditCard className="h-4 w-4 text-violet-600 dark:text-violet-400" />} iconBg="bg-violet-100 dark:bg-violet-900/30" label="Condiciones de Pago" value={paymentTermsLabel(supplier.payment_terms)} />}
                  {supplier.credit_days !== undefined && supplier.credit_days !== null && <InfoItem icon={<Calendar className="h-4 w-4 text-rose-600 dark:text-rose-400" />} iconBg="bg-rose-100 dark:bg-rose-900/30" label="Días de Crédito" value={`${supplier.credit_days} días`} />}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Información bancaria */}
          {(supplier.bank_name || supplier.bank_account) && (
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-blue-600" />Información Bancaria
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {supplier.bank_name && <InfoItem icon={<Landmark className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />} iconBg="bg-emerald-100 dark:bg-emerald-900/30" label="Banco" value={supplier.bank_name} />}
                  {supplier.bank_account && <InfoItem icon={<CreditCard className="h-4 w-4 text-sky-600 dark:text-sky-400" />} iconBg="bg-sky-100 dark:bg-sky-900/30" label="Número de Cuenta" value={supplier.bank_account} />}
                  {supplier.account_type && <InfoItem icon={<FileText className="h-4 w-4 text-pink-600 dark:text-pink-400" />} iconBg="bg-pink-100 dark:bg-pink-900/30" label="Tipo de Cuenta" value={accountTypeLabel(supplier.account_type)} />}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Productos relacionados */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                <Package className="h-5 w-5 text-blue-600" />
                Productos Vinculados
                {products.length > 0 && <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">{products.length}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {products.length === 0 ? (
                <p className="text-center py-4 text-gray-500 dark:text-gray-400">No hay productos vinculados a este proveedor</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="dark:border-gray-700">
                        <TableHead className="dark:text-gray-300">Producto</TableHead>
                        <TableHead className="dark:text-gray-300">SKU</TableHead>
                        <TableHead className="text-right dark:text-gray-300">Costo</TableHead>
                        <TableHead className="dark:text-gray-300">Preferido</TableHead>
                        <TableHead className="dark:text-gray-300">SKU Proveedor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((ps) => (
                        <TableRow key={ps.id} className="dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50" onClick={() => ps.product?.uuid && router.push(`/app/inventario/productos/${ps.product.uuid}`)}>
                          <TableCell className="font-medium dark:text-white">{ps.product?.name || `Producto #${ps.product_id}`}</TableCell>
                          <TableCell className="text-gray-600 dark:text-gray-400">{ps.product?.sku || '-'}</TableCell>
                          <TableCell className="text-right font-medium dark:text-white">{formatCurrency(ps.cost)}</TableCell>
                          <TableCell>{ps.is_preferred ? <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" /> : <span className="text-gray-400">-</span>}</TableCell>
                          <TableCell className="text-gray-600 dark:text-gray-400">{ps.supplier_sku || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Órdenes de compra */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-blue-600" />Órdenes de Compra Recientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {purchaseOrders.length === 0 ? (
                <p className="text-center py-4 text-gray-500 dark:text-gray-400">No hay órdenes de compra registradas</p>
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
                          <TableCell className="text-gray-600 dark:text-gray-400">{formatDate(order.created_at)}</TableCell>
                          <TableCell className="font-medium dark:text-white">{`OC-${order.id}`}</TableCell>
                          <TableCell>{getStatusBadge(order.status)}</TableCell>
                          <TableCell className="text-right font-medium dark:text-white">{formatCurrency(order.total)}</TableCell>
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
                <Receipt className="h-5 w-5 text-blue-600" />Facturas de Compra Recientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <p className="text-center py-4 text-gray-500 dark:text-gray-400">No hay facturas de compra registradas</p>
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
                          <TableCell className="text-gray-600 dark:text-gray-400">{formatDate(invoice.created_at)}</TableCell>
                          <TableCell className="font-medium dark:text-white">{invoice.number_ext || `FC-${invoice.id.slice(0, 8)}`}</TableCell>
                          <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                          <TableCell className="text-right font-medium dark:text-white">{formatCurrency(invoice.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Panel lateral */}
        <div className="space-y-6">
          <Card className="dark:bg-gray-800 dark:border-gray-700 sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Productos</span>
                <span className="font-medium dark:text-white">{products.length}</span>
              </div>
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
                    <Edit className="h-4 w-4 mr-2" />Editar Proveedor
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
