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
    const { productName, currentDescription, type, organizationId, spaceType, zone, services } = await request.json();

    if (!productName) {
      return NextResponse.json(
        { error: 'Nombre del producto es requerido' },
        { status: 400 }
      );
    }

    let prompt = '';
    
    if (type === 'space_description') {
      prompt = `Genera una descripción profesional y atractiva para un espacio/habitación de un hotel o establecimiento de hospedaje.

Nombre del espacio: ${productName}
${spaceType ? `Tipo: ${spaceType}` : ''}
${zone ? `Ubicación/Zona: ${zone}` : ''}
${services ? `Servicios incluidos: ${services}` : ''}
${currentDescription ? `Descripción actual: ${currentDescription}` : ''}

Requisitos:
- Máximo 120 palabras
- Destaca comodidades y experiencia del huésped
- Lenguaje cálido, profesional e invitante
- En español
- Sin emojis
- Menciona los servicios si fueron proporcionados

Responde SOLO con la descripción, sin explicaciones adicionales.`;
    } else if (type === 'product_description') {
      prompt = `Genera una descripción profesional y atractiva para un producto de e-commerce/inventario.

Nombre del producto: ${productName}
${currentDescription ? `Descripción actual: ${currentDescription}` : ''}

Requisitos:
- Máximo 150 palabras
- Destaca beneficios y características principales
- Usa lenguaje persuasivo pero profesional
- En español
- Sin emojis

Responde SOLO con la descripción mejorada, sin explicaciones adicionales.`;
    }

    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 300,
    });

    const improvedText = response.choices[0]?.message?.content?.trim() || '';

    // Descontar créditos de IA (1 crédito por mejora de texto)
    if (organizationId) {
      const creditsConsumed = await consumeAICredits(organizationId, 1);
      if (!creditsConsumed) {
        console.warn('⚠️ No se pudieron descontar créditos de IA para org:', organizationId);
      }
    }

    return NextResponse.json({ improvedText });
  } catch (error: any) {
    console.error('Error mejorando texto:', error);
    return NextResponse.json(
      { error: error.message || 'Error mejorando texto' },
      { status: 500 }
    );
  }
}
