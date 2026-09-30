'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { DataTable, ListCard, StatusBadge } from '@/components/kit';
import { reportePermitido } from '@/lib/services/reportes/alcanceSucursal';
import type { ReportDefinition } from '@/lib/services/reportes/types';
import { useAccionesReportes } from './accionesReportes';
import { AvisoAlcance } from './AvisoAlcance';
import { rutaReporte } from './rutasReportes';
import type { ContextoReportes } from './useContextoReportes';

type EstadoFila = 'disponible' | 'nuevo' | 'sinAcceso' | 'requierePlan';

interface FilaLista {
  id: string;
  titulo: string;
  descripcion: string;
  grupo: string;
  filtros: string;
  alcance: 'sucursal' | 'organizacion';
  estado: EstadoFila;
  abre: boolean;
}

const TONO = { disponible: 'exito', nuevo: 'marca', sinAcceso: 'neutro', requierePlan: 'advertencia' } as const;

export function ListaGrupo({ grupoId, ctx, query }: { grupoId: string; ctx: ContextoReportes; query: string }) {
  const t = useTranslations('reportes');
  const router = useRouter();
  const acciones = useAccionesReportes();
  const [orden, setOrden] = useState<{ campo: string; direccion: 'asc' | 'desc' } | null>(null);
  const adicionales = grupoId === 'adicionales';

  const filas = useMemo<FilaLista[]>(() => {
    const grupos = adicionales ? ctx.grupos.filter((g) => g.grupo.vertical) : ctx.grupos.filter((g) => g.grupo.id === grupoId);
    const salida: FilaLista[] = [];
    for (const g of grupos) {
      for (const r of g.reportes) {
        const permitido = reportePermitido(r, ctx.accesoTotal);
        salida.push(fila(r, permitido ? (r.nuevo ? 'nuevo' : 'disponible') : 'sinAcceso', permitido, t));
      }
      for (const r of g.bloqueados) salida.push(fila(r, 'requierePlan', false, t));
    }
    return salida;
  }, [adicionales, ctx.grupos, ctx.accesoTotal, grupoId, t]);

  const ordenadas = useMemo(() => {
    if (!orden) return filas;
    const dir = orden.direccion === 'asc' ? 1 : -1;
    return [...filas].sort((a, b) => String(a[orden.campo as keyof FilaLista] ?? '').localeCompare(String(b[orden.campo as keyof FilaLista] ?? '')) * dir);
  }, [filas, orden]);

  return (
    <div className="flex flex-col gap-4">
      {!adicionales && <AvisoAlcance ctx={ctx} />}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">{t('lista.subtitulo', { n: filas.length })}</h2>
        <button type="button" className="text-sm font-medium text-link" onClick={() => acciones.abrirEnvio()}>
          {t('lista.programar')}
        </button>
      </div>
      <DataTable<FilaLista>
        etiqueta={t('lista.colReporte')}
        filas={ordenadas}
        obtenerId={(f) => f.id}
        orden={orden}
        onOrdenar={(campo) => setOrden((prev) => ({ campo, direccion: prev?.campo === campo && prev.direccion === 'asc' ? 'desc' : 'asc' }))}
        onFilaClick={(f) => f.abre && router.push(rutaReporte(f.grupo, f.id, query))}
        columnas={[
          {
            id: 'titulo',
            encabezado: t('lista.colReporte'),
            ordenable: true,
            campoOrden: 'titulo',
            celda: (f) => (
              <span className="block">
                <span className="block font-medium text-fg">{f.titulo}</span>
                <span className="block text-xs text-fg-secondary">{f.descripcion}</span>
              </span>
            ),
          },
          { id: 'filtros', encabezado: t('lista.colFiltros'), ordenable: true, campoOrden: 'filtros', ocultarDebajo: 'md', celda: (f) => f.filtros },
          { id: 'alcance', encabezado: t('lista.colAlcance'), ordenable: true, campoOrden: 'alcance', ocultarDebajo: 'lg', celda: (f) => (f.alcance === 'organizacion' ? t('badges.todaLaOrg') : t('badges.porSucursal')) },
          { id: 'estado', encabezado: t('lista.colEstado'), celda: (f) => <StatusBadge estado={f.estado} etiqueta={t(`badges.${f.estado}`)} tono={TONO[f.estado]} tamano="sm" /> },
        ]}
        tarjetaMovil={(f) => <ListCard titulo={f.titulo} subtitulo={f.descripcion} estado={<StatusBadge estado={f.estado} etiqueta={t(`badges.${f.estado}`)} tono={TONO[f.estado]} tamano="sm" />} onClick={() => f.abre && router.push(rutaReporte(f.grupo, f.id, query))} />}
      />
      <p className="text-xs text-fg-secondary">{t('lista.pie')}</p>
    </div>
  );
}

function fila(r: ReportDefinition, estado: EstadoFila, abre: boolean, t: (clave: string) => string): FilaLista {
  return {
    id: r.id,
    titulo: r.titulo,
    descripcion: r.descripcion,
    grupo: r.grupo,
    filtros: r.filtros.length > 0 ? r.filtros.map((f) => t(`filtroTipo.${f}`)).join(' · ') : t('lista.sinFiltros'),
    alcance: r.alcance,
    estado,
    abre,
  };
}
