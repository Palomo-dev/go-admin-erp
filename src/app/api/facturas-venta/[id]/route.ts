import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase.storage
      .from('invoices')
      .download(`facturas-venta/${id}.html`);

    if (error || !data) {
      return NextResponse.json(
        { error: 'Factura no encontrada' },
        { status: 404 }
      );
    }

    const html = await data.text();

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="factura_${id}.html"`,
      },
    });
  } catch (error) {
    console.error('Error sirviendo factura:', error);
    return NextResponse.json(
      { error: 'Error al servir el documento' },
      { status: 500 }
    );
  }
}
