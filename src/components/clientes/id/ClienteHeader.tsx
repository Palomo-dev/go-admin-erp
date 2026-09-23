'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Camera, Loader2, Building2, User } from 'lucide-react';
import { UserAvatar } from '@/components/app-layout/Header/GlobalSearch/UserAvatar';
import { supabase } from '@/lib/supabase/config';
import { toast } from '@/components/ui/use-toast';

// Interfaz para las props del componente
interface ClienteHeaderProps {
  cliente: {
    id: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    email?: string;
    tags?: string[];
    avatar_url?: string | null;
    customer_type?: string | null;
  };
  onAvatarUpdate?: (newUrl: string) => void;
}

// Ya no necesitamos este componente porque usaremos UserAvatar

interface PersonaVinculada {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
}
interface EnlaceEmpresa {
  is_primary?: boolean | null;
  position?: string | null;
  person?: PersonaVinculada | PersonaVinculada[] | null;
  company?: { id?: string; full_name?: string | null } | { id?: string; full_name?: string | null }[] | null;
}
const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

// Componente para mostrar el nivel de fidelidad del cliente
const NivelFidelidad = ({ nivel = 'Básico' }: { nivel?: string }) => {
  let color = 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  
  switch(nivel.toLowerCase()) {
    case 'oro':
      color = 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-500';
      break;
    case 'plata':
      color = 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
      break;
    case 'bronce':
      color = 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-500';
      break;
    default:
      color = 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-500';
  }
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {nivel}
    </span>
  );
};

// Componente principal del encabezado del cliente
export default function ClienteHeader({ cliente, onAvatarUpdate }: ClienteHeaderProps) {
  const nombreCompleto = cliente.full_name || `${cliente.first_name || ''} ${cliente.last_name || ''}`.trim();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(cliente.avatar_url);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [primaryContact, setPrimaryContact] = useState<{ name: string; email: string | null; phone: string | null; position: string | null } | null>(null);
  const [linkedCompanies, setLinkedCompanies] = useState<Array<{ id: string; name: string; position: string | null; is_primary: boolean }>>([]);

  useEffect(() => {
    if (!cliente.id) return;

    // Si es empresa, cargar contacto principal
    if (cliente.customer_type === 'company') {
      async function loadPrimaryContact() {
        const { data: linkData } = await supabase
          .from('customer_company_links')
          .select(`
            is_primary,
            position,
            person:customers!customer_company_links_person_id_fkey(
              first_name,
              last_name,
              email,
              phone
            )
          `)
          .eq('company_id', cliente.id)
          .order('is_primary', { ascending: false });

        if (linkData && linkData.length > 0) {
          const enlaces = linkData as EnlaceEmpresa[];
          const primary = enlaces.find((l) => l.is_primary) || enlaces[0];
          const person = uno(primary.person);
          if (person) {
            setPrimaryContact({
              name: `${person.first_name || ''} ${person.last_name || ''}`.trim(),
              email: person.email || null,
              phone: person.phone || null,
              position: primary.position || null,
            });
          }
        }
      }
      loadPrimaryContact();
    } else {
      // Si es persona, cargar empresas vinculadas
      async function loadLinkedCompanies() {
        const { data: companyLinks } = await supabase
          .from('customer_company_links')
          .select(`
            is_primary,
            position,
            company:customers!customer_company_links_company_id_fkey(
              id,
              full_name
            )
          `)
          .eq('person_id', cliente.id)
          .order('is_primary', { ascending: false });

        if (companyLinks && companyLinks.length > 0) {
          const companies = (companyLinks as EnlaceEmpresa[]).map((link) => {
            const company = uno(link.company);
            return {
              id: company?.id || '',
              name: company?.full_name || 'Sin nombre',
              position: link.position || null,
              is_primary: link.is_primary || false,
            };
          }).filter((c) => c.id);
          setLinkedCompanies(companies);
        }
      }
      loadLinkedCompanies();
    }
  }, [cliente.id, cliente.customer_type]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Error', description: 'Solo se permiten imágenes', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Error', description: 'La imagen no debe superar 5MB', variant: 'destructive' });
      return;
    }

    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `customers/${cliente.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('profiles')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('profiles')
        .getPublicUrl(filePath);

      const urlWithCacheBust = `${publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('customers')
        .update({ avatar_url: urlWithCacheBust })
        .eq('id', cliente.id);

      if (updateError) throw updateError;

      setAvatarUrl(urlWithCacheBust);
      onAvatarUpdate?.(urlWithCacheBust);
      toast({ title: 'Avatar actualizado', description: 'La foto del cliente se actualizó correctamente.' });
    } catch (err) {
      console.error('Error uploading avatar:', err);
      toast({ title: 'Error', description: (err as Error)?.message || 'No se pudo subir la imagen', variant: 'destructive' });
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  
  // Determinar el nivel de fidelidad basado en tags (si existen)
  const nivelFidelidad = cliente.tags?.includes('oro') 
    ? 'Oro' 
    : cliente.tags?.includes('plata') 
      ? 'Plata' 
      : cliente.tags?.includes('bronce') 
        ? 'Bronce' 
        : 'Básico';
  
  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative group cursor-pointer" onClick={handleAvatarClick}>
          <UserAvatar name={nombreCompleto} avatarUrl={avatarUrl} size="lg" className="w-16 h-16" />
          <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            {uploadingAvatar ? (
              <Loader2 className="h-5 w-5 text-white animate-spin" />
            ) : (
              <Camera className="h-5 w-5 text-white" />
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
          />
        </div>
        
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{nombreCompleto}</h2>
            {cliente.customer_type === 'company' ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                <Building2 className="h-3 w-3" />
                Empresa
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                <User className="h-3 w-3" />
                Persona
              </span>
            )}
          </div>
          
          {/* Mostrar contacto principal para empresas */}
          {cliente.customer_type === 'company' && primaryContact && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Contacto: {primaryContact.name}{primaryContact.position ? ` (${primaryContact.position})` : ''}
            </p>
          )}
          
          {/* Mostrar empresas vinculadas para personas */}
          {cliente.customer_type !== 'company' && linkedCompanies.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-gray-500 dark:text-gray-400">Vinculado a:</span>
              {linkedCompanies.map((company, idx) => (
                <span key={company.id} className="inline-flex items-center gap-1">
                  <Link 
                    href={`/app/clientes/${company.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full hover:underline"
                  >
                    <Building2 className="h-3 w-3" />
                    {company.name}
                    {company.is_primary && <span className="text-blue-400">·</span>}
                  </Link>
                  {idx < linkedCompanies.length - 1 && <span className="text-gray-300">,</span>}
                </span>
              ))}
            </div>
          )}
          
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {cliente.email && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {cliente.email}
              </span>
            )}
            
            <NivelFidelidad nivel={nivelFidelidad} />
          </div>
        </div>
      </div>
      
    </div>
  );
}
