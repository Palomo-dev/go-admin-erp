"use client";

/**
 * Búsqueda y filtros de la biblioteca de voces, arriba, con chips de filtro
 * activos visibles (brief UX §3, referencia ElevenLabs «Voces › Explorar»).
 */

import React from "react";
import { flushSync } from "react-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X } from "lucide-react";
import {
  GENDER_LABELS,
  LANGUAGE_LABELS,
  LANGUAGE_OPTIONS,
  USE_CASE_LABELS,
} from "@/lib/services/crm/voiceLibrary";
import { DEFAULT_LIBRARY_FILTERS, type LibraryUiFilters } from "./useVoiceLibrary";

const ALL = "__all__";

interface Props {
  filters: LibraryUiFilters;
  onChange: (key: keyof LibraryUiFilters, value: string) => void;
  onClear: () => void;
  resultCount: number;
  totalCount: number;
}

interface Chip {
  key: keyof LibraryUiFilters;
  label: string;
}

function activeChips(f: LibraryUiFilters): Chip[] {
  const chips: Chip[] = [];
  if (f.search.trim()) chips.push({ key: "search", label: `«${f.search.trim()}»` });
  if (f.language !== DEFAULT_LIBRARY_FILTERS.language) {
    chips.push({ key: "language", label: f.language === "all" ? "Todos los idiomas" : LANGUAGE_LABELS[f.language] ?? f.language });
  }
  if (f.gender) chips.push({ key: "gender", label: GENDER_LABELS[f.gender] ?? f.gender });
  if (f.use_case) chips.push({ key: "use_case", label: USE_CASE_LABELS[f.use_case] ?? f.use_case });
  return chips;
}

const chipId = (key: keyof LibraryUiFilters) => `lib-chip-${key}`;

export function VoiceLibraryFilters({ filters, onChange, onClear, resultCount, totalCount }: Props) {
  const chips = activeChips(filters);

  // R2: al quitar un chip su botón desaparece; el foco pasa al chip siguiente (o
  // anterior) y, si era el último, al campo de búsqueda. Nunca al `body`.
  // Ronda 3: `flushSync` en vez de rAF (con la ventana oculta rAF no dispara).
  const removeChip = (key: keyof LibraryUiFilters) => {
    const idx = chips.findIndex((c) => c.key === key);
    const remaining = chips.filter((c) => c.key !== key);
    const next = remaining[idx] ?? remaining[idx - 1] ?? null;
    flushSync(() => onChange(key, DEFAULT_LIBRARY_FILTERS[key]));
    const target = next ? document.getElementById(chipId(next.key)) : document.getElementById("lib-search");
    target?.focus();
  };
  const clearAll = () => {
    flushSync(() => onClear());
    document.getElementById("lib-search")?.focus();
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Label htmlFor="lib-search" className="sr-only">
            Buscar voz por nombre o descripción
          </Label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <Input
            id="lib-search"
            type="search"
            value={filters.search}
            onChange={(e) => onChange("search", e.target.value)}
            placeholder="Buscar por nombre, acento o estilo…"
            className="pl-9"
            autoComplete="off"
          />
        </div>

        <div>
          <Label htmlFor="lib-language" className="sr-only">Idioma</Label>
          <Select value={filters.language || ALL} onValueChange={(v) => onChange("language", v === ALL ? "all" : v)}>
            <SelectTrigger id="lib-language" className="w-full md:w-[160px]" aria-label="Idioma">
              <SelectValue placeholder="Idioma" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((code) => (
                <SelectItem key={code} value={code}>{LANGUAGE_LABELS[code] ?? code}</SelectItem>
              ))}
              <SelectItem value="all">Todos los idiomas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="lib-gender" className="sr-only">Género de la voz</Label>
          <Select value={filters.gender || ALL} onValueChange={(v) => onChange("gender", v === ALL ? "" : v)}>
            <SelectTrigger id="lib-gender" className="w-full md:w-[150px]" aria-label="Género de la voz">
              <SelectValue placeholder="Género" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Cualquier género</SelectItem>
              {Object.entries(GENDER_LABELS).map(([v, label]) => (
                <SelectItem key={v} value={v}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="lib-usecase" className="sr-only">Caso de uso</Label>
          <Select value={filters.use_case || ALL} onValueChange={(v) => onChange("use_case", v === ALL ? "" : v)}>
            <SelectTrigger id="lib-usecase" className="w-full md:w-[200px]" aria-label="Caso de uso">
              <SelectValue placeholder="Caso de uso" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Cualquier uso</SelectItem>
              {Object.entries(USE_CASE_LABELS).map(([v, label]) => (
                <SelectItem key={v} value={v}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
        {chips.length > 0 ? (
          <ul className="flex flex-wrap items-center gap-1.5" aria-label="Filtros activos">
            {chips.map((chip) => (
              <li key={chip.key}>
                <button
                  type="button"
                  id={chipId(chip.key)}
                  onClick={() => removeChip(chip.key)}
                  aria-label={`Quitar filtro ${chip.label}`}
                  className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 font-medium text-blue-800 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100 dark:hover:bg-blue-900"
                >
                  {chip.label}
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </li>
            ))}
            <li>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={clearAll}
              >
                Limpiar filtros
              </Button>
            </li>
          </ul>
        ) : (
          <span>Español primero. Cambia el idioma, el género o el uso para afinar.</span>
        )}
        <span className="ml-auto tabular-nums" role="status" aria-live="polite">
          {totalCount > 0 ? `${resultCount} de ${totalCount.toLocaleString("es-CO")} voces` : ""}
        </span>
      </div>
    </div>
  );
}
