"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getUserOrganization, supabase } from "@/lib/supabase/config";
import { MainPOS } from "@/components/pos/main-pos";

// Definir tipos
type Product = {
  id: string;
  name: string;
  description?: string;
  sku: string;
  barcode?: string;
  price: number;
  image_url?: string;
  category_id?: string;
  organization_id: string;
};

type Category = {
  id: string;
  name: string;
  slug: string;
  parent_id?: string;
  rank: number;
  organization_id: string;
};

type UserData = {
  user_id: string;
  organization_id: string;
  branch_id: string;
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
        
        // Obtener datos de organización usando la función centralizada
        const userOrgData = await getUserOrganization(session.user.id);
        
        if (!userOrgData?.organization) {
          throw new Error("No se pudo obtener la información de la organización");
        }
        
        const organizationId = userOrgData.organization.id;
        const branchId = userOrgData.branch_id;
        
        if (!branchId) {
          throw new Error("No se encontró ninguna sucursal para esta organización");
        }
        
        // Guardar información de usuario, organización y sucursal
        const userDataObj = {
          user_id: session.user.id,
          organization_id: organizationId,
          branch_id: branchId
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
          setCategories(categoriesData);
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
          setProducts(productsData as Product[]);
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