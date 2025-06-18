"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getUserOrganization, supabase } from "@/lib/supabase/config";
import { MainPOS } from "@/components/pos/main-pos";

// Definición de interfaces para el componente MainPOS
// Estas definiciones son duplicadas de las que hay en main-pos.tsx
// para evitar problemas de compatibilidad
interface Product {
  id: string; 
  name: string;
  price: number;
  sku: string;
  image_url?: string;
  image_path?: string;
  image_type?: string;
  category_id?: string;
  description?: string;
  is_menu_item?: boolean;
  status?: string;
  organization_id: string;
  barcode?: string;
}

interface Category {
  id: number;
  name: string;
  slug?: string;
  parent_id?: number | null;
  rank?: number;
  organization_id: string;
}

// Definición de las interfaces para la base de datos
// Estas interfaces reflejan la estructura real de las tablas en Supabase
interface DbProduct {
  id: number;
  name: string;
  price: number;
  sku: string;
  image_url?: string;
  image_path?: string;
  image_type?: string;
  category_id?: number;
  description?: string;
  is_menu_item?: boolean;
  status?: string;
  organization_id: number;
  barcode?: string;
}

interface DbCategory {
  id: number;
  name: string;
  slug: string;
  parent_id?: number | null;
  rank: number;
  organization_id: number;
}

// Adaptamos la interfaz UserData para que coincida con los tipos esperados por MainPOS
type UserData = {
  user_id: string;
  organization_id: string; // Cambiado a string para coincidir con MainPOS
  branch_id: string; // Cambiado a string para coincidir con MainPOS
};

