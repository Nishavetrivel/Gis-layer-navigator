import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import { Protocol, PMTiles } from 'pmtiles';

let _pmtilesProtocolInstance: Protocol | null = null;
function getPMTilesProtocol(): Protocol {
  if (!_pmtilesProtocolInstance) {
    _pmtilesProtocolInstance = new Protocol();
    maplibregl.addProtocol('pmtiles', _pmtilesProtocolInstance.tile);
  }
  return _pmtilesProtocolInstance;
}
getPMTilesProtocol();
import { ActiveGisLayer, GisLevel, BasemapStyle, DrawMode, ExtractedLayerResult, DistrictItem, TalukItem, VillageItem, ParcelItem } from '../types';
import { TAMIL_NADU_BOUNDS, TAMIL_NADU_MAX_BOUNDS, TAMIL_NADU_CENTER } from '../utils/geoUtils';
import { DISTRICT_CENTROIDS } from '../utils/districtCentroids';
export interface PreloadedLayers {
  districtGeoJson?: any;
  talukGeoJson?: any;
  villageGeoJson?: any;
}
import { parseShpBuffer } from '../utils/shpParser';
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
  Map as MapIcon,
  Search,
  Filter,
  RefreshCw,
  Sun,
  Moon,
  Scissors,
  Upload,
  Crosshair,
  FileCode,
} from 'lucide-react';
import { apiUrl, API_BASE, getPmtilesUrl } from '@/frontend/lib/api';

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
  onNoData?: (info: { level?: string; name?: string; code?: string; message?: string; suggestion?: string }) => void;
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
  onNoData,
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
  const [focusedItem, setFocusedItem] = useState<{ level: GisLevel; code: string } | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [hasStartedSearch, setHasStartedSearch] = useState(false);
  const [layerCartOpen, setLayerCartOpen] = useState(false);
  const [is3D, setIs3D] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const activePopupLayerRef = useRef<string | null>(null);
  const activePopupParcelKeyRef = useRef<string | null>(null);
  const featureClickedInCurrentEventRef = useRef<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const basemapRef = useRef<HTMLDivElement>(null);
  const [searchResetKey, setSearchResetKey] = useState(0);
  const handleResetSearchData = useCallback(() => {
    setSearchResetKey((k) => k + 1);
  }, []);
  const downloadRef = useRef<HTMLDivElement>(null);
  const downloadButtonRef = useRef<HTMLButtonElement>(null);
  const [currentMapZoom, setCurrentMapZoom] = useState<number>(7.0);
  const [mapAltitudeKm, setMapAltitudeKm] = useState<number | null>(null);
  const currentPmtilesDistrictRef = useRef<string | null>(null);
  const pmtilesInstanceCacheRef = useRef<Map<string, PMTiles>>(new Map());

  // Auto-Zoom Tier Visibility States (T: Taluk, V: Village, P: Parcel)
  const [zoomLayerVisibility, setZoomLayerVisibility] = useState<{
    taluk: boolean;
    village: boolean;
    parcel: boolean;
  }>({
    taluk: true,
    village: true,
    parcel: true,
  });
  const zoomLayerVisibilityRef = useRef(zoomLayerVisibility);
  zoomLayerVisibilityRef.current = zoomLayerVisibility;

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

  const shouldShowDownloadIcon = Boolean(
    hasStartedSearch ||
    hasActiveSelection ||
    searchOpen ||
    isSidebarOpen ||
    Boolean(selectedDistrict && selectedDistrict !== 'all') ||
    Boolean(selectedTaluk) ||
    Boolean(selectedVillage) ||
    Boolean(selectedParcel) ||
    Boolean(breadcrumb?.districtName || breadcrumb?.talukName || breadcrumb?.villageName || breadcrumb?.parcelName) ||
    multiDistricts.length > 0 ||
    multiTaluks.length > 0 ||
    multiVillages.length > 0 ||
    multiParcels.length > 0
  );

  // Independent Drag Handles for Search Popover, Clip Box, and Download Scope Card
  const navDrag = useDraggableCard();
  const clipDrag = useDraggableCard();
  const clipSelectDrag = useDraggableCard();
  const downloadDrag = useDraggableCard();
  const droppedDrag = useDraggableCard();

  // Adjustable Search & Navigation Panel Sizing
  const [panelWidth, setPanelWidth] = useState<number>(290);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const isResizingPanel = useRef<'right' | 'corner' | null>(null);
  const resizeStartPos = useRef({ x: 0, y: 0, w: 290, h: 400 });

  const handlePanelResizeStart = (type: 'right' | 'corner') => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isResizingPanel.current = type;
    const curW = searchPanelRef.current?.offsetWidth || panelWidth;
    const curH = searchPanelRef.current?.offsetHeight || 400;
    resizeStartPos.current = { x: e.clientX, y: e.clientY, w: curW, h: curH };

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingPanel.current) return;
      const dx = moveEvent.clientX - resizeStartPos.current.x;
      const dy = moveEvent.clientY - resizeStartPos.current.y;
      const nextW = Math.max(240, Math.min(window.innerWidth - 30, resizeStartPos.current.w + dx));
      setPanelWidth(nextW);
      if (isResizingPanel.current === 'corner') {
        const nextH = Math.max(200, Math.min(window.innerHeight - 70, resizeStartPos.current.h + dy));
        setPanelHeight(nextH);
      }
    };

    const onMouseUp = () => {
      isResizingPanel.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const activeCartLayersRef = useRef<Record<string, boolean>>(activeCartLayers);
  activeCartLayersRef.current = activeCartLayers;

  const activeLayersRef = useRef<Record<GisLevel, ActiveGisLayer | null>>(activeLayers);
  activeLayersRef.current = activeLayers;

  const lastZoomedKeyRef = useRef<string>('');

  // ─── Dynamic Layer Blinking on Zoom Tier Transition ───
  const blinkAnimationFramesRef = useRef<{ [key: string]: number }>({});
  const lastZoomTierRef = useRef<'district' | 'taluk' | 'village' | 'cadastral'>('district');

  const blinkLayer = useCallback((layerIds: string[], baseColor: string, blinkColor: string, cycles = 3, cycleDurationMs = 280) => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const validLayers = layerIds.filter((id) => Boolean(map.getLayer(id)));
    if (validLayers.length === 0) return;

    const animKey = validLayers.join(',');
    if (blinkAnimationFramesRef.current[animKey]) {
      cancelAnimationFrame(blinkAnimationFramesRef.current[animKey]);
    }

    const startTime = performance.now();
    const totalDuration = cycles * cycleDurationMs;

    const step = (now: number) => {
      if (!mapRef.current) return;
      const elapsed = now - startTime;

      if (elapsed >= totalDuration) {
        validLayers.forEach((id) => {
          if (map.getLayer(id)) {
            map.setPaintProperty(id, 'line-color', baseColor);
          }
        });
        delete blinkAnimationFramesRef.current[animKey];
        return;
      }

      const cycleProgress = (elapsed % cycleDurationMs) / cycleDurationMs;
      const useBlinkColor = Math.sin(cycleProgress * Math.PI * 2) > 0;
      const activeColor = useBlinkColor ? blinkColor : baseColor;

      validLayers.forEach((id) => {
        if (map.getLayer(id)) {
          map.setPaintProperty(id, 'line-color', activeColor);
        }
      });

      blinkAnimationFramesRef.current[animKey] = requestAnimationFrame(step);
    };

    blinkAnimationFramesRef.current[animKey] = requestAnimationFrame(step);
  }, []);

  const triggerTierBlink = useCallback((tier: 'district' | 'taluk' | 'village' | 'cadastral') => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const style = map.getStyle();
    const allLayerIds = style && style.layers ? style.layers.map((l) => l.id) : [];

    if (tier === 'district') {
      const baseCol = activeLayerColors?.district || '#facc15';
      const ids = ['auto-zoom-district-outline', 'district-outline'].filter((id) => allLayerIds.includes(id));
      blinkLayer(ids, baseCol, '#38bdf8'); // District: Yellow blinks in Electric Cyan
    } else if (tier === 'taluk') {
      const baseCol = activeLayerColors?.taluk || '#9333ea';
      const ids = ['auto-zoom-taluk-outline', 'taluk-outline'].filter((id) => allLayerIds.includes(id));
      blinkLayer(ids, baseCol, '#fbbf24'); // Taluk: Purple blinks in Bright Gold/Amber
    } else if (tier === 'village') {
      const baseCol = activeLayerColors?.village || '#facc15';
      const ids = ['auto-zoom-village-outline', 'village-outline', 'village-base-outline'].filter((id) => allLayerIds.includes(id));
      blinkLayer(ids, baseCol, '#f97316'); // Village: Yellow blinks in Vivid Orange
    } else if (tier === 'cadastral') {
      // Cadastral tier blink disabled per user request ("avoid this when we click an parcel that blink in no need just zoom in is enough")
      return;
    }
  }, [blinkLayer, activeLayerColors]);

  const triggerTierBlinkRef = useRef(triggerTierBlink);
  triggerTierBlinkRef.current = triggerTierBlink;

  // Toggle Zooming Tier Visibility (Taluk: T, Village: V, Parcel: P) - does not affect selected/searched layers
  const toggleZoomLayer = useCallback((tier: 'taluk' | 'village' | 'parcel') => {
    setZoomLayerVisibility((prev) => {
      const next = { ...prev, [tier]: !prev[tier] };
      zoomLayerVisibilityRef.current = next;

      if (mapRef.current) {
        const map = mapRef.current;
        if (tier === 'taluk') {
          const vis = next.taluk ? 'visible' : 'none';
          ['auto-zoom-taluk-outline', 'auto-zoom-taluk-labels'].forEach((id) => {
            if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis);
          });
        } else if (tier === 'village') {
          const vis = next.village ? 'visible' : 'none';
          const labelVis = next.village && (activeLayers.village?.showLabels !== false) ? 'visible' : 'none';
          if (map.getLayer('auto-zoom-village-outline')) map.setLayoutProperty('auto-zoom-village-outline', 'visibility', vis);
          if (map.getLayer('auto-zoom-village-labels')) map.setLayoutProperty('auto-zoom-village-labels', 'visibility', labelVis);
        } else if (tier === 'parcel') {
          const vis = next.parcel ? 'visible' : 'none';
          activePmtilesDistrictsRef.current.forEach((cleanDist) => {
            const fillId = `cadastral-pmtiles-fill-${cleanDist}`;
            const lineId = `cadastral-pmtiles-line-${cleanDist}`;
            const labelId = `cadastral-pmtiles-label-${cleanDist}`;
            if (map.getLayer(fillId)) map.setLayoutProperty(fillId, 'visibility', vis);
            if (map.getLayer(lineId)) map.setLayoutProperty(lineId, 'visibility', vis);
            if (map.getLayer(labelId)) map.setLayoutProperty(labelId, 'visibility', vis);
          });
        }
      }
      return next;
    });
  }, []);

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
  const [activeClipPolygon, setActiveClipPolygon] = useState<any | null>(null);
  const [clippedPreviewGeoJSON, setClippedPreviewGeoJSON] = useState<any | null>(null);
  const [clippedVillageLayer, setClippedVillageLayer] = useState<ActiveGisLayer | null>(null);
  const [clippedParcelLayer, setClippedParcelLayer] = useState<ActiveGisLayer | null>(null);
  const [clippedDistrictCode, setClippedDistrictCode] = useState<string>('');
  const [clippedTalukCode, setClippedTalukCode] = useState<string>('');
  const [clippedVillageCode, setClippedVillageCode] = useState<string>('');
  const [clippedVillageCodes, setClippedVillageCodes] = useState<string[]>([]);
  const [clippedPreviewCounts, setClippedPreviewCounts] = useState<Record<string, number>>({});
  const [clippedFeaturesList, setClippedFeaturesList] = useState<any[]>([]);

  // ─── Drag & Drop Georeferenced GeoJSON / SHP / GPKG Overlay States ──────────
  const [isUploadMode, setIsUploadMode] = useState(false);
  const isUploadModeRef = useRef<boolean>(false);
  isUploadModeRef.current = isUploadMode;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [droppedLayerData, setDroppedLayerData] = useState<any | null>(null);
  const [droppedLayerInfo, setDroppedLayerInfo] = useState<{
    fileName: string;
    featureCount: number;
    geomTypes: string[];
    areaAcres?: number;
    lengthKm?: number;
    bbox: [number, number, number, number];
    districtName?: string;
    districtCode?: string;
    talukName?: string;
    talukCode?: string;
    villageName?: string;
    villageCode?: string;
    layers?: Record<string, any>;
    layerNames?: string[];
    currentLayerName?: string;
    villages?: { name: string; code: string; taluk: string; count: number }[];
    totalVillages?: number;
    taluks?: string[];
    selectedVillageFilter?: string | null;
  } | null>(null);
  const [isDroppedLayerVisible, setIsDroppedLayerVisible] = useState(true);
  const [droppedFileWarning, setDroppedFileWarning] = useState<string | null>(null);
  const [isVillageListExpanded, setIsVillageListExpanded] = useState(false);

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

  // Handle outside click to close dropdowns and search panel on free space
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Close search & filter panel when clicking on free space (outside panel & search button)
      if (
        searchPanelRef.current &&
        !searchPanelRef.current.contains(target) &&
        searchButtonRef.current &&
        !searchButtonRef.current.contains(target)
      ) {
        if (searchOpen || isSidebarOpen) {
          setSearchOpen(false);
          if (isSidebarOpen && onToggleSidebar) {
            onToggleSidebar();
          }
        }
      }

      // Close basemap menu when clicking outside
      if (basemapRef.current && !basemapRef.current.contains(target)) {
        setDropdownOpen(false);
      }

      // Close download menu when clicking outside
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
  }, [searchOpen, isSidebarOpen, onToggleSidebar]);

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
    // Query rendered features across the drawn polygon screen bounding box
    let vFeats: any[] = [];
    let pFeats: any[] = [];
    let cartFeats: any[] = [];
    let dCode = selectedDistrict || '';
    let tCode = selectedTaluk || '';
    let vCode = selectedVillage || '';
    const vCodesList: string[] = multiVillages && multiVillages.length > 0 ? [...multiVillages] : (selectedVillage ? [selectedVillage] : []);

    if (mapRef.current) {
      try {
        const map = mapRef.current;
        const polyBbox = turf.bbox(drawnPoly) as [number, number, number, number];
        const p1 = map.project([polyBbox[0], polyBbox[1]]);
        const p2 = map.project([polyBbox[2], polyBbox[3]]);
        const screenBox: [maplibregl.PointLike, maplibregl.PointLike] = [
          [Math.min(p1.x, p2.x), Math.min(p1.y, p2.y)],
          [Math.max(p1.x, p2.x), Math.max(p1.y, p2.y)],
        ];

        const rendered = map.queryRenderedFeatures(screenBox) || [];
        const seenParcels = new Set<string>();
        const seenVillages = new Set<string>();
        const seenCart = new Set<string>();

        rendered.forEach((feat) => {
          if (!feat.geometry) return;
          const layerId = feat.layer?.id || '';

          let intersects = false;
          try {
            intersects = turf.booleanIntersects(feat.geometry as any, drawnPoly);
          } catch {
            try {
              const pt = turf.point((feat.geometry as any).coordinates?.[0]?.[0] || (feat.geometry as any).coordinates);
              intersects = turf.booleanPointInPolygon(pt, drawnPoly);
            } catch {}
          }
          if (!intersects) return;

          // 1. Water Bodies & Thematic Cart Layers (Rendered on Map)
          if (layerId.startsWith('cart-')) {
            const matchedCartConfig = CART_LAYERS_CONFIG.find((cl) => layerId.includes(cl.id));
            const cId = matchedCartConfig?.id || (layerId.includes('generic_viewer_all_water_bodies') ? 'generic_viewer_all_water_bodies' : 'cart_layer');
            const cName = matchedCartConfig?.title || (cId === 'generic_viewer_all_water_bodies' ? 'Water Bodies' : 'Thematic Layer');
            const cColor = matchedCartConfig?.color || (cId === 'generic_viewer_all_water_bodies' ? '#0284c7' : '#38bdf8');
            const cGeom = matchedCartConfig?.geom_type || (feat.geometry.type.toLowerCase().includes('poly') ? 'polygon' : feat.geometry.type.toLowerCase().includes('point') ? 'point' : 'line');
            const uid = feat.id || feat.properties?.id || feat.properties?.name || feat.properties?.water_body_name || feat.properties?.water_body || JSON.stringify(feat.geometry);

            if (!seenCart.has(String(uid))) {
              seenCart.add(String(uid));
              cartFeats.push({
                type: 'Feature',
                properties: {
                  ...feat.properties,
                  _clip_layer_id: cId,
                  _clip_layer_title: cName,
                  _clip_layer_color: cColor,
                  _clip_geom_type: cGeom,
                  layer_name: cName,
                },
                geometry: feat.geometry,
              });
            }
          }

          // 2. Cadastral / FMB Parcels
          if (
            layerId.startsWith('cadastral-pmtiles') ||
            layerId.startsWith('parcel-') ||
            layerId === 'village-fill' ||
            layerId === 'village-outline'
          ) {
            const uid = feat.id || feat.properties?.survey_no || feat.properties?.sno || feat.properties?.gid || JSON.stringify(feat.geometry);
            if (!seenParcels.has(String(uid))) {
              seenParcels.add(String(uid));
              pFeats.push({
                type: 'Feature',
                properties: { ...feat.properties, layer_name: 'FMB_Subdivisions' },
                geometry: feat.geometry,
              });
            }
          }

          // 3. Village Boundary
          if (
            layerId.startsWith('auto-zoom-village') ||
            layerId === 'village-base-outline' ||
            layerId === 'village-outline'
          ) {
            const code = feat.properties?.code || feat.properties?.village_code || feat.properties?.lgd_villag || feat.properties?.vill_name;
            const uid = code || JSON.stringify(feat.geometry);
            if (code && !vCodesList.includes(String(code))) {
              vCodesList.push(String(code));
            }
            if (!vCode && code) vCode = String(code);
            if (!dCode && feat.properties?.district_code) dCode = String(feat.properties.district_code);
            if (!tCode && feat.properties?.taluk_code) tCode = String(feat.properties.taluk_code);

            if (!seenVillages.has(String(uid))) {
              seenVillages.add(String(uid));
              vFeats.push({
                type: 'Feature',
                properties: { ...feat.properties, layer_name: 'Village_Boundary' },
                geometry: feat.geometry,
              });
            }
          }
        });
      } catch (err) {
        console.warn('Error querying rendered features for drawn polygon:', err);
      }
    }

    if (activeLayers.village?.geojson?.features) {
      activeLayers.village.geojson.features.forEach((f) => {
        try {
          if (turf.booleanIntersects(f.geometry as any, drawnPoly)) vFeats.push(f);
        } catch {}
      });
    }
    if (activeLayers.parcel?.geojson?.features) {
      activeLayers.parcel.geojson.features.forEach((f) => {
        try {
          if (turf.booleanIntersects(f.geometry as any, drawnPoly)) pFeats.push(f);
        } catch {}
      });
    }

    const vLayer = vFeats.length > 0 ? ({ id: 'village', level: 'village', geojson: { type: 'FeatureCollection', features: vFeats } } as unknown as ActiveGisLayer) : activeLayers.village;
    const pLayer = pFeats.length > 0 ? ({ id: 'parcel', level: 'parcel', geojson: { type: 'FeatureCollection', features: pFeats } } as unknown as ActiveGisLayer) : activeLayers.parcel;

    setClippedVillageLayer(vLayer);
    setClippedParcelLayer(pLayer);
    setClippedDistrictCode(dCode);
    setClippedTalukCode(tCode);
    setClippedVillageCode(vCode);
    setClippedVillageCodes(vCodesList);
    setActiveClipPolygon(drawnPoly);

    // ── Step 1: Build initial counts from client-rendered features immediately ──
    const initialCounts: Record<string, number> = {};
    if (vFeats.length > 0) {
      initialCounts.village_vector = vFeats.length;
      initialCounts.village_boundary = vFeats.length;
    }
    if (pFeats.length > 0) {
      initialCounts.village_fmb = pFeats.length;
      initialCounts.fmb_parcels = pFeats.length;
    }
    cartFeats.forEach((f) => {
      const lid = f.properties?._clip_layer_id || 'generic_viewer_all_water_bodies';
      initialCounts[lid] = (initialCounts[lid] || 0) + 1;
    });

    const initialFeatures = [...cartFeats, ...pFeats, ...vFeats];
    const initialFC = { type: 'FeatureCollection', features: initialFeatures };

    // ── Step 2: Open modal IMMEDIATELY with whatever we have from the map ──────
    setClippedPreviewGeoJSON(initialFC);
    setClippedPreviewCounts(initialCounts);
    setClippedFeaturesList(initialFeatures);
    setPolygonEmptyWarning(null);
    setIsClipModalOpen(true);

    // ── Step 3: Fetch richer data from backend and update modal in background ──
    const enrichClipData = async () => {
      const requestedLayerIds = [
        'generic_viewer_all_water_bodies',
        'village_vector',
        'village_fmb',
        ...CART_LAYERS_CONFIG.map((l) => l.id),
      ];

      let previewGeoJSON: any = null;
      let previewCounts: Record<string, number> = {};

      try {
        const vCodes = (vCodesList && vCodesList.length > 0)
          ? vCodesList
          : (selectedVillage ? [selectedVillage] : []);

        const res = await fetch(apiUrl('/api/spatial/clip/preview'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clip_polygon: drawnPoly,
            layer_ids: requestedLayerIds,
            village_geojson: vLayer?.geojson || activeLayers.village?.geojson || null,
            parcel_geojson: pLayer?.geojson || activeLayers.parcel?.geojson || null,
            district_code: dCode || selectedDistrict || '',
            taluk_code: tCode || selectedTaluk || '',
            village_code: vCode || selectedVillage || '',
            village_codes: vCodes,
            file_type: layerType || 'fmb',
          }),
        });

        if (res.ok) {
          const data = await res.json();
          previewCounts = data.counts || {};
          if (data.geojson?.features?.length > 0) {
            previewGeoJSON = data.geojson;
          }
        }
      } catch (err) {
        console.warn('API spatial clip preview request failed, using client-extracted features:', err);
        return; // Keep the initial client data as-is
      }

      // Merge server + client features
      const combinedFeatures: any[] = [];
      const seenCombined = new Set<string>();

      if (previewGeoJSON?.features) {
        previewGeoJSON.features.forEach((f: any) => {
          const uid = f.properties?.id || f.properties?.name || f.properties?.survey_no || f.properties?.water_body_name || JSON.stringify(f.geometry);
          if (!seenCombined.has(String(uid))) {
            seenCombined.add(String(uid));
            combinedFeatures.push(f);
          }
        });
      }

      initialFeatures.forEach((f: any) => {
        const uid = f.properties?.id || f.properties?.name || f.properties?.survey_no || f.properties?.water_body_name || JSON.stringify(f.geometry);
        if (!seenCombined.has(String(uid))) {
          seenCombined.add(String(uid));
          combinedFeatures.push(f);
        }
      });

      // Merge counts: prefer server counts but keep client counts for layers server missed
      const mergedCounts = { ...initialCounts };
      Object.entries(previewCounts).forEach(([k, v]) => {
        if ((v as number) > 0) mergedCounts[k] = v as number;
      });
      const waterClientCount = cartFeats.filter((f) => f.properties?._clip_layer_id === 'generic_viewer_all_water_bodies').length;
      if (waterClientCount > (mergedCounts.generic_viewer_all_water_bodies || 0)) {
        mergedCounts.generic_viewer_all_water_bodies = waterClientCount;
      }

      // Update modal with richer data
      const enrichedFC = { type: 'FeatureCollection', features: combinedFeatures };
      setClippedPreviewGeoJSON(enrichedFC);
      setClippedPreviewCounts(mergedCounts);
      setClippedFeaturesList(combinedFeatures);

      const exportFeatures = combinedFeatures.length > 0 ? combinedFeatures : [drawnFeature];
      const updatedResult: ExtractedLayerResult = {
        geojson: { type: 'FeatureCollection', features: exportFeatures },
        featureCount: exportFeatures.length,
        totalAreaAcres: areaAcres,
        totalAreaSqMeters: Math.round(areaSqM),
        layerLevels: ['parcel'],
        polygonGeojson: drawnPoly,
        featureNames: [
          polyName,
          ...combinedFeatures.slice(0, 10).map((f: any) => f.properties?.name || f.properties?.water_body_name || f.properties?.survey_no || 'Feature'),
        ],
      };
      setExtractedResult(updatedResult);
      onPolygonExtracted?.(updatedResult);
    };

    enrichClipData();

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
    setActiveClipPolygon(null);
    setShowDownloadCard(false);
    setClippedPreviewGeoJSON(null);
    setClippedPreviewCounts({});
    setClippedFeaturesList([]);
    setClippedVillageLayer(null);
    setClippedParcelLayer(null);
    setClippedDistrictCode('');
    setClippedTalukCode('');
    setClippedVillageCode('');
    setClippedVillageCodes([]);
    setIsClipModalOpen(false);
    setPolygonEmptyWarning(null);
    onPolygonExtracted?.(null);
    if (mapRef.current) {
      const drawSrc = mapRef.current.getSource('drawn-polygon-source') as maplibregl.GeoJSONSource;
      if (drawSrc) drawSrc.setData({ type: 'FeatureCollection', features: [] });
      const extSrc = mapRef.current.getSource('extracted-features-source') as maplibregl.GeoJSONSource;
      if (extSrc) extSrc.setData({ type: 'FeatureCollection', features: [] });
      const clipSrc = mapRef.current.getSource('clipped-preview-source') as maplibregl.GeoJSONSource;
      if (clipSrc) clipSrc.setData({ type: 'FeatureCollection', features: [] });
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

      if (e.key === 'Escape') {
        if (popupRef.current) {
          popupRef.current.remove();
          activePopupLayerRef.current = null;
          activePopupParcelKeyRef.current = null;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [finishDrawingPolygon, handleUndoPoint, handleClearDraw]);

  // ─── Drag & Drop Georeferenced GeoJSON Overlay Handlers ───────────────────
  const handleRemoveDroppedLayer = useCallback(() => {
    setDroppedLayerData(null);
    setDroppedLayerInfo(null);
    setIsVillageListExpanded(false);
    if (mapRef.current) {
      const src = mapRef.current.getSource('user-dropped-geojson-source') as maplibregl.GeoJSONSource;
      if (src) {
        src.setData({ type: 'FeatureCollection', features: [] });
      }
      if (popupRef.current) {
        popupRef.current.remove();
      }
    }
  }, []);

  const handleZoomToDroppedLayer = useCallback(() => {
    if (!droppedLayerInfo?.bbox || !mapRef.current) return;
    mapRef.current.fitBounds(droppedLayerInfo.bbox as any, {
      padding: { top: 80, bottom: 80, left: 80, right: 80 },
      maxZoom: 18,
      duration: 1000,
    });
  }, [droppedLayerInfo]);

  const handleSwitchGpkgLayer = useCallback((layerName: string) => {
    if (!droppedLayerInfo?.layers || !droppedLayerInfo.layers[layerName]) return;
    const layer = droppedLayerInfo.layers[layerName];
    setDroppedLayerData(layer.geojson);
    setDroppedLayerInfo((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        currentLayerName: layerName,
        featureCount: layer.featureCount,
        geomTypes: layer.geomTypes || [],
        areaAcres: layer.areaAcres,
        bbox: layer.bbox,
        districtName: layer.districts?.map((d: any) => d.name).join(', ') || prev.districtName,
        districtCode: layer.districts?.map((d: any) => d.code).filter(Boolean).join(', ') || prev.districtCode,
        talukName: layer.taluks?.join(', ') || prev.talukName,
        taluks: layer.taluks || prev.taluks,
        villages: layer.villages || [],
        totalVillages: layer.totalVillages || layer.villages?.length || 0,
        villageName: layer.villages?.length === 1 ? layer.villages[0].name : (layer.totalVillages ? `${layer.totalVillages} Villages` : ''),
        villageCode: layer.villages?.length === 1 ? layer.villages[0].code : '',
        selectedVillageFilter: null,
      };
    });

    if (mapRef.current) {
      const src = mapRef.current.getSource('user-dropped-geojson-source') as maplibregl.GeoJSONSource;
      if (src) {
        src.setData(layer.geojson);
      }
      if (layer.bbox) {
        mapRef.current.fitBounds(layer.bbox as any, {
          padding: { top: 80, bottom: 80, left: 80, right: 80 },
          maxZoom: 18,
          duration: 1000,
        });
      }
    }
  }, [droppedLayerInfo]);

  const handleFilterGpkgVillage = useCallback((villageCode: string | null) => {
    if (!droppedLayerInfo?.layers || !droppedLayerInfo.currentLayerName) return;
    const curLayer = droppedLayerInfo.layers[droppedLayerInfo.currentLayerName];
    if (!curLayer || !curLayer.geojson) return;

    if (!villageCode) {
      setDroppedLayerInfo((prev) => prev ? { ...prev, selectedVillageFilter: null } : null);
      if (mapRef.current) {
        const src = mapRef.current.getSource('user-dropped-geojson-source') as maplibregl.GeoJSONSource;
        if (src) src.setData(curLayer.geojson);
        if (curLayer.bbox) {
          mapRef.current.fitBounds(curLayer.bbox as any, {
            padding: { top: 80, bottom: 80, left: 80, right: 80 },
            maxZoom: 18,
            duration: 900,
          });
        }
      }
      return;
    }

    const filteredFeatures = (curLayer.geojson.features || []).filter((f: any) => {
      const p = f.properties || {};
      const c = String(p.village_code || p.vill_code || p.code || '').trim();
      const n = String(p.village || p.village_name || p.vill_name || '').trim();
      return c === villageCode || n === villageCode;
    });

    const filteredGeojson = {
      type: 'FeatureCollection',
      features: filteredFeatures,
    };

    setDroppedLayerInfo((prev) => prev ? { ...prev, selectedVillageFilter: villageCode } : null);

    if (mapRef.current) {
      const src = mapRef.current.getSource('user-dropped-geojson-source') as maplibregl.GeoJSONSource;
      if (src) src.setData(filteredGeojson as any);
      try {
        const bbox = turf.bbox(filteredGeojson as any) as [number, number, number, number];
        if (bbox && bbox.length === 4 && isFinite(bbox[0])) {
          mapRef.current.fitBounds(bbox, {
            padding: { top: 90, bottom: 90, left: 90, right: 90 },
            maxZoom: 18,
            duration: 900,
          });
        }
      } catch {}
    }
  }, [droppedLayerInfo]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isUploadModeRef.current) {
      e.dataTransfer.dropEffect = 'copy';
    } else {
      e.dataTransfer.dropEffect = 'none';
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isUploadModeRef.current) {
      setIsDraggingFile(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingFile(false);
  }, []);

  const processLayerFiles = useCallback((files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const gpkgFile = fileList.find((f) => f.name.toLowerCase().endsWith('.gpkg'));
    const shpFile = fileList.find((f) => f.name.toLowerCase().endsWith('.shp'));
    const geojsonFile = fileList.find(
      (f) => f.name.toLowerCase().endsWith('.geojson') || f.name.toLowerCase().endsWith('.json')
    );

    if (!gpkgFile && !shpFile && !geojsonFile) {
      setDroppedFileWarning("Please drop a valid .geojson, .json, .shp, or .gpkg file.");
      setTimeout(() => setDroppedFileWarning(null), 4500);
      return;
    }

    if (gpkgFile) {
      setDroppedFileWarning("Processing GeoPackage (.gpkg)... Extracting vector plots & reprojecting coordinates.");
      const uploadAndProcessGpkg = async () => {
        try {
          const endpointsToTry: string[] = [];
          if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
            endpointsToTry.push('http://127.0.0.1:8000/api/spatial/convert-gpkg');
            endpointsToTry.push('/api/spatial/convert-gpkg');
          } else {
            endpointsToTry.push(apiUrl('/api/spatial/convert-gpkg'));
            endpointsToTry.push('/api/spatial/convert-gpkg');
          }

          let response: Response | null = null;
          let lastErr: any = null;

          for (const endpoint of endpointsToTry) {
            try {
              const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: gpkgFile,
              });
              if (res.ok) {
                response = res;
                break;
              } else if (res.status === 403 || res.status === 404 || res.status === 502) {
                lastErr = new Error(`Server responded with ${res.status}`);
                continue;
              } else {
                response = res;
                break;
              }
            } catch (fetchErr) {
              lastErr = fetchErr;
            }
          }

          if (!response || !response.ok) {
            const errJson = response ? await response.json().catch(() => ({})) : {};
            throw new Error(errJson.error || lastErr?.message || (response ? `Server responded with ${response.status}` : 'Unable to connect to conversion server'));
          }

          const data = await response.json();
          if (!data.success || !data.layers || Object.keys(data.layers).length === 0) {
            throw new Error(data.error || 'No vector layers found in GeoPackage.');
          }

          const defaultLayerName = data.defaultLayer || Object.keys(data.layers)[0];
          const curLayer = data.layers[defaultLayerName];
          if (!curLayer || !curLayer.geojson) {
            throw new Error('Layer data missing in GeoPackage conversion.');
          }

          // Tamil Nadu boundary overlap validation
          const [minLng, minLat, maxLng, maxLat] = curLayer.bbox || [76.15, 8.05, 80.35, 13.55];
          const overlapsTN = maxLng >= 76.15 && minLng <= 80.35 && maxLat >= 8.05 && minLat <= 13.55;
          if (!overlapsTN) {
            setDroppedFileWarning("The dropped GeoPackage is outside Tamil Nadu boundary. Only Tamil Nadu georeferenced layers are supported.");
            setTimeout(() => setDroppedFileWarning(null), 5500);
            return;
          }

          setDroppedFileWarning(null);
          setDroppedLayerData(curLayer.geojson);
          setDroppedLayerInfo({
            fileName: gpkgFile.name,
            featureCount: curLayer.featureCount,
            geomTypes: curLayer.geomTypes || [],
            areaAcres: curLayer.areaAcres,
            bbox: curLayer.bbox,
            districtName: curLayer.districts?.map((d: any) => d.name).join(', ') || '',
            districtCode: curLayer.districts?.map((d: any) => d.code).filter(Boolean).join(', ') || '',
            talukName: curLayer.taluks?.join(', ') || '',
            talukCode: '',
            villageName: curLayer.villages?.length === 1 ? curLayer.villages[0].name : (curLayer.totalVillages ? `${curLayer.totalVillages} Villages` : ''),
            villageCode: curLayer.villages?.length === 1 ? curLayer.villages[0].code : '',
            layers: data.layers,
            layerNames: data.layerNames || Object.keys(data.layers),
            currentLayerName: defaultLayerName,
            villages: curLayer.villages || [],
            totalVillages: curLayer.totalVillages || curLayer.villages?.length || 0,
            taluks: curLayer.taluks || [],
            selectedVillageFilter: null,
          });
          setIsDroppedLayerVisible(true);

          if (mapRef.current) {
            const src = mapRef.current.getSource('user-dropped-geojson-source') as maplibregl.GeoJSONSource;
            if (src) {
              src.setData(curLayer.geojson);
            }
            if (curLayer.bbox) {
              mapRef.current.fitBounds(curLayer.bbox as any, {
                padding: { top: 80, bottom: 80, left: 80, right: 80 },
                maxZoom: 18,
                duration: 1200,
              });
            }
          }
        } catch (err: any) {
          setDroppedFileWarning(`Failed to parse GeoPackage (.gpkg): ${err.message || 'Unknown error'}`);
          setTimeout(() => setDroppedFileWarning(null), 6000);
        }
      };
      uploadAndProcessGpkg();
      return;
    }

    const processFeatureCollection = (fc: any, fileName: string, detectedGeomTypes?: string[]) => {
      // Calculate bounding box using Turf
      const bbox = turf.bbox(fc); // [minLng, minLat, maxLng, maxLat]
      const [minLng, minLat, maxLng, maxLat] = bbox;

      // Tamil Nadu boundary overlap validation:
      // Tamil Nadu bounds: Lng [76.15, 80.35], Lat [8.05, 13.55]
      const overlapsTN = maxLng >= 76.15 && minLng <= 80.35 && maxLat >= 8.05 && minLat <= 13.55;

      if (!overlapsTN) {
        setDroppedFileWarning("The dropped file is outside Tamil Nadu boundary. Only Tamil Nadu georeferenced layers are supported.");
        setTimeout(() => setDroppedFileWarning(null), 5500);
        return;
      }

      // Identify geometry types
      const types = new Set<string>(detectedGeomTypes || []);
      fc.features.forEach((f: any) => {
        if (f.geometry?.type) types.add(f.geometry.type);
      });

      // Compute area or length if applicable
      let areaAcres: number | undefined;
      let lengthKm: number | undefined;
      try {
        if (types.has('Polygon') || types.has('MultiPolygon')) {
          const areaM2 = turf.area(fc);
          areaAcres = Math.round(areaM2 * 0.000247105 * 100) / 100;
        }
        if (types.has('LineString') || types.has('MultiLineString')) {
          const len = turf.length(fc, { units: 'kilometers' });
          lengthKm = Math.round(len * 100) / 100;
        }
      } catch {
        // Ignore calculation errors on broken geometries
      }

      // Detect District, Taluk, Village Name & Code
      let detectedDistrictName = '';
      let detectedDistrictCode = '';
      let detectedTalukName = '';
      let detectedTalukCode = '';
      let detectedVillageName = '';
      let detectedVillageCode = '';

      // 1. Inspect properties of features in dropped file
      for (const f of fc.features) {
        const p = f.properties || {};
        if (!detectedDistrictName) {
          detectedDistrictName = String(p.district_name || p.dist_name || p.DIST_NAME || p.district || p.dt_name || '').trim();
        }
        if (!detectedDistrictCode) {
          const rawDCode = p.district_code ?? p.district_c ?? p.DISTRICT_C ?? p.dist_code ?? p.dt_code;
          if (rawDCode !== undefined && rawDCode !== null && rawDCode !== '') {
            detectedDistrictCode = String(rawDCode).padStart(2, '0');
          }
        }
        if (!detectedTalukName) {
          detectedTalukName = String(p.taluk_name || p.talukname || p.TALUKNAME || p.taluk || p.th_name || '').trim();
        }
        if (!detectedTalukCode) {
          const rawTCode = p.taluk_code ?? p.taluk_c ?? p.TALUK_CODE ?? p.th_code;
          if (rawTCode !== undefined && rawTCode !== null && rawTCode !== '') {
            detectedTalukCode = String(rawTCode).padStart(2, '0');
          }
        }
        if (!detectedVillageName) {
          detectedVillageName = String(p.village_name || p.vill_name || p.VILL_NAME || p.village || p.vl_name || p.name || '').trim();
        }
        if (!detectedVillageCode) {
          const rawVCode = p.village_code ?? p.vill_code ?? p.VILL_CODE ?? p.lgd_villag ?? p.code;
          if (rawVCode !== undefined && rawVCode !== null && rawVCode !== '') {
            detectedVillageCode = String(rawVCode);
          }
        }
        if (detectedDistrictName && detectedDistrictCode && detectedTalukName && detectedTalukCode && detectedVillageName && detectedVillageCode) {
          break;
        }
      }

      // Calculate layer centroid
      let centerPoint: any;
      try {
        centerPoint = turf.center(fc);
      } catch {
        centerPoint = turf.point([(minLng + maxLng) / 2, (minLat + maxLat) / 2]);
      }
      const [cLng, cLat] = centerPoint.geometry.coordinates;

      // 2. Spatial lookup from MapLibre loaded district features
      if (!detectedDistrictName && mapRef.current) {
        try {
          const distFeats = mapRef.current.querySourceFeatures('auto-zoom-district-source') as any[];
          if (distFeats && distFeats.length > 0) {
            for (const df of distFeats) {
              if (df.geometry && turf.booleanPointInPolygon(centerPoint, df)) {
                detectedDistrictName = String(df.properties?.dist_name || df.properties?.district_name || '');
                const c = df.properties?.district_c ?? df.properties?.district_code;
                if (c) detectedDistrictCode = String(c).padStart(2, '0');
                break;
              }
            }
          }
        } catch {}
      }

      // 3. Fallback to nearest district centroid from DISTRICT_CENTROIDS
      if (!detectedDistrictName && DISTRICT_CENTROIDS?.features) {
        let minDist = Infinity;
        let nearestFeat: any = null;
        for (const feat of DISTRICT_CENTROIDS.features) {
          const coords = feat.geometry?.coordinates;
          if (coords && coords.length >= 2) {
            const d = Math.hypot(coords[0] - cLng, coords[1] - cLat);
            if (d < minDist) {
              minDist = d;
              nearestFeat = feat;
            }
          }
        }
        if (nearestFeat) {
          detectedDistrictName = nearestFeat.properties?.district_name || nearestFeat.properties?.dist_name || '';
          const c = nearestFeat.properties?.district_code ?? nearestFeat.properties?.code;
          if (c) detectedDistrictCode = String(c).padStart(2, '0');
        }
      }

      setDroppedFileWarning(null);
      setDroppedLayerData(fc);
      setDroppedLayerInfo({
        fileName,
        featureCount: fc.features.length,
        geomTypes: Array.from(types),
        areaAcres,
        lengthKm,
        bbox: [minLng, minLat, maxLng, maxLat],
        districtName: detectedDistrictName,
        districtCode: detectedDistrictCode,
        talukName: detectedTalukName,
        talukCode: detectedTalukCode,
        villageName: detectedVillageName,
        villageCode: detectedVillageCode,
      });
      setIsDroppedLayerVisible(true);

      // 4. Query backend spatial resolver to resolve/refine Taluk & Village names & codes
      const resolveLocationAsync = async () => {
        try {
          const res = await fetch(apiUrl(`/api/spatial/resolve?lat=${cLat}&lng=${cLng}&zoom=14`));
          if (res.ok) {
            const data = await res.json();
            if (data && data.success) {
              setDroppedLayerInfo((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  districtName: prev.districtName || data.district_name || '',
                  districtCode: prev.districtCode || (data.district_code ? String(data.district_code).padStart(2, '0') : ''),
                  talukName: prev.talukName || data.taluk_name || '',
                  talukCode: prev.talukCode || (data.taluk_code && data.taluk_code !== '*' ? String(data.taluk_code).padStart(2, '0') : (data.taluk_code === '*' ? 'N/A' : '')),
                  villageName: prev.villageName || data.village_name || '',
                  villageCode: prev.villageCode || data.village_code || '',
                };
              });
            }
          }
        } catch (err) {
          console.warn('Spatial resolution error for dropped layer:', err);
        }
      };
      resolveLocationAsync();

      if (mapRef.current) {
        const src = mapRef.current.getSource('user-dropped-geojson-source') as maplibregl.GeoJSONSource;
        if (src) {
          src.setData(fc);
        }
        mapRef.current.fitBounds([minLng, minLat, maxLng, maxLat] as any, {
          padding: { top: 80, bottom: 80, left: 80, right: 80 },
          maxZoom: 18,
          duration: 1200,
        });
      }
    };

    if (shpFile) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const buf = event.target?.result as ArrayBuffer;
          if (!buf) return;
          const { geojson, geomTypes } = parseShpBuffer(buf);
          if (!geojson.features || geojson.features.length === 0) {
            setDroppedFileWarning("Shapefile (.shp) contains 0 valid geometries.");
            setTimeout(() => setDroppedFileWarning(null), 4500);
            return;
          }
          processFeatureCollection(geojson, shpFile.name, geomTypes);
        } catch (err: any) {
          setDroppedFileWarning("Failed to parse Shapefile: " + (err?.message || "Invalid .shp binary"));
          setTimeout(() => setDroppedFileWarning(null), 4500);
        }
      };
      reader.readAsArrayBuffer(shpFile);
    } else if (geojsonFile) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          if (!text) return;
          const parsed = JSON.parse(text);

          // Normalize to FeatureCollection
          let fc: any = null;
          if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
            fc = parsed;
          } else if (parsed.type === 'Feature') {
            fc = { type: 'FeatureCollection', features: [parsed] };
          } else if (parsed.type && parsed.coordinates) {
            fc = {
              type: 'FeatureCollection',
              features: [{ type: 'Feature', properties: {}, geometry: parsed }],
            };
          } else {
            setDroppedFileWarning("Invalid GeoJSON structure: no features found.");
            setTimeout(() => setDroppedFileWarning(null), 4500);
            return;
          }

          if (fc.features.length === 0) {
            setDroppedFileWarning("GeoJSON file contains 0 features.");
            setTimeout(() => setDroppedFileWarning(null), 4500);
            return;
          }

          processFeatureCollection(fc, geojsonFile.name);
        } catch (err: any) {
          setDroppedFileWarning("Failed to parse GeoJSON file: " + (err?.message || "Invalid JSON"));
          setTimeout(() => setDroppedFileWarning(null), 4500);
        }
      };
      reader.readAsText(geojsonFile);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);

    if (!isUploadModeRef.current) {
      setDroppedFileWarning("Upload Mode is OFF. Click the 📤 Upload icon in the right dock to turn it ON before dragging and dropping layers.");
      setTimeout(() => setDroppedFileWarning(null), 5000);
      return;
    }

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    processLayerFiles(files);
  }, [processLayerFiles]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processLayerFiles(files);
      e.target.value = '';
    }
  }, [processLayerFiles]);

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
          maxzoom: 18,
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
          maxzoom: 18,
          attribution: '© Google Maps',
        },
        'source-esri-satellite': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          maxzoom: 18,
          attribution: 'Esri, Maxar, Earthstar Geographics',
        },
        'source-esri-topo': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          maxzoom: 18,
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
        'user-dropped-geojson-source': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        'auto-zoom-district-source': { type: 'geojson', data: preloadedLayers?.districtGeoJson || apiUrl('/api/auto-zoom-layer?level=district') },
        'auto-zoom-district-label-source': { type: 'geojson', data: DISTRICT_CENTROIDS },
        'auto-zoom-taluk-source': { type: 'geojson', data: preloadedLayers?.talukGeoJson || apiUrl('/api/auto-zoom-layer?level=taluk') },
        'auto-zoom-village-source': { type: 'geojson', data: preloadedLayers?.villageGeoJson || apiUrl('/api/auto-zoom-layer?level=village') },
      },
      layers: [
        {
          id: 'basemap-street-view',
          type: 'raster',
          source: 'source-street-view',
          minzoom: 0,
          maxzoom: 24,
          layout: { visibility: 'none' },
        },
        {
          id: 'basemap-google-hybrid',
          type: 'raster',
          source: 'source-google-hybrid',
          minzoom: 0,
          maxzoom: 24,
          layout: { visibility: 'visible' },
        },
        {
          id: 'basemap-esri-satellite',
          type: 'raster',
          source: 'source-esri-satellite',
          minzoom: 0,
          maxzoom: 24,
          layout: { visibility: 'none' },
        },
        {
          id: 'basemap-esri-topo',
          type: 'raster',
          source: 'source-esri-topo',
          minzoom: 0,
          maxzoom: 24,
          layout: { visibility: 'none' },
        },
        // Automatic Zoom-Based Background Display Layers (Hierarchical: District -> Taluk -> Village -> Cadastral)
        // 1. Transparent District Fill for viewport hit detection
        {
          id: 'auto-zoom-district-fill',
          type: 'fill',
          source: 'auto-zoom-district-source',
          paint: { 'fill-color': '#facc15', 'fill-opacity': 0 },
        },
        // 2. Village Outlines (Drawn first so taluk and district boundaries sit ON TOP; starts from 5km scale)
        {
          id: 'auto-zoom-village-outline',
          type: 'line',
          source: 'auto-zoom-village-source',
          minzoom: 10.8,
          maxzoom: 24.0,
          paint: {
            'line-color': '#06b6d4',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10.8, 1.6,
              13.0, 2.4,
              16.0, 3.4
            ],
            'line-opacity': 1.0,
          },
        },
        // 2b. Selected Village Highlight in Bright Yellow (#facc15) per user request
        {
          id: 'auto-zoom-village-selected-casing',
          type: 'line',
          source: 'auto-zoom-village-source',
          minzoom: 9.0,
          maxzoom: 24.0,
          filter: ['==', ['to-string', ['get', 'code']], '__none__'],
          paint: {
            'line-color': '#0f172a',
            'line-width': 7.0,
            'line-opacity': 0.8,
          },
        },
        {
          id: 'auto-zoom-village-selected-outline',
          type: 'line',
          source: 'auto-zoom-village-source',
          minzoom: 9.0,
          maxzoom: 24.0,
          filter: ['==', ['to-string', ['get', 'code']], '__none__'],
          paint: {
            'line-color': '#facc15', // Vibrant Yellow for selected village
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              9.0, 3.2,
              12.0, 4.2,
              14.0, 5.0,
              16.0, 6.0,
              18.0, 7.5
            ],
            'line-opacity': 1.0,
          },
        },
        // 3. Taluk Outlines (Drawn second: purple, sits on top of village outlines; starts from 10km scale)
        {
          id: 'auto-zoom-taluk-outline',
          type: 'line',
          source: 'auto-zoom-taluk-source',
          minzoom: 9.2,
          maxzoom: 24.0,
          paint: {
            'line-color': '#9333ea',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              9.2, 1.8,
              12.0, 2.8,
              15.0, 3.8
            ],
            'line-opacity': 1.0,
          },
        },
        // 4. District Outlines Casing (Dark outline underlay to guarantee high contrast against satellite imagery & purple taluk lines)
        {
          id: 'auto-zoom-district-casing',
          type: 'line',
          source: 'auto-zoom-district-source',
          minzoom: 0,
          maxzoom: 24.0,
          paint: {
            'line-color': '#0f172a',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0, 3.8,
              8.0, 5.2,
              11.0, 6.8,
              14.0, 8.2,
              18.0, 10.0
            ],
            'line-opacity': 0.85,
          },
        },
        // 5. District Outlines (Drawn on top of taluk & village: ALWAYS BRIGHT YELLOW #facc15 across all zoom levels 0-24)
        {
          id: 'auto-zoom-district-outline',
          type: 'line',
          source: 'auto-zoom-district-source',
          minzoom: 0,
          maxzoom: 24.0,
          paint: {
            'line-color': '#facc15',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              0, 2.4,
              8.0, 3.6,
              11.0, 4.8,
              14.0, 6.0,
              18.0, 7.5
            ],
            'line-opacity': 1.0,
          },
        },
        // 5. Taluk Name Labels (Zoom 9.2 to 24.0 from 10km scale)
        {
          id: 'auto-zoom-taluk-labels',
          type: 'symbol',
          source: 'auto-zoom-taluk-source',
          minzoom: 9.2,
          maxzoom: 24.0,
          layout: {
            'text-field': [
              'coalesce',
              ['get', 'talukname'],
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
        // 6. Village Name Labels (Zoom 10.8 to 24.0 from 5km scale)
        {
          id: 'auto-zoom-village-labels',
          type: 'symbol',
          source: 'auto-zoom-village-source',
          minzoom: 10.8,
          maxzoom: 24.0,
          layout: {
            'text-field': [
              'coalesce',
              ['get', 'v'],
              ['get', 'vill_name'],
              ['get', 'village_name'],
              ['get', 'village'],
              ['get', 'vtname'],
              ['get', 'lgd_villag'],
              ['get', 'name'],
              ['get', 'NAME_3'],
              ['get', 'VILLAGE'],
              ['get', 'VIL_NAME'],
              ['get', 'Village_Nam'],
              ''
            ],
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': 11.0,
            'text-transform': 'uppercase',
            'text-allow-overlap': false,
            'text-ignore-placement': false,
            'text-padding': 24,
          },
          paint: {
            'text-color': '#0891b2',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2,
          },
        },
        // District Layer
        {
          id: 'district-fill',
          type: 'fill',
          source: 'district-source',
          paint: { 'fill-color': '#facc15', 'fill-opacity': 0 },
        },
        {
          id: 'district-casing',
          type: 'line',
          source: 'district-source',
          paint: {
            'line-color': '#0f172a',
            'line-width': 7.0,
            'line-opacity': 0.85,
          },
        },
        {
          id: 'district-outline',
          type: 'line',
          source: 'district-source',
          paint: { 'line-color': '#facc15', 'line-width': 4.5, 'line-opacity': 1.0 },
        },
        {
          id: 'district-labels',
          type: 'symbol',
          source: 'district-source',
          minzoom: 0,
          maxzoom: 24.0,
          layout: {
            'text-field': [
              'coalesce',
              ['get', 'district_name'],
              ['get', 'dist_name'],
              ['get', 'DIST_NAME'],
              ['get', 'name'],
              ['get', 'DISTRICT'],
              ['get', 'district'],
              ''
            ],
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Regular'],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4, 11,
              6, 12,
              8, 14,
              10, 16,
              14, 18
            ],
            'text-anchor': 'center',
            'text-transform': 'uppercase',
            'text-letter-spacing': 0.05,
            'text-allow-overlap': false,
            'text-ignore-placement': false,
            'visibility': 'visible',
            'text-padding': 12,
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#0f172a',
            'text-halo-width': 2.5,
            'text-halo-blur': 0.5,
          },
        },
        {
          id: 'auto-zoom-district-labels',
          type: 'symbol',
          source: 'auto-zoom-district-label-source',
          minzoom: 0,
          maxzoom: 24.0,
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
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Regular'],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              5, 10,
              7, 12,
              9, 14,
              11, 16
            ],
            'text-anchor': 'center',
            'text-transform': 'uppercase',
            'visibility': 'visible',
            'text-padding': 12,
            'text-allow-overlap': false,
            'text-ignore-placement': false,
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
          minzoom: 9.2,
          paint: { 'fill-color': '#a855f7', 'fill-opacity': 0 },
        },
        {
          id: 'taluk-outline',
          type: 'line',
          source: 'taluk-source',
          minzoom: 9.2,
          paint: { 'line-color': '#cc00ff', 'line-width': 5, 'line-opacity': 1.0 },
        },
        {
          id: 'taluk-labels',
          type: 'symbol',
          source: 'taluk-source',
          minzoom: 9.2,
          maxzoom: 24.0,
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
        // 1. FMB Subdivision Polygons (Clear / 0 opacity)
        {
          id: 'village-fill',
          type: 'fill',
          source: 'village-source',
          minzoom: 10.8,
          paint: {
            'fill-color': '#22c55e',
            'fill-opacity': 0,
          },
        },
        // 2. FMB Subdivision Internal Lines (Green)
        {
          id: 'village-outline',
          type: 'line',
          source: 'village-source',
          minzoom: 10.8,
          paint: {
            'line-color': '#facc15', // Vibrant Yellow for Selected Village Boundary
            'line-width': 3.5,
            'line-opacity': 1.0,
          },
        },
        // 3. Base Survey Parcel Outer Boundary (Vector Yellow) - Always on TOP
        {
          id: 'village-base-outline',
          type: 'line',
          source: 'village-base-source',
          minzoom: 10.8,
          paint: {
            'line-color': '#facc15', // Vibrant Yellow for Vector Village Layer
            'line-width': 3.5,
            'line-opacity': 1.0,
          },
        },
        {
          id: 'village-labels',
          type: 'symbol',
          source: 'village-source',
          minzoom: 10.8,
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
              11, 10,
              14, 12,
              17, 15
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
        // Parcel Layer (starts from 1km scale)
        {
          id: 'parcel-fill',
          type: 'fill',
          source: 'parcel-source',
          minzoom: 13.2,
          paint: { 'fill-color': '#22c55e', 'fill-opacity': 0 },
        },
        {
          id: 'parcel-outline',
          type: 'line',
          source: 'parcel-source',
          minzoom: 13.2,
          paint: { 'line-color': '#22c55e', 'line-width': 4, 'line-opacity': 1.0 },
        },
        {
          id: 'parcel-labels',
          type: 'symbol',
          source: 'parcel-source',
          minzoom: 13.2,
          layout: {
            'text-field': [
              'coalesce',
              ['get', 'survey_no'],
              ['get', 'SURVEY_NO'],
              ['get', 'sno'],
              ['get', 'sf_no'],
              ['get', 'subdivision'],
              ['get', 'KIDE'],
              ['get', 'code'],
              ['get', 'name'],
              ''
            ],
            'text-font': ['Open Sans Bold'],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              13, 10,
              16, 12,
              19, 15
            ],
            'text-anchor': 'center',
            'text-allow-overlap': false,
            'text-ignore-placement': false,
            'text-padding': 3,
            'visibility': 'visible',
          },
          paint: {
            'text-color': '#fde047',
            'text-halo-color': '#000000',
            'text-halo-width': 2.5,
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
        // User Dropped Custom GeoJSON Layers (Rendered on top of basemap)
        {
          id: 'user-dropped-polygon-fill',
          type: 'fill',
          source: 'user-dropped-geojson-source',
          filter: ['in', '$type', 'Polygon'],
          paint: {
            'fill-color': '#6366f1',
            'fill-opacity': 0.42,
          },
        },
        {
          id: 'user-dropped-polygon-outline',
          type: 'line',
          source: 'user-dropped-geojson-source',
          filter: ['in', '$type', 'Polygon'],
          paint: {
            'line-color': '#4f46e5',
            'line-width': 3.0,
          },
        },
        {
          id: 'user-dropped-linestring',
          type: 'line',
          source: 'user-dropped-geojson-source',
          filter: ['in', '$type', 'LineString'],
          paint: {
            'line-color': '#ec4899',
            'line-width': 3.5,
          },
        },
        {
          id: 'user-dropped-points',
          type: 'circle',
          source: 'user-dropped-geojson-source',
          filter: ['==', '$type', 'Point'],
          paint: {
            'circle-radius': 7.0,
            'circle-color': '#06b6d4',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2.0,
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
      maxZoom: 22.0,
      doubleClickZoom: true,
      maxBounds: TAMIL_NADU_MAX_BOUNDS,
      pitch: is3D ? 45 : 0,
      attributionControl: false,
    });

    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    popupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: true,
      offset: 15,
    });

    popupRef.current.on('close', () => {
      activePopupLayerRef.current = null;
      activePopupParcelKeyRef.current = null;
    });

    (window as any)._closeGisPopup = () => {
      if (popupRef.current) {
        popupRef.current.remove();
        activePopupLayerRef.current = null;
        activePopupParcelKeyRef.current = null;
      }
      setHoveredFeature(null);
    };

    // User-Dropped Custom GeoJSON Feature Click & Hover Inspection
    const droppedLayers = ['user-dropped-polygon-fill', 'user-dropped-linestring', 'user-dropped-points'];
    droppedLayers.forEach((layerId) => {
      map.on('click', layerId, (e) => {
        if (drawModeRef.current !== 'idle') return;
        if (e.originalEvent) {
          (e.originalEvent as any)._gisFeatureClicked = true;
        }
        featureClickedInCurrentEventRef.current = true;
        activePopupLayerRef.current = layerId;

        const feat = e.features?.[0];
        if (!feat) return;
        const props = feat.properties || {};
        const entries = Object.entries(props);

        let tableRows = '';
        if (entries.length > 0) {
          tableRows = entries
            .slice(0, 15)
            .map(([k, v]) => `
              <tr style="border-bottom: 1px solid rgba(148,163,184,0.2);">
                <td style="padding: 4px 8px; font-weight: 600; color: #94a3b8; font-size: 11px;">${k}</td>
                <td style="padding: 4px 8px; color: #f8fafc; font-size: 11px; word-break: break-all;">${String(v)}</td>
              </tr>
            `)
            .join('');
        } else {
          tableRows = `<tr><td colspan="2" style="padding: 8px; color: #94a3b8; font-size: 11px; text-align: center;">No custom properties</td></tr>`;
        }

        const html = `
          <div style="font-family: ui-sans-serif, system-ui, sans-serif; min-width: 200px; max-width: 320px; background: #0f172a; border: 1px solid rgba(56,189,248,0.4); border-radius: 8px; padding: 10px; color: #f8fafc; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid rgba(148,163,184,0.2);">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #06b6d4;"></span>
                <span style="font-size: 12px; font-weight: 700; color: #38bdf8;">Custom GeoJSON Feature</span>
              </div>
              <button onclick="window._closeGisPopup && window._closeGisPopup()" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 14px; line-height: 1;">✕</button>
            </div>
            <div style="max-height: 200px; overflow-y: auto;">
              <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
            </div>
          </div>
        `;

        if (popupRef.current) {
          popupRef.current
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
        }
      });

      map.on('mouseenter', layerId, () => {
        if (drawModeRef.current === 'idle') {
          map.getCanvas().style.cursor = 'pointer';
        }
      });
      map.on('mouseleave', layerId, () => {
        if (drawModeRef.current === 'idle') {
          map.getCanvas().style.cursor = '';
        }
      });
    });

    map.doubleClickZoom.disable();

    // Step-by-Step Level-Based Double-Click / Double-Tap Zoom Handler (10km Taluk -> 3km Village -> 1km Parcel)
    map.on('dblclick', (e) => {
      // Ignore double click if currently drawing a polygon
      if (drawModeRef.current !== 'idle') return;

      const currentZoom = map.getZoom();
      const targetCoords: [number, number] = [e.lngLat.lng, e.lngLat.lat];

      if (currentZoom < 10.2) {
        // 1st Double-Click: Zoom directly to Taluk Level (10km scale)
        map.easeTo({
          center: targetCoords,
          zoom: 10.8,
          duration: 700,
          essential: true,
        });
      } else if (currentZoom < 12.5) {
        // 2nd Double-Click: Zoom directly to Village Level (3km scale)
        map.easeTo({
          center: targetCoords,
          zoom: 12.8,
          duration: 700,
          essential: true,
        });
      } else {
        // 3rd Double-Click: Zoom into Cadastral / Survey Parcel Level (1km scale)
        map.easeTo({
          center: targetCoords,
          zoom: 14.8,
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

        // Keep search popover and sidebar open during user interaction on map
        // (Closing is only triggered by explicit close buttons or user toggle)

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
                maxZoom: lvl === 'parcel' ? 18.2 : lvl === 'village' ? 16.8 : lvl === 'taluk' ? 14.5 : 12.0,
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
      setCurrentMapZoom(map.getZoom());

      const updateHeightAltitude = () => {
        const z = map.getZoom();
        const center = map.getCenter();
        const lat = center ? center.lat : 11.0;
        const containerHeight = map.getContainer()?.clientHeight || 800;
        const metersPerPx = (156543.03 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, z);
        const altKm = (1.5 * containerHeight * metersPerPx) / 1000;
        setMapAltitudeKm(altKm);
      };

      updateHeightAltitude();

      map.on('zoom', () => {
        const z = map.getZoom();
        setCurrentMapZoom(z);
        updateHeightAltitude();

        // 10km scale (z >= 9.8), 5km scale (z >= 10.8), 1km scale (z >= 13.2)
        let currentTier: 'district' | 'taluk' | 'village' | 'cadastral' = 'district';
        if (z >= 13.2) currentTier = 'cadastral';
        else if (z >= 10.8) currentTier = 'village';
        else if (z >= 9.2) currentTier = 'taluk';
        else currentTier = 'district';

        if (currentTier !== lastZoomTierRef.current) {
          lastZoomTierRef.current = currentTier;
          triggerTierBlinkRef.current(currentTier);
        }
      });
      map.on('move', updateHeightAltitude);
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

  // Sync User-Dropped GeoJSON layer visibility
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;
    const vis = isDroppedLayerVisible ? 'visible' : 'none';
    ['user-dropped-polygon-fill', 'user-dropped-polygon-outline', 'user-dropped-linestring', 'user-dropped-points'].forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', vis);
      }
    });
  }, [isDroppedLayerVisible, mapLoaded]);

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
      if (curZoom < 22.0) {
        mapRef.current.zoomIn({ duration: 300 });
      }
    }
  };

  const handleZoomOut = () => {
    if (mapRef.current) mapRef.current.zoomOut({ duration: 300 });
  };

  const handleResetView = () => {
    setHasStartedSearch(false);
    setDownloadOpen(false);
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
          if (lvl === 'village') {
            triggerTierBlinkRef.current('village');
          }
        }
      });
    });
  };

  // Helper to build MapLibre GL expression matching a feature by code, survey_no, name or id
  const buildMatchExpr = (itemCode: string) => {
    if (!itemCode) return false;
    const clean = itemCode.trim();
    const raw = clean.includes('_') ? clean.split('_').pop()! : clean;
    const slashForm = clean.includes('_') ? clean.split('_').slice(3).join('/') : clean;
    const num = parseInt(raw, 10);
    const numCond: any[] = !isNaN(num) ? [['==', ['to-number', ['coalesce', ['get', 'survey_no'], ['get', 'SURVEY_NO'], -99999]], num]] : [];

    return [
      'any',
      ['==', ['to-string', ['coalesce', ['get', 'code'], ['get', 'id'], '']], clean],
      ['==', ['to-string', ['coalesce', ['get', 'code'], ['get', 'id'], '']], raw],
      ['==', ['to-string', ['coalesce', ['get', 'survey_no'], ['get', 'SURVEY_NO'], ['get', 'KIDE'], ['get', 'name'], '']], clean],
      ['==', ['to-string', ['coalesce', ['get', 'survey_no'], ['get', 'SURVEY_NO'], ['get', 'KIDE'], ['get', 'name'], '']], raw],
      ['==', ['to-string', ['coalesce', ['get', 'survey_no'], ['get', 'SURVEY_NO'], ['get', 'KIDE'], ['get', 'name'], '']], slashForm],
      ['==', ['to-string', ['coalesce', ['get', 'village_code'], ['get', 'taluk_code'], ['get', 'district_code'], '']], clean],
      ['==', ['to-string', ['coalesce', ['get', 'village_code'], ['get', 'taluk_code'], ['get', 'district_code'], '']], raw],
      ...numCond,
    ];
  };

  // Helper to match features in auto-zoom-village-source for selected village highlighting
  const buildVillageMatchExpr = (itemCode: string) => {
    if (!itemCode) return false;
    const clean = itemCode.trim();
    const raw = clean.includes('_') ? clean.split('_').pop()! : clean;
    const num = parseInt(raw, 10);
    const numCond: any[] = !isNaN(num) ? [['==', ['to-number', ['coalesce', ['get', 'code'], ['get', 'id'], ['get', 'c'], -99999]], num]] : [];

    return [
      'any',
      ['==', ['to-string', ['coalesce', ['get', 'code'], ['get', 'id'], ['get', 'c'], '']], clean],
      ['==', ['to-string', ['coalesce', ['get', 'code'], ['get', 'id'], ['get', 'c'], '']], raw],
      ['==', ['to-string', ['coalesce', ['get', 'v'], ['get', 'vill_name'], ['get', 'village_name'], ['get', 'village'], ['get', 'vtname'], ['get', 'lgd_villag'], ['get', 'name'], ['get', 'NAME_3'], ['get', 'VILLAGE'], ['get', 'VIL_NAME'], ['get', 'Village_Nam'], '']], clean],
      ['==', ['to-string', ['coalesce', ['get', 'v'], ['get', 'vill_name'], ['get', 'village_name'], ['get', 'village'], ['get', 'vtname'], ['get', 'lgd_villag'], ['get', 'name'], ['get', 'NAME_3'], ['get', 'VILLAGE'], ['get', 'VIL_NAME'], ['get', 'Village_Nam'], '']], raw],
      ...numCond,
    ];
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
            const baseColor = '#facc15'; // Vibrant Yellow for Village Boundary
            const subdivColor = '#facc15'; // Vibrant Yellow for FMB Subdivisions
            const boundaryColor = '#facc15'; // Vibrant Yellow for TN Village Boundaries per user request

            // 1. Sync Base Survey Parcel Outer Boundaries (Yellow Vector Parent Layer, always on top)
            const baseSrc = map.getSource('village-base-source') as maplibregl.GeoJSONSource;
            if (baseSrc) {
              const baseData = layerData.base_geojson || (!isFmbMode ? layerData.geojson : null);
              if (!isTNRevenueVillageBoundary && baseData && baseData.features && baseData.features.length > 0) {
                baseSrc.setData(baseData);
                if (map.getLayer('village-base-outline')) {
                  map.setLayoutProperty('village-base-outline', 'visibility', 'visible');
                  map.setPaintProperty('village-base-outline', 'line-color', '#facc15');
                  map.setPaintProperty('village-base-outline', 'line-width', 3.5);
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

            // 2. Sync Village / FMB Subdivision layer (Clear fill, crisp boundary outlines)
            if (isTNRevenueVillageBoundary) {
              // TN Village Boundaries in Vibrant Yellow (#facc15)
              if (map.getLayer(fillLayer)) {
                map.setLayoutProperty(fillLayer, 'visibility', 'visible');
                map.setPaintProperty(fillLayer, 'fill-color', boundaryColor);
                map.setPaintProperty(fillLayer, 'fill-opacity', 0);
              }
              if (map.getLayer(outlineLayer)) {
                map.setLayoutProperty(outlineLayer, 'visibility', 'visible');
                map.setPaintProperty(outlineLayer, 'line-color', boundaryColor);
                map.setPaintProperty(outlineLayer, 'line-width', 3.5);
              }
            } else {
              const clipSurveyList = selectedClipFeatures.map((f) => {
                const p = f.properties || {};
                return String(p.survey_no || p.SURVEY_NO || p.sno || p.KIDE || p.code || p.name || '').trim();
              }).filter(Boolean);

              const selectedList = [selectedParcel, ...(multiParcels || []), ...clipSurveyList, ...(multiVillages || [])].filter(Boolean) as string[];

              const focusedCode = (focusedItem && (focusedItem.level === 'village' || focusedItem.level === 'parcel') ? focusedItem.code : '') || selectedParcel || (multiVillages.length > 1 ? selectedVillage : '');

              const isFocusedExpr: any = focusedCode ? buildMatchExpr(focusedCode) : false;
              const isSelectedExpr: any = selectedList.length > 0 ? [
                'any',
                ...selectedList.map((c) => buildMatchExpr(c))
              ] : false;

              const regularColor = isFmbMode ? subdivColor : baseColor;
              const regularWidth = isFmbMode ? 1.8 : 3.5;

              // Highlight selected parcel / subdivision with distinct color (#22c55e or _multiColor)
              const selectedPieceColor: any = ['coalesce', ['get', '_multiColor'], activeLayerColors.parcel || '#22c55e'];

              const villageOutlineColor: any = isFocusedExpr && isSelectedExpr
                ? ['case', isFocusedExpr, '#ffffff', isSelectedExpr, selectedPieceColor, ['coalesce', ['get', '_multiColor'], regularColor]]
                : (isFocusedExpr
                    ? ['case', isFocusedExpr, '#ffffff', ['coalesce', ['get', '_multiColor'], regularColor]]
                    : (isSelectedExpr
                        ? ['case', isSelectedExpr, selectedPieceColor, ['coalesce', ['get', '_multiColor'], regularColor]]
                        : ['coalesce', ['get', '_multiColor'], regularColor]));

              const villageLineWidth: any = (isFocusedExpr || isSelectedExpr)
                ? ['case', isFocusedExpr ? isFocusedExpr : false, 5.0, isSelectedExpr ? isSelectedExpr : false, 4.5, regularWidth]
                : regularWidth;

              const villageFillColor: any = selectedPieceColor;
              const villageFillOpacity: any = (isFocusedExpr || isSelectedExpr)
                ? ['case', isFocusedExpr ? isFocusedExpr : false, 0.40, isSelectedExpr ? isSelectedExpr : false, 0.35, 0]
                : 0;

              if (map.getLayer(fillLayer)) {
                map.setLayoutProperty(fillLayer, 'visibility', 'visible');
                map.setPaintProperty(fillLayer, 'fill-color', villageFillColor as any);
                map.setPaintProperty(fillLayer, 'fill-opacity', 0);
              }
              if (map.getLayer(outlineLayer)) {
                map.setLayoutProperty(outlineLayer, 'visibility', 'visible');
                map.setPaintProperty(outlineLayer, 'line-color', villageOutlineColor as any);
                map.setPaintProperty(outlineLayer, 'line-width', villageLineWidth as any);
                try {
                  map.moveLayer(outlineLayer);
                } catch (e) {}
              }
            }
          } else {
            const isDistrict = lvl === 'district';
            const isTaluk = lvl === 'taluk';
            const isParcel = lvl === 'parcel';
            const isStateDistrictOverview = isDistrict && (!layerData.code || layerData.code === 'all');
            const isChildActive = isDistrict
              ? Boolean(layersToSync.taluk || layersToSync.village || layersToSync.parcel)
              : (isTaluk ? Boolean(layersToSync.village || layersToSync.parcel) : false);

            const activeColor = isParcel
              ? (activeLayerColors.parcel || '#22c55e')
              : (activeLayerColors[lvl] || layerData.color || (isDistrict ? '#facc15' : (isTaluk ? '#9333ea' : color)));

            // Distinct parcel layer highlight styling
            const parcelOutlineColor = ['coalesce', ['get', '_multiColor'], activeLayerColors.parcel || '#22c55e'];
            const parcelLineWidthVal = 4.5;
            const parcelFillColor = ['coalesce', ['get', '_multiColor'], activeLayerColors.parcel || '#22c55e'];

            const isMultiDistrict = isDistrict && (multiDistricts.length > 1 || (layerData.geojson?.features && layerData.geojson.features.length > 1));
            const isDistrictFocused = (focusedItem && focusedItem.level === 'district' ? focusedItem.code : '');
            const isDistrictFocusedExpr: any = isDistrictFocused ? buildMatchExpr(isDistrictFocused) : false;

            const districtColorExpr: any = isDistrictFocused
              ? ['case', isDistrictFocusedExpr, '#ffffff', ['coalesce', ['get', '_multiColor'], activeColor || '#facc15']]
              : ['coalesce', ['get', '_multiColor'], activeColor || '#facc15'];

            const featureColorExpr: any = isDistrict
              ? (isMultiDistrict
                  ? districtColorExpr
                  : (isStateDistrictOverview ? '#facc15' : ['coalesce', ['get', '_multiColor'], activeColor || '#facc15']))
              : (isStateDistrictOverview ? '#facc15' : ['coalesce', ['get', '_multiColor'], activeColor]);

            if (map.getLayer(fillLayer)) {
              if (isChildActive) {
                map.setLayoutProperty(fillLayer, 'visibility', 'none');
              } else {
                map.setLayoutProperty(fillLayer, 'visibility', 'visible');
                map.setPaintProperty(fillLayer, 'fill-color', isParcel ? (parcelFillColor as any) : featureColorExpr);
                map.setPaintProperty(fillLayer, 'fill-opacity', 0);
              }
            }
            if (map.getLayer('district-casing') && isDistrict) {
              map.setLayoutProperty('district-casing', 'visibility', isChildActive ? 'none' : 'visible');
              try { map.moveLayer('district-casing'); } catch (e) {}
            }
            if (map.getLayer(outlineLayer)) {
              map.setLayoutProperty(outlineLayer, 'visibility', 'visible');
              map.setPaintProperty(outlineLayer, 'line-color', isParcel ? (parcelOutlineColor as any) : featureColorExpr);
              map.setPaintProperty(outlineLayer, 'line-width', isParcel ? (parcelLineWidthVal as any) : (isMultiDistrict ? 5.0 : (isDistrict ? 4.5 : (isStateDistrictOverview ? 3.0 : 3.5))));
              map.setPaintProperty(outlineLayer, 'line-opacity', 1.0);
              if (!isStateDistrictOverview) {
                try {
                  map.moveLayer(outlineLayer);
                } catch (e) {}
              }
            }

            // Always ensure the District boundary and labels stay on top
            try {
              if (map.getLayer('auto-zoom-district-casing')) map.moveLayer('auto-zoom-district-casing');
              if (map.getLayer('auto-zoom-district-outline')) map.moveLayer('auto-zoom-district-outline');
              if (map.getLayer('district-casing')) map.moveLayer('district-casing');
              if (map.getLayer('district-outline')) map.moveLayer('district-outline');
              if (map.getLayer('district-labels')) map.moveLayer('district-labels');
            } catch (e) {}
          }

          if (map.getLayer(labelLayer)) {
            const isDistrict = lvl === 'district';
            const isTaluk = lvl === 'taluk';
            const isChildActive = isDistrict
              ? Boolean(layersToSync.taluk || layersToSync.village || layersToSync.parcel)
              : (isTaluk ? Boolean(layersToSync.village || layersToSync.parcel) : false);

            const labelsVisible = (layerData.showLabels !== false) && !isChildActive;
            map.setLayoutProperty(labelLayer, 'visibility', labelsVisible ? 'visible' : 'none');

            if (isDistrict) {
              map.setPaintProperty(labelLayer, 'text-halo-color', '#0f172a');
              try {
                map.moveLayer(labelLayer);
              } catch (e) {}
            }

            // When parcel layer is active, filter village-labels so it does not render labels on the selected parcel
            if (lvl === 'village') {
              const activeParcelCode = (layersToSync.parcel?.code || selectedParcel || '').trim();
              const baseSurveyNum = activeParcelCode ? activeParcelCode.split('_').pop()!.split('/')[0].trim() : '';
              if (baseSurveyNum && layersToSync.parcel?.geojson && (layersToSync.parcel.geojson.features?.length || 0) > 0) {
                map.setFilter(labelLayer, [
                  'all',
                  ['!=', ['coalesce', ['get', 'base_survey'], ''], baseSurveyNum],
                  ['!=', ['coalesce', ['get', 'survey_no'], ''], baseSurveyNum]
                ]);
              } else {
                map.setFilter(labelLayer, null);
              }
            }
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
          if (map.getLayer('district-casing') && lvl === 'district') map.setLayoutProperty('district-casing', 'visibility', 'none');
          if (map.getLayer(fillLayer)) map.setLayoutProperty(fillLayer, 'visibility', 'none');
          if (map.getLayer(outlineLayer)) map.setLayoutProperty(outlineLayer, 'visibility', 'none');
          if (map.getLayer(labelLayer)) map.setLayoutProperty(labelLayer, 'visibility', 'none');
        }
      }
    });

    // Ensure auto-zoom layers respect T, V, P toggle eye visibility AND showLabels toggle
    // Deduplicate labels: When a specific district, taluk, or village layer is loaded, hide auto-zoom counterpart labels
    const isDistrictLayerActive = Boolean(layersToSync.district && layersToSync.district.showLabels !== false);
    const distLabelsVis = isDistrictLayerActive ? 'none' : 'visible';

    const isTalukLayerActive = Boolean(layersToSync.taluk && layersToSync.taluk.showLabels !== false);
    const talukVis = zoomLayerVisibilityRef.current.taluk ? 'visible' : 'none';
    const talukLabelsVis = isTalukLayerActive ? 'none' : (zoomLayerVisibilityRef.current.taluk ? 'visible' : 'none');

    const isVillageLayerActive = Boolean(layersToSync.village && layersToSync.village.showLabels !== false);
    const vilVis = zoomLayerVisibilityRef.current.village ? 'visible' : 'none';
    const vilLabelsVis = isVillageLayerActive ? 'none' : (zoomLayerVisibilityRef.current.village && (activeLayers.village?.showLabels !== false) ? 'visible' : 'none');

    const parcelVis = zoomLayerVisibilityRef.current.parcel ? 'visible' : 'none';
    const parcelLabelsVis = zoomLayerVisibilityRef.current.parcel && (activeLayers.parcel?.showLabels !== false) ? 'visible' : 'none';

    ['auto-zoom-district-fill', 'auto-zoom-district-casing'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
    });
    if (map.getLayer('auto-zoom-district-labels')) {
      map.setLayoutProperty('auto-zoom-district-labels', 'visibility', distLabelsVis);
    }
    if (map.getLayer('auto-zoom-district-outline')) {
      map.setLayoutProperty('auto-zoom-district-outline', 'visibility', 'visible');
      map.setPaintProperty('auto-zoom-district-outline', 'line-width', 3.8);
      map.setPaintProperty('auto-zoom-district-outline', 'line-opacity', 1.0);
      map.setPaintProperty('auto-zoom-district-outline', 'line-color', '#facc15');
    }
    if (map.getLayer('auto-zoom-taluk-outline')) map.setLayoutProperty('auto-zoom-taluk-outline', 'visibility', talukVis);
    if (map.getLayer('auto-zoom-taluk-labels')) map.setLayoutProperty('auto-zoom-taluk-labels', 'visibility', talukVis);
    if (map.getLayer('auto-zoom-village-outline')) map.setLayoutProperty('auto-zoom-village-outline', 'visibility', vilVis);
    if (map.getLayer('auto-zoom-village-labels')) map.setLayoutProperty('auto-zoom-village-labels', 'visibility', vilLabelsVis);

    if (map.getZoom() >= 13.2) {
      activePmtilesDistrictsRef.current.forEach((cleanDist) => {
        const fillId = `cadastral-pmtiles-fill-${cleanDist}`;
        const lineId = `cadastral-pmtiles-line-${cleanDist}`;
        const labelId = `cadastral-pmtiles-label-${cleanDist}`;
        if (map.getLayer(fillId)) map.setLayoutProperty(fillId, 'visibility', parcelVis);
        if (map.getLayer(lineId)) map.setLayoutProperty(lineId, 'visibility', parcelVis);
        if (map.getLayer(labelId)) map.setLayoutProperty(labelId, 'visibility', parcelLabelsVis);
      });
    }
  };

  // Keep selected village highlighted in vibrant Yellow (#facc15) on auto-zoom layer
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;
    const selectedVilList = [
      selectedVillage,
      ...(multiVillages || []),
      activeLayers.village?.code,
      activeLayers.village?.name
    ].filter(Boolean) as string[];

    const hasSelection = selectedVilList.length > 0;
    const matchExprs = selectedVilList.map((v) => buildVillageMatchExpr(v)).filter(Boolean);

    const filter = (hasSelection && matchExprs.length > 0)
      ? ['any', ...matchExprs]
      : ['==', ['to-string', ['get', 'code']], '__none__'];

    ['auto-zoom-village-selected-casing', 'auto-zoom-village-selected-outline'].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setFilter(layerId, filter as any);
        map.setLayoutProperty(layerId, 'visibility', hasSelection ? 'visible' : 'none');
        try { map.moveLayer(layerId); } catch (e) {}
      }
    });
  }, [selectedVillage, multiVillages, activeLayers.village, mapLoaded]);

  // Reactively toggle village and parcel labels on the map when Tag icon is clicked in Search / Navigation Panel
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    const showVillageLabels = activeLayers.village?.showLabels !== false;
    const vilLabelVis = showVillageLabels ? 'visible' : 'none';

    if (map.getLayer('auto-zoom-village-labels')) {
      map.setLayoutProperty('auto-zoom-village-labels', 'visibility', vilLabelVis);
    }
    if (map.getLayer('village-labels')) {
      map.setLayoutProperty('village-labels', 'visibility', vilLabelVis);
    }

    const showParcelLabels = activeLayers.parcel?.showLabels !== false;
    const parcelLabelVis = showParcelLabels ? 'visible' : 'none';

    if (map.getLayer('parcel-labels')) {
      map.setLayoutProperty('parcel-labels', 'visibility', parcelLabelVis);
    }
    activePmtilesDistrictsRef.current.forEach((cleanDist) => {
      const labelId = `cadastral-pmtiles-label-${cleanDist}`;
      if (map.getLayer(labelId)) {
        map.setLayoutProperty(labelId, 'visibility', parcelLabelVis);
      }
    });
  }, [activeLayers.village?.showLabels, activeLayers.parcel?.showLabels, mapLoaded]);

  // Robust Zoom to Layer Bounds Helper
  const zoomToLayerBounds = useCallback((level: GisLevel | 'state', specificCode?: string, explicitLayer?: ActiveGisLayer | null) => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    if (level === 'state') {
      setFocusedItem(null);
      map.fitBounds(TAMIL_NADU_BOUNDS, {
        padding: { top: 35, bottom: 35, left: 35, right: 35 },
        duration: 900,
      });
      return;
    }

    if (specificCode) {
      setFocusedItem({ level, code: specificCode });
    } else {
      setFocusedItem(null);
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
      const isMultiDist = level === 'district' && (multiDistricts.length > 1 || (layer.geojson?.features && layer.geojson.features.length > 1));
      // Target zoom levels matching requested scales:
      // Taluk from 10km scale (~10.8), Village from 3km scale (~13.0), Parcel from 1km scale (~15.2)
      const maxZ = level === 'parcel'
        ? 15.2
        : level === 'village'
        ? 13.0
        : level === 'taluk'
        ? 10.8
        : (isMultiDist ? 8.2 : (level === 'district' ? 8.8 : 12.0));

      const leftPad = isSidebarOpen ? 400 : 60;
      const padding = level === 'parcel'
        ? { top: 70, bottom: 70, left: leftPad + 20, right: 60 }
        : level === 'district'
        ? { top: 60, bottom: 60, left: leftPad + 20, right: 60 }
        : { top: 50, bottom: 50, left: leftPad, right: 50 };

      const center: [number, number] = [
        (bounds[0][0] + bounds[1][0]) / 2,
        (bounds[0][1] + bounds[1][1]) / 2,
      ];

      if (bounds[0][0] === bounds[1][0] && bounds[0][1] === bounds[1][1]) {
        map.easeTo({
          center: [bounds[0][0], bounds[0][1]],
          zoom: maxZ,
          duration: 900,
        });
      } else if (level === 'parcel') {
        // Zoom into parcel at 1km height
        map.easeTo({
          center,
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

      setTimeout(() => {
        if (level === 'district') triggerTierBlinkRef.current('district');
        else if (level === 'taluk') triggerTierBlinkRef.current('taluk');
        else if (level === 'village') triggerTierBlinkRef.current('village');
      }, 150);
    }
  }, [isSidebarOpen, multiDistricts]);

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
  }, [activeLayers, activeLayerColors, mapLoaded, selectedLevel, zoomToLayerBounds, selectedParcel, multiParcels, selectedVillage, multiVillages, focusedItem, selectedClipFeatures, layerType]);

  // Respond immediately to explicit zoom requests (e.g. from breadcrumb dropdown or navigation clicks)
  useEffect(() => {
    if (zoomRequestLevel && mapLoaded) {
      isUserInteractingRef.current = false;
      zoomToLayerBounds(zoomRequestLevel);
      onZoomRequestHandled?.();
    }
  }, [zoomRequestLevel, mapLoaded, zoomToLayerBounds, onZoomRequestHandled, activeLayers]);

  // ─── Render Rich Cart Layer Feature Popup ──────────────────────────────────
  const renderCartLayerPopupHtml = useCallback((layer: any, props: Record<string, any>): string => {
    let title = '';
    let subtitle = '';
    const details: { label: string; value: string }[] = [];

    const id = layer.id;

    if (id === 'generic_viewer_river') {
      // 1. Rivers: prioritize exact river name (discr_l2, river_name, name)
      const clean = (val?: any) => {
        if (!val) return '';
        const s = String(val).trim();
        if (!s || s.toLowerCase() === 'river' || s.toLowerCase() === 'null') return '';
        return s;
      };

      const primaryRiver = clean(props.discr_l2) || clean(props.river_name) || clean(props.name);
      const secondaryFeature = clean(props.feature_na) || clean(props.descriptio);

      if (primaryRiver) {
        title = primaryRiver;
        if (secondaryFeature && secondaryFeature.toLowerCase() !== primaryRiver.toLowerCase()) {
          subtitle = secondaryFeature;
        }
      } else if (secondaryFeature) {
        title = secondaryFeature;
      } else {
        title = props.discr_l2 || 'River Segment';
      }

      if (props.length) {
        const lenVal = Number(props.length);
        if (!isNaN(lenVal) && lenVal > 0) {
          const lenKm = (lenVal / 1000).toFixed(2);
          details.push({ label: 'Length', value: `${lenKm} km (${lenVal.toFixed(0)} m)` });
        }
      }
      if (props.discr_l1) {
        details.push({ label: 'Category', value: props.discr_l1 });
      }
      if (props.wl_river_i) {
        details.push({ label: 'River ID', value: String(props.wl_river_i) });
      }
    } else if (id === 'generic_viewer_all_water_bodies') {
      title = props.water_body_name || props.wb_name || props.name || (props.type ? `${props.type} Water Body` : 'Water Body');
      if (props.type && props.type !== title) {
        subtitle = `${props.type} Water Body`;
      }
      const loc = [props.panchayat_village, props.revenue_village, props.taluk_name, props.dist_name]
        .filter(Boolean).join(', ');
      if (loc) details.push({ label: 'Location', value: `📍 ${loc}` });
      if (props.area && Number(props.area) > 0) {
        details.push({ label: 'Area', value: `${Number(props.area).toFixed(2)} acres` });
      }
      if (props.source_department) {
        details.push({ label: 'Department', value: props.source_department });
      }
    } else if (id === 'generic_viewer_schools') {
      title = props.name || props.school_name || props.title || 'School';
      subtitle = props.category || props.category_group || '';
      const loc = [props.habitation, props.town_municipality, props.block, props.district]
        .filter(Boolean).join(', ');
      if (loc) details.push({ label: 'Location', value: `📍 ${loc}` });
      if (props.managing_department || props.management) {
        details.push({ label: 'Management', value: props.managing_department || props.management });
      }
      if (props.directorate) {
        details.push({ label: 'Directorate', value: props.directorate });
      }
    } else if (id === 'tnrd_roads') {
      title = props.road_code || props.all_rcode || props.road_name || 'TNRD Road';
      if (props.road_category) subtitle = `${props.road_category} Road`;
      const loc = [props.block_name, props.district_name].filter(Boolean).join(', ');
      if (loc) details.push({ label: 'Location', value: `📍 ${loc}` });
      if (props.other_road_length && Number(props.other_road_length) > 0) {
        details.push({ label: 'Length', value: `${props.other_road_length} km` });
      }
      if (props.road_id) {
        details.push({ label: 'Road ID', value: String(props.road_id) });
      }
    } else if (id === 'generic_viewer_state_highways') {
      title = props.road_nam || props.road_num || 'State Highway';
      if (props.road_num && props.road_nam) subtitle = `Route: ${props.road_num}`;
      const loc = [props.subdvn_nam, props.divn_nam, props.circle_nam].filter(Boolean).join(', ');
      if (loc) details.push({ label: 'Division', value: loc });
    } else if (id === 'generic_viewer_national_highways') {
      title = props.nh_name || props.nh_no || 'National Highway';
      if (props.nh_no && props.nh_name) subtitle = `Route: ${props.nh_no}`;
    } else if (id === 'generic_viewer_anganwadi_centres') {
      title = props.sector ? `${props.sector} Anganwadi Centre` : (props.name || 'Anganwadi Centre');
      const loc = [props.ward_no ? `Ward ${props.ward_no}` : '', props.district, props.pin_code]
        .filter(Boolean).join(', ');
      if (loc) details.push({ label: 'Location', value: `📍 ${loc}` });
      if (props.icds_code) details.push({ label: 'ICDS Code', value: String(props.icds_code) });
    } else if (id === 'generic_viewer_village_panchayat_office') {
      title = props.name ? `${props.name} Panchayat Office` : 'Village Panchayat Office';
      const loc = [props.block, props.district].filter(Boolean).join(', ');
      if (loc) details.push({ label: 'Location', value: `📍 ${loc}` });
    } else if (id === 'generic_viewer_tasmac_location_gis') {
      title = (props.name && props.name.toLowerCase() !== 'test')
        ? props.name
        : (props.tasmac_sho ? `TASMAC Shop #${props.tasmac_sho}` : 'TASMAC Outlet');
      if (props.full_addre) details.push({ label: 'Address', value: props.full_addre });
      const loc = [props.district, props.region].filter(Boolean).join(', ');
      if (loc) details.push({ label: 'Location', value: `📍 ${loc}` });
    } else if (id === 'generic_viewer_petrol_bunks') {
      title = props.name || props.customer_agency || 'Petrol Bunk';
      if (props.customer_agency && props.customer_agency !== title) subtitle = props.customer_agency;
      const loc = [props.panchayat_name, props.taluk_name, props.district_name].filter(Boolean).join(', ');
      if (loc) details.push({ label: 'Location', value: `📍 ${loc}` });
      if (props.sales_office) details.push({ label: 'Sales Office', value: props.sales_office });
      if (props.ro_market) details.push({ label: 'Market', value: props.ro_market });
    } else if (id === 'generic_viewer_mines') {
      title = props.mine_name || (props.mineral_le ? `${props.mineral_le} Mine/Quarry` : 'Mine / Quarry');
      if (props.mineral_le && props.mine_name) subtitle = `Mineral: ${props.mineral_le}`;
      if (props.district) details.push({ label: 'District', value: props.district });
    } else if (id === 'generic_viewer_engineering_college') {
      title = props.name || props.college_name || 'Engineering College';
      if (props.type) subtitle = `Type: ${props.type}`;
      const loc = [props.d_name, props.zone_ ? `Zone ${props.zone_}` : ''].filter(Boolean).join(', ');
      if (loc) details.push({ label: 'Location', value: `📍 ${loc}` });
    } else if (id === 'generic_viewer_fire_stations') {
      title = props.name || props.fire_station || 'Fire Station';
    } else if (id === 'generic_viewer_tn_railway') {
      title = props.type ? `${props.type} Railway` : (props.name || 'Railway Line');
      if (props.length_km) details.push({ label: 'Length', value: `${props.length_km} km` });
    } else if (id === 'tnrd_tnrd_tourist_point') {
      title = props.tourist_point_name || props.tourist_name || props.tourist_place || props.name || 'Tourist Point';
      const loc = [props.block_name, props.district_name].filter(Boolean).join(', ');
      if (loc) details.push({ label: 'Location', value: `📍 ${loc}` });
    } else {
      title = props.name || props.title || props.discr_l2 || props.feature_na || `${layer.title} Item`;
      if (props.category || props.type) subtitle = props.category || props.type;
    }

    // Clean up whitespace & linebreaks
    title = (title || layer.title || 'Layer Item').replace(/[\r\n]+/g, ' ').trim();
    if (subtitle) subtitle = subtitle.replace(/[\r\n]+/g, ' ').trim();

    const detailsHtml = details.map(d => `
      <div class="text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-1 leading-snug">
        <span class="font-medium text-slate-500 dark:text-slate-400 shrink-0">${d.label}:</span>
        <span class="text-slate-800 dark:text-slate-200">${d.value}</span>
      </div>
    `).join('');

    return `
      <div class="px-3.5 py-2.5 rounded-xl bg-white/98 dark:bg-slate-900/98 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 shadow-xl text-xs font-sans min-w-[200px] max-w-xs relative">
        <div class="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-slate-100 dark:border-slate-800">
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style="background-color: ${layer.color}"></span>
            <span class="font-bold uppercase tracking-wider text-[10px] text-amber-600 dark:text-amber-400">${layer.title}</span>
          </div>
          <button type="button" onclick="window._closeGisPopup && window._closeGisPopup()" class="cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5 rounded transition-colors -mr-1" title="Close">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="font-bold text-sm text-slate-900 dark:text-white leading-tight mb-1">${title}</div>
        ${subtitle ? `<div class="text-[11px] text-slate-500 dark:text-slate-400 font-medium mb-1.5">${subtitle}</div>` : ''}
        ${detailsHtml ? `<div class="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 space-y-0.5">${detailsHtml}</div>` : ''}
      </div>
    `;
  }, []);

  // ─── Synchronize 15 Persistent GIS Cart Vector Tile Layers ─────────────────
  const syncCartLayers = useCallback((map: maplibregl.Map, cartLayersState: Record<string, boolean> = {}) => {
    if (!map) return;

    for (const layer of CART_LAYERS_CONFIG) {
      const isVisible = !!cartLayersState[layer.id];
      const srcId = `cart-src-${layer.id}`;
      const unclusteredLayerId = `cart-unclustered-${layer.id}`;
      const labelLayerId = `cart-label-${layer.id}`;
      const lineLayerId = `cart-line-${layer.id}`;
      const lineHitLayerId = `cart-line-hit-${layer.id}`;
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
              maxzoom: 22,
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
                  ['get', 'water_body_name'],
                  ['get', 'tourist_point_name'],
                  ['get', 'school_name'],
                  ['get', 'panchayat_name'],
                  ['get', 'PAN_NAME'],
                  ['get', 'college_name'],
                  ['get', 'fire_station'],
                  ['get', 'petrol_bunk'],
                  ['get', 'sector'],
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
                if (popupRef.current) {
                  popupRef.current
                    .setLngLat(e.lngLat)
                    .setHTML(renderCartLayerPopupHtml(layer, props))
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
              maxzoom: 22,
            });

            if (layer.geom_type === 'line') {
              // 1. Transparent wider stroke for easy click hit detection
              map.addLayer({
                id: lineHitLayerId,
                type: 'line',
                source: srcId,
                'source-layer': layer.id,
                paint: {
                  'line-width': 18,
                  'line-opacity': 0,
                },
                layout: {
                  'line-join': 'round',
                  'line-cap': 'round',
                },
              });

              // 2. Visible styled line
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

              const handleLineClick = (e: maplibregl.MapLayerMouseEvent) => {
                if (e.features && e.features[0]) {
                  if (e.originalEvent) {
                    (e.originalEvent as any)._gisFeatureClicked = true;
                  }
                  featureClickedInCurrentEventRef.current = true;
                  activePopupLayerRef.current = `cart_${layer.id}`;

                  const props = e.features[0].properties || {};
                  if (popupRef.current) {
                    popupRef.current
                      .setLngLat(e.lngLat)
                      .setHTML(renderCartLayerPopupHtml(layer, props))
                      .addTo(map);
                  }
                }
              };

              [lineLayerId, lineHitLayerId].forEach((lid) => {
                map.on('mouseenter', lid, () => {
                  map.getCanvas().style.cursor = 'pointer';
                });
                map.on('mouseleave', lid, () => {
                  map.getCanvas().style.cursor = '';
                });
                map.on('click', lid, handleLineClick);
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

              const handlePolyClick = (e: maplibregl.MapLayerMouseEvent) => {
                if (e.features && e.features[0]) {
                  if (e.originalEvent) {
                    (e.originalEvent as any)._gisFeatureClicked = true;
                  }
                  featureClickedInCurrentEventRef.current = true;
                  activePopupLayerRef.current = `cart_${layer.id}`;

                  const props = e.features[0].properties || {};
                  if (popupRef.current) {
                    popupRef.current
                      .setLngLat(e.lngLat)
                      .setHTML(renderCartLayerPopupHtml(layer, props))
                      .addTo(map);
                  }
                }
              };

              [polyFillLayerId, polyOutlineLayerId].forEach((lid) => {
                map.on('mouseenter', lid, () => {
                  map.getCanvas().style.cursor = 'pointer';
                });
                map.on('mouseleave', lid, () => {
                  map.getCanvas().style.cursor = '';
                });
                map.on('click', lid, handlePolyClick);
              });
            }
          }
        } else {
          // Source already added -> set visibility to visible (exclude label layer — shown only via click popup)
          [unclusteredLayerId, lineLayerId, lineHitLayerId, polyFillLayerId, polyOutlineLayerId].forEach((lid) => {
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
        [unclusteredLayerId, labelLayerId, lineLayerId, lineHitLayerId, polyFillLayerId, polyOutlineLayerId].forEach((lid) => {
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

  // ─── Synchronize Cadastral PMTiles Vector Layers from S3 across Bounding Box ───
  const activePmtilesDistrictsRef = useRef<Set<string>>(new Set());

  // Helper to build robust MapLibre GL expression matching selected parcel across PMTiles vector tiles
  const buildParcelPmtilesFilter = useCallback((selectedList: string[]): any => {
    if (!selectedList || selectedList.length === 0) {
      return ['==', ['to-string', ['get', 'nonexistent_key']], '__none__'];
    }

    const conditions: any[] = [];
    selectedList.forEach((code) => {
      if (!code) return;
      const clean = String(code).trim();
      const raw = clean.includes('_') ? clean.split('_').pop()! : clean;
      const base = raw.includes('/') ? raw.split('/')[0].trim() : raw;
      const num = parseInt(raw, 10);
      const baseNum = parseInt(base, 10);

      conditions.push(['==', ['to-string', ['coalesce', ['get', 'survey_no'], ['get', 'SURVEY_NO'], ['get', 'KIDE'], ['get', 'code'], '']], raw]);
      conditions.push(['==', ['to-string', ['coalesce', ['get', 'survey_no'], ['get', 'SURVEY_NO'], ['get', 'KIDE'], ['get', 'code'], '']], clean]);
      if (base !== raw) {
        conditions.push(['==', ['to-string', ['coalesce', ['get', 'survey_no'], ['get', 'SURVEY_NO'], ['get', 'KIDE'], ['get', 'code'], '']], base]);
      }
      if (!isNaN(num)) {
        conditions.push(['==', ['to-number', ['coalesce', ['get', 'survey_no'], ['get', 'SURVEY_NO'], -99999]], num]);
      }
      if (!isNaN(baseNum) && baseNum !== num) {
        conditions.push(['==', ['to-number', ['coalesce', ['get', 'survey_no'], ['get', 'SURVEY_NO'], -99999]], baseNum]);
      }
    });

    return conditions.length > 0 ? ['any', ...conditions] : ['==', ['to-string', ['get', 'nonexistent_key']], '__none__'];
  }, []);

  const syncCadastralPmtilesDistricts = useCallback((map: maplibregl.Map, districtCodes: string[]) => {
    if (!map) return;

    const validDistCodes = new Set<string>();
    for (const code of districtCodes) {
      const clean = (code || '').replace(/\D/g, '').padStart(2, '0');
      const num = parseInt(clean, 10);
      if (num >= 1 && num <= 38) {
        validDistCodes.add(clean);
      }
    }

    if (validDistCodes.size === 0) return;

    const proto = getPMTilesProtocol();

    // Ensure all visible districts inside the viewport have PMTiles sources & layers added
    validDistCodes.forEach((cleanDist) => {
      const srcId = `cadastral-pmtiles-source-${cleanDist}`;
      const fillId = `cadastral-pmtiles-fill-${cleanDist}`;
      const lineId = `cadastral-pmtiles-line-${cleanDist}`;
      const highlightCasingId = `cadastral-pmtiles-highlight-casing-${cleanDist}`;
      const highlightLineId = `cadastral-pmtiles-highlight-line-${cleanDist}`;
      const labelId = `cadastral-pmtiles-label-${cleanDist}`;
      const expectedLayerName = `d${cleanDist}_cadastral`;
      const fullHttpUrl = getPmtilesUrl(cleanDist);

      // Register instance with protocol so MapLibre shares the exact instance
      if (!pmtilesInstanceCacheRef.current.has(fullHttpUrl)) {
        const pInstance = new PMTiles(fullHttpUrl);
        proto.add(pInstance);
        pmtilesInstanceCacheRef.current.set(fullHttpUrl, pInstance);
      }

      if (!map.getSource(srcId)) {
        map.addSource(srcId, {
          type: 'vector',
          url: `pmtiles://${fullHttpUrl}`,
          maxzoom: 11, // PMTiles archive maxzoom is 11; MapLibre overzooms up to 24
        });

        const beforeBoundaryLayer = map.getLayer('auto-zoom-village-outline')
          ? 'auto-zoom-village-outline'
          : map.getLayer('auto-zoom-taluk-outline')
          ? 'auto-zoom-taluk-outline'
          : undefined;

        // 1. Transparent Hit-Detection Fill (Zero opacity so satellite imagery is never clouded; starts from 1km scale)
        map.addLayer({
          id: fillId,
          type: 'fill',
          source: srcId,
          'source-layer': expectedLayerName,
          minzoom: 13.2,
          paint: {
            'fill-color': '#10b981',
            'fill-opacity': 0,
          },
        }, beforeBoundaryLayer);

        // 2. Bright Crisp Cadastral Boundary Lines (100% opacity, emerald green #22c55e from 1km scale)
        map.addLayer({
          id: lineId,
          type: 'line',
          source: srcId,
          'source-layer': expectedLayerName,
          minzoom: 13.2,
          paint: {
            'line-color': '#22c55e',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              13.2, 1.8,
              16.0, 2.8,
              18.5, 3.8,
              21.0, 4.8
            ],
            'line-opacity': 1.0,
          },
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
        }, beforeBoundaryLayer);

        const curSelected = [selectedParcel, ...(multiParcels || [])].filter(Boolean) as string[];
        const initialParcelFilter = buildParcelPmtilesFilter(curSelected);
        const hasSelection = curSelected.length > 0;

        // 3. Highlight Casing Underlay for Selected Parcel (Dark border for high contrast)
        map.addLayer({
          id: highlightCasingId,
          type: 'line',
          source: srcId,
          'source-layer': expectedLayerName,
          minzoom: 13.2,
          maxzoom: 24.0,
          filter: initialParcelFilter,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
            'visibility': 'none',
          },
          paint: {
            'line-color': '#0f172a',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              13.2, 8.0,
              17.0, 10.5,
              19.0, 13.0
            ],
            'line-opacity': 0.95,
          },
        }, beforeBoundaryLayer);

        // 4. Highlight Line for Selected Parcel (Kept hidden per user request to avoid diff color across villages)
        map.addLayer({
          id: highlightLineId,
          type: 'line',
          source: srcId,
          'source-layer': expectedLayerName,
          minzoom: 13.2,
          maxzoom: 24.0,
          filter: initialParcelFilter,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
            'visibility': 'none',
          },
          paint: {
            'line-color': '#00f5ff',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              13.2, 6.0,
              17.0, 8.0,
              19.0, 10.0
            ],
            'line-opacity': 1.0,
          },
        }, beforeBoundaryLayer);

        // 5. Cadastral Survey Numbers with High Contrast Dark Halo (from 1km scale)
        map.addLayer({
          id: labelId,
          type: 'symbol',
          source: srcId,
          'source-layer': expectedLayerName,
          minzoom: 13.2,
          layout: {
            'text-field': [
              'coalesce',
              ['get', 'survey_no'],
              ['get', 'SURVEY_NO'],
              ['get', 'sno'],
              ['get', 'sf_no'],
              ['get', 'KIDE'],
              ['get', 'code'],
              ['get', 'name'],
              ''
            ],
            'text-font': ['Open Sans Bold'],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              13.2, 10.0,
              16.0, 12.0,
              18.0, 14.5,
              20.0, 18.0
            ],
            'text-anchor': 'center',
            'text-allow-overlap': false,
            'text-ignore-placement': false,
            'text-padding': 6,
            'visibility': 'visible',
          },
          paint: {
            'text-color': '#fde047',
            'text-halo-color': '#0f172a',
            'text-halo-width': 2.5,
            'text-halo-blur': 0.5,
          },
        });

        map.on('mouseenter', fillId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', fillId, () => {
          map.getCanvas().style.cursor = '';
        });

        map.on('click', fillId, (e) => {
          if (e.features && e.features[0]) {
            if (e.originalEvent) {
              (e.originalEvent as any)._gisFeatureClicked = true;
            }
            featureClickedInCurrentEventRef.current = true;
            activePopupLayerRef.current = 'cadastral_pmtiles';

            const props = e.features[0].properties || {};
            const surveyNum = props.survey_no || props.KIDE || 'Unknown';
            const village = props.village_id || '';
            const fmb = props.fmb === 1;
            const parcelKey = `${cleanDist}_${village}_${surveyNum}`;

            // If user clicked the same parcel that is currently showing, toggle it off!
            if (activePopupParcelKeyRef.current === parcelKey && popupRef.current && popupRef.current.isOpen()) {
              popupRef.current.remove();
              activePopupParcelKeyRef.current = null;
              activePopupLayerRef.current = null;
              return;
            }
            activePopupParcelKeyRef.current = parcelKey;

            // Smoothly zoom in to the clicked parcel ("no need blink, just zoom in is enough")
            map.easeTo({
              center: [e.lngLat.lng, e.lngLat.lat],
              zoom: Math.max(map.getZoom(), 16.5),
              duration: 500,
              essential: true,
            });

            if (popupRef.current) {
              popupRef.current
                .setLngLat(e.lngLat)
                .setHTML(`
                  <div class="px-2.5 py-1.5 rounded-xl bg-slate-900/95 text-white border border-cyan-400 shadow-xl text-xs font-sans flex items-center gap-2 whitespace-nowrap">
                    <span class="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                    <span class="font-bold text-yellow-300 text-xs">Survey ${surveyNum}</span>
                    <button type="button" onclick="window._closeGisPopup && window._closeGisPopup()" class="cursor-pointer text-slate-400 hover:text-white p-0.5 rounded transition-colors ml-0.5" title="Close">
                      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                `)
                .addTo(map);
            }

            onFeatureClick?.('parcel', props);
          }
        });

        activePmtilesDistrictsRef.current.add(cleanDist);
      } else {
        const curSelected = [selectedParcel, ...(multiParcels || [])].filter(Boolean) as string[];
        const initialParcelFilter = buildParcelPmtilesFilter(curSelected);
        const hasSelection = curSelected.length > 0;

        const pmtilesVis = zoomLayerVisibilityRef.current.parcel ? 'visible' : 'none';
        if (map.getLayer(fillId)) map.setLayoutProperty(fillId, 'visibility', pmtilesVis);
        if (map.getLayer(lineId)) map.setLayoutProperty(lineId, 'visibility', pmtilesVis);
        if (map.getLayer(labelId)) map.setLayoutProperty(labelId, 'visibility', pmtilesVis);
        if (map.getLayer(highlightCasingId)) {
          map.setFilter(highlightCasingId, initialParcelFilter);
          map.setLayoutProperty(highlightCasingId, 'visibility', 'none');
        }
        if (map.getLayer(highlightLineId)) {
          map.setFilter(highlightLineId, initialParcelFilter);
          map.setLayoutProperty(highlightLineId, 'visibility', 'none');
        }
      }
    });

    // Keep memory light: if cached districts grow beyond 8, prune non-visible ones
    if (activePmtilesDistrictsRef.current.size > 8) {
      activePmtilesDistrictsRef.current.forEach((d) => {
        if (!validDistCodes.has(d)) {
          const srcId = `cadastral-pmtiles-source-${d}`;
          const fillId = `cadastral-pmtiles-fill-${d}`;
          const lineId = `cadastral-pmtiles-line-${d}`;
          const highlightCasingId = `cadastral-pmtiles-highlight-casing-${d}`;
          const highlightLineId = `cadastral-pmtiles-highlight-line-${d}`;
          const labelId = `cadastral-pmtiles-label-${d}`;
          if (map.getLayer(highlightLineId)) map.removeLayer(highlightLineId);
          if (map.getLayer(highlightCasingId)) map.removeLayer(highlightCasingId);
          if (map.getLayer(labelId)) map.removeLayer(labelId);
          if (map.getLayer(lineId)) map.removeLayer(lineId);
          if (map.getLayer(fillId)) map.removeLayer(fillId);
          if (map.getSource(srcId)) map.removeSource(srcId);
          activePmtilesDistrictsRef.current.delete(d);
        }
      });
    }
  }, [onFeatureClick, selectedParcel, multiParcels, buildParcelPmtilesFilter]);

  // Synchronize Selected Parcel Highlight across all active PMTiles vector districts immediately
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;
    const selectedList = [selectedParcel, ...(multiParcels || [])].filter(Boolean) as string[];
    const filter = buildParcelPmtilesFilter(selectedList);
    const hasSelection = selectedList.length > 0;

    activePmtilesDistrictsRef.current.forEach((cleanDist) => {
      const highlightCasingId = `cadastral-pmtiles-highlight-casing-${cleanDist}`;
      const highlightLineId = `cadastral-pmtiles-highlight-line-${cleanDist}`;

      if (map.getLayer(highlightCasingId)) {
        map.setFilter(highlightCasingId, filter);
        map.setLayoutProperty(highlightCasingId, 'visibility', 'none');
      }
      if (map.getLayer(highlightLineId)) {
        map.setFilter(highlightLineId, filter);
        map.setLayoutProperty(highlightLineId, 'visibility', 'none');
      }
    });
  }, [selectedParcel, multiParcels, mapLoaded, buildParcelPmtilesFilter]);

  // Synchronize Cadastral PMTiles vector layers across the full bounding box on zoom or viewport movement
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    const resolveAndSyncDistrict = () => {
      const zoom = map.getZoom();

      // Cadastral boundaries & survey numbers show across all villages in bounding box at zoom >= 13.2 (1km scale)
      if (zoom < 13.2 || !zoomLayerVisibilityRef.current.parcel) {
        if (popupRef.current && activePopupLayerRef.current === 'cadastral_pmtiles') {
          popupRef.current.remove();
          activePopupLayerRef.current = null;
          activePopupParcelKeyRef.current = null;
        }
        activePmtilesDistrictsRef.current.forEach((cleanDist) => {
          const fillId = `cadastral-pmtiles-fill-${cleanDist}`;
          const lineId = `cadastral-pmtiles-line-${cleanDist}`;
          const labelId = `cadastral-pmtiles-label-${cleanDist}`;
          if (map.getLayer(fillId)) map.setLayoutProperty(fillId, 'visibility', 'none');
          if (map.getLayer(lineId)) map.setLayoutProperty(lineId, 'visibility', 'none');
          if (map.getLayer(labelId)) map.setLayoutProperty(labelId, 'visibility', 'none');
        });
        if (zoom < 11.5) return;
      }

      // If user has explicitly selected a village layer (e.g. from search), keep it visible when zoomed in
      if (activeLayers.village?.geojson && (activeLayers.village.geojson.features?.length || 0) > 0) {
        if (map.getLayer('village-outline')) {
          map.setLayoutProperty('village-outline', 'visibility', 'visible');
          map.setPaintProperty('village-outline', 'line-width', 3.5);
          map.setPaintProperty('village-outline', 'line-color', '#facc15');
          map.setPaintProperty('village-outline', 'line-opacity', 1.0);
        }
        if (map.getLayer('village-base-outline')) {
          map.setLayoutProperty('village-base-outline', 'visibility', 'visible');
          map.setPaintProperty('village-base-outline', 'line-width', 3.5);
          map.setPaintProperty('village-base-outline', 'line-color', '#facc15');
          map.setPaintProperty('village-base-outline', 'line-opacity', 1.0);
        }
        if (map.getLayer('village-labels')) {
          const vLabelsVis = activeLayers.village?.showLabels !== false ? 'visible' : 'none';
          map.setLayoutProperty('village-labels', 'visibility', vLabelsVis);
        }
        if (map.getLayer('village-fill')) {
          map.setLayoutProperty('village-fill', 'visibility', 'visible');
          map.setPaintProperty('village-fill', 'fill-color', '#facc15');
          map.setPaintProperty('village-fill', 'fill-opacity', 0);
        }
      }

      // Collect all districts visible inside the bounding box
      const targetDistricts = new Set<string>();

      // 1. Explicit district selections
      if (selectedDistrict && selectedDistrict !== 'all') {
        const c = selectedDistrict.replace(/\D/g, '').padStart(2, '0');
        if (parseInt(c, 10) >= 1 && parseInt(c, 10) <= 38) targetDistricts.add(c);
      }
      if (activeLayers.district?.code && activeLayers.district.code !== 'all') {
        const c = activeLayers.district.code.replace(/\D/g, '').padStart(2, '0');
        if (parseInt(c, 10) >= 1 && parseInt(c, 10) <= 38) targetDistricts.add(c);
      }

      // 2. Query visible rendered features across canvas viewport to detect all districts in view
      const canvas = map.getCanvas();
      const samplePoints: maplibregl.PointLike[] = [
        [canvas.width / 2, canvas.height / 2],
        [canvas.width * 0.25, canvas.height * 0.25],
        [canvas.width * 0.75, canvas.height * 0.25],
        [canvas.width * 0.25, canvas.height * 0.75],
        [canvas.width * 0.75, canvas.height * 0.75],
        [30, 30],
        [canvas.width - 30, 30],
        [30, canvas.height - 30],
        [canvas.width - 30, canvas.height - 30],
      ];

      for (const pt of samplePoints) {
        const feats = map.queryRenderedFeatures(pt, {
          layers: ['auto-zoom-district-fill', 'auto-zoom-district-outline', 'auto-zoom-taluk-outline']
        });
        for (const f of feats) {
          const p = f.properties || {};
          const rawCode = p.district_c || p.dist_id || p.district_code || p.code;
          if (rawCode) {
            const c = String(rawCode).replace(/\D/g, '').padStart(2, '0');
            const num = parseInt(c, 10);
            if (num >= 1 && num <= 38) {
              targetDistricts.add(c);
            }
          }
        }
      }

      // 3. Fallback to center point query if needed
      if (targetDistricts.size === 0) {
        const centerPt = map.project(map.getCenter());
        const centerFeats = map.queryRenderedFeatures(centerPt);
        for (const f of centerFeats) {
          const p = f.properties || {};
          const rawCode = p.district_c || p.dist_id || p.district_code;
          if (rawCode) {
            const c = String(rawCode).replace(/\D/g, '').padStart(2, '0');
            const num = parseInt(c, 10);
            if (num >= 1 && num <= 38) {
              targetDistricts.add(c);
              break;
            }
          }
        }
      }

      // 4. Fallback to point-in-polygon calculation using preloaded district boundaries
      if (targetDistricts.size === 0 && preloadedLayers?.districtGeoJson?.features) {
        try {
          const center = map.getCenter();
          const pt = turf.point([center.lng, center.lat]);
          for (const f of preloadedLayers.districtGeoJson.features) {
            if (turf.booleanPointInPolygon(pt, f)) {
              const p = f.properties || {};
              const rawCode = p.district_c || p.dist_id || p.district_code || p.code;
              if (rawCode) {
                const c = String(rawCode).replace(/\D/g, '').padStart(2, '0');
                const num = parseInt(c, 10);
                if (num >= 1 && num <= 38) {
                  targetDistricts.add(c);
                  break;
                }
              }
            }
          }
        } catch (e) {}
      }

      if (targetDistricts.size === 0 && currentPmtilesDistrictRef.current) {
        targetDistricts.add(currentPmtilesDistrictRef.current);
      }

      if (targetDistricts.size > 0) {
        syncCadastralPmtilesDistricts(map, Array.from(targetDistricts));
      }
    };

    resolveAndSyncDistrict();

    map.on('moveend', resolveAndSyncDistrict);
    map.on('zoom', resolveAndSyncDistrict);
    return () => {
      map.off('moveend', resolveAndSyncDistrict);
      map.off('zoom', resolveAndSyncDistrict);
    };
  }, [mapLoaded, selectedDistrict, activeLayers.district?.code, activeLayers.village, syncCadastralPmtilesDistricts]);

  // Synchronize in-memory preloaded GIS layers into MapLibre sources immediately on readiness
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !preloadedLayers) return;
    const map = mapRef.current;
    if (preloadedLayers.districtGeoJson) {
      const src = map.getSource('auto-zoom-district-source') as maplibregl.GeoJSONSource;
      if (src) src.setData(preloadedLayers.districtGeoJson);
    }
    if (preloadedLayers.talukGeoJson) {
      const src = map.getSource('auto-zoom-taluk-source') as maplibregl.GeoJSONSource;
      if (src) src.setData(preloadedLayers.talukGeoJson);
    }
    if (preloadedLayers.villageGeoJson) {
      const src = map.getSource('auto-zoom-village-source') as maplibregl.GeoJSONSource;
      if (src) src.setData(preloadedLayers.villageGeoJson);
    }
  }, [preloadedLayers, mapLoaded]);

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

  // Selected Parcel Outline (Static highlight without blinking animation per user request)
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    const parcelLayer = activeLayers.parcel;
    const hasParcel = parcelLayer && parcelLayer.geojson && parcelLayer.visible;
    const currentCode = parcelLayer?.code || null;
    const parcelColor = '#facc15';

    if (hasParcel) {
      if (map.getLayer('parcel-fill')) map.moveLayer('parcel-fill');
      if (map.getLayer('parcel-outline')) map.moveLayer('parcel-outline');
      if (map.getLayer('parcel-labels')) map.moveLayer('parcel-labels');

      prevParcelCodeRef.current = currentCode;

      if (map.getLayer('parcel-fill')) {
        map.setLayoutProperty('parcel-fill', 'visibility', 'visible');
        map.setPaintProperty('parcel-fill', 'fill-color', parcelColor);
        map.setPaintProperty('parcel-fill', 'fill-opacity', 0);
      }
      if (map.getLayer('parcel-outline')) {
        map.setLayoutProperty('parcel-outline', 'visibility', 'visible');
        map.setPaintProperty('parcel-outline', 'line-color', parcelColor);
        map.setPaintProperty('parcel-outline', 'line-width', 3.5);
      }
    } else {
      prevParcelCodeRef.current = null;
    }
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

        if (color && map.getLayer(fillLayer)) {
          map.setPaintProperty(fillLayer, 'fill-color', color);
          map.setPaintProperty(fillLayer, 'fill-opacity', 0);
        }
        if (color && map.getLayer(outlineLayer)) {
          map.setPaintProperty(outlineLayer, 'line-color', color);
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
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`bg-slate-950 overflow-hidden select-none transition-all duration-300 ${
        isFullscreen ? 'fixed inset-0 z-50 w-screen h-screen' : 'relative w-full h-full min-h-[500px]'
      } ${(searchOpen || isSidebarOpen) ? 'search-panel-open' : ''}`}
    >
      {/* Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full absolute inset-0" />

      {/* ─── Upload Mode Active Banner ─── */}
      {isUploadMode && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-30 bg-emerald-950/95 text-emerald-100 border border-emerald-500/60 backdrop-blur-xl px-4 py-2 rounded-full shadow-2xl flex items-center gap-3 text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-200">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <Upload className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Upload Mode ON — Drag & drop your .gpkg, .shp, or .geojson layer here</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-[10.5px] font-bold cursor-pointer transition-colors shadow-xs"
          >
            Browse File
          </button>
          <button
            type="button"
            onClick={() => setIsUploadMode(false)}
            className="p-1 text-emerald-300 hover:text-white rounded-full hover:bg-emerald-800/60 transition-colors cursor-pointer"
            title="Turn OFF Upload Mode"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ─── Drag & Drop Visual Overlay ─── */}
      {isDraggingFile && isUploadMode && (
        <div className="absolute inset-0 z-50 pointer-events-none bg-emerald-950/40 backdrop-blur-xs border-4 border-dashed border-emerald-400/80 flex flex-col items-center justify-center text-white transition-all animate-pulse">
          <div className="bg-slate-900/95 border border-emerald-500/50 p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-3">
            <div className="p-3 bg-emerald-500/20 rounded-full text-emerald-400">
              <Upload className="w-8 h-8" />
            </div>
            <div className="text-base font-bold text-emerald-200">Drop GeoJSON, Shapefile (.shp), or GeoPackage (.gpkg) here</div>
            <div className="text-xs text-slate-300">Georeferenced vector plots within Tamil Nadu will automatically project, resolve villages, and zoom</div>
          </div>
        </div>
      )}

      {/* ─── Dropped File Warning Toast ─── */}
      {droppedFileWarning && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 max-w-md bg-amber-500/95 text-slate-950 px-4 py-2.5 rounded-xl shadow-xl font-medium text-xs flex items-center gap-2.5 backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-200">
          <AlertCircle className="w-4 h-4 shrink-0 text-slate-950" />
          <span className="flex-1">{droppedFileWarning}</span>
          <button
            onClick={() => setDroppedFileWarning(null)}
            className="p-1 hover:bg-black/10 rounded-md transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ─── UNIFIED TOP HEADER BAR (Brand Logo + Filter Button + Breadcrumb Left + Clean Tools Right) ──────── */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-white/95 dark:bg-slate-900/90 text-slate-800 dark:text-slate-100 px-2.5 py-1 flex items-center justify-between gap-2 text-xs font-bold tracking-wide shadow-xs border-b border-slate-200/90 dark:border-slate-800/80 backdrop-blur-md overflow-visible">
        {/* Left: Brand Title + Breadcrumb Navigation */}
        <div className="flex-1 min-w-0 flex items-center gap-2 overflow-visible py-0.5 flex-nowrap">
          {/* Top-Left Website Brand Title */}
          <div className="flex items-center gap-2 pr-2.5 border-r border-slate-200 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-1.5 leading-none">
              <span className="text-[13px] font-black tracking-tight bg-gradient-to-r from-sky-600 via-teal-600 to-indigo-600 dark:from-sky-400 dark:via-teal-300 dark:to-indigo-300 bg-clip-text text-transparent">
                GIS Layer Navigator
              </span>
              <span className="text-[8.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-xs shadow-sky-500/30 shrink-0">
                TN
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              setHasStartedSearch(false);
              setDownloadOpen(false);
              handleResetSearchData();
              onBreadcrumbClick?.('state');
            }}
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
                  defaultColor="#facc15"
                  onChangeColor={onChangeLayerColor}
                />
                <BreadcrumbDropdown
                  label="District"
                  level="district"
                  items={multiBreadcrumb.districts}
                  selectedCode={selectedDistrict}
                  dotColor="bg-yellow-400"
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
                  defaultColor="#facc15"
                  onChangeColor={onChangeLayerColor}
                />
                <button
                  type="button"
                  onClick={() => onBreadcrumbClick?.('district')}
                  className="hover:text-yellow-600 dark:hover:text-yellow-300 transition-colors cursor-pointer whitespace-nowrap font-bold text-slate-800 dark:text-slate-100 px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
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

        {/* Zooming Layers Visibility Toggle (Taluk: T, Village: V, Parcel: P) placed horizontally near the moon symbol */}
        <div className="flex items-center bg-slate-100/90 dark:bg-slate-800/90 rounded-lg border border-slate-200/90 dark:border-slate-700/80 p-0.5 gap-1 shrink-0 ml-auto" title="Toggle Background Zooming Layers">
          {([
            { key: 'taluk', label: 'T', full: 'Taluk Zoom Layer', activeBadge: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-600/50' },
            { key: 'village', label: 'V', full: 'Village Zoom Layer', activeBadge: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-400 dark:border-yellow-500/60' },
            { key: 'parcel', label: 'P', full: 'Parcel Zoom Layer', activeBadge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-600/50' },
          ] as const).map(({ key, label, full, activeBadge }) => {
            const isVisible = zoomLayerVisibility[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleZoomLayer(key)}
                title={`${full}: ${isVisible ? 'Visible (Click to hide layer)' : 'Hidden (Click to show layer)'}`}
                className={`h-6 px-1.5 rounded-md flex items-center justify-center gap-0.5 relative transition-all cursor-pointer select-none active:scale-90 border ${
                  isVisible
                    ? `${activeBadge} shadow-2xs font-bold`
                    : 'bg-white/60 dark:bg-slate-900/50 text-slate-400 dark:text-slate-500 border-dashed border-slate-300 dark:border-slate-700 opacity-60'
                }`}
              >
                <span className="text-[11px] font-black tracking-tight leading-none">{label}</span>
                {isVisible ? (
                  <Eye className="w-2.5 h-2.5 stroke-[2.5]" />
                ) : (
                  <EyeOff className="w-2.5 h-2.5 stroke-[2.2] text-rose-500" />
                )}
              </button>
            );
          })}
        </div>

        {/* Right edge: Dark / White Theme Toggle */}
        {onToggleDarkMode && (
          <button
            type="button"
            onClick={onToggleDarkMode}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/90 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-amber-300 hover:text-amber-500 transition-all flex items-center justify-center cursor-pointer shrink-0 shadow-2xs active:scale-95 ml-1.5"
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



      {/* ─── BRIGHT FLOATING NAVIGATION TOGGLE BUTTON (Below Brand Title in Top-Left Corner) ─── */}
      <button
        type="button"
        onClick={() => {
          onToggleSidebar?.();
        }}
        title={isSidebarOpen ? 'Hide Navigation Panel (Expand Map)' : 'Open Search & Navigation Panel'}
        className={`absolute top-[46px] left-3 z-30 w-8 h-8 rounded-xl border flex items-center justify-center cursor-pointer shadow-lg active:scale-95 transition-all duration-200 group ${
          isSidebarOpen
            ? 'bg-gradient-to-br from-cyan-400 to-sky-600 text-white border-white/80 shadow-sky-500/50 ring-2 ring-cyan-400/60 hover:brightness-110'
            : 'bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-600 text-white border-white/90 shadow-lg shadow-sky-500/60 ring-2 ring-cyan-400/70 hover:scale-105 hover:brightness-115 animate-in fade-in zoom-in-95'
        }`}
      >
        {isSidebarOpen ? (
          <Minimize2 className="w-4 h-4 stroke-[2.5] transition-transform duration-200 group-hover:scale-110" />
        ) : (
          <Maximize2 className="w-4 h-4 stroke-[2.5] transition-transform duration-200 group-hover:scale-110" />
        )}
      </button>

      {/* ─── DRAGGABLE & RESIZABLE SEARCH & FILTER POPOVER (Anchored below toggle button) ─── */}
      <div
        className={`absolute top-[88px] left-3 z-30 bg-white/98 dark:bg-slate-900/98 backdrop-blur-2xl rounded-2xl shadow-2xl border-2 border-cyan-400 dark:border-cyan-400 shadow-cyan-500/20 p-2 flex flex-col gap-1 ${
          (searchOpen || isSidebarOpen)
            ? 'animate-in fade-in slide-in-from-top-2 duration-150'
            : 'hidden pointer-events-none'
        }`}
        ref={searchPanelRef}
        style={{
          ...navDrag.style,
          width: panelWidth ? `${panelWidth}px` : undefined,
          height: panelHeight ? `${panelHeight}px` : undefined,
          maxHeight: 'calc(100vh - 110px)',
          minWidth: '240px',
          maxWidth: 'calc(100vw - 40px)',
          display: (searchOpen || isSidebarOpen) ? undefined : 'none',
        }}
      >
        {/* Top Drag Handle Grip Bar (Drag anywhere here to reposition panel) */}
        <div
          onMouseDown={navDrag.handleMouseDown}
          className="w-full flex items-center justify-center py-1 cursor-grab active:cursor-grabbing hover:bg-slate-100 dark:hover:bg-slate-800/60 rounded-t-xl transition-colors group select-none"
          title="Drag to move panel"
        >
          <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-cyan-500 transition-colors" />
        </div>

        <SearchBar
          resetKey={searchResetKey}
          onSelectResult={(result) => {
            setHasStartedSearch(true);
            onSearchResultSelect?.(result);
          }}
          onSearchStart={() => setHasStartedSearch(true)}
          placeholder={
            breadcrumb?.parcelName
              ? `Selected: Survey ${breadcrumb.parcelName} · Search again...`
              : breadcrumb?.villageName
              ? `Selected: Village ${breadcrumb.villageName} · Search again...`
              : breadcrumb?.talukName
              ? `Selected: Taluk ${breadcrumb.talukName} · Search again...`
              : breadcrumb?.districtName
              ? `Selected: District ${breadcrumb.districtName} · Search again...`
              : "Search district, taluk, village, survey..."
          }
          autoFocus={false}
          onToggleSidebar={onToggleSidebar}
          isSidebarOpen={isSidebarOpen}
          onRefreshMap={() => {
            setHasStartedSearch(false);
            setDownloadOpen(false);
            handleResetSearchData();
            if (onReset) onReset();
            if (onBreadcrumbClick) onBreadcrumbClick('state');
          }}
        />

        {/* Mode 2: Filter Navigation Panel Dropdown */}
        {isSidebarOpen && (
          <div className="flex-1 max-h-[calc(100vh-180px)] overflow-y-auto overflow-x-visible pr-1 animate-in fade-in slide-in-from-top-2 duration-200">
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
              onDistrictSelect={(code) => {
                setHasStartedSearch(true);
                onDistrictSelect?.(code);
              }}
              onTalukSelect={(code) => {
                setHasStartedSearch(true);
                onTalukSelect?.(code);
              }}
              onVillageSelect={(code) => {
                setHasStartedSearch(true);
                onVillageSelect?.(code);
              }}
              onParcelSelect={(code) => {
                setHasStartedSearch(true);
                onParcelSelect?.(code);
              }}
              onBackStep={onBackStep || (() => {})}
              onResetAll={() => {
                setHasStartedSearch(false);
                setDownloadOpen(false);
                handleResetSearchData();
                onReset?.();
              }}
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

        {/* Right-Edge Horizontal Width Resizer */}
        <div
          onMouseDown={handlePanelResizeStart('right')}
          className="absolute top-0 right-0 w-2.5 h-full cursor-ew-resize hover:bg-cyan-400/40 active:bg-cyan-500/50 transition-colors rounded-r-2xl z-20"
          title="Drag to adjust width"
        />

        {/* Bottom-Right Corner 2D Resizer Grip */}
        <div
          onMouseDown={handlePanelResizeStart('corner')}
          className="absolute bottom-1 right-1 w-5 h-5 cursor-nwse-resize flex items-center justify-center text-slate-400 hover:text-cyan-500 active:text-cyan-600 transition-colors z-20 select-none"
          title="Drag corner to adjust width & height"
        >
          <svg className="w-3.5 h-3.5 stroke-current opacity-70 hover:opacity-100" viewBox="0 0 10 10" fill="none">
            <line x1="8" y1="2" x2="2" y2="8" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="8" y1="5" x2="5" y2="8" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="8" y1="8" x2="8" y2="8" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* ─── TOP-RIGHT TOOL DOCK (Basemap, Draw, Layer Cart, Fullscreen) ─── */}
      <div className="absolute top-12 right-3 z-30 flex flex-col items-center gap-1.5">

        {/* 3. Basemap */}
        <div className="relative" ref={basemapRef}>
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
            <MapIcon className="w-3.5 h-3.5 stroke-[2.2]" />
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
              handleClearDraw();
            } else {
              handleClearDraw();
              setDrawMode('polygon');
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


        {/* 📤 Upload Layer Overlay Mode Toggle */}
        <button
          type="button"
          onClick={() => {
            setIsUploadMode((prev) => {
              const next = !prev;
              if (next) {
                setDroppedFileWarning("Upload Mode ON: Drag & drop your .geojson, .shp, or .gpkg file directly onto the map (or click to browse)");
                setTimeout(() => setDroppedFileWarning(null), 4500);
              }
              return next;
            });
          }}
          title={isUploadMode ? "Upload Mode ON (Click to turn off)" : "Turn ON Upload Mode to enable dragging & dropping layers (.gpkg, .shp, .geojson)"}
          className={`w-8 h-8 rounded-xl backdrop-blur-md border shadow-md flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
            isUploadMode
              ? 'bg-gradient-to-tr from-emerald-500 to-teal-600 text-white border-emerald-300 shadow-emerald-500/40 ring-2 ring-emerald-400/50 scale-105'
              : 'bg-white/95 dark:bg-slate-900/95 border-sky-200 dark:border-sky-800/80 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/60 hover:border-sky-400'
          }`}
        >
          <Upload className="w-3.5 h-3.5 stroke-[2.3]" />
        </button>

        {/* Hidden input for file browse */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".gpkg,.shp,.geojson,.json"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* 📥 Download Scope & Export (Shows after start search through search panel) */}
        {shouldShowDownloadIcon && (
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
            className={`w-8 h-8 rounded-xl backdrop-blur-md border shadow-md flex items-center justify-center transition-all cursor-pointer active:scale-95 animate-in fade-in zoom-in-95 duration-200 ${
              downloadOpen
                ? 'bg-gradient-to-tr from-sky-600 to-indigo-600 text-white border-sky-400 shadow-sky-500/30 ring-2 ring-sky-400/40'
                : 'bg-white/95 dark:bg-slate-900/95 border-sky-200 dark:border-sky-800/80 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/60 hover:border-sky-400'
            }`}
          >
            <Download className="w-3.5 h-3.5 stroke-[2.3]" />
          </button>
        )}
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

      {/* User-Dropped Georeferenced Overlay Floating Info Card */}
      {droppedLayerInfo && (
        <div
          className="absolute bottom-20 right-3 z-30 w-84 sm:w-96 max-h-[82vh] overflow-y-auto bg-white/98 dark:bg-slate-900/98 backdrop-blur-2xl border-2 border-sky-400/90 dark:border-sky-500/80 rounded-2xl shadow-2xl p-3 text-slate-800 dark:text-slate-100 animate-in fade-in slide-in-from-bottom-3 duration-200 cursor-grab active:cursor-grabbing flex flex-col gap-2"
          style={droppedDrag.style}
          onMouseDown={droppedDrag.handleMouseDown}
        >
          {/* Top Grip Handle */}
          <div className="w-full flex items-center justify-center -mt-1 pb-1 opacity-60 hover:opacity-100 transition-opacity">
            <div className="w-10 h-1 rounded-full bg-sky-500/70 dark:bg-sky-400/70" />
          </div>

          {/* Header Row */}
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 shrink-0">
                <FileCode className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold truncate" title={droppedLayerInfo.fileName}>
                  {droppedLayerInfo.fileName}
                </div>
                <div className="flex items-center gap-1.5 text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                  <span className="px-1.5 py-0.2 rounded bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-black text-[8px] uppercase tracking-wider">
                    {droppedLayerInfo.fileName.toLowerCase().endsWith('.gpkg') ? 'GeoPackage' : droppedLayerInfo.fileName.toLowerCase().endsWith('.shp') ? 'Shapefile' : 'GeoJSON'}
                  </span>
                  <span>Custom Overlay</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setIsDroppedLayerVisible((v) => !v)}
                title={isDroppedLayerVisible ? 'Hide Layer' : 'Show Layer'}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-sky-500 dark:hover:text-sky-400 transition-colors cursor-pointer"
              >
                {isDroppedLayerVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
              </button>
              <button
                type="button"
                onClick={handleZoomToDroppedLayer}
                title="Zoom to Layer"
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-sky-500 dark:hover:text-sky-400 transition-colors cursor-pointer"
              >
                <Crosshair className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleRemoveDroppedLayer}
                title="Remove Layer"
                className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-500 hover:text-rose-500 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Multi-Layer Switcher Tabs (for GeoPackage with multiple vector tables) */}
          {droppedLayerInfo.layerNames && droppedLayerInfo.layerNames.length > 1 && (
            <div className="flex items-center gap-1 p-1 bg-slate-100/90 dark:bg-slate-800/90 rounded-xl">
              {droppedLayerInfo.layerNames.map((lName) => {
                const isSelected = droppedLayerInfo.currentLayerName === lName;
                const layerObj = droppedLayerInfo.layers?.[lName];
                const count = layerObj?.featureCount ?? 0;
                return (
                  <button
                    key={lName}
                    type="button"
                    onClick={() => handleSwitchGpkgLayer(lName)}
                    className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-bold transition-all truncate cursor-pointer ${
                      isSelected
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/70'
                    }`}
                    title={`${lName} (${count} features)`}
                  >
                    <span className="truncate">{lName}</span>
                    <span className="ml-1 opacity-80 text-[9px] font-mono">({count})</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <div className="bg-slate-100/70 dark:bg-slate-800/70 rounded-xl px-2.5 py-1.5 flex flex-col">
              <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Features</span>
              <span className="font-extrabold text-sky-600 dark:text-sky-400 text-xs">
                {droppedLayerInfo.selectedVillageFilter ? `Filtered Plot(s)` : `${droppedLayerInfo.featureCount} Plots`}
              </span>
            </div>
            <div className="bg-slate-100/70 dark:bg-slate-800/70 rounded-xl px-2.5 py-1.5 flex flex-col">
              <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Geometry</span>
              <span className="font-extrabold text-slate-700 dark:text-slate-200 truncate">{droppedLayerInfo.geomTypes.join(', ') || 'Polygon'}</span>
            </div>
            {droppedLayerInfo.areaAcres !== undefined && droppedLayerInfo.areaAcres > 0 && (
              <div className="bg-slate-100/70 dark:bg-slate-800/70 rounded-xl px-2.5 py-1.5 flex flex-col col-span-2">
                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Total Area</span>
                <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-xs">{droppedLayerInfo.areaAcres.toLocaleString()} Acres</span>
              </div>
            )}
            {droppedLayerInfo.lengthKm !== undefined && (
              <div className="bg-slate-100/70 dark:bg-slate-800/70 rounded-xl px-2.5 py-1.5 flex flex-col col-span-2">
                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">Total Length</span>
                <span className="font-extrabold text-indigo-600 dark:text-indigo-400 text-xs">{droppedLayerInfo.lengthKm.toLocaleString()} km</span>
              </div>
            )}
          </div>

          {/* Location Hierarchy: District, Taluk, Village Breakdown */}
          <div className="pt-1.5 border-t border-slate-200/70 dark:border-slate-800/70 space-y-1.5 text-[10px]">
            {/* District */}
            <div className="flex items-center justify-between bg-slate-100/70 dark:bg-slate-800/70 rounded-xl px-2.5 py-1.5">
              <span className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[8.5px]">District</span>
              <div className="flex items-center gap-1.5 font-extrabold text-slate-800 dark:text-slate-100">
                <span>{droppedLayerInfo.districtName || 'Resolving...'}</span>
                {droppedLayerInfo.districtCode && (
                  <span className="px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-400 font-mono text-[9px]">
                    Code: {droppedLayerInfo.districtCode}
                  </span>
                )}
              </div>
            </div>

            {/* Taluk(s) */}
            <div className="flex items-center justify-between bg-slate-100/70 dark:bg-slate-800/70 rounded-xl px-2.5 py-1.5">
              <span className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[8.5px]">
                {droppedLayerInfo.taluks && droppedLayerInfo.taluks.length > 1 ? `Taluks (${droppedLayerInfo.taluks.length})` : 'Taluk'}
              </span>
              <div className="flex items-center gap-1.5 font-extrabold text-slate-800 dark:text-slate-100 text-right">
                <span className="max-w-[200px] truncate" title={droppedLayerInfo.talukName}>
                  {droppedLayerInfo.talukName || '—'}
                </span>
                {droppedLayerInfo.talukCode && (
                  <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-mono text-[9px]">
                    Code: {droppedLayerInfo.talukCode}
                  </span>
                )}
              </div>
            </div>

            {/* Village(s) Breakdown: Multi-Village Accordion or Single Village Row */}
            {droppedLayerInfo.villages && droppedLayerInfo.villages.length > 1 ? (
              <div className="bg-slate-100/70 dark:bg-slate-800/70 rounded-xl overflow-hidden border border-slate-200/80 dark:border-slate-700/60">
                {/* Accordion Toggle Header */}
                <button
                  type="button"
                  onClick={() => setIsVillageListExpanded((v) => !v)}
                  className="w-full flex items-center justify-between px-2.5 py-2 hover:bg-slate-200/50 dark:hover:bg-slate-700/40 transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-extrabold text-slate-800 dark:text-slate-100 text-[10px]">
                      {droppedLayerInfo.totalVillages || droppedLayerInfo.villages.length} Villages Involved
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {droppedLayerInfo.selectedVillageFilter && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFilterGpkgVillage(null);
                        }}
                        className="px-1.5 py-0.5 rounded-md bg-sky-500 text-white text-[8.5px] font-bold hover:bg-rose-500 transition-colors"
                        title="Click to reset filter"
                      >
                        Reset Filter ✕
                      </span>
                    )}
                    {isVillageListExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                    )}
                  </div>
                </button>

                {/* Expanded Multi-Village List with Plot Counts */}
                {isVillageListExpanded && (
                  <div className="p-1.5 border-t border-slate-200/60 dark:border-slate-700/60 max-h-48 overflow-y-auto space-y-1">
                    <div className="px-1 text-[8.5px] font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
                      <span>Click village to filter/zoom:</span>
                      {droppedLayerInfo.selectedVillageFilter && (
                        <button
                          type="button"
                          onClick={() => handleFilterGpkgVillage(null)}
                          className="text-sky-600 dark:text-sky-400 font-bold hover:underline cursor-pointer"
                        >
                          Show All Plots
                        </button>
                      )}
                    </div>
                    {droppedLayerInfo.villages.map((v) => {
                      const isFiltered = droppedLayerInfo.selectedVillageFilter === v.code || droppedLayerInfo.selectedVillageFilter === v.name;
                      return (
                        <div
                          key={v.code || v.name}
                          onClick={() => handleFilterGpkgVillage(isFiltered ? null : (v.code || v.name))}
                          className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-all ${
                            isFiltered
                              ? 'bg-sky-500/20 border border-sky-400 text-sky-800 dark:text-sky-200'
                              : 'hover:bg-slate-200/60 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="min-w-0 pr-1">
                            <div className="font-bold text-[10px] truncate">{v.name}</div>
                            <div className="flex items-center gap-1 text-[8.5px] text-slate-500 dark:text-slate-400">
                              {v.taluk && <span>{v.taluk}</span>}
                              {v.code && <span className="font-mono">[{v.code}]</span>}
                            </div>
                          </div>
                          <span className={`px-1.5 py-0.5 rounded-md font-mono text-[9px] font-bold shrink-0 ${
                            isFiltered ? 'bg-sky-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                          }`}>
                            {v.count} plots
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between bg-slate-100/70 dark:bg-slate-800/70 rounded-xl px-2.5 py-1.5">
                <span className="text-slate-500 dark:text-slate-400 font-bold uppercase text-[8.5px]">Village</span>
                <div className="flex items-center gap-1.5 font-extrabold text-slate-800 dark:text-slate-100">
                  <span>{droppedLayerInfo.villageName || '—'}</span>
                  {droppedLayerInfo.villageCode && (
                    <span className="px-1.5 py-0.5 rounded-md bg-teal-500/15 text-teal-600 dark:text-teal-400 font-mono text-[9px]">
                      Code: {droppedLayerInfo.villageCode}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="pt-1 border-t border-slate-200/60 dark:border-slate-800/60 text-[9px] text-slate-500 dark:text-slate-400 text-center">
            Click any vector plot on map to inspect cadastral properties
          </div>
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
        <div className={`absolute top-12 z-20 bg-white/95 dark:bg-slate-900/90 text-slate-800 dark:text-white backdrop-blur-md px-3 py-1.5 rounded-xl shadow-md border border-slate-200 dark:border-slate-700/60 flex items-center gap-2 text-xs font-mono animate-in fade-in duration-150 transition-all ${
          (searchOpen || isSidebarOpen) ? 'left-3 sm:left-[350px]' : 'left-3'
        }`}>
          <Info className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400 shrink-0" />
          <span className="text-sky-600 dark:text-sky-400 font-bold uppercase text-[10px]">{hoveredFeature.level}:</span>
          <span className="font-semibold text-slate-800 dark:text-slate-100">{hoveredFeature.name}</span>
          <span className="text-slate-500 dark:text-slate-400 text-[10px]">({hoveredFeature.code})</span>
        </div>
      )}

      {/* Floating Bottom Left Back & Reset Controls (Primary navigation controls) */}
      {onBackStep && (selectedLevel !== 'none' || Boolean(selectedDistrict) || (multiDistricts && multiDistricts.length > 0)) && (
        <div
          className={`absolute bottom-11 z-40 animate-in fade-in slide-in-from-bottom-2 duration-200 flex items-center gap-2 transition-all duration-300 ${
            (isSidebarOpen || searchOpen)
              ? 'left-1/2 -translate-x-1/2 sm:left-[350px] sm:translate-x-0'
              : 'left-3'
          }`}
        >
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
                handleResetSearchData();
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
        clipPolygon={activeClipPolygon || extractedResult?.polygonGeojson || null}
        drawnAreaAcres={extractedResult?.totalAreaAcres}
        activeVillageLayer={clippedVillageLayer || activeLayers.village}
        activeParcelLayer={clippedParcelLayer || activeLayers.parcel}
        selectedVillageName={breadcrumb?.villageName}
        multiVillageNames={multiBreadcrumb?.villages?.map((v) => v.name)}
        multiVillageCodes={clippedVillageCodes.length > 0 ? clippedVillageCodes : multiVillages}
        districtCode={clippedDistrictCode || selectedDistrict}
        talukCode={clippedTalukCode || selectedTaluk}
        villageCode={clippedVillageCode || selectedVillage}
        fileType={layerType}
        isDarkMode={isDarkMode}
        initialCounts={clippedPreviewCounts}
        clippedFeatures={clippedFeaturesList}
      />
    </div>
  );
};
