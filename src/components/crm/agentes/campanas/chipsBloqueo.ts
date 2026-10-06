/**
 * Chips «por qué no marca» de una campaña de voz en marcha (Figma CRM
 * 1809:144962 y móvil 1809:908240). Pura: decide QUÉ chips se pintan a partir
 * del diagnóstico del servidor; no evalúa ninguna regla.
 *
 * Fuentes, en este orden:
 *  1. Los motivos de la organización que bloquean (sin minutos, sin política…).
 *  2. La compuerta REAL de reclamo (`crm_voice_campana_bloqueos`, migración
 *     pendiente 20261006210000) con cuántas pendientes frena cada motivo.
 *  3. Los motivos de la campaña del diagnóstico en TypeScript (franja, topes,
 *     consentimiento, reprogramadas por la Ley 2300) — los que la compuerta ya
 *     dijo con su conteo no se repiten.
 */
import type { TonoBadge } from "@/components/kit/estadoTono";
import type { BloqueoCompuerta, DiagnosticoCampana, Motivo } from "@/lib/services/crm/voiceCampaignDiagnostics";

export interface ChipBloqueo {
  /** Clave de `vozCampanasDisparo.chips.*`. */
  clave: string;
  tono: TonoBadge;
  datos: Record<string, string | number>;
  /** Código del motivo con texto largo en `vozCampanasDisparo.motivos.*` (tooltip), si lo hay. */
  motivo?: string;
}

/** Familia del chip → tono. Una familia aparece una sola vez. */
const TONOS: Record<string, TonoBadge> = {
  fuera_de_horario: "advertencia",
  fuera_de_horario_legal: "advertencia",
  ley2300: "informacion",
  sin_minutos: "peligro",
  tope_diario: "advertencia",
  tope_hora: "advertencia",
  tope_cliente_dia: "neutro",
  concurrencia: "neutro",
  sin_consentimiento: "peligro",
  sin_telefono: "advertencia",
  sin_objetivos: "neutro",
  sin_politica_datos: "peligro",
  agente_voz_apagado: "peligro",
  canal_inactivo: "peligro",
  sin_comm_settings: "peligro",
  sin_numero_propio: "peligro",
  agente_inactivo: "peligro",
  agente_no_encontrado: "peligro",
  campana_no_activa: "neutro",
  reserva_pendiente: "neutro",
  programada: "neutro",
};

/** Código del diagnóstico TS → familia de chip (los que no están no son chip). */
const DESDE_MOTIVO: Record<string, string> = {
  fuera_de_franja_campana: "fuera_de_horario",
  fuera_de_franja_cliente: "fuera_de_horario_legal",
  ley2300_reprogramadas: "ley2300",
  sin_minutos: "sin_minutos",
  tope_diario: "tope_diario",
  tope_hora: "tope_hora",
  objetivos_sin_consentimiento: "sin_consentimiento",
  objetivos_sin_telefono: "sin_telefono",
  sin_objetivos: "sin_objetivos",
  sin_politica_datos: "sin_politica_datos",
  agente_voz_apagado: "agente_voz_apagado",
  canal_inactivo: "canal_inactivo",
  sin_comm_settings: "sin_comm_settings",
  sin_numero_propio: "sin_numero_propio",
  agente_inactivo: "agente_inactivo",
  agente_no_encontrado: "agente_no_encontrado",
};

/** Código de la compuerta SQL → familia de chip. `no_reclamable` no es un bloqueo. */
const DESDE_COMPUERTA: Record<string, string> = {
  ley2300_reprogramada: "ley2300",
  programada: "programada",
  agente_inactivo: "agente_inactivo",
  agente_voz_apagado: "agente_voz_apagado",
  sin_politica_datos: "sin_politica_datos",
  sin_consentimiento: "sin_consentimiento",
  campana_no_activa: "campana_no_activa",
  reserva_pendiente: "reserva_pendiente",
  sin_minutos: "sin_minutos",
  concurrencia: "concurrencia",
  tope_diario: "tope_diario",
  tope_hora: "tope_hora",
  tope_cliente_dia: "tope_cliente_dia",
};

function chipDeMotivo(m: Motivo): ChipBloqueo | null {
  const familia = DESDE_MOTIVO[m.codigo];
  if (!familia) return null;
  const datos = (m.datos ?? {}) as Record<string, string | number>;
  return { clave: familia, tono: TONOS[familia] ?? "neutro", datos: { n: Number(datos.n ?? datos.bloqueados ?? datos.sinTelefono ?? 0), ...datos }, motivo: m.codigo };
}

function chipDeCompuerta(b: BloqueoCompuerta): ChipBloqueo | null {
  const familia = DESDE_COMPUERTA[b.motivo];
  if (!familia || b.cantidad <= 0) return null;
  return { clave: familia, tono: TONOS[familia] ?? "neutro", datos: { n: b.cantidad, proxima: b.proximo ?? "" } };
}

/**
 * Chips de una campaña. Solo para campañas en marcha (una pausada o detenida
 * ya lo dice su estado). Los avisos que no bloquean de la campaña (p. ej.
 * «3 de 25 sin teléfono») no son chip salvo las reprogramadas por la Ley 2300.
 */
export function chipsDeCampana(campana: DiagnosticoCampana | undefined, organizacion: readonly Motivo[]): ChipBloqueo[] {
  if (!campana || campana.estado !== "running") return [];
  const porFamilia = new Map<string, ChipBloqueo>();
  const poner = (c: ChipBloqueo | null) => {
    if (c && !porFamilia.has(c.clave)) porFamilia.set(c.clave, c);
  };
  organizacion.filter((m) => m.bloquea).forEach((m) => poner(chipDeMotivo(m)));
  (campana.compuerta ?? []).forEach((b) => poner(chipDeCompuerta(b)));
  campana.motivos.filter((m) => m.bloquea || m.codigo === "ley2300_reprogramadas").forEach((m) => poner(chipDeMotivo(m)));
  return [...porFamilia.values()];
}

/** ¿Hay algo que impida marcar ahora (no solo avisos)? */
export function campanaBloqueada(chips: readonly ChipBloqueo[]): boolean {
  return chips.some((c) => c.clave !== "ley2300" && c.clave !== "programada");
}
