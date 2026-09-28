'use client';

import { useState } from 'react';
import { 
  Edit, 
  Trash2, 
  MoreHorizontal, 
  Copy,
  Percent,
  DollarSign,
  Users,
  Building2
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
import { ServiceCharge } from './types';
import { CargosServicioService } from './cargosServicioService';
import { cn } from '@/utils/Utils';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { codigoErrorCargo } from './cargosLogica';

interface ChargesListProps {
  charges: ServiceCharge[];
  loading: boolean;
  onRefresh: () => void;
  onEdit?: (charge: ServiceCharge) => void;
  /** billing_management: sin él no se ofrece editar, duplicar, activar ni eliminar. */
  puedeGestionar?: boolean;
}

export function ChargesList({ 
  charges, 
  loading, 
  onRefresh, 
  onEdit,
  puedeGestionar = false
}: ChargesListProps) {
  const t = useTranslations('posCargosServicio');
  const { formatear } = useMonedaOrganizacion();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const handleDelete = async () => {
    if (deleteId === null) return;
    
    try {
      await CargosServicioService.delete(deleteId);
      toast.success(t('toast.eliminado'));
      onRefresh();
    } catch (error: unknown) {
      toast.error(t(`errores.${codigoErrorCargo(error)}`));
    } finally {
      setDeleteId(null);
    }
  };

  const handleToggleActive = async (charge: ServiceCharge) => {
    setTogglingId(charge.id);
    try {
      await CargosServicioService.toggleActive(charge.id, !charge.is_active);
      toast.success(
        charge.is_active ? t('toast.desactivado') : t('toast.activado')
      );
      onRefresh();
    } catch (error: unknown) {
      toast.error(t(`errores.${codigoErrorCargo(error)}`));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDuplicate = async (charge: ServiceCharge) => {
    try {
      await CargosServicioService.duplicate(charge.id, t('copiaSufijo'));
      toast.success(t('toast.duplicado'));
      onRefresh();
    } catch (error: unknown) {
      toast.error(t(`errores.${codigoErrorCargo(error)}`));
    }
  };

  const formatChargeValue = (charge: ServiceCharge) => {
    if (charge.charge_type === 'percentage') {
      return `${charge.charge_value}%`;
    }
    return formatear(charge.charge_value);
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

  if (charges.length === 0) {
    return (
      <div className="text-center py-12">
        <Percent className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
          {t('lista.vacioTitulo')}
        </h3>
        <p className="text-gray-500 dark:text-gray-500">
          {t('lista.vacioDescripcion')}
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
              <TableHead>{t('lista.columnas.nombre')}</TableHead>
              <TableHead>{t('lista.columnas.tipo')}</TableHead>
              <TableHead className="text-right">{t('lista.columnas.valor')}</TableHead>
              <TableHead>{t('lista.columnas.condiciones')}</TableHead>
              <TableHead>{t('lista.columnas.aplicaA')}</TableHead>
              <TableHead className="text-center">{t('lista.columnas.estado')}</TableHead>
              <TableHead className="text-right">{t('lista.columnas.acciones')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {charges.map((charge) => (
              <TableRow 
                key={charge.id} 
                className={cn(
                  "dark:border-gray-700",
                  !charge.is_active && "opacity-60"
                )}
              >
                <TableCell>
                  <div>
                    <p className="font-medium dark:text-white">{charge.name}</p>
                    {charge.branch && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {charge.branch.name}
                      </p>
                    )}
                    {!charge.branch && (
                      <p className="text-xs text-blue-500 dark:text-blue-400">
                        {t('global')}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {charge.charge_type === 'percentage' ? (
                      <Percent className="h-4 w-4 text-blue-500" />
                    ) : (
                      <DollarSign className="h-4 w-4 text-green-500" />
                    )}
                    <span className="text-sm dark:text-gray-300">
                      {t(`tiposCargo.${charge.charge_type}`)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {formatChargeValue(charge)}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="text-sm space-y-1">
                    {charge.min_amount && (
                      <p className="text-gray-600 dark:text-gray-400">
                        {t('lista.minimoMonto', { monto: formatear(charge.min_amount) })}
                      </p>
                    )}
                    {charge.min_guests && (
                      <p className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {t('lista.minimoPersonas', { count: charge.min_guests })}
                      </p>
                    )}
                    {!charge.min_amount && !charge.min_guests && (
                      <p className="text-gray-400 dark:text-gray-500 text-xs">
                        {t('lista.sinRestricciones')}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className="dark:border-gray-600 dark:text-gray-300"
                  >
                    {t(`aplicaA.${charge.applies_to}`)}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex flex-col items-center gap-1">
                    <Switch
                      checked={charge.is_active}
                      onCheckedChange={() => handleToggleActive(charge)}
                      disabled={!puedeGestionar || togglingId === charge.id}
                    />
                    <div className="flex gap-1">
                      {charge.is_taxable && (
                        <Badge variant="secondary" className="text-xs">
                          {t('lista.gravado')}
                        </Badge>
                      )}
                      {charge.is_optional && (
                        <Badge variant="outline" className="text-xs">
                          {t('lista.opcional')}
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {puedeGestionar && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                      {onEdit && (
                        <DropdownMenuItem 
                          onClick={() => onEdit(charge)}
                          className="dark:hover:bg-gray-700"
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          {t('lista.editar')}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem 
                        onClick={() => handleDuplicate(charge)}
                        className="dark:hover:bg-gray-700"
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        {t('lista.duplicar')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="dark:bg-gray-700" />
                      <DropdownMenuItem 
                        onClick={() => setDeleteId(charge.id)}
                        className="text-red-600 dark:text-red-400 dark:hover:bg-gray-700"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t('lista.eliminar')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  )}
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
              {t('lista.eliminarTitulo')}
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              {t('lista.eliminarDescripcion')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600">
              {t('lista.cancelar')}
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {t('lista.eliminar')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
