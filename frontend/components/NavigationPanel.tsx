import React, { useState, useRef, useEffect, useMemo } from 'react';
import { DistrictItem, TalukItem, VillageItem, ParcelItem, GisLevel, SearchResult, ActiveGisLayer } from '../types';
import { ArrowLeft, RefreshCw, ChevronDown, CheckCircle2, X, Type, Hash, Layers, Eye, EyeOff, Maximize2, Tag, Building2, Compass, Home, FileSpreadsheet, PanelLeftClose, Sun, Moon, Sliders } from 'lucide-react';
import { SearchBar } from './SearchBar';

interface SearchableSelectOption {
  code: string;
  name: string;
  codeDisplay?: string;
}

interface SearchableSelectProps {
  label: string;
  level: GisLevel;
  dotColor: string;
  defaultColor: string;
  currentColor?: string;
  onChangeLayerColor?: (level: GisLevel, color: string) => void;
  activeLayer?: ActiveGisLayer | null;
  onToggleVisibility?: (level: GisLevel) => void;
  onChangeOpacity?: (level: GisLevel, opacity: number) => void;
  onZoomToLayer?: (level: GisLevel) => void;
  onToggleLabels?: (level: GisLevel) => void;
  options: SearchableSelectOption[];
  selectedCode: string;
  onSelect: (code: string) => void;
  mode: 'name' | 'code';
  disabled?: boolean;
  disabledMessage?: string;
  loading?: boolean;
  placeholder?: string;
  activeColorClass?: string;
  resetKey?: number;
  // Multi-select download basket
  multiSelectedCodes?: string[];
  onMultiSelect?: (code: string) => void;
  multiDisabled?: boolean; // true when hierarchy prevents deeper selection
}

interface ColorPickerDotProps {
  level: GisLevel | 'subdivision';
  currentColor?: string;
  defaultColor: string;
  onChangeColor?: (level: GisLevel | 'subdivision', color: string) => void;
  disabled?: boolean;
}

const PALETTE_COLORS = [
  { name: 'Sky Blue', hex: '#0284c7' },
  { name: 'Emerald', hex: '#22c55e' },
  { name: 'Amber Yellow', hex: '#eab308' },
  { name: 'Crimson Red', hex: '#ef4444' },
  { name: 'Neon Purple', hex: '#a855f7' },
  { name: 'Hot Pink', hex: '#ec4899' },
  { name: 'Cyan', hex: '#06b6d4' },
  { name: 'Vivid Orange', hex: '#f97316' },
  { name: 'Pure White', hex: '#ffffff' },
];

const MINI_PALETTE = [
  { name: 'Sky Blue', hex: '#0284c7' },
  { name: 'Emerald Green', hex: '#22c55e' },
  { name: 'Amber Yellow', hex: '#eab308' },
  { name: 'Crimson Red', hex: '#ef4444' },
  { name: 'Royal Purple', hex: '#9333ea' },
  { name: 'Deep Teal', hex: '#0d9488' },
];

