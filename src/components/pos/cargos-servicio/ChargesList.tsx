'use client';

import { useState } from 'react';
import { 
  Edit, 
  Trash2, 
  MoreHorizontal, 
  Copy,
  ToggleLeft,
  ToggleRight,
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
import { ServiceCharge, CHARGE_TYPE_LABELS, APPLIES_TO_LABELS } from './types';
import { CargosServicioService } from './cargosServicioService';
import { formatCurrency, cn } from '@/utils/Utils';
import { toast } from 'sonner';

interface ChargesListProps {
  charges: ServiceCharge[];
  loading: boolean;
  onRefresh: () => void;
  onEdit?: (charge: ServiceCharge) => void;
}

export function ChargesList({ 
  charges, 
  loading, 
  onRefresh, 
  onEdit
}: ChargesListProps) {
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const handleDelete = async () => {
    if (deleteId === null) return;
    
    try {
      await CargosServicioService.delete(deleteId);
      toast.success('Cargo eliminado correctamente');
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar el cargo');
    } finally {
      setDeleteId(null);
    }
  };

  const handleToggleActive = async (charge: ServiceCharge) => {
    setTogglingId(charge.id);
    try {
      await CargosServicioService.toggleActive(charge.id, !charge.is_active);
      toast.success(
        charge.is_active ? 'Cargo desactivado' : 'Cargo activado'
      );
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar estado');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDuplicate = async (charge: ServiceCharge) => {
    try {
      await CargosServicioService.duplicate(charge.id);
      toast.success('Cargo duplicado correctamente');
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || 'Error al duplicar el cargo');
    }
  };

  const formatChargeValue = (charge: ServiceCharge) => {
    if (charge.charge_type === 'percentage') {
      return `${charge.charge_value}%`;
    }
    return formatCurrency(charge.charge_value);
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
          No hay cargos de servicio
        </h3>
        <p className="text-gray-500 dark:text-gray-500">
          Crea un cargo de servicio para aplicarlo a las ventas
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
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Condiciones</TableHead>
              <TableHead>Aplica a</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
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
                        Global (todas las sucursales)
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
                      {CHARGE_TYPE_LABELS[charge.charge_type]}
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
                        Min: {formatCurrency(charge.min_amount)}
                      </p>
                    )}
                    {charge.min_guests && (
                      <p className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Min: {charge.min_guests} personas
                      </p>
                    )}
                    {!charge.min_amount && !charge.min_guests && (
                      <p className="text-gray-400 dark:text-gray-500 text-xs">
                        Sin restricciones
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className="dark:border-gray-600 dark:text-gray-300"
                  >
                    {APPLIES_TO_LABELS[charge.applies_to]}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex flex-col items-center gap-1">
                    <Switch
                      checked={charge.is_active}
                      onCheckedChange={() => handleToggleActive(charge)}
                      disabled={togglingId === charge.id}
                    />
                    <div className="flex gap-1">
                      {charge.is_taxable && (
                        <Badge variant="secondary" className="text-xs">
                          Gravado
                        </Badge>
                      )}
                      {charge.is_optional && (
                        <Badge variant="outline" className="text-xs">
                          Opcional
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right">
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
                          Editar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem 
                        onClick={() => handleDuplicate(charge)}
                        className="dark:hover:bg-gray-700"
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="dark:bg-gray-700" />
                      <DropdownMenuItem 
                        onClick={() => setDeleteId(charge.id)}
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
              ¿Eliminar cargo de servicio?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción no se puede deshacer.
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
