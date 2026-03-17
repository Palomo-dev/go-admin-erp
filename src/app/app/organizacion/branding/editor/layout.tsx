import React from 'react';

// Layout para el editor visual del page builder.
// El editor maneja su propia estructura interna (header + sidebar + preview).
export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
