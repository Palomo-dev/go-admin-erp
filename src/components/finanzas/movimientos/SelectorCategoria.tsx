'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { filtrarPorTexto } from '@/components/kit/searchSelectLogica';
import { IconoCategoria } from '@/components/finanzas/categorias-tesoreria/iconosCategoria';

export interface OpcionCategoria {
  id: number;
  nombre: string;
  icono: string;
  cuenta: string | null;
}

export function SelectorCategoria({
  categorias,
  value,
  onChange,
  placeholder,
  buscar,
  vacio,
}: {
  categorias: OpcionCategoria[];
  value: number | null;
  onChange: (id: number) => void;
  placeholder: string;
  buscar: string;
  vacio: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const actual = categorias.find((categoria) => categoria.id === value);
  const filas = useMemo(
    () => filtrarPorTexto(categorias, texto, (categoria) => [categoria.nombre, categoria.cuenta ?? '']),
    [categorias, texto],
  );

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-start font-normal">
          {actual ? (
            <>
              <IconoCategoria nombre={actual.icono} className="mr-2 h-4 w-4" />
              <span className="truncate">{actual.nombre}</span>
            </>
          ) : (
            <span className="text-gray-500">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
        <Input
          value={texto}
          onChange={(event) => setTexto(event.target.value)}
          placeholder={buscar}
          className="mb-2"
        />
        <div className="max-h-64 overflow-y-auto">
          {filas.length === 0 ? (
            <p className="px-2 py-3 text-sm text-gray-500">{vacio}</p>
          ) : (
            filas.map((categoria) => (
              <button
                key={categoria.id}
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => {
                  onChange(categoria.id);
                  setAbierto(false);
                }}
              >
                <IconoCategoria nombre={categoria.icono} className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{categoria.nombre}</span>
                {categoria.cuenta ? <span className="text-xs text-gray-500">{categoria.cuenta}</span> : null}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
