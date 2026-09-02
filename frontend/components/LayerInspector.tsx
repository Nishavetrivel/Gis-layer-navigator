import React from 'react';
import { ActiveGisLayer, GisLevel } from '../types';
import { Eye, EyeOff, Sliders, Maximize2, Tag } from 'lucide-react';

interface LayerInspectorProps {
  activeLayers: Record<GisLevel, ActiveGisLayer | null>;
  onToggleVisibility: (level: GisLevel) => void;
  onChangeOpacity: (level: GisLevel, opacity: number) => void;
  onZoomToLayer: (level: GisLevel) => void;
  onToggleLabels?: (level: GisLevel) => void;
}

const LEVEL_COLORS: Record<GisLevel, { bg: string; border: string; text: string; dot: string }> = {
  district: { bg: 'bg-slate-50 dark:bg-slate-800/60', border: 'border-slate-200 dark:border-slate-700/80', text: 'text-sky-600 dark:text-sky-400', dot: 'bg-sky-500' },
  taluk: { bg: 'bg-slate-50 dark:bg-slate-800/60', border: 'border-slate-200 dark:border-slate-700/80', text: 'text-indigo-600 dark:text-indigo-400', dot: 'bg-indigo-500' },
  village: { bg: 'bg-slate-50 dark:bg-slate-800/60', border: 'border-slate-200 dark:border-slate-700/80', text: 'text-teal-600 dark:text-teal-400', dot: 'bg-teal-500' },
  parcel: { bg: 'bg-slate-50 dark:bg-slate-800/60', border: 'border-slate-200 dark:border-slate-700/80', text: 'text-slate-600 dark:text-slate-400', dot: 'bg-slate-500' },
};

export const LayerInspector: React.FC<LayerInspectorProps> = ({
  activeLayers,
  onToggleVisibility,
  onChangeOpacity,
  onZoomToLayer,
  onToggleLabels,
}) => {
  const levels: GisLevel[] = ['district', 'taluk', 'village', 'parcel'];
  const activeCount = Object.values(activeLayers).filter((l) => l !== null).length;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 shadow-sm flex flex-col gap-2">
      {/* Mini Header */}
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-sky-500" />
          <h4 className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            Active Layers <span className="text-slate-400 font-mono">({activeCount})</span>
          </h4>
        </div>
      </div>

      {activeCount === 0 ? (
        <p className="py-2 text-center text-[11px] text-slate-400 dark:text-slate-500 italic">
          No layers active
        </p>
      ) : (
        <div className="space-y-1.5">
          {levels.map((lvl) => {
            const layer = activeLayers[lvl];
            if (!layer) return null;
            const styling = LEVEL_COLORS[lvl];

            return (
              <div
                key={lvl}
                className={`p-1.5 px-2 rounded-lg border ${styling.bg} ${styling.border} transition-all space-y-1`}
              >
                {/* Title & Action Buttons Row */}
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full ${styling.dot} shrink-0 ${lvl === 'parcel' ? 'animate-pulse' : ''}`} />
                    <span className={`text-[10px] font-bold uppercase tracking-tight shrink-0 ${styling.text}`}>
                      {lvl}:
                    </span>
                    <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {layer.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    {/* Show/Hide Labels Toggle Button */}
                    {(lvl === 'village' || lvl === 'parcel') && onToggleLabels && (
                      <button
                        onClick={() => onToggleLabels(lvl)}
                        title={layer.showLabels !== false ? 'Hide Labels (Survey Numbers)' : 'Show Labels (Survey Numbers)'}
                        className={`p-1 rounded transition-colors ${
                          layer.showLabels !== false
                            ? 'text-amber-500 hover:bg-amber-500/10 font-bold'
                            : 'text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/80'
                        }`}
                      >
                        <Tag className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={() => onZoomToLayer(lvl)}
                      title="Zoom to Boundary"
                      className="p-1 hover:bg-slate-200/60 dark:hover:bg-slate-800/80 rounded text-slate-500 dark:text-slate-400 transition-colors"
                    >
                      <Maximize2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onToggleVisibility(lvl)}
                      title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                      className="p-1 hover:bg-slate-200/60 dark:hover:bg-slate-800/80 rounded text-slate-500 dark:text-slate-400 transition-colors"
                    >
                      {layer.visible ? (
                        <Eye className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                      ) : (
                        <EyeOff className="w-3 h-3 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Inline Compact Opacity Control */}
                {layer.visible && (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500 shrink-0">Fill:</span>
                    <input
                      type="range"
                      min="0.05"
                      max="0.9"
                      step="0.05"
                      value={layer.opacity}
                      onChange={(e) => onChangeOpacity(lvl, parseFloat(e.target.value))}
                      className="w-full h-1 bg-slate-200 dark:bg-slate-700/80 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-[9px] font-mono font-semibold text-slate-600 dark:text-slate-300 w-6 text-right shrink-0">
                      {Math.round(layer.opacity * 100)}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

