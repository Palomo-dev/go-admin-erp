'use client';

/**
 * "Redactar con IA": tono + objetivo + instrucciones → POST /api/crm/ia/draft-email
 * (gpt-5.6-luna, cobra créditos). Devuelve asunto/preheader/bloques al compositor.
 */

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import type { BlockDocument } from '@/lib/services/crm/email/blocks';
import { draftEmailWithAi } from '../emailApi';

const TONES = [{ value: 'cercano', label: 'Cercano' }, { value: 'formal', label: 'Formal' }, { value: 'directo', label: 'Directo' }, { value: 'entusiasta', label: 'Entusiasta' }];
const GOALS = [
  { value: 'seguimiento', label: 'Seguimiento' }, { value: 'propuesta', label: 'Enviar propuesta' }, { value: 'demo', label: 'Agendar demo' },
  { value: 'reactivar', label: 'Reactivar' }, { value: 'cobrar', label: 'Cobro amable' }, { value: 'agradecer', label: 'Agradecer' }, { value: 'custom', label: 'Otro…' },
];

interface Props {
  opportunityId?: string;
  customerId?: string;
  onDraft: (d: { subject: string; preheader: string; blocks: BlockDocument }) => void;
  disabled?: boolean;
}

export function AIDraftPopover({ opportunityId, customerId, onDraft, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState('cercano');
  const [goal, setGoal] = useState('seguimiento');
  const [customGoal, setCustomGoal] = useState('');
  const [extra, setExtra] = useState('');
  const [loading, setLoading] = useState(false);
  const enabled = !!(opportunityId || customerId);

  const generate = async () => {
    setLoading(true);
    try {
      const r = await draftEmailWithAi({ opportunityId, customerId, tone, goal, customGoal: goal === 'custom' ? customGoal : undefined, extraInstructions: extra || undefined, language: 'es' });
      onDraft({ subject: r.data.subject, preheader: r.data.preheader, blocks: r.data.blocks });
      toast({ title: 'Borrador generado', description: `${r.data.model} · ${r.data.credits_used} crédito${r.data.credits_used === 1 ? '' : 's'}` });
      setOpen(false);
    } catch (err) {
      toast({ title: 'No se pudo redactar', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled || !enabled} title={enabled ? undefined : 'Necesita una oportunidad o cliente'} className="gap-1 dark:border-gray-600 dark:text-gray-200">
          <Sparkles className="h-3.5 w-3.5 text-purple-600" aria-hidden="true" /> Redactar con IA
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3 dark:bg-gray-800" align="start">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Tono</Label>
            <Select value={tone} onValueChange={setTone}><SelectTrigger className="h-8 text-sm" aria-label="Tono"><SelectValue /></SelectTrigger><SelectContent>{TONES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Objetivo</Label>
            <Select value={goal} onValueChange={setGoal}><SelectTrigger className="h-8 text-sm" aria-label="Objetivo"><SelectValue /></SelectTrigger><SelectContent>{GOALS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent></Select>
          </div>
        </div>
        {goal === 'custom' && (
          <div className="space-y-1">
            <Label htmlFor="ai-custom-goal" className="text-xs">Describe el objetivo</Label>
            <Textarea id="ai-custom-goal" rows={2} value={customGoal} onChange={(e) => setCustomGoal(e.target.value)} className="text-sm" />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="ai-extra" className="text-xs">Instrucciones (opcional)</Label>
          <Textarea id="ai-extra" rows={2} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Menciona el descuento de lanzamiento…" className="text-sm" />
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">Usa el contexto de la oportunidad (etapa, contacto, cotización, última llamada). Consume 1 crédito de IA.</p>
        <Button type="button" size="sm" onClick={generate} disabled={loading || (goal === 'custom' && !customGoal.trim())} className="w-full gap-1">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />} Generar borrador
        </Button>
      </PopoverContent>
    </Popover>
  );
}
