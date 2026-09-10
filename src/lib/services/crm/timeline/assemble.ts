/**
 * Timeline v2 — de-duplicación (activity canónica vs calls/emails/messages/
 * stage_history), hidratación por lote (≤ 7 queries con .in(ids)) y
 * ensamblado de `TimelineEntry` por kind (FASE-09 §4.2).
 */
import {
  pickOne,
  type Ctx, type Raw, type Row, type TimelineActivityRef, type TimelineCallData, type TimelineEmailData,
  type TimelineEntry, type TimelineEntryBase, type TimelineStageRef, type TimelineUser,
} from './types';
import { CALL_SELECT, LIVE_STATUSES } from './sources';

// ─── De-duplicación ──────────────────────────────────────────────────────────

/**
 * Elimina filas de calls/emails/messages/voice_agent_calls/stage_history que ya
 * están representadas por una activity canónica. Exportada para tests.
 */
export function dedupeRaw(all: Raw[]): Raw[] {
  const activityRows = all.filter((r) => 'activity_type' in r.row);
  const callIds = new Set<string>();
  const emailIds = new Set<string>();
  const messageIds = new Set<string>();
  const historyIds = new Set<string>();
  const stageChanges: Array<{ to: string | null; at: number }> = [];
  for (const a of activityRows) {
    if (a.row.call_id) callIds.add(a.row.call_id);
    if (a.row.email_message_id) emailIds.add(a.row.email_message_id);
    if (a.row.message_id) messageIds.add(a.row.message_id);
    const md = (a.row.metadata ?? {}) as Row;
    if (a.row.activity_type === 'system') {
      if (md.stage_history_id) historyIds.add(String(md.stage_history_id));
      if (md.to_stage_id) stageChanges.push({ to: String(md.to_stage_id), at: Date.parse(a.occurred_at) });
    }
  }
  // Llamadas del agente IA: la fila calls asociada se muestra como ai_call, no como call
  const vaCallIds = new Set<string>();
  for (const r of all) if (r.kind === 'ai_call' && r.row.call_id && !('activity_type' in r.row)) vaCallIds.add(r.row.call_id);

  return all.filter((r) => {
    if ('activity_type' in r.row) return true;
    switch (r.kind) {
      case 'call':
      case 'call_live':
        return !callIds.has(r.id) && !vaCallIds.has(r.id);
      case 'email':
        return !emailIds.has(r.id);
      case 'whatsapp': {
        const list = (r.row.messages ?? []) as Row[];
        const remaining = list.filter((m) => !messageIds.has(m.id));
        if (remaining.length === 0) return false;
        r.row.messages = remaining;
        return true;
      }
      case 'ai_call':
        return !(r.row.call_id && callIds.has(r.row.call_id));
      case 'system': {
        if (historyIds.has(r.id)) return false;
        const at = Date.parse(r.occurred_at);
        return !stageChanges.some((s) => s.to === r.row.to_stage_id && Math.abs(s.at - at) <= 120_000);
      }
      default:
        return true;
    }
  });
}

// ─── Hidratación ─────────────────────────────────────────────────────────────

export interface Hydration {
  profiles: Map<string, TimelineUser>;
  stages: Map<string, TimelineStageRef>;
  events: Map<string, Array<{ event_type: string; occurred_at: string }>>;
  calls: Map<string, Row>;
  emails: Map<string, Row>;
  vaCalls: Map<string, Row>;
  events_cal: Map<string, Row>;
  notesByActivity: Map<string, Row>;
}

