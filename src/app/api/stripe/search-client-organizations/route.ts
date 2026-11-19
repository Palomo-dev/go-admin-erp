/**
 * API Endpoint: Buscar organizaciones clientes para checkout de asesor
 * GO Admin ERP - Search Client Organizations
 * 
 * Permite a personal interno de GO Admin buscar organizaciones clientes
 * por nombre, email del owner o NIT para generar enlaces de pago.
 *
 * Seguridad: Mismo control que advisor-checkout (solo personal interno).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  getServerOrgContext,
  OrgContextError,
} from '@/lib/utils/orgContext'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const GOADMIN_INTERNAL_ORG_ID = process.env.GOADMIN_INTERNAL_ORG_ID
  ? parseInt(process.env.GOADMIN_INTERNAL_ORG_ID, 10)
  : null

function createSupabaseClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

async function isInternalAdvisor(
  userId: string,
  currentMembership: { is_super_admin: boolean | null; role_id: number | null; organization_id: number }
): Promise<boolean> {
  if (currentMembership.is_super_admin === true) return true
  if (!GOADMIN_INTERNAL_ORG_ID) return false

  const supabase = createSupabaseClient()
  const { data: internalMembership } = await supabase
    .from('organization_members')
    .select('role_id, is_super_admin')
    .eq('user_id', userId)
    .eq('organization_id', GOADMIN_INTERNAL_ORG_ID)
    .eq('is_active', true)
    .maybeSingle()

  if (!internalMembership) return false
  if (internalMembership.is_super_admin === true) return true
  if (internalMembership.role_id && [1, 2, 5].includes(internalMembership.role_id)) return true

  return false
}

export async function GET(request: NextRequest) {
  try {
    // Verificar permisos
    let userId: string
    try {
      const ctx = await getServerOrgContext()
      userId = ctx.userId

      const hasAccess = await isInternalAdvisor(userId, ctx.membership)
      if (!hasAccess) {
        return NextResponse.json(
          { error: 'Acceso denegado' },
          { status: 403 }
        )
      }
    } catch (err) {
      if (err instanceof OrgContextError) {
        return NextResponse.json({ error: err.message }, { status: err.statusCode })
      }
      throw err
    }

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')?.trim() || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50)

    if (!query) {
      return NextResponse.json({ organizations: [] })
    }

    const supabase = createSupabaseClient()

    // Buscar por nombre, email o NIT
    // Excluir la organización interna de los resultados
    const { data: orgs, error } = await supabase
      .from('organizations')
      .select('id, name, email, nit')
      .or(`name.ilike.%${query}%,email.ilike.%${query}%,nit.ilike.%${query}%`)
      .not('id', 'eq', GOADMIN_INTERNAL_ORG_ID || 0)
      .order('name')
      .limit(limit)

    if (error) {
      console.error('[search-client-organizations] Error:', error)
      return NextResponse.json(
        { error: 'Error buscando organizaciones' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      organizations: (orgs || []).map((org) => ({
        id: org.id,
        name: org.name,
        email: org.email,
        nit: org.nit,
      })),
    })
  } catch (error: unknown) {
    console.error('[search-client-organizations] Error inesperado:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
