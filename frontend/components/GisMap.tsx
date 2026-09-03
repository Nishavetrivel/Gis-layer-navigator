import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import { ActiveGisLayer, GisLevel, BasemapStyle, DrawMode, ExtractedLayerResult, DistrictItem, TalukItem, VillageItem, ParcelItem } from '../types';
import { TAMIL_NADU_BOUNDS, TAMIL_NADU_MAX_BOUNDS, TAMIL_NADU_CENTER } from '../utils/geoUtils';
import { PreloadedLayers } from './AppInitializationModal';
import { ColorPickerDot, NavigationPanel } from './NavigationPanel';
import { DownloadScopePanel, ExportFormat } from './DownloadScopePanel';
import { CART_LAYERS_CONFIG, generateSampleGeoJSONForLayer } from '../cartLayersConfig';
import { LayerCartDropdown } from './LayerCartDropdown';
import { SearchBar } from './SearchBar';
import { ClipModal } from './ClipModal';
import {
  Maximize2,
  Minimize2,
  Compass,
  Info,
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  RotateCcw,
  Pentagon,
  Square,
  Trash2,
  Undo2,
  Check,
  X,
  Download,
  FileText,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Layers,
  ArrowLeft,
  Share2,
  Map,
  Search,
  Filter,
  RefreshCw,
  Sun,
  Moon,
  Scissors,
} from 'lucide-react';
import { apiUrl, API_BASE } from '@/frontend/lib/api';

interface GisMapProps {
  activeLayers: Record<GisLevel, ActiveGisLayer | null>;
  selectedLevel: GisLevel | 'none';
  onFeatureClick?: (level: GisLevel, properties: any) => void;
  basemapStyle: BasemapStyle;
  onBasemapChange: (style: BasemapStyle) => void;
  breadcrumb?: {
    districtName?: string;
    talukName?: string;
    villageName?: string;
    parcelName?: string;
  };
  multiBreadcrumb?: {
    districts: { code: string; name: string }[];
    taluks: { code: string; name: string }[];
    villages: { code: string; name: string }[];
    parcels: { code: string; name: string }[];
  };
  onMultiItemSelect?: (level: GisLevel, code?: string) => void;
  onBreadcrumbClick?: (level: GisLevel | 'state') => void;
  onBackStep?: (fromLevel: GisLevel) => void;
  onReset?: () => void;
  zoomRequestLevel?: GisLevel | 'state' | null;
  onZoomRequestHandled?: () => void;
  onChangeLayerColor?: (level: GisLevel | 'subdivision', color: string) => void;
  activeLayerColors?: Record<GisLevel | 'subdivision', string | undefined>;
  onPolygonExtracted?: (result: ExtractedLayerResult | null) => void;
  activeCartLayers?: Record<string, boolean>;
  onToggleCartLayer?: (layerId: string) => void;
  onToggleAllCartLayers?: (enable: boolean) => void;
  onSearchResultSelect?: (result: any) => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  // Boundary data and multi-select props for Download tool and NavigationPanel
  districts?: DistrictItem[];
  taluks?: TalukItem[];
  villages?: VillageItem[];
  parcels?: ParcelItem[];
  selectedDistrict?: string;
  selectedTaluk?: string;
  selectedVillage?: string;
  selectedParcel?: string;
  layerType?: 'fmb' | 'vector';
  onLayerTypeChange?: (type: 'fmb' | 'vector') => void;
  loadingDistricts?: boolean;
  loadingTaluks?: boolean;
  loadingVillages?: boolean;
  loadingParcels?: boolean;
  onDistrictSelect?: (code: string) => void;
  onTalukSelect?: (code: string, parentDistrictCode?: string) => void;
  onVillageSelect?: (code: string, parentDistrictCode?: string, parentTalukCode?: string) => void;
  onParcelSelect?: (code: string, parentDistrictCode?: string, parentTalukCode?: string, parentVillageCode?: string) => void;
  onToggleVisibility?: (level: GisLevel) => void;
  onChangeOpacity?: (level: GisLevel, opacity: number) => void;
  onZoomToLayer?: (level: GisLevel) => void;
  onToggleLabels?: (level: GisLevel) => void;
  multiDistricts?: string[];
  multiTaluks?: string[];
  multiVillages?: string[];
  multiParcels?: string[];
  onToggleMultiDistrict?: (code: string) => void;
  onToggleMultiTaluk?: (code: string) => void;
  onToggleMultiVillage?: (code: string) => void;
  onToggleMultiParcel?: (code: string) => void;
}

const BASEMAP_OPTIONS: {
  key: BasemapStyle;
  label: string;
}[] = [
    { key: 'satellite-hybrid', label: 'Google Hybrid' },
    { key: 'street-view', label: 'Street View' },
    { key: 'esri-satellite', label: 'Satellite (Esri)' },
    { key: 'esri-topo', label: 'Topographic (Esri)' },
  ];

interface BreadcrumbDropdownProps {
  label: string;
  level: GisLevel;
  items: { code: string; name: string }[];
  selectedCode?: string;
  dotColor: string;
  onSelectCombined: () => void;
  onSelectItem: (code: string) => void;
  onRemoveItem?: (code: string) => void;
  onRemoveAll?: () => void;
  onBreadcrumbClick?: (level: GisLevel | 'state') => void;
}

