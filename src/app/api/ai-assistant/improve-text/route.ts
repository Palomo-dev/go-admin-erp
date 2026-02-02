import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { productName, currentDescription, type } = await request.json();

    if (!productName) {
      return NextResponse.json(
        { error: 'Nombre del producto es requerido' },
        { status: 400 }
      );
    }

    let prompt = '';
    
    if (type === 'product_description') {
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

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 300,
    });

    const improvedText = response.choices[0]?.message?.content?.trim() || '';

    return NextResponse.json({ improvedText });
  } catch (error: any) {
    console.error('Error mejorando texto:', error);
    return NextResponse.json(
      { error: error.message || 'Error mejorando texto' },
      { status: 500 }
    );
  }
}
