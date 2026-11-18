'use client';

/**
 * Piezas visuales del kiosco (Figma 20.29.1–20.29.9). Sin red ni estado propio
 * salvo la cámara: las arma `KioscoApp`. Colores y tipografía del kit (tokens).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, CircleAlert, CircleCheck, Info, KeyRound, Lock, Nfc, TabletSmartphone, Expand } from 'lucide-react';
import { clasesBoton } from '@/components/kit';
import { FOTO_ALTO, FOTO_ANCHO, FOTO_CALIDAD, SEGUNDOS_CUENTA_FOTO } from '@/lib/hrm/kiosco/foto';
import { LARGO_PIN, type TeclaPin } from '@/lib/hrm/kiosco/kiosco';

// ─── Marco ───────────────────────────────────────────────────────────────────

export function MarcoKiosco({
  titulo,
  subtitulo,
  hora,
  fecha,
  pie,
  children,
}: {
  titulo: string;
  subtitulo: string;
  hora: string;
  fecha: string;
  pie: string;
  children: ReactNode;
}) {
  const t = useTranslations('hrmKiosco.kiosco');
  const [completa, setCompleta] = useState(true);
  useEffect(() => {
    const alCambiar = () => setCompleta(!!document.fullscreenElement || !document.fullscreenEnabled);
    alCambiar();
    document.addEventListener('fullscreenchange', alCambiar);
    return () => document.removeEventListener('fullscreenchange', alCambiar);
  }, []);
  return (
    <main className="flex min-h-dvh select-none flex-col gap-6 bg-canvas px-5 py-6 text-fg sm:px-10 sm:py-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand text-[8px] font-bold text-fg-on-brand">
            GO
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{titulo}</p>
            <p className="truncate text-[13px] text-fg-secondary">{subtitulo}</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="text-right">
            <p className="text-[28px] font-semibold tabular-nums leading-8 text-fg" aria-live="off">
              {hora}
            </p>
            <p className="text-sm text-fg-secondary">{fecha}</p>
          </div>
          {!completa && (
            <button
              type="button"
              onClick={() => void document.documentElement.requestFullscreen().catch(() => undefined)}
              aria-label={t('pantallaCompleta')}
              title={t('pantallaCompleta')}
              className="flex size-10 items-center justify-center rounded-lg border border-line-strong bg-surface text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Expand className="size-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="text-[13px] leading-[18px] text-fg-muted">{pie}</footer>
    </main>
  );
}

export function TarjetaCentro({ children }: { children: ReactNode }) {
  return <section className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-line bg-surface px-6 py-10 text-center">{children}</section>;
}

function Circulo({ icono: Icono, tono }: { icono: typeof Lock; tono: 'brand' | 'exito' | 'advertencia' }) {
  const clases = tono === 'exito' ? 'size-20 bg-success-subtle text-success' : tono === 'advertencia' ? 'size-14 bg-warning-subtle text-warning' : 'size-14 bg-brand-tint text-brand';
  return (
    <span aria-hidden="true" className={`flex items-center justify-center rounded-full ${clases}`}>
      <Icono className={tono === 'exito' ? 'size-9' : 'size-6'} strokeWidth={1.5} />
    </span>
  );
}

export function Aviso({ tono, titulo, descripcion, rol }: { tono: 'info' | 'peligro' | 'advertencia'; titulo: string; descripcion?: ReactNode; rol?: 'alert' | 'status' }) {
  const c =
    tono === 'info'
      ? { caja: 'border-line-info bg-info-subtle', titulo: 'text-info-text', icono: Info }
      : tono === 'peligro'
        ? { caja: 'border-line-danger bg-danger-subtle', titulo: 'text-danger-text', icono: CircleAlert }
        : { caja: 'border-line-warning bg-warning-subtle', titulo: 'text-warning-text', icono: AlertTriangle };
  const Icono = c.icono;
  return (
    <div role={rol} className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-left ${c.caja}`}>
      <Icono className={`mt-0.5 size-5 shrink-0 ${c.titulo}`} aria-hidden="true" strokeWidth={1.5} />
      <div className="min-w-0">
        <p className={`text-sm font-medium ${c.titulo}`}>{titulo}</p>
        {descripcion && <p className="mt-0.5 text-[13px] leading-[18px] text-fg-secondary">{descripcion}</p>}
      </div>
    </div>
  );
}

// ─── Inicio (20.29.1, 20.29.6) ───────────────────────────────────────────────

export function TarjetaQr({ contenido, sede, restantes }: { contenido: string | null; sede: string; restantes: number }) {
  const t = useTranslations('hrmKiosco.kiosco.inicio');
  return (
    <section className="flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface px-6 py-8 text-center">
      <p className="text-lg font-semibold text-fg">{t('escanea')}</p>
      <div className="flex flex-col items-center rounded-2xl border border-line px-8 py-6">
        <div className="w-[180px] max-w-full bg-white p-0">
          {contenido ? (
            <QRCodeSVG value={contenido} size={360} level="M" marginSize={0} className="h-auto w-full" title={t('qrTitulo')} />
          ) : (
            <div className="aspect-square w-full animate-pulse rounded-lg bg-subtle" aria-hidden="true" />
          )}
        </div>
        <p className="mt-4 text-2xl font-semibold text-fg">{t('qrTitulo')}</p>
        <p className="mt-2 text-xl text-fg-secondary">{sede}</p>
        <p className="mt-2 text-lg text-fg-muted" aria-live="off">
          {t('cambiaEn', { n: restantes })}
        </p>
      </div>
      <p className="max-w-sm text-sm text-fg-secondary">{t('qrInstrucciones')}</p>
    </section>
  );
}

export function OpcionMarcar({
  icono: Icono,
  titulo,
  descripcion,
  insignia,
  onClick,
}: {
  icono: typeof Nfc;
  titulo: string;
  descripcion: string;
  insignia?: string;
  onClick?: () => void;
}) {
  const contenido = (
    <>
      <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
        <Icono className="size-6" strokeWidth={1.5} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-base font-semibold text-fg">{titulo}</span>
        <span className="mt-1 block text-sm text-fg-secondary">{descripcion}</span>
      </span>
      {insignia && (
        <span className="shrink-0 rounded-full border border-line-success bg-success-subtle px-2 py-0.5 text-xs font-medium text-success-text">{insignia}</span>
      )}
    </>
  );
  const clases = 'flex w-full items-center gap-5 rounded-2xl border border-line bg-surface px-6 py-6';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${clases} hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`}>
      {contenido}
    </button>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}

// ─── Teclado del PIN (20.29.2, 20.29.5, 20.29.9) ─────────────────────────────

const TECLAS: readonly TeclaPin[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function TecladoPin({
  titulo,
  valor,
  error,
  onTecla,
  onListo,
  enviando,
}: {
  titulo: string;
  valor: string;
  error?: ReactNode;
  onTecla: (t: TeclaPin) => void;
  onListo: () => void;
  enviando?: boolean;
}) {
  const t = useTranslations('hrmKiosco.kiosco.teclado');
  // El teclado físico también sirve (tablet con teclado o computador).
  const ref = useRef({ onTecla, onListo });
  ref.current = { onTecla, onListo };
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) ref.current.onTecla(e.key as TeclaPin);
      else if (e.key === 'Backspace') ref.current.onTecla('borrar');
      else if (e.key === 'Enter') ref.current.onListo();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);
  const tecla = 'flex h-14 items-center justify-center rounded-lg bg-brand-tint text-base font-medium text-brand-deep hover:bg-brand-tint-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60';
  return (
    <section className="flex flex-col items-center gap-6 rounded-2xl border border-line bg-surface px-6 py-8 sm:px-14">
      <p className="text-lg font-semibold text-fg">{titulo}</p>
      <div className="flex gap-4" role="img" aria-label={t('escritos', { n: valor.length, total: LARGO_PIN })}>
        {Array.from({ length: LARGO_PIN }, (_, i) => (
          <span
            key={i}
            className={`size-4 rounded-full ${error ? 'bg-danger' : i < valor.length ? 'bg-brand' : 'bg-line-strong'}`}
          />
        ))}
      </div>
      {error && <div className="w-full">{error}</div>}
      <div className="grid w-full max-w-[444px] grid-cols-3 gap-3">
        {TECLAS.map((k) => (
          <button key={k} type="button" className={tecla} onClick={() => onTecla(k)} disabled={enviando} aria-label={t('digito', { n: k })}>
            {k}
          </button>
        ))}
        <button type="button" onClick={() => onTecla('borrar')} disabled={enviando} className="flex h-14 items-center justify-center rounded-lg text-base font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          {t('borrar')}
        </button>
        <button type="button" className={tecla} onClick={() => onTecla('0')} disabled={enviando} aria-label={t('digito', { n: '0' })}>
          0
        </button>
        <button
          type="button"
          onClick={onListo}
          disabled={enviando || valor.length !== LARGO_PIN}
          className="flex h-14 items-center justify-center rounded-lg bg-brand-action text-base font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
        >
          {t('listo')}
        </button>
      </div>
    </section>
  );
}

export function PanelLado({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <aside className="flex max-w-md flex-col gap-4 text-left">
      <p className="text-base font-semibold text-fg">{titulo}</p>
      {children}
    </aside>
  );
}

export function BotonSecundario({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <div>
      <button type="button" onClick={onClick} className={clasesBoton({ variante: 'secundario', className: 'h-12 px-5' })}>
        {children}
      </button>
    </div>
  );
}

// ─── Foto de evidencia (20.29.3) ─────────────────────────────────────────────

/**
 * Abre la cámara frontal, cuenta 3-2-1 y toma una foto de 640×480 en JPEG. Si la
 * cámara no abre (sin permiso, sin cámara), entrega null: la marca va sin foto.
 */
