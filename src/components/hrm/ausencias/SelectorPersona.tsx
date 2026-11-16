'use client';

/**
 * Persona a la que se le registra una ausencia: la lista sale de `GET /api/hrm/empleados`
 * (el servidor decide si son todos o solo el equipo). Solo vínculos vigentes.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SearchSelect } from '@/components/ui/search-select';
import { pedir, type ListaEmpleados } from '../personas/apiPersonas';
import type { EmpleadoFila } from '@/lib/hrm/personas/logica';

const VIGENTES = new Set(['activo', 'periodo_prueba', 'suspendido']);

export function useEmpleadosVigentes(activo: boolean): EmpleadoFila[] | null {
  const [lista, setLista] = useState<EmpleadoFila[] | null>(null);
  useEffect(() => {
    if (!activo || lista) return;
    let vigente = true;
    pedir<ListaEmpleados>('/api/hrm/empleados')
      .then((d) => vigente && setLista(d.empleados.filter((e) => VIGENTES.has(e.estado))))
      .catch(() => vigente && setLista([]));
    return () => {
      vigente = false;
    };
  }, [activo, lista]);
  return lista;
}

export interface SelectorPersonaProps {
  valor: string;
  onCambiar: (vinculoId: string, empleado: EmpleadoFila | null) => void;
  empleados: EmpleadoFila[] | null;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

export function SelectorPersona({ valor, onCambiar, empleados, id, ...aria }: SelectorPersonaProps) {
  const t = useTranslations('hrmAusencias.formulario');
  const opciones = useMemo(
    () =>
      (empleados ?? []).map((e) => ({
        value: e.vinculo_id,
        label: e.nombre ?? '—',
        sublabel: [e.cargo, e.area].filter(Boolean).join(' · ') || undefined,
      })),
    [empleados]
  );
  return (
    <SearchSelect
      id={id}
      options={opciones}
      value={valor}
      onValueChange={(v) => onCambiar(v, (empleados ?? []).find((e) => e.vinculo_id === v) ?? null)}
      placeholder={empleados === null ? t('cargandoPersonas') : t('elegirPersona')}
      searchPlaceholder={t('buscarPersona')}
      emptyText={t('sinPersonas')}
      disabled={empleados === null}
      aria-invalid={aria['aria-invalid']}
      aria-describedby={aria['aria-describedby']}
    />
  );
}
