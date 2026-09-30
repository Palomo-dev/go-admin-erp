'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import { TablaOportunidades } from '@/components/crm/oportunidad/TablaOportunidades';
import { AccionesMasivas } from '@/components/crm/oportunidad/AccionesMasivas';
import { useListaOportunidades } from '@/components/crm/oportunidad/useListaOportunidades';
import type { OrdenOportunidades } from '@/components/crm/oportunidad/filtrosLogica';
import { alternarSeleccion, csvOportunidades, seleccionarPagina, type EtapaApi, type PermisosPantalla } from '@/components/crm/oportunidad/oportunidadLogica';
import type { useAccionesOportunidad } from '@/components/crm/oportunidad/useAccionesOportunidad';

/**
 * Vista Tabla del Pipeline (Figma 768:459368): las oportunidades del embudo
 * elegido, paginadas y ordenadas en el servidor, con selección masiva (mover
 * de etapa, asignar responsable, marcar perdida, eliminar) y menú «⋯».
 */
export interface TablaPipelineProps {
  pipelineId: string | null;
  query: string;
  etapas: readonly EtapaApi[];
  usuarios: readonly OpcionUsuario[];
  usuarioId: string | null;
  permisos: PermisosPantalla;
  acciones: ReturnType<typeof useAccionesOportunidad>;
  onAbrir: (id: string) => void;
}

export function TablaPipeline(p: TablaPipelineProps) {
  const t = useTranslations('crm.oportunidad.lista');
  const [orden, setOrden] = useState<OrdenOportunidades>('proximo');
  const [asc, setAsc] = useState(true);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const q = new URLSearchParams(p.query);
  if (p.pipelineId) q.set('pipeline_id', p.pipelineId);
  const d = useListaOportunidades({ query: q.toString(), estado: 'all', orden, ascendente: asc, periodo: null, acumular: false, activa: !!p.pipelineId });
  const seleccionadas = d.filas.filter((f) => seleccion.has(f.id));
  const exportar = () => {
    const csv = csvOportunidades(seleccionadas, p.usuarios, ['oportunidad', 'cliente', 'etapa', 'monto', 'moneda', 'prob', 'cierre', 'responsable', 'proximo', 'estado', 'tipo'].map((k) => t(`csv.${k}`)));
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'oportunidades.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <TablaOportunidades
        filas={d.filas}
        cargando={d.cargando}
        usuarios={p.usuarios}
        usuarioId={p.usuarioId}
        permisos={p.permisos}
        acciones={p.acciones}
        seleccion={seleccion}
        onSeleccion={(id) => setSeleccion(alternarSeleccion(seleccion, id))}
        onSeleccionPagina={() => setSeleccion(seleccionarPagina(seleccion, d.filas.map((f) => f.id)))}
        onAbrir={p.onAbrir}
        orden={orden}
        ascendente={asc}
        onOrden={(o) => (o === orden ? setAsc(!asc) : (setOrden(o), setAsc(true)))}
        pagina={d.pagina}
        tamano={d.tamano}
        total={d.total ?? 0}
        onPagina={d.setPagina}
        onTamano={d.setTamano}
      />
      {seleccionadas.length > 0 && <AccionesMasivas seleccionadas={seleccionadas} total={d.total ?? 0} etapas={p.etapas} usuarios={p.usuarios} usuarioId={p.usuarioId} permisos={p.permisos} onLimpiar={() => setSeleccion(new Set())} onExportar={exportar} />}
    </>
  );
}
