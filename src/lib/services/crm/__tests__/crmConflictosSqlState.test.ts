jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError,
  hasOrgAdminOrPermission: jest.fn(),
}));

import { clasificarErrorCrm, respuestaErrorCrm } from '../crmRouteSupport';

it.each([
  'conflicto_version',
  'referido_contexto_modificado',
  'partner_contexto_modificado',
  'vinculacion_intencion_reutilizada',
  'llamada_ya_tiene_cliente',
  'llamada_ya_tiene_oportunidad',
  'llamada_ya_vinculada',
  'reintento_con_datos_distintos',
  'operacion_pendiente',
])('P0001 %s conserva el conflicto HTTP 409 sin publicar detalles SQL', async message => {
  const error = { code: 'P0001', message, details: 'SQL privado', hint: 'Datos privados' };
  expect(clasificarErrorCrm(error)).toMatchObject({ status: 409, code: message, origen: 'base' });
  const response = respuestaErrorCrm(error, 'conflicto_sqlstate');
  expect(response.status).toBe(409);
  const body = await response.json();
  expect(body).toMatchObject({ success: false, code: message });
  expect(JSON.stringify(body)).not.toMatch(/SQL privado|Datos privados/);
});
