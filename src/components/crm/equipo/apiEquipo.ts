import { pedirCrm,emitirCambioCrm } from '../acciones/apiCrm';
import type { AssignmentSimulation,TeamManagementData } from '@/lib/services/crm/teamManagementModel';
import type { TeamMutation } from '@/lib/services/crm/teamManagementService';
import type { LeadAssignmentConfig } from '@/lib/services/crm/leadAssignmentConfig';
export async function readEquipo(signal?:AbortSignal){return (await pedirCrm<TeamManagementData>('/api/crm/team-management',{signal})).data;}
export async function readTerritorios(signal?:AbortSignal){return (await pedirCrm<Pick<TeamManagementData,'territories'|'without_territory'>>('/api/crm/team-management?view=territories',{signal})).data;}
export async function saveEquipo(body:TeamMutation){
 const result=await pedirCrm('/api/crm/team-management',{method:'POST',cuerpo:body});
 emitirCambioCrm({entidad:'lead',accion:'equipo'});return result.data;
}
export async function simulateEquipo(config:LeadAssignmentConfig){return (await pedirCrm<AssignmentSimulation>('/api/crm/assignment/simulate',{method:'POST',cuerpo:config})).data;}
