import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  DistrictItem,
  TalukItem,
  VillageItem,
  ParcelItem,
  ActiveGisLayer,
  GisLevel,
  GisMetadata,
  SearchResult,
  BasemapStyle,
  ExtractedLayerResult,
} from './types';
import { GisMap } from './components/GisMap';
import { NavigationPanel } from './components/NavigationPanel';
import { LayerInspector } from './components/LayerInspector';
import { DownloadScopePanel } from './components/DownloadScopePanel';
import { CART_LAYERS_CONFIG } from './cartLayersConfig';
import { getFeatureBBox } from './utils/geoUtils';
import { MULTI_SELECTION_PALETTE } from './utils/colorUtils';
import { apiUrl, API_BASE } from '@/frontend/lib/api';
import { DataNotAvailableModal, NoDataInfo } from './components/DataNotAvailableModal';

// Ensure clean state on opening the application (no default data or auto-zoom)
try {
  sessionStorage.removeItem('gis_active_selection_state_v2');
} catch (e) {}

export default function App() {
  const [preloadedLayers, setPreloadedLayers] = useState<any>(null);
  // Resizable Sidebar Splitter & Toggle State
  const [sidebarWidth, setSidebarWidth] = useState<number>(300);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // Handle Drag Resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      // Clamp sidebar width between 240px and 450px (or window.innerWidth - 300)
      const maxWidth = Math.min(480, window.innerWidth - 300);
      const newWidth = Math.max(240, Math.min(e.clientX, maxWidth));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    if (isResizing) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);
  // Dropdown lists
  const [districts, setDistricts] = useState<DistrictItem[]>([]);
  const [taluks, setTaluks] = useState<TalukItem[]>([]);
  const [villages, setVillages] = useState<VillageItem[]>([]);
  const [parcels, setParcels] = useState<ParcelItem[]>([]);

  // Selected codes (single-select preview — drives the map, always starts clean with no default selection)
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [selectedTaluk, setSelectedTaluk] = useState<string>('');
  const [selectedVillage, setSelectedVillage] = useState<string>('');
  const [selectedParcel, setSelectedParcel] = useState<string>('');
  // Layer Format Mode (vector: Base Boundary by default, fmb: FMB Subdivisions)
  const [layerType, setLayerType] = useState<'fmb' | 'vector'>('vector');
  const [subdivisionColor, setSubdivisionColor] = useState<string>('#facc15');

  // Polygon Extraction State
  const [extractedPolygonResult, setExtractedPolygonResult] = useState<ExtractedLayerResult | null>(null);

  // Data Not Available Pop-up state
  const [noDataInfo, setNoDataInfo] = useState<NoDataInfo | null>(null);

  // Multi-select download basket (independent of map preview)
  const [multiDistricts, setMultiDistricts] = useState<string[]>([]);
  const [multiTaluks, setMultiTaluks] = useState<string[]>([]);
  const [multiVillages, setMultiVillages] = useState<string[]>([]);
  const [multiParcels, setMultiParcels] = useState<string[]>([]);

  const handleToggleMultiDistrict = (code: string) => {
    setMultiDistricts((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      if (next.length === 1) setSelectedDistrict(next[0]);
      return next;
    });
  };

  const handleToggleMultiTaluk = (code: string) => {
    setMultiTaluks((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      if (next.length === 1) setSelectedTaluk(next[0]);
      return next;
    });
  };

  const handleToggleMultiVillage = (code: string) => {
    setMultiVillages((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      if (next.length === 1) setSelectedVillage(next[0]);
      return next;
    });
  };

  const handleToggleMultiParcel = (code: string) => {
    setMultiParcels((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      if (next.length === 1) setSelectedParcel(next[0]);
      return next;
    });
  };

  // Helper to fetch and merge multiple GeoJSONs for multi-selection map preview
  const updateMultiLayer = async (
    level: GisLevel,
    codes: string[],
    distCode?: string,
    talCode?: string,
    vilCode?: string
  ) => {
    if (codes.length === 0) return;
    try {
      const layers = await Promise.all(
        codes.map((c) => {
          const cleanC = c.trim();
          if (level === 'district') {
            const dObj = districts.find((d) => d.code === cleanC || d.name.toLowerCase() === cleanC.toLowerCase() || d.code.endsWith(`_${cleanC}`));
            const codeToFetch = dObj ? dObj.code : cleanC;
            return fetchGeoJSON('district', codeToFetch);
          } else if (level === 'taluk') {
            const tObj = taluks.find((t) => t.code === cleanC || t.name.toLowerCase() === cleanC.toLowerCase() || t.code.endsWith(`_${cleanC}`));
            const codeToFetch = tObj ? tObj.code : cleanC;
            const dC = tObj?.district_code || distCode;
            return fetchGeoJSON('taluk', codeToFetch, dC);
          } else if (level === 'village') {
            const vObj = villages.find((v) => v.code === cleanC || v.name.toLowerCase() === cleanC.toLowerCase() || v.code.endsWith(`_${cleanC}`));
            const codeToFetch = vObj ? vObj.code : cleanC;
            const dC = vObj?.district_code || distCode;
            const tC = vObj?.taluk_code || talCode;
            const rawTal = (tC || '').includes('_') ? (tC || '').split('_').pop()! : (tC || '');
            const rawVil = codeToFetch.includes('_') ? codeToFetch.split('_').pop()! : codeToFetch;
            return fetchGeoJSON('village', codeToFetch, dC, rawTal, rawVil, layerType);
          } else if (level === 'parcel') {
            const pObj = parcels.find((p) => p.code === cleanC || p.name.toLowerCase() === cleanC.toLowerCase() || p.survey_no === cleanC);
            const codeToFetch = pObj ? pObj.code : cleanC;
            const dC = pObj?.district_code || distCode;
            const tC = pObj?.taluk_code || talCode;
            const vC = pObj?.village_code || vilCode;
            return fetchGeoJSON('parcel', codeToFetch, dC, tC, vC);
          }
          return fetchGeoJSON(level, cleanC, distCode, talCode, vilCode);
        })
      );
      const validLayers = layers.filter(Boolean) as ActiveGisLayer[];
      if (validLayers.length === 0) return;

      const combinedFeatures = validLayers.flatMap((l, lIdx) => {
        const feats = l.geojson?.features || [];
        const layerColor = MULTI_SELECTION_PALETTE[lIdx % MULTI_SELECTION_PALETTE.length];
        return feats.map((f: any) => ({
          ...f,
          properties: {
            ...(f.properties || {}),
            _multiColor: layerColor,
          },
        }));
      });

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      combinedFeatures.forEach((f: any) => {
        const b = getFeatureBBox(f);
        if (b) {
          if (b[0] < minX) minX = b[0];
          if (b[1] < minY) minY = b[1];
          if (b[2] > maxX) maxX = b[2];
          if (b[3] > maxY) maxY = b[3];
        }
      });

      const combinedBbox: [number, number, number, number] =
        minX !== Infinity && maxX !== -Infinity ? [minX, minY, maxX, maxY] : validLayers[0].bbox;

      const combinedBaseFeatures = validLayers.flatMap((l) => l.base_geojson?.features || []);

      const combinedLayer: ActiveGisLayer = {
        level,
        code: codes.join(','),
        name: `${codes.length} ${level}s selected`,
        geojson: { type: 'FeatureCollection', features: combinedFeatures },
        base_geojson: combinedBaseFeatures.length > 0 ? { type: 'FeatureCollection', features: combinedBaseFeatures } : undefined,
        bbox: combinedBbox,
        visible: true,
        opacity: 0,
      };

      setActiveLayers((prev) => ({
        ...prev,
        [level]: combinedLayer,
      }));
      setZoomRequestLevel(level);
    } catch (err) {
      console.error(`Failed to update multi layer for ${level}:`, err);
    }
  };

  // Sync multi-district map preview and load child taluks
  useEffect(() => {
    if (multiDistricts.length >= 1) {
      updateMultiLayer('district', multiDistricts);
      setZoomRequestLevel('district');
      // Fetch combined taluks for all selected districts
      setLoadingTaluks(true);
      fetch(`${API_BASE}/api/taluks?district_code=${multiDistricts.join(',')}`)
        .then((res) => res.json())
        .then((raw) => {
          setTaluks((Array.isArray(raw) ? raw : (raw.data || [])).map((t: any) => ({
            code: t.code ?? t.taluk_code,
            name: t.name ?? t.taluk_name,
            district_code: t.district_code ?? '',
            bbox: t.bbox ?? [],
            file_path: t.file_path ?? '',
            geojson_path: t.geojson_path ?? '',
          })));
        })
        .catch(console.error)
        .finally(() => setLoadingTaluks(false));
    } else if (multiDistricts.length === 0 && !selectedDistrict) {
      setActiveLayers((prev) => ({ ...prev, district: null }));
    }
  }, [multiDistricts]);

  // Sync multi-taluk map preview and load child villages
  useEffect(() => {
    if (multiTaluks.length >= 1) {
      updateMultiLayer('taluk', multiTaluks, selectedDistrict);
      // Fetch combined villages for all selected taluks
      setLoadingVillages(true);
      fetch(`${API_BASE}/api/villages?district_code=${selectedDistrict}&taluk_code=${multiTaluks.join(',')}`)
        .then((res) => res.json())
        .then((raw) => {
          setVillages((Array.isArray(raw) ? raw : (raw.data || [])).map((v: any) => ({
            code: v.code ?? v.village_code,
            name: v.name ?? v.village_name,
            taluk_code: v.taluk_code ?? '',
            district_code: v.district_code ?? '',
            bbox: v.bbox ?? [],
            file_path: v.file_path ?? '',
            geojson_path: v.geojson_path ?? '',
          })));
        })
        .catch(console.error)
        .finally(() => setLoadingVillages(false));
    }
  }, [multiTaluks, selectedDistrict]);

  // Sync multi-village map preview and load child parcels
  useEffect(() => {
    if (multiVillages.length >= 1) {
      updateMultiLayer('village', multiVillages, selectedDistrict, selectedTaluk);
      // Fetch combined parcels for all selected villages
      setLoadingParcels(true);
      fetch(`${API_BASE}/api/parcels?district_code=${selectedDistrict}&taluk_code=${selectedTaluk}&village_code=${multiVillages.join(',')}&type=${layerType}`)
        .then((res) => res.json())
        .then((raw) => {
          setParcels((Array.isArray(raw) ? raw : (raw.data || [])).map((p: any) => ({
            code: p.code ?? p.parcel_code ?? p.survey_code,
            name: p.name ?? p.parcel_name ?? String(p.survey_no ?? ''),
            survey_no: p.survey_no ?? '',
            base_survey: p.base_survey,
            subdivision: p.subdivision,
            district_code: p.district_code,
            taluk_code: p.taluk_code,
            village_code: p.village_code,
            land_type: p.land_type,
            area_acres: p.area_acres,
            file_path: p.file_path,
            geojson_path: p.geojson_path,
          })));
        })
        .catch(console.error)
        .finally(() => setLoadingParcels(false));
    }
  }, [multiVillages, selectedDistrict, selectedTaluk, layerType]);

  // Sync multi-parcel map preview
  useEffect(() => {
    if (multiParcels.length >= 1) {
      updateMultiLayer('parcel', multiParcels, selectedDistrict, selectedTaluk, selectedVillage);
    }
  }, [multiParcels, selectedDistrict, selectedTaluk, selectedVillage]);

  // Multi-breadcrumb selection handler
  const handleMultiItemSelect = async (level: GisLevel, code?: string) => {
    if (!code) {
      if (level === 'district' && multiDistricts.length >= 2) {
        await updateMultiLayer('district', multiDistricts);
      } else if (level === 'taluk' && multiTaluks.length >= 2) {
        await updateMultiLayer('taluk', multiTaluks, selectedDistrict);
      } else if (level === 'village' && multiVillages.length >= 2) {
        await updateMultiLayer('village', multiVillages, selectedDistrict, selectedTaluk);
      } else if (level === 'parcel' && multiParcels.length >= 2) {
        await updateMultiLayer('parcel', multiParcels, selectedDistrict, selectedTaluk, selectedVillage);
      }
      setZoomRequestLevel(level);
      return;
    }

    // Specific item clicked in ribbon dropdown -> Focus on that specific item for the next drilldown step while KEEPING all other selected items in multiDistricts/map!
    if (level === 'district') {
      setSelectedDistrict(code);
      setLoadingTaluks(true);
      try {
        const res = await fetch(`${API_BASE}/api/taluks?district_code=${code}`);
        const json = await res.json();
        const raw = Array.isArray(json) ? json : (json.data || []);
        setTaluks(raw.map((t: any) => ({
          code: t.code ?? t.taluk_code,
          name: t.name ?? t.taluk_name,
          district_code: t.district_code ?? code,
          bbox: t.bbox ?? [],
          file_path: t.file_path ?? '',
          geojson_path: t.geojson_path ?? '',
        })));
      } catch (err) {
        console.error('Failed to fetch taluks:', err);
      } finally {
        setLoadingTaluks(false);
      }
    } else if (level === 'taluk') {
      setSelectedTaluk(code);
      let distCode = selectedDistrict;
      if (code.includes('_')) {
        const parts = code.split('_');
        if (parts.length >= 2) distCode = parts[0];
      }
      setLoadingVillages(true);
      try {
        const res = await fetch(`${API_BASE}/api/villages?district_code=${distCode}&taluk_code=${code}`);
        const json = await res.json();
        const raw = Array.isArray(json) ? json : (json.data || []);
        setVillages(raw.map((v: any) => ({
          code: v.code ?? v.village_code,
          name: v.name ?? v.village_name,
          taluk_code: v.taluk_code ?? code,
          district_code: v.district_code ?? distCode,
          bbox: v.bbox ?? [],
          file_path: v.file_path ?? '',
          geojson_path: v.geojson_path ?? '',
        })));
      } catch (err) {
        console.error('Failed to fetch villages:', err);
      } finally {
        setLoadingVillages(false);
      }
    } else if (level === 'village') {
      setSelectedVillage(code);
      let distCode = selectedDistrict;
      let talCode = selectedTaluk;
      if (code.includes('_')) {
        const parts = code.split('_');
        if (parts.length >= 3) {
          distCode = parts[0];
          talCode = parts[1];
        }
      }
      const rawTal = (talCode || '').includes('_') ? (talCode || '').split('_').pop()! : (talCode || '');
      const rawVil = code.includes('_') ? code.split('_').pop()! : code;
      setLoadingParcels(true);
      try {
        const res = await fetch(`${API_BASE}/api/parcels?district_code=${distCode}&taluk_code=${rawTal}&village_code=${rawVil}&type=${layerType}`);
        const json = await res.json();
        const raw = Array.isArray(json) ? json : (json.data || []);
        setParcels(raw.map((p: any) => ({
          code: p.code ?? p.parcel_code ?? p.survey_code,
          name: p.name ?? p.parcel_name ?? String(p.survey_no ?? ''),
          survey_no: p.survey_no ?? '',
          base_survey: p.base_survey,
          subdivision: p.subdivision,
          village_code: p.village_code ?? code,
          taluk_code: p.taluk_code ?? talCode,
          district_code: p.district_code ?? distCode,
          land_type: p.land_type,
          area_acres: p.area_acres,
          bbox: p.bbox ?? [],
          file_path: p.file_path ?? '',
          geojson_path: p.geojson_path ?? '',
        })));
      } catch (err) {
        console.error('Failed to fetch parcels:', err);
      } finally {
        setLoadingParcels(false);
      }
    } else if (level === 'parcel') {
      setSelectedParcel(code);
    }
  };

  // Load states
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingTaluks, setLoadingTaluks] = useState(false);
  const [loadingVillages, setLoadingVillages] = useState(false);
  const [loadingParcels, setLoadingParcels] = useState(false);
  const [loadingMetadata, setLoadingMetadata] = useState(false);

  // Active Map Layers
  const [activeLayers, setActiveLayers] = useState<Record<GisLevel, ActiveGisLayer | null>>({
    district: null,
    taluk: null,
    village: null,
    parcel: null,
  });

  // Persistent 15 GIS Cart Overlays State (Active across all District/Taluk/Village/Parcel levels)
  const [activeCartLayers, setActiveCartLayers] = useState<Record<string, boolean>>({});

  const handleToggleCartLayer = (layerId: string) => {
    setActiveCartLayers((prev) => ({
      ...prev,
      [layerId]: !prev[layerId],
    }));
  };

  const handleToggleAllCartLayers = (enable: boolean) => {
    setActiveCartLayers(() => {
      const next: Record<string, boolean> = {};
      CART_LAYERS_CONFIG.forEach((l) => {
        next[l.id] = enable;
      });
      return next;
    });
  };

  // Basemap style & theme
  const [basemapStyle, setBasemapStyle] = useState<BasemapStyle>('esri-satellite');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [metadata, setMetadata] = useState<GisMetadata | null>(null);

  // Derive current highest level
  const currentLevel: GisLevel | 'none' = (selectedParcel || multiParcels.length > 0)
    ? 'parcel'
    : (selectedVillage || multiVillages.length > 0)
    ? 'village'
    : (selectedTaluk || multiTaluks.length > 0)
    ? 'taluk'
    : (selectedDistrict || multiDistricts.length > 0)
    ? 'district'
    : 'none';

  // Toggle Dark Mode CSS class
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);


  // Initial Load: Fetch Districts & Pre-load District and Taluk Boundaries
  useEffect(() => {
    async function fetchDistricts() {
      setLoadingDistricts(true);
      try {
        const res = await fetch(apiUrl('/api/districts'));
        const json = await res.json();
        const raw = Array.isArray(json) ? json : (json.data || []);
        const mapped = raw.map((d: any) => ({
          code: d.code ?? d.district_code,
          name: d.name ?? d.district_name,
          state: d.state ?? '',
          bbox: d.bbox ?? [],
          file_path: d.file_path ?? '',
          geojson_path: d.geojson_path ?? '',
        }));
        setDistricts(mapped);

        const dLayer = await fetchGeoJSON('district', 'all');
        if (dLayer) {
          setActiveLayers({ district: dLayer, taluk: null, village: null, parcel: null });
        }
      } catch (err) {
        console.error('Failed to fetch districts:', err);
      } finally {
        setLoadingDistricts(false);
      }
    }
    fetchDistricts();
  }, []);

  // Fetch GeoJSON helper
  const fetchGeoJSON = async (
    level: GisLevel,
    code: string,
    distCode?: string,
    talCode?: string,
    vilCode?: string,
    customType?: 'fmb' | 'vector'
  ) => {
    try {
      const params = new URLSearchParams();
      params.set('level', level);
      params.set('code', code);
      if (distCode) params.set('district_code', distCode);
      if (talCode) params.set('taluk_code', talCode);
      if (vilCode) params.set('village_code', vilCode);
      if (level === 'village' || level === 'parcel') {
        params.set('file_type', customType || layerType);
      }
      params.set('_t', Date.now().toString());
      const url = `${API_BASE}/api/geojson?${params.toString()}`;

      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      console.log(`[fetchGeoJSON] Response for ${level} ${code}:`, json);
      if (json.success && json.geojson && (json.geojson.features?.length > 0 || code === 'all')) {
        const DEFAULT_LEVEL_COLORS: Record<GisLevel, string> = {
          district: '#facc15', // Vibrant Yellow/Gold for District boundary
          taluk: '#9333ea',    // Purple
          village: '#facc15',  // Yellow (Village Boundary per user request)
          parcel: '#22c55e',   // Green
        };

        return {
          level,
          code,
          name: json.name || code,
          file_type: json.file_type || customType || layerType,
          geojson: json.geojson,
          base_geojson: json.base_geojson,
          bbox: json.bbox,
          color: DEFAULT_LEVEL_COLORS[level],
          visible: true,
          opacity: 0,
        } as ActiveGisLayer;
      }
    } catch (err) {
      console.error(`Failed to fetch GeoJSON for ${level} ${code}:`, err);
    }
    return null;
  };

  const handleLayerTypeChange = async (newType: 'fmb' | 'vector') => {
    setLayerType(newType);
    setSelectedParcel('');
    setMultiParcels([]);

    const distCode = selectedDistrict;
    const rawTal = selectedTaluk.includes('_') ? selectedTaluk.split('_').pop()! : selectedTaluk;
    const rawVil = selectedVillage.includes('_') ? selectedVillage.split('_').pop()! : selectedVillage;

    if (selectedVillage) {
      const vLayer = await fetchGeoJSON('village', selectedVillage, distCode, rawTal, rawVil, newType);
      setActiveLayers((prev) => ({
        ...prev,
        village: vLayer || prev.village,
        parcel: null,
      }));

      setLoadingParcels(true);
      try {
        const res = await fetch(`${API_BASE}/api/parcels?district_code=${distCode}&taluk_code=${rawTal}&village_code=${rawVil}&type=${newType}`);
        const json = await res.json();
        const raw = Array.isArray(json) ? json : (json.data || []);
        setParcels(raw.map((p: any) => ({
          code: p.code ?? p.parcel_code ?? p.survey_code,
          name: p.name ?? p.parcel_name ?? String(p.survey_no ?? ''),
          survey_no: p.survey_no ?? '',
          base_survey: p.base_survey,
          subdivision: p.subdivision,
          village_code: p.village_code ?? rawVil,
          taluk_code: p.taluk_code ?? rawTal,
          district_code: p.district_code ?? distCode,
          land_type: p.land_type,
          area_acres: p.area_acres,
          bbox: p.bbox ?? [],
          file_path: p.file_path ?? '',
          geojson_path: p.geojson_path ?? '',
        })));
      } catch (err) {
        console.error('Failed to fetch parcels on layer type change:', err);
      } finally {
        setLoadingParcels(false);
      }
    }
  };

  // Fetch Metadata helper
  const fetchMetadata = async (level: GisLevel, code: string) => {
    setLoadingMetadata(true);
    try {
      const res = await fetch(`${API_BASE}/api/metadata?level=${level}&code=${code}`);
      const json = await res.json();
      if (json.success) {
        setMetadata(json.metadata);
      }
    } catch (err) {
      console.error(`Failed to fetch metadata for ${level} ${code}:`, err);
    } finally {
      setLoadingMetadata(false);
    }
  };

  // 1. District Selection Handler
  const handleDistrictSelect = async (code: string, keepMulti = false) => {
    setSelectedDistrict(code);
    setSelectedTaluk('');
    setSelectedVillage('');
    setSelectedParcel('');
    setTaluks([]);
    setVillages([]);
    setParcels([]);
    if (!keepMulti) {
      const distList = code ? (code.includes(',') ? code.split(',').map((c) => c.trim()).filter(Boolean) : [code]) : [];
      setMultiDistricts(distList);
    }
    setMultiTaluks([]);
    setMultiVillages([]);
    setMultiParcels([]);

    if (!code) {
      await handleResetAll();
      return;
    }

    if (code.includes(',')) {
      const codes = code.split(',').map((c) => c.trim()).filter(Boolean);
      await updateMultiLayer('district', codes);
      setZoomRequestLevel('district');
      return;
    }

    // Load District GeoJSON & Taluks list
    const layer = await fetchGeoJSON('district', code);
    setActiveLayers({
      district: layer,
      taluk: null,
      village: null,
      parcel: null,
    });

    fetchMetadata('district', code);
    setZoomRequestLevel('district');

    // Fetch Taluks for dropdown
    setLoadingTaluks(true);
    try {
      const res = await fetch(`${API_BASE}/api/taluks?district_code=${code}`);
      const json = await res.json();
      const raw = Array.isArray(json) ? json : (json.data || []);
      setTaluks(raw.map((t: any) => ({
        code: t.code ?? t.taluk_code,
        name: t.name ?? t.taluk_name,
        district_code: t.district_code ?? code,
        bbox: t.bbox ?? [],
        file_path: t.file_path ?? '',
        geojson_path: t.geojson_path ?? '',
      })));
    } catch (err) {
      console.error('Failed to fetch taluks:', err);
    } finally {
      setLoadingTaluks(false);
    }
  };

  // 2. Taluk Selection Handler
  const handleTalukSelect = async (code: string, parentDistrictCode?: string, keepMulti = false) => {
    setSelectedTaluk(code);
    setSelectedVillage('');
    setSelectedParcel('');
    setVillages([]);
    setParcels([]);
    if (!keepMulti) {
      const talList = code ? (code.includes(',') ? code.split(',').map((c) => c.trim()).filter(Boolean) : [code]) : [];
      setMultiTaluks(talList);
    }
    setMultiVillages([]);
    setMultiParcels([]);

    let distCode = parentDistrictCode || selectedDistrict;
    if (code && code.includes('_')) {
      const parts = code.split('_');
      if (parts.length >= 2 && !distCode) {
        distCode = parts[0];
      }
    }

    if (!code) {
      if (distCode) {
        await handleDistrictSelect(distCode, keepMulti);
      } else {
        await handleResetAll();
      }
      return;
    }

    if (code.includes(',')) {
      const codes = code.split(',').map((c) => c.trim()).filter(Boolean);
      await updateMultiLayer('taluk', codes, distCode);
      setZoomRequestLevel('taluk');
      return;
    }

    // Load Taluk GeoJSON & Villages list while preserving parent District layer
    const dLayer = distCode ? await fetchGeoJSON('district', distCode) : null;
    const layer = await fetchGeoJSON('taluk', code, distCode);
    if (layer) {
      layer.visible = true;
    }
    setActiveLayers((prev) => ({
      ...prev,
      district: prev.district || dLayer,
      taluk: layer,
      village: null,
      parcel: null,
    }));

    fetchMetadata('taluk', code);
    setZoomRequestLevel('taluk');

    // Fetch Villages for dropdown
    setLoadingVillages(true);
    try {
      const res = await fetch(`${API_BASE}/api/villages?district_code=${distCode}&taluk_code=${code}`);
      const json = await res.json();
      const raw = Array.isArray(json) ? json : (json.data || []);
      setVillages(raw.map((v: any) => ({
        code: v.code ?? v.village_code,
        name: v.name ?? v.village_name,
        taluk_code: v.taluk_code ?? code,
        district_code: v.district_code ?? distCode,
        bbox: v.bbox ?? [],
        file_path: v.file_path ?? '',
        geojson_path: v.geojson_path ?? '',
      })));
    } catch (err) {
      console.error('Failed to fetch villages:', err);
    } finally {
      setLoadingVillages(false);
    }
  };

  // 3. Village Selection Handler
  const handleVillageSelect = async (code: string, parentDistrictCode?: string, parentTalukCode?: string, keepMulti = false) => {
    setSelectedVillage(code);
    setSelectedParcel('');
    setParcels([]);
    if (!keepMulti) {
      const vilList = code ? (code.includes(',') ? code.split(',').map((c) => c.trim()).filter(Boolean) : [code]) : [];
      setMultiVillages(vilList);
    }
    setMultiParcels([]);

    let distCode = parentDistrictCode || selectedDistrict;
    let talCode = parentTalukCode || selectedTaluk;
    if (code && code.includes('_')) {
      const parts = code.split('_');
      if (parts.length >= 3) {
        if (!distCode) distCode = parts[0];
        if (!talCode) talCode = parts[1];
      }
    }

    if (!code) {
      if (talCode) {
        await handleTalukSelect(talCode, distCode, keepMulti);
      } else if (distCode) {
        await handleDistrictSelect(distCode, keepMulti);
      } else {
        await handleResetAll();
      }
      return;
    }

    if (code.includes(',')) {
      const codes = code.split(',').map((c) => c.trim()).filter(Boolean);
      await updateMultiLayer('village', codes, distCode, talCode);
      setZoomRequestLevel('village');
      return;
    }

    // Load Village GeoJSON & Parcels list while preserving parent District and Taluk layers
    const rawTal = (talCode || '').includes('_') ? (talCode || '').split('_').pop()! : (talCode || '');
    const rawVil = code.includes('_') ? code.split('_').pop()! : code;
    const dLayer = distCode ? await fetchGeoJSON('district', distCode) : null;
    const tLayer = talCode ? await fetchGeoJSON('taluk', talCode, distCode) : null;
    const layer = await fetchGeoJSON('village', code, distCode, rawTal, rawVil, layerType);
    setActiveLayers((prev) => ({
      ...prev,
      district: prev.district || dLayer,
      taluk: prev.taluk || tLayer,
      village: layer,
      parcel: null,
    }));

    fetchMetadata('village', code);
    setZoomRequestLevel('village');

    // Fetch Parcels for dropdown
    setLoadingParcels(true);
    try {
      const res = await fetch(`${API_BASE}/api/parcels?district_code=${distCode}&taluk_code=${rawTal}&village_code=${rawVil}&type=${layerType}`);
      const json = await res.json();
      const raw = Array.isArray(json) ? json : (json.data || []);
      setParcels(raw.map((p: any) => ({
        code: p.code ?? p.parcel_code ?? p.survey_code,
        name: p.name ?? p.parcel_name ?? String(p.survey_no ?? ''),
        survey_no: p.survey_no ?? '',
        base_survey: p.base_survey,
        subdivision: p.subdivision,
        village_code: p.village_code ?? code,
        taluk_code: p.taluk_code ?? talCode,
        district_code: p.district_code ?? distCode,
        land_type: p.land_type,
        area_acres: p.area_acres,
        bbox: p.bbox ?? [],
        file_path: p.file_path ?? '',
        geojson_path: p.geojson_path ?? '',
      })));
    } catch (err) {
      console.error('Failed to fetch parcels:', err);
    } finally {
      setLoadingParcels(false);
    }
  };

  // 4. Parcel Selection Handler
  const handleParcelSelect = async (
    code: string,
    parentDistrictCode?: string,
    parentTalukCode?: string,
    parentVillageCode?: string,
    keepMulti = false
  ) => {
    setSelectedParcel(code);
    if (!keepMulti) {
      setMultiParcels(code ? [code] : []);
    }

    const distCode = parentDistrictCode || selectedDistrict;
    const talCode = parentTalukCode || selectedTaluk;
    const vilCode = parentVillageCode || selectedVillage;

    if (!code) {
      if (selectedVillage) {
        await handleVillageSelect(selectedVillage, distCode, talCode, keepMulti);
      } else {
        setActiveLayers((prev) => ({ ...prev, parcel: null }));
      }
      return;
    }

    // Load Parcel GeoJSON while retaining parent District, Taluk, and Village layers
    let finalDist = distCode;
    let finalTal = (talCode || '').includes('_') ? (talCode || '').split('_').pop()! : (talCode || '');
    let finalVil = (vilCode || '').includes('_') ? (vilCode || '').split('_').pop()! : (vilCode || '');
    let finalSurvey = code;
    if (code.includes('_')) {
      const parts = code.split('_');
      if (parts.length >= 4) {
        if (!finalDist) finalDist = parts[0];
        if (!finalTal) finalTal = parts[1];
        if (!finalVil) finalVil = parts[2];
        finalSurvey = parts.slice(3).join('_');
      }
    }

    const dLayer = finalDist ? await fetchGeoJSON('district', finalDist) : null;
    const tLayer = finalTal ? await fetchGeoJSON('taluk', finalTal, finalDist) : null;
    const vLayer = finalVil ? await fetchGeoJSON('village', finalVil, finalDist, finalTal, finalVil, layerType) : null;
    const layer = (finalVil && finalSurvey) ? await fetchGeoJSON('parcel', finalSurvey, finalDist, finalTal, finalVil, layerType) : null;
    setActiveLayers((prev) => ({
      ...prev,
      district: prev.district || dLayer,
      taluk: prev.taluk || tLayer,
      village: prev.village || vLayer,
      parcel: layer,
    }));

    fetchMetadata('parcel', finalSurvey);
    setZoomRequestLevel('parcel');
  };

  // Back Button Step Handler (One level up)
  const handleBackStep = async (fromLevel?: GisLevel) => {
    const levelToStepFrom = fromLevel || currentLevel;
    switch (levelToStepFrom) {
      case 'parcel': {
        setSelectedParcel('');
        setMultiParcels([]);
        const targetVil = selectedVillage || (multiVillages.length > 0 ? multiVillages[0] : (selectedParcel.includes('_') ? selectedParcel.split('_').slice(0, 3).join('_') : ''));
        const distCodeP = selectedDistrict || (targetVil.includes('_') ? targetVil.split('_')[0] : '');
        const talCodeP = selectedTaluk || (targetVil.includes('_') ? targetVil.split('_')[1] : '');
        if (targetVil) {
          await handleVillageSelect(targetVil, distCodeP, talCodeP);
        } else if (talCodeP) {
          await handleTalukSelect(talCodeP, distCodeP);
        } else if (distCodeP) {
          await handleDistrictSelect(distCodeP);
        } else {
          await handleResetAll();
        }
        break;
      }
      case 'village': {
        setSelectedVillage('');
        setSelectedParcel('');
        setParcels([]);
        setMultiVillages([]);
        setMultiParcels([]);
        const targetTal = selectedTaluk || (multiTaluks.length > 0 ? multiTaluks[0] : (selectedVillage.includes('_') ? selectedVillage.split('_').slice(0, 2).join('_') : ''));
        const distCodeV = selectedDistrict || (targetTal.includes('_') ? targetTal.split('_')[0] : '');
        if (targetTal) {
          await handleTalukSelect(targetTal, distCodeV);
        } else if (distCodeV) {
          await handleDistrictSelect(distCodeV);
        } else {
          await handleResetAll();
        }
        break;
      }
      case 'taluk': {
        setSelectedTaluk('');
        setSelectedVillage('');
        setSelectedParcel('');
        setTaluks([]);
        setVillages([]);
        setParcels([]);
        setMultiTaluks([]);
        setMultiVillages([]);
        setMultiParcels([]);
        const targetDist = selectedDistrict || (multiDistricts.length > 0 ? multiDistricts[0] : (selectedTaluk.includes('_') ? selectedTaluk.split('_')[0] : ''));
        if (targetDist) {
          await handleDistrictSelect(targetDist);
        } else {
          await handleResetAll();
        }
        break;
      }
      case 'district': {
        await handleResetAll();
        break;
      }
      default: {
        await handleResetAll();
        break;
      }
    }
  };

  // Reset All
  const handleResetAll = async () => {
    setSelectedDistrict('');
    setSelectedTaluk('');
    setSelectedVillage('');
    setSelectedParcel('');
    setTaluks([]);
    setVillages([]);
    setParcels([]);
    setMetadata(null);
    setMultiDistricts([]);
    setMultiTaluks([]);
    setMultiVillages([]);
    setMultiParcels([]);

    // Restore full Tamil Nadu state district boundaries
    const stateLayer = await fetchGeoJSON('district', 'all');
    if (stateLayer) {
      setActiveLayers({ district: stateLayer, taluk: null, village: null, parcel: null });
    } else {
      setActiveLayers({ district: null, taluk: null, village: null, parcel: null });
    }
    setZoomRequestLevel('state');
  };

  // Search Result Handler (Instant hierarchy expansion and autofill)
  const handleSearchResult = async (result: SearchResult) => {
    if (result.level === 'district') {
      const distCode = result.district_code || (result.code.includes('_') ? result.code.split('_')[0] : result.code);
      await handleDistrictSelect(distCode);
    } else if (result.level === 'taluk') {
      let distCode = result.district_code || (result.code.includes('_') ? result.code.split('_')[0] : '');
      let rawTal = result.taluk_code || (result.code.includes('_') ? result.code.split('_').slice(-1)[0] : result.code);


      if (distCode) {
        setSelectedDistrict(distCode);

        // Fetch district's taluk list to match exact taluk combo code
        const tRes = await fetch(`${API_BASE}/api/taluks?district_code=${distCode}`).then((r) => r.json());
        const tRaw = Array.isArray(tRes) ? tRes : (tRes.data || []);
        const talukList: TalukItem[] = tRaw.map((t: any) => ({
          code: t.code ?? t.taluk_code,
          name: t.name ?? t.taluk_name,
          district_code: t.district_code ?? distCode,
          bbox: t.bbox ?? [], file_path: t.file_path ?? '', geojson_path: t.geojson_path ?? '',
        }));
        setTaluks(talukList);

        const matchedTaluk = talukList.find(
          (t) => t.code === result.code || t.code === rawTal || t.code === `${distCode}_${rawTal}` || t.code.endsWith(`_${rawTal}`)
        );
        const finalTalCode = matchedTaluk ? matchedTaluk.code : (result.code || rawTal);

        await handleTalukSelect(finalTalCode, distCode);
      }
    } else if (result.level === 'village') {
      let distCode = result.district_code || (result.code.includes('_') ? result.code.split('_')[0] : '');
      let rawTal = result.taluk_code || (result.code.includes('_') ? result.code.split('_')[1] : '');
      let vilCode = result.village_code || (result.code.includes('_') ? result.code.split('_').slice(-1)[0] : result.code);


      if (distCode && vilCode) {
        setSelectedDistrict(distCode);

        // Load Taluks list & match exact Taluk
        const tRes = await fetch(`${API_BASE}/api/taluks?district_code=${distCode}`).then((r) => r.json());
        const tRaw2 = Array.isArray(tRes) ? tRes : (tRes.data || []);
        const talukList: TalukItem[] = tRaw2.map((t: any) => ({
          code: t.code ?? t.taluk_code,
          name: t.name ?? t.taluk_name,
          district_code: t.district_code ?? distCode,
          bbox: t.bbox ?? [], file_path: t.file_path ?? '', geojson_path: t.geojson_path ?? '',
        }));
        setTaluks(talukList);

        const matchedTaluk = talukList.find(
          (t) => t.code === rawTal || t.code === `${distCode}_${rawTal}` || t.code.endsWith(`_${rawTal}`)
        );
        const finalTalCode = matchedTaluk ? matchedTaluk.code : (rawTal || distCode);
        setSelectedTaluk(finalTalCode);

        const vRes2 = await fetch(`${API_BASE}/api/villages?district_code=${distCode}&taluk_code=${finalTalCode}`).then((r) => r.json());
        const vRaw3 = Array.isArray(vRes2) ? vRes2 : (vRes2.data || []);
        const villageList: VillageItem[] = vRaw3.map((v: any) => ({
          code: v.code ?? v.village_code,
          name: v.name ?? v.village_name,
          taluk_code: v.taluk_code ?? finalTalCode,
          district_code: v.district_code ?? distCode,
          bbox: v.bbox ?? [], file_path: v.file_path ?? '', geojson_path: v.geojson_path ?? '',
        }));
        setVillages(villageList);

        const matchedVil = villageList.find(
          (v) => v.code === vilCode || v.code === `${distCode}_${finalTalCode}_${vilCode}` || v.code.endsWith(`_${vilCode}`)
        );
        const finalVilCode = matchedVil ? matchedVil.code : vilCode;

        await handleVillageSelect(finalVilCode, distCode, finalTalCode);
      }
    } else if (result.level === 'parcel') {
      let distCode = result.district_code || (result.code.includes('_') && !result.code.startsWith('parcel_') ? result.code.split('_')[0] : selectedDistrict);
      let rawTal = result.taluk_code || (result.code.includes('_') && !result.code.startsWith('parcel_') ? result.code.split('_')[1] : selectedTaluk);
      let vilCode = result.village_code || (result.code.includes('_') && !result.code.startsWith('parcel_') ? result.code.split('_')[2] : selectedVillage);
      let parcelCode = result.survey_no || result.code.replace('parcel_', '');

      if (distCode && vilCode) {
        setSelectedDistrict(distCode);

        // Load Taluks list
        const tRes3 = await fetch(`${API_BASE}/api/taluks?district_code=${distCode}`).then((r) => r.json());
        const tRaw4 = Array.isArray(tRes3) ? tRes3 : (tRes3.data || []);
        const talukList: TalukItem[] = tRaw4.map((t: any) => ({
          code: t.code ?? t.taluk_code,
          name: t.name ?? t.taluk_name,
          district_code: t.district_code ?? distCode,
          bbox: t.bbox ?? [], file_path: t.file_path ?? '', geojson_path: t.geojson_path ?? '',
        }));
        setTaluks(talukList);

        const matchedTaluk = talukList.find(
          (t) => t.code === rawTal || t.code === `${distCode}_${rawTal}` || t.code.endsWith(`_${rawTal}`)
        );
        const finalTalCode = matchedTaluk ? matchedTaluk.code : rawTal;
        setSelectedTaluk(finalTalCode);

        // Load Villages list & match exact Village BEFORE setting selectedVillage
        const vRes = await fetch(`${API_BASE}/api/villages?district_code=${distCode}&taluk_code=${finalTalCode}`).then((r) => r.json());
        const vRawP = Array.isArray(vRes) ? vRes : (vRes.data || []);
        const villageList: VillageItem[] = vRawP.map((v: any) => ({
          code: v.code ?? v.village_code,
          name: v.name ?? v.village_name,
          taluk_code: v.taluk_code ?? finalTalCode,
          district_code: v.district_code ?? distCode,
          bbox: v.bbox ?? [], file_path: v.file_path ?? '', geojson_path: v.geojson_path ?? '',
        }));
        setVillages(villageList);

        const matchedVil = villageList.find(
          (v) => v.code === vilCode || v.code === `${distCode}_${finalTalCode}_${vilCode}` || v.code.endsWith(`_${vilCode}`)
        );
        const finalVilCode = matchedVil ? matchedVil.code : vilCode;
        setSelectedVillage(finalVilCode);

        await handleParcelSelect(parcelCode, distCode, finalTalCode, finalVilCode);

        // Fetch parcels for dropdown
        const pRes = await fetch(`${API_BASE}/api/parcels?district_code=${distCode}&taluk_code=${finalTalCode}&village_code=${finalVilCode}&type=${layerType}`).then((r) => r.json());
        const pRaw = Array.isArray(pRes) ? pRes : (pRes.data || []);
        setParcels(pRaw.map((p: any) => ({
          code: p.code ?? p.parcel_code ?? p.survey_code,
          name: p.name ?? p.parcel_name ?? String(p.survey_no ?? ''),
          survey_no: p.survey_no ?? '',
          base_survey: p.base_survey,
          subdivision: p.subdivision,
          village_code: p.village_code ?? finalVilCode,
          taluk_code: p.taluk_code ?? finalTalCode,
          district_code: p.district_code ?? distCode,
          land_type: p.land_type,
          area_acres: p.area_acres,
          bbox: p.bbox ?? [], file_path: p.file_path ?? '', geojson_path: p.geojson_path ?? '',
        })));

        fetchMetadata('parcel', parcelCode);
      }
    }
  };

  const handleToggleVisibility = (level: GisLevel) => {
    setActiveLayers((prev) => {
      const cur = prev[level];
      if (!cur) return prev;
      return {
        ...prev,
        [level]: { ...cur, visible: !cur.visible },
      };
    });
  };

  // Change Layer Opacity
  const handleChangeOpacity = (level: GisLevel, opacity: number) => {
    setActiveLayers((prev) => {
      const cur = prev[level];
      if (!cur) return prev;
      return {
        ...prev,
        [level]: { ...cur, opacity },
      };
    });
  };

  // Toggle Layer Labels (Show / Hide Village Names or Survey Number Labels)
  const handleToggleLabels = (level: GisLevel) => {
    setActiveLayers((prev) => {
      const cur = prev[level];
      const nextShowLabels = cur ? (cur.showLabels === false ? true : false) : false;
      return {
        ...prev,
        [level]: cur
          ? { ...cur, showLabels: nextShowLabels }
          : ({
              id: level,
              level: level,
              name: level,
              code: (level === 'village' ? selectedVillage : level === 'taluk' ? selectedTaluk : selectedDistrict) || '',
              visible: true,
              opacity: 1,
              showLabels: nextShowLabels,
            } as unknown as ActiveGisLayer),
      };
    });
  };

  // Change Layer Color
  const handleChangeColor = (level: GisLevel | 'subdivision', color: string) => {
    if (level === 'subdivision') {
      setSubdivisionColor(color);
      return;
    }
    setActiveLayers((prev) => {
      const cur = prev[level];
      if (!cur) return prev;
      return {
        ...prev,
        [level]: { ...cur, color },
      };
    });
  };

  // Specific Zoom Request State
  const [zoomRequestLevel, setZoomRequestLevel] = useState<GisLevel | 'state' | null>(null);

  // Zoom to Layer
  const handleZoomToLayer = (level: GisLevel) => {
    setZoomRequestLevel(level);
  };

  const handleZoomRequestHandled = () => {
    setZoomRequestLevel(null);
  };



  const currentDistrictObj = districts.find((d) => d.code === selectedDistrict);
  const currentTalukObj = taluks.find((t) => t.code === selectedTaluk);
  const currentVillageObj = villages.find((v) => v.code === selectedVillage);
  const currentParcelObj = parcels.find(
    (p) =>
      p.code === selectedParcel ||
      p.survey_no === selectedParcel ||
      p.base_survey === selectedParcel ||
      (selectedParcel && p.code?.endsWith(`_${selectedParcel}`)) ||
      (selectedParcel && selectedParcel.endsWith(`_${p.survey_no}`))
  );

  let derivedParcelName: string | undefined = undefined;
  if (currentParcelObj) {
    const rawNo = currentParcelObj.survey_no || currentParcelObj.name || selectedParcel;
    const cleanNo = String(rawNo).replace(/^[0-9]{2}_[0-9]{2}_[0-9]{3}_/, '').replace(/_/g, '/');
    derivedParcelName = cleanNo.startsWith('Survey ') ? cleanNo : `Survey ${cleanNo}`;
  } else if (selectedParcel) {
    let cleanCode = selectedParcel.includes('_')
      ? selectedParcel.split('_').slice(3).join('/') || selectedParcel.split('_').pop()!
      : selectedParcel;
    cleanCode = cleanCode.replace(/_/g, '/');
    derivedParcelName = cleanCode.startsWith('Survey ') ? cleanCode : `Survey ${cleanCode}`;
  }

  const effectiveMultiDistricts = multiDistricts.length > 0
    ? multiDistricts
    : (selectedDistrict && selectedDistrict.includes(',') ? selectedDistrict.split(',').filter(Boolean) : (selectedDistrict ? [selectedDistrict] : []));

  const effectiveMultiTaluks = multiTaluks.length > 0
    ? multiTaluks
    : (selectedTaluk && selectedTaluk.includes(',') ? selectedTaluk.split(',').filter(Boolean) : (selectedTaluk ? [selectedTaluk] : []));

  const effectiveMultiVillages = multiVillages.length > 0
    ? multiVillages
    : (selectedVillage && selectedVillage.includes(',') ? selectedVillage.split(',').filter(Boolean) : (selectedVillage ? [selectedVillage] : []));

  const effectiveMultiParcels = multiParcels.length > 0
    ? multiParcels
    : (selectedParcel && selectedParcel.includes(',') ? selectedParcel.split(',').filter(Boolean) : (selectedParcel ? [selectedParcel] : []));

  const singleDistrictObj = effectiveMultiDistricts.length === 1
    ? districts.find((d) => d.code === effectiveMultiDistricts[0] || d.code.endsWith(`_${effectiveMultiDistricts[0]}`))
    : currentDistrictObj;

  const singleTalukObj = effectiveMultiTaluks.length === 1
    ? taluks.find((t) => t.code === effectiveMultiTaluks[0] || t.code.endsWith(`_${effectiveMultiTaluks[0]}`))
    : currentTalukObj;

  const singleVillageObj = effectiveMultiVillages.length === 1
    ? villages.find((v) => v.code === effectiveMultiVillages[0] || v.code.endsWith(`_${effectiveMultiVillages[0]}`))
    : currentVillageObj;

  const multiBreadcrumb = {
    districts: effectiveMultiDistricts.map((c) => {
      const cleanC = c.trim();
      const rawC = cleanC.includes('_') ? cleanC.split('_')[0] : cleanC;
      const d = districts.find(
        (item) => item.code === cleanC || item.code === rawC || item.name.toLowerCase() === cleanC.toLowerCase() || item.code.endsWith(`_${cleanC}`) || cleanC.endsWith(`_${item.code}`)
      );
      return { code: d ? d.code : cleanC, name: d ? d.name : cleanC };
    }),
    taluks: effectiveMultiTaluks.map((c) => {
      const cleanC = c.trim();
      const rawC = cleanC.includes('_') ? cleanC.split('_').pop()! : cleanC;
      const t = taluks.find(
        (item) =>
          item.code === cleanC ||
          item.code === rawC ||
          item.name.toLowerCase() === cleanC.toLowerCase() ||
          item.code.endsWith(`_${cleanC}`) ||
          cleanC.endsWith(`_${item.code}`) ||
          item.code.endsWith(`_${rawC}`)
      );
      return { code: t ? t.code : cleanC, name: t ? t.name : cleanC };
    }),
    villages: effectiveMultiVillages.map((c) => {
      const cleanC = c.trim();
      const rawC = cleanC.includes('_') ? cleanC.split('_').pop()! : cleanC;
      const v = villages.find(
        (item) =>
          item.code === cleanC ||
          item.code === rawC ||
          item.name.toLowerCase() === cleanC.toLowerCase() ||
          item.code.endsWith(`_${cleanC}`) ||
          cleanC.endsWith(`_${item.code}`) ||
          item.code.endsWith(`_${rawC}`)
      );
      return { code: v ? v.code : cleanC, name: v ? v.name : cleanC };
    }),
    parcels: effectiveMultiParcels.map((c) => {
      const cleanC = c.trim();
      const p = parcels.find(
        (item) => item.code === cleanC || item.name.toLowerCase() === cleanC.toLowerCase() || (item.code && item.code.endsWith(`_${cleanC}`)) || (cleanC && cleanC.endsWith(`_${item.code}`))
      );
      let cleanNo = p ? String(p.survey_no || p.name || cleanC) : cleanC;
      const comboMatch = cleanNo.match(/^[0-9]{2}_[0-9]{2}_[0-9]{3}_(.+)$/);
      if (comboMatch) cleanNo = comboMatch[1];
      cleanNo = cleanNo.replace(/_/g, '/');
      const name = cleanNo.toLowerCase().startsWith('survey') ? cleanNo : `Survey ${cleanNo}`;
      return { code: p ? p.code : cleanC, name };
    }),
  };

  const breadcrumb = {
    districtName: singleDistrictObj?.name,
    talukName: singleTalukObj?.name,
    villageName: singleVillageObj?.name,
    parcelName: derivedParcelName,
  };

  const handleBreadcrumbClick = async (level: GisLevel | 'state') => {
    if (level === 'state') {
      await handleResetAll();
    } else if (level === 'district') {
      const distCode = selectedDistrict || (multiDistricts.length > 0 ? multiDistricts[0] : (activeLayers.district?.code !== 'all' ? activeLayers.district?.code : ''));
      if (distCode) {
        await handleDistrictSelect(distCode);
      } else {
        await handleResetAll();
      }
    } else if (level === 'taluk') {
      const talCode = selectedTaluk || (multiTaluks.length > 0 ? multiTaluks[0] : (activeLayers.taluk?.code || ''));
      const distCode = selectedDistrict || (multiDistricts.length > 0 ? multiDistricts[0] : (activeLayers.district?.code || ''));
      if (talCode) {
        await handleTalukSelect(talCode, distCode);
      }
    } else if (level === 'village') {
      const vilCode = selectedVillage || (multiVillages.length > 0 ? multiVillages[0] : (activeLayers.village?.code || ''));
      const talCode = selectedTaluk || (multiTaluks.length > 0 ? multiTaluks[0] : (activeLayers.taluk?.code || ''));
      const distCode = selectedDistrict || (multiDistricts.length > 0 ? multiDistricts[0] : (activeLayers.district?.code || ''));
      if (vilCode) {
        await handleVillageSelect(vilCode, distCode, talCode);
      }
    } else if (level === 'parcel') {
      if (selectedParcel) {
        setZoomRequestLevel('parcel');
      }
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      {/* Full Screen Map Stage */}
      <main className="w-full h-full relative flex-1 min-w-0">
        <GisMap
          preloadedLayers={preloadedLayers}
          activeLayers={activeLayers}
          selectedLevel={currentLevel}
          basemapStyle={basemapStyle}
          onBasemapChange={setBasemapStyle}
          breadcrumb={breadcrumb}
          multiBreadcrumb={multiBreadcrumb}
          onMultiItemSelect={handleMultiItemSelect}
          onBreadcrumbClick={handleBreadcrumbClick}
          onBackStep={handleBackStep}
          onReset={handleResetAll}
          zoomRequestLevel={zoomRequestLevel}
          onZoomRequestHandled={() => setZoomRequestLevel(null)}
          onChangeLayerColor={handleChangeColor}
          activeLayerColors={{
            district: activeLayers.district?.color || '#facc15',
            taluk: activeLayers.taluk?.color || '#9333ea',
            village: activeLayers.village?.color || '#facc15',
            subdivision: '#22c55e',
            parcel: activeLayers.parcel?.color || '#22c55e',
          }}
          onPolygonExtracted={setExtractedPolygonResult}
          activeCartLayers={activeCartLayers}
          onToggleCartLayer={handleToggleCartLayer}
          onToggleAllCartLayers={handleToggleAllCartLayers}
          onSearchResultSelect={handleSearchResult}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          isDarkMode={isDarkMode}
          onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
          districts={districts}
          taluks={taluks}
          villages={villages}
          parcels={parcels}
          selectedDistrict={selectedDistrict}
          selectedTaluk={selectedTaluk}
          selectedVillage={selectedVillage}
          selectedParcel={selectedParcel}
          layerType={layerType}
          onLayerTypeChange={handleLayerTypeChange}
          loadingDistricts={loadingDistricts}
          loadingTaluks={loadingTaluks}
          loadingVillages={loadingVillages}
          loadingParcels={loadingParcels}
          onDistrictSelect={handleDistrictSelect}
          onTalukSelect={handleTalukSelect}
          onVillageSelect={handleVillageSelect}
          onParcelSelect={handleParcelSelect}
          onToggleVisibility={handleToggleVisibility}
          onChangeOpacity={handleChangeOpacity}
          onZoomToLayer={handleZoomToLayer}
          onToggleLabels={handleToggleLabels}
          multiDistricts={multiDistricts}
          multiTaluks={multiTaluks}
          multiVillages={multiVillages}
          multiParcels={multiParcels}
          onToggleMultiDistrict={handleToggleMultiDistrict}
          onToggleMultiTaluk={handleToggleMultiTaluk}
          onToggleMultiVillage={handleToggleMultiVillage}
          onToggleMultiParcel={handleToggleMultiParcel}
          onFeatureClick={async (level, props) => {
            console.log('Feature clicked on map:', level, props);
            if (props) {
              const rawNo = props.survey_no || props.SURVEY_NO || props.sno || props.KIDE || props.sf_no || props.code || props.name;
              const distCode = props.district_code || selectedDistrict;
              const talCode = props.taluk_code || selectedTaluk;
              const vilCode = props.village_code || selectedVillage;

              if (rawNo) {
                const pCode = String(rawNo).trim();
                await handleParcelSelect(pCode, distCode, talCode, vilCode);
              }
            }
          }}
        />
      </main>
    </div>
  );
}
