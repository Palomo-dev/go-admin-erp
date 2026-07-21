import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { supabase } from './supabaseClient';
import { config } from './config';

const CONFIG_FILE = path.join(__dirname, '..', 'agent-config.json');

export interface AgentRuntimeConfig {
  organizationId: number;
  organizationName: string;
  branchIds: number[];
  branchNames: string[];
}

interface SavedConfig {
  organizationId: number;
  organizationName: string;
  branchIds: number[];
  branchNames: string[];
  savedAt: string;
}

interface OrgWithBranches {
  organization_id: number;
  org_name: string;
  branch_id: number | null;
  branch_name: string | null;
}

/**
 * Obtiene las organizaciones y sucursales a las que pertenece el usuario autenticado.
 */
async function getUserOrgsAndBranches(): Promise<OrgWithBranches[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('No se pudo obtener el ID del usuario autenticado.');

  const { data, error } = await supabase
    .from('organization_members')
    .select(`
      organization_id,
      is_active,
      organizations ( id, name ),
      branches ( id, name, organization_id )
    `)
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) throw new Error(`Error consultando organizaciones: ${error.message}`);

  // Construir lista plana de org + branches
  const result: OrgWithBranches[] = [];
  const orgMap = new Map<number, { name: string; branches: { id: number; name: string }[] }>();

  for (const row of data || []) {
    const orgId = row.organization_id;
    const orgName = (row.organizations as any)?.name || `Org ${orgId}`;

    if (!orgMap.has(orgId)) {
      orgMap.set(orgId, { name: orgName, branches: [] });
    }

    const branches = row.branches as any[];
    if (branches && branches.length > 0) {
      for (const b of branches) {
        if (b.organization_id === orgId) {
          orgMap.get(orgId)!.branches.push({ id: b.id, name: b.name });
        }
      }
    }
  }

  // Si no hay branches via join, consultar directamente
  for (const [orgId, info] of orgMap) {
    if (info.branches.length === 0) {
      const { data: branchData } = await supabase
        .from('branches')
        .select('id, name')
        .eq('organization_id', orgId);
      if (branchData) {
        info.branches = branchData.map((b: any) => ({ id: b.id, name: b.name }));
      }
    }
  }

  for (const [orgId, info] of orgMap) {
    if (info.branches.length === 0) {
      result.push({ organization_id: orgId, org_name: info.name, branch_id: null, branch_name: null });
    } else {
      for (const b of info.branches) {
        result.push({ organization_id: orgId, org_name: info.name, branch_id: b.id, branch_name: b.name });
      }
    }
  }

  return result;
}

/**
 * Carga configuración guardada previamente en agent-config.json.
 */
function loadSavedConfig(): SavedConfig | null {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(raw) as SavedConfig;
    }
  } catch (err) {
    console.warn('[setup] No se pudo leer agent-config.json:', err);
  }
  return null;
}

/**
 * Guarda la configuración seleccionada para futuros inicios.
 */
function saveConfig(cfg: AgentRuntimeConfig): void {
  const data: SavedConfig = {
    ...cfg,
    savedAt: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
    console.log(`[setup] Configuración guardada en ${CONFIG_FILE}`);
  } catch (err) {
    console.warn('[setup] No se pudo guardar agent-config.json:', err);
  }
}

/**
 * Crea una interfaz readline para leer input del usuario en consola.
 */
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Valida que la configuración guardada siga siendo válida para el usuario actual.
 */
function validateSavedConfig(saved: SavedConfig, available: OrgWithBranches[]): boolean {
  const orgIds = new Set(available.map((o) => o.organization_id));
  if (!orgIds.has(saved.organizationId)) return false;

  const availableBranchIds = new Set(
    available.filter((o) => o.organization_id === saved.organizationId && o.branch_id).map((o) => o.branch_id!)
  );
  for (const bid of saved.branchIds) {
    if (!availableBranchIds.has(bid)) return false;
  }
  return true;
}

/**
 * Función principal: determina organization_id y branch_ids dinámicamente.
 *
 * Orden de prioridad:
 * 1. Variables de entorno (ORGANIZATION_ID / BRANCH_ID) — para deployments automatizados
 * 2. Configuración guardada en agent-config.json — si sigue siendo válida
 * 3. Auto-detección si hay 1 sola org con 1 sola sucursal
 * 4. Menú interactivo en consola
 */
