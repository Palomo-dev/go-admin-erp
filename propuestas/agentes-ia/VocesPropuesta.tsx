"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  Headphones,
  Mic,
  Pause,
  Play,
  Plus,
  Star,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { AvatarIniciales } from "@/components/kit/AvatarIniciales";
import { Dialogo } from "@/components/kit/Dialogo";
import { EmptyState } from "@/components/kit/EmptyState";
import { FilterChips } from "@/components/kit/FilterChips";
import { FilterPanel } from "@/components/kit/FilterPanel";
import { FormField } from "@/components/kit/FormField";
import { HojaDetalle } from "@/components/kit/HojaDetalle";
import { ListToolbar } from "@/components/kit/ListToolbar";
import { RelatedLinkCard } from "@/components/kit/RelatedLinkCard";
import { RowActionsMenu } from "@/components/kit/RowActionsMenu";
import { SearchInput } from "@/components/kit/SearchInput";
import { StatusBadge } from "@/components/kit/StatusBadge";
import { Stepper } from "@/components/kit/Stepper";
import { TabBar, idPanel, idPestana } from "@/components/kit/TabBar";
import { Tarjeta } from "@/components/kit/Tarjeta";
import { clasesBoton } from "@/components/kit/botonClases";
import { SelectCrm } from "@/components/crm/kit/SelectCrm";
import { CLASE_CAMPO, CLASE_NOTA } from "@/components/crm/kit/camposCrm";
import type { AgenteDemo, RelacionDemo, VozDemo } from "./modelo";

const secundario = clasesBoton({
  patron: "button",
  variante: "secundario",
  tamano: "sm",
});
const primario = clasesBoton({
  patron: "button",
  variante: "primario",
  tamano: "sm",
});
const fantasma = clasesBoton({
  patron: "button",
  variante: "fantasma",
  tamano: "sm",
});
const TEXTO_MUESTRA =
  "Hola, soy tu asistente de GO Admin. Te acompaño a encontrar la mejor solución y a coordinar el siguiente paso.";
const PASOS_CLON = [
  { valor: "consentimiento", etiqueta: "Consentimiento" },
  { valor: "audio", etiqueta: "Muestra de voz" },
  { valor: "revision", etiqueta: "Revisión" },
] as const;
const ONDA = [
  8, 16, 12, 24, 30, 14, 20, 36, 24, 12, 32, 20, 14, 26, 36, 16, 12, 28, 20, 34,
  16, 10, 24, 30, 14, 20, 32, 18,
];

type Props = {
  voces: VozDemo[];
  agentes: AgenteDemo[];
  predeterminada: string;
  onVocesChange: (v: VozDemo[]) => void;
  onAgentesChange: (a: AgenteDemo[]) => void;
  onPredeterminada: (id: string) => void;
  onRelacion: (r: RelacionDemo) => void;
  onAviso: (s: string) => void;
  solicitudClonar: number;
  solicitudMisVoces: number;
  activo: boolean;
};

