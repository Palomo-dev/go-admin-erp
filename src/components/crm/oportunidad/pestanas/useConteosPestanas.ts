'use client';

import { useEffect, useState } from 'react';
import { EVENTO_CAMBIO_CRM, pedirCrm } from '@/components/crm/acciones/apiCrm';
import { separarTareas } from './pestanasLogica';

/**
 * Contadores de las pestañas de la oportunidad antes de abrirlas (Figma
 * 820:64894: «Tareas 3 · Notas 3 · Documentos 2»): tareas pendientes, notas y
 * documentos, por las mismas rutas `/api/crm/**` que leen las pestañas. Cada
 * pestaña los corrige al cargar (`fijar`). Un fallo deja el contador vacío.
 */
export interface ConteosPestanas {
  tareas: number | null;
  notas: number | null;
  documentos: number | null;
}

export function useConteosPestanas(oportunidadId: string | null) {
  const [conteos, setConteos] = useState<ConteosPestanas>({ tareas: null, notas: null, documentos: null });
  const [recarga, setRecarga] = useState(0);
  useEffect(() => {
    setConteos({ tareas: null, notas: null, documentos: null });
    if (!oportunidadId) return;
    let vivo = true;
    const id = encodeURIComponent(oportunidadId);
    const poner = (k: keyof ConteosPestanas, n: number | null) => vivo && setConteos((c) => ({ ...c, [k]: n }));
    pedirCrm<{ status: string; priority: string | null; due_date: string | null; completed_at: string | null; completada_por: string | null; id: string; title: string }[]>(`/api/crm/tasks?opportunity_id=${id}`)
      .then(({ data }) => poner('tareas', separarTareas(data ?? []).pendientes.length), () => poner('tareas', null));
    pedirCrm<unknown[]>(`/api/crm/activities?opportunity_id=${id}&types=note&limit=1`)
      .then(({ extra }) => poner('notas', typeof extra.total === 'number' ? extra.total : null), () => poner('notas', null));
    pedirCrm<unknown[]>(`/api/crm/documents?related_type=opportunity&related_id=${id}`)
      .then(({ data }) => poner('documentos', (data ?? []).length), () => poner('documentos', null));
    return () => {
      vivo = false;
    };
  }, [oportunidadId, recarga]);
  useEffect(() => {
    const oir = (ev: Event) => {
      const d = (ev as CustomEvent<{ entidad?: string; id?: string | null }>).detail;
      if ((d?.entidad === 'note' || d?.entidad === 'task') && (!d.id || d.id === oportunidadId)) setRecarga((n) => n + 1);
    };
    window.addEventListener(EVENTO_CAMBIO_CRM, oir);
    return () => window.removeEventListener(EVENTO_CAMBIO_CRM, oir);
  }, [oportunidadId]);
  const fijar = (k: keyof ConteosPestanas) => (n: number) => setConteos((c) => (c[k] === n ? c : { ...c, [k]: n }));
  return { conteos, fijar };
}
