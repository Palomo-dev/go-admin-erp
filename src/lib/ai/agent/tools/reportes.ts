/**
 * GO Asistente — reportes del catálogo (Figma Reportes §22: «Preguntar a GO
 * Asistente desde un reporte»).
 *
 * Sustituyen al chat de reportes aparte (`/api/ai-assistant/reportes` +
 * `ReportesChatSheet`, retirados): un solo asistente, un solo punto de cobro
 * (`chargeAiCredits` en `runAgent`) y el mismo motor de reportes que pinta el
 * visor. No hay una segunda implementación: la ejecución es
 * `ejecutarReporte` (`reportesEngine`), la lista blanca es
 * `getReportesPermitidos` (`reportesCatalogo`) y el periodo sale de
 * `periodosService`.
 *
 * Lo que garantizan, igual que la ruta que reemplazan:
 * - La organización es la de la sesión (`ctx.organizationId`), nunca un
 *   argumento. El reporte corre con el cliente de SESIÓN (`ctx.supabase`): las
 *   `fn_reporte_*` exigen `auth.uid()` miembro de la organización.
 * - La lista blanca sale de los módulos activos que resolvió el servidor
 *   (`caps.activeModules`): ni el modelo ni la página la amplían.
 * - La sucursal que pida el modelo (o la que traiga la página) se valida
 *   contra el alcance de la sesión (`exigirSucursalPermitida`); el consolidado
 *   exige acceso a todas. Sin alcance resuelto, fallan cerradas.
 *
 * Riesgo `low`: solo leen. El catálogo y el motor se cargan al ejecutar, no al
 * registrar: el registro de herramientas se importa en cada ruta del asistente
 * y no necesita arrastrar los ~20 módulos de reportes.
 */

import { OrgContextError } from '@/lib/utils/orgContextError';
import { exigirSucursalPermitida, type AlcanceSucursal } from '@/lib/security/alcanceSucursal';
import { esFechaPlana, esHora, normalizarPeriodo, periodoAnterior, resolverPeriodo, TIPOS_CIERRE } from '@/lib/services/reportes/periodosService';
import type { PeriodoCierre, ReportData, ReportDefinition, TipoCierre } from '@/lib/services/reportes/types';
import { todayInTz } from '@/lib/utils/dateDisplay';
import { armarTarjetaReporte } from '@/lib/ai/assistant/tarjetaReporte';
import type { ToolContext, ToolDefinition, ToolPreview, ToolResult } from '../types';
import type { ReporteAbierto } from '../systemPrompt';

const READ_PREVIEW: ToolPreview = {
  title: 'Consulta de reportes',
  summary: 'Consulta de solo lectura.',
  lines: [],
  warnings: [],
  estimatedCredits: 0,
  reversible: true,
};

/** Filas del reporte que se le pasan al modelo: suficientes para razonar, acotadas en tokens. */
export const MAX_FILAS_MODELO = 40;

const RE_ID = /^[\w-]{1,80}$/;

const corto = (v: unknown, max = 80) => (typeof v === 'string' ? v.slice(0, max) : v);

async function catalogo() {
  return import('@/lib/services/reportes/reportesCatalogo');
}

/** Alcance de la sesión, o `null` si no se pudo resolver (se falla cerrado). */
async function alcanceDe(ctx: ToolContext): Promise<AlcanceSucursal | null> {
  if (!ctx.alcanceSucursal) return null;
  try {
    return await ctx.alcanceSucursal();
  } catch (err) {
    console.warn('[GO Asistente] No se pudo resolver el alcance de sucursal:', err instanceof Error ? err.message : err);
    return null;
  }
}

const SIN_ALCANCE: ToolResult = {
  ok: false,
  errorCode: 'BRANCH_SCOPE_UNAVAILABLE',
  message: 'No pude comprobar a qué sucursales tienes acceso, así que no ejecuté el reporte. Ábrelo desde Reportes.',
};

// ---------------------------------------------------------------------------
// listar_reportes
// ---------------------------------------------------------------------------

