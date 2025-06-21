"use client"

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { v4 as uuidv4 } from 'uuid'

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
  track_stock: z.boolean().default(true),
  status: z.string().default('active'),
  stock_inicial: z.array(
    z.object({
      branch_id: z.number(),
      qty_on_hand: z.number().min(0),
      avg_cost: z.number().min(0).optional(),
      lot_id: z.number().optional()
    })
  ).optional(),

  // No se incluye datos de variantes e imágenes en el schema principal
  // porque se manejarán por separado
});

// Tipo para los datos del formulario
type ProductoFormData = z.infer<typeof productoSchema>;

export default function FormularioProducto() {
  const { toast } = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  
  // Referencias a componentes hijos para acceder a sus datos
  const imagenesRef = useRef<any>(null);
  const variantesRef = useRef<any>(null);
  
  // Obtener la organización activa del localStorage
  const getOrganizacionActiva = () => {
    if (typeof window !== 'undefined') {
      const orgData = localStorage.getItem('organizacionActiva');
      return orgData ? JSON.parse(orgData) : null;
    }
    return null;
  };
  
  const organizacion = getOrganizacionActiva();
  const organization_id = organizacion?.id;
  
  // Configurar el formulario
  const form = useForm<ProductoFormData>({
    resolver: zodResolver(productoSchema),
    defaultValues: {
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
      // Agregar el ID de organización a los datos
      const productoData = {
        ...data,
        organization_id
      };
      
      // Extraer los datos de stock inicial antes de guardar el producto
      const stockInicial = productoData.stock_inicial || [];
      delete productoData.stock_inicial;
      
      // Obtener imágenes del componente de imágenes
      const imagenes = imagenesRef.current?.getImagenes() || [];
      
      // Obtener variantes del componente de variantes
      const variantes = variantesRef.current?.getVariantes() || [];
      
      // 1. Insertar el producto
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
          source: 'initial',
          source_id: producto.id,
          note: 'Stock inicial'
        }));
        
        if (movimientosData.length > 0) {
          const { error: movError } = await supabase
            .from('stock_movements')
            .insert(movimientosData);
            
          if (movError) throw movError;
        }
      }
      
      // 4. Guardar imágenes del producto
      if (imagenes.length > 0 && producto) {
        const imagenesData = imagenes.map((img: any, index: number) => ({
          product_id: producto.id,
          image_url: img.url,
          storage_path: img.path,
          display_order: index,
          is_primary: index === 0,  // La primera imagen es la principal
          alt_text: `${producto.name} - Imagen ${index + 1}`
        }));
        
        const { error: imgError } = await supabase
          .from('product_images')
          .insert(imagenesData);
          
        if (imgError) {
          console.error('Error al guardar imágenes:', imgError);
          // No lanzamos error para no interrumpir el flujo principal
        }
      }
      
      // 5. Guardar variantes del producto
      if (variantes.length > 0 && producto) {
        for (const variante of variantes) {
          // Insertar la variante
          const { data: varData, error: varError } = await supabase
            .from('product_variants')
            .insert({
              product_id: producto.id,
              sku: variante.sku,
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
          
          // Registrar stock inicial de la variante si es necesario
          if (variante.stock_quantity && variante.stock_quantity > 0) {
            // Usamos la primera sucursal disponible para el stock inicial de la variante
            const defaultBranchId = stockInicial.length > 0 ? stockInicial[0].branch_id : null;
            
            if (defaultBranchId) {
              await supabase.from('stock_levels').insert({
                product_id: producto.id,
                branch_id: defaultBranchId,
                qty_on_hand: variante.stock_quantity,
                avg_cost: variante.cost || productoData.cost || 0
              });
              
              await supabase.from('stock_movements').insert({
                product_id: producto.id,
                organization_id,
                branch_id: defaultBranchId,
                direction: 'in',
                qty: variante.stock_quantity,
                unit_cost: variante.cost || productoData.cost || 0,
                source: 'initial_variant',
                source_id: varData.id,
                note: `Stock inicial variante ${variante.sku}`
              });
            }
          }
        }
      }
      
      toast({
        title: "Éxito",
        description: "Producto creado correctamente",
      });
      
      // Redirigir a la página de detalle
      router.push(`/app/inventario/productos/${producto.id}`);
      
    } catch (error: any) {
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
    <Card className="w-full">
      <CardContent className="p-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4">
              <InformacionBasica form={form} />
              <PrecionyCostos form={form} />
              <Inventario form={form} />
              <Imagenes ref={imagenesRef} />
              <Variantes ref={variantesRef} />
              
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
  );
}
