"use client"

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getOrganizationId } from '@/lib/hooks/useOrganization'
import { v4 as uuidv4 } from 'uuid'
import { ArrowLeft } from 'lucide-react'

import { supabase } from '@/lib/supabase/config'
import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Card, CardContent } from '@/components/ui/card'

import InformacionBasica from './InformacionBasica'
import PrecionyCostos from './PrecioysCostos'
import Inventario from './Inventario'
import Imagenes from './Imagenes'
import Variantes from './Variantes'
import Notas, { NotasRef } from './Notas'
import Etiquetas, { EtiquetasRef } from './Etiquetas'

// Esquema de validación con Zod
const productoSchema = z.object({
  // Información básica
  sku: z.string().min(1, { message: 'El código SKU es requerido' }),
  barcode: z.string().optional(),
  name: z.string().min(2, { message: 'El nombre debe tener al menos 2 caracteres' }),
  description: z.string().optional(),
  category_id: z.number().optional(),
  unit_code: z.string().min(1, { message: 'La unidad es requerida' }),
  supplier_id: z.number().optional(),
  
  // Precios y costos
  cost: z.number().min(0).optional(),
  price: z.number().min(0).optional(),
  
  // Inventario
  track_stock: z.boolean(),
  status: z.string(),
  stock_inicial: z.array(
    z.object({
      branch_id: z.number(),
      qty_on_hand: z.number().min(0),
      avg_cost: z.number(), // Hacemos que avg_cost sea obligatorio para coincidir con el tipo esperado
      lot_id: z.number().optional()
    })
  ).optional(),

  // No se incluye datos de variantes e imágenes en el schema principal
  // porque se manejarán por separado
});

// Define una interfaz para la estructura de stockItem para evitar 'any'
interface StockItem {
  branch_id: number;
  qty_on_hand: number;
  avg_cost?: number;
  lot_id?: number;
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
  console.log('FormularioProducto usando organization_id:', organization_id);
  
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
      supplier_id: undefined,
      
      // Precios y costos
      cost: 0,
      price: 0,
      
      // Inventario
      track_stock: true,
      status: 'active',
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
      // Funcion para verificar si un SKU ya existe en la base de datos
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
      
      // Agregar el ID de organización a los datos
      const productoData = {
        ...data,
        organization_id
      };
      
      // Verificar que el SKU del producto principal sea único antes de insertarlo
      productoData.sku = await verificarSkuUnico(productoData.sku);
      
      // Extraer los datos de stock inicial antes de guardar el producto
      const stockInicial = productoData.stock_inicial || [];
      delete productoData.stock_inicial;
      
      // Obtener imágenes del componente de imágenes
      const imagenes = imagenesRef.current?.getImagenes() || [];
      
      // Obtener variantes del componente de variantes
      const variantes = variantesRef.current?.getVariantes() || [];
      
      // Insertar el producto con SKU verificado
      const { data: producto, error } = await supabase
        .from('products')
        .insert(productoData)
        .select()
        .single();
        
      if (error) throw error;
      
      // 2. Si hay stock inicial, insertarlo
      if (stockInicial.length > 0 && producto) {
        const stockData = stockInicial.map(item => ({
          ...item,
          product_id: producto.id
        }));
        
        const { error: stockError } = await supabase
          .from('stock_levels')
          .insert(stockData);
          
        if (stockError) throw stockError;
        
        // 3. Registrar los movimientos de stock
        const movimientosData = stockInicial.map(item => ({
          product_id: producto.id,
          organization_id,
          branch_id: item.branch_id,
          direction: 'in',
          qty: item.qty_on_hand,
          unit_cost: item.avg_cost || 0,
          source: 'adjustment',  // Cambiado de 'initial' a 'adjustment' para cumplir con la restricción
          source_id: producto.id.toString(),  // Convertir a string para ser consistente
          note: 'Stock inicial'
        }));
        
        if (movimientosData.length > 0) {
          const { error: movError } = await supabase
            .from('stock_movements')
            .insert(movimientosData);
            
          if (movError) throw movError;
        }
      }
      
      // 4. Guardar imágenes del producto usando el nuevo sistema de imágenes compartidas
      if (producto && imagenesRef.current) {
        try {
          // Usamos el método guardarImagenesEnBD del componente Imagenes que ahora usa associate_image_to_product
          const { success, error: imgError } = await imagenesRef.current.guardarImagenesEnBD(producto.id);
          
          if (!success) {
            console.error('Error al guardar imágenes:', imgError);
            // No lanzamos error para no interrumpir el flujo principal
          }
        } catch (imgError) {
          console.error('Error al guardar imágenes:', imgError);
          // No lanzamos error para no interrumpir el flujo principal
        }
      }
      
