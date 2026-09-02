import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { SearchResult, GisLevel } from '../types';
import {
  Search,
  MapPin,
  X,
  Loader2,
  Clock,
  Trash2,
  CheckCircle2,
  Layers,
  ArrowRight,
  Sparkles,
  Building2,
  Compass,
  Home,
  FileSpreadsheet,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { apiUrl, API_BASE } from '@/frontend/lib/api';

interface SearchBarProps {
  onSelectResult: (result: SearchResult) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
  onRefreshMap?: () => void;
}

type CategoryFilter = 'district' | 'taluk' | 'village' | 'parcel';

const RECENT_SEARCHES_KEY = 'gis_recent_searches_v2';
const MAX_RECENT = 6;

// Popular default shortcuts for quick exploration
const QUICK_SUGGESTIONS: Array<{ name: string; query: string; level: GisLevel; desc: string }> = [
  { name: 'Ponneri', query: 'Ponneri', level: 'taluk', desc: 'Taluk • Tiruvallur (01)' },
  { name: 'Minjur', query: 'Minjur', level: 'village', desc: 'Village (001) • Ponneri' },
  { name: 'Tiruvallur', query: 'Tiruvallur', level: 'district', desc: 'District (01) • TN' },
  { name: 'Harur', query: 'Harur', level: 'taluk', desc: 'Taluk • Dharmapuri (05)' },
  { name: 'Athipattu', query: 'Athipattu', level: 'village', desc: 'Village (002) • Ponneri' },
];

/**
 * Highlights matches of query within text
 */
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query || !query.trim() || !text) {
    return <span>{text}</span>;
  }

  const terms = query
    .toLowerCase()
    .split(/[\s,_\-\.\/]+/)
    .filter((t) => t.length > 0);

  if (terms.length === 0) return <span>{text}</span>;

  // Build regex matching any of the terms
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  return (
    <span>
      {parts.map((part, idx) => {
        const isMatch = terms.some((term) => term.toLowerCase() === part.toLowerCase());
        return isMatch ? (
          <span key={idx} className="font-extrabold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60 px-0.5 rounded">
            {part}
          </span>
        ) : (
          <span key={idx}>{part}</span>
        );
      })}
    </span>
  );
}

