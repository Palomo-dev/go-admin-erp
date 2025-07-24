'use client';

import React from 'react';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UseFormReturn } from 'react-hook-form';
import { Building, Target, Folder, MoreHorizontal } from 'lucide-react';

interface TareaRelationsProps {
  form: UseFormReturn<any>;
  clientes: any[];
  oportunidades: any[];
}

const TareaRelations: React.FC<TareaRelationsProps> = ({ form, clientes, oportunidades }) => {
  const tiposRelacion = [
    { value: 'cliente', label: 'Cliente', icon: <Building className="h-4 w-4" /> },
    { value: 'oportunidad', label: 'Oportunidad', icon: <Target className="h-4 w-4" /> },
    { value: 'proyecto', label: 'Proyecto', icon: <Folder className="h-4 w-4" /> },
    { value: 'otro', label: 'Otro', icon: <MoreHorizontal className="h-4 w-4" /> }
  ];

  const tipoRelacion = form.watch('related_type');

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="related_type"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Tipo de relación</FormLabel>
            <Select onValueChange={field.onChange} value={field.value || ''}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona el tipo" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {tiposRelacion.map((tipo) => (
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

      {tipoRelacion === 'cliente' && (
        <FormField
          control={form.control}
          name="customer_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cliente</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ''}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un cliente" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="no-client">
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4" />
                      Sin cliente
                    </div>
                  </SelectItem>
                  {clientes.map((cliente) => (
                    <SelectItem key={cliente.id} value={cliente.id}>
                      <div className="flex items-center gap-2">
                        <Building className="h-4 w-4" />
                        {cliente.nombre || cliente.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {tipoRelacion === 'oportunidad' && (
        <FormField
          control={form.control}
          name="related_to_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Oportunidad</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ''}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una oportunidad" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="no-opportunity">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Sin oportunidad
                    </div>
                  </SelectItem>
                  {oportunidades.map((oportunidad) => (
                    <SelectItem key={oportunidad.id} value={oportunidad.id}>
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        {oportunidad.nombre || oportunidad.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );
};

export default TareaRelations;
