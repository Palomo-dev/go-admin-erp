/**
 * Timeline v2 — fuente WhatsApp (`messages` agrupados por conversación + día
 * de Bogotá). Separada de `sources.ts` por tamaño y porque su paginación no es
 * fila a fila sino por grupo (FASE-09 §4.2, ronda 2/3).
 *
 * - F9-05: un grupo es indivisible. Con cursor se pide hasta el final del día
 *   del cursor (así el grupo llega completo y su cabecera es la real) y se
 *   descartan los grupos cuya cabecera NO es estrictamente anterior al cursor:
 *   esos ya se mostraron enteros en una página previa.
 * - F9-09: en el timeline de una oportunidad no entran mensajes atribuidos a
 *   OTRA oportunidad del mismo cliente.
 * - F9-33 (ronda 3): la ventana ancha se agota cuando un solo día tiene más de
 *   `MSG_FETCH` mensajes, y entonces los días ANTERIORES no se leían nunca — el
 *   historial previo desaparecía para siempre. Con cursor se lanza además una
 *   consulta acotada por arriba al INICIO de ese día, que alcanza siempre lo
 *   anterior por muy cargado que esté el día del cursor.
 * - F9-34 (ronda 3): una entrada carga como mucho `GROUP_CAP` mensajes (los más
 *   recientes del grupo) y declara `truncated` cuando hay más; antes una sola
 *   tarjeta podía llegar con `MSG_FETCH` mensajes dentro.
 */
import { compareDesc, isBefore, type Ctx, type Raw, type Row, type SourceResult } from './types';
import {
  applyRange, atOr, bogotaDay, bogotaDayStart, bogotaNextDayStart,
  DESC_NULLS_LAST, ID_DESC, isoUtc,
} from './cursor';

const MSG_SELECT =
  'id, conversation_id, channel_id, direction, role, content, content_type, created_at, related_opportunity_id, ' +
  'conversation:conversations!inner(id, customer_id, last_inbound_at, last_message_at)';

/** Filas por consulta a `messages`. */
const MSG_FETCH = 200;

/** Tope de mensajes que puede llevar UNA entrada del timeline (F9-34). */
export const GROUP_CAP = 50;

type MsgResult = { data: Row[] | null; error: { message: string } | null };

/**
 * WhatsApp: mensajes por `related_opportunity_id` (oportunidad) O de las
 * conversaciones del cliente **no atribuidas a otra oportunidad** dentro de la
 * ventana; para clientes, todas sus conversaciones. Agrupados por
 * conversación + día de Bogotá.
 */
export async function fetchWhatsApp(ctx: Ctx): Promise<SourceResult> {
  if (ctx.q.userId) return { rows: [], tail: null };

  /** Consultas de una variante de ventana (ancha o "días anteriores"). */
  const buildQueries = (variant: Ctx): Promise<MsgResult>[] => {
    const out: Promise<MsgResult>[] = [];
    if (ctx.entityType === 'opportunity') {
      let q1 = ctx.supabase
        .from('messages')
        .select(MSG_SELECT)
        .eq('organization_id', ctx.orgId)
        .eq('related_opportunity_id', ctx.entityId);
      q1 = applyRange(q1, 'created_at', variant);
      out.push(q1.order('created_at', DESC_NULLS_LAST).order('id', ID_DESC).limit(MSG_FETCH) as unknown as Promise<MsgResult>);
    }
    const customerId = ctx.entityType === 'customer' ? ctx.entityId : ctx.customerId;
    if (customerId) {
      let q2 = ctx.supabase
        .from('messages')
        .select(MSG_SELECT)
        .eq('organization_id', ctx.orgId)
        .eq('conversation.customer_id', customerId);
      if (ctx.entityType === 'opportunity') {
        // F9-09: nada atribuido a OTRA oportunidad del mismo cliente
        q2 = q2.or(`related_opportunity_id.is.null,related_opportunity_id.eq.${ctx.entityId}`);
        if (ctx.windowFrom) q2 = q2.gte('created_at', ctx.windowFrom);
      }
      q2 = applyRange(q2, 'created_at', variant);
      out.push(q2.order('created_at', DESC_NULLS_LAST).order('id', ID_DESC).limit(MSG_FETCH) as unknown as Promise<MsgResult>);
    }
    return out;
  };

  // Con cursor la ventana se ensancha hasta el final de su día (máx. 24 h de más)
  const wideCtx: Ctx = ctx.cursor
    ? { ...ctx, cursor: null, q: { ...ctx.q, to: minIso(ctx.q.to, bogotaNextDayStart(ctx.cursor.at)) } }
    : ctx;
  // …y se añade la ventana "estrictamente antes del día del cursor" (F9-33)
  const olderCtx: Ctx | null = ctx.cursor
    ? { ...ctx, cursor: null, q: { ...ctx.q, to: minIso(ctx.q.to, bogotaDayStart(ctx.cursor.at)) } }
    : null;

  const queries = [...buildQueries(wideCtx), ...(olderCtx ? buildQueries(olderCtx) : [])];
  if (queries.length === 0) return { rows: [], tail: null };

  const results = await Promise.all(queries);
  const byId = new Map<string, Row>();
  let anyFull = false;
  for (const r of results) {
    if (r.error) throw new Error(`timeline/messages: ${r.error.message}`);
    const list = r.data ?? [];
    if (list.length >= MSG_FETCH) anyFull = true;
    for (const m of list) byId.set(m.id, m);
  }
  const msgs = [...byId.values()];
  msgs.sort((a, b) => compareDesc({ occurred_at: atOr(a.created_at), id: a.id }, { occurred_at: atOr(b.created_at), id: b.id }));

  const groups = new Map<string, Row[]>();
  for (const m of msgs) {
    const key = `${m.conversation_id}:${bogotaDay(atOr(m.created_at))}`;
    const g = groups.get(key);
    if (g) g.push(m);
    else groups.set(key, [m]);
  }
  const rows: Raw[] = [];
  for (const list of groups.values()) {
    const head = list[0];
    // Grupo indivisible: si su cabecera no es anterior al cursor ya se mostró
    if (ctx.cursor && !isBefore({ occurred_at: atOr(head.created_at), id: head.id }, ctx.cursor)) continue;
    // F9-34: la entrada lleva como mucho GROUP_CAP mensajes (los más recientes)
    const capped = list.length > GROUP_CAP ? list.slice(0, GROUP_CAP) : list;
    rows.push({
      kind: 'whatsapp',
      id: head.id,
      occurred_at: atOr(head.created_at),
      user_id: null,
      row: { messages: capped, head, truncated: capped.length < list.length },
    });
  }
  rows.sort(compareDesc);
  // Si alguna consulta llegó al tope de `MSG_FETCH`, el grupo más antiguo puede
  // estar incompleto: se descarta y la cola marca hasta dónde es seguro paginar.
  // (Como mucho difiere una entrada a la página siguiente; nunca la pierde.)
  let list = rows;
  if (anyFull && list.length > 1) list = list.slice(0, -1);
  if (list.length > ctx.limit) return { rows: list.slice(0, ctx.limit), tail: list[ctx.limit - 1] };
  if (anyFull && list.length > 0) return { rows: list, tail: list[list.length - 1] };
  return { rows: list, tail: null };
}

function minIso(a: string | undefined, b: string): string {
  if (!a) return b;
  return isoUtc(a) <= isoUtc(b) ? isoUtc(a) : isoUtc(b);
}
