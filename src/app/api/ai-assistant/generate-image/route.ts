import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { productName, description, organizationId } = await request.json();

    console.log('=== Generate Image API ===');
    console.log('Product:', productName);
    console.log('Organization:', organizationId);

    if (!productName || !organizationId) {
      return NextResponse.json(
        { error: 'Nombre del producto y organizationId son requeridos' },
        { status: 400 }
      );
    }

    // Verificar API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OPENAI_API_KEY no está configurada');
      return NextResponse.json(
        { error: 'Servicio de generación de imágenes no disponible. Configura OPENAI_API_KEY.' },
        { status: 503 }
      );
    }

    // Importar OpenAI dinámicamente para evitar errores si no está instalado
    let OpenAI;
    try {
      OpenAI = (await import('openai')).default;
    } catch (e) {
      console.error('OpenAI package not installed');
      return NextResponse.json(
        { error: 'Servicio de generación de imágenes no disponible' },
        { status: 503 }
      );
    }

    const openai = new OpenAI({ apiKey });

    // Generar imagen con DALL-E
    const prompt = `Professional product photo of "${productName}". ${description || ''} 
Style: Clean white background, professional e-commerce product photography, high quality, studio lighting, centered composition.`;

    console.log('Llamando a DALL-E 3...');

    const imageResponse = await openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
    });

    const imageUrl = imageResponse.data[0]?.url;
    
    if (!imageUrl) {
      throw new Error('DALL-E no devolvió una imagen');
    }

    console.log('Imagen generada exitosamente');

    // Intentar subir a Storage (opcional)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (supabaseUrl && supabaseServiceKey) {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        const imageData = await fetch(imageUrl);
        const imageBuffer = await imageData.arrayBuffer();
        
        const fileName = `ai-generated/${organizationId}/${Date.now()}-${productName.replace(/[^a-zA-Z0-9]/g, '_')}.png`;

        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(fileName, imageBuffer, {
            contentType: 'image/png',
            upsert: false,
          });

        if (!uploadError) {
          const { data: publicUrlData } = supabase.storage
            .from('product-images')
            .getPublicUrl(fileName);

          console.log('Imagen guardada en Storage:', publicUrlData.publicUrl);
          
          return NextResponse.json({ 
            imageUrl: publicUrlData.publicUrl,
            storagePath: fileName,
            isTemporary: false,
            message: 'Imagen generada y guardada'
          });
        }
        console.log('No se pudo guardar en Storage, devolviendo URL temporal');
      }
    } catch (storageError) {
      console.log('Error opcional de Storage:', storageError);
    }

    // Devolver URL temporal de OpenAI
    return NextResponse.json({ 
      imageUrl,
      isTemporary: true,
      message: 'Imagen generada (URL temporal válida por 1 hora)'
    });

  } catch (error: any) {
    console.error('=== Error en Generate Image ===');
    console.error('Message:', error?.message);
    console.error('Code:', error?.code);
    console.error('Status:', error?.status);
    
    // Errores específicos de OpenAI
    if (error?.code === 'insufficient_quota') {
      return NextResponse.json(
        { error: 'Sin créditos en OpenAI. Recarga tu cuenta.' },
        { status: 402 }
      );
    }
    
    if (error?.code === 'invalid_api_key') {
      return NextResponse.json(
        { error: 'API Key de OpenAI inválida' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error?.message || 'Error generando imagen' },
      { status: 500 }
    );
  }
}