export async function hydrate(rows: Raw[], ctx: Ctx): Promise<Hydration> {
  const h: Hydration = {
    profiles: new Map(), stages: new Map(), events: new Map(), calls: new Map(), emails: new Map(), vaCalls: new Map(),
    events_cal: new Map(), notesByActivity: new Map(),
  };
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean) as string[])];
  const stageIds = [...new Set(rows.filter((r) => r.kind === 'system').flatMap((r) => {
    const md = r.row.metadata ?? {};
    return [r.row.from_stage_id, r.row.to_stage_id, md.from_stage_id, md.to_stage_id];
  }).filter(Boolean) as string[])];
  const emailIds = [...new Set(rows.filter((r) => r.kind === 'email').map((r) => r.row.email_message_id ?? r.id))];
  // calls referenciadas por activities (call / ai_call) que no traen la fila calls
  const callIds = [...new Set(rows.filter((r) => (r.kind === 'call' || r.kind === 'ai_call') && 'activity_type' in r.row && r.row.call_id).map((r) => r.row.call_id as string))];
  const activityEmailIds = emailIds.filter((id) => rows.some((r) => r.kind === 'email' && 'activity_type' in r.row && r.row.email_message_id === id));
  const eventIds = [...new Set(rows.filter((r) => r.kind === 'meeting').map((r) => (r.row.metadata ?? {}).event_id).filter(Boolean) as string[])];
  const vaByCall = [...new Set(rows.filter((r) => r.kind === 'ai_call' && 'activity_type' in r.row && r.row.call_id).map((r) => r.row.call_id as string))];

  const sb = ctx.supabase;
  const [profiles, stages, events, calls, emails, vaCalls, calEvents] = await Promise.all([
    userIds.length ? sb.from('profiles').select('id, first_name, last_name, email, avatar_url').in('id', userIds) : Promise.resolve({ data: [] as Row[] }),
    stageIds.length ? sb.from('stages').select('id, name, color').in('id', stageIds) : Promise.resolve({ data: [] as Row[] }),
    // F9-22: el tope se escala con el número de emails de la página (10 eventos
    // por email) para que con muchos emails ninguno se quede sin eventos.
    emailIds.length ? sb.from('email_events').select('email_message_id, event_type, occurred_at').in('email_message_id', emailIds).order('occurred_at', { ascending: false }).limit(Math.min(1000, Math.max(50, emailIds.length * 10))) : Promise.resolve({ data: [] as Row[] }),
    callIds.length ? sb.from('calls').select(CALL_SELECT).eq('organization_id', ctx.orgId).in('id', callIds) : Promise.resolve({ data: [] as Row[] }),
    activityEmailIds.length ? sb.from('email_messages').select('id, subject, to_email, from_email, status, sent_at, created_at, open_count, click_count, body_html_snapshot').eq('organization_id', ctx.orgId).in('id', activityEmailIds) : Promise.resolve({ data: [] as Row[] }),
    vaByCall.length ? sb.from('voice_agent_calls').select('id, call_id, status, outcome, duration_seconds, turns_count, conversation_log, voice_agents(id, name)').eq('organization_id', ctx.orgId).in('call_id', vaByCall) : Promise.resolve({ data: [] as Row[] }),
    eventIds.length ? sb.from('calendar_events').select('id, start_at, end_at, location, status').eq('organization_id', ctx.orgId).in('id', eventIds) : Promise.resolve({ data: [] as Row[] }),
  ]);

  for (const p of (profiles.data ?? []) as Row[]) {
    const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email || 'Usuario';
    h.profiles.set(p.id, { id: p.id, name, avatar_url: p.avatar_url ?? null });
  }
  for (const s of (stages.data ?? []) as Row[]) h.stages.set(s.id, { id: s.id, name: s.name, color: s.color ?? null });
  for (const e of (events.data ?? []) as Row[]) {
    const list = h.events.get(e.email_message_id) ?? [];
    if (list.length < 10) list.push({ event_type: e.event_type, occurred_at: e.occurred_at });
    h.events.set(e.email_message_id, list);
  }
  for (const c of (calls.data ?? []) as Row[]) h.calls.set(c.id, c);
  for (const e of (emails.data ?? []) as Row[]) h.emails.set(e.id, e);
  for (const v of (vaCalls.data ?? []) as Row[]) if (v.call_id) h.vaCalls.set(v.call_id, v);
  for (const ce of (calEvents.data ?? []) as Row[]) h.events_cal.set(ce.id, ce);
  return h;
}

// ─── Ensamblado ──────────────────────────────────────────────────────────────

const MAX_BODY = 200_000;

