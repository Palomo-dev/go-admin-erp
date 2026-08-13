'use client';

import ModuleRootRedirect from '@/components/inicio/ModuleRootRedirect';

/**
 * /app/chat redirige a la primera página activa del módulo Chat.
 * El dashboard se consolidó en /app/inicio#chat.
 */
export default function ChatPage() {
  return <ModuleRootRedirect moduleCode="chat" />;
}
