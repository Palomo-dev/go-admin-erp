import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Usar las mismas credenciales que el resto del proyecto
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jgmgphmzusbluqhuqihj.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnbWdwaG16dXNibHVxaHVxaWhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDYwMzQ1MjIsImV4cCI6MjA2MTYxMDUyMn0.yr5TLl2nhevIzNdPnjVkcdn049RB2t2OgqPG0HryVR4';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const organizationId = body.organizationId;

    console.log('=== Dynamic Options API ===');
    console.log('OrganizationId:', organizationId);

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId es requerido' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const [categoriesRes, suppliersRes, customersRes] = await Promise.all([
      supabase
        .from('categories')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name'),
      supabase
        .from('suppliers')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name'),
      supabase
        .from('customers')
        .select('id, full_name')
        .eq('organization_id', organizationId)
        .order('full_name')
        .limit(100),
    ]);

    // Log para debug
    console.log('Dynamic options loaded:', {
      organizationId,
      categories: categoriesRes.data?.length || 0,
      suppliers: suppliersRes.data?.length || 0,
      customers: customersRes.data?.length || 0,
      errors: {
        categories: categoriesRes.error?.message,
        suppliers: suppliersRes.error?.message,
        customers: customersRes.error?.message,
      }
    });

    return NextResponse.json({
      categories: (categoriesRes.data || []).map(c => ({ value: String(c.id), label: c.name })),
      suppliers: (suppliersRes.data || []).map(s => ({ value: String(s.id), label: s.name })),
      customers: (customersRes.data || []).map(c => ({ value: String(c.id), label: c.full_name })),
    });
  } catch (error: any) {
    console.error('Error cargando opciones dinámicas:', error);
    return NextResponse.json(
      { error: error.message || 'Error cargando opciones' },
      { status: 500 }
    );
  }
}
