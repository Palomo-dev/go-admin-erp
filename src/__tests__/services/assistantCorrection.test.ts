import { loadCorrection } from '@/lib/ai/assistant/correction';
import type { SupabaseClient } from '@supabase/supabase-js';

it('recupera solo la propuesta cancelada por su autor, tenant e hilo', async () => {
  const query = { select: jest.fn(), eq: jest.fn(), maybeSingle: jest.fn().mockResolvedValue({ data: { tool_name: 'create_customer', args: { full_name: 'Persona sintética' } } }) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  const supabase = { from: jest.fn().mockReturnValue(query) } as unknown as SupabaseClient;
  const result = await loadCorrection(supabase, 123, 'autor', 'hilo', '11111111-1111-4111-8111-111111111111');
  expect(result).toContain('Persona sintética');
  for (const pair of [['organization_id', 123], ['user_id', 'autor'], ['conversation_id', 'hilo'], ['status', 'rejected'], ['error_code', 'rejected_by_user']]) expect(query.eq).toHaveBeenCalledWith(...pair);
  query.maybeSingle.mockResolvedValue({ data: null });
  expect(await loadCorrection(supabase, 456, 'otro', 'hilo', '11111111-1111-4111-8111-111111111111')).toBeNull();
});
