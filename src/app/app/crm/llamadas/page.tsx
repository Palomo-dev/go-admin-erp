'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Phone } from 'lucide-react';
import { clasesBoton } from '@/components/kit/botonClases';
import { Skeleton } from '@/components/ui/skeleton';
import { CallsTable } from '@/components/voice/CallsTable';
import { useSoftphone } from '@/components/voice/SoftphoneProvider';
import { parseCallDeepLink } from '@/components/voice/callDeepLink';
import { CallDeepLinkDialog } from '@/components/voice/CallDeepLinkDialog';
import { abrirMarcador } from '@/components/voice/softphoneUi';

function LlamadasContent() {
  const t = useTranslations('crm.llamadas');
  const searchParams = useSearchParams();
  const sp = useSoftphone();
  const router = useRouter(),
    pathname = usePathname();
  const [deepLink, setDeepLink] = useState<ReturnType<typeof parseCallDeepLink>>(null);
  useEffect(() => {
    const call = searchParams?.get('call') ?? null;
    if (!call) return;
    const parsed = parseCallDeepLink(call, searchParams?.get('start_ms') ?? null);
    if (parsed) setDeepLink(parsed);
    const query = new URLSearchParams(searchParams?.toString());
    query.delete('call');
    query.delete('start_ms');
    router.replace(`${pathname}${query.size ? `?${query}` : ''}`, { scroll: false });
  }, [searchParams, router, pathname]);
  useEffect(() => {
    const close = () => setDeepLink(null);
    window.addEventListener('organization-changed', close);
    return () => window.removeEventListener('organization-changed', close);
  }, []);
  const [revision, setRevision] = useState(0);
  const hadEndedCall = useRef(false);
  const lastEnded = sp.available ? sp.lastEndedCall : null;
  useEffect(() => {
    if (lastEnded) {
      hadEndedCall.current = true;
      return;
    }
    if (!hadEndedCall.current) return;
    hadEndedCall.current = false;
    setRevision((n) => n + 1);
  }, [lastEnded]);
  const action = (
    <button
      className={clasesBoton({ variante: 'primario', patron: 'button' })}
      onClick={abrirMarcador}
      disabled={!sp.available}
    >
      <Phone className="size-4" aria-hidden="true" strokeWidth={1.5} />
      {t('llamar')}
    </button>
  );
  return (
    <div className="min-w-0 bg-canvas p-4 lg:p-6">
      <CallsTable refreshKey={revision} cabecera={{ titulo: t('titulo'), subtitulo: t('subtitulo'), accion: action,
        accionMovil: <button type="button" aria-label={t('llamar')} className={clasesBoton({ variante: 'primario', patron: 'button', className: 'size-10 p-0' })} onClick={abrirMarcador} disabled={!sp.available}><Phone className="size-5" aria-hidden="true" strokeWidth={1.5} /></button> }}
        onAbrirLlamada={(id) => router.push(`/app/crm/llamadas/${id}`)} />
      {deepLink && (
        <CallDeepLinkDialog
          id={deepLink.id}
          startMs={deepLink.startMs}
          onClose={() => setDeepLink(null)}
        />
      )}
    </div>
  );
}

export default function LlamadasPage() {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-32" />}>
      <LlamadasContent />
    </Suspense>
  );
}
