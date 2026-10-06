'use client';

/**
 * Formulario de Organización › Marca › Información (Figma 08, sección 4).
 *
 * Cuatro secciones del kit, en el mismo orden que el diseño: Identidad,
 * Ubicación, Datos fiscales y Marca y dominios. Un solo «Guardar cambios» (con
 * «Descartar») al pie; al guardar, aviso del kit con «Deshacer» que vuelve a
 * lo último guardado. El departamento se deriva del municipio DANE (no se
 * elige aparte) y el DV se calcula del NIT. El título lo pone el PageHeader
 * de la página: aquí no se repite.
 *
 * También lo usa Configuración › General.
 */
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Building2, FileText, ImageIcon, MapPin, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { FormField, FormSection, clasesBoton } from '@/components/kit';
import { PhoneInput, mensajeErrorTelefono } from '@/components/kit/PhoneInput';
import { paisIsoDeOrganizacion } from '@/lib/utils/telefono';
import { DOMINIO_SITIOS } from '@/lib/organizacion/sucursales';
import { calcularDv } from '@/lib/utils/nitDv';
import { OrganizationInfoSkeleton } from './OrganizationSkeletons';

interface DatosOrganizacion {
  id: number;
  name: string;
  legal_name: string;
  type: string;
  logo_url: string;
  website: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  tax_id: string;
  dv: string;
  municipality_id: string;
  economic_activity: string;
  registration_code: string;
  graphic_representation_name: string;
  description: string;
  email: string;
  primary_color: string;
  secondary_color: string;
  subdomain: string;
  custom_domain: string;
}

interface Municipio {
  id: string;
  name: string;
  code: string;
  state_name: string;
}

const CAMPO =
  'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 disabled:bg-subtle disabled:text-fg-secondary';
const AREA =
  'w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20';

const COLOR_PRIMARIO = '#3B82F6';
const COLOR_SECUNDARIO = '#1E40AF';

function texto(v: unknown): string {
  return v == null ? '' : String(v);
}

