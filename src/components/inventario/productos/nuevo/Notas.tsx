'use client'

import { useState, forwardRef, useImperativeHandle, useEffect } from 'react';
import { FileText, Send, Loader2 } from 'lucide-react';
import { useOrganization, obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { Card, CardContent } from '@/components/ui/card';

export interface NotasRef {
  /**
   * Guarda todas las notas en la base de datos una vez que se tenga el ID del producto
   */
  guardarNotasEnBD: (product_id: number) => Promise<{success: boolean, error?: any}>;
}

export interface NotasProps {
  /**
   * ID del producto para cargar notas existentes en modo de edición
   */
  productoId?: number;
}

/**
 * Componente para agregar y gestionar notas de un producto
 */
const Notas = forwardRef<NotasRef, NotasProps>(({ productoId }, ref) => {
  const { organization } = useOrganization();
  
  // Estados
  const [notas, setNotas] = useState<Array<{id?: number, content: string, isNew?: boolean}>>([]);
  const [nuevaNota, setNuevaNota] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [initialLoading, setInitialLoading] = useState<boolean>(false);

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
  
  // Cargar notas existentes si estamos en modo de edición
  useEffect(() => {
    const cargarNotasExistentes = async () => {
      if (!productoId) return;
      
      try {
        setInitialLoading(true);
        
        const organization_id = getOrganizationId();
        
        if (!organization_id) {
          console.warn('No hay organización seleccionada para cargar notas');
          return;
        }
        
        const { data: notasData, error } = await supabase
          .from('product_notes')
          .select('id, content')
          .eq('product_id', productoId)
          .eq('organization_id', organization_id)
          .order('created_at', { ascending: true });
          
        if (error) throw error;
        
        if (notasData && notasData.length > 0) {
          // Guardamos las notas con su ID y marcadas como existentes (no nuevas)
          setNotas(notasData.map(nota => ({ 
            id: nota.id, 
            content: nota.content,
            isNew: false
          })));
        }
      } catch (error: any) {
        console.error('Error al cargar notas existentes:', error);
        toast({
          title: "Error",
          description: "No se pudieron cargar las notas existentes",
          variant: "destructive"
        });
      } finally {
        setInitialLoading(false);
      }
    };
    
    cargarNotasExistentes();
  }, [productoId]);
  
  // Función para añadir una nueva nota
  const agregarNota = () => {
    if (!nuevaNota.trim()) {
      toast({
        title: "Error",
        description: "Por favor ingresa texto en la nota",
        variant: "destructive"
      });
      return;
    }
    
    // Marcar la nota como nueva para distinguirla de las existentes
    setNotas([...notas, { content: nuevaNota.trim(), isNew: true }]);
    setNuevaNota('');
    
    toast({
      title: "Éxito",
      description: "Nota agregada. Se guardará cuando guardes el producto.",
    });
  };
  
  // Función para eliminar una nota
  const eliminarNota = async (index: number) => {
    const nota = notas[index];
    const nuevasNotas = [...notas];
    nuevasNotas.splice(index, 1);
    setNotas(nuevasNotas);
    
    // Si la nota ya existe en la base de datos (tiene ID), la eliminamos físicamente
    if (nota.id && productoId) {
      try {
        const { error } = await supabase
          .from('product_notes')
          .delete()
          .eq('id', nota.id)
          .eq('product_id', productoId);
          
        if (error) {
          console.error('Error al eliminar nota de la base de datos:', error);
          toast({
            title: "Error",
            description: "La nota fue eliminada de la vista, pero ocurrió un error al eliminarla de la base de datos",
            variant: "destructive"
          });
          return;
        }
      } catch (error) {
        console.error('Error al eliminar nota:', error);
      }
    }
    
    toast({
      title: "Nota eliminada",
      description: "La nota ha sido eliminada",
    });
  };
  
  // Función para guardar todas las notas en la base de datos
  const guardarNotasEnBD = async (product_id: number): Promise<{success: boolean, error?: any}> => {
    try {
      setIsLoading(true);
      
      const organization_id = getOrganizationId();
      if (!organization_id) {
        throw new Error("No se ha seleccionado una organización.");
      }
      
      // Obtener el usuario actual
      const { data: user } = await supabase.auth.getUser();
      const userId = user?.user?.id;
      
      if (!userId) {
        throw new Error("No se pudo obtener el ID del usuario.");
      }
      
      // Filtramos las notas nuevas que necesitan ser insertadas
      const notasNuevas = notas.filter(nota => nota.isNew === true);
      
      console.log(`Insertando ${notasNuevas.length} notas nuevas para el producto ${product_id}`);
      
      // Insertamos solo las notas nuevas
      for (const nota of notasNuevas) {
        const { error } = await supabase
          .from('product_notes')
          .insert({
            product_id,
            user_id: userId,
            content: nota.content,
            organization_id,
            created_at: new Date().toISOString(),
          });
          
        if (error) throw error;
      }
      
      // Actualizamos el estado para marcar todas las notas como no nuevas
      if (notasNuevas.length > 0) {
        setNotas(notas.map(nota => ({ ...nota, isNew: false })));
      }
      
      console.log(`Guardadas ${notasNuevas.length} notas nuevas para el producto ${product_id}`);
      
      return { success: true };
    } catch (error: any) {
      console.error('Error al guardar notas:', error);
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
    guardarNotasEnBD
  }));
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Notas del Producto</h3>
        {initialLoading && (
          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Cargando notas...
          </div>
        )}
      </div>
      
      {/* Lista de notas existentes */}
      {notas.length > 0 ? (
        <div className="space-y-3">
          {notas.map((nota, index) => (
            <Card key={index} className="overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <CardContent className="p-4 flex items-start justify-between">
                <div className="flex items-start space-x-2 flex-grow">
                  <FileText className="h-5 w-5 text-gray-600 dark:text-gray-300 mt-0.5" />
                  <div className="flex-grow">
                    <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{nota.content}</p>
                  </div>
                </div>
                <Button 
                  type="button"
                  variant="ghost" 
                  size="sm" 
                  className="text-red-500 hover:text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20"
                  onClick={() => eliminarNota(index)}
                >
                  Eliminar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 bg-gray-50 dark:bg-gray-800/50 border border-dashed border-gray-300 dark:border-gray-700 rounded-md">
          <FileText className="h-10 w-10 mx-auto text-gray-400 dark:text-gray-500" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {initialLoading 
              ? "Cargando notas..." 
              : "No hay notas agregadas para este producto"}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Añade notas para documentar información importante sobre el producto
          </p>
        </div>
      )}
      
      {/* Formulario para agregar nueva nota */}
      <div className="space-y-2">
        <Textarea
          placeholder="Escribe una nueva nota para el producto..."
          className="min-h-[100px] border border-gray-300 dark:border-gray-700"
          value={nuevaNota}
          onChange={(e) => setNuevaNota(e.target.value)}
          disabled={isLoading}
        />
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={agregarNota}
            disabled={isLoading || !nuevaNota.trim()}
            className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Añadir Nota
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
});

Notas.displayName = "Notas";

export default Notas;
