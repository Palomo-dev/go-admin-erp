'use client';

/**
 * Formulario de sucursal (Figma 08, «Escritorio / Sucursales — nueva sucursal»
 * 426:189181 y «— editar» 426:190009; auditoría C.5 #129-#175).
 *
 * Bloques en tarjetas, campos del kit (`FormField`, `Input`, `Select`,
 * `SearchSelect`, `PhoneInput`, `Switch`, `Checkbox`, `CampoHora`) en rejillas
 * de 2 y 3 columnas que en móvil pasan a una. Lo que no está en el Figma y sí
 * en el producto se conserva con el mismo lenguaje visual:
 * - Zona horaria de la sede (heredar o propia): en Ubicación, bajo Código
 *   postal y Coordenadas.
 * - Aviso de subdominio heredado: la sede ya no publica por subdominio
 *   (`<sub>.goadmin.io` el sitio lo resuelve como OTRA organización), así que
 *   el campo no se ofrece; si la sede tiene uno guardado se avisa.
 *
 * La cabecera («Nueva Sucursal», chip de cupo y «×») y el pie (Cancelar +
 * Guardar) los pone quien lo contiene (`SucursalesPantalla`, `PanelAdaptable`);
 * aquí `submitForm()` valida y entrega los datos al mismo `onSubmit` de antes.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Building2,
  Check,
  Clock,
  Globe,
  Link as LinkIcono,
  MapPin,
  Phone,
  Plus,
  ShoppingCart,
  Trash2,
  UserCircle,
  type LucideIcon,
} from 'lucide-react';
import { Branch, BranchFormData, BRANCH_TYPES, OpeningHours, BranchFeatures } from '@/types/branch';
import type { TurnoHorario } from '@/types/branch';
import { RESERVED_SLUGS, validateSlug, validateSubdomain, validateDomain } from '@/lib/utils/webIdentityValidation';
import { PhoneInput, mensajeErrorTelefono } from '@/components/kit/PhoneInput';
import { FormField } from '@/components/kit/FormField';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { CampoHora } from '@/components/kit/CampoHora';
import { clasesBoton } from '@/components/kit/botonClases';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchSelect } from '@/components/ui/search-select';
import { formatearTelefono, paisIsoDeOrganizacion } from '@/lib/utils/telefono';
import { supabase } from '@/lib/supabase/config';
import { memberService, type Member } from '@/lib/services/memberService';
import { BuyDomainDialog, AddCustomDomainDialog } from '@/components/organization/dominios';
import { useSession } from '@/lib/hooks/useSession';
import ImageUploader from '@/components/common/ImageUploader';
import { BranchTimezoneField } from './BranchTimezoneField';
import { UbicacionSucursal, type UbicacionSede } from './UbicacionSucursal';
import { errorTurnos, esHorarioPorDefecto, normalizarDia, turnosDelDia } from '@/lib/organizacion/horarioSede';
import { urlPublicaSede } from '@/lib/organizacion/sucursales';
import { slugChocaConPagina } from '@/lib/organizacion/slugSede';
import { cn } from '@/utils/Utils';

type BranchFormProps = {
  initialData?: Partial<Branch>;
  onSubmit: (data: BranchFormData) => Promise<void>;
  isLoading?: boolean;
  submitLabel?: string;
  hideSubmitButton?: boolean;
  noFormWrapper?: boolean;
  hideStatusSection?: boolean; // Oculta Gerente, Identidad web y Estado (flujo de registro)
  /**
   * Sin la barra superior («Nueva Sucursal» + Guardar): la pone quien lo
   * contiene. Organización › Sucursales lo abre en un panel del kit que ya
   * tiene título y un único «Guardar» en el pie (Figma 08, sección 6).
   */
  ocultarCabecera?: boolean;
};

export interface BranchFormRef {
  submitForm: () => Promise<void>;
}

const DIAS_SEMANA = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const MAX_TURNOS = 4;

// Sin horario guardado se propone este (domingo cerrado, sin horas: igual que antes).
const HORARIO_POR_DEFECTO = {
  monday: { open: '09:00', close: '18:00', closed: false },
  tuesday: { open: '09:00', close: '18:00', closed: false },
  wednesday: { open: '09:00', close: '18:00', closed: false },
  thursday: { open: '09:00', close: '18:00', closed: false },
  friday: { open: '09:00', close: '18:00', closed: false },
  saturday: { open: '10:00', close: '15:00', closed: false },
  sunday: { closed: true },
} as unknown as OpeningHours;

const CARACTERISTICAS = [
  'has_wifi',
  'has_parking',
  'has_delivery',
  'has_outdoor_seating',
  'is_wheelchair_accessible',
  'has_air_conditioning',
] as const;

