/**
 * UX móvil — ronda 1 — UXM-D (agentes IA de voz): lógica extraída del editor y
 * de campañas, más guardas estáticas de las clases que evitan reincidir en el
 * desbordamiento a 375 px.
 */

import fs from "fs";
import path from "path";
import { defaultModel, resolveModelOptions } from "../editor/agentModels";
import {
  EMPTY_AGENT_FORM,
  agentFormFromApi,
  agentFormToBody,
  resolveEffectiveVoice,
  toggleAllowedTool,
} from "../editor/useAgentForm";
import {
  buildCampaignBody,
  campaignCanActivate,
  campaignStatusView,
  describeCampaignTarget,
  targetStagesOf,
} from "../campanas/campaignModel";
import { catalogVoiceTags, type VoiceCatalogRow } from "../useVoiceCatalog";
import type { CatalogoModelos } from "@/lib/services/aiSettingsService";

const DIR = path.join(process.cwd(), "src", "components", "crm", "agentes");
const read = (rel: string) => fs.readFileSync(path.join(DIR, rel), "utf8");

const CATALOG: CatalogoModelos = {
  proveedores: [
    { value: "openai", label: "OpenAI", usable: true, motivo: null },
    { value: "google", label: "Google AI", usable: false, motivo: "Sin credenciales" },
  ],
  modelos: [
    { provider: "openai", value: "m-eco", label: "Eco", gama: "economico", recomendado: false, contextoTokens: null, soportaVision: null, nota: null, costoEntradaUsdMillon: null, costoSalidaUsdMillon: null, tarifaCargada: false },
    { provider: "openai", value: "m-rec", label: "Recomendado", gama: "equilibrado", recomendado: true, contextoTokens: null, soportaVision: null, nota: "Buena voz", costoEntradaUsdMillon: null, costoSalidaUsdMillon: null, tarifaCargada: true },
    { provider: "google", value: "g-1", label: "Gemini", gama: "economico", recomendado: true, contextoTokens: null, soportaVision: null, nota: null, costoEntradaUsdMillon: null, costoSalidaUsdMillon: null, tarifaCargada: true },
  ],
};

const voice = (over: Partial<VoiceCatalogRow>): VoiceCatalogRow => ({
  id: "v", provider: "elevenlabs", provider_voice_id: "pv", name: "Voz", description: null, kind: "library",
  language: "es", model_id: "eleven_flash_v2_5", consent_recorded_at: null, is_default: false, is_active: true,
  ...over,
});

describe("UXM-D · modelos permitidos (catálogo, nunca cableados)", () => {
  test("solo proveedores con credenciales; el recomendado utilizable es el default", () => {
    const options = resolveModelOptions(CATALOG, "");
    expect(options.map((o) => o.value)).toEqual(["m-eco", "m-rec"]);
    expect(defaultModel(CATALOG)).toBe("m-rec");
    expect(options[1].hint).toBe("Equilibrado · Buena voz");
  });

  test("un valor guardado que ya no está en el catálogo se conserva marcado", () => {
    const options = resolveModelOptions(CATALOG, "gpt-antiguo");
    const extra = options.find((o) => o.fueraDeCatalogo);
    expect(extra?.value).toBe("gpt-antiguo");
    expect(options).toHaveLength(3);
    expect(resolveModelOptions(null, "x")).toEqual([]);
    expect(defaultModel(null)).toBeNull();
  });

  test("el formulario vacío no cablea ningún modelo y ningún archivo de la zona lo hace", () => {
    expect(EMPTY_AGENT_FORM.llm_model).toBe("");
    const files = ["editor/useAgentForm.ts", "editor/AgentPurposeTab.tsx", "editor/agentModels.ts", "AgentEditorDialog.tsx"];
    for (const f of files) expect({ f, hit: /gpt-4o|gpt-5\.6/.test(read(f)) }).toEqual({ f, hit: false });
  });
});

