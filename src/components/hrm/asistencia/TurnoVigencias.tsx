'use client';

/**
 * Un turno partido por tramos con la vigencia aplicada (Figma 20.11.2): cada
 * hora usa el valor vigente en su fecha (`fn_hr_parametro`), así un turno que
 * cruza un cambio de vigencia o un festivo queda con dos recargos. Debajo, los
 * parámetros aplicados y si el trabajo dominical es ocasional o habitual.
 */
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ClockArrowUp, House } from 'lucide-react';
import { AvisoTonal, DataTable, FilaDato, ListCard, ListaDatos, PageHeader, Tarjeta, type ColumnaTabla } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { useCarga } from '../personas/apiPersonas';
import { useDias, useHora } from './comunAsistencia';
import { recargosDelDia } from './HorasRecargos';
import {
  agruparTramos,
  diaSemana,
  domingosDelMes,
  partesRecargo,
  textoDuracion,
  textoPct,
  type DetalleParametro,
  type RespuestaHoja,
  type TramoHoras,
} from './asistenciaLogica';

export function TurnoVigencias({ vinculo, fecha, desde, hasta }: { vinculo: string; fecha: string; desde: string; hasta: string }) {
  const t = useTranslations('hrmAsistencia');
  const tc = useTranslations('hrmPersonas.comun');
  const dias = useDias();
  const { carga, recargar } = useCarga<RespuestaHoja>(`/api/hrm/asistencia/hojas/${vinculo}?desde=${fecha}&hasta=${fecha}`);
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const hora = useHora(datos?.zona);
  const dia = datos?.dias.find((d) => d.fecha === fecha) ?? null;
  const tramos = useMemo(() => agruparTramos(dia?.hoja?.tramos ?? []), [dia]);
  const fechasLocales = Array.from(new Set(tramos.map((x) => x.fecha_local))).sort();
  const valoresDominical = Array.from(
    new Set(fechasLocales.map((f) => datos?.vigencias[f]?.recargo_dominical_festivo?.valor).filter((v): v is number => typeof v === 'number'))
  );
  const dosVigencias = valoresDominical.length > 1;
  const volver = `/app/hrm/asistencia/${vinculo}/horas?desde=${desde}&hasta=${hasta}`;
  const primeraFecha = fechasLocales[0] ?? fecha;
  const ultimaFecha = fechasLocales[fechasLocales.length - 1] ?? fecha;
  const titulo =
    primeraFecha === ultimaFecha
      ? t('turno.tituloUnDia', { dia: dias.corto(primeraFecha) })
      : t('turno.titulo', {
          de: dias.corto(primeraFecha),
          a: dias.diaMes(ultimaFecha),
        });

  const vigencia = (d: DetalleParametro | null | undefined) => {
    if (!d) return null;
    const rango = d.hasta
      ? t('turno.vigenteDelAl', {
          desde: dias.completo(d.desde ?? fecha),
          hasta: dias.completo(d.hasta),
        })
      : t('turno.vigenteDesde', { desde: dias.completo(d.desde ?? fecha) });
    return d.origen === 'organizacion' ? `${rango} · ${t('turno.adoptadoEmpresa')}` : rango;
  };
  const festivoDe = (f: string) => datos?.dias.find((d) => d.fecha === f)?.festivo ?? null;

  const columnas: ColumnaTabla<TramoHoras>[] = [
    {
      id: 'tramo',
      encabezado: t('turno.columnas.tramo'),
      celda: (x) => (
        <div className="min-w-0">
          <p className="whitespace-nowrap font-medium text-fg">{`${dias.corto(x.fecha_local)} · ${hora(x.inicio)} – ${hora(x.fin)}`}</p>
          <p className="truncate text-xs text-fg-secondary">
            {festivoDe(x.fecha_local)
              ? `${t('turno.festivo')} · ${festivoDe(x.fecha_local)}`
              : diaSemana(x.fecha_local) === 0
                ? t('turno.domingo')
                : dias.largo(x.fecha_local)}
          </p>
        </div>
      ),
    },
    {
      id: 'horas',
      encabezado: t('turno.columnas.horas'),
      variante: 'importe',
      celda: (x) => <span className="tabular-nums">{textoDuracion(x.minutos)}</span>,
    },
    {
      id: 'tipo',
      encabezado: t('turno.columnas.tipo'),
      celda: (x) => t(`categorias.${x.categoria}`),
    },
    {
      id: 'recargo',
      encabezado: t('turno.columnas.recargo'),
      ocultarDebajo: 'md',
      celda: (x) => partesRecargo(x.categoria, x.recargo, recargosDelDia(datos, x.fecha_local)).map(textoPct).join(' + ') || '—',
    },
    {
      id: 'vigencia',
      encabezado: t('turno.columnas.vigencia'),
      ocultarDebajo: 'lg',
      celda: (x) => {
        const v = datos?.vigencias[x.fecha_local];
        const d = x.categoria.includes('dom')
          ? v?.recargo_dominical_festivo
          : x.categoria.includes('nocturna')
            ? v?.recargo_nocturno
            : x.categoria.startsWith('extra')
              ? v?.recargo_extra_diurna
              : null;
        if (!d) return '—';
        const nombre = x.categoria.includes('dom')
          ? t('turno.paramDominical')
          : x.categoria.includes('nocturna')
            ? t('turno.paramNocturno')
            : t('turno.paramExtra');
        return (
          <div className="min-w-0">
            <p className="text-fg">{`${nombre}: ${textoPct(d.valor)}`}</p>
            <p className="text-xs text-fg-secondary">{vigencia(d)}</p>
          </div>
        );
      },
    },
  ];

  const p = datos?.parametros;
  const mes = fecha.slice(0, 7);
  const domTrabajados = datos?.dominicales_mes[mes] ?? 0;
  const umbral = p?.dominical_habitual_umbral_dias?.valor ?? null;
  const sinPermiso = carga.estado === 'sinPermiso' || carga.estado === 'noExiste';
  const planeado = dia?.turno?.planeado ?? null;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        variante="form"
        volverA={volver}
        titulo={titulo}
        badge={
          dosVigencias ? (
            <Badge tono="informacion" tamano="md">
              {t('turno.nVigencias', { n: valoresDominical.length })}
            </Badge>
          ) : undefined
        }
        subtitulo={[
          datos?.persona.nombre,
          datos?.persona.cargo,
          dia?.turno && !dia.turno.descanso
            ? `${dia.turno.nombre ? `${dia.turno.nombre} ` : ''}${hora(dia.turno.inicio)} – ${hora(dia.turno.fin)}`
            : null,
          planeado ? textoDuracion(planeado) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        migas={[
          { etiqueta: tc('migas.rrhh'), href: '/app/hrm/empleados' },
          {
            etiqueta: t('titulo'),
            href: `/app/hrm/asistencia?vista=hojas&desde=${desde}&hasta=${hasta}`,
          },
          {
            etiqueta: datos?.persona.nombre ?? t('horas.tituloCorto'),
            href: volver,
          },
        ]}
        cargando={carga.estado === 'cargando'}
        movil={{
          titulo: t('turno.tituloMovil'),
          subtitulo: datos?.persona.nombre,
        }}
      />

      {dosVigencias && (
        <AvisoTonal
          tono="informacion"
          titulo={t('turno.avisoTitulo')}
          descripcion={t('turno.avisoDetalle', {
            antes: textoPct(valoresDominical[0]),
            despues: textoPct(valoresDominical[valoresDominical.length - 1]),
          })}
        />
      )}

      <DataTable
        etiqueta={titulo}
        columnas={columnas}
        filas={tramos}
        obtenerId={(x) => `${x.inicio}-${x.categoria}`}
        estado={
          carga.estado === 'cargando'
            ? 'cargando'
            : sinPermiso
              ? 'sinPermiso'
              : carga.estado !== 'listo'
                ? 'error'
                : tramos.length === 0
                  ? 'vacio'
                  : 'listo'
        }
        tarjetaMovil={(x) => (
          <ListCard
            icono={ClockArrowUp}
            titulo={`${dias.corto(x.fecha_local)} · ${hora(x.inicio)} – ${hora(x.fin)}`}
            subtitulo={`${textoDuracion(x.minutos)} · ${t(`categorias.${x.categoria}`)}`}
            meta={partesRecargo(x.categoria, x.recargo, recargosDelDia(datos, x.fecha_local)).map(textoPct).join(' + ') || undefined}
          />
        )}
        vacio={{
          titulo: t('turno.vacio.titulo'),
          descripcion: t('turno.vacio.descripcion'),
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

      {datos && tramos.length > 0 && (
        <Tarjeta titulo={t('turno.parametros')}>
          <ListaDatos>
            <FilaDato
              etiqueta={t('turno.horaNocturna')}
              valor={[p?.nocturno_hora_inicio?.valor != null ? `${p.nocturno_hora_inicio.valor}:00` : '—', p?.nocturno_hora_inicio?.fuente]
                .filter(Boolean)
                .join(' · ')}
            />
            <FilaDato
              etiqueta={t('turno.recargoNocturno')}
              valor={Array.from(new Set(fechasLocales.map((f) => textoPct(datos.vigencias[f]?.recargo_nocturno?.valor)))).join(' · ')}
            />
            <FilaDato
              etiqueta={t('turno.recargoDominical')}
              tono={dosVigencias ? 'fuerte' : 'neutro'}
              valor={
                dosVigencias
                  ? fechasLocales
                      .map((f, i) =>
                        i === 0
                          ? t('turno.hasta', {
                              pct: textoPct(datos.vigencias[f]?.recargo_dominical_festivo?.valor),
                              dia: dias.diaMes(f),
                            })
                          : t('turno.desde', {
                              pct: textoPct(datos.vigencias[f]?.recargo_dominical_festivo?.valor),
                              dia: dias.diaMes(f),
                            })
                      )
                      .join(' · ')
                  : textoPct(datos.vigencias[primeraFecha]?.recargo_dominical_festivo?.valor)
              }
            />
            <FilaDato
              etiqueta={t('turno.jornadaMaxima')}
              valor={
                p?.jornada_max_semanal?.valor != null
                  ? t('turno.jornadaValor', {
                      horas: p.jornada_max_semanal.valor,
                      desde: dias.completo(p.jornada_max_semanal.desde ?? fecha),
                    })
                  : '—'
              }
            />
            <FilaDato
              etiqueta={t('turno.trabajoDominical')}
              valor={
                umbral === null
                  ? '—'
                  : t(domTrabajados >= umbral ? 'turno.habitual' : 'turno.ocasional', { n: domTrabajados, total: domingosDelMes(mes) })
              }
            />
          </ListaDatos>
        </Tarjeta>
      )}

      {tramos.length > 0 && <p className="text-sm text-fg-secondary">{t('turno.nota')}</p>}
    </div>
  );
}