const CARACTERISTICAS_POR_DEFECTO: BranchFeatures = Object.fromEntries(CARACTERISTICAS.map((c) => [c, false]));

/** Marca del `Select` de tipo de negocio para «Sin especificar» (Radix no admite `''`). */
const SIN_TIPO = '__sin_tipo__';

/** Tarjeta de bloque del Figma: borde suave, título de 14 con icono de 16. */
function Bloque({ icono: Icono, titulo, extra, children }: { icono: LucideIcon; titulo: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4" aria-label={titulo}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Icono aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.75} />
        <h3 className="text-sm font-semibold text-fg">{titulo}</h3>
        {extra}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** Interruptor con texto y ayuda (Sitio publicado, bloque Estado). */
function FilaSwitch({ id, etiqueta, ayuda, marcado, onCambio, caja }: { id: string; etiqueta: string; ayuda?: string; marcado: boolean; onCambio: (v: boolean) => void; caja?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', caja && 'rounded-lg border border-line p-3')}>
      <div className="flex items-center gap-2">
        <Switch id={id} checked={marcado} onCheckedChange={onCambio} aria-describedby={ayuda ? `${id}-ayuda` : undefined} />
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-fg">
          {etiqueta}
        </label>
        {!caja && ayuda && (
          <span id={`${id}-ayuda`} className="hidden text-xs text-fg-muted sm:inline">
            {ayuda}
          </span>
        )}
      </div>
      {ayuda && (caja ? (
        <p id={`${id}-ayuda`} className="text-xs text-fg-muted">{ayuda}</p>
      ) : (
        <p className="text-xs text-fg-muted sm:hidden" aria-hidden="true">{ayuda}</p>
      ))}
    </div>
  );
}

/** Gerente con el `SearchSelect` del kit (Figma «Asignar Gerente»). */
function SelectorGerente({ organizationId, valor, onCambio, disabled }: { organizationId: number; valor: string; onCambio: (id: string) => void; disabled?: boolean }) {
  const t = useTranslations('org.acceso.sucursales.formulario.campos');
  const [miembros, setMiembros] = useState<Member[] | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    let vivo = true;
    memberService
      .getAvailableManagers(organizationId)
      .then((m) => vivo && setMiembros(m))
      .catch(() => vivo && setFallo(true));
    return () => {
      vivo = false;
    };
  }, [organizationId]);

  const opciones = useMemo(
    () =>
      (miembros ?? []).map((m) => {
        const perfil = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        const rol = Array.isArray(m.roles) ? m.roles[0] : m.roles;
        const nombre = [perfil?.first_name, perfil?.last_name].filter(Boolean).join(' ') || perfil?.email || m.user_id;
        return { value: m.user_id, label: rol?.name ? `${nombre} (${rol.name})` : nombre, sublabel: perfil?.email };
      }),
    [miembros],
  );

  return (
    <FormField etiqueta={t('gerente')} ayuda={t('gerenteAyuda')} error={fallo ? t('gerenteError') : null}>
      {(campo) => (
        <SearchSelect
          id={campo.id}
          aria-describedby={campo['aria-describedby']}
          options={opciones}
          value={valor || 'none'}
          onValueChange={(v) => onCambio(v === 'none' ? '' : v)}
          noneLabel={t('gerenteNinguno')}
          placeholder={miembros === null && !fallo ? t('gerenteCargando') : t('gerenteElegir')}
          searchPlaceholder={t('gerenteBuscar')}
          emptyText={t('gerenteVacio')}
          disabled={disabled || miembros === null}
          className="h-10 w-full"
        />
      )}
    </FormField>
  );
}

