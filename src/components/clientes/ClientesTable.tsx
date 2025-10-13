import React from 'react';
import { ChevronRight, ChevronLeft, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Customer {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  doc_type?: string;
  doc_number?: string;
  city?: string;
  roles?: string[];
  tags?: string[];
  is_active?: boolean;
  last_purchase_date?: string;
  balance?: number;
  days_overdue?: number;
  ar_status?: string | null;
  sales_count?: number;
  total_sales?: number;
}

interface ClientesTableProps {
  customers: Customer[];
  page: number;
  pageSize: number;
  count: number;
  onPageChange: (page: number) => void;
}

const ClientesTable: React.FC<ClientesTableProps> = ({
  customers,
  page,
  pageSize,
  count,
  onPageChange,
}) => {
  // Función para formatear fechas
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    
    try {
      return format(new Date(dateString), 'dd MMM yyyy', { locale: es });
    } catch (error) {
      return 'Fecha inválida';
    }
  };

  // Función para formatear moneda
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  };
  
  // Función para obtener clase de estado de cuenta por cobrar
  const getARStatusClass = (status: string | null | undefined, days: number | undefined) => {
    if (status === 'overdue' || (days && days > 30)) return 'text-red-600 dark:text-red-400';
    if (status === 'partial') return 'text-orange-600 dark:text-orange-400';
    if (status === 'pending' || (days && days > 0)) return 'text-amber-600 dark:text-amber-400';
    return 'text-green-600 dark:text-green-400';
  };
  
  // Función para mostrar etiqueta de estado
  const getARStatusLabel = (status: string | null | undefined, days: number | undefined) => {
    if (status === 'overdue' || (days && days > 30)) return 'Vencida';
    if (status === 'partial') return 'Pago parcial';
    if (status === 'pending' || (days && days > 0)) return 'Pendiente';
    return 'Al día';
  };

  // Calcular información de paginación
  const totalPages = Math.ceil(count / pageSize);
  const startItem = page * pageSize + 1;
  const endItem = Math.min((page + 1) * pageSize, count);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      {customers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            No se encontraron clientes con los filtros aplicados
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 text-left">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-3 sm:px-4 py-3 font-semibold text-gray-900 dark:text-gray-100 text-xs sm:text-sm">Cliente</th>
                  <th className="px-3 sm:px-4 py-3 font-semibold text-gray-900 dark:text-gray-100 text-xs sm:text-sm hidden sm:table-cell">Contacto</th>
                  <th className="px-3 sm:px-4 py-3 font-semibold text-gray-900 dark:text-gray-100 text-xs sm:text-sm hidden md:table-cell">Documento</th>
                  <th className="px-3 sm:px-4 py-3 font-semibold text-gray-900 dark:text-gray-100 text-xs sm:text-sm hidden xl:table-cell">Ciudad</th>
                  <th className="px-3 sm:px-4 py-3 font-semibold text-gray-900 dark:text-gray-100 text-xs sm:text-sm hidden lg:table-cell">Etiquetas</th>
                  <th className="px-3 sm:px-4 py-3 font-semibold text-gray-900 dark:text-gray-100 text-xs sm:text-sm">Cuentas por Cobrar</th>
                  <th className="px-3 sm:px-4 py-3 font-semibold text-gray-900 dark:text-gray-100 text-xs sm:text-sm hidden md:table-cell">Ventas</th>
                  <th className="px-3 sm:px-4 py-3 font-semibold text-gray-900 dark:text-gray-100 text-xs sm:text-sm hidden lg:table-cell">Última compra</th>
                  <th className="px-3 sm:px-4 py-3 font-semibold text-gray-900 dark:text-gray-100 text-xs sm:text-sm text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {customers.map((customer) => (
                  <tr 
                    key={customer.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-3 sm:px-4 py-3">
                      <div className="flex flex-col min-w-[120px] sm:min-w-0">
                        <span className="font-semibold text-gray-900 dark:text-gray-100 text-xs sm:text-sm">
                          {customer.full_name}
                        </span>
                        {/* Mostrar contacto en móvil */}
                        <div className="sm:hidden flex flex-col mt-1 text-xs text-gray-600 dark:text-gray-400">
                          {customer.email && <span className="truncate">{customer.email}</span>}
                          {customer.phone && <span>{customer.phone}</span>}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {customer.roles?.slice(0, 1).map(role => (
                            <Badge 
                              key={role} 
                              variant="secondary"
                              className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium"
                            >
                              {role}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-3 hidden sm:table-cell">
                      <div className="flex flex-col">
                        {customer.email && (
                          <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate max-w-[150px]">
                            {customer.email}
                          </span>
                        )}
                        {customer.phone && (
                          <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                            {customer.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-3 hidden md:table-cell">
                      {customer.doc_type && customer.doc_number ? (
                        <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                          {customer.doc_type}: {customer.doc_number}
                        </span>
                      ) : (
                        <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-500">
                          No registrado
                        </span>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 py-3 hidden xl:table-cell">
                      {customer.city ? (
                        <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                          {customer.city}
                        </span>
                      ) : (
                        <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-500">
                          --
                        </span>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 py-3 hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {customer.tags?.length ? (
                          customer.tags.slice(0, 2).map(tag => (
                            <Badge 
                              key={tag} 
                              variant="outline"
                              className="text-xs text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                            >
                              {tag}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-500">
                            --
                          </span>
                        )}
                        {customer.tags && customer.tags.length > 2 && (
                          <Badge 
                            variant="outline"
                            className="text-xs text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                          >
                            +{customer.tags.length - 2}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-3">
                      <div className="flex flex-col min-w-[100px]">
                        <span className={`text-xs sm:text-sm font-semibold ${getARStatusClass(customer.ar_status, customer.days_overdue)}`}>
                          {formatCurrency(Number(customer.balance || 0))}
                        </span>
                        {(customer.balance || 0) > 0 && (
                          <div className="flex items-center mt-1">
                            <Badge 
                              variant={customer.days_overdue && customer.days_overdue > 30 ? "destructive" : customer.days_overdue && customer.days_overdue > 0 ? "outline" : "secondary"}
                              className={`text-xs font-medium ${
                                customer.days_overdue && customer.days_overdue > 30 
                                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                  : customer.days_overdue && customer.days_overdue > 0 
                                  ? 'text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                              }`}
                            >
                              {getARStatusLabel(customer.ar_status, customer.days_overdue)}
                              {customer.days_overdue ? ` ${customer.days_overdue}d` : ''}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-3 hidden md:table-cell">
                      <div className="flex flex-col">
                        <span className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {formatCurrency(Number(customer.total_sales || 0))}
                        </span>
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {Number(customer.sales_count || 0)} {Number(customer.sales_count) === 1 ? 'compra' : 'compras'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                        {customer.last_purchase_date ? 
                          formatDate(customer.last_purchase_date) : 
                          'Sin compras'
                        }
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-9 w-9 sm:h-8 sm:w-8 p-0 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600"
                          >
                            <MoreHorizontal className="h-5 w-5 sm:h-4 sm:w-4" />
                            <span className="sr-only">Abrir menú</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 w-48">
                          <DropdownMenuLabel className="text-gray-900 dark:text-gray-100 font-semibold">Acciones</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => window.location.href = `/app/clientes/${customer.id}`} className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                            Ver detalles
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.location.href = `/app/clientes/${customer.id}/editar`} className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className={`hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${customer.is_active === false ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                            onClick={() => { /* Implementar cambio de estado */ }}
                          >
                            {customer.is_active === false ? 'Activar' : 'Desactivar'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Paginación */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-3 sm:px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
            <div className="text-center sm:text-left">
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                Mostrando <span className="font-semibold text-gray-900 dark:text-gray-100">{startItem}</span> a <span className="font-semibold text-gray-900 dark:text-gray-100">{endItem}</span> de{' '}
                <span className="font-semibold text-gray-900 dark:text-gray-100">{count}</span> clientes
              </p>
            </div>
            <div className="flex justify-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(page - 1)}
                disabled={page === 0}
                className="flex-1 sm:flex-none min-h-[40px] text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                <span className="sm:hidden">Anterior</span>
                <span className="sr-only sm:not-sr-only">Anterior</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages - 1}
                className="flex-1 sm:flex-none min-h-[40px] text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="sm:hidden">Siguiente</span>
                <span className="sr-only sm:not-sr-only">Siguiente</span>
                <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4 ml-1 sm:ml-0" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ClientesTable;
