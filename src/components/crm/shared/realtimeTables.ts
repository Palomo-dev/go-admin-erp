/**
 * Tablas realmente incluidas en la publicación `supabase_realtime` del proyecto.
 *
 * **Verificado por MCP el 2026-09-09** (ronda 3) con
 * `select schemaname, tablename from pg_publication_tables where pubname='supabase_realtime'`.
 *
 * Motivo (F9-04): suscribirse a una tabla que NO está publicada no da error —
 * el canal entra en `SUBSCRIBED` y simplemente no llega nunca un evento. El
 * tablero mostraba un chip verde "tiempo real" que mentía y el drawer confiaba
 * en un refresco que no existía. Con esta lista la UI sabe cuándo tiene que
 * caer a polling y cuándo puede prometer tiempo real.
 *
 * F9-38: la lista se quedó desalineada el mismo día en que DB publicó `notes`,
 * y el timeline siguió en sondeo de 15 s sin necesidad. **Al tocar esta lista
 * hay que volver a ejecutar la consulta de arriba**: es una foto de la
 * publicación, no una preferencia. Sigue sin publicarse lo que de verdad haría
 * falta para el tablero (`opportunities` y `stages`): mientras tanto el Kanban
 * usa el evento `refresh-pipeline-data` + sondeo, no un chip verde falso.
 */
/**
 * F5 (2026-09-10): la migración `crm_v4_f05_bridges_call_link` añadió
 * `mobile_call_bridges` a la publicación (verificado con la consulta de arriba:
 * `pg_publication_tables` la devuelve). El diálogo "Llamar desde mi celular"
 * depende de ella para seguir el bridge en vivo.
 */
export const REALTIME_PUBLISHED_TABLES = new Set<string>([
  'activities',
  'ai_jobs',
  'call_analyses',
  'call_transcripts',
  'calls',
  'conversation_tag_relations',
  'conversations',
  'email_messages',
  'kitchen_tickets',
  'messages',
  'mobile_call_bridges',
  'notes',
  'notification_reads',
  'notifications',
  'opportunity_stage_history',
  'outbound_jobs',
  'products',
  'profiles',
  'tasks',
  'web_orders',
  'website_visits',
  'widget_sessions',
]);

/** ¿Esta tabla emite eventos de postgres_changes hoy? */
export function isRealtimePublished(table: string): boolean {
  return REALTIME_PUBLISHED_TABLES.has(table);
}

/** ¿Todas las tablas de las que depende una vista están publicadas? */
export function allRealtimePublished(tables: readonly string[]): boolean {
  return tables.every(isRealtimePublished);
}

/**
 * Evento de refresco del pipeline. Lo emite el drawer/los diálogos tras
 * cualquier mutación y lo escucha el tablero; es el mecanismo que sustituye al
 * realtime mientras `opportunities`/`stages` no estén publicadas (F9-04).
 */
export const PIPELINE_REFRESH_EVENT = 'refresh-pipeline-data';

export function emitPipelineRefresh(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PIPELINE_REFRESH_EVENT));
}
