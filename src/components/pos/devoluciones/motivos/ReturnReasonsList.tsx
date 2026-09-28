'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { 
  Edit, 
  Trash2, 
  Copy, 
  MoreHorizontal, 
  Camera, 
  Package, 
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
import { ReturnReason } from '../types';
import { ReturnReasonsService, claveErrorMotivo } from './returnReasonsService';
import { cn } from '@/utils/Utils';
import { toast } from 'sonner';

interface ReturnReasonsListProps {
  reasons: ReturnReason[];
  loading: boolean;
  onEdit: (reason: ReturnReason) => void;
  onRefresh: () => void;
}

export function ReturnReasonsList({ 
  reasons, 
  loading, 
  onEdit, 
  onRefresh 
}: ReturnReasonsListProps) {
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const t = useTranslations('posDevoluciones.motivos.lista');
  const tErrores = useTranslations('posDevoluciones.motivos.errores');
  const tComun = useTranslations('posDevoluciones.comun');

  const handleDelete = async () => {
    if (!deleteId) return;
    
    try {
      await ReturnReasonsService.delete(deleteId);
      toast.success(t('eliminado'));
      onRefresh();
    } catch (error) {
      const { clave, valores } = claveErrorMotivo(error, 'eliminar');
      toast.error(tErrores(clave, valores));
    } finally {
      setDeleteId(null);
    }
  };

  const handleDuplicate = async (reason: ReturnReason) => {
    try {
      await ReturnReasonsService.duplicate(reason.id);
      toast.success(t('duplicado'));
      onRefresh();
    } catch (error) {
      const { clave, valores } = claveErrorMotivo(error, 'duplicar');
      toast.error(tErrores(clave, valores));
    }
  };

  const handleToggleActive = async (reason: ReturnReason) => {
    setTogglingId(reason.id);
    try {
      await ReturnReasonsService.toggleActive(reason.id);
      toast.success(reason.is_active ? t('desactivado') : t('activado'));
      onRefresh();
    } catch (error) {
      const { clave, valores } = claveErrorMotivo(error, 'cambiarEstado');
      toast.error(tErrores(clave, valores));
    } finally {
      setTogglingId(null);
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

  if (reasons.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
          {t('sinRegistros')}
        </h3>
        <p className="text-gray-500 dark:text-gray-500">
          {t('sinRegistrosDescripcion')}
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
              <TableHead className="w-[80px]">{t('codigo')}</TableHead>
              <TableHead>{t('nombre')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('descripcion')}</TableHead>
              <TableHead className="text-center w-[100px]">
                <div className="flex items-center justify-center gap-1">
                  <Camera className="h-4 w-4" />
                  <span className="hidden lg:inline">{t('foto')}</span>
                </div>
              </TableHead>
              <TableHead className="text-center w-[100px]">
                <div className="flex items-center justify-center gap-1">
                  <Package className="h-4 w-4" />
                  <span className="hidden lg:inline">{t('inventario')}</span>
                </div>
              </TableHead>
              <TableHead className="text-center w-[100px]">{t('estado')}</TableHead>
              <TableHead className="text-right w-[100px]">{t('acciones')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reasons.map((reason) => (
              <TableRow 
                key={reason.id} 
                className={cn(
                  "dark:border-gray-700",
                  !reason.is_active && "opacity-60"
                )}
              >
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className="font-mono text-xs dark:border-gray-600"
                  >
                    {reason.code}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium dark:text-white">
                  {reason.name}
                </TableCell>
                <TableCell className="hidden md:table-cell text-gray-500 dark:text-gray-400 break-words whitespace-normal">
                  {reason.description || '-'}
                </TableCell>
                <TableCell className="text-center">
                  {reason.requires_photo ? (
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      <Camera className="h-3 w-3 mr-1" />
                      {t('si')}
                    </Badge>
                  ) : (
                    <span className="text-gray-400">{t('no')}</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {reason.affects_inventory ? (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      <Package className="h-3 w-3 mr-1" />
                      {t('si')}
                    </Badge>
                  ) : (
                    <span className="text-gray-400">{t('no')}</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={reason.is_active}
                    onCheckedChange={() => handleToggleActive(reason)}
                    disabled={togglingId === reason.id}
                    className="data-[state=checked]:bg-green-600"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={t('acciones')}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                      <DropdownMenuItem 
                        onClick={() => onEdit(reason)}
                        className="dark:hover:bg-gray-700"
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        {t('editar')}
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDuplicate(reason)}
                        className="dark:hover:bg-gray-700"
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        {t('duplicar')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="dark:bg-gray-700" />
                      <DropdownMenuItem 
                        onClick={() => setDeleteId(reason.id)}
                        className="text-red-600 dark:text-red-400 dark:hover:bg-gray-700"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t('eliminar')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Diálogo de confirmación de eliminación */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              {t('confirmarTitulo')}
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              {t('confirmarDescripcion')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600">
              {tComun('cancelar')}
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {t('eliminar')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
