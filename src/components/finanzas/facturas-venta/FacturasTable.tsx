'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MoreVertical, Eye, Printer, Mail, Send, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { formatCurrency } from '@/utils/Utils';
import DetalleFactura from './id/DetalleFactura';

// Función para formatear fechas sin usar Date (evita errores de tipo)
const formatearFecha = (fechaStr: string | null): string => {
  if (!fechaStr) return 'N/A';
  try {
    // Formatear directamente el string de fecha
    const partes = fechaStr.split('T')[0].split('-');
    if (partes.length !== 3) return fechaStr;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  } catch (e) {
    return fechaStr || 'N/A';
  }
};

// Tipo para las facturas
// Tipo para los filtros
export interface FiltrosFacturas {
  busqueda: string;
  estado: string;
  fechaInicio?: Date;
  fechaFin?: Date;
  montoMin?: number;
  montoMax?: number;
  customer_id?: string;
  payment_method?: string;
}

interface Factura {
  id: string; // UUID en Supabase
  number: string;
  customer_id: string; // UUID del cliente
  customer_name: string; // Campo calculado para mostrar
  sale_id?: string; // UUID opcional de la venta relacionada
  issue_date: string;
  due_date: string;
  subtotal?: number;
  tax_total?: number;
  total: number;
  balance: number;
  status: 'draft' | 'issued' | 'paid' | 'partial' | 'void' | 'overdue';
  currency: string;
  payment_method: string;
  payment_method_name: string; // Campo calculado para mostrar
  notes?: string;
  created_at?: string;
  tax_included?: boolean;
  payment_terms?: number;
}

interface FacturasTableProps {
  filtros?: FiltrosFacturas;
}

// Función para obtener el color del badge según el estado
const getStatusColor = (status: string) => {
  switch (status) {
    case 'draft': return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    case 'issued': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
    case 'void': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    case 'overdue': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    case 'paid': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    case 'partial': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
    default: return 'bg-gray-200 text-gray-800';
  }
};

// Función para obtener el texto en español según el estado
const getStatusText = (status: string) => {
  switch (status) {
    case 'draft': return 'Borrador';
    case 'issued': return 'Emitida';
    case 'void': return 'Anulada';
    case 'overdue': return 'Vencida';
    case 'paid': return 'Pagada';
    case 'partial': return 'Pago Parcial';
    default: return 'Desconocido';
  }
};

