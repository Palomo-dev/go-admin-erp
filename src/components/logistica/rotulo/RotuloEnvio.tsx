'use client';

/**
 * Guía / rótulo de envío estándar — Figma «21 Logística», sección 3223:15627: componente
 * 10 × 15 cm (3223:15636) y térmica de 80 mm (3223:16129); variantes en 3224:15679.
 *
 * Es LA plantilla: la pintan la vista previa del diálogo «Imprimir guías», la página
 * `/imprimir/guias` (PDF 10 × 15, 80 mm o A4 con cuatro por hoja) y la térmica, que recibe la
 * imagen de este mismo componente (`rasterRotulo.ts`). Lo que se ve es lo que sale en papel.
 *
 * Recibe los textos ya resueltos (`textosRotulo`, idioma de la organización), así que no lee
 * traducciones ni la base. Medidas del diseño en px pasadas a mm: 10 × 15 a 0,25 mm/px
 * (400 × 600 px) y 80 mm a 0,225 mm/px (320 px = 72 mm útiles). Papel: blanco y negro fijos,
 * también en modo oscuro; marca de la tienda, nunca la de GO Admin.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { ShipmentLabelPayload } from '@printing';
import { CodigoBarras } from '@/components/kit/CodigoBarras';
import { ROTULO_MM, TERMICA_MM } from '@/lib/logistica/rotuloEnvio';

export type FormatoPapelRotulo = '10x15' | '80mm';

export interface RotuloEnvioProps {
  textos: ShipmentLabelPayload;
  /** 10 × 15 cm (alto fijo) o térmica de 80 mm (72 mm útiles, alto según el contenido). */
  formato?: FormatoPapelRotulo;
  className?: string;
  style?: CSSProperties;
  /** Avisa cuando las barras y el logo quedaron listos (la impresión y la imagen esperan). */
  onListo?: () => void;
}

const NEGRO = '#000000';
const BLANCO = '#ffffff';