export async function resolveAgentConfig(): Promise<AgentRuntimeConfig> {
  // 1. Variables de entorno (deploy automatizado)
  if (config.organizationId && config.branchId) {
    console.log(`[setup] Usando organización/sucursal del .env (org ${config.organizationId}, branch ${config.branchId})`);
    return {
      organizationId: config.organizationId,
      organizationName: `Org ${config.organizationId}`,
      branchIds: [config.branchId],
      branchNames: [`Branch ${config.branchId}`],
    };
  }

  // Consultar orgs/sucursales del usuario
  const available = await getUserOrgsAndBranches();

  if (available.length === 0) {
    throw new Error('El usuario no pertenece a ninguna organización activa. Verifica AGENT_EMAIL/AGENT_PASSWORD.');
  }

  // Agrupar por organización
  const orgMap = new Map<number, { name: string; branches: { id: number; name: string }[] }>();
  for (const item of available) {
    if (!orgMap.has(item.organization_id)) {
      orgMap.set(item.organization_id, { name: item.org_name, branches: [] });
    }
    if (item.branch_id && item.branch_name) {
      orgMap.get(item.organization_id)!.branches.push({ id: item.branch_id, name: item.branch_name });
    }
  }

  // 2. Configuración guardada
  const saved = loadSavedConfig();
  if (saved && validateSavedConfig(saved, available)) {
    console.log(`[setup] Usando configuración guardada: ${saved.organizationName} → ${saved.branchNames.join(', ')}`);
    return {
      organizationId: saved.organizationId,
      organizationName: saved.organizationName,
      branchIds: saved.branchIds,
      branchNames: saved.branchNames,
    };
  } else if (saved) {
    console.log('[setup] La configuración guardada ya no es válida. Seleccionando de nuevo...');
  }

  // 3. Auto-detección: 1 sola org con 1 sola sucursal
  if (orgMap.size === 1) {
    const [orgId] = [...orgMap.keys()];
    const orgInfo = orgMap.get(orgId)!;

    if (orgInfo.branches.length === 1) {
      const branch = orgInfo.branches[0];
      console.log(`[setup] Auto-detectado: ${orgInfo.name} → ${branch.name}`);
      const result: AgentRuntimeConfig = {
        organizationId: orgId,
        organizationName: orgInfo.name,
        branchIds: [branch.id],
        branchNames: [branch.name],
      };
      saveConfig(result);
      return result;
    }

    // 1 org, varias sucursales → preguntar cuáles
    if (orgInfo.branches.length > 1) {
      return await promptBranchSelection(orgId, orgInfo.name, orgInfo.branches);
    }
  }

  // 4. Menú interactivo: múltiples orgs
  const orgs = [...orgMap.entries()].map(([id, info]) => ({ id, name: info.name, branches: info.branches }));

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Configuración del Print Agent');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Selecciona la organización:\n');
  orgs.forEach((org, i) => {
    console.log(`  ${i + 1}) ${org.name} (${org.branches.length} sucursal(es))`);
  });
  console.log('');

  const orgAnswer = await prompt(`Ingresa el número (1-${orgs.length}): `);
  const orgIndex = parseInt(orgAnswer, 10) - 1;

  if (isNaN(orgIndex) || orgIndex < 0 || orgIndex >= orgs.length) {
    throw new Error('Selección de organización inválida.');
  }

  const selectedOrg = orgs[orgIndex];

  if (selectedOrg.branches.length === 0) {
    throw new Error(`La organización "${selectedOrg.name}" no tiene sucursales configuradas.`);
  }

  return await promptBranchSelection(selectedOrg.id, selectedOrg.name, selectedOrg.branches);
}

/**
 * Pide al usuario seleccionar sucursales (una, varias, o todas).
 */
async function promptBranchSelection(
  orgId: number,
  orgName: string,
  branches: { id: number; name: string }[]
): Promise<AgentRuntimeConfig> {
  console.log(`\nOrganización: ${orgName}`);
  console.log('Selecciona sucursal:\n');
  branches.forEach((b, i) => {
    console.log(`  ${i + 1}) ${b.name}`);
  });
  console.log(`  0) TODAS las sucursales\n`);

  const answer = await prompt(`Ingresa el número (0=todas, 1-${branches.length}): `);
  const choice = parseInt(answer, 10);

  let selectedBranches: { id: number; name: string }[];

  if (choice === 0) {
    selectedBranches = branches;
    console.log(`[setup] Seleccionadas TODAS las sucursales (${branches.length})`);
  } else {
    const index = choice - 1;
    if (isNaN(index) || index < 0 || index >= branches.length) {
      throw new Error('Selección de sucursal inválida.');
    }
    selectedBranches = [branches[index]];
    console.log(`[setup] Seleccionada: ${branches[index].name}`);
  }

  const result: AgentRuntimeConfig = {
    organizationId: orgId,
    organizationName: orgName,
    branchIds: selectedBranches.map((b) => b.id),
    branchNames: selectedBranches.map((b) => b.name),
  };

  saveConfig(result);
  return result;
}
