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
    if (daysOverdue && daysOverdue > 0) {
      return (
        <Badge variant="destructive">
          <AlertCircle className="w-3 h-3 mr-1" />
          Vencida ({daysOverdue}d)
        </Badge>
      );
    }

    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pendiente</Badge>;
      case 'partial':
        return <Badge variant="outline">Parcial</Badge>;
      case 'paid':
        return <Badge variant="default">Pagada</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
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
    <TableRow>
      <TableCell><Skeleton className="h-4 w-4" /></TableCell>
      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell><Skeleton className="h-4 w-8" /></TableCell>
    </TableRow>
  );

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectAll}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Factura</TableHead>
                <TableHead>Fecha Venc.</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-16">Acciones</TableHead>
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
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="w-8 h-8 text-gray-400" />
                      <p className="text-gray-500 dark:text-gray-400">
                        No hay cuentas por pagar
                      </p>
                      <p className="text-sm text-gray-400">
                        Los pagos pendientes aparecerán aquí
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                // Datos
                cuentas.map((cuenta) => (
                  <TableRow key={cuenta.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <TableCell>
                      <Checkbox
                        checked={cuentasSeleccionadas.includes(cuenta.id)}
                        onCheckedChange={(checked) => 
                          handleSelectCuenta(cuenta.id, checked as boolean)
                        }
                      />
                    </TableCell>
                    
                    <TableCell>
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {cuenta.supplier?.name || 'Sin nombre'}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                            {cuenta.supplier?.nit && (
                              <span>NIT: {cuenta.supplier.nit}</span>
                            )}
                            {cuenta.supplier?.contact && (
                              <span>{cuenta.supplier.contact}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {cuenta.supplier?.phone && (
                              <a
                                href={`tel:${cuenta.supplier.phone}`}
                                className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800"
                              >
                                <Phone className="w-3 h-3 mr-1" />
                                {cuenta.supplier.phone}
                              </a>
                            )}
                            {cuenta.supplier?.email && (
                              <a
                                href={`mailto:${cuenta.supplier.email}`}
                                className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800"
                              >
                                <Mail className="w-3 h-3 mr-1" />
                                {cuenta.supplier.email}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col">
                        {cuenta.invoice_purchase?.number_ext ? (
                          <>
                            <span className="font-medium">
                              {cuenta.invoice_purchase.number_ext}
                            </span>
                            <span className="text-xs text-gray-500">
                              {cuenta.invoice_purchase.issue_date && 
                                formatDate(cuenta.invoice_purchase.issue_date)
                              }
                            </span>
                          </>
                        ) : (
                          <span className="text-gray-400">Sin factura</span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className={`flex items-center gap-1 ${getDueDateColor(cuenta.due_date, cuenta.days_overdue)}`}>
                        <Calendar className="w-4 h-4" />
                        <span>
                          {cuenta.due_date ? formatDate(cuenta.due_date) : 'Sin fecha'}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="text-right">
                        <div className="font-medium">
                          {formatCurrency(cuenta.amount)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {cuenta.invoice_purchase?.currency || 'COP'}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="text-right">
                        <div className="font-semibold text-blue-600 dark:text-blue-400">
                          {formatCurrency(cuenta.balance)}
                        </div>
                        {cuenta.balance !== cuenta.amount && (
                          <div className="text-xs text-gray-500">
                            Pagado: {formatCurrency(cuenta.amount - cuenta.balance)}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      {getStatusBadge(cuenta.status, cuenta.days_overdue)}
                    </TableCell>

                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem onClick={() => onRegistrarPago(cuenta)}>
                            <CreditCard className="mr-2 h-4 w-4" />
                            Registrar Pago
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onProgramarPago(cuenta)}>
                            <Clock className="mr-2 h-4 w-4" />
                            Programar Pago
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => copiarInfoProveedor(cuenta.supplier)}>
                            <Building2 className="mr-2 h-4 w-4" />
                            Copiar Info Proveedor
                          </DropdownMenuItem>
                          {cuenta.invoice_purchase && (
                            <DropdownMenuItem onClick={() => verFactura(cuenta.invoice_purchase?.id || '')}>
                              <Eye className="mr-2 h-4 w-4" />
                              Ver Factura
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
          <div className="flex items-center justify-between px-6 py-4 border-t">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              Mostrando {((currentPage - 1) * 10) + 1} a {Math.min(currentPage * 10, totalRecords)} de {totalRecords} registros
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const page = i + 1;
                  return (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => onPageChange(page)}
                      className="w-8 h-8 p-0"
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
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
