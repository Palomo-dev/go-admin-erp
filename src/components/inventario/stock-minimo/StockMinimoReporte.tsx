'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { 
  StockMinimoHeader,
  ProductosBajoUmbralTable,
  ConfiguracionUmbralModal,
  OrdenesCompraModal,
  NotificacionesModal
} from './';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';





// Interfaz para los productos bajo umbral
export interface ProductoBajoUmbral {
  id: number;
  product_id: number;
  sku: string;
  name: string;
  branch_id: number;
  branch_name: string;
  qty_on_hand: number;
  min_level: number;
  diferencia: number;
  supplier_id?: number;
  supplier_name?: string;
  last_cost?: number;
}

/**
 * Componente principal para la página de stock mínimo
 * Gestiona la carga de productos bajo umbral y muestra las diferentes opciones disponibles
 */
export default function StockMinimoReporte() {
  const [productos, setProductos] = useState<ProductoBajoUmbral[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('todos');
  
  // Modals
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [showOrdenesModal, setShowOrdenesModal] = useState<boolean>(false);
  const [showNotificacionesModal, setShowNotificacionesModal] = useState<boolean>(false);
  
  // Selected products
  const [selectedProducts, setSelectedProducts] = useState<ProductoBajoUmbral[]>([]);
  
  const organizationData = useOrganization();
  const orgId = organizationData?.organization?.id;

  // Cargar productos bajo umbral
  useEffect(() => {
    async function fetchProductosBajoUmbral() {
      if (!orgId) return;
      
      try {
        setLoading(true);
        setError(null);
        
        // Consulta para obtener productos con umbral definido
        const { data, error } = await supabase
          .from('stock_levels')
          .select(`
            id,
            product_id,
            branch_id,
            qty_on_hand,
            min_level,
            products (
              id,
              sku,
              name,
              organization_id
            ),
            branches (
              id,
              name
            )
          `)
          .eq('products.organization_id', orgId)
          .gt('min_level', 0);
        
        if (error) {
          console.error('Error al cargar productos bajo umbral:', error);
          setError('Error al cargar productos bajo umbral. Por favor intente nuevamente.');
        } else {
          // Filtrar y formatear datos (solo productos bajo umbral)
          const formattedData = (data || [])
            .filter((item: unknown) => {
              const stockItem = item as { qty_on_hand: number; min_level: number };
              const qtyOnHand = Number(stockItem.qty_on_hand) || 0;
              const minLevel = Number(stockItem.min_level) || 0;
              return qtyOnHand < minLevel; // Filtrar productos bajo umbral
            })
            .map((item: unknown) => {
              const stockItem = item as {
                id: number;
                product_id: number;
                branch_id: number;
                qty_on_hand: number;
                min_level: number;
                products?: { sku?: string; name?: string };
                branches?: { name?: string };
              };
              return {
                id: stockItem.id,
                product_id: stockItem.product_id,
                sku: stockItem.products?.sku || 'N/A',
                name: stockItem.products?.name || 'Sin nombre',
                branch_id: stockItem.branch_id,
                branch_name: stockItem.branches?.name || 'Sin sucursal',
                qty_on_hand: Number(stockItem.qty_on_hand) || 0,
                min_level: Number(stockItem.min_level) || 0,
                diferencia: Number(stockItem.min_level) - Number(stockItem.qty_on_hand),
                supplier_id: undefined, // Campo no disponible en DB
                supplier_name: undefined, // Campo no disponible en DB
                last_cost: 0 // Campo no disponible en DB
              };
            });
          
          setProductos(formattedData);
        }
      } catch (err) {
        console.error('Error inesperado:', err);
        setError('Ha ocurrido un error inesperado. Por favor intente nuevamente.');
      } finally {
        setLoading(false);
      }
    }

    fetchProductosBajoUmbral();
  }, [orgId]);

  // Manejar la selección de productos
  const handleProductSelection = (selectedProducts: ProductoBajoUmbral[]) => {
    setSelectedProducts(selectedProducts);
  };

  // Manejar click en botón de generación de OC
  const handleGenerarOC = () => {
    if (selectedProducts.length === 0) {
      return;
    }
    setShowOrdenesModal(true);
  };

  // Manejar click en botón de notificaciones
  const handleEnviarNotificaciones = () => {
    if (selectedProducts.length === 0) {
      return;
    }
    setShowNotificacionesModal(true);
  };

  // Filtrar productos según la pestaña activa
  const filteredProductos = activeTab === 'todos' 
    ? productos 
    : productos.filter(p => {
        if (activeTab === 'critico') {
          return p.qty_on_hand === 0;
        } else if (activeTab === 'bajo') {
          return p.qty_on_hand > 0 && p.qty_on_hand < p.min_level;
        }
        return true;
      });

  return (
    <div className="space-y-6">
      <StockMinimoHeader 
        onConfigClick={() => setShowConfigModal(true)}
        onGenerarOCClick={handleGenerarOC}
        onNotificacionesClick={handleEnviarNotificaciones}
        selectedProducts={selectedProducts}
      />
      
      <Card className="p-6">
        <Tabs defaultValue="todos" onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="todos">Todos los productos</TabsTrigger>
            <TabsTrigger value="critico">Stock crítico (0)</TabsTrigger>
            <TabsTrigger value="bajo">Stock bajo</TabsTrigger>
          </TabsList>
          
          <TabsContent value={activeTab} className="space-y-4">
            <ProductosBajoUmbralTable 
              productos={filteredProductos} 
              isLoading={loading} 
              error={error}
              onSelectionChange={handleProductSelection}
            />
          </TabsContent>
        </Tabs>
      </Card>
      
      {/* Modales */}
      <ConfiguracionUmbralModal 
        open={showConfigModal} 
        onOpenChange={setShowConfigModal} 
      />
      
      <OrdenesCompraModal 
        open={showOrdenesModal} 
        onOpenChange={setShowOrdenesModal}
        selectedProducts={selectedProducts}
      />
      
      <NotificacionesModal 
        open={showNotificacionesModal} 
        onOpenChange={setShowNotificacionesModal}
        selectedProducts={selectedProducts}
      />
    </div>
  );
}
