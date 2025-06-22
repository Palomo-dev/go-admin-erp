"use client"

import { UseFormReturn } from 'react-hook-form'
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

interface PrecioysCostosProps {
  form: UseFormReturn<any>
}

export default function PrecionyCostos({ form }: PrecioysCostosProps) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium">Precios y Costos</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormField
          control={form.control}
          name="cost"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Costo (sin impuestos)</FormLabel>
              <FormControl>
                <Input 
                  type="number" 
                  step="0.01"
                  placeholder="0.00" 
                  {...field} 
                  onChange={(e) => {
                    const value = e.target.value === '' ? '' : parseFloat(e.target.value);
                    field.onChange(value === '' ? undefined : value);
                  }}
                />
              </FormControl>
              <FormDescription>
                Costo por unidad de producto
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="price"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Precio de venta (sin impuestos)</FormLabel>
              <FormControl>
                <Input 
                  type="number" 
                  step="0.01"
                  placeholder="0.00" 
                  {...field}
                  onChange={(e) => {
                    const value = e.target.value === '' ? '' : parseFloat(e.target.value);
                    field.onChange(value === '' ? undefined : value);
                  }}
                />
              </FormControl>
              <FormDescription>
                Precio de venta sin incluir impuestos
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      
      {/* Campo adicional para calcular el margen de ganancia (opcional) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 border rounded-md bg-muted/50">
          <span className="block text-sm font-medium mb-2">Margen de ganancia</span>
          <span className="text-lg">
            {(() => {
              const costo = form.watch('cost');
              const precio = form.watch('price');
              
              if (!costo || !precio || costo <= 0) return '0.00%';
              
              const margen = ((precio - costo) / costo) * 100;
              return `${margen.toFixed(2)}%`;
            })()}
          </span>
        </div>

        <div className="p-4 border rounded-md bg-muted/50">
          <span className="block text-sm font-medium mb-2">Utilidad</span>
          <span className="text-lg">
            {(() => {
              const costo = form.watch('cost');
              const precio = form.watch('price');
              
              if (!costo || !precio) return '0.00';
              
              const utilidad = precio - costo;
              return utilidad.toFixed(2);
            })()}
          </span>
        </div>

        <div className="p-4 border rounded-md bg-muted/50">
          <span className="block text-sm font-medium mb-2">% Utilidad</span>
          <span className="text-lg">
            {(() => {
              const costo = form.watch('cost');
              const precio = form.watch('price');
              
              if (!costo || !precio || precio <= 0) return '0.00%';
              
              const porcentajeUtilidad = ((precio - costo) / precio) * 100;
              return `${porcentajeUtilidad.toFixed(2)}%`;
            })()}
          </span>
        </div>
      </div>
    </div>
  )
}
