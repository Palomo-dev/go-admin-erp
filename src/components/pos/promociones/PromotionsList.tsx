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
  Tag,
  Gift
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
import { Promotion, PROMOTION_TYPE_LABELS } from './types';
import { PromotionsService } from './promotionsService';
import { formatCurrency, cn } from '@/utils/Utils';
import { toast } from 'sonner';

interface PromotionsListProps {
  promotions: Promotion[];
  loading: boolean;
  onRefresh: () => void;
}

export function PromotionsList({ promotions, loading, onRefresh }: PromotionsListProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteId) return;
    
    try {
      await PromotionsService.delete(deleteId);
      toast.success('Promoción eliminada correctamente');
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar la promoción');
    } finally {
      setDeleteId(null);
    }
  };

  const handleDuplicate = async (promo: Promotion) => {
    try {
      await PromotionsService.duplicate(promo.id);
      toast.success('Promoción duplicada correctamente');
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || 'Error al duplicar la promoción');
    }
  };

  const handleToggleActive = async (promo: Promotion) => {
    setTogglingId(promo.id);
    try {
      await PromotionsService.toggleActive(promo.id);
      toast.success(promo.is_active ? 'Promoción desactivada' : 'Promoción activada');
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar estado');
    } finally {
      setTogglingId(null);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'percentage':
        return <Percent className="h-4 w-4" />;
      case 'fixed':
        return <Tag className="h-4 w-4" />;
      case 'buy_x_get_y':
        return <Gift className="h-4 w-4" />;
      default:
        return <Tag className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (promo: Promotion) => {
    const now = new Date();
    const startDate = new Date(promo.start_date);
    const endDate = promo.end_date ? new Date(promo.end_date) : null;

    if (!promo.is_active) {
      return <Badge variant="secondary" className="dark:bg-gray-700">Inactiva</Badge>;
    }

    if (startDate > now) {
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Programada</Badge>;
    }

    if (endDate && endDate < now) {
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Expirada</Badge>;
    }

    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Activa</Badge>;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getDiscountDisplay = (promo: Promotion) => {
    switch (promo.promotion_type) {
      case 'percentage':
        return `${promo.discount_value}%`;
      case 'fixed':
        return formatCurrency(promo.discount_value || 0);
      case 'buy_x_get_y':
        return `${promo.buy_quantity}x${promo.get_quantity}`;
      case 'bundle':
        return formatCurrency(promo.discount_value || 0);
      default:
        return '-';
    }
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

  if (promotions.length === 0) {
    return (
      <div className="text-center py-12">
        <Tag className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
          No hay promociones registradas
        </h3>
        <p className="text-gray-500 dark:text-gray-500 mb-4">
          Crea tu primera promoción para comenzar
        </p>
        <Link href="/app/pos/promociones/nuevo">
          <Button className="bg-blue-600 hover:bg-blue-700">
            Nueva Promoción
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border dark:border-gray-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="dark:border-gray-700 hover:bg-transparent">
              <TableHead>Promoción</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Descuento</TableHead>
              <TableHead className="hidden md:table-cell">Vigencia</TableHead>
              <TableHead className="text-center">Usos</TableHead>
              <TableHead className="text-center">Prioridad</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {promotions.map((promo) => (
              <TableRow 
                key={promo.id} 
                className={cn(
                  "dark:border-gray-700",
                  !promo.is_active && "opacity-60"
                )}
              >
                <TableCell>
                  <div>
                    <div className="font-medium dark:text-white">{promo.name}</div>
                    {promo.description && (
                      <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                        {promo.description}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="dark:border-gray-600">
                    <span className="mr-1">{getTypeIcon(promo.promotion_type)}</span>
                    {PROMOTION_TYPE_LABELS[promo.promotion_type]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {getDiscountDisplay(promo)}
                  </span>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm">
                  <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                    <Calendar className="h-3 w-3" />
                    {formatDate(promo.start_date)}
                    {promo.end_date && (
                      <> - {formatDate(promo.end_date)}</>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <span className="text-gray-600 dark:text-gray-300">
                    {promo.usage_count}
                    {promo.usage_limit && <span className="text-gray-400">/{promo.usage_limit}</span>}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className="dark:border-gray-600">
                    {promo.priority}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  {getStatusBadge(promo)}
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
                        <Link href={`/app/pos/promociones/${promo.id}`}>
                          <Eye className="h-4 w-4 mr-2" />
                          Ver Detalles
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className="dark:hover:bg-gray-700">
                        <Link href={`/app/pos/promociones/${promo.id}?edit=true`}>
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDuplicate(promo)}
                        className="dark:hover:bg-gray-700"
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="dark:bg-gray-700" />
                      <DropdownMenuItem 
                        onClick={() => handleToggleActive(promo)}
                        disabled={togglingId === promo.id}
                        className="dark:hover:bg-gray-700"
                      >
                        <Switch 
                          checked={promo.is_active} 
                          className="h-4 w-8 mr-2 pointer-events-none" 
                        />
                        {promo.is_active ? 'Desactivar' : 'Activar'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="dark:bg-gray-700" />
                      <DropdownMenuItem 
                        onClick={() => setDeleteId(promo.id)}
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
              ¿Eliminar promoción?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción no se puede deshacer. La promoción será eliminada permanentemente.
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
