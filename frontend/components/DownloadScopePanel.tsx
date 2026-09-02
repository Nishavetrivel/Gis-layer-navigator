import React, { useState, useCallback } from 'react';
import { DistrictItem, TalukItem, VillageItem, ParcelItem, ExtractedLayerResult } from '../types';
import { Download, Loader2, AlertCircle, Check, X } from 'lucide-react';
import { apiUrl, API_BASE } from '@/frontend/lib/api';

interface DownloadScopePanelProps {
  districts: DistrictItem[];
  taluks: TalukItem[];
  villages: VillageItem[];
  parcels: ParcelItem[];
  selectedDistrict: string;
  selectedTaluk: string;
  selectedVillage: string;
  selectedParcel: string;
  layerType?: 'fmb' | 'vector';
  // Multi-select basket arrays
  multiDistricts?: string[];
  multiTaluks?: string[];
  multiVillages?: string[];
  multiParcels?: string[];
  // Unselect toggle handlers
  onToggleMultiDistrict?: (code: string) => void;
  onToggleMultiTaluk?: (code: string) => void;
  onToggleMultiVillage?: (code: string) => void;
  onToggleMultiParcel?: (code: string) => void;
  // Extracted Polygon Layer support
  extractedPolygonResult?: ExtractedLayerResult | null;
  onClearExtractedPolygon?: () => void;
  onClose?: () => void;
}

export type ExportFormat = 'shp' | 'geojson' | 'kml' | 'kmz';

const FORMAT_OPTIONS: { key: ExportFormat; label: string }[] = [
  { key: 'shp', label: 'SHP' },
  { key: 'geojson', label: 'GEO' },
  { key: 'kml', label: 'KML' },
  { key: 'kmz', label: 'KMZ' },
];

