'use client';

/** Select de un filtro dentro de FilterPanel, con su etiqueta (FormField). */
import { FormField } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function FiltroSelect({
  etiqueta,
  valor,
  onValor,
  opciones,
}: {
  etiqueta: string;
  valor: string;
  onValor: (v: string) => void;
  opciones: ReadonlyArray<{ v: string; e: string }>;
}) {
  return (
    <FormField etiqueta={etiqueta}>
      {(campo) => (
        <Select value={valor} onValueChange={onValor}>
          <SelectTrigger id={campo.id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {opciones.map((o) => (
              <SelectItem key={o.v} value={o.v}>
                {o.e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}
