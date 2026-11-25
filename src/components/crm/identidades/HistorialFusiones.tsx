'use client';

/**
 * «Historial y deshacer» (Figma CRM 1436:843665): fusiones de los últimos 90
 * días (`GET /api/crm/customer-merges`). «Deshacer» pide confirmación y va a
 * `crm_unmerge_customer` (solo administrador, dentro de 30 días, y solo si
 * ninguna fusión posterior depende de ella): devuelve al secundario SOLO las
 * filas que se movieron y, si algo cambió desde la fusión, no deshace nada y
 * dice por qué.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, History, Undo2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { PageHeader } from '@/components/kit/PageHeader';
import { DataTable, type ColumnaTabla, type EstadoTabla } from '@/components/kit/DataTable';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { filasACsv } from '@/lib/utils/csv';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import type { FusionHistorial } from '@/lib/services/crm/customerMergeLogica';
import { claveErrorFusion } from './fusionLogica';

interface Respuesta {
  fusiones: FusionHistorial[];
  puedeDeshacer: boolean;
  dias: number;
}

const VOLVER = '/app/crm/identidades';

export function HistorialFusiones() {
  const t = useTranslations('crm.duplicados');
  const th = useTranslations('crm.duplicados.historial');
  const { formatDate, formatTime, toDate, getToday } = useFormatDate();
  const [estado, setEstado] = useState<EstadoTabla>('cargando');
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [revision, setRevision] = useState(0);
  const [confirmar, setConfirmar] = useState<FusionHistorial | null>(null);
  const [deshaciendo, setDeshaciendo] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setEstado('cargando');
    pedirCrm<Respuesta>('/api/crm/customer-merges', { signal: ctrl.signal })
      .then(({ data }) => {
        if (ctrl.signal.aborted) return;
        setDatos(data);
        setEstado(data.fusiones.length > 0 ? 'listo' : 'vacio');
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setEstado(e instanceof ErrorApiCrm && (e.status === 401 || e.status === 403) ? 'sinPermiso' : 'error');
      });
    return () => ctrl.abort();
  }, [revision]);

  const recargar = useCallback(() => setRevision((n) => n + 1), []);
  const dias = datos?.dias ?? 90;
  const sinNombre = t('fusion.sinNombre');

  const cuando = (v: string) => (toDate(new Date(v)) === getToday() ? th('hoy', { hora: formatTime(v) }) : formatDate(v));
  const fusionTexto = (f: FusionHistorial) => `${f.secundario.nombre ?? sinNombre} → ${f.principal.nombre ?? sinNombre}`;
  const movidoTexto = (f: FusionHistorial) => (f.movidos.length ? f.movidos.map((m) => th(`tablas.${m.tabla}`, { n: m.n })).join(' · ') : th('nadaMovido'));

  const deshacer = async () => {
    if (!confirmar) return;
    setDeshaciendo(true);
    try {
      await pedirCrm(`/api/crm/customer-merges/${encodeURIComponent(confirmar.id)}/undo`, { method: 'POST', cuerpo: {} });
      toast({ title: t('deshecha') });
      setConfirmar(null);
      recargar();
    } catch (e) {
      toast({ title: t('noDeshecha'), description: t(`errores.${claveErrorFusion(e instanceof ErrorApiCrm ? e.codigo : null)}`), variant: 'destructive' });
    } finally {
      setDeshaciendo(false);
    }
  };

  const exportar = () => {
    const filas = (datos?.fusiones ?? []).map((f) => [fusionTexto(f), th(`motivo.${f.motivo}`), movidoTexto(f), f.quien ?? '', cuando(f.merged_at), th(`estado.${f.estado}`)]);
    const csv = filasACsv([th('columnas.fusion'), th('columnas.motivo'), th('columnas.movido'), th('columnas.quien'), th('columnas.cuando'), th('columnas.estado')], filas);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `historial-fusiones-${getToday()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const accion = (f: FusionHistorial) =>
    f.estado === 'deshacible' ? (
      <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setConfirmar(f)}>
        <Undo2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {th('deshacer')}
      </button>
    ) : (
      <StatusBadge estado={f.estado} etiqueta={th(`estado.${f.estado}`)} tono={f.estado === 'dependiente' ? 'advertencia' : 'neutro'} tamano="sm" />
    );

  const columnas: ColumnaTabla<FusionHistorial>[] = [
    { id: 'fusion', encabezado: th('columnas.fusion'), celda: (f) => <span className="text-sm text-fg">{fusionTexto(f)}</span>, ancho: 200 },
    { id: 'motivo', encabezado: th('columnas.motivo'), celda: (f) => <span className="text-sm text-fg-secondary">{th(`motivo.${f.motivo}`)}</span>, ocultarDebajo: 'md' },
    { id: 'movido', encabezado: th('columnas.movido'), celda: (f) => <span className="text-sm text-fg-secondary">{movidoTexto(f)}</span>, ocultarDebajo: 'lg' },
    { id: 'quien', encabezado: th('columnas.quien'), celda: (f) => <span className="text-sm text-fg-secondary">{f.quien ?? '—'}</span>, ocultarDebajo: 'lg' },
    { id: 'cuando', encabezado: th('columnas.cuando'), celda: (f) => <span className="text-sm text-fg-secondary">{cuando(f.merged_at)}</span>, ocultarDebajo: 'sm' },
    { id: 'accion', encabezado: th('columnas.accion'), celda: accion, ancho: 190 },
  ];

  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:p-6">
      <PageHeader
        titulo={th('titulo')}
        subtitulo={th('subtitulo', { dias })}
        variante="form"
        volverA={VOLVER}
        icono={History}
        migas={[
          { etiqueta: t('pantalla.migaCrm'), href: '/app/crm' },
          { etiqueta: t('pantalla.titulo'), href: VOLVER },
          { etiqueta: th('titulo') },
        ]}
        cargando={estado === 'cargando'}
        acciones={
          estado === 'listo' ? (
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={exportar}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {th('exportar')}
            </button>
          ) : undefined
        }
        movil={{ titulo: th('titulo'), menu: estado === 'listo' ? [{ id: 'exportar', etiqueta: th('exportar'), icono: Download, onSelect: exportar }] : [] }}
      />

      <DataTable
        etiqueta={th('titulo')}
        columnas={columnas}
        filas={datos?.fusiones ?? []}
        obtenerId={(f) => f.id}
        estado={estado}
        onReintentar={recargar}
        vacio={{ icono: History, titulo: th('vacio.titulo', { dias }), descripcion: th('vacio.descripcion') }}
        error={{ titulo: th('error') }}
        sinPermiso={{ titulo: th('sinPermiso.titulo'), descripcion: th('sinPermiso.descripcion'), accion: { etiqueta: t('comparar.volver'), href: VOLVER } }}
        tarjetaMovil={(f) => (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-fg">{fusionTexto(f)}</p>
            <p className="text-xs text-fg-secondary">{[th(`motivo.${f.motivo}`), movidoTexto(f)].join(' · ')}</p>
            <p className="text-xs text-fg-secondary">{[f.quien, cuando(f.merged_at)].filter(Boolean).join(' · ')}</p>
            <div>{accion(f)}</div>
          </div>
        )}
      />
      {estado === 'listo' && !datos?.puedeDeshacer && <p className="text-xs text-fg-secondary">{th('soloAdministrador')}</p>}

      <ConfirmDialog
        abierto={confirmar !== null}
        onAbiertoChange={(a) => !a && !deshaciendo && setConfirmar(null)}
        titulo={th('confirmar.titulo')}
        descripcion={th('confirmar.descripcion', { secundario: confirmar?.secundario.nombre ?? sinNombre, principal: confirmar?.principal.nombre ?? sinNombre })}
        textoConfirmar={th('confirmar.confirmar')}
        onConfirmar={deshacer}
        tono="advertencia"
        icono={Undo2}
        cargando={deshaciendo}
      />
    </div>
  );
}
