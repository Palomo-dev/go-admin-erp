'use client';

/**
 * Pestañas del módulo Chat (Figma 91-chat-20 … 41): Bandeja · Canales ·
 * Conocimiento · IA · Widget · Auditoría, bajo el header en todas las páginas
 * del módulo (las monta `src/app/app/chat/layout.tsx`).
 *
 * La lista NO se cablea: sale del catálogo de navegación ya filtrado por la
 * organización, el cargo y las capacidades (`usePaginasModulo('chat')`, el
 * mismo cálculo del menú lateral). Fuera del shell se usa el catálogo entero.
 *
 * Al final, «Configuración» (etiquetas, respuestas rápidas e IA del chat; las
 * llaves de API viven en Integraciones › Desarrolladores): no es una página del
 * módulo sino el diálogo de Configuración abierto sobre la pantalla actual en
 * Chat › Etiquetas y respuestas rápidas (`?config=chat.general`).
 * Solo la ve quien puede entrar a esa sección (lo decide el servidor).
 *
 * En la Bandeja el lado derecho lleva «Nueva conversación».
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { Skeleton } from '@/components/ui/skeleton';
import { moduloPorCodigo, type PaginaNav } from '@/lib/navigation/catalog';
import { usePaginasModulo, useNavegacionVisible } from '@/lib/navigation/NavegacionVisible';
import { useNombresNav } from '@/lib/navigation/useNombresNav';
import { clasesBoton } from '@/components/kit';
import { useDesplazamientoHorizontal } from '@/components/kit/useDesplazamientoHorizontal';
import { useCapacidades } from '@/lib/navigation/useCapacidades';
import { rutaSeccion } from '@/components/configuracion/config/configSectionsRegistry';
import { abrirConfiguracion } from '@/components/configuracion/dialogo/abrirConfiguracion';
import { destinoPestanaChat, pestanaChatActiva, esRutaBandeja } from './chatNavLogica';

/** Sección del diálogo de Configuración que abre la pestaña «Configuración». */
const SECCION_CONFIG_CHAT = 'chat.general';

export function ChatNavTabs({ className }: { className?: string }) {
  const pathname = usePathname() ?? '';
  const t = useTranslations('chatModulo.pestanas');
  const tNav = useTranslations('chatRecuperado.nav');
  const nombres = useNombresNav();
  const nav = useNavegacionVisible();
  const visibles = usePaginasModulo('chat');
  // Chat › General pide administrador (`PERMISO_ADMIN`): lo resuelve `/api/me/capacidades`.
  const { datos: capacidades } = useCapacidades();

  // Sin proveedor (fuera del shell): todo el catálogo del módulo.
  const paginas: PaginaNav[] | null = nav
    ? visibles
    : (moduloPorCodigo('chat')?.paginas.filter((p) => p.enMenu !== false) ?? []);

  const activa = paginas ? pestanaChatActiva(pathname, paginas.map((p) => p.href)) : null;
  // Rueda, arrastre y táctil cuando las pestañas no caben (la barra de scroll va oculta).
  const barra = useDesplazamientoHorizontal<HTMLElement>('[aria-current="page"]', activa);

  return (
    <div className={cn('flex items-center gap-3 border-b border-line bg-surface px-4 lg:px-6', className)}>
      <nav
        ref={barra}
        aria-label={t('etiqueta')}
        className="-mb-px flex min-w-0 flex-1 items-end gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {paginas === null
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="my-3 h-5 w-20 shrink-0" />)
          : paginas.map((p) => {
              const esActiva = p.href === activa;
              return (
                <Link
                  key={p.href}
                  href={destinoPestanaChat(p.href)}
                  aria-current={esActiva ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
                    esActiva ? 'border-brand text-brand-deep' : 'border-transparent text-fg-secondary hover:text-fg',
                  )}
                >
                  {nombres.pagina(p)}
                </Link>
              );
            })}
        {paginas !== null && capacidades.esAdmin ? (
          <Link
            href={rutaSeccion(SECCION_CONFIG_CHAT)}
            onClick={(e) => {
              // `defaultPrevented`: el diálogo ya interceptó el enlace (ver `ConfiguracionDialogoRaiz`).
              if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              abrirConfiguracion({ seccionId: SECCION_CONFIG_CHAT });
            }}
            aria-haspopup="dialog"
            className={cn(
              'inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-fg-secondary transition-colors hover:text-fg',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
            )}
          >
            <Settings aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
            {tNav('configuracion')}
          </Link>
        ) : null}
      </nav>
      {esRutaBandeja(pathname) && (
        <Link href="/app/chat/conversaciones/nueva" className={clasesBoton({ tamano: 'sm', className: 'my-1.5' })}>
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('nuevaConversacion')}
        </Link>
      )}
    </div>
  );
}

export default ChatNavTabs;
