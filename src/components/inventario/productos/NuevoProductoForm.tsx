"use client"

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getOrganizationId } from '@/lib/hooks/useOrganization'
import { v4 as uuidv4 } from 'uuid'

import { supabase } from '@/lib/supabase/config'
import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

import InformacionBasica from './nuevo/InformacionBasica'
import PrecioysCostos from './nuevo/PrecioysCostos'
import Inventario from './nuevo/Inventario'
import Imagenes from './nuevo/Imagenes'
import Variantes from './nuevo/Variantes'
import Notas, { NotasRef } from './nuevo/Notas'
import Etiquetas, { EtiquetasRef } from './nuevo/Etiquetas'

// Esquema de validación con Zod
const productoSchema = z.object({
  // Información básica - Coincide con la tabla products
  sku: z.string().min(1, { message: 'El código SKU es requerido' }),
  barcode: z.string().optional(),
  name: z.string().min(2, { message: 'El nombre debe tener al menos 2 caracteres' }),
  description: z.string().optional(),
  category_id: z.number().optional(),
  unit_code: z.string().optional(),
  tax_id: z.number().optional(),
  parent_product_id: z.number().optional(), // Para variantes
  tag_id: z.number().optional(),
  
  // Campos para almacenar en tablas separadas
  price: z.number().min(0).optional(), // Se guardará en product_prices
  cost: z.number().min(0).optional(),  // Se guardará en product_costs
  
  // Inventario
  status: z.enum(['active', 'inactive', 'discontinued', 'deleted']),
  stock_inicial: z.array(
    z.object({
      branch_id: z.number(),
      qty_on_hand: z.number().min(0),
      avg_cost: z.number().min(0),
      qty_reserved: z.number().min(0),
      lot_id: z.number().nullable().optional()
    })
  ).optional(),

  // No se incluye datos de variantes e imágenes en el schema principal
  // porque se manejarán por separado
});

// Define una interfaz para la estructura de stockItem para evitar 'any'
interface StockItem {
  branch_id: number;
  qty_on_hand: number;
  avg_cost: number;
  qty_reserved?: number;
  lot_id?: number | null;
}

// Tipo para los datos del formulario
type ProductoFormData = z.infer<typeof productoSchema>;

