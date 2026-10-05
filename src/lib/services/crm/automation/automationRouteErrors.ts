import { CrmHttpError, respuestaErrorCrm } from '../crmRouteSupport';

export function automationRouteError(error: unknown, route: string) {
  if (error instanceof Error) {
    if (/^Regla inválida:/.test(error.message)) {
      return respuestaErrorCrm(new CrmHttpError(400, 'regla_invalida', 'Revisa las condiciones y acciones de la regla'), route);
    }
    if (/^(Regla de automatización|Oportunidad) no encontrada$/.test(error.message)) {
      return respuestaErrorCrm(new CrmHttpError(404, 'registro_no_encontrado', 'Registro no encontrado'), route);
    }
  }
  return respuestaErrorCrm(error, route);
}
