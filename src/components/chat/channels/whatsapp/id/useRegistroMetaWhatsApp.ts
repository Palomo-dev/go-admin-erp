'use client';

/**
 * Conexión en 1 clic con Meta (Embedded Signup de WhatsApp). Lógica movida tal
 * cual desde `WhatsAppCredentialsCard` (rediseño Figma 91-chat-22): carga del
 * SDK con `fbAsyncInit`, `FB.login` con `config_id`, escucha del mensaje
 * `WA_EMBEDDED_SIGNUP` y canje del código en
 * `/api/integrations/whatsapp/oauth/callback` (que toma la organización de la
 * sesión y responde 403 si el body trae otra).
 */
import { useState } from 'react';

type VentanaFB = Window & {
  FB?: {
    init: (o: Record<string, unknown>) => void;
    login: (cb: (r: { authResponse?: { code?: string } }) => void, o: Record<string, unknown>) => void;
  };
  fbAsyncInit?: () => void;
  __fbInitDone?: boolean;
};

export type ErrorRegistroMeta = 'sinOrganizacion' | 'requiereHttps' | 'cancelado' | 'sdk' | 'callback';

export function useRegistroMetaWhatsApp({
  organizationId,
  channelId,
  onListo,
}: {
  organizationId?: number;
  channelId?: string;
  onListo?: () => void;
}) {
  const [conectando, setConectando] = useState(false);
  const [error, setError] = useState<{ tipo: ErrorRegistroMeta; detalle?: string } | null>(null);
  const [exito, setExito] = useState(false);

  const cargarSdk = (appId: string): Promise<void> => {
    const w = window as VentanaFB;
    return new Promise((resolve, reject) => {
      if (w.FB && w.__fbInitDone) {
        resolve();
        return;
      }
      const iniciar = () => {
        w.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: 'v21.0' });
        w.__fbInitDone = true;
        resolve();
      };
      w.fbAsyncInit = iniciar;
      if (!document.getElementById('facebook-jssdk')) {
        const script = document.createElement('script');
        script.id = 'facebook-jssdk';
        script.src = 'https://connect.facebook.net/en_US/sdk.js';
        script.async = true;
        script.defer = true;
        script.crossOrigin = 'anonymous';
        script.onerror = () => reject(new Error('sdk'));
        document.body.appendChild(script);
      } else if (w.FB) {
        iniciar();
      }
    });
  };

  const conectar = () => {
    setError(null);
    setExito(false);
    if (!organizationId) {
      setError({ tipo: 'sinOrganizacion' });
      return;
    }
    // Meta exige HTTPS para FB.login().
    if (window.location.protocol !== 'https:') {
      setError({ tipo: 'requiereHttps' });
      return;
    }
    setConectando(true);
    const appId = process.env.NEXT_PUBLIC_META_APP_ID || '';
    const configId = process.env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID || '';

    cargarSdk(appId)
      .then(() => {
        (window as VentanaFB).FB?.login(
          (respuesta) => {
            const code = respuesta.authResponse?.code;
            if (!code) {
              setError({ tipo: 'cancelado' });
              setConectando(false);
              return;
            }
            let phoneNumberId = '';
            let wabaId = '';
            const escuchar = (evento: MessageEvent) => {
              if (evento.origin !== 'https://www.facebook.com' && evento.origin !== 'https://web.facebook.com') return;
              try {
                const datos = typeof evento.data === 'string' ? JSON.parse(evento.data) : evento.data;
                if (datos.type === 'WA_EMBEDDED_SIGNUP') {
                  phoneNumberId = datos.data?.phone_number_id || '';
                  wabaId = datos.data?.waba_id || '';
                }
              } catch {
                /* mensajes ajenos */
              }
            };
            window.addEventListener('message', escuchar);
            setTimeout(async () => {
              window.removeEventListener('message', escuchar);
              try {
                const res = await fetch('/api/integrations/whatsapp/oauth/callback', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ code, phone_number_id: phoneNumberId, waba_id: wabaId, organization_id: organizationId, channel_id: channelId }),
                });
                const r = await res.json();
                if (r.success) {
                  setExito(true);
                  onListo?.();
                } else {
                  setError({ tipo: 'callback', detalle: r.error });
                }
              } catch (e) {
                setError({ tipo: 'callback', detalle: e instanceof Error ? e.message : undefined });
              } finally {
                setConectando(false);
              }
            }, 2000);
          },
          {
            config_id: configId,
            response_type: 'code',
            override_default_response_type: true,
            extras: { setup: {}, featureType: '', sessionInfoVersion: 2 },
          },
        );
      })
      .catch(() => {
        setError({ tipo: 'sdk' });
        setConectando(false);
      });
  };

  return { conectar, conectando, error, exito };
}