interface ListarArgs {
  grupo?: string;
}

export const listarReportes: ToolDefinition<ListarArgs> = {
  name: 'listar_reportes',
  description:
    'Lista los reportes que esta persona puede consultar (según el plan de la organización y su acceso a sucursales), con su id. Úsala cuando no sepas qué reporte responde la pregunta; nunca inventes un id de reporte.',
  parameters: {
    type: 'object',
    properties: {
      grupo: {
        type: 'string',
        description: 'Opcional: solo los de un grupo (ventas, inventario, finanzas, contabilidad, compras, clientes, personas…). Con grupo se incluye la descripción.',
      },
    },
    additionalProperties: false,
  },
  risk: 'low',
  permissions: [],
  minLevel: 'read',
  requiredModule: null,
  availableInVoice: false,

  parseArgs(raw: unknown): ListarArgs | null {
    if (raw === undefined || raw === null) return {};
    if (typeof raw !== 'object' || Array.isArray(raw)) return null;
    const grupo = (raw as Record<string, unknown>).grupo;
    return typeof grupo === 'string' && RE_ID.test(grupo.trim()) ? { grupo: grupo.trim().toLowerCase() } : {};
  },

  async preview(): Promise<ToolPreview> {
    return READ_PREVIEW;
  },

  async execute(ctx: ToolContext, args: ListarArgs): Promise<ToolResult> {
    const alcance = await alcanceDe(ctx);
    if (!alcance) return SIN_ALCANCE;
    const { getReportesPermitidos } = await catalogo();
    const reportes = getReportesPermitidos(Array.from(ctx.capabilities.activeModules), alcance.accesoTotal)
      .flatMap((m) => m.reportes)
      .filter((r) => !r.alias && (!args.grupo || r.grupo === args.grupo));
    return {
      ok: true,
      message: `${reportes.length} reportes disponibles`,
      data: reportes.map((r) => ({
        id: r.id,
        titulo: r.titulo,
        grupo: r.grupo,
        ...(args.grupo ? { descripcion: corto(r.descripcion, 160) } : {}),
        periodos: r.periodosSugeridos,
        compara_con_anterior: r.filtros.includes('comparativo'),
        por_sucursal: r.alcance === 'sucursal',
      })),
    };
  },
};

// ---------------------------------------------------------------------------
// consultar_reporte
// ---------------------------------------------------------------------------

export interface ConsultarArgs {
  reporteId: string;
  tipoPeriodo?: TipoCierre;
  fechaInicio?: string;
  fechaFin?: string;
  horaInicio?: string;
  horaFin?: string;
  sucursalId?: number;
  consolidado?: boolean;
  vista?: string;
  compararConAnterior?: boolean;
}

/**
 * Sucursal con la que se ejecuta. Los reportes de toda la organización no se
 * dividen por sucursal. Sin indicación: el consolidado con acceso total; si la
 * persona solo tiene una sucursal, esa; si tiene varias (sin todas), se le
 * pregunta en vez de elegir por ella.
 */
export function sucursalPedida(def: Pick<ReportDefinition, 'alcance'>, args: Pick<ConsultarArgs, 'sucursalId' | 'consolidado'>, alcance: AlcanceSucursal): number | null | 'preguntar' {
  if (def.alcance === 'organizacion') return null;
  if (args.consolidado) return null;
  if (args.sucursalId !== undefined) return args.sucursalId;
  if (alcance.accesoTotal) return null;
  return alcance.permitidas.length === 1 ? alcance.permitidas[0] : 'preguntar';
}

