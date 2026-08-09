import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/auth/login'

  if (token_hash && type) {
    const cookieStore = await cookies()
    const pendingCookies = new Map<string, string | null>()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          flowType: 'pkce',
          storage: {
            getItem: (key: string) => {
              if (pendingCookies.has(key)) {
                return pendingCookies.get(key) ?? null
              }
              return cookieStore.get(key)?.value ?? null
            },
            setItem: (key: string, value: string) => {
              pendingCookies.set(key, value)
            },
            removeItem: (key: string) => {
              pendingCookies.set(key, null)
            }
          },
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    )

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })

    if (!error) {
      const response = NextResponse.redirect(new URL(next, request.url))
      pendingCookies.forEach((value, name) => {
        if (value !== null) {
          response.cookies.set(name, value, {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 604800
          })
        } else {
          response.cookies.delete(name)
        }
      })

      if (type === 'email') {
        await supabase.auth.signOut()
        return NextResponse.redirect(
          new URL('/auth/login?success=email-confirmed&message=' + encodeURIComponent('Tu cuenta ha sido confirmada exitosamente. Por favor, inicia sesión.'), request.url)
        )
      }

      return response
    }

    console.error('Error verifying OTP:', error)
  }

  return NextResponse.redirect(
    new URL('/auth/login?error=auth-confirmation-failed', request.url)
  )
}
