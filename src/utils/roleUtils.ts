// Role mapping utilities

// Role code mapping (ID to code)
// NOTA: Super Admin (ID 1) está incluido para compatibilidad pero NO se muestra en UI
export const roleCodeMap: {[key: number]: string} = {
  1: 'super_admin', // Incluido para compatibilidad, no se muestra en dropdowns
  2: 'org_admin',
  3: 'customer',
  4: 'employee',
  5: 'manager'
};

// Role name mapping (ID to name)
export const roleNameMap: {[key: number]: string} = {
  1: 'Super Admin', // Incluido para compatibilidad, no se muestra en dropdowns
  2: 'Admin',
  3: 'Customer',
  4: 'Employee',
  5: 'Manager'
};

// Role ID mapping (code to ID)
export const roleIdMap: {[key: string]: number} = {
  'super_admin': 1, // Incluido para compatibilidad
  'org_admin': 2,
  'customer': 3,
  'employee': 4,
  'manager': 5
};

// Code to display name mapping for the dropdown (Super Admin NO incluido aquí)
export const roleDisplayMap: {[key: string]: string} = {
  'org_admin': 'Admin',
  'manager': 'Manager',
  'employee': 'Employee',
  'customer': 'Customer'
};

// Get role info by ID
export const getRoleInfoById = (roleId: number | null): { name: string; code: string } => {
  if (!roleId) return { name: 'Sin rol', code: '' };
  
  return {
    name: roleNameMap[roleId] || `Rol ${roleId}`,
    code: roleCodeMap[roleId] || `role_${roleId}`
  };
};

// Get role ID by code
export const getRoleIdByCode = (code: string): number | null => {
  return roleIdMap[code] || null;
};

// Format roles for dropdown
export const formatRolesForDropdown = (roles: any[]): any[] => {
  return roles.map(role => ({
    ...role,
    code: roleCodeMap[role.id] || role.name.toLowerCase().replace(/\s+/g, '_')
  }));
};
