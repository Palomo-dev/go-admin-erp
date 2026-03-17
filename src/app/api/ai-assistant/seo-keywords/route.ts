import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { consumeAICredits } from '@/lib/services/aiCreditsService';

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY environment variable');
  }
  return new OpenAI({ apiKey });
}

export async function POST(request: NextRequest) {
  try {
    const {
      organizationId,
      organizationName,
      description,
      city,
      country,
      services,
      businessType,
      currentKeywords,
    } = await request.json();

    if (!organizationName) {
      return NextResponse.json(
        { error: 'Nombre de la organización es requerido' },
        { status: 400 }
      );
    }

    const prompt = `Genera una lista de 12 palabras clave SEO relevantes para el siguiente negocio.

Nombre del negocio: ${organizationName}
${description ? `Descripción: ${description}` : ''}
${businessType ? `Tipo de negocio: ${businessType}` : ''}
${city ? `Ciudad: ${city}` : ''}
${country ? `País: ${country}` : ''}
${services ? `Servicios/funcionalidades: ${services}` : ''}
${currentKeywords?.length ? `Keywords actuales (no repetir): ${currentKeywords.join(', ')}` : ''}

Requisitos:
- Exactamente 12 palabras clave
- Mezcla de keywords cortas (1-2 palabras) y long-tail (3-4 palabras)
- Relevantes para SEO local si hay ciudad/país
- En español
- Sin numeración ni viñetas
- Separadas por comas
- No repetir las keywords actuales del negocio

Responde SOLO con las 12 keywords separadas por comas, sin explicaciones.`;

    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 200,
    });

    const rawText = response.choices[0]?.message?.content?.trim() || '';
    const keywords = rawText
      .split(',')
      .map((k: string) => k.trim().toLowerCase())
      .filter((k: string) => k.length > 0 && k.length < 60);

    // Descontar 1 crédito de IA
    if (organizationId) {
      const creditsConsumed = await consumeAICredits(organizationId, 1);
      if (!creditsConsumed) {
        console.warn('⚠️ No se pudieron descontar créditos de IA para org:', organizationId);
      }
    }

    return NextResponse.json({ keywords });
  } catch (error: any) {
    console.error('Error generando keywords SEO:', error);
    return NextResponse.json(
      { error: error.message || 'Error generando keywords' },
      { status: 500 }
    );
  }
}
