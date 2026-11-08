'use client';

/**
 * Valor de una credencial con «Ver» / «Ocultar» y «Copiar» (decisión del dueño, 2026-11-07:
 * credenciales visibles y sin cifrar). Muestra la máscara; el valor se pide al servidor
 * (`POST …/credenciales/revelar`: administración y auditoría) solo al pulsar «Ver» o «Copiar».
 * No se guarda en ningún almacenamiento del navegador y se olvida al ocultar o al desmontar.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Eye, EyeOff } from 'lucide-react';
import { clasesBoton } from '@/components/kit';
import { apiConexiones, ErrorApiConexiones } from '@/lib/services/integrations/conexiones/clienteConexiones';

export interface CredencialRevelableProps {
  conexionId: string;
  proposito: string;
  mascara: string | null;
  etiqueta: string;
}

export function CredencialRevelable({ conexionId, proposito, mascara, etiqueta }: CredencialRevelableProps) {
  const t = useTranslations('integracionesConexiones');
  const [valor, setValor] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => setValor(null), []);

  const pedir = async (): Promise<string | null> => {
    setCargando(true);
    setError(null);
    try {
      const r = await apiConexiones.revelarCredencial(conexionId, proposito);
      return r.valor;
    } catch (e) {
      const codigo = e instanceof ErrorApiConexiones ? e.status : 0;
      setError(codigo === 403 ? t('credencial.sinPermiso') : t('credencial.error'));
      return null;
    } finally {
      setCargando(false);
    }
  };

  const alternar = async () => {
    if (valor !== null) return setValor(null);
    setValor(await pedir());
  };

  const copiar = async () => {
    const v = valor ?? (await pedir());
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError(t('credencial.errorCopiar'));
    }
  };

  return (
    <span className="flex min-w-0 flex-col items-end gap-1">
      <span className="flex min-w-0 items-center gap-1">
        <code className="min-w-0 break-all text-sm" aria-live="polite">
          {valor ?? mascara ?? '••••'}
        </code>
        <button
          type="button"
          className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
          onClick={() => void alternar()}
          disabled={cargando}
          aria-label={valor !== null ? t('credencial.ocultarDe', { etiqueta }) : t('credencial.verDe', { etiqueta })}
        >
          {valor !== null ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
          <span className="sr-only lg:not-sr-only">{valor !== null ? t('credencial.ocultar') : t('credencial.ver')}</span>
        </button>
        <button
          type="button"
          className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
          onClick={() => void copiar()}
          disabled={cargando}
          aria-label={t('credencial.copiarDe', { etiqueta })}
        >
          <Copy aria-hidden="true" className="size-4" />
          <span className="sr-only lg:not-sr-only">{copiado ? t('comun.copiado') : t('comun.copiar')}</span>
        </button>
      </span>
      {error && (
        <span role="alert" className="text-[13px] text-danger-text">
          {error}
        </span>
      )}
    </span>
  );
}
