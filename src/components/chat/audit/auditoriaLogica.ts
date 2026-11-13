/**
 * Reglas puras de la Auditoría del chat (Figma 91-chat-41), sin React.
 */
import type { LucideIcon } from 'lucide-react';
import { Bot, BookOpen, FileText, Key, Lock, MessageSquare, Radio, Settings, Tag, Trash2, User, Zap } from 'lucide-react';

/** Acciones que registran los servicios del Chat (clave i18n `chatModulo.auditoria.acciones.*`). */
export const ACCIONES_AUDITORIA = [
  'create_channel',
  'update_channel',
  'update_website_settings',
  'rotate_public_key',
  'add_allowed_domain',
  'remove_allowed_domain',
  'update_channel_ai_mode',
  'update_all_channels_ai_mode',
  'update_ai_settings',
  'create_knowledge_source',
  'update_knowledge_source',
  'delete_knowledge_source',
  'toggle_knowledge_source',
  'reindex_knowledge_source',
  'create_knowledge_fragment',
  'update_knowledge_fragment',
  'update_knowledge_fragment_version',
  'delete_knowledge_fragment',
  'toggle_knowledge_fragment',
  'reindex_knowledge_fragment',
  'import_knowledge_fragments',
  'retry_ai_job',
  'cancel_ai_job',
  'block_session',
  'unblock_session',
  'assign_conversation',
  'close_conversation',
  'create_tag',
  'update_tag',
  'delete_tag',
  'create_quick_reply',
  'update_quick_reply',
  'delete_quick_reply',
  'create_api_key',
  'revoke_api_key',
] as const;

export const ENTIDADES_AUDITORIA = ['channel', 'conversation', 'message', 'knowledge_source', 'knowledge_fragment', 'ai_settings', 'ai_job', 'widget_session', 'conversation_tag', 'quick_reply', 'channel_api_key', 'customer'] as const;

export type RangoAuditoria = 'hoy' | '7d' | '30d' | 'todo';

export function diasDeRangoAuditoria(r: RangoAuditoria): number | null {
  return r === 'hoy' ? 0 : r === '7d' ? 6 : r === '30d' ? 29 : null;
}

/** «update_website_settings» → «Update website settings» (para acciones nuevas sin traducción). */
export function humanizarAccion(accion: string): string {
  const t = accion.replace(/_/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : accion;
}

export function iconoAccion(accion: string, entidad: string): LucideIcon {
  if (accion.startsWith('delete') || accion.startsWith('remove')) return Trash2;
  if (accion.includes('ai_mode') || accion.includes('ai_settings') || accion.includes('ai_job')) return Bot;
  if (accion.includes('key')) return Key;
  if (accion.includes('session') || accion.startsWith('close')) return Lock;
  if (accion.startsWith('import') || accion.startsWith('reindex')) return Zap;
  if (accion.startsWith('assign')) return User;
  switch (entidad) {
    case 'channel':
      return Radio;
    case 'knowledge_source':
    case 'knowledge_fragment':
      return BookOpen;
    case 'conversation':
    case 'message':
      return MessageSquare;
    case 'conversation_tag':
      return Tag;
    case 'ai_settings':
      return Settings;
    default:
      return FileText;
  }
}

/** Celda CSV con comillas dobles escapadas. */
export function celdaCsv(v: unknown): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}
