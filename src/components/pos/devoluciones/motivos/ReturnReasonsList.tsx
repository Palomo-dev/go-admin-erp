'use client';

import { useState } from 'react';
import { 
  Edit, 
  Trash2, 
  Copy, 
  MoreHorizontal, 
  Camera, 
  Package, 
  CheckCircle, 
  XCircle,
  GripVertical
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
import { ReturnReasonsService } from './returnReasonsService';
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

  const handleDelete = async () => {
    if (!deleteId) return;
    
    try {
      await ReturnReasonsService.delete(deleteId);
      toast.success('Motivo eliminado correctamente');
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar el motivo');
    } finally {
      setDeleteId(null);
    }
  };

  const handleDuplicate = async (reason: ReturnReason) => {
    try {
      await ReturnReasonsService.duplicate(reason.id);
      toast.success('Motivo duplicado correctamente');
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || 'Error al duplicar el motivo');
    }
  };

  const handleToggleActive = async (reason: ReturnReason) => {
    setTogglingId(reason.id);
    try {
      await ReturnReasonsService.toggleActive(reason.id);
      toast.success(reason.is_active ? 'Motivo desactivado' : 'Motivo activado');
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || 'Error al cambiar estado');
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
          No hay motivos registrados
        </h3>
        <p className="text-gray-500 dark:text-gray-500">
          Crea tu primer motivo de devolución para comenzar
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
              <TableHead className="w-[80px]">Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead className="hidden md:table-cell">Descripción</TableHead>
              <TableHead className="text-center w-[100px]">
                <div className="flex items-center justify-center gap-1">
                  <Camera className="h-4 w-4" />
                  <span className="hidden lg:inline">Foto</span>
                </div>
              </TableHead>
              <TableHead className="text-center w-[100px]">
                <div className="flex items-center justify-center gap-1">
                  <Package className="h-4 w-4" />
                  <span className="hidden lg:inline">Inventario</span>
                </div>
              </TableHead>
              <TableHead className="text-center w-[100px]">Estado</TableHead>
              <TableHead className="text-right w-[100px]">Acciones</TableHead>
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
                <TableCell className="hidden md:table-cell text-gray-500 dark:text-gray-400 max-w-[200px] truncate">
                  {reason.description || '-'}
                </TableCell>
                <TableCell className="text-center">
                  {reason.requires_photo ? (
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      <Camera className="h-3 w-3 mr-1" />
                      Sí
                    </Badge>
                  ) : (
                    <span className="text-gray-400">No</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {reason.affects_inventory ? (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      <Package className="h-3 w-3 mr-1" />
                      Sí
                    </Badge>
                  ) : (
                    <span className="text-gray-400">No</span>
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
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                      <DropdownMenuItem 
                        onClick={() => onEdit(reason)}
                        className="dark:hover:bg-gray-700"
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDuplicate(reason)}
                        className="dark:hover:bg-gray-700"
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="dark:bg-gray-700" />
                      <DropdownMenuItem 
                        onClick={() => setDeleteId(reason.id)}
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

      {/* Diálogo de confirmación de eliminación */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              ¿Eliminar motivo de devolución?
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción no se puede deshacer. Si el motivo está siendo usado en 
              devoluciones existentes, no podrá ser eliminado.
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
