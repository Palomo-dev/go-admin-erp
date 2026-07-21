'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { Plus, Trash2, PlusCircle, Save, Edit, Loader2, Tags } from 'lucide-react';
import { Badge as UIBadge } from '@/components/ui/badge';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/utils/Utils';

interface VariantTypeOption {
  id: number;
  name: string;
}

interface VariantValueOption {
  id: number;
  variant_type_id: number;
  value: string;
}

interface VariantesTabProps {
  producto: any;
}

// Interfaz para variantes (productos hijos en tabla products)
interface Variante {
  id: number;
  parent_product_id: number;
  sku: string;
  name: string;
  price?: number;
  cost?: number;
  stock?: number;
  barcode?: string;
  variant_data?: any;
  status?: string;
}

/**
 * Pestaña para gestionar las variantes del producto
 * Permite crear, editar y eliminar variantes
 */
const VariantesTab: React.FC<VariantesTabProps> = ({ producto }) => {
  const { theme } = useTheme();
  const router = useRouter();
  const { organization } = useOrganization();
  
  const [variantes, setVariantes] = useState<Variante[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [editingVariante, setEditingVariante] = useState<Variante | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [availableTypes, setAvailableTypes] = useState<VariantTypeOption[]>([]);
  const [availableValues, setAvailableValues] = useState<VariantValueOption[]>([]);
  const [newAttrName, setNewAttrName] = useState<string>('');

  // Cargar catálogo de tipos/valores de variantes (incluye globales + org + variant_data)
  const loadVariantCatalog = async () => {
    if (!organization?.id) return;
    try {
      // Tipos del catálogo: organización actual + globales (org_id = 0)
      const { data: catalogTypes } = await supabase
        .from('variant_types')
        .select('id, name')
        .or(`organization_id.eq.${organization.id},organization_id.eq.0`)
        .order('name');

      // Tipos reales desde variant_data de productos existentes
      const { data: products } = await supabase
        .from('products')
        .select('variant_data')
        .eq('organization_id', organization.id)
        .not('variant_data', 'is', null)
        .not('parent_product_id', 'is', null);

      // Combinar tipos: catálogo + variant_data
      const typeNamesSet = new Set<string>();
      let syntheticId = 5000;
      (catalogTypes || []).forEach((t) => typeNamesSet.add(t.name));
      (products || []).forEach((p) => {
        if (p.variant_data && typeof p.variant_data === 'object') {
          Object.keys(p.variant_data as Record<string, unknown>).forEach((key) => {
            if (key.trim()) typeNamesSet.add(key.trim());
          });
        }
      });

      const combinedTypes: { id: number; name: string }[] = Array.from(typeNamesSet)
        .sort()
        .map((name, idx) => {
          const catalogEntry = (catalogTypes || []).find((t) => t.name === name);
          return { id: catalogEntry?.id || syntheticId + idx, name };
        });
      setAvailableTypes(combinedTypes);

      // Valores del catálogo
      const catalogIds = (catalogTypes || []).map((t) => t.id);
      let allValues: { id: number; variant_type_id: number; value: string }[] = [];
      if (catalogIds.length > 0) {
        const { data: catalogValues } = await supabase
          .from('variant_values')
          .select('id, variant_type_id, value')
          .in('variant_type_id', catalogIds)
          .order('display_order');
        allValues = catalogValues || [];
      }

      // Valores reales desde variant_data
      const valuesByType: Record<string, Set<string>> = {};
      (products || []).forEach((p) => {
        if (p.variant_data && typeof p.variant_data === 'object') {
          Object.entries(p.variant_data as Record<string, unknown>).forEach(([key, val]) => {
            if (!key.trim() || !val || !String(val).trim()) return;
            if (!valuesByType[key.trim()]) valuesByType[key.trim()] = new Set();
            valuesByType[key.trim()].add(String(val).trim());
          });
        }
      });
      combinedTypes.forEach((type) => {
        const vals = valuesByType[type.name];
        if (vals) {
          vals.forEach((v) => {
            const exists = allValues.some(
              (av) => av.variant_type_id === type.id && av.value === v
            );
            if (!exists) {
              allValues.push({ id: syntheticId++, variant_type_id: type.id, value: v });
            }
          });
        }
      });

      setAvailableValues(allValues);
    } catch (error) {
      console.error('Error cargando catálogo de variantes:', error);
    }
  };

  useEffect(() => {
    loadVariantCatalog();
  }, [organization?.id]);

  // Crea (o reutiliza) un tipo de variante en el catálogo y devuelve su id
  const createTypeInCatalog = async (name: string): Promise<number | null> => {
    if (!organization?.id) return null;
    const clean = name.trim();
    if (!clean) return null;
    const { data: existing } = await supabase
      .from('variant_types')
      .select('id')
      .eq('organization_id', organization.id)
      .ilike('name', clean)
      .maybeSingle();
    if (existing) return existing.id;
    const { data: created } = await supabase
      .from('variant_types')
      .insert({ organization_id: organization.id, name: clean })
      .select('id')
      .single();
    return created?.id || null;
  };

  // Guarda un valor en el catálogo (variant_values) para reutilizarlo
  const createValueInCatalog = async (typeName: string, value: string) => {
    const clean = value.trim();
    if (!clean) return;
    const typeId = await createTypeInCatalog(typeName);
    if (!typeId) return;
    const { data: existing } = await supabase
      .from('variant_values')
      .select('id')
      .eq('variant_type_id', typeId)
      .ilike('value', clean)
      .maybeSingle();
    if (!existing) {
      await supabase
        .from('variant_values')
        .insert({ variant_type_id: typeId, value: clean, display_order: 0 });
    }
    await loadVariantCatalog();
    toast({ title: 'Valor guardado', description: `"${clean}" agregado a ${typeName}` });
  };

  // Agrega un atributo (tipo) a la variante en edición y lo persiste en el catálogo
  const addAttributeToVariante = async (typeName: string) => {
    const clean = typeName.trim();
    if (!clean || !editingVariante) return;
    const newData = { ...(editingVariante.variant_data || {}), [clean]: '' };
    handleVarianteChange('variant_data', newData);
    await createTypeInCatalog(clean);
    await loadVariantCatalog();
  };

  // Valores sugeridos para un tipo de variante
  const getValuesForType = (typeName: string): string[] => {
    const type = availableTypes.find((t) => t.name.toLowerCase() === typeName.toLowerCase());
    if (!type) return [];
    return availableValues
      .filter((v) => v.variant_type_id === type.id)
      .map((v) => v.value);
  };
  
  // Cargar variantes al montar el componente
  // Las variantes son productos hijos en tabla products con parent_product_id
  useEffect(() => {
    const fetchVariantes = async () => {
      try {
        setLoading(true);
        
        // Si el producto tiene variantes pre-cargadas (children), usarlas
        if (producto.children && producto.children.length > 0) {
          const childIds = producto.children.map((c: any) => c.id);

          // Consultar precios y costos vigentes de las variantes
          const [pricesRes, costsRes] = await Promise.all([
            supabase
              .from('product_prices')
              .select('product_id, price, effective_from, effective_to')
              .in('product_id', childIds)
              .or('effective_to.is.null,effective_to.gt.' + new Date().toISOString()),
            supabase
              .from('product_costs')
              .select('product_id, cost, effective_from, effective_to')
              .in('product_id', childIds)
              .or('effective_to.is.null,effective_to.gt.' + new Date().toISOString()),
          ]);

          // Construir mapa de precio vigente por product_id (el más reciente)
          const priceMap: Record<number, number> = {};
          (pricesRes.data || []).forEach((pp: any) => {
            const existing = priceMap[pp.product_id];
            if (!existing || new Date(pp.effective_from) > new Date(existing)) {
              priceMap[pp.product_id] = pp.price;
            }
          });

          // Construir mapa de costo vigente por product_id
          const costMap: Record<number, number> = {};
          (costsRes.data || []).forEach((pc: any) => {
            const existing = costMap[pc.product_id];
            if (!existing || new Date(pc.effective_from) > new Date(existing)) {
              costMap[pc.product_id] = pc.cost;
            }
          });

          const mappedVariants = producto.children.map((child: any) => ({
            id: child.id,
            parent_product_id: producto.id,
            sku: child.sku,
            name: child.name,
            price: priceMap[child.id] || 0,
            cost: costMap[child.id] || 0,
            stock: child.stock_levels?.reduce((sum: number, sl: any) => sum + (sl.qty_on_hand || 0), 0) || 0,
            barcode: child.barcode,
            variant_data: child.variant_data,
            status: child.status || 'active',
          }));
          setVariantes(mappedVariants);
          setLoading(false);
          return;
        }

        // Si no hay children pre-cargados, consultar la base de datos
        const { data, error } = await supabase
          .from('products')
          .select(`
            id, sku, name, barcode, status, variant_data,
            product_prices(price, effective_from, effective_to),
            product_costs(cost, effective_from, effective_to),
            stock_levels(qty_on_hand, branch_id)
          `)
          .eq('parent_product_id', producto.id)
          .order('created_at');
        
        if (error) throw error;
        
        // Mapear los datos a la interfaz Variante
        const mappedVariants: Variante[] = (data || []).map((child: any) => {
          const validPrices = (child.product_prices || [])
            .filter((pp: any) => !pp.effective_to || new Date(pp.effective_to) > new Date())
            .sort((a: any, b: any) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());
          const currentPrice = validPrices[0]?.price || 0;

          const validCosts = (child.product_costs || [])
            .filter((pc: any) => !pc.effective_to || new Date(pc.effective_to) > new Date())
            .sort((a: any, b: any) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());
          const currentCost = validCosts[0]?.cost || 0;

          const totalStock = child.stock_levels?.reduce((sum: number, sl: any) => sum + (sl.qty_on_hand || 0), 0) || 0;
          
          return {
            id: child.id,
            parent_product_id: producto.id,
            sku: child.sku,
            name: child.name,
            price: currentPrice,
            cost: currentCost,
            stock: totalStock,
            barcode: child.barcode,
            variant_data: child.variant_data,
            status: child.status,
          };
        });
        
        setVariantes(mappedVariants);
      } catch (error) {
        console.error('Error al cargar variantes:', error);
        // No mostrar toast si simplemente no hay variantes
      } finally {
        setLoading(false);
      }
    };
    
    fetchVariantes();
  }, [producto.id, producto.children]);
  
  // Abrir diálogo para crear variante
  const handleNewVariante = () => {
    const newVariante: Variante = {
      id: 0, // Temporal, se asignará al crear
      parent_product_id: producto.id,
      sku: `${producto.sku}-V${variantes.length + 1}`,
      name: `${producto.name} - Variante ${variantes.length + 1}`,
      price: producto.price || 0,
      cost: producto.cost || 0,
      stock: 0,
      status: 'active',
    };
    setEditingVariante(newVariante);
    setDialogMode('create');
    setIsDialogOpen(true);
  };
  
  // Abrir diálogo para editar variante
  const handleEditVariante = (variante: Variante) => {
    setEditingVariante({ ...variante });
    setDialogMode('edit');
    setIsDialogOpen(true);
  };
  
  // Guardar variante (crear o editar)
  const handleSaveVariante = async () => {
    if (!editingVariante) return;
    
    try {
      setLoading(true);
      
      if (dialogMode === 'create') {
        // Crear nueva variante como producto hijo en tabla products
        const { data, error } = await supabase
          .from('products')
          .insert({
            organization_id: organization?.id,
            sku: editingVariante.sku,
            name: editingVariante.name,
            barcode: editingVariante.barcode,
            parent_product_id: producto.id,
            is_parent: false,
            track_stock: producto.track_stock !== undefined ? producto.track_stock : true,
            category_id: producto.category_id,
            unit_code: producto.unit_code,
            status: 'active',
            variant_data: editingVariante.variant_data,
          })
          .select()
          .single();
        
        if (error) throw error;
        
        // Crear precio inicial si hay precio definido
        if (editingVariante.price && editingVariante.price > 0) {
          await supabase.from('product_prices').insert({
            product_id: data.id,
            price: editingVariante.price,
            effective_from: new Date().toISOString(),
          });
        }
        
        // Crear costo inicial si hay costo definido
        if (editingVariante.cost && editingVariante.cost > 0) {
          await supabase.from('product_costs').insert({
            product_id: data.id,
            cost: editingVariante.cost,
            effective_from: new Date().toISOString(),
          });
        }

        const newVariante: Variante = {
          id: data.id,
          parent_product_id: producto.id,
          sku: data.sku,
          name: data.name,
          price: editingVariante.price,
          cost: editingVariante.cost,
          stock: 0,
          barcode: data.barcode,
          variant_data: data.variant_data,
          status: data.status,
        };
        
        setVariantes([...variantes, newVariante]);
        
        toast({
          title: "Variante creada",
          description: "La variante se ha creado correctamente",
        });
      } else {
        // Actualizar variante existente en tabla products
        const { error } = await supabase
          .from('products')
          .update({
            sku: editingVariante.sku,
            name: editingVariante.name,
            barcode: editingVariante.barcode,
            variant_data: editingVariante.variant_data,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingVariante.id);
        
        if (error) throw error;
        
        // Actualizar lista de variantes
        setVariantes(
          variantes.map((v) => (v.id === editingVariante.id ? editingVariante : v))
        );
        
        toast({
          title: "Variante actualizada",
          description: "La variante se ha actualizado correctamente",
        });
      }
      
      setIsDialogOpen(false);
    } catch (error: any) {
      console.error('Error al guardar variante:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo guardar la variante",
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Eliminar variante
  const handleDeleteVariante = async (id: number) => {
    try {
      setLoading(true);
      
      // Eliminar de tabla products (producto hijo)
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)
        .eq('parent_product_id', producto.id);
      
      if (error) throw error;
      
      // Actualizar lista de variantes
      setVariantes(variantes.filter((v) => v.id !== id));
      
      toast({
        title: "Variante eliminada",
        description: "La variante se ha eliminado correctamente",
      });
    } catch (error: any) {
      console.error('Error al eliminar variante:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo eliminar la variante",
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Actualizar campo de variante en formulario
  const handleVarianteChange = (field: keyof Variante, value: any) => {
    if (!editingVariante) return;
    
    setEditingVariante({
      ...editingVariante,
      [field]: value,
    });
  };
  
  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium dark:text-white">Variantes de Producto</h3>
        <Button onClick={handleNewVariante}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Variante
        </Button>
      </div>
      
      {/* Resumen de atributos de variantes */}
      {variantes.length > 0 && (() => {
        const attrMap: Record<string, Set<string>> = {};
        variantes.forEach((v) => {
          if (v.variant_data && typeof v.variant_data === 'object') {
            Object.entries(v.variant_data).forEach(([key, val]) => {
              if (!attrMap[key]) attrMap[key] = new Set();
              if (val) attrMap[key].add(String(val));
            });
          }
        });
        const attrEntries = Object.entries(attrMap);
        if (attrEntries.length === 0) return null;
        return (
          <div className="space-y-3">
            {attrEntries.map(([attrName, values]) => (
              <div key={attrName} className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400 min-w-[60px]">
                  {attrName}:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(values).map((val) => (
                    <UIBadge
                      key={val}
                      variant="secondary"
                      className="px-3 py-1 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-700"
                    >
                      {val}
                    </UIBadge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Tabla de variantes */}
      <div className="rounded-md border border-gray-200 dark:border-gray-800">
        <Table>
          <TableHeader className="bg-gray-50 dark:bg-gray-900">
            <TableRow>
              <TableHead className="w-[100px] dark:text-gray-300">SKU</TableHead>
              <TableHead className="dark:text-gray-300">Nombre</TableHead>
              <TableHead className="dark:text-gray-300">Atributos</TableHead>
              <TableHead className="dark:text-gray-300 text-right">Precio</TableHead>
              <TableHead className="dark:text-gray-300 text-right">Costo</TableHead>
              <TableHead className="dark:text-gray-300 text-center">Stock</TableHead>
              <TableHead className="dark:text-gray-300 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-400" />
                </TableCell>
              </TableRow>
            ) : variantes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-gray-500 dark:text-gray-400">
                  <div className="flex flex-col items-center justify-center p-4">
                    <p className="mb-2">Este producto no tiene variantes</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleNewVariante}
                      className="dark:border-gray-800 dark:hover:bg-gray-800"
                    >
                      <PlusCircle className="h-4 w-4 mr-2" />
                      Crear primera variante
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              variantes.map((variante) => (
                <TableRow key={variante.id}>
                  <TableCell className="font-mono text-xs dark:text-gray-200">{variante.sku}</TableCell>
                  <TableCell className="font-medium dark:text-white">{variante.name}</TableCell>
                  <TableCell>
                    {variante.variant_data && typeof variante.variant_data === 'object' ? (
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(variante.variant_data).map(([key, val]) => (
                          val ? (
                            <UIBadge
                              key={key}
                              variant="outline"
                              className="text-[11px] px-2 py-0.5 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                            >
                              <span className="font-semibold text-gray-500 dark:text-gray-400 mr-1">{key}:</span>
                              <span className="text-gray-800 dark:text-gray-200">{String(val)}</span>
                            </UIBadge>
                          ) : null
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs dark:text-gray-500">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right dark:text-gray-200">{formatCurrency(variante.price || 0)}</TableCell>
                  <TableCell className="text-right dark:text-gray-200">{formatCurrency(variante.cost || 0)}</TableCell>
                  <TableCell className="text-center dark:text-gray-200">
                  {producto.track_stock === false ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500" />
                      Sin seguimiento
                    </span>
                  ) : (
                    variante.stock || 0
                  )}
                </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditVariante(variante)}
                      >
                        <Edit className="h-4 w-4" />
                        <span className="sr-only">Editar</span>
                      </Button>
                      
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Eliminar</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="dark:bg-gray-900 dark:border-gray-800">
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                            <AlertDialogDescription className="dark:text-gray-400">
                              Esta acción eliminará la variante permanentemente y no se puede deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="dark:bg-gray-800 dark:hover:bg-gray-700">
                              Cancelar
                            </AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 text-white hover:bg-red-700"
                              onClick={() => variante.id && handleDeleteVariante(variante.id)}
                            >
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Diálogo para crear/editar variantes */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'create' ? 'Crear nueva variante' : 'Editar variante'}
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              {dialogMode === 'create'
                ? 'Completa los datos para crear una variante del producto'
                : 'Modifica los datos de la variante'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sku">SKU de Variante</Label>
              <Input
                id="sku"
                value={editingVariante?.sku || ''}
                onChange={(e) => handleVarianteChange('sku', e.target.value)}
                placeholder="SKU único para esta variante"
                className="font-mono dark:bg-gray-800 dark:border-gray-700"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="name">Nombre de Variante</Label>
              <Input
                id="name"
                value={editingVariante?.name || ''}
                onChange={(e) => handleVarianteChange('name', e.target.value)}
                placeholder="Nombre descriptivo"
                className="dark:bg-gray-800 dark:border-gray-700"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">Precio</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={editingVariante?.price || 0}
                  onChange={(e) => handleVarianteChange('price', parseFloat(e.target.value))}
                  className="dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="cost">Costo</Label>
                <Input
                  id="cost"
                  type="number"
                  step="0.01"
                  value={editingVariante?.cost || 0}
                  onChange={(e) => handleVarianteChange('cost', parseFloat(e.target.value))}
                  className="dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
            </div>
            
            {/* Atributos de variante (Color, Talla, etc.) */}
            {editingVariante?.variant_data && typeof editingVariante.variant_data === 'object' && Object.keys(editingVariante.variant_data).length > 0 && (
              <div className="space-y-2">
                <Label>Atributos</Label>
                <div className="grid grid-cols-1 gap-3">
                  {Object.entries(editingVariante.variant_data).map(([key, val]) => {
                    const suggestions = getValuesForType(key);
                    return (
                      <div key={key} className="space-y-1">
                        <Label className="text-xs text-gray-500 dark:text-gray-400">{key}</Label>
                        <div className="flex gap-1">
                          <Input
                            value={String(val || '')}
                            onChange={(e) => {
                              const newData = { ...editingVariante.variant_data, [key]: e.target.value };
                              handleVarianteChange('variant_data', newData);
                            }}
                            placeholder={key}
                            list={`vt-suggestions-${key}`}
                            className="dark:bg-gray-800 dark:border-gray-700"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="shrink-0 h-9 w-9"
                            title="Guardar este valor en el catálogo"
                            disabled={!String(val || '').trim()}
                            onClick={() => createValueInCatalog(key, String(val || ''))}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        {suggestions.length > 0 && (() => {
                          const MAX_BUTTONS = 12;
                          const MAX_CHAR_LENGTH = 25;
                          const shortSuggestions = suggestions.filter((s) => s.length <= MAX_CHAR_LENGTH);
                          const visibleSuggestions = shortSuggestions.slice(0, MAX_BUTTONS);
                          const hiddenCount = suggestions.length - visibleSuggestions.length;
                          return (
                            <>
                              <datalist id={`vt-suggestions-${key}`}>
                                {suggestions.map((s) => (
                                  <option key={s} value={s} />
                                ))}
                              </datalist>
                              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                                {visibleSuggestions.map((s) => (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() => {
                                      const newData = { ...editingVariante.variant_data, [key]: s };
                                      handleVarianteChange('variant_data', newData);
                                    }}
                                    className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                                      String(val || '') === s
                                        ? 'bg-indigo-100 border-indigo-300 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-600 dark:text-indigo-300'
                                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400'
                                    }`}
                                  >
                                    {s}
                                  </button>
                                ))}
                                {hiddenCount > 0 && (
                                  <span className="text-[10px] text-gray-400 self-center ml-1">
                                    +{hiddenCount} más (escribe para buscar)
                                  </span>
                                )}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Agregar/crear tipo de atributo (disponible en crear y editar) */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <Tags className="h-3 w-3" /> Agregar atributo
              </Label>
              <div className="flex gap-2">
                {availableTypes.length > 0 && (
                  <Select
                    value=""
                    onValueChange={(val) => { if (val) addAttributeToVariante(val); }}
                  >
                    <SelectTrigger className="flex-1 text-sm dark:bg-gray-800 dark:border-gray-700">
                      <SelectValue placeholder="Tipo existente..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTypes
                        .filter((t) => !Object.keys(editingVariante?.variant_data || {}).some((k) => k.toLowerCase() === t.name.toLowerCase()))
                        .map((t) => (
                          <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
                <Input
                  value={newAttrName}
                  onChange={(e) => setNewAttrName(e.target.value)}
                  placeholder="Nuevo tipo..."
                  className="w-36 text-sm dark:bg-gray-800 dark:border-gray-700"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addAttributeToVariante(newAttrName);
                      setNewAttrName('');
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 h-9 w-9"
                  title="Crear tipo y guardarlo en el catálogo"
                  disabled={!newAttrName.trim()}
                  onClick={() => { addAttributeToVariante(newAttrName); setNewAttrName(''); }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="stock">Stock Inicial</Label>
              <Input
                id="stock"
                type="number"
                value={editingVariante?.stock || 0}
                onChange={(e) => handleVarianteChange('stock', parseInt(e.target.value, 10))}
                className="dark:bg-gray-800 dark:border-gray-700"
                disabled={dialogMode === 'edit'}
              />
              {dialogMode === 'edit' && (
                <p className="text-xs text-gray-500 dark:text-gray-400">El stock se gestiona desde movimientos de inventario</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="barcode">Código de Barras (opcional)</Label>
              <Input
                id="barcode"
                value={editingVariante?.barcode || ''}
                onChange={(e) => handleVarianteChange('barcode', e.target.value)}
                placeholder="Código de barras específico"
                className="font-mono dark:bg-gray-800 dark:border-gray-700"
              />
            </div>
          </div>
          
          <DialogFooter className="sm:justify-between">
            <DialogClose asChild>
              <Button variant="outline" className="dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700">
                Cancelar
              </Button>
            </DialogClose>
            <Button onClick={handleSaveVariante} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {dialogMode === 'create' ? 'Crear Variante' : 'Guardar Cambios'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VariantesTab;
