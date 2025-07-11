'use client';

import { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckIcon } from '@heroicons/react/24/outline';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import type { ProductoBajoUmbral } from './StockMinimoReporte';

interface NotificacionesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedProducts: ProductoBajoUmbral[];
}

/**
 * Modal para enviar notificaciones por email o push acerca de productos bajo stock
 */
export default function NotificacionesModal({
  open,
  onOpenChange,
  selectedProducts
}: NotificacionesModalProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string>(
    'Se requiere reabastecer los siguientes productos que están por debajo del nivel mínimo de stock.'
  );
  const [notificarPor, setNotificarPor] = useState({
    email: true,
    push: true
  });
  
  const organizationData = useOrganization();
  const orgId = organizationData?.organization?.id;

  // Enviar notificaciones
  const handleEnviarNotificaciones = async () => {
    if (!orgId) {
      setError('No se pudo identificar la organización');
      return;
    }
    
    if (!notificarPor.email && !notificarPor.push) {
      setError('Seleccione al menos un método de notificación');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Datos para la notificación
      const notificationData = {
        organization_id: orgId,
        title: 'Alerta de Stock Mínimo',
        message: mensaje,
        products: selectedProducts.map(p => ({
          id: p.product_id,
          name: p.name,
          sku: p.sku,
          stock_actual: p.qty_on_hand,
          stock_minimo: p.min_level,
          branch_id: p.branch_id,
          branch_name: p.branch_name
        })),
        notify_by_email: notificarPor.email,
        notify_by_push: notificarPor.push
      };
      
      // Enviar notificación a través de una función RPC
      const { error: notifyError } = await supabase.rpc(
        'send_stock_level_notifications',
        notificationData
      );
      
      if (notifyError) {
        console.error('Error al enviar notificaciones:', notifyError);
        setError('Ha ocurrido un error al enviar las notificaciones');
        return;
      }
      
      // Mostrar mensaje de éxito
      setSuccess(true);
      setTimeout(() => {
        onOpenChange(false);
        setSuccess(false);
      }, 2000);
      
    } catch (err: any) {
      console.error('Error inesperado:', err);
      setError(err.message || 'Ha ocurrido un error al enviar las notificaciones');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!loading) onOpenChange(isOpen);
    }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Enviar Notificaciones</DialogTitle>
          <DialogDescription>
            Envía notificaciones sobre productos con bajo stock
          </DialogDescription>
        </DialogHeader>
        
        {success ? (
          <div className="py-8">
            <div className="flex flex-col items-center justify-center">
              <div className="rounded-full bg-green-100 p-3 dark:bg-green-900">
                <CheckIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="mt-4 text-lg font-medium">¡Notificaciones enviadas!</h3>
              <p className="mt-2 text-center text-gray-500 dark:text-gray-400">
                Las notificaciones han sido enviadas correctamente.
              </p>
            </div>
          </div>
        ) : (
          <div className="py-4 space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {error}
                </AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Mensaje de la notificación
                </label>
                <Textarea 
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  placeholder="Ingrese el mensaje para la notificación"
                  className="min-h-[100px]"
                />
              </div>
              
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium">Notificar por email</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Enviar alerta por correo electrónico
                    </p>
                  </div>
                  <Switch 
                    checked={notificarPor.email}
                    onCheckedChange={(checked) => setNotificarPor(prev => ({...prev, email: checked}))}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium">Notificar por push</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Enviar notificación push a la aplicación
                    </p>
                  </div>
                  <Switch 
                    checked={notificarPor.push}
                    onCheckedChange={(checked) => setNotificarPor(prev => ({...prev, push: checked}))}
                  />
                </div>
              </div>
            </div>
            
            <div className="border rounded-md overflow-hidden max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[80px]">SKU</TableHead>
                    <TableHead className="min-w-[220px]">Producto</TableHead>
                    <TableHead>Sucursal</TableHead>
                    <TableHead className="text-right">Stock Actual</TableHead>
                    <TableHead className="text-right">Mínimo</TableHead>
                    <TableHead className="text-right">Diferencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedProducts.map((producto) => (
                    <TableRow key={producto.id}>
                      <TableCell className="font-mono text-sm">{producto.sku}</TableCell>
                      <TableCell className="font-medium">{producto.name}</TableCell>
                      <TableCell>{producto.branch_name}</TableCell>
                      <TableCell className="text-right">{producto.qty_on_hand}</TableCell>
                      <TableCell className="text-right">{producto.min_level}</TableCell>
                      <TableCell className="text-right">
                        {producto.diferencia.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button 
            onClick={handleEnviarNotificaciones} 
            disabled={loading || success}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? (
              <>
                <span className="animate-spin inline-block h-4 w-4 mr-2 border-t-2 border-b-2 border-white rounded-full"></span>
                Enviando...
              </>
            ) : (
              'Enviar Notificaciones'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
