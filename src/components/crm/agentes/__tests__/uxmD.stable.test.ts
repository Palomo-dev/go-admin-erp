/**
 * UX móvil — UXM-D (agentes IA de voz): casos adversarios estables (primera mitad;
 * campañas, reproductor y guardas estáticas en `uxmD.campanas.stable.test.ts`).
 *
 * Ataca el contrato del editor con el runtime y con las rutas, los modelos
 * (nunca cableados, nunca `""`), las campañas (contrato de `target_config`,
 * conteo por organización) y el reproductor de muestras (una sola a la vez,
 * error honesto). Cada bloque enuncia qué defecto detectaría si se rompiera.
 * Origen: tester de UXM-D ronda 1 (`uxmD.tester`); consolidado el 2026-09-21.
 * Complementa a `uxmD.test.ts` (lógica extraída y guardas estáticas del builder).
 */
import fs from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveVoice } from "@/lib/services/crm/voiceAgent/agentRuntime";
import { MANDATORY_TOOLS } from "@/lib/services/crm/voiceAgentTools";
import type { CatalogoModelos } from "@/lib/services/aiSettingsService";
import {
  EMPTY_AGENT_FORM,
  agentFormFromApi,
  agentFormToBody,
  resolveEffectiveVoice,
  type AgentFormState,
} from "../editor/useAgentForm";
import { defaultModel, resolveModelOptions } from "../editor/agentModels";
import type { VoiceCatalogRow } from "../useVoiceCatalog";

const ROOT = process.cwd();
const SRC = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const ZONE = path.join(ROOT, "src", "components", "crm", "agentes");

const voice = (over: Partial<VoiceCatalogRow>): VoiceCatalogRow => ({
  id: "v", provider: "elevenlabs", provider_voice_id: "pv", name: "Voz", description: null, kind: "library",
  language: "es", model_id: "eleven_flash_v2_5", consent_recorded_at: null, is_default: false, is_active: true,
  ...over,
});

// ─── 1. Espejo del runtime: mismas entradas, misma decisión ─────────────────

/**
 * Doble mínimo de Supabase: `from('voices').select().eq(...).eq(...).maybeSingle()`
 * filtra en memoria exactamente como lo haría Postgres con esas igualdades.
 * Si el runtime cambia su consulta (p. ej. deja de exigir `is_active`), el
 * doble lo refleja y el espejo del cliente deja de coincidir: eso es lo que
 * queremos detectar.
 */
function fakeSupabase(rows: Array<Record<string, unknown>>): SupabaseClient {
  const filters: Array<[string, unknown]> = [];
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return q;
    },
    maybeSingle: async () => {
      const hits = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
      if (hits.length > 1) return { data: null, error: { message: "more than one row" } };
      return { data: hits[0] ?? null, error: null };
    },
  };
  return { from: () => q } as unknown as SupabaseClient;
}

