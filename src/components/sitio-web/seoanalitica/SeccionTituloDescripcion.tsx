'use client';

/**
 * «Título y descripción por defecto» (Figma B/08-01): contadores con umbral
 * (título ≤ 60, descripción ≤ 160) y «Sugerir con IA». La propuesta se
 * muestra primero y solo se cobra (1 crédito, `chargeAiCredits`) si la
 * persona la aplica (nota-ux 2).
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialogo, FormField, FormSection, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { cn } from '@/utils/Utils';
import { LIMITE_DESCRIPCION, LIMITE_TITULO, estadoLongitud, type EstadoLongitud } from './seoLogica';
import { useTextosSeoAnalitica } from './textos';
import { ICONO_ACCION_SEO, ICONO_NIVEL, ICONO_SECCION_SEO, type NivelIcono } from './iconosSeoAnalitica';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import type { SeoSitio } from './useSeoSitio';

const TONO: Record<EstadoLongitud, string> = { bien: 'text-fg-muted', largo: 'text-warning-text', falta: 'text-danger-text' };
/** «Largo» comparte icono con «Mejorable»: se puede publicar, pero conviene acortarlo. */
const NIVEL: Record<EstadoLongitud, NivelIcono> = { bien: 'bien', largo: 'mejorable', falta: 'falta' };
/** El check de «bien» va en verde aunque el texto quede en gris: se lee de un vistazo. */
const TONO_ICONO: Record<EstadoLongitud, string> = { bien: 'text-success-text', largo: 'text-warning-text', falta: 'text-danger-text' };

export function Contador({ texto, limite }: { texto: string; limite: number }) {
  const t = useTextosSeoAnalitica();
  const { largo, estado } = estadoLongitud(texto, limite);
  const Icono = ICONO_NIVEL[NIVEL[estado]];
  return (
    <span className={cn('inline-flex items-center gap-1 tabular-nums', TONO[estado])} aria-live="polite" data-estado={estado}>
      <Icono aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.meta, 'shrink-0', TONO_ICONO[estado])} strokeWidth={TRAZO_ICONO} />
      {t('seo.titulo.contador', { n: largo, max: limite, estado: t(`seo.titulo.${estado}`) })}
    </span>
  );
}

interface Propuesta {
  titulo: string;
  descripcion: string;
  modelo: string;
  creditos: number;
}

function cabeceras(): HeadersInit {
  const org = getOrganizationId();
  return { 'Content-Type': 'application/json', ...(org > 0 ? { 'x-organization-id': String(org) } : {}) };
}