/** Texto que no pasa de N líneas (solo en 10 × 15, donde el alto es fijo). */
function recorte(lineas: number | null): CSSProperties {
  return lineas ? { display: '-webkit-box', WebkitLineClamp: lineas, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : {};
}

export function RotuloEnvio({ textos: l, formato = '10x15', className, style, onListo }: RotuloEnvioProps) {
  const termica = formato === '80mm';
  const k = termica ? TERMICA_MM.ancho / 320 : ROTULO_MM.ancho / 400;
  const u = (px: number) => `${(px * k).toFixed(3)}mm`;
  const fijo = (n: number) => (termica ? null : n);

  // Listo = cada código de barras pintado y el logo cargado (o caído a las iniciales).
  const esperados = 1 + (l.carrierGuideCode ? 1 : 0) + (l.logoUrl ? 1 : 0);
  const listos = useRef(0);
  const avisado = useRef(false);
  const marcar = useCallback(() => {
    listos.current += 1;
    if (!avisado.current && listos.current >= esperados) {
      avisado.current = true;
      onListo?.();
    }
  }, [esperados, onListo]);
  const [sinLogo, setSinLogo] = useState(false);
  useEffect(() => setSinLogo(false), [l.logoUrl]);

  const texto = (v: string | null | undefined, s: CSSProperties, lineas: number | null = null): ReactNode =>
    v ? <p style={{ margin: 0, ...s, ...recorte(lineas) }}>{v}</p> : null;
  const etiqueta: CSSProperties = { fontSize: u(7.5), fontWeight: 700, letterSpacing: '0.06em', lineHeight: 1.2, textTransform: 'uppercase' };
  const caja: CSSProperties = { border: `${u(2)} solid ${NEGRO}`, padding: `${u(5)} ${u(8)}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 };

  const cobrar = l.charge.kind === 'collect';

  return (
    <article
      className={className}
      aria-label={`${l.guideLabel} ${l.guideNumber}`}
      data-rotulo-formato={formato}
      style={{
        boxSizing: 'border-box',
        width: termica ? `${TERMICA_MM.ancho}mm` : `${ROTULO_MM.ancho}mm`,
        height: termica ? 'auto' : `${ROTULO_MM.alto}mm`,
        padding: termica ? `${u(10)} ${u(8)} ${u(6)}` : `${u(14)} ${u(16)} ${u(12)}`,
        display: 'flex',
        flexDirection: 'column',
        gap: u(8),
        overflow: 'hidden',
        background: BLANCO,
        color: NEGRO,
        fontFamily: 'Inter, Arial, Helvetica, sans-serif',
        lineHeight: 1.15,
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
        ...style,
      }}
    >
      {/* Remitente: la tienda y la sede (logo en blanco y negro; sin logo, las iniciales). */}
      <header style={{ display: 'flex', alignItems: 'center', gap: u(9), paddingBottom: u(7), borderBottom: `${u(2)} solid ${NEGRO}` }}>
        <div
          style={{
            width: u(32),
            height: u(32),
            flex: 'none',
            borderRadius: u(5),
            background: l.logoUrl && !sinLogo ? BLANCO : NEGRO,
            color: BLANCO,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            fontSize: u(13),
            fontWeight: 800,
          }}
        >
          {l.logoUrl && !sinLogo ? (
            // eslint-disable-next-line @next/next/no-img-element -- papel: la imagen se pinta tal cual, sin optimizador.
            <img
              src={l.logoUrl}
              alt=""
              crossOrigin="anonymous"
              onLoad={marcar}
              onError={() => {
                setSinLogo(true);
                marcar();
              }}
              style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'grayscale(1) contrast(1.4)' }}
            />
          ) : (
            l.initials
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          {texto(l.senderLabel, etiqueta)}
          {texto(l.storeName, { fontSize: u(14), fontWeight: 700, lineHeight: 1.2 }, 1)}
          {texto(l.branchLine, { fontSize: u(9.5), lineHeight: 1.25 }, fijo(1))}
        </div>
      </header>

      {/* Destinatario: lo que el domiciliario busca de un vistazo. */}
      <section style={{ border: `${u(2)} solid ${NEGRO}`, padding: `${u(8)} ${u(12)} ${u(9)}`, display: 'flex', flexDirection: 'column', gap: u(2) }}>
        {texto(l.receiverLabel, etiqueta)}
        {texto(l.receiverName, { fontSize: u(termica ? 19 : 22), fontWeight: 800, lineHeight: 1.15 }, fijo(2))}
        {texto(l.address, { fontSize: u(termica ? 13.5 : 15), fontWeight: 600, lineHeight: 1.2 }, fijo(2))}
        {texto(l.neighborhood, { fontSize: u(11), lineHeight: 1.2 }, fijo(1))}
        {texto(l.destination, { fontSize: u(termica ? 15 : 18), fontWeight: 800, lineHeight: 1.2 }, fijo(2))}
        {texto(l.phone, { fontSize: u(termica ? 13 : 14), fontWeight: 600, lineHeight: 1.25 })}
        {texto(l.instructions, { fontSize: u(9.5), lineHeight: 1.25 }, fijo(2))}
      </section>

      {/* Paquete X de N · peso (solo si existe) · tipo de entrega en palabras. */}
      <div style={{ display: 'flex', gap: u(6), alignItems: 'stretch' }}>
        <div style={{ ...caja, borderColor: NEGRO, background: NEGRO, color: BLANCO, flex: 'none', minWidth: u(termica ? 66 : 84) }}>
          {texto(l.packageLabel, etiqueta)}
          {texto(l.packageText, { fontSize: u(16), fontWeight: 800, whiteSpace: 'nowrap' })}
        </div>
        {l.weightText && (
          <div style={{ ...caja, flex: 'none', minWidth: u(termica ? 56 : 74) }}>
            {texto(l.weightLabel, etiqueta)}
            {texto(l.weightText, { fontSize: u(16), fontWeight: 700, whiteSpace: 'nowrap' })}
          </div>
        )}
        {l.deliveryText && (
          <div style={{ ...caja, flex: 1 }}>
            {texto(l.deliveryLabel, etiqueta)}
            {texto(l.deliveryText, { fontSize: u(12.5), fontWeight: 700, lineHeight: 1.2 }, fijo(2))}
          </div>
        )}
      </div>

      {/* Guía de la transportadora: su propio código; la nuestra queda como referencia. */}
      {l.carrierGuideText && (
        <section style={{ border: `${u(2)} solid ${NEGRO}`, padding: `${u(6)} ${u(8)}`, display: 'flex', flexDirection: 'column', gap: u(3) }}>
          {texto(l.carrierGuideLabel, etiqueta)}
          {texto(l.carrierGuideText, { fontSize: u(12), fontWeight: 700 }, 1)}
          {l.carrierGuideCode && (
            <div style={{ width: '70%' }} data-rotulo-barras={l.carrierGuideCode}>
              <CodigoBarras valor={l.carrierGuideCode} mostrarTexto={false} textoSinCodigo={l.carrierGuideCode} altoBarras={u(28)} onListo={marcar} />
            </div>
          )}
        </section>
      )}

      {/* Cobro: «COBRAR AL ENTREGAR $ saldo» en negro, o «PAGADO · NO COBRAR» para que nadie cobre de más. */}
      <section
        style={{
          background: cobrar ? NEGRO : BLANCO,
          color: cobrar ? BLANCO : NEGRO,
          border: `${u(2)} solid ${NEGRO}`,
          padding: cobrar ? `${u(8)} ${u(10)} ${u(9)}` : `${u(7)} ${u(10)}`,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: u(2),
        }}
      >
        {texto(l.charge.title, { fontSize: u(cobrar ? 12 : 15), fontWeight: 800, letterSpacing: '0.08em' })}
        {cobrar && texto(l.charge.amount, { fontSize: u(30), fontWeight: 800, lineHeight: 1.05 })}
        {texto(l.charge.note, { fontSize: u(8.5), lineHeight: 1.3 })}
      </section>

      {!termica && <div style={{ flex: 1, minHeight: 0 }} />}

      {/* La guía: Code 128 + número + QR de seguimiento. */}
      {termica ? (
        <>
          <div data-rotulo-barras={l.guideNumber}>
            <CodigoBarras valor={l.guideNumber} mostrarTexto={false} textoSinCodigo={l.guideNumber} altoBarras={u(58)} onListo={marcar} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: u(8) }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {texto(l.guideLabel, etiqueta)}
              {texto(l.guideNumber, { fontSize: u(17), fontWeight: 800, letterSpacing: '0.04em', wordBreak: 'break-all' })}
              {texto(l.qrCaptionLong, { fontSize: u(7.5), marginTop: u(2) })}
            </div>
            <QRCodeSVG value={l.qrData} size={256} level="M" marginSize={0} bgColor={BLANCO} fgColor={NEGRO} style={{ width: u(64), height: u(64), flex: 'none' }} aria-hidden="true" />
          </div>
          {texto(l.footer, { fontSize: u(8.5), lineHeight: 1.3 })}
          <div style={{ display: 'flex', alignItems: 'center', gap: u(4), marginTop: u(4) }}>
            <span style={{ flex: 1, borderTop: `${u(1)} dashed ${NEGRO}` }} />
            <span style={{ fontSize: u(7) }}>{l.cutLabel}</span>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: u(12) }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: u(4) }}>
              <div data-rotulo-barras={l.guideNumber}>
                <CodigoBarras valor={l.guideNumber} mostrarTexto={false} textoSinCodigo={l.guideNumber} altoBarras={u(62)} onListo={marcar} />
              </div>
              {texto(l.guideNumber, { fontSize: u(17), fontWeight: 800, letterSpacing: '0.05em', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden' })}
            </div>
            <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: u(3) }}>
              <QRCodeSVG value={l.qrData} size={256} level="M" marginSize={0} bgColor={BLANCO} fgColor={NEGRO} style={{ width: u(76), height: u(76) }} aria-hidden="true" />
              {texto(l.qrCaption, { fontSize: u(7) })}
            </div>
          </div>
          {texto(l.footer, { fontSize: u(9), lineHeight: 1.3 }, 2)}
        </>
      )}
    </article>
  );
}
