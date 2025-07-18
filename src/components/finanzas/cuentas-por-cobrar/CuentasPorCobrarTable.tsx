'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import { 
  MoreHorizontal, 
  Eye, 
  CreditCard, 
  Mail, 
  Phone, 
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CuentaPorCobrar, ResultadoPaginado } from './types';
import { formatCurrency, formatDate } from '@/utils/Utils';
import { AplicarAbonoModal } from './AplicarAbonoModal';
import { EnviarRecordatorioModal } from './EnviarRecordatorioModal';
import { cn } from '@/utils/Utils';

interface CuentasPorCobrarTableProps {
  resultado: ResultadoPaginado<CuentaPorCobrar>;
  isLoading?: boolean;
  onRefresh: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function CuentasPorCobrarTable({ resultado, isLoading, onRefresh, onPageChange, onPageSizeChange }: CuentasPorCobrarTableProps) {
  const router = useRouter();
  const [selectedAccount, setSelectedAccount] = useState<CuentaPorCobrar | null>(null);
  const [showAbonoModal, setShowAbonoModal] = useState(false);
  const [showRecordatorioModal, setShowRecordatorioModal] = useState(false);

  const getStatusBadge = (status: string, daysOverdue: number) => {
    switch (status) {
      case 'current':
        return (
          <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
            <CheckCircle className="h-3 w-3 mr-1" />
            Al día
          </Badge>
        );
      case 'overdue':
        return (
          <Badge variant="destructive" className="bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Vencida ({daysOverdue}d)
          </Badge>
        );
      case 'partial':
        return (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
            <Clock className="h-3 w-3 mr-1" />
            Parcial
          </Badge>
        );
      case 'paid':
        return (
          <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
            <DollarSign className="h-3 w-3 mr-1" />
            Pagada
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getAgingColor = (daysOverdue: number) => {
    if (daysOverdue <= 30) return 'text-green-600 dark:text-green-400';
    if (daysOverdue <= 60) return 'text-amber-600 dark:text-amber-400';
    if (daysOverdue <= 90) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  const handleAplicarAbono = (cuenta: CuentaPorCobrar) => {
    setSelectedAccount(cuenta);
    setShowAbonoModal(true);
  };

  const handleEnviarRecordatorio = (cuenta: CuentaPorCobrar) => {
    setSelectedAccount(cuenta);
    setShowRecordatorioModal(true);
  };

  const handleAbonoSuccess = () => {
    setShowAbonoModal(false);
    setSelectedAccount(null);
    onRefresh();
  };

  const handleRecordatorioSuccess = () => {
    setShowRecordatorioModal(false);
    setSelectedAccount(null);
    onRefresh();
  };

  const handleVerDetalles = (cuenta: CuentaPorCobrar) => {
    router.push(`/app/finanzas/cuentas-por-cobrar/${cuenta.id}`);
  };

  if (isLoading) {
    return (
      <Card className="dark:bg-gray-800/50 dark:border-gray-700 light:bg-white">
        <CardHeader>
          <CardTitle className="text-lg text-gray-900 dark:text-white">
            Cargando...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/4 animate-pulse" />
                <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/4 animate-pulse" />
                <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/4 animate-pulse" />
                <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/4 animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!resultado.data || resultado.data.length === 0) {
    return (
      <Card className="dark:bg-gray-800/50 dark:border-gray-700 light:bg-white">
        <CardContent className="text-center py-8">
          <div className="text-gray-500 dark:text-gray-400">
            No se encontraron cuentas por cobrar con los filtros aplicados
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="dark:bg-gray-800/50 dark:border-gray-700 light:bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg text-gray-900 dark:text-white">
              Cuentas por Cobrar ({resultado.total_count})
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Elementos por página:
              </span>
              <Select 
                value={resultado.page_size.toString()} 
                onValueChange={(value) => onPageSizeChange(parseInt(value))}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border dark:border-gray-700">
            <Table>
              <TableHeader>
                <TableRow className="dark:border-gray-700">
                  <TableHead className="dark:text-gray-300">Cliente</TableHead>
                  <TableHead className="dark:text-gray-300">Contacto</TableHead>
                  <TableHead className="dark:text-gray-300">Monto</TableHead>
                  <TableHead className="dark:text-gray-300">Balance</TableHead>
                  <TableHead className="dark:text-gray-300">Vencimiento</TableHead>
                  <TableHead className="dark:text-gray-300">Estado</TableHead>
                  <TableHead className="dark:text-gray-300">Aging</TableHead>
                  <TableHead className="dark:text-gray-300">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultado.data.map((cuenta) => (
                  <TableRow key={cuenta.id} className="dark:border-gray-700">
                    <TableCell className="font-medium dark:text-white">
                      <div className="flex flex-col">
                        <span className="font-medium">{cuenta.customer_name}</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          ID: {cuenta.id.slice(0, 8)}...
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="dark:text-gray-300">
                      <div className="flex flex-col space-y-1">
                        {cuenta.customer_email && (
                          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                            <Mail className="h-3 w-3 mr-1" />
                            {cuenta.customer_email}
                          </div>
                        )}
                        {cuenta.customer_phone && (
                          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                            <Phone className="h-3 w-3 mr-1" />
                            {cuenta.customer_phone}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="dark:text-gray-300">
                      <span className="font-medium">
                        {formatCurrency(cuenta.amount)}
                      </span>
                    </TableCell>
                    <TableCell className="dark:text-gray-300">
                      <span className={cn(
                        "font-medium",
                        cuenta.balance > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                      )}>
                        {formatCurrency(cuenta.balance)}
                      </span>
                    </TableCell>
                    <TableCell className="dark:text-gray-300">
                      <div className="flex items-center text-sm">
                        <Calendar className="h-3 w-3 mr-1" />
                        {new Date(cuenta.due_date).toLocaleDateString('es-ES')}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(cuenta.status, cuenta.days_overdue)}
                    </TableCell>
                    <TableCell>
                      <span className={cn(
                        "font-medium",
                        getAgingColor(cuenta.days_overdue)
                      )}>
                        {cuenta.days_overdue} días
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                          <DropdownMenuItem 
                            onClick={() => handleAplicarAbono(cuenta)}
                            disabled={cuenta.balance <= 0}
                          >
                            <CreditCard className="h-4 w-4 mr-2" />
                            Aplicar Abono
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleEnviarRecordatorio(cuenta)}
                            disabled={cuenta.status !== 'overdue'}
                          >
                            <Mail className="h-4 w-4 mr-2" />
                            Enviar Recordatorio
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleVerDetalles(cuenta)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Ver Detalles
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Paginación */}
      {resultado.total_pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Mostrando {((resultado.page_number - 1) * resultado.page_size) + 1} a{' '}
            {Math.min(resultado.page_number * resultado.page_size, resultado.total_count)} de{' '}
            {resultado.total_count} registros
          </div>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious 
                  disabled={resultado.page_number === 1}
                  onClick={() => resultado.page_number > 1 && onPageChange(resultado.page_number - 1)}
                />
              </PaginationItem>
              
              {/* Páginas numeradas */}
              {Array.from({ length: Math.min(5, resultado.total_pages) }, (_, i) => {
                let pageNumber;
                if (resultado.total_pages <= 5) {
                  pageNumber = i + 1;
                } else if (resultado.page_number <= 3) {
                  pageNumber = i + 1;
                } else if (resultado.page_number >= resultado.total_pages - 2) {
                  pageNumber = resultado.total_pages - 4 + i;
                } else {
                  pageNumber = resultado.page_number - 2 + i;
                }
                
                return (
                  <PaginationItem key={pageNumber}>
                    <PaginationLink
                      isActive={pageNumber === resultado.page_number}
                      onClick={() => onPageChange(pageNumber)}
                    >
                      {pageNumber}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              
              <PaginationItem>
                <PaginationNext 
                  disabled={resultado.page_number === resultado.total_pages}
                  onClick={() => resultado.page_number < resultado.total_pages && onPageChange(resultado.page_number + 1)}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* Modales */}
      {selectedAccount && (
        <>
          <AplicarAbonoModal
            open={showAbonoModal}
            onOpenChange={setShowAbonoModal}
            cuenta={selectedAccount}
            onSuccess={handleAbonoSuccess}
          />
          <EnviarRecordatorioModal
            open={showRecordatorioModal}
            onOpenChange={setShowRecordatorioModal}
            cuenta={selectedAccount}
            onSuccess={handleRecordatorioSuccess}
          />
        </>
      )}
    </>
  );
}
