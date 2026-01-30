'use client';

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  MoreHorizontal, 
  Eye, 
  Edit,
  CheckCircle,
  XCircle,
  Trash2,
  FileEdit,
  Loader2,
  ClipboardList
} from 'lucide-react';
import { formatDate } from '@/utils/Utils';
import { ADJUSTMENT_TYPES, ADJUSTMENT_REASONS, type InventoryAdjustment } from '@/lib/services/adjustmentService';
import Link from 'next/link';

interface AjustesTableProps {
  data: InventoryAdjustment[];
  isLoading?: boolean;
  onApply?: (adjustment: InventoryAdjustment) => void;
  onCancel?: (adjustment: InventoryAdjustment) => void;
  onDelete?: (adjustment: InventoryAdjustment) => void;
}

function getStatusBadge(status: string) {
  const badges: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    draft: {
      label: 'Borrador',
      color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      icon: FileEdit
    },
    applied: {
      label: 'Aplicado',
      color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      icon: CheckCircle
    },
    cancelled: {
      label: 'Cancelado',
      color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      icon: XCircle
    }
  };
  return badges[status] || badges.draft;
}

function getTypeLabel(type: string): string {
  const found = ADJUSTMENT_TYPES.find(t => t.value === type);
  return found?.label || type;
}

function getReasonLabel(reason: string): string {
  const found = ADJUSTMENT_REASONS.find(r => r.value === reason);
  return found?.label || reason;
}

export function AjustesTable({ 
  data, 
  isLoading,
  onApply,
  onCancel,
  onDelete
}: AjustesTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-500 dark:text-gray-400">Cargando ajustes...</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ClipboardList className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          No hay ajustes registrados
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Crea un nuevo ajuste para comenzar
        </p>
        <Link href="/app/inventario/ajustes/nuevo">
          <Button className="mt-4 bg-blue-600 hover:bg-blue-700 text-white">
            Crear Ajuste
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800/50">
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300">
                ID
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300">
                Fecha
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300">
                Sucursal
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300">
                Tipo
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300">
                Razón
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300">
                Estado
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300">
                Notas
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300 text-right">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => {
              const statusBadge = getStatusBadge(item.status);
              const StatusIcon = statusBadge.icon;

              return (
                <TableRow 
                  key={item.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <TableCell className="font-mono text-sm text-gray-600 dark:text-gray-400">
                    #{item.id}
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {formatDate(item.created_at)}
                  </TableCell>
                  <TableCell className="font-medium text-gray-900 dark:text-white">
                    {item.branches?.name || '-'}
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">
                    {getTypeLabel(item.type)}
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">
                    {getReasonLabel(item.reason)}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusBadge.color}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {statusBadge.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">
                    <div className="max-w-[150px] truncate" title={item.notes || ''}>
                      {item.notes || '-'}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="h-8 w-8 p-0"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent 
                        align="end"
                        className="dark:bg-gray-900 dark:border-gray-700"
                      >
                        <Link href={`/app/inventario/ajustes/${item.id}`}>
                          <DropdownMenuItem className="cursor-pointer">
                            <Eye className="h-4 w-4 mr-2" />
                            Ver detalle
                          </DropdownMenuItem>
                        </Link>
                        
                        {item.status === 'draft' && (
                          <>
                            <Link href={`/app/inventario/ajustes/${item.id}/editar`}>
                              <DropdownMenuItem className="cursor-pointer">
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                            </Link>
                            
                            <DropdownMenuSeparator />
                            
                            <DropdownMenuItem 
                              className="cursor-pointer text-green-600 dark:text-green-400"
                              onClick={() => onApply?.(item)}
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Aplicar ajuste
                            </DropdownMenuItem>
                            
                            <DropdownMenuItem 
                              className="cursor-pointer text-orange-600 dark:text-orange-400"
                              onClick={() => onCancel?.(item)}
                            >
                              <XCircle className="h-4 w-4 mr-2" />
                              Cancelar
                            </DropdownMenuItem>
                            
                            <DropdownMenuSeparator />
                            
                            <DropdownMenuItem 
                              className="cursor-pointer text-red-600 dark:text-red-400"
                              onClick={() => onDelete?.(item)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default AjustesTable;
