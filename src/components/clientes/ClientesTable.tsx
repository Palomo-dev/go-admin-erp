import React from 'react';
import { MoreHorizontal, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ClientesPagination } from './ClientesPagination';

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
  avatar_url?: string | null;
  first_name?: string;
  last_name?: string;
}

interface ClientesTableProps {
  customers: Customer[];
  page: number;
  pageSize: number;
  count: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  isLoading?: boolean;
}

const ClientesTable: React.FC<ClientesTableProps> = ({
  customers,
  page,
  pageSize,
  count,
  onPageChange,
  onPageSizeChange,
  selectedIds,
  onSelectionChange,
  isLoading = false,
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

  // Funciones de selección
  const isAllSelected = customers.length > 0 && customers.every(c => selectedIds.includes(c.id));
  const isSomeSelected = customers.some(c => selectedIds.includes(c.id)) && !isAllSelected;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = [...selectedIds, ...customers.map(c => c.id)];
      const newIds = allIds.filter((id, index) => allIds.indexOf(id) === index);
      onSelectionChange(newIds);
    } else {
      const customerIds = customers.map(c => c.id);
      onSelectionChange(selectedIds.filter(id => !customerIds.includes(id)));
    }
  };

  const handleSelectOne = (customerId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedIds, customerId]);
    } else {
      onSelectionChange(selectedIds.filter(id => id !== customerId));
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="mt-2 text-sm text-gray-600 dark:text-gray-400">Cargando clientes...</span>
      </div>
    );
  }

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
                  <th className="px-3 sm:px-4 py-3 w-12">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={handleSelectAll}
                      aria-label="Seleccionar todos"
                      className={isSomeSelected ? "data-[state=checked]:bg-blue-600" : ""}
                    />
                  </th>
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
                    className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${selectedIds.includes(customer.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                  >
                    <td className="px-3 sm:px-4 py-3">
                      <Checkbox
                        checked={selectedIds.includes(customer.id)}
                        onCheckedChange={(checked) => handleSelectOne(customer.id, !!checked)}
                        aria-label={`Seleccionar ${customer.full_name}`}
                      />
                    </td>
                    <td className="px-3 sm:px-4 py-3">
                      <div className="flex items-center gap-3 min-w-[120px] sm:min-w-0">
                        {/* Avatar del cliente */}
                        <div className="flex-shrink-0">
                          {customer.avatar_url ? (
                            <img
                              src={customer.avatar_url}
                              alt={customer.full_name}
                              className="h-10 w-10 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center border-2 border-blue-200 dark:border-blue-800">
                              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                                {customer.full_name?.charAt(0)?.toUpperCase() || '?'}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col">
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
          <ClientesPagination
            currentPage={page}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={count}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            showPageSizeSelector={!!onPageSizeChange}
          />
        </>
      )}
    </div>
  );
};

export default ClientesTable;
