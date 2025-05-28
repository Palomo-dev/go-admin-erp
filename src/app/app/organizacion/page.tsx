// Perfil de Organización
"use client";

import { useEffect, useState, ChangeEvent, FormEvent } from "react";
import { supabase } from "@/lib/supabase/config";
import Image from "next/image";

interface OrgType {
  id: number;
  name: string;
}

export default function OrganizationPage() {
  const [orgId, setOrgId] = useState<number | null>(null);

  // Campos editables
  const [name, setName] = useState("");
  const [nit, setNit] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#1e40af");
  const [secondaryColor, setSecondaryColor] = useState("#1d4ed8");
  const [subdomain, setSubdomain] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  // Tipos de negocio
  const [types, setTypes] = useState<OrgType[]>([]);
  const [selectedTypeIds, setSelectedTypeIds] = useState<number[]>([]);

  // Estados UI
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Obtener org_id (seteado en cookie por el middleware multitenant)
  const getOrgIdFromCookie = (): number | null => {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(/org_id=(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  };

  // Cargar datos iniciales
  useEffect(() => {
    const fetchData = async () => {
      try {
        const id = getOrgIdFromCookie();
        if (!id) throw new Error("No se encontró la organización en la cookie");
        setOrgId(id);

        // Organización
        const { data: org, error: orgErr } = await supabase
          .from("organizations")
          .select("id,name,nit,primary_color,secondary_color,subdomain,custom_domain,logo_url")
          .eq("id", id)
          .single();
        if (orgErr) throw orgErr;

        setName(org.name);
        setNit(org.nit || "");
        setPrimaryColor(org.primary_color || "#1e40af");
        setSecondaryColor(org.secondary_color || "#1d4ed8");
        setSubdomain(org.subdomain || "");
        setCustomDomain(org.custom_domain || "");
        setLogoUrl(org.logo_url);

        // Catálogo tipos
        const { data: cat, error: catErr } = await supabase
          .from<OrgType>("organization_types")
          .select("id,name");
        if (catErr) throw catErr;
        setTypes(cat || []);

        // Tipos seleccionados
        const { data: sel, error: selErr } = await supabase
          .from("organization_type_relations")
          .select("type_id")
          .eq("organization_id", id);
        if (selErr) throw selErr;
        setSelectedTypeIds(sel?.map((x) => x.type_id) || []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleLogoChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setLogoFile(e.target.files[0]);
  };

  const toggleType = (typeId: number) => {
    setSelectedTypeIds((prev) =>
      prev.includes(typeId) ? prev.filter((id) => id !== typeId) : [...prev, typeId]
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!orgId) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      let newLogoUrl = logoUrl;
      if (logoFile) {
        // Subir logo al bucket `org-logos`
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from("org-logos")
          .upload(`${orgId}/${logoFile.name}`, logoFile, { upsert: true });
        if (uploadErr) throw uploadErr;
        newLogoUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/org-logos/${uploadData.path}`;
      }

      // Actualizar organización
      const { error: updErr } = await supabase
        .from("organizations")
        .update({
          name,
          nit,
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          subdomain,
          custom_domain: customDomain,
          logo_url: newLogoUrl,
        })
        .eq("id", orgId);
      if (updErr) throw updErr;

      // Actualizar tipos seleccionados
      await supabase.from("organization_type_relations").delete().eq("organization_id", orgId);
      if (selectedTypeIds.length) {
        const rows = selectedTypeIds.map((t) => ({ organization_id: orgId, type_id: t }));
        const { error: insErr } = await supabase.from("organization_type_relations").insert(rows);
        if (insErr) throw insErr;
      }

      // Reactivar módulos por defecto según nuevos tipos
      const { error: rpcErr } = await supabase.rpc("activate_default_modules", { p_org_id: orgId });
      if (rpcErr) throw rpcErr;

      setSuccess("Preferencias actualizadas correctamente");
    } catch (e: any) {
      setError(e.message || "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="p-6 text-center">Cargando...</p>;
  if (error) return <p className="p-6 text-red-600">{error}</p>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h2 className="text-2xl font-semibold mb-4">Perfil de la organización</h2>
      {success && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 rounded">{success}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Nombre y NIT */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border px-3 py-2 rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">NIT</label>
            <input
              value={nit}
              onChange={(e) => setNit(e.target.value)}
              className="w-full border px-3 py-2 rounded"
            />
          </div>
        </div>

        {/* Logo */}
        <div className="flex items-start gap-4">
          {logoUrl && <Image src={logoUrl} alt="Logo" width={64} height={64} className="rounded" />}
          <div>
            <label className="block text-sm font-medium mb-1">Logo</label>
            <input type="file" accept="image/*" onChange={handleLogoChange} />
          </div>
        </div>

        {/* Colores */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Color primario</label>
            <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Color secundario</label>
            <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} />
          </div>
        </div>

        {/* Tipos de negocio */}
        <div>
          <label className="block text-sm font-medium mb-2">Tipos de negocio</label>
          <div className="flex flex-wrap gap-3">
            {types.map((t) => (
              <label key={t.id} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={selectedTypeIds.includes(t.id)}
                  onChange={() => toggleType(t.id)}
                />
                {t.name}
              </label>
            ))}
          </div>
        </div>

        {/* Dominios */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Subdominio</label>
            <input
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              className="w-full border px-3 py-2 rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Dominio personalizado</label>
            <input
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              className="w-full border px-3 py-2 rounded"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-primary-600 text-white rounded shadow disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </form>
    </div>
  );
}
