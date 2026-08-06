// ============================================================
// Reportes de Chat Omnicanal
// Llama a la RPC: fn_reporte_chat_sla + consultas directas
// ============================================================

import { supabase } from '@/lib/supabase/config';
import type { ReportDefinition, ReportData, PeriodoCierre } from '../types';

function buildReportData(
  id: string, titulo: string, modulo: string, periodo: PeriodoCierre,
  kpis: ReportData['kpis'], columnas: ReportData['columnas'],
  filas: Record<string, unknown>[], totales?: Record<string, unknown>,
): ReportData {
  return { id, titulo, modulo, kpis, columnas, filas, totales, generadoEn: new Date().toISOString(), periodo };
}

export const chatReports: ReportDefinition[] = [
  {
    id: 'chat-volumen',
    modulo: 'chat',
    titulo: 'Volumen de Conversaciones',
    descripcion: 'Conversaciones por canal y período',
    categoria: 'sistema',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('conversations')
        .select('id, status, channel_id, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('created_at', `${periodo.fechaFin}T23:59:59Z`);

      if (error) throw error;

      const convs = data ?? [];
      const porCanal: Record<string, number> = {};
      convs.forEach((c: Record<string, unknown>) => {
        const ch = String(c.channel_id ?? 'unknown');
        porCanal[ch] = (porCanal[ch] ?? 0) + 1;
      });

      const filas = Object.entries(porCanal).map(([canal, cantidad]) => ({ canal, cantidad }));

      return buildReportData(
        'chat-volumen', 'Volumen de Conversaciones', 'chat', periodo,
        [
          { titulo: 'Total Conversaciones', valor: convs.length, formato: 'numero' },
        ],
        [
          { key: 'canal', titulo: 'Canal', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Conversaciones', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { cantidad: convs.length },
      );
    },
  },
  {
    id: 'chat-sla',
    modulo: 'chat',
    titulo: 'SLA y Tiempos',
    descripcion: 'Primera respuesta, resolución y volumen por canal',
    categoria: 'sistema',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_chat_sla', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'chat-sla', 'SLA y Tiempos', 'chat', periodo,
        [
          { titulo: 'Total Conversaciones', valor: d.total_conversaciones ?? 0, formato: 'numero' },
          { titulo: 'Primera Respuesta (s)', valor: Math.round(Number(d.promedio_primera_respuesta_seg ?? 0)), formato: 'numero' },
          { titulo: 'Resolución (s)', valor: Math.round(Number(d.promedio_resolucion_seg ?? 0)), formato: 'numero' },
        ],
        [
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
        ],
        d.por_estado ?? [],
      );
    },
  },
  {
    id: 'chat-agentes',
    modulo: 'chat',
    titulo: 'Performance de Agentes',
    descripcion: 'Conversaciones atendidas, satisfacción y tiempos',
    categoria: 'sistema',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('conversations')
        .select('id, assigned_member_id, status, message_count, first_response_time_seconds')
        .eq('organization_id', orgId)
        .gte('created_at', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('created_at', `${periodo.fechaFin}T23:59:59Z`)
        .not('assigned_member_id', 'is', null);

      if (error) throw error;

      const convs = data ?? [];
      const porAgente: Record<string, { conversaciones: number; mensajes: number; respuestaSeg: number }> = {};
      convs.forEach((c: Record<string, unknown>) => {
        const id = String(c.assigned_member_id ?? '');
        if (!porAgente[id]) porAgente[id] = { conversaciones: 0, mensajes: 0, respuestaSeg: 0 };
        porAgente[id].conversaciones++;
        porAgente[id].mensajes += Number(c.message_count ?? 0);
        porAgente[id].respuestaSeg += Number(c.first_response_time_seconds ?? 0);
      });

      const filas = Object.entries(porAgente).map(([agente_id, v]) => ({
        agente_id,
        conversaciones: v.conversaciones,
        mensajes: v.mensajes,
        respuesta_promedio_seg: v.conversaciones > 0 ? Math.round(v.respuestaSeg / v.conversaciones) : 0,
      }));

      return buildReportData(
        'chat-agentes', 'Performance de Agentes', 'chat', periodo,
        [
          { titulo: 'Agentes', valor: filas.length, formato: 'numero' },
          { titulo: 'Total Conversaciones', valor: convs.length, formato: 'numero' },
        ],
        [
          { key: 'agente_id', titulo: 'Agente', tipo: 'texto' },
          { key: 'conversaciones', titulo: 'Conversaciones', tipo: 'numero', alinear: 'right' },
          { key: 'mensajes', titulo: 'Mensajes', tipo: 'numero', alinear: 'right' },
          { key: 'respuesta_promedio_seg', titulo: 'Respuesta Prom. (s)', tipo: 'numero', alinear: 'right' },
        ],
        filas,
      );
    },
  },
  {
    id: 'chat-tags',
    modulo: 'chat',
    titulo: 'Tags y Categorización',
    descripcion: 'Distribución de conversaciones por tag',
    categoria: 'sistema',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('conversation_tag_relations')
        .select('tag_id, conversation_id, conversation_tags(name)')
        .eq('organization_id', orgId)
        .gte('created_at', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('created_at', `${periodo.fechaFin}T23:59:59Z`);

      if (error) throw error;

      const tags = data ?? [];
      const porTag: Record<string, number> = {};
      tags.forEach((t: Record<string, unknown>) => {
        const tag = t.conversation_tags as Record<string, unknown> | null;
        const nombre = String(tag?.name ?? t.tag_id ?? 'unknown');
        porTag[nombre] = (porTag[nombre] ?? 0) + 1;
      });

      const filas = Object.entries(porTag).map(([tag, cantidad]) => ({ tag, cantidad }));

      return buildReportData(
        'chat-tags', 'Tags y Categorización', 'chat', periodo,
        [
          { titulo: 'Tags Usados', valor: filas.length, formato: 'numero' },
        ],
        [
          { key: 'tag', titulo: 'Tag', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Conversaciones', tipo: 'numero', alinear: 'right' },
        ],
        filas,
      );
    },
  },
];
