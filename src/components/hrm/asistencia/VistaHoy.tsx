'use client';

/**
 * Asistencia › Hoy (Figma 20.10.1, 20.10.2 y 20.10.7–20.10.11): cuatro cifras
 * (presentes, faltan, llegaron tarde, en descanso), un buscador con filtros y la
 * lista de quien tiene turno, marcó o está ausente hoy. «Falta» = turno
 * publicado, sin marca y sin ausencia aprobada. Las incapacidades salen sin su
 * tipo a quien no tiene salud en toda la organización (decisión 2).
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CalendarCheck, CalendarRange, CircleCheck, House, Plus, TriangleAlert } from 'lucide-react';
import {
  DataTable,
  FilterChips,
  FilterPanel,
  FormField,
  KpiStrip,
  ListCard,
  ListToolbar,
  SearchInput,
  StatCard,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ErrorPersonas, pedir, type Carga } from '../personas/apiPersonas';
import { CeldaPersona, InsigniaEstado, RUTA_TURNOS, rutaHoja, useHora } from './comunAsistencia';
import { DialogoAjuste } from './DialogoAjuste';
import {
  areasDe,
  claveEstadoHoy,
  coincidePersona,
  ordenarHoy,
  periodoQuincena,
  resumenHoy,
  tonoHoy,
  type EstadoHoy,
  type FilaHoy,
  type RespuestaHoy,
} from './asistenciaLogica';

const ESTADOS: readonly EstadoHoy[] = ['presente', 'tarde', 'falta', 'descanso', 'salio', 'ausencia', 'por_llegar'];

export function VistaHoy({
  carga,
  recargar,
  periodo,
}: {
  carga: Carga<RespuestaHoy>;
  recargar: () => Promise<void>;
  periodo: { desde: string; hasta: string };
}) {
  const t = useTranslations('hrmAsistencia');
  const router = useRouter();
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const hora = useHora(datos?.zona);
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<EstadoHoy | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [ajustar, setAjustar] = useState<FilaHoy | null>(null);

  const todas = useMemo(() => (datos ? ordenarHoy(datos.filas) : []), [datos]);
  const areas = useMemo(() => areasDe(todas), [todas]);
  const filas = useMemo(
    () => todas.filter((f) => coincidePersona(f, texto) && (!estado || f.estado === estado) && (!area || f.area === area)),
    [todas, texto, estado, area]
  );
  const resumen = useMemo(() => resumenHoy(todas), [todas]);
  const limpiar = () => {
    setEstado(null);
    setArea(null);
  };
  const chips: ChipFiltro[] = [
    ...(estado
      ? [
          {
            clave: 'estado',
            etiqueta: t('filtros.chipEstado', {
              valor: t(`hoy.estados.${estado}`),
            }),
          },
        ]
      : []),
    ...(area ? [{ clave: 'area', etiqueta: t('filtros.chipEquipo', { valor: area }) }] : []),
  ];
  const quincena = datos ? periodoQuincena(datos.fecha) : periodo;

  const marcarAusencia = async (f: FilaHoy) => {
    if (!datos) return;
    try {
      await pedir('/api/hrm/novedades', {
        metodo: 'POST',
        cuerpo: {
          accion: 'ausencia',
          vinculo_id: f.employment_id,
          fecha: datos.fecha,
          motivo: t('hoy.motivoAusenciaJustificada'),
        },
      });
      toast.success(t('hoy.ausenciaRegistrada', { nombre: f.nombre }), {
        description: t('hoy.ausenciaRegistradaDesc'),
      });
      void recargar();
    } catch (e) {
      const codigo = e instanceof ErrorPersonas ? e.codigo : 'error_hrm';
      toast.error(codigo === 'duplicado' ? t('errores.ausenciaYaRegistrada') : t('errores.guardar'));
    }
  };

  const accionesDe = (f: FilaHoy): AccionFila[] => [
    {
      id: 'hoja',
      etiqueta: t('acciones.verHoja'),
      icono: CalendarCheck,
      onSelect: () => router.push(rutaHoja(f.employment_id, quincena.desde, quincena.hasta)),
    },
    {
      id: 'marca',
      etiqueta: t('acciones.registrarMarca'),
      icono: Plus,
      onSelect: () => setAjustar(f),
    },
    {
      id: 'ausencia',
      etiqueta: t('acciones.marcarAusencia'),
      icono: CircleCheck,
      onSelect: () => void marcarAusencia(f),
      oculta: !datos?.puede_gestionar || f.estado !== 'falta',
    },
  ];

  const turnoTexto = (f: FilaHoy) => (f.turno ? `${f.turno.nombre ? `${f.turno.nombre} ` : ''}${hora(f.turno.inicio)} – ${hora(f.turno.fin)}` : '—');
  const comoTexto = (f: FilaHoy) => (f.como ? t(`hoy.como.${f.como}`) : '—');
  const estadoBadge = (f: FilaHoy) => (
    <InsigniaEstado tono={tonoHoy(f)}>
      {f.estado === 'tarde' ? t('hoy.estados.tardeMin', { n: f.tarde_minutos ?? 0 }) : t(`hoy.estados.${claveEstadoHoy(f)}`)}
    </InsigniaEstado>
  );

  const columnas: ColumnaTabla<FilaHoy>[] = [
    {
      id: 'persona',
      encabezado: t('hoy.columnas.persona'),
      celda: (f) => <CeldaPersona p={f} />,
    },
    {
      id: 'turno',
      encabezado: t('hoy.columnas.turno'),
      ocultarDebajo: 'md',
      celda: (f) => <span className="whitespace-nowrap">{turnoTexto(f)}</span>,
    },
    {
      id: 'entrada',
      encabezado: t('hoy.columnas.entrada'),
      celda: (f) => <span className="whitespace-nowrap tabular-nums">{f.entrada ? hora(f.entrada) : '—'}</span>,
    },
    {
      id: 'como',
      encabezado: t('hoy.columnas.como'),
      ocultarDebajo: 'lg',
      celda: comoTexto,
    },
    { id: 'estado', encabezado: t('hoy.columnas.estado'), celda: estadoBadge },
  ];

  const estadoTabla =
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
              : 'listo';

  return (
    <>
      {datos && todas.length > 0 && (
        <KpiStrip etiqueta={t('hoy.resumen')}>
          <StatCard
            etiqueta={t('hoy.kpi.presentes')}
            valor={t('hoy.kpi.presentesValor', {
              n: resumen.presentes,
              total: resumen.conTurno,
            })}
            detalle={t('hoy.kpi.presentesDetalle')}
            tono="exito"
            tendencia="sube"
          />
          <StatCard
            etiqueta={t('hoy.kpi.faltan')}
            valor={String(resumen.faltan)}
            detalle={t('hoy.kpi.faltanDetalle')}
            tono="peligro"
            tendencia="baja"
            onClick={() => setEstado('falta')}
          />
          <StatCard
            etiqueta={t('hoy.kpi.tarde')}
            valor={String(resumen.tarde)}
            detalle={datos.tolerancia_minutos > 0 ? t('hoy.kpi.tardeDetalle', { n: datos.tolerancia_minutos }) : t('hoy.kpi.tardeSinTolerancia')}
            tono="advertencia"
            iconoDetalle={TriangleAlert}
            onClick={() => setEstado('tarde')}
          />
          <StatCard etiqueta={t('hoy.kpi.descanso')} valor={String(resumen.descanso)} />
        </KpiStrip>
      )}

      {carga.estado !== 'sinPermiso' && (carga.estado !== 'listo' || todas.length > 0 || chips.length > 0) && (
        <ListToolbar
          busqueda={
            <SearchInput
              value={texto}
              onChange={setTexto}
              cargando={carga.estado === 'cargando'}
              placeholder={t('hoy.buscar')}
              etiqueta={t('hoy.buscar')}
            />
          }
          filtros={
            <FilterPanel
              conteo={chips.length}
              onLimpiar={limpiar}
              textoVerResultados={t('filtros.verPersonas', {
                n: filas.length,
              })}
            >
              <FormField etiqueta={t('filtros.estado')}>
                {(c) => (
                  <Select value={estado ?? '__todos'} onValueChange={(v) => setEstado(v === '__todos' ? null : (v as EstadoHoy))}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__todos">{t('filtros.todos')}</SelectItem>
                      {ESTADOS.map((e) => (
                        <SelectItem key={e} value={e}>
                          {t(`hoy.estados.${e}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('filtros.equipo')}>
                {(c) => (
                  <Select value={area ?? '__todos'} onValueChange={(v) => setArea(v === '__todos' ? null : v)}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__todos">{t('filtros.todos')}</SelectItem>
                      {areas.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            </FilterPanel>
          }
          chips={
            chips.length > 0 ? (
              <FilterChips chips={chips} onQuitar={(c) => (c === 'estado' ? setEstado(null) : setArea(null))} onLimpiarTodo={limpiar} />
            ) : undefined
          }
        />
      )}

      <DataTable
        etiqueta={t('hoy.tabla')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => f.employment_id}
        estado={estadoTabla}
        onFilaClick={(f) => router.push(rutaHoja(f.employment_id, quincena.desde, quincena.hasta))}
        etiquetaFila={(f) => f.nombre}
        acciones={accionesDe}
        tarjetaMovil={(f) => (
          <ListCard
            avatar={{ nombre: f.nombre }}
            titulo={f.nombre}
            subtitulo={
              f.entrada
                ? t('hoy.movilEntro', {
                    hora: hora(f.entrada),
                    como: comoTexto(f),
                  })
                : f.turno
                  ? t('hoy.movilSinMarcar', {
                      turno: `${f.turno.nombre ?? ''} ${hora(f.turno.inicio)}`.trim(),
                    })
                  : undefined
            }
            meta={[f.cargo, f.area].filter(Boolean).join(' · ') || undefined}
            estado={estadoBadge(f)}
            onClick={() => router.push(rutaHoja(f.employment_id, quincena.desde, quincena.hasta))}
            acciones={accionesDe(f)}
          />
        )}
        vacio={{
          titulo: t('hoy.vacio.titulo'),
          descripcion: t('hoy.vacio.descripcion'),
          icono: CalendarCheck,
          accion: {
            etiqueta: t('hoy.vacio.accion'),
            href: RUTA_TURNOS,
            icono: CalendarRange,
          },
        }}
        sinResultados={{
          titulo: t('hoy.sinResultados.titulo'),
          descripcion: t('hoy.sinResultados.descripcion'),
          icono: CalendarCheck,
        }}
        error={{
          titulo: t('hoy.error.titulo'),
          descripcion: t('hoy.error.descripcion'),
          icono: CalendarCheck,
        }}
        sinPermiso={{
          titulo: t('hoy.sinPermiso.titulo'),
          descripcion: t('hoy.sinPermiso.descripcion'),
          accion: {
            etiqueta: t('comun.irAlInicio'),
            href: '/app/inicio',
            icono: House,
          },
        }}
        onLimpiarFiltros={() => {
          limpiar();
          setTexto('');
        }}
        onReintentar={() => void recargar()}
        termino={texto}
      />

      {datos && (
        <DialogoAjuste
          abierto={ajustar !== null}
          onAbiertoChange={(a) => !a && setAjustar(null)}
          zona={datos.zona}
          fecha={datos.fecha}
          personas={ajustar ? [ajustar] : []}
          onEnviado={() => void recargar()}
        />
      )}
    </>
  );
}
