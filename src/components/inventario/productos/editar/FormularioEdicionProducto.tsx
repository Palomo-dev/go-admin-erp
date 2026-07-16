"use client"

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { getOrganizationId } from '@/lib/hooks/useOrganization'

import { supabase } from '@/lib/supabase/config'
import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2 } from 'lucide-react'

// Importar los mismos componentes que se usan en el formulario de creación
import InformacionBasica from '../nuevo/InformacionBasica'
import PrecionyCostos from '../nuevo/PreciosYCostos'
import Inventario from '../nuevo/Inventario'
import Imagenes from '../nuevo/Imagenes'
import Variantes from '../nuevo/Variantes'
import Notas from '../nuevo/Notas'
import Etiquetas from '../nuevo/Etiquetas'

// Esquema de validación con Zod (mismo que en FormularioProducto)
const productoSchema = z.object({
  // Información básica
  sku: z.string().min(1, { message: 'El código SKU es requerido' }),
  barcode: z.string().optional(),
  name: z.string().min(2, { message: 'El nombre debe tener al menos 2 caracteres' }),
  description: z.string().optional(),
  category_id: z.number().optional(),
  unit_code: z.string().min(1, { message: 'La unidad es requerida' }),
  supplier_id: z.number().optional(),
  tax_id: z.string().optional(), // UUID del impuesto
  station: z.string().nullable().optional(),
  
  // Precios y costos
  cost: z.number().min(0).optional(),
  price: z.number().min(0).optional(),
  compare_price: z.number().min(0).optional(),
  
  // Inventario
  track_stock: z.boolean(),
  status: z.string(),
  stock_inicial: z.array(
    z.object({
      branch_id: z.number(),
      qty_on_hand: z.number().min(0),
      avg_cost: z.number(),
      lot_id: z.number().optional(),
      min_level: z.number().min(0).optional() // Stock mínimo
    })
  ).optional(),
  
  // Campos adicionales usados por los componentes hijos
  images: z.array(z.any()).optional(),
  notes: z.string().optional(),
  tags: z.array(z.number()).optional(),
  has_variants: z.boolean().optional(),
  variants: z.array(z.any()).optional(),
});

// Define una interfaz para la estructura de stockItem
interface StockItem {
  branch_id: number;
  qty_on_hand: number;
  avg_cost?: number;
  lot_id?: number;
}

// Tipo para los datos del formulario
type ProductoFormData = z.infer<typeof productoSchema>;

interface FormularioEdicionProductoProps {
  productoUuid: string;
}

