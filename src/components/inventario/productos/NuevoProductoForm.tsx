'use client';

import React, { useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { X, Loader2, Save, Image as ImageIcon, Plus, Trash } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { v4 as uuidv4 } from 'uuid';

// UI Components
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

// Define schema for form validation
const productoSchema = z.object({
  sku: z.string().min(1, { message: 'El SKU es requerido' }),
  name: z.string().min(2, { message: 'El nombre debe tener al menos 2 caracteres' }),
  description: z.string().optional(),
  category_id: z.string().min(1, { message: 'Selecciona una categoría' }),
  unit_code: z.string().min(1, { message: 'Selecciona una unidad de medida' }),
  supplier_id: z.string().optional(),
  barcode: z.string().optional(),
  status: z.string().default('active'),
  // is_menu_item field removed - not in database
  price: z.coerce.number().min(0, { message: 'El precio debe ser un número positivo' }),
  cost: z.coerce.number().min(0, { message: 'El costo debe ser un número positivo' }),
  track_stock: z.boolean().default(true),
  initial_stock: z.coerce.number().min(0).optional(),
  selected_branch_id: z.string().optional(),
});

type ProductoFormValues = z.infer<typeof productoSchema>;

interface Category {
  id: number;
  name: string;
}

interface Unit {
  code: string;
  name: string;
}

interface Branch {
  id: number;
  name: string;
}

interface Supplier {
  id: number;
  name: string;
}

interface ImagePreview {
  id: string;
  file: File | null;
  url: string;
  is_primary: boolean;
  isExisting?: boolean;
  sourcePath?: string;
}

const NuevoProductoForm = () => {
  const { theme } = useTheme();
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  
  // States for data loading
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  
  // States for form handling
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imageList, setImageList] = useState<ImagePreview[]>([]);
  const [imageSource, setImageSource] = useState<'upload' | 'organization' | 'shared'>('upload');
  const [sharedImages, setSharedImages] = useState<Array<{name: string, url: string}>>([]);
  const [organizationImages, setOrganizationImages] = useState<Array<{name: string, url: string, path: string}>>([]);
  const [loadingImages, setLoadingImages] = useState(false);

  // Initialize form
  const form = useForm<ProductoFormValues>({
    resolver: zodResolver(productoSchema) as any,
    defaultValues: {
      sku: '',
      name: '',
      description: '',
      category_id: '',
      unit_code: '',
      supplier_id: '',
      barcode: '',
      status: 'active',
      // is_menu_item removed - field doesn't exist in database
      price: 0,
      cost: 0,
      track_stock: true, // Always true, not optional
      initial_stock: 0,
      selected_branch_id: '',
    },
  });
  
  // Load images from shared repository
  const loadSharedImages = async () => {
    if (!organization?.id) return;
  
    try {
      setLoadingImages(true);
  
      // List all files in the 'shared_images' bucket root
      const { data, error } = await supabase.storage
        .from('shared_images')
        .list('', { limit: 100, offset: 0 });

      console.log('Shared images:', data);
  
      if (error) {
        console.error('Error loading shared images:', error);
        toast({
          title: 'Error',
          description: 'No se pudieron cargar las imágenes compartidas.',
          variant: 'destructive',
        });
        return;
      }
  
      if (data) {
        const images = data
          .filter(item => item && item.name && !item.name.endsWith('/')) // Filter out folders
          .map(item => {
            const { data: publicData } = supabase.storage
              .from('shared_images')
              .getPublicUrl(item.name);
  
            return {
              name: item.name,
              url: publicData.publicUrl,
            };
          });
  
        setSharedImages(images);
      }
    } catch (error) {
      console.error('Error in loadSharedImages:', error);
    } finally {
      setLoadingImages(false);
    }
  };
  
  
  // Load images from organization repository
  const loadOrganizationImages = async () => {
    if (!organization?.id) return;
    
    try {
      setLoadingImages(true);
      
      // Get previously uploaded product images for this organization
      const { data: productImages, error: imagesError } = await supabase
        .from('product_images')
        .select('storage_path, storage_path, product_id, products(organization_id)')
        .eq('products.organization_id', organization.id);

      console.log('Product images:', productImages);
      
      if (imagesError) {
        console.error('Error loading organization images:', imagesError);
        return;
      }
      
      if (productImages) {
        const processedImages = await Promise.all(
          productImages.map(async (item) => {
            const { data: { publicUrl } } = supabase.storage
              .from('organization_images')
              .getPublicUrl(item.storage_path);
            
            return {
              name: item.file_name,
              url: publicUrl,
              path: item.storage_path
            };
          })
        );
        
        setOrganizationImages(processedImages);
      }
    } catch (error) {
      console.error('Error in loadOrganizationImages:', error);
    } finally {
      setLoadingImages(false);
    }
  };

  // Handle selection of a shared or organization image
  const selectExistingImage = (imageUrl: string, imageName: string, imagePath?: string) => {
    // Create a preview from the existing image
    const newImage = {
      id: uuidv4(),
      file: null, // No file for existing images
      url: imageUrl,
      is_primary: imageList.length === 0, // First image is primary by default
      isExisting: true,
      sourcePath: imagePath || `shared_images/${imageName}`
    };
    
    setImageList(prev => [...prev, newImage]);
    
    toast({
      title: 'Imagen seleccionada',
      description: 'La imagen se ha añadido a la lista.',
    });
  };

  // Load reference data when component mounts
  useEffect(() => {
    const loadData = async () => {
      if (!organization?.id) return;
      
      try {
        setLoadingData(true);
        
        // Load categories
        const { data: categoriesData } = await supabase
          .from('categories')
          .select('id, name')
          .eq('organization_id', organization.id)
          .order('name');
        
        if (categoriesData) {
          setCategories(categoriesData);
        }
        
        // Load units
        const { data: unitsData } = await supabase
          .from('units')
          .select('code, name')
          .order('name');
        
        if (unitsData) {
          setUnits(unitsData);
        }
        
        // Load branches
        const { data: branchesData } = await supabase
          .from('branches')
          .select('id, name')
          .eq('organization_id', organization.id)
          .order('name');
        
        if (branchesData) {
          setBranches(branchesData);
          // Set default branch if available
          if (branchesData.length > 0) {
            form.setValue('selected_branch_id', branchesData[0].id.toString());
          }
        }
        
        // Load suppliers
        const { data: suppliersData } = await supabase
          .from('suppliers')
          .select('id, name')
          .eq('organization_id', organization.id)
          .order('name');
        
        if (suppliersData) {
          setSuppliers(suppliersData);
        }
      } catch (error) {
        console.error('Error al cargar datos de referencia:', error);
        toast({
          title: 'Error',
          description: 'No se pudieron cargar los datos necesarios. Intente nuevamente.',
          variant: 'destructive',
        });
      } finally {
        setLoadingData(false);
      }
    };
    
    loadData();
  }, [organization?.id, form, toast]);

  // Load shared and organization images when needed
  useEffect(() => {
    if (imageSource === 'shared') {
      loadSharedImages();
    } else if (imageSource === 'organization') {
      loadOrganizationImages();
    }
  }, [imageSource, organization?.id]);
  
  // Handle image uploads from local device
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    // Create preview for each file
    Array.from(files).forEach(file => {
      // Validate file is an image
      if (!file.type.startsWith('image/')) {
        toast({
          title: 'Error',
          description: `${file.name} no es una imagen válida.`,
          variant: 'destructive',
        });
        return;
      }
      
      // Create preview URL
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          setImageList(prev => [
            ...prev, 
            {
              id: uuidv4(),
              file,
              url: result,
              is_primary: prev.length === 0 // First image is primary by default
            }
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
    
    // Reset input value to allow selecting the same file again
    event.target.value = '';
  };
  
  const removeImage = (id: string) => {
    // If removing primary image, set next image as primary if available
    const removingPrimary = imageList.find(img => img.id === id)?.is_primary || false;
    const remainingImages = imageList.filter(img => img.id !== id);
    
    if (removingPrimary && remainingImages.length > 0) {
      remainingImages[0].is_primary = true;
    }
    
    setImageList(remainingImages);
  };
  
  const setPrimaryImage = (id: string) => {
    setImageList(prev => 
      prev.map(img => ({
        ...img,
        is_primary: img.id === id
      }))
    );
  };
  
  // Submit handler for the form
  const onSubmit = async (values: ProductoFormValues) => {
    if (!organization?.id) {
      toast({
        title: 'Error',
        description: 'No se pudo identificar la organización.',
        variant: 'destructive',
      });
      return;
    }
    
    setLoading(true);
    
    try {
      const now = new Date().toISOString();
      
      // Step 1: Insert the main product record
      const { data: productData, error: productError } = await supabase
        .from('products')
        .insert({
          organization_id: organization.id,
          sku: values.sku,
          name: values.name,
          description: values.description || '',
          category_id: parseInt(values.category_id),
          unit_code: values.unit_code,
          supplier_id: values.supplier_id ? parseInt(values.supplier_id) : null,
          barcode: values.barcode || null,
          status: values.status
          // is_menu_item field removed - column doesn't exist in database
        })
        .select('id')
        .single();
      
      if (productError) throw new Error(`Error al crear producto: ${productError.message}`);
      if (!productData) throw new Error('No se pudo crear el producto.');
      
      const productId = productData.id;
      
      // Step 2: Insert initial price
      const { error: priceError } = await supabase
        .from('product_prices')
        .insert({
          product_id: productId,
          price: values.price,
          effective_from: now,
          effective_to: null
        });
      
      if (priceError) throw new Error(`Error al registrar precio: ${priceError.message}`);
      
      // Step 3: Insert initial cost
      const { error: costError } = await supabase
        .from('product_costs')
        .insert({
          product_id: productId,
          cost: values.cost,
          effective_from: now,
          effective_to: null
        });
      
      if (costError) throw new Error(`Error al registrar costo: ${costError.message}`);
      
      // Step 4: Set up initial stock if tracking stock
      if (values.track_stock && values.initial_stock && values.initial_stock > 0 && values.selected_branch_id) {
        const { error: stockError } = await supabase
          .from('stock_levels')
          .insert({
            product_id: productId,
            branch_id: parseInt(values.selected_branch_id),
            qty_on_hand: values.initial_stock,
            qty_reserved: 0
          });
        
        if (stockError) throw new Error(`Error al registrar stock: ${stockError.message}`);
      }
      
      // Step 5: Upload images if any
      if (imageList.length > 0) {
        setUploadingImages(true);
        
        for (const image of imageList) {
          if (image.isExisting) {
            // If using an existing image, just create the reference
            await supabase
              .from('product_images')
              .insert({
                product_id: productId,
                storage_path: image.sourcePath || '',
                file_name: image.sourcePath ? image.sourcePath.split('/').pop() || 'image' : 'image',
                file_type: 'image/jpeg', // Assuming JPEG for existing images
                size: 0, // Size unknown for existing images
                is_primary: image.is_primary
              });
          } else if (image.file) {
            // Upload new image to storage
            const filePath = `product-images/${organization.id}/${productId}/${Date.now()}-${image.file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            
            const { error: uploadError } = await supabase.storage
              .from('products')
              .upload(filePath, image.file);
            
            if (uploadError) {
              console.error('Error uploading image:', uploadError);
              continue;
            }
            
            // Register in product_images table
            await supabase
              .from('product_images')
              .insert({
                product_id: productId,
                storage_path: filePath,
                file_name: image.file.name,
                file_type: image.file.type,
                size: image.file.size,
                is_primary: image.is_primary
              });
          }
        }
        
        setUploadingImages(false);
      }
      
      // Update the product record with the price and cost
      await supabase
        .from('products')
        .update({
          price: values.price,
          cost: values.cost
        })
        .eq('id', productId);
      
      toast({
        title: 'Producto creado',
        description: `${values.name} ha sido creado exitosamente.`,
      });
      
      // Redirect to the product detail page
      router.push(`/app/inventario/productos/${productId}`);
      
    } catch (error: any) {
      console.error('Error al crear producto:', error);
      toast({
        title: 'Error',
        description: error.message || 'Ocurrió un error al crear el producto.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className={`w-full ${theme === 'dark' ? 'text-white' : ''}`}>
      <Card className={theme === 'dark' ? 'bg-gray-900 border-gray-800' : ''}>  
        <CardHeader>
          <CardTitle>Nuevo Producto</CardTitle>
          <CardDescription>Completa los detalles para crear un nuevo producto.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-visible">
          {loadingData ? (
            <div className="flex justify-center items-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Cargando datos...</p>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-6 overflow-visible">
                {/* Sección de Información General */}
                <div className="space-y-4 border-b pb-6">
                  <h3 className="text-lg font-semibold mb-4">Información General</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control as any}
                        name="sku"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>SKU *</FormLabel>
                            <FormControl>
                              <Input placeholder="SKU del producto" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control as any}
                        name="barcode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Código de barras</FormLabel>
                            <FormControl>
                              <Input placeholder="Código de barras (opcional)" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre *</FormLabel>
                          <FormControl>
                            <Input placeholder="Nombre del producto" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Descripción</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Descripción detallada del producto" 
                              className="min-h-[100px]" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control as any}
                        name="category_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Categoría *</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecciona una categoría" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {categories.map((category) => (
                                  <SelectItem 
                                    key={category.id} 
                                    value={category.id.toString()}
                                  >
                                    {category.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control as any}
                        name="unit_code"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Unidad de medida *</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecciona una unidad" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {units.map((unit) => (
                                  <SelectItem 
                                    key={unit.code} 
                                    value={unit.code}
                                  >
                                    {unit.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control as any}
                        name="supplier_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Proveedor</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecciona un proveedor (opcional)" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {suppliers.map((supplier) => (
                                  <SelectItem 
                                    key={supplier.id} 
                                    value={supplier.id.toString()}
                                  >
                                    {supplier.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control as any}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Estado</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecciona un estado" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="active">Activo</SelectItem>
                                <SelectItem value="inactive">Inactivo</SelectItem>
                                <SelectItem value="discontinued">Descontinuado</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    {/* is_menu_item field removed - column doesn't exist in database */}
                </div>
                
                {/* Sección de Inventario y Precios */}
                <div className="space-y-4 border-b pb-6">
                  <h3 className="text-lg font-semibold mb-4">Inventario y Precios</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control as any}
                        name="price"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Precio de venta *</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                min="0" 
                                step="0.01" 
                                placeholder="0.00" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control as any}
                        name="cost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Costo *</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                min="0" 
                                step="0.01" 
                                placeholder="0.00" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <Separator className="my-4" />
                    
                    {/* Stock control is always enabled */}
                    <div className="space-y-0.5 mb-4">
                      <h4 className="text-sm font-medium">Inventario Inicial</h4>
                      <p className="text-sm text-muted-foreground">
                        Configure el inventario inicial para este producto.
                      </p>
                    </div>
                    
                    {(
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg mt-4">
                        <FormField
                          control={form.control as any}
                          name="initial_stock"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Stock inicial</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number" 
                                  min="0" 
                                  step="1" 
                                  placeholder="0" 
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control as any}
                          name="selected_branch_id"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Sucursal</FormLabel>
                              <Select 
                                onValueChange={field.onChange} 
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecciona una sucursal" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {branches.map((branch) => (
                                    <SelectItem 
                                      key={branch.id} 
                                      value={branch.id.toString()}
                                    >
                                      {branch.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                </div>
                
                {/* Sección de Imágenes */}
                <div className="space-y-4 border-b pb-6">
                  <h3 className="text-lg font-semibold mb-4">Imágenes del Producto</h3>
                  <div className="border rounded-lg">
                    <div className="p-4 border-b">
                      <FormLabel className="font-medium">Imágenes del producto</FormLabel>
                      <FormDescription>
                        Puedes subir múltiples imágenes o seleccionar imágenes existentes. La imagen primaria se usará como miniatura.
                      </FormDescription>
                    </div>
                    
                    {/* Image source selection tabs */}
                    <div className="p-4 flex flex-wrap gap-2 border-b bg-gray-50">
                      <Button 
                        type="button" 
                        variant={imageSource === 'upload' ? 'default' : 'outline'}
                        onClick={() => setImageSource('upload')}
                        className="flex items-center"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Subir Nuevas
                      </Button>
                      <Button 
                        type="button" 
                        variant={imageSource === 'organization' ? 'default' : 'outline'}
                        onClick={() => setImageSource('organization')}
                        className="flex items-center"
                      >
                        <ImageIcon className="mr-2 h-4 w-4" />
                        De la Organización
                      </Button>
                      <Button 
                        type="button" 
                        variant={imageSource === 'shared' ? 'default' : 'outline'}
                        onClick={() => setImageSource('shared')}
                        className="flex items-center"
                      >
                        <ImageIcon className="mr-2 h-4 w-4" />
                        Compartidas
                      </Button>
                    </div>
                    
                    <div className="p-4">
                      
                      {/* Show different content based on selected source */}
                      {imageSource === 'upload' && (
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          multiple
                          className="mb-4"
                        />
                      )}
                      
                      {imageSource === 'shared' && (
                        <>
                          {loadingImages ? (
                            <div className="flex justify-center items-center p-8">
                              <Loader2 className="h-6 w-6 animate-spin text-primary" />
                              <span className="ml-2">Cargando imágenes compartidas...</span>
                            </div>
                          ) : sharedImages.length === 0 ? (
                            <p className="text-center text-gray-500 py-6">No hay imágenes compartidas disponibles</p>
                          ) : (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-h-[300px] overflow-y-auto">
                              {sharedImages.map((image, index) => (
                                <div 
                                  key={index} 
                                  className="relative rounded-lg overflow-hidden border cursor-pointer hover:opacity-80"
                                  onClick={() => selectExistingImage(image.url, image.name)}
                                >
                                  <img 
                                    src={image.url} 
                                    alt={image.name} 
                                    className="w-full h-32 object-cover"
                                  />
                                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 p-1 truncate">
                                    <p className="text-xs text-white">{image.name}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                      
                      {imageSource === 'organization' && (
                        <>
                          {loadingImages ? (
                            <div className="flex justify-center items-center p-8">
                              <Loader2 className="h-6 w-6 animate-spin text-primary" />
                              <span className="ml-2">Cargando imágenes de la organización...</span>
                            </div>
                          ) : organizationImages.length === 0 ? (
                            <p className="text-center text-gray-500 py-6">No hay imágenes de la organización disponibles</p>
                          ) : (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-h-[300px] overflow-y-auto">
                              {organizationImages.map((image, index) => (
                                <div 
                                  key={index} 
                                  className="relative rounded-lg overflow-hidden border cursor-pointer hover:opacity-80"
                                  onClick={() => selectExistingImage(image.url, image.name, image.path)}
                                >
                                  <img 
                                    src={image.url} 
                                    alt={image.name} 
                                    className="w-full h-32 object-cover"
                                  />
                                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 p-1 truncate">
                                    <p className="text-xs text-white">{image.name}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                      
                      {/* Selected images preview */}
                      {imageList.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-2">Imágenes seleccionadas:</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                            {imageList.map((image) => (
                              <div 
                                key={image.id} 
                                className={`relative rounded-lg overflow-hidden border ${
                                  image.is_primary 
                                    ? 'border-blue-500 ring-2 ring-blue-400'
                                    : 'border-gray-200'
                                }`}
                              >
                                <img 
                                  src={image.url} 
                                  alt="Preview" 
                                  className="w-full h-32 object-cover"
                                />
                                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 p-2 flex justify-between">
                                  {!image.is_primary && (
                                    <Button 
                                      type="button" 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={() => setPrimaryImage(image.id)}
                                      className="p-1 text-white hover:text-blue-300"
                                    >
                                      <ImageIcon size={16} />
                                      <span className="text-xs ml-1">Principal</span>
                                    </Button>
                                  )}
                                  {image.is_primary && (
                                    <span className="text-xs text-blue-300 flex items-center">
                                      <ImageIcon size={16} />
                                      <span className="ml-1">Principal</span>
                                    </span>
                                  )}
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeImage(image.id)}
                                    className="p-1 text-white hover:text-red-300"
                                  >
                                    <Trash size={16} />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-end space-x-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => router.back()}
                    disabled={loading}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading || uploadingImages}>
                    {loading || uploadingImages ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Guardar Producto
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NuevoProductoForm;
