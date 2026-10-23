'use client';

import { useEffect, useRef, useState } from 'react';
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

function etiqueta(tercero: Tercero): string {
  return tercero.nombre ? `${tercero.nit} · ${tercero.nombre}` : tercero.nit;
}

export function SelectorTercero({
  nit,
  nombre,
  onChange,
  placeholder,
  usarNit,
  sinResultados,
}: {
  nit: string;
  nombre: string;
  onChange: (tercero: Tercero) => void;
  placeholder: string;
  usarNit: (nit: string) => string;
  sinResultados: string;
}) {
  const elegido = useRef<Tercero | null>(nit ? { nit, nombre } : null);
  const [texto, setTexto] = useState(nit ? etiqueta({ nit, nombre }) : '');
  const [opciones, setOpciones] = useState<Tercero[]>([]);
  const [estado, setEstado] = useState<'idle' | 'buscando' | 'listo'>('idle');
  const [consultaLista, setConsultaLista] = useState('');

  useEffect(() => {
    const marca = elegido.current?.nit ? etiqueta(elegido.current) : null;
    if (texto === marca) {
      setOpciones([]);
      setEstado('idle');
      return;
    }
    const consulta = comodin(texto);
    if (consulta.length < 2) {
      setOpciones([]);
      setEstado('idle');
      setConsultaLista('');
      return;
    }
    const orgId = getOrganizationId();
    if (!orgId) return;
    setEstado('buscando');
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
          setConsultaLista(consulta);
          setEstado('listo');
        } catch {
          if (!vivo) return;
          setOpciones([]);
          setConsultaLista(consulta);
          setEstado('listo');
        }
      })();
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [texto]);

  const consulta = comodin(texto);
  const mostrarVacio = estado === 'listo' && consultaLista === consulta && consulta.length >= 2 && opciones.length === 0;

  return (
    <div className="space-y-2">
      <Input
        value={texto}
        placeholder={placeholder}
        onChange={(event) => {
          const valor = event.target.value;
          setTexto(valor);
          const marca = elegido.current?.nit ? etiqueta(elegido.current) : null;
          if (marca && valor === marca && elegido.current) {
            onChange(elegido.current);
            return;
          }
          if (nit || nombre) onChange({ nit: '', nombre: '' });
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
                elegido.current = opcion;
                setTexto(etiqueta(opcion));
                onChange(opcion);
                setOpciones([]);
                setEstado('idle');
              }}
            >
              <span className="font-medium">{opcion.nombre || opcion.nit}</span>
              <span className="ml-2 text-gray-500">{opcion.nit}</span>
            </button>
          ))}
        </div>
      ) : null}
      {mostrarVacio ? (
        <div className="space-y-1">
          <p className="text-sm text-gray-500">{sinResultados}</p>
          <Button
            type="button"
            variant="ghost"
            className="h-8 px-2 text-sm"
            onClick={() => {
              const documento = comodin(texto);
              const tercero = { nit: documento, nombre: '' };
              elegido.current = tercero;
              setTexto(documento);
              onChange(tercero);
              setOpciones([]);
              setEstado('idle');
            }}
          >
            {usarNit(comodin(texto))}
          </Button>
        </div>
      ) : null}
      {nit ? <p className="text-xs text-gray-500">{nit}{nombre ? ` · ${nombre}` : ''}</p> : null}
    </div>
  );
}