export default function POSPage() {
  // Estados para datos principales
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [userData, setUserData] = useState<UserData | null>(null);
  
  // Estados para UI
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Cargar sesión del usuario y productos
  useEffect(() => {
    const loadUserDataAndProducts = async () => {
      try {
        setLoading(true);
        
        // Obtener la sesión actual
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
          throw new Error(sessionError?.message || "No se pudo obtener la sesión del usuario");
        }
        
        // Intentar obtener datos de organización - Implementación directa ignorando getUserOrganization
        console.log("Obteniendo datos de organización directamente");
        
        // PASO 1: Obtener miembros activos para el usuario
        const { data: memberData, error: memberError } = await supabase
          .from("organization_members")
          .select("id, organization_id, role, role_id")
          .eq("user_id", session.user.id)
          .eq("is_active", true);
        
        if (memberError) {
          console.error("Error al consultar miembros:", memberError);
          throw new Error(`Error al consultar miembros: ${memberError.message || "Error desconocido"}`);
        }
        
        console.log("Miembros encontrados:", JSON.stringify(memberData));
        
        if (!memberData || memberData.length === 0) {
          console.error("Usuario no asociado a ninguna organización");
          throw new Error("Usuario no asociado a ninguna organización");
        }
        
        // Usar el primer miembro activo encontrado
        const member = memberData[0];
        const organizationId = member.organization_id;
        let defaultBranchId = null; // Inicialmente no hay sucursal asignada
        
        // PASO 2: Obtener datos de la organización
        const { data: organization, error: orgError } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", organizationId)
          .single();
        
        if (orgError || !organization) {
          console.error("Error al obtener organización:", orgError);
          throw new Error(`Error al obtener organización: ${orgError?.message || "Error desconocido"}`);
        }
        
        console.log("Organización encontrada:", JSON.stringify(organization));
        
        // PASO 3: Obtener sucursales
        const { data: branches, error: branchesError } = await supabase
          .from("branches")
          .select("*")
          .eq("organization_id", organizationId);
        
        if (branchesError) {
          console.error("Error al obtener sucursales:", branchesError);
          // Continuamos aunque no haya sucursales
        }
        
        // Si hay sucursales, usamos la primera como predeterminada
        if (branches && branches.length > 0) {
          defaultBranchId = branches[0].id.toString();
          console.log("Usando la primera sucursal como predeterminada:", defaultBranchId);
        }
        
        // Preparamos la estructura de datos esperada
        const formattedData = [
          {
            id: member.id,
            organization: {
              // Copiamos todos los campos menos estos específicos
              ...Object.fromEntries(
                Object.entries(organization).filter(([key]) => 
                  key !== 'id' && key !== 'name' && key !== 'created_at'
                )
              ),
              // Luego asignamos explícitamente los campos esenciales
              id: organization.id,
              name: organization.name,
              created_at: organization.created_at || null,
              // Asignamos las sucursales
              branches: branches || []
            },
            branch_id: defaultBranchId
          }
        ];
        
        console.log("Datos formateados directamente:", JSON.stringify(formattedData));
        
        // Asignamos los datos formateados
        const orgData = formattedData;
        
        // Verificación de seguridad final
        if (!orgData || !orgData[0] || !orgData[0].organization) {
          console.error("Estructura de datos final incorrecta", JSON.stringify(orgData));
          throw new Error("No se pudo generar la estructura de datos de organización correctamente");
        }
        
        // Verificamos que el ID de organización sea válido
        // No necesitamos redeclarar organizationId ya que ya existe
        console.log("ID de organización obtenido:", organizationId);
        
        // Como branch_id no viene en la respuesta, buscamos la sucursal principal
        // Usamos las sucursales que ya obtuvimos anteriormente
        // Si no hay datos, usamos un arreglo vacío
        console.log("Sucursales disponibles:", JSON.stringify(branches || []));
        
        // Buscamos la sucursal principal o usamos la primera
        const mainBranch = (branches || []).find(branch => branch.is_main === true) || (branches && branches.length > 0 ? branches[0] : null);
                          
        if (!mainBranch) {
          throw new Error("No se encontró ninguna sucursal para esta organización");
        }
        
        const branchId = mainBranch.id;
        console.log("ID de sucursal obtenido:", branchId);

        if (!branchId) {
          throw new Error("No se encontró ninguna sucursal para esta organización");
        }
        
        // Guardar información de usuario, organización y sucursal
        // Adaptamos los datos para que coincidan con lo que espera MainPOS
        const userDataObj = {
          user_id: session.user.id,
          id: session.user.id, // También añadimos id como lo espera MainPOS 
          organization_id: String(organizationId), // Convertir a string como espera MainPOS
          branch_id: String(branchId || orgData[0]?.branch_id || ''), // Convertir a string como espera MainPOS
          // Guardamos datos adicionales por si son necesarios
          organization: orgData[0]?.organization,
          branches: orgData[0]?.organization?.branches || []
        };
        
        setUserData(userDataObj);
        
        // Cargar categorías desde Supabase
        const { data: categoriesData, error: categoriesError } = await supabase
          .from("categories")
          .select("id, name, slug, parent_id, rank, organization_id")
          .eq("organization_id", organizationId)
          .order("rank", { ascending: true });
          
        if (categoriesError) {
          console.error("Error al cargar categorías:", categoriesError);
        } else if (categoriesData) {
          // Convertir explícitamente los datos al formato esperado por MainPOS
          const formattedCategories = categoriesData.map((category: DbCategory): Category => ({
            id: Number(category.id),
            name: category.name,
            slug: category.slug,
            parent_id: category.parent_id ? Number(category.parent_id) : null,
            rank: category.rank,
            organization_id: String(category.organization_id)
          }));
          
          setCategories(formattedCategories);
        }
        
        // Cargar productos desde Supabase con todos los campos relevantes
        const { data: productsData, error: productsError } = await supabase
          .from("products")
          .select("*")
          .eq("organization_id", organizationId)
          .eq("status", "active");
        
        if (productsError) {
          console.error("Error al cargar productos:", productsError);
          setError("Error al cargar los productos");
        } else if (productsData) {
          // Convertir explícitamente los datos al formato esperado por MainPOS
          const formattedProducts = productsData.map((product: DbProduct): Product => ({
            id: String(product.id),
            name: product.name,
            price: Number(product.price),
            sku: product.sku,
            image_url: product.image_url,
            image_path: product.image_path,
            image_type: product.image_type,
            category_id: product.category_id ? String(product.category_id) : undefined,
            description: product.description,
            is_menu_item: product.is_menu_item,
            status: product.status,
            organization_id: String(product.organization_id),
            barcode: product.barcode
          }));
          
          setProducts(formattedProducts);
        }
        
        setLoading(false);
      } catch (err) {
        console.error("Error al cargar datos:", err);
        setError("Error al cargar datos de usuario y productos");
        setLoading(false);
      }
    };
    
    loadUserDataAndProducts();
  }, []);

  return (
    <div className="h-[calc(100vh-4rem)] overflow-hidden">
      {loading ? (
        <div className="flex h-full justify-center items-center">
          <div className="flex flex-col items-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
            <p className="text-gray-500">Cargando datos...</p>
            {error && <p className="text-red-500 mt-2">{error}</p>}
          </div>
        </div>
      ) : (
        <MainPOS 
          initialProducts={products} 
          initialCategories={categories} 
          initialUser={userData} 
        />
      )}
    </div>
  );
}