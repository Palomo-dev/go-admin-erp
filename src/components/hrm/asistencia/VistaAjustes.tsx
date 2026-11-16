'use client';

/**
 * Asistencia › Ajustes: los ajustes de marca del período, cada uno con su
 * motivo, quién lo pidió y su aprobación (Figma 20.10.6: «nada se corrige en
 * silencio»). Se aprueban o rechazan en Novedades, como el resto.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarCheck, House, NotebookPen } from 'lucide-react';
import { DataTable, ListCard, ListToolbar, SearchInput, type AccionFila, type ColumnaTabla } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useCarga } from '../personas/apiPersonas';
import { CeldaPersona, InsigniaEstado, RUTA_NOVEDADES, conSede, rutaHoja, useDias, useHora } from './comunAsistencia';
import { coincidePersona, estadoVisible, tonoNovedad, type FilaNovedad, type RespuestaNovedades } from './asistenciaLogica';

export function VistaAjustes({ desde, hasta, sede }: { desde: string; hasta: string; sede: number | null }) {
  const t = useTranslations('hrmAsistencia');
  const router = useRouter();
  const dias = useDias();
  const zona = useFormatDate().timezone;
  const hora = useHora(zona);
  const { carga, recargar } = useCarga<RespuestaNovedades>(conSede(`/api/hrm/asistencia/novedades?desde=${desde}&hasta=${hasta}`, sede));
  const [texto, setTexto] = useState('');
  const todas = useMemo(() => (carga.estado === 'listo' ? carga.datos.filas.filter((f) => f.tipo === 'ajuste_marca') : []), [carga]);
  const filas = useMemo(() => todas.filter((f) => coincidePersona(f, texto, [f.justificacion ?? ''])), [todas, texto]);

  const marca = (f: FilaNovedad) => `${t(`marcas.${f.evento ?? 'check_in'}`)} ${hora(f.hora)}`;
  const estado = (f: FilaNovedad) => {
    const e = estadoVisible(f);
    return <InsigniaEstado tono={tonoNovedad(e)}>{t(`novedades.estados.${e}`)}</InsigniaEstado>;
  };
  const acciones = (f: FilaNovedad): AccionFila[] => [
    {
      id: 'hoja',
      etiqueta: t('acciones.verHoja'),
      icono: CalendarCheck,
      onSelect: () => router.push(rutaHoja(f.employment_id, desde, hasta)),
    },
    {
      id: 'novedades',
      etiqueta: t('acciones.verNovedades'),
      icono: NotebookPen,
      onSelect: () => router.push(`${RUTA_NOVEDADES}?desde=${desde}&hasta=${hasta}`),
    },
  ];
  const columnas: ColumnaTabla<FilaNovedad>[] = [
    {
      id: 'persona',
      encabezado: t('ajustes.columnas.persona'),
      celda: (f) => <CeldaPersona p={f} />,
    },
    {
      id: 'dia',
      encabezado: t('ajustes.columnas.dia'),
      celda: (f) => <span className="whitespace-nowrap">{dias.corto(f.fecha)}</span>,
    },
    {
      id: 'marca',
      encabezado: t('ajustes.columnas.marca'),
      celda: (f) => <span className="whitespace-nowrap">{marca(f)}</span>,
    },
    {
      id: 'motivo',
      encabezado: t('ajustes.columnas.motivo'),
      ocultarDebajo: 'md',
      celda: (f) => <span className="line-clamp-2">{f.justificacion ?? '—'}</span>,
    },
    {
      id: 'solicito',
      encabezado: t('ajustes.columnas.solicito'),
      ocultarDebajo: 'lg',
      celda: (f) => f.solicito ?? '—',
    },
    { id: 'estado', encabezado: t('ajustes.columnas.estado'), celda: estado },
  ];

  return (
    <>
      {carga.estado !== 'sinPermiso' && (carga.estado !== 'listo' || todas.length > 0) && (
        <ListToolbar busqueda={<SearchInput value={texto} onChange={setTexto} placeholder={t('ajustes.buscar')} etiqueta={t('ajustes.buscar')} />} />
      )}
      <DataTable
        etiqueta={t('ajustes.tabla')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => f.id}
        estado={
          carga.estado === 'cargando'
            ? 'cargando'
            : carga.estado === 'sinPermiso'
              ? 'sinPermiso'
              : carga.estado !== 'listo'
                ? 'error'
                : todas.length === 0
                  ? 'vacio'
                  : filas.length === 0
                    ? 'sinResultados'
                    : 'listo'
        }
        onFilaClick={(f) => router.push(rutaHoja(f.employment_id, desde, hasta))}
        etiquetaFila={(f) => f.nombre}
        acciones={acciones}
        tarjetaMovil={(f) => (
          <ListCard
            avatar={{ nombre: f.nombre }}
            titulo={f.nombre}
            subtitulo={`${dias.corto(f.fecha)} · ${marca(f)}`}
            meta={f.justificacion ?? undefined}
            estado={estado(f)}
            onClick={() => router.push(rutaHoja(f.employment_id, desde, hasta))}
            acciones={acciones(f)}
          />
        )}
        vacio={{
          titulo: t('ajustes.vacio.titulo'),
          descripcion: t('ajustes.vacio.descripcion'),
          icono: CalendarCheck,
        }}
        sinResultados={{ descripcion: t('ajustes.sinResultados') }}
        error={{ titulo: t('ajustes.error'), icono: CalendarCheck }}
        sinPermiso={{
          titulo: t('hoy.sinPermiso.titulo'),
          descripcion: t('hoy.sinPermiso.descripcion'),
          accion: {
            etiqueta: t('comun.irAlInicio'),
            href: '/app/inicio',
            icono: House,
          },
        }}
        onLimpiarFiltros={() => setTexto('')}
        onReintentar={() => void recargar()}
        termino={texto}
      />
    </>
  );
}
