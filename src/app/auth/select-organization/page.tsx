'use client';

/**
 * Selección de organización — el selector ÚNICO (R4, decisión v2-9; Figma
 * sección 18, filas 2, 8 y 8b; docs/design/AUTH-ACCESO-V2.md §11 y §13).
 *
 * - Mientras carga, «Entrando…» (es también la pantalla que se ve tras el
 *   callback de Google, fila 2).
 * - Con una sola organización se entra sin preguntar.
 * - Con varias: la principal (`profiles.last_org_id`) y las favoritas primero,
 *   buscador desde 4, filas con teclado.
 * - Sin organizaciones (R12): crear una o unirse con el enlace/código (R6).
 *
 * Conserva la hidratación de la sesión de Google desde la cookie
 * `go-admin-oauth-session` (se borra siempre: si se queda, HTTP 431). El
 * parámetro `?_oauth=` (tokens por URL) ya no se lee: nadie lo generaba.
 * `dest` se valida (antes `router.push(dest)` sin validar, y competía con la
 * redirección de `proceedWithLogin`).
 */
import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { Session } from '@supabase/supabase-js';
import { Building2, KeyRound, Loader2, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { proceedWithLogin, activarOrganizacion } from '@/lib/auth';
import { getOrgTypeLabel } from '@/lib/utils/organizationTypes';
import { destinoTrasLogin } from '@/lib/auth/recuperacionSesion';
import {
  CLAVE_FAVORITAS,
  estadoOrganizacion,
  extraerCodigoInvitacion,
  leerFavoritas,
  ordenarOrganizaciones,
} from '@/lib/auth/seleccionOrganizacion';
import { SearchInput } from '@/components/kit/SearchInput';
import { FormField } from '@/components/kit/FormField';
import { clasesBoton } from '@/components/kit/botonClases';
import { Input } from '@/components/ui/input';
import { EscenaAcceso, TarjetaAcceso, AvisoAcceso, IconoDestacado, DividerTexto, Enlace } from '@/components/kit/acceso';
import { TarjetaOrganizacion } from '@/components/kit/acceso/TarjetaOrganizacion';

interface OrgFila {
  id: number;
  name: string;
  type_name: string;
  plan_name: string;
  status: string;
  logo_url?: string;
}

/** Sesión activa, o la de Google recién llegada del callback (cookie). */
async function sesionActiva(): Promise<Session | null> {
  if (typeof document !== 'undefined') {
    const cookie = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('go-admin-oauth-session='));
    if (cookie) {
      try {
        let valor = cookie.substring(cookie.indexOf('=') + 1);
        // Puede venir codificada una, dos o tres veces (%257B → %7B → {).
        for (let i = 0; i < 3 && /^%(25|7B|5B)/.test(valor); i++) valor = decodeURIComponent(valor);
        const { access_token, refresh_token } = JSON.parse(valor);
        if (access_token && refresh_token) {
          const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (!error && data.session) return data.session;
        }
      } catch (e) {
        console.error('[select-organization] No se pudo hidratar la sesión de Google:', e);
      } finally {
        document.cookie = 'go-admin-oauth-session=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      }
    }
  }
  const { data } = await supabase.auth.getSession();
  return data.session;
}

function SelectOrganizationContent() {
  const t = useTranslations('acceso.seleccion');
  const tc = useTranslations('acceso.comun');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [orgs, setOrgs] = useState<OrgFila[] | null>(null);
  const [principalId, setPrincipalId] = useState<number | null>(null);
  const [favoritas, setFavoritas] = useState<number[]>([]);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [sesion, setSesion] = useState<Session | null>(null);
  const [codigo, setCodigo] = useState('');
  const [errorCodigo, setErrorCodigo] = useState<string | null>(null);
  const [verCodigo, setVerCodigo] = useState(false);

  const destino = useMemo(() => destinoTrasLogin(searchParams?.get('dest') || searchParams?.get('next')), [searchParams]);

  const entrar = useCallback(
    async (org: OrgFila, s: Session) => {
      setEntrando(true);
      try {
        activarOrganizacion({ id: org.id, name: org.name, logo_url: org.logo_url });
        // proceedWithLogin guarda last_org_id, registra el dispositivo y hace
        // UNA sola redirección (al destino validado).
        await proceedWithLogin(false, s.user.email || '', { destino });
      } catch (err) {
        console.error('[select-organization] No se pudo entrar:', err);
        setEntrando(false);
        setError(true);
      }
    },
    [destino],
  );

  useEffect(() => {
    setFavoritas(leerFavoritas(typeof window !== 'undefined' ? localStorage : null));
    let vivo = true;
    (async () => {
      try {
        const s = await sesionActiva();
        if (!vivo) return;
        if (!s) {
          window.location.replace('/auth/login');
          return;
        }
        setSesion(s);
        const [{ data: miembros, error: errMiembros }, { data: perfil }] = await Promise.all([
          supabase
            .from('organization_members')
            .select(
              'organization_id, organizations!inner(id, name, status, logo_url, organization_types(name), subscriptions(plan_id, status, plans(name)))',
            )
            .eq('user_id', s.user.id)
            .eq('is_active', true)
            .in('organizations.status', ['active', 'suspended', 'frozen', 'trial_expired']),
          supabase.from('profiles').select('last_org_id').eq('id', s.user.id).maybeSingle(),
        ]);
        if (errMiembros) throw errMiembros;
        type Fila = {
          organizations: {
            id: number;
            name: string;
            status: string;
            logo_url: string | null;
            organization_types?: { name?: string } | null;
            subscriptions?: { status?: string; plans?: { name?: string } | null }[] | null;
          };
        };
        const filas: OrgFila[] = ((miembros ?? []) as unknown as Fila[]).map((m) => {
          const subs = m.organizations.subscriptions ?? [];
          const activa = subs.find((x) => x.status === 'active') ?? subs[0];
          return {
            id: Number(m.organizations.id),
            name: m.organizations.name,
            type_name: getOrgTypeLabel(m.organizations.organization_types?.name || '', locale),
            plan_name: activa?.plans?.name || 'Free',
            status: m.organizations.status,
            logo_url: m.organizations.logo_url ?? undefined,
          };
        });
        if (!vivo) return;
        setPrincipalId(perfil?.last_org_id ? Number(perfil.last_org_id) : null);
        setOrgs(filas);
        // Con una sola organización no se pregunta (decisión v2-9).
        if (filas.length === 1) await entrar(filas[0], s);
      } catch (err) {
        console.error('[select-organization] Error cargando organizaciones:', err);
        if (vivo) setError(true);
      }
    })();
    return () => {
      vivo = false;
    };
    // Se carga una vez; `entrar` y `locale` no deben relanzar la carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFavorita = (id: number) => {
    setFavoritas((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(CLAVE_FAVORITAS, JSON.stringify(next));
      } catch {
        /* sin almacenamiento: solo en memoria */
      }
      return next;
    });
  };

  const usarCodigo = (e: React.FormEvent) => {
    e.preventDefault();
    const extraido = extraerCodigoInvitacion(codigo);
    if (!extraido) {
      setErrorCodigo(t('codigoInvalido'));
      return;
    }
    window.location.assign(`/auth/invite?invite_code=${encodeURIComponent(extraido)}`);
  };

  const otraCuenta = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
      window.location.replace('/auth/login');
    }
  };

  const lista = useMemo(
    () => ordenarOrganizaciones(orgs ?? [], { principalId, favoritas, texto }),
    [orgs, principalId, favoritas, texto],
  );

  if (error) {
    return (
      <EscenaAcceso>
        <TarjetaAcceso
          titulo={t('titulo')}
          aviso={<AvisoAcceso tono="error">{t('error')}</AvisoAcceso>}
          pie={<p className="text-center"><Enlace href="/auth/login">{tc('volverAlLogin')}</Enlace></p>}
        >
          <button type="button" className={clasesBoton({ anchoCompleto: true })} onClick={() => window.location.reload()}>
            {tc('reintentar')}
          </button>
        </TarjetaAcceso>
      </EscenaAcceso>
    );
  }

  if (entrando || orgs === null || (orgs.length === 1 && !error)) {
    return (
      <EscenaAcceso>
        <TarjetaAcceso
          titulo={tc('entrando')}
          descripcion={tc('entrandoDescripcion')}
          centrado
          icono={<Loader2 className="size-8 animate-spin text-brand" aria-hidden="true" />}
        />
      </EscenaAcceso>
    );
  }

  const formularioCodigo = (
    <form onSubmit={usarCodigo} className="flex flex-col gap-3">
      <FormField etiqueta={t('codigo')} ayuda={t('codigoAyuda')} error={errorCodigo}>
        <Input value={codigo} onChange={(e) => { setCodigo(e.target.value); setErrorCodigo(null); }} className="h-10 rounded-lg" autoComplete="off" />
      </FormField>
      <button type="submit" className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}>
        {t('usarCodigo')}
      </button>
    </form>
  );

  if (orgs.length === 0) {
    return (
      <EscenaAcceso>
        <TarjetaAcceso
          titulo={t('vacioTitulo')}
          descripcion={t('vacioDescripcion')}
          icono={<IconoDestacado icono={Building2} />}
          centrado
          pie={
            <p className="text-center">
              <button type="button" onClick={otraCuenta} className="text-[13px] font-medium text-link underline-offset-4 hover:underline">
                {t('cerrarSesion')}
              </button>
            </p>
          }
        >
          <Link href="/auth/signup?step=organization&google=true" className={clasesBoton({ anchoCompleto: true })}>
            <Plus className="size-4" aria-hidden="true" />
            {t('crear')}
          </Link>
          <DividerTexto />
          {formularioCodigo}
        </TarjetaAcceso>
      </EscenaAcceso>
    );
  }

  return (
    <EscenaAcceso>
      <TarjetaAcceso
        ancho="ancha"
        titulo={t('titulo')}
        descripcion={t('descripcion')}
        pie={
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-xs text-fg-muted">{t('favoritasPrimero')}</p>
            <button type="button" onClick={otraCuenta} className="text-[13px] font-medium text-link underline-offset-4 hover:underline">
              {t('cerrarSesion')}
            </button>
          </div>
        }
      >
        {orgs.length > 3 && (
          <SearchInput value={texto} onChange={setTexto} onValueChange={setTexto} placeholder={t('buscar')} etiqueta={t('buscar')} atajo={false} />
        )}
        <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto" aria-label={t('titulo')}>
          {lista.length === 0 && <li className="py-6 text-center text-sm text-fg-secondary">{t('sinResultados', { texto })}</li>}
          {lista.map((org) => (
            <li key={org.id}>
              <TarjetaOrganizacion
                nombre={org.name}
                detalle={org.type_name}
                logoUrl={org.logo_url}
                plan={org.plan_name}
                estado={estadoOrganizacion(org.status)}
                principal={org.id === principalId}
                favorita={favoritas.includes(org.id)}
                onFavorita={() => toggleFavorita(org.id)}
                onElegir={() => sesion && entrar(org, sesion)}
              />
            </li>
          ))}
        </ul>
        <details open={verCodigo} onToggle={(e) => setVerCodigo((e.target as HTMLDetailsElement).open)} className="group">
          <summary className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-link">
            <KeyRound className="size-3.5" aria-hidden="true" />
            {t('unirse')}
          </summary>
          <div className="mt-3">{formularioCodigo}</div>
        </details>
      </TarjetaAcceso>
    </EscenaAcceso>
  );
}

export default function SelectOrganizationPage() {
  return (
    <Suspense fallback={null}>
      <SelectOrganizationContent />
    </Suspense>
  );
}
