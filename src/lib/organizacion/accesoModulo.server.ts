/**
 * Resolutor ÚNICO de «¿por qué no puedo entrar aquí?» y aviso a quien lo
 * resuelve. Diseño: docs/design/MODULO-NO-HABILITADO.md (§3 matriz causa × rol,
 * §5 puntos 3 y 6).
 *
 * - La causa sale de `bloqueoGate()` —la MISMA regla del middleware— con los
 *   datos leídos aquí con el cliente de la sesión; un módulo apagado se afina
 *   con `estadoModulo()` (apagado con cupo / sin cupo / sin plan).
 * - `puedeResolver` lo decide el servidor, nunca el cliente ni el nombre de un
 *   rol: módulos y páginas, la regla de `POST /api/modules` y
 *   `POST /api/modules/pages` (`hasOrgAdminOrPermission`: super admin, rol 1/2
 *   o `admin.full_access`); cargos, `hr.positions.edit` (o admin).
 * - Datos de plan (nombre, cupo, planes con cupo) solo para quien puede
 *   resolver: el miembro no ve precios ni nombres de plan (matriz, fila B).
 * - Personas que resuelven: nombre y papel, sin contacto. Se leen con el
 *   cliente de servicio SIEMPRE filtrado por la organización de la sesión.
 * - Aviso: notificación interna (`fn_create_org_notification`, canal `app`),
 *   una por persona, módulo (o página) y día en la zona de la organización. Se
 *   escribe con el cliente de la sesión (la función exige membresía activa).
 *
 * `plans.module_config.available_modules` NO participa: ningún plan elige
 * qué módulos trae; el límite real es la cantidad (`max_modules`), ver
 * `src/lib/organizacion/modulos.ts`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTranslator, type AbstractIntlMessages } from 'next-intl';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { isOrgAdminLike } from '@/lib/utils/orgAdmin';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { toPlainDate } from '@/lib/utils/dateDisplay';
import { resolverCargoMiembro, type FilaAccesoModulo } from '@/lib/navigation/accesoCargo';
import { clavePagina, moduloPorCodigo } from '@/lib/navigation/catalog';
import { paginaActiva } from '@/lib/navigation/paginaActiva';
import { moduloDeRuta, paginaDeRuta } from '@/lib/navigation/rutasModulos';
import { defaultLocale, isValidLocale, type Locale } from '@/i18n/config';
import { cupoOpcionales, estadoModulo, opcionalesActivos, type ContextoModulos, type ModuloBase, type PlanModulos } from './modulos';
import {
  TIPO_AVISO,
  bloqueoGate,
  causaDeEstado,
  puedeAvisar,
  type AccesoModuloResuelto,
  type CausaAcceso,
  type ModuloNoUsado,
  type PapelPersona,
} from './accesoModulo';

export type { AccesoModuloResuelto, ModuloNoUsado, PapelPersona, PersonaResuelve, PlanResumen } from './accesoModulo';

/** Permiso con el que un cargo o rol (no admin) edita cargos. */
export const PERMISO_EDITAR_CARGOS = 'hr.positions.edit';

/** Cuántas personas se muestran en «Quién puede…». */
const MAX_PERSONAS_VISIBLES = 5;
/** Tope de destinatarios del aviso y de candidatos a revisar por permiso. */
const MAX_DESTINATARIOS = 50;

type Ctx = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'organizationName' | 'roleId' | 'isSuperAdmin' | 'supabase'>;

const VACIO = (ctx: Ctx, modulo: string | null, pagina: string | null): AccesoModuloResuelto => ({
  causa: null,
  modulo,
  pagina,
  puedeResolver: false,
  puedeAvisar: false,
  yaAvisado: false,
  organizacion: ctx.organizationName,
  plan: null,
  planesConCupo: [],
  opcionalesEncendidos: [],
  paginas: [],
  personas: [],
  persona: null,
  cargo: null,
});

