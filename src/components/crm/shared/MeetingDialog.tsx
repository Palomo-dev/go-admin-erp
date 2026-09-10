'use client';

import { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, Loader2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';

/**
 * MeetingDialog (F9) — agenda una reunión vía POST /api/crm/meetings
 * (calendar_events + activity 'meeting'). Sin inserts desde el cliente (B11).
 * La invitación .ics por email se activa cuando F7 exponga adjuntos.
 */
export interface MeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId?: string;
  customerId?: string;
  customer?: { id?: string; full_name?: string | null; email?: string | null } | null;
  opportunityName?: string;
  onCreated?: (result: { event_id: string; activity_id: string }) => void;
}

const QUICK_DURATIONS = [30, 45, 60];

function toLocalInput(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MeetingDialog({ open, onOpenChange, opportunityId, customerId, customer, opportunityName, onCreated }: MeetingDialogProps) {
  const defaultStart = useMemo(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return toLocalInput(d);
  }, []);
  const [title, setTitle] = useState(opportunityName ? `Reunión · ${opportunityName}` : customer?.full_name ? `Reunión con ${customer.full_name}` : '');
  const [start, setStart] = useState(defaultStart);
  const [duration, setDuration] = useState(60);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const valid = title.trim().length > 0 && Boolean(start) && duration > 0;

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const startAt = new Date(start);
      const endAt = new Date(startAt.getTime() + duration * 60_000);
      const res = await fetch('/api/crm/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Bogota',
          location: location.trim() || null,
          description: description.trim() || null,
          opportunity_id: opportunityId ?? null,
          customer_id: customerId ?? customer?.id ?? null,
          attendees: customer?.email ? [customer.email] : [],
          send_invite: false,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || `Error ${res.status}`);
      toast({ title: 'Reunión agendada', description: 'Visible en el timeline y en /app/calendario' });
      onCreated?.({ event_id: json.data?.event?.id, activity_id: json.data?.activity_id });
      onOpenChange(false);
    } catch (err) {
      toast({ title: 'Error agendando reunión', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-white dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <CalendarIcon className="h-5 w-5 text-purple-500" />
            Agendar reunión
          </DialogTitle>
          <DialogDescription>Se crea en el calendario y se registra como actividad de {opportunityId ? 'la oportunidad' : 'el cliente'}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="mt-title" className="text-xs">Título *</Label>
            <Input id="mt-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reunión con cliente" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mt-start" className="text-xs">Inicio *</Label>
              <Input id="mt-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mt-duration" className="text-xs">Duración (min)</Label>
              <div className="flex gap-1">
                {QUICK_DURATIONS.map((d) => (
                  <Button key={d} type="button" size="sm" variant={duration === d ? 'default' : 'outline'} className={cn('h-9 px-2 text-xs')} onClick={() => setDuration(d)}>{d}</Button>
                ))}
                <Input id="mt-duration" type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(parseInt(e.target.value, 10) || 0)} className="h-9 w-16" />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mt-location" className="text-xs">Ubicación o enlace</Label>
            <Input id="mt-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Oficina / Google Meet / Zoom" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mt-desc" className="text-xs">Agenda</Label>
            <Textarea id="mt-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Temas a tratar…" />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={handleSave} disabled={saving || !valid}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