function hslToHex(h: number, s: number = 100, l: number = 50): string {
  const c = (1 - Math.abs(2 * (l / 100) - 1)) * (s / 100);
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l / 100 - c / 2;

  let r = 0, g = 0, b = 0;
  if (0 <= h && h < 60) {
    r = c; g = x; b = 0;
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0;
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x;
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c;
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c;
  } else if (300 <= h && h <= 360) {
    r = c; g = 0; b = x;
  }

  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHue(hex: string): number {
  if (!hex || !hex.startsWith('#')) return 0;
  let c = hex.substring(1);
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  const num = parseInt(c, 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;

  let h = 0;
  if (max === r) {
    h = ((g - b) / d) % 6;
  } else if (max === g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return h;
}

export const ColorPickerDot: React.FC<ColorPickerDotProps> = ({
  level,
  currentColor,
  defaultColor,
  onChangeColor,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const activeColor = currentColor || defaultColor;

  const [hue, setHue] = useState(() => hexToHue(activeColor));

  useEffect(() => {
    setHue(hexToHue(activeColor));
  }, [activeColor]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (disabled) {
    return (
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0 inline-block opacity-40 border border-slate-300 dark:border-slate-700"
        style={{ backgroundColor: defaultColor }}
      />
    );
  }

  const handleSliderClickOrDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = x / rect.width;
    const newHue = Math.round(percent * 360);
    setHue(newHue);

    const hexColor = hslToHex(newHue, 100, 50);
    onChangeColor?.(level, hexColor);
  };

  return (
    <div className="relative inline-flex items-center" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        title={`Click to choose ${level} layer color`}
        className="w-2.5 h-2.5 rounded-full shrink-0 transition-transform hover:scale-125 focus:outline-none ring-1 ring-slate-400 dark:ring-slate-600 shadow-2xs cursor-pointer"
        style={{ backgroundColor: activeColor }}
      />

      {/* Horizontal Rainbow Color Slider Bar */}
      {open && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 bg-white/98 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700/90 rounded-full px-3 py-2 shadow-xl z-50 flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-150 w-44">
          <div
            ref={sliderRef}
            onClick={handleSliderClickOrDrag}
            onMouseMove={(e) => {
              if (e.buttons === 1) handleSliderClickOrDrag(e);
            }}
            className="relative w-full h-3 rounded-full cursor-pointer overflow-visible select-none shadow-inner"
            style={{
              background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
            }}
          >
            {/* Draggable Circle Ring Thumb Cursor */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white shadow-md pointer-events-none transition-transform hover:scale-110"
              style={{
                left: `${(hue / 360) * 100}%`,
                backgroundColor: activeColor,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label,
  level,
  dotColor,
  defaultColor,
  currentColor,
  onChangeLayerColor,
  activeLayer,
  onToggleVisibility,
  onChangeOpacity,
  onZoomToLayer,
  onToggleLabels,
  options,
  selectedCode,
  onSelect,
  mode,
  disabled = false,
  disabledMessage,
  loading = false,
  placeholder,
  activeColorClass = 'text-sky-600 dark:text-sky-400',
  resetKey,
  multiSelectedCodes = [],
  onMultiSelect,
  multiDisabled = false,
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement | null>(null);

  const selectedOption = options.find(
    (opt) => opt.code === selectedCode || opt.code === selectedCode.split('_').pop()
  );

  // Auto-scroll dropdown list to currently selected item when opened
  useEffect(() => {
    if (isOpen && selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isOpen]);

  // Sync query when selection changes externally
  useEffect(() => {
    if (multiSelectedCodes && multiSelectedCodes.length > 1) {
      const names = options
        .filter((opt) => multiSelectedCodes.includes(opt.code) || multiSelectedCodes.includes(opt.code.split('_').pop()!))
        .map((opt) => (mode === 'name' ? opt.name : opt.code));
      setQuery(names.length > 0 ? names.join(', ') : `${multiSelectedCodes.length} selected`);
    } else if (selectedOption) {
      setQuery(mode === 'name' ? selectedOption.name : selectedOption.code);
    } else if (!selectedCode && (!multiSelectedCodes || multiSelectedCodes.length === 0)) {
      setQuery('');
      setIsOpen(false);
    }
  }, [selectedCode, selectedOption, multiSelectedCodes, mode, options]);

  // Force-clear query ONLY when user explicitly clicks Reset All (resetKey > 0)
  useEffect(() => {
    if (resetKey && resetKey > 0) {
      setQuery('');
      setIsOpen(false);
    }
  }, [resetKey]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    const currentVal = selectedOption ? (mode === 'name' ? selectedOption.name : selectedOption.code) : '';
    const multiVal = multiSelectedCodes && multiSelectedCodes.length > 0
      ? options
          .filter((opt) => multiSelectedCodes.includes(opt.code) || multiSelectedCodes.includes(opt.code.split('_').pop()!))
          .map((opt) => (mode === 'name' ? opt.name : opt.code))
          .join(', ')
      : '';

    const isMatchingSelected =
      (selectedOption && query.trim().toLowerCase() === currentVal.toLowerCase()) ||
      (multiVal && query.trim().toLowerCase() === multiVal.toLowerCase());

    const list = options;

    if (query.trim() && !isMatchingSelected) {
      const qRaw = query.trim().toLowerCase();
      const qDigits = qRaw.replace(/\D/g, '');
      const qUnpadded = qDigits ? (qDigits.replace(/^0+/, '') || '0') : '';
      const isNumericQuery = qDigits.length > 0 && (
        qRaw === qDigits ||
        qRaw === `0${qDigits}` ||
        qRaw === `00${qDigits}` ||
        qRaw === `000${qDigits}` ||
        qRaw.startsWith('dist_') ||
        qRaw.startsWith('tal_') ||
        qRaw.startsWith('vil_')
      );

      const isZeroPrefixed = qRaw.startsWith('0');

      const scoredList: Array<{
        opt: SearchableSelectOption;
        score: number;
        numVal: number | null;
      }> = [];

      options.forEach((opt) => {
        const optName = (opt.name || '').toLowerCase();
        const optCode = (opt.code || '').toLowerCase();
        const optCodeDisplay = (opt.codeDisplay || '').toLowerCase();

        // Clean survey number if present (e.g. 'Survey 3' -> '3', 'Survey 3/1' -> '3/1')
        const sNum = optName.replace(/^survey\s+/i, '').trim();
        const sNumClean = sNum.replace(/\s+/g, '');

        // Code components
        const codeLast = optCode.split('_').pop() || optCode;
        const codeLastDigits = codeLast.replace(/\D/g, '');
        const codeLastUnpadded = codeLastDigits ? (codeLastDigits.replace(/^0+/, '') || '0') : '';
        const codeFullUnpadded = optCode.split('_').map((p) => p.replace(/^0+/, '') || '0').join('_');

        const sNumBase = sNumClean.split('/')[0].replace(/\D/g, '');
        const sNumUnpadded = sNumBase ? (sNumBase.replace(/^0+/, '') || '0') : '';

        // Extract integer value for natural numerical tie-breaking
        let numVal: number | null = null;
        if (codeLastDigits) {
          const parsed = parseInt(codeLastDigits, 10);
          if (!isNaN(parsed)) numVal = parsed;
        } else if (sNumBase) {
          const parsed = parseInt(sNumBase, 10);
          if (!isNaN(parsed)) numVal = parsed;
        }

        let score = 0;

        // ── 1. EXACT MATCHES (Score 1000+) ─────────────────────────────────
        if (optCode === qRaw || optCodeDisplay === qRaw || codeLast === qRaw) {
          score = 1100;
        } else if (optName === qRaw || sNumClean === qRaw) {
          score = 1050;
        } else if (isNumericQuery && qUnpadded !== '') {
          // Exact numeric match: e.g. user typed '3' and option is '03' or '003' or 'Survey 3'
          if (codeLastUnpadded === qUnpadded || sNumUnpadded === qUnpadded) {
            score = 1000;
          } else if (codeFullUnpadded === qRaw || codeFullUnpadded === qUnpadded) {
            score = 1000;
          }
        }

        // ── 2. STARTS-WITH / PREFIX MATCHES (Score 500+) ────────────────────
        if (score === 0) {
          if (optName.startsWith(qRaw) || sNumClean.startsWith(qRaw)) {
            score = 560;
          } else if (optCode.startsWith(qRaw) || codeLast.startsWith(qRaw) || optCodeDisplay.startsWith(qRaw)) {
            score = 540;
          } else if (optName.split(/\s+/).some((w) => w.startsWith(qRaw))) {
            score = 520;
          } else if (isNumericQuery && qUnpadded !== '' && !isZeroPrefixed) {
            // Unpadded starts-with match: e.g. user typed '3' and option is '030' or '33'
            if (codeLastUnpadded.startsWith(qUnpadded) || sNumUnpadded.startsWith(qUnpadded)) {
              score = 500;
            } else if (codeFullUnpadded.startsWith(qRaw) || codeFullUnpadded.startsWith(qUnpadded)) {
              score = 500;
            }
          }
        }

        // ── 3. CONTAINS / SUBSTRING MATCHES (Score 100+) ───────────────────
        if (score === 0) {
          if (optName.includes(qRaw) || sNumClean.includes(qRaw)) {
            score = 130;
          } else if (optCode.includes(qRaw) || codeLast.includes(qRaw) || optCodeDisplay.includes(qRaw)) {
            score = 120;
          } else if (isNumericQuery && qUnpadded !== '' && !isZeroPrefixed) {
            if (codeLastUnpadded.includes(qUnpadded) || sNumUnpadded.includes(qUnpadded)) {
              score = 100;
            }
          }
        }

        if (score > 0) {
          scoredList.push({ opt, score, numVal });
        }
      });

      // Sort by score descending, then by numeric value ascending, then by string comparison
      scoredList.sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        if (a.numVal !== null && b.numVal !== null && a.numVal !== b.numVal) {
          return a.numVal - b.numVal;
        }
        if (mode === 'code') {
          return a.opt.code.localeCompare(b.opt.code, undefined, { numeric: true, sensitivity: 'base' });
        }
        return a.opt.name.localeCompare(b.opt.name, undefined, { sensitivity: 'base' });
      });

      return scoredList.map((item) => item.opt);
    }

    // When no search query: sort alphabetically by name in name-mode, keep numeric order in code-mode
    if (mode === 'name') {
      return [...list].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      );
    }
    return [...list].sort((a, b) =>
      a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [options, query, selectedOption, multiSelectedCodes, mode]);

  const defaultPlaceholder =
    placeholder || (mode === 'name' ? `Type or select ${label} Name...` : `Type or select ${label} Code...`);

  const getLevelConfig = () => {
    switch (level) {
      case 'district':
        return {
          icon: Building2,
          activeRing: 'focus-within:border-sky-500 focus-within:ring-sky-500/20',
          accentColor: '#0284c7',
        };
      case 'taluk':
        return {
          icon: Compass,
          activeRing: 'focus-within:border-indigo-500 focus-within:ring-indigo-500/20',
          accentColor: '#9333ea',
        };
      case 'village':
        return {
          icon: Home,
          activeRing: 'focus-within:border-amber-500 focus-within:ring-amber-500/20',
          accentColor: '#f59e0b',
        };
      case 'parcel':
        return {
          icon: FileSpreadsheet,
          activeRing: 'focus-within:border-emerald-500 focus-within:ring-emerald-500/20',
          accentColor: '#10b981',
        };
      default:
        return {
          icon: Layers,
          activeRing: 'focus-within:border-sky-500 focus-within:ring-sky-500/20',
          accentColor: '#0284c7',
        };
    }
  };

  const levelConfig = getLevelConfig();
  const LevelIcon = levelConfig.icon;

  return (
    <div className={`space-y-1 relative ${isOpen ? 'z-50' : 'z-10'}`} ref={containerRef}>
      <label className="flex items-center justify-between text-[11px] font-semibold tracking-wide py-0.5 select-none">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500 dark:bg-sky-400 shrink-0 shadow-2xs shadow-sky-500/50" />
          <span className="font-black text-sky-600 dark:text-sky-400 uppercase tracking-wider text-[11px] truncate">
            {label}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">

          {selectedCode && (
            <div className="flex items-center gap-1 ml-0.5">
              {/* Show/Hide Labels Toggle Button */}
              {(level === 'village' || level === 'parcel') && onToggleLabels && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLabels(level);
                  }}
                  title={activeLayer?.showLabels !== false ? 'Hide Labels' : 'Show Labels'}
                  className={`p-1 rounded-md transition-colors cursor-pointer ${
                    activeLayer?.showLabels !== false
                      ? 'text-amber-500 bg-amber-500/10 font-bold'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  <Tag className="w-3 h-3" />
                </button>
              )}

              {/* Toggle Visibility (Eye Icon) */}
              {onToggleVisibility && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleVisibility(level);
                  }}
                  title={activeLayer?.visible !== false ? 'Hide Layer' : 'Show Layer'}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {activeLayer?.visible !== false ? (
                    <Eye className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                  ) : (
                    <EyeOff className="w-3 h-3 text-slate-400" />
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </label>

      {disabled ? (
        <div className="bg-slate-100/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-400 dark:text-slate-500 text-xs italic flex items-center justify-between cursor-not-allowed select-none">
          <span className="truncate">{disabledMessage || `Select parent level first`}</span>
        </div>
      ) : (
        <div className={`relative ${isOpen ? 'z-50' : 'z-10'}`}>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (filteredOptions.length > 0) {
                  const firstOpt = filteredOptions[0];
                  onSelect(firstOpt.code);
                  setQuery(mode === 'name' ? firstOpt.name : firstOpt.code);
                  if (onZoomToLayer && level) {
                    onZoomToLayer(level);
                  }
                  setIsOpen(false);
                }
              }
            }}
            onFocus={(e) => {
              setIsOpen(true);
              e.target.select();
            }}
            onClick={() => setIsOpen(true)}
            placeholder={loading ? 'Loading records...' : (placeholder || `Select ${label}...`)}
            className={`w-full bg-slate-50/90 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/90 text-slate-800 dark:text-slate-100 text-xs font-semibold rounded-xl pl-3 pr-14 py-2 shadow-2xs focus:outline-none focus:ring-2 focus:bg-white dark:focus:bg-slate-900 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 font-sans cursor-text ${levelConfig.activeRing}`}
          />

          {/* Input trailing actions: Clear (X) + Dropdown Toggle (Chevron) */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 z-10">
            {(query || selectedCode || (multiSelectedCodes && multiSelectedCodes.length > 0)) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect('');
                  setQuery('');
                  setIsOpen(false);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                title="Clear"
              >
                <X className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen((prev) => !prev);
              }}
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
              title={isOpen ? 'Close suggestions' : 'Open suggestions'}
            >
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-150 ${isOpen ? 'rotate-180 text-cyan-500' : ''}`} />
            </button>
          </div>

          {/* Suggestions Dropdown (Always opens below) */}
          {isOpen && (
            <div
              className="absolute left-0 right-0 top-full mt-1.5 max-h-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-50 p-1 flex flex-col animate-in fade-in slide-in-from-top-1 duration-150"
            >
              <div className="flex-1 overflow-y-auto max-h-44 p-0.5 space-y-0.5 scroll-smooth">
                {filteredOptions.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400 dark:text-slate-500 font-medium">
                    No matching items found
                  </div>
                ) : (
                  filteredOptions.map((opt) => {
                    const isInBasket = Boolean(
                      multiSelectedCodes &&
                        (multiSelectedCodes.includes(opt.code) ||
                          (opt.code.includes('_') && multiSelectedCodes.includes(opt.code.split('_').pop()!)))
                    );
                    const isSelectedSingle = opt.code === selectedCode;
                    const isChecked = (multiSelectedCodes && multiSelectedCodes.length > 0) ? isInBasket : isSelectedSingle;

                    return (
                      <button
                        key={opt.code}
                        ref={isChecked ? selectedItemRef : undefined}
                        type="button"
                        onClick={() => {
                          if (onMultiSelect) {
                            onMultiSelect(opt.code);
                          } else {
                            onSelect(opt.code);
                            setQuery(mode === 'name' ? opt.name : opt.code);
                            if (onZoomToLayer && level) {
                              onZoomToLayer(level);
                            }
                            setIsOpen(false);
                          }
                        }}
                        className={`w-full text-left px-3 py-2 text-xs rounded-xl transition-all flex items-center justify-between cursor-pointer ${
                          isChecked
                            ? 'bg-gradient-to-r from-sky-500/15 to-cyan-500/15 text-sky-800 dark:text-sky-200 font-bold border border-sky-300 dark:border-sky-700/80 shadow-2xs'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {isChecked ? (
                            <Eye className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                          ) : (
                            <Eye className="w-3.5 h-3.5 text-slate-400 opacity-60 shrink-0" />
                          )}
                          <span className={`truncate ${isChecked ? 'font-black text-sky-700 dark:text-sky-300' : 'font-semibold'}`}>
                            {mode === 'name' ? opt.name : opt.code}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 ml-2 shrink-0">
                          <span className="text-[9.5px] font-mono font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {mode === 'name' ? opt.code : opt.name}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* OK Confirm Button at bottom of dropdown when multiple items selected */}
              {multiSelectedCodes && multiSelectedCodes.length > 0 && (
                <div className="sticky bottom-0 bg-white dark:bg-slate-900 p-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 shrink-0 z-10">
                  <button
                    type="button"
                    onClick={() => {
                      if (multiSelectedCodes.length === 1 && onSelect) {
                        onSelect(multiSelectedCodes[0]);
                      } else if (multiSelectedCodes.length > 1 && onSelect) {
                        onSelect(multiSelectedCodes.join(','));
                      }
                      if (onZoomToLayer && level) {
                        onZoomToLayer(level);
                      }
                      setIsOpen(false);
                    }}
                    className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    OK ({multiSelectedCodes.length} selected)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sleek & Elegant Layer Opacity Control Slider */}
      {(Boolean(selectedCode) || (multiSelectedCodes && multiSelectedCodes.length > 0) || Boolean(activeLayer?.code)) && onChangeOpacity && activeLayer && (
        <div className="mt-1.5 flex items-center justify-between gap-2.5 px-3 py-1.5 bg-slate-100/70 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
          <div className="flex items-center gap-1.5 shrink-0">
            <Sliders className="w-3 h-3 text-sky-600 dark:text-sky-400 stroke-[2.3]" />
            <span className="text-[9.5px] font-black uppercase text-sky-700 dark:text-sky-300 tracking-wider">Opacity</span>
          </div>

          <input
            type="range"
            min="0.05"
            max="0.95"
            step="0.05"
            value={activeLayer.opacity !== undefined ? activeLayer.opacity : (level === 'parcel' ? 0.45 : 0.30)}
            onChange={(e) => onChangeOpacity(level, parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-sky-500 hover:accent-sky-400 transition-all shadow-inner"
          />

          <span className="text-[9.5px] font-black font-mono px-2 py-0.5 rounded-lg bg-sky-500 text-white shadow-2xs shadow-sky-500/30 text-center shrink-0">
            {Math.round((activeLayer.opacity !== undefined ? activeLayer.opacity : (level === 'parcel' ? 0.45 : 0.30)) * 100)}%
          </span>
        </div>
      )}
    </div>
  );
};

interface NavigationPanelProps {
  districts: DistrictItem[];
  taluks: TalukItem[];
  villages: VillageItem[];
  parcels: ParcelItem[];

  selectedDistrict: string;
  selectedTaluk: string;
  selectedVillage: string;
  selectedParcel: string;

  layerType?: 'fmb' | 'vector';
  onLayerTypeChange?: (type: 'fmb' | 'vector') => void;

  loadingDistricts: boolean;
  loadingTaluks: boolean;
  loadingVillages: boolean;
  loadingParcels: boolean;

  onDistrictSelect: (code: string) => void;
  onTalukSelect: (code: string) => void;
  onVillageSelect: (code: string) => void;
  onParcelSelect: (code: string) => void;

  onBackStep: () => void;
  onResetAll: () => void;

  // Active Layers Inspector Controls
  activeLayers?: Record<GisLevel, ActiveGisLayer | null>;
  onToggleVisibility?: (level: GisLevel) => void;
  onChangeOpacity?: (level: GisLevel, opacity: number) => void;
  onZoomToLayer?: (level: GisLevel) => void;
  onToggleLabels?: (level: GisLevel) => void;

  // Layer Color Customizer
  onChangeLayerColor?: (level: GisLevel | 'subdivision', color: string) => void;
  activeLayerColors?: Record<GisLevel | 'subdivision', string | undefined>;
  onBreadcrumbClick?: (level: GisLevel | 'state') => void;

  // Multi-select download basket
  multiDistricts?: string[];
  multiTaluks?: string[];
  multiVillages?: string[];
  multiParcels?: string[];
  onToggleMultiDistrict?: (code: string) => void;
  onToggleMultiTaluk?: (code: string) => void;
  onToggleMultiVillage?: (code: string) => void;
  onToggleMultiParcel?: (code: string) => void;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  onToggleSidebar?: () => void;
}

export const NavigationPanel: React.FC<NavigationPanelProps> = ({
  districts,
  taluks,
  villages,
  parcels,
  selectedDistrict,
  selectedTaluk,
  selectedVillage,
  selectedParcel,
  layerType = 'fmb',
  onLayerTypeChange,
  loadingDistricts,
  loadingTaluks,
  loadingVillages,
  loadingParcels,
  onDistrictSelect,
  onTalukSelect,
  onVillageSelect,
  onParcelSelect,
  onBackStep,
  onResetAll,
  currentLevel,
  onSearchResultSelect,
  activeLayers = { district: null, taluk: null, village: null, parcel: null },
  onToggleVisibility,
  onChangeOpacity,
  onZoomToLayer,
  onToggleLabels,
  onChangeLayerColor,
  activeLayerColors = { district: undefined, taluk: undefined, village: undefined, subdivision: undefined, parcel: undefined },
  onBreadcrumbClick,
  multiDistricts = [],
  multiTaluks = [],
  multiVillages = [],
  multiParcels = [],
  onToggleMultiDistrict,
  onToggleMultiTaluk,
  onToggleMultiVillage,
  onToggleMultiParcel,
  isDarkMode,
  onToggleDarkMode,
  onToggleSidebar,
}) => {
  // Phase Tab State: 'name' or 'code'
  const [searchPhase, setSearchPhase] = useState<'name' | 'code'>('name');

  // Reset key — incremented every time onResetAll fires so SearchableSelect inputs clear
  const [resetKey, setResetKey] = useState(0);

  const [formatExpanded, setFormatExpanded] = useState(true);

  const handleResetAll = () => {
    setResetKey((k) => k + 1);
    onResetAll();
  };

  // Option Mappings
  const districtOptions = useMemo(
    () => districts.map((d) => ({ code: d.code, name: d.name })),
    [districts]
  );

  const talukOptions = useMemo(
    () => taluks.map((t) => ({ code: t.code, name: t.name })),
    [taluks]
  );

  const villageOptions = useMemo(
    () => villages.map((v) => ({ code: v.code, name: v.name })),
    [villages]
  );

  const parcelOptions = useMemo(() => {
    if (layerType === 'vector') {
      const vecMap = new Map<string, string>();
      parcels.forEach((p) => {
        let cleanNo = String(p.survey_no || p.name).trim();
        const comboMatch = cleanNo.match(/^[0-9]{2}_[0-9]{2}_[0-9]{3}_(.+)$/);
        if (comboMatch) cleanNo = comboMatch[1];
        // Extract pure base survey number without subdivisions (e.g. 1, 2, 3, 4...)
        const baseNo = p.base_survey || cleanNo.split('/')[0].split('_')[0].trim();
        if (baseNo && !vecMap.has(baseNo)) {
          vecMap.set(baseNo, p.code);
        }
      });

      return Array.from(vecMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
        .map(([baseNo, code]) => ({
          code: code,
          name: `Survey ${baseNo}`,
          codeDisplay: baseNo,
        }));
    }

    // FMB Layer Mode: Club by base survey number with subdivision count as usual
    const baseMap = new Map<string, { count: number; sampleCode: string }>();
    parcels.forEach((p) => {
      let cleanNo = String(p.survey_no || p.name).trim();
      const comboMatch = cleanNo.match(/^[0-9]{2}_[0-9]{2}_[0-9]{3}_(.+)$/);
      if (comboMatch) cleanNo = comboMatch[1];
      cleanNo = cleanNo.replace(/_/g, '/');

      const base = p.base_survey || cleanNo.split('/')[0].split('_')[0].trim();
      if (!baseMap.has(base)) {
        baseMap.set(base, { count: 1, sampleCode: p.code });
      } else {
        baseMap.get(base)!.count += 1;
      }
    });

    return Array.from(baseMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([base, { count }]) => ({
        code: base,
        name: `Survey ${base} (${count} subdivision${count > 1 ? 's' : ''})`,
        codeDisplay: base,
      }));
  }, [parcels, layerType]);

  const handleParcelOptionSelect = (selectedVal: string) => {
    if (layerType === 'vector') {
      onParcelSelect(selectedVal);
      return;
    }

    // FMB Mode: resolve full combo code for the selected base survey
    let baseStr = selectedVal.trim();
    if (baseStr.includes('_')) {
      const parts = baseStr.split('_');
      baseStr = parts.slice(3).join('/').split('/')[0] || baseStr;
    } else if (baseStr.includes('/')) {
      baseStr = baseStr.split('/')[0];
    }

    const dist = selectedDistrict;
    const tal = selectedTaluk.includes('_') ? selectedTaluk.split('_').pop()! : selectedTaluk;
    const vil = selectedVillage.includes('_') ? selectedVillage.split('_').pop()! : selectedVillage;
    onParcelSelect(`${dist}_${tal}_${vil}_${baseStr}`);
  };

  const selectedDistrictObj = useMemo(
    () => districts.find((d) => d.code === selectedDistrict),
    [districts, selectedDistrict]
  );

  const selectedTalukObj = useMemo(
    () => taluks.find((t) => t.code === selectedTaluk || t.code.endsWith(`_${selectedTaluk}`)),
    [taluks, selectedTaluk]
  );

  const selectedVillageObj = useMemo(
    () => villages.find((v) => v.code === selectedVillage || v.code.endsWith(`_${selectedVillage}`)),
    [villages, selectedVillage]
  );

  const selectedParcelObj = useMemo(
    () => parcels.find((p) => p.code === selectedParcel),
    [parcels, selectedParcel]
  );

  // Label for back button target
  const getBackTargetLabel = () => {
    switch (currentLevel) {
      case 'parcel':
        return 'Back to Village Level';
      case 'village':
        return 'Back to Taluk Level';
      case 'taluk':
        return 'Back to District Level';
      case 'district':
        return 'Back to State Map View';
      default:
        return null;
    }
  };

  const backLabel = getBackTargetLabel();

  return (
    <div className="flex flex-col gap-2 p-0.5">

      {/* Phase Switcher: Search By Name vs By Code */}
      <div className="w-full bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl flex items-center gap-1 border border-slate-200/80 dark:border-slate-700/80 shadow-2xs">
        <button
          type="button"
          onClick={() => setSearchPhase('name')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-[10.5px] font-bold tracking-wide transition-all text-center cursor-pointer ${
            searchPhase === 'name'
              ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs font-black border border-slate-200/80 dark:border-slate-700'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          By Name
        </button>
        <button
          type="button"
          onClick={() => setSearchPhase('code')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-[10.5px] font-bold tracking-wide transition-all text-center cursor-pointer ${
            searchPhase === 'code'
              ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs font-black border border-slate-200/80 dark:border-slate-700'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          By Code
        </button>
      </div>

      {/* Hierarchical Controls Phase */}
      <div className="space-y-3">
        {/* 1. District */}
        <SearchableSelect
          label="District"
          level="district"
          dotColor="bg-sky-500"
          defaultColor="#0284c7"
          currentColor={activeLayerColors.district}
          onChangeLayerColor={onChangeLayerColor}
          activeLayer={activeLayers.district}
          onToggleVisibility={onToggleVisibility}
          onChangeOpacity={onChangeOpacity}
          onZoomToLayer={onZoomToLayer}
          onToggleLabels={onToggleLabels}
          options={districtOptions}
          selectedCode={selectedDistrict}
          onSelect={onDistrictSelect}
          mode={searchPhase}
          loading={loadingDistricts}
          placeholder={searchPhase === 'name' ? 'Select District...' : 'Select District Code (e.g. DIST_3301)'}
          activeColorClass="text-sky-600 dark:text-sky-400"
          resetKey={resetKey}
          multiSelectedCodes={multiDistricts}
          onMultiSelect={onToggleMultiDistrict}
        />

        {/* 2. Taluk */}
        <SearchableSelect
          label="Taluk"
          level="taluk"
          dotColor="bg-indigo-500"
          defaultColor="#9333ea"
          currentColor={activeLayerColors.taluk}
          onChangeLayerColor={onChangeLayerColor}
          activeLayer={activeLayers.taluk}
          onToggleVisibility={onToggleVisibility}
          onChangeOpacity={onChangeOpacity}
          onZoomToLayer={onZoomToLayer}
          onToggleLabels={onToggleLabels}
          options={talukOptions}
          selectedCode={selectedTaluk}
          onSelect={onTalukSelect}
          mode={searchPhase}
          disabled={multiDistricts.length === 0 && !selectedDistrict}
          disabledMessage={searchPhase === 'name' ? 'Select Taluk...' : 'Select Taluk Code...'}
          loading={loadingTaluks}
          placeholder={searchPhase === 'name' ? 'Select Taluk...' : 'Select Taluk Code (e.g. TAL_330101)'}
          activeColorClass="text-indigo-600 dark:text-indigo-400"
          resetKey={resetKey}
          multiSelectedCodes={multiTaluks}
          onMultiSelect={onToggleMultiTaluk}
        />

        {/* 3. Village */}
        <SearchableSelect
          label="Village"
          level="village"
          dotColor="bg-teal-500"
          defaultColor="#f59e0b"
          activeLayer={activeLayers.village}
          onToggleVisibility={onToggleVisibility}
          onChangeOpacity={onChangeOpacity}
          onZoomToLayer={onZoomToLayer}
          onToggleLabels={onToggleLabels}
          options={villageOptions}
          selectedCode={selectedVillage}
          onSelect={onVillageSelect}
          mode={searchPhase}
          disabled={multiTaluks.length === 0 && !selectedTaluk}
          disabledMessage={searchPhase === 'name' ? 'Select Village...' : 'Select Village Code...'}
          loading={loadingVillages}
          placeholder={searchPhase === 'name' ? 'Select Village...' : 'Select Village Code (e.g. VIL_33010101)'}
          activeColorClass="text-teal-600 dark:text-teal-400"
          resetKey={resetKey}
          multiSelectedCodes={multiVillages}
          onMultiSelect={onToggleMultiVillage}
        />

        {/* 3b. Layer Format Selector */}
        <div className={`p-2 rounded-xl border transition-all relative z-0 ${
          multiVillages.length === 0 && !selectedVillage
            ? 'bg-slate-50/50 dark:bg-slate-900/30 border-slate-200/50 dark:border-slate-800/50 opacity-40 pointer-events-none'
            : 'bg-slate-50/80 dark:bg-slate-900/80 border-slate-200/90 dark:border-slate-700/90 shadow-2xs'
        }`}>
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0 shadow-2xs shadow-sky-500/50" />
              <span className="text-[10px] font-black text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                LAYER FORMAT
              </span>
            </div>
            <span className="text-[9px] font-mono font-bold text-slate-400">
              {layerType === 'fmb' ? 'FMB Parcel' : 'Vector Boundary'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={multiVillages.length === 0 && !selectedVillage}
              onClick={() => onLayerTypeChange?.('vector')}
              className={`py-1.5 px-2 rounded-lg text-[10.5px] font-extrabold transition-all cursor-pointer border text-center ${
                layerType === 'vector'
                  ? 'bg-gradient-to-r from-sky-600 to-cyan-600 text-white border-sky-600 shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-sky-400'
              }`}
            >
              Vector (Boundary)
            </button>

            <button
              type="button"
              disabled={multiVillages.length === 0 && !selectedVillage}
              onClick={() => onLayerTypeChange?.('fmb')}
              className={`py-1.5 px-2 rounded-lg text-[10.5px] font-extrabold transition-all cursor-pointer border text-center ${
                layerType === 'fmb'
                  ? 'bg-gradient-to-r from-sky-600 to-cyan-600 text-white border-sky-600 shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-sky-400'
              }`}
            >
              FMB (Subdivisions)
            </button>
          </div>
        </div>

        {/* 4. Parcel / Subdivision */}
        <SearchableSelect
          label={layerType === 'fmb' ? 'Survey Number (FMB)' : 'Survey Number (Vector)'}
          dotColor="bg-slate-500"
          defaultColor="#22c55e"
          currentColor={activeLayerColors.parcel}
          onChangeLayerColor={onChangeLayerColor}
          activeLayer={activeLayers.parcel}
          onToggleVisibility={onToggleVisibility}
          onChangeOpacity={onChangeOpacity}
          onZoomToLayer={onZoomToLayer}
          onToggleLabels={onToggleLabels}
          level="parcel"
          options={parcelOptions}
          selectedCode={selectedParcel}
          onSelect={handleParcelOptionSelect}
          mode={searchPhase}
          disabled={multiVillages.length === 0 && !selectedVillage}
          disabledMessage={layerType === 'fmb' ? 'Select Survey Number (FMB)...' : 'Select Survey Number (Vector)...'}
          loading={loadingParcels}
          placeholder={
            layerType === 'fmb'
              ? 'Select Survey Number (e.g. 34, 110, 122)...'
              : 'Select Parcel Survey Number...'
          }
          activeColorClass="text-slate-600 dark:text-slate-400"
          resetKey={resetKey}
          multiSelectedCodes={multiParcels}
          onMultiSelect={onToggleMultiParcel}
        />
      </div>

      {/* Bottom Action Controls: Back Button & Reset All */}
      {(currentLevel !== 'none' || Boolean(selectedDistrict) || multiDistricts.length > 0) && (
        <div className="pt-2 mt-1 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center gap-2">
          {backLabel && (
            <button
              type="button"
              onClick={onBackStep}
              className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer border border-slate-200/80 dark:border-slate-700/80 shadow-2xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{backLabel}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleResetAll}
            title="Reset All Layers to Tamil Nadu State View"
            className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer border border-rose-200/80 dark:border-rose-900/60 shadow-2xs shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      )}

    </div>
  );
};

