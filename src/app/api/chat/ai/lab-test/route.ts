import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import OpenAIService, { type OrganizationAIConfig } from '@/lib/services/openaiService';
import { consumeAICredits, checkAICredits, estimateCredits } from '@/lib/services/aiCreditsService';

/**
 * POST /api/chat/ai/lab-test
 *
 * Laboratorio de IA (`/app/chat/ia/laboratorio`). Esta ruta faltaba: el cliente
 * `aiLabService.runTest()` la invocaba y recibia un 404, con lo cual el
 * laboratorio estaba roto de fabrica.
 *
 * Seguridad (Fase 0): la organizacion sale SIEMPRE de la sesion. Si el body trae
 * `organizationId` y no coincide, se rechaza con 403.
 *
 * Creditos (Fase 0.2): se cobran AQUI, en el punto de generacion, una sola vez.
 * `aiLabService` ya no debe volver a cobrarlos.
 *
 * La version completa del laboratorio (prompt final por secciones, fragmentos con
 * score, comparacion A/B) llega en la Fase 5.5, sobre el nucleo compartido.
 */
export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  try {
    const organizationId = ctx.organizationId;
    const body = await request.json();
    const { query, settings, fragmentsContext } = body;

    if (body.organizationId !== undefined && Number(body.organizationId) !== organizationId) {
      return NextResponse.json(
        { error: 'organizationId no coincide con la organización activa' },
        { status: 403 }
      );
    }

    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: 'query es requerido' }, { status: 400 });
    }

    const creditos = await checkAICredits(organizationId);
    if (!creditos.allowed) {
      return NextResponse.json(
        { error: creditos.error || 'Créditos de IA insuficientes' },
        { status: 402 }
      );
    }

    const openaiService = new OpenAIService();

    const configLab: OrganizationAIConfig = {
      provider: settings?.provider ?? 'openai',
      model: settings?.model ?? 'gpt-4o-mini',
      temperature: settings?.temperature ?? 0.7,
      maxTokens: settings?.maxTokens ?? 500,
      systemRules: settings?.systemRules || null,
      tone: settings?.tone ?? 'professional',
      language: settings?.language ?? 'es',
      fallbackMessage: '',
      confidenceThreshold: 0.7,
      maxFragmentsContext: settings?.maxFragments ?? 5,
      isActive: true,
    };

    const systemPrompt = openaiService.buildSystemPromptFromConfig(configLab);

    // En el laboratorio el conocimiento va ANTES del mensaje, no sepultado al
    // final del prompt como hace hoy la Edge Function.
    const promptConConocimiento = fragmentsContext
      ? `${systemPrompt}\n\nCONOCIMIENTO DISPONIBLE (responde solo con base en esto; si no alcanza, dilo):\n${fragmentsContext}`
      : `${systemPrompt}\n\nNo hay fragmentos de conocimiento cargados: si no sabes algo, dilo en lugar de inventarlo.`;

    const resultado = await openaiService.generateResponse(
      [
        { role: 'system', content: promptConConocimiento },
        { role: 'user', content: query },
      ],
      {
        model: settings?.model,
        temperature: settings?.temperature,
        maxTokens: settings?.maxTokens,
      }
    );

    // Cobro unico, en el punto de generacion (Fase 0.2).
    const creditosEstimados = estimateCredits(resultado.usage.totalTokens);
    const cobrado = await consumeAICredits(organizationId, creditosEstimados);
    if (!cobrado) {
      console.warn('No se pudieron descontar créditos del laboratorio para la org', organizationId);
    }

    // Costo real contra provider_pricing. La tabla cableada que usaba el
    // laboratorio cobraba cualquier modelo desconocido a precio de gpt-4o-mini.
    let costUsd: number | null = null;
    const { data: costo } = await ctx.supabase.rpc('calcular_costo_llm', {
      p_model: resultado.model,
      p_tokens_entrada: resultado.usage.promptTokens,
      p_tokens_salida: resultado.usage.completionTokens,
    });
    if (costo !== null && costo !== undefined) costUsd = Number(costo);

    return NextResponse.json({
      response: resultado.content,
      model: resultado.model,
      usage: resultado.usage,
      costUsd,
      creditsConsumed: cobrado ? creditosEstimados : 0,
      // Sin RAG real todavia no hay score de similitud: la Fase 2 lo sustituye
      // por el score verdadero de search_knowledge_fragments.
      confidenceScore: fragmentsContext ? 0.8 : 0,
    });
  } catch (error: unknown) {
    console.error('Error en el laboratorio de IA:', error);
    const mensaje = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