export function CamaraEvidencia({ onFoto, texto, textoSinCamara }: { onFoto: (dataUrl: string | null) => void; texto: string; textoSinCamara: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [cuenta, setCuenta] = useState(SEGUNDOS_CUENTA_FOTO);
  const [falla, setFalla] = useState(false);
  const entregado = useRef(false);
  const onFotoRef = useRef(onFoto);
  onFotoRef.current = onFoto;

  useEffect(() => {
    let flujo: MediaStream | null = null;
    let tic: ReturnType<typeof setInterval> | null = null;
    const entregar = (v: string | null) => {
      if (entregado.current) return;
      entregado.current = true;
      onFotoRef.current(v);
    };
    const tomar = () => {
      const v = video.current;
      if (!v || !v.videoWidth) return entregar(null);
      const lienzo = document.createElement('canvas');
      lienzo.width = FOTO_ANCHO;
      lienzo.height = FOTO_ALTO;
      const ctx = lienzo.getContext('2d');
      if (!ctx) return entregar(null);
      // Recorte centrado 4:3, en espejo como la vista previa.
      const escala = Math.max(FOTO_ANCHO / v.videoWidth, FOTO_ALTO / v.videoHeight);
      const w = v.videoWidth * escala;
      const h = v.videoHeight * escala;
      ctx.translate(FOTO_ANCHO, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(v, (FOTO_ANCHO - w) / 2, (FOTO_ALTO - h) / 2, w, h);
      entregar(lienzo.toDataURL('image/jpeg', FOTO_CALIDAD));
    };
    (async () => {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        if (video.current) {
          video.current.srcObject = flujo;
          await video.current.play().catch(() => undefined);
        }
        let n = SEGUNDOS_CUENTA_FOTO;
        tic = setInterval(() => {
          n -= 1;
          setCuenta(n);
          if (n <= 0) {
            if (tic) clearInterval(tic);
            tomar();
          }
        }, 1000);
      } catch {
        setFalla(true);
        setTimeout(() => entregar(null), 1500);
      }
    })();
    return () => {
      if (tic) clearInterval(tic);
      flujo?.getTracks().forEach((p) => p.stop());
    };
  }, []);

  return (
    <div className="relative flex min-h-[420px] flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl bg-night">
      <video ref={video} muted playsInline className="absolute inset-0 size-full -scale-x-100 object-cover opacity-90" aria-hidden="true" />
      <div aria-hidden="true" className="relative h-[328px] w-[256px] rounded-[50%] border-[3px] border-dashed border-brand" />
      <p className="relative mt-6 px-4 text-center text-lg font-medium text-white" role="status">
        {falla ? textoSinCamara : texto}
      </p>
      {!falla && <p className="relative mt-3 text-[28px] font-medium tabular-nums text-white">{Math.max(cuenta, 1)}</p>}
    </div>
  );
}

// ─── Resultado, bloqueo, vincular ────────────────────────────────────────────

export function Registrada({ titulo, detalle, foto, iniciales, volvemos }: { titulo: string; detalle: string; foto: string | null; iniciales: string; volvemos: string }) {
  return (
    <TarjetaCentro>
      <Circulo icono={CircleCheck} tono="exito" />
      <h1 className="mt-6 text-[28px] font-semibold leading-9 text-fg" role="status">
        {titulo}
      </h1>
      <p className="mt-4 text-base font-medium text-fg-secondary">{detalle}</p>
      {foto && (
        <p className="mt-6 flex items-center gap-3 text-sm text-fg-secondary">
          <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-brand text-base font-semibold text-fg-on-brand">
            {iniciales}
          </span>
          {foto}
        </p>
      )}
      <p className="mt-6 text-[13px] text-fg-muted">{volvemos}</p>
    </TarjetaCentro>
  );
}

export function Bloqueado({ titulo, cuenta, descripcion, acciones }: { titulo: string; cuenta: string | null; descripcion: string; acciones: ReactNode }) {
  return (
    <TarjetaCentro>
      <Circulo icono={Lock} tono="advertencia" />
      <h1 className="mt-4 text-xl font-semibold text-fg" role="status">
        {titulo}
      </h1>
      {cuenta && <p className="mt-4 text-[28px] font-semibold tabular-nums text-fg-secondary">{cuenta}</p>}
      <p className="mt-4 max-w-xl text-sm text-fg-secondary">{descripcion}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{acciones}</div>
    </TarjetaCentro>
  );
}

export function Vincular({ titulo, instrucciones, codigo, nota, extra }: { titulo: string; instrucciones: string; codigo: string | null; nota: string; extra?: ReactNode }) {
  return (
    <TarjetaCentro>
      <Circulo icono={TabletSmartphone} tono="brand" />
      <h1 className="mt-5 text-xl font-semibold text-fg">{titulo}</h1>
      <p className="mt-5 max-w-lg text-sm text-fg-secondary">{instrucciones}</p>
      <p className="mt-5 text-[28px] font-semibold tracking-wide text-brand-deep" aria-live="polite">
        {codigo ?? '··· · ···'}
      </p>
      <p className="mt-5 max-w-lg text-[13px] text-fg-muted">{nota}</p>
      {extra}
    </TarjetaCentro>
  );
}

export function AvisoCentro({ titulo, descripcion, accion }: { titulo: string; descripcion: string; accion: ReactNode }) {
  return (
    <TarjetaCentro>
      <Circulo icono={KeyRound} tono="advertencia" />
      <h1 className="mt-4 text-xl font-semibold text-fg" role="alert">
        {titulo}
      </h1>
      <p className="mt-3 max-w-xl text-sm text-fg-secondary">{descripcion}</p>
      <div className="mt-6">{accion}</div>
    </TarjetaCentro>
  );
}
