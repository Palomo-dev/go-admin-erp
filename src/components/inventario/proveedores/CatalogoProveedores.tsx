"use client";

import React, { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Proveedor, FiltrosProveedores as FiltrosProveedoresType } from './types';
import { supabase } from '@/lib/supabase/config';
import { Button } from "@/components/ui/button";
import { toast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

// Importaciones de los componentes creados
import ProveedoresPageHeader from './ProveedoresPageHeader';
import FiltrosProveedores from '@/components/inventario/proveedores/FiltrosProveedores';
import ProveedoresTable from './ProveedoresTable';
import FormularioProveedor from './FormularioProveedor';
import DetalleProveedor from './DetalleProveedor';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

/**
 * Componente principal para el catálogo de proveedores
 * 
 * Este componente orquesta la visualización y gestión de proveedores,
 * incluyendo listado, filtrado, creación, edición y visualización de detalles.
 */
const CatalogoProveedores: React.FC = () => {
  // Tema actual
  const { theme } = useTheme();
  
  // Estados para gestionar la interfaz y los datos
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isViewing, setIsViewing] = useState<boolean>(false);
  const [selectedProveedor, setSelectedProveedor] = useState<Proveedor | null>(null);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filters, setFilters] = useState<FiltrosProveedoresType>({
    busqueda: '',
    estado: '',
    ordenarPor: 'name'
  });
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  const [proveedorToDelete, setProveedorToDelete] = useState<number | null>(null);

  // Cargar proveedores desde Supabase
  useEffect(() => {
    const fetchProveedores = async () => {
      try {
        setLoading(true);
        
        // Obtener el ID de organización del almacenamiento local
        let organizationId = null;
        
        if (typeof window !== 'undefined') {
          // Intentar obtener primero desde localStorage
          const storedOrg = localStorage.getItem('selectedOrganization');
          if (storedOrg) {
            try {
              const parsedOrg = JSON.parse(storedOrg);
              organizationId = parsedOrg.id || parsedOrg.organization_id;
            } catch (e) {
              console.error('Error al parsear organización del localStorage:', e);
            }
          }
          
          // Si no existe en localStorage, intentar en sessionStorage
          if (!organizationId) {
            const sessionOrg = sessionStorage.getItem('selectedOrganization');
            if (sessionOrg) {
              try {
                const parsedOrg = JSON.parse(sessionOrg);
                organizationId = parsedOrg.id || parsedOrg.organization_id;
              } catch (e) {
                console.error('Error al parsear organización del sessionStorage:', e);
              }
            }
          }
        }
        
        // Si no tenemos ID, intentar obtenerlo de Supabase como fallback
        if (!organizationId) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            // Consultar la primera organización del usuario desde la tabla organization_members
            const { data: orgMember } = await supabase
              .from('organization_members')
              .select('organization_id')
              .eq('user_id', session.user.id)
              .eq('is_active', true)
              .limit(1)
              .single();
              
            if (orgMember) {
              organizationId = orgMember.organization_id;
            } else {
              // Si no hay relación en organization_members, intentar con la primera organización
              const { data: org } = await supabase
                .from('organizations')
                .select('id')
                .limit(1)
                .single();
                
              if (org) {
                organizationId = org.id;
              }
            }
          }
        }

        // Si aún no tenemos ID después de todos los intentos, usar 1 como fallback
        if (!organizationId) {
          console.warn('No se pudo obtener ID de organización. Usando valor por defecto (1)');
          organizationId = 1;
        }
        
        // Consulta básica a la tabla de proveedores filtrada por organization_id
        let query = supabase
          .from('suppliers')
          .select('*')
          .eq('organization_id', organizationId);
        
        // Aplicar filtros si existen
        if (filters.busqueda) {
          query = query.or(`name.ilike.%${filters.busqueda}%,email.ilike.%${filters.busqueda}%,nit.ilike.%${filters.busqueda}%`);
        }
        
        // Ordenar resultados
        query = query.order(filters.ordenarPor || 'name', { ascending: true });
        
        const { data, error } = await query;
        
        if (error) {
          throw error;
        }
        
        // Transformar los datos a nuestro formato de interfaz
        const proveedoresData = data.map((p: any): Proveedor => ({
          id: p.id,
          organization_id: p.organization_id,
          name: p.name,
          nit: p.nit || '',
          contact: p.contact || '',
          phone: p.phone || '',
          email: p.email || '',
          notes: p.notes || '',
          created_at: p.created_at,
          updated_at: p.updated_at,
          // Datos de ejemplo para UI - en producción estos vendrían de otras tablas
          condiciones_pago: {
            dias_credito: 30,
            limite_credito: 5000000,
            metodo_pago_preferido: 'Transferencia'
          },
          cumplimiento: Math.floor(Math.random() * 100) // Solo para demostración
        }));
        
        setProveedores(proveedoresData);
      } catch (error) {
        console.error('Error al cargar proveedores:', error);
        toast({
          title: "Error",
          description: "No se pudieron cargar los proveedores",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchProveedores();
  }, [filters]);

  // Función para crear un nuevo proveedor
  const handleCreateProveedor = async (proveedor: Partial<Proveedor>) => {
    try {
      // Preparar datos para inserción
      const { data, error } = await supabase
        .from('suppliers')
        .insert([{
          organization_id: proveedor.organization_id,
          name: proveedor.name,
          nit: proveedor.nit,
          contact: proveedor.contact,
          phone: proveedor.phone,
          email: proveedor.email,
          notes: proveedor.notes
        }])
        .select();
      
      if (error) {
        throw error;
      }
      
      toast({
        title: "Éxito",
        description: "Proveedor creado con éxito",
        variant: "default",
      });
      setIsCreating(false);
      
      // Actualizar lista de proveedores
      setProveedores([...proveedores, {
        ...data[0],
        condiciones_pago: {
          dias_credito: 30,
          limite_credito: 5000000,
          metodo_pago_preferido: 'Transferencia'
        },
        cumplimiento: 100 // Nuevo proveedor inicia con 100%
      }]);
    } catch (error) {
      console.error('Error al crear proveedor:', error);
      toast({
        title: "Error",
        description: "Error al crear proveedor",
        variant: "destructive",
      });
    }
  };

  // Función para actualizar un proveedor existente
  const handleUpdateProveedor = async (proveedor: Proveedor) => {
    try {
      const { error } = await supabase
        .from('suppliers')
        .update({
          name: proveedor.name,
          nit: proveedor.nit,
          contact: proveedor.contact,
          phone: proveedor.phone,
          email: proveedor.email,
          notes: proveedor.notes
        })
        .eq('id', proveedor.id);
      
      if (error) {
        throw error;
      }
      
      toast({
        title: "Éxito",
        description: "Proveedor actualizado con éxito",
        variant: "default",
      });
      setIsEditing(false);
      setSelectedProveedor(null);
      
      // Actualizar lista de proveedores
      setProveedores(proveedores.map(p => 
        p.id === proveedor.id ? {...p, ...proveedor} : p
      ));
    } catch (error) {
      console.error('Error al actualizar proveedor:', error);
      toast({
        title: "Error",
        description: "Error al actualizar proveedor",
        variant: "destructive",
      });
    }
  };

  // Función para mostrar el diálogo de confirmación de eliminación
  const handleShowDeleteDialog = (id: number) => {
    setProveedorToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  // Función para confirmar la eliminación de un proveedor
  const handleConfirmDelete = async () => {
    if (!proveedorToDelete) return;
    
    try {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', proveedorToDelete);
      
      if (error) {
        throw error;
      }
      
      toast({
        title: "Éxito",
        description: "Proveedor eliminado con éxito",
        variant: "default",
      });
      
      // Actualizar lista de proveedores
      setProveedores(proveedores.filter(p => p.id !== proveedorToDelete));
      
      // Cerrar el diálogo y limpiar el estado
      setIsDeleteDialogOpen(false);
      setProveedorToDelete(null);
    } catch (error) {
      console.error('Error al eliminar proveedor:', error);
      toast({
        title: "Error",
        description: "Error al eliminar proveedor",
        variant: "destructive",
      });
    }
  };

  // Función legacy para eliminar un proveedor (actualizada para usar el diálogo)
  const handleDeleteProveedor = (id: number) => {
    handleShowDeleteDialog(id);
  };
  
  // Función para cerrar todos los modales
  const handleCloseModals = () => {
    setIsCreating(false);
    setIsEditing(false);
    setIsViewing(false);
    setSelectedProveedor(null);
    setIsDeleteDialogOpen(false);
    setProveedorToDelete(null);
  };

  return (
    <div className={`flex flex-col gap-6 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-800'}`}>
      <ProveedoresPageHeader 
        onNuevoProveedor={() => setIsCreating(true)} 
      />
      
      <FiltrosProveedores 
        filters={filters} 
        setFilters={setFilters} 
      />
      
      {loading ? (
        <div className="flex justify-center items-center py-10">
          <Loader2 className={`h-10 w-10 animate-spin ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
        </div>
      ) : (
        <ProveedoresTable 
          proveedores={proveedores}
          onView={(proveedor) => {
            setSelectedProveedor(proveedor);
            setIsViewing(true);
          }}
          onEdit={(proveedor) => {
            setSelectedProveedor(proveedor);
            setIsEditing(true);
          }}
          onDelete={handleDeleteProveedor}
        />
      )}
      
      {/* Modal para creación de proveedor */}
      {isCreating && (
        <FormularioProveedor 
          onSubmit={handleCreateProveedor}
          onCancel={() => setIsCreating(false)}
        />
      )}
      
      {/* Modal para edición de proveedor */}
      {isEditing && selectedProveedor && (
        <FormularioProveedor 
          proveedor={selectedProveedor}
          onSubmit={handleUpdateProveedor}
          onCancel={() => {
            setIsEditing(false);
            setSelectedProveedor(null);
          }}
        />
      )}
      
      {/* Modal para visualización de detalles */}
      {isViewing && selectedProveedor && (
        <DetalleProveedor 
          proveedor={selectedProveedor}
          onClose={handleCloseModals}
        />
      )}

      {/* Diálogo de confirmación para eliminar proveedor */}
      {isDeleteDialogOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-2">Confirmar eliminación</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              ¿Estás seguro de que deseas eliminar este proveedor? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setProveedorToDelete(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDelete}
              >
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CatalogoProveedores;
