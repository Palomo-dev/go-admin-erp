'use client';

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
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
  Eye, 
  Truck,
  PackageCheck,
  XCircle
} from 'lucide-react';
import { InventoryTransfer } from './types';
import { formatDate } from '@/utils/Utils';

interface TransferenciasTableProps {
  transferencias: InventoryTransfer[];
  loading: boolean;
  onMarcarEnTransito: (id: number) => void;
  onCancelar: (id: number) => void;
}

const estadoConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  draft: { label: 'Borrador', variant: 'secondary', className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
  pending: { label: 'Pendiente', variant: 'outline', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  in_transit: { label: 'En Tránsito', variant: 'default', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  partial: { label: 'Parcial', variant: 'outline', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  complete: { label: 'Completa', variant: 'default', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  cancelled: { label: 'Cancelada', variant: 'destructive', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' }
};

export function TransferenciasTable({ 
  transferencias, 
  loading, 
  onMarcarEnTransito,
  onCancelar 
}: TransferenciasTableProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleVerDetalle = (id: number) => {
    router.push(`/app/inventario/transferencias/${id}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (transferencias.length === 0) {
    return (
      <div className="text-center py-10 text-gray-500 dark:text-gray-400">
        <Truck className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No se encontraron transferencias</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="dark:border-gray-700">
            <TableHead className="dark:text-gray-300">ID</TableHead>
            <TableHead className="dark:text-gray-300">Origen</TableHead>
            <TableHead className="dark:text-gray-300">Destino</TableHead>
            <TableHead className="dark:text-gray-300">Estado</TableHead>
            <TableHead className="dark:text-gray-300">Fecha</TableHead>
            <TableHead className="text-right dark:text-gray-300">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transferencias.map((transferencia) => {
            const estado = estadoConfig[transferencia.status] || estadoConfig.pending;
            
            return (
              <TableRow 
                key={transferencia.id}
                className="dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <TableCell className="font-medium dark:text-white">
                  #{transferencia.id}
                </TableCell>
                <TableCell className="dark:text-gray-300">
                  {transferencia.origin_branch?.name || '-'}
                </TableCell>
                <TableCell className="dark:text-gray-300">
                  {transferencia.dest_branch?.name || '-'}
                </TableCell>
                <TableCell>
                  <Badge className={estado.className}>
                    {estado.label}
                  </Badge>
                </TableCell>
                <TableCell className="dark:text-gray-300">
                  {formatDate(transferencia.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleVerDetalle(transferencia.id)}
                      className="h-8 w-8 p-0 dark:hover:bg-gray-700"
                      title="Ver detalle"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    
                    {transferencia.status === 'pending' && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onMarcarEnTransito(transferencia.id)}
                          className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 dark:hover:bg-gray-700"
                          title="Marcar en tránsito"
                        >
                          <Truck className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onCancelar(transferencia.id)}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 dark:hover:bg-gray-700"
                          title="Cancelar"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    
                    {(transferencia.status === 'in_transit' || transferencia.status === 'partial') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleVerDetalle(transferencia.id)}
                        className="h-8 w-8 p-0 text-green-600 hover:text-green-700 dark:hover:bg-gray-700"
                        title="Recibir"
                      >
                        <PackageCheck className="h-4 w-4" />
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
