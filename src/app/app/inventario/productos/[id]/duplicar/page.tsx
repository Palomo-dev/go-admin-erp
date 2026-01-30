'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { ArrowLeft, Copy, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

interface DuplicateOptions {
  duplicateVariants: boolean;
  duplicatePrices: boolean;
  duplicateCosts: boolean;
  duplicateImages: boolean;
  duplicateTags: boolean;
  duplicateTaxes: boolean;
  newSku: string;
  newName: string;
}

export default function DuplicarProductoPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  
  // useParams() ya devuelve el objeto con los parámetros
  // El id ahora es un UUID (string)
  const productoUuid = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [duplicating, setDuplicating] = useState(false);
  const [producto, setProducto] = useState<any>(null);
  const [options, setOptions] = useState<DuplicateOptions>({
    duplicateVariants: true,
    duplicatePrices: true,
    duplicateCosts: true,
    duplicateImages: true,
    duplicateTags: true,
    duplicateTaxes: true,
    newSku: '',
    newName: '',
  });

  useEffect(() => {
    const fetchProducto = async () => {
      if (!productoUuid || !organization?.id) return;

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('products')
          .select(`
            *,
            categories(id, name),
            children:products(id, uuid, sku, name, variant_data)
          `)
          .eq('uuid', productoUuid)
          .eq('organization_id', organization.id)
          .single();

        if (error) throw error;

        setProducto(data);
        setOptions(prev => ({
          ...prev,
          newSku: `${data.sku}-COPY`,
          newName: `${data.name} (Copia)`,
        }));
      } catch (error: any) {
        console.error('Error al cargar el producto:', error);
        toast({
          title: 'Error',
          description: 'No se pudo cargar el producto',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchProducto();
  }, [productoUuid, organization?.id]);

  const handleDuplicate = async () => {
    if (!producto || !organization?.id) return;

    try {
      setDuplicating(true);

      // 1. Crear el producto duplicado
      const { data: newProduct, error: productError } = await supabase
        .from('products')
        .insert({
          organization_id: organization.id,
          sku: options.newSku,
          name: options.newName,
          category_id: producto.category_id,
          unit_code: producto.unit_code,
          description: producto.description,
          barcode: null, // No duplicar código de barras
          status: 'active',
          is_parent: producto.is_parent,
          parent_product_id: null,
          variant_data: producto.variant_data,
        })
        .select()
        .single();

      if (productError) throw productError;

      // 2. Duplicar variantes si aplica
      if (options.duplicateVariants && producto.is_parent && producto.children?.length > 0) {
        for (const variant of producto.children) {
          const variantSku = variant.sku.replace(producto.sku, options.newSku);
          const { error: variantError } = await supabase
            .from('products')
            .insert({
              organization_id: organization.id,
              sku: variantSku,
              name: variant.name.replace(producto.name, options.newName),
              category_id: producto.category_id,
              unit_code: producto.unit_code,
              description: producto.description,
              status: 'active',
              is_parent: false,
              parent_product_id: newProduct.id,
              variant_data: variant.variant_data,
            });

          if (variantError) {
            console.error('Error duplicando variante:', variantError);
          }
        }
      }

      // 3. Duplicar precios si aplica
      if (options.duplicatePrices) {
        const { data: prices } = await supabase
          .from('product_prices')
          .select('*')
          .eq('product_id', producto.id)
          .is('effective_to', null);

        if (prices && prices.length > 0) {
          for (const price of prices) {
            await supabase.from('product_prices').insert({
              product_id: newProduct.id,
              price: price.price,
              effective_from: new Date().toISOString(),
            });
          }
        }
      }

      // 4. Duplicar costos si aplica
      if (options.duplicateCosts) {
        const { data: costs } = await supabase
          .from('product_costs')
          .select('*')
          .eq('product_id', producto.id)
          .is('effective_to', null);

        if (costs && costs.length > 0) {
          for (const cost of costs) {
            await supabase.from('product_costs').insert({
              product_id: newProduct.id,
              cost: cost.cost,
              effective_from: new Date().toISOString(),
            });
          }
        }
      }

      // 5. Duplicar imágenes si aplica
      if (options.duplicateImages) {
        const { data: images } = await supabase
          .from('product_images')
          .select('*')
          .eq('product_id', producto.id);

        if (images && images.length > 0) {
          for (const image of images) {
            await supabase.from('product_images').insert({
              product_id: newProduct.id,
              storage_path: image.storage_path,
              is_primary: image.is_primary,
            });
          }
        }
      }

      // 6. Duplicar tags si aplica
      if (options.duplicateTags) {
        const { data: tagRelations } = await supabase
          .from('product_tag_relations')
          .select('*')
          .eq('product_id', producto.id);

        if (tagRelations && tagRelations.length > 0) {
          for (const relation of tagRelations) {
            await supabase.from('product_tag_relations').insert({
              product_id: newProduct.id,
              tag_id: relation.tag_id,
            });
          }
        }
      }

      // 7. Duplicar impuestos si aplica
      if (options.duplicateTaxes) {
        const { data: taxRelations } = await supabase
          .from('product_tax_relations')
          .select('*')
          .eq('product_id', producto.id);

        if (taxRelations && taxRelations.length > 0) {
          for (const relation of taxRelations) {
            await supabase.from('product_tax_relations').insert({
              product_id: newProduct.id,
              tax_id: relation.tax_id,
            });
          }
        }
      }

      toast({
        title: 'Producto duplicado',
        description: `Se ha creado "${options.newName}" correctamente`,
      });

      // Redirigir usando el UUID del nuevo producto
      router.push(`/app/inventario/productos/${newProduct.uuid}`);
    } catch (error: any) {
      console.error('Error duplicando producto:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo duplicar el producto',
        variant: 'destructive',
      });
    } finally {
      setDuplicating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-lg">Cargando producto...</span>
      </div>
    );
  }

  if (!producto) {
    return (
      <div className="flex h-[50vh] w-full flex-col items-center justify-center">
        <div className="rounded-lg bg-red-100 p-4 text-red-800 dark:bg-red-900/30 dark:text-red-400">
          <h3 className="text-lg font-semibold">Producto no encontrado</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href={`/app/inventario/productos/${productoUuid}`}>
              <Button variant="ghost" size="sm" className="text-gray-600 dark:text-gray-400">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver al producto
              </Button>
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Copy className="h-6 w-6 text-blue-600" />
            Duplicar Producto
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Crear una copia de <strong>{producto.name}</strong> ({producto.sku})
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Información del nuevo producto */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Nuevo Producto</CardTitle>
            <CardDescription>Define el SKU y nombre del producto duplicado</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newSku">Nuevo SKU *</Label>
              <Input
                id="newSku"
                value={options.newSku}
                onChange={(e) => setOptions({ ...options, newSku: e.target.value })}
                placeholder="Ingrese el nuevo SKU"
                className="dark:bg-gray-900 dark:border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newName">Nuevo Nombre *</Label>
              <Input
                id="newName"
                value={options.newName}
                onChange={(e) => setOptions({ ...options, newName: e.target.value })}
                placeholder="Ingrese el nuevo nombre"
                className="dark:bg-gray-900 dark:border-gray-700"
              />
            </div>
          </CardContent>
        </Card>

        {/* Opciones de duplicación */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white">Opciones de Duplicación</CardTitle>
            <CardDescription>Selecciona qué elementos deseas copiar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {producto.is_parent && producto.children?.length > 0 && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="duplicateVariants"
                  checked={options.duplicateVariants}
                  onCheckedChange={(checked) => 
                    setOptions({ ...options, duplicateVariants: checked as boolean })
                  }
                />
                <Label htmlFor="duplicateVariants" className="text-sm font-normal cursor-pointer">
                  Duplicar variantes ({producto.children.length} variantes)
                </Label>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Checkbox
                id="duplicatePrices"
                checked={options.duplicatePrices}
                onCheckedChange={(checked) => 
                  setOptions({ ...options, duplicatePrices: checked as boolean })
                }
              />
              <Label htmlFor="duplicatePrices" className="text-sm font-normal cursor-pointer">
                Duplicar precios vigentes
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="duplicateCosts"
                checked={options.duplicateCosts}
                onCheckedChange={(checked) => 
                  setOptions({ ...options, duplicateCosts: checked as boolean })
                }
              />
              <Label htmlFor="duplicateCosts" className="text-sm font-normal cursor-pointer">
                Duplicar costos vigentes
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="duplicateImages"
                checked={options.duplicateImages}
                onCheckedChange={(checked) => 
                  setOptions({ ...options, duplicateImages: checked as boolean })
                }
              />
              <Label htmlFor="duplicateImages" className="text-sm font-normal cursor-pointer">
                Duplicar imágenes
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="duplicateTags"
                checked={options.duplicateTags}
                onCheckedChange={(checked) => 
                  setOptions({ ...options, duplicateTags: checked as boolean })
                }
              />
              <Label htmlFor="duplicateTags" className="text-sm font-normal cursor-pointer">
                Duplicar etiquetas
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="duplicateTaxes"
                checked={options.duplicateTaxes}
                onCheckedChange={(checked) => 
                  setOptions({ ...options, duplicateTaxes: checked as boolean })
                }
              />
              <Label htmlFor="duplicateTaxes" className="text-sm font-normal cursor-pointer">
                Duplicar configuración de impuestos
              </Label>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <strong>Nota:</strong> El stock inicial será 0 en todas las sucursales. 
                El código de barras no se duplicará.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Botones de acción */}
      <div className="flex justify-end gap-3">
        <Link href={`/app/inventario/productos/${productoUuid}`}>
          <Button variant="outline">Cancelar</Button>
        </Link>
        <Button
          onClick={handleDuplicate}
          disabled={duplicating || !options.newSku || !options.newName}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {duplicating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Duplicando...
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-2" />
              Duplicar Producto
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
