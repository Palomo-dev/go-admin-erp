import type { ReactNode } from 'react';
import { MarcoChat } from '@/components/chat/MarcoChat';

/** Pestañas del módulo Chat en todas sus páginas (Figma 91). */
export default function ChatLayout({ children }: { children: ReactNode }) {
  return <MarcoChat>{children}</MarcoChat>;
}
