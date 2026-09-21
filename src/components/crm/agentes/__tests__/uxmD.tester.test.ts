/**
 * UX móvil — ronda 1 — TESTER adversarial de UXM-D (agentes IA de voz).
 *
 * Ataca el contrato del editor con el runtime y con las rutas, los modelos
 * (nunca cableados, nunca `""`), las campañas (contrato de `target_config`,
 * conteo por organización) y el reproductor de muestras (una sola a la vez,
 * error honesto). Cada bloque enuncia qué defecto detectaría si se rompiera.
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
import { buildCampaignBody, describeCampaignTarget, targetStagesOf } from "../campanas/campaignModel";
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

describe("TESTER UXM-D · resolveEffectiveVoice ejecuta lo mismo que resolveVoice (runtime)", () => {
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

describe("TESTER UXM-D · ida y vuelta del agente completo", () => {
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

describe("TESTER UXM-D · modelos", () => {
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

// ─── 4. Campañas ──────────────────────────────────────────────────────────────

describe("TESTER UXM-D · campañas", () => {
  test("target_config es exactamente { stage_id } y el despachador lee esa misma clave", () => {
    const body = buildCampaignBody({ name: "C", voiceAgentId: "a", stageId: "s1" });
    expect(body.target_config).toEqual({ stage_id: "s1" });
    const svc = SRC("src/lib/services/crm/voiceAgentService.ts");
    expect(svc).toMatch(/campaign\.target_source === 'pipeline_stage'[\s\S]{0,120}config\.stage_id/);
  });

  test("toda clave del cuerpo de la campaña la acepta POST /campaigns (max_calls_per_hour incluido)", () => {
    const route = SRC("src/app/api/crm/voice-agents/campaigns/route.ts");
    const accepted = new Set(Array.from(route.matchAll(/^\s+(\w+): body\.\1,?$/gm)).map((m) => m[1]));
    const body = buildCampaignBody({ name: "C", voiceAgentId: "a", stageId: null });
    for (const key of Object.keys(body)) expect({ key, ok: accepted.has(key) }).toEqual({ key, ok: true });
  });

  test("embudo sin etapas → lista vacía; etapa borrada → texto claro, no rompe", () => {
    expect(targetStagesOf([], "p1")).toEqual([]);
    expect(
      describeCampaignTarget({ target_source: "pipeline_stage", target_config: { stage_id: "borrada" } }, [], []),
    ).toBe("Etapa del embudo (ya no existe)");
    expect(describeCampaignTarget({ target_source: "pipeline_stage", target_config: null }, [], [])).toBe("pipeline_stage");
    expect(describeCampaignTarget({ target_source: "pipeline_stage", target_config: { stage_id: 42 } }, [], [])).toBe("pipeline_stage");
  });

  test("countOpenOpportunities filtra por la organización de la sesión: el señuelo de la org 121 no cuenta", async () => {
    jest.resetModules();
    const calls: Array<[string, unknown]> = [];
    const OPPS = [
      { organization_id: 120, stage_id: "s1", status: "open" },
      { organization_id: 120, stage_id: "s1", status: "won" },
      { organization_id: 121, stage_id: "s1", status: "open" },
      { organization_id: 121, stage_id: "s1", status: "open" },
    ];
    jest.doMock("@/lib/supabase/config", () => {
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { calls.push([c, v]); return q; },
        then: (res: (x: unknown) => void) => {
          const n = OPPS.filter((o) => calls.every(([c, v]) => (o as Record<string, unknown>)[c] === v)).length;
          res({ count: n, error: null });
        },
      };
      return { supabase: { from: () => q } };
    });
    jest.doMock("@/lib/hooks/useOrganization", () => ({ getOrganizationId: () => 120 }));
    jest.doMock("react", () => ({
      ...jest.requireActual("react"),
      useCallback: (fn: unknown) => fn,
      useState: (v: unknown) => [v, () => {}],
      useEffect: () => {},
    }));
    const { useCrmLookups } = await import("@/components/crm/shared/useCrmLookups");
    const lookups = useCrmLookups();
    const n = await lookups.countOpenOpportunities!("s1");
    expect(n).toBe(1);
    expect(calls).toEqual(expect.arrayContaining([["organization_id", 120], ["stage_id", "s1"], ["status", "open"]]));
  });
});

// ─── 5. Reproductor: una sola muestra a la vez, sin errores fantasma ───────────

/**
 * Corredor mínimo del hook sin React DOM: `useState`/`useRef` con memoria entre
 * renders, `useEffect` inerte. `render()` reevalúa el hook con el estado actual.
 */
async function loadAudioPreviewRunner() {
  jest.resetModules();
  const refs: Array<{ current: unknown }> = [];
  const states: unknown[] = [];
  let ri = 0;
  let si = 0;
  jest.doMock("react", () => ({
    ...jest.requireActual("react"),
    useRef: (v: unknown) => { const i = ri++; if (!refs[i]) refs[i] = { current: v }; return refs[i]; },
    useState: (v: unknown) => {
      const i = si++;
      if (!(i in states)) states[i] = v;
      return [states[i], (nv: unknown) => { states[i] = typeof nv === "function" ? (nv as (p: unknown) => unknown)(states[i]) : nv; }];
    },
    useCallback: (fn: unknown) => fn,
    useEffect: () => {},
  }));
  const mod = await import("../voces/useAudioPreview");
  return () => { ri = 0; si = 0; return mod.useAudioPreview(); };
}

