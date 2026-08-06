// ============================================================
// reportAgentService — Agente IA para reportes en lenguaje natural
// Montado sobre el patrón de aiAssistantService + aiCreditsService
// ============================================================

import OpenAI from 'openai';
import { checkAICredits, estimateCredits, consumeAICredits } from '../aiCreditsService';
import { getReportesVisibles, getReporteById } from './reportesCatalogo';
import { ejecutarReporte } from './reportesEngine';
import { resolverPeriodo } from './periodosService';
import type { PeriodoCierre, TipoCierre, ReportData } from './types';

// ---- Tipos ----

export interface ReportAgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  reportData?: ReportData;
}

export interface ReportAgentContext {
  organizationId: number;
  organizationName?: string;
  userName: string;
  userRole: string;
}

export interface ReportAgentResponse {
  content: string;
  reportData?: ReportData;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

interface ReportBlock {
  reportId: string;
  periodo?: { tipo: TipoCierre };
  filtros?: Record<string, unknown>;
}

// ---- Cliente OpenAI (lazy singleton) ----

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing OPENAI_API_KEY environment variable');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// ---- System prompt builder ----

function buildSystemPrompt(
  context: ReportAgentContext,
  modulosActivos: string[],
  periodoActual: PeriodoCierre,
): string {
  const modulos = getReportesVisibles(modulosActivos);

  const catalogoTexto = modulos
    .map((m) => {
      const lista = m.reportes
        .map((r) => `  - ${r.id}: ${r.titulo} — ${r.descripcion}`)
        .join('\n');
      return `### ${m.nombre}\n${lista}`;
    })
    .join('\n\n');

  return `Eres GO Report Agent, el asistente IA especializado en reportes de GO Admin ERP.
Respondes siempre en español. Eres conciso, analítico y profesional.

## Contexto del Usuario
- Usuario: ${context.userName}
- Rol: ${context.userRole}
- Organización: ${context.organizationName || 'N/A'}
- Período actual: ${periodoActual.etiqueta} (${periodoActual.fechaInicio} a ${periodoActual.fechaFin})

## Catálogo de Reportes Disponibles
Solo puedes ejecutar reportes de esta lista (whitelist estricta):

${catalogoTexto}

## Cómo responder
1. Cuando el usuario pida un reporte, identifica el reportId más adecuado del catálogo.
2. Si el usuario menciona un período ("la semana pasada", "el trimestre"), inclúyelo en el bloque.
3. Si no hay un reporte exacto, sugiere el más cercano y explica brevemente.
4. NUNCA inventes reportId que no estén en el catálogo.
5. Si el usuario pide algo que no es un reporte, explícale qué reportes tiene disponibles.

## Formato de respuesta
Cuando ejecutes un reporte, incluye al FINAL de tu mensaje un bloque:

\`\`\`report
{ "reportId": "cierre-caja", "periodo": { "tipo": "diario" } }
\`\`\`

El bloque \`report\` debe contener:
- reportId (string, obligatorio): ID del catálogo
- periodo (objeto, opcional): { "tipo": "diario" | "semanal" | "quincenal" | "mensual" | "trimestral" | "semestral" | "anual" }
- filtros (objeto, opcional): filtros adicionales en lenguaje estructurado

## Restricciones
- No puedes ejecutar SQL libre.
- No puedes acceder a reportes de módulos inactivos.
- No puedes acceder a datos de otras organizaciones.
- Si el usuario pide algo fuera de alcance, sugiere usar los reportes directos en /app/reportes.`;
}

// ---- Parser del bloque ```report ----

function parseReportBlock(rawContent: string): { content: string; block: ReportBlock | null } {
  const regex = /```report\s*([\s\S]*?)```/;
  const match = rawContent.match(regex);

  if (!match) {
    return { content: rawContent, block: null };
  }

  try {
    const block = JSON.parse(match[1].trim()) as ReportBlock;
    const content = rawContent.replace(regex, '').trim();
    return { content, block };
  } catch {
    return { content: rawContent, block: null };
  }
}

// ---- Servicio ----

class ReportAgentService {
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor() {
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.temperature = 0.2;
    this.maxTokens = 800;
  }

  async sendMessage(
    message: string,
    conversationHistory: ReportAgentMessage[],
    context: ReportAgentContext,
    periodoActual: PeriodoCierre,
    modulosActivos: string[],
  ): Promise<ReportAgentResponse> {
    // 1. Verificar créditos
    const creditsCheck = await checkAICredits(context.organizationId);
    if (!creditsCheck.allowed) {
      return {
        content: `⚠️ ${creditsCheck.error || 'Créditos de IA insuficientes. Puedes usar los reportes directos en la página.'}`,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }

    // 2. Construir prompt
    const systemPrompt = buildSystemPrompt(context, modulosActivos, periodoActual);

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user', content: message },
    ];

    // 3. Llamar a OpenAI
    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: this.model,
      messages,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    });

    const rawContent =
      response.choices[0]?.message?.content ||
      'Lo siento, no pude procesar tu solicitud.';

    const usage = response.usage;

    // 4. Consumir créditos
    const estimatedCredits = estimateCredits(usage?.total_tokens || 0);
    await consumeAICredits(context.organizationId, estimatedCredits);

    // 5. Parsear bloque ```report
    const { content, block } = parseReportBlock(rawContent);

    // 6. Ejecutar reporte si hay bloque válido
    let reportData: ReportData | undefined;

    if (block) {
      // Whitelist: validar reportId contra catálogo de módulos activos
      const modulosVisibles = getReportesVisibles(modulosActivos);
      const todosIds = modulosVisibles.flatMap((m) => m.reportes.map((r) => r.id));
      const reporteDef = getReporteById(block.reportId);

      if (!reporteDef || !todosIds.includes(block.reportId)) {
        return {
          content: `${content}\n\n⚠️ El reporte solicitado no está disponible en tus módulos activos. Revisa el catálogo en /app/reportes.`,
          usage: {
            promptTokens: usage?.prompt_tokens || 0,
            completionTokens: usage?.completion_tokens || 0,
            totalTokens: usage?.total_tokens || 0,
          },
        };
      }

      // Resolver período
      let periodo = periodoActual;
      if (block.periodo?.tipo && block.periodo.tipo !== periodoActual.tipo) {
        try {
          periodo = resolverPeriodo(block.periodo.tipo);
        } catch {
          // si falla, usar el período actual
        }
      }

      // Ejecutar reporte
      try {
        reportData = await ejecutarReporte(block.reportId, context.organizationId, periodo);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Error desconocido';
        return {
          content: `${content}\n\n⚠️ No pude ejecutar el reporte "${reporteDef.titulo}": ${errMsg}`,
          usage: {
            promptTokens: usage?.prompt_tokens || 0,
            completionTokens: usage?.completion_tokens || 0,
            totalTokens: usage?.total_tokens || 0,
          },
        };
      }
    }

    return {
      content,
      reportData,
      usage: {
        promptTokens: usage?.prompt_tokens || 0,
        completionTokens: usage?.completion_tokens || 0,
        totalTokens: usage?.total_tokens || 0,
      },
    };
  }

  getQuickSuggestions(): string[] {
    return [
      'Cierre de caja de hoy',
      'CxC vencidas del mes',
      'Top productos más vendidos',
      'Resumen de ventas del período',
      'Stock crítico de inventario',
    ];
  }
}

export const reportAgentService = new ReportAgentService();
export default ReportAgentService;
