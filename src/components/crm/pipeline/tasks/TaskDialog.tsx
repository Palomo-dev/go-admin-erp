"use client";

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface NewTask {
  title: string;
  description: string;
  due_date: string | null;
  priority: string;
  remind_before_minutes: number;
  remind_email: boolean;
  remind_push: boolean;
}

interface TaskDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  newTask: NewTask;
  onTaskChange: (updates: Partial<NewTask>) => void;
  onSubmit: (e: React.FormEvent) => void;
  selectedDate: Date | undefined;
  onDateSelect: (date: Date | undefined) => void;
}

/**
 * Componente de diálogo para crear/editar tareas
 * Maneja el formulario completo de tarea con validaciones
 */
export default function TaskDialog({
  isOpen,
  onOpenChange,
  newTask,
  onTaskChange,
  onSubmit,
  selectedDate,
  onDateSelect,
}: TaskDialogProps) {
  const updateTaskSafely = (updates: Partial<NewTask>) => {
    onTaskChange(updates);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Crear Nueva Tarea</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Título */}
          <div>
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              value={newTask.title}
              onChange={(e) => updateTaskSafely({ title: e.target.value })}
              placeholder="Ej: Llamar al cliente para seguimiento"
              required
            />
          </div>
          
          {/* Descripción */}
          <div>
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              value={newTask.description}
              onChange={(e) => updateTaskSafely({ description: e.target.value })}
              placeholder="Detalles adicionales de la tarea"
              rows={3}
            />
          </div>
          
          {/* Fecha límite y prioridad */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="due_date">Fecha límite</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={`w-full h-9 justify-start text-left font-normal ${
                      !selectedDate && "text-muted-foreground"
                    }`}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? (
                      format(selectedDate, "PPP", { locale: es })
                    ) : (
                      <span>Seleccionar fecha</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={onDateSelect}
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            {/* Prioridad */}
            <div className="space-y-2">
              <Label htmlFor="priority">Prioridad</Label>
              <Select 
                value={newTask.priority} 
                onValueChange={(value) => updateTaskSafely({ priority: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar prioridad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baja</SelectItem>
                  <SelectItem value="med">Media</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Recordatorios */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Recordatorios</Label>
            <div className="space-y-3">
              {/* Email */}
              <div className="flex items-center space-x-2">
                <div 
                  className={`w-4 h-4 border-2 rounded cursor-pointer flex items-center justify-center transition-colors ${
                    newTask.remind_email 
                      ? 'bg-blue-600 border-blue-600' 
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    setTimeout(() => {
                      const newValue = !newTask.remind_email;
                      const safeMinutes = typeof newTask.remind_before_minutes === 'number' && 
                                        !isNaN(newTask.remind_before_minutes) && 
                                        newTask.remind_before_minutes > 0 
                                        ? newTask.remind_before_minutes 
                                        : 30;
                      
                      updateTaskSafely({ 
                        remind_email: newValue,
                        remind_before_minutes: safeMinutes
                      });
                    }, 0);
                  }}
                  role="checkbox"
                  aria-checked={newTask.remind_email}
                  tabIndex={0}
                >
                  {newTask.remind_email && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <Label className="text-sm cursor-pointer" onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  
                  setTimeout(() => {
                    const newValue = !newTask.remind_email;
                    const safeMinutes = typeof newTask.remind_before_minutes === 'number' && 
                                      !isNaN(newTask.remind_before_minutes) && 
                                      newTask.remind_before_minutes > 0 
                                      ? newTask.remind_before_minutes 
                                      : 30;
                    
                    updateTaskSafely({ 
                      remind_email: newValue,
                      remind_before_minutes: safeMinutes
                    });
                  }, 0);
                }}>Recordatorio por email</Label>
              </div>
              
              {/* Push */}
              <div className="flex items-center space-x-2">
                <div 
                  className={`w-4 h-4 border-2 rounded cursor-pointer flex items-center justify-center transition-colors ${
                    newTask.remind_push 
                      ? 'bg-blue-600 border-blue-600' 
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    setTimeout(() => {
                      const newValue = !newTask.remind_push;
                      const safeMinutes = typeof newTask.remind_before_minutes === 'number' && 
                                        !isNaN(newTask.remind_before_minutes) && 
                                        newTask.remind_before_minutes > 0 
                                        ? newTask.remind_before_minutes 
                                        : 30;
                      
                      updateTaskSafely({ 
                        remind_push: newValue,
                        remind_before_minutes: safeMinutes
                      });
                    }, 0);
                  }}
                  role="checkbox"
                  aria-checked={newTask.remind_push}
                  tabIndex={0}
                >
                  {newTask.remind_push && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <Label className="text-sm cursor-pointer" onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  
                  setTimeout(() => {
                    const newValue = !newTask.remind_push;
                    const safeMinutes = typeof newTask.remind_before_minutes === 'number' && 
                                      !isNaN(newTask.remind_before_minutes) && 
                                      newTask.remind_before_minutes > 0 
                                      ? newTask.remind_before_minutes 
                                      : 30;
                    
                    updateTaskSafely({ 
                      remind_push: newValue,
                      remind_before_minutes: safeMinutes
                    });
                  }, 0);
                }}>Notificación push</Label>
              </div>
              
              {/* Tiempo de recordatorio */}
              <div className="flex items-center space-x-2">
                <Label htmlFor="remind_minutes" className="text-sm">Recordar</Label>
                <Select 
                  value={String(typeof newTask.remind_before_minutes === 'number' && !isNaN(newTask.remind_before_minutes) ? newTask.remind_before_minutes : 30)} 
                  onValueChange={(value) => {
                    const minutes = parseInt(value, 10);
                    
                    if (!isNaN(minutes) && minutes > 0) {
                      updateTaskSafely({ remind_before_minutes: minutes });
                    } else {
                      updateTaskSafely({ remind_before_minutes: 30 });
                    }
                  }}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 min antes</SelectItem>
                    <SelectItem value="30">30 min antes</SelectItem>
                    <SelectItem value="60">1 hora antes</SelectItem>
                    <SelectItem value="1440">1 día antes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          {/* Botones */}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">
              Crear Tarea
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
