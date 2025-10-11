'use client'

import { useState, forwardRef, useImperativeHandle, useEffect } from 'react';
import { Tag, Plus, X, Check, Loader2 } from 'lucide-react';
import { useOrganization, obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

interface TagItem {
  id: number;
  name: string;
  color?: string;
}

export interface EtiquetasRef {
  /**
   * Guarda todas las etiquetas asociadas al producto en la base de datos
   */
  guardarEtiquetasEnBD: (product_id: number) => Promise<{success: boolean, error?: any}>;
}

export interface EtiquetasProps {
  /**
   * ID del producto para cargar etiquetas existentes en modo de edición
   */
  productoId?: number;
}

/**
 * Componente para gestionar las etiquetas de un producto
 */
const Etiquetas = forwardRef<EtiquetasRef, EtiquetasProps>(({ productoId }, ref) => {
  const { organization } = useOrganization();
  
  // Estados
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [productTags, setProductTags] = useState<TagItem[]>([]);
  const [filteredTags, setFilteredTags] = useState<TagItem[]>([]);
  const [searchValue, setSearchValue] = useState<string>('');
  const [newTagName, setNewTagName] = useState<string>('');
  const [isCreatingTag, setIsCreatingTag] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [initialLoading, setInitialLoading] = useState<boolean>(false);
  const [popoverOpen, setPopoverOpen] = useState<boolean>(false);

  // Colores predefinidos para etiquetas
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-red-500',
    'bg-yellow-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
    'bg-orange-500',
  ];
  
  // Obtener el ID de organización de forma segura
  const getOrganizationId = (): number | null => {
    // Primero intentamos obtenerlo del contexto
    if (organization?.id) {
      return organization.id;
    }
    
    // Si no está en el contexto, intentamos recuperarlo del localStorage
    try {
      const orgData = obtenerOrganizacionActiva();
      if (orgData && orgData.id) {
        return orgData.id;
      }
    } catch (e) {
      console.error('Error al obtener organización del localStorage:', e);
    }
    
    return null;
  };
  
  // Cargar etiquetas disponibles y las asignadas al producto
  useEffect(() => {
    const cargarEtiquetas = async () => {
      try {
        setInitialLoading(true);
        
        const organization_id = getOrganizationId();
        
        if (!organization_id) {
          console.warn('No hay organización seleccionada para cargar etiquetas');
          return;
        }
        
        // Cargar todas las etiquetas disponibles para la organización
        const { data: tagsData, error: tagsError } = await supabase
          .from('product_tags')
          .select('*')
          .eq('organization_id', organization_id)
          .order('name');
          
        if (tagsError) throw tagsError;
        
        setAllTags(tagsData || []);
        
        // Si estamos en modo edición, cargamos las etiquetas asignadas al producto
        if (productoId) {
          const { data: productTagsData, error: productTagsError } = await supabase
            .from('product_tag_relations')
            .select('product_tags(*)')
            .eq('product_id', productoId);
            
          if (productTagsError) throw productTagsError;
          
          // Formatear etiquetas asignadas
          const assignedTags: TagItem[] = [];
          
          if (productTagsData && Array.isArray(productTagsData)) {
            productTagsData.forEach((item: any) => {
              const tagData = item?.product_tags;
              if (tagData && typeof tagData === 'object' && !Array.isArray(tagData)) {
                assignedTags.push({
                  id: Number(tagData.id) || 0,
                  name: String(tagData.name || ''),
                  color: String(tagData.color || colors[Math.floor(Math.random() * colors.length)])
                });
              }
            });
          }
          
          setProductTags(assignedTags);
        }
      } catch (error: any) {
        console.error('Error al cargar etiquetas:', error);
        toast({
          title: "Error",
          description: "No se pudieron cargar las etiquetas disponibles",
          variant: "destructive"
        });
      } finally {
        setInitialLoading(false);
      }
    };
    
    cargarEtiquetas();
  }, [productoId]);
  
  // Filtrar etiquetas basado en la búsqueda
  useEffect(() => {
    if (!searchValue.trim()) {
      setFilteredTags([]);
      return;
    }
    
    const lowerCaseSearch = searchValue.toLowerCase();
    
    // Filtrar etiquetas que coincidan con la búsqueda y no estén ya asignadas
    const matching = allTags.filter(tag => 
      tag.name.toLowerCase().includes(lowerCaseSearch) && 
      !productTags.some(pt => pt.id === tag.id)
    );
    
    setFilteredTags(matching);
  }, [searchValue, allTags, productTags]);
  
  // Añadir una etiqueta al producto
  const addTag = (tag: TagItem) => {
    if (productTags.some(pt => pt.id === tag.id)) {
      return; // La etiqueta ya está asignada
    }
    
    setProductTags([...productTags, tag]);
    setSearchValue('');
    setFilteredTags([]);
    setPopoverOpen(false);
  };
  
  // Eliminar una etiqueta del producto
  const removeTag = (tagId: number) => {
    setProductTags(productTags.filter(tag => tag.id !== tagId));
  };
  
  // Crear una nueva etiqueta
  const createNewTag = async () => {
    if (!newTagName.trim()) {
      toast({
        title: "Error",
        description: "Por favor ingresa un nombre para la etiqueta",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setIsCreatingTag(true);
      
      const organization_id = getOrganizationId();
      
      if (!organization_id) {
        throw new Error("No se ha seleccionado una organización.");
      }
      
      // Verificar si la etiqueta ya existe
      const { data: existingTag, error: checkError } = await supabase
        .from('product_tags')
        .select('id')
        .eq('organization_id', organization_id)
        .ilike('name', newTagName.trim());
        
      if (checkError) throw checkError;
      
      if (existingTag && existingTag.length > 0) {
        toast({
          title: "Etiqueta duplicada",
          description: "Ya existe una etiqueta con ese nombre",
          variant: "destructive"
        });
        return;
      }
      
      // Color aleatorio para la nueva etiqueta
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      
      // Crear la nueva etiqueta
      const { data: newTag, error: createError } = await supabase
        .from('product_tags')
        .insert({
          name: newTagName.trim(),
          organization_id,
          color: randomColor
        })
        .select()
        .single();
        
      if (createError) throw createError;
      
      // Actualizar la lista de etiquetas
      setAllTags([...allTags, newTag]);
      
      // Añadir la nueva etiqueta al producto
      addTag(newTag);
      
      // Limpiar el formulario
      setNewTagName('');
      
      toast({
        title: "Éxito",
        description: "Etiqueta creada y agregada al producto",
      });
    } catch (error: any) {
      console.error('Error al crear etiqueta:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo crear la etiqueta",
        variant: "destructive"
      });
    } finally {
      setIsCreatingTag(false);
    }
  };
  
  // Guardar todas las etiquetas en la base de datos
  const guardarEtiquetasEnBD = async (product_id: number): Promise<{success: boolean, error?: any}> => {
    try {
      setIsLoading(true);
      
      const organization_id = getOrganizationId();
      
      if (!organization_id) {
        throw new Error("No se ha seleccionado una organización.");
      }
      
      // Si es modo edición, primero eliminamos las etiquetas existentes
      if (productoId) {
        const { error: deleteError } = await supabase
          .from('product_tag_relations')
          .delete()
          .eq('product_id', productoId);
          
        if (deleteError) throw deleteError;
      }
      
      // Si no hay etiquetas que guardar, terminamos
      if (productTags.length === 0) {
        return { success: true };
      }
      
      // Preparar datos para inserción
      const tagRelations = productTags.map(tag => ({
        product_id,
        tag_id: tag.id
      }));
      
      // Insertar las relaciones entre producto y etiquetas
      const { error } = await supabase
        .from('product_tag_relations')
        .insert(tagRelations);
        
      if (error) throw error;
      
      console.log(`Guardadas ${productTags.length} etiquetas para el producto ${product_id}`);
      
      return { success: true };
    } catch (error: any) {
      console.error('Error al guardar etiquetas:', error);
      return {
        success: false,
        error
      };
    } finally {
      setIsLoading(false);
    }
  };
  
  // Exponer métodos al componente padre
  useImperativeHandle(ref, () => ({
    guardarEtiquetasEnBD
  }));
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Etiquetas del Producto</h3>
        {initialLoading && (
          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Cargando etiquetas...
          </div>
        )}
      </div>
      
      {/* Lista de etiquetas asignadas */}
      <div className="flex flex-wrap gap-2">
        {productTags.length > 0 ? (
          productTags.map(tag => (
            <Badge 
              key={tag.id} 
              className={`px-2 py-1 ${tag.color || 'bg-blue-500'} text-white flex items-center gap-1`}
            >
              {tag.name}
              <button
                onClick={() => removeTag(tag.id)}
                className="ml-1 hover:bg-white/20 rounded-full p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        ) : (
          <div className="text-sm text-gray-500 dark:text-gray-400 italic w-full text-center py-2">
            No hay etiquetas asignadas a este producto
          </div>
        )}
      </div>
      
      {/* Selector de etiquetas y creación de nuevas */}
      <div className="flex space-x-2">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start dark:border-gray-700 dark:bg-gray-800"
            >
              <Tag className="mr-2 h-4 w-4" />
              {filteredTags.length > 0 
                ? `${filteredTags.length} etiqueta(s) encontrada(s)` 
                : "Buscar etiqueta..."}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[300px]" align="start">
            <Command>
              <CommandInput 
                placeholder="Buscar etiqueta..."
                value={searchValue}
                onValueChange={setSearchValue}
              />
              <CommandList>
                <CommandEmpty>
                  <div className="flex flex-col items-center justify-center p-4">
                    <p className="text-sm text-gray-500">No hay etiquetas que coincidan</p>
                    
                    <div className="w-full mt-2">
                      <div className="flex items-center space-x-2">
                        <Input
                          placeholder="Nueva etiqueta..."
                          className="flex-1"
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                          disabled={isCreatingTag}
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={createNewTag}
                          disabled={!newTagName.trim() || isCreatingTag}
                        >
                          {isCreatingTag ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CommandEmpty>
                <CommandGroup heading="Etiquetas disponibles">
                  {filteredTags.map(tag => (
                    <CommandItem
                      key={tag.id}
                      onSelect={() => addTag(tag)}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center">
                        <div 
                          className={`h-3 w-3 rounded-full mr-2 ${tag.color || 'bg-blue-500'}`}
                        />
                        {tag.name}
                      </div>
                      <Check
                        className={`h-4 w-4 opacity-0 transition-opacity ${
                          productTags.some(pt => pt.id === tag.id) ? 'opacity-100' : ''
                        }`}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
            
            {/* Formulario para crear nueva etiqueta */}
            <div className="p-2 border-t dark:border-gray-700">
              <div className="flex items-center space-x-2">
                <Input
                  placeholder="Nueva etiqueta..."
                  className="flex-1"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  disabled={isCreatingTag}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={createNewTag}
                  disabled={!newTagName.trim() || isCreatingTag}
                >
                  {isCreatingTag ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
});

Etiquetas.displayName = "Etiquetas";

export default Etiquetas;
