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
 * En la Bandeja el lado derecho lleva «Nueva conversación».
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { Skeleton } from '@/components/ui/skeleton';
import { moduloPorCodigo, type PaginaNav } from '@/lib/navigation/catalog';
import { usePaginasModulo, useNavegacionVisible } from '@/lib/navigation/NavegacionVisible';
import { useNombresNav } from '@/lib/navigation/useNombresNav';
import { clasesBoton } from '@/components/kit';
import { destinoPestanaChat, pestanaChatActiva, esRutaBandeja } from './chatNavLogica';

export function ChatNavTabs({ className }: { className?: string }) {
  const pathname = usePathname() ?? '';
  const t = useTranslations('chatModulo.pestanas');
  const nombres = useNombresNav();
  const nav = useNavegacionVisible();
  const visibles = usePaginasModulo('chat');

  // Sin proveedor (fuera del shell): todo el catálogo del módulo.
  const paginas: PaginaNav[] | null = nav
    ? visibles
    : (moduloPorCodigo('chat')?.paginas.filter((p) => p.enMenu !== false) ?? []);

  const activa = paginas ? pestanaChatActiva(pathname, paginas.map((p) => p.href)) : null;

  return (
    <div className={cn('flex items-center gap-3 border-b border-line bg-surface px-4 lg:px-6', className)}>
      <nav aria-label={t('etiqueta')} className="-mb-px flex min-w-0 flex-1 items-end gap-1 overflow-x-auto [scrollbar-width:none]">
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
