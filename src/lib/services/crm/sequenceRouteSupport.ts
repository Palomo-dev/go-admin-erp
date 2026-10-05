import { NextResponse } from 'next/server';
import { hasOrgAdminOrPermission, OrgContextError } from '@/lib/utils/orgContext';
import type { CrmSesion } from './crmRouteSupport';
import { respuestaErrorCrm } from './crmRouteSupport';

/** Secuencias y campañas usan permisos reales del cargo/rol, además de administración completa. */
export async function canManageSequences(ctx: CrmSesion): Promise<boolean> {
  return await hasOrgAdminOrPermission(ctx) || await hasOrgAdminOrPermission(ctx, 'crm.campaigns.manage');
}
export async function requireSequenceManager(ctx: CrmSesion): Promise<void> {
  if (!(await canManageSequences(ctx))) throw new OrgContextError('No tienes permiso para gestionar secuencias', 403, 'CRM_FORBIDDEN');
}
export function sequenceError(error: unknown, tag: string) {
  if (error instanceof Error && error.message === 'secuencia_con_historial') return NextResponse.json({ success: false, error: 'Esta secuencia tiene historial. Desactívala para conservarlo.', code: 'secuencia_con_historial' }, { status: 409 });
  if (error instanceof Error && error.message === 'enrollment_not_found') return NextResponse.json({ success: false, error: 'Inscripción no encontrada', code: 'enrollment_not_found' }, { status: 404 });
  if (error instanceof Error && /inscripciones activas/i.test(error.message)) return NextResponse.json({ success: false, error: error.message }, { status: 409 });
  if (error instanceof Error && /inválida|inválido|requerido/i.test(error.message)) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  return respuestaErrorCrm(error, tag);
}