describe("UXM-D (de tester r1) · resolveEffectiveVoice ejecuta lo mismo que resolveVoice (runtime)", () => {
  const ORG = 120;
  const catalog = [
    voice({ id: "def", provider_voice_id: "DEF", name: "Por defecto", is_default: true }),
    voice({ id: "own", provider_voice_id: "OWN", name: "Propia" }),
    voice({ id: "off", provider_voice_id: "OFF", name: "Inactiva", is_active: false }),
    voice({ id: "defoff", provider_voice_id: "DEFOFF", name: "Por defecto apagada", is_default: true, is_active: false }),
  ];
  // Filas «de la base»: las del catálogo de la org 120 más un señuelo de la org 121
  // que es por defecto y activa (nunca debe elegirse).
  const dbRows = [
    ...catalog.map((v) => ({ ...v, organization_id: ORG })),
    { ...voice({ id: "ajena", provider_voice_id: "AJENA", is_default: true }), organization_id: 121 },
  ];

  /** Traduce la salida del runtime al vocabulario del espejo del cliente. */
  const runtimeSource = async (agent: { voice_ref_id: string | null; voice_id: string }) => {
    const r = await resolveVoice(fakeSupabase(dbRows), ORG, {
      voice_ref_id: agent.voice_ref_id,
      voice_id: agent.voice_id.trim() || null,
      voice_provider: "elevenlabs",
    });
    if (r.source === "voices_table") return { kind: agent.voice_ref_id ? "agent" : "default", rowId: r.voiceRowId };
    if (r.source === "agent_field") return { kind: "loose", voiceId: agent.voice_id.trim() };
    return { kind: "standard" };
  };
  const clientSource = (agent: { voice_ref_id: string | null; voice_id: string }, list = catalog) => {
    const r = resolveEffectiveVoice(agent, list);
    if (r.source === "agent" || r.source === "default") return { kind: r.source, rowId: r.voice.id };
    if (r.source === "loose") return { kind: "loose", voiceId: r.voiceId };
    return { kind: "standard" };
  };

  const CASES: Array<[string, { voice_ref_id: string | null; voice_id: string }]> = [
    ["voz propia activa", { voice_ref_id: "own", voice_id: "" }],
    ["voz propia activa e id suelto: gana la propia", { voice_ref_id: "own", voice_id: "abc" }],
    ["voz elegida inactiva sin id suelto → estándar (NO cae a la por defecto)", { voice_ref_id: "off", voice_id: "" }],
    ["voz elegida inactiva con id suelto → id suelto", { voice_ref_id: "off", voice_id: "abc" }],
    ["voz elegida que ya no existe → id suelto", { voice_ref_id: "borrada", voice_id: "xyz" }],
    ["voz elegida que ya no existe sin id → estándar", { voice_ref_id: "borrada", voice_id: "" }],
    ["sin voz propia → por defecto activa", { voice_ref_id: null, voice_id: "" }],
    ["sin voz propia, id suelto: gana la por defecto", { voice_ref_id: null, voice_id: "abc" }],
    ["id suelto con espacios se recorta", { voice_ref_id: "off", voice_id: "  abc  " }],
  ];

  test.each(CASES)("%s", async (_name, agent) => {
    expect(clientSource(agent)).toEqual(await runtimeSource(agent));
  });

  test("sin ninguna voz por defecto activa: id suelto o estándar, en ambos", async () => {
    const list = catalog.filter((v) => v.id !== "def");
    const rows = dbRows.filter((r) => r.id !== "def");
    for (const agent of [
      { voice_ref_id: null, voice_id: "" },
      { voice_ref_id: null, voice_id: "abc" },
    ]) {
      const r = await resolveVoice(fakeSupabase(rows), ORG, { ...agent, voice_id: agent.voice_id || null, voice_provider: "elevenlabs" });
      const c = resolveEffectiveVoice(agent, list);
      expect(c.source === "loose" ? "agent_field" : c.source === "standard" ? "default" : "voices_table").toBe(r.source);
    }
  });

  test("la voz por defecto de otra organización nunca entra en juego", async () => {
    const r = await resolveVoice(fakeSupabase(dbRows.filter((x) => x.id !== "def")), ORG, {
      voice_ref_id: null, voice_id: null, voice_provider: "elevenlabs",
    });
    expect(r.voiceRowId).not.toBe("ajena");
    expect(r.source).toBe("default");
  });
});

// ─── 2. Ida y vuelta API → formulario → cuerpo, contra lo que aceptan las rutas ──

/** Claves `body.xxx` que la ruta POST copia al servicio. */
function bodyKeysAcceptedByPost(): Set<string> {
  const src = SRC("src/app/api/crm/voice-agents/route.ts");
  return new Set(Array.from(src.matchAll(/^\s+(\w+): body\.\1,?$/gm)).map((m) => m[1]));
}
/** Campos que `updateVoiceAgent` copia del PATCH. */
function fieldsAcceptedByUpdate(): Set<string> {
  const src = SRC("src/lib/services/crm/voiceAgentService.ts");
  const block = src.slice(src.indexOf("export async function updateVoiceAgent"), src.indexOf("export async function deleteVoiceAgent"));
  return new Set(Array.from(block.matchAll(/'(\w+)'/g)).map((m) => m[1]));
}

const FULL_AGENT = {
  id: "a1", organization_id: 120, name: "Ana", slug: "ana", description: "d", engine: "conversation_relay",
  purpose_type: "sell_product", system_prompt: "Vende", first_message: "Hola", voice_provider: "elevenlabs",
  voice_id: "LOOSE", voice_settings: { speed: 1 }, language: "es-MX", stt_provider: "twilio", llm_provider: "openai",
  llm_model: "modelo-x", temperature: 0.3, max_turns: 9, max_duration_seconds: 240,
  allowed_tools: ["get_customer_context", "create_task", "log_consent_opt_out", "end_call"],
  guardrails: { max_response_tokens: 200 }, transfer_to_human_rules: {}, business_hours: {}, retry_policy: {},
  identity_disclosure: "Soy IA", voice_ref_id: "own", max_calls_per_day: 5, max_calls_per_hour: 2,
  is_active: false, created_by: null, created_at: "", updated_at: "",
};

