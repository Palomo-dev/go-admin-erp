'use client';

/**
 * Términos de uso — versión MÍNIMA (decisión v2-11, docs/design/AUTH-ACCESO-V2.md §13).
 *
 * El registro exige aceptar Términos y Privacidad y no existía una página de
 * Términos enlazable (la de Privacidad es /privacy). Esta versión resume las
 * reglas básicas del servicio en los 4 idiomas; queda anotado en el documento
 * que el texto definitivo lo debe revisar el área legal.
 *
 * Pública (sin sesión): el middleware la deja pasar.
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { EscenaAcceso, TarjetaAcceso } from '@/components/kit/acceso';

const SECCIONES = ['aceptacion', 'servicio', 'cuenta', 'pagos', 'datos', 'uso', 'responsabilidad', 'cambios', 'contacto'] as const;

export default function TerminosPage() {
  const t = useTranslations('acceso.terminosPagina');
  return (
    <EscenaAcceso mostrarMarca={false} mostrarViajero={false}>
      <TarjetaAcceso ancho="plan" titulo={t('titulo')} descripcion={t('actualizacion')}>
        <div className="space-y-5 text-sm leading-6 text-fg-secondary">
          {SECCIONES.map((s, i) => (
            <section key={s} aria-labelledby={`terminos-${s}`}>
              <h2 id={`terminos-${s}`} className="mb-1 text-base font-semibold text-fg">
                {i + 1}. {t(`${s}.titulo`)}
              </h2>
              <p>{t(`${s}.texto`)}</p>
            </section>
          ))}
          <p>
            <Link href="/privacy" className="font-medium text-link underline-offset-4 hover:underline">
              {t('verPrivacidad')}
            </Link>
          </p>
        </div>
      </TarjetaAcceso>
    </EscenaAcceso>
  );
}
