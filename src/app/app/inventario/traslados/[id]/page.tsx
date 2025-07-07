'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Badge
} from "@/components/ui/badge";
import { Button } from '@/components/ui/button';
// Eliminamos la importación de Separator que no existe
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertCircle, ArrowLeft, Printer, CheckCircle, Truck } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface PageProps {
  params: {
    id: string
  }
}

export default function TransferDetailPage({ params }: PageProps) {
  // En lugar de usar directamente params.id, lo obtenemos del pathname en useEffect
  const router = useRouter();
  const [transferId, setTransferId] = useState<string>("");
  const { organization } = useOrganization();
  const [transfer, setTransfer] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    // Extraemos el ID del traslado de la URL actual
    const pathParts = window.location.pathname.split('/');
    const id = pathParts[pathParts.length - 1];
    setTransferId(id);
  }, []);
    
  useEffect(() => {
    // Solo procedemos si tenemos tanto el ID del traslado como el ID de la organización
    if (!transferId || !organization?.id) return;
      
    const fetchTransfer = async () => {
      if (!organization?.id) return;
      
      setLoading(true);
      setError(null);
      
      try {
        // Obtener los detalles del traslado
        const { data: transferData, error: transferError } = await supabase
          .from('inventory_transfers')
          .select(`
            *,
            origin_branch:origin_branch_id(id, name),
            dest_branch:dest_branch_id(id, name)
          `)
          .eq('id', transferId)
          .eq('organization_id', organization.id)
          .single();
          
        if (transferError) throw transferError;
        
        setTransfer(transferData);
        
        // Obtener los items del traslado
        const { data: itemsData, error: itemsError } = await supabase
          .from('transfer_items')
          .select(`
            *,
            product:product_id(id, name, sku)
          `)
          .eq('inventory_transfer_id', transferId)
          .order('id');
          
        if (itemsError) throw itemsError;
        
        setItems(itemsData || []);
      } catch (err: any) {
        console.error('Error al cargar traslado:', err);
        setError(err.message || 'Error al cargar los detalles del traslado');
      } finally {
        setLoading(false);
      }
    };
    
    fetchTransfer();
  }, [transferId, organization?.id]);
  
  const handlePrint = () => {
    if (transferId) {
      router.push(`/app/inventario/traslados/print/${transferId}`);
    }
  };
  
  const handleBack = () => {
    router.push('/app/inventario/traslados');
  };
  
  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "dd MMMM yyyy, HH:mm", { locale: es });
    } catch (e) {
      return dateStr;
    }
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200">Pendiente</Badge>;
      case 'in_transit':
        return <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">En tránsito</Badge>;
      case 'received':
        return <Badge variant="outline" className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">Recibido</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  const updateTransferStatus = async (newStatus: string) => {
    if (!transfer || updatingStatus) return;
    
    setUpdatingStatus(true);
    
    try {
      // Actualizar el estado del traslado
      const { error } = await supabase
        .from('inventory_transfers')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', transfer.id);
        
      if (error) throw error;
      
      // Actualizar el estado de todos los items
      const { error: itemsError } = await supabase
        .from('transfer_items')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('inventory_transfer_id', transfer.id);
        
      if (itemsError) throw itemsError;
      
      // Si el estado es "received", crear movimientos de entrada en la sucursal destino
      if (newStatus === 'received') {
        // Por cada producto, crear un movimiento de entrada
        for (const item of items) {
          // Crear el movimiento de entrada en el stock de la sucursal destino
          // Crear objeto base sin campos opcionales que podrían ser nulos
          const movementData = {
            organization_id: organization?.id,
            branch_id: transfer.dest_branch_id,
            product_id: item.product_id,
            direction: 'in',
            qty: item.quantity,
            source: 'transfer',
            source_id: transfer.id.toString(),
            note: `Recibido de traslado #${transfer.id} desde sucursal ${transfer.origin_branch.name}`,
            created_at: new Date().toISOString()
          };
          
          // Solo agregar lot_id si existe y no es nulo
          if (item.lot_id) {
            Object.assign(movementData, { lot_id: item.lot_id });
          }
          
          const { error: movementError } = await supabase
            .from('stock_movements')
            .insert(movementData);
            
          if (movementError) throw movementError;
          
          // Actualizar los niveles de stock en la sucursal destino
          // Buscar si existe un registro de stock para este producto en la sucursal destino
          // Consulta base sin filtro por lot_id
          let query = supabase
            .from('stock_levels')
            .select('*')
            .eq('branch_id', transfer.dest_branch_id)
            .eq('product_id', item.product_id);
          
          // Agregar filtro de lot_id según corresponda
          if (item.lot_id) {
            query = query.eq('lot_id', item.lot_id);
          } else {
            query = query.is('lot_id', null);
          }
          
          const { data: stockData, error: stockError } = await query.maybeSingle();
            
          if (stockError) throw stockError;
          
          if (stockData) {
            // Actualizar el registro existente
            const { error: updateError } = await supabase
              .from('stock_levels')
              .update({
                qty_on_hand: parseFloat(stockData.qty_on_hand || 0) + parseFloat(item.quantity),
                updated_at: new Date().toISOString()
              })
              .eq('id', stockData.id);
              
            if (updateError) throw updateError;
          } else {
            // Crear objeto base sin campos opcionales que podrían ser nulos
            const stockData = {
              branch_id: transfer.dest_branch_id,
              product_id: item.product_id,
              qty_on_hand: typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity,
              qty_reserved: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            
            // Solo agregar lot_id si existe
            if (item.lot_id) {
              Object.assign(stockData, { lot_id: item.lot_id });
            }
            
            // Crear un nuevo registro de stock
            const { error: insertError } = await supabase
              .from('stock_levels')
              .insert(stockData);
              
            if (insertError) throw insertError;
          }
        }
      }
      
      // Recargar los datos en lugar de intentar actualizar el objeto actual
      // Esto evita problemas de consistencia con el estado
      const { data: updatedTransfer, error: refreshError } = await supabase
        .from('inventory_transfers')
        .select(`
          *,
          origin_branch:origin_branch_id(id, name),
          dest_branch:dest_branch_id(id, name)
        `)
        .eq('id', transferId)
        .eq('organization_id', organization?.id)
        .single();
      
      if (!refreshError && updatedTransfer) {
        setTransfer(updatedTransfer);
        
        // Recargar también los items con su estado actualizado
        const { data: updatedItems } = await supabase
          .from('transfer_items')
          .select(`
            *,
            product:product_id(id, name, sku)
          `)
          .eq('inventory_transfer_id', transferId)
          .order('id');
        
        if (updatedItems) {
          setItems(updatedItems);
        }
      } else {
        // Si falla la recarga, al menos actualizamos el estado localmente
        setTransfer(prev => ({
          ...prev,
          status: newStatus,
          updated_at: new Date().toISOString()
        }));
      }
      
    } catch (err: any) {
      console.error('Error al actualizar estado:', err);
      setError(err.message || 'Error al actualizar el estado del traslado');
    } finally {
      setUpdatingStatus(false);
    }
  };
  
  const handleMarkInTransit = () => {
    updateTransferStatus('in_transit');
  };
  
  const handleMarkReceived = () => {
    updateTransferStatus('received');
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Cargando información del traslado...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="container mx-auto py-6">
        <Button onClick={handleBack} variant="outline" className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>
        
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  
  if (!transfer) {
    return (
      <div className="container mx-auto py-6">
        <Button onClick={handleBack} variant="outline" className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>
        
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Traslado no encontrado</AlertTitle>
          <AlertDescription>El traslado solicitado no existe o no tienes permiso para verlo.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <Button onClick={handleBack} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver
        </Button>
        
        <Button onClick={handlePrint} variant="outline">
          <Printer className="mr-2 h-4 w-4" />
          Imprimir Lista
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Detalles del Traslado #{transfer.id}</CardTitle>
            <CardDescription>Información general del traslado</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2">
              <div className="flex justify-between">
                <dt className="font-medium">Estado:</dt>
                <dd>{getStatusBadge(transfer.status)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="font-medium">Fecha Creación:</dt>
                <dd>{formatDate(transfer.created_at)}</dd>
              </div>
              {transfer.notes && (
                <div className="pt-2">
                  <dt className="font-medium">Notas:</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm">{transfer.notes}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Origen</CardTitle>
            <CardDescription>Sucursal que envía</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-medium text-lg">{transfer.origin_branch?.name || 'N/A'}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Destino</CardTitle>
            <CardDescription>Sucursal que recibe</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-medium text-lg">{transfer.dest_branch?.name || 'N/A'}</p>
          </CardContent>
        </Card>
      </div>
      
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Productos</CardTitle>
          <CardDescription>Lista de productos incluidos en este traslado</CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-center py-4 text-muted-foreground">No hay productos en este traslado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.product?.name || 'Producto desconocido'}</div>
                    </TableCell>
                    <TableCell>{item.product?.sku || 'N/A'}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{getStatusBadge(item.status || 'pending')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {transfer.status !== 'received' && (
        <div className="flex justify-end space-x-4">
          {transfer.status === 'pending' && (
            <Button 
              onClick={handleMarkInTransit}
              disabled={updatingStatus}
              className="flex items-center"
            >
              {updatingStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
              Marcar En Tránsito
            </Button>
          )}
          
          {(transfer.status === 'pending' || transfer.status === 'in_transit') && (
            <Button 
              onClick={handleMarkReceived}
              disabled={updatingStatus}
              variant={transfer.status === 'in_transit' ? 'default' : 'outline'}
              className="flex items-center"
            >
              {updatingStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
              Marcar como Recibido
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
