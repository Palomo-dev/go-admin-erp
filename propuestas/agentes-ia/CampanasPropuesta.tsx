"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Bot,
  CalendarDays,
  Check,
  CircleCheck,
  Clock3,
  Eye,
  Info,
  Megaphone,
  Mic,
  Pause,
  Play,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react";
import { DataTable, type ColumnaTabla } from "@/components/kit/DataTable";
import { ListCard } from "@/components/kit/ListCard";
import { ListToolbar } from "@/components/kit/ListToolbar";
import { SearchInput } from "@/components/kit/SearchInput";
import { FilterPanel } from "@/components/kit/FilterPanel";
import { FilterChip } from "@/components/kit/FilterChip";
import { KpiStrip } from "@/components/kit/KpiStrip";
import { StatCard } from "@/components/kit/StatCard";
import { StatusBadge } from "@/components/kit/StatusBadge";
import { BadgeTono } from "@/components/kit/BadgeTono";
import { HojaDetalle } from "@/components/kit/HojaDetalle";
import { Tarjeta } from "@/components/kit/Tarjeta";
import { RelatedLinkCard } from "@/components/kit/RelatedLinkCard";
import { Dialogo } from "@/components/kit/Dialogo";
import { Stepper } from "@/components/kit/Stepper";
import { FormField } from "@/components/kit/FormField";
import { EmptyState } from "@/components/kit/EmptyState";
import { clasesBoton } from "@/components/kit/botonClases";
import type { AccionFila } from "@/components/kit/acciones";
import { SelectCrm } from "@/components/crm/kit/SelectCrm";
import { CLASE_CAMPO } from "@/components/crm/kit/camposCrm";
import { CampoFechaHora } from "@/components/crm/kit/CampoFechaHora";
import {
  aFechaHoraLocal,
  deFechaHoraLocal,
} from "@/components/crm/kit/fechasCrm";
import { evaluarProgramacion } from "@/components/crm/campanas/nuevo/programacionCampanaLogica";
import { useOrgTimezone } from "@/lib/context/OrganizationTimezoneContext";
import {
  addPlainDays,
  formatDateTimeInTz,
  todayInTz,
} from "@/lib/utils/dateDisplay";
import { Checkbox } from "@/components/ui/checkbox";
import {
  SEGMENTOS_DEMO,
  type AgenteDemo,
  type CampanaDemo,
  type EstadoCampana,
  type RelacionDemo,
  type VozDemo,
} from "./modelo";

export interface CampanasPropuestaProps {
  voces: VozDemo[];
  agentes: AgenteDemo[];
  campanas: CampanaDemo[];
  onCampanasChange: (campanas: CampanaDemo[]) => void;
  onRelacion: (relacion: RelacionDemo) => void;
  onAviso: (mensaje: string) => void;
  solicitudNueva: number;
  agenteInicial?: string;
  activo?: boolean;
}

const ESTADOS: Record<EstadoCampana, string> = {
  running: "En marcha",
  scheduled: "Programada",
  paused: "En pausa",
  draft: "Borrador",
  blocked: "Bloqueada",
  completed: "Terminada",
};
const TONOS_ESTADO = {
  running: "exito",
  scheduled: "informacion",
  paused: "advertencia",
  draft: "neutro",
  blocked: "peligro",
  completed: "exito",
} as const;
const PASOS = [
  { valor: "audiencia", etiqueta: "Audiencia" },
  { valor: "agente", etiqueta: "Agente y voz" },
  { valor: "cumplimiento", etiqueta: "Cumplimiento" },
  { valor: "revision", etiqueta: "Revisión" },
] as const;
type Paso = (typeof PASOS)[number]["valor"];
type AccionCampana = "pause" | "resume";
type Formulario = {
  nombre: string;
  segmentoId: string;
  agenteId: string;
  diario: string;
  hora: string;
  simultaneas: string;
  franja: "laboral" | "manana";
  fecha: string;
  rne: boolean;
  datos: boolean;
  minutos: boolean;
};

const entero = (n: number) => new Intl.NumberFormat("es-CO").format(n);
const franjaTexto = (franja: Formulario["franja"]) =>
  franja === "laboral"
    ? "Lun–vie · 9:00 a. m. – 5:00 p. m."
    : "Lun–sáb · 8:00 a. m. – 3:00 p. m.";
const numeroValido = (v: string, maximo: number) =>
  /^\d+$/.test(v) && Number(v) > 0 && Number(v) <= maximo;

function fechaSiguienteFranja(zona: string) {
  let dia = addPlainDays(todayInTz(zona), 1);
  // Es un día calendario: UTC se usa sólo para identificar su día de semana.
  const semana = new Date(`${dia}T12:00:00Z`).getUTCDay();
  if (semana === 6) dia = addPlainDays(dia, 2);
  if (semana === 0) dia = addPlainDays(dia, 1);
  return `${dia}T09:00`;
}

function formularioNuevo(zona: string, agenteId = ""): Formulario {
  return {
    nombre: "",
    segmentoId: SEGMENTOS_DEMO[0].id,
    agenteId,
    diario: "50",
    hora: "20",
    simultaneas: "3",
    franja: "laboral",
    fecha: fechaSiguienteFranja(zona),
    rne: false,
    datos: false,
    minutos: false,
  };
}

