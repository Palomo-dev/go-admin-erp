'use client';

/**
 * Registro — pasos 3 a 6 de 6: organización, sucursal, plan y pago (acceso v3,
 * R5 opción B; Figma sección 18, filas 3b a 3e y fila 9;
 * docs/design/AUTH-ACCESO-V2.md §13).
 *
 * Se llega con el correo ya confirmado (enlace del correo → /auth/verify o
 * este destino) o con Google sin organización. Sin sesión, al login y de
 * vuelta aquí. Con organizaciones, a la app. El alta es el asistente
 * compartido (el mismo de «Nueva organización» en la app).
 */
import { useEffect, useState, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { proceedWithLogin } from '@/lib/auth';
import { EscenaAcceso, TarjetaAcceso, ProgresoPasos } from '@/components/kit/acceso';
import { AsistenteAltaOrganizacion, type PasoAlta } from '@/components/auth/alta/AsistenteAltaOrganizacion';
import { leerReferido, olvidarReferido } from '@/lib/auth/referido';
import { leerParamsRegistro, limpiarParamsRegistro } from '@/lib/auth/registroParams';

interface Persona {
  correo: string;
  nombre: string;
  apellido: string;
}

/** El enlace de confirmación puede traer la sesión en el fragmento (#access_token=…). */
async function sesionDesdeFragmento(): Promise<void> {
  if (typeof window === 'undefined' || !window.location.hash.includes('access_token=')) return;
  const p = new URLSearchParams(window.location.hash.slice(1));
  const access_token = p.get('access_token');
  const refresh_token = p.get('refresh_token');
  window.history.replaceState(null, '', window.location.pathname);
  if (access_token && refresh_token) await supabase.auth.setSession({ access_token, refresh_token });
}

/** Códigos de plan válidos (de la tabla plans). */
const PLANES_VALIDOS = ['pro', 'business', 'ultimate'] as const;
/** Períodos válidos. */
const PERIODOS_VALIDOS = ['monthly', 'yearly'] as const;

function OrganizacionContent() {
  const t = useTranslations('acceso.alta');
  const tc = useTranslations('acceso.comun');
  const params = useSearchParams();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [paso, setPaso] = useState<PasoAlta>(1);
  const [saliendo, setSaliendo] = useState(false);
  const [planInicial, setPlanInicial] = useState<string | undefined>(undefined);
  const [periodoInicial, setPeriodoInicial] = useState<'monthly' | 'yearly' | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    (async () => {
      // Leer parámetros de URL o sessionStorage (si vienen del flujo de registro completo).
      const planParam = params?.get('plan');
      const cycleParam = params?.get('cycle');
      const paramsStorage = leerParamsRegistro();
      
      // Priorizar parámetros de URL sobre sessionStorage.
      const planFinal = planParam || paramsStorage.plan;
      const cycleFinal = cycleParam || paramsStorage.cycle;
      
      if (planFinal) {
        const planNormalizado = planFinal.toLowerCase();
        if (PLANES_VALIDOS.includes(planNormalizado as typeof PLANES_VALIDOS[number])) {
          setPlanInicial(planNormalizado);
        }
      }
      if (cycleFinal) {
        const cycleNormalizado = cycleFinal.toLowerCase() as 'monthly' | 'yearly';
        if (PERIODOS_VALIDOS.includes(cycleNormalizado)) {
          setPeriodoInicial(cycleNormalizado);
        }
      }

      await sesionDesdeFragmento();
      const { data } = await supabase.auth.getSession();
      const s = data.session;
      if (!s) {
        // Preservar parámetros de URL en el redirect.
        const query = new URLSearchParams();
        query.set('redirectTo', '/auth/signup/organizacion');
        if (planParam) query.set('plan', planParam);
        if (cycleParam) query.set('cycle', cycleParam);
        window.location.replace(`/auth/login?${query.toString()}`);
        return;
      }
      const { data: miembros } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', s.user.id)
        .eq('is_active', true)
        .limit(1);
      if (miembros && miembros.length > 0) {
        window.location.replace('/auth/select-organization');
        return;
      }
      const { data: perfil } = await supabase.from('profiles').select('first_name, last_name').eq('id', s.user.id).maybeSingle();
      const meta = (s.user.user_metadata ?? {}) as Record<string, string | undefined>;
      if (!vivo) return;
      setPersona({
        correo: s.user.email ?? '',
        nombre: perfil?.first_name || meta.first_name || meta.given_name || '',
        apellido: perfil?.last_name || meta.last_name || meta.family_name || '',
      });
    })();
    return () => {
      vivo = false;
    };
  }, [params]);

  if (!persona || saliendo) {
    return (
      <EscenaAcceso>
        <TarjetaAcceso
          titulo={saliendo ? tc('entrando') : tc('cargando')}
          descripcion={saliendo ? tc('entrandoDescripcion') : undefined}
          centrado
          icono={<Loader2 className="size-8 animate-spin text-brand" aria-hidden="true" />}
        />
      </EscenaAcceso>
    );
  }

  const titulos: Record<PasoAlta, { titulo: string; descripcion: string; etiqueta: string }> = {
    1: { titulo: t('orgTitulo'), descripcion: t('orgDescripcion'), etiqueta: t('pasoOrg') },
    2: { titulo: t('sucTitulo'), descripcion: t('sucDescripcion'), etiqueta: t('pasoSuc') },
    3: { titulo: t('planTitulo'), descripcion: t('planDescripcion'), etiqueta: t('pasoPlan') },
    4: { titulo: t('pagoTitulo'), descripcion: t('pagoDescripcion'), etiqueta: t('pasoPago') },
  };
  const actual = titulos[paso];
  const esPlan = paso === 3;

  return (
    <EscenaAcceso mostrarMarca={!esPlan} mostrarViajero={!esPlan}>
      <TarjetaAcceso
        ancho={esPlan ? 'plan' : paso === 4 ? 'normal' : 'ancha'}
        pasos={<ProgresoPasos actual={paso + 2} total={6} etiqueta={actual.etiqueta} />}
        titulo={actual.titulo}
        descripcion={actual.descripcion}
      >
        <AsistenteAltaOrganizacion
          modo="registro"
          correo={persona.correo}
          nombre={persona.nombre}
          apellido={persona.apellido}
          referido={leerReferido()}
          planInicial={planInicial}
          periodoInicial={periodoInicial}
          onPaso={setPaso}
          onCreada={async () => {
            setSaliendo(true);
            olvidarReferido();
            limpiarParamsRegistro();
            await proceedWithLogin(false, persona.correo, { destino: '/app/inicio?welcome=true' });
          }}
        />
      </TarjetaAcceso>
    </EscenaAcceso>
  );
}

export default function SignupOrganizacionPage() {
  return (
    <Suspense fallback={null}>
      <OrganizacionContent />
    </Suspense>
  );
}
