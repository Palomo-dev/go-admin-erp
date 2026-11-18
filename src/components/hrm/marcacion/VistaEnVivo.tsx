'use client';

/**
 * Marcación › En vivo (Figma 20.26.1–20.26.11): cuatro indicadores, «Hoy por
 * método», y las marcas e intentos rechazados de hoy con su método, el punto o
 * dispositivo y la verificación. Las filas son las mismas que lee Asistencia
 * (D1). La marca no se edita aquí (R1): «Corregir con un ajuste…» abre el ajuste
 * de Asistencia, que pasa por aprobación.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlarmClockCheck, CalendarCheck, Camera, House, MonitorSmartphone, PenLine, Settings, TriangleAlert } from 'lucide-react';
import {
  AvisoTonal,
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
import { cn } from '@/lib/utils';
import type { Carga } from '../personas/apiPersonas';
import { CeldaPersona, rutaHoja, useHora } from '../asistencia/comunAsistencia';
import { periodoQuincena } from '../asistencia/asistenciaLogica';
import { DialogoAjuste } from '../asistencia/DialogoAjuste';
import { DialogoFotoEvidencia } from '../kiosco/DialogoFotoEvidencia';
import { InsigniaVerificacion, MetodoConIcono, RUTA_MARCACION, iconoMetodo } from './comunMarcacion';
import {
  GRUPOS_VERIFICACION,
  claveTipoFila,
  conteoPorMetodo,
  filasEnVivo,
  filtrarVivo,
  marcaParaAjuste,
  metodosDeFilas,
  motivosPorRevisar,
  puntoDeFila,
  verificacionFila,
  type FilaVivo,
  type GrupoVerificacion,
  type MetodoFila,
  type RespuestaEnVivo,
} from './marcacionVista';

export function VistaEnVivo({ carga, recargar }: { carga: Carga<RespuestaEnVivo>; recargar: () => Promise<void> }) {
  const t = useTranslations('hrmMarcacionRrhh');
  const tm = useTranslations('hrmMarcacionRrhh.metodos');
  const router = useRouter();
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const hora = useHora(datos?.zona);
  const [texto, setTexto] = useState('');
  const [metodo, setMetodo] = useState<MetodoFila | null>(null);
  const [verificacion, setVerificacion] = useState<GrupoVerificacion | null>(null);
  const [ajustar, setAjustar] = useState<FilaVivo | null>(null);
  const [foto, setFoto] = useState<{ id: string; nombre: string } | null>(null);
  const tk = useTranslations('hrmKiosco.foto');

  const todas = useMemo(() => filasEnVivo(datos), [datos]);
  const metodos = useMemo(() => metodosDeFilas(todas), [todas]);
  const filas = useMemo(() => filtrarVivo(todas, { texto, metodo, verificacion }), [todas, texto, metodo, verificacion]);
  const porMetodo = useMemo(() => conteoPorMetodo(datos?.por_metodo), [datos]);
  const motivos = useMemo(() => motivosPorRevisar(datos?.marcas ?? []), [datos]);
  const quincena = datos ? periodoQuincena(datos.fecha) : null;

  const limpiar = () => {
    setMetodo(null);
    setVerificacion(null);
  };
  const chips: ChipFiltro[] = [
    ...(metodo ? [{ clave: 'metodo', etiqueta: t('filtros.chipMetodo', { valor: tm(metodo) }) }] : []),
    ...(verificacion ? [{ clave: 'verificacion', etiqueta: t('filtros.chipVerificacion', { valor: t(`filtros.grupos.${verificacion}`) }) }] : []),
  ];

  const irHoja = (f: FilaVivo) => {
    if (quincena) router.push(rutaHoja(f.employment_id, quincena.desde, quincena.hasta));
  };

  const accionesDe = (f: FilaVivo): AccionFila[] => [
    {
      id: 'hoja',
      etiqueta: t('envivo.acciones.verHoja'),
      icono: CalendarCheck,
      onSelect: () => irHoja(f),
    },
    {
      id: 'dispositivo',
      etiqueta: t('envivo.acciones.verDispositivo'),
      icono: MonitorSmartphone,
      onSelect: () => router.push(`${RUTA_MARCACION}?vista=dispositivos`),
      oculta: f.clase !== 'marca' || !f.punto_id,
    },
    {
      id: 'foto',
      etiqueta: tk('ver'),
      icono: Camera,
      onSelect: () => f.clase === 'marca' && setFoto({ id: f.id, nombre: f.nombre }),
      oculta: f.clase !== 'marca' || f.foto !== true,
    },
    {
      id: 'ajuste',
      etiqueta: t('envivo.acciones.corregir'),
      icono: PenLine,
      onSelect: () => setAjustar(f),
    },
  ];

  const textoPunto = (f: FilaVivo): string => {
    const p = puntoDeFila(f);
    switch (p.tipo) {
      case 'registrada':
        return t('envivo.punto.registradaPor', { nombre: p.por });
      case 'punto':
        return p.nombre;
      case 'sede':
        return p.metros !== null ? t('envivo.punto.sedeA', { sede: p.sede, m: p.metros }) : p.sede;
      case 'distancia':
        return t('envivo.punto.aDeLaSede', { m: p.metros });
      default:
        return '—';
    }
  };
  const textoTipo = (f: FilaVivo) => t(`envivo.tipos.${claveTipoFila(f)}`);

  const columnas: ColumnaTabla<FilaVivo>[] = [
    { id: 'persona', encabezado: t('envivo.columnas.persona'), celda: (f) => <CeldaPersona p={f} /> },
    {
      id: 'hora',
      encabezado: t('envivo.columnas.hora'),
      celda: (f) => <span className="whitespace-nowrap tabular-nums">{hora(f.hora)}</span>,
    },
    {
      id: 'marca',
      encabezado: t('envivo.columnas.marca'),
      ocultarDebajo: 'md',
      celda: (f) => <span className="whitespace-nowrap">{textoTipo(f)}</span>,
    },
    {
      id: 'metodo',
      encabezado: t('envivo.columnas.metodo'),
      celda: (f) => <MetodoConIcono metodo={f.metodoFila} />,
    },
    {
      id: 'punto',
      encabezado: t('envivo.columnas.punto'),
      ocultarDebajo: 'lg',
      celda: (f) => <span className="block max-w-[220px] truncate">{textoPunto(f)}</span>,
    },
    {
      id: 'verificacion',
      encabezado: t('envivo.columnas.verificacion'),
      celda: (f) => <InsigniaVerificacion v={verificacionFila(f)} />,
    },
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

  const ind = datos?.indicadores;
  const sinConexion = ind ? Math.max(0, ind.pantallas - ind.pantallas_en_linea) : 0;

  return (
    <>
      {ind && (
        <KpiStrip etiqueta={t('envivo.resumen')}>
          <StatCard
            etiqueta={t('envivo.kpi.marcaron')}
            valor={ind.con_turno > 0 ? t('envivo.kpi.deTotal', { n: ind.marcaron, total: ind.con_turno }) : String(ind.marcaron)}
            detalle={ind.sin_marcar > 0 ? t('envivo.kpi.sinMarcar', { n: ind.sin_marcar }) : t('envivo.kpi.todosMarcaron')}
            tono="exito"
            tendencia={ind.sin_marcar > 0 ? 'sube' : undefined}
          />
          <StatCard
            etiqueta={t('envivo.kpi.porRevisar')}
            valor={String(ind.por_revisar)}
            detalle={ind.por_revisar > 0 && motivos.length > 0 ? motivos.map((m) => t(`envivo.kpi.motivos.${m}`)).join(', ') : t('envivo.kpi.nadaPorRevisar')}
            tono={ind.por_revisar > 0 ? 'advertencia' : 'neutro'}
            iconoDetalle={ind.por_revisar > 0 ? TriangleAlert : undefined}
            onClick={ind.por_revisar > 0 ? () => setVerificacion('por_revisar') : undefined}
          />
          <StatCard
            etiqueta={t('envivo.kpi.pantallas')}
            valor={ind.pantallas > 0 ? t('envivo.kpi.deTotal', { n: ind.pantallas_en_linea, total: ind.pantallas }) : '0'}
            detalle={
              ind.pantallas === 0
                ? t('envivo.kpi.sinPantallas')
                : sinConexion > 0
                  ? t('envivo.kpi.pantallasSinConexion', { n: sinConexion })
                  : t('envivo.kpi.pantallasTodas')
            }
            tono={sinConexion > 0 ? 'peligro' : 'neutro'}
            tendencia={sinConexion > 0 ? 'baja' : undefined}
            onClick={() => router.push(`${RUTA_MARCACION}?vista=dispositivos`)}
          />
          <StatCard etiqueta={t('envivo.kpi.sinSenal')} valor={String(ind.sin_senal)} detalle={t('envivo.kpi.sinSenalDetalle')} />
        </KpiStrip>
      )}

      {datos && porMetodo.length > 0 && (
        <section aria-labelledby="marcacion-por-metodo" className="rounded-xl border border-line bg-surface p-4">
          <h2 id="marcacion-por-metodo" className="mb-3 text-[13px] font-medium text-fg">
            {t('envivo.porMetodo')}
          </h2>
          <div className="flex flex-wrap gap-2">
            {porMetodo.map(({ metodo: m, n }) => {
              const Icono = iconoMetodo(m);
              const activo = metodo === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => setMetodo(activo ? null : m)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
                    activo
                      ? 'border-brand bg-brand-tint text-brand-deep'
                      : m === 'manual'
                        ? 'border-line-warning bg-warning-subtle text-warning-text hover:bg-hover'
                        : 'border-line bg-subtle text-fg hover:bg-hover'
                  )}
                >
                  <Icono className="size-3.5" aria-hidden="true" />
                  {t('envivo.chipMetodo', { metodo: tm(m), n })}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {ind && sinConexion > 0 && (
        <AvisoTonal
          tono="neutro"
          titulo={t('envivo.avisoPantallas.titulo', { n: sinConexion })}
          descripcion={t('envivo.avisoPantallas.descripcion')}
          accion={{ etiqueta: t('envivo.avisoPantallas.accion'), href: `${RUTA_MARCACION}?vista=dispositivos` }}
        />
      )}

      {carga.estado !== 'sinPermiso' && (carga.estado !== 'listo' || todas.length > 0 || chips.length > 0) && (
        <ListToolbar
          busqueda={
            <SearchInput
              value={texto}
              onChange={setTexto}
              cargando={carga.estado === 'cargando'}
              placeholder={t('envivo.buscar')}
              etiqueta={t('envivo.buscar')}
            />
          }
          filtros={
            <FilterPanel conteo={chips.length} onLimpiar={limpiar} textoVerResultados={t('filtros.verMarcas', { n: filas.length })}>
              <FormField etiqueta={t('filtros.metodo')}>
                {(c) => (
                  <Select value={metodo ?? '__todos'} onValueChange={(v) => setMetodo(v === '__todos' ? null : (v as MetodoFila))}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__todos">{t('filtros.todos')}</SelectItem>
                      {metodos.map((m) => (
                        <SelectItem key={m} value={m}>
                          {tm(m)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('filtros.verificacion')}>
                {(c) => (
                  <Select value={verificacion ?? '__todos'} onValueChange={(v) => setVerificacion(v === '__todos' ? null : (v as GrupoVerificacion))}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__todos">{t('filtros.todos')}</SelectItem>
                      {GRUPOS_VERIFICACION.map((g) => (
                        <SelectItem key={g} value={g}>
                          {t(`filtros.grupos.${g}`)}
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
              <FilterChips chips={chips} onQuitar={(c) => (c === 'metodo' ? setMetodo(null) : setVerificacion(null))} onLimpiarTodo={limpiar} />
            ) : undefined
          }
        />
      )}

      <DataTable
        etiqueta={t('envivo.tabla')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => f.clave}
        estado={estadoTabla}
        onFilaClick={irHoja}
        etiquetaFila={(f) => t('envivo.etiquetaFila', { nombre: f.nombre, marca: textoTipo(f).toLocaleLowerCase(), hora: hora(f.hora) })}
        acciones={accionesDe}
        tarjetaMovil={(f) => (
          <ListCard
            avatar={{ nombre: f.nombre }}
            titulo={f.nombre}
            subtitulo={t('envivo.movilMarca', { marca: textoTipo(f), hora: hora(f.hora), metodo: tm(f.metodoFila) })}
            meta={textoPunto(f)}
            estado={<InsigniaVerificacion v={verificacionFila(f)} corta />}
            onClick={() => irHoja(f)}
            acciones={accionesDe(f)}
          />
        )}
        vacio={{
          titulo: t('envivo.vacio.titulo'),
          descripcion: t('envivo.vacio.descripcion'),
          icono: AlarmClockCheck,
          accion: { etiqueta: t('envivo.vacio.accion'), href: `${RUTA_MARCACION}?vista=metodos`, icono: Settings },
        }}
        sinResultados={{
          titulo: t('envivo.sinResultados.titulo'),
          descripcion: t('envivo.sinResultados.descripcion'),
          icono: AlarmClockCheck,
        }}
        error={{
          titulo: t('envivo.error.titulo'),
          descripcion: t('envivo.error.descripcion'),
          icono: CalendarCheck,
        }}
        sinPermiso={{
          titulo: t('sinPermiso.titulo'),
          descripcion: t('sinPermiso.descripcion'),
          accion: { etiqueta: t('comun.irAlInicio'), href: '/app/inicio', icono: House },
        }}
        onLimpiarFiltros={() => {
          limpiar();
          setTexto('');
        }}
        onReintentar={() => void recargar()}
        termino={texto}
      />

      <DialogoFotoEvidencia eventoId={foto?.id ?? null} nombre={foto?.nombre ?? ''} onCerrar={() => setFoto(null)} />

      {datos && (
        <DialogoAjuste
          abierto={ajustar !== null}
          onAbiertoChange={(a) => !a && setAjustar(null)}
          zona={datos.zona}
          fecha={datos.fecha}
          personas={ajustar ? [{ employment_id: ajustar.employment_id, nombre: ajustar.nombre }] : []}
          marcaInicial={ajustar?.clase === 'marca' ? marcaParaAjuste(ajustar.tipo) : 'check_in'}
          onEnviado={() => void recargar()}
        />
      )}
    </>
  );
}
