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
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { 
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  MoreHorizontal,
  Phone,
  Mail,
  Building2,
  FileText,
  Clock
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';

import { AccountPayable } from './types';
import { formatCurrency, formatDate } from '@/utils/Utils';

interface CuentasPorPagarTableProps {
  cuentas: AccountPayable[];
  loading: boolean;
  currentPage: number;
  totalPages: number;
  totalRecords: number;
  onPageChange: (page: number) => void;
  onProgramarPago: (cuenta: AccountPayable) => void;
  onRegistrarPago: (cuenta: AccountPayable) => void;
  onSeleccionarCuentas: (cuentasIds: string[]) => void;
  cuentasSeleccionadas: string[];
}

export function CuentasPorPagarTable({
  cuentas,
  loading,
  currentPage,
  totalPages,
  totalRecords,
  onPageChange,
  onProgramarPago,
  onRegistrarPago,
  onSeleccionarCuentas,
  cuentasSeleccionadas
}: CuentasPorPagarTableProps) {
  const { toast } = useToast();
  const router = useRouter();

  // Estado para selección
  const [selectAll, setSelectAll] = useState(false);

  // Funciones de utilidad
  const getStatusBadge = (status: string, daysOverdue?: number) => {
    const baseClasses = "text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5";
    if (daysOverdue && daysOverdue > 0) {
      return (
        <Badge variant="destructive" className={`${baseClasses} dark:bg-red-900/30 dark:text-red-400`}>
          <AlertCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
          <span>Vencida ({daysOverdue}d)</span>
        </Badge>
      );
    }

    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className={`${baseClasses} dark:bg-gray-700 dark:text-gray-300`}>Pendiente</Badge>;
      case 'partial':
        return <Badge variant="outline" className={`${baseClasses} border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-400`}>Parcial</Badge>;
      case 'paid':
        return <Badge variant="default" className={`${baseClasses} bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700`}>Pagada</Badge>;
      default:
        return <Badge variant="secondary" className={`${baseClasses} dark:bg-gray-700 dark:text-gray-300`}>{status}</Badge>;
    }
  };

  const getDueDateColor = (dueDate?: string, daysOverdue?: number) => {
    if (!dueDate) return 'text-gray-500 dark:text-gray-400';
    
    if (daysOverdue && daysOverdue > 0) {
      return 'text-red-600 dark:text-red-400';
    }

    const due = new Date(dueDate);
    const today = new Date();
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays <= 7) {
      return 'text-yellow-600 dark:text-yellow-400';
    }

    return 'text-gray-700 dark:text-gray-300';
  };

  // Handlers de selección
  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      onSeleccionarCuentas(cuentas.map(c => c.id));
    } else {
      onSeleccionarCuentas([]);
    }
  };

  const handleSelectCuenta = (cuentaId: string, checked: boolean) => {
    let nuevasSeleccionadas: string[];
    
    if (checked) {
      nuevasSeleccionadas = [...cuentasSeleccionadas, cuentaId];
    } else {
      nuevasSeleccionadas = cuentasSeleccionadas.filter(id => id !== cuentaId);
      setSelectAll(false);
    }
    
    onSeleccionarCuentas(nuevasSeleccionadas);
  };

  // Handler para copiar información
  const copiarInfoProveedor = (proveedor: any) => {
    const info = `${proveedor.name}\nNIT: ${proveedor.nit || 'N/A'}\nContacto: ${proveedor.contact || 'N/A'}\nTeléfono: ${proveedor.phone || 'N/A'}\nEmail: ${proveedor.email || 'N/A'}`;
    navigator.clipboard.writeText(info);
    toast({
      title: "Información copiada",
      description: "Los datos del proveedor se copiaron al portapapeles",
    });
  };

  // Handler para ver factura
  const verFactura = (invoiceId: string) => {
    router.push(`/app/finanzas/facturas-compra/${invoiceId}`);
  };

  // Componente de skeleton para loading
  const SkeletonRow = () => (
    <TableRow className="dark:border-gray-800">
      <TableCell><Skeleton className="h-3 w-3 sm:h-4 sm:w-4 dark:bg-gray-700" /></TableCell>
      <TableCell><Skeleton className="h-3 w-24 sm:h-4 sm:w-32 dark:bg-gray-700" /></TableCell>
      <TableCell className="hidden sm:table-cell"><Skeleton className="h-3 w-20 sm:h-4 sm:w-24 dark:bg-gray-700" /></TableCell>
      <TableCell className="hidden md:table-cell"><Skeleton className="h-3 w-16 sm:h-4 sm:w-20 dark:bg-gray-700" /></TableCell>
      <TableCell><Skeleton className="h-3 w-12 sm:h-4 sm:w-16 dark:bg-gray-700" /></TableCell>
      <TableCell className="hidden lg:table-cell"><Skeleton className="h-3 w-16 sm:h-4 sm:w-20 dark:bg-gray-700" /></TableCell>
      <TableCell><Skeleton className="h-3 w-12 sm:h-4 sm:w-16 dark:bg-gray-700" /></TableCell>
      <TableCell><Skeleton className="h-3 w-6 sm:h-4 sm:w-8 dark:bg-gray-700" /></TableCell>
    </TableRow>
  );

  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700 border-gray-200">
      <CardContent className="p-0">
        <div className="overflow-x-auto -mx-2 sm:mx-0">
          <Table>
            <TableHeader>
              <TableRow className="dark:border-gray-800 border-b border-gray-200">
                <TableHead className="w-8 sm:w-12">
                  <Checkbox
                    checked={selectAll}
                    onCheckedChange={handleSelectAll}
                    className="dark:border-gray-600"
                  />
                </TableHead>
                <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">Proveedor</TableHead>
                <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden sm:table-cell">Factura</TableHead>
                <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 hidden md:table-cell">Fecha Venc.</TableHead>
                <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 text-right">Monto</TableHead>
                <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 text-right hidden lg:table-cell">Saldo</TableHead>
                <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">Estado</TableHead>
                <TableHead className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 w-12 sm:w-16">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                // Skeleton loading
                Array.from({ length: 5 }).map((_, index) => (
                  <SkeletonRow key={index} />
                ))
              ) : cuentas.length === 0 ? (
                // Estado vacío
                <TableRow className="dark:border-gray-800">
                  <TableCell colSpan={8} className="text-center py-6 sm:py-8">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400 dark:text-gray-600" />
                      <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">
                        No hay cuentas por pagar
                      </p>
                      <p className="text-xs sm:text-sm text-gray-400 dark:text-gray-500">
                        Los pagos pendientes aparecerán aquí
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                // Datos
                cuentas.map((cuenta) => (
                  <TableRow key={cuenta.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 dark:border-gray-800 border-b border-gray-100">
                    <TableCell className="py-2 sm:py-3">
                      <Checkbox
                        checked={cuentasSeleccionadas.includes(cuenta.id)}
                        onCheckedChange={(checked) => 
                          handleSelectCuenta(cuenta.id, checked as boolean)
                        }
                        className="dark:border-gray-600"
                      />
                    </TableCell>
                    
                    <TableCell className="py-2 sm:py-3">
                      <div className="flex items-start gap-2 sm:gap-3">
                        <div className="flex-1 min-w-0">
                          <button
                            onClick={() => router.push(`/app/finanzas/cuentas-por-pagar/${cuenta.id}`)}
                            className="text-sm sm:text-base font-medium text-blue-600 dark:text-blue-400 hover:underline truncate cursor-pointer text-left"
                          >
                            {cuenta.supplier?.name || 'Sin nombre'}
                          </button>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                            {cuenta.supplier?.nit && (
                              <span>NIT: {cuenta.supplier.nit}</span>
                            )}
                            {cuenta.supplier?.contact && (
                              <span className="hidden sm:inline">{cuenta.supplier.contact}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {cuenta.supplier?.phone && (
                              <a
                                href={`tel:${cuenta.supplier.phone}`}
                                className="inline-flex items-center text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                              >
                                <Phone className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
                                <span>{cuenta.supplier.phone}</span>
                              </a>
                            )}
                            {cuenta.supplier?.email && (
                              <a
                                href={`mailto:${cuenta.supplier.email}`}
                                className="inline-flex items-center text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 truncate max-w-[120px]"
                              >
                                <Mail className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1 flex-shrink-0" />
                                <span className="truncate">{cuenta.supplier.email}</span>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="py-2 sm:py-3 hidden sm:table-cell">
                      <div className="flex flex-col">
                        {cuenta.invoice_purchase?.number_ext ? (
                          <>
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {cuenta.invoice_purchase.number_ext}
                            </span>
                            <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                              {cuenta.invoice_purchase.issue_date && 
                                formatDate(cuenta.invoice_purchase.issue_date)
                              }
                            </span>
                          </>
                        ) : (
                          <span className="text-xs sm:text-sm text-gray-400 dark:text-gray-500">Sin factura</span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="py-2 sm:py-3 hidden md:table-cell">
                      <div className={`flex items-center gap-1 text-xs sm:text-sm ${getDueDateColor(cuenta.due_date, cuenta.days_overdue)}`}>
                        <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span>
                          {cuenta.due_date ? formatDate(cuenta.due_date) : 'Sin fecha'}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="py-2 sm:py-3">
                      <div className="text-right">
                        <div className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
                          {formatCurrency(cuenta.amount)}
                        </div>
                        <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                          {cuenta.invoice_purchase?.currency || 'COP'}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="py-2 sm:py-3 hidden lg:table-cell">
                      <div className="text-right">
                        <div className="text-sm sm:text-base font-semibold text-blue-600 dark:text-blue-400">
                          {formatCurrency(cuenta.balance)}
                        </div>
                        {cuenta.balance !== cuenta.amount && (
                          <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                            Pagado: {formatCurrency(cuenta.amount - cuenta.balance)}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="py-2 sm:py-3">
                      {getStatusBadge(cuenta.status, cuenta.days_overdue)}
                    </TableCell>

                    <TableCell className="py-2 sm:py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 sm:h-8 sm:w-8 p-0 dark:hover:bg-gray-700 dark:text-gray-300">
                            <MoreHorizontal className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 sm:w-56 dark:bg-gray-800 dark:border-gray-700">
                          <DropdownMenuItem onClick={() => router.push(`/app/finanzas/cuentas-por-pagar/${cuenta.id}`)} className="text-xs sm:text-sm dark:text-gray-300 dark:hover:bg-gray-700">
                            <Eye className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            <span>Ver Detalle</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="dark:bg-gray-700" />
                          <DropdownMenuItem onClick={() => onRegistrarPago(cuenta)} className="text-xs sm:text-sm dark:text-gray-300 dark:hover:bg-gray-700">
                            <CreditCard className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            <span>Registrar Pago</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onProgramarPago(cuenta)} className="text-xs sm:text-sm dark:text-gray-300 dark:hover:bg-gray-700">
                            <Clock className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            <span>Programar Pago</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="dark:bg-gray-700" />
                          <DropdownMenuItem onClick={() => copiarInfoProveedor(cuenta.supplier)} className="text-xs sm:text-sm dark:text-gray-300 dark:hover:bg-gray-700">
                            <Building2 className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            <span>Copiar Info</span>
                          </DropdownMenuItem>
                          {cuenta.invoice_purchase && (
                            <DropdownMenuItem onClick={() => verFactura(cuenta.invoice_purchase?.id || '')} className="text-xs sm:text-sm dark:text-gray-300 dark:hover:bg-gray-700">
                              <FileText className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                              <span>Ver Factura</span>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 px-3 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
              Mostrando {((currentPage - 1) * 10) + 1} a {Math.min(currentPage * 10, totalRecords)} de {totalRecords}
            </div>
            
            <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-1" />
                <span className="hidden sm:inline">Anterior</span>
              </Button>
              
              <div className="flex items-center gap-1 flex-1 sm:flex-none justify-center">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const page = i + 1;
                  return (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => onPageChange(page)}
                      className={`w-7 h-7 sm:w-8 sm:h-8 p-0 text-xs sm:text-sm ${
                        currentPage === page 
                          ? 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white' 
                          : 'dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700'
                      }`}
                    >
                      {page}
                    </Button>
                  );
                })}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="h-8 sm:h-9 px-2 sm:px-3 text-xs sm:text-sm dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <span className="hidden sm:inline">Siguiente</span>
                <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:ml-1" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
