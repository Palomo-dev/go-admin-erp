import { supabase } from "../supabase/config";

// Interfaces para tipos base de datos
interface DbBranch {
  id: number;
  name: string;
  address?: string;
  is_main?: boolean;
  created_at?: string;
  organization_id: number;
  [key: string]: any; // Para otros campos adicionales
}

interface DbOrganization {
  id: number;
  name: string;
  created_at?: string;
  [key: string]: any;
}

interface DbOrganizationMember {
  id: number;
  organization_id: number;
  user_id: string;
  role?: string;
  is_active: boolean;
  role_id?: number;
}

// Interfaces para la respuesta formateada
interface FormattedBranch {
  id: number;
  name: string;
  address?: string;
  is_main?: boolean;
  created_at?: string;
  organization_id: number;
}

interface FormattedOrganization {
  id: number;
  name: string;
  created_at: string | null;
  branches: FormattedBranch[];
  [key: string]: any;
}

interface FormattedResponse {
  id: number;
  organization: FormattedOrganization;
  branch_id: number | null;
}

// Interface para la respuesta de la función
interface GetOrganizationResponse {
  data: FormattedResponse[] | null;
  error: Error | string | PostgrestError | null;
}

// Tipo para identificar errores de PostgreSQL/Supabase
interface PostgrestError {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

// Función para obtener la organización del usuario utilizando un enfoque basado en consultas separadas
export async function getUserOrganization(userId: string): Promise<GetOrganizationResponse> {
  try {
    console.log("Obteniendo organización para userId:", userId);
    
    // Paso 1: Obtener el miembro de la organización
    const { data: memberData, error: memberError } = await supabase
      .from("organization_members")
      .select("id, organization_id, role, role_id")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (memberError) {
      console.error("Error al consultar members:", memberError);
      throw memberError;
    }
    
    console.log("Datos de miembro encontrados:", JSON.stringify(memberData));
    
    if (!memberData || memberData.length === 0) {
      console.warn("No se encontraron organizaciones para el usuario");
      return { data: null, error: new Error("Usuario no asociado a ninguna organización") };
    }
    
    const member = memberData[0] as DbOrganizationMember;
    
    // Paso 2: Obtener datos de la organización
    const { data: orgData, error: orgError } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", member.organization_id)
      .single();

    if (orgError) {
      console.error("Error al obtener datos de organización:", orgError);
      throw orgError;
    }
    
    if (!orgData) {
      console.error("No se encontraron datos para la organización ID:", member.organization_id);
      throw new Error("No se encontraron datos para la organización");
    }
    
    const organization = orgData as DbOrganization;
    console.log("Datos de organización encontrados:", JSON.stringify(organization));
    
    // Paso 3: Obtener las sucursales de la organización
    const { data: branchesData, error: branchesError } = await supabase
      .from("branches")
      .select("*")
      .eq("organization_id", member.organization_id);
    
    if (branchesError) {
      console.error("Error al obtener sucursales:", branchesError);
      throw branchesError;
    }
    
    const branches = branchesData as FormattedBranch[] || [];
    console.log("Sucursales encontradas:", JSON.stringify(branches));
    console.log("Miembro procesado:", JSON.stringify(member));
    
    // Formato final de la respuesta - estructura exacta que espera el componente
    const formattedData = [
      {
        id: member.id,
        organization: {
          // Primero extraemos la mayoría de los campos de la organización
          ...Object.fromEntries(
            Object.entries(organization).filter(([key]) => 
              key !== 'id' && key !== 'name' && key !== 'created_at'
            )
          ),
          // Luego asignamos explícitamente los campos esenciales para garantizar el formato correcto
          id: organization.id,
          name: organization.name,
          created_at: organization.created_at || null,
          // Asignamos las sucursales
          branches: branches
        },
        // Usamos la primera sucursal como predeterminada, si existe
        branch_id: branches && branches.length > 0 ? branches[0].id : null
      }
    ];
    
    console.log("Datos procesados de organización (FINAL):", JSON.stringify(formattedData));
    
    return { data: formattedData, error: null };
  } catch (error: any) {
    console.error("Error al obtener la organización:", error);
    return { data: null, error };
  }
}

// Función para obtener la sucursal principal de una organización
export async function getMainBranch(organizationId: number) {
  try {
    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_main", true)
      .single();

    if (error) throw error;
    
    return { data, error: null };
  } catch (error) {
    console.error("Error al obtener la sucursal principal:", error);
    return { data: null, error };
  }
}
