'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { buscarClientes } from '@/lib/services/customers/busquedaClientesService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Tercero {
  nit: string;
  nombre: string;
}

function comodin(texto: string): string {
  return texto.replace(/[%_,().]/g, '').trim();
}

export function SelectorTercero({
  nit,
  nombre,
  onChange,
  placeholder,
  usarNit,
}: {
  nit: string;
  nombre: string;
  onChange: (tercero: Tercero) => void;
  placeholder: string;
  usarNit: (nit: string) => string;
}) {
  const [texto, setTexto] = useState(nit ? `${nit}${nombre ? ` · ${nombre}` : ''}` : '');
  const [opciones, setOpciones] = useState<Tercero[]>([]);

  useEffect(() => {
    const consulta = comodin(texto);
    if (consulta.length < 2) {
      setOpciones([]);
      return;
    }
    const orgId = getOrganizationId();
    if (!orgId) return;
    let vivo = true;
    const timer = setTimeout(() => {
      void (async () => {
        const patron = `%${consulta}%`;
        try {
          const [clientes, proveedores] = await Promise.all([
            buscarClientes(supabase, { organizationId: orgId, texto: consulta, limite: 12 }),
            supabase
              .from('suppliers')
              .select('name, nit')
              .eq('organization_id', orgId)
              .eq('is_active', true)
              .or(`nit.ilike.${patron},name.ilike.${patron}`)
              .limit(12),
          ]);
          if (!vivo) return;
          const filas: Tercero[] = [];
          for (const cliente of clientes.filas) {
            const documento = String(cliente.identification_number ?? '').trim();
            if (!documento) continue;
            filas.push({ nit: documento, nombre: String(cliente.full_name ?? '').trim() });
          }
          for (const proveedor of proveedores.data ?? []) {
            const documento = String(proveedor.nit ?? '').trim();
            if (!documento) continue;
            filas.push({ nit: documento, nombre: String(proveedor.name ?? '').trim() });
          }
          setOpciones(filas);
        } catch {
          if (vivo) setOpciones([]);
        }
      })();
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [texto]);

  return (
    <div className="space-y-2">
      <Input
        value={texto}
        placeholder={placeholder}
        onChange={(event) => {
          const valor = event.target.value;
          setTexto(valor);
          onChange({ nit: comodin(valor), nombre: '' });
        }}
      />
      {opciones.length > 0 ? (
        <div className="max-h-40 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700">
          {opciones.map((opcion) => (
            <button
              key={`${opcion.nit}-${opcion.nombre}`}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
              onClick={() => {
                setTexto(`${opcion.nit} · ${opcion.nombre}`);
                onChange(opcion);
                setOpciones([]);
              }}
            >
              <span className="font-medium">{opcion.nombre || opcion.nit}</span>
              <span className="ml-2 text-gray-500">{opcion.nit}</span>
            </button>
          ))}
        </div>
      ) : null}
      {comodin(texto).length >= 2 && opciones.length === 0 ? (
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-2 text-sm"
          onClick={() => onChange({ nit: comodin(texto), nombre })}
        >
          {usarNit(comodin(texto))}
        </Button>
      ) : null}
      {nit ? <p className="text-xs text-gray-500">{nit}{nombre ? ` · ${nombre}` : ''}</p> : null}
    </div>
  );
}
