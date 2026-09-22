/**
 * UX móvil — UXM-D (agentes IA de voz): campañas, reproductor de muestras y
 * guardas estáticas. Casos adversarios estables del tester de UXM-D ronda 1
 * (`uxmD.tester`), consolidados el 2026-09-21 (segunda mitad; la primera —
 * espejo del runtime, ida y vuelta del agente y modelos — está en
 * `uxmD.stable.test.ts`). Cada bloque enuncia qué defecto detectaría si se rompiera.
 */
import fs from "fs";
import path from "path";
import { buildCampaignBody, describeCampaignTarget, targetStagesOf } from "../campanas/campaignModel";

const ROOT = process.cwd();
const SRC = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const ZONE = path.join(ROOT, "src", "components", "crm", "agentes");

// ─── 4. Campañas ──────────────────────────────────────────────────────────────

describe("UXM-D (de tester r1) · campañas", () => {
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

describe("UXM-D (de tester r1) · useAudioPreview (comportamiento)", () => {
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

describe("UXM-D (de tester r1) · guardas estáticas", () => {
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