/** Periodo pedido, validado; las horas solo si el reporte admite franja. */
export function periodoPedido(def: Pick<ReportDefinition, 'filtros'>, args: ConsultarArgs, hoy: string): PeriodoCierre | null {
  let periodo: PeriodoCierre | null;
  if (args.fechaInicio && args.fechaFin) {
    periodo = normalizarPeriodo({
      tipo: args.tipoPeriodo ?? 'personalizado',
      fechaInicio: args.fechaInicio,
      fechaFin: args.fechaFin,
      horaInicio: args.horaInicio,
      horaFin: args.horaFin,
    });
  } else {
    periodo = resolverPeriodo(args.tipoPeriodo ?? 'mensual', hoy);
  }
  if (!periodo) return null;
  return def.filtros.includes('franja') ? periodo : { ...periodo, horaInicio: null, horaFin: null };
}

/** Lo que se le pasa al modelo: cifras reales, acotadas. */
function resumenParaModelo(data: ReportData, vista: string | null) {
  const v = vista ? data.vistas?.find((x) => x.id === vista) : null;
  const columnas = v?.columnas ?? data.columnas;
  const filas = v?.filas ?? data.filas;
  return {
    kpis: data.kpis.map((k) => ({ titulo: k.titulo, valor: k.valor, formato: k.formato ?? null })),
    vista: v ? { id: v.id, titulo: v.titulo } : null,
    vistas_disponibles: (data.vistas ?? []).map((x) => ({ id: x.id, titulo: x.titulo })),
    columnas: columnas.map((c) => ({ key: c.key, titulo: c.titulo, tipo: c.tipo })),
    filas: filas.slice(0, MAX_FILAS_MODELO).map((f) => Object.fromEntries(Object.entries(f).map(([k, val]) => [k, corto(val)]))),
    total_filas: filas.length,
    filas_omitidas: Math.max(0, filas.length - MAX_FILAS_MODELO),
    totales: v ? (v.totales ?? null) : (data.totales ?? null),
    lectura: (data.lectura ?? []).map((l) => corto(l.texto, 200)),
  };
}

