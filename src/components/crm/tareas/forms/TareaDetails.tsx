'use client';

import React from 'react';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UseFormReturn } from 'react-hook-form';
import { Phone, Users, Mail, MapPin } from 'lucide-react';

interface TareaDetailsProps {
  form: UseFormReturn<any>;
}

const TareaDetails: React.FC<TareaDetailsProps> = ({ form }) => {
  const tiposTarea = [
    { value: 'llamada', label: 'Llamada', icon: <Phone className="h-4 w-4" /> },
    { value: 'reunion', label: 'Reunión', icon: <Users className="h-4 w-4" /> },
    { value: 'email', label: 'Email', icon: <Mail className="h-4 w-4" /> },
    { value: 'visita', label: 'Visita', icon: <MapPin className="h-4 w-4" /> }
  ];

  const prioridades = [
    { value: 'low', label: 'Baja' },
    { value: 'med', label: 'Media' },
    { value: 'high', label: 'Alta' }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <FormField
        control={form.control}
        name="type"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Tipo de tarea *</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {tiposTarea.map((tipo) => (
                  <SelectItem key={tipo.value} value={tipo.value}>
                    <div className="flex items-center gap-2">
                      {tipo.icon}
                      {tipo.label}
                    </div>
                  </SelectItem>
                ))}
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
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona prioridad" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {prioridades.map((prioridad) => (
                  <SelectItem key={prioridad.value} value={prioridad.value}>
                    {prioridad.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

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
                value={field.value ? new Date(field.value).toISOString().slice(0, 16) : ''}
                onChange={(e) => {
                  const value = e.target.value;
                  field.onChange(value ? new Date(value).toISOString() : '');
                }}
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
                value={field.value ? new Date(field.value).toISOString().slice(0, 16) : ''}
                onChange={(e) => {
                  const value = e.target.value;
                  field.onChange(value ? new Date(value).toISOString() : '');
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};

export default TareaDetails;
