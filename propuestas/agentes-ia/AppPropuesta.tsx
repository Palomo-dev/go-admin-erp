"use client";

import { useEffect, useState } from "react";
import {
  Bot,
  Calendar,
  Check,
  ChevronRight,
  GitBranch,
  Headphones,
  Mic,
  Phone,
  Plus,
  Send,
  Users,
  X,
} from "lucide-react";
import { AvatarIniciales } from "@/components/kit/AvatarIniciales";
import { HojaDetalle } from "@/components/kit/HojaDetalle";
import { PageHeader } from "@/components/kit/PageHeader";
import { RelatedLinkCard } from "@/components/kit/RelatedLinkCard";
import { SegmentedControl } from "@/components/kit/SegmentedControl";
import { StatusBadge } from "@/components/kit/StatusBadge";
import { Tarjeta } from "@/components/kit/Tarjeta";
import { clasesBoton } from "@/components/kit/botonClases";
import { CampanasPropuesta } from "./CampanasPropuesta";
import { VocesPropuesta } from "./VocesPropuesta";
import {
  AGENTES_INICIALES,
  CAMPANAS_INICIALES,
  SEGMENTOS_DEMO,
  VOCES_INICIALES,
  type RelacionDemo,
} from "./modelo";

const primario = clasesBoton({
  patron: "button",
  variante: "primario",
  tamano: "md",
});
const secundario = clasesBoton({
  patron: "button",
  variante: "secundario",
  tamano: "sm",
});
const fantasma = clasesBoton({
  patron: "button",
  variante: "fantasma",
  tamano: "sm",
});
const TITULOS_RELACION = {
  agente: "Detalle del agente",
  segmento: "Audiencia de la campaña",
  llamadas: "Llamadas de la campaña",
  calendario: "Reuniones agendadas",
  proveedores: "Proveedores e IA",
  pipeline: "Pipeline comercial",
};