function toActivityRef(r: Row): TimelineActivityRef {
  return {
    id: r.id,
    activity_type: r.activity_type,
    notes: r.notes ?? null,
    channel: r.channel ?? null,
    outcome: r.outcome ?? null,
    duration_seconds: r.duration_seconds ?? null,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
  };
}

function toCallData(c: Row): TimelineCallData {
  const rec = pickOne<Row>(c.call_recordings);
  const tr = pickOne<Row>(c.call_transcripts);
  const analyses = Array.isArray(c.call_analyses) ? [...c.call_analyses] : c.call_analyses ? [c.call_analyses] : [];
  analyses.sort((a: Row, b: Row) => Date.parse(b.created_at ?? 0) - Date.parse(a.created_at ?? 0));
  const an = analyses[0] as Row | undefined;
  return {
    id: c.id,
    direction: c.direction,
    status: c.status,
    mode: c.mode ?? null,
    duration_seconds: c.duration_seconds ?? null,
    from_number: c.from_number ?? null,
    to_number: c.to_number ?? null,
    recording_enabled: Boolean(c.recording_enabled),
    cost_amount: c.cost_amount != null ? Number(c.cost_amount) : null,
    recording: rec ? { id: rec.id, status: rec.status } : null,
    transcript: tr ? { id: tr.id, status: tr.status } : null,
    analysis: an
      ? { id: an.id, summary: an.summary ?? null, sentiment: an.sentiment ?? null, quality_score: an.quality_score ?? null, suggested_stage_id: an.suggested_stage_id ?? null, next_steps: an.next_steps ?? null }
      : null,
  };
}

function toEmailData(e: Row): TimelineEmailData {
  const body: string | null = e.body_html_snapshot ?? null;
  return {
    id: e.id,
    subject: e.subject,
    to_email: e.to_email,
    from_email: e.from_email ?? null,
    status: e.status,
    sent_at: e.sent_at ?? null,
    open_count: e.open_count ?? 0,
    click_count: e.click_count ?? 0,
    body_html_snapshot: body && body.length > MAX_BODY ? body.slice(0, MAX_BODY) : body,
  };
}

function toVaCall(v: Row) {
  const agent = pickOne<Row>(v.voice_agents);
  return {
    id: v.id,
    outcome: v.outcome ?? null,
    status: v.status,
    duration_seconds: v.duration_seconds ?? null,
    turns_count: v.turns_count ?? 0,
    conversation_log: v.conversation_log ?? null,
    agent: agent ? { id: agent.id, name: agent.name } : null,
  };
}

