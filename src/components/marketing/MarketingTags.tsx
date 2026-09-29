'use client'

/**
 * Componente: Tags de Marketing (Píxel Meta y Google Ads)
 * 
 * CUMPLIMIENTO LEY 1581:
 * - Solo carga píxel y gtag si el usuario dio consentimiento de marketing
 * - Lee la cookie goadmin_consent (domain=.goadmin.io)
 * - Implementa Consent Mode v2 con estado por defecto 'denied'
 * - Escucha cambios de consentimiento para activarse sin recargar
 * 
 * USO:
 * Este componente se monta SOLO en src/app/auth/layout.tsx,
 * no en el layout raíz de la aplicación.
 * 
 * VARIABLES DE ENTORNO REQUERIDAS:
 * - NEXT_PUBLIC_META_PIXEL_ID: ID del píxel de Meta
 * - NEXT_PUBLIC_GA4_ID: ID de medición de GA4
 * - NEXT_PUBLIC_GADS_ID: ID de Google Ads (opcional)
 */

import { useEffect, useState } from 'react'
import Script from 'next/script'

interface ConsentData {
  v: number
  analytics: boolean
  marketing: boolean
  ts: number
}

/**
 * Lee la cookie goadmin_consent
 */
function readConsent(): ConsentData | null {
  if (typeof document === 'undefined') return null

  const cookies = document.cookie.split(';')
  const consentCookie = cookies.find((c) => c.trim().startsWith('goadmin_consent='))

  if (!consentCookie) return null

  try {
    const value = consentCookie.split('=')[1]
    const decoded = decodeURIComponent(value)
    
    // Manejar formato heredado 'all'
    if (decoded === 'all') {
      return { v: 1, analytics: true, marketing: true, ts: Date.now() }
    }

    const parsed = JSON.parse(decoded) as ConsentData
    return parsed
  } catch {
    return null
  }
}

/**
 * Actualiza el Consent Mode de Google
 */
function updateGoogleConsent(marketing: boolean, analytics: boolean) {
  if (typeof window === 'undefined' || !(window as any).gtag) return

  ;(window as any).gtag('consent', 'update', {
    ad_storage: marketing ? 'granted' : 'denied',
    ad_user_data: marketing ? 'granted' : 'denied',
    ad_personalization: marketing ? 'granted' : 'denied',
    analytics_storage: analytics ? 'granted' : 'denied',
  })

  console.log('[MarketingTags] Google Consent actualizado:', { marketing, analytics })
}

export function MarketingTags() {
  const [consent, setConsent] = useState<ConsentData | null>(null)
  const [scriptsLoaded, setScriptsLoaded] = useState(false)

  // Variables de entorno
  const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID
  const ga4Id = process.env.NEXT_PUBLIC_GA4_ID
  const gadsId = process.env.NEXT_PUBLIC_GADS_ID

  // Leer consentimiento inicial
  useEffect(() => {
    const initialConsent = readConsent()
    setConsent(initialConsent)

    // Escuchar cambios de consentimiento
    const handleConsentChange = (event: Event) => {
      const customEvent = event as CustomEvent<ConsentData>
      setConsent(customEvent.detail)
      
      // Actualizar Consent Mode si los scripts ya están cargados
      if (scriptsLoaded) {
        updateGoogleConsent(
          customEvent.detail.marketing,
          customEvent.detail.analytics
        )
      }
    }

    window.addEventListener('goadmin:consent', handleConsentChange)

    return () => {
      window.removeEventListener('goadmin:consent', handleConsentChange)
    }
  }, [scriptsLoaded])

  // Solo cargar si hay consentimiento de marketing
  const shouldLoadScripts = consent?.marketing === true

  if (!shouldLoadScripts) {
    return null // Sin consentimiento, no cargar nada (Consent Mode básico)
  }

  return (
    <>
      {/* Meta Pixel */}
      {metaPixelId && !metaPixelId.startsWith('your-') && (
        <>
          <Script
            id="meta-pixel-init"
            strategy="afterInteractive"
            onLoad={() => {
              console.log('[MarketingTags] Meta Pixel cargado')
            }}
          >
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${metaPixelId}');
              fbq('track', 'PageView');
            `}
          </Script>
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        </>
      )}

      {/* Google gtag con Consent Mode v2 */}
      {ga4Id && !ga4Id.startsWith('your-') && (
        <>
          <Script
            id="gtag-base"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
            onLoad={() => {
              setScriptsLoaded(true)
              console.log('[MarketingTags] gtag cargado')
            }}
          />
          <Script
            id="gtag-init"
            strategy="afterInteractive"
          >
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              
              // Consent Mode v2 - Estado por defecto DENIED
              gtag('consent', 'default', {
                'ad_storage': 'denied',
                'ad_user_data': 'denied',
                'ad_personalization': 'denied',
                'analytics_storage': 'denied'
              });

              // Inicializar GA4
              gtag('js', new Date());
              gtag('config', '${ga4Id}', {
                cookie_domain: '.goadmin.io',
                cookie_flags: 'SameSite=Lax;Secure'
              });

              ${gadsId && !gadsId.startsWith('your-') ? `gtag('config', '${gadsId}');` : ''}

              // Actualizar consentimiento inmediatamente (ya tenemos consentimiento aquí)
              gtag('consent', 'update', {
                'ad_storage': 'granted',
                'ad_user_data': 'granted',
                'ad_personalization': 'granted',
                'analytics_storage': 'granted'
              });

              console.log('[MarketingTags] Consent Mode actualizado a granted');
            `}
          </Script>
        </>
      )}
    </>
  )
}
