/**
 * Escala salarial de un cargo en una sede y plazas libres (decisiones 2 y 3:
 * solo la ve quien tiene el permiso de salario; un salario fuera de rango no
 * se bloquea: pide motivo y avisa al aprobador; contratar sin plaza libre
 * avisa y ofrece regularizar).
 *
 * Punto de entrada de la ficha, el alta y «Registrar un cambio». La
 * implementación vive en `estructuraService.server.ts` (frente «Estructura»,
 * migración `hrm_f1_02_estructura`): la escala se lee por el servidor con el
 * permiso `hr.data.salario_pago.view` y cada lectura queda en `hr_access_log`.
 * Sin permiso, `escalaVigente` lanza `HrmError(403, 'sin_permiso')`.
 */
export { escalaVigente, plazaDisponible, type ConsultaEscala, type EscalaSalarial } from './estructuraService.server';
export { posicionEnEscala } from '@/lib/hrm/estructura/logica';
