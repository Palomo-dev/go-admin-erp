'use client';

import { useRouter } from 'next/navigation';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { 
  EyeIcon, 
  FileEdit, 
  Send, 
  Package,
  CheckCircle2,
  XCircle,
  RefreshCw,
  MoreVertical
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { OrdenCompra } from './types';
import { formatCurrency } from '@/utils/Utils';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

interface ListaOrdenesCompraProps {
  readonly ordenes: OrdenCompra[];
  readonly onRefresh: () => void;
}

export function ListaOrdenesCompra({ ordenes, onRefresh }: Readonly<ListaOrdenesCompraProps>) {
  const router = useRouter();
  
  const getBadgeStyle = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200';
      case 'sent':
        return 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200';
      case 'partial':
        return 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-200';
      case 'received':
        return 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-200';
      case 'closed':
        return 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200';
      case 'cancelled':
        return 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'Borrador';
      case 'sent': return 'Enviada';
      case 'partial': return 'Parcial';
      case 'received': return 'Recibida';
      case 'closed': return 'Cerrada';
      case 'cancelled': return 'Cancelada';
      default: return status;
    }
  };
  
  const handleVerDetalle = (id: number) => {
    router.push(`/app/inventario/ordenes-compra/${id}`);
  };
  
  const handleEditar = (id: number) => {
    router.push(`/app/inventario/ordenes-compra/${id}/editar`);
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">ID</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha Creación</TableHead>
                <TableHead>Fecha Esperada</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="w-[150px] text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                    No se encontraron órdenes de compra
                  </TableCell>
                </TableRow>
              )}
              
              {ordenes.map((orden) => (
                <TableRow key={orden.id} className="group">
                  <TableCell className="font-medium">#{orden.id}</TableCell>
                  <TableCell>
                    {(orden.supplier?.[0]?.name || orden.suppliers?.name || 'Sin proveedor')}
                  </TableCell>
                  <TableCell>
                    {(orden.branch?.[0]?.name || orden.branches?.name || '-')}
                  </TableCell>
                  <TableCell>
                    <Badge className={getBadgeStyle(orden.status)}>
                      {getStatusLabel(orden.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {format(new Date(orden.created_at), 'dd/MM/yyyy', { locale: es })}
                  </TableCell>
                  <TableCell>
                    {orden.expected_date 
                      ? format(new Date(orden.expected_date), 'dd/MM/yyyy', { locale: es })
                      : '-'}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(orden.total)}</TableCell>
                  <TableCell className="text-right">{orden.po_items_count || 0}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-1 opacity-70 group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleVerDetalle(orden.id)}
                        title="Ver detalle"
                      >
                        <EyeIcon className="h-4 w-4" />
                      </Button>

                      {orden.status === 'draft' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditar(orden.id)}
                          title="Editar orden"
                        >
                          <FileEdit className="h-4 w-4" />
                        </Button>
                      )}
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" title="Más opciones">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {orden.status === 'draft' && (
                            <DropdownMenuItem>
                              <Send className="h-4 w-4 mr-2" />
                              Enviar al proveedor
                            </DropdownMenuItem>
                          )}
                          
                          {(orden.status === 'sent' || orden.status === 'partial') && (
                            <DropdownMenuItem>
                              <Package className="h-4 w-4 mr-2" />
                              Registrar recepción
                            </DropdownMenuItem>
                          )}
                          
                          {(orden.status === 'sent' || orden.status === 'partial') && (
                            <DropdownMenuItem>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Marcar como completa
                            </DropdownMenuItem>
                          )}
                          
                          {(orden.status === 'draft' || orden.status === 'sent') && (
                            <DropdownMenuItem>
                              <XCircle className="h-4 w-4 mr-2" />
                              Cancelar orden
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      
      {ordenes.length > 0 && (
        <CardFooter className="flex justify-between p-4 border-t">
          <div className="text-sm text-muted-foreground">
            Mostrando {ordenes.length} órdenes
          </div>
          
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Actualizar
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
