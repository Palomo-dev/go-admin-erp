'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Edit, 
  Copy, 
  Trash2, 
  Calendar, 
  Ticket,
  RefreshCw,
  Percent,
  DollarSign,
  CheckCircle,
  XCircle,
  Download,
  Users,
  ShoppingCart
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { CouponsService, CouponForm } from '@/components/pos/cupones';
import { Coupon, CouponRedemption, DISCOUNT_TYPE_LABELS } from '@/components/pos/cupones/types';
import { formatCurrency, cn } from '@/utils/Utils';
import { toast } from 'sonner';

export default function CuponDetallePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading: orgLoading } = useOrganization();
  
  const couponId = params.id as string;
  const isEditMode = searchParams.get('edit') === 'true';
  
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [redemptions, setRedemptions] = useState<CouponRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(isEditMode);
  const [toggling, setToggling] = useState(false);

  const loadCoupon = useCallback(async () => {
    if (!couponId) return;
    
    setLoading(true);
    try {
      const [couponData, redemptionsData] = await Promise.all([
        CouponsService.getById(couponId),
        CouponsService.getRedemptions(couponId)
      ]);
      setCoupon(couponData);
      setRedemptions(redemptionsData);
    } catch (error: any) {
      console.error('Error loading coupon:', error);
      toast.error('Error al cargar el cupón');
    } finally {
      setLoading(false);
    }
  }, [couponId]);

  useEffect(() => {
    loadCoupon();
  }, [loadCoupon]);

  const handleDelete = async () => {
    try {
      await CouponsService.delete(couponId);
      toast.success('Cupón eliminado correctamente');
      router.push('/app/pos/cupones');
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar el cupón');
    }
  };

  const handleDuplicate = async () => {
    try {
      await CouponsService.duplicate(couponId);
      toast.success('Cupón duplicado correctamente');
      router.push('/app/pos/cupones');
    } catch (error: any) {
      toast.error(error.message || 'Error al duplicar el cupón');
    }
  };

  const handleToggleActive = async () => {
    if (!coupon) return;
    setToggling(true);
    try {
      await CouponsService.toggleActive(couponId);
      toast.success(coupon.is_active ? 'Cupón desactivado' : 'Cupón activado');
      loadCoupon();
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar estado');
    } finally {
      setToggling(false);
    }
  };

  const handleExportRedemptions = () => {
    if (redemptions.length === 0) {
      toast.error('No hay redenciones para exportar');
      return;
    }

    const csvData = redemptions.map(r => ({
      'Fecha': new Date(r.created_at).toLocaleString('es-CO'),
      'Venta': r.sale_id.slice(-8),
      'Cliente': r.customer?.full_name || '-',
      'Sucursal': r.sale?.branch?.name || '-',
      'Descuento Aplicado': r.discount_applied,
      'Total Venta': r.sale?.total || 0
    }));

    const csvContent = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).map(v => `"${v}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `redenciones-${coupon?.code}-${new Date().toISOString().split('T')[0]}.csv`);
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Exportación completada');
  };

  const getStatusBadge = (c: Coupon) => {
    const now = new Date();
    const startDate = c.start_date ? new Date(c.start_date) : null;
    const endDate = c.end_date ? new Date(c.end_date) : null;

    if (!c.is_active) return <Badge variant="secondary">Inactivo</Badge>;
    if (startDate && startDate > now) return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Programado</Badge>;
    if (endDate && endDate < now) return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Expirado</Badge>;
    if (c.usage_limit && c.usage_count >= c.usage_limit) return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">Agotado</Badge>;
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Activo</Badge>;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (orgLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-purple-600" />
            <p className="text-gray-600 dark:text-gray-400">Cargando...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!coupon) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-8">
        <div className="max-w-5xl mx-auto text-center py-12">
          <Ticket className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <h2 className="text-xl font-semibold dark:text-white mb-2">Cupón no encontrado</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4">El cupón que buscas no existe o fue eliminado.</p>
          <Link href="/app/pos/cupones">
            <Button>Volver a Cupones</Button>
          </Link>
        </div>
      </div>
    );
  }

  const totalDiscountApplied = redemptions.reduce((sum, r) => sum + r.discount_applied, 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-4">
                <Link href="/app/pos/cupones">
                  <Button variant="ghost" size="icon">
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                </Link>
                <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                  <Ticket className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <CardTitle className="dark:text-white flex items-center gap-2">
                    <span className="font-mono">{coupon.code}</span>
                    {getStatusBadge(coupon)}
                  </CardTitle>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {coupon.name || 'Sin nombre'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowEditDialog(true)} className="dark:bg-gray-700 dark:border-gray-600">
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
                </Button>
                <Button variant="outline" size="sm" onClick={handleDuplicate} className="dark:bg-gray-700 dark:border-gray-600">
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicar
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowDeleteDialog(true)} className="text-red-600 dark:text-red-400 dark:bg-gray-700 dark:border-gray-600">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Información Principal */}
          <Card className="md:col-span-2 dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-lg dark:text-white">Detalles del Cupón</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Descuento</h4>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 flex items-center gap-2">
                    {coupon.discount_type === 'percentage' ? <Percent className="h-5 w-5" /> : <DollarSign className="h-5 w-5" />}
                    {coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : formatCurrency(coupon.discount_value)}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Tipo</h4>
                  <p className="dark:text-white">{DISCOUNT_TYPE_LABELS[coupon.discount_type]}</p>
                </div>
              </div>

              <Separator className="dark:bg-gray-700" />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Fecha Inicio</h4>
                  <p className="dark:text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {formatDate(coupon.start_date)}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Fecha Fin</h4>
                  <p className="dark:text-white flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {formatDate(coupon.end_date)}
                  </p>
                </div>
              </div>

              {(coupon.min_purchase_amount || coupon.max_discount_amount) && (
                <>
                  <Separator className="dark:bg-gray-700" />
                  <div className="grid grid-cols-2 gap-4">
                    {coupon.min_purchase_amount && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Compra Mínima</h4>
                        <p className="dark:text-white">{formatCurrency(coupon.min_purchase_amount)}</p>
                      </div>
                    )}
                    {coupon.max_discount_amount && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Descuento Máximo</h4>
                        <p className="dark:text-white">{formatCurrency(coupon.max_discount_amount)}</p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {coupon.customer && (
                <>
                  <Separator className="dark:bg-gray-700" />
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Cliente Asignado</h4>
                    <p className="dark:text-white flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      {coupon.customer.full_name}
                      {coupon.customer.email && <span className="text-gray-400">({coupon.customer.email})</span>}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Panel Lateral */}
          <div className="space-y-6">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg dark:text-white">Estado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {coupon.is_active ? <CheckCircle className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-gray-400" />}
                    <span className="dark:text-white">{coupon.is_active ? 'Activo' : 'Inactivo'}</span>
                  </div>
                  <Switch checked={coupon.is_active} onCheckedChange={handleToggleActive} disabled={toggling} className="data-[state=checked]:bg-green-600" />
                </div>
              </CardContent>
            </Card>

            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg dark:text-white">Estadísticas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Redenciones</span>
                  <span className="font-semibold dark:text-white">
                    {coupon.usage_count}
                    {coupon.usage_limit && <span className="text-gray-400">/{coupon.usage_limit}</span>}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Total Descontado</span>
                  <span className="font-semibold text-purple-600 dark:text-purple-400">{formatCurrency(totalDiscountApplied)}</span>
                </div>
                {coupon.applies_to_first_purchase && (
                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 w-full justify-center">
                    Solo Primera Compra
                  </Badge>
                )}
              </CardContent>
            </Card>

            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardContent className="p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <p>Creado: {formatDate(coupon.created_at)}</p>
                  <p>Actualizado: {formatDate(coupon.updated_at)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Historial de Redenciones */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg dark:text-white flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Historial de Redenciones ({redemptions.length})
              </CardTitle>
              {redemptions.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleExportRedemptions} className="dark:bg-gray-700 dark:border-gray-600">
                  <Download className="h-4 w-4 mr-2" />
                  Exportar
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {redemptions.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Este cupón aún no ha sido usado</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-700">
                    <TableHead>Fecha</TableHead>
                    <TableHead>Venta</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Sucursal</TableHead>
                    <TableHead className="text-right">Descuento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {redemptions.map((r) => (
                    <TableRow key={r.id} className="dark:border-gray-700">
                      <TableCell className="text-sm dark:text-gray-300">{formatDateTime(r.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono dark:border-gray-600">{r.sale_id.slice(-8)}</Badge>
                      </TableCell>
                      <TableCell className="dark:text-gray-300">{r.customer?.full_name || '-'}</TableCell>
                      <TableCell className="dark:text-gray-300">{r.sale?.branch?.name || '-'}</TableCell>
                      <TableCell className="text-right font-semibold text-purple-600 dark:text-purple-400">
                        {formatCurrency(r.discount_applied)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <CouponForm
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        coupon={coupon}
        onSuccess={() => {
          setShowEditDialog(false);
          loadCoupon();
        }}
      />

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">¿Eliminar cupón?</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción no se puede deshacer. Si el cupón tiene redenciones, no podrá ser eliminado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-gray-700 dark:text-white">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
