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
  Globe,
  User,
  Split,
  Users
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
import { Tip } from './types';
import { PropinasService } from './propinasService';
import { codigoErrorPropina, esTipoPropina } from './propinasLogica';
import { cn } from '@/utils/Utils';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

interface TipsListProps {
  tips: Tip[];
  loading: boolean;
  onRefresh: () => void;
  /** Sin permiso de registrar (pos.create) no se ofrece editar. */
  onEdit?: (tip: Tip) => void;
  /** Sin permiso de liquidar no se ofrece; la confirmación la pide el contenedor. */
  onMarkDistributed?: (tip: Tip) => void;
  /** Permiso pos.void: anular con reverso contable. */
  puedeAnular?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

export function TipsList({
  tips,
  loading,
  onRefresh,
  onEdit,
  onMarkDistributed,
  puedeAnular = false,
  selectedIds = [],
  onSelectionChange
}: TipsListProps) {
  const t = useTranslations('posPropinas');
  const { formatear } = useMonedaOrganizacion();
  const { formatDateTime } = useFormatDate();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [anulando, setAnulando] = useState(false);

  // «Eliminar» ya no borra: anula la propina y revierte su asiento en una
  // transacción (fn_propina_anular). Una distribuida no se anula.
  const handleDelete = async () => {
    if (!deleteId || anulando) return;

    setAnulando(true);
    try {
      const { asientosRevertidos } = await PropinasService.anular(deleteId);
      toast.success(asientosRevertidos > 0 ? t('toast.anuladaConReverso') : t('toast.anulada'));
      onRefresh();
    } catch (error: unknown) {
      toast.error(t(`errores.${codigoErrorPropina(error)}`));
    } finally {
      setAnulando(false);
      setDeleteId(null);
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
      case 'online': return <Globe className="h-4 w-4 text-cyan-500" />;
      case 'split': return <Split className="h-4 w-4 text-orange-500" />;
      case 'pooled': return <Users className="h-4 w-4 text-pink-500" />;
      default: return null;
    }
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
                  {formatDateTime(tip.created_at)}
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
                      {esTipoPropina(tip.tip_type) ? t(`tipos.${tip.tip_type}`) : tip.tip_type}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    {formatear(tip.amount)}
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
                  {/* Una propina distribuida no se edita ni se anula. */}
                  {!tip.is_distributed && (onEdit || onMarkDistributed || puedeAnular) && (
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
                      {onMarkDistributed && (
                        <DropdownMenuItem
                          onClick={() => onMarkDistributed(tip)}
                          className="dark:hover:bg-gray-700"
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Marcar Distribuida
                        </DropdownMenuItem>
                      )}
                      {puedeAnular && (
                        <>
                          <DropdownMenuSeparator className="dark:bg-gray-700" />
                          <DropdownMenuItem
                            onClick={() => setDeleteId(tip.id)}
                            className="text-red-600 dark:text-red-400 dark:hover:bg-gray-700"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t('acciones.anular')}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open && !anulando) setDeleteId(null); }}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">
              {t('anular.titulo')}
            </AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              {t('anular.descripcion')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={anulando}
              className="dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
            >
              {t('anular.cancelar')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleDelete(); }}
              disabled={anulando}
              className="bg-red-600 hover:bg-red-700"
            >
              {anulando ? t('anular.anulando') : t('anular.confirmar')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
