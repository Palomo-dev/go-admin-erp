'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';
import { OrdenCompra, ItemOrdenCompra } from './types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AlertCircle,
  CalendarIcon, 
  MapPin, 
  Building, 
  FileEdit, 
  Send, 
  Package, 
  CheckCircle2, 
  XCircle,
  RefreshCw,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency } from '@/utils/Utils';

interface DetalleOrdenCompraProps {
  orden: OrdenCompra | null;
  items: ItemOrdenCompra[];
  onRefresh: () => void;
  error: string | null;
}

export function DetalleOrdenCompra({ orden, items, onRefresh, error }: DetalleOrdenCompraProps) {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
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
      case 'pending': return 'Pendiente'; // para items
      default: return status;
    }
  };
  
  const handleEditarOrden = () => {
    if (orden) {
      router.push(`/app/inventario/ordenes-compra/${orden.id}/editar`);
    }
  };
  
  const handleEnviarOrden = async () => {
    if (!orden) return;
    
    setActionError(null);
    setSuccessMessage(null);
    setIsLoading(true);
    
    try {
      // Aquí iría la lógica para enviar el email al proveedor
      // Por ahora solo cambiamos el estado a 'sent'
      const { error: updateError } = await supabase
        .from('purchase_orders')
        .update({
          status: 'sent',
          updated_at: new Date().toISOString()
        })
        .eq('id', orden.id);
        
      if (updateError) throw updateError;
      
      setSuccessMessage('La orden ha sido marcada como enviada al proveedor');
      
      // Refrescar los datos
      setTimeout(() => {
        onRefresh();
      }, 1500);
      
    } catch (err: Error | unknown) {
      console.error('Error al enviar la orden:', err);
      setActionError(err.message || 'Error al enviar la orden');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleCancelarOrden = async () => {
    if (!orden) return;
    
    if (!confirm('¿Está seguro de que desea cancelar esta orden de compra? Esta acción no se puede deshacer.')) {
      return;
    }
    
    setActionError(null);
    setSuccessMessage(null);
    setIsLoading(true);
    
    try {
      // Cambiar estado de la orden a 'cancelled'
      const { error: updateError } = await supabase
        .from('purchase_orders')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', orden.id);
        
      if (updateError) throw updateError;
      
      setSuccessMessage('La orden ha sido cancelada');
      
      // Refrescar los datos
      setTimeout(() => {
        onRefresh();
      }, 1500);
      
    } catch (err: Error | unknown) {
      console.error('Error al cancelar la orden:', err);
      setActionError(err.message || 'Error al cancelar la orden');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleCompletarOrden = async () => {
    if (!orden) return;
    
    setActionError(null);
    setSuccessMessage(null);
    setIsLoading(true);
    
    try {
      // Cambiar estado de la orden a 'received'
      const { error: updateOrderError } = await supabase
        .from('purchase_orders')
        .update({
          status: 'received',
          updated_at: new Date().toISOString()
        })
        .eq('id', orden.id);
        
      if (updateOrderError) throw updateOrderError;
      
      // Cambiar estado de todos los items a 'received'
      const { error: updateItemsError } = await supabase
        .from('po_items')
        .update({
          status: 'received'
          // Eliminamos el campo received_quantity que no existe en la tabla po_items
        })
        .eq('purchase_order_id', orden.id);
        
      if (updateItemsError) throw updateItemsError;
      
      setSuccessMessage('La orden ha sido marcada como recibida completamente');
      
      // Refrescar los datos
      setTimeout(() => {
        onRefresh();
      }, 1500);
      
    } catch (err: Error | unknown) {
      console.error('Error al completar la orden:', err);
      setActionError(err.message || 'Error al completar la orden');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleRegistrarEntrada = () => {
    if (orden) {
      // Redirigir a la página de entradas con el ID de la orden preseleccionado
      router.push(`/app/inventario/entradas/nueva?orden_id=${orden.id}`);
    }
  };
  
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  
  if (!orden) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>No se encontró la orden de compra solicitada</AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className="space-y-6">
      {actionError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}
      
      {successMessage && (
        <Alert variant="success" className="bg-green-50 dark:bg-green-900 border-green-500 text-green-700 dark:text-green-200">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Éxito</AlertTitle>
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}
      
      {/* Cabecera y acciones */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-2xl font-bold">
              Orden de Compra #{orden.id}
            </CardTitle>
            {/* Movemos el Badge fuera del CardDescription para evitar <div> dentro de <p> */}
            <div className="flex items-center mt-1">
              <Badge className={`mr-2 ${getBadgeStyle(orden.status)}`}>
                {getStatusLabel(orden.status)}
              </Badge>
              <CardDescription className="flex items-center m-0">
                <span>
                  Creada el {format(new Date(orden.created_at), "dd 'de' MMMM 'de' yyyy", { locale: es })}
                </span>
                {orden.expected_date && (
                  <span className="flex items-center ml-4">
                    <CalendarIcon className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                    Esperada: {format(new Date(orden.expected_date), "dd/MM/yyyy", { locale: es })}
                  </span>
                )}
              </CardDescription>
            </div>
          </div>
          
          <div className="flex space-x-2">
            {orden.status === 'draft' && (
              <>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleEditarOrden}
                  disabled={isLoading}
                >
                  <FileEdit className="h-4 w-4 mr-1" />
                  Editar
                </Button>
                
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={handleEnviarOrden}
                  disabled={isLoading}
                >
                  <Send className="h-4 w-4 mr-1" />
                  Enviar al Proveedor
                </Button>
              </>
            )}
            
            {(orden.status === 'sent' || orden.status === 'partial') && (
              <>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleRegistrarEntrada}
                  disabled={isLoading}
                >
                  <Package className="h-4 w-4 mr-1" />
                  Registrar Entrada
                </Button>
                
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={handleCompletarOrden}
                  disabled={isLoading}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Marcar como Completa
                </Button>
              </>
            )}
            
            {(orden.status === 'draft' || orden.status === 'sent') && (
              <Button 
                variant="destructive" 
                size="sm"
                onClick={handleCancelarOrden}
                disabled={isLoading}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Cancelar Orden
              </Button>
            )}
            
            <Button 
              variant="ghost" 
              size="icon"
              onClick={onRefresh}
              disabled={isLoading}
              title="Actualizar"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="pt-6">
          <Tabs defaultValue="detalles">
            <TabsList>
              <TabsTrigger value="detalles">Detalles</TabsTrigger>
              <TabsTrigger value="productos">Productos</TabsTrigger>
              {orden.notes && <TabsTrigger value="notas">Notas</TabsTrigger>}
            </TabsList>
            
            <TabsContent value="detalles" className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Información del proveedor */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Información del Proveedor</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-start">
                      <Building className="h-4 w-4 mr-2 mt-0.5 text-muted-foreground" />
                      <div>
                        <strong>{orden.suppliers?.name || 'Sin proveedor'}</strong>
                        {/* Eliminamos referencia a NIT que no existe */}
                      </div>
                    </div>
                    
                    {/* Eliminamos referencias a email y phone que no existen */}
                  </CardContent>
                </Card>
                
                {/* Información de entrega */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Información de Entrega</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-start">
                      <MapPin className="h-4 w-4 mr-2 mt-0.5 text-muted-foreground" />
                      <div>
                        <strong>Sucursal: {orden.branches?.name || 'No especificada'}</strong>
                      </div>
                    </div>
                    
                    {orden.expected_date && (
                      <div className="flex items-center">
                        <CalendarIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span>Fecha esperada: {format(new Date(orden.expected_date), "dd 'de' MMMM 'de' yyyy", { locale: es })}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Resumen de la orden */}
                <Card className="md:col-span-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Resumen de la Orden</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <div className="text-sm text-muted-foreground">Estado</div>
                        <Badge className={getBadgeStyle(orden.status)}>
                          {getStatusLabel(orden.status)}
                        </Badge>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="text-sm text-muted-foreground">Fecha de Creación</div>
                        <div className="font-medium">
                          {format(new Date(orden.created_at), "dd/MM/yyyy", { locale: es })}
                        </div>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="text-sm text-muted-foreground">Total de Productos</div>
                        <div className="font-medium">{items.length}</div>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="text-sm text-muted-foreground">Valor Total</div>
                        <div className="font-medium text-lg">{formatCurrency(orden.total)}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="productos" className="pt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Productos</CardTitle>
                  <CardDescription>
                    Listado de productos incluidos en la orden de compra
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Producto</TableHead>
                          <TableHead className="text-right">Cantidad</TableHead>
                          {/* Eliminamos columna Recibido porque received_quantity no existe */}
                          <TableHead className="text-right">Costo Unit.</TableHead>
                          <TableHead className="text-right">Subtotal</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Lote</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                              No hay productos en esta orden
                            </TableCell>
                          </TableRow>
                        )}
                        
                        {items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div className="font-medium">{item.products?.name || 'Producto desconocido'}</div>
                              <div className="text-xs text-muted-foreground">{item.products?.sku || 'Sin SKU'}</div>
                            </TableCell>
                            <TableCell className="text-right">{item.quantity}</TableCell>
                            {/* Eliminamos celda que mostraba received_quantity */}
                            <TableCell className="text-right">{formatCurrency(item.unit_cost)}</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(item.quantity * item.unit_cost)}
                            </TableCell>
                            <TableCell>
                              <Badge className={getBadgeStyle(item.status)}>
                                {getStatusLabel(item.status)}
                              </Badge>
                            </TableCell>
                            <TableCell>{item.lot_code || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between border-t p-4">
                  <div className="text-sm text-muted-foreground">
                    Total {items.length} productos
                  </div>
                  <div className="text-lg font-bold">
                    Total: {formatCurrency(orden.total)}
                  </div>
                </CardFooter>
              </Card>
            </TabsContent>
            
            {orden.notes && (
              <TabsContent value="notas" className="pt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Notas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 bg-muted rounded-md whitespace-pre-line">
                      {orden.notes}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>
      
      {/* Acciones adicionales */}
      <div className="flex justify-end">
        <Button 
          variant="outline" 
          size="sm"
          disabled={orden?.status === 'draft'}
          title={orden?.status === 'draft' ? 'La orden debe ser enviada primero' : 'Imprimir orden'}
        >
          <FileText className="h-4 w-4 mr-1" />
          Imprimir Orden
        </Button>
      </div>
    </div>
  );
}
