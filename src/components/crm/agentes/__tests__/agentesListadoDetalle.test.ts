/**
 * Listado y detalle de Agentes IA (Figma CRM 1298:84133 y 1311:86823): la
 * aritmética de presentación y la descripción de la voz son puras.
 */

import {
  agruparDesenlaces,
  GRUPOS_DESENLACE,
  HERRAMIENTAS_OBLIGATORIAS,
  inicioDeMesEnZona,
  leerPeriodo,
  normalizarMetricas,
  politicaDeEtapas,
  porcentaje,
  variacion,
} from "@/lib/services/crm/voiceAgentMetrics";
import { MANDATORY_TOOLS } from "@/lib/services/crm/voiceAgentTools";
import { cifrasDeAgente, describirVoz, guionDeAgente, partirDuracion } from "../listado/agenteVista";

jest.mock("@/lib/services/crm/reunionCorreo.server", () => ({ notificarReunion: jest.fn() }));

describe("voiceAgentMetrics", () => {
  it("las obligatorias del detalle son las mismas que inyecta el runtime", () => {
    expect([...HERRAMIENTAS_OBLIGATORIAS].sort()).toEqual([...MANDATORY_TOOLS].sort());
  });

  it("lee el periodo con o sin sufijo y cae al de por defecto", () => {
    expect(leerPeriodo("30d")).toBe(30);
    expect(leerPeriodo("90")).toBe(90);
    expect(leerPeriodo("15d", 30)).toBe(30);
    expect(leerPeriodo(null)).toBe(7);
  });

  it("porcentaje y variación sin base devuelven null", () => {
    expect(porcentaje(75, 184)).toBe(41);
    expect(porcentaje(1, 0)).toBeNull();
    expect(variacion(184, 164)).toBe(12);
    expect(variacion(10, 0)).toBeNull();
    expect(variacion(5, 10)).toBe(-50);
  });

  it("normaliza una respuesta vacía sin undefined", () => {
    const m = normalizarMetricas(null);
    expect(m.por_agente).toEqual([]);
    expect(m.totales.llamadas).toBe(0);
    expect(m.totales.creditos_restantes).toBeNull();
  });

  it("agrupa los desenlaces en el orden del diseño, con ceros", () => {
    const g = agruparDesenlaces([{ status: "failed", n: 9 }, { status: "completed", n: 181 }]);
    expect(g.map((x) => x.grupo)).toEqual([...GRUPOS_DESENLACE]);
    expect(g[0]).toEqual({ grupo: "completed", n: 181 });
    expect(g.find((x) => x.grupo === "voicemail")?.n).toBe(0);
  });

  it("una etapa en sugerir basta para que el agente no ejecute solo", () => {
    expect(politicaDeEtapas([])).toBe("suggest");
    expect(politicaDeEtapas([{ action_policy: "auto", is_active: true }])).toBe("auto");
    expect(politicaDeEtapas([{ action_policy: "auto", is_active: true }, { action_policy: "suggest", is_active: true }])).toBe("suggest");
    expect(politicaDeEtapas([{ action_policy: "auto", is_active: true }, { action_policy: "suggest", is_active: false }])).toBe("auto");
  });

  it("el mes empieza a medianoche de la zona de la organización", () => {
    // 2026-11-01 03:00 UTC sigue siendo octubre en Bogotá (UTC-5).
    expect(inicioDeMesEnZona("America/Bogota", new Date("2026-11-01T03:00:00Z"))).toBe("2026-10-01T00:00:00.000-05:00");
    expect(inicioDeMesEnZona("America/Bogota", new Date("2026-11-15T12:00:00Z"))).toBe("2026-11-01T00:00:00.000-05:00");
  });
});

describe("agenteVista", () => {
  const voces = [
    { id: "v1", name: "Laura Pérez", kind: "cloned", consent_recorded_at: "2026-08-12", is_default: false },
    { id: "v2", name: "Sofía, cálida", kind: "library", consent_recorded_at: null, is_default: true },
  ];

  it("describe la voz propia, la suelta y la de la organización", () => {
    expect(describirVoz({ voice_ref_id: "v1", voice_id: null }, voces)).toEqual({ tipo: "clonada", nombre: "Laura Pérez" });
    expect(describirVoz({ voice_ref_id: "v2", voice_id: null }, voces)).toEqual({ tipo: "catalogo", nombre: "Sofía, cálida" });
    expect(describirVoz({ voice_ref_id: null, voice_id: "abc" }, voces)).toEqual({ tipo: "id", id: "abc" });
    expect(describirVoz({ voice_ref_id: null, voice_id: null }, voces)).toEqual({ tipo: "defectoOrg" });
    expect(describirVoz({ voice_ref_id: null, voice_id: null }, [])).toEqual({ tipo: "sinVoz" });
  });

  it("solo las etapas activas del agente van al guion", () => {
    const g = guionDeAgente("a1", [
      { voice_agent_id: "a1", stage_id: "s1", etapa: "Nuevo lead", posicion: 1, action_policy: "suggest", is_active: true },
      { voice_agent_id: "a1", stage_id: "s2", etapa: "Contactado", posicion: 2, action_policy: "auto", is_active: false },
      { voice_agent_id: "a2", stage_id: "s3", etapa: "Demo", posicion: 3, action_policy: "auto", is_active: true },
    ]);
    expect(g.etapas).toEqual([{ id: "s1", nombre: "Nuevo lead" }]);
    expect(g.politica).toBe("suggest");
  });

  it("cifras: «—» sin llamadas y sin agendadas", () => {
    expect(cifrasDeAgente("a1", [])).toEqual({ llamadas: 0, contactoPct: null, agendadas: null });
    expect(cifrasDeAgente("a1", [{ voice_agent_id: "a1", llamadas: 52, contestadas: 30, agendadas: 0 }])).toEqual({ llamadas: 52, contactoPct: 58, agendadas: null });
    expect(cifrasDeAgente("a1", [{ voice_agent_id: "a1", llamadas: 96, contestadas: 42, agendadas: 9 }])).toEqual({ llamadas: 96, contactoPct: 44, agendadas: 9 });
  });

  it("parte la duración en minutos y segundos", () => {
    expect(partirDuracion(168)).toEqual({ m: 2, s: 48 });
    expect(partirDuracion(24)).toEqual({ m: 0, s: 24 });
  });
});
