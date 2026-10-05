/** @jest-environment jsdom */
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { bookedMeetings, completeAgentSummary, useAgentSummary } from '../useAgentSummary';
import type { VoiceAgentMetrics } from '@/lib/services/crm/voiceAgentMetrics';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
jest.mock('@/components/crm/acciones/apiCrm', () => ({ pedirCrm: jest.fn() }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 918 }));
const metrics = (calls: number, effective: number, credits: number) => ({ total: calls, effective, credits_consumed: credits, tools: [{ tool: 'book_meeting', status: 'applied', total: 3 }, { tool: 'book_meeting', status: 'suggested', total: 18 }] }) as unknown as VoiceAgentMetrics;
afterEach(cleanup);
it('sólo las reuniones aplicadas cuentan; efectivos se suman antes de calcular el porcentaje', () => {
  const values = { a: { period: metrics(10, 5, 1), month: metrics(100, 90, 90) }, b: { period: metrics(90, 9, 2), month: metrics(1000, 100, 45) } };
  expect(bookedMeetings(values.a.period)).toBe(3);
  expect(completeAgentSummary(['a', 'b'], values)).toEqual({ calls: 100, effective: 14, meetings: 6, credits: 135 });
  expect(completeAgentSummary(['a', 'b'], { ...values, b: { period: values.b.period, month: null } })).toBeNull();
});
it('una lista grande tiene máximo24lecturas, concurrencia4 y jamás devuelve un agregado parcial', async () => {
  let active = 0, maximum = 0;
  const read = pedirCrm as jest.Mock;
  read.mockImplementation(async () => { active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 1)); active--; return { data: metrics(2, 1, 3), extra: {} }; });
  const ids = Array.from({ length: 50 }, (_, i) => `bounded-${i}`);
  const { result, rerender } = renderHook(() => useAgentSummary(ids));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(read).toHaveBeenCalledTimes(24); expect(maximum).toBeLessThanOrEqual(4);
  expect(completeAgentSummary(ids, result.current.summaries)).toBeNull();
  rerender(); expect(read).toHaveBeenCalledTimes(24);
});
