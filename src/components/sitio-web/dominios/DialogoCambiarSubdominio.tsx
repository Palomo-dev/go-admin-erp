'use client';

/**
 * «Cambiar subdominio» (Figma B/07-03). Campo con el sufijo «.goadmin.io»,
 * pista de forma en el navegador y la regla real (forma y unicidad) en el
 * servidor. Avisa que la dirección vieja deja de abrir.
 */
import { useEffect, useState } from 'react';
import { AvisoTonal, Dialogo, FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { DOMINIO_SITIOS } from '../rutasSitioWeb';
import { mensajeDeError } from './apiDominios';
import { errorSubdominio } from './nombreDns';
import { ICONO_ACCION_DOMINIO } from './iconosDominios';
import { useTextosDominios } from './textos';

export interface DialogoCambiarSubdominioProps {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  actual: string | null;
  onGuardar: (subdominio: string) => Promise<unknown>;
  onGuardado: (host: string) => void;
}

export function DialogoCambiarSubdominio({ abierto, onAbiertoChange, actual, onGuardar, onGuardado }: DialogoCambiarSubdominioProps) {
  const t = useTextosDominios();
  const [valor, setValor] = useState(actual ?? '');
  const [tocado, setTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  useEffect(() => {
    if (abierto) {
      setValor(actual ?? '');
      setTocado(false);
      setErrorServidor(null);
    }
  }, [abierto, actual]);

  const pista = errorSubdominio(valor, actual);
  const mensaje = errorServidor ?? (tocado && pista ? t(pista === 'igual' ? 'subdominio.igual' : 'subdominio.invalido') : null);

  const guardar = async () => {
    setTocado(true);
    if (pista) return;
    setGuardando(true);
    setErrorServidor(null);
    try {
      const v = valor.trim().toLowerCase();
      await onGuardar(v);
      onGuardado(`${v}.${DOMINIO_SITIOS}`);
      onAbiertoChange(false);
    } catch (e) {
      setErrorServidor(mensajeDeError(t, e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('subdominio.titulo')}
      descripcion={t('subdominio.descripcion')}
      icono={ICONO_ACCION_DOMINIO.cambiarSubdominio}
      ancho={520}
      primario={{ etiqueta: t('subdominio.guardar'), onClick: () => void guardar(), cargando: guardando, deshabilitada: tocado && !!pista }}
    >
      <FormField etiqueta={t('subdominio.campo')} obligatorio ayuda={t('subdominio.ayuda')} error={mensaje}>
        <div className="flex items-center rounded-lg border border-line-strong bg-surface focus-within:ring-2 focus-within:ring-brand">
          <Input
            value={valor}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setValor(e.target.value.toLowerCase());
              setErrorServidor(null);
            }}
            onBlur={() => setTocado(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void guardar();
            }}
            className="border-0 shadow-none focus-visible:ring-0"
          />
          <span className="shrink-0 pr-3 text-sm text-fg-secondary">.{DOMINIO_SITIOS}</span>
        </div>
      </FormField>
      {actual && <AvisoTonal tono="advertencia" titulo={t('subdominio.aviso', { host: `${actual}.${DOMINIO_SITIOS}` })} />}
    </Dialogo>
  );
}
