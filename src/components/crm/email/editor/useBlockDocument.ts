'use client';

/**
 * Estado del documento de bloques con historial (undo/redo 50 pasos),
 * selección y operaciones inmutables. Compartido por el editor de plantillas
 * y (ronda 2) por ComposeEmailDialog.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { createBlock, emptyDocument, newBlockId, type Block, type BlockDocument, type BlockSettings, type BlockType } from '@/lib/services/crm/email/blocks';

const HISTORY = 50;

export interface BlockDocumentApi {
  doc: BlockDocument;
  selectedId: string | null;
  selected: Block | null;
  select: (id: string | null) => void;
  replace: (doc: BlockDocument) => void;
  update: (id: string, props: Record<string, unknown>) => void;
  updateSettings: (patch: Partial<BlockSettings> | { brand: Partial<BlockSettings['brand']> }) => void;
  insert: (type: BlockType, index?: number) => string;
  move: (fromIndex: number, toIndex: number) => void;
  moveBy: (id: string, delta: number) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useBlockDocument(initial?: BlockDocument | null, onChange?: (doc: BlockDocument) => void): BlockDocumentApi {
  const [doc, setDoc] = useState<BlockDocument>(() => initial ?? emptyDocument());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const past = useRef<BlockDocument[]>([]);
  const future = useRef<BlockDocument[]>([]);
  const [, bump] = useState(0);

  const replace = useCallback((next: BlockDocument) => {
    past.current = [];
    future.current = [];
    setDoc(next);
    setSelectedId(null);
    onChange?.(next);
    bump((n) => n + 1);
  }, [onChange]);

  const update = useCallback((id: string, props: Record<string, unknown>) => {
    setDoc((prev) => {
      const next = { ...prev, blocks: prev.blocks.map((b) => (b.id === id ? ({ ...b, props: { ...b.props, ...props } } as Block) : b)) };
      past.current = [...past.current.slice(-(HISTORY - 1)), prev];
      future.current = [];
      onChange?.(next);
      return next;
    });
    bump((n) => n + 1);
  }, [onChange]);

  const updateSettings = useCallback((patch: Partial<BlockSettings> | { brand: Partial<BlockSettings['brand']> }) => {
    setDoc((prev) => {
      const brand = 'brand' in patch && patch.brand ? { ...prev.settings.brand, ...patch.brand } : prev.settings.brand;
      const next = { ...prev, settings: { ...prev.settings, ...(patch as Partial<BlockSettings>), brand } };
      past.current = [...past.current.slice(-(HISTORY - 1)), prev];
      future.current = [];
      onChange?.(next);
      return next;
    });
    bump((n) => n + 1);
  }, [onChange]);

  const insert = useCallback((type: BlockType, index?: number) => {
    const block = createBlock(type);
    setDoc((prev) => {
      const blocks = [...prev.blocks];
      const at = index === undefined ? blocks.length : Math.max(0, Math.min(blocks.length, index));
      blocks.splice(at, 0, block);
      const next = { ...prev, blocks };
      past.current = [...past.current.slice(-(HISTORY - 1)), prev];
      future.current = [];
      onChange?.(next);
      return next;
    });
    setSelectedId(block.id);
    bump((n) => n + 1);
    return block.id;
  }, [onChange]);

  const move = useCallback((from: number, to: number) => {
    if (from === to) return;
    setDoc((prev) => {
      const blocks = [...prev.blocks];
      const [item] = blocks.splice(from, 1);
      blocks.splice(to, 0, item);
      const next = { ...prev, blocks };
      past.current = [...past.current.slice(-(HISTORY - 1)), prev];
      future.current = [];
      onChange?.(next);
      return next;
    });
    bump((n) => n + 1);
  }, [onChange]);

  const moveBy = useCallback((id: string, delta: number) => {
    const idx = doc.blocks.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const to = Math.max(0, Math.min(doc.blocks.length - 1, idx + delta));
    move(idx, to);
  }, [doc.blocks, move]);

  const remove = useCallback((id: string) => {
    setDoc((prev) => {
      const next = { ...prev, blocks: prev.blocks.filter((b) => b.id !== id) };
      past.current = [...past.current.slice(-(HISTORY - 1)), prev];
      future.current = [];
      onChange?.(next);
      return next;
    });
    setSelectedId((s) => (s === id ? null : s));
    bump((n) => n + 1);
  }, [onChange]);

  const duplicate = useCallback((id: string) => {
    setDoc((prev) => {
      const idx = prev.blocks.findIndex((b) => b.id === id);
      if (idx < 0) return prev;
      const copy = { ...prev.blocks[idx], id: newBlockId(prev.blocks[idx].type), props: { ...prev.blocks[idx].props } } as Block;
      const blocks = [...prev.blocks];
      blocks.splice(idx + 1, 0, copy);
      const next = { ...prev, blocks };
      past.current = [...past.current.slice(-(HISTORY - 1)), prev];
      future.current = [];
      onChange?.(next);
      return next;
    });
    bump((n) => n + 1);
  }, [onChange]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    setDoc((cur) => {
      future.current = [cur, ...future.current].slice(0, HISTORY);
      onChange?.(prev);
      return prev;
    });
    bump((n) => n + 1);
  }, [onChange]);

  const redo = useCallback(() => {
    const next = future.current.shift();
    if (!next) return;
    setDoc((cur) => {
      past.current = [...past.current.slice(-(HISTORY - 1)), cur];
      onChange?.(next);
      return next;
    });
    bump((n) => n + 1);
  }, [onChange]);

  const selected = useMemo(() => doc.blocks.find((b) => b.id === selectedId) ?? null, [doc.blocks, selectedId]);

  return {
    doc, selectedId, selected, select: setSelectedId, replace, update, updateSettings, insert, move, moveBy, remove, duplicate, undo, redo,
    canUndo: past.current.length > 0, canRedo: future.current.length > 0,
  };
}
