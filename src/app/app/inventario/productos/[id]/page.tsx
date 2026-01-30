'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Package, AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/config';
import DetalleProducto from '@/components/inventario/productos/id/DetalleProducto';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Button } from '@/components/ui/button';

/**
 * Página de detalle de producto
 * Muestra toda la información relacionada con un producto específico
 * y sus variantes en una sola vista organizada por pestañas
 */
export default function ProductoDetallePage() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState<boolean>(true);
  const [producto, setProducto] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const { organization, isLoading: orgLoading } = useOrganization();

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
        // Buscar por UUID (el id de la URL ahora es UUID)
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
          .eq('uuid', id)
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
  if (loading || orgLoading) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-full">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-center">
            <p className="text-lg font-medium text-gray-900 dark:text-white">Cargando producto...</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Por favor espera un momento</p>
          </div>
        </div>
      </div>
    );
  }

  // Mostrar error si hay alguno
  if (error) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div className="flex flex-col items-center justify-center h-[60vh] gap-6">
          <div className="p-4 bg-red-100 dark:bg-red-900/30 rounded-full">
            <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <div className="text-center max-w-md">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Error al cargar el producto
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
            <div className="flex gap-3 justify-center">
              <Link href="/app/inventario/productos">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Volver a productos
                </Button>
              </Link>
              <Button onClick={() => window.location.reload()} className="bg-blue-600 hover:bg-blue-700 text-white">
                Reintentar
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Mostrar página de detalle del producto
  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {producto && <DetalleProducto producto={producto} />}
    </div>
  );
}
