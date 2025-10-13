'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Task, NewTask, TaskPriority, TaskPriorityUI, TaskStatus, TaskStatusUI, RelatedType } from '@/types/task';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { getOrganizationId, obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { createTask, updateTask } from '@/lib/services/taskService';
import { getAssignableUsers } from '@/lib/services/userService';

// Componentes modulares
import TareaBasicInfo from './TareaBasicInfo';
import TareaDetails from './TareaDetails';
import TareaAssignment from './TareaAssignment';
import TareaRelations from './TareaRelations';
import TareaReminders from './TareaReminders';
import TareaCancellation from './TareaCancellation';

// Esquema de validación
const formSchema = z.object({
  title: z.string().min(3, { message: 'El título debe tener al menos 3 caracteres' }),
  type: z.enum(['llamada', 'reunion', 'email', 'visita']),
  priority: z.enum(['low', 'med', 'high']),
  due_date: z.string().min(1, { message: 'La fecha límite es requerida' }),
  assigned_to: z.string().nullable().optional(),
  related_type: z.enum(['cliente', 'oportunidad', 'proyecto', 'otro']).optional(),
  related_to_id: z.string().nullable().optional(),
  customer_id: z.string().nullable().optional(),
  description: z.string(),
  start_time: z.string().optional(),
  remind_before_minutes: z.number().nullable().optional(),
  remind_email: z.boolean(),
  remind_push: z.boolean(),
  cancellation_reason: z.string().optional(),
});

type FormValues = {
  title: string;
  type: 'llamada' | 'reunion' | 'email' | 'visita';
  priority: 'low' | 'med' | 'high';
  due_date: string;
  assigned_to?: string | null;
  related_type?: 'cliente' | 'oportunidad' | 'proyecto' | 'otro';
  related_to_id?: string | null;
  customer_id?: string | null;
  description: string;
  start_time?: string;
  remind_before_minutes?: number | null;
  remind_email: boolean;
  remind_push: boolean;
  cancellation_reason?: string;
};

