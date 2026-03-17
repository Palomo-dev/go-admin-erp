'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { MailWarning, X, Send } from 'lucide-react';

const DISMISS_KEY = 'email_verification_banner_dismissed_at';

export function EmailVerificationBanner() {
  const [visible, setVisible] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    const checkEmailVerification = async () => {
      // Verificar si fue descartado recientemente (24h)
      const dismissedAt = localStorage.getItem(DISMISS_KEY);
      if (dismissedAt) {
        const hoursSince = (Date.now() - new Date(dismissedAt).getTime()) / (1000 * 60 * 60);
        if (hoursSince < 24) return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setEmail(user.email || '');

      // Mostrar banner si el email NO está confirmado
      if (!user.email_confirmed_at) {
        setVisible(true);
      }
    };

    checkEmailVerification();
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setVisible(false);
  };

  const handleResend = async () => {
    if (sending || sent) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });
      if (!error) {
        setSent(true);
      }
    } catch {
      // silenciar error
    } finally {
      setSending(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="border-b bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 px-3 sm:px-4 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <MailWarning className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
          <p className="text-xs sm:text-sm font-medium text-amber-700 dark:text-amber-300 truncate">
            Verifica tu correo electrónico
            <span className="font-normal ml-1 text-amber-600 dark:text-amber-400">
              — Revisa tu bandeja de entrada en <strong>{email}</strong> para confirmar tu cuenta.
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleResend}
            disabled={sending || sent}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white transition-colors"
          >
            <Send className="h-3 w-3" />
            <span className="hidden sm:inline">
              {sent ? 'Correo enviado' : sending ? 'Enviando...' : 'Reenviar correo'}
            </span>
            <span className="sm:hidden">
              {sent ? 'Enviado' : 'Reenviar'}
            </span>
          </button>

          <button
            onClick={handleDismiss}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-amber-600 dark:text-amber-400"
            aria-label="Cerrar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