describe("UXM-D · resolución de voz por defecto (espejo del runtime)", () => {
  const voices = [
    voice({ id: "def", name: "Por defecto", is_default: true }),
    voice({ id: "own", name: "Propia" }),
    voice({ id: "off", name: "Inactiva", is_active: false }),
  ];
  test("voz del agente → por defecto → identificador suelto → estándar", () => {
    expect(resolveEffectiveVoice({ voice_ref_id: "own", voice_id: "" }, voices)).toMatchObject({ source: "agent", voice: { id: "own" } });
    expect(resolveEffectiveVoice({ voice_ref_id: null, voice_id: "" }, voices)).toMatchObject({ source: "default", voice: { id: "def" } });
    expect(resolveEffectiveVoice({ voice_ref_id: "off", voice_id: "abc" }, voices)).toEqual({ source: "loose", voiceId: "abc" });
    expect(resolveEffectiveVoice({ voice_ref_id: null, voice_id: "" }, [voices[1]])).toEqual({ source: "standard" });
  });
  test("una voz elegida pero inactiva NO cae a la voz por defecto (igual que resolveVoice)", () => {
    expect(resolveEffectiveVoice({ voice_ref_id: "off", voice_id: "" }, voices)).toEqual({ source: "standard" });
  });
});

describe("UXM-D · formulario del agente", () => {
  test("de la API al formulario y del formulario al cuerpo", () => {
    const form = agentFormFromApi({ name: "Ana", voice_ref_id: "", allowed_tools: ["end_call"], max_turns: 7 });
    expect(form.voice_ref_id).toBeNull();
    expect(form.max_turns).toBe(7);
    expect(form.language).toBe("es-CO");
    const body = agentFormToBody({ ...form, voice_id: "  ", llm_model: " m " });
    expect(body.voice_id).toBeNull();
    expect(body.llm_model).toBe("m");
  });
  test("las herramientas obligatorias no se pueden quitar", () => {
    expect(toggleAllowedTool(["end_call"], "end_call", false)).toEqual(["end_call"]);
    expect(toggleAllowedTool([], "create_task", true)).toEqual(["create_task"]);
    expect(toggleAllowedTool(["create_task"], "create_task", false)).toEqual([]);
  });
  test("etiquetas legibles de una voz del catálogo", () => {
    const tags = catalogVoiceTags({ labels: { language: "es", gender: "female", accent: "castilian" } });
    expect(tags.map((t) => t.label)).toEqual(["Español", "Femenina", "Castellano"]);
    expect(catalogVoiceTags({})).toEqual([]);
  });
});

describe("UXM-D · campañas: selector de etapa y contrato de la API", () => {
  const pipelines = [{ id: "p1", name: "Ventas" }];
  const stages = [
    { id: "s2", name: "Propuesta", pipeline_id: "p1", position: 2 },
    { id: "s1", name: "Nuevo", pipeline_id: "p1", position: 1 },
    { id: "s9", name: "Ganada", pipeline_id: "p1", position: 9, is_won: true },
    { id: "x1", name: "Otro", pipeline_id: "p2", position: 1 },
  ];
  test("target_config.stage_id no cambia; sin etapa es lista manual", () => {
    expect(buildCampaignBody({ name: " C ", voiceAgentId: "a1", stageId: "s2" })).toMatchObject({
      name: "C", voice_agent_id: "a1", target_source: "pipeline_stage", target_config: { stage_id: "s2" }, status: "draft",
    });
    expect(buildCampaignBody({ name: "C", voiceAgentId: "a1", stageId: null })).toMatchObject({ target_source: "manual_list", target_config: {} });
  });
  test("las etapas elegibles son las del embudo, ordenadas y sin cierre", () => {
    expect(targetStagesOf(stages, "p1").map((s) => s.id)).toEqual(["s1", "s2"]);
  });
  test("destino y estado en lenguaje humano", () => {
    expect(describeCampaignTarget({ target_source: "pipeline_stage", target_config: { stage_id: "s2" } }, stages, pipelines)).toBe("Etapa Propuesta · Ventas");
    expect(describeCampaignTarget({ target_source: "pipeline_stage", target_config: { stage_id: "zz" } }, stages, pipelines)).toBe("Etapa del embudo (ya no existe)");
    expect(describeCampaignTarget({ target_source: "manual_list", target_config: {} }, stages, pipelines)).toBe("Lista manual");
    expect(campaignStatusView({ status: "running", emergency_stop: false, stopped_reason: null })).toMatchObject({ label: "En marcha", variant: "success" });
    expect(campaignStatusView({ status: "paused", emergency_stop: true, stopped_reason: "5 fallos" })).toMatchObject({ label: "Detenida", detail: "Parada de emergencia: 5 fallos" });
    expect(campaignCanActivate({ status: "running", emergency_stop: false })).toBe(false);
    expect(campaignCanActivate({ status: "draft", emergency_stop: false })).toBe(true);
  });
});