const BreadcrumbDropdown: React.FC<BreadcrumbDropdownProps> = ({
  label,
  level,
  items,
  selectedCode,
  dotColor,
  onSelectCombined,
  onSelectItem,
  onRemoveItem,
  onRemoveAll,
  onBreadcrumbClick,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const namesSummary = items.length <= 2
    ? items.map((i) => i.name).join(', ')
    : `${items.length} ${label}s`;

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold text-xs transition-colors cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700 max-w-[260px]"
        title={items.map((i) => i.name).join(', ')}
      >
        <Eye className="w-3.5 h-3.5 text-sky-500 shrink-0" />
        <span className="truncate">{namesSummary}</span>
        <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 min-w-[210px] max-h-60 overflow-y-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span>Selected {label}s</span>
            <span className="text-[9px] font-normal text-slate-400 font-mono">{items.length} items</span>
          </div>
          <div className="w-full px-3 py-1.5 text-xs font-bold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/60 transition-colors flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                onSelectCombined();
                setOpen(false);
              }}
              className="flex items-center gap-1.5 min-w-0 truncate text-left cursor-pointer flex-1"
            >
              <Eye className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <span className="truncate">All Selected ({items.length})</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onRemoveAll) onRemoveAll();
                setOpen(false);
              }}
              title={`Remove all selected ${label}s`}
              className="p-1 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors cursor-pointer shrink-0 ml-1.5"
            >
              <X className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/40">
            {items.map((item) => {
              const isSelected = selectedCode === item.code;
              return (
                <div
                  key={item.code}
                  className={`w-full px-3 py-1.5 text-xs transition-colors flex items-center justify-between ${
                    isSelected
                      ? 'bg-sky-50 dark:bg-slate-800/90 text-sky-700 dark:text-sky-300 font-bold'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectItem(item.code);
                      setOpen(false);
                    }}
                    className="flex items-center gap-1.5 min-w-0 truncate text-left cursor-pointer flex-1"
                  >
                    {isSelected ? (
                      <Eye className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <Eye className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 opacity-60 shrink-0" />
                    )}
                    <span className="truncate">{item.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onRemoveItem) onRemoveItem(item.code);
                    }}
                    title={`Remove ${item.name}`}
                    className="p-1 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors cursor-pointer shrink-0 ml-1.5"
                  >
                    <X className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

function getFeatureBBox(feature: any): [number, number, number, number] | null {
  if (!feature || !feature.geometry) return null;
  const geom = feature.geometry;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const processCoord = (coord: [number, number]) => {
    if (!coord || typeof coord[0] !== 'number' || typeof coord[1] !== 'number') return;
    const [lng, lat] = coord;
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  };

  const processCoords = (coords: any) => {
    if (!coords || !Array.isArray(coords)) return;
    if (typeof coords[0] === 'number') {
      processCoord(coords as [number, number]);
    } else {
      coords.forEach(processCoords);
    }
  };

  if (geom.coordinates) {
    processCoords(geom.coordinates);
  }

  if (minLng === Infinity || minLat === Infinity || isNaN(minLng) || isNaN(minLat)) return null;
  return [minLng, minLat, maxLng, maxLat];
}

// Reusable Draggable Hook for floating popover cards
const useDraggableCard = (initialPos = { x: 0, y: 0 }) => {
  const [pos, setPos] = useState(initialPos);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef(initialPos);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea, a, [role="button"]')) return;

    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { ...pos };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPos({
        x: posStart.current.x + dx,
        y: posStart.current.y + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return {
    style: pos.x || pos.y ? { transform: `translate3d(${pos.x}px, ${pos.y}px, 0)` } : {},
    handleMouseDown,
    isDragging,
  };
};

export const GisMap: React.FC<GisMapProps> = ({
  preloadedLayers,
  activeLayers,
  selectedLevel,
  onFeatureClick,
  basemapStyle,
  onBasemapChange,
  breadcrumb,
  multiBreadcrumb,
  onMultiItemSelect,
  onBreadcrumbClick,
  onBackStep,
  onReset,
  zoomRequestLevel,
  onZoomRequestHandled,
  onChangeLayerColor,
  activeLayerColors = { district: undefined, taluk: undefined, village: undefined, subdivision: undefined, parcel: undefined },
  onPolygonExtracted,
  activeCartLayers = {},
  onToggleCartLayer,
  onToggleAllCartLayers,
  onSearchResultSelect,
  isSidebarOpen = false,
  onToggleSidebar,
  isDarkMode,
  onToggleDarkMode,
  districts = [],
  taluks = [],
  villages = [],
  parcels = [],
  selectedDistrict = '',
  selectedTaluk = '',
  selectedVillage = '',
  selectedParcel = '',
  layerType = 'vector',
  onLayerTypeChange,
  loadingDistricts,
  loadingTaluks,
  loadingVillages,
  loadingParcels,
  onDistrictSelect,
  onTalukSelect,
  onVillageSelect,
  onParcelSelect,
  onToggleVisibility,
  onChangeOpacity,
  onZoomToLayer,
  onToggleLabels,
  multiDistricts = [],
  multiTaluks = [],
  multiVillages = [],
  multiParcels = [],
  onToggleMultiDistrict,
  onToggleMultiTaluk,
  onToggleMultiVillage,
  onToggleMultiParcel,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapOuterRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const isUserInteractingRef = useRef<boolean>(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [hoveredFeature, setHoveredFeature] = useState<{ level: string; name: string; code: string } | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<'search' | 'filter'>('search');
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [layerCartOpen, setLayerCartOpen] = useState(false);
  const [is3D, setIs3D] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const activePopupLayerRef = useRef<string | null>(null);
  const featureClickedInCurrentEventRef = useRef<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const downloadRef = useRef<HTMLDivElement>(null);
  const downloadButtonRef = useRef<HTMLButtonElement>(null);

  const hasActiveSelection = Boolean(
    (selectedDistrict && selectedDistrict !== 'all') ||
    selectedTaluk ||
    selectedVillage ||
    selectedParcel ||
    multiDistricts.length > 0 ||
    multiTaluks.length > 0 ||
    multiVillages.length > 0 ||
    multiParcels.length > 0 ||
    (activeLayers.district && activeLayers.district.code !== 'all') ||
    activeLayers.taluk ||
    activeLayers.village ||
    activeLayers.parcel
  );

  // Independent Drag Handles for Search Popover, Clip Box, and Download Scope Card
  const navDrag = useDraggableCard();
  const clipDrag = useDraggableCard();
  const clipSelectDrag = useDraggableCard();
  const downloadDrag = useDraggableCard();

  const activeCartLayersRef = useRef<Record<string, boolean>>(activeCartLayers);
  activeCartLayersRef.current = activeCartLayers;

  const activeLayersRef = useRef<Record<GisLevel, ActiveGisLayer | null>>(activeLayers);
  activeLayersRef.current = activeLayers;

  const lastZoomedKeyRef = useRef<string>('');

  // Interactive Clip Selection & Download State
  const [isClipSelectMode, setIsClipSelectMode] = useState(false);
  const isClipSelectModeRef = useRef<boolean>(false);
  isClipSelectModeRef.current = isClipSelectMode;
  const [selectedClipFeatures, setSelectedClipFeatures] = useState<any[]>([]);
  const selectedClipFeaturesRef = useRef<any[]>([]);
  selectedClipFeaturesRef.current = selectedClipFeatures;
  const [showClipDownloadCard, setShowClipDownloadCard] = useState(false);
  const [clipExportFormat, setClipExportFormat] = useState<ExportFormat>('shp');
  const [clipDownloadStatus, setClipDownloadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [clipDownloadError, setClipDownloadError] = useState('');
  const [polygonEmptyWarning, setPolygonEmptyWarning] = useState<string | null>(null);

  // Polygon Drawing & Extraction States
  const [drawMode, setDrawMode] = useState<DrawMode>('idle');
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const [mousePos, setMousePos] = useState<[number, number] | null>(null);
  const [extractedResult, setExtractedResult] = useState<ExtractedLayerResult | null>(null);
  const [showDownloadCard, setShowDownloadCard] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('shp');
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [downloadError, setDownloadError] = useState('');
  const [showHighlight, setShowHighlight] = useState(true);

  // 15 Thematic Layers Spatial Clip Modal State
  const [isClipModalOpen, setIsClipModalOpen] = useState(false);
  const [clippedPreviewGeoJSON, setClippedPreviewGeoJSON] = useState<any | null>(null);

  // Refs for drawing callbacks to avoid stale closures in MapLibre event listeners
  const drawModeRef = useRef<DrawMode>('idle');
  drawModeRef.current = drawMode;
  const drawPointsRef = useRef<[number, number][]>([]);
  drawPointsRef.current = drawPoints;
  const mousePosRef = useRef<[number, number] | null>(null);
  mousePosRef.current = mousePos;
  const extractedResultRef = useRef<ExtractedLayerResult | null>(null);
  extractedResultRef.current = extractedResult;
  const showDownloadCardRef = useRef<boolean>(false);
  showDownloadCardRef.current = showDownloadCard;

  const isSidebarOpenRef = useRef<boolean>(isSidebarOpen);
  isSidebarOpenRef.current = isSidebarOpen;
  const onToggleSidebarRef = useRef<(() => void) | undefined>(onToggleSidebar);
  onToggleSidebarRef.current = onToggleSidebar;

  const prevParcelCodeRef = useRef<string | null>(null);

  // Trigger map resize when sidebar toggles so map canvas dynamically adapts
  useEffect(() => {
    const timer = setTimeout(() => {
      mapRef.current?.resize();
    }, 320);
    return () => clearTimeout(timer);
  }, [isSidebarOpen]);

  // Handle outside click to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setDropdownOpen(false);
        setSearchOpen(false);
      }
      if (
        downloadRef.current &&
        !downloadRef.current.contains(target) &&
        downloadButtonRef.current &&
        !downloadButtonRef.current.contains(target)
      ) {
        setDownloadOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (mapRef.current) {
        setTimeout(() => mapRef.current?.resize(), 150);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // ─── Drawing Layer Sources & Updates ─────────────────────────────────────────
  const updateDrawingSources = useCallback(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    const drawSrc = map.getSource('drawn-polygon-source') as maplibregl.GeoJSONSource;
    if (drawSrc) {
      const features: any[] = [];
      const pts = drawPointsRef.current;
      const mPos = mousePosRef.current;
      const mode = drawModeRef.current;

      if (mode === 'polygon') {
        // 1. Render vertex points
        pts.forEach((p, idx) => {
          features.push({
            type: 'Feature',
            properties: {
              pointType: idx === 0 ? 'start' : 'vertex',
              index: idx,
            },
            geometry: { type: 'Point', coordinates: p },
          });
        });

        // 2. Render connecting lines and dynamic guide line to cursor
        if (pts.length >= 1) {
          const lineCoords = mPos ? [...pts, mPos] : [...pts];
          if (lineCoords.length >= 2) {
            features.push({
              type: 'Feature',
              properties: { lineType: 'guideline' },
              geometry: { type: 'LineString', coordinates: lineCoords },
            });
          }
        }

        // 3. Render preview polygon fill if >= 2 points + cursor
        if (pts.length >= 2 && mPos) {
          try {
            const polyCoords = [...pts, mPos, pts[0]];
            features.push({
              type: 'Feature',
              properties: { polyType: 'preview' },
              geometry: { type: 'Polygon', coordinates: [polyCoords] },
            });
          } catch {
            // ignore preview geometry error
          }
        }
      } else if (mode === 'rectangle' && pts.length === 1 && mPos) {
        // Rectangle preview box
        const p1 = pts[0];
        const p2 = mPos;
        const rectCoords = [
          [p1[0], p1[1]],
          [p2[0], p1[1]],
          [p2[0], p2[1]],
          [p1[0], p2[1]],
          [p1[0], p1[1]],
        ];
        features.push({
          type: 'Feature',
          properties: { polyType: 'preview' },
          geometry: { type: 'Polygon', coordinates: [rectCoords] },
        });
        features.push({
          type: 'Feature',
          properties: { pointType: 'start' },
          geometry: { type: 'Point', coordinates: p1 },
        });
      } else if (extractedResultRef.current?.polygonGeojson) {
        // Show finalized polygon boundary
        features.push(extractedResultRef.current.polygonGeojson);
      }

      drawSrc.setData({
        type: 'FeatureCollection',
        features,
      });
    }

    // Extracted features source (keep empty - no nearby layer highlight)
    const extSrc = map.getSource('extracted-features-source') as maplibregl.GeoJSONSource;
    if (extSrc) {
      extSrc.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [mapLoaded]);

  useEffect(() => {
    updateDrawingSources();
  }, [drawPoints, mousePos, drawMode, extractedResult, updateDrawingSources]);

  // Finish Polygon Drawing & Export the Exact Drawn Area Geometry
  const finishDrawingPolygon = useCallback((points: [number, number][]) => {
    if (points.length < 3) return;
    const closedCoords = [...points, points[0]];
    let drawnPoly: any;
    try {
      drawnPoly = turf.polygon([closedCoords]);
    } catch (err) {
      console.error('Invalid polygon geometry:', err);
      return;
    }

    // Calculate live area in sq. meters & acres & perimeter
    const areaSqM = turf.area(drawnPoly);
    const areaAcres = +(areaSqM * 0.000247105).toFixed(2);
    const perimeterM = Math.round(turf.length(drawnPoly, { units: 'meters' }));

    const polyName = `${breadcrumb?.villageName || breadcrumb?.talukName || breadcrumb?.districtName || 'Custom'} Polygon Area`;

    const drawnFeature = {
      type: 'Feature' as const,
      properties: {
        name: polyName,
        survey_no: 'Drawn Polygon',
        district_name: breadcrumb?.districtName || '',
        taluk_name: breadcrumb?.talukName || '',
        village_name: breadcrumb?.villageName || '',
        area_acres: areaAcres,
        area_sqm: Math.round(areaSqM),
        perimeter_meters: perimeterM,
        points_count: points.length,
      },
      geometry: drawnPoly.geometry,
    };

    const result: ExtractedLayerResult = {
      geojson: {
        type: 'FeatureCollection',
        features: [drawnFeature],
      },
      featureCount: 1,
      totalAreaAcres: areaAcres,
      totalAreaSqMeters: Math.round(areaSqM),
      layerLevels: ['parcel'],
      polygonGeojson: drawnPoly,
      featureNames: [polyName],
    };

    setExtractedResult(result);
    onPolygonExtracted?.(result);
    setDrawMode('idle');
    setDrawPoints([]);
    setMousePos(null);
    setShowDownloadCard(false);

    // Check if there are any features (villages, FMB parcels, or 15 cart layers) inside the drawn polygon before opening modal
    const checkAndOpenClip = async () => {
      try {
        const vCodes = (multiVillages && multiVillages.length > 0)
          ? multiVillages
          : (selectedVillage ? [selectedVillage] : []);

        const res = await fetch(apiUrl('/api/spatial/clip/preview'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clip_polygon: drawnPoly,
            village_geojson: activeLayers.village?.geojson || null,
            parcel_geojson: activeLayers.parcel?.geojson || null,
            district_code: selectedDistrict || '',
            taluk_code: selectedTaluk || '',
            village_code: selectedVillage || '',
            village_codes: vCodes,
            file_type: layerType || 'fmb',
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const counts: Record<string, number> = data.counts || {};
          const totalFeatures = data.total_features || 0;
          const hasAnyData = totalFeatures > 0 || Object.values(counts).some((c) => (c || 0) > 0);

          if (hasAnyData) {
            setPolygonEmptyWarning(null);
            setIsClipModalOpen(true);
          } else {
            setPolygonEmptyWarning('No layers or parcels found inside this drawn polygon.');
            setIsClipModalOpen(false);
            setTimeout(() => setPolygonEmptyWarning(null), 5000);
          }
        } else {
          setIsClipModalOpen(true);
        }
      } catch {
        setIsClipModalOpen(true);
      }
    };

    checkAndOpenClip();

    // Zoom map smoothly to the drawn polygon bounding box
    if (mapRef.current) {
      try {
        const polyBbox = turf.bbox(drawnPoly) as [number, number, number, number];
        if (polyBbox && polyBbox.length === 4) {
          mapRef.current.fitBounds(polyBbox, {
            padding: { top: 80, bottom: 120, left: 80, right: 80 },
            duration: 800,
          });
        }
      } catch {
        // ignore bbox zoom errors
      }
    }
  }, [breadcrumb, onPolygonExtracted, activeLayers, selectedDistrict, selectedTaluk, selectedVillage, multiVillages, layerType]);

  // Clear all drawing and extraction
  const handleClearDraw = useCallback(() => {
    setDrawMode('idle');
    setDrawPoints([]);
    setMousePos(null);
    setExtractedResult(null);
    setShowDownloadCard(false);
    onPolygonExtracted?.(null);
    if (mapRef.current) {
      const drawSrc = mapRef.current.getSource('drawn-polygon-source') as maplibregl.GeoJSONSource;
      if (drawSrc) drawSrc.setData({ type: 'FeatureCollection', features: [] });
      const extSrc = mapRef.current.getSource('extracted-features-source') as maplibregl.GeoJSONSource;
      if (extSrc) extSrc.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [onPolygonExtracted]);

  // Undo last point during drawing
  const handleUndoPoint = useCallback(() => {
    setDrawPoints((prev) => {
      if (prev.length <= 1) return [];
      return prev.slice(0, prev.length - 1);
    });
  }, []);

  // Keyboard shortcut handlers (Escape / Delete to cancel/clear, Ctrl+Z to undo, Enter to complete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (drawModeRef.current !== 'idle') {
        if (e.key === 'Escape' || e.key === 'Delete') {
          e.preventDefault();
          handleClearDraw();
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          handleUndoPoint();
        } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          handleUndoPoint();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (drawPointsRef.current.length >= 3) {
            finishDrawingPolygon(drawPointsRef.current);
          }
        }
      } else if (extractedResultRef.current || showDownloadCardRef.current) {
        if (e.key === 'Escape' || e.key === 'Delete') {
          e.preventDefault();
          handleClearDraw();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [finishDrawingPolygon, handleUndoPoint, handleClearDraw]);

  // ─── Initial MapLibre GL creation ──────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialStyle: maplibregl.StyleSpecification = {
      version: 8,
      glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
      sources: {
        'source-street-view': {
          type: 'raster',
          tiles: [
            'https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
            'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
            'https://mt2.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
            'https://mt3.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
          ],
          tileSize: 256,
          maxzoom: 20,
          attribution: '© Google Maps',
        },
        'source-google-hybrid': {
          type: 'raster',
          tiles: [
            'https://mt0.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
            'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
            'https://mt2.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
            'https://mt3.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
          ],
          tileSize: 256,
          maxzoom: 20,
          attribution: '© Google Maps',
        },
        'source-esri-satellite': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          maxzoom: 19,
          attribution: 'Esri, Maxar, Earthstar Geographics',
        },
        'source-esri-topo': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          maxzoom: 19,
          attribution: 'Esri, HERE, Garmin',
        },
        'district-source': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        'taluk-source': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        'village-base-source': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        'village-source': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        'parcel-source': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        'extracted-features-source': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        'drawn-polygon-source': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        'clipped-preview-source': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        'auto-zoom-district-source': { type: 'geojson', data: preloadedLayers?.districtGeoJson || apiUrl('/api/auto-zoom-layer?level=district') },
        'auto-zoom-taluk-source': { type: 'geojson', data: preloadedLayers?.talukGeoJson || apiUrl('/api/auto-zoom-layer?level=taluk') },
        'auto-zoom-village-source': { type: 'geojson', data: preloadedLayers?.villageGeoJson || apiUrl('/api/auto-zoom-layer?level=village') },
        // FMB merged boundaries — vector tile source for district 01
        'fmb-district-01-source': {
          type: 'vector',
          tiles: [apiUrl('/api/fmb-tiles/{z}/{x}/{y}.pbf')],
          minzoom: 0,
          maxzoom: 22,
        },
      },
      layers: [
        {
          id: 'basemap-street-view',
          type: 'raster',
          source: 'source-street-view',
          minzoom: 0,
          maxzoom: 20,
          layout: { visibility: 'none' },
        },
        {
          id: 'basemap-google-hybrid',
          type: 'raster',
          source: 'source-google-hybrid',
          minzoom: 0,
          maxzoom: 20,
          layout: { visibility: 'visible' },
        },
        {
          id: 'basemap-esri-satellite',
          type: 'raster',
          source: 'source-esri-satellite',
          minzoom: 0,
          maxzoom: 20,
          layout: { visibility: 'none' },
        },
        {
          id: 'basemap-esri-topo',
          type: 'raster',
          source: 'source-esri-topo',
          minzoom: 0,
          maxzoom: 20,
          layout: { visibility: 'none' },
        },
        // Automatic Zoom-Based Background Display Layers (Hierarchical & Persistent)
        {
          id: 'auto-zoom-district-outline',
          type: 'line',
          source: 'auto-zoom-district-source',
          minzoom: 0,
          maxzoom: 22.0,
          paint: { 'line-color': '#eab308', 'line-width': 1.8, 'line-opacity': 0.85 },
        },
        {
          id: 'auto-zoom-taluk-outline',
          type: 'line',
          source: 'auto-zoom-taluk-source',
          minzoom: 8.5,
          maxzoom: 22.0,
          paint: { 'line-color': '#9333ea', 'line-width': 1.8, 'line-opacity': 0.85 },
        },
        {
          id: 'auto-zoom-village-outline',
          type: 'line',
          source: 'auto-zoom-village-source',
          minzoom: 10.5,
          maxzoom: 22.0,
          paint: { 'line-color': '#22c55e', 'line-width': 1.4, 'line-opacity': 0.85 },
        },
        // FMB district-01 boundary outlines — permanent auto-zoom layer, visible from village zoom level (11+)
        {
          id: 'fmb-district-01-outline',
          type: 'line',
          source: 'fmb-district-01-source',
          'source-layer': 'fmb_district_01',
          minzoom: 11.0,
          maxzoom: 22,
          paint: {
            'line-color': '#f97316',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              11.0, 0.5,
              13.0, 0.8,
              15.0, 1.2,
              18.0, 1.8,
            ],
            'line-opacity': 0.85,
          },
        },
        // Automatic Zoom-Based Name Labels (Controlled by Zoom Level & Deduplicated)
        {
          id: 'auto-zoom-taluk-labels',
          type: 'symbol',
          source: 'auto-zoom-taluk-source',
          minzoom: 8.8,
          maxzoom: 10.8,
          layout: {
            'text-field': [
              'coalesce',
              ['get', 'taluk_name'],
              ['get', 'name'],
              ['get', 'NAME_2'],
              ['get', 'TALUK'],
              ['get', 'Taluk_Name'],
              ['get', 'taluk'],
              ''
            ],
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': 11.5,
            'text-transform': 'uppercase',
            'text-allow-overlap': false,
            'text-ignore-placement': false,
            'text-padding': 20,
          },
          paint: {
            'text-color': '#6b21a8',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2,
          },
        },
        {
          id: 'auto-zoom-village-labels',
          type: 'symbol',
          source: 'auto-zoom-village-source',
          minzoom: 10.5,
          maxzoom: 22.0,
          layout: {
            'text-field': [
              'coalesce',
              ['get', 'v'],
              ['get', 'vill_name'],
              ['get', 'village_name'],
              ['get', 'vtname'],
              ['get', 'lgd_villag'],
              ['get', 'name'],
              ['get', 'NAME_3'],
              ['get', 'VILLAGE'],
              ['get', 'VIL_NAME'],
              ['get', 'Village_Nam'],
              ['get', 'village'],
              ''
            ],
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': [
              'interpolate', ['linear'], ['zoom'],
              10.5, 9,
              13, 11,
              16, 13,
            ],
            'text-allow-overlap': false,
            'text-ignore-placement': false,
            'text-padding': 30,
          },
          paint: {
            'text-color': '#15803d',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2.5,
          },
        },
        // District Layer
        {
          id: 'district-fill',
          type: 'fill',
          source: 'district-source',
          paint: { 'fill-color': '#0284c7', 'fill-opacity': 0.15 },
        },
        {
          id: 'district-outline',
          type: 'line',
          source: 'district-source',
          paint: { 'line-color': '#0284c7', 'line-width': 3.5, 'line-opacity': 0.95 },
        },
        {
          id: 'district-labels',
          type: 'symbol',
          source: 'auto-zoom-district-source',
          minzoom: 0,
          maxzoom: 8.5,
          layout: {
            'text-field': [
              'coalesce',
              ['get', 'district_name'],
              ['get', 'dist_name'],
              ['get', 'DIST_NAME'],
              ['get', 'name'],
              ['get', 'NAME_1'],
              ['get', 'DISTRICT'],
              ['get', 'district'],
              ''
            ],
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': 12.5,
            'text-anchor': 'center',
            'visibility': 'visible',
            'text-padding': 25,
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#0f172a',
            'text-halo-width': 2.5,
          },
        },
        // Taluk Layer
        {
          id: 'taluk-fill',
          type: 'fill',
          source: 'taluk-source',
          paint: { 'fill-color': '#a855f7', 'fill-opacity': 0.35 },
        },
        {
          id: 'taluk-outline',
          type: 'line',
          source: 'taluk-source',
          paint: { 'line-color': '#cc00ff', 'line-width': 5, 'line-opacity': 1.0 },
        },
        {
          id: 'taluk-labels',
          type: 'symbol',
          source: 'taluk-source',
          minzoom: 6.5,
          maxzoom: 10.8,
          layout: {
            'text-field': ['coalesce', ['get', 'talukname'], ['get', 'taluk_name'], ['get', 'name'], ''],
            'text-font': ['Open Sans Bold'],
            'text-size': 12,
            'text-anchor': 'center',
            'visibility': 'visible',
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#3b0764',
            'text-halo-width': 2.5,
          },
        },
        // 1. FMB Subdivision Polygons (Green with 5% opacity)
        {
          id: 'village-fill',
          type: 'fill',
          source: 'village-source',
          paint: {
            'fill-color': '#22c55e',
            'fill-opacity': 0.05,
          },
        },
        // 2. FMB Subdivision Internal Lines (Green)
        {
          id: 'village-outline',
          type: 'line',
          source: 'village-source',
          paint: {
            'line-color': '#22c55e',
            'line-width': 1.8,
            'line-opacity': 1.0,
          },
        },
        // 3. Base Survey Parcel Outer Boundary (Vector Yellow) - Always on TOP
        {
          id: 'village-base-outline',
          type: 'line',
          source: 'village-base-source',
          paint: {
            'line-color': '#f59e0b', // Yellow for Vector Village Layer
            'line-width': 2.0,
            'line-opacity': 1.0,
          },
        },
        {
          id: 'village-labels',
          type: 'symbol',
          source: 'village-source',
          minzoom: 12,
          layout: {
            'text-field': [
              'coalesce',
              ['get', 'survey_no'],
              ['get', 'SURVEY_NO'],
              ['get', 'sno'],
              ['get', 'sf_no'],
              ['get', 'KIDE'],
              ['get', 'name'],
              ''
            ],
            'text-font': ['Open Sans Bold'],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              12, 10,
              15, 12,
              18, 15
            ],
            'text-anchor': 'center',
            'text-allow-overlap': false,
            'text-ignore-placement': false,
            'visibility': 'visible',
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#0f172a',
            'text-halo-width': 2.5,
            'text-halo-blur': 0.5,
          },
        },
        // Parcel Layer
        {
          id: 'parcel-fill',
          type: 'fill',
          source: 'parcel-source',
          paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.45 },
        },
        {
          id: 'parcel-outline',
          type: 'line',
          source: 'parcel-source',
          paint: { 'line-color': '#22c55e', 'line-width': 4, 'line-opacity': 1.0 },
        },
        {
          id: 'parcel-labels',
          type: 'symbol',
          source: 'parcel-source',
          minzoom: 13,
          layout: {
            'text-field': [
              'coalesce',
              ['get', 'KIDE'],
              ['get', 'subdivision'],
              ['get', 'survey_no'],
              ['get', 'name'],
              ''
            ],
            'text-font': ['Open Sans Bold'],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              13, 12,
              16, 15,
              19, 18
            ],
            'text-anchor': 'center',
            'text-allow-overlap': true,
            'visibility': 'visible',
          },
          paint: {
            'text-color': '#fde047',
            'text-halo-color': '#000000',
            'text-halo-width': 3.0,
            'text-halo-blur': 0.5,
          },
        },
        // Extracted features
        {
          id: 'extracted-features-fill',
          type: 'fill',
          source: 'extracted-features-source',
          paint: { 'fill-color': '#10b981', 'fill-opacity': 0.45 },
        },
        {
          id: 'extracted-features-outline',
          type: 'line',
          source: 'extracted-features-source',
          paint: { 'line-color': '#059669', 'line-width': 4.0, 'line-opacity': 1 },
        },
        // Drawn polygon
        {
          id: 'drawn-polygon-fill',
          type: 'fill',
          source: 'drawn-polygon-source',
          filter: ['==', '$type', 'Polygon'],
          paint: { 'fill-color': '#06b6d4', 'fill-opacity': 0.25 },
        },
        {
          id: 'drawn-polygon-stroke',
          type: 'line',
          source: 'drawn-polygon-source',
          paint: {
            'line-color': '#f59e0b',
            'line-width': 2.5,
            'line-opacity': 1.0,
            'line-dasharray': [3, 2],
          },
        },
        {
          id: 'drawn-polygon-vertices',
          type: 'circle',
          source: 'drawn-polygon-source',
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-radius': 6,
            'circle-color': ['case', ['==', ['get', 'pointType'], 'start'], '#f59e0b', '#ffffff'],
            'circle-stroke-color': '#0891b2',
            'circle-stroke-width': 2.5,
          },
        },
        // 15 Thematic Layers Clipped Result Preview Layers
        {
          id: 'clipped-preview-fill',
          type: 'fill',
          source: 'clipped-preview-source',
          filter: ['==', '$type', 'Polygon'],
          paint: {
            'fill-color': ['coalesce', ['get', '_clip_layer_color'], '#06b6d4'],
            'fill-opacity': 0.45,
          },
        },
        {
          id: 'clipped-preview-line',
          type: 'line',
          source: 'clipped-preview-source',
          filter: ['in', '$type', 'LineString', 'Polygon'],
          paint: {
            'line-color': ['coalesce', ['get', '_clip_layer_color'], '#06b6d4'],
            'line-width': 3.5,
          },
        },
        {
          id: 'clipped-preview-circle',
          type: 'circle',
          source: 'clipped-preview-source',
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-radius': 5.5,
            'circle-color': ['coalesce', ['get', '_clip_layer_color'], '#f59e0b'],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.5,
          },
        },
      ],
    };

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: initialStyle,
      bounds: TAMIL_NADU_BOUNDS,
      fitBoundsOptions: {
        padding: { top: 40, bottom: 40, left: 40, right: 40 },
      },
      minZoom: 5.0,
      maxZoom: 19.2,
      doubleClickZoom: true,
      maxBounds: TAMIL_NADU_MAX_BOUNDS,
      pitch: is3D ? 45 : 0,
      attributionControl: false,
    });

    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    popupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 15,
    });

    popupRef.current.on('close', () => {
      activePopupLayerRef.current = null;
    });

    (window as any)._closeGisPopup = () => {
      if (popupRef.current) {
        popupRef.current.remove();
        activePopupLayerRef.current = null;
      }
      setHoveredFeature(null);
    };

    map.doubleClickZoom.disable();

    // Step-by-Step Level-Based Double-Click / Double-Tap Zoom Handler
    map.on('dblclick', (e) => {
      // Ignore double click if currently drawing a polygon
      if (drawModeRef.current !== 'idle') return;

      const currentZoom = map.getZoom();
      const targetCoords: [number, number] = [e.lngLat.lng, e.lngLat.lat];

      if (currentZoom < 8.2) {
        // 1st Double-Click: Zoom directly to Taluk Level
        map.easeTo({
          center: targetCoords,
          zoom: 9.2,
          duration: 700,
          essential: true,
        });
      } else if (currentZoom < 10.5) {
        // 2nd Double-Click: Zoom directly to Village Level
        map.easeTo({
          center: targetCoords,
          zoom: 11.8,
          duration: 700,
          essential: true,
        });
      } else {
        // 3rd Double-Click: Zoom into Cadastral / Survey Parcel Level
        map.easeTo({
          center: targetCoords,
          zoom: Math.min(18.5, currentZoom + 3.0),
          duration: 700,
          essential: true,
        });
      }
    });

    // Map Click Handler for Blank Space Dismissal, Drawing Mode & Auto-Closing Search Popover on Map Click
    map.on('click', (e) => {
      const mode = drawModeRef.current;
      const wasFeatureClicked = Boolean((e.originalEvent as any)?._gisFeatureClicked || featureClickedInCurrentEventRef.current);
      setTimeout(() => {
        featureClickedInCurrentEventRef.current = false;
      }, 0);

      if (mode === 'idle') {
        // Clip Selection Mode: detect clicked parcel/subdivision and toggle selection
        if (isClipSelectModeRef.current) {
          const queryLayers: string[] = [];
          if (map.getLayer('village-fill')) queryLayers.push('village-fill');
          if (map.getLayer('parcel-fill')) queryLayers.push('parcel-fill');

          if (queryLayers.length > 0) {
            const features = map.queryRenderedFeatures(e.point, { layers: queryLayers });
            if (features && features.length > 0) {
              const clickedFeat = features[0];
              const props = clickedFeat.properties || {};
              const sno = String(props.survey_no || props.SURVEY_NO || props.sno || props.KIDE || props.name || props.code || clickedFeat.id || '').trim();
              const featKey = props.code || sno || String(clickedFeat.id || Math.random());

              setSelectedClipFeatures((prev) => {
                const existingIdx = prev.findIndex((item) => {
                  const iProps = item.properties || {};
                  const iSno = String(iProps.survey_no || iProps.SURVEY_NO || iProps.sno || iProps.KIDE || iProps.name || iProps.code || item.id || '').trim();
                  const iKey = iProps.code || iSno || String(item.id);
                  return iKey === featKey || (sno && iSno && iSno === sno);
                });
                if (existingIdx >= 0) {
                  return prev.filter((_, i) => i !== existingIdx);
                }
                return [
                  ...prev,
                  {
                    type: 'Feature',
                    properties: { ...props, survey_no: sno, name: props.name || (sno ? `Survey ${sno}` : 'Parcel') },
                    geometry: clickedFeat.geometry,
                  },
                ];
              });
            }
          }
          return; // do NOT fall through to sidebar/popup logic in clip mode
        }

        // Don't collapse sidebar or close search during clip selection mode
        if (!isClipSelectModeRef.current) {
          setSearchOpen(false);
          if (isSidebarOpenRef.current && onToggleSidebarRef.current) {
            onToggleSidebarRef.current();
          }
        }

        // When touching or clicking on blank space (no feature clicked), dismiss any open label / popup
        // But skip this when in clip mode (a map click is a selection action, not a dismiss action)
        if (!wasFeatureClicked && !isClipSelectModeRef.current) {
          if (popupRef.current) {
            popupRef.current.remove();
            activePopupLayerRef.current = null;
          }
          setHoveredFeature(null);
        }

      } else if (mode === 'polygon') {
        const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const pts = drawPointsRef.current;

        // Check if clicking close to start vertex to complete polygon
        if (pts.length >= 3) {
          const startPt = pts[0];
          const startScreen = map.project(startPt);
          const clickScreen = e.point;
          const distPx = Math.hypot(clickScreen.x - startScreen.x, clickScreen.y - startScreen.y);
          if (distPx < 22) {
            finishDrawingPolygon(pts);
            return;
          }
        }

        setDrawPoints([...pts, coord]);
      } else if (mode === 'rectangle') {
        const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        if (drawPointsRef.current.length === 0) {
          setDrawPoints([coord]);
        } else if (drawPointsRef.current.length === 1) {
          const p1 = drawPointsRef.current[0];
          const p2 = coord;
          const rectCoords: [number, number][] = [
            p1,
            [p2[0], p1[1]],
            p2,
            [p1[0], p2[1]],
          ];
          finishDrawingPolygon(rectCoords);
        }
      }
    });

    // Mousemove Handler for polygon drawing live preview + crosshair in clip mode
    map.on('mousemove', (e) => {
      if (drawModeRef.current !== 'idle') {
        map.getCanvas().style.cursor = 'crosshair';
        setMousePos([e.lngLat.lng, e.lngLat.lat]);
      } else if (isClipSelectModeRef.current) {
        map.getCanvas().style.cursor = 'crosshair';
        setMousePos(null);
      } else {
        map.getCanvas().style.cursor = '';
        setMousePos(null);
      }
    });

    // Double-click to complete polygon drawing or feature zoom
    map.on('dblclick', (e) => {
      if (drawModeRef.current === 'polygon') {
        e.preventDefault();
        const pts = drawPointsRef.current;
        if (pts.length >= 3) {
          finishDrawingPolygon(pts);
        }
        return;
      }

      // Feature Zoom on double-click
      const levels: GisLevel[] = ['parcel', 'village', 'taluk', 'district'];
      for (const lvl of levels) {
        const fillLayerId = `${lvl}-fill`;
        if (map.getLayer(fillLayerId)) {
          const features = map.queryRenderedFeatures(e.point, { layers: [fillLayerId] });
          if (features && features.length > 0) {
            const feature = features[0];
            const bbox = getFeatureBBox(feature);
            if (bbox) {
              map.fitBounds(bbox, {
                padding: { top: 60, bottom: 60, left: 60, right: 60 },
                maxZoom: lvl === 'parcel' ? 18.0 : lvl === 'village' ? 16.0 : lvl === 'taluk' ? 13.5 : 11,
                duration: 800,
              });
              return;
            }
          }
        }
      }
    });

    const onMapReady = () => {
      if (mapRef.current !== map) return;
      (window as any).__debugMap = map;

      applyBasemapVisibility(map, basemapStyle);
      setMapLoaded(true);
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.resize();
          syncActiveLayers(mapRef.current, activeLayersRef.current);
        }
      }, 50);
      console.log('[onMapReady] Map initialized and ready.');
      syncActiveLayers(map, activeLayersRef.current);
    };

    map.on('load', onMapReady);
    map.on('style.load', onMapReady);

    mapRef.current = map;
    (window as any).__debugMap = map;

    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Basemap visibility smoothly
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    applyBasemapVisibility(mapRef.current, basemapStyle);
  }, [basemapStyle, mapLoaded]);

  // Helper to apply basemap visibility without recreating map style
  const applyBasemapVisibility = (map: maplibregl.Map, style: BasemapStyle) => {
    const basemapMap: Record<string, string> = {
      'street-view': 'basemap-street-view',
      'google-street': 'basemap-street-view',
      'satellite-hybrid': 'basemap-google-hybrid',
      'esri-satellite': 'basemap-esri-satellite',
      'esri-topo': 'basemap-esri-topo',
    };

    const targetLayerId = basemapMap[style] || 'basemap-google-hybrid';
    const allBasemapLayers = [
      'basemap-street-view',
      'basemap-google-hybrid',
      'basemap-esri-satellite',
      'basemap-esri-topo',
    ];

    allBasemapLayers.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(
          layerId,
          'visibility',
          layerId === targetLayerId ? 'visible' : 'none'
        );
      }
    });
  };

  // Toggle 3D Pitch
  const toggle3DPitch = () => {
    if (!mapRef.current) return;
    const next3D = !is3D;
    setIs3D(next3D);
    mapRef.current.easeTo({
      pitch: next3D ? 45 : 0,
      bearing: next3D ? -15 : 0,
      duration: 800,
    });
  };

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  const handleZoomIn = () => {
    if (mapRef.current) {
      const curZoom = mapRef.current.getZoom();
      if (curZoom < 19.0) {
        mapRef.current.zoomIn({ duration: 300 });
      }
    }
  };

  const handleZoomOut = () => {
    if (mapRef.current) mapRef.current.zoomOut({ duration: 300 });
  };

  const handleResetView = () => {
    if (!mapRef.current) return;
    mapRef.current.fitBounds(TAMIL_NADU_BOUNDS, {
      padding: { top: 35, bottom: 35, left: 35, right: 35 },
      pitch: is3D ? 45 : 0,
      bearing: 0,
      duration: 900,
    });
    onReset?.();
  };

  // Setup interactive hover/click handlers
  const setupVectorLayers = (map: maplibregl.Map) => {
    const levels: GisLevel[] = ['parcel', 'village', 'taluk', 'district'];
    levels.forEach((lvl) => {
      const fillLayerId = `${lvl}-fill`;
      if (!map.getLayer(fillLayerId)) return;

      map.on('mousemove', fillLayerId, (e) => {
        if (drawModeRef.current !== 'idle') return;

        if (isClipSelectModeRef.current) {
          map.getCanvas().style.cursor = 'crosshair';
          if (e.features && e.features.length > 0) {
            const props = e.features[0].properties || {};
            const surveyNo = String(props.survey_no || props.SURVEY_NO || props.sno || props.KIDE || props.name || '').trim();
            const isSelected = selectedClipFeaturesRef.current.some((f) => {
              const p = f.properties || {};
              const s = String(p.survey_no || p.SURVEY_NO || p.sno || p.KIDE || p.name || '').trim();
              return s && s === surveyNo;
            });
            setHoveredFeature({
              level: 'CLIP SELECT',
              name: `${isSelected ? '✓ Selected' : '+ Click to Select'} Survey ${surveyNo}`,
              code: isSelected ? 'Click to Deselect' : 'Click to Select',
            });
          }
          return;
        }

        map.getCanvas().style.cursor = 'pointer';

        if (e.features && e.features.length > 0) {
          const feat = e.features[0];
          const props = feat.properties;

          const villageName = activeLayersRef.current.village?.name || breadcrumb?.villageName || '';
          const rawName = props?.name || props?.village_name || '';
          const surveyNo = props?.survey_no || props?.KIDE || props?.sf_no || '';
          const name = rawName || (lvl === 'village' ? villageName : '') || props?.code || (surveyNo ? `Survey ${surveyNo}` : lvl.toUpperCase());

          setHoveredFeature({
            level: lvl.toUpperCase(),
            name: name,
            code: props?.code || surveyNo || '',
          });

          if (popupRef.current) {
            const vName = villageName || rawName || props?.code || 'Village';
            let popupContent = '';

            if (lvl === 'village') {
              const isSubdiv = surveyNo.includes('/') || !!props?.subdivision || props?.fmb === 1;
              popupContent = `
                <div class="px-2.5 py-1.5 font-sans rounded-xl bg-white/98 dark:bg-slate-900/98 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs flex items-center gap-2 whitespace-nowrap">
                  <span class="font-black text-[9px] uppercase px-1.5 py-0.2 rounded border ${isSubdiv ? 'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800' : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'}">
                    ${isSubdiv ? 'FMB SUBDIVISION' : 'BASE PARCEL'}
                  </span>
                  <span class="font-bold text-slate-900 dark:text-slate-100">${vName}</span>
                  ${surveyNo ? `<span class="text-slate-500 text-[11px] font-mono">| Survey No: <span class="${isSubdiv ? 'text-sky-600 dark:text-sky-400' : 'text-amber-600 dark:text-amber-400'} font-black">${surveyNo}</span></span>` : ''}
                </div>`;
            } else if (lvl === 'parcel') {
              popupContent = `
                <div class="px-2.5 py-1 font-sans rounded-lg bg-white/98 text-slate-800 border border-slate-200 shadow-xl text-xs flex items-center gap-1.5 whitespace-nowrap">
                  <span class="font-bold text-amber-600 uppercase text-[10px]">PARCEL:</span>
                  <span class="font-semibold text-slate-900">${surveyNo ? `Survey No: ${surveyNo}` : (name || 'Parcel')}</span>
                  ${vName ? `<span class="text-slate-500 text-[11px] font-mono">(${vName})</span>` : ''}
                </div>`;
            } else {
              popupContent = `
                <div class="px-2.5 py-1 font-sans rounded-lg bg-white/98 text-slate-800 border border-slate-200 shadow-xl text-xs flex items-center gap-1.5 whitespace-nowrap">
                  <span class="font-bold text-sky-600 uppercase text-[10px]">${lvl}:</span>
                  <span class="font-semibold text-slate-900">${name || props?.code || lvl.toUpperCase()}</span>
                </div>`;
            }

            popupRef.current
              .setLngLat(e.lngLat)
              .setHTML(popupContent)
              .addTo(map);
          }
        }
      });

      map.on('mouseleave', fillLayerId, () => {
        if (drawModeRef.current !== 'idle') return;
        map.getCanvas().style.cursor = '';
        setHoveredFeature(null);
        if (popupRef.current) popupRef.current.remove();
      });

      map.on('click', fillLayerId, (e) => {
        if (drawModeRef.current !== 'idle') return;

        if (isClipSelectModeRef.current) {
          if (e.originalEvent) {
            (e.originalEvent as any)._gisFeatureClicked = true;
          }
          featureClickedInCurrentEventRef.current = true;

          if (e.features && e.features.length > 0) {
            const clickedFeat = e.features[0];
            const props = clickedFeat.properties || {};
            const sno = String(props.survey_no || props.SURVEY_NO || props.sno || props.KIDE || props.name || props.code || clickedFeat.id || '').trim();
            const featId = props.code || `${props.village_code || ''}_${sno}` || sno || String(clickedFeat.id || Math.random());

            setSelectedClipFeatures((prev) => {
              const existingIdx = prev.findIndex((item) => {
                const itemProps = item.properties || {};
                const itemSno = String(itemProps.survey_no || itemProps.SURVEY_NO || itemProps.sno || itemProps.KIDE || itemProps.name || itemProps.code || item.id || '').trim();
                const itemKey = itemProps.code || `${itemProps.village_code || ''}_${itemSno}` || itemSno || String(item.id);
                return itemKey === featId || (sno && itemSno && itemSno === sno);
              });

              if (existingIdx >= 0) {
                // Deselect
                return prev.filter((_, idx) => idx !== existingIdx);
              } else {
                // Select
                const newFeature = {
                  type: 'Feature',
                  properties: { ...props, survey_no: sno, name: props.name || (sno ? `Survey ${sno}` : 'Parcel') },
                  geometry: clickedFeat.geometry,
                };
                return [...prev, newFeature];
              }
            });
          }
          return;
        }

        if (e.features && e.features.length > 0) {
          if (e.originalEvent) {
            (e.originalEvent as any)._gisFeatureClicked = true;
          }
          featureClickedInCurrentEventRef.current = true;
          activePopupLayerRef.current = `boundary_${lvl}`;

          if (lvl === 'parcel' || lvl === 'village') {
            setShowDownloadCard(true);
            setDownloadOpen(false);
            setLayerCartOpen(false);
            setDropdownOpen(false);
          }
          if (onFeatureClick) {
            onFeatureClick(lvl, e.features[0].properties);
          }
        }
      });
    });
  };

  // Synchronize GeoJSON sources and visibility
  const syncActiveLayers = (map: maplibregl.Map, layersToSync: Record<GisLevel, ActiveGisLayer | null> = activeLayers) => {
    if (!map) return;
    const levels: GisLevel[] = ['district', 'taluk', 'village', 'parcel'];

    levels.forEach((lvl) => {
      const srcName = `${lvl}-source`;
      const fillLayer = `${lvl}-fill`;
      const outlineLayer = `${lvl}-outline`;
      const labelLayer = `${lvl}-labels`;

      const layerData = layersToSync[lvl];
      const src = map.getSource(srcName) as maplibregl.GeoJSONSource;

      if (src) {
        if (layerData && layerData.geojson && (layerData.visible !== false)) {
          console.log(`[syncActiveLayers] Setting ${lvl} data with features count:`, layerData.geojson.features?.length);
          src.setData(layerData.geojson);
          const color = activeLayerColors[lvl] || layerData.color;
          const opacity = layerData.opacity !== undefined ? layerData.opacity : (lvl === 'parcel' ? 0.45 : 0.40);

          if (lvl === 'village') {
            const isTNRevenueVillageBoundary = (layerData.code === 'tn_village_boundaries');
            const isFmbMode = (layerData.file_type === 'fmb' || layerType === 'fmb');
            const baseColor = '#22c55e'; // Vibrant Emerald Green for Vector Cadastral Base Parent Boundary
            const subdivColor = '#eab308'; // Vibrant Yellow for FMB Subdivisions
            const boundaryColor = '#06b6d4'; // Cyan for TN Village Boundaries

            // 1. Sync Base Survey Parcel Outer Boundaries (Green Vector Parent Layer, always on top)
            const baseSrc = map.getSource('village-base-source') as maplibregl.GeoJSONSource;
            if (baseSrc) {
              const baseData = layerData.base_geojson || (!isFmbMode ? layerData.geojson : null);
              if (!isTNRevenueVillageBoundary && baseData && baseData.features && baseData.features.length > 0) {
                baseSrc.setData(baseData);
                if (map.getLayer('village-base-outline')) {
                  map.setLayoutProperty('village-base-outline', 'visibility', 'visible');
                  map.setPaintProperty('village-base-outline', 'line-color', '#22c55e');
                  map.setPaintProperty('village-base-outline', 'line-width', 2.0);
                  map.setPaintProperty('village-base-outline', 'line-opacity', 1.0);
                  try {
                    map.moveLayer('village-base-outline');
                  } catch (e) {}
                }
              } else {
                baseSrc.setData({ type: 'FeatureCollection', features: [] });
                if (map.getLayer('village-base-outline')) {
                  map.setLayoutProperty('village-base-outline', 'visibility', 'none');
                }
              }
            }

            // 2. Sync Village / FMB Subdivision layer (Green FMB Layer rendered underneath)
            if (isTNRevenueVillageBoundary) {
              // TN Village Boundaries in Cyan (#06b6d4)
              if (map.getLayer(fillLayer)) {
                map.setLayoutProperty(fillLayer, 'visibility', 'visible');
                map.setPaintProperty(fillLayer, 'fill-color', boundaryColor);
                map.setPaintProperty(fillLayer, 'fill-opacity', opacity !== undefined ? opacity : 0.12);
              }
              if (map.getLayer(outlineLayer)) {
                map.setLayoutProperty(outlineLayer, 'visibility', 'visible');
                map.setPaintProperty(outlineLayer, 'line-color', boundaryColor);
                map.setPaintProperty(outlineLayer, 'line-width', 2.5);
              }
            } else {
              const clipSurveyList = selectedClipFeatures.map((f) => {
                const p = f.properties || {};
                return String(p.survey_no || p.SURVEY_NO || p.sno || p.KIDE || p.code || p.name || '').trim();
              }).filter(Boolean);

              const selectedList = [selectedParcel, ...(multiParcels || []), ...clipSurveyList].filter(Boolean) as string[];
              const isSelectedSubdivExpr: any = selectedList.length > 0 ? [
                'any',
                ...selectedList.flatMap((selCode) => {
                  let cleanSel = selCode.trim();
                  if (cleanSel.includes('_')) {
                    const parts = cleanSel.split('_');
                    cleanSel = parts.slice(3).join('/');
                  }
                  return [
                    ['==', ['get', 'code'], selCode],
                    ['==', ['to-string', ['coalesce', ['get', 'survey_no'], ['get', 'SURVEY_NO'], ['get', 'KIDE'], ['get', 'name'], '']], cleanSel],
                    ['==', ['to-string', ['coalesce', ['get', 'survey_no'], ['get', 'SURVEY_NO'], ['get', 'KIDE'], ['get', 'name'], '']], selCode],
                  ];
                })
              ] : false;

              const selectedColor = '#06b6d4'; // High-contrast Electric Cyan for selected subdivision
              const regularColor = isFmbMode ? subdivColor : baseColor; // Green (#22c55e) for FMB, Yellow (#eab308) for Vector
              const regularWidth = isFmbMode ? 1.8 : 3.5;

              const villageOutlineColor = selectedList.length > 0
                ? ['case', isSelectedSubdivExpr, selectedColor, regularColor]
                : regularColor;

              const villageLineWidth = selectedList.length > 0
                ? ['case', isSelectedSubdivExpr, 4.5, regularWidth]
                : regularWidth;

              const villageFillColor = selectedList.length > 0
                ? ['case', isSelectedSubdivExpr, selectedColor, regularColor]
                : regularColor;

              const userVillageOpacity = opacity !== undefined ? opacity : (isFmbMode ? 0.08 : 0.25);
              const villageFillOpacity = selectedList.length > 0
                ? ['case', isSelectedSubdivExpr, Math.min(0.95, userVillageOpacity + 0.3), userVillageOpacity]
                : userVillageOpacity;

              if (map.getLayer(fillLayer)) {
                map.setLayoutProperty(fillLayer, 'visibility', 'visible');
                map.setPaintProperty(fillLayer, 'fill-color', villageFillColor as any);
                map.setPaintProperty(fillLayer, 'fill-opacity', villageFillOpacity as any);
              }
              if (map.getLayer(outlineLayer)) {
                map.setLayoutProperty(outlineLayer, 'visibility', isFmbMode ? 'visible' : 'none');
                map.setPaintProperty(outlineLayer, 'line-color', villageOutlineColor as any);
                map.setPaintProperty(outlineLayer, 'line-width', villageLineWidth as any);
              }
            }
          } else {
            const isDistrict = lvl === 'district';
            const isTaluk = lvl === 'taluk';
            const isStateDistrictOverview = isDistrict && (!layerData.code || layerData.code === 'all');
            const isChildActive = isDistrict
              ? Boolean(layersToSync.taluk || layersToSync.village || layersToSync.parcel)
              : (isTaluk ? Boolean(layersToSync.village || layersToSync.parcel) : false);

            const activeColor = activeLayerColors[lvl] || layerData.color || (isStateDistrictOverview ? '#eab308' : (isDistrict ? '#0284c7' : (isTaluk ? '#9333ea' : color)));
            const activeLineWidth = isStateDistrictOverview ? 1.8 : (isDistrict ? 3.5 : 2.5);

            const features = layerData.geojson?.features || [];
            const hasMultipleSelected = features.length > 1 && !isStateDistrictOverview;
            const featureColorExpr: any = isStateDistrictOverview
              ? '#eab308'
              : ['coalesce', ['get', '_multiColor'], activeColor];

            const defaultFillOpacity = isStateDistrictOverview ? 0.08 : (hasMultipleSelected ? 0.35 : 0.30);
            const userTargetOpacity = opacity !== undefined ? opacity : defaultFillOpacity;

            if (map.getLayer(fillLayer)) {
              if (isChildActive) {
                // Completely hide purple/cyan fill when child village or parcel is active so it does not tint the village
                map.setLayoutProperty(fillLayer, 'visibility', 'none');
              } else {
                map.setLayoutProperty(fillLayer, 'visibility', 'visible');
                map.setPaintProperty(fillLayer, 'fill-color', featureColorExpr);
                map.setPaintProperty(fillLayer, 'fill-opacity', userTargetOpacity);
              }
            }
            if (map.getLayer(outlineLayer)) {
              map.setLayoutProperty(outlineLayer, 'visibility', 'visible');
              map.setPaintProperty(outlineLayer, 'line-color', featureColorExpr);
              map.setPaintProperty(outlineLayer, 'line-width', isStateDistrictOverview ? 1.8 : 4.0);
              map.setPaintProperty(outlineLayer, 'line-opacity', isStateDistrictOverview ? 0.85 : 1.0);
              if (!isStateDistrictOverview) {
                try {
                  map.moveLayer(outlineLayer);
                } catch (e) {}
              }
            }
          }

          if (map.getLayer(labelLayer)) {
            const isDistrict = lvl === 'district';
            const isTaluk = lvl === 'taluk';
            const isChildActive = isDistrict
              ? Boolean(layersToSync.taluk || layersToSync.village || layersToSync.parcel)
              : (isTaluk ? Boolean(layersToSync.village || layersToSync.parcel) : false);

            const labelsVisible = (layerData.showLabels !== false) && !isChildActive;
            map.setLayoutProperty(labelLayer, 'visibility', labelsVisible ? 'visible' : 'none');
          }
        } else {
          if (activePopupLayerRef.current === `boundary_${lvl}`) {
            if (popupRef.current) {
              popupRef.current.remove();
              activePopupLayerRef.current = null;
            }
          }
          src.setData({ type: 'FeatureCollection', features: [] });
          if (lvl === 'village') {
            const baseSrc = map.getSource('village-base-source') as maplibregl.GeoJSONSource;
            if (baseSrc) baseSrc.setData({ type: 'FeatureCollection', features: [] });
            if (map.getLayer('village-base-outline')) map.setLayoutProperty('village-base-outline', 'visibility', 'none');
          }
          if (map.getLayer(fillLayer)) map.setLayoutProperty(fillLayer, 'visibility', 'none');
          if (map.getLayer(outlineLayer)) map.setLayoutProperty(outlineLayer, 'visibility', 'none');
          if (map.getLayer(labelLayer)) map.setLayoutProperty(labelLayer, 'visibility', 'none');
        }
      }
    });
  };

  // Robust Zoom to Layer Bounds Helper
  const zoomToLayerBounds = useCallback((level: GisLevel | 'state', specificCode?: string, explicitLayer?: ActiveGisLayer | null) => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    if (level === 'state') {
      map.fitBounds(TAMIL_NADU_BOUNDS, {
        padding: { top: 35, bottom: 35, left: 35, right: 35 },
        duration: 900,
      });
      return;
    }
    const layer = explicitLayer || activeLayersRef.current[level];
    if (!layer || !layer.geojson) return;
    if (level === 'district' && (!layer.code || layer.code === 'all')) {
      map.fitBounds(TAMIL_NADU_BOUNDS, {
        padding: { top: 35, bottom: 35, left: 35, right: 35 },
        duration: 900,
      });
      return;
    }

    let bounds: [[number, number], [number, number]] | null = null;

    let targetFeatures = layer.geojson.features || [];
    if (specificCode && targetFeatures.length > 0) {
      const cleanSpecific = specificCode.trim().toLowerCase();
      const rawSpecific = specificCode.includes('_') ? specificCode.split('_').pop()!.toLowerCase() : cleanSpecific;

      const filtered = targetFeatures.filter((f: any) => {
        const props = f.properties || {};
        const c = String(props.code || props.id || props.village_code || props.taluk_code || props.district_code || props.survey_no || props.name || '').trim().toLowerCase();
        const vName = String(props.village_name || props.vill_name || props.v || props.vtname || props.lgd_villag || props.name || props.taluk_name || props.district_name || '').trim().toLowerCase();
        const rawC = c.includes('_') ? c.split('_').pop()! : c;

        return (
          c === cleanSpecific ||
          c === rawSpecific ||
          rawC === rawSpecific ||
          c.endsWith(`_${rawSpecific}`) ||
          rawSpecific.endsWith(`_${rawC}`) ||
          cleanSpecific.endsWith(`_${rawC}`) ||
          (vName && (vName === cleanSpecific || vName === rawSpecific || vName.includes(cleanSpecific) || cleanSpecific.includes(vName)))
        );
      });
      if (filtered.length > 0) {
        targetFeatures = filtered;
      }
    }

    // Prioritize calculating exact combined bounding box across all target features
    if (targetFeatures.length > 0) {
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      targetFeatures.forEach((f: any) => {
        const b = getFeatureBBox(f);
        if (b) {
          if (b[0] < minLng) minLng = b[0];
          if (b[1] < minLat) minLat = b[1];
          if (b[2] > maxLng) maxLng = b[2];
          if (b[3] > maxLat) maxLat = b[3];
        }
      });
      if (minLng !== Infinity && minLat !== Infinity && !isNaN(minLng) && !isNaN(minLat) && maxLng >= minLng && maxLat >= minLat) {
        bounds = [[minLng, minLat], [maxLng, maxLat]];
      }
    }

    if (!bounds && layer.bbox && layer.bbox.length === 4) {
      bounds = [
        [layer.bbox[0], layer.bbox[1]],
        [layer.bbox[2], layer.bbox[3]],
      ];
    }

    if (bounds) {
      const maxZ = level === 'parcel' ? 18.0 : level === 'village' ? 16.0 : level === 'taluk' ? 14.5 : 12.0;
      const leftPad = isSidebarOpen ? 280 : 50;
      const padding = level === 'parcel'
        ? { top: 70, bottom: 70, left: leftPad + 20, right: 60 }
        : { top: 50, bottom: 50, left: leftPad, right: 50 };

      if (bounds[0][0] === bounds[1][0] && bounds[0][1] === bounds[1][1]) {
        map.easeTo({
          center: [bounds[0][0], bounds[0][1]],
          zoom: maxZ,
          duration: 900,
        });
      } else {
        map.fitBounds(bounds, {
          padding,
          duration: 900,
          maxZoom: maxZ,
        });
      }
    }
  }, [isSidebarOpen]);

  // Track user manual pan/zoom interaction
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    const onUserInteractStart = () => {
      isUserInteractingRef.current = true;
    };

    map.on('dragstart', onUserInteractStart);
    map.on('zoomstart', onUserInteractStart);
    map.on('wheel', onUserInteractStart);
    map.on('touchstart', onUserInteractStart);

    return () => {
      map.off('dragstart', onUserInteractStart);
      map.off('zoomstart', onUserInteractStart);
      map.off('wheel', onUserInteractStart);
      map.off('touchstart', onUserInteractStart);
    };
  }, [mapLoaded]);



  // Sync Clipped Preview GeoJSON to MapLibre Source
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const src = mapRef.current.getSource('clipped-preview-source') as maplibregl.GeoJSONSource;
    if (src) {
      src.setData(clippedPreviewGeoJSON || { type: 'FeatureCollection', features: [] });
    }
  }, [clippedPreviewGeoJSON, mapLoaded]);

  // Sync Map Sources whenever activeLayers prop updates
  useEffect(() => {
    activeLayersRef.current = activeLayers;
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;
    syncActiveLayers(map, activeLayers);

    const activeLayerKey = activeLayers.parcel
      ? `parcel-${activeLayers.parcel.code}`
      : activeLayers.village
      ? `village-${activeLayers.village.code}`
      : activeLayers.taluk
      ? `taluk-${activeLayers.taluk.code}`
      : activeLayers.district && activeLayers.district.code !== 'all'
      ? `district-${activeLayers.district.code}`
      : 'none';

    if (lastZoomedKeyRef.current !== activeLayerKey) {
      lastZoomedKeyRef.current = activeLayerKey;

      const highestLvl: GisLevel | null = activeLayers.parcel
        ? 'parcel'
        : activeLayers.village
        ? 'village'
        : activeLayers.taluk
        ? 'taluk'
        : activeLayers.district && activeLayers.district.code !== 'all'
        ? 'district'
        : null;

      if (highestLvl && activeLayers[highestLvl]) {
        isUserInteractingRef.current = false;
        zoomToLayerBounds(highestLvl, undefined, activeLayers[highestLvl]);
      } else if (selectedLevel === 'none' || (activeLayers.district && activeLayers.district.code === 'all' && !activeLayers.taluk && !activeLayers.village && !activeLayers.parcel)) {
        map.fitBounds(TAMIL_NADU_BOUNDS, {
          padding: { top: 35, bottom: 35, left: 35, right: 35 },
          duration: 900,
        });
      }
    }
  }, [activeLayers, activeLayerColors, mapLoaded, selectedLevel, zoomToLayerBounds, selectedParcel, multiParcels, selectedClipFeatures, layerType]);

  // Respond immediately to explicit zoom requests (e.g. from breadcrumb dropdown or navigation clicks)
  useEffect(() => {
    if (zoomRequestLevel && mapLoaded) {
      isUserInteractingRef.current = false;
      zoomToLayerBounds(zoomRequestLevel);
      onZoomRequestHandled?.();
    }
  }, [zoomRequestLevel, mapLoaded, zoomToLayerBounds, onZoomRequestHandled, activeLayers]);

  // ─── Synchronize 15 Persistent GIS Cart Vector Tile Layers ─────────────────
  const syncCartLayers = useCallback((map: maplibregl.Map, cartLayersState: Record<string, boolean> = {}) => {
    if (!map) return;

    for (const layer of CART_LAYERS_CONFIG) {
      const isVisible = !!cartLayersState[layer.id];
      const srcId = `cart-src-${layer.id}`;
      const unclusteredLayerId = `cart-unclustered-${layer.id}`;
      const labelLayerId = `cart-label-${layer.id}`;
      const lineLayerId = `cart-line-${layer.id}`;
      const polyFillLayerId = `cart-poly-fill-${layer.id}`;
      const polyOutlineLayerId = `cart-poly-outline-${layer.id}`;

      const source = map.getSource(srcId);

      if (isVisible) {
        if (!source) {
          if (layer.geom_type === 'point') {
            // Add Vector Tile Source for Point Layers backed by SQLite R-Tree index
            map.addSource(srcId, {
              type: 'vector',
              tiles: [`${API_BASE}/api/tiles/${layer.id}/{z}/{x}/{y}.pbf`],
              minzoom: 0,
              maxzoom: 19,
            });

            // 1. Point Markers with dynamic radius scaling across all zooms
            map.addLayer({
              id: unclusteredLayerId,
              type: 'circle',
              source: srcId,
              'source-layer': layer.id,
              paint: {
                'circle-color': layer.color,
                'circle-radius': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  5, 3.5,
                  8, 5.0,
                  11, 6.5,
                  14, 8.5,
                  17, 11.0,
                  20, 14.0
                ],
                'circle-stroke-width': 1.8,
                'circle-stroke-color': '#ffffff',
                'circle-opacity': layer.opacity || 0.95,
              },
            });

            // 2. Point Labels — hidden by default, shown only via click popup
            map.addLayer({
              id: labelLayerId,
              type: 'symbol',
              source: srcId,
              'source-layer': layer.id,
              minzoom: 13,
              layout: {
                'visibility': 'none',
                'text-field': [
                  'coalesce',
                  ['get', 'name'],
                  ['get', 'title'],
                  ['get', 'school_name'],
                  ['get', 'panchayat_name'],
                  ['get', 'PAN_NAME'],
                  ['get', 'college_name'],
                  ['get', 'fire_station'],
                  ['get', 'petrol_bunk'],
                  ['get', 'tourist_name'],
                  ['get', 'TOURIST_NA'],
                  ['get', 'NAME'],
                  ''
                ],
                'text-size': 11,
                'text-offset': [0, 1.4],
                'text-anchor': 'top',
                'text-optional': true,
              },
              paint: {
                'text-color': '#0f172a',
                'text-halo-color': '#ffffff',
                'text-halo-width': 2.0,
              },
            });

            map.on('mouseenter', unclusteredLayerId, () => { map.getCanvas().style.cursor = 'pointer'; });
            map.on('mouseleave', unclusteredLayerId, () => { map.getCanvas().style.cursor = ''; });

            map.on('click', unclusteredLayerId, (e) => {
              if (e.features && e.features[0]) {
                if (e.originalEvent) {
                  (e.originalEvent as any)._gisFeatureClicked = true;
                }
                featureClickedInCurrentEventRef.current = true;
                activePopupLayerRef.current = `cart_${layer.id}`;

                const props = e.features[0].properties || {};
                const title = props.name || props.title || props.school_name || props.panchayat_name || props.PAN_NAME || props.college_name || props.fire_station || props.petrol_bunk || props.tourist_name || props.TOURIST_NA || props.NAME || `${layer.title} Item`;
                const loc = props.habitation || props.town_municipality || props.block || props.location || props.taluk || props.district || '';
                const cat = props.category || props.category_group || props.managing_department || props.management || props.type || '';
                if (popupRef.current) {
                  popupRef.current
                    .setLngLat(e.lngLat)
                    .setHTML(`
                      <div class="px-3 py-2 rounded-xl bg-white/98 dark:bg-slate-900/98 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 shadow-xl text-xs font-sans max-w-xs relative">
                        <div class="flex items-center justify-between gap-1.5 mb-1.5 pb-1 border-b border-slate-100 dark:border-slate-800">
                          <div class="flex items-center gap-1.5">
                            <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${layer.color}"></span>
                            <span class="font-black uppercase text-[10px] text-amber-600 dark:text-amber-400">${layer.title}</span>
                          </div>
                          <button type="button" onclick="window._closeGisPopup && window._closeGisPopup()" class="cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 rounded transition-colors -mr-1" title="Close">
                            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                          </button>
                        </div>
                        <div class="font-bold text-slate-900 dark:text-white mb-1">${title}</div>
                        ${loc ? `<div class="text-[10.5px] text-slate-600 dark:text-slate-300 mb-1">📍 ${loc}</div>` : ''}
                        ${cat ? `<div class="text-[10px] text-slate-500 dark:text-slate-400">🏷️ ${cat}</div>` : ''}
                      </div>
                    `)
                    .addTo(map);
                }
              }
            });
          } else {
            // Add High-Performance Vector Tile Source for line / polygon layers
            map.addSource(srcId, {
              type: 'vector',
              tiles: [`${API_BASE}/api/tiles/${layer.id}/{z}/{x}/{y}.pbf`],
              minzoom: 0,
              maxzoom: 19,
            });

            if (layer.geom_type === 'line') {
              map.addLayer({
                id: lineLayerId,
                type: 'line',
                source: srcId,
                'source-layer': layer.id,
                paint: {
                  'line-color': layer.color,
                  'line-width': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    5, 1.2,
                    9, 2.5,
                    13, 4.0,
                    17, 6.5,
                  ],
                  'line-opacity': layer.opacity || 0.9,
                },
                layout: {
                  'line-join': 'round',
                  'line-cap': 'round',
                },
              });

              map.on('mouseenter', lineLayerId, () => {
                map.getCanvas().style.cursor = 'pointer';
              });
              map.on('mouseleave', lineLayerId, () => {
                map.getCanvas().style.cursor = '';
              });

              map.on('click', lineLayerId, (e) => {
                if (e.features && e.features[0]) {
                  if (e.originalEvent) {
                    (e.originalEvent as any)._gisFeatureClicked = true;
                  }
                  featureClickedInCurrentEventRef.current = true;
                  activePopupLayerRef.current = `cart_${layer.id}`;

                  const props = e.features[0].properties || {};
                  const title = props.name || props.title || props.road_name || props.river_name || `${layer.title} Segment`;
                  if (popupRef.current) {
                    popupRef.current
                      .setLngLat(e.lngLat)
                      .setHTML(`
                        <div class="px-3 py-2 rounded-xl bg-white/98 dark:bg-slate-900/98 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 shadow-xl text-xs font-sans max-w-xs relative">
                          <div class="flex items-center justify-between gap-1.5 mb-1 pb-1 border-b border-slate-100 dark:border-slate-800">
                            <div class="flex items-center gap-1.5">
                              <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${layer.color}"></span>
                              <span class="font-black uppercase text-[10px] text-amber-600 dark:text-amber-400">${layer.title}</span>
                            </div>
                            <button type="button" onclick="window._closeGisPopup && window._closeGisPopup()" class="cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 rounded transition-colors -mr-1" title="Close">
                              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                          </div>
                          <div class="font-bold text-slate-900 dark:text-white">${title}</div>
                          ${props.type || props.category ? `<div class="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">Type: ${props.type || props.category}</div>` : ''}
                        </div>
                      `)
                      .addTo(map);
                  }
                }
              });
            } else if (layer.geom_type === 'polygon') {
              map.addLayer({
                id: polyFillLayerId,
                type: 'fill',
                source: srcId,
                'source-layer': layer.id,
                paint: {
                  'fill-color': layer.color,
                  'fill-opacity': layer.opacity || 0.55,
                },
              });

              map.addLayer({
                id: polyOutlineLayerId,
                type: 'line',
                source: srcId,
                'source-layer': layer.id,
                paint: {
                  'line-color': layer.color,
                  'line-width': 1.8,
                  'line-opacity': 0.95,
                },
              });

              map.on('mouseenter', polyFillLayerId, () => {
                map.getCanvas().style.cursor = 'pointer';
              });
              map.on('mouseleave', polyFillLayerId, () => {
                map.getCanvas().style.cursor = '';
              });

              map.on('click', polyFillLayerId, (e) => {
                if (e.features && e.features[0]) {
                  if (e.originalEvent) {
                    (e.originalEvent as any)._gisFeatureClicked = true;
                  }
                  featureClickedInCurrentEventRef.current = true;
                  activePopupLayerRef.current = `cart_${layer.id}`;

                  const props = e.features[0].properties || {};
                  const title = props.water_body_name || props.wb_name || props.name || props.title || props.mine_name || `${layer.title} Area`;
                  const loc = props.panchayat_village || props.block_name || props.taluk_name || props.dist_name || props.district || '';
                  const mineral = props.mineral_le ? `Mineral: ${props.mineral_le}` : '';
                  if (popupRef.current) {
                    popupRef.current
                      .setLngLat(e.lngLat)
                      .setHTML(`
                        <div class="px-3 py-2 rounded-xl bg-white/98 dark:bg-slate-900/98 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 shadow-xl text-xs font-sans max-w-xs relative">
                          <div class="flex items-center justify-between gap-1.5 mb-1 pb-1 border-b border-slate-100 dark:border-slate-800">
                            <div class="flex items-center gap-1.5">
                              <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${layer.color}"></span>
                              <span class="font-black uppercase text-[10px] text-amber-600 dark:text-amber-400">${layer.title}</span>
                            </div>
                            <button type="button" onclick="window._closeGisPopup && window._closeGisPopup()" class="cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 rounded transition-colors -mr-1" title="Close">
                              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                          </div>
                          <div class="font-bold text-slate-900 dark:text-white">${title}</div>
                          ${loc ? `<div class="text-[10.5px] text-slate-600 dark:text-slate-300 mt-0.5">📍 ${loc}</div>` : ''}
                          ${mineral ? `<div class="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">${mineral}</div>` : ''}
                          ${props.area_acres || props.area ? `<div class="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">Area: ${props.area_acres || props.area}</div>` : ''}
                        </div>
                      `)
                      .addTo(map);
                  }
                }
              });
            }
          }
        } else {
          // Source already added -> set visibility to visible (exclude label layer — shown only via click popup)
          [unclusteredLayerId, lineLayerId, polyFillLayerId, polyOutlineLayerId].forEach((lid) => {
            if (map.getLayer(lid)) {
              map.setLayoutProperty(lid, 'visibility', 'visible');
            }
          });
          // Keep label layer hidden — only popup shows the name on click
          if (map.getLayer(labelLayerId)) {
            map.setLayoutProperty(labelLayerId, 'visibility', 'none');
          }
        }
      } else {
        // Toggle visibility off -> remove popup if it belongs to this toggled-off layer
        if (activePopupLayerRef.current === `cart_${layer.id}`) {
          if (popupRef.current) {
            popupRef.current.remove();
            activePopupLayerRef.current = null;
          }
        }
        [unclusteredLayerId, labelLayerId, lineLayerId, polyFillLayerId, polyOutlineLayerId].forEach((lid) => {
          if (map.getLayer(lid)) {
            map.setLayoutProperty(lid, 'visibility', 'none');
          }
        });
      }
    }

    // If all cart layers are toggled off, ensure any cart popup is dismissed
    const hasAnyActiveCartLayer = Object.values(cartLayersState).some(Boolean);
    if (!hasAnyActiveCartLayer && activePopupLayerRef.current?.startsWith('cart_')) {
      if (popupRef.current) {
        popupRef.current.remove();
        activePopupLayerRef.current = null;
      }
    }
  }, []);

  // Sync Persistent Cart Overlays on activeCartLayers state changes
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    syncCartLayers(mapRef.current, activeCartLayers);

    // If active popup belongs to a disabled cart layer or all are off, dismiss it
    if (activePopupLayerRef.current?.startsWith('cart_')) {
      const layerId = activePopupLayerRef.current.replace('cart_', '');
      if (!activeCartLayers || !activeCartLayers[layerId]) {
        if (popupRef.current) {
          popupRef.current.remove();
          activePopupLayerRef.current = null;
        }
      }
    }
    const hasAnyActive = Object.values(activeCartLayers || {}).some(Boolean);
    if (!hasAnyActive && activePopupLayerRef.current?.startsWith('cart_')) {
      if (popupRef.current) {
        popupRef.current.remove();
        activePopupLayerRef.current = null;
      }
    }
  }, [activeCartLayers, mapLoaded, syncCartLayers]);

  // Handle explicit "Zoom to Boundary" request
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !zoomRequestLevel) return;
    zoomToLayerBounds(zoomRequestLevel);
    onZoomRequestHandled?.();
  }, [zoomRequestLevel, mapLoaded, zoomToLayerBounds, onZoomRequestHandled]);

  // Selected Parcel Single Blink Effect
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;
    let animFrameId: number | null = null;

    const parcelLayer = activeLayers.parcel;
    const hasParcel = parcelLayer && parcelLayer.geojson && parcelLayer.visible;
    const currentCode = parcelLayer?.code || null;
    const parcelColor = activeLayerColors.parcel || parcelLayer?.color || '#ec4899';

    if (hasParcel) {
      if (map.getLayer('parcel-fill')) map.moveLayer('parcel-fill');
      if (map.getLayer('parcel-outline')) map.moveLayer('parcel-outline');
      if (map.getLayer('parcel-labels')) map.moveLayer('parcel-labels');

      const isNewParcel = prevParcelCodeRef.current !== currentCode;
      prevParcelCodeRef.current = currentCode;

      if (isNewParcel) {
        const startTime = performance.now();
        const blinkDuration = 450;

        const animateBlinkOnce = (now: number) => {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / blinkDuration, 1);
          const flashPhase = Math.sin(progress * Math.PI);
          const fillOpacity = 0.35 + flashPhase * 0.40;
          const lineWidth = 4.5 + flashPhase * 3.5;
          const strokeColor = flashPhase > 0.5 ? '#ffffff' : parcelColor;

          if (map.getLayer('parcel-fill')) {
            map.setLayoutProperty('parcel-fill', 'visibility', 'visible');
            map.setPaintProperty('parcel-fill', 'fill-color', parcelColor);
            map.setPaintProperty('parcel-fill', 'fill-opacity', fillOpacity);
          }
          if (map.getLayer('parcel-outline')) {
            map.setLayoutProperty('parcel-outline', 'visibility', 'visible');
            map.setPaintProperty('parcel-outline', 'line-color', strokeColor);
            map.setPaintProperty('parcel-outline', 'line-width', lineWidth);
          }

          if (progress < 1) {
            animFrameId = requestAnimationFrame(animateBlinkOnce);
          } else {
            const userOpacity = parcelLayer?.opacity !== undefined ? parcelLayer.opacity : 0.35;
            if (map.getLayer('parcel-fill')) {
              map.setPaintProperty('parcel-fill', 'fill-color', parcelColor);
              map.setPaintProperty('parcel-fill', 'fill-opacity', userOpacity);
            }
            if (map.getLayer('parcel-outline')) {
              map.setPaintProperty('parcel-outline', 'line-color', parcelColor);
              map.setPaintProperty('parcel-outline', 'line-width', 4.5);
            }
          }
        };

        animFrameId = requestAnimationFrame(animateBlinkOnce);
      } else {
        const userOpacity = parcelLayer?.opacity !== undefined ? parcelLayer.opacity : 0.35;
        if (map.getLayer('parcel-fill')) {
          map.setLayoutProperty('parcel-fill', 'visibility', 'visible');
          map.setPaintProperty('parcel-fill', 'fill-color', parcelColor);
          map.setPaintProperty('parcel-fill', 'fill-opacity', userOpacity);
        }
        if (map.getLayer('parcel-outline')) {
          map.setLayoutProperty('parcel-outline', 'visibility', 'visible');
          map.setPaintProperty('parcel-outline', 'line-color', parcelColor);
          map.setPaintProperty('parcel-outline', 'line-width', 4.5);
        }
      }
    } else {
      prevParcelCodeRef.current = null;
    }

    return () => {
      if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
      }
    };
  }, [activeLayers.parcel, activeLayerColors.parcel, mapLoaded]);

  // Reactive layer color and opacity synchronization across all GIS levels
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;
    const levels: GisLevel[] = ['district', 'taluk', 'village', 'parcel'];
    levels.forEach((lvl) => {
      const fillLayer = `${lvl}-fill`;
      const outlineLayer = `${lvl}-outline`;
      const layerData = activeLayers[lvl];
      if (layerData && layerData.visible !== false) {
        const color = activeLayerColors[lvl] || layerData.color;
        const opacity = layerData.opacity;

        if (color && map.getLayer(fillLayer)) {
          map.setPaintProperty(fillLayer, 'fill-color', color);
        }
        if (color && map.getLayer(outlineLayer)) {
          map.setPaintProperty(outlineLayer, 'line-color', color);
        }
        if (opacity !== undefined && map.getLayer(fillLayer)) {
          if (lvl === 'village') {
            const clipSurveyList = selectedClipFeatures.map((f) => {
              const p = f.properties || {};
              return String(p.survey_no || p.SURVEY_NO || p.sno || p.KIDE || p.code || p.name || '').trim();
            }).filter(Boolean);

            const selectedList = [selectedParcel, ...(multiParcels || []), ...clipSurveyList].filter(Boolean) as string[];
            if (selectedList.length > 0) {
              const isSelectedSubdivExpr: any = [
                'any',
                ...selectedList.flatMap((selCode) => {
                  let cleanSel = selCode.trim();
                  if (cleanSel.includes('_')) {
                    const parts = cleanSel.split('_');
                    cleanSel = parts.slice(3).join('/');
                  }
                  return [
                    ['==', ['get', 'code'], selCode],
                    ['==', ['to-string', ['coalesce', ['get', 'survey_no'], ['get', 'SURVEY_NO'], ['get', 'KIDE'], ['get', 'name'], '']], cleanSel],
                    ['==', ['to-string', ['coalesce', ['get', 'survey_no'], ['get', 'SURVEY_NO'], ['get', 'KIDE'], ['get', 'name'], '']], selCode],
                  ];
                })
              ];
              map.setPaintProperty(fillLayer, 'fill-opacity', ['case', isSelectedSubdivExpr, Math.min(0.95, opacity + 0.3), opacity] as any);
            } else {
              map.setPaintProperty(fillLayer, 'fill-opacity', opacity);
            }
          } else {
            map.setPaintProperty(fillLayer, 'fill-opacity', opacity);
          }
        }
      }
    });
  }, [activeLayerColors, activeLayers, mapLoaded, selectedParcel, multiParcels, selectedClipFeatures]);

  // ─── Download Selected Clip Parcels & Subdivisions ────────────────────────
  const handleDownloadSelectedClip = async (fmt: ExportFormat) => {
    if (selectedClipFeatures.length === 0 || clipDownloadStatus === 'loading') return;
    setClipDownloadStatus('loading');
    setClipDownloadError('');

    const vName = breadcrumb?.villageName || selectedVillage || 'Village';
    const cleanVName = vName.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const baseName = `${cleanVName}_Selected_${selectedClipFeatures.length}_Subdivisions`;

    const featureCollection = {
      type: 'FeatureCollection',
      features: selectedClipFeatures,
    };

    try {
      const res = await fetch(apiUrl('/api/export-polygon'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geojson: featureCollection,
          format: fmt,
          name: baseName,
          file_type: layerType || 'fmb',
        }),
      });

      if (res.ok) {
        const disposition = res.headers.get('Content-Disposition') || '';
        let filename = `${baseName}.${fmt === 'shp' ? 'zip' : fmt}`;
        const fnMatch = disposition.match(/filename[^;=\n]*=["']?([^"';\n]*)["']?/i);
        if (fnMatch && fnMatch[1]) filename = fnMatch[1].trim();

        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);

        setClipDownloadStatus('success');
        setTimeout(() => setClipDownloadStatus('idle'), 3000);
        return;
      }
    } catch (err: any) {
      console.warn('Backend export failed, attempting client-side fallback:', err);
    }

    try {
      const content = JSON.stringify(featureCollection, null, 2);
      const blob = new Blob([content], { type: 'application/geo+json' });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `${baseName}.geojson`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
      setClipDownloadStatus('success');
      setTimeout(() => setClipDownloadStatus('idle'), 3000);
    } catch (fallbackErr: any) {
      setClipDownloadStatus('error');
      setClipDownloadError('Export failed: ' + (fallbackErr.message || String(fallbackErr)));
    }
  };

  // ─── Download Extracted Polygon Layer Helper ─────────────────────────────────
  const handleDownloadExtracted = async (fmt: ExportFormat) => {
    if (!extractedResult || downloadStatus === 'loading') return;
    setDownloadStatus('loading');
    setDownloadError('');

    const baseName = `${breadcrumb?.villageName || breadcrumb?.talukName || 'GIS'}_Extracted_Polygon_${Date.now()}`;

    try {
      // 1. Try server-side export endpoint
      const res = await fetch(apiUrl('/api/export-polygon'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geojson: extractedResult.geojson,
          format: fmt,
          name: baseName,
          file_type: 'vector',
        }),
      });

      if (res.ok) {
        const disposition = res.headers.get('Content-Disposition') || '';
        let filename = `${baseName}.${fmt === 'shp' ? 'zip' : fmt}`;
        const fnMatch = disposition.match(/filename[^;=\n]*=["']?([^"';\n]*)["']?/i);
        if (fnMatch && fnMatch[1]) filename = fnMatch[1].trim();

        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);

        setDownloadStatus('success');
        setTimeout(() => setDownloadStatus('idle'), 3000);
        return;
      }
    } catch (err: any) {
      console.warn('Backend export failed, attempting client-side export fallback:', err);
    }

    // 2. Client-side fallback for GeoJSON / KML
    try {
      let mimeType = 'application/geo+json';
      let content = '';
      let filename = `${baseName}.geojson`;

      if (fmt === 'geojson' || fmt === 'shp') {
        content = JSON.stringify(extractedResult.geojson, null, 2);
        mimeType = 'application/geo+json';
        filename = `${baseName}.geojson`;
      } else if (fmt === 'kml' || fmt === 'kmz') {
        const kmlFeatures = (extractedResult.geojson.features || []).map((f: any, i: number) => {
          const coords = f.geometry?.coordinates?.[0] || [];
          const coordStr = coords.map((c: any) => `${c[0]},${c[1]},0`).join(' ');
          const name = f.properties?.survey_no || f.properties?.name || `Polygon Feature ${i + 1}`;
          return `    <Placemark>
      <name>${name}</name>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>${coordStr}</coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>`;
        }).join('\n');

        content = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${baseName}</name>
${kmlFeatures}
  </Document>
</kml>`;
        mimeType = 'application/vnd.google-earth.kml+xml';
        filename = `${baseName}.kml`;
      } else {
        content = JSON.stringify(extractedResult.geojson, null, 2);
      }

      const blob = new Blob([content], { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);

      setDownloadStatus('success');
      setTimeout(() => setDownloadStatus('idle'), 3000);
    } catch (fallbackErr: any) {
      setDownloadError(fallbackErr?.message || 'Failed to download polygon layer');
      setDownloadStatus('error');
      setTimeout(() => setDownloadStatus('idle'), 4000);
    }
  };

  // Live calculated area while drawing
  const liveAreaAcres = (() => {
    if (drawPoints.length >= 2 && mousePos) {
      try {
        const poly = turf.polygon([[...drawPoints, mousePos, drawPoints[0]]]);
        const sqM = turf.area(poly);
        return (sqM * 0.000247105).toFixed(2);
      } catch {
        return null;
      }
    }
    return null;
  })();

  const currentOption = BASEMAP_OPTIONS.find((opt) => opt.key === basemapStyle) || BASEMAP_OPTIONS[0];

  return (
    <div
      ref={mapOuterRef}
      className={`bg-slate-950 overflow-hidden select-none transition-all duration-300 ${
        isFullscreen ? 'fixed inset-0 z-50 w-screen h-screen' : 'relative w-full h-full min-h-[500px]'
      }`}
    >
      {/* Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full absolute inset-0" />

      {/* ─── UNIFIED TOP HEADER BAR (Brand Logo + Filter Button + Breadcrumb Left + Clean Tools Right) ──────── */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-white/95 dark:bg-slate-900/90 text-slate-800 dark:text-slate-100 px-2.5 py-1 flex items-center justify-between gap-2 text-xs font-bold tracking-wide shadow-xs border-b border-slate-200/90 dark:border-slate-800/80 backdrop-blur-md overflow-visible">
        {/* Left: Brand Title + Breadcrumb Navigation */}
        <div className="flex-1 min-w-0 flex items-center gap-2 overflow-visible py-0.5 flex-nowrap">
          {/* Top-Left Website Brand Title with Vibrant Logo & Integrated Search Button */}
          <div className="flex items-center gap-2 pr-2.5 border-r border-slate-200 dark:border-slate-800 shrink-0">
            {/* Stylish Vibrant Compass Badge */}
            <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-sky-500 via-teal-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/30 shrink-0">
              <Compass className="w-4.5 h-4.5 stroke-[2.3]" />
            </div>

            <div className="flex items-center gap-1.5 leading-none">
              <span className="text-[13px] font-black tracking-tight bg-gradient-to-r from-sky-600 via-teal-600 to-indigo-600 dark:from-sky-400 dark:via-teal-300 dark:to-indigo-300 bg-clip-text text-transparent">
                GIS Layer Navigator
              </span>
              <span className="text-[8.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-xs shadow-sky-500/30 shrink-0">
                TN
              </span>
            </div>

            {/* Search Button */}
            <button
              type="button"
              onClick={() => {
                if (searchOpen) {
                  setSearchOpen(false);
                } else {
                  setSearchOpen(true);
                }
              }}
              title="Search Districts, Taluks, Villages, Survey Numbers..."
              className={`w-7 h-7 rounded-xl border transition-all flex items-center justify-center cursor-pointer ml-1 shrink-0 active:scale-95 shadow-xs ${
                searchOpen
                  ? 'bg-gradient-to-r from-sky-500 via-teal-500 to-indigo-600 border-sky-300 text-white shadow-sky-500/40 ring-2 ring-sky-400/50 scale-105'
                  : 'bg-gradient-to-br from-sky-50 to-cyan-50 dark:from-sky-950/80 dark:to-cyan-950/80 text-sky-600 dark:text-sky-400 hover:bg-gradient-to-r hover:from-sky-500 hover:to-indigo-600 hover:text-white border-sky-200 dark:border-sky-800'
              }`}
            >
              <Search className="w-4 h-4 stroke-[2.4]" />
            </button>

          </div>

          <button
            onClick={() => onBreadcrumbClick?.('state')}
            className="flex items-center gap-1.5 hover:text-sky-600 dark:hover:text-sky-300 transition-colors cursor-pointer text-slate-800 dark:text-slate-200 shrink-0 text-[11.5px] font-bold px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Reset view to Tamil Nadu State"
          >
            <span className="w-2 h-2 rounded-full bg-sky-500 inline-block shrink-0"></span>
            <span className="whitespace-nowrap">Tamil Nadu</span>
          </button>

          {/* 1. DISTRICT LEVEL */}
          {multiBreadcrumb && multiBreadcrumb.districts.length >= 2 ? (
            <>
              <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
              <div className="flex items-center gap-1 shrink-0">
                <ColorPickerDot
                  level="district"
                  currentColor={activeLayerColors?.district}
                  defaultColor="#0284c7"
                  onChangeColor={onChangeLayerColor}
                />
                <BreadcrumbDropdown
                  label="District"
                  level="district"
                  items={multiBreadcrumb.districts}
                  selectedCode={selectedDistrict}
                  dotColor="bg-sky-500"
                  onSelectCombined={() => {
                    onMultiItemSelect?.('district');
                    zoomToLayerBounds('district');
                  }}
                  onSelectItem={(code) => {
                    onMultiItemSelect?.('district', code);
                    zoomToLayerBounds('district', code);
                  }}
                  onRemoveItem={(code) => onToggleMultiDistrict?.(code)}
                  onRemoveAll={() => {
                    multiDistricts.forEach((c) => onToggleMultiDistrict?.(c));
                    onBreadcrumbClick?.('state');
                  }}
                  onBreadcrumbClick={onBreadcrumbClick}
                />
              </div>
            </>
          ) : breadcrumb?.districtName ? (
            <>
              <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
              <div className="flex items-center gap-1 text-slate-800 dark:text-slate-100 font-semibold shrink-0 text-[11.5px]">
                <ColorPickerDot
                  level="district"
                  currentColor={activeLayerColors?.district}
                  defaultColor="#0284c7"
                  onChangeColor={onChangeLayerColor}
                />
                <button
                  type="button"
                  onClick={() => onBreadcrumbClick?.('district')}
                  className="hover:text-sky-600 dark:hover:text-sky-300 transition-colors cursor-pointer whitespace-nowrap font-bold text-slate-800 dark:text-slate-100 px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                  title={`Go back / Zoom to ${breadcrumb.districtName}`}
                >
                  {breadcrumb.districtName}
                </button>
              </div>
            </>
          ) : null}

          {/* 2. TALUK LEVEL */}
          {multiBreadcrumb && multiBreadcrumb.taluks.length >= 2 ? (
            <>
              <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
              <div className="flex items-center gap-1 shrink-0">
                <ColorPickerDot
                  level="taluk"
                  currentColor={activeLayerColors?.taluk}
                  defaultColor="#9333ea"
                  onChangeColor={onChangeLayerColor}
                />
                <BreadcrumbDropdown
                  label="Taluk"
                  level="taluk"
                  items={multiBreadcrumb.taluks}
                  selectedCode={selectedTaluk}
                  dotColor="bg-indigo-500"
                  onSelectCombined={() => {
                    onMultiItemSelect?.('taluk');
                    zoomToLayerBounds('taluk');
                  }}
                  onSelectItem={(code) => {
                    onMultiItemSelect?.('taluk', code);
                    zoomToLayerBounds('taluk', code);
                  }}
                  onRemoveItem={(code) => onToggleMultiTaluk?.(code)}
                  onRemoveAll={() => {
                    multiTaluks.forEach((c) => onToggleMultiTaluk?.(c));
                    if (selectedDistrict) onBreadcrumbClick?.('district');
                  }}
                  onBreadcrumbClick={onBreadcrumbClick}
                />
              </div>
            </>
          ) : breadcrumb?.talukName ? (
            <>
              <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
              <div className="flex items-center gap-1 text-slate-800 dark:text-slate-100 font-semibold shrink-0 text-[11.5px]">
                <ColorPickerDot
                  level="taluk"
                  currentColor={activeLayerColors?.taluk}
                  defaultColor="#9333ea"
                  onChangeColor={onChangeLayerColor}
                />
                <button
                  type="button"
                  onClick={() => onBreadcrumbClick?.('taluk')}
                  className="hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors cursor-pointer whitespace-nowrap font-bold text-slate-800 dark:text-slate-100 px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                  title={`Go back / Zoom to ${breadcrumb.talukName}`}
                >
                  {breadcrumb.talukName}
                </button>
              </div>
            </>
          ) : null}

          {/* 3. VILLAGE LEVEL */}
          {multiBreadcrumb && multiBreadcrumb.villages.length >= 2 ? (
            <>
              <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
              <div className="flex items-center gap-1 shrink-0">
                <BreadcrumbDropdown
                  label="Village"
                  level="village"
                  items={multiBreadcrumb.villages}
                  selectedCode={selectedVillage}
                  dotColor="bg-teal-500"
                  onSelectCombined={() => {
                    onMultiItemSelect?.('village');
                    zoomToLayerBounds('village');
                  }}
                  onSelectItem={(code) => {
                    onMultiItemSelect?.('village', code);
                    zoomToLayerBounds('village', code);
                  }}
                  onRemoveItem={(code) => onToggleMultiVillage?.(code)}
                  onRemoveAll={() => {
                    multiVillages.forEach((c) => onToggleMultiVillage?.(c));
                    if (selectedTaluk) onBreadcrumbClick?.('taluk');
                  }}
                  onBreadcrumbClick={onBreadcrumbClick}
                />
              </div>
            </>
          ) : breadcrumb?.villageName ? (
            <>
              {/* Village (Base Parcel) */}
              <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
              <div className="flex items-center gap-1 text-slate-800 dark:text-slate-100 font-semibold shrink-0 text-[11.5px]">
                <button
                  type="button"
                  onClick={() => onBreadcrumbClick?.('village')}
                  className="hover:text-teal-600 dark:hover:text-teal-300 transition-colors cursor-pointer whitespace-nowrap font-bold text-slate-800 dark:text-slate-100 px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                  title={`Go back / Zoom to ${breadcrumb.villageName}`}
                >
                  {breadcrumb.villageName}
                </button>
              </div>
            </>
          ) : null}

          {/* 4. PARCEL LEVEL */}
          {multiBreadcrumb && multiBreadcrumb.parcels.length >= 2 ? (
            <>
              <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
              <div className="flex items-center gap-1 shrink-0">
                <ColorPickerDot
                  level="parcel"
                  currentColor={activeLayerColors?.parcel}
                  defaultColor="#22c55e"
                  onChangeColor={onChangeLayerColor}
                />
                <BreadcrumbDropdown
                  label="Parcel"
                  level="parcel"
                  items={multiBreadcrumb.parcels}
                  selectedCode={selectedParcel}
                  dotColor="bg-emerald-500"
                  onSelectCombined={() => {
                    onMultiItemSelect?.('parcel');
                    zoomToLayerBounds('parcel');
                  }}
                  onSelectItem={(code) => {
                    onMultiItemSelect?.('parcel', code);
                    zoomToLayerBounds('parcel', code);
                  }}
                  onRemoveItem={(code) => onToggleMultiParcel?.(code)}
                  onRemoveAll={() => {
                    multiParcels.forEach((c) => onToggleMultiParcel?.(c));
                    if (selectedVillage) onBreadcrumbClick?.('village');
                  }}
                  onBreadcrumbClick={onBreadcrumbClick}
                />
              </div>
            </>
          ) : breadcrumb?.parcelName ? (
            <>
              <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
              <div className="flex items-center gap-1 text-amber-700 dark:text-amber-300 font-semibold shrink-0 text-[11.5px]">
                <ColorPickerDot
                  level="parcel"
                  currentColor={activeLayerColors?.parcel}
                  defaultColor="#22c55e"
                  onChangeColor={onChangeLayerColor}
                />
                <button
                  type="button"
                  onClick={() => onBreadcrumbClick?.('parcel')}
                  className="hover:text-amber-600 dark:hover:text-amber-200 transition-colors cursor-pointer whitespace-nowrap font-extrabold text-slate-900 dark:text-amber-300 px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                  title={`Zoom to ${breadcrumb.parcelName}`}
                >
                  {breadcrumb.parcelName}
                </button>
              </div>
            </>
          ) : null}
        </div>

        {/* Right edge: Dark / White Theme Toggle */}
        {onToggleDarkMode && (
          <button
            type="button"
            onClick={onToggleDarkMode}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/90 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-amber-300 hover:text-amber-500 transition-all flex items-center justify-center cursor-pointer shrink-0 shadow-2xs active:scale-95 ml-2"
          >
            {isDarkMode ? <Sun className="w-3.5 h-3.5 stroke-[2.2] text-amber-400" /> : <Moon className="w-3.5 h-3.5 stroke-[2.2] text-slate-700" />}
          </button>
        )}
      </div>

      {/* ─── EMPTY POLYGON WARNING TOAST ─── */}
      {polygonEmptyWarning && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-white/98 dark:bg-slate-900/98 border border-amber-400 dark:border-amber-600/80 shadow-2xl rounded-2xl p-2.5 px-3.5 flex items-center gap-2.5 max-w-md animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <AlertCircle className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-[11px] font-black text-slate-800 dark:text-slate-100">No Layers Inside Polygon</span>
            <span className="text-[10px] text-slate-600 dark:text-slate-300 leading-tight">{polygonEmptyWarning}</span>
          </div>
          <button
            type="button"
            onClick={() => setPolygonEmptyWarning(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ─── LIVE DRAWING HUD BANNER (Top Center during drawing) ────────────────── */}
      {drawMode !== 'idle' && (
        <div className="absolute top-11 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl px-3.5 py-1.5 rounded-xl border border-cyan-400 dark:border-cyan-500/60 shadow-lg text-slate-800 dark:text-slate-100 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-ping inline-block shrink-0" />
            <span>
              {drawPoints.length === 0
                ? 'Click map to place points'
                : `${drawPoints.length} points placed`}
            </span>
          </div>

          {liveAreaAcres && (
            <span className="text-[11px] font-mono font-bold bg-cyan-50 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-200 px-1.5 py-0.5 rounded border border-cyan-300 dark:border-cyan-800/60">
              📐 {liveAreaAcres} ac
            </span>
          )}

          <div className="flex items-center gap-1 ml-1.5 border-l border-slate-200 dark:border-slate-700 pl-1.5">
            {drawPoints.length > 0 && (
              <button
                type="button"
                onClick={handleUndoPoint}
                className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] rounded flex items-center gap-1 cursor-pointer"
                title="Undo point (Ctrl+Z)"
              >
                <Undo2 className="w-3 h-3 text-amber-500" />
                <span>Undo</span>
              </button>
            )}

            {drawPoints.length >= 3 && (
              <button
                type="button"
                onClick={() => finishDrawingPolygon(drawPoints)}
                className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded flex items-center gap-1 shadow-xs cursor-pointer"
              >
                <Check className="w-3 h-3" />
                <span>Finish</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setDrawMode('idle');
                setDrawPoints([]);
                setMousePos(null);
              }}
              className="p-1 bg-slate-100 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-900/80 text-slate-600 hover:text-rose-600 dark:text-slate-300 dark:hover:text-rose-200 rounded cursor-pointer"
              title="Cancel drawing (Esc)"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* ─── FLOATING INTERACTIVE SUBDIVISION CLIP & DOWNLOAD BOX ─── */}
      {isClipSelectMode && (
        <div
          className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 w-72 sm:w-80 min-w-[260px] max-w-[340px] max-h-[80vh] resize overflow-auto bg-white/98 dark:bg-slate-900/95 backdrop-blur-2xl border-2 border-amber-500/80 dark:border-amber-400/80 rounded-2xl p-3 shadow-2xl animate-in fade-in slide-in-from-bottom-3 duration-200 flex flex-col gap-2.5 text-slate-800 dark:text-slate-100 cursor-grab active:cursor-grabbing ring-4 ring-amber-500/20"
          style={clipSelectDrag.style}
          onMouseDown={clipSelectDrag.handleMouseDown}
        >
          {/* Drag Handle Grip Bar */}
          <div className="w-full flex items-center justify-center py-0.5 cursor-grab active:cursor-grabbing opacity-40 hover:opacity-100 transition-opacity">
            <div className="w-8 h-1 rounded-full bg-amber-500 dark:bg-amber-400" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-5 h-5 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-xs">
                <Scissors className="w-3 h-3 stroke-[2.5]" />
              </div>
              <div className="flex flex-col min-w-0">
                <h4 className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-wider truncate">
                  Clip Subdivisions
                </h4>
                <span className="text-[9.5px] text-amber-600 dark:text-amber-400 font-bold truncate">
                  {breadcrumb?.villageName || selectedVillage || 'Active Village'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsClipSelectMode(false);
                setSelectedClipFeatures([]);
                setShowClipDownloadCard(false);
              }}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              title="Close Clip Mode (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Selection Counter & Quick Bulk Actions */}
          <div className="flex items-center justify-between gap-1.5 bg-amber-50 dark:bg-amber-950/40 p-1.5 rounded-xl border border-amber-200 dark:border-amber-800/60">
            <span className="text-[10.5px] font-black text-amber-900 dark:text-amber-200">
              {selectedClipFeatures.length} selected
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const allFeats = activeLayers.village?.geojson?.features || [];
                  if (allFeats.length > 0) {
                    setSelectedClipFeatures(allFeats);
                  }
                }}
                className="px-2 py-0.5 rounded text-[9.5px] font-bold bg-amber-500 hover:bg-amber-600 text-white cursor-pointer transition-colors shadow-2xs"
                title="Select All Subdivisions in this Village"
              >
                Select All ({activeLayers.village?.geojson?.features?.length || 0})
              </button>
              {selectedClipFeatures.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedClipFeatures([])}
                  className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-slate-200 dark:bg-slate-800 hover:bg-rose-100 hover:text-rose-600 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
                  title="Clear selection"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Selected Survey Badges List */}
          {selectedClipFeatures.length > 0 ? (
            <div className="max-h-24 overflow-y-auto flex flex-wrap gap-1 p-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60">
              {selectedClipFeatures.map((f, idx) => {
                const p = f.properties || {};
                const sNo = String(p.survey_no || p.SURVEY_NO || p.sno || p.KIDE || p.name || `Parcel ${idx + 1}`);
                return (
                  <span
                    key={`${sNo}_${idx}`}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-[10px] font-mono font-bold border border-slate-300 dark:border-slate-700 shadow-2xs group"
                  >
                    <span>{sNo}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedClipFeatures((prev) => prev.filter((_, i) => i !== idx));
                      }}
                      className="text-slate-400 hover:text-rose-500 cursor-pointer transition-colors"
                      title={`Remove Survey ${sNo}`}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="py-2 text-center text-[10.5px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
              👉 Click any parcel or subdivision on the map to select it
            </div>
          )}

          {/* 2 Format Options: Shapefile, GeoJSON */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setClipExportFormat('shp')}
              className={`flex items-center gap-1.5 p-1.5 rounded-xl border transition-all cursor-pointer ${
                clipExportFormat === 'shp'
                  ? 'bg-amber-50 dark:bg-amber-500/25 border-amber-500 text-amber-900 dark:text-white shadow-xs font-bold ring-2 ring-amber-400/40'
                  : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="ESRI Shapefile ZIP (.shp)"
            >
              <span className="text-sm">📦</span>
              <div className="flex flex-col text-left min-w-0">
                <span className="text-[10px] font-black uppercase tracking-tight truncate">Shapefile</span>
                <span className="text-[8px] text-slate-500 dark:text-slate-400">.SHP ZIP</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setClipExportFormat('geojson')}
              className={`flex items-center gap-1.5 p-1.5 rounded-xl border transition-all cursor-pointer ${
                clipExportFormat === 'geojson'
                  ? 'bg-amber-50 dark:bg-amber-500/25 border-amber-500 text-amber-900 dark:text-white shadow-xs font-bold ring-2 ring-amber-400/40'
                  : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="GeoJSON vector geometry"
            >
              <span className="text-sm">🌐</span>
              <div className="flex flex-col text-left min-w-0">
                <span className="text-[10px] font-black uppercase tracking-tight truncate">GeoJSON</span>
                <span className="text-[8px] text-slate-500 dark:text-slate-400">WGS84</span>
              </div>
            </button>
          </div>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={() => handleDownloadSelectedClip(clipExportFormat)}
            disabled={selectedClipFeatures.length === 0 || clipDownloadStatus === 'loading'}
            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold py-2 px-3 rounded-xl shadow-md flex items-center justify-center gap-1.5 text-[11px] transition-all active:scale-98 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {clipDownloadStatus === 'loading' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Generating {clipExportFormat.toUpperCase()}…</span>
              </>
            ) : clipDownloadStatus === 'success' ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-200" />
                <span>Downloaded Successfully!</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Download {selectedClipFeatures.length > 0 ? `${selectedClipFeatures.length} ` : ''}Parcels ({clipExportFormat.toUpperCase()})</span>
              </>
            )}
          </button>

          {clipDownloadError && (
            <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-red-50 dark:bg-red-950/80 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 text-[10px]">
              <AlertCircle className="w-3 h-3 shrink-0 text-red-600 dark:text-red-400" />
              <span>{clipDownloadError}</span>
            </div>
          )}

          {/* Keyboard Shortcut Hint removed per user request */}
        </div>
      )}



      {/* ─── DRAGGABLE & RESIZABLE SEARCH & FILTER POPOVER (Anchored below brand bar) ─── */}
      {(searchOpen || isSidebarOpen) && (
        <div
          className="absolute top-[52px] left-2.5 z-30 w-72 sm:w-80 min-w-[260px] max-w-[340px] resize overflow-visible bg-white/98 dark:bg-slate-900/98 backdrop-blur-2xl rounded-2xl shadow-2xl border border-sky-200/90 dark:border-slate-700/80 p-1.5 animate-in fade-in slide-in-from-top-2 duration-150 flex flex-col gap-1 cursor-grab active:cursor-grabbing"
          ref={dropdownRef}
          style={navDrag.style}
          onMouseDown={navDrag.handleMouseDown}
        >
          {/* Drag Handle Grip Bar */}
          <div className="w-full flex items-center justify-center py-0.5 cursor-grab active:cursor-grabbing opacity-40 hover:opacity-100 transition-opacity">
            <div className="w-8 h-1 rounded-full bg-slate-400 dark:bg-slate-600" />
          </div>
          <SearchBar
            onSelectResult={(result) => {
              onSearchResultSelect?.(result);
            }}
            placeholder="Search district, taluk, village, survey..."
            autoFocus
            onToggleSidebar={onToggleSidebar}
            isSidebarOpen={isSidebarOpen}
            onRefreshMap={() => {
              if (onReset) onReset();
              if (onBreadcrumbClick) onBreadcrumbClick('state');
            }}
          />

          {/* Mode 2: Filter Navigation Panel Dropdown (Shown ONLY when Filter icon is clicked) */}
          {isSidebarOpen && (
            <div className="max-h-[68vh] overflow-y-auto pr-1 animate-in fade-in slide-in-from-top-2 duration-200">
              <NavigationPanel
                isDarkMode={isDarkMode}
                onToggleDarkMode={onToggleDarkMode}
                onToggleSidebar={onToggleSidebar}
                districts={districts}
                taluks={taluks}
                villages={villages}
                parcels={parcels}
                selectedDistrict={selectedDistrict}
                selectedTaluk={selectedTaluk}
                selectedVillage={selectedVillage}
                selectedParcel={selectedParcel}
                layerType={layerType}
                onLayerTypeChange={onLayerTypeChange}
                loadingDistricts={loadingDistricts}
                loadingTaluks={loadingTaluks}
                loadingVillages={loadingVillages}
                loadingParcels={loadingParcels}
                onDistrictSelect={onDistrictSelect}
                onTalukSelect={onTalukSelect}
                onVillageSelect={onVillageSelect}
                onParcelSelect={onParcelSelect}
                onBackStep={onBackStep || (() => {})}
                onResetAll={onReset || (() => {})}
                onBreadcrumbClick={onBreadcrumbClick}
                currentLevel={selectedLevel === 'none' ? 'state' : selectedLevel}
                onSearchResultSelect={onSearchResultSelect}
                onChangeLayerColor={onChangeLayerColor}
                activeLayerColors={activeLayerColors}
                activeLayers={activeLayers}
                onToggleVisibility={onToggleVisibility}
                onChangeOpacity={onChangeOpacity}
                onZoomToLayer={onZoomToLayer}
                onToggleLabels={onToggleLabels}
                multiDistricts={multiDistricts}
                multiTaluks={multiTaluks}
                multiVillages={multiVillages}
                multiParcels={multiParcels}
                onToggleMultiDistrict={onToggleMultiDistrict}
                onToggleMultiTaluk={onToggleMultiTaluk}
                onToggleMultiVillage={onToggleMultiVillage}
                onToggleMultiParcel={onToggleMultiParcel}
              />
            </div>
          )}
        </div>
      )}

      {/* ─── TOP-RIGHT TOOL DOCK (Basemap, Draw, Layer Cart, Fullscreen) ─── */}
      <div className="absolute top-12 right-3 z-30 flex flex-col items-center gap-1.5">

        {/* 3. Basemap */}
        <div className="relative">
          <button
            onClick={() => {
              const next = !dropdownOpen;
              setDropdownOpen(next);
              if (next) {
                setDownloadOpen(false);
                setLayerCartOpen(false);
                setShowDownloadCard(false);
              }
            }}
            title="Switch Basemap"
            className={`w-8 h-8 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border shadow-md flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
              dropdownOpen
                ? 'border-sky-600 bg-sky-600 text-white shadow-xs'
                : 'border-sky-200 dark:border-sky-800/80 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/60 hover:border-sky-400'
            }`}
          >
            <Map className="w-3.5 h-3.5 stroke-[2.2]" />
          </button>

          {dropdownOpen && (
            <div className="absolute top-0 right-full mr-2 w-48 bg-white/98 dark:bg-slate-900/98 backdrop-blur-xl rounded-xl shadow-xl border border-slate-200 dark:border-slate-700/80 p-1.5 z-50 space-y-0.5 animate-in fade-in slide-in-from-right-2 duration-150">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-2 pb-1">Basemap</p>
              {BASEMAP_OPTIONS.map((opt) => {
                const isSelected = basemapStyle === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      onBasemapChange(opt.key);
                      if (mapRef.current) {
                        applyBasemapVisibility(mapRef.current, opt.key);
                      }
                      setDropdownOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-sky-50 dark:bg-sky-600/30 text-sky-700 dark:text-sky-300 font-bold border border-sky-200 dark:border-sky-600/40'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0" />}
                  </button>
                );
              })}
              <div className="pt-1 mt-1 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between px-1">
                <button onClick={toggle3DPitch} className="px-1.5 py-0.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white text-[10px] flex items-center gap-1 font-mono cursor-pointer">
                  <Compass className={`w-3 h-3 ${is3D ? 'text-amber-500' : ''}`} />{is3D ? '3D' : '2D'}
                </button>
                <button onClick={() => { handleResetView(); setDropdownOpen(false); }} className="px-1.5 py-0.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white text-[10px] flex items-center gap-1 font-mono cursor-pointer">
                  <RotateCcw className="w-3 h-3" />Reset
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Draw Custom Polygon & Download Area */}
        <button
          type="button"
          onClick={() => {
            if (drawMode === 'polygon') {
              setDrawMode('idle');
              setDrawPoints([]);
              setExtractedResult(null);
              setShowDownloadCard(false);
            } else {
              setDrawMode('polygon');
              setDrawPoints([]);
              setExtractedResult(null);
              setShowDownloadCard(false);
              setDropdownOpen(false);
              setDownloadOpen(false);
              setLayerCartOpen(false);
            }
          }}
          title={drawMode === 'polygon' ? 'Cancel Polygon Drawing' : 'Draw Polygon & Download Area (Shapefile / GeoJSON)'}
          className={`w-8 h-8 rounded-xl backdrop-blur-md border shadow-md flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
            drawMode === 'polygon'
              ? 'bg-amber-500 border-amber-400 text-white animate-pulse'
              : 'bg-white/95 dark:bg-slate-900/95 border-sky-200 dark:border-sky-800/80 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/60 hover:border-sky-400'
          }`}
        >
          <Pentagon className="w-3.5 h-3.5 stroke-[2.2]" />
        </button>

        {/* Layer Cart */}
        <LayerCartDropdown
          activeCartLayers={activeCartLayers || {}}
          onToggleLayer={onToggleCartLayer || (() => {})}
          onToggleAll={onToggleAllCartLayers || (() => {})}
          iconOnly
          isOpen={layerCartOpen}
          onToggleOpen={() => {
            const next = !layerCartOpen;
            setLayerCartOpen(next);
            if (next) {
              setDropdownOpen(false);
              setDownloadOpen(false);
              setShowDownloadCard(false);
            }
          }}
        />

        {/* Spatial Clip Tool (Village & Parcel Level) */}
        {(selectedLevel === 'village' || selectedLevel === 'parcel' || Boolean(activeLayers.village)) && (
          <button
            type="button"
            onClick={() => {
              if (isClipSelectMode) {
                setIsClipSelectMode(false);
                setSelectedClipFeatures([]);
                setShowClipDownloadCard(false);
              } else {
                setIsClipSelectMode(true);
                setSelectedClipFeatures([]);
                setShowClipDownloadCard(false);
                setDrawMode('idle');
                setDropdownOpen(false);
                setDownloadOpen(false);
                setLayerCartOpen(false);
                setShowDownloadCard(false);
              }
            }}
            title={isClipSelectMode ? 'Exit Clip Selection Mode (Esc)' : 'Clip & Select Village Parcels / Subdivisions'}
            className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
              isClipSelectMode
                ? 'bg-amber-500 border-amber-300 text-white shadow-lg shadow-amber-500/40 ring-2 ring-amber-400 animate-pulse'
                : 'bg-white/95 dark:bg-slate-900/95 border-amber-400 dark:border-amber-600 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:border-amber-500 shadow-md'
            }`}
          >
            <Scissors className="w-3.5 h-3.5 stroke-[2.3]" />
          </button>
        )}

        {/* Toggle / Remove Navigation Panel (Expand Map View) */}
        <button
          type="button"
          onClick={() => {
            onToggleSidebar?.();
          }}
          title={isSidebarOpen ? 'Hide Navigation Panel (Expand Map View)' : 'Open Navigation Panel'}
          className={`w-8 h-8 rounded-xl backdrop-blur-md border shadow-md flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
            isSidebarOpen
              ? 'bg-white/95 dark:bg-slate-900/95 border-sky-200 dark:border-sky-800/80 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/60 hover:border-sky-400'
              : 'bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-800 text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 hover:border-sky-400'
          }`}
        >
          {isSidebarOpen ? (
            <Maximize2 className="w-3.5 h-3.5 stroke-[2.2]" />
          ) : (
            <Minimize2 className="w-3.5 h-3.5 stroke-[2.2]" />
          )}
        </button>

        {/* 📥 Download Scope & Export (Fixed as Last Icon in Dock) */}
        <button
          ref={downloadButtonRef}
          type="button"
          onClick={() => {
            const next = !downloadOpen;
            setDownloadOpen(next);
            if (next) {
              setDropdownOpen(false);
              setLayerCartOpen(false);
              setShowDownloadCard(false);
            }
          }}
          title="Download Boundaries & GIS Layers (SHP, GeoJSON, KML, KMZ)"
          className={`w-8 h-8 rounded-xl backdrop-blur-md border shadow-md flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
            downloadOpen
              ? 'bg-gradient-to-tr from-sky-600 to-indigo-600 text-white border-sky-400 shadow-sky-500/30 ring-2 ring-sky-400/40'
              : 'bg-white/95 dark:bg-slate-900/95 border-sky-200 dark:border-sky-800/80 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/60 hover:border-sky-400'
          }`}
        >
          <Download className="w-3.5 h-3.5 stroke-[2.3]" />
        </button>
      </div>

      {/* ─── DRAGGABLE & RESIZABLE BOTTOM-RIGHT DOWNLOAD POPUP ─── */}
      {downloadOpen && (
        <div
          ref={downloadRef}
          className="absolute bottom-6 right-14 z-40 w-80 sm:w-92 min-w-[260px] max-w-[420px] resize overflow-auto bg-white/98 dark:bg-slate-900/98 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150 cursor-grab active:cursor-grabbing"
          style={downloadDrag.style}
          onMouseDown={downloadDrag.handleMouseDown}
        >
          {/* Drag Handle Grip Bar */}
          <div className="w-full flex items-center justify-center py-0.5 cursor-grab active:cursor-grabbing opacity-40 hover:opacity-100 transition-opacity">
            <div className="w-8 h-1 rounded-full bg-slate-400 dark:bg-slate-600" />
          </div>
          <DownloadScopePanel
            districts={districts}
            taluks={taluks}
            villages={villages}
            parcels={parcels}
            selectedDistrict={selectedDistrict}
            selectedTaluk={selectedTaluk}
            selectedVillage={selectedVillage}
            selectedParcel={selectedParcel}
            layerType={layerType}
            multiDistricts={multiDistricts}
            multiTaluks={multiTaluks}
            multiVillages={multiVillages}
            multiParcels={multiParcels}
            onToggleMultiDistrict={onToggleMultiDistrict}
            onToggleMultiTaluk={onToggleMultiTaluk}
            onToggleMultiVillage={onToggleMultiVillage}
            onToggleMultiParcel={onToggleMultiParcel}
            extractedPolygonResult={extractedResult}
            onClearExtractedPolygon={handleClearDraw}
            onClose={() => setDownloadOpen(false)}
          />
        </div>
      )}

      {/* ─── BOTTOM-RIGHT ZOOM DOCK ─── */}
      <div className="absolute bottom-6 right-3 z-30 flex flex-col items-center gap-1">
        <button
          onClick={handleZoomIn}
          title="Zoom In"
          className="w-8 h-8 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-sky-200 dark:border-sky-800/80 shadow-md hover:bg-sky-50 dark:hover:bg-sky-950/60 hover:border-sky-400 text-sky-600 dark:text-sky-400 flex items-center justify-center transition-all cursor-pointer active:scale-95"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>
        <button
          onClick={handleZoomOut}
          title="Zoom Out"
          className="w-8 h-8 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-sky-200 dark:border-sky-800/80 shadow-md hover:bg-sky-50 dark:hover:bg-sky-950/60 hover:border-sky-400 text-sky-600 dark:text-sky-400 flex items-center justify-center transition-all cursor-pointer active:scale-95"
        >
          <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>
      </div>

      {/* Hover Information Badge */}
      {hoveredFeature && drawMode === 'idle' && (
        <div className="absolute top-12 left-3 z-10 bg-white/95 dark:bg-slate-900/90 text-slate-800 dark:text-white backdrop-blur-md px-3 py-1.5 rounded-xl shadow-md border border-slate-200 dark:border-slate-700/60 flex items-center gap-2 text-xs font-mono animate-in fade-in duration-150">
          <Info className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400 shrink-0" />
          <span className="text-sky-600 dark:text-sky-400 font-bold uppercase text-[10px]">{hoveredFeature.level}:</span>
          <span className="font-semibold text-slate-800 dark:text-slate-100">{hoveredFeature.name}</span>
          <span className="text-slate-500 dark:text-slate-400 text-[10px]">({hoveredFeature.code})</span>
        </div>
      )}

      {/* Floating Bottom Left Back & Reset Controls (If navigated inside hierarchy) */}
      {onBackStep && (selectedLevel !== 'none' || Boolean(selectedDistrict) || (multiDistricts && multiDistricts.length > 0)) && (
        <div className="absolute bottom-4 left-4 z-40 animate-in fade-in slide-in-from-bottom-2 duration-200 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onBackStep((selectedLevel === 'none' ? 'district' : selectedLevel) as GisLevel);
            }}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-slate-900/95 hover:bg-sky-600 dark:bg-slate-800/95 dark:hover:bg-sky-600 text-white font-extrabold text-xs shadow-2xl border border-slate-700/90 hover:border-sky-400 backdrop-blur-xl cursor-pointer transition-all active:scale-95 group"
            title="Go back one step"
          >
            <ArrowLeft className="w-4 h-4 text-sky-400 group-hover:text-white group-hover:-translate-x-0.5 transition-transform stroke-[2.5]" />
            <span>
              {selectedLevel === 'parcel'
                ? 'Back to Village'
                : selectedLevel === 'village'
                ? 'Back to Taluk'
                : selectedLevel === 'taluk'
                ? 'Back to District'
                : 'Back to State'}
            </span>
          </button>

          {onReset && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onReset();
              }}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl bg-slate-900/95 hover:bg-rose-600 dark:bg-slate-800/95 dark:hover:bg-rose-600 text-slate-300 hover:text-white font-bold text-xs shadow-2xl border border-slate-700/90 hover:border-rose-400 backdrop-blur-xl cursor-pointer transition-all active:scale-95"
              title="Reset view to full Tamil Nadu state map"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      )}

      {/* Multi-Layer Spatial Clip & Export Modal (Drawn Polygon & Village Layers) */}
      <ClipModal
        isOpen={isClipModalOpen}
        onClose={() => setIsClipModalOpen(false)}
        clipPolygon={extractedResult?.polygonGeojson || null}
        drawnAreaAcres={extractedResult?.totalAreaAcres}
        activeVillageLayer={activeLayers.village}
        activeParcelLayer={activeLayers.parcel}
        selectedVillageName={breadcrumb?.villageName}
        multiVillageNames={multiBreadcrumb?.villages?.map((v) => v.name)}
        multiVillageCodes={multiVillages}
        districtCode={selectedDistrict}
        talukCode={selectedTaluk}
        villageCode={selectedVillage}
        fileType={layerType}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};
