'use client';

/**
 * Programación semanal por sede y equipo (Figma 20.8.1–20.8.6 y 20.8.10–20.8.15).
 *
 * - Escritorio: `DataTable` con una columna por día y el `BloqueTurno` de cada
 *   celda; el bloque abre su menú (`RowActionsMenu` con disparador propio).
 * - Celular: chips de día y una `ListCard` por persona con el turno de ese día.
 * - Cruces y topes salen de `POST /api/hrm/turnos/validar` (la base). Un cruce
 *   impide publicar; superar un tope deja publicar con motivo y crea una
 *   novedad (decisión 4). Publicar avisa a cada persona.
 * - La sede la fija el selector del header (PATRONES §9): nunca un filtro aquí.
 * - Quien no gestiona asistencia (el jefe) ve lo publicado de su equipo, sin menú.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Copy,
  CopyPlus,
  Download,
  Info,
  LayoutTemplate,
  Megaphone,
  Pencil,
  Plus,
  Printer,
  Repeat,
  Settings,
  Trash2,
} from 'lucide-react';
import {
  AvatarIniciales,
  AvisoTonal,
  ChipsOpcion,
  ConfirmDialog,
  DataTable,
  DialogoMotivo,
  EmptyState,
  FilterChips,
  FilterPanel,
  FormField,
  ListCard,
  ListToolbar,
  RowActionsMenu,
  SearchInput,
  SegmentedControl,
  clasesBoton,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays, DEFAULT_TIMEZONE } from '@/lib/utils/dateCore';
import {
  FILTROS_INICIALES,
  celdasDe,
  csvSemana,
  diasDeSemana,
  filtrarPersonas,
  filtrosActivos,
  indexarSemana,
  lunesDe,
  minutosDePersona,
  partesHoras,
  resumenHallazgos,
  tonoHoras,
  type AsignacionSemana,
  type FiltrosProgramacion,
  type PersonaSemana,
  type RespuestaSemana,
  type Validacion,
} from '@/lib/hrm/turnos/programacion';
import { BloqueTurno } from './BloqueTurno';
import { DialogoAplicarRotacion, DialogoIntercambio, DialogoRevisar, DialogoTurno } from './DialogosTurno';
import { enviar, pedir, useCarga, useMensajeErrorTurnos } from './apiTurnos';
import { useFormatoHora } from './formatoHora';

const TODOS = '__todos__';

export interface CabeceraProgramacion {
  subtitulo: string | undefined;
  acciones: React.ReactNode;
  accionMovil: React.ReactNode;
  cargando: boolean;
  sinPermiso: boolean;
}

export interface ProgramacionSemanaProps {
  lunes: string;
  onLunesChange: (lunes: string) => void;
  hoy: string;
  /** La página pinta la cabecera (`PageHeader`) con lo que esta vista le pasa. */
  onCabecera: (c: CabeceraProgramacion) => void;
  selector: React.ReactNode;
  /** Solo lectura (vista del jefe): sin menú, sin publicar. */
  soloLectura?: boolean;
}

type Edicion =
  | { tipo: 'turno'; modo: 'horario' | 'plantilla' | 'nuevo'; persona: PersonaSemana; fecha: string; asignacion: AsignacionSemana | null }
  | { tipo: 'intercambio'; asignacion: AsignacionSemana }
  | { tipo: 'quitar'; asignacion: AsignacionSemana; persona: PersonaSemana }
  | null;

