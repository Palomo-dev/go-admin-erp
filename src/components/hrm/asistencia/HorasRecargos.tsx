'use client';

/**
 * Horas y recargos de una persona en el período (Figma 20.11.1): el aviso del
 * tope superado, la composición de las horas trabajadas, los recargos del
 * período (con el porcentaje vigente en cada fecha) y un día por fila partido
 * por tipo de hora. Sale de `hr_timesheet_lines` (el motor `motorHoras`).
 * Horas y porcentajes, nunca pesos: los pesos se calculan en la nómina.
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarCheck, ClockArrowUp, House } from 'lucide-react';
import { AvisoTonal, DataTable, FilaDato, ListCard, ListaDatos, PageHeader, Tarjeta, type ColumnaTabla } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCarga } from '../personas/apiPersonas';
import { InsigniaEstado, RUTA_NOVEDADES, rutaHoja, rutaTurno, useDias } from './comunAsistencia';
import {
  desglosePeriodo,
  diaSemana,
  duracionOGuion,
  minutosColumna,
  partesRecargo,
  porcentaje,
  textoDuracion,
  textoPct,
  type DiaHoja,
  type RespuestaHoja,
} from './asistenciaLogica';

const COLUMNAS = ['ord_diurna', 'ord_nocturna', 'dom_diurna', 'dom_nocturna', 'extra_diurna', 'extra_nocturna'] as const;

export function recargosDelDia(datos: RespuestaHoja | null, fecha: string) {
  const v = datos?.vigencias[fecha];
  return {
    dominical: v?.recargo_dominical_festivo?.valor ?? null,
    nocturno: v?.recargo_nocturno?.valor ?? null,
    extraDiurna: v?.recargo_extra_diurna?.valor ?? null,
    extraNocturna: v?.recargo_extra_nocturna?.valor ?? null,
  };
}

export function HorasRecargos({ vinculo, desde, hasta }: { vinculo: string; desde: string; hasta: string }) {
  const t = useTranslations('hrmAsistencia');
  const tc = useTranslations('hrmPersonas.comun');
  const router = useRouter();
  const dias = useDias();
  const { carga, recargar } = useCarga<RespuestaHoja>(`/api/hrm/asistencia/hojas/${vinculo}?desde=${desde}&hasta=${hasta}`);
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const filas = useMemo(
    () =>
      (datos?.dias ?? []).filter((d) => d.lineas.length > 0 || (d.hoja?.alertas.length ?? 0) > 0 || d.ajustes.some((a) => a.estado === 'pending')),
    [datos]
  );
  const desglose = useMemo(() => desglosePeriodo(filas), [filas]);
  const alertas = filas.flatMap((d) =>
    (d.hoja?.alertas ?? []).filter((a) => a.codigo !== 'marcacion_incompleta').map((a) => ({ ...a, fecha: d.fecha }))
  );
  const primera = alertas[0];
  const jornada = datos?.parametros.jornada_max_semanal?.valor ?? null;
  const nocturno = datos?.parametros.nocturno_hora_inicio?.valor ?? null;
  const volver = `/app/hrm/asistencia/${vinculo}?desde=${desde}&hasta=${hasta}`;
  const titulo = datos ? t('horas.titulo', { nombre: datos.persona.nombre }) : t('horas.tituloCorto');

  const recargoTexto = (categoria: (typeof desglose.recargos)[number]['categoria'], recargo: number, fecha: string) =>
    partesRecargo(categoria, recargo, recargosDelDia(datos, fecha)).map(textoPct).join(' + ');

  const alertaFila = (d: DiaHoja) => {
    const a = d.hoja?.alertas.find((x) => x.codigo !== 'marcacion_incompleta');
    if (a)
      return (
        <InsigniaEstado tono={a.codigo === 'extra_supera_tope_semanal' ? 'peligro' : 'advertencia'}>{t(`horas.alertas.${a.codigo}`)}</InsigniaEstado>
      );
    if (d.ajustes.some((x) => x.estado === 'pending')) return <InsigniaEstado tono="advertencia">{t('horas.ajustePorAprobar')}</InsigniaEstado>;
    if (d.hoja && !d.hoja.clasificada) return <InsigniaEstado tono="neutro">{t('horas.sinClasificar')}</InsigniaEstado>;
    return <span className="text-fg-muted">—</span>;
  };
  const etiquetaDia = (d: DiaHoja) => (
    <div className="min-w-0">
      <p className="font-medium text-fg">{dias.corto(d.fecha)}</p>
      {(d.festivo || diaSemana(d.fecha) === 0) && <p className="text-xs text-fg-secondary">{d.festivo ? t('hoja.festivo') : t('hoja.dominical')}</p>}
    </div>
  );

  const columnas: ColumnaTabla<DiaHoja>[] = [
    { id: 'dia', encabezado: t('horas.columnas.dia'), celda: etiquetaDia },
    ...COLUMNAS.map((c): ColumnaTabla<DiaHoja> => ({
      id: c,
      encabezado: t(`horas.columnas.${c}`),
      variante: 'importe',
      ocultarDebajo: c.startsWith('dom') ? 'lg' : undefined,
      celda: (d) => <span className="whitespace-nowrap tabular-nums">{duracionOGuion(minutosColumna(d.lineas, c))}</span>,
    })),
    { id: 'alerta', encabezado: t('horas.columnas.alerta'), celda: alertaFila },
  ];

  const partes = [
    { id: 'ordinarias', minutos: desglose.ordinarias, clase: 'bg-brand-deep' },
    { id: 'dominicales', minutos: desglose.dominicales, clase: 'bg-brand' },
    { id: 'extra', minutos: desglose.extra, clase: 'bg-line-brand' },
  ] as const;
  const sinPermiso = carga.estado === 'sinPermiso' || carga.estado === 'noExiste';

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        variante="form"
        volverA={volver}
        titulo={titulo}
        badge={
          alertas.length > 0 ? (
            <Badge tono="advertencia" tamano="md">
              {t('horas.nTopes', { n: alertas.length })}
            </Badge>
          ) : undefined
        }
        subtitulo={[dias.rango(desde, hasta), jornada !== null ? t('horas.jornada', { horas: jornada }) : null, datos?.persona.sede]
          .filter(Boolean)
          .join(' · ')}
        migas={[
          { etiqueta: tc('migas.rrhh'), href: '/app/hrm/empleados' },
          {
            etiqueta: t('titulo'),
            href: `/app/hrm/asistencia?vista=hojas&desde=${desde}&hasta=${hasta}`,
          },
          { etiqueta: datos?.persona.nombre ?? t('horas.tituloCorto') },
        ]}
        cargando={carga.estado === 'cargando'}
        acciones={
          <Button variant="outline" onClick={() => router.push(rutaHoja(vinculo, desde, hasta))}>
            <CalendarCheck className="size-4" aria-hidden="true" /> {t('acciones.verHoja')}
          </Button>
        }
        movil={{
          titulo: t('horas.tituloCorto'),
          subtitulo: datos ? `${datos.persona.nombre} · ${dias.rangoCorto(desde, hasta)}` : undefined,
        }}
      />

      {primera && (
        <AvisoTonal
          tono="advertencia"
          titulo={t(`horas.aviso.${primera.codigo}`, {
            dia: dias.largo(primera.fecha),
          })}
          descripcion={t('horas.aviso.detalle', {
            horas: textoDuracion(primera.minutos ?? 0),
            tope: textoDuracion(primera.tope_minutos ?? 0),
          })}
          accion={{
            etiqueta: t('acciones.verNovedad'),
            onClick: () => router.push(`${RUTA_NOVEDADES}?desde=${desde}&hasta=${hasta}`),
          }}
        />
      )}

      {datos && filas.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Tarjeta
            titulo={t('horas.trabajadas')}
            accion={<span className="text-base font-semibold tabular-nums text-fg">{textoDuracion(desglose.total)}</span>}
          >
            <div className="flex flex-col gap-3">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-subtle" role="img" aria-label={t('horas.composicion')}>
                {partes.map((p) =>
                  p.minutos > 0 ? (
                    <div
                      key={p.id}
                      className={p.clase}
                      style={{
                        width: `${porcentaje(p.minutos, desglose.total)}%`,
                      }}
                    />
                  ) : null
                )}
              </div>
              <ListaDatos>
                {partes.map((p) => (
                  <FilaDato
                    key={p.id}
                    etiqueta={
                      <span className="inline-flex items-center gap-2">
                        <span aria-hidden="true" className={`size-2 rounded-full ${p.clase}`} />
                        {t(`horas.partes.${p.id}`)}
                      </span>
                    }
                    valor={`${textoDuracion(p.minutos)} · ${porcentaje(p.minutos, desglose.total)} %`}
                  />
                ))}
              </ListaDatos>
            </div>
          </Tarjeta>
          <Tarjeta titulo={t('horas.recargos')}>
            {desglose.recargos.length === 0 ? (
              <p className="text-sm text-fg-secondary">{t('horas.sinRecargos')}</p>
            ) : (
              <ListaDatos>
                {desglose.recargos.map((r) => (
                  <FilaDato
                    key={`${r.categoria}-${r.recargo}`}
                    etiqueta={`${t(`categorias.${r.categoria}`)} · ${recargoTexto(r.categoria, r.recargo, r.fecha)}`}
                    valor={textoDuracion(r.minutos)}
                    tono={r.categoria.startsWith('extra') ? 'advertencia' : 'neutro'}
                  />
                ))}
              </ListaDatos>
            )}
          </Tarjeta>
        </div>
      )}

      <DataTable
        etiqueta={titulo}
        columnas={columnas}
        filas={filas}
        obtenerId={(d) => d.fecha}
        estado={
          carga.estado === 'cargando'
            ? 'cargando'
            : sinPermiso
              ? 'sinPermiso'
              : carga.estado !== 'listo'
                ? 'error'
                : filas.length === 0
                  ? 'vacio'
                  : 'listo'
        }
        tonoFila={(d) => (d.hoja?.alertas.some((a) => a.codigo !== 'marcacion_incompleta') ? 'advertencia' : undefined)}
        onFilaClick={(d) => router.push(rutaTurno(vinculo, d.fecha, desde, hasta))}
        etiquetaFila={(d) => dias.largo(d.fecha)}
        tarjetaMovil={(d) => (
          <ListCard
            icono={ClockArrowUp}
            titulo={dias.corto(d.fecha)}
            subtitulo={d.lineas.map((l) => `${textoDuracion(l.minutos)} ${t(`categorias.${l.categoria}`).toLocaleLowerCase()}`).join(' · ') || '—'}
            estado={alertaFila(d)}
            onClick={() => router.push(rutaTurno(vinculo, d.fecha, desde, hasta))}
          />
        )}
        vacio={{
          titulo: t('horas.vacio.titulo'),
          descripcion: t('horas.vacio.descripcion'),
          icono: ClockArrowUp,
        }}
        error={{
          titulo: t('topes.error.titulo'),
          descripcion: t('topes.error.descripcion'),
          icono: ClockArrowUp,
        }}
        sinPermiso={{
          titulo: t('topes.sinPermiso.titulo'),
          descripcion: t('topes.sinPermiso.descripcion'),
          accion: {
            etiqueta: t('comun.irAlInicio'),
            href: '/app/inicio',
            icono: House,
          },
        }}
        onReintentar={() => void recargar()}
      />

      {filas.length > 0 && (
        <p className="text-sm text-fg-secondary">
          {t('horas.nota', {
            hora: nocturno !== null ? `${nocturno}:00` : '—',
            jornada: jornada ?? '—',
          })}
        </p>
      )}
    </div>
  );
}
