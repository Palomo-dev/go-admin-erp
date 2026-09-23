'use client';

/**
 * Organización ▾ / Sucursal ▾ del header (Figma `02 Componentes` › OrgSwitcher
 * 42:1408, OrgPicker 41:1175, BranchPicker 41:1260 y sus paneles 42:1199 /
 * 42:1289).
 *
 * Sustituye al selector de organización que vivía arriba del sidebar y al
 * selector de sucursal del header anterior. La lógica de cambio no se
 * reimplementa: la organización cambia con `cambiarOrganizacionActiva` (limpia
 * sucursal y caché, persiste `last_org_id` y recarga) y la sucursal con
 * `useBranch().setSelectedBranch` (evento `branch-changed`, sin recargar).
 *
 * «Todas las sucursales» sale solo si `canSelectAll`; «Crear sucursal» y
 * «Gestionar sucursales», solo para quien administra la organización según el
 * servidor (`/api/me/capacidades`), que es quien puede abrir esa página.
 */
import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowUpRight, Check, ChevronsUpDown, Layers, Plus, Search, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import CreateOrganizationDialog from '@/components/organization/CreateOrganizationDialog';
import { useBranch, ALL_BRANCHES } from '@/lib/context/BranchContext';
import { cambiarOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { getOrganizationLogoUrl } from '@/lib/supabase/imageUtils';
import { colorOrganizacion, identidadSucursal } from '@/lib/utils/identidadVisual';
import { useCapacidades } from '@/lib/navigation/useCapacidades';
import { usePlanSesion } from '../sesion/usePlanSesion';
import { useOrganizacionesUsuario, type OrganizacionUsuario } from './useOrganizacionesUsuario';

// ─── Piezas ─────────────────────────────────────────────────────────────────

const PALABRAS_MENORES = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'sas', 's.a.s.', 'sa', 's.a.', 'ltda', 'ltda.']);

/** «Perros de Diego» → «PD»; «Mi empresa S.A.S.» → «ME». */
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter((p) => p && !PALABRAS_MENORES.has(p.toLowerCase()));
  const letras = (palabras.length ? palabras : [nombre.trim()]).slice(0, 2).map((p) => p[0] ?? '');
  return letras.join('').toUpperCase() || '?';
}

export function AvatarOrganizacion({
  id,
  nombre,
  logoUrl,
  className,
}: {
  id: number;
  nombre: string;
  logoUrl?: string | null;
  className?: string;
}) {
  const url = logoUrl ? getOrganizationLogoUrl(logoUrl) : '';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md text-[10px] font-semibold tracking-tight text-white',
        url ? 'bg-surface ring-1 ring-line' : colorOrganizacion(id),
        className
      )}
    >
      {url ? <Image src={url} alt="" fill sizes="24px" className="object-cover" /> : iniciales(nombre)}
    </span>
  );
}

function ChipPlan({ texto, marca }: { texto: string; marca?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold leading-4',
        marca ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line bg-subtle text-fg-secondary'
      )}
    >
      {texto}
    </span>
  );
}

function Buscador({ valor, onCambio, placeholder }: { valor: string; onCambio: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-10 w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 focus-within:border-line-brand focus-within:ring-2 focus-within:ring-brand/20">
      <Search className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
      <input
        autoFocus
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
      />
    </label>
  );
}

const filaAccion =
  'flex w-full items-center gap-2.5 rounded-lg p-2 text-left text-sm font-medium outline-none transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-brand';

// ─── Panel de organizaciones ────────────────────────────────────────────────