describe("UXM-D (de tester r1) · ida y vuelta del agente completo", () => {
  test("todo campo del formulario vuelve al cuerpo con el mismo valor (nada se pierde al editar)", () => {
    const form = agentFormFromApi(FULL_AGENT);
    const body = agentFormToBody(form);
    for (const key of Object.keys(EMPTY_AGENT_FORM) as Array<keyof AgentFormState>) {
      expect({ key, value: body[key] }).toEqual({ key, value: FULL_AGENT[key as keyof typeof FULL_AGENT] });
    }
    expect(body.allowed_tools).toEqual(expect.arrayContaining([...MANDATORY_TOOLS]));
  });

  test("toda clave del cuerpo la acepta POST y PATCH: ninguna se descarta en silencio", () => {
    const body = agentFormToBody(agentFormFromApi(FULL_AGENT));
    const post = bodyKeysAcceptedByPost();
    const patch = fieldsAcceptedByUpdate();
    expect(post.size).toBeGreaterThan(15);
    for (const key of Object.keys(body)) {
      expect({ key, post: post.has(key), patch: patch.has(key) }).toEqual({ key, post: true, patch: true });
    }
  });

  test("las herramientas obligatorias viajan en el cuerpo aunque el agente guardado no las tuviera", () => {
    // La casilla se pinta marcada y bloqueada: lo guardado debe decir lo mismo que la UI.
    const legacy = agentFormFromApi({ ...FULL_AGENT, allowed_tools: ["get_customer_context"] });
    const body = agentFormToBody(legacy) as { allowed_tools: string[] };
    for (const t of MANDATORY_TOOLS) expect(body.allowed_tools).toContain(t);
    expect(body.allowed_tools).toContain("get_customer_context");
  });

  test("un agente con voice_id null y voice_ref_id null vuelve igual (no se inventa '' ni 'null')", () => {
    const form = agentFormFromApi({ ...FULL_AGENT, voice_id: null, voice_ref_id: null });
    expect(form.voice_id).toBe("");
    expect(form.voice_ref_id).toBeNull();
    const body = agentFormToBody(form);
    expect(body.voice_id).toBeNull();
    expect(body.voice_ref_id).toBeNull();
  });
});

// ─── 3. Modelos: catálogo vacío, sin credencial, guardado fuera, nunca "" ──────

const CATALOG: CatalogoModelos = {
  proveedores: [
    { value: "openai", label: "OpenAI", usable: false, motivo: "Sin credenciales" },
    { value: "google", label: "Google AI", usable: false, motivo: "Sin credenciales" },
  ],
  modelos: [
    { provider: "openai", value: "m-1", label: "Uno", gama: "economico", recomendado: true, contextoTokens: null, soportaVision: null, nota: null, costoEntradaUsdMillon: null, costoSalidaUsdMillon: null, tarifaCargada: false },
  ],
};

describe("UXM-D (de tester r1) · modelos", () => {
  test("ningún proveedor con credencial → cero opciones y sin modelo por defecto (no se inventa uno)", () => {
    expect(resolveModelOptions(CATALOG, "")).toEqual([]);
    expect(defaultModel(CATALOG)).toBeNull();
    expect(resolveModelOptions({ proveedores: [], modelos: [] }, "")).toEqual([]);
  });

  test("valor guardado fuera del catálogo: se conserva con aviso y sin proveedor", () => {
    const opts = resolveModelOptions(CATALOG, "modelo-viejo");
    expect(opts).toHaveLength(1);
    expect(opts[0]).toMatchObject({ value: "modelo-viejo", fueraDeCatalogo: true, provider: "" });
    expect(opts[0].hint).toMatch(/ya no está en el catálogo/);
  });

  test("el cuerpo nunca lleva llm_model vacío: se omite para que mande el DEFAULT de la columna", () => {
    // Antes salía `llm_model: ""` y la fila quedaba con cadena vacía; el runtime
    // la tapaba con un modelo cableado sin que nadie lo supiera.
    for (const raw of ["", "   "]) {
      const body = agentFormToBody({ ...EMPTY_AGENT_FORM, name: "x", llm_model: raw });
      expect("llm_model" in body && body.llm_model !== undefined).toBe(false);
    }
    expect(agentFormToBody({ ...EMPTY_AGENT_FORM, llm_model: " m " }).llm_model).toBe("m");
  });

  test("ningún archivo de la zona cablea un nombre de modelo", () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir).flatMap((f) => {
        const p = path.join(dir, f);
        return fs.statSync(p).isDirectory() ? walk(p) : [p];
      });
    const hits = walk(ZONE)
      .filter((p) => /\.tsx?$/.test(p) && !p.includes("__tests__"))
      .filter((p) => /gpt-4o|gpt-5|gemini-\d|claude-\d/i.test(fs.readFileSync(p, "utf8")))
      .map((p) => path.relative(ZONE, p));
    expect(hits).toEqual([]);
  });
});
