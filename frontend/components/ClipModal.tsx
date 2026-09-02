import React, { useState, useEffect, useCallback } from 'react';
import {
  Scissors,
  Download,
  X,
  Layers,
  CheckSquare,
  Square,
  FileCode,
  Box,
  Loader2,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  MapPin,
  Compass,
  FileSpreadsheet,
  Globe,
  Grid,
  Filter,
} from 'lucide-react';
import { CART_LAYERS_CONFIG } from '../cartLayersConfig';
import { ActiveGisLayer } from '../types';
import { triggerBlobDownload } from '../utils/downloadUtils';
import { apiUrl, API_BASE } from '@/frontend/lib/api';

interface ClipModalProps {
  isOpen: boolean;
  onClose: () => void;
  clipPolygon?: any; // Drawn polygon GeoJSON / Feature
  drawnAreaAcres?: number;
  activeVillageLayer?: ActiveGisLayer | null;
  activeParcelLayer?: ActiveGisLayer | null;
  selectedVillageName?: string;
  multiVillageNames?: string[];
  multiVillageCodes?: string[];
  districtCode?: string;
  talukCode?: string;
  villageCode?: string;
  fileType?: string;
  isDarkMode?: boolean;
}

export const ClipModal: React.FC<ClipModalProps> = ({
  isOpen,
  onClose,
  clipPolygon,
  drawnAreaAcres,
  activeVillageLayer,
  activeParcelLayer,
  selectedVillageName,
  multiVillageNames,
  multiVillageCodes,
  districtCode,
  talukCode,
  villageCode,
  fileType = 'fmb',
  isDarkMode,
}) => {
  const isDrawnPolygon = Boolean(clipPolygon);
  const isMultiVillage = Boolean(multiVillageNames && multiVillageNames.length > 1);
  const villageLabel = isMultiVillage
    ? `${multiVillageNames!.length}_Villages_Combined`
    : selectedVillageName
    ? selectedVillageName.replace(/\s+/g, '_')
    : 'Village';

  const defaultName = isDrawnPolygon
    ? `${villageLabel}_Drawn_Polygon_Export`
    : `${villageLabel}_Thematic_Layers`;

  // Base IDs (Vector + FMB) + 15 Cart IDs
  const allInitialIds = [
    'village_vector',
    'village_fmb',
    ...CART_LAYERS_CONFIG.map((l) => l.id),
  ];

  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>(allInitialIds);
  const [exportFormat, setExportFormat] = useState<'shp' | 'geojson'>('shp');
  const [fileName, setFileName] = useState<string>(defaultName);
  const [layerCounts, setLayerCounts] = useState<Record<string, number>>({});
  const [isLoadingCounts, setIsLoadingCounts] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    setFileName(defaultName);
  }, [defaultName]);

  // Fetch live preview counts for all layers inside the clip polygon
  const fetchPreviewCounts = useCallback(async () => {
    setIsLoadingCounts(true);
    try {
      const clipBoundary = clipPolygon || activeVillageLayer?.geojson || null;
      const vCodes = (multiVillageCodes && multiVillageCodes.length > 0)
        ? multiVillageCodes
        : (villageCode ? [villageCode] : []);

      const res = await fetch(apiUrl('/api/spatial/clip/preview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clip_polygon: clipBoundary,
          layer_ids: allInitialIds,
          village_geojson: activeVillageLayer?.geojson || null,
          parcel_geojson: activeParcelLayer?.geojson || null,
          district_code: districtCode || '',
          taluk_code: talukCode || '',
          village_code: villageCode || '',
          village_codes: vCodes,
          file_type: fileType || 'fmb',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.counts) {
          setLayerCounts(data.counts);
        }
      }
    } catch (err) {
      console.error('Error fetching clip preview counts:', err);
    } finally {
      setIsLoadingCounts(false);
    }
  }, [clipPolygon, activeVillageLayer, activeParcelLayer, districtCode, talukCode, villageCode, multiVillageCodes, fileType]);

  useEffect(() => {
    if (isOpen) {
      fetchPreviewCounts();
    }
  }, [isOpen, fetchPreviewCounts]);

  if (!isOpen) return null;

  const toggleLayer = (id: string) => {
    setSelectedLayerIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedLayerIds(allInitialIds);
  };

  const selectOnlyDetected = () => {
    const detected = allInitialIds.filter((id) => (layerCounts[id] || 0) > 0);
    setSelectedLayerIds(detected.length > 0 ? detected : allInitialIds);
  };

  const clearAll = () => {
    setSelectedLayerIds([]);
  };

  // Download clipped features strictly inside the polygon boundary
  const handleDownload = async () => {
    if (allCountsZero) {
      setStatusMessage('No GIS data found inside this polygon. Please draw a polygon over a village or area with data.');
      return;
    }
    if (selectedLayerIds.length === 0) {
      setStatusMessage('Please select at least one layer to download.');
      return;
    }
    setIsProcessing(true);
    const clipBoundary = clipPolygon || activeVillageLayer?.geojson || null;
    const vCodes = (multiVillageCodes && multiVillageCodes.length > 0)
      ? multiVillageCodes
      : (villageCode ? [villageCode] : []);

    setStatusMessage(`Clipping ${selectedLayerIds.length} layers inside polygon and generating ${exportFormat.toUpperCase()} package...`);
    try {
      const res = await fetch(apiUrl('/api/spatial/clip/download'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clip_polygon: clipBoundary,
          layer_ids: selectedLayerIds,
          format: exportFormat,
          clip_name: fileName || defaultName,
          village_geojson: activeVillageLayer?.geojson || null,
          parcel_geojson: activeParcelLayer?.geojson || null,
          district_code: districtCode || '',
          taluk_code: talukCode || '',
          village_code: villageCode || '',
          village_codes: vCodes,
          file_type: fileType || 'fmb',
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const blob = await res.blob();
      const downloadName = `${fileName || defaultName}_${exportFormat}.zip`;
      triggerBlobDownload(blob, downloadName);
      setStatusMessage(`Downloaded ${downloadName} successfully! Ready to use.`);
    } catch (err: any) {
      setStatusMessage(`Download error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const pointLayers = CART_LAYERS_CONFIG.filter((l) => l.geom_type === 'point');
  const lineLayers = CART_LAYERS_CONFIG.filter((l) => l.geom_type === 'line');
  const polygonLayers = CART_LAYERS_CONFIG.filter((l) => l.geom_type === 'polygon');

  // Check if ALL layer counts are 0 (nothing found inside the polygon)
  const hasAnyCount = Object.values(layerCounts).some((c) => Number(c || 0) > 0);
  const allCountsZero = !isLoadingCounts && Object.keys(layerCounts).length > 0 && !hasAnyCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-sky-50 via-indigo-50/40 to-transparent dark:from-sky-950/40 dark:via-slate-900 dark:to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-sky-500/20">
              <Scissors className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                {isDrawnPolygon ? 'Export Layers Inside Drawn Polygon' : 'Clip & Export Village Layers'}
                <span className="text-[10.5px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-700/60">
                  {isDrawnPolygon ? 'Drawn Boundary' : 'Village Boundary'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Spatial extraction of all selected layers inside the boundary in QGIS / CAD formats
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Active Boundary Scope Banner */}
          <div className="p-3.5 rounded-2xl bg-sky-50/80 dark:bg-sky-950/30 border border-sky-300/80 dark:border-sky-700/60 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-sky-800 dark:text-sky-300">
                  Active Spatial Clip Area
                </span>
                <span className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                  {isDrawnPolygon
                    ? `Drawn Custom Polygon (${drawnAreaAcres ? `${drawnAreaAcres} Acres` : 'Custom Boundary'}) — ${villageLabel}`
                    : isMultiVillage
                    ? `${multiVillageNames!.length} Selected Villages (${multiVillageNames!.join(', ')})`
                    : `Village ${selectedVillageName || 'Active Boundary'}`}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {isLoadingCounts && <Loader2 className="w-3.5 h-3.5 text-sky-500 animate-spin" />}
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-sky-200/70 dark:bg-sky-900/80 text-sky-900 dark:text-sky-200 shrink-0">
                Inside Polygon
              </span>
            </div>
          </div>

          {/* Quick Filter & Select Buttons */}
          {/* ── No Layers Found Inside Polygon Notice ── */}
          {allCountsZero && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-amber-800 dark:text-amber-200 animate-in fade-in duration-200">
              <span className="text-sm shrink-0">⚠️</span>
              <span className="text-[11px] font-semibold leading-snug">
                No layers found inside this polygon. Try a different area or draw inside a village boundary.
              </span>
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
            <label className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-sky-500" />
              Select Layers to Export ({selectedLayerIds.length}/{allInitialIds.length})
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectOnlyDetected}
                title="Select only layers that have features inside the polygon"
                className="text-[11px] px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80 font-bold hover:bg-emerald-100 cursor-pointer transition-colors"
              >
                Only Detected Features
              </button>
              <button
                type="button"
                onClick={selectAll}
                className="text-xs text-sky-600 dark:text-sky-400 hover:underline font-bold cursor-pointer"
              >
                Select All
              </button>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* 1. Cadastral Base Layers (Village Boundary & FMB Parcels) */}
          <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800/80">
            <span className="text-[11px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-emerald-500" />
              Cadastral Base Layers (Village Boundary & FMB Subdivisions)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Village Boundary (Vector) Checkbox */}
              <div
                onClick={() => toggleLayer('village_vector')}
                className={`px-3 py-2 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition-all ${
                  selectedLayerIds.includes('village_vector')
                    ? 'border-emerald-400/80 bg-emerald-50/50 dark:bg-emerald-950/30 font-bold'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {selectedLayerIds.includes('village_vector') ? (
                    <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-slate-800 dark:text-slate-200 truncate">Village Boundary (Vector)</span>
                </div>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                  {layerCounts['village_vector'] !== undefined ? `${layerCounts['village_vector']} Feat` : 'Vector'}
                </span>
              </div>

              {/* FMB Subdivisions / Parcels (FMB) Checkbox */}
              <div
                onClick={() => toggleLayer('village_fmb')}
                className={`px-3 py-2 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition-all ${
                  selectedLayerIds.includes('village_fmb')
                    ? 'border-cyan-400/80 bg-cyan-50/50 dark:bg-cyan-950/30 font-bold'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {selectedLayerIds.includes('village_fmb') ? (
                    <CheckSquare className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 shrink-0" />
                  <span className="text-slate-800 dark:text-slate-200 truncate">FMB Subdivisions (Survey Nos)</span>
                </div>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-900/60 text-cyan-800 dark:text-cyan-300">
                  {layerCounts['village_fmb'] !== undefined ? `${layerCounts['village_fmb']} Parcels` : 'FMB'}
                </span>
              </div>
            </div>
          </div>

          {/* 2. Polygon Thematic Layers */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              🔷 Water Bodies & Polygon Layers ({polygonLayers.length})
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {polygonLayers.map((layer) => {
                const isSelected = selectedLayerIds.includes(layer.id);
                const count = layerCounts[layer.id];
                return (
                  <div
                    key={layer.id}
                    onClick={() => toggleLayer(layer.id)}
                    className={`px-3 py-2 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'border-sky-400/80 bg-sky-50/50 dark:bg-sky-950/30 font-medium'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: layer.color }} />
                      <span className="text-slate-800 dark:text-slate-200 truncate">{layer.title}</span>
                    </div>
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${count && count > 0 ? 'bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                      {count !== undefined ? `${count} found` : 'Polygon'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Line / Road Layers */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              🛣️ Roads, Highways & River Layers ({lineLayers.length})
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {lineLayers.map((layer) => {
                const isSelected = selectedLayerIds.includes(layer.id);
                const count = layerCounts[layer.id];
                return (
                  <div
                    key={layer.id}
                    onClick={() => toggleLayer(layer.id)}
                    className={`px-3 py-2 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'border-sky-400/80 bg-sky-50/50 dark:bg-sky-950/30 font-medium'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: layer.color }} />
                      <span className="text-slate-800 dark:text-slate-200 truncate">{layer.title}</span>
                    </div>
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${count && count > 0 ? 'bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                      {count !== undefined ? `${count} found` : 'Line'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Point Thematic Layers */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              📍 Schools, Anganwadis & Point Layers ({pointLayers.length})
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {pointLayers.map((layer) => {
                const isSelected = selectedLayerIds.includes(layer.id);
                const count = layerCounts[layer.id];
                return (
                  <div
                    key={layer.id}
                    onClick={() => toggleLayer(layer.id)}
                    className={`px-3 py-2 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'border-sky-400/80 bg-sky-50/50 dark:bg-sky-950/30 font-medium'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: layer.color }} />
                      <span className="text-slate-800 dark:text-slate-200 truncate">{layer.title}</span>
                    </div>
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${count && count > 0 ? 'bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                      {count !== undefined ? `${count} found` : 'Point'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Export Format Selector (SHP, GeoJSON, KML, DXF) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Box className="w-3.5 h-3.5 text-sky-500" />
                Export Format
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setExportFormat('shp')}
                  className={`py-2 px-2.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer transition-all ${
                    exportFormat === 'shp'
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-300 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <Box className="w-3.5 h-3.5" />
                  Shapefile (.zip)
                </button>
                <button
                  type="button"
                  onClick={() => setExportFormat('geojson')}
                  className={`py-2 px-2.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer transition-all ${
                    exportFormat === 'geojson'
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-300 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  GeoJSON (.zip)
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                Archive File Name
              </label>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="TamilNadu_Spatial_Layers"
                className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-sky-500 font-mono"
              />
            </div>
          </div>

          {/* Status Alert Banner */}
          {statusMessage && (
            <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 flex items-center gap-2 text-xs text-sky-800 dark:text-sky-200">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-sky-600 dark:text-sky-400" />
              <span>{statusMessage}</span>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {allCountsZero ? (
              <span className="text-amber-600 dark:text-amber-400 font-semibold">⚠️ No data inside polygon</span>
            ) : (
              <><span className="font-bold text-sky-600 dark:text-sky-400">{selectedLayerIds.length}</span> of {allInitialIds.length} layers selected</>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={isProcessing || selectedLayerIds.length === 0 || allCountsZero}
              title={allCountsZero ? 'No layers found inside this polygon' : ''}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-sky-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download Selected Layers ({exportFormat.toUpperCase()})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
