import React, { useEffect, useState } from 'react';
import { Compass, Download, ArrowRight, CheckCircle2 } from 'lucide-react';
import { apiUrl, API_BASE } from '@/frontend/lib/api';

export interface PreloadedLayers {
  districtGeoJson: any;
  talukGeoJson: any;
  villageGeoJson: any;
}

interface AppInitializationModalProps {
  onComplete: (preloaded: PreloadedLayers | null) => void;
}

export const AppInitializationModal: React.FC<AppInitializationModalProps> = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Downloading GIS layers...');
  const [isReady, setIsReady] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [preloadedData, setPreloadedData] = useState<PreloadedLayers | null>(null);

  useEffect(() => {
    let isMounted = true;

    const runDownload = async () => {
      try {
        if (!isMounted) return;
        setStatusText('Downloading District Boundaries...');
        setProgress(20);
        const districtRes = await fetch(apiUrl('/api/auto-zoom-layer?level=district')).catch(() => null);
        const districtGeoJson = districtRes ? await districtRes.json().catch(() => null) : null;

        if (!isMounted) return;
        setStatusText('Downloading Taluk Boundaries...');
        setProgress(50);
        const talukRes = await fetch(apiUrl('/api/auto-zoom-layer?level=taluk')).catch(() => null);
        const talukGeoJson = talukRes ? await talukRes.json().catch(() => null) : null;

        if (!isMounted) return;
        setStatusText('Downloading Merged Village Boundaries...');
        setProgress(85);
        const villageRes = await fetch(apiUrl('/api/auto-zoom-layer?level=village')).catch(() => null);
        const villageGeoJson = villageRes ? await villageRes.json().catch(() => null) : null;

        if (!isMounted) return;
        setStatusText('All Layers Downloaded & Ready!');
        setProgress(100);
        setPreloadedData({ districtGeoJson, talukGeoJson, villageGeoJson });
        setIsReady(true);
      } catch (err) {
        if (isMounted) {
          setProgress(100);
          setIsReady(true);
        }
      }
    };

    runDownload();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleEnterApp = async () => {
    setIsFadingOut(true);
    await new Promise((r) => setTimeout(r, 400));
    onComplete(preloadedData);
  };

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 backdrop-blur-2xl transition-opacity duration-400 ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Background Subtle Radial Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] bg-gradient-to-tr from-sky-500/15 via-teal-500/15 to-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md mx-4 bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center gap-6">
        {/* Brand Compass Icon */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500 via-teal-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/30">
          <Compass className="w-9 h-9 stroke-[2.2]" />
        </div>

        {/* Welcome Header */}
        <div className="space-y-1.5">
          <h1 className="text-2xl font-black text-white tracking-tight">
            Welcome to GIS Layer Navigator
          </h1>
          <p className="text-xs text-slate-400 font-medium">
            Tamil Nadu Spatial Boundary & Cadastral Mapping Platform
          </p>
        </div>

        {/* Download Progress & Status */}
        <div className="w-full space-y-3 pt-2">
          {!isReady ? (
            <>
              <div className="flex items-center justify-between text-xs font-bold text-slate-300 px-1">
                <span className="flex items-center gap-1.5 text-cyan-400">
                  <Download className="w-3.5 h-3.5 animate-bounce shrink-0" />
                  <span>{statusText}</span>
                </span>
                <span className="font-mono text-cyan-400">{progress}%</span>
              </div>

              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700/60 shadow-inner">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 via-teal-400 to-indigo-500 rounded-full transition-all duration-300 shadow-md shadow-cyan-500/40"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </>
          ) : (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 rounded-xl py-2 px-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>All Layers Downloaded & Ready!</span>
              </div>

              <button
                type="button"
                onClick={handleEnterApp}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 via-teal-500 to-indigo-600 text-white font-bold text-sm shadow-lg shadow-sky-500/30 hover:shadow-cyan-500/50 hover:scale-[1.02] active:scale-98 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Explore Map</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
