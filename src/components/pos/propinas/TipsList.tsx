'use client';

import { useState } from 'react';
import { 
  Edit, 
  Trash2, 
  MoreHorizontal, 
  CheckCircle,
  Banknote,
  CreditCard,
  ArrowRightLeft,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Tip, TIP_TYPE_LABELS } from './types';
import { PropinasService } from './propinasService';
import { formatCurrency, cn } from '@/utils/Utils';
import { toast } from 'sonner';

interface TipsListProps {
  tips: Tip[];
  loading: boolean;
  onRefresh: () => void;
  onEdit?: (tip: Tip) => void;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

export function TipsList({ 
  tips, 
  loading, 
  onRefresh, 
  onEdit,
  selectedIds = [],
  onSelectionChange
}: TipsListProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteId) return;
    
    try {
      await PropinasService.delete(deleteId);
      toast.success('Propina eliminada correctamente');
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar la propina');
    } finally {
      setDeleteId(null);
    }
  };

  const handleMarkDistributed = async (tip: Tip) => {
    try {
      await PropinasService.markAsDistributed(tip.id);
      toast.success('Propina marcada como distribuida');
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || 'Error al marcar como distribuida');
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return;
    
    if (checked) {
      const pendingIds = tips.filter(t => !t.is_distributed).map(t => t.id);
      onSelectionChange(pendingIds);
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectOne = (tipId: string, checked: boolean) => {
    if (!onSelectionChange) return;
    
    if (checked) {
      onSelectionChange([...selectedIds, tipId]);
    } else {
      onSelectionChange(selectedIds.filter(id => id !== tipId));
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'cash': return <Banknote className="h-4 w-4 text-green-500" />;
      case 'card': return <CreditCard className="h-4 w-4 text-blue-500" />;
      case 'transfer': return <ArrowRightLeft className="h-4 w-4 text-purple-500" />;
      default: return null;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getServerName = (tip: Tip) => {
    const firstName = tip.server?.first_name || '';
    const lastName = tip.server?.last_name || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    return fullName || tip.server?.email || 'Sin asignar';
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

  if (tips.length === 0) {
    return (
      <div className="text-center py-12">
        <Banknote className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
          No hay propinas registradas
        </h3>
        <p className="text-gray-500 dark:text-gray-500">
          Las propinas aparecerán aquí cuando se registren
        </p>
      </div>
    );
  }

  const pendingTips = tips.filter(t => !t.is_distributed);
  const allPendingSelected = pendingTips.length > 0 && 
    pendingTips.every(t => selectedIds.includes(t.id));

  return (
    <>
      <div className="rounded-lg border dark:border-gray-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="dark:border-gray-700 hover:bg-transparent">
              {onSelectionChange && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={allPendingSelected}
                    onCheckedChange={handleSelectAll}
                    disabled={pendingTips.length === 0}
                  />
                </TableHead>
              )}
              <TableHead>Fecha</TableHead>
              <TableHead>Mesero</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tips.map((tip) => (
              <TableRow 
                key={tip.id} 
                className={cn(
                  "dark:border-gray-700",
                  tip.is_distributed && "opacity-60"
                )}
              >
                {onSelectionChange && (
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(tip.id)}
                      onCheckedChange={(checked) => handleSelectOne(tip.id, !!checked)}
                      disabled={tip.is_distributed}
                    />
                  </TableCell>
                )}
                <TableCell className="text-sm dark:text-gray-300">
                  {formatDate(tip.created_at)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-400" />
                    <span className="dark:text-white">{getServerName(tip)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getTypeIcon(tip.tip_type)}
                    <span className="text-sm dark:text-gray-300">
                      {TIP_TYPE_LABELS[tip.tip_type]}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    {formatCurrency(tip.amount)}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  {tip.is_distributed ? (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      Distribuida
                    </Badge>
                  ) : (
                    <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                      Pendiente
                    </Badge>
                  )}
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
                          onClick={() => onEdit(tip)}
                          className="dark:hover:bg-gray-700"
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                      )}
                      {!tip.is_distributed && (
                        <DropdownMenuItem 
                          onClick={() => handleMarkDistributed(tip)}
                          className="dark:hover:bg-gray-700"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Marcar Distribuida
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator className="dark:bg-gray-700" />
                      <DropdownMenuItem 
                        onClick={() => setDeleteId(tip.id)}
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
              ¿Eliminar propina?
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
