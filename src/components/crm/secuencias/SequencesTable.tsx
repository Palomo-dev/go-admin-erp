'use client';
import { Pencil, Trash2, UserPlus, Users } from 'lucide-react';
import { Table,TableBody,TableCell,TableHead,TableHeader,TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import { StepMiniTimeline } from './StepMiniTimeline';
import { enrollBlockReason,responseSummary,triggerLabel } from './sequenceOptions';
import { totalDurationLabel } from '@/lib/services/crm/sequenceTimeline';
import { useSequenceText } from './useSequenceText';
import type { SequenceView } from './useSequences';
interface Props { sequences:SequenceView[]; canManage:boolean; busy:boolean; onToggle(s:SequenceView):void; onEdit(s:SequenceView):void; onDelete(s:SequenceView):void; onEnroll(s:SequenceView):void; onEnrollments(s:SequenceView):void }
export function SequencesTable({sequences,canManage,busy,onToggle,onEdit,onDelete,onEnroll,onEnrollments}:Props){
 const tr=useSequenceText();
 return <div className="overflow-x-auto rounded-xl border border-line bg-surface"><Table><TableHeader className="bg-subtle"><TableRow>{['Secuencia','Se inscribe cuando','Pasos','Activos','Respuesta','Activa',''].map((s,i)=><TableHead key={i}>{tr(s)}</TableHead>)}</TableRow></TableHeader><TableBody>{sequences.map(s=>{const steps=s.steps??[],reason=enrollBlockReason(s,tr);return <TableRow key={s.id}><TableCell className="max-w-64"><button disabled={!canManage||busy} className="block max-w-full truncate text-left font-medium text-fg disabled:opacity-100" onClick={()=>onEdit(s)}>{s.name}</button><p className="mt-1 text-xs text-fg-secondary">{steps.length} {tr('pasos')} · {totalDurationLabel(steps,tr)}</p></TableCell><TableCell className="text-xs text-fg-secondary">{tr(triggerLabel(s.trigger_type))}</TableCell><TableCell><StepMiniTimeline steps={steps}/></TableCell><TableCell className="text-right tabular-nums">{s.enrollment_stats?.active??'—'}</TableCell><TableCell className="max-w-48 text-xs text-fg-secondary">{s.enrollment_stats ? responseSummary(s.enrollment_stats,s.pause_on_reply,tr) : '—'}</TableCell><TableCell><Switch checked={s.is_active} disabled={!canManage||busy} aria-label={tr('Activar la secuencia {p0}',{p0:s.name})} onCheckedChange={()=>onToggle(s)}/></TableCell><TableCell><RowActionsMenu titulo={s.name} acciones={[
 {id:'enrollments',etiqueta:tr('Inscripciones'),icono:Users,onSelect:()=>onEnrollments(s)},
 {id:'enroll',etiqueta:tr('Inscribir'),icono:UserPlus,onSelect:()=>onEnroll(s),deshabilitada:!canManage||busy||reason!==null},
 {id:'edit',etiqueta:tr('Editar'),icono:Pencil,onSelect:()=>onEdit(s),deshabilitada:!canManage||busy},
 {id:'delete',etiqueta:tr('Eliminar'),icono:Trash2,onSelect:()=>onDelete(s),deshabilitada:!canManage||busy,destructiva:true},
 ]}/>{reason&&<p className="sr-only">{reason}</p>}</TableCell></TableRow>;})}</TableBody></Table></div>;
}