export const consultarReporte: ToolDefinition<ConsultarArgs> = {
  name: 'consultar_reporte',
  description:
    'Ejecuta un reporte del catálogo con un periodo y una sucursal, y devuelve sus cifras reales (indicadores, columnas, filas y totales). ' +
    'Si el usuario está viendo un reporte (REPORTE ABIERTO en el contexto), úsala con ese id, ese periodo, esa sucursal y esa vista, salvo que pida otra cosa. ' +
    'Para comparar con el periodo anterior usa compara_con_anterior. Responde solo con lo que devuelva: nunca inventes cifras.',
  parameters: {
    type: 'object',
    properties: {
      reporte_id: { type: 'string', description: 'Id del reporte (de REPORTE ABIERTO o de listar_reportes).' },
      tipo_periodo: { type: 'string', enum: [...TIPOS_CIERRE], description: 'Tipo de periodo. Sin fechas, se usa el periodo de ese tipo que contiene hoy.' },
      fecha_inicio: { type: 'string', description: 'Primer día, YYYY-MM-DD (incluido).' },
      fecha_fin: { type: 'string', description: 'Último día, YYYY-MM-DD (incluido).' },
      hora_inicio: { type: 'string', description: 'Franja horaria opcional, HH:mm.' },
      hora_fin: { type: 'string', description: 'Franja horaria opcional, HH:mm.' },
      sucursal_id: { type: 'integer', description: 'Sucursal (id). Omítela si es el consolidado.' },
      consolidado: { type: 'boolean', description: 'true para todas las sucursales (exige acceso a todas).' },
      vista: { type: 'string', description: 'Vista del reporte (pestaña del visor), si la hay.' },
      compara_con_anterior: { type: 'boolean', description: 'Ejecuta también el periodo anterior del mismo tipo para comparar.' },
    },
    required: ['reporte_id'],
    additionalProperties: false,
  },
  risk: 'low',
  permissions: [],
  minLevel: 'read',
  // Cada reporte tiene su módulo: se comprueba contra la lista blanca al ejecutar.
  requiredModule: null,
  availableInVoice: false,

  parseArgs(raw: unknown): ConsultarArgs | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const reporteId = typeof o.reporte_id === 'string' ? o.reporte_id.trim() : '';
    if (!RE_ID.test(reporteId)) return null;
    const args: ConsultarArgs = { reporteId };
    if (typeof o.tipo_periodo === 'string' && (TIPOS_CIERRE as readonly string[]).includes(o.tipo_periodo)) args.tipoPeriodo = o.tipo_periodo as TipoCierre;
    if (esFechaPlana(o.fecha_inicio) && esFechaPlana(o.fecha_fin)) {
      args.fechaInicio = o.fecha_inicio;
      args.fechaFin = o.fecha_fin;
    }
    if (esHora(o.hora_inicio) && esHora(o.hora_fin)) {
      args.horaInicio = o.hora_inicio;
      args.horaFin = o.hora_fin;
    }
    const sucursal = typeof o.sucursal_id === 'string' ? Number(o.sucursal_id) : o.sucursal_id;
    if (typeof sucursal === 'number' && Number.isSafeInteger(sucursal) && sucursal > 0) args.sucursalId = sucursal;
    if (o.consolidado === true) args.consolidado = true;
    if (typeof o.vista === 'string' && RE_ID.test(o.vista)) args.vista = o.vista;
    if (o.compara_con_anterior === true) args.compararConAnterior = true;
    return args;
  },

  async preview(): Promise<ToolPreview> {
    return READ_PREVIEW;
  },

  async execute(ctx: ToolContext, args: ConsultarArgs): Promise<ToolResult> {
    const alcance = await alcanceDe(ctx);
    if (!alcance) return SIN_ALCANCE;

    // Lista blanca: módulos del plan resueltos en el servidor × alcance de sucursal.
    const { getReporteById, getReportesPermitidos } = await catalogo();
    const def = getReporteById(args.reporteId);
    const permitidos = new Set(
      getReportesPermitidos(Array.from(ctx.capabilities.activeModules), alcance.accesoTotal).flatMap((m) => m.reportes.map((r) => r.id))
    );
    if (!def || !permitidos.has(def.id)) {
      const motivo = def && def.alcance === 'organizacion' && !alcance.accesoTotal
        ? 'requiere acceso a todas las sucursales'
        : 'no está disponible en el plan de tu organización';
      return { ok: false, errorCode: 'REPORT_NOT_AVAILABLE', message: `Ese reporte ${motivo}. Usa listar_reportes para ver los disponibles.` };
    }

    const sucursal = sucursalPedida(def, args, alcance);
    if (sucursal === 'preguntar') {
      return {
        ok: false,
        errorCode: 'BRANCH_REQUIRED',
        message: 'Tienes acceso a varias sucursales pero no a todas: pregunta de cuál quiere el reporte.',
        data: { sucursales_permitidas: alcance.permitidas },
      };
    }
    try {
      exigirSucursalPermitida(alcance, sucursal);
    } catch (err) {
      if (err instanceof OrgContextError) {
        console.warn('[GO Asistente] consultar_reporte: sucursal fuera del alcance de la sesión', {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          sucursal,
          code: err.code,
        });
        return { ok: false, errorCode: err.code, message: `${err.message}. No ejecuté el reporte.` };
      }
      throw err;
    }

    const { getOrganizationTimezone } = await import('@/lib/services/organizationTimezoneService');
    const zona = await getOrganizationTimezone(ctx.organizationId, ctx.supabase).catch(() => undefined);
    const periodo = periodoPedido(def, args, todayInTz(zona));
    if (!periodo) return { ok: false, errorCode: 'INVALID_PERIOD', message: 'El periodo no es válido: revisa las fechas.' };

    const { ejecutarReporte } = await import('@/lib/services/reportes/reportesEngine');
    let data: ReportData;
    try {
      data = await ejecutarReporte(def.id, ctx.organizationId, periodo, sucursal, ctx.supabase);
    } catch (err) {
      console.warn('[GO Asistente] consultar_reporte falló:', def.id, err instanceof Error ? err.message : err);
      return { ok: false, errorCode: 'REPORT_ERROR', message: `No pude ejecutar el reporte «${def.titulo}». Inténtalo otra vez o ábrelo desde Reportes.` };
    }

    let anterior: ReportData | null = null;
    let periodoPrevio: PeriodoCierre | null = null;
    if (args.compararConAnterior && def.filtros.includes('comparativo')) {
      periodoPrevio = periodoAnterior(periodo);
      anterior = await ejecutarReporte(def.id, ctx.organizationId, periodoPrevio, sucursal, ctx.supabase).catch(() => null);
    }

    const vista = args.vista && data.vistas?.some((v) => v.id === args.vista) ? args.vista : null;
    const fuente = vista ? data.vistas!.find((v) => v.id === vista)! : data;
    const tarjeta = fuente.columnas.length > 0
      ? armarTarjetaReporte(fuente, {
          reporteId: def.id,
          grupo: def.grupo,
          titulo: def.titulo,
          periodo: {
            tipo: periodo.tipo,
            fechaInicio: periodo.fechaInicio,
            fechaFin: periodo.fechaFin,
            horaInicio: periodo.horaInicio ?? null,
            horaFin: periodo.horaFin ?? null,
            etiqueta: periodo.etiqueta,
          },
          sucursalId: sucursal,
          vista,
        })
      : undefined;

    return {
      ok: true,
      message: `${def.titulo} · ${periodo.etiqueta}: ${fuente.filas.length} filas`,
      data: {
        reporte: { id: def.id, titulo: def.titulo },
        periodo: { desde: periodo.fechaInicio, hasta: periodo.fechaFin, etiqueta: periodo.etiqueta, hora_inicio: periodo.horaInicio ?? null, hora_fin: periodo.horaFin ?? null },
        sucursal_id: sucursal,
        ...resumenParaModelo(data, vista),
        ...(args.compararConAnterior
          ? {
              anterior: anterior && periodoPrevio
                ? { periodo: { desde: periodoPrevio.fechaInicio, hasta: periodoPrevio.fechaFin, etiqueta: periodoPrevio.etiqueta }, ...resumenParaModelo(anterior, vista) }
                : { no_disponible: def.filtros.includes('comparativo') ? 'No se pudo ejecutar el periodo anterior.' : 'Este reporte no se compara por periodo.' },
            }
          : {}),
      },
      tarjetaReporte: tarjeta,
    };
  },
};

