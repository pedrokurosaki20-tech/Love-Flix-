import React from 'react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  COUNTRIES_LIST,
  DECADES_LIST,
  LANGUAGES_LIST,
  type DiscoverFilterParams,
  type TMDBGenre,
} from '../types/tmdb';

interface FilterBarProps {
  filters: DiscoverFilterParams;
  onChange: (next: DiscoverFilterParams) => void;
  onReset: () => void;
  genres: TMDBGenre[];
  mediaMode: 'movie' | 'tv';
  hideCountry?: boolean;
  hideLanguage?: boolean;
}

const YEARS = Array.from({ length: 47 }, (_, i) => String(2026 - i));

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onChange,
  onReset,
  genres,
  mediaMode,
  hideCountry = false,
  hideLanguage = false,
}) => {
  const activeCount = [
    filters.genre,
    filters.year,
    filters.decade,
    filters.minRating,
    filters.language,
    filters.country,
    filters.status,
    filters.sortBy && filters.sortBy !== 'popularity.desc' ? filters.sortBy : '',
  ].filter(Boolean).length;

  const updateField = (key: keyof DiscoverFilterParams, value: string) => {
    const next: DiscoverFilterParams = {
      ...filters,
      [key]: value || undefined,
      page: 1,
    };
    if (key === 'year' && value) next.decade = undefined;
    if (key === 'decade' && value) next.year = undefined;
    onChange(next);
  };

  const selectClass =
    'w-full h-10 px-3 rounded-xl bg-[#141414] hover:bg-[#1a1a1a] text-xs sm:text-sm text-white border border-white/[0.09] focus:outline-none focus:border-[#E50914] transition-colors cursor-pointer';

  return (
    <div className="rounded-2xl bg-[#121212] border border-white/[0.08] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <SlidersHorizontal className="w-4 h-4 text-[#FF253A]" />
          <h3 className="text-sm font-bold text-white">Filtros Avançados</h3>
          {activeCount > 0 && (
            <span className="text-xs font-mono tabular-nums text-[#FF253A]">
              · {activeCount} {activeCount === 1 ? 'ativo' : 'ativos'}
            </span>
          )}
        </div>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1c1c1c] hover:bg-[#252525] text-xs font-semibold text-white border border-white/10 transition-colors cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#FF253A]" />
            <span>Limpar filtros</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {/* Gênero */}
        <div>
          <label className="block text-[11px] font-semibold text-[#A1A1A1] mb-1">Gênero</label>
          <select
            value={filters.genre || ''}
            onChange={(e) => updateField('genre', e.target.value)}
            className={selectClass}
          >
            <option value="">Todos os gêneros</option>
            {genres.map((g) => (
              <option key={g.id} value={String(g.id)}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        {/* Ordenação / Popularidade / Avaliação */}
        <div>
          <label className="block text-[11px] font-semibold text-[#A1A1A1] mb-1">Ordenar por</label>
          <select
            value={filters.sortBy || 'popularity.desc'}
            onChange={(e) => updateField('sortBy', e.target.value)}
            className={selectClass}
          >
            <option value="popularity.desc">Mais populares</option>
            <option value="vote_average.desc">Mais bem avaliados</option>
            <option
              value={
                mediaMode === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc'
              }
            >
              Lançamentos recentes
            </option>
            <option
              value={mediaMode === 'tv' ? 'first_air_date.asc' : 'primary_release_date.asc'}
            >
              Ordem de lançamento (antigos)
            </option>
            <option value="vote_count.desc">Mais votados da TMDB</option>
          </select>
        </div>

        {/* Ano */}
        <div>
          <label className="block text-[11px] font-semibold text-[#A1A1A1] mb-1">Ano</label>
          <select
            value={filters.year || ''}
            onChange={(e) => updateField('year', e.target.value)}
            className={selectClass}
          >
            <option value="">Qualquer ano</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {/* Década */}
        <div>
          <label className="block text-[11px] font-semibold text-[#A1A1A1] mb-1">Década</label>
          <select
            value={filters.decade || ''}
            onChange={(e) => updateField('decade', e.target.value)}
            className={selectClass}
          >
            <option value="">Todas as décadas</option>
            {DECADES_LIST.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        {/* Nota mínima */}
        <div>
          <label className="block text-[11px] font-semibold text-[#A1A1A1] mb-1">
            Nota mínima
          </label>
          <select
            value={filters.minRating || ''}
            onChange={(e) => updateField('minRating', e.target.value)}
            className={selectClass}
          >
            <option value="">Qualquer nota</option>
            <option value="8">Acima de 8.0</option>
            <option value="7.5">Acima de 7.5</option>
            <option value="7">Acima de 7.0</option>
            <option value="6">Acima de 6.0</option>
            <option value="5">Acima de 5.0</option>
          </select>
        </div>

        {/* País de origem */}
        {!hideCountry && (
          <div>
            <label className="block text-[11px] font-semibold text-[#A1A1A1] mb-1">
              País de origem
            </label>
            <select
              value={filters.country || ''}
              onChange={(e) => updateField('country', e.target.value)}
              className={selectClass}
            >
              <option value="">Todos os países</option>
              {COUNTRIES_LIST.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Idioma ou Status de Série */}
        {mediaMode === 'tv' ? (
          <div>
            <label className="block text-[11px] font-semibold text-[#A1A1A1] mb-1">
              Situação da série
            </label>
            <select
              value={filters.status || ''}
              onChange={(e) => updateField('status', e.target.value)}
              className={selectClass}
            >
              <option value="">Todas</option>
              <option value="0">Em andamento</option>
              <option value="3">Finalizadas</option>
              <option value="4">Canceladas</option>
            </select>
          </div>
        ) : (
          !hideLanguage && (
            <div>
              <label className="block text-[11px] font-semibold text-[#A1A1A1] mb-1">
                Idioma original
              </label>
              <select
                value={filters.language || ''}
                onChange={(e) => updateField('language', e.target.value)}
                className={selectClass}
              >
                <option value="">Todos os idiomas</option>
                {LANGUAGES_LIST.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )
        )}
      </div>
    </div>
  );
};
