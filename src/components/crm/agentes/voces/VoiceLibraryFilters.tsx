"use client";

/**
 * Búsqueda y filtros de la biblioteca de voces, arriba, con chips de filtro
 * activos visibles (brief UX §3, referencia ElevenLabs «Voces › Explorar»).
 *
 * UX móvil (UXM-D): a 375 px los tres selectores ya no se apilan ocupando media
 * pantalla; se pliegan tras un botón «Filtros» (con el número de filtros
 * activos) y el contador «24 de 7.992 voces» queda junto a la búsqueda.
 */

import React, { useState } from "react";
import { flushSync } from "react-dom";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlidersHorizontal, X } from "lucide-react";
import {
  GENDER_LABELS,
  LANGUAGE_LABELS,
  LANGUAGE_OPTIONS,
  USE_CASE_LABELS,
} from "@/lib/services/crm/voiceLibrary";
import { DEFAULT_LIBRARY_FILTERS, type LibraryUiFilters } from "./useVoiceLibrary";
import { SearchInput } from "@/components/kit/SearchInput";
import { useTranslations } from "next-intl";

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

function activeChips(f: LibraryUiFilters, todosIdiomas: string): Chip[] {
  const chips: Chip[] = [];
  if (f.search.trim()) chips.push({ key: "search", label: `«${f.search.trim()}»` });
  if (f.language !== DEFAULT_LIBRARY_FILTERS.language) {
    chips.push({ key: "language", label: f.language === "all" ? todosIdiomas : LANGUAGE_LABELS[f.language] ?? f.language });
  }
  if (f.gender) chips.push({ key: "gender", label: GENDER_LABELS[f.gender] ?? f.gender });
  if (f.use_case) chips.push({ key: "use_case", label: USE_CASE_LABELS[f.use_case] ?? f.use_case });
  return chips;
}

const chipId = (key: keyof LibraryUiFilters) => `lib-chip-${key}`;

export function VoiceLibraryFilters({ filters, onChange, onClear, resultCount, totalCount }: Props) {
  const t = useTranslations("crm.agentesIa");
  const chips = activeChips(filters, t("voiceLibraryFilters.todosIdiomas"));

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

  const selectCount = chips.filter((c) => c.key !== "search").length;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const countText = totalCount > 0 ? t("voiceLibraryFilters.conteo", { n: resultCount, total: totalCount }) : "";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {/* El hook `useVoiceLibrary` ya aplica su propio retardo antes de consultar. */}
        <SearchInput
          id="lib-search"
          value={filters.search}
          onChange={(v) => onChange("search", v)}
          onValueChange={(v) => onChange("search", v)}
          placeholder={t("voiceLibraryFilters.buscarNombreAcentoEstilo")}
          etiqueta={t("voiceLibraryFilters.buscarVozNombreDescripcion")}
          className="min-w-0 flex-1"
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0 gap-1.5 md:hidden"
          aria-expanded={filtersOpen}
          aria-controls="lib-filter-controls"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          {t("voiceLibraryFilters.filtros")}
          {selectCount > 0 && (
            <span className="rounded-full bg-blue-600 px-1.5 text-xs font-semibold text-white" aria-label={selectCount === 1 ? t("voiceLibraryFilters.n1Activo") : t("voiceLibraryFilters.activos", { selectCount })}>
              {selectCount}
            </span>
          )}
        </Button>
        <span className="hidden shrink-0 text-xs tabular-nums text-gray-600 dark:text-gray-300 md:inline" role="status" aria-live="polite">
          {countText}
        </span>
      </div>

      <div
        id="lib-filter-controls"
        className={`${filtersOpen ? "grid" : "hidden"} grid-cols-1 gap-2 md:grid md:grid-cols-3`}
      >
        <div>
          <Label htmlFor="lib-language" className="sr-only">{t("voiceLibraryFilters.idioma")}</Label>
          <Select value={filters.language || ALL} onValueChange={(v) => onChange("language", v === ALL ? "all" : v)}>
            <SelectTrigger id="lib-language" className="w-full" aria-label={t("voiceLibraryFilters.idioma")}>
              <SelectValue placeholder={t("voiceLibraryFilters.idioma")} />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((code) => (
                <SelectItem key={code} value={code}>{LANGUAGE_LABELS[code] ?? code}</SelectItem>
              ))}
              <SelectItem value="all">{t("voiceLibraryFilters.todosIdiomas")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="lib-gender" className="sr-only">{t("voiceLibraryFilters.generoVoz")}</Label>
          <Select value={filters.gender || ALL} onValueChange={(v) => onChange("gender", v === ALL ? "" : v)}>
            <SelectTrigger id="lib-gender" className="w-full" aria-label={t("voiceLibraryFilters.generoVoz")}>
              <SelectValue placeholder={t("voiceLibraryFilters.genero")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("voiceLibraryFilters.cualquierGenero")}</SelectItem>
              {Object.entries(GENDER_LABELS).map(([v, label]) => (
                <SelectItem key={v} value={v}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="lib-usecase" className="sr-only">{t("voiceLibraryFilters.casoUso")}</Label>
          <Select value={filters.use_case || ALL} onValueChange={(v) => onChange("use_case", v === ALL ? "" : v)}>
            <SelectTrigger id="lib-usecase" className="w-full" aria-label={t("voiceLibraryFilters.casoUso")}>
              <SelectValue placeholder={t("voiceLibraryFilters.casoUso")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("voiceLibraryFilters.cualquierUso")}</SelectItem>
              {Object.entries(USE_CASE_LABELS).map(([v, label]) => (
                <SelectItem key={v} value={v}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
        {chips.length > 0 ? (
          <ul className="flex flex-wrap items-center gap-1.5" aria-label={t("voiceLibraryFilters.filtrosActivos")}>
            {chips.map((chip) => (
              <li key={chip.key}>
                <button
                  type="button"
                  id={chipId(chip.key)}
                  onClick={() => removeChip(chip.key)}
                  aria-label={t("voiceLibraryFilters.quitarFiltro", { label: chip.label })}
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
                {t("voiceLibraryFilters.limpiarFiltros")}
              </Button>
            </li>
          </ul>
        ) : (
          <span>{t("voiceLibraryFilters.espanolPrimeroCambiaIdioma")}</span>
        )}
        <span className="ml-auto tabular-nums md:hidden" role="status" aria-live="polite">
          {countText}
        </span>
      </div>
    </div>
  );
}
