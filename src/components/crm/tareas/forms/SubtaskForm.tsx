'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Task, NewTask } from '@/types/task';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Calendar, User, Building, AlertTriangle } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const subtaskSchema = z.object({
  title: z.string().min(3, { message: 'El título debe tener al menos 3 caracteres' }),
  description: z.string(),
  type: z.enum(['llamada', 'reunion', 'email', 'visita']),
  priority: z.enum(['low', 'med', 'high']),
  due_date: z.string().min(1, { message: 'La fecha límite es requerida' }),
  assigned_to: z.string().nullable().optional(),
  start_time: z.string().optional(),
});

type SubtaskFormValues = z.infer<typeof subtaskSchema>;

interface SubtaskFormProps {
  parentTask: Task;
  open: boolean;
  onClose: (open: boolean) => void;
  onSave: (subtaskData: Omit<NewTask, 'parent_task_id'>) => Promise<void>;
  loading?: boolean;
  usuarios?: Array<{ id: string; first_name: string; last_name: string; }>;
}

const SubtaskForm: React.FC<SubtaskFormProps> = ({
  parentTask,
  open,
  onClose,
  onSave,
  loading = false,
  usuarios = []
}) => {
  const { toast } = useToast();
  const [enviando, setEnviando] = React.useState(false);
  
  const form = useForm<SubtaskFormValues>({
    resolver: zodResolver(subtaskSchema),
    defaultValues: {
      title: '',
      description: '',
      type: 'llamada',
      priority: parentTask.priority || 'med',
      due_date: '',
      assigned_to: parentTask.assigned_to,
      start_time: '',
    }
  });

  // Resetear formulario cuando se abre
  React.useEffect(() => {
    if (open) {
      form.reset({
        title: '',
        description: '',
        type: 'llamada',
        priority: parentTask.priority || 'med',
        due_date: '',
        assigned_to: parentTask.assigned_to,
        start_time: '',
      });
    }
  }, [open, parentTask, form]);
  
  const onSubmit = async (data: SubtaskFormValues) => {
    try {
      setEnviando(true);
      
      const subtaskData: Omit<NewTask, 'parent_task_id'> = {
        ...data,
        assigned_to: data.assigned_to === 'unassigned' ? null : data.assigned_to || null,
        start_time: data.start_time || null,
        status: 'open',
        remind_email: false,
        remind_push: true,
        remind_before_minutes: 30,
        related_type: 'otro',
        organization_id: 1, // Se establecerá correctamente en createSubtask
        related_to_id: null // Se establecerá correctamente en createSubtask
      };
      
      await onSave(subtaskData);
      
      toast({
        title: "Subtarea creada",
        description: `La subtarea "${data.title}" ha sido creada exitosamente.`,
      });
      
      form.reset();
      onClose(false);
      
    } catch (error) {
      console.error('Error al crear subtarea:', error);
      toast({
        title: "Error",
        description: "No se pudo crear la subtarea",
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high': return 'Alta';
      case 'med': return 'Media';
      case 'low': return 'Baja';
      default: return priority;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'llamada': return 'Llamada';
      case 'reunion': return 'Reunión';
      case 'email': return 'Email';
      case 'visita': return 'Visita';
      default: return type;
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-blue-500" />
            Nueva Subtarea
          </DialogTitle>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Crear una subtarea para: <span className="font-medium">"{parentTask.title}"</span>
            </p>
            
            {/* Información heredada */}
            <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg space-y-2">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-2">
                Información heredada de la tarea padre:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {parentTask.assigned_to_name && (
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span>Asignado: {parentTask.assigned_to_name}</span>
                  </div>
                )}
                {parentTask.customer?.full_name && (
                  <div className="flex items-center gap-1">
                    <Building className="h-3 w-3" />
                    <span>Cliente: {parentTask.customer.full_name}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <span>Prioridad: {getPriorityLabel(parentTask.priority)}</span>
                </div>
                {parentTask.due_date && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>Fecha padre: {new Date(parentTask.due_date).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Información Básica */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Información de la Subtarea</h3>
              
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Ej: Llamar al cliente para confirmar reunión"
                        {...field} 
                      />
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
                        placeholder="Describe los detalles de esta subtarea..."
                        className="min-h-[80px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />
            
            {/* Detalles */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Detalles</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de tarea *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona el tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="llamada">📞 Llamada</SelectItem>
                          <SelectItem value="reunion">🤝 Reunión</SelectItem>
                          <SelectItem value="email">📧 Email</SelectItem>
                          <SelectItem value="visita">🏢 Visita</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prioridad</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona la prioridad" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">🟢 Baja</SelectItem>
                          <SelectItem value="med">🟡 Media</SelectItem>
                          <SelectItem value="high">🔴 Alta</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="due_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha límite *</FormLabel>
                      <FormControl>
                        <Input 
                          type="datetime-local"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="start_time"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hora de inicio</FormLabel>
                      <FormControl>
                        <Input 
                          type="datetime-local"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />
            
            {/* Asignación */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Asignación</h3>
              
              <FormField
                control={form.control}
                name="assigned_to"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Asignar a</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value || ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un usuario" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unassigned">Sin asignar</SelectItem>
                        {usuarios.map((usuario) => (
                          <SelectItem key={usuario.id} value={usuario.id}>
                            {usuario.first_name} {usuario.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onClose(false)}
                disabled={enviando}
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={enviando}
                className="min-w-[120px]"
              >
                {enviando ? 'Creando...' : 'Crear Subtarea'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default SubtaskForm;
