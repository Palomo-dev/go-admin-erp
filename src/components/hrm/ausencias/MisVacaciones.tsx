'use client';

/**
 * Mis vacaciones (Figma 20.13.6, `96-hrm-f2-13-06-*`): el saldo de la persona (días
 * hábiles causados en base 360, menos lo disfrutado, lo programado y lo que espera
 * aprobación), «Solicitar vacaciones» y sus solicitudes. Solo lo propio: la base
 * filtra por el vínculo de la sesión (`propias=1`).
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUp, Ban, Eye, Plus, TreePalm } from 'lucide-react';
import { DataTable, ListCard, PageHeader, Skeleton, clasesBoton, type AccionFila, type ColumnaTabla } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays } from '@/lib/utils/dateCore';
import { estadoVisible, type FilaAusencia } from './ausenciasLogica';
import { DialogoAprobarAusencia } from './DialogoAprobarAusencia';
import { DialogoSolicitarVacaciones } from './DialogoSolicitarVacaciones';
import { DialogoAnular } from './DialogosAusencia';
import { EstadoAusencia, useFechas, useListaAusencias } from './piezasAusencias';

export function MisVacaciones() {
  const t = useTranslations('hrmAusencias.misVacaciones');
  const tv = useTranslations('hrmAusencias.vacaciones');
  const f = useFechas();
  const { getToday } = useFormatDate();
  const hoyLocal = getToday();
  const { carga, recargar } = useListaAusencias('vacaciones', addPlainDays(hoyLocal, -200), addPlainDays(hoyLocal, 200), true);
  const [solicitar, setSolicitar] = useState(false);
  const [abierta, setAbierta] = useState<FilaAusencia | null>(null);
  const [anular, setAnular] = useState<FilaAusencia | null>(null);
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const hoy = datos?.hoy ?? hoyLocal;
  const filas = useMemo(() => [...(datos?.filas ?? [])].sort((a, b) => b.desde.localeCompare(a.desde)), [datos]);
  const mio = datos?.mio ?? null;
  const saldo = mio?.saldo ?? null;

  const aprobador = (x: FilaAusencia) => {
    const a = x.aprobacion;
    if (!a) return null;
    if (a.estado === 'pendiente') {
      const p = a.pasos.find((s) => s.orden === a.paso_actual);
      return p ? t('aprueba', { nombre: p.aprobadores.filter(Boolean).join(', ') || '—' }) : null;
    }
    const decidio = [...a.pasos].reverse().find((s) => s.decidio);
    return decidio ? (a.estado === 'rechazada' ? t('rechazo', { nombre: decidio.decidio ?? '—' }) : t('aprobo', { nombre: decidio.decidio ?? '—' })) : null;
  };
  const accionesDe = (x: FilaAusencia): AccionFila[] => {
    const e = estadoVisible(x, hoy);
    return [
      { id: 'ver', etiqueta: t('ver'), icono: Eye, onSelect: () => setAbierta(x) },
      {
        id: 'cancelar',
        etiqueta: t('cancelar'),
        icono: Ban,
        destructiva: true,
        separadorAntes: true,
        onSelect: () => setAnular(x),
        oculta: !(e === 'por_aprobar' || e === 'por_aprobar_rrhh' || (e === 'aprobada' && x.desde > hoy)),
      },
    ];
  };

  const columnas: ColumnaTabla<FilaAusencia>[] = [
    { id: 'fechas', encabezado: tv('columnas.fechas'), celda: (x) => <span className="text-fg">{f.rango(x.desde, x.hasta)}</span> },
    { id: 'habiles', encabezado: tv('columnas.habiles'), alinear: 'derecha', celda: (x) => <span className="tabular-nums">{tv('nDias', { n: f.dias(x.dias_habiles ?? x.dias_calendario) })}</span> },
    { id: 'regresa', encabezado: t('regresa'), ocultarDebajo: 'md', celda: (x) => f.diaSemana(x.regresa) },
    { id: 'aprobacion', encabezado: t('aprobacion'), ocultarDebajo: 'lg', celda: (x) => <span className="text-fg-secondary">{aprobador(x) ?? '—'}</span> },
    { id: 'estado', encabezado: tv('columnas.estado'), celda: (x) => <EstadoAusencia fila={x} hoy={hoy} /> },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        variante="form"
        titulo={t('titulo')}
        subtitulo={mio?.nombre ?? undefined}
        volverA="/app/inicio"
        migas={[{ etiqueta: t('migaInicio'), href: '/app/inicio' }, { etiqueta: t('titulo') }]}
        cargando={carga.estado === 'cargando'}
        acciones={
          mio ? (
            <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'md' })} onClick={() => setSolicitar(true)}>
              <Plus aria-hidden className="size-4" strokeWidth={1.5} />
              {t('solicitar')}
            </button>
          ) : undefined
        }
        movil={{ titulo: t('titulo'), subtitulo: mio?.nombre ?? undefined }}
      />

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs text-fg-secondary">{t('disponibles')}</p>
          {carga.estado === 'cargando' ? <Skeleton className="mt-1 h-7 w-20" /> : <p className="text-xl font-semibold tabular-nums text-fg">{saldo ? tv('nDias', { n: f.dias(saldo.disponibles) }) : '—'}</p>}
          {saldo ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-success-text">
              <ArrowUp aria-hidden className="size-3" strokeWidth={2} />
              {t('habilesAl', { fecha: f.sinAnio(saldo.fecha) })}
            </p>
          ) : null}
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs text-fg-secondary">{t('porAprobar')}</p>
          {carga.estado === 'cargando' ? <Skeleton className="mt-1 h-7 w-20" /> : <p className="text-xl font-semibold tabular-nums text-fg">{saldo ? tv('nDias', { n: f.dias(saldo.pendientes_aprobacion) }) : '—'}</p>}
        </div>
      </div>

      {mio ? (
        <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'lg', anchoCompleto: true, className: 'lg:hidden' })} onClick={() => setSolicitar(true)}>
          <Plus aria-hidden className="size-4" strokeWidth={1.5} />
          {t('solicitar')}
        </button>
      ) : null}

      <h2 className="text-base font-semibold text-fg">{t('misSolicitudes')}</h2>
      <DataTable
        etiqueta={t('misSolicitudes')}
        columnas={columnas}
        filas={filas}
        obtenerId={(x) => x.id}
        estado={carga.estado === 'cargando' ? 'cargando' : carga.estado === 'sinPermiso' ? 'sinPermiso' : carga.estado !== 'listo' ? 'error' : filas.length === 0 ? 'vacio' : 'listo'}
        onFilaClick={setAbierta}
        etiquetaFila={(x) => f.rango(x.desde, x.hasta)}
        acciones={accionesDe}
        tarjetaMovil={(x) => (
          <ListCard
            icono={TreePalm}
            titulo={f.rangoCorto(x.desde, x.hasta)}
            subtitulo={t('tarjeta', { n: f.dias(x.dias_habiles ?? x.dias_calendario), dia: f.diaSemana(x.regresa) })}
            meta={aprobador(x) ?? undefined}
            estado={<EstadoAusencia fila={x} hoy={hoy} />}
            onClick={() => setAbierta(x)}
            acciones={accionesDe(x)}
          />
        )}
        vacio={{ titulo: t('vacio.titulo'), descripcion: mio ? t('vacio.descripcion') : t('sinVinculo'), icono: TreePalm }}
        error={{ titulo: tv('error') }}
        onReintentar={() => void recargar()}
      />

      <DialogoSolicitarVacaciones abierto={solicitar} onAbiertoChange={setSolicitar} hoy={hoy} paraAlguien={false} persona={mio} onHecho={() => void recargar()} />
      <DialogoAprobarAusencia fila={abierta} festivos={datos?.festivos ?? []} onCerrar={() => setAbierta(null)} onResuelta={() => void recargar()} />
      <DialogoAnular fila={anular} onCerrar={() => setAnular(null)} onHecho={() => void recargar()} />
    </div>
  );
}
