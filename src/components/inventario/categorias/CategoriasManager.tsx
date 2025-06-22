"use client";

import React, { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Categoria } from './types';
import { supabase } from '@/lib/supabase/config';
import { toast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import CategoriaTree from './CategoriaTree';
import CategoriaForm from './CategoriaForm';
import CategoriasPageHeader from './CategoriasPageHeader';

/**
 * Componente principal para gestión de categorías
 *
 * Este componente orquesta la visualización y gestión de categorías,
 * incluyendo el árbol jerárquico y formularios para crear/editar
 */
const CategoriasManager: React.FC = () => {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriasFiltradas, setCategoriasFiltradas] = useState<Categoria[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<Categoria | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isCreando, setIsCreando] = useState<boolean>(false);
  const [isEditando, setIsEditando] = useState<boolean>(false);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const { theme } = useTheme();

  // Obtener ID de organización
  const fetchOrganizationId = async () => {
    // Primero intentamos obtener el ID de localStorage/sessionStorage
    const storedOrgId = localStorage.getItem('currentOrganizationId') || sessionStorage.getItem('currentOrganizationId');
    if (storedOrgId) {
      return parseInt(storedOrgId);
    }

    // Si no está en storage, intentamos obtenerlo de la tabla organization_members
    try {
      const user = await supabase.auth.getUser();
      if (user.data.user) {
        const { data, error } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.data.user.id)
          .single();
          
        if (data) {
          return data.organization_id;
        }
      }
    } catch (error) {
      console.error('Error al obtener ID de organización:', error);
    }
    
    // Por defecto, usamos 1 (útil para desarrollo)
    return 1;
  };

  // Obtener lista de categorías
  const fetchCategorias = async () => {
    try {
      setLoading(true);
      const orgId = await fetchOrganizationId();
      setOrganizationId(orgId);
      
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('organization_id', orgId)
        .order('rank', { ascending: true });
        
      if (error) {
        throw error;
      }
      
      const categoriasConNiveles = organizarCategoriasEnArbol(data || []);
      setCategorias(categoriasConNiveles);
      setCategoriasFiltradas(categoriasConNiveles);
    } catch (error) {
      console.error('Error al cargar categorías:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las categorías",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Convertir array plano de categorías en estructura jerárquica
  const organizarCategoriasEnArbol = (categoriasList: Categoria[]): Categoria[] => {
    const map = new Map();
    const roots: Categoria[] = [];
    
    // Crear mapa para acceso rápido
    categoriasList.forEach(category => {
      map.set(category.id, {
        ...category,
        children: [],
        level: 0,
        isExpanded: true
      });
    });
    
    // Organizar en estructura de árbol
    categoriasList.forEach(category => {
      const node = map.get(category.id);
      if (category.parent_id === null) {
        // Es una categoría raíz
        roots.push(node);
      } else {
        // Es una categoría hija
        const parent = map.get(category.parent_id);
        if (parent) {
          parent.children.push(node);
          node.level = parent.level + 1;
        } else {
          // Si no encontramos el padre, la tratamos como raíz
          roots.push(node);
        }
      }
    });
    
    // Ordenar por rank
    return roots.sort((a, b) => a.rank - b.rank);
  };

  // Actualizar orden de categorías
  const actualizarOrden = async (categoriaId: number, nuevoParentId: number | null, nuevoRank: number) => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .update({
          parent_id: nuevoParentId,
          rank: nuevoRank
        })
        .eq('id', categoriaId);
        
      if (error) {
        throw error;
      }
      
      toast({
        title: "Éxito",
        description: "Orden actualizado correctamente",
        variant: "default",
      });
      
      fetchCategorias();
    } catch (error) {
      console.error('Error al actualizar orden:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el orden",
        variant: "destructive",
      });
    }
  };

  // Crear nueva categoría
  const crearCategoria = async (categoria: Partial<Categoria>) => {
    if (!organizationId) return;
    
    try {
      // Obtener el rank más alto para categorías del mismo nivel
      let maxRank = 1;
      const categoriasEnNivel = categorias.filter(c => c.parent_id === categoria.parent_id);
      if (categoriasEnNivel.length > 0) {
        maxRank = Math.max(...categoriasEnNivel.map(c => c.rank)) + 1;
      }
      
      // Generar slug a partir del nombre
      const slug = categoria.name?.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '') || '';
      
      const { data, error } = await supabase
        .from('categories')
        .insert({
          organization_id: organizationId,
          parent_id: categoria.parent_id,
          name: categoria.name,
          slug: slug,
          rank: maxRank
        })
        .select();
        
      if (error) {
        throw error;
      }
      
      toast({
        title: "Éxito",
        description: "Categoría creada correctamente",
        variant: "default",
      });
      
      setIsCreando(false);
      fetchCategorias();
    } catch (error) {
      console.error('Error al crear categoría:', error);
      toast({
        title: "Error",
        description: "No se pudo crear la categoría",
        variant: "destructive",
      });
    }
  };

  // Actualizar categoría existente
  const actualizarCategoria = async (categoria: Categoria) => {
    try {
      // Generar slug a partir del nombre
      const slug = categoria.name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
      
      const { data, error } = await supabase
        .from('categories')
        .update({
          name: categoria.name,
          slug: slug,
          parent_id: categoria.parent_id
        })
        .eq('id', categoria.id);
        
      if (error) {
        throw error;
      }
      
      toast({
        title: "Éxito",
        description: "Categoría actualizada correctamente",
        variant: "default",
      });
      
      setIsEditando(false);
      setCategoriaSeleccionada(null);
      fetchCategorias();
    } catch (error) {
      console.error('Error al actualizar categoría:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar la categoría",
        variant: "destructive",
      });
    }
  };

  // Eliminar categoría
  const eliminarCategoria = async (id: number) => {
    try {
      // Verificar si tiene categorías hijas
      const children = categorias.filter(c => c.parent_id === id);
      if (children.length > 0) {
        toast({
          title: "Error",
          description: "No se puede eliminar una categoría con subcategorías",
          variant: "destructive",
        });
        return;
      }

      // Verificar si hay productos relacionados
      const { count, error: countError } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', id);
        
      if (countError) {
        throw countError;
      }
      
      if (count && count > 0) {
        toast({
          title: "Error",
          description: "No se puede eliminar una categoría con productos",
          variant: "destructive",
        });
        return;
      }
      
      // Eliminar la categoría
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);
        
      if (error) {
        throw error;
      }
      
      toast({
        title: "Éxito",
        description: "Categoría eliminada correctamente",
        variant: "default",
      });
      
      fetchCategorias();
    } catch (error) {
      console.error('Error al eliminar categoría:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar la categoría",
        variant: "destructive",
      });
    }
  };

  // Filtrar categorías por búsqueda
  const filtrarCategorias = (search: string) => {
    setSearchTerm(search);
    
    if (!search) {
      setCategoriasFiltradas(categorias);
      return;
    }
    
    const searchLower = search.toLowerCase();
    const filtered = categorias.filter(c => 
      c.name.toLowerCase().includes(searchLower) ||
      c.slug.toLowerCase().includes(searchLower)
    );
    
    setCategoriasFiltradas(filtered);
  };

  // Manejar selección de categoría
  const handleSelectCategoria = (categoria: Categoria) => {
    setCategoriaSeleccionada(categoria);
    setIsEditando(true);
  };

  // Cargar datos iniciales
  useEffect(() => {
    fetchCategorias();
  }, []);

  return (
    <div className="w-full">
      {/* Cabecera con buscador y opciones */}
      <CategoriasPageHeader 
        onSearch={filtrarCategorias} 
        onCrear={() => {
          setCategoriaSeleccionada(null);
          setIsCreando(true);
        }}
      />
      
      {loading ? (
        <div className="w-full flex justify-center my-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Árbol de categorías */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Estructura de Categorías</h2>
              {categoriasFiltradas.length > 0 ? (
                <CategoriaTree 
                  categorias={categoriasFiltradas} 
                  onSelect={handleSelectCategoria}
                  onUpdateOrder={actualizarOrden}
                  onDelete={eliminarCategoria}
                />
              ) : (
                <p className="text-gray-500 dark:text-gray-400 italic">
                  {searchTerm 
                    ? "No se encontraron categorías con ese término" 
                    : "No hay categorías definidas. Crea la primera categoría."
                  }
                </p>
              )}
            </div>
          </div>
          
          {/* Panel de edición/creación */}
          <div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              {isCreando ? (
                <>
                  <h2 className="text-lg font-semibold mb-4">Crear Categoría</h2>
                  <CategoriaForm 
                    categoriasPadre={categorias}
                    onSubmit={crearCategoria}
                    onCancel={() => setIsCreando(false)}
                  />
                </>
              ) : isEditando && categoriaSeleccionada ? (
                <>
                  <h2 className="text-lg font-semibold mb-4">Editar Categoría</h2>
                  <CategoriaForm 
                    categoria={categoriaSeleccionada}
                    categoriasPadre={categorias.filter(c => c.id !== categoriaSeleccionada.id)}
                    onSubmit={actualizarCategoria}
                    onCancel={() => {
                      setIsEditando(false);
                      setCategoriaSeleccionada(null);
                    }}
                  />
                </>
              ) : (
                <div className="text-center py-10">
                  <h2 className="text-lg font-semibold mb-2">Gestión de Categorías</h2>
                  <p className="text-gray-500 dark:text-gray-400">
                    Selecciona una categoría para editar o crea una nueva.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoriasManager;