function PanelOrganizaciones({
  activaId,
  onCrear,
  onNavegar,
}: {
  activaId: number | null;
  onCrear: () => void;
  onNavegar: () => void;
}) {
  const t = useTranslations('header');
  const { organizaciones, error } = useOrganizacionesUsuario();
  const [consulta, setConsulta] = useState('');
  const [cambiando, setCambiando] = useState<number | null>(null);

  const visibles = useMemo(() => {
    const q = consulta.trim().toLowerCase();
    return (organizaciones ?? []).filter((o) => !q || o.nombre.toLowerCase().includes(q));
  }, [organizaciones, consulta]);

  const elegir = async (o: OrganizacionUsuario) => {
    if (o.id === activaId) {
      onNavegar();
      return;
    }
    setCambiando(o.id);
    await cambiarOrganizacionActiva({ id: o.id, name: o.nombre, logo_url: o.logoUrl ?? undefined, subdomain: o.subdominio ?? undefined });
  };

  const puntoEstado = {
    activa: 'bg-success',
    prueba: 'bg-info',
    suspendida: 'bg-danger',
  } as const;

  return (
    <div className="flex flex-col gap-0.5">
      <Buscador valor={consulta} onCambio={setConsulta} placeholder={t('searchOrganization')} />
      <p className="px-2 pb-1 pt-2 text-xs font-medium text-fg-muted">{t('organizations')}</p>
      <ul className="max-h-72 overflow-y-auto overscroll-contain" role="listbox" aria-label={t('organizations')}>
        {organizaciones === null && !error &&
          [0, 1].map((i) => <li key={i} className="mx-2 my-1.5 h-9 animate-pulse rounded-lg bg-subtle" />)}
        {error && <li className="px-2 py-3 text-xs text-danger-text">{t('loadError')}</li>}
        {organizaciones !== null && visibles.length === 0 && (
          <li className="px-2 py-3 text-xs text-fg-muted">{t('noOrganizations')}</li>
        )}
        {visibles.map((o) => {
          const activa = o.id === activaId;
          return (
            <li key={o.id} role="option" aria-selected={activa}>
              <button
                type="button"
                onClick={() => void elegir(o)}
                disabled={cambiando !== null}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60',
                  activa ? 'bg-brand-tint' : 'hover:bg-hover'
                )}
              >
                <span aria-hidden="true" className={cn('h-6 w-[3px] shrink-0 rounded-sm', colorOrganizacion(o.id))} />
                <AvatarOrganizacion id={o.id} nombre={o.nombre} logoUrl={o.logoUrl} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn('truncate text-sm font-medium', activa ? 'text-brand-deep' : 'text-fg')}>{o.nombre}</span>
                  {o.rol && <span className="truncate text-xs font-medium text-fg-secondary">{o.rol}</span>}
                </span>
                {o.plan && <ChipPlan texto={o.plan} marca={activa} />}
                <span className={cn('h-2 w-2 shrink-0 rounded-full', puntoEstado[o.estado])} aria-hidden="true" />
                <span className="sr-only">{t(`orgStatus.${o.estado}`)}</span>
                {activa ? (
                  <Check className="h-4 w-4 shrink-0 text-brand-deep" aria-hidden="true" />
                ) : cambiando === o.id ? (
                  <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden="true" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="my-1 h-px bg-line" role="separator" />
      <button type="button" onClick={onCrear} className={cn(filaAccion, 'text-brand-deep')}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t('createOrganization')}
      </button>
      <Link href="/app/organizacion/mis-organizaciones" onClick={onNavegar} className={cn(filaAccion, 'text-fg-secondary')}>
        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        {t('allOrganizations')}
      </Link>
    </div>
  );
}

// ─── Panel de sucursales ────────────────────────────────────────────────────

function PanelSucursales({ onNavegar }: { onNavegar: () => void }) {
  const t = useTranslations('header');
  const router = useRouter();
  const { branches, selectedBranchId, isAllSelected, setSelectedBranch, canSelectAll } = useBranch();
  const { datos: capacidades } = useCapacidades();
  const { datos: plan } = usePlanSesion();
  const [consulta, setConsulta] = useState('');

  const visibles = useMemo(() => {
    const q = consulta.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((b) => b.name?.toLowerCase().includes(q) || b.address?.toLowerCase().includes(q) || b.city?.toLowerCase().includes(q));
  }, [branches, consulta]);

  const esAdmin = capacidades?.esAdmin ?? false;
  const uso = plan?.uso.sucursales;
  const enLimite = uso?.maximo != null && uso.actual >= uso.maximo;

  const elegir = (id: number | typeof ALL_BRANCHES) => {
    setSelectedBranch(id);
    onNavegar();
  };

  const crear = (
    <button
      type="button"
      disabled={enLimite}
      onClick={() => {
        onNavegar();
        router.push('/app/organizacion/sucursales?crear=1');
      }}
      className={cn(filaAccion, 'text-brand-deep disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent')}
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      <span className="flex-1">{t('createBranch')}</span>
      {uso && uso.maximo != null && (
        <span className="text-xs font-medium text-fg-muted">
          {uso.actual} / {uso.maximo}
        </span>
      )}
    </button>
  );

  return (
    <div className="flex flex-col gap-0.5">
      <Buscador valor={consulta} onCambio={setConsulta} placeholder={t('searchBranch')} />
      {canSelectAll && (
        <button
          type="button"
          onClick={() => elegir(ALL_BRANCHES)}
          aria-pressed={isAllSelected}
          className={cn(filaAccion, isAllSelected ? 'bg-brand-tint text-brand-deep hover:bg-brand-tint-hover' : 'text-fg')}
        >
          <Layers className="h-4 w-4" aria-hidden="true" />
          <span className="flex-1">{t('allBranches')}</span>
          {isAllSelected && <Check className="h-4 w-4" aria-hidden="true" />}
        </button>
      )}
      <p className="px-2 pb-1 pt-2 text-xs font-medium text-fg-muted">{t('branches')}</p>
      <ul className="max-h-72 overflow-y-auto overscroll-contain" role="listbox" aria-label={t('branches')}>
        {visibles.length === 0 && <li className="px-2 py-3 text-xs text-fg-muted">{t('noBranches')}</li>}
        {visibles.map((b) => {
          const activa = !isAllSelected && b.id === selectedBranchId;
          const { Icono, fondo, icono } = identidadSucursal(b.id);
          const detalle = b.address || b.city;
          return (
            <li key={b.id} role="option" aria-selected={activa}>
              <button
                type="button"
                onClick={() => b.id && elegir(b.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand',
                  activa ? 'bg-brand-tint' : 'hover:bg-hover'
                )}
              >
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', fondo)} aria-hidden="true">
                  <Icono className={cn('h-4 w-4', icono)} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn('truncate text-sm font-medium', activa ? 'text-brand-deep' : 'text-fg')}>{b.name}</span>
                  {detalle && <span className="truncate text-xs font-medium text-fg-secondary">{detalle}</span>}
                </span>
                {b.is_main && <ChipPlan texto={t('mainBranch')} />}
                {activa && <Check className="h-4 w-4 shrink-0 text-brand-deep" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
      {esAdmin && (
        <>
          <div className="my-1 h-px bg-line" role="separator" />
          {enLimite ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>{crear}</span>
              </TooltipTrigger>
              <TooltipContent side="left">{t('branchLimit')}</TooltipContent>
            </Tooltip>
          ) : (
            crear
          )}
          <Link href="/app/organizacion/sucursales" onClick={onNavegar} className={cn(filaAccion, 'text-fg-secondary')}>
            <Settings className="h-4 w-4" aria-hidden="true" />
            {t('manageBranches')}
          </Link>
        </>
      )}
    </div>
  );
}

// ─── Disparadores ───────────────────────────────────────────────────────────

const disparador =
  'flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-fg outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-hover';

const panel = 'w-popover rounded-xl border-line bg-surface p-2 shadow-md';

interface OrgSwitcherProps {
  variante: 'escritorio' | 'movil';
  organizacionId: number | null;
  organizacionNombre: string;
}

export function OrgSwitcher({ variante, organizacionId, organizacionNombre }: OrgSwitcherProps) {
  const t = useTranslations('header');
  const { branches, selectedBranchId, isAllSelected, isLoading: cargandoSucursales } = useBranch();
  const { datos: plan } = usePlanSesion();
  const { organizaciones, recargar } = useOrganizacionesUsuario();
  // Logo de la organización activa (o sus iniciales), no el isotipo de GO: así
  // se sabe de un vistazo en qué empresa se está trabajando.
  const actual = organizaciones?.find((o) => o.id === organizacionId) ?? null;
  const avatarActual = organizacionId ? (
    <AvatarOrganizacion id={organizacionId} nombre={actual?.nombre ?? organizacionNombre} logoUrl={actual?.logoUrl} />
  ) : null;
  const [abierto, setAbierto] = useState<'org' | 'sucursal' | null>(null);
  const [creandoOrg, setCreandoOrg] = useState(false);

  const sucursal = branches.find((b) => b.id === selectedBranchId) ?? null;
  const nombreSucursal = isAllSelected ? t('allBranches') : sucursal?.name ?? '';
  const mostrarSucursal = !cargandoSucursales && branches.length > 0;
  const nombrePlan = plan?.plan?.nombre ?? null;
  const cerrar = () => setAbierto(null);

  const dialogoCrear = (
    <CreateOrganizationDialog
      isOpen={creandoOrg}
      onClose={() => setCreandoOrg(false)}
      onSuccess={(data) => {
        void recargar();
        if (data?.id) void cambiarOrganizacionActiva({ id: data.id, name: data.name, logo_url: data.logo_url ?? undefined });
      }}
    />
  );
  const abrirCrear = () => {
    cerrar();
    setCreandoOrg(true);
  };

  if (variante === 'movil') {
    return (
      <>
        <button
          type="button"
          onClick={() => setAbierto('org')}
          aria-haspopup="dialog"
          className={cn(disparador, 'max-w-full px-1')}
        >
          {avatarActual}
          <span className="truncate">
            {organizacionNombre || t('organization')}
            {mostrarSucursal && nombreSucursal && <span className="text-fg-muted"> / {nombreSucursal}</span>}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
        </button>
        <Sheet open={abierto !== null} onOpenChange={(o) => !o && cerrar()}>
          <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <SheetHeader className="mb-3 text-left">
              <SheetTitle className="text-base font-semibold text-fg">{t('switchContext')}</SheetTitle>
            </SheetHeader>
            {mostrarSucursal && (
              <div role="tablist" aria-label={t('switchContext')} className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-subtle p-1">
                {(['org', 'sucursal'] as const).map((pestana) => (
                  <button
                    key={pestana}
                    type="button"
                    role="tab"
                    aria-selected={abierto === pestana}
                    onClick={() => setAbierto(pestana)}
                    className={cn(
                      'h-9 rounded-md text-sm font-medium transition-colors',
                      abierto === pestana ? 'bg-surface text-fg shadow-sm' : 'text-fg-secondary hover:text-fg'
                    )}
                  >
                    {pestana === 'org' ? t('organization') : t('branch')}
                  </button>
                ))}
              </div>
            )}
            {abierto === 'sucursal' && mostrarSucursal ? (
              <PanelSucursales onNavegar={cerrar} />
            ) : (
              <PanelOrganizaciones activaId={organizacionId} onCrear={abrirCrear} onNavegar={cerrar} />
            )}
          </SheetContent>
        </Sheet>
        {dialogoCrear}
      </>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <span className="mr-1 flex">{avatarActual}</span>
      <Popover open={abierto === 'org'} onOpenChange={(o) => setAbierto(o ? 'org' : null)}>
        <PopoverTrigger asChild>
          <button type="button" className={cn(disparador, 'max-w-[320px]')} aria-label={t('switchOrganization', { name: organizacionNombre })}>
            <span className="truncate">{organizacionNombre || t('organization')}</span>
            {nombrePlan && <ChipPlan texto={nombrePlan} marca />}
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={8} className={panel}>
          <PanelOrganizaciones activaId={organizacionId} onCrear={abrirCrear} onNavegar={cerrar} />
        </PopoverContent>
      </Popover>
      {mostrarSucursal && (
        <>
          <span className="px-0.5 text-base font-semibold text-fg-muted" aria-hidden="true">
            /
          </span>
          <Popover open={abierto === 'sucursal'} onOpenChange={(o) => setAbierto(o ? 'sucursal' : null)}>
            <PopoverTrigger asChild>
              <button type="button" className={cn(disparador, 'max-w-[240px]')} aria-label={t('switchBranch', { name: nombreSucursal })}>
                {isAllSelected ? (
                  <Layers className="h-4 w-4 shrink-0 text-fg-secondary" aria-hidden="true" />
                ) : (
                  sucursal &&
                  (() => {
                    const { Icono, icono } = identidadSucursal(sucursal.id);
                    return <Icono className={cn('h-4 w-4 shrink-0', icono)} aria-hidden="true" />;
                  })()
                )}
                <span className="truncate">{nombreSucursal || t('chooseBranch')}</span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={8} className={panel}>
              <PanelSucursales onNavegar={cerrar} />
            </PopoverContent>
          </Popover>
        </>
      )}
      {dialogoCrear}
    </div>
  );
}
