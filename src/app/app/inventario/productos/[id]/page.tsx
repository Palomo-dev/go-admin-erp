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
        // Primero, intenta obtener el producto del sessionStorage para evitar consultas innecesarias
        const cachedProductData = sessionStorage.getItem(`product_${id}_data`);
        
        if (cachedProductData) {
          try {
            const parsedData = JSON.parse(cachedProductData);
            setProducto(parsedData);
            setLoading(false);
            console.log('Producto recuperado de sessionStorage:', parsedData);
            return;
          } catch (e) {
            console.log('Error parsing cached product data, fetching from database');
          }
        }
        
        // Si no hay datos en cache o hay un error, consulta la base de datos
        const { data, error: fetchError } = await supabase
          .from('products')
          .select(`
            *,
            categories(id, name),
            children:products(
              *,
              categories(id, name),
              product_prices(id, price, effective_from, effective_to),
              product_costs(id, cost, effective_from, effective_to),
              stock_levels(branch_id, qty_on_hand, qty_reserved, branches(id, name)),
              product_images(id, storage_path, is_primary)
            ),
            product_prices(id, price, effective_from, effective_to),
            product_costs(id, cost, effective_from, effective_to),
            stock_levels(branch_id, qty_on_hand, qty_reserved, branches(id, name)),
            product_images(id, storage_path, is_primary)
          `)
          .eq('id', id)
          .eq('organization_id', organization.id)
          .single();

        console.log('Data del producto:', data);  

        if (fetchError) throw new Error(fetchError.message);
        
        if (!data) {
          throw new Error('Producto no encontrado');
        }
        
        // Procesar y formatear los datos obtenidos - similar al catálogo
        // Calcular precio actual, costo actual y stock
        const currentPrice = data.product_prices && data.product_prices.length > 0
          ? data.product_prices
              .filter((p: any) => {
                // Filtrar por fechas vigentes o sin fecha de fin
                const now = new Date();
                const from = p.effective_from ? new Date(p.effective_from) : null;
                const to = p.effective_to ? new Date(p.effective_to) : null;
                
                return (!from || from <= now) && (!to || to >= now);
              })
              .sort((a: any, b: any) => {
                // Ordenar del más reciente al más antiguo
                return new Date(b.effective_from || 0).getTime() - new Date(a.effective_from || 0).getTime();
              })[0]?.price || 0
          : data.price || 0;
        
        const currentCost = data.product_costs && data.product_costs.length > 0
          ? data.product_costs
              .filter((c: any) => {
                // Filtrar por fechas vigentes o sin fecha de fin
                const now = new Date();
                const from = c.effective_from ? new Date(c.effective_from) : null;
                const to = c.effective_to ? new Date(c.effective_to) : null;
                
                return (!from || from <= now) && (!to || to >= now);
              })
              .sort((a: any, b: any) => {
                // Ordenar del más reciente al más antiguo
                return new Date(b.effective_from || 0).getTime() - new Date(a.effective_from || 0).getTime();
              })[0]?.cost || 0
          : data.cost || 0;
        
        // Calcular stock total
        const totalStock = data.stock_levels
          ? data.stock_levels.reduce((total: number, sl: any) => {
              return total + (sl.qty_on_hand || 0);
            }, 0)
          : 0;
        
        // Agregar los campos calculados al objeto producto
        const processedProduct = {
          ...data,
          price: currentPrice,
          cost: currentCost,
          stock: totalStock
        };

        setProducto(processedProduct);
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
