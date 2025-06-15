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

  // Calcular información de paginación
  const totalPages = Math.ceil(count / pageSize);
  const startItem = page * pageSize + 1;
  const endItem = Math.min((page + 1) * pageSize, count);

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700">
      {customers.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500 dark:text-gray-400">
            No se encontraron clientes con los filtros aplicados
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Cliente</th>
                  <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Contacto</th>
                  <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300 hidden md:table-cell">Documento</th>
                  <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300 hidden lg:table-cell">Ciudad</th>
                  <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300 hidden md:table-cell">Etiquetas</th>
                  <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Saldo CxC</th>
                  <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300 hidden lg:table-cell">Última compra</th>
                  <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {customers.map((customer) => (
                  <tr 
                    key={customer.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {customer.full_name}
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {customer.roles?.map(role => (
                            <Badge 
                              key={role} 
                              variant="secondary"
                              className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                            >
                              {role}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        {customer.email && (
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {customer.email}
                          </span>
                        )}
                        {customer.phone && (
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {customer.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {customer.doc_type && customer.doc_number ? (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {customer.doc_type}: {customer.doc_number}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400 dark:text-gray-500">
                          No registrado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {customer.city ? (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {customer.city}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400 dark:text-gray-500">
                          --
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {customer.tags?.length ? (
                          customer.tags.slice(0, 2).map(tag => (
                            <Badge 
                              key={tag} 
                              variant="outline"
                              className="text-xs"
                            >
                              {tag}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-gray-500">
                            --
                          </span>
                        )}
                        {customer.tags && customer.tags.length > 2 && (
                          <Badge 
                            variant="outline"
                            className="text-xs"
                          >
                            +{customer.tags.length - 2}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm ${(customer.balance || 0) > 0 ? 'text-red-600 font-medium dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        {formatCurrency(customer.balance || 0)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {customer.last_purchase_date ? 
                          formatDate(customer.last_purchase_date) : 
                          'Sin compras'
                        }
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Abrir menú</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => window.location.href = `/app/clientes/${customer.id}`}>
                            Ver detalles
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.location.href = `/app/clientes/${customer.id}/editar`}>
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className={`${customer.is_active === false ? 'text-green-600' : 'text-red-600'}`}
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <div className="hidden sm:block">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Mostrando <span className="font-medium">{startItem}</span> a <span className="font-medium">{endItem}</span> de{' '}
                <span className="font-medium">{count}</span> clientes
              </p>
            </div>
            <div className="flex justify-between sm:justify-end space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(page - 1)}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only">Anterior</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages - 1}
              >
                <ChevronRight className="h-4 w-4" />
                <span className="sr-only">Siguiente</span>
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ClientesTable;
