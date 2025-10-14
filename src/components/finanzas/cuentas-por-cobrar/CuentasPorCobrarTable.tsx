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
          <Badge variant="default" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700">
            <CheckCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
            <span>Al día</span>
          </Badge>
        );
      case 'overdue':
        return (
          <Badge variant="destructive" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700">
            <AlertTriangle className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
            <span>Vencida ({daysOverdue}d)</span>
          </Badge>
        );
      case 'partial':
        return (
          <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700">
            <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
            <span>Parcial</span>
          </Badge>
        );
      case 'paid':
        return (
          <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700">
            <DollarSign className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
            <span>Pagada</span>
          </Badge>
        );
      default:
        return <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 dark:border-gray-600 dark:text-gray-400">{status}</Badge>;
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
      <Card className="dark:bg-gray-800/50 dark:border-gray-700">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg text-gray-900 dark:text-white">
            Cargando...
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/4 animate-pulse" />
                <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/4 animate-pulse" />
                <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/4 animate-pulse" />
                <div className="h-3 sm:h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/4 animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!resultado.data || resultado.data.length === 0) {
    return (
      <Card className="dark:bg-gray-800/50 dark:border-gray-700">
        <CardContent className="text-center py-6 sm:py-8 p-4 sm:p-6">
          <div className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
            No se encontraron cuentas por cobrar con los filtros aplicados
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="dark:bg-gray-800/50 dark:border-gray-700">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <CardTitle className="text-base sm:text-lg text-gray-900 dark:text-white">
              Cuentas por Cobrar ({resultado.total_count})
            </CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                Por página:
              </span>
              <Select 
                value={resultado.page_size.toString()} 
                onValueChange={(value) => onPageSizeChange(parseInt(value))}
              >
                <SelectTrigger className="w-16 sm:w-20 h-8 sm:h-9 text-xs sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectItem value="5" className="text-xs sm:text-sm dark:text-gray-300">5</SelectItem>
                  <SelectItem value="10" className="text-xs sm:text-sm dark:text-gray-300">10</SelectItem>
                  <SelectItem value="20" className="text-xs sm:text-sm dark:text-gray-300">20</SelectItem>
                  <SelectItem value="50" className="text-xs sm:text-sm dark:text-gray-300">50</SelectItem>
                  <SelectItem value="100" className="text-xs sm:text-sm dark:text-gray-300">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {/* Vista móvil - Cards */}
          <div className="sm:hidden space-y-3 p-4">
            {resultado.data.map((cuenta) => (
              <Card key={cuenta.id} className="dark:bg-gray-700/50 dark:border-gray-600 border-gray-200">
                <CardContent className="p-3">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-sm text-gray-900 dark:text-white">
                          {cuenta.customer_name}
                        </h3>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">
                          ID: {cuenta.id.slice(0, 8)}...
                        </p>
                      </div>
                      {getStatusBadge(cuenta.status, cuenta.days_overdue)}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Monto:</span>
                        <p className="font-medium text-gray-900 dark:text-white">{formatCurrency(cuenta.amount)}</p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Balance:</span>
                        <p className={cn(
                          "font-medium",
                          cuenta.balance > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                        )}>{formatCurrency(cuenta.balance)}</p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Vencimiento:</span>
                        <p className="font-medium text-gray-900 dark:text-white text-[10px]">
                          {new Date(cuenta.due_date).toLocaleDateString('es-ES')}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Aging:</span>
                        <p className={cn("font-medium text-[10px]", getAgingColor(cuenta.days_overdue))}>
                          {cuenta.days_overdue} días
                        </p>
                      </div>
                    </div>
                    
                    {(cuenta.customer_email || cuenta.customer_phone) && (
                      <div className="space-y-1 pt-2 border-t dark:border-gray-600">
                        {cuenta.customer_email && (
                          <div className="flex items-center text-[10px] text-gray-600 dark:text-gray-400">
                            <Mail className="h-2.5 w-2.5 mr-1" />
                            <span className="truncate">{cuenta.customer_email}</span>
                          </div>
                        )}
                        {cuenta.customer_phone && (
                          <div className="flex items-center text-[10px] text-gray-600 dark:text-gray-400">
                            <Phone className="h-2.5 w-2.5 mr-1" />
                            {cuenta.customer_phone}
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="flex gap-1.5 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAplicarAbono(cuenta)}
                        disabled={cuenta.balance <= 0}
                        className="flex-1 h-7 text-[10px] dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600"
                      >
                        <CreditCard className="h-2.5 w-2.5 mr-1" />
                        Abono
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEnviarRecordatorio(cuenta)}
                        disabled={cuenta.status !== 'overdue'}
                        className="flex-1 h-7 text-[10px] dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600"
                      >
                        <Mail className="h-2.5 w-2.5 mr-1" />
                        Recordar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleVerDetalles(cuenta)}
                        className="h-7 px-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600"
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          {/* Vista desktop - Tabla */}
          <div className="hidden sm:block rounded-md border dark:border-gray-700">
            <Table>
              <TableHeader>
                <TableRow className="dark:border-gray-700">
                  <TableHead className="text-xs dark:text-gray-300">Cliente</TableHead>
                  <TableHead className="text-xs dark:text-gray-300">Contacto</TableHead>
                  <TableHead className="text-xs dark:text-gray-300">Monto</TableHead>
                  <TableHead className="text-xs dark:text-gray-300">Balance</TableHead>
                  <TableHead className="text-xs dark:text-gray-300">Vencimiento</TableHead>
                  <TableHead className="text-xs dark:text-gray-300">Estado</TableHead>
                  <TableHead className="text-xs dark:text-gray-300">Aging</TableHead>
                  <TableHead className="text-xs dark:text-gray-300">Acciones</TableHead>
                </TableRow>
              </TableHeader>
                <TableBody>
                  {resultado.data.map((cuenta) => (
                    <TableRow key={cuenta.id} className="dark:border-gray-700 dark:hover:bg-gray-700/50">
                      <TableCell className="font-medium dark:text-white">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{cuenta.customer_name}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            ID: {cuenta.id.slice(0, 8)}...
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <div className="flex flex-col space-y-1">
                          {cuenta.customer_email && (
                            <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                              <Mail className="h-2.5 w-2.5 mr-1" />
                              <span className="truncate max-w-[150px]">{cuenta.customer_email}</span>
                            </div>
                          )}
                          {cuenta.customer_phone && (
                            <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                              <Phone className="h-2.5 w-2.5 mr-1" />
                              {cuenta.customer_phone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <span className="text-sm font-medium">
                          {formatCurrency(cuenta.amount)}
                        </span>
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <span className={cn(
                          "text-sm font-medium",
                          cuenta.balance > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                        )}>
                          {formatCurrency(cuenta.balance)}
                        </span>
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <div className="flex items-center text-xs">
                          <Calendar className="h-2.5 w-2.5 mr-1 dark:text-gray-400" />
                          {new Date(cuenta.due_date).toLocaleDateString('es-ES')}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(cuenta.status, cuenta.days_overdue)}
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "text-xs font-medium",
                          getAgingColor(cuenta.days_overdue)
                        )}>
                          {cuenta.days_overdue} días
                        </span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-7 w-7 p-0 dark:hover:bg-gray-600">
                              <MoreHorizontal className="h-3.5 w-3.5 dark:text-gray-300" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                            <DropdownMenuItem 
                              onClick={() => handleAplicarAbono(cuenta)}
                              disabled={cuenta.balance <= 0}
                              className="text-xs dark:text-gray-300 dark:hover:bg-gray-700"
                            >
                              <CreditCard className="h-3.5 w-3.5 mr-2" />
                              Aplicar Abono
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleEnviarRecordatorio(cuenta)}
                              disabled={cuenta.status !== 'overdue'}
                              className="text-xs dark:text-gray-300 dark:hover:bg-gray-700"
                            >
                              <Mail className="h-3.5 w-3.5 mr-2" />
                              Enviar Recordatorio
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleVerDetalles(cuenta)}
                              className="text-xs dark:text-gray-300 dark:hover:bg-gray-700"
                            >
                              <Eye className="h-3.5 w-3.5 mr-2" />
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mt-4 px-4 sm:px-0">
          <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
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
              
              {/* Páginas numeradas - Mostrar 3 en móvil, 5 en desktop */}
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
                
                // En móvil, mostrar solo 3 páginas (ocultar la 1ra y última si no están cerca)
                const isMobileHidden = i > 2 && resultado.total_pages > 3;
                
                return (
                  <PaginationItem key={pageNumber} className={isMobileHidden ? "hidden sm:block" : ""}>
                    <PaginationLink
                      isActive={pageNumber === resultado.page_number}
                      onClick={() => onPageChange(pageNumber)}
                      className="h-8 w-8 sm:h-9 sm:w-9 text-xs sm:text-sm"
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
