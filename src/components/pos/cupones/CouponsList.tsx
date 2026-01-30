'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  Edit, 
  Trash2, 
  Copy, 
  MoreHorizontal, 
  Eye,
  Calendar,
  Percent,
  DollarSign,
  Ticket,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Coupon, DISCOUNT_TYPE_LABELS } from './types';
import { CouponsService } from './couponsService';
import { formatCurrency, cn } from '@/utils/Utils';
import { toast } from 'sonner';

interface CouponsListProps {
  coupons: Coupon[];
  loading: boolean;
  onRefresh: () => void;
}

export function CouponsList({ coupons, loading, onRefresh }: CouponsListProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteId) return;
    
    try {
      await CouponsService.delete(deleteId);
      toast.success('Cupón eliminado correctamente');
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar el cupón');
    } finally {
      setDeleteId(null);
    }
  };

  const handleDuplicate = async (coupon: Coupon) => {
    try {
      await CouponsService.duplicate(coupon.id);
      toast.success('Cupón duplicado correctamente');
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || 'Error al duplicar el cupón');
    }
  };

  const handleToggleActive = async (coupon: Coupon) => {
    setTogglingId(coupon.id);
    try {
      await CouponsService.toggleActive(coupon.id);
      toast.success(coupon.is_active ? 'Cupón desactivado' : 'Cupón activado');
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar estado');
    } finally {
      setTogglingId(null);
    }
  };

  const getStatusBadge = (coupon: Coupon) => {
    const now = new Date();
    const startDate = coupon.start_date ? new Date(coupon.start_date) : null;
    const endDate = coupon.end_date ? new Date(coupon.end_date) : null;

    if (!coupon.is_active) {
      return <Badge variant="secondary" className="dark:bg-gray-700">Inactivo</Badge>;
    }

    if (startDate && startDate > now) {
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Programado</Badge>;
    }

    if (endDate && endDate < now) {
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Expirado</Badge>;
    }

    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
      return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">Agotado</Badge>;
    }

    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Activo</Badge>;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getDiscountDisplay = (coupon: Coupon) => {
    if (coupon.discount_type === 'percentage') {
      return `${coupon.discount_value}%`;
    }
    return formatCurrency(coupon.discount_value);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (coupons.length === 0) {
    return (
      <div className="text-center py-12">
        <Ticket className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
          No hay cupones registrados
        </h3>
        <p className="text-gray-500 dark:text-gray-500 mb-4">
          Crea tu primer cupón para comenzar
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border dark:border-gray-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="dark:border-gray-700 hover:bg-transparent">
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Descuento</TableHead>
              <TableHead className="hidden md:table-cell">Vigencia</TableHead>
              <TableHead className="text-center">Usos</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.map((coupon) => (
              <TableRow 
                key={coupon.id} 
                className={cn(
                  "dark:border-gray-700",
                  !coupon.is_active && "opacity-60"
                )}
              >
                <TableCell>
                  <Badge variant="outline" className="font-mono text-sm dark:border-gray-600">
                    {coupon.code}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium dark:text-white">{coupon.name || '-'}</div>
                    {coupon.customer && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {coupon.customer.full_name}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {coupon.discount_type === 'percentage' ? (
                      <Percent className="h-4 w-4 text-blue-500" />
                    ) : (
                      <DollarSign className="h-4 w-4 text-green-500" />
                    )}
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {getDiscountDisplay(coupon)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm">
                  <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                    <Calendar className="h-3 w-3" />
                    {formatDate(coupon.start_date)}
                    {coupon.end_date && (
                      <> - {formatDate(coupon.end_date)}</>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <span className="text-gray-600 dark:text-gray-300">
                    {coupon.usage_count}
                    {coupon.usage_limit && <span className="text-gray-400">/{coupon.usage_limit}</span>}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  {getStatusBadge(coupon)}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                      <DropdownMenuItem asChild className="dark:hover:bg-gray-700">
                        <Link href={`/app/pos/cupones/${coupon.id}`}>
                          <Eye className="h-4 w-4 mr-2" />
                          Ver Detalles
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className="dark:hover:bg-gray-700">
                        <Link href={`/app/pos/cupones/${coupon.id}?edit=true`}>
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDuplicate(coupon)}
                        className="dark:hover:bg-gray-700"
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="dark:bg-gray-700" />
                      <DropdownMenuItem 
                        onClick={() => handleToggleActive(coupon)}
                        disabled={togglingId === coupon.id}
                        className="dark:hover:bg-gray-700"
                      >
                        <Switch 
                          checked={coupon.is_active} 
                          className="h-4 w-8 mr-2 pointer-events-none" 
                        />
                        {coupon.is_active ? 'Desactivar' : 'Activar'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="dark:bg-gray-700" />
                      <DropdownMenuItem 
                        onClick={() => setDeleteId(coupon.id)}
                        className="text-red-600 dark:text-red-400 dark:hover:bg-gray-700"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              ¿Eliminar cupón?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción no se puede deshacer. Si el cupón tiene redenciones, no podrá ser eliminado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