export const SearchBar: React.FC<SearchBarProps> = ({
  onSelectResult,
  placeholder = 'Search Village, Taluk, District, or Survey (Name / Code)...',
  className = '',
  autoFocus = false,
  onToggleSidebar,
  isSidebarOpen = false,
  onRefreshMap,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<CategoryFilter>('district');
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>([]);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-focus when autoFocus prop is true
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [autoFocus]);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (saved) {
        setRecentSearches(JSON.parse(saved));
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const saveRecentSearch = (item: SearchResult) => {
    try {
      const filtered = recentSearches.filter((r) => r.code !== item.code);
      const updated = [item, ...filtered].slice(0, MAX_RECENT);
      setRecentSearches(updated);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch {
      // Ignore
    }
  };

  const clearRecentSearches = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {
      // Ignore
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch all search results across all categories with debouncing
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSelectedIndex(-1);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query.trim())}&limit=100`);
        const json = await res.json();
        if (json.success) {
          const items: SearchResult[] = json.data || [];
          setResults(items);
          setOpen(true);
          setSelectedIndex(-1);
          // Auto-select first available tier (district -> taluk -> village -> parcel)
          setSelectedFilter((prev) => {
            if (items.some((it) => it.level === prev)) return prev;
            if (items.some((it) => it.level === 'district')) return 'district';
            if (items.some((it) => it.level === 'taluk')) return 'taluk';
            if (items.some((it) => it.level === 'village')) return 'village';
            if (items.some((it) => it.level === 'parcel')) return 'parcel';
            return 'district';
          });
        }
      } catch (err) {
        console.error('Search query failed:', err);
      } finally {
        setLoading(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  // Filter results by selected category tab
  const filteredResults = useMemo(() => {
    return results.filter((r) => r.level === selectedFilter);
  }, [results, selectedFilter]);

  // Result counts per category
  const counts = useMemo(() => {
    const map = { village: 0, taluk: 0, district: 0, parcel: 0 };
    results.forEach((r) => {
      if (r.level in map) {
        map[r.level]++;
      }
    });
    return map;
  }, [results]);

  const handleSelect = useCallback((r: SearchResult) => {
    saveRecentSearch(r);
    onSelectResult(r);
    setOpen(false);
    setQuery('');
    setSelectedIndex(-1);
  }, [onSelectResult, recentSearches]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }

    const currentList = query.trim() ? filteredResults : recentSearches;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < currentList.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : currentList.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < currentList.length) {
        handleSelect(currentList[selectedIndex]);
      } else if (filteredResults.length > 0) {
        handleSelect(filteredResults[0]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  const LEVEL_CONFIG: Record<
    GisLevel,
    {
      bgLight: string;
      bgDark: string;
      color: string;
      label: string;
      badgeClass: string;
      Icon: React.ElementType;
    }
  > = {
    district: {
      bgLight: '#e0f2fe',
      bgDark: '#082f49',
      color: '#0284c7',
      label: 'DISTRICT',
      badgeClass: 'bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',
      Icon: Building2,
    },
    taluk: {
      bgLight: '#fef3c7',
      bgDark: '#451a03',
      color: '#f59e0b',
      label: 'TALUK',
      badgeClass: 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      Icon: Compass,
    },
    village: {
      bgLight: '#dcfce7',
      bgDark: '#052e16',
      color: '#10b981',
      label: 'VILLAGE',
      badgeClass: 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      Icon: Home,
    },
    parcel: {
      bgLight: '#ffe4e6',
      bgDark: '#4c0519',
      color: '#ef4444',
      label: 'SURVEY',
      badgeClass: 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
      Icon: FileSpreadsheet,
    },
  };

  return (
    <div ref={wrapperRef} className={`relative w-full ${className}`}>
      {/* Pill Search Input Container matching Startup Genome / Modern Portal Style */}
      <div className="relative flex items-center bg-slate-100/90 dark:bg-slate-800/90 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 rounded-full shadow-2xs hover:shadow-xs focus-within:bg-white dark:focus-within:bg-slate-900 focus-within:shadow-sm focus-within:border-cyan-500 dark:focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-400/20 transition-all duration-150 px-3 py-1.5 gap-2">
        {/* Search Icon / Emoji on the left */}
        <Search className="w-4 h-4 text-cyan-600 dark:text-cyan-400 stroke-[2.5] shrink-0" />

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            setOpen(true);
            if (val.trim().length > 0 && isSidebarOpen && onToggleSidebar) {
              onToggleSidebar();
            }
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-transparent text-slate-800 dark:text-slate-100 text-xs font-medium py-1 focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 placeholder:font-normal font-sans"
        />

        {/* Right Controls: Clear button + Filter icon */}
        <div className="flex items-center gap-1.5 shrink-0">
          {loading && <Loader2 className="w-3.5 h-3.5 text-cyan-600 animate-spin" />}

          {query && !loading && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setResults([]);
                inputRef.current?.focus();
              }}
              className="w-4 h-4 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-2xs"
              title="Clear search"
            >
              <X className="w-2.5 h-2.5 stroke-[2.5]" />
            </button>
          )}

          {onRefreshMap && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRefreshMap();
              }}
              title="Apply Filters & Refresh Map"
              className="p-1.5 rounded-full transition-all cursor-pointer flex items-center justify-center shrink-0 active:scale-95 border bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white border-emerald-200 dark:border-emerald-800"
            >
              <RefreshCw className="w-3.5 h-3.5 stroke-[2.3]" />
            </button>
          )}

          {onToggleSidebar && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSidebar();
              }}
              title={isSidebarOpen ? "Hide Navigation Panel (Filters)" : "Open Navigation Panel (Filters)"}
              className={`p-1.5 rounded-full transition-all cursor-pointer flex items-center justify-center shrink-0 active:scale-95 border ${
                isSidebarOpen
                  ? 'bg-cyan-500 text-white border-cyan-400 shadow-2xs'
                  : 'bg-cyan-50 dark:bg-cyan-950/80 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500 hover:text-white border-cyan-200 dark:border-cyan-800'
              }`}
            >
              <Filter className="w-3.5 h-3.5 stroke-[2.3]" />
            </button>
          )}
        </div>
      </div>

      {/* Autocomplete Suggestions Dropdown (Compact Single-Line Google Maps Style) */}
      {open && (query.trim().length > 0 || recentSearches.length > 0) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white/98 dark:bg-slate-900/98 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 overflow-hidden flex flex-col max-h-64 animate-in fade-in duration-100">
          {/* 1. Category Filter Chips (Districts, Taluks, Villages, Surveys) - Perfectly Fitted */}
          {query.trim().length > 0 && results.length > 0 && (
            <div className="p-0.5 border-b border-slate-100 dark:border-slate-800/80 grid grid-flow-col auto-cols-fr gap-0.5 bg-slate-50/90 dark:bg-slate-950/60 shrink-0 w-full">
              {counts.district > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFilter('district');
                  }}
                  title={`Districts (${counts.district})`}
                  className={`px-1 py-1 rounded-md text-[9.5px] font-extrabold transition-all flex items-center justify-center gap-0.5 min-w-0 cursor-pointer ${
                    selectedFilter === 'district'
                      ? 'bg-sky-600 text-white shadow-2xs font-black'
                      : 'text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/50'
                  }`}
                >
                  <Building2 className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">Districts</span>
                  <span className="opacity-85 font-mono text-[8.5px] shrink-0">({counts.district})</span>
                </button>
              )}

              {counts.taluk > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFilter('taluk');
                  }}
                  title={`Taluks (${counts.taluk})`}
                  className={`px-1 py-1 rounded-md text-[9.5px] font-extrabold transition-all flex items-center justify-center gap-0.5 min-w-0 cursor-pointer ${
                    selectedFilter === 'taluk'
                      ? 'bg-indigo-600 text-white shadow-2xs font-black'
                      : 'text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50'
                  }`}
                >
                  <Compass className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">Taluks</span>
                  <span className="opacity-85 font-mono text-[8.5px] shrink-0">({counts.taluk})</span>
                </button>
              )}

              {counts.village > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFilter('village');
                  }}
                  title={`Villages (${counts.village})`}
                  className={`px-1 py-1 rounded-md text-[9.5px] font-extrabold transition-all flex items-center justify-center gap-0.5 min-w-0 cursor-pointer ${
                    selectedFilter === 'village'
                      ? 'bg-emerald-600 text-white shadow-2xs font-black'
                      : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
                  }`}
                >
                  <Home className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">Villages</span>
                  <span className="opacity-85 font-mono text-[8.5px] shrink-0">({counts.village})</span>
                </button>
              )}

              {counts.parcel > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFilter('parcel');
                  }}
                  title={`Surveys (${counts.parcel})`}
                  className={`px-1 py-1 rounded-md text-[9.5px] font-extrabold transition-all flex items-center justify-center gap-0.5 min-w-0 cursor-pointer ${
                    selectedFilter === 'parcel'
                      ? 'bg-rose-600 text-white shadow-2xs font-black'
                      : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50'
                  }`}
                >
                  <FileSpreadsheet className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">Surveys</span>
                  <span className="opacity-85 font-mono text-[8.5px] shrink-0">({counts.parcel})</span>
                </button>
              )}
            </div>
          )}

          {/* 2. Results List for Selected Category Tab */}
          <div ref={listRef} className="overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/40 max-h-64">
            {query.trim().length === 0 ? (
              /* Empty Query: Compact Recent Searches only */
              recentSearches.length > 0 ? (
                <div className="p-2 space-y-2">
                  <div>
                    <div className="flex items-center justify-between px-1 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        Recent
                      </span>
                      <button
                        type="button"
                        onClick={clearRecentSearches}
                        className="text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 flex items-center gap-0.5 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-2.5 h-2.5 text-rose-600 dark:text-rose-400" />
                        Clear
                      </button>
                    </div>

                    <div className="space-y-0.5">
                      {recentSearches.map((r, i) => {
                        const conf = LEVEL_CONFIG[r.level] || LEVEL_CONFIG.village;
                        const IconComp = conf.Icon;
                        return (
                          <button
                            key={`recent-${r.code}-${i}`}
                            type="button"
                            onClick={() => handleSelect(r)}
                            className="w-full px-2 py-1 rounded-lg text-left hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors flex items-center gap-2 group cursor-pointer text-xs"
                          >
                            <div
                              className="shrink-0 w-4.5 h-4.5 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: conf.bgLight, color: conf.color }}
                            >
                              <IconComp className="w-2.5 h-2.5" />
                            </div>
                            <span className="font-semibold text-slate-800 dark:text-slate-100 truncate shrink-0">
                              {r.name}
                            </span>
                            <span className={`text-[8.5px] font-extrabold uppercase px-1 py-0 rounded border ${conf.badgeClass} shrink-0`}>
                              {conf.label}
                            </span>
                            <span className="text-[10.5px] text-slate-400 dark:text-slate-500 truncate flex-1 font-normal">
                              • {r.location_text || r.code}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null
            ) : filteredResults.length === 0 ? (
              /* No Results in Selected Tab State */
              <div className="p-3 text-center text-xs text-slate-400 dark:text-slate-500">
                No matching {selectedFilter}s found for "{query}"
              </div>
            ) : (
              /* Category Items */
              <div className="divide-y divide-slate-100 dark:divide-slate-800/30">
                {filteredResults.map((r, i) => {
                  const isHighlighted = i === selectedIndex;
                  const conf = LEVEL_CONFIG[r.level] || LEVEL_CONFIG.village;
                  let subtitle = '';
                  if (r.level === 'taluk') {
                    subtitle = r.district_name || '';
                  } else if (r.level === 'village') {
                    subtitle = [r.taluk_name, r.district_name].filter(Boolean).join(' · ');
                  } else if (r.level === 'parcel') {
                    subtitle = [r.village_name, r.taluk_name].filter(Boolean).join(' · ');
                  }
                  const codeText = (r.code_display || r.code).replace(/^Code:\s*/i, '').replace(/^Survey\s*/i, '');

                  return (
                    <button
                      key={`${r.code}-${i}`}
                      type="button"
                      onClick={() => handleSelect(r)}
                      onMouseEnter={() => setSelectedIndex(i)}
                      className={`w-full px-2.5 py-1.5 text-left text-xs transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                        isHighlighted
                          ? 'bg-sky-50 dark:bg-slate-800/90 text-sky-700 dark:text-sky-300'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {/* Left: Name + subtitle (taluk · district) */}
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="font-bold truncate text-slate-900 dark:text-slate-100 text-xs leading-tight">
                          <HighlightedText text={r.name} query={query} />
                        </span>
                        {subtitle && (
                          <span className="text-[9.5px] text-slate-400 dark:text-slate-500 font-normal truncate leading-tight mt-0.5">
                            {subtitle}
                          </span>
                        )}
                      </div>

                      {/* Right: Code pill only */}
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80 whitespace-nowrap shrink-0 ml-1">
                        <HighlightedText text={codeText} query={query} />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

