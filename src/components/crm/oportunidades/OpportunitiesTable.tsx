'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreHorizontal,
  Eye,
  Edit,
  Copy,
  Trash2,
  CheckCircle,
  XCircle,
  ArrowUpDown,
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Opportunity } from './types';
import { Skeleton } from '@/components/ui/skeleton';

interface OpportunitiesTableProps {
  opportunities: Opportunity[];
  isLoading?: boolean;
  onView?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onMarkWon?: (id: string) => void;
  onMarkLost?: (id: string) => void;
}

type SortField = 'name' | 'amount' | 'expected_close_date' | 'created_at';
type SortDirection = 'asc' | 'desc';

export function OpportunitiesTable({
  opportunities,
  isLoading,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
  onMarkWon,
  onMarkLost,
}: OpportunitiesTableProps) {
  const router = useRouter();
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedOpportunities = [...opportunities].sort((a, b) => {
    let comparison = 0;

    switch (sortField) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'amount':
        comparison = (a.amount || 0) - (b.amount || 0);
        break;
      case 'expected_close_date':
        comparison =
          new Date(a.expected_close_date || 0).getTime() -
          new Date(b.expected_close_date || 0).getTime();
        break;
      case 'created_at':
        comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            Abierta
          </Badge>
        );
      case 'won':
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            Ganada
          </Badge>
        );
      case 'lost':
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            Perdida
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      onClick={() => handleSort(field)}
      className="h-auto p-0 font-medium hover:bg-transparent"
    >
      {children}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </Button>
  );

  if (isLoading) {
    return (
      <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Prob.</TableHead>
              <TableHead>Fecha Cierre</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {[...Array(8)].map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (opportunities.length === 0) {
    return (
      <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">No se encontraron oportunidades</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800/50">
              <TableHead className="text-gray-700 dark:text-gray-300">
                <SortButton field="name">Nombre</SortButton>
              </TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Cliente</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Etapa</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">
                <SortButton field="amount">Monto</SortButton>
              </TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Prob.</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">
                <SortButton field="expected_close_date">Fecha Cierre</SortButton>
              </TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300">Estado</TableHead>
              <TableHead className="text-gray-700 dark:text-gray-300 w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedOpportunities.map((opportunity) => (
              <TableRow
                key={opportunity.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                onClick={() => router.push(`/app/crm/oportunidades/${opportunity.id}`)}
              >
                <TableCell className="font-medium text-gray-900 dark:text-white">
                  {opportunity.name}
                </TableCell>
                <TableCell className="text-gray-600 dark:text-gray-400">
                  {opportunity.customer?.full_name || '-'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: opportunity.stage?.color || '#3b82f6' }}
                    />
                    <span className="text-gray-600 dark:text-gray-400">
                      {opportunity.stage?.name || '-'}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="font-medium text-gray-900 dark:text-white">
                  {formatCurrency(opportunity.amount || 0)}
                </TableCell>
                <TableCell className="text-gray-600 dark:text-gray-400">
                  {opportunity.stage?.probability
                    ? `${(opportunity.stage.probability * 100).toFixed(0)}%`
                    : '-'}
                </TableCell>
                <TableCell className="text-gray-600 dark:text-gray-400">
                  {opportunity.expected_close_date
                    ? format(new Date(opportunity.expected_close_date), 'dd/MM/yyyy', { locale: es })
                    : '-'}
                </TableCell>
                <TableCell>{getStatusBadge(opportunity.status)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    >
                      <DropdownMenuLabel className="text-gray-700 dark:text-gray-300">
                        Acciones
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onView?.(opportunity.id);
                        }}
                        className="text-gray-700 dark:text-gray-300 cursor-pointer"
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Ver detalle
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit?.(opportunity.id);
                        }}
                        className="text-gray-700 dark:text-gray-300 cursor-pointer"
                      >
                        <Edit className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicate?.(opportunity.id);
                        }}
                        className="text-gray-700 dark:text-gray-300 cursor-pointer"
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicar
                      </DropdownMenuItem>
                      {opportunity.status === 'open' && (
                        <>
                          <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onMarkWon?.(opportunity.id);
                            }}
                            className="text-green-600 dark:text-green-400 cursor-pointer"
                          >
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Marcar ganada
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onMarkLost?.(opportunity.id);
                            }}
                            className="text-red-600 dark:text-red-400 cursor-pointer"
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Marcar perdida
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete?.(opportunity.id);
                        }}
                        className="text-red-600 dark:text-red-400 cursor-pointer"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
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
    </div>
  );
}