function etiquetaFecha(valor: string, zona: string) {
  try {
    const instante = deFechaHoraLocal(valor, zona);
    return instante
      ? formatDateTimeInTz(instante, zona, {
          locale: "es-CO",
          day: "numeric",
          month: "short",
          year: undefined,
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : "Sin fecha";
  } catch {
    return "Sin fecha";
  }
}

function requisitosCampana(campana: CampanaDemo) {
  return campana.cumplimiento ?? { rne: false, datos: false, minutos: false };
}

function validarFecha(
  fecha: string,
  franja: Formulario["franja"],
  zona: string,
) {
  const programacion = evaluarProgramacion(
    "scheduled",
    fecha,
    zona,
    new Date(),
  );
  if (programacion.error === "incompleta") return "Elige una fecha y una hora.";
  if (programacion.error === "invalida")
    return "Elige una fecha y una hora válidas en la zona de la organización.";
  if (programacion.error === "pasada")
    return "Elige una fecha y una hora futuras.";
  const [fechaPlana, hora] = fecha.split("T");
  const [horas, minutosHora] = hora.split(":").map(Number);
  const dia = new Date(`${fechaPlana}T12:00:00Z`).getUTCDay(),
    minutos = horas * 60 + minutosHora;
  const diaPermitido = dia !== 0 && (franja === "manana" || dia !== 6);
  const desde = franja === "laboral" ? 9 * 60 : 8 * 60;
  const hasta = franja === "laboral" ? 17 * 60 : 15 * 60;
  if (!diaPermitido || minutos < desde || minutos >= hasta)
    return "La fecha debe estar dentro de la franja seleccionada.";
  return null;
}

function Estado({ campana }: { campana: CampanaDemo }) {
  return (
    <StatusBadge
      estado={campana.estado}
      etiqueta={ESTADOS[campana.estado]}
      tono={TONOS_ESTADO[campana.estado]}
      tipografia="figma"
    />
  );
}

function Avance({
  campana,
  compacto = false,
}: {
  campana: CampanaDemo;
  compacto?: boolean;
}) {
  const porcentaje =
    campana.total > 0
      ? Math.min(100, Math.round((campana.procesados / campana.total) * 100))
      : 0;
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs leading-4 text-fg-secondary">
        <span className="truncate">
          {compacto
            ? `${entero(campana.procesados)} / ${entero(campana.total)}`
            : `${entero(campana.procesados)} de ${entero(campana.total)} contactos`}
        </span>
        <span className="shrink-0 tabular-nums">{porcentaje}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={`Avance de ${campana.nombre}`}
        aria-valuenow={porcentaje}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 overflow-hidden rounded-full bg-subtle"
      >
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${porcentaje}%` }}
        />
      </div>
    </div>
  );
}

/** Propuesta interactiva: todos los cambios se limitan al estado del prototipo. */
export function CampanasPropuesta({
  voces,
  agentes,
  campanas,
  onCampanasChange,
  onRelacion,
  onAviso,
  solicitudNueva,
  agenteInicial,
  activo = true,
}: CampanasPropuestaProps) {
  const { timezone } = useOrgTimezone();
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<string>("all");
  const [filtroAgente, setFiltroAgente] = useState("");
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<{
    id: string;
    accion: AccionCampana;
  } | null>(null);
  const [wizardAbierto, setWizardAbierto] = useState(false);
  const [paso, setPaso] = useState<Paso>("audiencia");
  const [form, setForm] = useState<Formulario>(() => formularioNuevo(timezone));
  const [mostrarErrores, setMostrarErrores] = useState(false);
  const [guardadaId, setGuardadaId] = useState<string | null>(null);
  const ultimaSolicitud = useRef(0);
  const contador = useRef(0);
  const agentesActivos = agentes.filter((a) => a.activo);

  useEffect(() => {
    if (activo) return;
    setSeleccionada(null);
    setConfirmacion(null);
    setWizardAbierto(false);
    setFiltrosAbiertos(false);
  }, [activo]);

  useEffect(() => {
    if (solicitudNueva <= 0 || solicitudNueva === ultimaSolicitud.current)
      return;
    ultimaSolicitud.current = solicitudNueva;
    if (form.nombre.trim() && !guardadaId) {
      const agenteSolicitado = agentes.find(
        (a) => a.id === agenteInicial && a.activo,
      );
      if (agenteSolicitado && agenteSolicitado.id !== form.agenteId) {
        setForm((previous) => ({ ...previous, agenteId: agenteSolicitado.id }));
        onAviso(
          `Continúas el borrador con ${agenteSolicitado.nombre}; la audiencia y el contenido se conservan.`,
        );
      }
      setWizardAbierto(true);
      return;
    }
    const preferido =
      agentes.find((a) => a.id === agenteInicial && a.activo) ??
      agentes.find((a) => a.activo);
    setForm(formularioNuevo(timezone, preferido?.id));
    setPaso("audiencia");
    setMostrarErrores(false);
    setGuardadaId(null);
    setWizardAbierto(true);
  }, [
    solicitudNueva,
    agenteInicial,
    agentes,
    form.nombre,
    form.agenteId,
    guardadaId,
    timezone,
    onAviso,
  ]);

  const filas = useMemo(
    () =>
      campanas.filter((c) => {
        const agente = agentes.find((a) => a.id === c.agenteId);
        const segmento = SEGMENTOS_DEMO.find((s) => s.id === c.segmentoId);
        const texto =
          `${c.nombre} ${agente?.nombre ?? ""} ${segmento?.nombre ?? ""}`.toLocaleLowerCase(
            "es",
          );
        return (
          (!busqueda.trim() ||
            texto.includes(busqueda.trim().toLocaleLowerCase("es"))) &&
          (estado === "all" || c.estado === estado) &&
          (!filtroAgente || c.agenteId === filtroAgente)
        );
      }),
    [campanas, agentes, busqueda, estado, filtroAgente],
  );
  const detalle = campanas.find((c) => c.id === seleccionada) ?? null;
  const agenteDetalle = agentes.find((a) => a.id === detalle?.agenteId);
  const vozDetalle = voces.find(
    (v) => v.id === agenteDetalle?.vozId && v.guardada,
  );
  const segmentoDetalle = SEGMENTOS_DEMO.find(
    (s) => s.id === detalle?.segmentoId,
  );
  const objetivoConfirmacion = campanas.find((c) => c.id === confirmacion?.id);
  const segmentoForm = SEGMENTOS_DEMO.find((s) => s.id === form.segmentoId);
  const agenteForm = agentes.find((a) => a.id === form.agenteId && a.activo);
  const vozForm = voces.find((v) => v.id === agenteForm?.vozId && v.guardada);
  const audienciaValida = !!form.nombre.trim() && !!segmentoForm;
  const agenteValido =
    !!agenteForm &&
    !!vozForm &&
    numeroValido(form.diario, 500) &&
    numeroValido(form.hora, 500) &&
    numeroValido(form.simultaneas, 100);
  const errorFecha = validarFecha(form.fecha, form.franja, timezone);
  const cumplimientoValido =
    form.rne && form.datos && form.minutos && !errorFecha;
  const sePuedeProgramar =
    audienciaValida && agenteValido && cumplimientoValido;
  const conteoFiltros = Number(estado !== "all") + Number(!!filtroAgente);
  const actualizar = <K extends keyof Formulario>(
    campo: K,
    valor: Formulario[K],
  ) => {
    setForm((anterior) => ({ ...anterior, [campo]: valor }));
  };
  const limpiar = () => {
    setBusqueda("");
    setEstado("all");
    setFiltroAgente("");
  };

  const bloqueo = (campana: CampanaDemo): string | null => {
    const agente = agentes.find((a) => a.id === campana.agenteId);
    if (!agente?.activo)
      return "El agente está inactivo. Revisa su configuración.";
    if (!voces.some((v) => v.id === agente.vozId && v.guardada))
      return "Asigna una voz guardada al agente antes de programar.";
    const requisitos = requisitosCampana(campana);
    if (!requisitos.rne)
      return "Falta verificar el RNE de la audiencia en esta demostración.";
    if (!requisitos.datos)
      return "Falta marcar la política de datos como disponible en esta simulación.";
    if (!requisitos.minutos)
      return "Falta marcar los minutos como disponibles en esta simulación.";
    return null;
  };
  const bloqueadas = campanas.filter(
    (c) => c.estado === "blocked" && bloqueo(c),
  );

  const revisarProgramacion = (campana: CampanaDemo) => {
    const requisitos = requisitosCampana(campana);
    setForm({
      nombre: campana.nombre,
      segmentoId: campana.segmentoId,
      agenteId: campana.agenteId,
      diario: String(campana.diario),
      hora: String(campana.hora),
      simultaneas: String(campana.simultaneas),
      franja: campana.franja ?? "laboral",
      fecha: aFechaHoraLocal(campana.inicio, timezone),
      rne: requisitos.rne,
      datos: requisitos.datos,
      minutos: requisitos.minutos,
    });
    setGuardadaId(campana.id);
    setSeleccionada(null);
    setConfirmacion(null);
    setPaso("cumplimiento");
    setMostrarErrores(false);
    setWizardAbierto(true);
  };

  const cambiarEstado = () => {
    if (!confirmacion || !objetivoConfirmacion) return;
    if (confirmacion.accion !== "pause" && bloqueo(objetivoConfirmacion)) {
      onAviso(bloqueo(objetivoConfirmacion)!);
      setSeleccionada(objetivoConfirmacion.id);
      setConfirmacion(null);
      return;
    }
    const nuevoEstado: EstadoCampana =
      confirmacion.accion === "pause" ? "paused" : "running";
    onCampanasChange(
      campanas.map((c) =>
        c.id === objetivoConfirmacion.id
          ? {
              ...c,
              estado: nuevoEstado,
              actividad:
                nuevoEstado === "paused"
                  ? "En pausa · ahora"
                  : "Reanudada · ahora",
            }
          : c,
      ),
    );
    setConfirmacion(null);
    onAviso(
      `${nuevoEstado === "paused" ? "Campaña pausada" : "Campaña reanudada"} en la propuesta. No se realizará ninguna llamada.`,
    );
  };

  const verificar = (campana: CampanaDemo) => {
    onCampanasChange(
      campanas.map((c) =>
        c.id === campana.id
          ? { ...c, cumplimiento: { ...requisitosCampana(c), rne: true } }
          : c,
      ),
    );
    onAviso(
      "RNE verificado en la simulación. Revisa la programación y los demás requisitos antes de programar. Esta comprobación no tiene validez real.",
    );
  };

  const accionesFila = (campana: CampanaDemo): AccionFila[] => [
    {
      id: "detalle",
      etiqueta: "Ver detalle",
      icono: Eye,
      onSelect: () => setSeleccionada(campana.id),
    },
    {
      id: "audiencia",
      etiqueta: "Ver audiencia",
      icono: Users,
      onSelect: () => onRelacion({ tipo: "segmento", id: campana.segmentoId }),
    },
    {
      id: "llamadas",
      etiqueta: "Ver llamadas",
      icono: AudioLines,
      onSelect: () => onRelacion({ tipo: "llamadas", id: campana.id }),
    },
    {
      id: "pause",
      etiqueta: "Pausar campaña",
      icono: Pause,
      oculta: campana.estado !== "running",
      onSelect: () => setConfirmacion({ id: campana.id, accion: "pause" }),
    },
    {
      id: "resume",
      etiqueta: "Reanudar campaña",
      icono: Play,
      oculta: campana.estado !== "paused",
      onSelect: () => setConfirmacion({ id: campana.id, accion: "resume" }),
    },
    {
      id: "schedule",
      etiqueta: "Revisar programación",
      icono: CalendarDays,
      oculta: !["draft", "blocked"].includes(campana.estado),
      onSelect: () => revisarProgramacion(campana),
    },
  ];

  const columnas: ColumnaTabla<CampanaDemo>[] = [
    {
      id: "nombre",
      encabezado: "Campaña",
      ancho: "25%",
      celda: (c) => (
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium text-fg">{c.nombre}</p>
          <p className="text-xs leading-4 text-fg-secondary">{c.actividad}</p>
        </div>
      ),
    },
    {
      id: "agente",
      encabezado: "Agente y voz",
      ancho: "20%",
      celda: (c) => {
        const agente = agentes.find((a) => a.id === c.agenteId);
        const voz = voces.find((v) => v.id === agente?.vozId && v.guardada);
        return (
          <div className="min-w-0 space-y-0.5">
            <p className="text-[13px] leading-[18px] text-fg">
              {agente?.nombre ?? "Sin agente"}
            </p>
            <p className="flex items-center gap-1 text-xs leading-4 text-fg-secondary">
              <Mic
                className="size-3 shrink-0"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              {voz?.nombre ?? "Sin voz asignada"}
            </p>
          </div>
        );
      },
    },
    {
      id: "audiencia",
      encabezado: "Audiencia",
      ancho: "19%",
      celda: (c) => (
        <div className="space-y-0.5">
          <p className="text-[13px] leading-[18px] text-fg-secondary">
            {SEGMENTOS_DEMO.find((s) => s.id === c.segmentoId)?.nombre ??
              "Sin audiencia"}
          </p>
          <p className="text-xs leading-4 text-fg-secondary">
            {entero(c.total)} contactos elegibles
          </p>
        </div>
      ),
    },
    {
      id: "estado",
      encabezado: "Estado",
      ancho: 118,
      celda: (c) => <Estado campana={c} />,
    },
    {
      id: "avance",
      encabezado: "Avance",
      ancho: "18%",
      celda: (c) => <Avance campana={c} />,
    },
  ];

  const guardar = (programar: boolean) => {
    setMostrarErrores(true);
    if (!audienciaValida) {
      setPaso("audiencia");
      return;
    }
    if (!agenteValido) {
      setPaso("agente");
      return;
    }
    if (
      programar &&
      (!form.rne ||
        !form.datos ||
        !form.minutos ||
        validarFecha(form.fecha, form.franja, timezone))
    ) {
      setPaso("cumplimiento");
      return;
    }
    const id =
      guardadaId ?? `propuesta-campana-${Date.now()}-${++contador.current}`;
    const anterior = campanas.find((c) => c.id === id);
    let inicio: string | undefined;
    try {
      const instante = deFechaHoraLocal(form.fecha, timezone);
      if (instante && aFechaHoraLocal(instante, timezone) === form.fecha)
        inicio = instante;
    } catch {
      /* Un borrador puede conservarse sin una fecha válida. */
    }
    const campana: CampanaDemo = {
      id,
      nombre: form.nombre.trim(),
      agenteId: form.agenteId,
      segmentoId: form.segmentoId,
      estado: programar ? "scheduled" : "draft",
      total: segmentoForm!.elegibles,
      procesados: anterior?.procesados ?? 0,
      efectivos: anterior?.efectivos ?? 0,
      reuniones: anterior?.reuniones ?? 0,
      minutos: anterior?.minutos ?? 0,
      diario: Number(form.diario),
      hora: Number(form.hora),
      simultaneas: Number(form.simultaneas),
      horario: franjaTexto(form.franja),
      franja: form.franja,
      inicio,
      cumplimiento: { rne: form.rne, datos: form.datos, minutos: form.minutos },
      actividad: programar
        ? `Programada · ${etiquetaFecha(form.fecha, timezone)}`
        : "Borrador · sin programar",
    };
    onCampanasChange(
      anterior
        ? campanas.map((c) => (c.id === id ? campana : c))
        : [campana, ...campanas],
    );
    setGuardadaId(id);
    setWizardAbierto(false);
    setSeleccionada(id);
    limpiar();
    onAviso(
      programar
        ? "Campaña programada en la propuesta. No se realizarán llamadas."
        : "Borrador guardado en la propuesta. Puedes revisarlo desde el listado.",
    );
  };

  const siguiente = () => {
    setMostrarErrores(true);
    if (paso === "audiencia" && !audienciaValida) return;
    if (paso === "agente" && !agenteValido) return;
    const indice = PASOS.findIndex((p) => p.valor === paso);
    setPaso(PASOS[Math.min(indice + 1, PASOS.length - 1)].valor);
    setMostrarErrores(false);
  };

  return (
    <div className="min-w-0 space-y-4">
      <KpiStrip
        etiqueta="Resumen de campañas de demostración"
        className="grid-flow-row grid-cols-2 overflow-visible sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatCard
          etiqueta="En marcha"
          valor={entero(campanas.filter((c) => c.estado === "running").length)}
          detalle="Campañas de voz"
          icono={Megaphone}
          tamano="sm"
        />
        <StatCard
          etiqueta="Intentos"
          valor={entero(campanas.reduce((n, c) => n + c.procesados, 0))}
          detalle="Acumulado de la demostración"
          icono={AudioLines}
          tamano="sm"
        />
        <StatCard
          etiqueta="Conversaciones"
          valor={entero(campanas.reduce((n, c) => n + c.efectivos, 0))}
          detalle="Del total de intentos"
          icono={CircleCheck}
          tamano="sm"
        />
        <StatCard
          etiqueta="Reuniones"
          valor={entero(campanas.reduce((n, c) => n + c.reuniones, 0))}
          detalle="Vinculadas al calendario"
          icono={CalendarDays}
          tamano="sm"
          onClick={() => onRelacion({ tipo: "calendario" })}
        />
      </KpiStrip>

      {bloqueadas.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-line-warning bg-warning-subtle px-4 py-3"
        >
          <TriangleAlert
            className="size-4 shrink-0 text-warning-text"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <p className="min-w-0 flex-1 text-[13px] leading-[18px] text-warning-text">
            {bloqueadas.length === 1
              ? "Una campaña tiene requisitos pendientes antes de programarse."
              : `${bloqueadas.length} campañas tienen requisitos pendientes antes de programarse.`}
          </p>
          <button
            type="button"
            className={clasesBoton({
              patron: "button",
              variante: "fantasma",
              tamano: "sm",
              className: "text-warning-text",
            })}
            onClick={() => setSeleccionada(bloqueadas[0].id)}
          >
            Revisar campaña
            <ArrowRight
              className="size-4"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </button>
        </div>
      )}

      <ListToolbar
        busqueda={
          <SearchInput
            value={busqueda}
            onChange={setBusqueda}
            onValueChange={setBusqueda}
            placeholder="Buscar campaña, agente o audiencia"
            etiqueta="Buscar campañas"
            atajo={activo ? "/" : false}
          />
        }
        filtros={
          <FilterPanel
            abierto={activo && filtrosAbiertos}
            onAbiertoChange={setFiltrosAbiertos}
            conteo={conteoFiltros}
            onLimpiar={() => {
              setEstado("all");
              setFiltroAgente("");
            }}
            textoVerResultados={`Ver ${filas.length} campañas`}
            nota="Los filtros se aplican a las campañas de esta propuesta."
          >
            <FormField etiqueta="Estado" tamanoEtiqueta="sm">
              <SelectCrm
                valor={estado}
                onValorChange={setEstado}
                opciones={[
                  { valor: "all", etiqueta: "Todos los estados" },
                  ...Object.entries(ESTADOS).map(([valor, etiqueta]) => ({
                    valor,
                    etiqueta,
                  })),
                ]}
              />
            </FormField>
            <FormField etiqueta="Agente" tamanoEtiqueta="sm">
              <SelectCrm
                valor={filtroAgente}
                onValorChange={setFiltroAgente}
                opcionVacia="Todos los agentes"
                opciones={agentes.map((a) => ({
                  valor: a.id,
                  etiqueta: a.nombre,
                }))}
              />
            </FormField>
          </FilterPanel>
        }
        chips={
          conteoFiltros > 0 ? (
            <div className="flex flex-wrap gap-2">
              {estado !== "all" && (
                <FilterChip
                  etiqueta={`Estado: ${ESTADOS[estado as EstadoCampana]}`}
                  onQuitar={() => setEstado("all")}
                />
              )}
              {filtroAgente && (
                <FilterChip
                  etiqueta={`Agente: ${agentes.find((a) => a.id === filtroAgente)?.nombre ?? "Seleccionado"}`}
                  onQuitar={() => setFiltroAgente("")}
                />
              )}
            </div>
          ) : undefined
        }
      />

      <div className="flex items-center justify-between gap-3 text-xs leading-4 text-fg-secondary">
        <span>
          {entero(filas.length)} {filas.length === 1 ? "campaña" : "campañas"}
        </span>
        <BadgeTono tono="neutro">Datos de demostración</BadgeTono>
      </div>
      <DataTable
        columnas={columnas}
        filas={filas}
        obtenerId={(c) => c.id}
        etiqueta="Campañas de voz"
        estado={
          !filas.length && campanas.length > 0 ? "sinResultados" : "listo"
        }
        etiquetaFila={(c) => c.nombre}
        onFilaClick={(c) => setSeleccionada(c.id)}
        acciones={accionesFila}
        densidad="compacta"
        altoFila={52}
        onLimpiarFiltros={limpiar}
        termino={busqueda}
        sinResultados={{
          titulo: "No encontramos campañas con estos filtros",
          descripcion: "Prueba con otra búsqueda o limpia los filtros.",
        }}
        vacio={{
          icono: Megaphone,
          titulo: "Crea tu primera campaña de voz",
          descripcion: "Elige una audiencia y el agente que la acompañará.",
          accion: {
            etiqueta: "Nueva campaña",
            onClick: () => {
              setForm(formularioNuevo(timezone, agentesActivos[0]?.id));
              setPaso("audiencia");
              setMostrarErrores(false);
              setGuardadaId(null);
              setWizardAbierto(true);
            },
          },
          accionPrimaria: true,
        }}
        tarjetaMovil={(c) => (
          <ListCard
            icono={Megaphone}
            titulo={c.nombre}
            subtitulo={
              agentes.find((a) => a.id === c.agenteId)?.nombre ?? "Sin agente"
            }
            estado={<Estado campana={c} />}
            onClick={() => setSeleccionada(c.id)}
            acciones={accionesFila(c)}
            datos={[
              {
                icono: Users,
                texto: `${SEGMENTOS_DEMO.find((s) => s.id === c.segmentoId)?.nombre ?? "Sin audiencia"} · ${entero(c.total)} contactos`,
                etiqueta: "Audiencia",
              },
              {
                icono: Mic,
                texto:
                  voces.find(
                    (v) =>
                      v.id ===
                        agentes.find((a) => a.id === c.agenteId)?.vozId &&
                      v.guardada,
                  )?.nombre ?? "Sin voz asignada",
                etiqueta: "Voz del agente",
              },
            ]}
            meta={`${entero(c.procesados)} de ${entero(c.total)} contactos · ${c.actividad}`}
          />
        )}
      />

      <HojaDetalle
        abierto={activo && !!detalle}
        onAbiertoChange={(open) => {
          if (!open) setSeleccionada(null);
        }}
        titulo={detalle?.nombre ?? "Campaña"}
        insignia={detalle ? <Estado campana={detalle} /> : undefined}
        subtitulo="Campaña de voz · demostración"
        ancho={560}
        pie={
          detalle && (
            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className={clasesBoton({
                  patron: "button",
                  variante: "secundario",
                })}
                onClick={() => onRelacion({ tipo: "llamadas", id: detalle.id })}
              >
                <AudioLines
                  className="size-4"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                Ver llamadas
              </button>
              {detalle.estado === "running" && (
                <button
                  type="button"
                  className={clasesBoton({
                    patron: "button",
                    variante: "secundario",
                  })}
                  onClick={() =>
                    setConfirmacion({ id: detalle.id, accion: "pause" })
                  }
                >
                  <Pause
                    className="size-4"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  Pausar campaña
                </button>
              )}
              {detalle.estado === "paused" && (
                <button
                  type="button"
                  className={clasesBoton({ patron: "button" })}
                  onClick={() =>
                    setConfirmacion({ id: detalle.id, accion: "resume" })
                  }
                >
                  <Play
                    className="size-4"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  Reanudar
                </button>
              )}
              {["draft", "blocked"].includes(detalle.estado) && (
                <button
                  type="button"
                  className={clasesBoton({ patron: "button" })}
                  onClick={() => revisarProgramacion(detalle)}
                >
                  <CalendarDays
                    className="size-4"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  Revisar programación
                </button>
              )}
            </div>
          )
        }
      >
        {detalle && (
          <div className="space-y-4">
            <Tarjeta titulo="Avance de la campaña" icono={Megaphone}>
              <Avance campana={detalle} />
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  { etiqueta: "Efectivas", valor: detalle.efectivos },
                  { etiqueta: "Reuniones", valor: detalle.reuniones },
                  { etiqueta: "Minutos", valor: detalle.minutos },
                ].map((d) => (
                  <div key={d.etiqueta}>
                    <p className="text-lg font-semibold leading-6 text-fg tabular-nums">
                      {entero(d.valor)}
                    </p>
                    <p className="text-xs leading-4 text-fg-secondary">
                      {d.etiqueta}
                    </p>
                  </div>
                ))}
              </div>
            </Tarjeta>
            <div className="space-y-2">
              <RelatedLinkCard
                icono={Bot}
                etiqueta="Agente que llama"
                valor={agenteDetalle?.nombre ?? "Sin agente"}
                onAccion={() =>
                  onRelacion({ tipo: "agente", id: detalle.agenteId })
                }
              />
              <div className="flex items-center gap-2 px-3 text-[13px] leading-[18px] text-fg-secondary">
                <Mic
                  className="size-4 shrink-0"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span>
                  Voz del agente:{" "}
                  <strong className="font-medium text-fg">
                    {vozDetalle?.nombre ?? "Sin voz asignada"}
                  </strong>
                </span>
              </div>
              <RelatedLinkCard
                icono={Users}
                etiqueta="Audiencia"
                valor={segmentoDetalle?.nombre ?? "Sin audiencia"}
                onAccion={() =>
                  onRelacion({ tipo: "segmento", id: detalle.segmentoId })
                }
                textoAccion="Ver audiencia"
              />
              <RelatedLinkCard
                icono={CalendarDays}
                etiqueta="Reuniones"
                valor={entero(detalle.reuniones)}
                onAccion={() =>
                  onRelacion({ tipo: "calendario", id: detalle.id })
                }
              />
            </div>
            <Tarjeta titulo="Ritmo y programación" icono={Clock3}>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-[13px] leading-[18px]">
                <dt className="text-fg-secondary">Intentos por día</dt>
                <dd className="text-right tabular-nums text-fg">
                  {detalle.diario}
                </dd>
                <dt className="text-fg-secondary">Intentos por hora</dt>
                <dd className="text-right tabular-nums text-fg">
                  {detalle.hora}
                </dd>
                <dt className="text-fg-secondary">Llamadas simultáneas</dt>
                <dd className="text-right tabular-nums text-fg">
                  {detalle.simultaneas}
                </dd>
                <dt className="text-fg-secondary">Franja</dt>
                <dd className="max-w-[220px] text-right text-fg">
                  {detalle.horario}
                </dd>
                <dt className="text-fg-secondary">Inicio elegido</dt>
                <dd className="max-w-[220px] text-right text-fg">
                  {detalle.inicio
                    ? etiquetaFecha(
                        aFechaHoraLocal(detalle.inicio, timezone),
                        timezone,
                      )
                    : "Sin fecha elegida"}
                </dd>
              </dl>
              <p className="mt-3 text-xs leading-4 text-fg-secondary">
                Zona horaria: {timezone}.
              </p>
            </Tarjeta>
            <Tarjeta
              titulo="Cumplimiento"
              descripcion="Verificaciones simuladas para esta propuesta."
              icono={ShieldCheck}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 ${requisitosCampana(detalle).rne ? "text-success-text" : "text-warning-text"}`}
                >
                  {requisitosCampana(detalle).rne ? (
                    <CircleCheck
                      className="size-4"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  ) : (
                    <TriangleAlert
                      className="size-4"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">
                    {requisitosCampana(detalle).rne
                      ? "RNE verificado en la simulación"
                      : "Falta verificar el RNE"}
                  </p>
                  <p className="mt-1 text-xs leading-4 text-fg-secondary">
                    {requisitosCampana(detalle).rne
                      ? "Revisa también la política de datos, los minutos y la fecha de inicio."
                      : "Revisa la audiencia antes de programar la campaña."}
                  </p>
                  {!requisitosCampana(detalle).rne && (
                    <button
                      type="button"
                      className={clasesBoton({
                        patron: "button",
                        variante: "secundario",
                        tamano: "sm",
                        className: "mt-3",
                      })}
                      onClick={() => verificar(detalle)}
                    >
                      <ShieldCheck
                        className="size-4"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                      Simular verificación
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <BadgeTono
                  tono={
                    requisitosCampana(detalle).datos ? "exito" : "advertencia"
                  }
                >
                  Política{" "}
                  {requisitosCampana(detalle).datos ? "lista" : "pendiente"}
                </BadgeTono>
                <BadgeTono
                  tono={
                    requisitosCampana(detalle).minutos ? "exito" : "advertencia"
                  }
                >
                  Minutos{" "}
                  {requisitosCampana(detalle).minutos ? "listos" : "pendientes"}
                </BadgeTono>
              </div>
              {bloqueo(detalle) && (
                <p
                  role="status"
                  className="mt-3 rounded-lg bg-warning-subtle p-3 text-xs leading-4 text-warning-text"
                >
                  {bloqueo(detalle)}
                </p>
              )}
            </Tarjeta>
            <p className="flex gap-2 text-xs leading-4 text-fg-secondary">
              <Info
                className="size-4 shrink-0"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              Cambiar la voz del agente actualiza la voz que muestra esta
              campaña.
            </p>
          </div>
        )}
      </HojaDetalle>

      <Dialogo
        abierto={activo && !!confirmacion}
        onAbiertoChange={(open) => {
          if (!open) setConfirmacion(null);
        }}
        ancho={520}
        titulo={
          confirmacion?.accion === "pause"
            ? "¿Pausar esta campaña?"
            : "¿Reanudar esta campaña?"
        }
        descripcion={objetivoConfirmacion?.nombre}
        icono={confirmacion?.accion === "pause" ? Pause : Play}
        primario={{
          etiqueta:
            confirmacion?.accion === "pause"
              ? "Pausar campaña"
              : "Reanudar campaña",
          onClick: cambiarEstado,
        }}
      >
        <p className="text-sm leading-5 text-fg-secondary">
          {confirmacion?.accion === "pause"
            ? "La campaña dejará de aparecer en marcha. Se conservarán su avance y sus resultados."
            : "La campaña volverá al estado En marcha con el mismo agente, audiencia y límites."}
        </p>
        <p className="rounded-lg bg-info-subtle p-3 text-xs leading-4 text-info-text">
          Esta acción sólo cambia la demostración. No se realizarán llamadas ni
          se programarán tareas reales.
        </p>
      </Dialogo>

      <Dialogo
        abierto={activo && wizardAbierto}
        onAbiertoChange={setWizardAbierto}
        titulo={guardadaId ? "Revisar campaña de voz" : "Nueva campaña de voz"}
        descripcion="Elige la audiencia y prepara una conversación con tu agente."
        ancho={880}
        icono={Megaphone}
        textoCancelar="Cerrar"
        primario={
          paso === "revision"
            ? {
                etiqueta: "Programar campaña",
                onClick: () => guardar(true),
                deshabilitada: !sePuedeProgramar,
                motivo: !sePuedeProgramar
                  ? "Completa los requisitos simulados y la programación antes de continuar."
                  : undefined,
              }
            : { etiqueta: "Continuar", onClick: siguiente }
        }
        secundarios={[
          ...(paso !== "audiencia"
            ? [
                {
                  etiqueta: "Atrás",
                  onClick: () => {
                    setPaso(
                      PASOS[
                        Math.max(
                          0,
                          PASOS.findIndex((p) => p.valor === paso) - 1,
                        )
                      ].valor,
                    );
                    setMostrarErrores(false);
                  },
                },
              ]
            : []),
          {
            etiqueta: "Guardar borrador",
            onClick: () => guardar(false),
            deshabilitada: !audienciaValida || !agenteValido,
            motivo:
              !audienciaValida || !agenteValido
                ? "Completa nombre, audiencia, agente y límites para guardar."
                : undefined,
          },
        ]}
        pie={
          <span className="text-xs leading-4 text-fg-secondary">
            Cambios sólo en la propuesta
          </span>
        }
      >
        <div className="min-w-0 space-y-5">
          <Stepper
            pasos={PASOS}
            actual={paso}
            onPasoClick={(p) => {
              setPaso(p);
              setMostrarErrores(false);
            }}
            etiqueta="Preparar campaña"
            resumenMovil={(n, total, titulo) =>
              `Paso ${n} de ${total} · ${titulo}`
            }
          />
          {paso === "audiencia" && (
            <div className="space-y-4">
              <FormField
                etiqueta="Nombre de la campaña"
                obligatorio
                tamanoEtiqueta="sm"
                ayuda="Un nombre que tu equipo pueda reconocer."
                error={
                  mostrarErrores && !form.nombre.trim()
                    ? "Escribe un nombre para la campaña."
                    : undefined
                }
              >
                <input
                  autoFocus
                  value={form.nombre}
                  maxLength={200}
                  onChange={(e) => actualizar("nombre", e.target.value)}
                  className={CLASE_CAMPO}
                  placeholder="Ej. Seguimiento de propuestas de octubre"
                />
              </FormField>
              <FormField
                etiqueta="Segmento de audiencia"
                obligatorio
                tamanoEtiqueta="sm"
                error={
                  mostrarErrores && !segmentoForm
                    ? "Elige una audiencia."
                    : undefined
                }
              >
                <SelectCrm
                  valor={form.segmentoId}
                  onValorChange={(id) => {
                    actualizar("segmentoId", id);
                    actualizar("rne", false);
                  }}
                  opciones={SEGMENTOS_DEMO.map((s) => ({
                    valor: s.id,
                    etiqueta: s.nombre,
                  }))}
                />
              </FormField>
              {segmentoForm && (
                <Tarjeta
                  titulo={segmentoForm.nombre}
                  descripcion={segmentoForm.descripcion}
                  icono={Users}
                  accion={<BadgeTono tono="neutro">Segmento</BadgeTono>}
                >
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { etiqueta: "En el segmento", valor: segmentoForm.total },
                      { etiqueta: "Excluidos", valor: segmentoForm.excluidos },
                      { etiqueta: "Elegibles", valor: segmentoForm.elegibles },
                    ].map((c) => (
                      <div key={c.etiqueta}>
                        <p className="text-xl font-semibold leading-7 text-fg tabular-nums">
                          {entero(c.valor)}
                        </p>
                        <p className="mt-0.5 text-xs leading-4 text-fg-secondary">
                          {c.etiqueta}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-xs leading-4 text-fg-secondary">
                    El ejemplo excluye contactos sin teléfono o consentimiento.
                    El recuento y las exclusiones son simulados.
                  </p>
                  <button
                    type="button"
                    className={clasesBoton({
                      patron: "button",
                      variante: "fantasma",
                      tamano: "sm",
                      className: "mt-2 px-0",
                    })}
                    onClick={() =>
                      onRelacion({ tipo: "segmento", id: segmentoForm.id })
                    }
                  >
                    Ver audiencia
                    <ArrowRight
                      className="size-4"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  </button>
                </Tarjeta>
              )}
            </div>
          )}

          {paso === "agente" && (
            <div className="space-y-4">
              {!agentesActivos.length ? (
                <EmptyState
                  compacto
                  icono={Bot}
                  titulo="Activa un agente para continuar"
                  descripcion="La campaña necesita un agente disponible y una voz guardada."
                  accion={{
                    etiqueta: "Ver agentes",
                    onClick: () => onRelacion({ tipo: "agente" }),
                  }}
                />
              ) : (
                <FormField
                  etiqueta="Agente que llama"
                  obligatorio
                  tamanoEtiqueta="sm"
                  error={
                    mostrarErrores && !agenteForm
                      ? "Elige un agente activo."
                      : undefined
                  }
                >
                  <SelectCrm
                    valor={form.agenteId}
                    onValorChange={(id) => actualizar("agenteId", id)}
                    opciones={agentesActivos.map((a) => ({
                      valor: a.id,
                      etiqueta: a.nombre,
                    }))}
                    placeholder="Elige un agente"
                  />
                </FormField>
              )}
              {agenteForm && (
                <Tarjeta
                  titulo={agenteForm.nombre}
                  descripcion={agenteForm.objetivo}
                  icono={Bot}
                  accion={<StatusBadge estado="active" etiqueta="Activo" />}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-subtle px-3 py-3">
                    <span className="flex items-center gap-2 text-sm text-fg">
                      <Mic
                        className="size-4 text-brand"
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                      Voz:{" "}
                      <strong className="font-medium">
                        {vozForm?.nombre ?? "Sin voz asignada"}
                      </strong>
                    </span>
                    <span className="text-xs text-fg-secondary">
                      {vozForm
                        ? `${vozForm.idioma} · ${vozForm.pais}`
                        : "Asigna una voz al agente"}
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-4 text-fg-secondary">
                    La campaña usa la voz del agente. Puedes cambiarla en Voces
                    y la propuesta se actualizará.
                  </p>
                  {!vozForm && (
                    <p role="alert" className="mt-2 text-xs text-danger-text">
                      Este agente necesita una voz guardada para continuar.
                    </p>
                  )}
                  <button
                    type="button"
                    className={clasesBoton({
                      patron: "button",
                      variante: "fantasma",
                      tamano: "sm",
                      className: "mt-2 px-0",
                    })}
                    onClick={() =>
                      onRelacion({ tipo: "agente", id: agenteForm.id })
                    }
                  >
                    Ver agente
                    <ArrowRight
                      className="size-4"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  </button>
                </Tarjeta>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    {
                      campo: "diario",
                      etiqueta: "Intentos por día",
                      maximo: 500,
                    },
                    {
                      campo: "hora",
                      etiqueta: "Intentos por hora",
                      maximo: 500,
                    },
                    {
                      campo: "simultaneas",
                      etiqueta: "Llamadas simultáneas",
                      maximo: 100,
                    },
                  ] as const
                ).map((c) => (
                  <FormField
                    key={c.campo}
                    etiqueta={c.etiqueta}
                    obligatorio
                    tamanoEtiqueta="sm"
                    error={
                      mostrarErrores && !numeroValido(form[c.campo], c.maximo)
                        ? `Elige un entero entre 1 y ${c.maximo}.`
                        : undefined
                    }
                  >
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={c.maximo}
                      value={form[c.campo]}
                      onChange={(e) => actualizar(c.campo, e.target.value)}
                      className={`${CLASE_CAMPO} text-right tabular-nums`}
                    />
                  </FormField>
                ))}
              </div>
              <p className="flex gap-2 rounded-lg bg-info-subtle p-3 text-xs leading-4 text-info-text">
                <Info
                  className="size-4 shrink-0"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                Los topes cuentan todos los intentos, incluidos los que no
                llegan a una conversación.
              </p>
            </div>
          )}

          {paso === "cumplimiento" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs leading-4 text-fg-secondary">
                <BadgeTono tono="informacion">Simulación</BadgeTono>
                <span>Estos requisitos se validan sólo en la propuesta.</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Tarjeta titulo="Requisitos para programar" icono={ShieldCheck}>
                  <div className="space-y-4">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-medium text-fg">
                        {form.rne ? (
                          <CircleCheck
                            className="size-4 text-success-text"
                            strokeWidth={1.5}
                            aria-hidden="true"
                          />
                        ) : (
                          <TriangleAlert
                            className="size-4 text-warning-text"
                            strokeWidth={1.5}
                            aria-hidden="true"
                          />
                        )}
                        Verificación RNE
                      </p>
                      <p className="mt-1 text-xs leading-4 text-fg-secondary">
                        {form.rne
                          ? "Audiencia verificada en esta simulación."
                          : "Revisa la audiencia antes de programar."}
                      </p>
                      <button
                        type="button"
                        disabled={form.rne}
                        onClick={() => actualizar("rne", true)}
                        className={clasesBoton({
                          patron: "button",
                          variante: "secundario",
                          tamano: "sm",
                          className: "mt-2",
                        })}
                      >
                        {form.rne ? (
                          <Check
                            className="size-4"
                            aria-hidden="true"
                            strokeWidth={1.5}
                          />
                        ) : (
                          <ShieldCheck
                            className="size-4"
                            aria-hidden="true"
                            strokeWidth={1.5}
                          />
                        )}
                        {form.rne
                          ? "Verificación simulada lista"
                          : "Simular verificación RNE"}
                      </button>
                    </div>
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-5 text-fg">
                      <Checkbox
                        checked={form.datos}
                        onCheckedChange={(v) => actualizar("datos", v === true)}
                        aria-label="Simular política de datos disponible"
                        className="mt-0.5"
                      />
                      <span>
                        Política de datos disponible
                        <span className="mt-0.5 block text-xs leading-4 text-fg-secondary">
                          Marcar como lista para esta simulación.
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-5 text-fg">
                      <Checkbox
                        checked={form.minutos}
                        onCheckedChange={(v) =>
                          actualizar("minutos", v === true)
                        }
                        aria-label="Simular minutos disponibles"
                        className="mt-0.5"
                      />
                      <span>
                        Minutos disponibles
                        <span className="mt-0.5 block text-xs leading-4 text-fg-secondary">
                          Marcar como listos para esta simulación.
                        </span>
                      </span>
                    </label>
                  </div>
                </Tarjeta>
                <Tarjeta titulo="Cuándo puede llamar" icono={Clock3}>
                  <div className="space-y-4">
                    <FormField
                      etiqueta="Franja de atención"
                      tamanoEtiqueta="sm"
                    >
                      <SelectCrm
                        valor={form.franja}
                        onValorChange={(v) =>
                          actualizar(
                            "franja",
                            v === "manana" ? "manana" : "laboral",
                          )
                        }
                        opciones={[
                          {
                            valor: "laboral",
                            etiqueta: "Lun–vie · 9:00 a. m. – 5:00 p. m.",
                          },
                          {
                            valor: "manana",
                            etiqueta: "Lun–sáb · 8:00 a. m. – 3:00 p. m.",
                          },
                        ]}
                      />
                    </FormField>
                    <FormField
                      etiqueta="Fecha y hora de inicio"
                      tamanoEtiqueta="sm"
                      obligatorio
                      ayuda={<span className="text-fg-secondary">Zona horaria de la organización: {timezone}.</span>}
                      error={errorFecha}
                    >
                      <CampoFechaHora className="flex-col sm:flex-row [&>button:last-child]:w-full sm:[&>button:last-child]:w-[152px]" valor={form.fecha} onValorChange={(valor) => actualizar("fecha", valor)} />
                    </FormField>
                    <p className="text-xs leading-4 text-fg-secondary">
                      La campaña respeta la franja seleccionada. Puedes guardar
                      un borrador y decidir la programación después.
                    </p>
                  </div>
                </Tarjeta>
              </div>
              {!cumplimientoValido && (
                <p className="rounded-lg bg-warning-subtle p-3 text-xs leading-4 text-warning-text">
                  Puedes avanzar a la revisión y guardar un borrador. Para
                  programar, completa los tres requisitos simulados y elige una
                  fecha válida.
                </p>
              )}
            </div>
          )}

          {paso === "revision" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold leading-[22px] text-fg">
                  {form.nombre.trim() || "Revisa tu campaña"}
                </h3>
                <BadgeTono tono={sePuedeProgramar ? "exito" : "advertencia"}>
                  {sePuedeProgramar
                    ? "Lista en la simulación"
                    : "Preparada como borrador"}
                </BadgeTono>
              </div>
              <Tarjeta>
                <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-x-4 gap-y-3 text-[13px] leading-[18px] sm:grid-cols-[150px_minmax(0,1fr)]">
                  <dt className="text-fg-secondary">Audiencia</dt>
                  <dd className="text-fg">
                    {segmentoForm?.nombre} ·{" "}
                    {entero(segmentoForm?.elegibles ?? 0)} contactos
                  </dd>
                  <dt className="text-fg-secondary">Agente</dt>
                  <dd className="text-fg">
                    {agenteForm?.nombre ?? "Sin agente"}
                  </dd>
                  <dt className="text-fg-secondary">Voz</dt>
                  <dd className="text-fg">{vozForm?.nombre ?? "Sin voz"}</dd>
                  <dt className="text-fg-secondary">Objetivo del agente</dt>
                  <dd className="text-fg">{agenteForm?.objetivo ?? "—"}</dd>
                  <dt className="text-fg-secondary">Límites</dt>
                  <dd className="text-fg">
                    {form.diario}/día · {form.hora}/hora · {form.simultaneas}{" "}
                    simultáneas
                  </dd>
                  <dt className="text-fg-secondary">Franja</dt>
                  <dd className="text-fg">{franjaTexto(form.franja)}</dd>
                  <dt className="text-fg-secondary">Inicio</dt>
                  <dd className="text-fg">
                    {etiquetaFecha(form.fecha, timezone)}
                  </dd>
                </dl>
              </Tarjeta>
              <div className="flex flex-wrap gap-2">
                <BadgeTono tono={form.rne ? "exito" : "advertencia"}>
                  RNE {form.rne ? "listo" : "pendiente"}
                </BadgeTono>
                <BadgeTono tono={form.datos ? "exito" : "advertencia"}>
                  Política {form.datos ? "lista" : "pendiente"}
                </BadgeTono>
                <BadgeTono tono={form.minutos ? "exito" : "advertencia"}>
                  Minutos {form.minutos ? "listos" : "pendientes"}
                </BadgeTono>
              </div>
              {!sePuedeProgramar && (
                <div
                  role="status"
                  className="flex flex-wrap items-center gap-3 rounded-lg bg-warning-subtle p-3 text-xs leading-4 text-warning-text"
                >
                  <span className="min-w-0 flex-1">
                    Revisa los requisitos pendientes antes de programar, o
                    conserva la campaña como borrador.
                  </span>
                  <button
                    type="button"
                    className={clasesBoton({
                      patron: "button",
                      variante: "fantasma",
                      tamano: "sm",
                      className: "text-warning-text",
                    })}
                    onClick={() => setPaso("cumplimiento")}
                  >
                    <ArrowLeft
                      className="size-4"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    Revisar requisitos
                  </button>
                </div>
              )}
              <p className="flex gap-2 rounded-lg bg-info-subtle p-3 text-xs leading-4 text-info-text">
                <Info
                  className="size-4 shrink-0"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                Guardar o programar actualiza sólo esta propuesta. Los
                contactos, resultados y verificaciones son ficticios.
              </p>
            </div>
          )}
        </div>
      </Dialogo>
    </div>
  );
}
