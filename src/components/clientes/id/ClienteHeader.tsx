'use client';

/**
 * Tarjeta de identidad del cliente (Figma 06 Clientes `CustomerIdentityCard`,
 * 331:112918; móvil 332:118153):
 *
 * - avatar con subida de foto;
 * - badges: Empresa/Persona, estado (Cliente · Lead · Inactivo), «Salud N»
 *   si `customers.health_score` tiene valor y nivel de fidelidad. La pastilla
 *   «Nuevo» del Figma es la marca de diseño «Marca/Nuevo» (se retira al
 *   implementar), no un dato del cliente;
 * - datos con icono: documento, correo, teléfono, ciudad · dirección (solo
 *   los que existen);
 * - «Contacto principal» (empresas) o «Vinculado a» (personas) y etiquetas;
 * - barra de acciones rápidas del CRM (`pie`, Figma 772:19838).
 *
 * En móvil la tarjeta se reduce a avatar, nombre, badges y acciones: el
 * documento va en la cabecera y el resto en «Información».
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Building2, Camera, FileText, Loader2, Mail, MapPin, Smartphone } from 'lucide-react';
import { UserAvatar } from '@/components/app-layout/Header/GlobalSearch/UserAvatar';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase/config';
import { toast } from '@/components/ui/use-toast';
import { documentoCliente } from '@/lib/services/clientesListadoService';
import {
  TONO_ESTADO_FICHA,
  TONO_NIVEL,
  estadoFicha,
  etiquetasVisibles,
  nivelFidelidad,
  tonoSalud,
} from './fichaLogica';

interface ClienteHeaderProps {
  cliente: {
    id: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    tags?: string[] | null;
    avatar_url?: string | null;
    customer_type?: string | null;
    identification_type?: string | null;
    identification_number?: string | null;
    dv?: number | null;
    status?: string | null;
    lifecycle_stage?: string | null;
    health_score?: number | null;
    created_at?: string | null;
  };
  onAvatarUpdate?: (newUrl: string) => void;
  /** CRM ola 3A (Figma 772:19838): barra de acciones rápidas dentro de la tarjeta, bajo los datos. */
  pie?: ReactNode;
}

interface PersonaVinculada {
  first_name?: string | null;
  last_name?: string | null;
}
interface EnlaceEmpresa {
  is_primary?: boolean | null;
  position?: string | null;
  person?: PersonaVinculada | PersonaVinculada[] | null;
  company?: { id?: string; full_name?: string | null } | { id?: string; full_name?: string | null }[] | null;
}
const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

const CLASE_ETIQUETA_FILA = 'shrink-0 text-xs font-semibold leading-4 text-fg-muted';
const CLASE_CHIP_BASE = 'inline-flex h-7 max-w-full items-center gap-1.5 truncate rounded-full bg-subtle px-2.5 text-xs font-medium';
const CLASE_CHIP = `${CLASE_CHIP_BASE} text-fg-secondary`;

function Dato({ icono: Icono, children }: { icono: typeof Mail; children: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium leading-4 text-fg-secondary">
      <Icono aria-hidden="true" className="size-3.5 shrink-0 text-fg-muted" strokeWidth={1.5} />
      <span className="truncate">{children}</span>
    </span>
  );
}

