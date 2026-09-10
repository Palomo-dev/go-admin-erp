'use client';

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CampanasService, type PipelineOption, type SegmentOption, type StageOption } from '../CampanasService';

export interface AudienceValue { source: 'segment' | 'stage'; segment_id: string | null; pipeline_id: string | null; stage_ids: string[] }

/** Paso 2 del wizard: origen segmento | etapas del pipeline. (La selección manual llega desde el Kanban.) */
export function AudienceStep({ value, onChange }: { value: AudienceValue; onChange: (v: AudienceValue) => void }) {
  const [segments, setSegments] = useState<SegmentOption[]>([]);
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [stages, setStages] = useState<StageOption[]>([]);

  useEffect(() => {
    void CampanasService.getSegments().then(setSegments);
    void CampanasService.getPipelines().then((p) => { setPipelines(p); if (!value.pipeline_id && p.length) onChange({ ...value, pipeline_id: (p.find((x) => x.is_default) ?? p[0]).id }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (value.pipeline_id) void CampanasService.getStages(value.pipeline_id).then(setStages); else setStages([]); }, [value.pipeline_id]);

  const toggleStage = (id: string) => onChange({ ...value, stage_ids: value.stage_ids.includes(id) ? value.stage_ids.filter((s) => s !== id) : [...value.stage_ids, id] });
  const seg = segments.find((s) => s.id === value.segment_id);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 text-xs" role="radiogroup" aria-label="Origen de la audiencia">
        {([['stage', 'Etapas del pipeline'], ['segment', 'Segmento de clientes']] as const).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={value.source === k} onClick={() => onChange({ ...value, source: k })} className={`px-3 py-1.5 rounded-md border ${value.source === k ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300' : 'border-gray-200 dark:border-gray-700'}`}>{label}</button>
        ))}
      </div>
      {value.source === 'segment' ? (
        <div className="space-y-2">
          <Label htmlFor="aud-seg" className="text-xs">Segmento</Label>
          <Select value={value.segment_id ?? ''} onValueChange={(v) => onChange({ ...value, segment_id: v })}>
            <SelectTrigger id="aud-seg" className="bg-gray-50 dark:bg-gray-900"><SelectValue placeholder="Seleccionar segmento" /></SelectTrigger>
            <SelectContent>{segments.map((s) => <SelectItem key={s.id} value={s.id}><span className="inline-flex items-center gap-2"><Users className="h-3.5 w-3.5 text-gray-400" />{s.name}<Badge variant="outline" className="text-[10px]">{s.customer_count}</Badge></span></SelectItem>)}</SelectContent>
          </Select>
          {seg && <p className="text-xs text-gray-500">≈ {seg.customer_count} clientes antes de exclusiones (opt-out, sin teléfono, duplicados).</p>}
          {segments.length === 0 && <p className="text-xs text-gray-500">No hay segmentos. Créalos en CRM › Segmentos.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="aud-pipe" className="text-xs">Pipeline</Label>
          <Select value={value.pipeline_id ?? ''} onValueChange={(v) => onChange({ ...value, pipeline_id: v, stage_ids: [] })}>
            <SelectTrigger id="aud-pipe" className="bg-gray-50 dark:bg-gray-900"><SelectValue placeholder="Pipeline" /></SelectTrigger>
            <SelectContent>{pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <p className="text-xs text-gray-500">Se incluyen las oportunidades <strong>abiertas</strong> de las etapas marcadas (una por cliente).</p>
          <ul className="grid sm:grid-cols-2 gap-1">
            {stages.map((s) => (
              <li key={s.id}><label className="flex items-center gap-2 text-sm rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1.5 cursor-pointer"><Checkbox checked={value.stage_ids.includes(s.id)} onCheckedChange={() => toggleStage(s.id)} aria-label={s.name} />{s.name}</label></li>
            ))}
            {stages.length === 0 && <li className="text-xs text-gray-500">Sin etapas.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
