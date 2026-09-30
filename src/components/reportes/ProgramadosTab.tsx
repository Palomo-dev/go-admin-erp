'use client';

import { useEffect, useState } from 'react';
import { Mail, Pause, Play, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DataTable, Dialogo, EmptyState, ListCard, StatusBadge } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { clienteReportes } from '@/lib/services/reportes/clienteReportes';
import type { ProgramadoVista } from '@/lib/services/reportes/programados/programados.server';
import { useAccionesReportes } from './accionesReportes';
import { etiquetaHora } from './etiquetaPeriodo';
import { useMensajeError } from './useMensajeError';
import type { ContextoReportes } from './useContextoReportes';

export function ProgramadosTab({ ctx, recarga, onRecargar }: { ctx: ContextoReportes; recarga: number; onRecargar: () => void }) {
  const t = useTranslations('reportes');
  const { formatDateTime } = useFormatDate();
  const locale = useLocaleIntl();
  const acciones = useAccionesReportes();
  const mensaje = useMensajeError();
  const [filas, setFilas] = useState<ProgramadoVista[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrar, setBorrar] = useState<ProgramadoVista | null>(null);

  useEffect(() => {
    let vivo = true;
    setError(null);
    void clienteReportes
      .programados()
      .then((lista) => vivo && setFilas(lista))
      .catch((e: unknown) => vivo && setError(mensaje(e)));
    return () => {
      vivo = false;
    };
  }, [recarga, mensaje]);

  const actuar = async (id: string, accion: 'pausar' | 'reanudar' | 'prueba') => {
    setError(null);
    try {
      if (accion === 'pausar') await clienteReportes.pausarProgramado(id);
      else if (accion === 'reanudar') await clienteReportes.reanudarProgramado(id);
      else {
        const r = await clienteReportes.probarProgramado(id);
        toastSuccess(t('programados.pruebaEnviada', { para: r.para }));
      }
      onRecargar();
    } catch (e) {
      setError(mensaje(e));
    }
  };

  if (error && !filas) return <EmptyState variante="error" descripcion={error} onReintentar={onRecargar} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">{t('programados.titulo', { n: filas?.length ?? 0 })}</h2>
        <button type="button" className="text-sm font-medium text-link" onClick={() => acciones.abrirEnvio()}>
          {t('programados.nuevo')}
        </button>
      </div>
      {error && <p className="text-sm text-danger-text">{error}</p>}
      <DataTable<ProgramadoVista>
        etiqueta={t('programados.titulo', { n: filas?.length ?? 0 })}
        estado={filas === null ? 'cargando' : filas.length === 0 ? 'vacio' : 'listo'}
        filas={filas ?? []}
        obtenerId={(f) => f.id}
        vacio={{ titulo: t('programados.vacio'), descripcion: t('programados.vacioDesc'), icono: Mail }}
        acciones={(f) => [
          { id: 'editar', etiqueta: t('programados.editar'), icono: Mail, onSelect: () => acciones.abrirEnvio({ editar: f, reportId: f.reportId ?? undefined }) },
          { id: 'prueba', etiqueta: t('programados.prueba'), icono: Mail, onSelect: () => void actuar(f.id, 'prueba') },
          f.activo
            ? { id: 'pausar', etiqueta: t('programados.pausar'), icono: Pause, onSelect: () => void actuar(f.id, 'pausar') }
            : { id: 'reanudar', etiqueta: t('programados.reanudar'), icono: Play, onSelect: () => void actuar(f.id, 'reanudar') },
          ...(ctx.permisos.admin && f.destinatarios.some((d) => d.tipo === 'externo' && d.estado === 'pendiente')
            ? [{ id: 'aprobar', etiqueta: t('programados.aprobar'), icono: Mail, onSelect: () => void clienteReportes.aprobarExternos(f.id, f.destinatarios.filter((d) => d.tipo === 'externo' && d.estado === 'pendiente').map((d) => d.email)).then(onRecargar).catch((e: unknown) => setError(mensaje(e))) }]
            : []),
          { id: 'eliminar', etiqueta: t('programados.eliminar'), icono: Trash2, destructiva: true, onSelect: () => setBorrar(f) },
        ]}
        columnas={[
          {
            id: 'envio',
            encabezado: t('programados.colEnvio'),
            celda: (f) => {
              const correos = f.destinatarios.map((d) => d.email);
              return (
                <span className="block min-w-0">
                  <span className="block font-medium">{f.nombre}</span>
                  <span className="block truncate text-xs text-fg-secondary" title={correos.join(', ')}>
                    {correos.length > 0 ? correos.join(', ') : t('programados.destinatarios', { n: 0 })}
                  </span>
                </span>
              );
            },
          },
          { id: 'frecuencia', encabezado: t('programados.colFrecuencia'), celda: (f) => `${t(`programados.frecuencia.${f.frecuencia}`)} · ${etiquetaHora(f.hora.slice(0, 5), locale)}` },
          { id: 'formato', encabezado: t('programados.colFormato'), ocultarDebajo: 'md', celda: (f) => t(`programados.formato.${f.formato}`) },
          { id: 'proximo', encabezado: t('programados.colProximo'), celda: (f) => (f.proximoEnvio ? formatDateTime(f.proximoEnvio) : '—') },
          { id: 'estado', encabezado: t('programados.colEstado'), celda: (f) => <StatusBadge estado={f.activo ? 'activo' : 'pausado'} etiqueta={f.activo ? t('programados.activo') : t('programados.pausado')} tono={f.activo ? 'exito' : 'neutro'} tamano="sm" /> },
        ]}
        tarjetaMovil={(f) => (
          <ListCard
            titulo={f.nombre}
            subtitulo={f.destinatarios.map((d) => d.email).join(', ') || t(`programados.frecuencia.${f.frecuencia}`)}
            estado={<StatusBadge estado={f.activo ? 'activo' : 'pausado'} etiqueta={f.activo ? t('programados.activo') : t('programados.pausado')} tamano="sm" />}
          />
        )}
      />
      <p className="text-xs text-fg-secondary">{t('programados.pie')}</p>
      <Dialogo
        abierto={borrar !== null}
        onAbiertoChange={(a) => !a && setBorrar(null)}
        titulo={t('programados.confirmEliminar')}
        descripcion={t('programados.confirmDesc')}
        primario={{
          etiqueta: t('programados.eliminar'),
          destructiva: true,
          onClick: () => {
            if (!borrar) return;
            void clienteReportes.eliminarProgramado(borrar.id).then(() => {
              toastSuccess(t('programados.eliminado'));
              setBorrar(null);
              onRecargar();
            }).catch((e: unknown) => setError(mensaje(e)));
          },
        }}
      />
    </div>
  );
}