export function AppPropuesta() {
  const [tab, setTab] = useState<"agentes" | "voces" | "campanas">("voces");
  const [voces, setVoces] = useState(VOCES_INICIALES);
  const [agentes, setAgentes] = useState(AGENTES_INICIALES);
  const [campanas, setCampanas] = useState(CAMPANAS_INICIALES);
  const [predeterminada, setPredeterminada] = useState("valentina");
  const [solicitudClonar, setSolicitudClonar] = useState(0);
  const [solicitudMisVoces, setSolicitudMisVoces] = useState(0);
  const [solicitudNueva, setSolicitudNueva] = useState(0);
  const [agenteInicial, setAgenteInicial] = useState<string>();
  const [relacion, setRelacion] = useState<RelacionDemo | null>(null);
  const [aviso, setAviso] = useState("");
  const agente = agentes.find((a) => a.id === relacion?.id) ?? agentes[0];
  const vozAgente = voces.find((v) => v.id === agente.vozId);
  const segmento =
    SEGMENTOS_DEMO.find((s) => s.id === relacion?.id) ?? SEGMENTOS_DEMO[0];

  useEffect(() => {
    const manejar = (event: Event) => {
      const ruta = (event as CustomEvent<{ ruta: string }>).detail?.ruta ?? "";
      if (/agentes-ia/.test(ruta)) {
        setTab("agentes");
        return;
      }
      if (/campanas/.test(ruta)) {
        setTab("campanas");
        return;
      }
      setRelacion({
        tipo: /calendario/.test(ruta)
          ? "calendario"
          : /llamadas/.test(ruta)
            ? "llamadas"
            : /configuracion/.test(ruta)
              ? "proveedores"
              : /pipeline|oportunidades/.test(ruta)
                ? "pipeline"
                : "segmento",
      });
    };
    window.addEventListener("propuesta-relacion", manejar);
    return () => window.removeEventListener("propuesta-relacion", manejar);
  }, []);

  const nuevaCampana = (id?: string) => {
    setAgenteInicial(id);
    setRelacion(null);
    setTab("campanas");
    setSolicitudNueva((v) => v + 1);
  };
  const cambiarTab = (v: "agentes" | "voces" | "campanas") => {
    window.speechSynthesis?.cancel();
    setAviso("");
    setTab(v);
  };
  const accion =
    tab === "campanas" ? (
      <button type="button" className={primario} onClick={() => nuevaCampana()}>
        <Plus aria-hidden className="size-4" strokeWidth={1.5} />
        Nueva campaña
      </button>
    ) : tab === "voces" ? (
      <button
        type="button"
        className={primario}
        onClick={() => setSolicitudClonar((v) => v + 1)}
      >
        <Mic aria-hidden className="size-4" strokeWidth={1.5} />
        Clonar mi voz
      </button>
    ) : (
      <button
        type="button"
        className={primario}
        onClick={() => cambiarTab("voces")}
      >
        <Headphones aria-hidden className="size-4" strokeWidth={1.5} />
        Explorar voces
      </button>
    );

  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 pb-8 lg:p-6">
      <PageHeader
        className="max-lg:hidden"
        titulo="Agentes IA de voz"
        subtitulo="Quién llama, con qué voz y con qué objetivo"
        icono={Bot}
        migas={[{ etiqueta: "CRM" }, { etiqueta: "Agentes IA" }]}
        acciones={accion}
        movil={{ accion }}
      />
      <div>
        <SegmentedControl
          valor={tab}
          onValorChange={cambiarTab}
          etiqueta="Secciones de Agentes IA"
          opciones={[
            { valor: "agentes", etiqueta: "Agentes" },
            { valor: "voces", etiqueta: "Voces" },
            { valor: "campanas", etiqueta: "Campañas" },
          ]}
        />
      </div>
      {aviso && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-line-success bg-success-subtle px-3 py-2.5 text-[13px] leading-[18px] text-success-text"
        >
          <Check className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          <span className="min-w-0 flex-1">{aviso}</span>
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => setAviso("")}
            className="flex size-5 shrink-0 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X className="size-3.5" strokeWidth={1.5} />
          </button>
        </div>
      )}
      <div hidden={tab !== "voces"}>
        <VocesPropuesta
          activo={tab === "voces"}
          voces={voces}
          agentes={agentes}
          predeterminada={predeterminada}
          onVocesChange={setVoces}
          onAgentesChange={setAgentes}
          onPredeterminada={setPredeterminada}
          onRelacion={setRelacion}
          onAviso={setAviso}
          solicitudClonar={solicitudClonar}
          solicitudMisVoces={solicitudMisVoces}
        />
      </div>
      <div hidden={tab !== "campanas"}>
        <CampanasPropuesta
          activo={tab === "campanas"}
          voces={voces}
          agentes={agentes}
          campanas={campanas}
          onCampanasChange={setCampanas}
          onRelacion={setRelacion}
          onAviso={setAviso}
          solicitudNueva={solicitudNueva}
          agenteInicial={agenteInicial}
        />
      </div>
      {tab === "agentes" && (
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="text-base font-semibold">
              Una voz para cada conversación
            </h2>
            <p className="mt-1 text-[13px] text-fg-secondary">
              Los agentes conservan su guion por etapas. Sus campañas heredan la
              voz que asignes.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {agentes.map((a) => (
              <Tarjeta
                key={a.id}
                titulo={a.nombre}
                descripcion={a.objetivo}
                icono={Bot}
                accion={
                  <StatusBadge
                    estado={a.activo ? "active" : "inactive"}
                    etiqueta={a.activo ? "Activo" : "Inactivo"}
                  />
                }
                pie={
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      className={secundario}
                      onClick={() => setRelacion({ tipo: "agente", id: a.id })}
                    >
                      Ver detalle
                    </button>
                    <button
                      type="button"
                      className={fantasma}
                      disabled={!a.activo}
                      title={
                        !a.activo
                          ? "Activa el agente antes de crear su campaña."
                          : undefined
                      }
                      onClick={() => nuevaCampana(a.id)}
                    >
                      <Send className="size-4" strokeWidth={1.5} />
                      Crear campaña
                    </button>
                  </div>
                }
              >
                <div className="flex items-center gap-2 text-[13px] text-fg-secondary">
                  <Mic className="size-4" strokeWidth={1.5} />
                  <span>
                    {voces.find((v) => v.id === a.vozId)?.nombre} · Español
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {a.etapas.map((e) => (
                    <StatusBadge
                      key={e}
                      estado="etapa"
                      etiqueta={e}
                      tono="marca"
                    />
                  ))}
                </div>
                <p className="mt-4 text-xs text-fg-secondary">
                  {campanas.filter((c) => c.agenteId === a.id).length} campañas
                  relacionadas
                </p>
              </Tarjeta>
            ))}
          </div>
        </div>
      )}

      <HojaDetalle
        abierto={!!relacion}
        onAbiertoChange={(a) => !a && setRelacion(null)}
        titulo={relacion ? TITULOS_RELACION[relacion.tipo] : ""}
        ancho={560}
      >
        {relacion?.tipo === "agente" && (
          <div className="flex flex-col gap-4">
            <Tarjeta
              titulo={agente.nombre}
              descripcion={agente.objetivo}
              icono={Bot}
              accion={
                <StatusBadge estado={agente.activo ? "active" : "inactive"} />
              }
            >
              <div className="flex items-center gap-3">
                <AvatarIniciales
                  nombre={vozAgente?.nombre ?? "Voz"}
                  tono="marcaSuave"
                />
                <div>
                  <p className="text-sm font-medium">{vozAgente?.nombre}</p>
                  <p className="text-xs text-fg-secondary">
                    Voz asignada · {vozAgente?.pais}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {agente.etapas.map((e) => (
                  <StatusBadge
                    key={e}
                    estado="etapa"
                    etiqueta={e}
                    tono="marca"
                  />
                ))}
              </div>
            </Tarjeta>
            <RelatedLinkCard
              icono={Headphones}
              etiqueta="Cambiar la voz"
              valor="Mis voces"
              textoAccion="Abrir"
              onAccion={() => {
                setRelacion(null);
                setTab("voces");
                setSolicitudMisVoces((v) => v + 1);
              }}
            />
            <RelatedLinkCard
              icono={Send}
              etiqueta="Campañas del agente"
              valor={campanas.filter((c) => c.agenteId === agente.id).length}
              onAccion={() => {
                setRelacion(null);
                setTab("campanas");
              }}
            />
            <button
              type="button"
              className={primario}
              disabled={!agente.activo}
              title={
                !agente.activo
                  ? "Activa el agente antes de crear su campaña."
                  : undefined
              }
              onClick={() => nuevaCampana(agente.id)}
            >
              <Plus className="size-4" strokeWidth={1.5} />
              Crear campaña con este agente
            </button>
          </div>
        )}
        {relacion?.tipo === "segmento" && (
          <div className="flex flex-col gap-4">
            <Tarjeta
              titulo={segmento.nombre}
              descripcion={segmento.descripcion}
              icono={Users}
            >
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-2xl font-semibold tabular-nums">
                    {segmento.total}
                  </p>
                  <p className="text-xs text-fg-secondary">En el segmento</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">
                    {segmento.excluidos}
                  </p>
                  <p className="text-xs text-fg-secondary">Excluidos</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">
                    {segmento.elegibles}
                  </p>
                  <p className="text-xs text-fg-secondary">Elegibles</p>
                </div>
              </div>
            </Tarjeta>
            <p className="rounded-lg bg-subtle p-3 text-[13px] leading-5 text-fg-secondary">
              Contactos con teléfono válido, consentimiento y exclusiones RNE.
            </p>
            {["Contacto A", "Contacto B", "Contacto C"].map((n, i) => (
              <RelatedLinkCard
                key={n}
                icono={Users}
                etiqueta={
                  i === 2
                    ? "Excluido · no volver a llamar"
                    : "Elegible · consentimiento registrado"
                }
                valor={n}
              />
            ))}
            <RelatedLinkCard
              icono={GitBranch}
              etiqueta="Pipeline relacionado"
              valor="Pipeline comercial"
              onAccion={() => setRelacion({ tipo: "pipeline" })}
            />
          </div>
        )}
        {relacion?.tipo === "llamadas" && (
          <div className="flex flex-col gap-4">
            <Tarjeta
              titulo="Historial de llamadas"
              icono={Phone}
              descripcion="Campaña, agente, cliente y oportunidad en el mismo historial."
            />
            {[
              {
                nombre: "Contacto A",
                estado: "Reunión agendada",
                duracion: "3 min 20 s",
              },
              {
                nombre: "Contacto B",
                estado: "Contacto efectivo",
                duracion: "2 min 10 s",
              },
              {
                nombre: "Contacto C",
                estado: "No contestó",
                duracion: "0 min",
              },
            ].map((c) => (
              <Tarjeta
                key={c.nombre}
                titulo={c.nombre}
                descripcion={c.duracion}
                icono={Phone}
                accion={
                  <StatusBadge
                    estado="resultado"
                    etiqueta={c.estado}
                    tono={c.estado === "No contestó" ? "neutro" : "exito"}
                  />
                }
              />
            ))}
            <RelatedLinkCard
              icono={Calendar}
              etiqueta="Siguiente paso"
              valor="Reuniones agendadas"
              onAccion={() => setRelacion({ tipo: "calendario" })}
            />
          </div>
        )}
        {relacion?.tipo === "calendario" && (
          <Tarjeta
            titulo="Seguimiento comercial"
            descripcion="Reuniones vinculadas al cliente y a su oportunidad."
            icono={Calendar}
          >
            <p className="text-[13px] leading-5 text-fg-secondary">
              El agente propone o agenda según las herramientas autorizadas. La
              reunión aparece en Calendario y en la ficha comercial.
            </p>
            <div className="mt-4 rounded-lg border border-line p-3">
              <p className="text-sm font-medium">Demostración del producto</p>
              <p className="mt-1 text-xs text-fg-secondary">
                Contacto A · 6 oct, 10:00 a. m.
              </p>
              <StatusBadge
                className="mt-2"
                estado="scheduled"
                etiqueta="Agendada"
              />
            </div>
          </Tarjeta>
        )}
        {relacion?.tipo === "pipeline" && (
          <Tarjeta
            titulo="Pipeline comercial"
            descripcion="Un guion y un objetivo para cada etapa."
            icono={GitBranch}
          >
            <div className="flex flex-col gap-3">
              {["Contacto inicial", "Propuesta", "Negociación", "Ganado"].map(
                (e, i) => (
                  <div
                    key={e}
                    className="flex items-center gap-3 rounded-lg border border-line p-3"
                  >
                    <span className="flex size-7 items-center justify-center rounded-full bg-brand-tint text-xs font-semibold text-brand-deep">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm">{e}</span>
                    <ChevronRight
                      className="size-4 text-fg-secondary"
                      strokeWidth={1.5}
                    />
                  </div>
                ),
              )}
            </div>
          </Tarjeta>
        )}
        {relacion?.tipo === "proveedores" && (
          <div className="flex flex-col gap-4">
            <Tarjeta
              titulo="Voz y telefonía, con el mismo contexto"
              descripcion="Configuración compartida de CRM · Proveedores e IA"
              icono={Headphones}
            >
              <RelatedLinkCard
                icono={Mic}
                etiqueta="Voces del agente"
                valor="ElevenLabs"
              />
              <div className="mt-2">
                <RelatedLinkCard
                  icono={Phone}
                  etiqueta="Llamadas"
                  valor="Telefonía de la organización"
                />
              </div>
            </Tarjeta>
          </div>
        )}
      </HojaDetalle>
    </div>
  );
}