      // 5. Guardar variantes del producto
      if (variantes.length > 0 && producto) {
        for (const variante of variantes) {
          // Asegurar que el SKU sea único antes de insertar
          const skuUnico = await verificarSkuUnico(variante.sku);
          
          // Insertar la variante con el SKU único
          const { data: varData, error: varError } = await supabase
            .from('product_variants')
            .insert({
              product_id: producto.id,
              sku: skuUnico,
              price: variante.price || productoData.price,
              cost: variante.cost || productoData.cost,
              stock_quantity: variante.stock_quantity || 0
            })
            .select()
            .single();
            
          if (varError) {
            console.error('Error al guardar variante:', varError);
            continue;
          }
          
          // Insertar los atributos de la variante
          if (variante.combination && variante.combination.length > 0) {
            const atributos = variante.combination.map((attr: any) => ({
              variant_id: varData.id,
              variant_type_id: attr.type_id,
              variant_value_id: attr.value_id
            }));
            
            const { error: attrError } = await supabase
              .from('product_variant_attributes')
              .insert(atributos);
              
            if (attrError) {
              console.error('Error al guardar atributos de variante:', attrError);
            }
          }
          
          // Registrar stock inicial por sucursal de la variante
          if (variante.stock_por_sucursal && variante.stock_por_sucursal.length > 0) {
            // Crear registros de stock en cada sucursal para esta variante
            const stockData = variante.stock_por_sucursal.map((stockItem: StockItem) => ({
              product_id: producto.id,
              branch_id: stockItem.branch_id,
              qty_on_hand: stockItem.qty_on_hand,
              avg_cost: stockItem.avg_cost || variante.cost || productoData.cost || 0,
              variant_id: varData.id  // Asociar con la variante
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
                product_id: producto.id,
                organization_id,
                branch_id: stockItem.branch_id,
                direction: 'in',
                qty: stockItem.qty_on_hand,
                unit_cost: stockItem.avg_cost || variante.cost || productoData.cost || 0,
                source: 'adjustment',
                source_id: varData.id.toString(), // Convertir a string para cumplir con el tipo
                note: `Stock inicial variante ${variante.sku} (Sucursal ${stockItem.branch_id})`
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
          // Mantener el código anterior como fallback para compatibilidad
          else if (variante.stock_quantity && variante.stock_quantity > 0) {
            // Usamos la primera sucursal disponible para el stock inicial de la variante
            const defaultBranchId = stockInicial.length > 0 ? stockInicial[0].branch_id : null;
            
            if (defaultBranchId) {
              await supabase.from('stock_levels').insert({
                product_id: producto.id,
                branch_id: defaultBranchId,
                qty_on_hand: variante.stock_quantity,
                avg_cost: variante.cost || productoData.cost || 0,
                variant_id: varData.id
              });
              
              await supabase.from('stock_movements').insert({
                product_id: producto.id,
                organization_id,
                branch_id: defaultBranchId,
                direction: 'in',
                qty: variante.stock_quantity,
                unit_cost: variante.cost || productoData.cost || 0,
                source: 'adjustment',
                source_id: varData.id.toString(), // Convertir a string para cumplir con el tipo
                note: `Stock inicial variante ${variante.sku}`
              });
            }
          }
        }
      }
      
      // 6. Guardar las notas del producto
      if (notasRef.current && producto) {
        try {
          const { success, error } = await notasRef.current.guardarNotasEnBD(producto.id);
          if (!success) {
            console.error('Error al guardar notas del producto:', error);
            // No lanzamos error para no interrumpir el flujo principal
          }
        } catch (notasError: any) {
          console.error('Error al guardar notas del producto:', notasError);
          // No lanzamos error para no interrumpir el flujo principal
        }
      }
      
      // 7. Guardar las etiquetas del producto
      if (etiquetasRef.current && producto) {
        try {
          const { success, error } = await etiquetasRef.current.guardarEtiquetasEnBD(producto.id);
          if (!success) {
            console.error('Error al guardar etiquetas del producto:', error);
            // No lanzamos error para no interrumpir el flujo principal
          }
        } catch (tagsError: any) {
          console.error('Error al guardar etiquetas del producto:', tagsError);
          // No lanzamos error para no interrumpir el flujo principal
        }
      }
      
      // Mostrar mensaje de éxito
      toast({
        title: "Éxito",
        description: "Producto creado correctamente",
      });
      
      // Log para diagnóstico
      console.log('Producto guardado exitosamente:', producto.id);
      
      // Asegurarnos de que la redirección ocurra con un setTimeout para darle tiempo al sistema
      setTimeout(() => {
        try {
          // Intentar navegar a la página de detalle
          router.push(`/app/inventario/productos/${producto.id}`);
        } catch (navError) {
          console.error('Error al redireccionar:', navError);
          // Alternativa de navegación si router.push falla
          window.location.href = `/app/inventario/productos/${producto.id}`;
        }
      }, 500);
      
    } catch (error: any) {
      // Mostrar mensaje detallado del error
      console.error('Error al guardar el producto:', error);
      
      // Mostrar toast con detalles del error
      toast({
        title: "Error",
        description: error.message || "Ocurrió un error al guardar el producto",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Card className="w-full">
        <CardContent className="p-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid gap-4">
                <InformacionBasica form={form} />
                <PrecionyCostos form={form} />
                <Inventario form={form} />
                <Imagenes ref={imagenesRef} />
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
                
                <Notas 
                  ref={notasRef}
                />

                <Etiquetas
                  ref={etiquetasRef}
                />
              
              <div className="flex justify-end space-x-4 mt-8">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => router.back()}
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={isLoading}
                >
                  {isLoading ? 'Guardando...' : 'Guardar Producto'}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
    </>
  );
}