/** Una ruta de la app, sin consulta ni fragmento. Lo demás no se resuelve. */
export function rutaValida(ruta: unknown): string | null {
  if (typeof ruta !== 'string' || ruta.length > 300) return null;
  const limpia = ruta.split(/[?#]/)[0];
  if (!/^\/app\/[\w\-/]*$/.test(limpia) || limpia.includes('//') || limpia.includes('..')) return null;
  return limpia.replace(/\/+$/, '');
}

interface CargoLeido {
  id: string | null;
  filas: FilaAccesoModulo[] | null;
  nombre: string | null;
}

/** Cargo de la persona y sus filas de acceso, con la misma regla del middleware. */
async function leerCargo(ctx: Ctx): Promise<CargoLeido> {
  const db = ctx.supabase;
  const { data: miembro } = await db
    .from('organization_members')
    .select('id, is_super_admin, job_position_id')
    .eq('user_id', ctx.userId)
    .eq('organization_id', ctx.organizationId)
    .eq('is_active', true)
    .maybeSingle();
  const id = await resolverCargoMiembro(
    miembro as { id: number; is_super_admin: boolean | null; job_position_id: string | null } | null,
    async (memberId) => {
      const { data } = await db
        .from('employments')
        .select('position_id')
        .eq('organization_member_id', memberId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as { position_id: string | null } | null)?.position_id ?? null;
    },
  );
  if (!id) return { id: null, filas: null, nombre: null };
  const [filas, cargo] = await Promise.all([
    db.from('job_position_module_access').select('module_code, can_view, can_access').eq('job_position_id', id),
    db.from('job_positions').select('name').eq('id', id).eq('organization_id', ctx.organizationId).maybeSingle(),
  ]);
  return {
    id,
    // Consulta fallida → sin restricción (fail open, como el middleware).
    filas: filas.error ? null : ((filas.data ?? []) as FilaAccesoModulo[]),
    nombre: (cargo.data as { name: string | null } | null)?.name ?? null,
  };
}

/** Plan vigente de la organización (la suscripción más reciente). */
async function leerPlanActual(servicio: SupabaseClient, org: number): Promise<PlanModulos | null> {
  const { data, error } = await servicio
    .from('subscriptions')
    .select('plans(code, name, max_modules, price_cop_month, is_active, is_custom_enterprise, module_config)')
    .eq('organization_id', org)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el plan: ${error.message}`);
  const plan = (data as { plans?: PlanModulos | PlanModulos[] | null } | null)?.plans;
  return (Array.isArray(plan) ? plan[0] : plan) ?? null;
}

interface MiembroFila {
  user_id: string;
  role_id: number;
  is_super_admin: boolean | null;
}

interface Destinatario {
  userId: string;
  papel: PapelPersona;
}

/**
 * Quién resuelve la causa en la organización de la sesión: administradores
 * (super admin o rol 1/2, por id) y, para cargos, además quien tenga
 * `hr.positions.edit` según `check_user_permission`. Excluye a quien pregunta.
 */
async function quienResuelve(ctx: Ctx, causa: CausaAcceso): Promise<Destinatario[]> {
  const servicio = getServiceClient();
  const { data, error } = await servicio
    .from('organization_members')
    .select('user_id, role_id, is_super_admin')
    .eq('organization_id', ctx.organizationId)
    .eq('is_active', true)
    .limit(500);
  if (error) throw new Error(`No se pudieron leer los miembros: ${error.message}`);
  const miembros = ((data ?? []) as MiembroFila[]).filter((m) => m.user_id && m.user_id !== ctx.userId);
  const admins: Destinatario[] = miembros
    .filter((m) => isOrgAdminLike({ roleId: m.role_id, isSuperAdmin: m.is_super_admin === true }))
    .map((m) => ({ userId: m.user_id, papel: m.is_super_admin ? 'dueno' : 'administrador' }));
  if (causa !== 'cargo') return admins.slice(0, MAX_DESTINATARIOS);

  const candidatos = miembros
    .filter((m) => !isOrgAdminLike({ roleId: m.role_id, isSuperAdmin: m.is_super_admin === true }))
    .slice(0, MAX_DESTINATARIOS);
  const conPermiso = await Promise.all(
    candidatos.map(async (m) => {
      const { data: ok, error: e } = await ctx.supabase.rpc('check_user_permission', {
        p_user_id: m.user_id,
        p_organization_id: ctx.organizationId,
        p_permission_code: PERMISO_EDITAR_CARGOS,
      });
      return !e && ok === true;
    }),
  );
  const gestores: Destinatario[] = candidatos.filter((_, i) => conPermiso[i]).map((m) => ({ userId: m.user_id, papel: 'gestionaCargos' }));
  return [...admins, ...gestores].slice(0, MAX_DESTINATARIOS);
}

function nombreDe(p: { first_name?: string | null; last_name?: string | null; email?: string | null } | null | undefined): string | null {
  if (!p) return null;
  const n = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return n || p.email || null;
}

interface PerfilFila {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  preferred_language: string | null;
}

async function perfiles(ids: string[]): Promise<Map<string, PerfilFila>> {
  if (ids.length === 0) return new Map();
  const { data } = await getServiceClient()
    .from('profiles')
    .select('id, first_name, last_name, email, preferred_language')
    .in('id', ids);
  return new Map(((data ?? []) as PerfilFila[]).map((p) => [p.id, p]));
}

/** Día del aviso en la zona de la organización: la deduplicación es «uno por día». */
async function diaAviso(ctx: Ctx, ahora: Date): Promise<string> {
  const tz = await getOrganizationTimezone(ctx.organizationId, ctx.supabase).catch(() => undefined);
  return toPlainDate(ahora, tz);
}

/** Identifica el aviso: por módulo, o por página en la causa «página oculta». */
function objetoAviso(acceso: Pick<AccesoModuloResuelto, 'causa' | 'modulo' | 'pagina'>): string {
  return acceso.causa === 'paginaOculta' && acceso.pagina ? acceso.pagina : acceso.modulo ?? '';
}

async function avisoPrevio(ctx: Ctx, causa: CausaAcceso, objeto: string, dia: string): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from('notifications')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .contains('payload', { type: TIPO_AVISO[causa], solicitante: ctx.userId, objeto, dia })
    .limit(1);
  if (error) throw new Error(`No se pudo revisar el aviso previo: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * Resuelve en el servidor por qué la sesión no puede usar `ruta`. Nunca
 * confía en lo que diga el cliente sobre la causa: la recalcula.
 */
export async function resolverAccesoModulo(ctx: Ctx, rutaPedida: string, ahora: Date = new Date()): Promise<AccesoModuloResuelto> {
  const ruta = rutaValida(rutaPedida);
  const codigo = ruta ? moduloDeRuta(ruta) : null;
  const pagina = ruta && codigo ? paginaDeRuta(ruta, codigo) : null;
  if (!ruta || !codigo) return VACIO(ctx, codigo, pagina);

  const db = ctx.supabase;
  const [modulos, activosLista, ocultas, cargo] = await Promise.all([
    moduleManagementService.getAllModules(db),
    moduleManagementService.getActiveModules(ctx.organizationId, db),
    moduleManagementService.getHiddenModulePages(ctx.organizationId, db),
    leerCargo(ctx),
  ]);
  const activos = new Set(activosLista.map((m) => m.code));
  const modulo = (modulos as ModuloBase[]).find((m) => m.code === codigo);

  const bloqueo = bloqueoGate({
    codigo,
    filasActivas: activos.has(codigo) ? 1 : 0,
    esNucleo: modulo ? modulo.is_core === true : null,
    filasCargo: cargo.filas,
    pagina,
    paginasOcultas: ocultas[codigo] ?? [],
  });
  if (!bloqueo) return VACIO(ctx, codigo, pagina);

  const resultado = VACIO(ctx, codigo, pagina);
  const paginasCatalogo = (moduloPorCodigo(codigo)?.paginas ?? []).filter((p) => p.enMenu !== false).map((p) => p.href);

  if (bloqueo === 'modulo' && modulo) {
    const plan = await leerPlanActual(getServiceClient(), ctx.organizationId);
    const { data: planes } = await db
      .from('plans')
      .select('code, name, max_modules, price_cop_month, is_active, is_custom_enterprise, module_config');
    const ctxModulos: ContextoModulos = { modulos: modulos as ModuloBase[], activos, plan, planes: (planes ?? []) as PlanModulos[] };
    const causa = causaDeEstado(estadoModulo(modulo, ctxModulos));
    if (!causa) return VACIO(ctx, codigo, pagina);
    resultado.causa = causa;
    resultado.paginas = paginasCatalogo;
    resultado.puedeResolver = await hasOrgAdminOrPermission(ctx);
    if (resultado.puedeResolver) {
      const cupo = cupoOpcionales(ctxModulos);
      const usados = opcionalesActivos(ctxModulos);
      resultado.plan = { nombre: plan?.name ?? null, cupo, usados };
      if (causa !== 'apagado') {
        const basicos = ctxModulos.modulos.filter((m) => m.is_core).length;
        resultado.planesConCupo = ctxModulos.planes
          .filter((p) => p.is_active !== false && !p.is_custom_enterprise && p.code !== plan?.code)
          .map((p) => ({ codigo: p.code, nombre: p.name, cupo: p.max_modules == null ? null : Math.max(0, p.max_modules - basicos) }))
          .filter((p) => p.cupo === null || p.cupo > usados)
          .sort((a, b) => (a.cupo ?? Infinity) - (b.cupo ?? Infinity));
        resultado.opcionalesEncendidos = ctxModulos.modulos.filter((m) => !m.is_core && activos.has(m.code)).map((m) => m.code);
      }
    }
  } else if (bloqueo === 'cargo') {
    resultado.causa = 'cargo';
    resultado.puedeResolver = await hasOrgAdminOrPermission(ctx, PERMISO_EDITAR_CARGOS);
    resultado.cargo = {
      id: cargo.id ?? '',
      nombre: cargo.nombre,
      modulos: (cargo.filas ?? []).filter((f) => f.can_access && activos.has(f.module_code)).map((f) => f.module_code),
    };
  } else if (bloqueo === 'pagina') {
    resultado.causa = 'paginaOculta';
    resultado.puedeResolver = await hasOrgAdminOrPermission(ctx);
    resultado.paginas = paginasCatalogo.filter((href) =>
      paginaActiva(codigo, href, { modulosActivos: [...activos], paginasOcultas: ocultas }),
    );
  } else {
    return VACIO(ctx, codigo, pagina);
  }

  const causa = resultado.causa as CausaAcceso;
  resultado.puedeAvisar = puedeAvisar(causa, resultado.puedeResolver);

  const destinatarios = await quienResuelve(ctx, causa).catch((err: unknown) => {
    console.warn('[accesoModulo] quién resuelve', err instanceof Error ? err.message : err);
    return [] as Destinatario[];
  });
  const fichas = await perfiles([ctx.userId, ...destinatarios.slice(0, MAX_PERSONAS_VISIBLES).map((d) => d.userId)]);
  resultado.persona = nombreDe(fichas.get(ctx.userId));
  resultado.personas = destinatarios
    .slice(0, MAX_PERSONAS_VISIBLES)
    .map((d) => ({ nombre: nombreDe(fichas.get(d.userId)) ?? '—', papel: d.papel }));

  if (resultado.puedeAvisar) {
    const dia = await diaAviso(ctx, ahora);
    resultado.yaAvisado = await avisoPrevio(ctx, causa, objetoAviso(resultado), dia).catch(() => false);
  }
  return resultado;
}

/** A dónde lleva la notificación a quien la recibe. */
export function destinoAviso(acceso: Pick<AccesoModuloResuelto, 'causa' | 'modulo' | 'cargo'>): string {
  switch (acceso.causa) {
    case 'limite':
    case 'otroPlan':
      return '/app/organizacion/plan';
    case 'cargo':
      return acceso.cargo?.id ? `/app/hrm/cargos/${acceso.cargo.id}` : '/app/hrm/cargos';
    default:
      return `/app/organizacion/modulos?resaltar=${encodeURIComponent(acceso.modulo ?? '')}`;
  }
}

async function mensajes(locale: Locale): Promise<AbstractIntlMessages> {
  const mod = (await import(`../../../messages/${locale}.json`)) as { default?: AbstractIntlMessages } & AbstractIntlMessages;
  return (mod.default ?? mod) as AbstractIntlMessages;
}

/** Traductor con claves en texto (los mensajes del destinatario se cargan al vuelo). */
type Traductor = ((clave: string, valores?: Record<string, string | number>) => string) & { has: (clave: string) => boolean };

export interface ResultadoAviso {
  notificados: number;
  repetida: boolean;
}

/**
 * «Avisar a los administradores» / «Pedir acceso». La causa la recalcula el
 * servidor a partir de la ruta: no se puede pedir por un módulo que la persona
 * sí puede usar, ni avisar quien ya puede resolverlo.
 */
export async function avisarQuienResuelve(ctx: Ctx, ruta: string, ahora: Date = new Date()): Promise<ResultadoAviso> {
  const acceso = await resolverAccesoModulo(ctx, ruta, ahora);
  if (!acceso.causa) throw new OrgContextError('Esta ruta no está bloqueada para ti', 409, 'sin_bloqueo');
  if (!acceso.puedeAvisar) throw new OrgContextError('Tú mismo puedes resolverlo', 409, 'puede_resolver');
  const causa = acceso.causa;

  const objeto = objetoAviso(acceso);
  const dia = await diaAviso(ctx, ahora);
  if (await avisoPrevio(ctx, causa, objeto, dia)) return { notificados: 0, repetida: true };

  const destinatarios = await quienResuelve(ctx, causa);
  if (destinatarios.length === 0) throw new OrgContextError('No hay a quién avisar en la organización', 409, 'sin_destinatarios');

  const fichas = await perfiles([ctx.userId, ...destinatarios.map((d) => d.userId)]);
  const persona = nombreDe(fichas.get(ctx.userId)) ?? '—';
  const link = destinoAviso(acceso);
  const porIdioma = new Map<Locale, AbstractIntlMessages>();

  let notificados = 0;
  for (const d of destinatarios) {
    const pref = fichas.get(d.userId)?.preferred_language ?? '';
    const locale: Locale = isValidLocale(pref) ? pref : defaultLocale;
    if (!porIdioma.has(locale)) porIdioma.set(locale, await mensajes(locale));
    const msgs = porIdioma.get(locale)!;
    // Los mensajes se cargan en tiempo de ejecución: claves como texto, no tipadas.
    const t = createTranslator({ locale, messages: msgs, namespace: 'moduloNoHabilitado.notificacion' }) as unknown as Traductor;
    const tNav = createTranslator({ locale, messages: msgs, namespace: 'nav' }) as unknown as Traductor;
    const etiqueta = moduloPorCodigo(acceso.modulo ?? '')?.etiqueta;
    const modulo = etiqueta && tNav.has(etiqueta) ? tNav(etiqueta) : acceso.modulo ?? '';
    const clavePag = acceso.pagina ? `paginas.${clavePagina(acceso.pagina)}` : '';
    const pagina = clavePag && tNav.has(clavePag) ? tNav(clavePag) : acceso.pagina ?? '';
    const tipo = causa === 'paginaOculta' ? 'pagina' : causa === 'cargo' ? 'cargo' : causa === 'apagado' ? 'encender' : 'plan';

    const { error } = await ctx.supabase.rpc('fn_create_org_notification', {
      p_organization_id: ctx.organizationId,
      p_recipient_user_id: d.userId,
      p_channel: 'app',
      p_type: TIPO_AVISO[causa],
      p_title: t(`${tipo}.titulo`, { persona, modulo, pagina }),
      p_content: t(`${tipo}.contenido`, { persona, modulo, pagina }),
      p_metadata: {
        solicitante: ctx.userId,
        objeto,
        dia,
        causa,
        modulo: acceso.modulo,
        pagina: acceso.pagina,
        href: link,
        link,
      },
    });
    if (error) console.warn('[accesoModulo] no se creó el aviso', { mensaje: error.message });
    else notificados += 1;
  }
  if (notificados === 0) throw new Error('No se pudo avisar a nadie');
  return { notificados, repetida: false };
}

/**
 * Buscador global del administrador: opcionales que la organización no usa,
 * con su estado. Vacío para quien no puede encender módulos (misma regla que
 * `POST /api/modules`).
 */
export async function modulosNoUsados(ctx: Ctx): Promise<{ puedeEncender: boolean; plan: string | null; modulos: ModuloNoUsado[] }> {
  const puedeEncender = await hasOrgAdminOrPermission(ctx);
  if (!puedeEncender) return { puedeEncender, plan: null, modulos: [] };
  const db = ctx.supabase;
  const [modulos, activosLista, plan, planes] = await Promise.all([
    moduleManagementService.getAllModules(db),
    moduleManagementService.getActiveModules(ctx.organizationId, db),
    leerPlanActual(getServiceClient(), ctx.organizationId),
    db.from('plans').select('code, name, max_modules, price_cop_month, is_active, is_custom_enterprise, module_config'),
  ]);
  const ctxModulos: ContextoModulos = {
    modulos: modulos as ModuloBase[],
    activos: new Set(activosLista.map((m) => m.code)),
    plan,
    planes: (planes.data ?? []) as PlanModulos[],
  };
  const lista: ModuloNoUsado[] = [];
  for (const m of ctxModulos.modulos) {
    if (m.is_core || (m as { is_active?: boolean | null }).is_active === false) continue;
    const estado = causaDeEstado(estadoModulo(m, ctxModulos));
    const nav = moduloPorCodigo(m.code);
    if (!estado || !nav) continue;
    const paginas = nav.paginas.filter((p) => p.enMenu !== false).map((p) => p.href);
    lista.push({ codigo: m.code, estado, href: paginas[0] ?? nav.rutas[0], paginas });
  }
  return { puedeEncender, plan: plan?.name ?? null, modulos: lista };
}
