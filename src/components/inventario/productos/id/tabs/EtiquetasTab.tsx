'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useOrganization, obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { Tag, Plus, X, Check, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';

interface EtiquetasTabProps {
  producto: any;
}

interface TagItem {
  id: number;
  name: string;
  color?: string;
}

/**
 * Pestaña para gestionar las etiquetas del producto
 */
const EtiquetasTab: React.FC<EtiquetasTabProps> = ({ producto }) => {
  const { theme } = useTheme();
  const router = useRouter();
  const { organization } = useOrganization();
  
  /**
   * Obtiene el ID de la organización de forma segura, primero del contexto y luego del localStorage
   * @returns El ID de la organización o null si no se encuentra
   */
  const getOrganizationId = (): number | null => {
    // Primero intentamos obtenerlo del contexto
    if (organization?.id) {
      return organization.id;
    }
    
    // Si no está en el contexto, intentamos recuperarlo del localStorage
    try {
      const orgData = obtenerOrganizacionActiva();
      if (orgData && orgData.id) {
        console.log('EtiquetasTab: Usando organización del localStorage:', orgData.id);
        return orgData.id;
      }
    } catch (e) {
      console.error('Error al obtener organización del localStorage:', e);
    }
    
    return null;
  };
  
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [productTags, setProductTags] = useState<TagItem[]>([]);
  const [filteredTags, setFilteredTags] = useState<TagItem[]>([]);
  const [searchValue, setSearchValue] = useState<string>('');
  const [newTag, setNewTag] = useState<string>('');
  
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
  
  // Cargar etiquetas al montar el componente
  useEffect(() => {
    const fetchTags = async () => {
      try {
        setLoading(true);
        
        // Obtener el ID de la organización de forma segura
        const orgId = getOrganizationId();
        
        if (!orgId) {
          console.warn('No hay organización seleccionada para cargar etiquetas');
          setLoading(false);
          return;
        }
        
        // Cargar todas las etiquetas disponibles
        const { data: tagsData, error: tagsError } = await supabase
          .from('product_tags')
          .select('*')
          .eq('organization_id', orgId)
          .order('name');
        
        if (tagsError) throw tagsError;
        setAllTags(tagsData || []);
        
        // Cargar etiquetas asignadas al producto
        const { data: productTagsData, error: productTagsError } = await supabase
          .from('product_tag_relations')
          .select('product_tags(*)')
          .eq('product_id', producto.id);
        
        if (productTagsError) throw productTagsError;
        
        // Convertir correctamente las etiquetas asignadas al formato TagItem
        const assignedTags: TagItem[] = [];
        
        // Procesamos los datos recibidos y manejamos los tipos correctamente
        if (productTagsData && Array.isArray(productTagsData)) {
          productTagsData.forEach((item: any) => {
            // Verificamos que product_tags exista y sea un objeto
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
      } catch (error) {
        console.error('Error al cargar etiquetas:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se pudieron cargar las etiquetas",
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchTags();
  }, [producto.id]);
  
  // Filtrar etiquetas basado en la búsqueda
  useEffect(() => {
    if (!searchValue) {
      setFilteredTags([]);
      return;
    }
    
    const filtered = allTags.filter(
      tag => 
        tag.name.toLowerCase().includes(searchValue.toLowerCase()) &&
        !productTags.some(pTag => pTag.id === tag.id)
    );
    
    setFilteredTags(filtered);
  }, [searchValue, allTags, productTags]);
  
  // Agregar etiqueta existente al producto
  const addTagToProduct = async (tag: TagItem) => {
    try {
      setSaving(true);
      
      // Verificar si ya está asignada
      const isAlreadyAssigned = productTags.some(pTag => pTag.id === tag.id);
      if (isAlreadyAssigned) return;
      
      // Crear relación
      const { error } = await supabase
        .from('product_tag_relations')
        .insert({
          product_id: producto.id,
          tag_id: tag.id,
        });
      
      if (error) throw error;
      
      setProductTags([...productTags, tag]);
      setSearchValue('');
      setFilteredTags([]);
      
      toast({
        title: "Etiqueta añadida",
        description: `La etiqueta "${tag.name}" se ha añadido al producto`,
      });
    } catch (error) {
      console.error('Error al añadir etiqueta:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo añadir la etiqueta al producto",
      });
    } finally {
      setSaving(false);
    }
  };
  
  // Eliminar etiqueta del producto
  const removeTagFromProduct = async (tag: TagItem) => {
    try {
      setSaving(true);
      
      const { error } = await supabase
        .from('product_tag_relations')
        .delete()
        .eq('product_id', producto.id)
        .eq('tag_id', tag.id);
      
      if (error) throw error;
      
      setProductTags(productTags.filter(pTag => pTag.id !== tag.id));
      
      toast({
        title: "Etiqueta eliminada",
        description: `La etiqueta "${tag.name}" se ha eliminado del producto`,
      });
    } catch (error) {
      console.error('Error al eliminar etiqueta:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar la etiqueta del producto",
      });
    } finally {
      setSaving(false);
    }
  };
  
  // Crear nueva etiqueta
  const createNewTag = async () => {
    if (!newTag.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Por favor ingrese un nombre para la etiqueta",
      });
      return;
    }
    
    // Verificar si la etiqueta ya existe
    const tagExists = allTags.some(
      tag => tag.name.toLowerCase() === newTag.toLowerCase()
    );
    
    if (tagExists) {
      toast({
        variant: "destructive",
        title: "Etiqueta duplicada",
        description: "Ya existe una etiqueta con ese nombre",
      });
      return;
    }
    
    try {
      setSaving(true);
      
      const orgId = getOrganizationId();
      if (!orgId) {
        toast({
          title: 'Error',
          description: 'No hay organización seleccionada',
          variant: 'destructive'
        });
        setSaving(false);
        return;
      }
      
      // Asignar color aleatorio
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      
      // Crear nueva etiqueta
      const { data, error } = await supabase
        .from('product_tags')
        .insert({
          name: newTag.trim(),
          organization_id: orgId,
          color: randomColor,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Actualizar lista de etiquetas
      setAllTags([...allTags, data]);
      
      // Asignar al producto
      const { error: relationError } = await supabase
        .from('product_tag_relations')
        .insert({
          product_id: producto.id,
          tag_id: data.id,
        });
      
      if (relationError) throw relationError;
      
      setProductTags([...productTags, data]);
      setNewTag('');
      
      toast({
        title: "Etiqueta creada",
        description: `La etiqueta "${data.name}" se ha creado y añadido al producto`,
      });
    } catch (error) {
      console.error('Error al crear etiqueta:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo crear la etiqueta",
      });
    } finally {
      setSaving(false);
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <h3 className="text-lg font-medium">
          Etiquetas del Producto ({productTags.length})
        </h3>
      </div>
      
      {/* Buscador de etiquetas y creación */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Buscar etiquetas existentes */}
          <div className="space-y-2">
            <Label htmlFor="search-tags">Buscar Etiquetas</Label>
            <div className="relative">
              <Input
                id="search-tags"
                placeholder="Escriba para buscar etiquetas existentes..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}
              />
              {searchValue && (
                <button
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full ${
                    theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                  }`}
                  onClick={() => setSearchValue('')}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              
              {/* Resultados de búsqueda */}
              {filteredTags.length > 0 && (
                <div className={`absolute z-10 mt-1 w-full rounded-md border shadow-lg ${
                  theme === 'dark' 
                    ? 'bg-gray-900 border-gray-700' 
                    : 'bg-white border-gray-200'
                }`}>
                  <ul className="max-h-60 overflow-y-auto rounded-md py-1">
                    {filteredTags.map((tag) => (
                      <li
                        key={tag.id}
                        className={`flex items-center justify-between px-3 py-2 cursor-pointer ${
                          theme === 'dark' 
                            ? 'hover:bg-gray-800' 
                            : 'hover:bg-gray-100'
                        }`}
                        onClick={() => addTagToProduct(tag)}
                      >
                        <div className="flex items-center">
                          <div className={`h-3 w-3 rounded-full ${tag.color || 'bg-gray-500'} mr-2`} />
                          <span>{tag.name}</span>
                        </div>
                        <Plus className="h-4 w-4" />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
          
          {/* Crear nueva etiqueta */}
          <div className="space-y-2">
            <Label htmlFor="new-tag">Crear Nueva Etiqueta</Label>
            <div className="flex gap-2">
              <Input
                id="new-tag"
                placeholder="Nombre de nueva etiqueta..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                className={theme === 'dark' ? 'bg-gray-800 border-gray-700' : ''}
              />
              <Button
                onClick={createNewTag}
                disabled={saving || !newTag.trim()}
                className="whitespace-nowrap"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Crear
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Etiquetas asignadas */}
      <div>
        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
          Etiquetas Asignadas
        </h4>
        
        {loading ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : productTags.length === 0 ? (
          <div className={`p-8 text-center rounded-md border ${theme === 'dark' ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
            <Tag className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-lg font-medium">Sin etiquetas</h3>
            <p className="mt-1 text-gray-500 dark:text-gray-400">
              Este producto no tiene etiquetas asignadas.
              Busque o cree etiquetas para categorizar este producto.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {productTags.map((tag) => (
              <div
                key={tag.id}
                className={`flex items-center gap-1 rounded-full border px-3 py-1 ${
                  theme === 'dark' 
                    ? 'border-gray-700 bg-gray-800' 
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className={`h-2 w-2 rounded-full ${tag.color || 'bg-gray-500'}`} />
                <span className="text-sm">{tag.name}</span>
                <button
                  className={`ml-1 rounded-full p-0.5 ${
                    theme === 'dark' 
                      ? 'hover:bg-gray-700' 
                      : 'hover:bg-gray-200'
                  }`}
                  onClick={() => removeTagFromProduct(tag)}
                  disabled={saving}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Información de uso de etiquetas */}
      <div className={`rounded-md border p-4 ${
        theme === 'dark' 
          ? 'bg-gray-900 border-gray-700 text-gray-300' 
          : 'bg-gray-50 border-gray-200'
      }`}>
        <h4 className="text-sm font-medium mb-2 flex items-center">
          <Check className="h-4 w-4 mr-2 text-green-500" />
          ¿Para qué sirven las etiquetas?
        </h4>
        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-500 dark:text-gray-400">
          <li>Facilitan la búsqueda y filtrado de productos</li>
          <li>Permiten agrupar productos por características o categorías adicionales</li>
          <li>Son útiles para campañas promocionales y marketing</li>
          <li>Pueden usarse para reportes personalizados</li>
        </ul>
      </div>
    </div>
  );
};

export default EtiquetasTab;
