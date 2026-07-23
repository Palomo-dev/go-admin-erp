'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Eye,
  Truck,
  XCircle,
  Loader2,
  ArrowRight,
  Package,
} from 'lucide-react';
import type { InventoryTransfer } from '../transferencias/types';

interface DistribucionTableProps {
  transferencias: InventoryTransfer[];
  loading: boolean;
  onMarcarEnTransito: (id: number) => void;
  onCancelar: (id: number) => void;
  onVerDetalle: (id: number) => void;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; color: string }> = {
  pending: { label: 'Pendiente', variant: 'secondary', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  in_transit: { label: 'En Tránsito', variant: 'default', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  partial: { label: 'Parcial', variant: 'outline', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  complete: { label: 'Recibido', variant: 'default', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  cancelled: { label: 'Cancelada', variant: 'destructive', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  draft: { label: 'Borrador', variant: 'outline', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
};

export function DistribucionTable({
  transferencias,
  loading,
  onMarcarEnTransito,
  onCancelar,
  onVerDetalle,
}: DistribucionTableProps) {
  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (transferencias.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
        <Package className="h-12 w-12 mb-3 opacity-50" />
        <p className="text-sm">No hay transferencias de distribución</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="dark:border-gray-700">
            <TableHead className="dark:text-gray-300">#</TableHead>
            <TableHead className="dark:text-gray-300">Origen</TableHead>
            <TableHead className="dark:text-gray-300">Destino</TableHead>
            <TableHead className="dark:text-gray-300">Estado</TableHead>
            <TableHead className="dark:text-gray-300">Fecha</TableHead>
            <TableHead className="dark:text-gray-300">Notas</TableHead>
            <TableHead className="text-right dark:text-gray-300">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transferencias.map((t) => {
            const config = statusConfig[t.status] || statusConfig.draft;
            return (
              <TableRow key={t.id} className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <TableCell className="font-medium dark:text-white">#{t.id}</TableCell>
                <TableCell className="dark:text-gray-300">
                  <div className="flex items-center gap-1">
                    <span>{t.origin_branch?.name || `Sucursal ${t.origin_branch_id}`}</span>
                  </div>
                </TableCell>
                <TableCell className="dark:text-gray-300">
                  <div className="flex items-center gap-1">
                    <ArrowRight className="h-3 w-3 text-gray-400" />
                    <span>{t.dest_branch?.name || `Sucursal ${t.dest_branch_id}`}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={config.variant} className={config.color}>
                    {config.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-gray-500 dark:text-gray-400">
                  {t.created_at ? new Date(t.created_at).toLocaleDateString('es-CO') : '-'}
                </TableCell>
                <TableCell className="text-sm text-gray-500 dark:text-gray-400 max-w-[200px] truncate">
                  {t.notes || '-'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onVerDetalle(t.id)}
                      className="h-8 w-8 p-0"
                      title="Ver detalle"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {t.status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onMarcarEnTransito(t.id)}
                        className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700"
                        title="Marcar en tránsito"
                      >
                        <Truck className="h-4 w-4" />
                      </Button>
                    )}
                    {(t.status === 'pending' || t.status === 'draft') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onCancelar(t.id)}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                        title="Cancelar"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
