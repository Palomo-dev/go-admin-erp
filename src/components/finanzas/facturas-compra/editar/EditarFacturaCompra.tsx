'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';
import { FacturasCompraService } from '../FacturasCompraService';
import { InvoicePurchase } from '../types';
import { NuevaFacturaForm } from '../nueva-factura/NuevaFacturaForm';
import { toast } from '@/components/ui/use-toast';

interface EditarFacturaCompraProps {
  facturaId: string;
}

export function EditarFacturaCompra({ facturaId }: EditarFacturaCompraProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [factura, setFactura] = useState<InvoicePurchase | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Cargar datos de la factura al montar el componente
  useEffect(() => {
    cargarFactura();
  }, [facturaId]);

  const cargarFactura = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const facturaData = await FacturasCompraService.obtenerFacturaPorId(facturaId);
      
      if (!facturaData) {
        throw new Error('Factura no encontrada');
      }

      // Verificar que la factura esté en estado editable
      if (!['draft', 'pending'].includes(facturaData.status)) {
        setError(`No se puede editar una factura en estado "${facturaData.status}".`);
        return;
      }

      setFactura(facturaData);
    } catch (error: any) {
      console.error('Error cargando factura:', error);
      setError(error.message || 'Error al cargar la factura');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (datosFactura: any) => {
    if (!factura) return;

    try {
      setSaving(true);
      setError(null);
      
      // Actualizar la factura usando el servicio
      await FacturasCompraService.actualizarFactura(factura.id, datosFactura);
      
      toast({
        title: 'Factura actualizada',
        description: 'La factura de compra se ha actualizado correctamente.',
      });
      
      // Redirigir al detalle de la factura
      router.push(`/app/finanzas/facturas-compra/${factura.id}`);
      
    } catch (error: any) {
      console.error('Error actualizando factura:', error);
      setError(error.message || 'Error al actualizar la factura');
      
      toast({
        title: 'Error al actualizar',
        description: error.message || 'Error al actualizar la factura',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Estado de carga
  if (loading) {
    return (
      <div className="container mx-auto p-4 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Skeleton className="h-10 w-20" />
            <div>
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        {/* Form skeleton */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Estado de error
  if (error) {
    return (
      <div className="container mx-auto p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        
        <div className="mt-6 text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            {error.includes('No se puede editar') ? 
              'La factura no puede ser editada en su estado actual.' :
              'No se pudo cargar la información de la factura.'}
          </p>
          <div className="space-x-2">
            <button
              onClick={cargarFactura}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Intentar de nuevo
            </button>
            <button
              onClick={() => router.push('/app/finanzas/facturas-compra')}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Volver a lista
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Renderizar el formulario de edición reutilizando NuevaFacturaForm
  if (factura) {
    return (
      <NuevaFacturaForm
        facturaInicial={factura}
        onSubmit={handleSubmit}
        saving={saving}
        esEdicion={true}
      />
    );
  }

  return null;
}