export function VocesPropuesta({
  voces,
  agentes,
  predeterminada,
  onVocesChange,
  onAgentesChange,
  onPredeterminada,
  onRelacion,
  onAviso,
  solicitudClonar,
  solicitudMisVoces,
  activo,
}: Props) {
  const [vista, setVista] = useState<"biblioteca" | "mias">("biblioteca");
  const [busqueda, setBusqueda] = useState("");
  const [pais, setPais] = useState("");
  const [genero, setGenero] = useState("");
  const [uso, setUso] = useState("");
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [asignarId, setAsignarId] = useState<string | null>(null);
  const [agenteId, setAgenteId] = useState(agentes[0]?.id ?? "");
  const [quitarId, setQuitarId] = useState<string | null>(null);
  const [reproduciendo, setReproduciendo] = useState<string | null>(null);
  const [audioAviso, setAudioAviso] = useState("");
  const [clonar, setClonar] = useState(false);
  const [pasoClon, setPasoClon] =
    useState<(typeof PASOS_CLON)[number]["valor"]>("consentimiento");
  const [consentimiento, setConsentimiento] = useState(false);
  const [nombreClon, setNombreClon] = useState("Mi voz");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorClon, setErrorClon] = useState("");
  const ultimaSolicitud = useRef(0);
  const ultimaSolicitudMisVoces = useRef(0);
  const audioClon = useRef<HTMLAudioElement | null>(null);
  const [urlArchivo, setUrlArchivo] = useState("");
  const detalles = voces.find((v) => v.id === detalleId);
  const asignada = voces.find((v) => v.id === asignarId);
  const quitar = voces.find((v) => v.id === quitarId);
  const filtros = [
    pais && { clave: "pais", etiqueta: `Acento: ${pais}` },
    genero && { clave: "genero", etiqueta: `Voz: ${genero}` },
    uso && { clave: "uso", etiqueta: `Uso: ${uso}` },
  ].filter((v): v is { clave: string; etiqueta: string } => !!v);
  const limpiar = () => {
    setPais("");
    setGenero("");
    setUso("");
    setBusqueda("");
  };
  const visibles = voces.filter(
    (v) =>
      (vista !== "mias" || v.guardada) &&
      (!pais || v.pais === pais) &&
      (!genero || v.genero === genero) &&
      (!uso || v.uso === uso) &&
      `${v.nombre} ${v.pais} ${v.estilo} ${v.descripcion}`
        .toLocaleLowerCase("es")
        .includes(busqueda.toLocaleLowerCase("es")),
  );

  useEffect(() => {
    if (activo) return;
    setDetalleId(null);
    setAsignarId(null);
    setQuitarId(null);
    setClonar(false);
    setFiltrosAbiertos(false);
    setReproduciendo(null);
  }, [activo]);
  useEffect(() => {
    if (solicitudClonar <= ultimaSolicitud.current) return;
    ultimaSolicitud.current = solicitudClonar;
    setClonar(true);
  }, [solicitudClonar]);
  useEffect(() => {
    if (solicitudMisVoces <= ultimaSolicitudMisVoces.current) return;
    ultimaSolicitudMisVoces.current = solicitudMisVoces;
    setVista("mias");
    setBusqueda("");
    setPais("");
    setGenero("");
    setUso("");
  }, [solicitudMisVoces]);
  useEffect(() => {
    if (!archivo) {
      setUrlArchivo("");
      return;
    }
    const url = URL.createObjectURL(archivo);
    setUrlArchivo(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);
  useEffect(() => {
    window.speechSynthesis?.getVoices();
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  const guardar = (voz: VozDemo) => {
    onVocesChange(
      voces.map((v) => (v.id === voz.id ? { ...v, guardada: true } : v)),
    );
    onAviso(
      `${voz.nombre} añadida a Mis voces. Ya puedes asignarla a un agente.`,
    );
  };
  const detener = () => {
    window.speechSynthesis?.cancel();
    setReproduciendo(null);
  };
  const escuchar = (voz: VozDemo) => {
    if (reproduciendo === voz.id) {
      detener();
      return;
    }
    detener();
    setAudioAviso("");
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      setAudioAviso(
        "Este navegador no ofrece muestras de voz del dispositivo. Puedes revisar el texto en el detalle.",
      );
      return;
    }
    const disponibles = window.speechSynthesis
      .getVoices()
      .filter((v) => v.lang.startsWith("es"));
    if (!disponibles.length) {
      setAudioAviso(
        "No hay una voz en español disponible en este dispositivo. El detalle incluye el texto de muestra.",
      );
      return;
    }
    const texto = new SpeechSynthesisUtterance(TEXTO_MUESTRA);
    texto.voice =
      disponibles.find(
        (v) =>
          v.lang ===
          `es-${voz.pais === "Colombia" ? "CO" : voz.pais === "México" ? "MX" : voz.pais === "Argentina" ? "AR" : "ES"}`,
      ) ?? disponibles[0];
    texto.lang = texto.voice.lang;
    texto.rate = voz.estilo === "Dinámica" ? 1.1 : 0.95;
    texto.onend = () => setReproduciendo(null);
    texto.onerror = () => {
      setReproduciendo(null);
      setAudioAviso(
        "No se pudo reproducir la muestra del dispositivo. Intenta otra vez.",
      );
    };
    setReproduciendo(voz.id);
    window.speechSynthesis.speak(texto);
  };
  const cambiarVista = (v: "biblioteca" | "mias") => {
    setVista(v);
    detener();
    limpiar();
  };
  const crearFicha = () => {
    if (!nombreClon.trim()) {
      setErrorClon("Escribe un nombre para tu voz.");
      return;
    }
    const nueva: VozDemo = {
      id: `clon-${Date.now()}`,
      nombre: nombreClon.trim(),
      pais: "Colombia",
      idioma: "Español",
      genero: "Personal",
      estilo: "Personal",
      uso: "Conversación",
      descripcion: "Ficha de voz personal.",
      guardada: true,
      clonada: true,
    };
    onVocesChange([...voces, nueva]);
    setVista("mias");
    limpiar();
    setClonar(false);
    setPasoClon("consentimiento");
    setArchivo(null);
    setConsentimiento(false);
    setNombreClon("Mi voz");
    setErrorClon("");
    onAviso("Ficha de voz añadida a Mis voces.");
  };

  return (
    <div className="flex flex-col gap-5">
      <TabBar
        id="vistas-voces"
        etiqueta="Vistas de voces"
        tamano="sm"
        valor={vista}
        onValorChange={cambiarVista}
        pestanas={[
          { valor: "biblioteca", etiqueta: "Biblioteca" },
          {
            valor: "mias",
            etiqueta: "Mis voces",
            contador: voces.filter((v) => v.guardada).length,
          },
        ]}
      />
      <section
        role="tabpanel"
        id={idPanel("vistas-voces", vista)}
        aria-labelledby={idPestana("vistas-voces", vista)}
        className="flex flex-col gap-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-fg">
              {vista === "biblioteca"
                ? "Encuentra la voz de tus agentes"
                : "Las voces de tu organización"}
            </h2>
            <p className="mt-1 text-[13px] leading-[18px] text-fg-secondary">
              {vista === "biblioteca"
                ? "Explora, escucha una muestra y añade las voces que encajan con tu marca."
                : "Asigna cada voz a un agente. Sus campañas usarán la misma voz."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRelacion({ tipo: "proveedores" })}
            className={fantasma}
          >
            <Headphones className="size-4" strokeWidth={1.5} />
            ElevenLabs
          </button>
        </div>
        <ListToolbar
          busqueda={
            <SearchInput
              value={busqueda}
              onChange={setBusqueda}
              onValueChange={setBusqueda}
              etiqueta="Buscar voces"
              placeholder="Buscar por nombre, acento o estilo…"
              atajo={activo ? "/" : false}
            />
          }
          filtros={
            <FilterPanel
              abierto={activo && filtrosAbiertos}
              onAbiertoChange={setFiltrosAbiertos}
              conteo={filtros.length}
              onLimpiar={limpiar}
              titulo="Filtrar voces"
              nota="Los filtros se aplican a la vista actual."
              textoVerResultados={`Ver ${visibles.length} voces`}
            >
              <div className="flex flex-col gap-4 p-4">
                <FormField etiqueta="Acento" tamanoEtiqueta="sm">
                  <SelectCrm
                    valor={pais}
                    onValorChange={setPais}
                    opcionVacia="Cualquier acento"
                    opciones={["Colombia", "España", "México", "Argentina"].map(
                      (v) => ({ valor: v, etiqueta: v }),
                    )}
                  />
                </FormField>
                <FormField etiqueta="Tipo de voz" tamanoEtiqueta="sm">
                  <SelectCrm
                    valor={genero}
                    onValorChange={setGenero}
                    opcionVacia="Cualquier voz"
                    opciones={["Femenina", "Masculina", "Personal"].map(
                      (v) => ({ valor: v, etiqueta: v }),
                    )}
                  />
                </FormField>
                <FormField etiqueta="Uso" tamanoEtiqueta="sm">
                  <SelectCrm
                    valor={uso}
                    onValorChange={setUso}
                    opcionVacia="Cualquier uso"
                    opciones={["Conversación", "Narración"].map((v) => ({
                      valor: v,
                      etiqueta: v,
                    }))}
                  />
                </FormField>
              </div>
            </FilterPanel>
          }
          chips={
            <FilterChips
              chips={filtros}
              onQuitar={(k) => {
                if (k === "pais") setPais("");
                if (k === "genero") setGenero("");
                if (k === "uso") setUso("");
              }}
              onLimpiarTodo={limpiar}
            />
          }
        />
        {audioAviso && (
          <div role="status" className={CLASE_NOTA}>
            <Headphones className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            <span>{audioAviso}</span>
          </div>
        )}
        {visibles.length ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibles.map((voz) => {
                const vinculados = agentes.filter((a) => a.vozId === voz.id);
                const activa = reproduciendo === voz.id;
                return (
                  <Tarjeta
                    key={voz.id}
                    className="voice-card"
                    pie={
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          className={secundario}
                          onClick={() => escuchar(voz)}
                          aria-label={`${activa ? "Detener" : "Escuchar"} muestra de ${voz.nombre}`}
                        >
                          {activa ? (
                            <Pause className="size-4" strokeWidth={1.5} />
                          ) : (
                            <Play className="size-4" strokeWidth={1.5} />
                          )}
                          {activa ? "Detener" : "Escuchar"}
                        </button>
                        {vista === "mias" ? (
                          <button
                            type="button"
                            className={secundario}
                            onClick={() => {
                              setAsignarId(voz.id);
                              setAgenteId(
                                vinculados[0]?.id ?? agentes[0]?.id ?? "",
                              );
                            }}
                          >
                            Asignar a agente
                          </button>
                        ) : voz.guardada ? (
                          <span className="flex items-center gap-1.5 text-xs text-fg-secondary">
                            <Check
                              className="size-4 text-success-text"
                              strokeWidth={1.5}
                            />
                            En mis voces
                          </span>
                        ) : (
                          <button
                            type="button"
                            className={secundario}
                            onClick={() => guardar(voz)}
                            aria-label={`Añadir ${voz.nombre} a Mis voces`}
                          >
                            <Plus className="size-4" strokeWidth={1.5} />
                            Añadir
                          </button>
                        )}
                      </div>
                    }
                  >
                    <div className="flex items-start gap-3">
                      <AvatarIniciales
                        nombre={voz.nombre}
                        tamano="md"
                        tono="marcaSuave"
                      />
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          className="rounded text-left text-base font-semibold leading-6 text-fg hover:text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          onClick={() => setDetalleId(voz.id)}
                        >
                          {voz.nombre}
                        </button>
                        <p className="text-xs leading-4 text-fg-secondary">
                          {voz.idioma} · {voz.pais}
                        </p>
                      </div>
                      <RowActionsMenu
                        titulo={voz.nombre}
                        acciones={[
                          {
                            id: "detalle",
                            etiqueta: "Ver detalle",
                            icono: Headphones,
                            onSelect: () => setDetalleId(voz.id),
                          },
                          {
                            id: "predeterminada",
                            etiqueta: "Usar por defecto",
                            icono: Star,
                            onSelect: () => {
                              onPredeterminada(voz.id);
                              onAviso(
                                `${voz.nombre} es la voz por defecto.`,
                              );
                            },
                            oculta: !voz.guardada || predeterminada === voz.id,
                          },
                          {
                            id: "quitar",
                            etiqueta: "Quitar de Mis voces",
                            icono: Trash2,
                            onSelect: () => setQuitarId(voz.id),
                            destructiva: true,
                            oculta: !voz.guardada,
                            deshabilitada:
                              !!vinculados.length || predeterminada === voz.id,
                            motivo:
                              "Primero cambia la voz de los agentes asignados y la voz por defecto.",
                          },
                        ]}
                      />
                    </div>
                    <div
                      className="mt-4 flex h-9 items-center justify-between gap-1.5 overflow-hidden rounded-lg bg-subtle px-3"
                      aria-hidden="true"
                    >
                      {ONDA.map((altura, i) => (
                        <span
                          key={i}
                          className={`w-[3px] shrink-0 rounded-full ${activa ? "bg-brand-action animate-pulse" : "bg-line-strong"}`}
                          style={{ height: `${altura * 0.65}px` }}
                        />
                      ))}
                    </div>
                    <p className="mt-3 min-h-[36px] text-[13px] leading-[18px] text-fg-secondary">
                      {voz.descripcion}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <StatusBadge
                        estado="voz"
                        etiqueta={voz.estilo}
                        tono="neutro"
                      />
                      <StatusBadge
                        estado="uso"
                        etiqueta={voz.uso}
                        tono="neutro"
                      />
                      {voz.clonada && (
                        <StatusBadge
                          estado="clonada"
                          etiqueta="Ficha personal"
                          tono="marca"
                        />
                      )}
                    </div>
                    {vista === "mias" && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs text-fg-secondary">
                        <Bot className="size-3.5" strokeWidth={1.5} />
                        <span>
                          {vinculados.length
                            ? `${vinculados.length} ${vinculados.length === 1 ? "agente asignado" : "agentes asignados"}`
                            : "Sin agentes asignados"}
                        </span>
                        {predeterminada === voz.id && (
                          <StatusBadge
                            estado="default"
                            etiqueta="Por defecto"
                            tono="marca"
                            icono={Star}
                          />
                        )}
                      </div>
                    )}
                  </Tarjeta>
                );
              })}
            </div>
            <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-fg-secondary">
                {visibles.length} {visibles.length === 1 ? "voz" : "voces"} ·
                Español
              </p>
            </div>
          </>
        ) : (
          <Tarjeta>
            <EmptyState
              variante="search"
              titulo="No encontramos voces"
              descripcion="Prueba otro nombre, acento o uso."
              onLimpiarFiltros={limpiar}
            />
          </Tarjeta>
        )}
      </section>

      <HojaDetalle
        abierto={activo && !!detalles}
        onAbiertoChange={(abierto) => !abierto && setDetalleId(null)}
        titulo={detalles?.nombre ?? "Voz"}
        subtitulo={detalles ? `${detalles.idioma} · ${detalles.pais}` : ""}
        insignia={
          <StatusBadge
            estado="voz"
            etiqueta={detalles?.guardada ? "En mis voces" : "Biblioteca"}
            tono="marca"
          />
        }
        pie={
          detalles && (
            <>
              <button
                type="button"
                className={secundario}
                onClick={() => escuchar(detalles)}
              >
                <Play className="size-4" strokeWidth={1.5} />
                Escuchar muestra
              </button>
              <button
                type="button"
                className={primario}
                onClick={() => {
                  if (!detalles.guardada) guardar(detalles);
                  setAsignarId(detalles.id);
                  setDetalleId(null);
                }}
              >
                Asignar a agente
              </button>
            </>
          )
        }
      >
        {detalles && (
          <div className="flex flex-col gap-5">
            <Tarjeta
              titulo="Una conversación con tu marca"
              descripcion={detalles.descripcion}
            >
              <p className="rounded-lg bg-subtle p-3 text-[13px] leading-5 text-fg">
                “{TEXTO_MUESTRA}”
              </p>
            </Tarjeta>
            <div>
              <h3 className="mb-3 text-sm font-semibold">
                Agentes que usan esta voz
              </h3>
              <div className="flex flex-col gap-2">
                {agentes
                  .filter((a) => a.vozId === detalles.id)
                  .map((a) => (
                    <RelatedLinkCard
                      key={a.id}
                      icono={Bot}
                      etiqueta={a.objetivo}
                      valor={a.nombre}
                      onAccion={() => {
                        setDetalleId(null);
                        onRelacion({ tipo: "agente", id: a.id });
                      }}
                    />
                  ))}
                {!agentes.some((a) => a.vozId === detalles.id) && (
                  <p className="text-[13px] text-fg-secondary">
                    Esta voz aún no tiene agentes asignados.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </HojaDetalle>
      <Dialogo
        abierto={activo && !!asignada}
        onAbiertoChange={(abierto) => !abierto && setAsignarId(null)}
        titulo={`Asignar ${asignada?.nombre ?? "voz"} a un agente`}
        descripcion="El agente y sus campañas usarán esta voz. Puedes cambiarla después."
        icono={Bot}
        primario={{
          etiqueta: "Asignar voz",
          deshabilitada: !agenteId,
          motivo: "Selecciona un agente.",
          onClick: () => {
            if (!asignada) return;
            onAgentesChange(
              agentes.map((a) =>
                a.id === agenteId ? { ...a, vozId: asignada.id } : a,
              ),
            );
            onAviso(
              `${asignada.nombre} asignada a ${agentes.find((a) => a.id === agenteId)?.nombre}.`,
            );
            setAsignarId(null);
          },
        }}
      >
        <FormField etiqueta="Agente" obligatorio>
          <SelectCrm
            valor={agenteId}
            onValorChange={setAgenteId}
            opciones={agentes.map((a) => ({ valor: a.id, etiqueta: a.nombre }))}
          />
        </FormField>
        <p className={CLASE_NOTA}>
          <Users className="size-4 shrink-0" strokeWidth={1.5} />
          La audiencia y el guion del agente se conservan.
        </p>
      </Dialogo>
      <Dialogo
        abierto={activo && !!quitar}
        onAbiertoChange={(abierto) => !abierto && setQuitarId(null)}
        titulo={`¿Quitar ${quitar?.nombre ?? "voz"} de Mis voces?`}
        descripcion="La voz seguirá disponible en la biblioteca."
        primario={{
          etiqueta: "Quitar voz",
          destructiva: true,
          onClick: () => {
            if (
              !quitar ||
              agentes.some((a) => a.vozId === quitar.id) ||
              predeterminada === quitar.id
            )
              return;
            onVocesChange(
              voces.map((v) =>
                v.id === quitar.id ? { ...v, guardada: false } : v,
              ),
            );
            onAviso("Voz retirada de Mis voces.");
            setQuitarId(null);
          },
        }}
      />

      <Dialogo
        abierto={activo && clonar}
        onAbiertoChange={setClonar}
        titulo="Clonar mi voz"
        icono={Mic}
        descripcion="Prepara una voz personal para tus agentes."
        ancho={672}
        secundarios={
          pasoClon !== "consentimiento"
            ? [
                {
                  etiqueta: "Atrás",
                  onClick: () => {
                    setErrorClon("");
                    setPasoClon(
                      pasoClon === "revision" ? "audio" : "consentimiento",
                    );
                  },
                },
              ]
            : undefined
        }
        primario={{
          etiqueta:
            pasoClon === "revision" ? "Crear ficha de voz" : "Siguiente",
          onClick: () => {
            setErrorClon("");
            if (pasoClon === "consentimiento") {
              if (!consentimiento) {
                setErrorClon("Confirma que esta es tu voz y autorizas su uso.");
                return;
              }
              setPasoClon("audio");
            } else if (pasoClon === "audio") {
              if (!archivo) {
                setErrorClon("Selecciona una muestra de audio para continuar.");
                return;
              }
              setPasoClon("revision");
            } else crearFicha();
          },
        }}
      >
        <Stepper
          pasos={PASOS_CLON}
          actual={pasoClon}
          etiqueta="Crear voz personal"
          resumenMovil={(n, total, etiqueta) =>
            `Paso ${n} de ${total} · ${etiqueta}`
          }
          onPasoClick={setPasoClon}
        />
        {errorClon && (
          <p
            role="alert"
            className="rounded-lg bg-danger-subtle p-3 text-sm text-danger-text"
          >
            {errorClon}
          </p>
        )}
        {pasoClon === "consentimiento" && (
          <Tarjeta titulo="Tu voz, con tu autorización" icono={Mic}>
            <p className="mb-4 text-[13px] leading-5 text-fg-secondary">
              Usa una grabación propia, clara y sin música. El consentimiento
              queda asociado a la voz al integrar este flujo.
            </p>
            <label className="flex items-start gap-3 text-sm text-fg">
              <input
                className="mt-0.5 size-4 accent-brand-action"
                type="checkbox"
                checked={consentimiento}
                onChange={(e) => setConsentimiento(e.target.checked)}
              />
              Confirmo que la grabación contiene mi propia voz y autorizo su uso
              por los agentes de mi organización.
            </label>
          </Tarjeta>
        )}
        {pasoClon === "audio" && (
          <Tarjeta
            titulo="Añade una muestra"
            descripcion="MP3, WAV o M4A · hasta 10 MB"
            icono={Upload}
          >
            <FormField etiqueta="Archivo de audio" obligatorio>
              <input
                type="file"
                accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a"
                className="w-full rounded-lg border border-dashed border-line-strong p-4 text-sm text-fg-secondary file:mr-3 file:rounded-md file:border-0 file:bg-brand-tint file:px-3 file:py-2 file:text-brand-deep"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (
                    f.size > 10 * 1024 * 1024 ||
                    !/\.(mp3|wav|m4a)$/i.test(f.name)
                  ) {
                    setArchivo(null);
                    e.target.value = "";
                    setErrorClon("Usa un MP3, WAV o M4A de hasta 10 MB.");
                    return;
                  }
                  setErrorClon("");
                  setArchivo(f);
                }}
              />
            </FormField>
            {archivo && (
              <div className="mt-3 min-w-0">
                <p className="mb-2 truncate text-xs text-fg-secondary">
                  {archivo.name}
                </p>
                <audio
                  ref={audioClon}
                  controls
                  src={urlArchivo}
                  className="w-full"
                  preload="metadata"
                />
              </div>
            )}
          </Tarjeta>
        )}
        {pasoClon === "revision" && (
          <div className="flex flex-col gap-4">
            <FormField
              etiqueta="Nombre de la voz"
              obligatorio
              error={errorClon || undefined}
            >
              <input
                className={CLASE_CAMPO}
                value={nombreClon}
                maxLength={60}
                onChange={(e) => setNombreClon(e.target.value)}
              />
            </FormField>
            <Tarjeta titulo="Todo en un solo lugar" icono={Check}>
              <p className="text-[13px] text-fg-secondary">
                Muestra: {archivo?.name} · autorización confirmada.
              </p>
              <p className="mt-3 text-[13px] leading-5 text-fg-secondary">
                La ficha quedará disponible en Mis voces para asignarla a tus
                agentes.
              </p>
            </Tarjeta>
          </div>
        )}
      </Dialogo>
    </div>
  );
}
