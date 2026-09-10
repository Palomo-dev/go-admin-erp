"use client";

/**
 * Pestaña «Agente IA» del diálogo de configuración de etapa (FASE 06).
 *
 * Petición literal del dueño: decidir, para cada etapa del embudo, qué hace el
 * agente al llamar (vender un producto concreto, agendar una reunión, calificar
 * al contacto, recuperar un carrito, u otra acción).
 *
 * Se reutiliza el diálogo existente: NO hay página nueva.
 * Persiste en `stage_agents` vía `/api/crm/stage-agents` (org de sesión + RLS).
 */

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Bot, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase/config";
import {
  OBJECTIVE_LABELS,
  STAGE_AGENT_OBJECTIVES,
  type StageAgentObjective,
} from "@/lib/services/crm/stageAgentService";

interface VoiceAgentOption {
  id: string;
  name: string;
  is_active: boolean;
}

interface ProductOption {
  id: number;
  name: string;
}

interface StageAgentState {
  id?: string;
  objective: StageAgentObjective;
  voice_agent_id: string | null;
  product_id: number | null;
  objective_prompt: string;
  offer_price: string;
  trigger_on: "enter" | "manual";
  action_policy: "auto" | "suggest";
  is_active: boolean;
}

const EMPTY: StageAgentState = {
  objective: "qualify_lead",
  voice_agent_id: null,
  product_id: null,
  objective_prompt: "",
  offer_price: "",
  trigger_on: "manual",
  action_policy: "suggest",
  is_active: true,
};