describe("UXM-D · guardas estáticas (375 px)", () => {
  test("ya nadie pide un ID de etapa a mano y el panel usa los lookups compartidos", () => {
    const panel = read("AgentCampaignsPanel.tsx");
    expect(panel).not.toContain("ID de la etapa");
    expect(panel).toContain("useCrmLookups");
    expect(panel).toContain("CampaignTargetPicker");
  });
  test("el editor es una hoja h-dvh con cuerpo desplazable, pie sobre el área segura y 4 pasos", () => {
    const editor = read("AgentEditorDialog.tsx");
    expect(editor).toContain("h-dvh");
    expect(editor).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(editor).toContain("env(safe-area-inset-bottom)");
    expect(editor).toContain("grid-cols-4");
    for (const t of ["AgentPurposeTab", "AgentScriptTab", "AgentVoiceTab", "AgentToolsTab"]) expect(editor).toContain(t);
  });
  test("la pestaña Voz reutiliza tarjetas, avatar y reproductor compartidos", () => {
    const tab = read("editor/AgentVoiceTab.tsx");
    expect(tab).toContain("useAudioPreview");
    expect(tab).toContain("VoicePickCard");
    expect(tab).toContain("Añade una voz del catálogo");
    expect(tab).toContain("Avanzado");
    const card = read("voces/VoicePickCard.tsx");
    expect(card).toContain("VoiceAvatar");
    expect(card).toContain("VoicePreviewButton");
    expect(card).toContain('type="radio"');
    for (const f of ["voces/VoiceCard.tsx", "voces/MyVoiceCard.tsx"]) expect(read(f)).toContain("VoicePreviewButton");
  });
  test("las cuadrículas declaran grid-cols-1 y las pestañas internas no son inline-flex sueltas", () => {
    for (const f of ["voces/VoiceLibraryGrid.tsx", "voces/MyVoicesPanel.tsx", "AgentesIaPage.tsx"]) {
      expect({ f, ok: /grid grid-cols-1 gap-3/.test(read(f)) }).toEqual({ f, ok: true });
    }
    expect(read("VoicesPanel.tsx")).toContain("grid h-auto w-full grid-cols-3");
    expect(read("voces/VoiceCard.tsx")).toContain("grid grid-cols-2 items-center gap-2");
    const filters = read("voces/VoiceLibraryFilters.tsx");
    expect(filters).toContain("Filtros");
    expect(filters).toContain("aria-expanded={filtersOpen}");
  });
  test("ningún archivo de la zona supera las 300 líneas", () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir).flatMap((f) => {
        const p = path.join(dir, f);
        return fs.statSync(p).isDirectory() ? walk(p) : p;
      });
    const over = walk(DIR)
      .filter((p) => /\.tsx?$/.test(p) && !p.includes("__tests__"))
      .map((p) => ({ f: path.relative(DIR, p), lines: fs.readFileSync(p, "utf8").split("\n").length }))
      .filter((x) => x.lines > 300);
    expect(over).toEqual([]);
  });
});
