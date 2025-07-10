'use client';

import { useState, useEffect } from 'react';
import { 
  Card, CardHeader, CardTitle,
  CardContent
} from '@/components/ui/card';
import { 
  Table, TableBody, TableCell, TableHead, 
  TableHeader, TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
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

interface LoteConProducto {
  id: number;
  lot_code: string;
  expiry_date: string | null;
  product_id: number;
  supplier_id: number | null;
  created_at: string | null;
  qty_on_hand: number;
  products: ProductData;
  suppliers: SupplierData | null;
}

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

export function LotesList() {
  const [lotes, setLotes] = useState<LoteConProducto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Fechas para control de vencimiento
  const hoy = new Date();
  const treintaDias = new Date();
  treintaDias.setDate(hoy.getDate() + 30);
  
  // Función para determinar el estado del lote según su fecha de vencimiento
  const getEstadoLote = (lote: LoteConProducto): 'default' | 'destructive' | 'outline' | 'secondary' | 'success' | 'warning' => {
    if (!lote.expiry_date) return 'outline';
    
    const fechaExp = new Date(lote.expiry_date);
    if (fechaExp < hoy) return 'destructive';
    if (fechaExp <= treintaDias) return 'warning';
    return 'success';
  };
  
  useEffect(() => {
    async function fetchLotes() {
      setIsLoading(true);
      try {
        const organizationId = await getOrganizationId();
        if (!organizationId) {
          setError('No se encontró ID de organización');
          return;
        }
        
        // Obtenemos los lotes con sus productos y proveedores
        const { data, error } = await supabase
          .from('lots')
          .select(`
            id, 
            lot_code, 
            expiry_date, 
            product_id, 
            supplier_id, 
            created_at,
            products:products (id, name, sku, organization_id),
            suppliers:suppliers (name)
          `)
          .order('expiry_date', { ascending: true, nullsLast: true });
        
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
        
        setLotes(lotesConStock);
      } catch (err: unknown) {
        console.error('Error al cargar lotes:', err);
        setError(
          err instanceof Error 
            ? err.message 
            : 'Error al cargar los datos de lotes'
        );
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchLotes();
  }, []);
  
  // Función para determinar el estado de vencimiento
  const getEstadoVencimiento = (fechaVencimiento: string | null) => {
    if (!fechaVencimiento) return { estado: 'sin-fecha', etiqueta: 'Sin fecha' };
    
    const fechaExp = new Date(fechaVencimiento);
    
    if (fechaExp < hoy) {
      return { estado: 'vencido', etiqueta: 'Vencido' };
    } else if (fechaExp <= treintaDias) {
      return { estado: 'proximo', etiqueta: 'Próximo a vencer' };
    } else {
      return { estado: 'vigente', etiqueta: 'Vigente' };
    }
  };

  if (error) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lotes y Fechas de Vencimiento</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <div className="loader">Cargando...</div>
          </div>
        ) : lotes.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No hay lotes registrados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código Lote</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lotes.map((lote) => {
                  const vencimiento = getEstadoVencimiento(lote.expiry_date);
                  
                  return (
                    <TableRow key={lote.id}>
                      <TableCell>{lote.lot_code}</TableCell>
                      <TableCell>{lote.products.name}</TableCell>
                      <TableCell>{lote.products.sku}</TableCell>
                      <TableCell>{lote.suppliers?.name || 'Sin proveedor'}</TableCell>
                      <TableCell>{lote.qty_on_hand}</TableCell>
                      <TableCell>
                        <Badge variant={getEstadoLote(lote)}>
                          {lote.expiry_date ? formatDate(lote.expiry_date) : 'Sin fecha'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            vencimiento.estado === 'vencido' ? 'destructive' : 
                            vencimiento.estado === 'proximo' ? 'warning' : 
                            vencimiento.estado === 'vigente' ? 'success' : 
                            'outline'
                          }
                        >
                          {vencimiento.etiqueta}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
