'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import DetalleProducto from '@/components/inventario/productos/id/DetalleProducto';
import { useOrganization } from '@/lib/hooks/useOrganization';

/**
 * Página de detalle de producto
 * Muestra toda la información relacionada con un producto específico
 * y sus variantes en una sola vista organizada por pestañas
 */
export default function ProductoDetallePage() {
  const { id } = useParams();
  const [loading, setLoading] = useState<boolean>(true);
  const [producto, setProducto] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const { organization } = useOrganization();

  useEffect(() => {
    const fetchProducto = async () => {
      if (!id || !organization?.id) return;

      try {
        setLoading(true);
        const { data, error: fetchError } = await supabase
          .from('products')
          .select(`
            *,
            categories(*),
            suppliers(*),
            product_variants(*),
            product_images(*)
          `)
          .eq('id', id)
          .eq('organization_id', organization.id)
          .single();

        if (fetchError) throw new Error(fetchError.message);
        
        if (!data) {
          throw new Error('Producto no encontrado');
        }

        setProducto(data);
      } catch (error: any) {
        console.error('Error al cargar el producto:', error);
        setError(error.message || 'Error al cargar el producto');
      } finally {
        setLoading(false);
      }
    };

    fetchProducto();
  }, [id, organization]);

  // Mostrar estado de carga
  if (loading) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-lg">Cargando producto...</span>
      </div>
    );
  }

  // Mostrar error si hay alguno
  if (error) {
    return (
      <div className="flex h-[50vh] w-full flex-col items-center justify-center">
        <div className="rounded-lg bg-red-100 p-4 text-red-800 dark:bg-red-900/30 dark:text-red-400">
          <h3 className="text-lg font-semibold">Error</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // Mostrar página de detalle del producto
  return (
    <div className="container mx-auto py-6">
      {producto && <DetalleProducto producto={producto} />}
    </div>
  );
}