export default function ClienteHeader({ cliente, onAvatarUpdate, pie }: ClienteHeaderProps) {
  const t = useTranslations('clientes.ficha');
  const nombreCompleto = cliente.full_name || `${cliente.first_name || ''} ${cliente.last_name || ''}`.trim();
  const esEmpresa = cliente.customer_type === 'company';
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(cliente.avatar_url);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contactoPrincipal, setContactoPrincipal] = useState<{ nombre: string; cargo: string | null } | null>(null);
  const [empresas, setEmpresas] = useState<Array<{ id: string; nombre: string | null; principal: boolean }>>([]);

  useEffect(() => {
    if (!cliente.id) return;
    let cancelado = false;
    if (esEmpresa) {
      void (async () => {
        const { data } = await supabase
          .from('customer_company_links')
          .select('is_primary, position, person:customers!customer_company_links_person_id_fkey(first_name, last_name)')
          .eq('company_id', cliente.id)
          .order('is_primary', { ascending: false });
        const enlaces = (data ?? []) as EnlaceEmpresa[];
        const principal = enlaces.find((l) => l.is_primary) ?? enlaces[0];
        const persona = principal ? uno(principal.person) : null;
        if (!cancelado && persona) {
          setContactoPrincipal({ nombre: `${persona.first_name || ''} ${persona.last_name || ''}`.trim(), cargo: principal?.position || null });
        }
      })();
    } else {
      void (async () => {
        const { data } = await supabase
          .from('customer_company_links')
          .select('is_primary, position, company:customers!customer_company_links_company_id_fkey(id, full_name)')
          .eq('person_id', cliente.id)
          .order('is_primary', { ascending: false });
        const lista = ((data ?? []) as EnlaceEmpresa[])
          .map((l) => {
            const c = uno(l.company);
            return { id: c?.id || '', nombre: c?.full_name || null, principal: !!l.is_primary };
          })
          .filter((c) => c.id);
        if (!cancelado) setEmpresas(lista);
      })();
    }
    return () => {
      cancelado = true;
    };
  }, [cliente.id, esEmpresa]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: t('cabecera.error'), description: t('cabecera.soloImagenes'), variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: t('cabecera.error'), description: t('cabecera.imagenMuyGrande'), variant: 'destructive' });
      return;
    }
    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `customers/${cliente.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage.from('profiles').upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from('profiles').getPublicUrl(filePath);
      const urlWithCacheBust = `${publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase.from('customers').update({ avatar_url: urlWithCacheBust }).eq('id', cliente.id);
      if (updateError) throw updateError;
      setAvatarUrl(urlWithCacheBust);
      onAvatarUpdate?.(urlWithCacheBust);
      toast({ title: t('cabecera.avatarActualizado'), description: t('cabecera.avatarActualizadoDescripcion') });
    } catch (err) {
      console.error('Error uploading avatar:', err);
      toast({ title: t('cabecera.error'), description: (err as Error)?.message || t('cabecera.errorSubir'), variant: 'destructive' });
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const estado = estadoFicha(cliente);
  const nivel = nivelFidelidad(cliente.tags);
  const etiquetas = etiquetasVisibles(cliente.tags);
  const salud = typeof cliente.health_score === 'number' ? cliente.health_score : null;
  const documento = documentoCliente({
    identification_type: cliente.identification_type ?? null,
    identification_number: cliente.identification_number ?? null,
    dv: cliente.dv ?? null,
  });
  const ubicacion = [cliente.city, cliente.address].map((v) => v?.trim()).filter(Boolean).join(' · ');
  const hayDatos = !!(documento || cliente.email || cliente.phone || ubicacion);
  const hayVinculos = !!contactoPrincipal || empresas.length > 0 || etiquetas.length > 0;

  return (
    <section aria-label={t('cabecera.identidad')} className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-4">
        <button
          type="button"
          className="group relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          onClick={() => fileInputRef.current?.click()}
          title={t('cabecera.cambiarFoto')}
          aria-label={t('cabecera.cambiarFoto')}
        >
          <UserAvatar name={nombreCompleto} avatarUrl={avatarUrl} size="lg" className="size-12" />
          <span
            aria-hidden="true"
            className={`absolute inset-0 rounded-full bg-tooltip transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60 ${uploadingAvatar ? 'opacity-60' : 'opacity-0'}`}
          />
          <span
            className={`absolute inset-0 flex items-center justify-center transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${uploadingAvatar ? 'opacity-100' : 'opacity-0'}`}
          >
            {uploadingAvatar ? (
              <Loader2 aria-hidden="true" className="size-5 animate-spin text-fg-on-brand" />
            ) : (
              <Camera aria-hidden="true" className="size-5 text-fg-on-brand" />
            )}
          </span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {/* En escritorio el nombre ya está en la cabecera de la página. */}
          <h2 className="truncate text-[15px] font-semibold leading-5 text-fg sm:sr-only">{nombreCompleto}</h2>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tono={esEmpresa ? 'informacion' : 'neutro'} tamano="md">
              {esEmpresa ? t('cabecera.empresa') : t('cabecera.persona')}
            </Badge>
            <Badge tono={estado === 'cliente' ? 'marca' : TONO_ESTADO_FICHA[estado].tono} apariencia={TONO_ESTADO_FICHA[estado].apariencia} tamano="md">
              {t(`estado.${estado}`)}
            </Badge>
            {salud !== null && (
              <Badge tono={tonoSalud(salud)} tamano="md">
                {t('cabecera.salud', { n: salud })}
              </Badge>
            )}
            <Badge tono={TONO_NIVEL[nivel].tono} apariencia={TONO_NIVEL[nivel].apariencia} tamano="md" className="hidden sm:inline-flex">
              {t(`cabecera.fidelidad.${nivel}`)}
            </Badge>
          </div>

          {hayDatos && (
            <div className="hidden min-w-0 flex-wrap items-center gap-x-4 gap-y-1 sm:flex">
              {documento && <Dato icono={FileText}>{documento}</Dato>}
              {cliente.email && <Dato icono={Mail}>{cliente.email}</Dato>}
              {cliente.phone && <Dato icono={Smartphone}>{cliente.phone}</Dato>}
              {ubicacion && <Dato icono={MapPin}>{ubicacion}</Dato>}
            </div>
          )}

          {hayVinculos && (
            <div className="hidden min-w-0 flex-wrap items-center gap-1.5 sm:flex">
              {contactoPrincipal && (
                <>
                  <span className={CLASE_ETIQUETA_FILA}>{t('cabecera.contactoPrincipal')}</span>
                  <span className={CLASE_CHIP}>{[contactoPrincipal.nombre, contactoPrincipal.cargo].filter(Boolean).join(' · ')}</span>
                </>
              )}
              {empresas.length > 0 && (
                <>
                  <span className={CLASE_ETIQUETA_FILA}>{t('cabecera.vinculadoA')}</span>
                  {empresas.map((e) => (
                    <Link
                      key={e.id}
                      href={`/app/clientes/${e.id}`}
                      className={`${CLASE_CHIP_BASE} text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
                    >
                      <Building2 aria-hidden="true" className="size-3 shrink-0" strokeWidth={1.5} />
                      {e.nombre ?? t('comun.sinNombre')}
                    </Link>
                  ))}
                </>
              )}
              {etiquetas.length > 0 && (
                <>
                  <span className={CLASE_ETIQUETA_FILA}>{t('cabecera.etiquetas')}</span>
                  {etiquetas.map((etiqueta) => (
                    <Badge key={etiqueta} tono="neutro" apariencia="contorno" tamano="sm" className="bg-surface">
                      {etiqueta}
                    </Badge>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {pie && <div className="w-full min-w-0">{pie}</div>}
    </section>
  );
}