export default function FormularioEdicionProducto({ productoUuid }: FormularioEdicionProductoProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  // ID numérico del producto (se obtiene al cargar por UUID)
  const [productoId, setProductoId] = useState<number | undefined>(undefined);
  
  // Obtener el ID de la organización activa
  const organization_id = getOrganizationId();
  
  // Configurar el formulario con valores por defecto
  const form = useForm<ProductoFormData>({
    resolver: zodResolver(productoSchema),
    defaultValues: {
      sku: '',
      barcode: '',
      name: '',
      description: '',
      category_id: undefined,
      unit_code: '',
      supplier_id: undefined,
      tax_id: '',
      station: null,
      cost: 0,
      price: 0,
      track_stock: true,
      status: 'active',
      stock_inicial: [],
      images: [],
      compare_price: 0,
      notes: '',
      tags: [],
      has_variants: false,
      variants: []
    }
  });

  // Adaptador para convertir react-hook-form a formData/updateFormData
  const formData = form.watch();
  const updateFormData = (field: string, value: any) => {
    form.setValue(field as any, value);
  };

  // Cargar datos del producto existente
  useEffect(() => {
    const cargarProducto = async () => {
      try {
        setInitialLoading(true);
        
        if (!organization_id) {
          toast({
            title: "Error",
            description: "No se ha seleccionado una organización",
            variant: "destructive"
          });
          return;
        }
        
        // 1. Obtener datos del producto por UUID
        const { data: producto, error } = await supabase
          .from('products')
          .select('*')
          .eq('uuid', productoUuid)
          .eq('organization_id', organization_id)
          .single();
          
        if (error) throw error;
        if (!producto) throw new Error('No se encontró el producto');
        
        // Guardar el ID numérico para operaciones posteriores
        setProductoId(producto.id);
        
        // 2. Cargar stock actual del producto
        const { data: stockData, error: stockError } = await supabase
          .from('stock_levels')
          .select(`
            id, 
            product_id,
            branch_id,
            lot_id,
            qty_on_hand,
            qty_reserved,
            avg_cost,
            branches:branch_id(id, name)
          `)
          .eq('product_id', producto.id);
          
        if (stockError) throw stockError;
        
        console.log("Stock data cargado:", stockData);
        
        // Mapear el stock actual al formato esperado por el formulario
        const stockInicial = stockData?.map((item: any) => ({
          branch_id: item.branch_id,
          branch_name: item.branches?.name, // Incluimos el nombre de la sucursal para mejor referencia
          qty_on_hand: item.qty_on_hand || 0,
          avg_cost: item.avg_cost || 0,
          lot_id: item.lot_id
        })) || [];
        
        console.log("Stock inicial mapeado:", stockInicial);
        
        // 3. Cargar precio actual del producto
        const { data: priceData } = await supabase
          .from('product_prices')
          .select('price, compare_price')
          .eq('product_id', producto.id)
          .order('effective_from', { ascending: false })
          .limit(1)
          .maybeSingle();

        // 4. Cargar costo actual del producto
        const { data: costData } = await supabase
          .from('product_costs')
          .select('cost')
          .eq('product_id', producto.id)
          .order('effective_from', { ascending: false })
          .limit(1)
          .maybeSingle();

        // 5. Cargar impuesto asignado al producto
        const { data: taxData } = await supabase
          .from('product_tax_relations')
          .select('tax_id')
          .eq('product_id', producto.id)
          .maybeSingle();

        // 6. Cargar notas del producto
        const { data: notesData } = await supabase
          .from('product_notes')
          .select('note')
          .eq('product_id', producto.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // 7. Cargar etiquetas del producto
        const { data: tagsData } = await supabase
          .from('product_tag_relations')
          .select('tag_id')
          .eq('product_id', producto.id);
        
        const tagIds = tagsData?.map((t: any) => t.tag_id) || [];

        // 8. Cargar proveedor principal del producto
        const { data: supplierData } = await supabase
          .from('product_suppliers')
          .select('supplier_id')
          .eq('product_id', producto.id)
          .eq('is_preferred', true)
          .maybeSingle();

        // 9. Cargar imágenes existentes del producto
        const { data: imagesData } = await supabase
          .from('product_images')
          .select('id, storage_path, is_primary, alt_text')
          .eq('product_id', producto.id)
          .order('display_order', { ascending: true });

        const images = (imagesData || []).map((img: any) => {
          const bucket = img.storage_path?.startsWith('products/') ? 'product-images' : 'organization_images';
          const { data: urlData } = supabase.storage
            .from(bucket)
            .getPublicUrl(img.storage_path);
          return {
            id: img.id,
            url: urlData?.publicUrl || '/placeholder-image.png',
            storagePath: img.storage_path,
            is_primary: img.is_primary || false
          };
        });

        // 10. Configurar valores iniciales en el formulario
        form.reset({
          sku: producto.sku,
          barcode: producto.barcode || '',
          name: producto.name,
          description: producto.description || '',
          category_id: producto.category_id,
          unit_code: producto.unit_code?.trim() || '',
          supplier_id: supplierData?.supplier_id || undefined,
          station: producto.station || null,
          cost: costData?.cost || 0,
          price: priceData?.price || 0,
          compare_price: priceData?.compare_price || 0,
          tax_id: taxData?.tax_id || '',
          track_stock: true,
          status: producto.status || 'active',
          stock_inicial: stockInicial,
          images,
          notes: notesData?.note || '',
          tags: tagIds,
          has_variants: producto.is_parent || false,
          variants: []
        });
        
      } catch (error: any) {
        console.error('Error al cargar producto:', error);
        toast({
          title: "Error",
          description: error.message || "No se pudo cargar el producto",
          variant: "destructive",
        });
        router.push('/app/inventario/productos');
      } finally {
        setInitialLoading(false);
      }
    };
    
    cargarProducto();
  }, [productoUuid, organization_id, form, toast, router]);

  // Función para actualizar el producto
  // Función principal de guardado que se ejecuta desde el botón manual
  const onSubmit = async (data: ProductoFormData) => {
    // Asegurar que isLoading está activado
    setIsLoading(true);
    
    // Crear ID para seguimiento en logs
    const saveId = `save-${Date.now()}`;
    console.log(`[${saveId}] Iniciando proceso de guardado de producto`);
    
    // Mostrar notificación de proceso iniciado
    toast({
      title: "Guardando",
      description: "Procesando datos del producto...",
    });
    if (!organization_id) {
      toast({
        title: "Error",
        description: "No se ha seleccionado una organización",
        variant: "destructive"
      });
      return;
    }

    if (!productoId) {
      toast({
        title: "Error",
        description: "No se ha identificado el producto a actualizar",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    console.log("Datos del formulario a guardar:", data);
    
    try {
      // 1. Actualizar los datos principales del producto
      const productoData = {
        ...data,
        organization_id
      };
      
      // Eliminar campos que no corresponden a la tabla de productos
      delete productoData.stock_inicial;
      
      // Actualizar el producto
      const { error } = await supabase
        .from('products')
        .update(productoData)
        .eq('id', productoId)
        .eq('organization_id', organization_id);
        
      if (error) throw error;
      
      console.log("Datos principales del producto actualizados correctamente");
      
      // 2. Imágenes se manejan a través de formData (no requiere ref)
      
      // 3. Variantes, notas y etiquetas se manejan a través de formData (no requiere refs)
      
      // 4. Actualizar el stock del producto principal (sin variantes)
      if (data.stock_inicial && Array.isArray(data.stock_inicial) && data.stock_inicial.length > 0) {
        console.log('Actualizando stock del producto...', data.stock_inicial);
        
        try {
          // Para cada elemento de stock, verificar si ya existe y actualizarlo o crearlo
          for (const stockItem of data.stock_inicial) {
            if (!stockItem.branch_id) continue; // Ignorar items sin sucursal
            
            // Verificar si ya existe un registro para esta sucursal y producto
            const { data: existingStock, error: stockQueryError } = await supabase
              .from('stock_levels')
              .select('id')
              .eq('product_id', productoId)
              .eq('branch_id', stockItem.branch_id)
              .is('variant_id', null) // Solo stock del producto principal, no de variantes
              .maybeSingle();
            
            if (stockQueryError) throw stockQueryError;
            
            if (existingStock) {
              // Actualizar stock existente
              const { error: updateStockError } = await supabase
                .from('stock_levels')
                .update({
                  qty_on_hand: stockItem.qty_on_hand || 0,
                  avg_cost: stockItem.avg_cost || 0
                })
                .eq('id', existingStock.id);
              
              if (updateStockError) throw updateStockError;
            } else {
              // Crear nuevo registro de stock
              const { error: insertStockError } = await supabase
                .from('stock_levels')
                .insert({
                  product_id: productoId,
                  branch_id: stockItem.branch_id,
                  qty_on_hand: stockItem.qty_on_hand || 0,
                  avg_cost: stockItem.avg_cost || 0
                });
              
              if (insertStockError) throw insertStockError;
            }
          }
          
          console.log('Stock actualizado correctamente');
        } catch (stockError: any) {
          console.error('Error al actualizar stock:', stockError);
          throw new Error(`Error al actualizar stock: ${stockError.message || 'Error desconocido'}`);
        }
      }
      
      // Mostrar mensaje de éxito
      toast({
        title: "Éxito",
        description: "Producto actualizado correctamente",
      });
      
      // Redireccionar a los detalles del producto usando UUID
      setTimeout(() => {
        router.push(`/app/inventario/productos/${productoUuid}`);
      }, 1500);
      
    } catch (error: any) {
      console.error('Error al actualizar el producto:', error);
      
      toast({
        title: "Error",
        description: error.message || "Ocurrió un error al actualizar el producto",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full overflow-hidden">
      <CardContent className="p-3 sm:p-4">
        {initialLoading ? (
          <div className="space-y-6">
            {/* Skeleton header */}
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            {/* Skeleton grid de inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
            {/* Skeleton sección de precios */}
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
            {/* Skeleton botones */}
            <div className="flex justify-end gap-2 pt-4">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-32" />
            </div>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={(e) => { e.preventDefault(); }} className="space-y-4">
              <div className="grid gap-4 max-w-full overflow-hidden">
                <InformacionBasica formData={formData} updateFormData={updateFormData} />
                <PrecionyCostos formData={formData} updateFormData={updateFormData} />
                <Inventario formData={formData} updateFormData={updateFormData} />
                <Imagenes formData={formData} updateFormData={updateFormData} />
                <Variantes formData={formData} updateFormData={updateFormData} />
                
                <Notas formData={formData} updateFormData={updateFormData} />

                <Etiquetas formData={formData} updateFormData={updateFormData} />
                
                {/* Indicador de carga durante el guardado */}
                {isLoading && (
                  <div className="flex items-center justify-center p-2 mb-4 bg-blue-50 dark:bg-blue-900/30 rounded-md text-blue-700 dark:text-blue-300 text-sm">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Procesando datos del producto...
                  </div>
                )}
                
                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:space-x-4 mt-8">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => router.back()}
                    className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="button" 
                    disabled={isLoading}
                    onClick={async () => {
                      console.log("Botón Guardar Cambios clickeado");
                      
                      try {
                        // Obtener datos del formulario
                        const formData = form.getValues();
                        
                        // Validación manual básica
                        if (!formData.name || !formData.sku || !formData.unit_code) {
                          toast({
                            title: "Datos incompletos",
                            description: "Por favor complete los campos obligatorios (Nombre, SKU y Unidad)",
                            variant: "destructive"
                          });
                          return;
                        }
                        
                        // Verificar organización y producto
                        if (!organization_id || !productoId) {
                          toast({
                            title: "Error",
                            description: "No se puede guardar: falta ID de organización o producto",
                            variant: "destructive"
                          });
                          return;
                        }
                        
                        console.log("Datos a guardar:", formData);
                        // Proceder con el guardado
                        await onSubmit(formData);
                        
                      } catch (error: any) {
                        console.error("Error al procesar el guardado:", error);
                        toast({
                          title: "Error inesperado",
                          description: error?.message || "Ha ocurrido un error al guardar los cambios",
                          variant: "destructive"
                        });
                        setIsLoading(false);
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      'Guardar Cambios'
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
