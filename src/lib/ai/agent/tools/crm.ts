/**
 * Ola 4: GO Assistant crea oportunidades por la misma puerta que el
 * formulario del CRM. Riesgo medium: el executor exige una propuesta
 * confirmada, vuelve a comprobar capacidades y toma la acción una sola vez.
 * La RPC valida cliente, embudo, etapa y responsable y crea el historial en
 * la misma transacción. El modelo nunca elige organización ni actor.
 */
import { formatMoney } from '@/lib/ai/assistant/orgCurrency';
import { oportunidadAltaSchema } from '@/lib/services/crm/opportunityWriteSchemas';
import type { ToolDefinition, ToolResult } from '../types';

const argumentos = oportunidadAltaSchema.pick({
  name: true,
  customer_id: true,
  amount: true,
  currency: true,
  expected_close_date: true,
  pipeline_id: true,
  stage_id: true,
  salesperson_id: true,
  temperature: true,
  next_action: true,
});

type ArgumentosOportunidad = NonNullable<ReturnType<typeof parsear>>;

function parsear(raw: unknown) {
  const resultado = argumentos.safeParse(raw);
  return resultado.success ? resultado.data : null;
}

async function resultadoError(error: unknown): Promise<ToolResult> {
  const { clasificarErrorCrm } = await import('@/lib/services/crm/crmRouteSupport');
  const conocido = clasificarErrorCrm(error);
  const mensajes: Record<number, string> = {
    400: 'Hay datos inválidos en la oportunidad. Revisa el resumen antes de proponerla otra vez.',
    403: 'Tu acceso actual no permite crear esta oportunidad.',
    404: 'Uno de los registros elegidos no existe en esta organización.',
    409: 'No pude crear la oportunidad con esos datos. Revisa el embudo y sus etapas antes de intentarlo de nuevo.',
  };
  return {
    ok: false,
    errorCode: conocido?.code ?? 'execution_error',
    message: conocido ? mensajes[conocido.status] ?? 'No pude crear la oportunidad.' : 'No pude crear la oportunidad. Revisa su estado antes de intentarlo otra vez.',
  };
}

export const crearOportunidadCrm: ToolDefinition<ArgumentosOportunidad> = {
  name: 'crear_oportunidad',
  description: 'Propone crear una oportunidad del CRM. Usa buscar_clientes para elegir el customer_id real y no inventes identificadores. Si no se indica embudo o etapa, el servicio elige el embudo de ventas por defecto y su primera etapa abierta. El importe es una previsión comercial, no una venta ni una factura. Antes de confirmar, presenta nombre, cliente y monto; si faltan datos, pregunta. La oportunidad nace abierta y usa la misma validación que el formulario del CRM.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Nombre de la oportunidad (1 a 255 caracteres).' },
      customer_id: { type: 'string', description: 'UUID real del cliente seleccionado mediante buscar_clientes. Omítelo si no hay cliente.' },
      amount: { type: 'number', description: 'Importe comercial previsto, sin importes negativos. Cero si aún no se conoce.' },
      currency: { type: 'string', description: 'Código ISO de tres letras. Por defecto, moneda base de la organización.' },
      expected_close_date: { type: 'string', description: 'Día de cierre esperado YYYY-MM-DD; no es un instante UTC.' },
      pipeline_id: { type: 'string', description: 'UUID de un embudo conocido de esta organización. Omítelo para usar el de ventas por defecto.' },
      stage_id: { type: 'string', description: 'UUID de una etapa abierta del embudo elegido. Omítelo para usar la primera etapa abierta.' },
      salesperson_id: { type: 'string', description: 'UUID real del responsable de esta organización. Por defecto, el usuario que confirma.' },
      temperature: { type: 'string', enum: ['cold', 'warm', 'hot'] },
      next_action: { type: 'string', description: 'Próximo paso comercial acordado (máximo 500 caracteres).' },
    },
    required: ['name'],
    additionalProperties: false,
  },
  risk: 'medium',
  permissions: ['crm.opportunities.create'],
  minLevel: 'write_low',
  requiredModule: 'crm',
  availableInVoice: false,
  parseArgs: parsear,

  async preview(ctx, args) {
    const monto = formatMoney(args.amount ?? 0, args.currency ?? ctx.currency);
    return {
      title: 'Crear oportunidad',
      summary: `Crear la oportunidad «${args.name}» por ${monto}.`,
      lines: [
        { label: 'Nombre', value: args.name },
        { label: 'Cliente', value: args.customer_id ?? 'Sin cliente vinculado' },
        { label: 'Monto previsto', value: monto },
        { label: 'Embudo', value: args.pipeline_id ?? 'Ventas por defecto' },
        { label: 'Etapa', value: args.stage_id ?? 'Primera etapa abierta' },
        { label: 'Responsable', value: args.salesperson_id ?? ctx.userId },
        ...(args.expected_close_date ? [{ label: 'Cierre esperado', value: args.expected_close_date }] : []),
        ...(args.temperature ? [{ label: 'Temperatura', value: ({ cold: 'Fría', warm: 'Tibia', hot: 'Caliente' })[args.temperature] }] : []),
        ...(args.next_action ? [{ label: 'Próximo paso', value: args.next_action }] : []),
      ],
      warnings: [],
      estimatedCredits: 1,
      // Se puede gestionar desde el CRM, pero no hay deshacer automático del asistente.
      reversible: false,
    };
  },

  async execute(ctx, args) {
    try {
      const { crearOportunidad } = await import('@/lib/services/crm/opportunityWriteService');
      const oportunidad = await crearOportunidad(ctx, {
        ...args,
        amount: args.amount ?? 0,
        currency: args.currency ?? ctx.currency,
        salesperson_id: args.salesperson_id ?? ctx.userId,
        origen: 'general',
        source: 'go_assistant',
      });
      const id = oportunidad?.id;
      if (typeof id !== 'string' || !id) return resultadoError(null);
      return {
        ok: true,
        message: `Oportunidad «${args.name}» creada.`,
        entity: { type: 'opportunity', id, url: `/app/crm/oportunidades/${encodeURIComponent(id)}` },
        data: oportunidad,
      };
    } catch (error) {
      return resultadoError(error);
    }
  },
};

export const CRM_TOOLS = [crearOportunidadCrm];
