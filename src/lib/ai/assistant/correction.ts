import type { SupabaseClient } from '@supabase/supabase-js';

/** La corrección recupera datos del servidor, nunca argumentos enviados por el navegador. */
export async function loadCorrection(
  supabase: SupabaseClient, organizationId: number, userId: string,
  conversationId: string, actionId: unknown,
): Promise<string | null> {
  if (typeof actionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(actionId)) return null;
  const { data, error } = await supabase.from('ai_agent_actions')
    .select('tool_name, args, preview')
    .eq('id', actionId).eq('organization_id', organizationId).eq('user_id', userId)
    .eq('conversation_id', conversationId).eq('status', 'rejected').eq('error_code', 'rejected_by_user').maybeSingle();
  if (error || !data) return null;
  return JSON.stringify({ tool: data.tool_name, args: data.args, preview: data.preview });
}
