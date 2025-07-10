'use client';

import { useState, useEffect } from 'react';
import { 
  Card, CardContent
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { formatDate } from '@/utils/Utils';

// Interfaces para manejo de datos
interface ProductData {
  id: number;
  name: string;
  sku: string;
  organization_id: number;
}

interface SupplierData {
  name: string;
}

type LoteConProducto = {
  id: number;
  lot_code: string;
  expiry_date: string | null;
  product_id: number;
  supplier_id: number | null;
  created_at: string | null;
  qty_on_hand: number;
  products: ProductData;
  suppliers: SupplierData | null;
};

// Tipos para la respuesta de Supabase
type SupabaseProduct = ProductData | ProductData[];
type SupabaseSupplier = SupplierData | SupplierData[] | null;

interface LoteSupabase {
  id: number;
  lot_code: string;
  expiry_date: string | null;
  product_id: number;
  supplier_id: number | null;
  created_at: string | null;
  products: SupabaseProduct;
  suppliers: SupabaseSupplier;
}

export function LotesAlerts() {
  const [lotesVencidos, setLotesVencidos] = useState<LoteConProducto[]>([]);
  const [lotesProximos, setLotesProximos] = useState<LoteConProducto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchLotes = async () => {
      try {
        // Obtenemos el ID de la organización
        const organizationId = await getOrganizationId();
        
        if (!organizationId) {
          setError('No se pudo obtener la organización actual');
          setLoading(false);
          return;
        }
        
        // Consultamos todos los lotes con sus productos y proveedores
        const { data, error } = await supabase
          .from('lots')
          .select(`
            *,
            products (*),
            suppliers (*)
          `);
        
        if (error) throw error;
        
        // Filtramos lotes por organización usando la relación con productos
        const filteredLotes = data.filter((lote: LoteSupabase) => {
          const productsData = lote.products;
          
          // Comprobamos si products es un array o un objeto
          if (Array.isArray(productsData) && productsData.length > 0) {
            return productsData[0].organization_id === organizationId;
          } else if (productsData && typeof productsData === 'object') {
            return (productsData as ProductData).organization_id === organizationId;
          }
          
          return false;
        });
        
        // Para cada lote, obtenemos su stock actual
        const lotesConStock = await Promise.all(filteredLotes.map(async (lote: LoteSupabase) => {
          const { data: stockData } = await supabase
            .from('stock_levels')
            .select('qty_on_hand')
            .eq('lot_id', lote.id)
            .eq('product_id', lote.product_id)
            .maybeSingle();
          
          // Extraer datos del producto (manejando tanto array como objeto)
          let productData: ProductData;
          if (Array.isArray(lote.products)) {
            productData = {
              id: lote.products[0]?.id || 0,
              name: lote.products[0]?.name || '',
              sku: lote.products[0]?.sku || '',
              organization_id: lote.products[0]?.organization_id || 0
            };
          } else {
            const prod = lote.products as ProductData;
            productData = {
              id: prod.id || 0,
              name: prod.name || '',
              sku: prod.sku || '',
              organization_id: prod.organization_id || 0
            };
          }
          
          // Extraer datos del proveedor (manejando tanto array como objeto o nulo)
          let supplierData: SupplierData | null = null;
          if (lote.suppliers) {
            if (Array.isArray(lote.suppliers) && lote.suppliers.length > 0) {
              supplierData = { name: lote.suppliers[0]?.name || '' };
            } else if (typeof lote.suppliers === 'object') {
              const supp = lote.suppliers as SupplierData;
              supplierData = { name: supp.name || '' };
            }
          }
          
          return {
            id: lote.id,
            lot_code: lote.lot_code,
            expiry_date: lote.expiry_date,
            product_id: lote.product_id,
            supplier_id: lote.supplier_id,
            created_at: lote.created_at,
            qty_on_hand: stockData?.qty_on_hand || 0,
            products: productData,
            suppliers: supplierData
          } as LoteConProducto;
        }));
        
        // Solo nos interesan los lotes con stock disponible
        const lotesConExistencias = lotesConStock.filter(lote => lote.qty_on_hand > 0);
        
        // Obtenemos la fecha actual y la de 30 días
        const hoy = new Date();
        const treintaDias = new Date();
        treintaDias.setDate(hoy.getDate() + 30);
        
        // Filtramos por fecha de vencimiento
        const vencidos = lotesConExistencias.filter(lote => {
          if (!lote.expiry_date) return false;
          const fechaVenc = new Date(lote.expiry_date);
          return fechaVenc < hoy;
        });
        
        const proximos = lotesConExistencias.filter(lote => {
          if (!lote.expiry_date) return false;
          const fechaVenc = new Date(lote.expiry_date);
          return fechaVenc >= hoy && fechaVenc <= treintaDias;
        });
        
        setLotesVencidos(vencidos);
        setLotesProximos(proximos);
        setLoading(false);
      } catch (err) {
        console.error('Error al cargar los lotes:', err);
        setError('Error al cargar los datos de lotes');
        setLoading(false);
      }
    };
    
    fetchLotes();
  }, []);
  
  if (loading) return <div>Cargando alertas de lotes...</div>;
  if (error) return <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  
  // Si no hay lotes vencidos ni próximos, no mostramos nada
  if (lotesVencidos.length === 0 && lotesProximos.length === 0) {
    return null;
  }
  
  return (
    <div className="space-y-4">
      {lotesVencidos.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Lotes vencidos con existencias ({lotesVencidos.length})</AlertTitle>
          <AlertDescription>
            <div className="grid gap-2 mt-2">
              {lotesVencidos.map(lote => (
                <Card key={lote.id}>
                  <CardContent className="p-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium">{lote.products.name}</p>
                        <p className="text-sm text-muted-foreground">Lote: {lote.lot_code} | SKU: {lote.products.sku}</p>
                        <p className="text-sm text-muted-foreground">
                          {lote.suppliers && `Proveedor: ${lote.suppliers.name}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant="destructive">Vencido: {formatDate(lote.expiry_date || '')}</Badge>
                        <p className="text-sm mt-1">Stock: {lote.qty_on_hand}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}
      
      {lotesProximos.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Lotes próximos a vencer ({lotesProximos.length})</AlertTitle>
          <AlertDescription>
            <div className="grid gap-2 mt-2">
              {lotesProximos.map(lote => (
                <Card key={lote.id}>
                  <CardContent className="p-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium">{lote.products.name}</p>
                        <p className="text-sm text-muted-foreground">Lote: {lote.lot_code} | SKU: {lote.products.sku}</p>
                        <p className="text-sm text-muted-foreground">
                          {lote.suppliers && `Proveedor: ${lote.suppliers.name}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant="warning">Vence: {formatDate(lote.expiry_date || '')}</Badge>
                        <p className="text-sm mt-1">Stock: {lote.qty_on_hand}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