interface FormularioTareaProps {
  tarea?: Task;
  onSave: (tarea?: Task) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FormularioTarea: React.FC<FormularioTareaProps> = ({
  tarea,
  onSave,
  open,
  onOpenChange
}) => {
  const { toast } = useToast();
  
  // Estados
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [oportunidades, setOportunidades] = useState<any[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [cargandoUsuarios, setCargandoUsuarios] = useState(true);
  const [cargandoRelacionados, setCargandoRelacionados] = useState(true);
  
  // Configuración del formulario
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      type: 'llamada',
      priority: 'med',
      due_date: '',
      assigned_to: null,
      related_type: undefined,
      related_to_id: null,
      customer_id: null,
      description: '',
      start_time: '',
      remind_before_minutes: 30,
      remind_email: false,
      remind_push: true,
    },
  });

  // Obtener organización activa
  const getOrganizationName = (): string => {
    const organizacion = obtenerOrganizacionActiva();
    return organizacion?.name || 'Organización por defecto';
  };

  // Cargar usuarios
  useEffect(() => {
    const cargarUsuarios = async () => {
      try {
        setCargandoUsuarios(true);
        const usuariosData = await getAssignableUsers();
        setUsuarios(usuariosData);
      } catch (error) {
        console.error('Error al cargar usuarios:', error);
        toast({
          title: "Error",
          description: "No se pudieron cargar los usuarios",
          variant: "destructive",
        });
      } finally {
        setCargandoUsuarios(false);
      }
    };

    if (open) {
      cargarUsuarios();
    }
  }, [open, toast]);

  // Cargar clientes y oportunidades
  useEffect(() => {
    const cargarDatosRelacionados = async () => {
      try {
        setCargandoRelacionados(true);
        const organizationId = getOrganizationId();
        
        // Cargar clientes
        const { data: clientesData, error: clientesError } = await supabase
          .from('customers')
          .select('id, full_name, first_name, last_name')
          .eq('organization_id', organizationId)
          .order('full_name');
        
        if (clientesError) throw clientesError;
        // Mapear para agregar un campo name calculado
        const clientesMapeados = (clientesData || []).map(cliente => ({
          ...cliente,
          name: cliente.full_name || `${cliente.first_name || ''} ${cliente.last_name || ''}`.trim() || 'Sin nombre'
        }));
        setClientes(clientesMapeados);

        // Cargar oportunidades
        const { data: oportunidadesData, error: oportunidadesError } = await supabase
          .from('opportunities')
          .select(`
            id, 
            name,
            customer_id,
            customers!inner(full_name, first_name, last_name)
          `)
          .eq('organization_id', organizationId)
          .order('name');
        
        if (oportunidadesError) throw oportunidadesError;
        setOportunidades(oportunidadesData || []);
        
      } catch (error) {
        console.error('Error al cargar datos relacionados:', error);
      } finally {
        setCargandoRelacionados(false);
      }
    };

    if (open) {
      cargarDatosRelacionados();
    }
  }, [open]);

  // Configurar valores iniciales cuando se edita una tarea
  useEffect(() => {
    if (tarea && open) {
      form.reset({
        title: tarea.title || '',
        type: tarea.type || 'llamada',
        priority: tarea.priority || 'med',
        due_date: tarea.due_date || '',
        assigned_to: tarea.assigned_to || null,
        related_type: tarea.related_type === 'customer' ? 'cliente' : 
                     tarea.related_type === 'opportunity' ? 'oportunidad' : 
                     tarea.related_type === 'project' ? 'proyecto' : 
                     tarea.related_type === 'other' ? 'otro' : 
                     (tarea.related_type as 'cliente' | 'oportunidad' | 'proyecto' | 'otro' | undefined) || undefined,
        related_to_id: tarea.related_to_id || null,
        customer_id: tarea.customer_id || null,
        description: tarea.description || '',
        start_time: tarea.start_time || '',
        remind_before_minutes: tarea.remind_before_minutes || 30,
        remind_email: tarea.remind_email || false,
        remind_push: tarea.remind_push || true,
        cancellation_reason: tarea.cancellation_reason || '',
      });
    } else if (open) {
      form.reset({
        title: '',
        type: 'llamada',
        priority: 'med',
        due_date: '',
        assigned_to: null,
        related_type: undefined,
        related_to_id: null,
        customer_id: null,
        description: '',
        start_time: '',
        remind_before_minutes: 30,
        remind_email: false,
        remind_push: true,
        cancellation_reason: '',
      });
    }
  }, [tarea, open, form]);

  // Función para enviar el formulario
  const onSubmit = async (data: FormValues) => {
    try {
      setEnviando(true);
      const organizationId = getOrganizationId();
      
      // Preparar datos para la BD
      console.log('📝 Datos del formulario antes de procesar:', {
        customer_id: data.customer_id,
        related_type: data.related_type,
        related_to_id: data.related_to_id
      });
      
      const tareaData = {
        organization_id: organizationId,
        created_by: (await supabase.auth.getUser()).data.user?.id,
        status: 'open' as TaskStatus,
        due_date: data.due_date,
        start_time: data.start_time || null,
        remind_before_minutes: data.remind_before_minutes || null,
        assigned_to: data.assigned_to || null,
        title: data.title,
        type: data.type,
        priority: data.priority,
        related_type: data.related_type || 'otro',
        related_to_id: data.related_to_id || null,
        customer_id: data.customer_id === 'no-client' ? null : data.customer_id,
        remind_email: data.remind_email,
        remind_push: data.remind_push,
        description: data.description || '',
        cancellation_reason: data.cancellation_reason || null,
      };
      
      console.log('💾 Datos procesados para guardar en BD:', {
        customer_id: tareaData.customer_id,
        related_to_type: tareaData.related_type,
        related_to_id: tareaData.related_to_id
      });

      let tareaGuardada;
      if (tarea) {
        // Actualizar tarea existente
        tareaGuardada = await updateTask(tarea.id, tareaData);
        toast({
          title: "Tarea actualizada",
          description: "La tarea ha sido actualizada exitosamente",
        });
      } else {
        // Crear nueva tarea
        tareaGuardada = await createTask(tareaData);
        toast({
          title: "Tarea creada",
          description: "La tarea ha sido creada exitosamente",
        });
      }

      onSave(tareaGuardada);
      onOpenChange(false);
      
    } catch (error) {
      console.error('Error al guardar tarea:', error);
      toast({
        title: "Error",
        description: "No se pudo guardar la tarea",
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <DialogHeader className="pb-3">
          <DialogTitle className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            {tarea ? 'Editar Tarea' : 'Nueva Tarea'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
            {/* Información Básica */}
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-900 dark:text-gray-100">Información Básica</h3>
              <TareaBasicInfo form={form} />
            </div>

            <Separator className="bg-gray-200 dark:bg-gray-700" />

            {/* Detalles de la Tarea */}
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-900 dark:text-gray-100">Detalles</h3>
              <TareaDetails form={form} />
            </div>

            <Separator className="bg-gray-200 dark:bg-gray-700" />

            {/* Asignación */}
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-900 dark:text-gray-100">Asignación</h3>
              <TareaAssignment form={form} usuarios={usuarios} />
            </div>

            <Separator className="bg-gray-200 dark:bg-gray-700" />

            {/* Relaciones */}
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-900 dark:text-gray-100">Relaciones</h3>
              <TareaRelations 
                form={form} 
                clientes={clientes} 
                oportunidades={oportunidades} 
              />
            </div>

            <Separator className="bg-gray-200 dark:bg-gray-700" />

            {/* Recordatorios */}
            <div>
              <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-900 dark:text-gray-100">Recordatorios</h3>
              <TareaReminders form={form} />
            </div>

            {/* Motivo de Cancelación - Solo visible si la tarea está cancelada */}
            <TareaCancellation 
              form={form} 
              isVisible={tarea?.status === 'canceled'}
            />

            <DialogFooter className="gap-2 sm:gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                className="min-h-[44px] border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={enviando}
                className="min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                {enviando ? 'Guardando...' : (tarea ? 'Actualizar' : 'Crear')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default FormularioTarea;
