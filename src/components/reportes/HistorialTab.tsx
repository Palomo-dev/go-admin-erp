'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTable, EmptyState, ListCard } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { supabase } from '@/lib/supabase/config';
import { leerHistorial, type FilaHistorial } from '@/lib/services/reportes/historialService';
import { getReporteById } from '@/lib/services/reportes/reportesCatalogo';
import { clasesSelect } from './BarraFiltros';
import type { ContextoReportes } from './useContextoReportes';

const LIMITE = 50;

export function HistorialTab({ ctx }: { ctx: ContextoReportes }) {
  const t = useTranslations('reportes');
  const { formatDateTime } = useFormatDate();
  const [filas, setFilas] = useState<FilaHistorial[] | null>(null);
  const [error, setError] = useState(false);
  const [usuario, setUsuario] = useState('todos');
  const [mas, setMas] = useState(false);

  const cargar = (antes?: string) => {
    if (!ctx.orgId) return;
    setError(false);
    void leerHistorial(supabase, ctx.orgId, { limite: LIMITE, antes })
      .then((lista) => {
        setFilas((prev) => (antes && prev ? [...prev, ...lista] : lista));
        setMas(lista.length === LIMITE);
      })
      .catch(() => setError(true));
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.orgId]);

  const usuarios = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const f of filas ?? []) mapa.set(f.user_id, f.usuario ?? f.user_id);
    return [...mapa.entries()];
  }, [filas]);

  const visibles = (filas ?? []).filter((f) => usuario === 'todos' || f.user_id === usuario);

  if (error) return <EmptyState variante="error" onReintentar={() => cargar()} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-fg">{t('historial.titulo')}</h2>
        <select className={clasesSelect} aria-label={t('historial.usuario')} value={usuario} onChange={(e) => setUsuario(e.target.value)}>
          <option value="todos">{t('historial.todos')}</option>
          {usuarios.map(([id, nombre]) => (
            <option key={id} value={id}>
              {nombre}
            </option>
          ))}
        </select>
      </div>
      <DataTable<FilaHistorial>
        etiqueta={t('historial.titulo')}
        estado={filas === null ? 'cargando' : visibles.length === 0 ? 'vacio' : 'listo'}
        filas={visibles}
        obtenerId={(f) => f.id}
        vacio={{ titulo: t('historial.vacio'), descripcion: t('historial.vacioDesc') }}
        columnas={[
          {
            id: 'reporte',
            encabezado: t('historial.colReporte'),
            celda: (f) => {
              const def = f.report_id ? getReporteById(f.report_id) : undefined;
              return (
                <span className="block">
                  <span className="block font-medium">{def?.titulo ?? f.report_id ?? '—'}</span>
                  <span className="block text-xs text-fg-secondary">{def ? t(`grupos.${def.grupo}`) : ''}</span>
                </span>
              );
            },
          },
          { id: 'filtros', encabezado: t('historial.colFiltros'), ocultarDebajo: 'md', celda: (f) => Object.values(f.filtros).filter((v) => typeof v === 'string' || typeof v === 'number').join(' · ') || '—' },
          { id: 'quien', encabezado: t('historial.colQuien'), ocultarDebajo: 'lg', celda: (f) => f.usuario ?? '—' },
          { id: 'cuando', encabezado: t('historial.colCuando'), celda: (f) => formatDateTime(f.created_at) },
          { id: 'accion', encabezado: t('historial.colAccion'), celda: (f) => (t.has(`historial.accion.${f.accion}`) ? t(`historial.accion.${f.accion}`) : f.accion) },
        ]}
        tarjetaMovil={(f) => {
          const def = f.report_id ? getReporteById(f.report_id) : undefined;
          return <ListCard titulo={def?.titulo ?? f.report_id ?? '—'} subtitulo={f.usuario ?? undefined} meta={formatDateTime(f.created_at)} />;
        }}
      />
      {mas && filas && (
        <button type="button" className="text-sm font-medium text-link" onClick={() => cargar(filas[filas.length - 1]?.created_at)}>
          {t('historial.titulo')}
        </button>
      )}
      <p className="text-xs text-fg-secondary">{t('historial.pie')}</p>
    </div>
  );
}
