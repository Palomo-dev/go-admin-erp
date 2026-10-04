import type { SupabaseClient } from '@supabase/supabase-js';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { addPlainDays, plainDateToInstant, toPlainDate } from '@/lib/utils/timezone';
import { readAllF12 as readOrganizationRows } from './f12ReadService';
import { isRepliedEnrollment, summarizeEnrollmentRows, type EnrollmentStatRow, type SequenceStats } from './sequenceStats';

export interface SequenceOverview {
  active_enrollments: number; paused_enrollments: number; replied_enrollments: number;
  meetings_30d: number | null; meetings_available: boolean;
  from: string; until: string; timezone: string;
}
/** Reads the whole authorized org; reply means the native persisted pause reason, not an inferred chat. */
export async function readSequenceOverview(org: number, sb: SupabaseClient, now = new Date()): Promise<{ stats: Record<string, SequenceStats>; summary: SequenceOverview }> {
  const [rows, timezone] = await Promise.all([
    readOrganizationRows<EnrollmentStatRow & { sequence_id: string }>(sb, 'sequence_enrollments', 'id,sequence_id,status,paused_reason,exit_reason', org),
    getOrganizationTimezone(org, sb),
  ]);
  const today = toPlainDate(now, timezone);
  return { stats: summarizeEnrollmentRows(rows), summary: {
    active_enrollments: rows.filter(r => r.status === 'active').length,
    paused_enrollments: rows.filter(r => r.status === 'paused').length,
    replied_enrollments: rows.filter(isRepliedEnrollment).length,
    // Schema and native writers have no meeting → enrollment attribution. Org meetings are unrelated.
    meetings_30d: null, meetings_available: false,
    from: plainDateToInstant(addPlainDays(today, -29), timezone, '00:00'),
    until: plainDateToInstant(addPlainDays(today, 1), timezone, '00:00'), timezone,
  } };
}
