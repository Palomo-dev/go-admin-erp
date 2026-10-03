'use client';

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { BadgeTono } from '@/components/kit/BadgeTono';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { FormField } from '@/components/kit/FormField';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';

import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { CampanasService, type PipelineOption, type SegmentOption, type StageOption } from '../CampanasService';

export interface AudienceValue { source: 'segment' | 'stage'; segment_id: string | null; pipeline_id: string | null; stage_ids: string[] }

/** Paso 2 del wizard: origen segmento | etapas del pipeline. (La selección manual llega desde el Kanban.) */
export function AudienceStep({ value, onChange }: { value: AudienceValue; onChange: (v: AudienceValue) => void }) {
  const t = useTranslations('crm.campanasVisual');
  const [error, setError] = useState(false);
  const [segments, setSegments] = useState<SegmentOption[]>([]);
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [stages, setStages] = useState<StageOption[]>([]);

  useEffect(() => {
    let active = true;
    setError(false);
    void Promise.all([CampanasService.getSegments(), CampanasService.getPipelines()]).then(([segments, pipelines]) => {
      if (!active) return; setSegments(segments); setPipelines(pipelines);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true; setStages([]);
    if (value.pipeline_id) void CampanasService.getStages(value.pipeline_id).then(rows => { if (active) setStages(rows); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [value.pipeline_id]);
  const toggleStage = (id: string) => onChange({ ...value, stage_ids: value.stage_ids.includes(id) ? value.stage_ids.filter(s => s !== id) : [...value.stage_ids, id] });
  const seg = segments.find(s => s.id === value.segment_id);
  return <div className="space-y-3">
    <SegmentedControl etiqueta={t('audience')} valor={value.source} onValorChange={source => onChange({ ...value, source: source === 'segment' ? 'segment' : 'stage' })}
      opciones={[{ valor: 'segment', etiqueta: t('segment') }, { valor: 'stage', etiqueta: t('stages') }]} />
    {error && <p role="alert" className="text-xs text-danger-text">{t('audienceError')}</p>}
    {value.source === 'segment' ? <FormField etiqueta={t('segment')} tamanoEtiqueta="sm">
      <SelectCrm valor={value.segment_id ?? ''} onValorChange={id => onChange({ ...value, segment_id: id })} placeholder={t('selectSegment')}
        opciones={segments.map(s => ({ valor: s.id, etiqueta: <span className="inline-flex items-center gap-2"><Users className="size-3.5 text-fg-secondary" strokeWidth={1.5} />{s.name}<BadgeTono tono="neutro">{s.customer_count}</BadgeTono></span> }))} />
    </FormField> : <div className="space-y-3">
      <FormField etiqueta={t('pipeline')} tamanoEtiqueta="sm"><SelectCrm valor={value.pipeline_id ?? ''} placeholder={t('pipeline')}
        onValorChange={pipeline_id => onChange({ ...value, pipeline_id, stage_ids: [] })} opciones={pipelines.map(p => ({ valor: p.id, etiqueta: p.name }))} /></FormField>
      <p className="text-xs text-fg-secondary">{t('stagesHelp')}</p>
      <ul className="grid gap-2 sm:grid-cols-2">{stages.map(s => <li key={s.id}><label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-fg"><Checkbox checked={value.stage_ids.includes(s.id)} onCheckedChange={() => toggleStage(s.id)} aria-label={s.name} />{s.name}</label></li>)}</ul>
    </div>}
    {seg && <p className="text-xs text-fg-secondary">{t('beforeExclusions', { n: seg.customer_count })}</p>}
  </div>;
}
