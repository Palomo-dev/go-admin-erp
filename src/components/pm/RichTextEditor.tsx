'use client';

// Re-exporta el editor canónico desde shared para mantener compatibilidad
// con los drawers de PM (ProjectCreationPanel, GoalCreationPanel, TaskCreationPanel).
// La fuente canónica ahora vive en src/components/shared/RichTextEditor.tsx.
export { RichTextEditor, default } from '@/components/shared/RichTextEditor';
export type { RichTextEditorProps } from '@/components/shared/RichTextEditor';
