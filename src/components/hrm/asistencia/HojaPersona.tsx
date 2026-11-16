'use client';

/**
 * Hoja de tiempo de una persona (Figma 20.10.5; móvil 20.10.5): cabecera de
 * «Editar rol» (migas, «←» cuadrado, insignia y acciones), cuatro cifras y un
 * día por fila con su turno, entrada, salida, horas, diferencia y ajuste.
 * «Aprobar hoja» queda deshabilitado con su motivo mientras haya algo por
 * aprobar. Horas, no pesos: aquí no hay salario.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CalendarCheck, CircleCheck, ClockArrowUp, House, Plus, TriangleAlert } from 'lucide-react';
import { DataTable, KpiStrip, ListCard, PageHeader, StatCard, type AccionFila, type ColumnaTabla } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorPersonas, pedir, useCarga } from '../personas/apiPersonas';
import { DialogoAjuste } from './DialogoAjuste';
import { InsigniaEstado, InsigniaListaNomina, RUTA_ASISTENCIA, rutaHoras, rutaTurno, useDias, useHora } from './comunAsistencia';
import { desglosePeriodo, diaSemana, textoDiferencia, textoDuracion, type DiaHoja, type RespuestaHoja, type TonoEstado } from './asistenciaLogica';

interface Ajuste {
  clave: string;
  tono: TonoEstado;
  pendiente: boolean;
}

/** El ajuste que se muestra en la fila: lo pendiente primero, luego lo resuelto. */
function ajusteDelDia(d: DiaHoja): Ajuste | null {
  if (d.ajustes.some((a) => a.estado === 'pending')) return { clave: 'porAprobar', tono: 'advertencia', pendiente: true };
  const extra = d.novedades.find((n) => n.tipo === 'horas_extra');
  if (extra?.estado === 'pendiente') return { clave: 'extraPorAprobar', tono: 'advertencia', pendiente: true };
  const pend = d.novedades.find((n) => n.estado === 'pendiente' || n.estado === 'esperando_contraparte');
  if (pend)
    return {
      clave: `${pend.tipo}PorAprobar`,
      tono: 'advertencia',
      pendiente: true,
    };
  const tarde = d.novedades.find((n) => n.tipo === 'tardanza');
  if (tarde?.estado === 'aprobada') return { clave: 'tardeJustificada', tono: 'advertencia', pendiente: false };
  if (tarde?.estado === 'rechazada') return { clave: 'tardeDescuenta', tono: 'peligro', pendiente: false };
  if (extra?.estado === 'aprobada') return { clave: 'extraAprobada', tono: 'exito', pendiente: false };
  if (d.ajustes.some((a) => a.estado === 'approved')) return { clave: 'ajustado', tono: 'exito', pendiente: false };
  return null;
}