export const BranchForm = forwardRef<BranchFormRef, BranchFormProps>((
  {
    initialData = {},
    onSubmit,
    isLoading = false,
    submitLabel,
    hideSubmitButton = false,
    noFormWrapper = false,
    hideStatusSection = false,
    ocultarCabecera = false,
  },
  ref
) => {
  const t = useTranslations('org.acceso.sucursales.formulario');
  const tC = useTranslations('org.acceso.sucursales.formulario.campos');
  const tW = useTranslations('org.acceso.sucursales.formulario.web');
  const tE = useTranslations('org.acceso.sucursales.formulario.estado');
  const tH = useTranslations('org.acceso.sucursales.formulario.horario');
  const locale = useLocale();
  const nombreDia = (dia: string) => ((DIAS_SEMANA as readonly string[]).includes(dia) ? tH(`dias.${dia}`) : dia);

  const [openingHoursObj, setOpeningHoursObj] = useState<OpeningHours>(() => initialData.opening_hours ?? structuredClone(HORARIO_POR_DEFECTO));

  // ¿El usuario tocó el horario? Una sede sin horario guardado (nueva, o existente con
  // opening_hours en null) que no lo toca se guarda SIN horario en vez del valor por defecto:
  // con él, el sitio web decía «Cerrado» a restaurantes abiertos.
  const [horarioTocado, setHorarioTocado] = useState(false);

  const [featuresObj, setFeaturesObj] = useState<BranchFeatures>(() => initialData.features ?? { ...CARACTERISTICAS_POR_DEFECTO });

  // La capacidad se edita como texto: vacía = NULL en la base (y 0 es un valor válido).
  const [capacidad, setCapacidad] = useState<string>(initialData.capacity != null ? String(initialData.capacity) : '');

  const [form, setForm] = useState<BranchFormData>({
    name: initialData.name || '',
    address: initialData.address || '',
    city: initialData.city || '',
    state: initialData.state || '',
    country: initialData.country || 'Colombia',
    country_code: initialData.country_code || (initialData.country ? '' : 'COL'),
    state_code: initialData.state_code || '',
    municipality_id: initialData.municipality_id || '',
    postal_code: initialData.postal_code || '',
    latitude: initialData.latitude || undefined,
    longitude: initialData.longitude || undefined,
    phone: initialData.phone || '',
    email: initialData.email || '',
    manager_id: initialData.manager_id || '',
    status: initialData.status || 'active',
    is_main: hideStatusSection ? true : (initialData.is_main || false), // Force true during signup
    tax_identification: initialData.tax_identification || '',
    capacity: initialData.capacity ?? undefined,
    branch_type: initialData.branch_type || '',
    zone: initialData.zone || '',
    timezone: initialData.timezone ?? null,
    branch_code: initialData.branch_code || '',
    is_active: hideStatusSection ? true : (initialData.is_active ?? true), // Force true during signup
    is_web_stock_source: hideStatusSection ? true : (initialData.is_web_stock_source ?? false), // La sucursal del signup surte la web
    // --- Identidad Web ---
    slug: initialData.slug || '',
    subdomain: initialData.subdomain || '',
    custom_domain: initialData.custom_domain || '',
    website_logo_url: initialData.website_logo_url || '',
    website_cover_url: initialData.website_cover_url || '',
    is_web_published: initialData.is_web_published ?? false,
    organization_id: initialData.organization_id!,
  });

  const fijar = <K extends keyof BranchFormData>(campo: K, valor: BranchFormData[K]) => setForm((prev) => ({ ...prev, [campo]: valor }));

  // Subdominio y dominio propio de la organización, para el preview de URL
  // pública por path (https://{org-subdomain}.goadmin.io/{slug}).
  const [orgSubdomain, setOrgSubdomain] = useState<string>('');
  const [orgCustomDomain, setOrgCustomDomain] = useState<string>('');

  // Diálogos de compra/conexión de dominio para el outlet
  const { session } = useSession();
  const [buyDomainOpen, setBuyDomainOpen] = useState(false);
  const [connectDomainOpen, setConnectDomainOpen] = useState(false);

  useEffect(() => {
    if (initialData.organization_id) {
      supabase
        .from('organizations')
        .select('subdomain, custom_domain')
        .eq('id', initialData.organization_id)
        .single()
        .then(({ data }) => {
          if (data?.subdomain) setOrgSubdomain(data.subdomain);
          if (data?.custom_domain) setOrgCustomDomain(data.custom_domain);
        });
    }
  }, [initialData.organization_id]);

  const [error, setError] = useState<string | null>(null);
  const [errorNombre, setErrorNombre] = useState<string | null>(null);
  const [errorCapacidad, setErrorCapacidad] = useState<string | null>(null);
  const refError = useRef<HTMLDivElement>(null);
  const refNombre = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error) refError.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [error]);

  const ubicacion: UbicacionSede = {
    country: form.country || '',
    countryCode: form.country_code || '',
    state: form.state || '',
    stateCode: form.state_code || '',
    city: form.city || '',
    municipalityId: form.municipality_id || '',
  };
  const cambiarUbicacion = useCallback((u: UbicacionSede) => {
    setForm((prev) => ({
      ...prev,
      country: u.country,
      country_code: u.countryCode,
      state: u.state,
      state_code: u.stateCode,
      city: u.city,
      municipality_id: u.municipalityId,
    }));
  }, []);

  // Abrir o cerrar un día.
  const cambiarAbierto = (day: string, abierto: boolean) => {
    setHorarioTocado(true);
    setOpeningHoursObj((prev) => {
      const actual = prev[day as keyof OpeningHours] ?? { open: '09:00', close: '18:00', closed: false };
      return { ...prev, [day]: { ...actual, closed: !abierto } };
    });
  };

  // Turnos partidos: open/close quedan como apertura del primero y cierre del último.
  const setTurnos = (day: string, turnos: TurnoHorario[]) => {
    setHorarioTocado(true);
    setOpeningHoursObj((prev) => {
      const actual = prev[day as keyof OpeningHours];
      const base = { closed: actual?.closed ?? false, open: turnos[0]?.open ?? '09:00', close: turnos[turnos.length - 1]?.close ?? '18:00' };
      return { ...prev, [day]: turnos.length >= 2 ? { ...base, tramos: turnos } : base };
    });
  };
  const turnosParaEditar = (day: string): TurnoHorario[] => {
    const d = openingHoursObj[day as keyof OpeningHours];
    const turnos = turnosDelDia({ ...d, closed: false } as NonNullable<typeof d>);
    return turnos.length > 0 ? turnos : [{ open: d?.open || '09:00', close: d?.close || '18:00' }];
  };
  const horarioSinRevisar = !horarioTocado && esHorarioPorDefecto(openingHoursObj);

  // Normaliza el dominio propio al ingresar: minúsculas, trim y sin espacios
  // internos (recomendación QA R3 — no opcional).
  const cambiarDominio = (value: string) => fijar('custom_domain', value.toLowerCase().trim().replace(/\s+/g, ''));

  // Valida que una URL sea http(s):// válida (no fiarse solo del type="url").
  const urlValida = (url: string): boolean => {
    if (!url) return true;
    try {
      return ['http:', 'https:'].includes(new URL(url).protocol);
    } catch {
      return false;
    }
  };

  // handleSubmit acepta evento opcional para que submitForm() pueda invocarlo
  // sin argumento sin que preventDefault() crashee (flujo signup).
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setErrorNombre(null);
    setErrorCapacidad(null);

    // Nombre obligatorio de verdad (antes `required` inoperante: no hay <form>).
    if (!form.name.trim()) {
      setErrorNombre(tC('nombreObligatorio'));
      refNombre.current?.focus();
      return;
    }

    const capacidadTexto = capacidad.trim();
    const capacidadNumero = capacidadTexto === '' ? null : Number(capacidadTexto);
    if (capacidadNumero !== null && (!Number.isInteger(capacidadNumero) || capacidadNumero < 0)) {
      setErrorCapacidad(tC('capacidadInvalida'));
      return;
    }

    // Construir formWithPublished PRIMERO: si el usuario ingresa custom_domain sin
    // marcar el toggle, se auto-publica. Usar variable local (no setForm + leer
    // form) para evitar closure stale.
    // El subdominio propio de la sede ya no publica: `<sub>.goadmin.io` el sitio lo resuelve
    // como OTRA organización. Publicar es explícito o por dominio propio.
    const formWithPublished = {
      ...form,
      name: form.name.trim(),
      capacity: capacidadNumero,
      is_web_published: form.is_web_published || !!form.custom_domain,
    };

    // Validar branch_type obligatorio al publicar
    if (formWithPublished.is_web_published && !formWithPublished.branch_type) {
      setError(t('errores.tipoObligatorio'));
      return;
    }

    // Validar slug obligatorio al publicar
    if (formWithPublished.is_web_published && !formWithPublished.slug) {
      setError(t('errores.slugObligatorio'));
      return;
    }

    const errorTelefono = mensajeErrorTelefono(form.phone);
    if (errorTelefono) {
      setError(t('errores.telefono', { detalle: errorTelefono }));
      return;
    }

    // --- Validaciones de formato de identidad web ---
    const slugError = validateSlug(formWithPublished.slug || '');
    if (slugError && formWithPublished.slug) { setError(slugError); return; }

    const subdomainError = validateSubdomain(formWithPublished.subdomain || '');
    if (subdomainError && formWithPublished.subdomain) { setError(subdomainError); return; }

    const customDomainError = validateDomain(formWithPublished.custom_domain || '', 'El dominio personalizado');
    if (customDomainError && formWithPublished.custom_domain) { setError(customDomainError); return; }

    // Validar URLs de logo y cover
    if (!urlValida(formWithPublished.website_logo_url || '')) { setError(t('errores.urlLogo')); return; }
    if (!urlValida(formWithPublished.website_cover_url || '')) { setError(t('errores.urlPortada')); return; }

    // Turnos del horario: sin solapes y solo el último puede pasar la medianoche.
    for (const [dia, valor] of Object.entries(openingHoursObj)) {
      if (!valor || valor.closed) continue;
      const problema = errorTurnos(turnosParaEditar(dia));
      if (problema) {
        setError(tH('errorDia', { dia: nombreDia(dia), problema: tH(`errores.${problema}`) }));
        return;
      }
    }

    // Slug igual a una página del sitio: la sede o la página quedarían inalcanzables.
    if (formWithPublished.is_web_published && formWithPublished.slug && formWithPublished.organization_id) {
      const choca = await slugChocaConPagina(supabase, formWithPublished.organization_id, formWithPublished.slug);
      if (choca) {
        setError(tH('slugChocaPagina', { slug: formWithPublished.slug }));
        return;
      }
    }

    // Normalizar branch_type vacío a null antes de construir el payload
    const normalizedBranchType = formWithPublished.branch_type || null;

    // Sede sin horario guardado (nueva, o existente con opening_hours en null) y sin tocar la
    // sección: no se guarda el valor por defecto. En la edición, opening_hours undefined hace que
    // branchService.updateBranch no toque la columna y la sede sigue en null.
    const guardarSinHorario = !initialData.opening_hours && !horarioTocado;
    const horarioNormalizado = Object.fromEntries(
      Object.entries(openingHoursObj).map(([dia, valor]) => [dia, normalizarDia(valor)]),
    );

    try {
      const formWithJson = {
        ...formWithPublished,
        branch_type: normalizedBranchType, // '' → null
        opening_hours: guardarSinHorario ? undefined : JSON.stringify(horarioNormalizado),
        features: JSON.stringify(featuresObj),
      };
      await onSubmit(formWithJson);
    } catch (err) {
      setError((err instanceof Error && err.message) || t('errores.generico'));
    }
  };

  // Expose methods to parent component.
  // submitForm llama handleSubmit internamente (no onSubmit directo) para que
  // el flujo signup (BranchStep invoca formRef.current.submitForm()) no se salte
  // las validaciones de identidad web.
  useImperativeHandle(ref, () => ({
    submitForm: () => handleSubmit()
  }));

  const numero = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 4, minimumFractionDigits: 4 }), [locale]);
  const coordenadas =
    form.latitude != null && form.longitude != null
      ? `${numero.format(Number(form.latitude))} · ${numero.format(Number(form.longitude))}`
      : '';

  const tipoNegocio = form.branch_type || '';
  const urlPublica = urlPublicaSede(
    { custom_domain: form.custom_domain, slug: form.slug },
    { dominio: orgCustomDomain, subdominio: orgSubdomain },
  );
  // Línea de ayuda bajo «Tipo de negocio». Si existe la clave de la plantilla del
  // sitio (`web.plantillaDelTipo`, con {tipo}), manda; si no, la ayuda de siempre.
  const ayudaTipo =
    tipoNegocio && tW.has('plantillaDelTipo')
      ? tW('plantillaDelTipo', { tipo: tW(`tipos.${tipoNegocio}`) })
      : tW('tipoAyuda');

  const formContent = (
    <div className="flex flex-col gap-3">
      {/* Barra propia solo cuando nadie más pone cabecera (hoy no hay otro llamador). */}
      {!ocultarCabecera && (
        <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
          <h2 className="text-lg font-semibold text-fg">{initialData.id ? t('editar') : t('nueva')}</h2>
          {!hideSubmitButton && (
            <button type="submit" className={clasesBoton()} disabled={isLoading} aria-busy={isLoading || undefined}>
              {isLoading ? t('guardando') : submitLabel ?? t('guardar')}
            </button>
          )}
        </div>
      )}

      {/* Información básica */}
      <Bloque icono={Building2} titulo={t('secciones.basica')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField etiqueta={tC('nombre')} obligatorio error={errorNombre}>
            <Input
              ref={refNombre}
              className="h-10"
              name="name"
              value={form.name}
              onChange={(e) => {
                fijar('name', e.target.value);
                if (errorNombre) setErrorNombre(null);
              }}
              placeholder={tC('nombrePlaceholder')}
            />
          </FormField>
          <FormField etiqueta={tC('codigo')} ayuda={tC('codigoAyuda')}>
            <Input className="h-10 bg-subtle text-fg-secondary" name="branch_code" value={form.branch_code} readOnly />
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField etiqueta={tC('nit')}>
            <Input className="h-10" name="tax_identification" value={form.tax_identification || ''} onChange={(e) => fijar('tax_identification', e.target.value)} placeholder={tC('nitPlaceholder')} />
          </FormField>
          <FormField etiqueta={tC('zona')}>
            <Input className="h-10" name="zone" value={form.zone || ''} onChange={(e) => fijar('zone', e.target.value)} placeholder={tC('zonaPlaceholder')} />
          </FormField>
          <FormField etiqueta={tC('capacidad')} error={errorCapacidad}>
            <Input
              className="h-10"
              name="capacity"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={capacidad}
              onChange={(e) => {
                setCapacidad(e.target.value);
                if (errorCapacidad) setErrorCapacidad(null);
              }}
              placeholder={tC('capacidadPlaceholder')}
            />
          </FormField>
        </div>
      </Bloque>

      {/* Ubicación */}
      <Bloque icono={MapPin} titulo={t('secciones.ubicacion')}>
        <FormField etiqueta={tC('direccion')}>
          <Input className="h-10" name="address" value={form.address || ''} onChange={(e) => fijar('address', e.target.value)} placeholder={tC('direccionPlaceholder')} />
        </FormField>
        <UbicacionSucursal valor={ubicacion} onCambio={cambiarUbicacion} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField etiqueta={tC('postal')}>
            <Input className="h-10" name="postal_code" value={form.postal_code || ''} onChange={(e) => fijar('postal_code', e.target.value)} placeholder={tC('postalPlaceholder')} />
          </FormField>
          <FormField etiqueta={tC('coordenadas')} ayuda={tC('coordenadasAyuda')}>
            <Input className="h-10 bg-subtle text-fg-secondary" value={coordenadas} placeholder={tC('sinCoordenadas')} readOnly />
          </FormField>
        </div>
        {/* No está en el Figma: zona horaria de la sede (heredar de la organización o propia). */}
        <BranchTimezoneField value={form.timezone} onChange={(timezone) => fijar('timezone', timezone)} />
      </Bloque>

      {/* Contacto */}
      <Bloque icono={Phone} titulo={t('secciones.contacto')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            etiqueta={tC('telefono')}
            id="branch-phone"
            ayuda={form.phone ? tC('telefonoAyuda', { numero: formatearTelefono(form.phone) }) : tC('telefonoAyudaVacio')}
          >
            {(campo) => (
              <PhoneInput
                id={campo.id}
                aria-describedby={campo['aria-describedby']}
                tamano="md"
                name="phone"
                value={form.phone || ''}
                onChange={(v) => fijar('phone', v)}
                defaultIso={paisIsoDeOrganizacion(form.country_code, form.country) ?? undefined}
              />
            )}
          </FormField>
          <FormField etiqueta={tC('email')}>
            <Input className="h-10" type="email" name="email" value={form.email || ''} onChange={(e) => fijar('email', e.target.value)} placeholder={tC('emailPlaceholder')} />
          </FormField>
        </div>
      </Bloque>

      {/* Gerente — oculto durante signup (hideStatusSection) porque la org aún no existe */}
      {!hideStatusSection && (
        <Bloque icono={UserCircle} titulo={t('secciones.gerente')}>
          <SelectorGerente organizationId={form.organization_id} valor={form.manager_id || ''} onCambio={(id) => fijar('manager_id', id)} disabled={isLoading} />
        </Bloque>
      )}

      {/* Horarios */}
      <Bloque
        icono={Clock}
        titulo={t('secciones.horario')}
        extra={
          horarioSinRevisar && (
            <span className="inline-flex h-[22px] items-center rounded-full border border-line-warning bg-warning-subtle px-2 text-xs font-medium text-warning-text">
              {tH('sinRevisar')}
            </span>
          )
        }
      >
        <div className="overflow-hidden rounded-lg border border-line">
          <div className="hidden grid-cols-[160px_120px_180px_180px_1fr] bg-subtle px-3 py-2 text-xs font-medium text-fg-secondary sm:grid" aria-hidden="true">
            <span>{tH('dia')}</span>
            <span>{tH('abierto')}</span>
            <span>{tH('aperturaCol')}</span>
            <span>{tH('cierreCol')}</span>
            <span />
          </div>
          <ul className="divide-y divide-line">
            {DIAS_SEMANA.map((day) => {
              const dayLabel = nombreDia(day);
              const dayHours = openingHoursObj[day] || { open: '09:00', close: '18:00', closed: false };
              const abierto = !dayHours.closed;
              const turnos = turnosParaEditar(day);
              const idSwitch = `horario-${day}`;
              return (
                <li key={day} className="px-3 py-2">
                  {turnos.map((turno, i) => (
                    <div
                      key={i}
                      className={cn(
                        'grid grid-cols-2 items-center gap-x-3 gap-y-2 sm:grid-cols-[160px_120px_180px_180px_1fr] sm:gap-x-0 sm:gap-y-0',
                        i > 0 && 'mt-2',
                        !abierto && i > 0 && 'hidden',
                      )}
                    >
                      {i === 0 ? (
                        <label htmlFor={idSwitch} className="text-sm font-medium text-fg">{dayLabel}</label>
                      ) : (
                        <span className="hidden sm:block" />
                      )}
                      {i === 0 ? (
                        <div className="flex items-center justify-end gap-2 sm:justify-start">
                          <Switch id={idSwitch} checked={abierto} onCheckedChange={(v) => cambiarAbierto(day, v)} />
                          <span className="w-6 text-xs text-fg-secondary">{abierto ? tH('si') : tH('no')}</span>
                        </div>
                      ) : (
                        <span className="col-span-2 text-xs text-fg-secondary sm:col-span-1">{tH('turnoN', { n: i + 1 })}</span>
                      )}
                      {abierto ? (
                        <>
                          <CampoHora
                            className="w-full sm:w-40"
                            valor={turno.open}
                            onValorChange={(v) => setTurnos(day, turnos.map((x, j) => (j === i ? { ...x, open: v } : x)))}
                            aria-label={tH('aperturaTurno', { dia: dayLabel, n: i + 1 })}
                          />
                          <CampoHora
                            className="w-full sm:w-40"
                            valor={turno.close}
                            onValorChange={(v) => setTurnos(day, turnos.map((x, j) => (j === i ? { ...x, close: v } : x)))}
                            aria-label={tH('cierreTurno', { dia: dayLabel, n: i + 1 })}
                          />
                          <div className="col-span-2 flex sm:col-span-1">
                            {i === 0 ? (
                              turnos.length < MAX_TURNOS && (
                                <button
                                  type="button"
                                  className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                                  onClick={() => setTurnos(day, [...turnos, { open: '19:00', close: '23:00' }])}
                                >
                                  <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
                                  {tH('anadirTurno')}
                                </button>
                              )
                            ) : (
                              <button
                                type="button"
                                className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                                onClick={() => setTurnos(day, turnos.filter((_, j) => j !== i))}
                              >
                                <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
                                {tH('quitarTurno')}
                              </button>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="hidden text-xs text-fg-muted sm:block">{tH('cerrado')}</span>
                          <span className="hidden text-xs text-fg-muted sm:block">{tH('cerrado')}</span>
                        </>
                      )}
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex flex-col gap-1 text-xs text-fg-muted">
          {horarioSinRevisar && <p>«{tH('sinRevisar')}»: {tH('avisoSinRevisar')}</p>}
          <p>{tH('ayudaTurnos')}</p>
        </div>
      </Bloque>

      {/* Características */}
      <Bloque icono={Check} titulo={t('secciones.caracteristicas')}>
        <div className="flex flex-wrap gap-x-5 gap-y-2.5">
          {CARACTERISTICAS.map((c) => (
            <label key={c} htmlFor={`caracteristica-${c}`} className="flex cursor-pointer items-center gap-2 text-sm text-fg">
              <Checkbox id={`caracteristica-${c}`} checked={!!featuresObj[c]} onCheckedChange={(v) => setFeaturesObj((prev) => ({ ...prev, [c]: v === true }))} />
              {t(`caracteristicas.${c}`)}
            </label>
          ))}
        </div>
      </Bloque>

      {/* Identidad web — oculta durante signup (hideStatusSection) */}
      {!hideStatusSection && (
        <Bloque icono={Globe} titulo={t('secciones.web')}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField etiqueta={tW('tipo')} ayuda={ayudaTipo}>
              {(campo) => (
                <Select value={tipoNegocio || SIN_TIPO} onValueChange={(v) => fijar('branch_type', v === SIN_TIPO ? '' : (v as BranchFormData['branch_type']))}>
                  <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']} className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SIN_TIPO}>{tW('tipoNinguno')}</SelectItem>
                    {BRANCH_TYPES.map((bt) => (
                      <SelectItem key={bt.value} value={bt.value}>
                        {tW(`tipos.${bt.value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={tW('slug')} ayuda={tW('slugAyuda')}>
              <Input
                className="h-10"
                name="slug"
                value={form.slug || ''}
                onChange={(e) => {
                  // Auto-normalizar: lowercase, sin espacios, comprimir guiones
                  // consecutivos y limpiar guiones al inicio/final (SLUG_REGEX).
                  const normalized = e.target.value
                    .toLowerCase()
                    .trim()
                    .replace(/\s+/g, '-')
                    .replace(/[^a-z0-9-]/g, '')
                    .replace(/-+/g, '-')
                    .replace(/^-|-$/g, '');
                  fijar('slug', normalized);
                }}
                placeholder={tW('slugPlaceholder')}
              />
            </FormField>
          </div>

          {/* subdomain: ya no se ofrece. `<sub>.goadmin.io` el sitio lo resuelve como OTRA
              organización; la sede se publica por ruta (/<slug>) o por dominio propio. */}
          {initialData.subdomain && (
            <AvisoTonal tono="advertencia" compacto titulo={tW('subdominioLegado', { subdominio: initialData.subdomain })} />
          )}

          <FormField etiqueta={tW('dominio')} ayuda={tW('dominioAyuda')}>
            <Input className="h-10" name="custom_domain" value={form.custom_domain || ''} onChange={(e) => cambiarDominio(e.target.value)} placeholder={tW('dominioPlaceholder')} />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setConnectDomainOpen(true)}>
              <LinkIcono aria-hidden="true" className="size-4" strokeWidth={1.75} />
              {tW('conectar')}
            </button>
            <button type="button" className={clasesBoton({ tamano: 'sm' })} onClick={() => setBuyDomainOpen(true)}>
              <ShoppingCart aria-hidden="true" className="size-4" strokeWidth={1.75} />
              {tW('comprar')}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <ImageUploader
                currentImageUrl={form.website_logo_url}
                onImageUploaded={(url) => fijar('website_logo_url', url)}
                onImageRemoved={() => fijar('website_logo_url', '')}
                bucket="logos"
                folder="branches"
                label={tW('logo')}
                maxSizeMB={2}
                acceptedFormats={['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']}
              />
              <p className="text-xs text-fg-muted">{tW('logoAyuda')}</p>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <ImageUploader
                currentImageUrl={form.website_cover_url}
                onImageUploaded={(url) => fijar('website_cover_url', url)}
                onImageRemoved={() => fijar('website_cover_url', '')}
                bucket="organization_images"
                folder="branches/covers"
                label={tW('portada')}
                maxSizeMB={5}
                acceptedFormats={['image/jpeg', 'image/png', 'image/webp']}
              />
              <p className="text-xs text-fg-muted">{tW('portadaAyuda')}</p>
            </div>
          </div>

          <FilaSwitch id="branch-publicado" etiqueta={tW('publicado')} ayuda={tW('publicadoAyuda')} marcado={!!form.is_web_published} onCambio={(v) => fijar('is_web_published', v)} />

          {/* Preview de URL pública */}
          {form.is_web_published && (
            <div className="rounded-lg border border-line-info bg-info-subtle px-3 py-2.5">
              <p className="text-xs font-medium text-info-text">{tW('urlPublica')}</p>
              <p className="break-all text-sm text-link">{urlPublica ?? (form.slug ? tW('urlSinDominio') : tW('urlSinSlug'))}</p>
            </div>
          )}

          {/* Slug reservado del router público */}
          {form.slug && RESERVED_SLUGS.includes(form.slug) && (
            <AvisoTonal tono="advertencia" compacto titulo={tW('slugReservado', { slug: form.slug })} />
          )}
          {/* Cambiar el slug de una sede ya existente */}
          {initialData.id && initialData.slug && initialData.slug !== form.slug && (
            <AvisoTonal tono="advertencia" compacto titulo={tW('slugCambio', { antes: initialData.slug, despues: form.slug || '—' })} />
          )}
        </Bloque>
      )}

      {/* Estado — oculto durante signup */}
      {!hideStatusSection && (
        <Bloque icono={Check} titulo={t('secciones.estado')}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FilaSwitch caja id="branch-principal" etiqueta={tE('principal')} ayuda={tE('principalAyuda')} marcado={!!form.is_main} onCambio={(v) => fijar('is_main', v)} />
            <FilaSwitch caja id="branch-activa" etiqueta={tE('activa')} ayuda={tE('activaAyuda')} marcado={!!form.is_active} onCambio={(v) => fijar('is_active', v)} />
            <FilaSwitch caja id="branch-surte" etiqueta={tE('surte')} ayuda={tE('surteAyuda')} marcado={!!form.is_web_stock_source} onCambio={(v) => fijar('is_web_stock_source', v)} />
          </div>
        </Bloque>
      )}

      {error && (
        <div ref={refError}>
          <AvisoTonal tono="peligro" rol="alert" titulo={t('errores.titulo')} descripcion={error} />
        </div>
      )}
    </div>
  );

  return (
    <>
      {noFormWrapper ? (
        <div id="branch-form" className="branch-form">{formContent}</div>
      ) : (
        <form id="branch-form" onSubmit={handleSubmit} className="branch-form" noValidate>{formContent}</form>
      )}

      {/* Diálogos de dominio para el outlet */}
      <BuyDomainDialog
        open={buyDomainOpen}
        onOpenChange={setBuyDomainOpen}
        organizationId={form.organization_id}
        userEmail={session?.user?.email || ''}
        userName={session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || ''}
        onPurchaseComplete={(domain) => {
          // Auto-llenar el campo custom_domain con el dominio comprado
          fijar('custom_domain', domain.toLowerCase().trim());
        }}
      />
      <AddCustomDomainDialog
        open={connectDomainOpen}
        onOpenChange={setConnectDomainOpen}
        organizationId={form.organization_id}
        onDomainAdded={(domain) => {
          // Auto-llenar el campo custom_domain con el dominio conectado
          if (domain) fijar('custom_domain', domain.toLowerCase().trim());
        }}
      />
    </>
  );
});

// Add display name for debugging
BranchForm.displayName = 'BranchForm';

export default BranchForm;