export default function FormularioProducto() {
  const { toast } = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  
  // Referencias a componentes hijos para acceder a sus datos
  const imagenesRef = useRef<any>(null);
  const variantesRef = useRef<any>(null);
  const notasRef = useRef<NotasRef>(null);
  const etiquetasRef = useRef<EtiquetasRef>(null);
  
  // Obtener el ID de la organización activa usando la utilidad centralizada
  const organization_id = getOrganizationId();
  
  // Configurar el formulario
  const form = useForm<ProductoFormData>({
    resolver: zodResolver(productoSchema),
    defaultValues: {
      // Información básica
      sku: '',
      barcode: '',
      name: '',
      description: '',
      category_id: undefined,
      unit_code: '',
      tax_id: undefined,
      parent_product_id: undefined,
      tag_id: undefined,
      
      // Precios y costos (para tablas separadas)
      cost: 0,
      price: 0,
      
      // Inventario
      status: 'active' as const,
      stock_inicial: []
    }
  });
  
  // Función para guardar el producto
  const onSubmit = async (data: ProductoFormData) => {
    if (!organization_id) {
      toast({
        title: "Error",
        description: "No se ha seleccionado una organización",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // Función para verificar si un SKU ya existe en la base de datos
      const verificarSkuUnico = async (sku: string): Promise<string> => {
        if (!sku) return ''; // Si no hay SKU, retornar vacío
        
        // Verificar si ya existe un producto con ese SKU en esta organización
        const { data } = await supabase
          .from('products')
          .select('id')
          .eq('organization_id', organization_id)
          .eq('sku', sku)
          .maybeSingle();
          
        if (!data) {
          // No existe, este SKU es único
          return sku;
        }
        
        // Si ya existe, generar un SKU alternativo con timestamp
        const timestamp = Date.now().toString().slice(-6);
        return `${sku}-${timestamp}`;
      };
      
      // Extraer datos para tablas separadas
      const { price, cost, stock_inicial, ...productData } = data;
      
      // Preparar los datos del producto principal
      const productoData = {
        ...productData,
        organization_id
      };
      
      // Verificar que el SKU del producto principal sea único antes de insertarlo
      productoData.sku = await verificarSkuUnico(productoData.sku);
      
      // Obtener imágenes y variantes del componente correspondiente
      const imagenes = imagenesRef.current?.getImagenes() || [];
      const variantes = variantesRef.current?.getVariantes() || [];
      
      // 1. Insertar el producto con SKU verificado
      const { data: producto, error } = await supabase
        .from('products')
        .insert(productoData)
        .select()
        .single();
        
      if (error) throw error;
      
      // 2. Guardar el precio en product_prices
      if (price !== undefined && producto) {
        const { error: priceError } = await supabase
          .from('product_prices')
          .insert({
            product_id: producto.id,
            price: price,
            effective_from: new Date()
          });
          
        if (priceError) {
          console.error('Error al guardar precio:', priceError);
        }
      }
      
      // 3. Guardar el costo en product_costs
      if (cost !== undefined && producto) {
        const { error: costError } = await supabase
          .from('product_costs')
          .insert({
            product_id: producto.id,
            cost: cost,
            effective_from: new Date()
          });
          
        if (costError) {
          console.error('Error al guardar costo:', costError);
        }
      }
      
      // 4. Si hay stock inicial, insertarlo
      if (stock_inicial && stock_inicial.length > 0 && producto) {
        try {
          console.log('Insertando stock_levels:', stock_inicial.length, 'elementos');
          
          const stockData = stock_inicial.map(item => ({
            product_id: producto.id,
            branch_id: item.branch_id,
            // Asegurarnos que lot_id sea null si no existe
            lot_id: item.lot_id || null,
            qty_on_hand: parseFloat(String(item.qty_on_hand)) || 0,
            qty_reserved: parseFloat(String(item.qty_reserved || 0)) || 0,
            avg_cost: parseFloat(String(item.avg_cost || cost || 0)) || 0
          }));
          
          console.log('Datos de stock_levels a insertar:', stockData);
          
          const { error: stockError } = await supabase
            .from('stock_levels')
            .insert(stockData);
            
          if (stockError) {
            console.error('Error al insertar stock_levels:', stockError);
            console.error('Detalles completos del error:', JSON.stringify(stockError));
            throw stockError;
          }
          
          console.log('Stock insertado correctamente');
          
          // 5. Registrar los movimientos de stock
          try {
            const movimientosData = stock_inicial.map(item => ({
              product_id: producto.id,
              organization_id,
              branch_id: item.branch_id,
              direction: 'in',
              qty: parseFloat(String(item.qty_on_hand)) || 0,
              unit_cost: parseFloat(String(item.avg_cost || cost || 0)) || 0,
              source: 'adjustment',
              source_id: producto.id.toString(),
              note: 'Stock inicial'
            }));
            
            console.log('Datos de stock_movements a insertar:', movimientosData);
            
            if (movimientosData.length > 0) {
              const { error: movError } = await supabase
                .from('stock_movements')
                .insert(movimientosData);
                
              if (movError) {
                console.error('Error al insertar stock_movements:', movError);
                console.error('Detalles completos del error:', JSON.stringify(movError));
                throw movError;
              }
              
              console.log('Movimientos de stock insertados correctamente');
            }
          } catch (movError: any) {
            console.error('Error al procesar movimientos de stock:', movError);
            throw new Error(`Error al procesar movimientos de stock: ${movError?.message || JSON.stringify(movError)}`);
          }
        } catch (stockError: any) {
          console.error('Error al procesar stock inicial:', stockError);
          throw new Error(`Error al procesar stock inicial: ${stockError?.message || JSON.stringify(stockError)}`);
        }
      }
      
      // 6. Guardar imágenes del producto
      if (producto && imagenesRef.current) {
        try {
          const { success, error: imgError } = await imagenesRef.current.guardarImagenesEnBD(producto.id);
          
          if (!success) {
            console.error('Error al guardar imágenes:', imgError);
          }
        } catch (imgError) {
          console.error('Error al guardar imágenes:', imgError);
        }
      }
      
      // 7. Guardar variantes del producto como productos hijos
      if (variantes.length > 0 && producto) {
        for (const variante of variantes) {
          // Asegurar que el SKU sea único antes de insertar
          const skuUnico = await verificarSkuUnico(variante.sku);
          
          // Insertar la variante como un producto con parent_product_id
          const { data: varProducto, error: varError } = await supabase
            .from('products')
            .insert({
              organization_id,
              sku: skuUnico,
              name: `${productoData.name} - ${variante.nombre || 'Variante'}`,
              parent_product_id: producto.id, // Relación con producto padre
              category_id: productoData.category_id,
              unit_code: productoData.unit_code,
              status: productoData.status
            })
            .select()
            .single();
            
          if (varError) {
            console.error('Error al guardar variante:', varError);
            continue;
          }
          
          // Guardar precio de la variante
          if (variante.price) {
            await supabase
              .from('product_prices')
              .insert({
                product_id: varProducto.id,
                price: variante.price,
                effective_from: new Date()
              });
          }
          
          // Guardar costo de la variante
          if (variante.cost) {
            await supabase
              .from('product_costs')
              .insert({
                product_id: varProducto.id,
                organization_id,
                cost: variante.cost,
                effective_from: new Date()
              });
          }
          
          // Guardar atributos de la variante (si se mantiene esa tabla)
          if (variante.combination && variante.combination.length > 0) {
            try {
              const atributos = variante.combination.map((attr: any) => ({
                product_id: varProducto.id,
                attribute_id: attr.type_id,
                attribute_value_id: attr.value_id
              }));
              
              await supabase
                .from('product_attributes') // Asumiendo que esta es la tabla correcta
                .insert(atributos);
            } catch (attrError) {
              console.error('Error al guardar atributos de variante:', attrError);
            }
          }
          
          // Registrar stock inicial por sucursal de la variante
          if (variante.stock_por_sucursal && variante.stock_por_sucursal.length > 0) {
            // Crear registros de stock en cada sucursal para esta variante
            const stockData = variante.stock_por_sucursal.map((stockItem: StockItem) => ({
              product_id: varProducto.id,
              branch_id: stockItem.branch_id,
              qty_on_hand: stockItem.qty_on_hand,
              qty_reserved: stockItem.qty_reserved || 0,
              avg_cost: stockItem.avg_cost || variante.cost || cost || 0,
              lot_id: stockItem.lot_id
            }));
            
            // Insertar registros de stock para esta variante
            const { error: stockVarError } = await supabase
              .from('stock_levels')
              .insert(stockData);
              
            if (stockVarError) {
              console.error('Error al guardar stock de variante:', stockVarError);
            } else {
              // Registrar los movimientos de stock para cada sucursal
              const movimientosData = variante.stock_por_sucursal.map((stockItem: StockItem) => ({
                product_id: varProducto.id,
                organization_id,
                branch_id: stockItem.branch_id,
                direction: 'in',
                qty: stockItem.qty_on_hand,
                unit_cost: stockItem.avg_cost || variante.cost || cost || 0,
                source: 'adjustment',
                source_id: varProducto.id.toString(),
                note: `Stock inicial variante ${skuUnico}`
              }));
              
              if (movimientosData.length > 0) {
                const { error: movError } = await supabase
                  .from('stock_movements')
                  .insert(movimientosData);
                  
                if (movError) {
                  console.error('Error al registrar movimientos de stock para variante:', movError);
                }
              }
            }
          }
        }
      }
      
      // 8. Guardar las notas del producto
      if (notasRef.current && producto) {
        try {
          const { success, error } = await notasRef.current.guardarNotasEnBD(producto.id);
          if (!success) {
            console.error('Error al guardar notas del producto:', error);
          }
        } catch (notasError: any) {
          console.error('Error al guardar notas del producto:', notasError);
        }
      }
      
      // 9. Guardar las etiquetas del producto
      if (etiquetasRef.current && producto) {
        try {
          const { success, error } = await etiquetasRef.current.guardarEtiquetasEnBD(producto.id);
          if (!success) {
            console.error('Error al guardar etiquetas del producto:', error);
          }
        } catch (tagsError: any) {
          console.error('Error al guardar etiquetas del producto:', tagsError);
        }
      }
      
      // Mostrar mensaje de éxito
      toast({
        title: "Éxito",
        description: "Producto creado correctamente",
      });
      
      // Log para diagnóstico
      console.log('Producto guardado exitosamente:', producto.id);
      
      // Redireccionar a la página de detalle del producto
      setTimeout(() => {
        try {
          router.push(`/app/inventario/productos/${producto.id}`);
        } catch (navError) {
          console.error('Error al redireccionar:', navError);
          window.location.href = `/app/inventario/productos/${producto.id}`;
        }
      }, 500);
      
    } catch (error: any) {
      console.error('Error al guardar el producto:', error || {});
      
      // Obtener un mensaje de error más descriptivo
      let errorMessage = "Ha ocurrido un error al guardar el producto";
      
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.code) {
        errorMessage = `Error (${error.code}): ${error.details || 'Error al procesar la solicitud'}`;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Renderizar el formulario
  return (
    <div className="w-full">
      {/* Formulario con estructura de tarjetas para cada sección */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
          {/* Información Básica */}
          <Card className="overflow-hidden">
            <CardHeader className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <CardTitle className="text-gray-900 dark:text-gray-100">Información Básica</CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-400">
                Datos generales del producto (SKU, nombre, categoría)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <InformacionBasica form={form} />
            </CardContent>
          </Card>
          
          {/* Precios y Costos */}
          <Card className="overflow-hidden">
            <CardHeader className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <CardTitle className="text-gray-900 dark:text-gray-100">Precios y Costos</CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-400">
                Define el precio de venta y costo de adquisición
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <PrecioysCostos form={form} />
            </CardContent>
          </Card>
          
          {/* Inventario */}
          <Card className="overflow-hidden">
            <CardHeader className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <CardTitle className="text-gray-900 dark:text-gray-100">Inventario</CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-400">
                Configuración de stock inicial por sucursal
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <Inventario form={form} />
            </CardContent>
          </Card>
          
          {/* Imágenes */}
          <Card className="overflow-hidden">
            <CardHeader className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <CardTitle className="text-gray-900 dark:text-gray-100">Imágenes</CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-400">
                Agrega fotos del producto (máx. 5 imágenes)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <Imagenes ref={imagenesRef} />
            </CardContent>
          </Card>
          
          {/* Variantes */}
          <Card className="overflow-hidden">
            <CardHeader className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <CardTitle className="text-gray-900 dark:text-gray-100">Variantes</CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-400">
                Crea variantes del producto (tallas, colores, etc.)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <Variantes 
                ref={variantesRef} 
                defaultCost={Number(form.watch('cost') || 0)} 
                defaultPrice={Number(form.watch('price') || 0)}
                defaultSku={form.watch('sku')}
                stockInicial={form.watch('stock_inicial')?.map(item => ({
                  branch_id: item.branch_id,
                  qty_on_hand: item.qty_on_hand,
                  avg_cost: item.avg_cost || 0
                }))}
              />
            </CardContent>
          </Card>
          
          {/* Notas */}
          <Card className="overflow-hidden">
            <CardHeader className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <CardTitle className="text-gray-900 dark:text-gray-100">Notas</CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-400">
                Información adicional o instrucciones especiales
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <Notas ref={notasRef} />
            </CardContent>
          </Card>
          
          {/* Etiquetas */}
          <Card className="overflow-hidden">
            <CardHeader className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
              <CardTitle className="text-gray-900 dark:text-gray-100">Etiquetas</CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-400">
                Organiza y clasifica el producto con etiquetas
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              <Etiquetas ref={etiquetasRef} />
            </CardContent>
          </Card>
          
          {/* Botones de acción */}
          <Card className="overflow-hidden mt-6">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={isLoading}
                  className="w-full sm:w-auto order-2 sm:order-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full sm:w-auto order-1 sm:order-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Guardando...
                    </>
                  ) : 'Guardar Producto'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );
}