export default function OrganizationInfoTab({ orgData }: { orgData: number }) {
  const t = useTranslations('org.orgInfo');
  const ti = useTranslations('org.acceso.informacion');
  const tf = useTranslations('org.acceso.informacion.form');
  const [datos, setDatos] = useState<DatosOrganizacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorTelefono, setErrorTelefono] = useState<string | null>(null);
  const [tipos, setTipos] = useState<{ id: number; description: string }[]>([]);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  // Lo último guardado: «Deshacer» del aviso y «Descartar» vuelven a esto.
  const guardado = useRef<DatosOrganizacion | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(false);
    try {
      const [org, tiposRes, munis] = await Promise.all([
        supabase.from('organizations').select('*').eq('id', orgData).single(),
        supabase.from('organization_types').select('id, description').order('description'),
        supabase.from('municipalities').select('id, name, code, state_name').order('name').limit(2000),
      ]);
      if (org.error) throw org.error;
      const d = org.data as Record<string, unknown>;
      const listaTipos = (tiposRes.data ?? []) as { id: number; description: string }[];
      const cargados: DatosOrganizacion = {
        id: Number(d.id),
        name: texto(d.name),
        legal_name: texto(d.legal_name),
        type: listaTipos.find((x) => x.id === d.type_id)?.description ?? '',
        logo_url: texto(d.logo_url),
        website: texto(d.website),
        phone: texto(d.phone),
        address: texto(d.address),
        city: texto(d.city),
        state: texto(d.state),
        country: texto(d.country),
        postal_code: texto(d.postal_code),
        tax_id: texto(d.tax_id ?? d.nit),
        dv: texto(d.dv),
        municipality_id: texto(d.municipality_id),
        economic_activity: texto(d.economic_activity),
        registration_code: texto(d.registration_code),
        graphic_representation_name: texto(d.graphic_representation_name),
        description: texto(d.description),
        email: texto(d.email),
        primary_color: texto(d.primary_color) || COLOR_PRIMARIO,
        secondary_color: texto(d.secondary_color) || COLOR_SECUNDARIO,
        subdomain: texto(d.subdomain),
        custom_domain: texto(d.custom_domain),
      };
      setTipos(listaTipos);
      setMunicipios((munis.data ?? []) as Municipio[]);
      setDatos(cargados);
      guardado.current = cargados;
    } catch (e) {
      console.warn('[informacion] carga', e instanceof Error ? e.message : e);
      setErrorCarga(true);
    } finally {
      setCargando(false);
    }
  }, [orgData]);

  useEffect(() => {
    if (orgData) void cargar();
  }, [orgData, cargar]);

  const cambiar = <K extends keyof DatosOrganizacion>(campo: K, valor: DatosOrganizacion[K]) =>
    setDatos((d) => (d ? { ...d, [campo]: valor } : d));

  const alCambiar = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setDatos((d) => {
      if (!d) return d;
      const sig = { ...d, [name]: value } as DatosOrganizacion;
      if (name === 'tax_id') {
        const dv = calcularDv(value);
        sig.dv = dv === null ? '' : String(dv);
      }
      return sig;
    });
  };

  const alCambiarMunicipio = (e: ChangeEvent<HTMLSelectElement>) => {
    const m = municipios.find((x) => x.id === e.target.value);
    setDatos((d) => (d ? { ...d, municipality_id: e.target.value, city: m?.name ?? d.city, state: m?.state_name ?? d.state } : d));
  };

  /** Escribe en `organizations` (RLS: solo quien administra la organización). */
  const escribir = async (d: DatosOrganizacion) => {
    const tipo = tipos.find((x) => x.description === d.type);
    const fila: Record<string, unknown> = {
      name: d.name,
      type_id: tipo?.id ?? null,
      logo_url: d.logo_url || null,
      website: d.website || null,
      phone: d.phone || null,
      address: d.address || null,
      city: d.city || null,
      country: d.country || null,
      postal_code: d.postal_code || null,
      tax_id: d.tax_id || null,
      nit: d.tax_id || null,
      dv: d.dv ? parseInt(d.dv, 10) : null,
      state: d.state || null,
      municipality_id: d.municipality_id || null,
      economic_activity: d.economic_activity || null,
      registration_code: d.registration_code || null,
      graphic_representation_name: d.graphic_representation_name || null,
      description: d.description || null,
      email: d.email || null,
      primary_color: d.primary_color,
      secondary_color: d.secondary_color,
      subdomain: d.subdomain || null,
      custom_domain: d.custom_domain || null,
      updated_at: new Date().toISOString(),
    };
    // `legal_name` es NOT NULL: si se deja vacío, se conserva el que había.
    if (d.legal_name.trim()) fila.legal_name = d.legal_name.trim();
    const { error } = await supabase.from('organizations').update(fila).eq('id', d.id);
    return error;
  };

  const deshacer = async (anterior: DatosOrganizacion) => {
    const err = await escribir(anterior);
    if (err) {
      toast.error(ti('toasts.errorDeshacer'), { description: err.message });
      return;
    }
    setDatos(anterior);
    guardado.current = anterior;
    toast.success(ti('toasts.deshecho'));
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!datos) return;
    const errTel = mensajeErrorTelefono(datos.phone, paisIsoDeOrganizacion(null, datos.country) ?? undefined);
    setErrorTelefono(errTel ?? null);
    if (errTel) return;
    setGuardando(true);
    try {
      const anterior = guardado.current;
      const err = await escribir(datos);
      if (err) throw err;
      guardado.current = datos;
      toast.success(t('successUpdate'), anterior ? { action: { label: ti('deshacer'), onClick: () => void deshacer(anterior) } } : undefined);
    } catch (err) {
      toast.error(t('errorUpdating'), { description: err instanceof Error ? err.message : undefined });
    } finally {
      setGuardando(false);
    }
  };

  const subirLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !datos) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('maxFileSize'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error(t('onlyImages'));
      return;
    }
    try {
      const nombre = `org-${datos.id}-${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage.from('logos').upload(nombre, file, { cacheControl: '3600', upsert: true });
      if (error) throw error;
      const { data: publica } = supabase.storage.from('logos').getPublicUrl(data.path);
      cambiar('logo_url', publica.publicUrl);
      toast.info(tf('logoListo'));
    } catch (err) {
      toast.error(t('errorUploadLogo'), { description: err instanceof Error ? err.message : undefined });
    }
  };

  if (cargando) return <OrganizationInfoSkeleton />;
  if (errorCarga || !datos) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-line-danger bg-danger-subtle p-4">
        <p className="text-sm font-semibold text-danger-text">{tf('errorCarga')}</p>
        <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => void cargar()}>
          {tf('reintentar')}
        </button>
      </div>
    );
  }

  const cambios = JSON.stringify(datos) !== JSON.stringify(guardado.current);
  const municipio = municipios.find((m) => m.id === datos.municipality_id);

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4 lg:gap-6" noValidate>
      <FormSection titulo={tf('identidad.titulo')} descripcion={tf('identidad.descripcion')} icono={Building2} columnas={2}>
        <div id="logo" className="flex scroll-mt-24 items-center gap-4 md:col-span-2">
          {datos.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo del bucket público, tamaño fijo
            <img src={datos.logo_url} alt={tf('logoAlt', { nombre: datos.name })} className="size-16 rounded-lg border border-line object-contain" />
          ) : (
            <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-lg border border-line bg-subtle text-fg-muted">
              <ImageIcon className="size-6" strokeWidth={1.5} />
            </span>
          )}
          <div className="flex flex-col gap-1">
            <label className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              {datos.logo_url ? t('changeLogo') : tf('subirLogo')}
              <input type="file" className="sr-only" accept="image/*" onChange={(e) => void subirLogo(e)} />
            </label>
            <p className="text-xs text-fg-muted">{t('logoHint')}</p>
          </div>
        </div>
        <FormField etiqueta={tf('identidad.nombre')} obligatorio>
          <input name="name" value={datos.name} onChange={alCambiar} className={CAMPO} required placeholder={t('namePlaceholder')} />
        </FormField>
        <FormField etiqueta={tf('identidad.razonSocial')} ayuda={tf('identidad.razonSocialAyuda')}>
          <input name="legal_name" value={datos.legal_name} onChange={alCambiar} className={CAMPO} />
        </FormField>
        <FormField etiqueta={tf('identidad.tipo')}>
          <select name="type" value={datos.type} onChange={alCambiar} className={CAMPO}>
            <option value="">{t('selectType')}</option>
            {tipos.map((x) => (
              <option key={x.id} value={x.description}>
                {x.description}
              </option>
            ))}
          </select>
        </FormField>
        <FormField etiqueta={tf('identidad.correo')}>
          <input type="email" name="email" value={datos.email} onChange={alCambiar} className={CAMPO} placeholder={t('emailPlaceholder')} />
        </FormField>
        <FormField etiqueta={t('phone')} error={errorTelefono} ayuda={tf('identidad.telefonoAyuda')}>
          {(campo) => (
            <PhoneInput
              id={campo.id}
              tamano="md"
              aria-describedby={campo['aria-describedby']}
              aria-invalid={campo['aria-invalid']}
              name="phone"
              value={datos.phone}
              onChange={(v) => cambiar('phone', v)}
              defaultIso={paisIsoDeOrganizacion(null, datos.country) ?? undefined}
            />
          )}
        </FormField>
        <FormField etiqueta={tf('identidad.web')}>
          <input type="url" name="website" value={datos.website} onChange={alCambiar} className={CAMPO} placeholder={t('websitePlaceholder')} />
        </FormField>
        <FormField etiqueta={t('description')} className="md:col-span-2">
          <textarea name="description" value={datos.description} onChange={alCambiar} className={AREA} rows={3} placeholder={t('descriptionPlaceholder')} />
        </FormField>
      </FormSection>

      <FormSection titulo={tf('ubicacion.titulo')} icono={MapPin} columnas={2}>
        <FormField etiqueta={t('country')}>
          <input name="country" value={datos.country} onChange={alCambiar} className={CAMPO} placeholder={t('countryPlaceholder')} />
        </FormField>
        <FormField etiqueta={tf('ubicacion.municipio')} ayuda={tf('ubicacion.municipioAyuda')}>
          <select name="municipality_id" value={datos.municipality_id} onChange={alCambiarMunicipio} className={CAMPO}>
            <option value="">{tf('ubicacion.elegirMunicipio')}</option>
            {municipios.map((m) => (
              <option key={m.id} value={m.id}>
                {`${m.name} · ${m.state_name} · ${m.code}`}
              </option>
            ))}
          </select>
        </FormField>
        <FormField etiqueta={tf('ubicacion.departamento')} ayuda={tf('ubicacion.departamentoAyuda')}>
          <input value={municipio?.state_name ?? datos.state} readOnly disabled className={CAMPO} />
        </FormField>
        <FormField etiqueta={tf('ubicacion.direccion')}>
          <input name="address" value={datos.address} onChange={alCambiar} className={CAMPO} placeholder={t('streetPlaceholder')} />
        </FormField>
        <FormField etiqueta={t('postalCode')} ayuda={tf('ubicacion.postalAyuda')}>
          <input name="postal_code" value={datos.postal_code} onChange={alCambiar} className={CAMPO} inputMode="numeric" maxLength={6} />
        </FormField>
      </FormSection>

      <FormSection titulo={tf('fiscales.titulo')} icono={FileText} columnas={2}>
        <FormField etiqueta={tf('fiscales.nit')} ayuda={tf('fiscales.nitAyuda')}>
          <input name="tax_id" value={datos.tax_id} onChange={alCambiar} className={CAMPO} inputMode="numeric" placeholder={t('taxIdPlaceholder')} />
        </FormField>
        <FormField etiqueta={tf('fiscales.dv')} ayuda={tf('fiscales.dvAyuda')}>
          <input value={datos.dv} readOnly disabled className={CAMPO} />
        </FormField>
        <FormField etiqueta={tf('fiscales.ciiu')}>
          <input name="economic_activity" value={datos.economic_activity} onChange={alCambiar} className={CAMPO} inputMode="numeric" />
        </FormField>
        <FormField etiqueta={tf('fiscales.registro')}>
          <input name="registration_code" value={datos.registration_code} onChange={alCambiar} className={CAMPO} />
        </FormField>
        <FormField etiqueta={tf('fiscales.representacion')} ayuda={tf('fiscales.representacionAyuda')} className="md:col-span-2">
          <input name="graphic_representation_name" value={datos.graphic_representation_name} onChange={alCambiar} className={CAMPO} />
        </FormField>
      </FormSection>

      <FormSection titulo={tf('marca.titulo')} descripcion={tf('marca.descripcion')} icono={Palette} columnas={2}>
        {(['primary_color', 'secondary_color'] as const).map((campo) => (
          <FormField key={campo} etiqueta={campo === 'primary_color' ? tf('marca.primario') : tf('marca.secundario')}>
            {(c) => (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={campo === 'primary_color' ? tf('marca.primario') : tf('marca.secundario')}
                  value={datos[campo]}
                  onChange={(e) => cambiar(campo, e.target.value)}
                  className="size-10 shrink-0 cursor-pointer rounded-lg border border-line-strong bg-surface p-1"
                />
                <input id={c.id} aria-describedby={c['aria-describedby']} value={datos[campo]} onChange={(e) => cambiar(campo, e.target.value)} className={`${CAMPO} font-mono`} />
              </div>
            )}
          </FormField>
        ))}
        <FormField etiqueta={tf('marca.subdominio')} ayuda={datos.subdomain ? `${datos.subdomain}.${DOMINIO_SITIOS}` : tf('marca.subdominioAyuda')}>
          <input name="subdomain" value={datos.subdomain} onChange={alCambiar} className={CAMPO} placeholder={t('subdomainPlaceholder')} />
        </FormField>
        <FormField etiqueta={tf('marca.dominio')} ayuda={tf('marca.dominioAyuda')}>
          <input name="custom_domain" value={datos.custom_domain} onChange={alCambiar} className={CAMPO} placeholder={t('customDomainPlaceholder')} />
        </FormField>
      </FormSection>

      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur lg:mx-0 lg:rounded-xl lg:border lg:px-4">
        <button
          type="button"
          className={clasesBoton({ variante: 'secundario' })}
          disabled={!cambios || guardando}
          onClick={() => {
            if (guardado.current) setDatos(guardado.current);
            setErrorTelefono(null);
          }}
        >
          {tf('descartar')}
        </button>
        <button type="submit" className={clasesBoton()} disabled={!cambios || guardando} aria-busy={guardando || undefined}>
          {guardando ? t('saving') : tf('guardar')}
        </button>
      </div>
    </form>
  );
}
