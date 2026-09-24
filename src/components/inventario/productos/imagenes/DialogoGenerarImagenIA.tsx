'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { Dialogo } from '@/components/kit/Dialogo';
import { FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ErrorGenerarImagen, generarImagenIA, textoPlano, type ImagenGenerada } from './subirImagen';

/**
 * «Generar con IA»: foto de catálogo a partir del nombre y una descripción
 * (API `/api/ai-assistant/generate-image`; la organización sale de la sesión
 * y consume créditos de IA). Devuelve la imagen ya guardada o el archivo.
 */
export function DialogoGenerarImagenIA({
  abierto,
  onAbiertoChange,
  organizacionId,
  nombreInicial,
  descripcionInicial,
  onGenerada,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizacionId: number;
  nombreInicial: string;
  descripcionInicial?: string | null;
  onGenerada: (imagen: ImagenGenerada) => void | Promise<void>;
}) {
  const t = useTranslations('productoDetalle.imagenes');
  const tc = useTranslations('productoDetalle.comun');
  const [nombre, setNombre] = useState(nombreInicial);
  const [descripcion, setDescripcion] = useState('');
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setNombre(nombreInicial);
    setDescripcion(textoPlano(descripcionInicial));
    setError(null);
  }, [abierto, nombreInicial, descripcionInicial]);

  const generar = async () => {
    if (!nombre.trim()) {
      setError(t('ia.nombreRequerido'));
      return;
    }
    setGenerando(true);
    setError(null);
    try {
      const imagen = await generarImagenIA(organizacionId, { nombre: nombre.trim(), descripcion: descripcion.trim() });
      await onGenerada(imagen);
      onAbiertoChange(false);
    } catch (e) {
      const estado = e instanceof ErrorGenerarImagen ? e.estado : 0;
      setError(
        estado === 402 ? t('ia.sinCreditos') : estado === 503 ? t('ia.noDisponible') : estado === 401 || estado === 403 ? tc('sinPermiso') : t('ia.error'),
      );
    } finally {
      setGenerando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('ia.titulo')}
      descripcion={t('ia.descripcion')}
      icono={Sparkles}
      textoCancelar={tc('cancelar')}
      ancho={520}
      pie={t('ia.costo')}
      primario={{
        etiqueta: generando ? t('ia.generando') : t('ia.generar'),
        onClick: () => void generar(),
        cargando: generando,
        deshabilitada: !nombre.trim(),
        motivo: t('ia.nombreRequerido'),
      }}
    >
      <FormField etiqueta={t('ia.nombre')} obligatorio>
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={200} disabled={generando} />
      </FormField>
      <FormField etiqueta={t('ia.detalles')} ayuda={t('ia.detallesAyuda')}>
        <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} maxLength={600} disabled={generando} />
      </FormField>
      {error && (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}
    </Dialogo>
  );
}