// Core download trigger helper
async function triggerDownload(url: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Server error ${res.status}: ${text.slice(0, 200)}`);
  }

  const disposition = res.headers.get('Content-Disposition') || '';
  let filename = 'gis_export.zip';
  const fnMatch = disposition.match(/filename[^;=\n]*=["']?([^"';\n]*)["']?/i);
  if (fnMatch && fnMatch[1]) {
    filename = fnMatch[1].trim();
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
}

// Download Button Component
interface DownloadButtonProps {
  url: string;
  label: string;
  variant?: 'primary' | 'emerald' | 'amber';
  disabled?: boolean;
}

function DownloadButton({ url, label, variant = 'primary', disabled = false }: DownloadButtonProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled || status === 'loading') return;
    setStatus('loading');
    setErrorMsg('');
    try {
      await triggerDownload(url);
      setStatus('idle');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Download failed');
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3500);
    }
  }, [url, status, disabled]);

  let baseClass = 'bg-cyan-600 hover:bg-cyan-500 text-white';
  if (variant === 'emerald') {
    baseClass = 'bg-emerald-600 hover:bg-emerald-700 text-white';
  } else if (variant === 'amber') {
    baseClass = 'bg-amber-600 hover:bg-amber-500 text-white';
  }

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className="w-full flex items-center justify-center py-1 px-1.5 rounded-lg text-[9.5px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed border border-dashed border-slate-200 dark:border-slate-700"
      >
        <span className="truncate">{label}</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 w-full">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'loading'}
        className={`w-full flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg text-[10px] font-bold transition-all shadow-2xs cursor-pointer disabled:cursor-wait active:scale-95 ${baseClass}`}
      >
        {status === 'loading' ? (
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
        ) : (
          <Download className="w-2.5 h-2.5 opacity-90" />
        )}
        <span className="truncate">{status === 'loading' ? 'Downloading…' : label}</span>
      </button>
      {status === 'error' && errorMsg && (
        <div className="flex items-start gap-1 p-0.5 rounded bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800">
          <AlertCircle className="w-2 h-2 text-red-500 shrink-0 mt-px" />
          <p className="text-[8px] text-red-600 dark:text-red-400 leading-tight truncate">{errorMsg}</p>
        </div>
      )}
    </div>
  );
}

export const DownloadScopePanel: React.FC<DownloadScopePanelProps> = ({
  districts,
  taluks,
  villages,
  parcels,
  selectedDistrict,
  selectedTaluk,
  selectedVillage,
  selectedParcel,
  layerType = 'vector',
  multiDistricts = [],
  multiTaluks = [],
  multiVillages = [],
  multiParcels = [],
  onToggleMultiDistrict,
  onToggleMultiTaluk,
  onToggleMultiVillage,
  onToggleMultiParcel,
  extractedPolygonResult,
  onClearExtractedPolygon,
  onClose,
}) => {
  const [exportFormat, setExportFormat] = useState<ExportFormat>('shp');
  const [downloadType, setDownloadType] = useState<'vector' | 'fmb'>(layerType || 'vector');

  const activeDistricts = multiDistricts.length > 0 ? multiDistricts : (selectedDistrict ? [selectedDistrict] : []);
  const activeTaluks = multiTaluks.length > 0 ? multiTaluks : (selectedTaluk ? [selectedTaluk] : []);
  const activeVillages = multiVillages.length > 0 ? multiVillages : (selectedVillage ? [selectedVillage] : []);
  const activeParcels = multiParcels.length > 0 ? multiParcels : (selectedParcel ? [selectedParcel] : []);

  const rawTaluk = selectedTaluk ? (selectedTaluk.includes('_') ? selectedTaluk.split('_').pop()! : selectedTaluk) : '';
  const rawVillage = selectedVillage ? (selectedVillage.includes('_') ? selectedVillage.split('_').pop()! : selectedVillage) : '';

  const hasSelection = activeDistricts.length > 0 || activeTaluks.length > 0 || activeVillages.length > 0 || activeParcels.length > 0 || Boolean(extractedPolygonResult);

  const dObj = activeDistricts.length === 1 ? districts.find((d) => d.code === activeDistricts[0]) : null;
  const tObj = activeTaluks.length === 1 ? taluks.find((t) => t.code === activeTaluks[0] || t.code === activeTaluks[0].split('_').pop()) : null;
  const vObj = activeVillages.length === 1 ? villages.find((v) => v.code === activeVillages[0] || v.code === activeVillages[0].split('_').pop()) : null;

  // Extract clean parcel base survey number
  let parcelBaseNo = '';
  if (selectedParcel) {
    let clean = selectedParcel.trim();
    if (clean.includes('_')) {
      const parts = clean.split('_');
      clean = parts.slice(3).join('/') || parts[parts.length - 1];
    }
    parcelBaseNo = clean.split('/')[0] || clean;
  }

  const pObj = parcels.find((p) => {
    if (p.code === selectedParcel) return true;
    let cleanNo = String(p.survey_no || p.name).trim();
    const comboMatch = cleanNo.match(/^[0-9]{2}_[0-9]{2}_[0-9]{3}_(.+)$/);
    if (comboMatch) cleanNo = comboMatch[1];
    cleanNo = cleanNo.replace(/_/g, '/');
    const base = p.base_survey || cleanNo.split('/')[0].trim();
    return base === parcelBaseNo || cleanNo === selectedParcel;
  });

  const displayParcelName = parcelBaseNo ? `Survey ${parcelBaseNo}` : (pObj?.name || (selectedParcel ? `Survey ${selectedParcel}` : ''));
  const parcelDownloadCode = pObj?.code || (selectedDistrict && rawTaluk && rawVillage && parcelBaseNo ? `${selectedDistrict}_${rawTaluk}_${rawVillage}_${parcelBaseNo}` : (selectedParcel || (activeParcels.length > 0 ? activeParcels[0] : '')));

  const buildUrl = (level: string, code: string, type: 'vector' | 'fmb', extraParams?: string) =>
    `${API_BASE}/api/download/${level}/${encodeURIComponent(code)}?type=${type}&format=${exportFormat}${extraParams ? `&${extraParams}` : ''}`;

  const typeLabel = downloadType === 'fmb' ? 'FMB' : 'Vector';
  const buttonVariant = downloadType === 'fmb' ? 'emerald' : 'amber';
  const fmtUpper = exportFormat.toUpperCase();

  return (
    <div className="flex flex-col gap-1.5 w-full text-slate-800 dark:text-slate-100">
      {/* ── TOP CONTROL BAR ── */}
      <div className="flex items-center justify-between gap-1.5 pb-1 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          <Download className="w-3.5 h-3.5 text-sky-500" />
          <span className="text-xs font-black text-slate-800 dark:text-slate-100">
            Download
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Layer Toggle: Vector / FMB */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200/80 dark:border-slate-700/60">
            <button
              type="button"
              onClick={() => setDownloadType('vector')}
              className={`px-2 py-0.5 rounded text-[8.5px] font-black uppercase transition-all cursor-pointer ${
                downloadType === 'vector'
                  ? 'bg-amber-500 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              🟡 Vector
            </button>
            <button
              type="button"
              onClick={() => setDownloadType('fmb')}
              className={`px-2 py-0.5 rounded text-[8.5px] font-black uppercase transition-all cursor-pointer ${
                downloadType === 'fmb'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              🟢 FMB
            </button>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT: 2x2 Grid on Left + Vertical Format Strip on Right ── */}
      {!hasSelection ? (
        <div className="py-2 text-center text-[9px] text-slate-400 dark:text-slate-500 italic bg-slate-50 dark:bg-slate-800/30 rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
          Select a boundary on the left to enable download
        </div>
      ) : (
        <div className="flex items-stretch gap-1.5">
          {/* 2x2 Grid (4 Download Boxes) */}
          <div className="flex-1 grid grid-cols-2 gap-1.5">
            {/* BOX 1: DISTRICT */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60 flex flex-col justify-between gap-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[8px] font-black uppercase text-sky-600 dark:text-sky-400 truncate">
                  District
                </span>
                <span className="px-1 py-0.2 rounded text-[7px] font-bold bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 shrink-0">
                  {typeLabel}
                </span>
              </div>
              <div className="text-[10px] font-bold text-slate-800 dark:text-slate-100 truncate">
                {activeDistricts.length > 1 ? `${activeDistricts.length} Districts` : (dObj?.name || '—')}
              </div>
              {activeDistricts.length > 0 ? (
                <DownloadButton
                  url={buildUrl('district', activeDistricts.join(','), downloadType)}
                  label={`Download (${fmtUpper})`}
                  variant={buttonVariant}
                />
              ) : (
                <DownloadButton url="" label="Not Selected" disabled />
              )}
            </div>

            {/* BOX 2: TALUK */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60 flex flex-col justify-between gap-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[8px] font-black uppercase text-indigo-600 dark:text-indigo-400 truncate">
                  Taluk
                </span>
                <span className="px-1 py-0.2 rounded text-[7px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0">
                  {typeLabel}
                </span>
              </div>
              <div className="text-[10px] font-bold text-slate-800 dark:text-slate-100 truncate">
                {activeTaluks.length > 1 ? `${activeTaluks.length} Taluks` : (tObj?.name || (selectedTaluk ? `Taluk ${rawTaluk}` : '—'))}
              </div>
              {activeTaluks.length > 0 ? (
                <DownloadButton
                  url={buildUrl('taluk', activeTaluks.join(','), downloadType, selectedDistrict || activeDistricts.length > 0 ? `district_code=${selectedDistrict || activeDistricts.join(',')}` : undefined)}
                  label={`Download (${fmtUpper})`}
                  variant={buttonVariant}
                />
              ) : (
                <DownloadButton url="" label="Not Selected" disabled />
              )}
            </div>

            {/* BOX 3: VILLAGE */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60 flex flex-col justify-between gap-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[8px] font-black uppercase text-teal-600 dark:text-teal-400 truncate">
                  Village
                </span>
                <span className="px-1 py-0.2 rounded text-[7px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0">
                  {typeLabel}
                </span>
              </div>
              <div className="text-[10px] font-bold text-slate-800 dark:text-slate-100 truncate">
                {activeVillages.length > 1 ? `${activeVillages.length} Villages` : (vObj?.name || (selectedVillage ? `Village ${rawVillage}` : '—'))}
              </div>
              {activeVillages.length > 0 ? (
                <DownloadButton
                  url={buildUrl('village', activeVillages.join(','), downloadType, `district_code=${selectedDistrict || activeDistricts.join(',')}&taluk_code=${rawTaluk || activeTaluks.join(',')}${activeVillages.length === 1 ? `&village_code=${rawVillage}` : ''}`)}
                  label={`Download (${fmtUpper})`}
                  variant={buttonVariant}
                />
              ) : (
                <DownloadButton url="" label="Not Selected" disabled />
              )}
            </div>

            {/* BOX 4: SURVEY */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60 flex flex-col justify-between gap-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[8px] font-black uppercase text-emerald-600 dark:text-emerald-400 truncate">
                  Survey
                </span>
                <span className="px-1 py-0.2 rounded text-[7px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0">
                  {typeLabel}
                </span>
              </div>
              <div className="text-[10px] font-bold text-slate-800 dark:text-slate-100 truncate">
                {activeParcels.length > 1 ? `${activeParcels.length} Surveys` : (displayParcelName || '—')}
              </div>
              {(Boolean(selectedParcel) || activeParcels.length > 0) ? (
                <DownloadButton
                  url={buildUrl(
                    'parcel',
                    activeParcels.length > 1 ? activeParcels.join(',') : parcelDownloadCode,
                    downloadType,
                    `district_code=${selectedDistrict || activeDistricts.join(',')}&taluk_code=${rawTaluk || activeTaluks.join(',')}&village_code=${rawVillage || activeVillages.join(',')}&base_survey=${parcelBaseNo}${pObj?.subdivision ? `&subdivision=${pObj.subdivision}` : ''}`
                  )}
                  label={`Download (${fmtUpper})`}
                  variant={buttonVariant}
                />
              ) : (
                <DownloadButton url="" label="Not Selected" disabled />
              )}
            </div>
          </div>

          {/* Vertical Format Strip on Right Side */}
          <div className="flex flex-col justify-between bg-slate-50 dark:bg-slate-800/70 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/60 shrink-0 w-12">
            <span className="text-[7.5px] font-black text-center text-slate-400 uppercase tracking-tighter">
              FMT
            </span>
            <div className="flex flex-col gap-1 my-auto">
              {FORMAT_OPTIONS.map((fmt) => {
                const isSelected = exportFormat === fmt.key;
                return (
                  <button
                    key={fmt.key}
                    type="button"
                    onClick={() => setExportFormat(fmt.key)}
                    className={`py-1 px-0.5 rounded text-[8px] font-black uppercase text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-sky-500 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {fmt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