export const REPORTES_TOOLS = [listarReportes, consultarReporte];

/**
 * Lee el reporte abierto que manda el panel (`context.reporte`) sin fiarse de
 * él: solo ids del catálogo, un periodo válido (la etiqueta se recalcula) y
 * una sucursal numérica. El título sale del catálogo, no del cliente. No
 * concede nada: `consultar_reporte` vuelve a validar módulo y sucursal.
 * `null` si no hay contexto o no es válido.
 */
export async function leerReporteAbierto(valor: unknown): Promise<ReporteAbierto | null> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const v = valor as Record<string, unknown>;
  const p = v.periodo as Record<string, unknown> | null | undefined;
  const periodo = normalizarPeriodo(p);
  if (!periodo) return null;
  const sucursalId = v.sucursalId === null ? null : typeof v.sucursalId === 'number' && Number.isSafeInteger(v.sucursalId) && v.sucursalId > 0 ? v.sucursalId : undefined;
  if (sucursalId === undefined) return null;
  let id: string | null = null;
  let titulo: string | null = null;
  if (typeof v.reporteId === 'string' && RE_ID.test(v.reporteId)) {
    const def = (await catalogo()).getReporteById(v.reporteId);
    if (def) {
      id = def.id;
      titulo = def.titulo;
    }
  }
  return {
    id,
    titulo,
    tipoPeriodo: periodo.tipo,
    fechaInicio: periodo.fechaInicio,
    fechaFin: periodo.fechaFin,
    horaInicio: periodo.horaInicio ?? null,
    horaFin: periodo.horaFin ?? null,
    sucursalId,
    vista: typeof v.vista === 'string' && RE_ID.test(v.vista) ? v.vista : null,
  };
}
