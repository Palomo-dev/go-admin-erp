import { rolesDb } from './dbRoles';
import { teamsDb } from './dbTeams';
import { territoriesDb } from './dbTerritories';

/**
 * Capa de datos de la Estructura comercial: el mismo objeto `db` que vivía en
 * `EstructuraComercialManager.tsx`, repartido por dominio para respetar las
 * 300 líneas por archivo. Nada cambia de comportamiento.
 */
export const db = { ...rolesDb, ...teamsDb, ...territoriesDb };