export function ProgramacionSemana({ lunes, onLunesChange, hoy, onCabecera, selector, soloLectura = false }: ProgramacionSemanaProps) {
  const t = useTranslations('hrmTurnos.programacion');
  const tb = useTranslations('hrmTurnos.bloque');
  const f = useFormatoHora();
  const { formatDateTime } = useFormatDate();
  const mensaje = useMensajeErrorTurnos();
  const sede = useBranchOpcional()?.branchFilter ?? null;
  const dias = useMemo(() => diasDeSemana(lunes), [lunes]);
  const hasta = dias[6];
  const url = `/api/hrm/turnos?desde=${lunes}&hasta=${hasta}${sede ? `&sede=${sede}` : ''}`;
  const { carga, recargar } = useCarga<RespuestaSemana>(url);
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const zona = datos?.zona ?? DEFAULT_TIMEZONE;
  const gestiona = !soloLectura && !!datos?.permisos.gestionar;

  const [validacion, setValidacion] = useState<Validacion | null>(null);
  const [filtros, setFiltros] = useState<FiltrosProgramacion>(FILTROS_INICIALES);
  const [dia, setDia] = useState<string>(dias.includes(hoy) ? hoy : dias[0]);
  const [edicion, setEdicion] = useState<Edicion>(null);
  const [revisar, setRevisar] = useState(false);
  const [confirmar, setConfirmar] = useState<'simple' | 'motivo' | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [aplicarRotacion, setAplicarRotacion] = useState(false);
  const [rotaciones, setRotaciones] = useState<Array<{ id: string; nombre: string; activa: boolean }>>([]);
  const [recienPublicada, setRecienPublicada] = useState<number | null>(null);
  const [editando, setEditando] = useState(false);

  useEffect(() => setDia(dias.includes(hoy) ? hoy : dias[0]), [dias, hoy]);
  useEffect(() => {
    setRecienPublicada(null);
    setEditando(false);
  }, [lunes]);

  // Cruces y topes: los decide la base (fn_hr_turnos_validar).
  const validar = useCallback(async () => {
    if (!datos?.permisos.ver_borradores || soloLectura || datos.asignaciones.length === 0) {
      setValidacion(null);
      return;
    }
    try {
      setValidacion(await pedir<Validacion>('/api/hrm/turnos/validar', { metodo: 'POST', cuerpo: { desde: lunes, hasta } }));
    } catch {
      setValidacion(null);
    }
  }, [datos, lunes, hasta, soloLectura]);
  useEffect(() => {
    void validar();
  }, [validar]);

  const recargarTodo = useCallback(async () => {
    await recargar();
  }, [recargar]);

  const indice = useMemo(() => indexarSemana(datos ?? { asignaciones: [], ausencias: [], festivos: [] }, validacion), [datos, validacion]);
  const personas = useMemo(() => (datos ? filtrarPersonas(datos, dias, indice, filtros) : []), [datos, dias, indice, filtros]);
  const resumen = resumenHallazgos(validacion);
  const borradores = datos?.borradores ?? 0;
  const publicada = !!datos?.publicada_en && borradores === 0;
  const personasConBorrador = useMemo(
    () => new Set((datos?.asignaciones ?? []).filter((a) => a.borrador).map((a) => a.employment_id)).size,
    [datos]
  );
  const areas = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of datos?.personas ?? []) if (p.area_id && p.area) m.set(p.area_id, p.area);
    return Array.from(m, ([id, nombre]) => ({ id, nombre }));
  }, [datos]);
  const cargos = useMemo(() => Array.from(new Set((datos?.personas ?? []).map((p) => p.cargo).filter((c): c is string => !!c))).sort(), [datos]);
  const nombreArea = (id: string | null) => areas.find((a) => a.id === id)?.nombre ?? '';
  const editable = gestiona && (!publicada || editando);

  // ─── Acciones ──────────────────────────────────────────────────────────────
  const copiar = useCallback(
    async (origen: string, destino: string) => {
      try {
        const r = await enviar<{ creados: number; omitidos: unknown[] }>('/api/hrm/turnos/copiar', 'POST', { origen, destino, dias: 7, sede });
        toast.success(t('copiada', { n: r.creados, omitidos: r.omitidos.length }));
        if (destino === lunes) await recargarTodo();
        else onLunesChange(destino);
      } catch (e) {
        toast.error(mensaje(e));
      }
    },
    [lunes, mensaje, onLunesChange, recargarTodo, sede, t]
  );

  const deshacer = useCallback(async () => {
    try {
      await enviar('/api/hrm/turnos/deshacer', 'POST', { desde: lunes, hasta });
      toast.success(t('deshecha'));
      setRecienPublicada(null);
      await recargarTodo();
    } catch (e) {
      toast.error(mensaje(e));
    }
  }, [hasta, lunes, mensaje, recargarTodo, t]);

  const publicar = useCallback(
    async (motivo?: string) => {
      setPublicando(true);
      try {
        const r = await enviar<Validacion>('/api/hrm/turnos/publicar', 'POST', { desde: lunes, hasta, aceptar_alertas: true, motivo });
        if (!r.publicado) {
          setValidacion(r);
          if (r.bloqueos.length) setRevisar(true);
          else if (r.requiere_motivo) setConfirmar('motivo');
          return;
        }
        setConfirmar(null);
        setRecienPublicada(personasConBorrador);
        toast.success(t('publicada.toastTitulo'), {
          description: t('publicada.toastDescripcion', { n: personasConBorrador }),
          action: { label: t('publicada.deshacer'), onClick: () => void deshacer() },
          duration: 10_000,
        });
        await recargarTodo();
      } catch (e) {
        toast.error(mensaje(e));
      } finally {
        setPublicando(false);
      }
    },
    [deshacer, hasta, lunes, mensaje, personasConBorrador, recargarTodo, t]
  );

  const iniciarPublicacion = useCallback(() => {
    if (resumen.cruces > 0) setRevisar(true);
    else setConfirmar(resumen.topes > 0 ? 'motivo' : 'simple');
  }, [resumen.cruces, resumen.topes]);

  const exportar = useCallback(() => {
    if (!datos) return;
    const csv = csvSemana(personas, dias, datos.asignaciones, {
      persona: t('columnas.persona'),
      horas: t('columnas.horas'),
      descanso: tb('descanso'),
      dia: (d) => f.diaCorto(d),
    });
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `turnos-${lunes}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [datos, dias, f, lunes, personas, t, tb]);

  const quitar = useCallback(
    async (a: AsignacionSemana) => {
      try {
        await enviar(`/api/hrm/turnos/${a.id}`, 'DELETE');
        toast.success(t('quitado'));
        setEdicion(null);
        await recargarTodo();
      } catch (e) {
        toast.error(mensaje(e));
      }
    },
    [mensaje, recargarTodo, t]
  );

  const guardarDirecto = useCallback(
    async (cuerpo: Record<string, unknown>, ok: string) => {
      try {
        await enviar('/api/hrm/turnos', 'POST', cuerpo);
        toast.success(ok);
        await recargarTodo();
      } catch (e) {
        toast.error(mensaje(e));
      }
    },
    [mensaje, recargarTodo]
  );

  const copiarAlResto = useCallback(
    async (a: AsignacionSemana) => {
      const resto = dias.filter((d) => d > a.fecha);
      let errores = 0;
      for (const d of resto) {
        if (indice.porPersonaDia.get(`${a.employment_id}|${d}`)?.length) continue;
        try {
          await enviar('/api/hrm/turnos', 'POST', {
            employment_id: a.employment_id,
            fecha: d,
            plantilla_id: a.plantilla_id,
            hora_inicio: a.plantilla_id ? null : a.hora_inicio,
            hora_fin: a.plantilla_id ? null : a.hora_fin,
            descanso_min: a.plantilla_id ? null : a.descanso_min,
            dia_descanso: a.dia_descanso,
          });
        } catch {
          errores++;
        }
      }
      if (errores) toast.error(t('copiaParcial', { n: errores }));
      else toast.success(t('copiadoResto'));
      await recargarTodo();
    },
    [dias, indice, recargarTodo, t]
  );

  const accionesCelda = useCallback(
    (p: PersonaSemana, fecha: string, a: AsignacionSemana | null): AccionFila[] => {
      if (!editable) return [];
      if (!a) {
        return [
          { id: 'asignar', etiqueta: t('menu.asignar'), icono: Plus, onSelect: () => setEdicion({ tipo: 'turno', modo: 'nuevo', persona: p, fecha, asignacion: null }) },
          {
            id: 'descanso',
            etiqueta: t('menu.marcarDescanso'),
            icono: Coffee,
            onSelect: () => void guardarDirecto({ employment_id: p.id, fecha, dia_descanso: true }, t('descansoMarcado')),
          },
        ];
      }
      return [
        { id: 'horario', etiqueta: t('menu.cambiarHorario'), icono: Pencil, onSelect: () => setEdicion({ tipo: 'turno', modo: 'horario', persona: p, fecha, asignacion: a }) },
        { id: 'plantilla', etiqueta: t('menu.otraPlantilla'), icono: LayoutTemplate, onSelect: () => setEdicion({ tipo: 'turno', modo: 'plantilla', persona: p, fecha, asignacion: a }) },
        {
          id: 'descanso',
          etiqueta: t('menu.marcarDescanso'),
          icono: Coffee,
          oculta: a.dia_descanso,
          onSelect: () => void guardarDirecto({ employment_id: p.id, fecha, dia_descanso: true }, t('descansoMarcado')),
        },
        { id: 'resto', etiqueta: t('menu.copiarResto'), icono: CopyPlus, oculta: fecha >= dias[6], onSelect: () => void copiarAlResto(a) },
        { id: 'cambiar', etiqueta: t('menu.cambiarPersona'), icono: ArrowLeftRight, onSelect: () => setEdicion({ tipo: 'intercambio', asignacion: a }) },
        { id: 'quitar', etiqueta: t('menu.quitar'), icono: Trash2, destructiva: true, onSelect: () => setEdicion({ tipo: 'quitar', asignacion: a, persona: p }) },
      ];
    },
    [copiarAlResto, dias, editable, guardarDirecto, t]
  );

  // ─── Cabecera (la pinta la página) ─────────────────────────────────────────
  const conAsignaciones = (datos?.asignaciones.length ?? 0) > 0;
  const subtitulo = datos
    ? [
        t('subtitulo.semana', { rango: f.rango(lunes, hasta) }),
        conAsignaciones
          ? t('subtitulo.personas', {
              n: new Set(datos.asignaciones.map((a) => a.employment_id)).size,
              areas: Array.from(new Set(datos.personas.filter((p) => datos.asignaciones.some((a) => a.employment_id === p.id)).map((p) => p.area).filter(Boolean))).join(t('y')),
            })
          : null,
        !conAsignaciones
          ? t('subtitulo.sinTurnos')
          : borradores > 0
            ? t('subtitulo.borrador')
            : datos.publicada_en
              ? t('subtitulo.publicada', { cuando: formatDateTime(datos.publicada_en) })
              : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  const menuCabecera: AccionFila[] = [
    { id: 'imprimir', etiqueta: t('menuCabecera.imprimir'), icono: Printer, onSelect: () => window.print() },
    { id: 'csv', etiqueta: t('menuCabecera.csv'), icono: Download, onSelect: exportar },
    {
      id: 'rotacion',
      etiqueta: t('menuCabecera.aplicarRotacion'),
      icono: Repeat,
      oculta: !gestiona,
      onSelect: () => {
        void cargarRotaciones(setRotaciones);
        setAplicarRotacion(true);
      },
    },
    {
      id: 'topes',
      etiqueta: t('menuCabecera.topes'),
      descripcion: t('menuCabecera.topesDescripcion'),
      icono: Settings,
      separadorAntes: true,
      onSelect: () => window.location.assign('/app/configuracion?seccion=rrhh-parametros'),
    },
  ];

  const acciones = !datos ? null : !gestiona ? (
    <RowActionsMenu orientacion="horizontal" tamano="md" acciones={menuCabecera} />
  ) : publicada && !editando ? (
    <>
      <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => void copiar(lunes, addPlainDays(lunes, 7))}>
        <Copy aria-hidden className="size-4" strokeWidth={1.5} />
        {t('copiarSiguiente')}
      </button>
      <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => setEditando(true)}>
        <Pencil aria-hidden className="size-4" strokeWidth={1.5} />
        {t('editarSemana')}
      </button>
      <RowActionsMenu orientacion="horizontal" tamano="md" acciones={menuCabecera} />
    </>
  ) : (
    <>
      {conAsignaciones && (
        <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => void copiar(addPlainDays(lunes, -7), lunes)}>
          <Copy aria-hidden className="size-4" strokeWidth={1.5} />
          {t('copiarAnterior')}
        </button>
      )}
      <button
        type="button"
        className={clasesBoton({ variante: 'primario' })}
        disabled={borradores === 0 || publicando}
        title={borradores === 0 ? t('nadaQuePublicar') : undefined}
        onClick={iniciarPublicacion}
      >
        <Megaphone aria-hidden className="size-4" strokeWidth={1.5} />
        {t('publicar')}
      </button>
      {conAsignaciones && <RowActionsMenu orientacion="horizontal" tamano="md" acciones={menuCabecera} />}
    </>
  );

  useEffect(() => {
    onCabecera({
      subtitulo,
      acciones,
      accionMovil: null,
      cargando: carga.estado === 'cargando',
      sinPermiso: carga.estado === 'sinPermiso',
    });
    // `acciones` cambia con lo que la decide; basta con estas dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtitulo, carga.estado, gestiona, publicada, editando, borradores, publicando, conAsignaciones, resumen.cruces, resumen.topes, lunes]);

  // ─── Filtros ───────────────────────────────────────────────────────────────
  const n = filtrosActivos(filtros);
  const chips: ChipFiltro[] = [
    filtros.area ? { clave: 'area', etiqueta: t('filtros.chipArea', { area: nombreArea(filtros.area) }) } : null,
    filtros.cargo ? { clave: 'cargo', etiqueta: filtros.cargo } : null,
    filtros.mostrar !== 'todo' ? { clave: 'mostrar', etiqueta: t(`filtros.${filtros.mostrar}`) } : null,
    filtros.estado !== 'todos' ? { clave: 'estado', etiqueta: t('filtros.borrador') } : null,
    filtros.plantilla ? { clave: 'plantilla', etiqueta: datos?.plantillas.find((p) => p.id === filtros.plantilla)?.nombre ?? '' } : null,
  ].filter((c): c is ChipFiltro => !!c);
  const quitarChip = (clave: string) =>
    setFiltros((x) => ({
      ...x,
      ...(clave === 'area' ? { area: null } : {}),
      ...(clave === 'cargo' ? { cargo: null } : {}),
      ...(clave === 'mostrar' ? { mostrar: 'todo' } : {}),
      ...(clave === 'estado' ? { estado: 'todos' } : {}),
      ...(clave === 'plantilla' ? { plantilla: null } : {}),
    }));

  const panelFiltros = (
    <FilterPanel
      conteo={n}
      onLimpiar={() => setFiltros({ ...FILTROS_INICIALES, texto: filtros.texto })}
      textoVerResultados={t('filtros.ver', { n: personas.length })}
      nota={t('filtros.nota')}
    >
      <FormField etiqueta={t('filtros.equipo')}>
        {(c) => (
          <Select value={filtros.area ?? TODOS} onValueChange={(v) => setFiltros((x) => ({ ...x, area: v === TODOS ? null : v }))}>
            <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>{t('filtros.todos')}</SelectItem>
              {areas.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      <FormField etiqueta={t('filtros.cargo')}>
        {(c) => (
          <Select value={filtros.cargo ?? TODOS} onValueChange={(v) => setFiltros((x) => ({ ...x, cargo: v === TODOS ? null : v }))}>
            <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>{t('filtros.todos')}</SelectItem>
              {cargos.map((x) => (
                <SelectItem key={x} value={x}>
                  {x}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      <FormField etiqueta={t('filtros.mostrar')}>
        {(c) => (
          <SegmentedControl
            aria-labelledby={c.idEtiqueta}
            anchoCompleto
            valor={filtros.mostrar}
            onValorChange={(v) => setFiltros((x) => ({ ...x, mostrar: v }))}
            opciones={[
              { valor: 'todo', etiqueta: t('filtros.todo') },
              { valor: 'cruces', etiqueta: t('filtros.cruces') },
              { valor: 'topes', etiqueta: t('filtros.topes') },
            ]}
          />
        )}
      </FormField>
      <FormField etiqueta={t('filtros.estado')}>
        {(c) => (
          <SegmentedControl
            aria-labelledby={c.idEtiqueta}
            anchoCompleto
            valor={filtros.estado}
            onValorChange={(v) => setFiltros((x) => ({ ...x, estado: v }))}
            opciones={[
              { valor: 'todos', etiqueta: t('filtros.todos') },
              { valor: 'borrador', etiqueta: t('filtros.borrador') },
            ]}
          />
        )}
      </FormField>
      <FormField etiqueta={t('filtros.plantilla')}>
        {(c) => (
          <Select value={filtros.plantilla ?? TODOS} onValueChange={(v) => setFiltros((x) => ({ ...x, plantilla: v === TODOS ? null : v }))}>
            <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>{t('filtros.todas')}</SelectItem>
              {(datos?.plantillas ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      {(['incluirAusencias', 'incluirDescansos', 'soloConTurno'] as const).map((k) => (
        <label key={k} className="flex min-h-9 cursor-pointer items-center gap-3 text-sm text-fg">
          <Checkbox checked={filtros[k]} onCheckedChange={(v) => setFiltros((x) => ({ ...x, [k]: v === true }))} />
          {t(`filtros.${k}`)}
        </label>
      ))}
    </FilterPanel>
  );

  // ─── Tabla ─────────────────────────────────────────────────────────────────
  const etiquetaDia = (d: string) => {
    const fest = indice.festivos.get(d);
    return fest ? `${f.diaCorto(d)} · ${t('festivo')}` : f.diaCorto(d);
  };
  const celdaDia = (p: PersonaSemana, d: string) => {
    const celdas = celdasDe(indice, p.id, d, datos?.asignaciones ?? []);
    const minutos = minutosDePersona(datos?.asignaciones ?? [], p.id, dias);
    return (
      <div className="flex flex-col gap-1">
        {celdas.map((c, i) => {
          const bloque = <BloqueTurno celda={c} zona={zona} minutosSemana={minutos} vistaJefe={!datos?.permisos.ausencias_org} />;
          const acciones = c.tipo === 'ausencia' ? [] : accionesCelda(p, d, c.asignacion);
          if (acciones.length === 0) return <div key={i}>{bloque}</div>;
          return (
            <RowActionsMenu
              key={i}
              acciones={acciones}
              titulo={t('turnoDe', { nombre: p.nombre.split(' ')[0], dia: f.diaCorto(d).toLowerCase() })}
              disparador={{ contenido: bloque, etiqueta: t('turnoDe', { nombre: p.nombre, dia: f.diaLargo(d) }) }}
            />
          );
        })}
      </div>
    );
  };
  const insigniaHoras = (p: PersonaSemana) => {
    const m = minutosDePersona(datos?.asignaciones ?? [], p.id, dias);
    const { h, m: mi } = partesHoras(m);
    const tono = tonoHoras(p.id, indice, lunes);
    return (
      <Badge tono={tono} apariencia={tono === 'neutro' ? 'suave' : 'contorno'} tamano="sm">
        {mi ? t('horasMin', { h, m: mi }) : t('horas', { h })}
      </Badge>
    );
  };
  const columnas: ColumnaTabla<PersonaSemana>[] = [
    {
      id: 'persona',
      encabezado: t('columnas.persona'),
      ancho: 240,
      celda: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <AvatarIniciales nombre={p.nombre} tamano="md" />
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{p.nombre}</p>
            <p className="truncate text-xs text-fg-secondary">{[p.cargo, p.area].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
      ),
    },
    ...dias.map<ColumnaTabla<PersonaSemana>>((d) => ({ id: d, encabezado: etiquetaDia(d), ancho: 141, celda: (p) => celdaDia(p, d) })),
    { id: 'horas', encabezado: t('columnas.horas'), ancho: 84, celda: insigniaHoras },
  ];

  // ─── Estados ───────────────────────────────────────────────────────────────
  if (carga.estado === 'sinPermiso') {
    return (
      <EmptyState
        variante="forbidden"
        titulo={t('sinPermiso.titulo')}
        descripcion={t('sinPermiso.descripcion')}
        accion={{ etiqueta: t('irInicio'), href: '/app/inicio' }}
      />
    );
  }

  const vacia = !!datos && datos.asignaciones.length === 0;
  const estadoTabla =
    carga.estado === 'cargando' ? 'cargando' : carga.estado === 'error' || carga.estado === 'noExiste' ? 'error' : personas.length === 0 ? 'sinResultados' : 'listo';

  const navegador = (
    <div className="flex items-center gap-2">
      <button type="button" aria-label={t('semanaAnterior')} className={clasesBoton({ variante: 'secundario', className: 'w-10 px-0' })} onClick={() => onLunesChange(addPlainDays(lunes, -7))}>
        <ChevronLeft aria-hidden className="size-4" strokeWidth={1.5} />
      </button>
      <span className="min-w-36 text-center text-sm font-medium text-fg tabular-nums">{f.rango(lunes, hasta)}</span>
      <button type="button" aria-label={t('semanaSiguiente')} className={clasesBoton({ variante: 'secundario', className: 'w-10 px-0' })} onClick={() => onLunesChange(addPlainDays(lunes, 7))}>
        <ChevronRight aria-hidden className="size-4" strokeWidth={1.5} />
      </button>
      {!dias.includes(hoy) && (
        <button type="button" className={clasesBoton({ variante: 'fantasma' })} onClick={() => onLunesChange(lunesDe(hoy))}>
          {t('estaSemana')}
        </button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {selector}
        <div className="hidden lg:block">{navegador}</div>
      </div>

      {vacia ? (
        <EmptyState
          variante="empty"
          icono={CalendarRange}
          titulo={t('vacio.titulo')}
          descripcion={t('vacio.descripcion')}
          accion={gestiona ? { etiqueta: t('copiarAnterior'), onClick: () => void copiar(addPlainDays(lunes, -7), lunes), icono: Copy } : undefined}
          accionSecundaria={
            gestiona
              ? {
                  etiqueta: t('aplicarRotacion'),
                  onClick: () => {
                    void cargarRotaciones(setRotaciones);
                    setAplicarRotacion(true);
                  },
                  icono: Repeat,
                }
              : undefined
          }
        />
      ) : carga.estado === 'error' ? (
        <EmptyState variante="error" titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={() => void recargar()} />
      ) : (
        <>
          <ChipsOpcion
            className="flex-nowrap overflow-x-auto pb-1 lg:hidden [scrollbar-width:none]"
            etiqueta={t('dia')}
            valor={dia}
            onValorChange={setDia}
            opciones={dias.map((d) => ({ valor: d, etiqueta: f.diaCorto(d) }))}
          />
          <ListToolbar
            busqueda={
              <SearchInput
                value={filtros.texto}
                onChange={(v) => setFiltros((x) => ({ ...x, texto: v }))}
                placeholder={t('buscar')}
                etiqueta={t('buscar')}
                debounceMs={200}
              />
            }
            filtros={panelFiltros}
            chips={chips.length ? <FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={() => setFiltros({ ...FILTROS_INICIALES, texto: filtros.texto })} /> : undefined}
          />

          {gestiona && (resumen.cruces > 0 || resumen.topes > 0) && borradores > 0 ? (
            <AvisoTonal
              tono="advertencia"
              icono={AlertTriangle}
              titulo={resumen.cruces > 0 ? t('aviso.revisa', { cruces: resumen.cruces, topes: resumen.topes }) : t('aviso.soloTopes', { n: resumen.topes })}
              descripcion={resumen.cruces > 0 ? t('aviso.revisaDescripcion') : t('aviso.soloTopesDescripcion')}
              accion={{ etiqueta: t('aviso.revisar'), onClick: () => setRevisar(true) }}
            />
          ) : recienPublicada !== null || (publicada && gestiona) ? (
            <AvisoTonal
              tono="informacion"
              icono={Info}
              titulo={recienPublicada !== null ? t('aviso.publicada', { n: recienPublicada }) : t('aviso.publicadaAntes')}
              descripcion={t('aviso.publicadaDescripcion')}
            />
          ) : null}

          <DataTable
            etiqueta={t('tabla', { rango: f.rango(lunes, hasta) })}
            columnas={columnas}
            filas={personas}
            obtenerId={(p) => p.id}
            estado={estadoTabla}
            densidad="comoda"
            tarjetaMovil={(p) => {
              const celdas = celdasDe(indice, p.id, dia, datos?.asignaciones ?? []);
              const c = celdas[0];
              const a = c?.asignacion ?? null;
              const titulo =
                c?.tipo === 'ausencia'
                  ? c.ausencia?.clase === 'incapacidad' && !c.ausencia.etiqueta
                    ? datos?.permisos.ausencias_org
                      ? tb('ausenteIncapacidad')
                      : tb('ausenciaJustificada')
                    : `${c.ausencia?.etiqueta ?? tb('ausencia')} ${c.ausencia?.estado === 'requested' ? tb('solicitada').toLowerCase() : tb('aprobada').toLowerCase()}`
                  : !a
                    ? t('sinTurno')
                    : a.dia_descanso
                      ? tb('descanso')
                      : celdas
                          .map((x) => `${x.asignacion?.plantilla ?? tb('personalizado')} · ${f.hora(x.asignacion?.inicio, zona)} – ${f.hora(x.asignacion?.fin, zona)}`)
                          .join(t('y'));
              const estado =
                c?.tipo === 'cruce' ? (
                  <Badge tono="peligro" apariencia="contorno" tamano="sm">{t('estado.cruce')}</Badge>
                ) : c?.tipo === 'tope' ? (
                  <Badge tono="advertencia" apariencia="contorno" tamano="sm">{t('estado.tope')}</Badge>
                ) : c?.tipo === 'ausencia' ? (
                  <Badge tono="informacion" apariencia="contorno" tamano="sm">{t('estado.ausente')}</Badge>
                ) : a && !a.dia_descanso ? (
                  <Badge tono="neutro" tamano="sm">{t('horas', { h: partesHoras(a.minutos ?? 0).h })}</Badge>
                ) : undefined;
              return (
                <ListCard
                  avatar={{ nombre: p.nombre }}
                  titulo={p.nombre}
                  subtitulo={titulo}
                  meta={[p.cargo, p.area].filter(Boolean).join(' · ')}
                  estado={estado}
                  acciones={c?.tipo === 'ausencia' ? undefined : accionesCelda(p, dia, a)}
                />
              );
            }}
            sinResultados={{ titulo: t('sinResultados.titulo'), descripcion: t('sinResultados.descripcion') }}
            error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
            onReintentar={() => void recargar()}
            onLimpiarFiltros={() => setFiltros(FILTROS_INICIALES)}
            termino={filtros.texto}
          />

          <p className="text-xs text-fg-secondary">
            {[borradores > 0 ? t('nota.borrador') : null, t('nota.nocturnas'), datos?.festivos.length ? t('nota.festivos', { dias: datos.festivos.map((x) => f.diaCorto(x.fecha).toLowerCase()).join(t('y')) }) : null]
              .filter(Boolean)
              .join(' ')}
          </p>

          {gestiona && borradores > 0 && (
            <div className="sticky bottom-20 lg:hidden">
              <button type="button" className={clasesBoton({ variante: 'primario', anchoCompleto: true })} onClick={iniciarPublicacion} disabled={publicando}>
                <Megaphone aria-hidden className="size-4" strokeWidth={1.5} />
                {t('publicar')}
              </button>
            </div>
          )}
        </>
      )}

      <div className="lg:hidden">{navegador}</div>

      {/* ─── Diálogos ─── */}
      <DialogoTurno
        abierto={edicion?.tipo === 'turno'}
        onAbiertoChange={(v) => !v && setEdicion(null)}
        modo={edicion?.tipo === 'turno' ? edicion.modo : 'nuevo'}
        persona={edicion?.tipo === 'turno' ? edicion.persona : null}
        fecha={edicion?.tipo === 'turno' ? edicion.fecha : null}
        asignacion={edicion?.tipo === 'turno' ? edicion.asignacion : null}
        plantillas={datos?.plantillas ?? []}
        onGuardado={() => void recargarTodo()}
      />
      <DialogoIntercambio
        abierto={edicion?.tipo === 'intercambio'}
        onAbiertoChange={(v) => !v && setEdicion(null)}
        asignacion={edicion?.tipo === 'intercambio' ? edicion.asignacion : null}
        personas={datos?.personas ?? []}
        asignaciones={datos?.asignaciones ?? []}
        zona={zona}
        onGuardado={() => void recargarTodo()}
      />
      <ConfirmDialog
        abierto={edicion?.tipo === 'quitar'}
        onAbiertoChange={(v) => !v && setEdicion(null)}
        titulo={t('quitar.titulo', { nombre: edicion?.tipo === 'quitar' ? edicion.persona.nombre : '' })}
        descripcion={edicion?.tipo === 'quitar' && !edicion.asignacion.borrador ? t('quitar.publicado') : t('quitar.borrador')}
        textoConfirmar={t('quitar.confirmar')}
        tono="peligro"
        icono={Trash2}
        onConfirmar={() => (edicion?.tipo === 'quitar' ? quitar(edicion.asignacion) : undefined)}
      />
      <DialogoRevisar
        abierto={revisar}
        onAbiertoChange={setRevisar}
        validacion={validacion}
        personas={datos?.personas ?? []}
        asignaciones={datos?.asignaciones ?? []}
        zona={zona}
        rango={f.rango(lunes, hasta)}
        onCorregir={() => {
          setRevisar(false);
          setFiltros((x) => ({ ...x, mostrar: 'cruces' }));
        }}
        onPublicar={() => {
          setRevisar(false);
          setConfirmar('motivo');
        }}
      />
      <ConfirmDialog
        abierto={confirmar === 'simple'}
        onAbiertoChange={(v) => !v && setConfirmar(null)}
        titulo={t('confirmar.titulo', { rango: f.rango(lunes, hasta), n: personasConBorrador })}
        descripcion={t('confirmar.descripcion')}
        textoConfirmar={t('publicar')}
        tono="marca"
        icono={Megaphone}
        cargando={publicando}
        onConfirmar={() => publicar()}
      />
      <DialogoMotivo
        abierto={confirmar === 'motivo'}
        onAbiertoChange={(v) => !v && setConfirmar(null)}
        titulo={t('confirmar.titulo', { rango: f.rango(lunes, hasta), n: personasConBorrador })}
        descripcion={t('confirmar.conTope')}
        etiquetaMotivo={t('confirmar.motivo')}
        placeholder={t('confirmar.placeholder')}
        textoConfirmar={t('publicar')}
        destructiva={false}
        cargando={publicando}
        minimo={5}
        onConfirmar={(m) => publicar(m)}
      />
      <DialogoAplicarRotacion
        abierto={aplicarRotacion}
        onAbiertoChange={setAplicarRotacion}
        rotaciones={rotaciones}
        personas={datos?.personas ?? []}
        desde={lunes}
        hasta={hasta}
        onAplicada={() => void recargarTodo()}
      />
    </div>
  );
}

async function cargarRotaciones(set: (r: Array<{ id: string; nombre: string; activa: boolean }>) => void) {
  try {
    const r = await pedir<{ rotaciones: Array<{ id: string; nombre: string; activa: boolean }> }>('/api/hrm/turnos/rotaciones');
    set(r.rotaciones);
  } catch {
    set([]);
  }
}