export function assemble(r: Raw, h: Hydration): TimelineEntry | null {
  const base: TimelineEntryBase = {
    kind: r.kind,
    id: r.id,
    occurred_at: r.occurred_at,
    user: r.user_id ? h.profiles.get(r.user_id) ?? { id: r.user_id, name: 'Usuario', avatar_url: null } : null,
  };
  const isActivity = 'activity_type' in r.row;

  switch (r.kind) {
    case 'call':
    case 'call_live': {
      if (isActivity) {
        const c = r.row.call_id ? h.calls.get(r.row.call_id) : null;
        const call: TimelineCallData = c
          ? toCallData(c)
          : {
              id: r.row.call_id ?? r.id, direction: (r.row.metadata?.direction as string) ?? 'outbound', status: 'completed', mode: (r.row.metadata?.mode as string) ?? 'manual',
              duration_seconds: r.row.duration_seconds ?? null, from_number: null, to_number: null, recording_enabled: false, cost_amount: null, recording: null, transcript: null, analysis: null,
            };
        return { ...base, kind: LIVE_STATUSES.includes(call.status) ? 'call_live' : 'call', call, activity: toActivityRef(r.row) };
      }
      return { ...base, kind: r.kind, call: toCallData(r.row), activity: null };
    }
    case 'email': {
      const e = isActivity ? (r.row.email_message_id ? h.emails.get(r.row.email_message_id) : null) : r.row;
      if (!e) {
        // activity email sin fila email_messages (registro manual)
        return {
          ...base, kind: 'email',
          email: { id: r.id, subject: (r.row.metadata?.subject as string) ?? r.row.notes ?? 'Email', to_email: (r.row.metadata?.to as string) ?? '', from_email: null, status: (r.row.outcome as string) ?? 'sent', sent_at: r.occurred_at, open_count: 0, click_count: 0, body_html_snapshot: null },
          events: [], activity: toActivityRef(r.row),
        };
      }
      return { ...base, kind: 'email', email: toEmailData(e), events: h.events.get(e.id) ?? [], activity: isActivity ? toActivityRef(r.row) : null };
    }
    case 'whatsapp': {
      const list = (r.row.messages ?? []) as Row[];
      const head = list[0];
      const conv = pickOne<Row>(head?.conversation);
      const lastInbound = conv?.last_inbound_at ? Date.parse(conv.last_inbound_at) : null;
      return {
        ...base,
        kind: 'whatsapp',
        conversation_id: head?.conversation_id ?? '',
        channel_id: head?.channel_id ?? null,
        customer_id: conv?.customer_id ?? null,
        count: list.length,
        truncated: Boolean(r.row.truncated),
        messages: list.slice(0, 5).map((m) => ({ id: m.id, direction: m.direction, role: m.role, content: m.content ?? '', content_type: m.content_type ?? 'text', created_at: m.created_at })).reverse(),
        window_open: lastInbound != null && Date.now() - lastInbound < 24 * 3600 * 1000,
      };
    }
    case 'ai_call': {
      if (isActivity) {
        const c = r.row.call_id ? h.calls.get(r.row.call_id) : null;
        const v = r.row.call_id ? h.vaCalls.get(r.row.call_id) : null;
        return { ...base, kind: 'ai_call', voice_agent_call: v ? toVaCall(v) : null, call: c ? toCallData(c) : null, activity: toActivityRef(r.row) };
      }
      return { ...base, kind: 'ai_call', voice_agent_call: toVaCall(r.row), call: null, activity: null };
    }
    case 'task':
      return {
        ...base, kind: 'task',
        task: { id: r.row.id, title: r.row.title, description: r.row.description ?? null, status: r.row.status, priority: r.row.priority ?? null, due_date: r.row.due_date ?? null, assigned_to: r.row.assigned_to ?? null },
      };
    case 'note':
      if (isActivity) return { ...base, kind: 'note', note: null, activity: toActivityRef(r.row) };
      return { ...base, kind: 'note', note: { id: r.row.id, body: r.row.body ?? '', is_pinned: Boolean(r.row.is_pinned) }, activity: null };
    case 'system': {
      if (isActivity) {
        const md = (r.row.metadata ?? {}) as Row;
        return {
          ...base, kind: 'system', activity: toActivityRef(r.row),
          from_stage: md.from_stage_id ? h.stages.get(String(md.from_stage_id)) ?? null : null,
          to_stage: md.to_stage_id ? h.stages.get(String(md.to_stage_id)) ?? null : null,
        };
      }
      return {
        ...base, kind: 'system', activity: null,
        from_stage: r.row.from_stage_id ? h.stages.get(r.row.from_stage_id) ?? null : null,
        to_stage: r.row.to_stage_id ? h.stages.get(r.row.to_stage_id) ?? null : null,
      };
    }
    case 'meeting': {
      const eventId = (r.row.metadata ?? {}).event_id as string | undefined;
      const ev = eventId ? h.events_cal.get(eventId) : null;
      return {
        ...base, kind: 'meeting', activity: toActivityRef(r.row),
        event: ev ? { id: ev.id, start_at: ev.start_at, end_at: ev.end_at ?? null, location: ev.location ?? null, status: ev.status ?? null } : null,
      };
    }
    case 'sms':
      if (!isActivity) return null;
      return { ...base, kind: 'sms', activity: toActivityRef(r.row), event: null };
    case 'activity':
    default:
      if (!isActivity) return null;
      return { ...base, kind: 'activity', activity: toActivityRef(r.row), event: null };
  }
}