export function HojaPersona({ vinculo, desde, hasta }: { vinculo: string; desde: string; hasta: string }) {
  const t = useTranslations('hrmAsistencia');
  const tc = useTranslations('hrmPersonas.comun');
  const router = useRouter();
  const dias = useDias();
  const { carga, recargar } = useCarga<RespuestaHoja>(`/api/hrm/asistencia/hojas/${vinculo}?desde=${desde}&hasta=${hasta}`);
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const hora = useHora(datos?.zona);
  const [ajustarDia, setAjustarDia] = useState<DiaHoja | null>(null);
  const [ajustar, setAjustar] = useState(false);
  const [aprobando, setAprobando] = useState(false);

  const filas = useMemo(() => datos?.dias ?? [], [datos]);
  const totales = useMemo(() => {
    const programadas = filas.reduce((s, d) => s + (d.turno && !d.turno.descanso ? (d.turno.planeado ?? 0) : 0), 0);
    const trabajadas = filas.reduce((s, d) => s + (d.hoja?.trabajadas ?? 0), 0);
    return { programadas, trabajadas, ...desglosePeriodo(filas) };
  }, [filas]);
  const pendientes = filas.reduce(
    (s, d) =>
      s +
      d.ajustes.filter((a) => a.estado === 'pending').length +
      d.novedades.filter((n) => n.estado === 'pendiente' || n.estado === 'esperando_contraparte').length,
    0
  );
  const todosListos =
    filas.length > 0 &&
    filas.filter((d) => d.hoja).every((d) => d.hoja && ['approved', 'locked'].includes(d.hoja.estado)) &&
    filas.some((d) => d.hoja);
  const nocturnoDesde = datos?.parametros.nocturno_hora_inicio?.valor ?? null;
  const volver = `${RUTA_ASISTENCIA}?vista=hojas&desde=${desde}&hasta=${hasta}`;
  const titulo = datos ? t('hoja.titulo', { nombre: datos.persona.nombre }) : t('hoja.tituloCorto');

  const aprobar = async () => {
    setAprobando(true);
    try {
      const r = await pedir<{
        listas: number;
        pendientes: Array<{ motivo: string }>;
      }>('/api/hrm/asistencia/lista-nomina', {
        metodo: 'POST',
        cuerpo: { desde, hasta, vinculos: [vinculo] },
      });
      if (r.pendientes.length === 0)
        toast.success(t('hoja.aprobada'), {
          description: t('hojas.aprobadasDesc'),
        });
      else
        toast.warning(t('hoja.aprobadaParcial', { n: r.pendientes.length }), {
          description: t(`hojas.motivos.${r.pendientes[0].motivo}`),
        });
      void recargar();
    } catch (e) {
      const c = e instanceof ErrorPersonas ? e.codigo : 'error_hrm';
      toast.error(c === 'parametro_no_configurado' ? t('errores.parametro') : c === 'sin_permiso' ? t('errores.sinPermiso') : t('errores.guardar'));
    } finally {
      setAprobando(false);
    }
  };

  const etiquetaDia = (d: DiaHoja) => {
    const sub = d.festivo ? t('hoja.festivo') : diaSemana(d.fecha) === 0 ? t('hoja.dominical') : d.turno?.descanso ? t('hoja.descanso') : null;
    return (
      <div className="min-w-0">
        <p className="font-medium text-fg">{dias.corto(d.fecha)}</p>
        {sub && <p className="text-xs text-fg-secondary">{sub}</p>}
      </div>
    );
  };
  const turnoTexto = (d: DiaHoja) =>
    d.turno && !d.turno.descanso
      ? `${d.turno.nombre ? `${d.turno.nombre} ` : ''}${hora(d.turno.inicio)} – ${hora(d.turno.fin)}`
      : d.turno?.descanso
        ? t('hoja.descanso')
        : '—';
  const salidaTexto = (d: DiaHoja) => {
    const pendiente = d.ajustes.find((a) => a.estado === 'pending' && a.tipo === 'check_out');
    if (pendiente?.hora) return t('hoja.conAjuste', { hora: hora(pendiente.hora) });
    return d.hoja?.salida ? hora(d.hoja.salida) : d.hoja?.marcacion_abierta ? t('hoja.sinSalida') : '—';
  };
  const diferencia = (d: DiaHoja) => (d.hoja && d.turno?.planeado ? (d.hoja.trabajadas ?? 0) - d.turno.planeado : 0);
  const ajusteBadge = (d: DiaHoja) => {
    const a = ajusteDelDia(d);
    if (!a)
      return d.hoja && ['approved', 'locked'].includes(d.hoja.estado) ? (
        <InsigniaListaNomina>{t('estados.listaNomina')}</InsigniaListaNomina>
      ) : (
        <span className="text-fg-muted">—</span>
      );
    return <InsigniaEstado tono={a.tono}>{t(`hoja.ajustes.${a.clave}`)}</InsigniaEstado>;
  };
  const accionesDe = (d: DiaHoja): AccionFila[] => [
    {
      id: 'ajuste',
      etiqueta: t('acciones.agregarAjuste'),
      icono: Plus,
      onSelect: () => setAjustarDia(d),
      oculta: !datos?.puede_ajustar,
    },
    {
      id: 'turno',
      etiqueta: t('acciones.verRecargosDia'),
      icono: ClockArrowUp,
      onSelect: () => router.push(rutaTurno(vinculo, d.fecha, desde, hasta)),
      oculta: d.lineas.length === 0,
    },
  ];

  const columnas: ColumnaTabla<DiaHoja>[] = [
    { id: 'dia', encabezado: t('hoja.columnas.dia'), celda: etiquetaDia },
    {
      id: 'turno',
      encabezado: t('hoja.columnas.turno'),
      ocultarDebajo: 'md',
      celda: (d) => <span className="whitespace-nowrap">{turnoTexto(d)}</span>,
    },
    {
      id: 'entrada',
      encabezado: t('hoja.columnas.entrada'),
      celda: (d) => <span className="whitespace-nowrap tabular-nums">{d.hoja?.entrada ? hora(d.hoja.entrada) : '—'}</span>,
    },
    {
      id: 'salida',
      encabezado: t('hoja.columnas.salida'),
      celda: (d) => <span className="block max-w-[140px] truncate tabular-nums">{salidaTexto(d)}</span>,
    },
    {
      id: 'horas',
      encabezado: t('hoja.columnas.horas'),
      variante: 'importe',
      celda: (d) => <span className="whitespace-nowrap tabular-nums">{d.hoja ? textoDuracion(d.hoja.trabajadas) : '—'}</span>,
    },
    {
      id: 'diferencia',
      encabezado: t('hoja.columnas.diferencia'),
      variante: 'importe',
      ocultarDebajo: 'lg',
      celda: (d) => <span className="whitespace-nowrap tabular-nums">{textoDiferencia(diferencia(d))}</span>,
    },
    { id: 'ajuste', encabezado: t('hoja.columnas.ajuste'), celda: ajusteBadge },
  ];

  const sinPermiso = carga.estado === 'sinPermiso' || carga.estado === 'noExiste';

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        variante="form"
        volverA={volver}
        titulo={titulo}
        badge={
          pendientes > 0 ? (
            <Badge tono="advertencia" tamano="md">
              {t('hoja.nPorAprobar', { n: pendientes })}
            </Badge>
          ) : todosListos ? (
            <InsigniaListaNomina tamano="md">{t('estados.listaNomina')}</InsigniaListaNomina>
          ) : undefined
        }
        subtitulo={
          datos
            ? [dias.rango(desde, hasta), datos.persona.cargo, datos.persona.area, datos.persona.sede].filter(Boolean).join(' · ')
            : dias.rango(desde, hasta)
        }
        migas={[
          { etiqueta: tc('migas.rrhh'), href: '/app/hrm/empleados' },
          { etiqueta: t('titulo'), href: volver },
          { etiqueta: datos?.persona.nombre ?? t('hoja.tituloCorto') },
        ]}
        cargando={carga.estado === 'cargando'}
        acciones={
          datos ? (
            <>
              {datos.puede_ajustar && (
                <Button variant="outline" onClick={() => setAjustar(true)}>
                  <Plus className="size-4" aria-hidden="true" /> {t('acciones.agregarAjuste')}
                </Button>
              )}
              {datos.puede_gestionar && !todosListos && (
                <Button
                  onClick={() => void aprobar()}
                  disabled={pendientes > 0 || aprobando || filas.every((d) => !d.hoja)}
                  title={pendientes > 0 ? t('hoja.motivoAprobar', { n: pendientes }) : undefined}
                  aria-describedby={pendientes > 0 ? 'motivo-aprobar-hoja' : undefined}
                >
                  <CircleCheck className="size-4" aria-hidden="true" /> {t('acciones.aprobarHoja')}
                </Button>
              )}
            </>
          ) : undefined
        }
        movil={{
          titulo: t('hoja.tituloCorto'),
          subtitulo: datos ? `${datos.persona.nombre} · ${dias.rangoCorto(desde, hasta)}` : undefined,
        }}
      />
      {datos?.puede_gestionar && pendientes > 0 && (
        <p id="motivo-aprobar-hoja" className="-mt-2 text-xs text-fg-secondary">
          {t('hoja.motivoAprobar', { n: pendientes })}
        </p>
      )}

      {datos && filas.length > 0 && (
        <KpiStrip etiqueta={t('hoja.resumen')}>
          <StatCard etiqueta={t('hoja.kpi.programadas')} valor={textoDuracion(totales.programadas)} />
          <StatCard
            etiqueta={t('hoja.kpi.trabajadas')}
            valor={textoDuracion(totales.trabajadas)}
            detalle={totales.trabajadas !== totales.programadas ? textoDiferencia(totales.trabajadas - totales.programadas) : undefined}
            tono={totales.trabajadas >= totales.programadas ? 'exito' : 'advertencia'}
            tendencia={totales.trabajadas >= totales.programadas ? 'sube' : 'baja'}
          />
          <StatCard
            etiqueta={t('hoja.kpi.extra')}
            valor={textoDuracion(totales.extra)}
            detalle={totales.extra > 0 ? t('hoja.kpi.extraDetalle') : undefined}
            tono="advertencia"
            iconoDetalle={TriangleAlert}
            href={totales.extra > 0 ? rutaHoras(vinculo, desde, hasta) : undefined}
          />
          <StatCard
            etiqueta={t('hoja.kpi.nocturnas')}
            valor={textoDuracion(totales.nocturnas)}
            detalle={
              nocturnoDesde !== null
                ? t('hoja.kpi.nocturnasDetalle', {
                    hora: `${nocturnoDesde}:00`,
                  })
                : undefined
            }
          />
        </KpiStrip>
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
        tonoFila={(d) => (ajusteDelDia(d)?.pendiente ? 'advertencia' : undefined)}
        onFilaClick={(d) =>
          d.lineas.length > 0 ? router.push(rutaTurno(vinculo, d.fecha, desde, hasta)) : datos?.puede_ajustar ? setAjustarDia(d) : undefined
        }
        etiquetaFila={(d) => dias.largo(d.fecha)}
        acciones={accionesDe}
        tarjetaMovil={(d) => (
          <ListCard
            icono={CalendarCheck}
            titulo={`${dias.corto(d.fecha)} · ${d.hoja?.entrada ? hora(d.hoja.entrada) : '—'} – ${salidaTexto(d)}`}
            subtitulo={diferencia(d) !== 0 ? textoDiferencia(diferencia(d)) : d.hoja ? textoDuracion(d.hoja.trabajadas) : turnoTexto(d)}
            estado={ajusteBadge(d)}
            onClick={() => (d.lineas.length > 0 ? router.push(rutaTurno(vinculo, d.fecha, desde, hasta)) : undefined)}
            acciones={accionesDe(d)}
          />
        )}
        vacio={{
          titulo: t('hoja.vacio.titulo'),
          descripcion: t('hoja.vacio.descripcion'),
          icono: CalendarCheck,
        }}
        error={{ titulo: t('hoja.error'), icono: CalendarCheck }}
        sinPermiso={{
          titulo: t('hoy.sinPermiso.titulo'),
          descripcion: t('hoy.sinPermiso.descripcion'),
          accion: {
            etiqueta: t('comun.irAlInicio'),
            href: '/app/inicio',
            icono: House,
          },
        }}
        onReintentar={() => void recargar()}
      />

      {datos && filas.length > 0 && (
        <p className="text-sm text-fg-secondary">
          {t('hoja.nota')}{' '}
          <Link href={rutaHoras(vinculo, desde, hasta)} className="font-medium text-link hover:underline">
            {t('hoja.notaEnlace')}
          </Link>
        </p>
      )}

      {datos && (
        <DialogoAjuste
          abierto={ajustar || ajustarDia !== null}
          onAbiertoChange={(a) => {
            if (!a) {
              setAjustar(false);
              setAjustarDia(null);
            }
          }}
          zona={datos.zona}
          fecha={ajustarDia?.fecha ?? (datos.hoy <= hasta ? datos.hoy : hasta)}
          editarFecha={!ajustarDia}
          hoy={datos.hoy}
          personas={[
            {
              employment_id: datos.persona.employment_id,
              nombre: datos.persona.nombre,
              entrada: ajustarDia?.hoja?.entrada ?? null,
              salida: ajustarDia?.hoja?.salida ?? null,
              turno: ajustarDia?.turno ? { inicio: ajustarDia.turno.inicio, fin: ajustarDia.turno.fin } : null,
            },
          ]}
          onEnviado={() => void recargar()}
        />
      )}
    </div>
  );
}