/** Doble fiel al spec: `pause()` rechaza el `play()` pendiente con AbortError. */
class FakeAudio {
  static log: string[] = [];
  static last: FakeAudio | null = null;
  src = "";
  onended: null | (() => void) = null;
  onplaying: null | (() => void) = null;
  onerror: null | (() => void) = null;
  private pending: null | ((e: unknown) => void) = null;
  constructor() { FakeAudio.last = this; }
  private abort() { const r = this.pending; this.pending = null; if (r) r(Object.assign(new DOMException("interrupted", "AbortError"))); }
  pause() { FakeAudio.log.push("pause"); this.abort(); }
  load() { this.abort(); }
  removeAttribute() { this.src = ""; }
  play(): Promise<void> {
    FakeAudio.log.push(`play:${this.src}`);
    this.abort();
    if (this.src.includes("fail")) return Promise.reject(new DOMException("no source", "NotSupportedError"));
    return new Promise((_resolve, reject) => { this.pending = reject; });
  }
}

describe("TESTER UXM-D · useAudioPreview (comportamiento)", () => {
  beforeEach(() => {
    FakeAudio.log = [];
    (globalThis as unknown as { Audio: unknown }).Audio = FakeAudio;
  });

  test("la segunda escucha detiene la primera y el AbortError de la primera no deja un error fantasma", async () => {
    const render = await loadAudioPreviewRunner();
    render().toggle("a", "https://x/a.mp3");
    expect(render().statusFor("a")).toBe("loading");
    render().toggle("b", "https://x/b.mp3");
    await Promise.resolve(); await Promise.resolve();
    // Antes: el catch de «a» pisaba el estado → activeId «a», status «error» y toast.
    expect(render().activeId).toBe("b");
    expect(render().statusFor("b")).toBe("loading");
    expect(render().status).not.toBe("error");
    expect(FakeAudio.log).toEqual(["pause", "play:https://x/a.mp3", "pause", "play:https://x/b.mp3"]);
    FakeAudio.last!.onplaying!();
    expect(render().statusFor("b")).toBe("playing");
    expect(render().statusFor("a")).toBe("idle");
    render().stop();
  });

  test("play() rechazado → estado de error honesto y se puede reintentar", async () => {
    const render = await loadAudioPreviewRunner();
    render().toggle("f", "https://x/fail.mp3");
    await Promise.resolve(); await Promise.resolve();
    expect(render().statusFor("f")).toBe("error");
    expect(render().error).toMatch(/No se pudo reproducir/);
    render().toggle("f", "https://x/fail.mp3");
    expect(FakeAudio.log.filter((l) => l.startsWith("play:")).length).toBe(2);
    render().stop();
  });

  test("pulsar la que suena la detiene (alternar)", async () => {
    const render = await loadAudioPreviewRunner();
    render().toggle("a", "https://x/a.mp3");
    FakeAudio.last!.onplaying!();
    expect(render().statusFor("a")).toBe("playing");
    render().toggle("a", "https://x/a.mp3");
    expect(render().status).toBe("idle");
    expect(render().activeId).toBeNull();
  });

  test("guardia de secuencia presente en el código", () => {
    const src = SRC("src/components/crm/agentes/voces/useAudioPreview.ts");
    expect(src).toMatch(/AbortError/);
    expect(src).toMatch(/const seq = \+\+seqRef\.current/);
  });
  test("las pestañas comparten el mismo botón «Escuchar» con aria-pressed y aria-label", () => {
    const btn = SRC("src/components/crm/agentes/voces/VoicePreviewButton.tsx");
    expect(btn).toContain("aria-pressed={playing}");
    expect(btn).toMatch(/aria-label=\{\s*playing \? `Detener la muestra de \$\{voiceName\}` : `Escuchar una muestra de \$\{voiceName\}`/);
    for (const f of ["voces/VoiceCard.tsx", "voces/MyVoiceCard.tsx", "voces/VoicePickCard.tsx"]) {
      expect(fs.readFileSync(path.join(ZONE, f), "utf8")).toContain("<VoicePreviewButton");
    }
  });
});

// ─── 6. Guardas estáticas del tester (móvil) ─────────────────────────────────

describe("TESTER UXM-D · guardas estáticas", () => {
  test("el editor no bloquea el guardado con el modelo vacío sin avisar", () => {
    const hook = SRC("src/components/crm/agentes/editor/useAgentForm.ts");
    expect(hook).toMatch(/if \(!form\.llm_model\.trim\(\)\)/);
  });
  test("h-dvh está en la clase de la hoja, no solo en el comentario (mutación M08)", () => {
    const editor = SRC("src/components/crm/agentes/AgentEditorDialog.tsx");
    expect(editor).toMatch(/className="flex h-dvh w-full flex-col/);
    expect(editor).not.toMatch(/className="[^"]*h-screen/);
  });
  test("la pestaña Voz declara min-w-0 en la tarjeta y la lista de radios usa grid-cols-1", () => {
    const tab = SRC("src/components/crm/agentes/editor/AgentVoiceTab.tsx");
    expect(tab).toContain('role="radiogroup"');
    expect(tab).toContain("grid grid-cols-1 gap-2 sm:grid-cols-2");
    const card = SRC("src/components/crm/agentes/voces/VoicePickCard.tsx");
    expect(card).toContain('<label htmlFor={id}');
    expect(card).toContain("min-w-0 flex-1");
    expect(card).toContain('className="sr-only"');
  });
  test("la campaña con más de un agente exige el selector y nunca cablea el primero en el cuerpo sin mostrarlo", () => {
    const panel = SRC("src/components/crm/agentes/AgentCampaignsPanel.tsx");
    expect(panel).toContain("selectableAgents.length > 1 && (");
    expect(panel).toContain('<Label htmlFor="c-agent">');
  });
});
