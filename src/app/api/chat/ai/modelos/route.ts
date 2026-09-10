import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { listProviderConfigsSafe } from '@/lib/services/providerCredentials.server';

/**
 * GET /api/chat/ai/modelos
 *
 * Catálogo de modelos para el selector de `/crm/ia`.
 *
 * Sustituye a la constante `AI_PROVIDERS`, que estaba cableada en el cliente con
 * modelos obsoletos (gpt-4-turbo, o1, claude-3-*, gemini-pro) y desalineada con
 * `providerRegistry.ts`. Ahora sale de `ai_modelos_disponibles`, que une el
 * catálogo con la tarifa vigente de `provider_pricing`.
 *
 * Además dice si la organización PUEDE usar cada proveedor. Antes se podía
 * elegir Anthropic o Google y no pasaba nada: la Edge Function llamaba a OpenAI
 * igual. Un selector que ofrece algo que no funciona es peor que uno corto.
 */
export const dynamic = 'force-dynamic';

interface ModeloFila {
  provider: string;
  model: string;
  label: string;
  gama: 'economico' | 'equilibrado' | 'premium' | 'legacy';
  recomendado: boolean;
  contexto_tokens: number | null;
  soporta_vision: boolean | null;
  nota: string | null;
  costo_entrada_usd_millon: string | null;
  costo_salida_usd_millon: string | null;
  tarifa_cargada: boolean;
}

export async function GET(request: NextRequest) {
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
    const { data, error } = await ctx.supabase
      .from('ai_modelos_disponibles')
      .select('*');

    if (error) {
      console.error('Error leyendo el catálogo de modelos:', error.message);
      return NextResponse.json({ error: 'No se pudo leer el catálogo de modelos' }, { status: 500 });
    }

    const modelos = (data || []) as ModeloFila[];

    // ¿Qué proveedores de LLM tiene configurados esta organización?
    let configurados: Record<string, { configurado: boolean; disponibleEnPlataforma: boolean }> = {};
    try {
      const configs = await listProviderConfigsSafe(ctx.organizationId, 'llm');
      configurados = Object.fromEntries(
        configs.map((c) => [
          c.provider,
          { configurado: c.configured, disponibleEnPlataforma: c.platform_available },
        ])
      );
    } catch (e) {
      // Si falla la consulta de credenciales no se rompe el selector: se asume
      // que solo OpenAI está disponible, que es el estado real hoy.
      console.error('No se pudieron leer las credenciales de proveedores:', e);
    }

    const proveedores = [...new Set(modelos.map((m) => m.provider))].map((provider) => {
      const estado = configurados[provider];
      const usable = estado ? estado.configurado || estado.disponibleEnPlataforma : provider === 'openai';
      return {
        value: provider,
        label: provider === 'openai' ? 'OpenAI' : provider === 'google' ? 'Google AI' : provider,
        usable,
        motivo: usable
          ? null
          : `Sin credenciales de ${provider}. Configúralas en Integraciones para poder elegir sus modelos.`,
      };
    });

    return NextResponse.json({
      proveedores,
      modelos: modelos.map((m) => ({
        provider: m.provider,
        value: m.model,
        label: m.label,
        gama: m.gama,
        recomendado: m.recomendado,
        contextoTokens: m.contexto_tokens,
        soportaVision: m.soporta_vision,
        nota: m.nota,
        // Precio por millón de tokens, tal como está en provider_pricing.
        costoEntradaUsdMillon: m.costo_entrada_usd_millon ? Number(m.costo_entrada_usd_millon) : null,
        costoSalidaUsdMillon: m.costo_salida_usd_millon ? Number(m.costo_salida_usd_millon) : null,
        tarifaCargada: m.tarifa_cargada,
      })),
    });
  } catch (error: unknown) {
    console.error('Error en el catálogo de modelos:', error);
    const mensaje = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
