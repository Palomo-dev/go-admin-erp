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
import { Badge } from '@/components/ui/badge';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Package
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/utils/Utils';
import type { KardexEntry } from '@/lib/services/kardexService';

interface KardexTableProps {
  data: KardexEntry[];
  isLoading?: boolean;
}

function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    sale: 'Venta',
    purchase: 'Compra',
    transfer: 'Transferencia',
    adjustment: 'Ajuste',
    return: 'Devolución',
    initial: 'Inventario Inicial',
    production: 'Producción',
    waste: 'Merma',
    invoice_sale: 'Venta (Factura)',
    folio_item: 'Folio',
    room_consumption: 'Consumo Habitación',
    mesa_sale: 'Venta Mesa'
  };
  return labels[source] || source;
}

function getSourceColor(source: string): string {
  const colors: Record<string, string> = {
    sale: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    purchase: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    transfer: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
    adjustment: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    return: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
    initial: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    production: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    waste: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    invoice_sale: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    folio_item: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    room_consumption: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
    mesa_sale: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400'
  };
  return colors[source] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
}

function getBalanceColor(balance: number): string {
  if (balance > 0) return 'text-blue-600 dark:text-blue-400';
  if (balance < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-500 dark:text-gray-400';
}

export function KardexTable({ 
  data, 
  isLoading
}: KardexTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 dark:bg-gray-800/50">
                {Array.from({ length: 10 }).map((_, i) => (
                  <TableHead key={i} className="font-semibold text-gray-700 dark:text-gray-300">
                    <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {Array.from({ length: 10 }).map((_, cellIndex) => (
                    <TableCell key={cellIndex}>
                      <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Package className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          No hay movimientos registrados
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          No se encontraron movimientos con los filtros aplicados
        </p>
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
                Fecha
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300 text-center">
                Dirección
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300 text-right">
                Cantidad
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300 text-right">
                Costo Unit.
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300 text-right">
                Valor Total
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300 text-right">
                Saldo
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300">
                Origen
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300">
                Sucursal
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300">
                Documento
              </TableHead>
              <TableHead className="font-semibold text-gray-700 dark:text-gray-300">
                Nota
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((entry) => {
              return (
                <TableRow 
                  key={entry.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <TableCell className="text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {formatDate(entry.date)}
                    <br />
                    <span className="text-xs">
                      {new Date(entry.date).toLocaleTimeString('es-CO', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {entry.direction === 'in' ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        <ArrowDownCircle className="h-3 w-3 mr-1" />
                        Entrada
                      </Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                        <ArrowUpCircle className="h-3 w-3 mr-1" />
                        Salida
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium text-gray-900 dark:text-white">
                    {entry.direction === 'in' ? '+' : '-'}{entry.qty.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-gray-600 dark:text-gray-400">
                    {formatCurrency(entry.unit_cost)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-gray-900 dark:text-white">
                    {formatCurrency(entry.total_cost)}
                  </TableCell>
                  <TableCell className={`text-right font-bold ${getBalanceColor(entry.balance)}`}>
                    {entry.balance.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge className={getSourceColor(entry.source)}>
                      {getSourceLabel(entry.source)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">
                    {entry.branch_name}
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400 font-mono text-sm">
                    {entry.source_id || '-'}
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-gray-400">
                    <div className="max-w-[200px] truncate" title={entry.note || ''}>
                      {entry.note || '-'}
                    </div>
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

export default KardexTable;