export function StageAgentTab({ stageId }: { stageId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<StageAgentState>(EMPTY);
  const [configured, setConfigured] = useState(false);
  const [agents, setAgents] = useState<VoiceAgentOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [saRes, agRes] = await Promise.all([
        fetch(`/api/crm/stage-agents?stage_id=${encodeURIComponent(stageId)}`, { cache: "no-store" }),
        fetch("/api/crm/voice-agents", { cache: "no-store" }),
      ]);
      const saJson = await saRes.json();
      const agJson = await agRes.json();

      if (agRes.ok && agJson?.success) setAgents(agJson.data ?? []);

      if (saRes.ok && saJson?.success && saJson.data) {
        const d = saJson.data;
        setConfigured(true);
        setState({
          id: d.id,
          objective: d.objective,
          voice_agent_id: d.voice_agent_id ?? null,
          product_id: d.product_id ?? null,
          objective_prompt: d.objective_prompt ?? "",
          offer_price: d.offer?.price != null ? String(d.offer.price) : "",
          trigger_on: d.trigger_on === "enter" ? "enter" : "manual",
          action_policy: d.action_policy === "auto" ? "auto" : "suggest",
          is_active: d.is_active !== false,
        });
      } else {
        setConfigured(false);
        setState(EMPTY);
      }

      const { data: prods } = await supabase
        .from("products")
        .select("id, name")
        .order("name")
        .limit(200);
      setProducts((prods as ProductOption[]) ?? []);
    } catch (error) {
      toast({
        title: "No se pudo cargar la configuración del agente",
        description: error instanceof Error ? error.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [stageId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (state.objective === "sell_product" && !state.product_id) {
      toast({ title: "Elige el producto que debe ofrecer el agente", variant: "destructive" });
      return;
    }
    if (state.objective === "custom" && !state.objective_prompt.trim()) {
      toast({ title: "Describe qué debe hacer el agente en esta etapa", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/crm/stage-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage_id: stageId,
          channel: "voice",
          objective: state.objective,
          voice_agent_id: state.voice_agent_id,
          product_id: state.product_id,
          objective_prompt: state.objective_prompt || null,
          offer: state.offer_price ? { price: Number(state.offer_price) } : {},
          trigger_on: state.trigger_on,
          action_policy: state.action_policy,
          is_active: state.is_active,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || `Error ${res.status}`);
      setConfigured(true);
      toast({
        title: "Agente de la etapa guardado",
        description: "El guion se aplicará en la próxima llamada del agente IA.",
      });
    } catch (error) {
      toast({
        title: "No se pudo guardar",
        description: error instanceof Error ? error.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!state.id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/stage-agents?id=${encodeURIComponent(state.id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || `Error ${res.status}`);
      setConfigured(false);
      setState(EMPTY);
      toast({ title: "Configuración eliminada" });
    } catch (error) {
      toast({
        title: "No se pudo eliminar",
        description: error instanceof Error ? error.message : "Error desconocido",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-500 dark:text-gray-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        Cargando configuración…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
        <Bot className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Define qué hace el agente IA cuando llama a un contacto que está en esta etapa.
          {configured ? "" : " Todavía no hay nada configurado para esta etapa."}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sa-objective">¿Qué debe conseguir el agente?</Label>
        <Select
          value={state.objective}
          onValueChange={(v) => setState((s) => ({ ...s, objective: v as StageAgentObjective }))}
        >
          <SelectTrigger id="sa-objective">
            <SelectValue placeholder="Elige el objetivo" />
          </SelectTrigger>
          <SelectContent>
            {STAGE_AGENT_OBJECTIVES.map((o) => (
              <SelectItem key={o} value={o}>
                {OBJECTIVE_LABELS[o]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {state.objective === "sell_product" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="sa-product">Producto a ofrecer</Label>
            <Select
              value={state.product_id ? String(state.product_id) : ""}
              onValueChange={(v) => setState((s) => ({ ...s, product_id: Number(v) }))}
            >
              <SelectTrigger id="sa-product">
                <SelectValue placeholder="Elige el producto" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sa-price">Precio a mencionar</Label>
            <Input
              id="sa-price"
              inputMode="decimal"
              value={state.offer_price}
              onChange={(e) => setState((s) => ({ ...s, offer_price: e.target.value }))}
              placeholder="Ej. 120000"
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="sa-agent">Agente de voz</Label>
        <Select
          value={state.voice_agent_id ?? ""}
          onValueChange={(v) => setState((s) => ({ ...s, voice_agent_id: v || null }))}
        >
          <SelectTrigger id="sa-agent">
            <SelectValue placeholder="Usar el agente de la campaña" />
          </SelectTrigger>
          <SelectContent>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
                {a.is_active ? "" : " (inactivo)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sa-prompt">Instrucciones específicas de esta etapa</Label>
        <Textarea
          id="sa-prompt"
          rows={3}
          value={state.objective_prompt}
          onChange={(e) => setState((s) => ({ ...s, objective_prompt: e.target.value }))}
          placeholder="Ej. Menciona el descuento del 10% si compra esta semana."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="sa-trigger">Cuándo llama</Label>
          <Select
            value={state.trigger_on}
            onValueChange={(v) => setState((s) => ({ ...s, trigger_on: v as "enter" | "manual" }))}
          >
            <SelectTrigger id="sa-trigger">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Solo cuando yo lo pida</SelectItem>
              <SelectItem value="enter">Al entrar una oportunidad en la etapa</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sa-policy">Qué puede cambiar en el CRM</Label>
          <Select
            value={state.action_policy}
            onValueChange={(v) => setState((s) => ({ ...s, action_policy: v as "auto" | "suggest" }))}
          >
            <SelectTrigger id="sa-policy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="suggest">Solo sugerir (lo confirma una persona)</SelectItem>
              <SelectItem value="auto">Aplicar los cambios directamente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" aria-hidden="true" />
          <div>
            <Label htmlFor="sa-active" className="cursor-pointer text-sm">
              Configuración activa
            </Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              El agente siempre se identifica como asistente virtual, avisa de la grabación y respeta la
              baja voluntaria. Eso no se puede desactivar.
            </p>
          </div>
        </div>
        <Switch
          id="sa-active"
          checked={state.is_active}
          onCheckedChange={(v) => setState((s) => ({ ...s, is_active: v }))}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {configured && state.id && (
          <Button type="button" variant="outline" onClick={remove} disabled={saving}>
            Eliminar
          </Button>
        )}
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Guardando…
            </>
          ) : (
            "Guardar agente de la etapa"
          )}
        </Button>
      </div>
    </div>
  );
}