export function FacturasTable({ filtros }: FacturasTableProps = {}) {
  const router = useRouter();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [facturaSeleccionadaId, setFacturaSeleccionadaId] = useState<string | null>(null);
  const [mostrarDetalles, setMostrarDetalles] = useState(false);
  const { toast } = useToast();
  
  // Estado para la paginación
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const pageSizeOptions = [5, 10, 20, 50, 100];

  // Aplicar filtros a las facturas
  const facturasFiltradas = React.useMemo(() => {
    if (!filtros || !facturas.length) return facturas;
    
    return facturas.filter(factura => {
      // Filtro de búsqueda (número, cliente)
      if (filtros.busqueda && filtros.busqueda.trim() !== '') {
        const busquedaLower = filtros.busqueda.toLowerCase();
        const numberMatch = factura.number.toLowerCase().includes(busquedaLower);
        const clientMatch = factura.customer_name.toLowerCase().includes(busquedaLower);
        if (!numberMatch && !clientMatch) return false;
      }
      
      // Filtro de estado
      if (filtros.estado && filtros.estado !== 'todos' && filtros.estado !== factura.status) {
        return false;
      }
      
      // Filtro de fecha de emisión
      if (filtros.fechaInicio) {
        const fechaEmision = new Date(factura.issue_date);
        if (fechaEmision < filtros.fechaInicio) return false;
      }
      
      if (filtros.fechaFin) {
        const fechaEmision = new Date(factura.issue_date);
        if (fechaEmision > filtros.fechaFin) return false;
      }
      
      // Filtro de monto
      if (filtros.montoMin !== undefined && factura.total < filtros.montoMin) {
        return false;
      }
      
      if (filtros.montoMax !== undefined && factura.total > filtros.montoMax) {
        return false;
      }
      
      // Filtro de cliente
      if (filtros.customer_id && filtros.customer_id.trim() !== '') {
        const clienteLower = filtros.customer_id.toLowerCase();
        if (!factura.customer_name.toLowerCase().includes(clienteLower)) {
          return false;
        }
      }
      
      // Filtro de método de pago
      if (filtros.payment_method && filtros.payment_method !== 'todos' && filtros.payment_method !== factura.payment_method) {
        return false;
      }
      
      return true;
    });
  }, [facturas, filtros]);
  
  // Obtener el número total de páginas
  const totalItems = facturasFiltradas.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  
  // Obtener elementos de la página actual
  const getCurrentPageItems = () => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalItems);
    return facturasFiltradas.slice(startIndex, endIndex);
  };
  
  const facturasPaginadas = getCurrentPageItems();
  
  // Cambiar página
  const changePage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };
  
  // Generar array de páginas para mostrar
  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = 5;
    
    if (totalPages <= maxPagesToShow) {
      // Si hay pocas páginas, mostrarlas todas
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      // Siempre mostrar la primera página
      pageNumbers.push(1);
      
      // Calcular el rango de páginas cercanas a la actual
      let startPage = Math.max(2, currentPage - 1);
      let endPage = Math.min(totalPages - 1, currentPage + 1);
      
      // Si estamos en las primeras páginas
      if (currentPage <= 2) {
        endPage = Math.min(4, totalPages - 1);
      } 
      // Si estamos en las últimas páginas
      else if (currentPage >= totalPages - 1) {
        startPage = Math.max(2, totalPages - 3);
      }
      
      // Agregar elipsis después de la primera página si es necesario
      if (startPage > 2) {
        pageNumbers.push('ellipsis-start');
      } else if (startPage === 2) {
        pageNumbers.push(2);
      }
      
      // Agregar páginas centrales
      for (let i = startPage; i <= endPage; i++) {
        if (i !== 1 && i !== totalPages) {
          pageNumbers.push(i);
        }
      }
      
      // Agregar elipsis antes de la última página si es necesario
      if (endPage < totalPages - 1) {
        pageNumbers.push('ellipsis-end');
      } else if (endPage === totalPages - 1) {
        pageNumbers.push(totalPages - 1);
      }
      
      // Siempre mostrar la última página
      pageNumbers.push(totalPages);
    }
    
    return pageNumbers;
  };
  
  // Manejar cambio de tamaño de página
  const handlePageSizeChange = (value: string) => {
    const newSize = parseInt(value);
    setPageSize(newSize);
    setCurrentPage(1); // Volver a la primera página cuando cambia el tamaño
  };
  
  useEffect(() => {
    const cargarFacturas = async () => {
      try {
        const organizationId = getOrganizationId();
        
        if (!organizationId) {
          setError('No se pudo determinar la organización actual');
          setCargando(false);
          return;
        }

        // Consulta a Supabase para obtener las facturas
        const { data, error } = await supabase
          .from('invoice_sales')
          .select(`
            id,
            number,
            customer_id,
            sale_id,
            issue_date,
            due_date,
            subtotal,
            tax_total,
            total,
            balance,
            status,
            currency,
            payment_method,
            notes,
            created_at,
            tax_included,
            payment_terms
          `)
          .eq('organization_id', organizationId)
          .order('issue_date', { ascending: false });

        if (error) {
          throw error;
        }

        // Formatear los datos para la tabla
        const facturasFormateadas = data.map(item => ({
          id: item.id,
          number: item.number,
          customer_id: item.customer_id,
          customer_name: `Cliente #${item.customer_id}`, // Usamos ID como identificador temporal
          sale_id: item.sale_id,
          issue_date: item.issue_date,
          due_date: item.due_date,
          subtotal: item.subtotal,
          tax_total: item.tax_total,
          total: item.total,
          balance: item.balance,
          status: item.status,
          currency: item.currency || 'COP',
          payment_method: item.payment_method || 'cash',
          payment_method_name: 'Pendiente', // Se actualizará después
          notes: item.notes,
          created_at: item.created_at,
          tax_included: item.tax_included,
          payment_terms: item.payment_terms
        }));
        
        // Para cada factura, intentamos obtener el nombre del cliente y método de pago
        for (const factura of facturasFormateadas) {
          try {
            // Solo si tenemos un ID de cliente válido
            if (factura.customer_id) {
              const { data: clienteData } = await supabase
                .from('customers')
                .select('full_name, first_name, last_name')
                .eq('id', factura.customer_id)
                .maybeSingle();
              
              if (clienteData) {
                // Usamos el nombre completo si existe, o combinamos nombre y apellido
                factura.customer_name = clienteData.full_name || 
                  `${clienteData.first_name || ''} ${clienteData.last_name || ''}`.trim() || 
                  `Cliente #${factura.customer_id}`;
              }
            }
            
            // Obtenemos el nombre del método de pago
            if (factura.payment_method) {
              const { data: pagoData } = await supabase
                .from('payment_methods')
                .select('name')
                .eq('code', factura.payment_method)
                .maybeSingle();
              
              if (pagoData) {
                factura.payment_method_name = pagoData.name;
              } else {
                factura.payment_method_name = factura.payment_method; // Fallback al código si no encontramos el nombre
              }
            } else {
              factura.payment_method_name = 'No especificado';
            }
          } catch (err) {
            console.error(`Error al obtener datos relacionados a factura ${factura.id}:`, err);
          }
        }

        setFacturas(facturasFormateadas);
      } catch (err: any) {
        console.error('Error al cargar facturas:', err);
        setError('Error al cargar las facturas: ' + err.message);
        
        toast({
          title: 'Error',
          description: 'No se pudieron cargar las facturas',
          variant: 'destructive',
        });
      } finally {
        setCargando(false);
      }
    };

    cargarFacturas();
  }, [toast]);

  // Renderizado condicional para el estado de carga
  if (cargando) {
    return <TableSkeleton />;
  }

  // Renderizado condicional para el estado de error
  if (error) {
    return (
      <div className="text-center py-10">
        <AlertTriangle className="mx-auto h-10 w-10 text-yellow-500 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Error al cargar datos</h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{error}</p>
        <Button 
          variant="outline" 
          className="mt-4 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700"
          onClick={() => window.location.reload()}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  // Renderizado cuando no hay facturas
  if (facturas.length === 0) {
    return (
      <div className="text-center py-10">
        <FileText className="mx-auto h-10 w-10 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">No hay facturas</h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          No se encontraron facturas de venta para mostrar.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Mostrando {facturasPaginadas.length} de {facturasFiltradas.length} facturas
        </div>
        <div className="flex items-center space-x-2">
          <div className="text-sm text-gray-500 dark:text-gray-400">Mostrar</div>
          <Select
            value={pageSize.toString()}
            onValueChange={handlePageSizeChange}
          >
            <SelectTrigger className="h-8 w-20">
              <SelectValue placeholder="10" />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-sm text-gray-500 dark:text-gray-400">filas</div>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="dark:border-gray-700">
            <TableHead className="w-12 dark:text-gray-300">#</TableHead>
            <TableHead className="dark:text-gray-300">Número</TableHead>
            <TableHead className="dark:text-gray-300">Cliente</TableHead>
            <TableHead className="dark:text-gray-300">Emitida</TableHead>
            <TableHead className="dark:text-gray-300">Vencimiento</TableHead>
            <TableHead className="dark:text-gray-300">Total</TableHead>
            <TableHead className="dark:text-gray-300">Saldo</TableHead>
            <TableHead className="dark:text-gray-300">Método de pago</TableHead>
            <TableHead className="dark:text-gray-300">Estado</TableHead>
            <TableHead className="dark:text-gray-300">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {facturasPaginadas.map((factura, index) => (
            <TableRow 
              key={factura.id} 
              className="hover:bg-gray-50 dark:hover:bg-gray-800/50 dark:border-gray-700"
            >
              <TableCell className="text-center font-medium text-gray-500 dark:text-gray-400 w-12">
                {(currentPage - 1) * pageSize + index + 1}
              </TableCell>
              <TableCell className="font-medium dark:text-gray-200">
                {factura.number}
              </TableCell>
              <TableCell className="dark:text-gray-300">{factura.customer_name}</TableCell>
              <TableCell className="dark:text-gray-300">{formatearFecha(factura.issue_date)}</TableCell>
              <TableCell className="dark:text-gray-300">{formatearFecha(factura.due_date)}</TableCell>
              <TableCell className="dark:text-gray-300">
                {formatCurrency(factura.total, factura.currency)}
              </TableCell>
              <TableCell className="dark:text-gray-300">
                {formatCurrency(factura.balance, factura.currency)}
              </TableCell>
              <TableCell className="dark:text-gray-300">
                {factura.payment_method_name}
              </TableCell>
              <TableCell>
                <Badge className={getStatusColor(factura.status)}>
                  {getStatusText(factura.status)}
                </Badge>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="h-8 w-8 p-0 dark:hover:bg-gray-800"
                    >
                      <span className="sr-only">Abrir menú</span>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="dark:bg-gray-900 dark:border-gray-800">
                    <DropdownMenuItem
                      className="cursor-pointer dark:text-gray-300 dark:hover:bg-gray-800"
                      onClick={() => {
                        router.push(`/app/finanzas/facturas-venta/${factura.id}`);
                      }}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      <span>Ver</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="cursor-pointer dark:text-gray-300 dark:hover:bg-gray-800"
                      onClick={() => {
                        toast({
                          title: "Enviar factura",
                          description: `La factura ${factura.number} será enviada por email al cliente.`
                        });
                      }}
                    >
                      <Mail className="mr-2 h-4 w-4" />
                      <span>Enviar por email</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="cursor-pointer dark:text-gray-300 dark:hover:bg-gray-800"
                      onClick={() => {
                        toast({
                          title: "Enviar factura",
                          description: `La factura ${factura.number} será enviada por WhatsApp al cliente.`
                        });
                      }}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      <span>Enviar por WhatsApp</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Componente para el estado de carga
function TableSkeleton() {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="dark:border-gray-700">
            <TableHead className="dark:text-gray-300">Número</TableHead>
            <TableHead className="dark:text-gray-300">Cliente</TableHead>
            <TableHead className="dark:text-gray-300">Emitida</TableHead>
            <TableHead className="dark:text-gray-300">Vencimiento</TableHead>
            <TableHead className="dark:text-gray-300">Total</TableHead>
            <TableHead className="dark:text-gray-300">Saldo</TableHead>
            <TableHead className="dark:text-gray-300">Método de pago</TableHead>
            <TableHead className="dark:text-gray-300">Estado</TableHead>
            <TableHead className="dark:text-gray-300">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...Array(5)].map((_, index) => (
            <TableRow key={index} className="dark:border-gray-700">
              <TableCell><Skeleton className="h-4 w-20 dark:bg-gray-700" /></TableCell>
              <TableCell><Skeleton className="h-4 w-32 dark:bg-gray-700" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24 dark:bg-gray-700" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24 dark:bg-gray-700" /></TableCell>
              <TableCell><Skeleton className="h-4 w-20 dark:bg-gray-700" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24 dark:bg-gray-700" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24 dark:bg-gray-700" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24 dark:bg-gray-700" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24 dark:bg-gray-700" /></TableCell>
              <TableCell><Skeleton className="h-8 w-8 rounded-full dark:bg-gray-700" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Icono FileText para el estado vacío
function FileText(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}