function DialogoSugerenciaIa({ abierto, onCerrar, onAplicar }: { abierto: boolean; onCerrar: () => void; onAplicar: (p: Propuesta) => void }) {
  const t = useTextosSeoAnalitica();
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generar = async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch('/api/sitio-web/seo/sugerencia', { method: 'POST', credentials: 'same-origin', headers: cabeceras(), body: JSON.stringify({ accion: 'generar' }) });
      const cuerpo = (await r.json().catch(() => null)) as (Propuesta & { codigo?: string }) | null;
      if (!r.ok || !cuerpo) {
        setError(cuerpo?.codigo === 'sin_creditos' ? t('seo.ia.sinCreditos') : cuerpo?.codigo === 'ia_no_disponible' ? t('seo.ia.noDisponible') : t('seo.ia.error'));
        return;
      }
      setPropuesta(cuerpo);
    } catch {
      setError(t('seo.ia.error'));
    } finally {
      setCargando(false);
    }
  };

  // Al abrir, se genera la primera propuesta (una vez por apertura).
  const pedida = useRef(false);
  useEffect(() => {
    if (!abierto) {
      pedida.current = false;
      return;
    }
    if (pedida.current || propuesta) return;
    pedida.current = true;
    void generar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, [abierto]);

  const aplicar = async () => {
    if (!propuesta) return;
    setAplicando(true);
    try {
      const r = await fetch('/api/sitio-web/seo/sugerencia', {
        method: 'POST',
        credentials: 'same-origin',
        headers: cabeceras(),
        body: JSON.stringify({ accion: 'aceptar', modelo: propuesta.modelo }),
      });
      if (!r.ok) {
        const cuerpo = (await r.json().catch(() => null)) as { codigo?: string } | null;
        setError(cuerpo?.codigo === 'sin_creditos' ? t('seo.ia.sinCreditos') : t('seo.ia.error'));
        return;
      }
      onAplicar(propuesta);
      toast.success(t('seo.ia.aplicada'));
      setPropuesta(null);
      onCerrar();
    } finally {
      setAplicando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => {
        if (!v) onCerrar();
      }}
      titulo={t('seo.ia.titulo')}
      icono={ICONO_ACCION_SEO.sugerirIa}
      descripcion={t('seo.ia.descripcion', { n: propuesta?.creditos ?? 1 })}
      primario={{ etiqueta: t('seo.ia.aplicar'), onClick: () => void aplicar(), cargando: aplicando, deshabilitada: !propuesta || cargando, motivo: t('seo.ia.generando') }}
      secundarios={[{ etiqueta: t('seo.ia.otra'), onClick: () => void generar(), deshabilitada: cargando || aplicando }]}
      textoCancelar={t('seo.ia.cancelar')}
      ancho={520}
    >
      <div className="flex min-h-24 flex-col gap-3" aria-busy={cargando}>
        {cargando && (
          <p className="flex items-center gap-2 text-sm text-fg-secondary" role="status">
            <Loader2 aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'animate-spin motion-reduce:animate-none')} strokeWidth={TRAZO_ICONO} />
            {t('seo.ia.generando')}
          </p>
        )}
        {error && !cargando && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
        {propuesta && !cargando && (
          <dl className="flex flex-col gap-3 rounded-lg border border-line bg-subtle p-3">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium text-fg-secondary">{t('seo.titulo.campoTitulo')}</dt>
              <dd className="text-sm text-fg">{propuesta.titulo}</dd>
              <dd className="text-xs">
                <Contador texto={propuesta.titulo} limite={LIMITE_TITULO} />
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium text-fg-secondary">{t('seo.titulo.campoDescripcion')}</dt>
              <dd className="text-sm text-fg">{propuesta.descripcion}</dd>
              <dd className="text-xs">
                <Contador texto={propuesta.descripcion} limite={LIMITE_DESCRIPCION} />
              </dd>
            </div>
          </dl>
        )}
      </div>
    </Dialogo>
  );
}

export function SeccionTituloDescripcion({ s, sinCabecera }: { s: SeoSitio; sinCabecera?: boolean }) {
  const t = useTextosSeoAnalitica();
  const [ia, setIa] = useState(false);
  const f = s.formulario;
  const campos = (
    <>
      <FormField etiqueta={t('seo.titulo.campoTitulo')} obligatorio ayuda={<Contador texto={f.titulo} limite={LIMITE_TITULO} />}>
        <Input value={f.titulo} onChange={(e) => s.cambiar({ titulo: e.target.value })} placeholder={t('seo.titulo.placeholderTitulo')} maxLength={120} />
      </FormField>
      <FormField etiqueta={t('seo.titulo.campoDescripcion')} ayuda={<Contador texto={f.descripcion} limite={LIMITE_DESCRIPCION} />}>
        <Textarea
          value={f.descripcion}
          onChange={(e) => s.cambiar({ descripcion: e.target.value })}
          placeholder={t('seo.titulo.placeholderDescripcion')}
          rows={3}
          maxLength={500}
        />
      </FormField>
    </>
  );
  const botonIa = (
    <button type="button" onClick={() => setIa(true)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
      <ICONO_ACCION_SEO.sugerirIa aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
      {t('seo.titulo.sugerirIa')}
    </button>
  );
  return (
    <>
      {sinCabecera ? (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">{botonIa}</div>
          {campos}
        </div>
      ) : (
        <FormSection titulo={t('seo.titulo.seccion')} descripcion={t('seo.titulo.descripcionSeccion')} icono={ICONO_SECCION_SEO.titulo} accion={botonIa}>
          {campos}
        </FormSection>
      )}
      <DialogoSugerenciaIa
        abierto={ia}
        onCerrar={() => setIa(false)}
        onAplicar={(p) => s.cambiar({ titulo: p.titulo, descripcion: p.descripcion })}
      />
    </>
  );
}
