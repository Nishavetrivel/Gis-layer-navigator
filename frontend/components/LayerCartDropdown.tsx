import React, { useState, useRef, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  Layers,
  Search,
  Check,
  X,
  ChevronDown,
  Move,
  Maximize2,
  Minimize2,
  RotateCcw,
} from 'lucide-react';
import { CartLayerDefinition } from '../types';
import { CART_LAYERS_CONFIG } from '../cartLayersConfig';

interface LayerCartDropdownProps {
  activeCartLayers: Record<string, boolean>;
  onToggleLayer: (layerId: string) => void;
  onToggleAll: (enable: boolean) => void;
  layers?: CartLayerDefinition[];
  className?: string;
  iconOnly?: boolean;
  isOpen?: boolean;
  onToggleOpen?: () => void;
}

const SIZE_MEDIUM = { width: 390, height: 530 };
const SIZE_SMALL = { width: 320, height: 420 };
const MIN_WIDTH = 280;
const MIN_HEIGHT = 280;

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const LayerCartDropdown: React.FC<LayerCartDropdownProps> = ({
  activeCartLayers,
  onToggleLayer,
  onToggleAll,
  layers = CART_LAYERS_CONFIG,
  className = '',
  iconOnly = false,
  isOpen,
  onToggleOpen,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = typeof isOpen === 'boolean' ? isOpen : internalOpen;
  const [searchQuery, setSearchQuery] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeSizePreset, setActiveSizePreset] = useState<'small' | 'medium'>('medium');

  // Position & Size state for draggable & resizable popup
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>(SIZE_MEDIUM);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Dragging refs
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; panelX: number; panelY: number }>({
    mouseX: 0,
    mouseY: 0,
    panelX: 0,
    panelY: 0,
  });

  // Resizing refs
  const resizeDirectionRef = useRef<ResizeDirection | null>(null);
  const resizeStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    startWidth: number;
    startHeight: number;
    startX: number;
    startY: number;
  }>({
    mouseX: 0,
    mouseY: 0,
    startWidth: 0,
    startHeight: 0,
    startX: 0,
    startY: 0,
  });

  const activeCount = layers.filter((l) => activeCartLayers[l.id]).length;

  // Initialize position below button on first open
  const handleOpenToggle = () => {
    if (onToggleOpen) {
      onToggleOpen();
      return;
    }
    if (!open) {
      if (!position && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const initialX = Math.max(16, Math.min(window.innerWidth - size.width - 20, rect.right - size.width));
        const initialY = Math.min(window.innerHeight - size.height - 20, rect.bottom + 8);
        setPosition({ x: initialX, y: Math.max(16, initialY) });
      }
      setInternalOpen(true);
      setIsMinimized(false);
    } else {
      setInternalOpen(false);
    }
  };

  // Quick Size Presets: Small & Medium
  const applySizePreset = (preset: 'small' | 'medium') => {
    setIsMinimized(false);
    setActiveSizePreset(preset);
    if (preset === 'small') {
      setSize(SIZE_SMALL);
    } else {
      setSize(SIZE_MEDIUM);
    }
  };

  // Reset to default position & size
  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const initialX = Math.max(16, Math.min(window.innerWidth - SIZE_MEDIUM.width - 20, rect.right - SIZE_MEDIUM.width));
      const initialY = Math.min(window.innerHeight - SIZE_MEDIUM.height - 20, rect.bottom + 8);
      setPosition({ x: initialX, y: Math.max(16, initialY) });
    }
    setSize(SIZE_MEDIUM);
    setActiveSizePreset('medium');
    setIsMinimized(false);
  };

  // Drag Handlers
  const handleMouseDownDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, a, select')) {
      return;
    }
    e.preventDefault();
    isDraggingRef.current = true;
    const currentX = position?.x ?? 20;
    const currentY = position?.y ?? 80;

    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panelX: currentX,
      panelY: currentY,
    };
  };

  // 8-Direction Resize Trigger
  const handleMouseDownResize = (direction: ResizeDirection) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeDirectionRef.current = direction;
    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startWidth: size.width,
      startHeight: size.height,
      startX: position?.x ?? 20,
      startY: position?.y ?? 80,
    };
  };

  // Global mousemove and mouseup listeners
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        const dx = e.clientX - dragStartRef.current.mouseX;
        const dy = e.clientY - dragStartRef.current.mouseY;
        const maxX = window.innerWidth - 80;
        const maxY = window.innerHeight - 60;
        const newX = Math.max(10, Math.min(maxX, dragStartRef.current.panelX + dx));
        const newY = Math.max(10, Math.min(maxY, dragStartRef.current.panelY + dy));
        setPosition({ x: newX, y: newY });
      } else if (resizeDirectionRef.current) {
        const dir = resizeDirectionRef.current;
        const dx = e.clientX - resizeStartRef.current.mouseX;
        const dy = e.clientY - resizeStartRef.current.mouseY;
        const maxWidth = Math.min(window.innerWidth - 30, 800);
        const maxHeight = Math.min(window.innerHeight - 30, 850);

        let newWidth = resizeStartRef.current.startWidth;
        let newHeight = resizeStartRef.current.startHeight;
        let newX = resizeStartRef.current.startX;
        let newY = resizeStartRef.current.startY;

        if (dir.includes('e')) {
          newWidth = Math.max(MIN_WIDTH, Math.min(maxWidth, resizeStartRef.current.startWidth + dx));
        }
        if (dir.includes('w')) {
          const possibleWidth = resizeStartRef.current.startWidth - dx;
          if (possibleWidth >= MIN_WIDTH && possibleWidth <= maxWidth) {
            newWidth = possibleWidth;
            newX = resizeStartRef.current.startX + dx;
          }
        }
        if (dir.includes('s')) {
          newHeight = Math.max(MIN_HEIGHT, Math.min(maxHeight, resizeStartRef.current.startHeight + dy));
        }
        if (dir.includes('n')) {
          const possibleHeight = resizeStartRef.current.startHeight - dy;
          if (possibleHeight >= MIN_HEIGHT && possibleHeight <= maxHeight) {
            newHeight = possibleHeight;
            newY = resizeStartRef.current.startY + dy;
          }
        }

        setSize({ width: newWidth, height: newHeight });
        setPosition({ x: newX, y: newY });
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      resizeDirectionRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const filteredLayers = layers.filter(
    (l) =>
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Main Header Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpenToggle}
        className={`transition-all duration-200 flex items-center justify-center cursor-pointer border shadow-2xs select-none ${
          iconOnly
            ? `w-8 h-8 rounded-xl backdrop-blur-md ${
                activeCount > 0
                  ? 'bg-amber-500 border-amber-400 text-white'
                  : 'bg-white/95 dark:bg-slate-900/95 border-sky-200 dark:border-sky-800/80 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/60 hover:border-sky-400'
              }`
            : `px-2.5 py-1.5 rounded-lg text-[11px] font-bold gap-1.5 ${
                activeCount > 0
                  ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white border-amber-400 shadow-sm ring-1 ring-amber-400/50'
                  : 'bg-white dark:bg-slate-800/95 hover:bg-slate-100 dark:hover:bg-slate-700/95 text-slate-800 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white border-slate-200 dark:border-slate-700/80'
              }`
        }`}
        title="Open Layer Cart (15 GIS Overlay Vector Tile Layers)"
      >
        <div className="relative flex items-center justify-center">
          <Layers className={`${iconOnly ? 'w-3.5 h-3.5' : 'w-3.5 h-3.5'} stroke-[2.2] ${activeCount > 0 ? (iconOnly ? 'text-white' : 'text-amber-100 animate-pulse') : 'text-sky-600 dark:text-sky-400'}`} />
          {activeCount > 0 && (
            <span className="absolute -top-0.5 -right-1 w-1.5 h-1.5 rounded-full bg-emerald-400 ring-1.5 ring-slate-900" />
          )}
        </div>
        {!iconOnly && (
          <>
            <span className="font-extrabold tracking-wide whitespace-nowrap">Layer Cart</span>
            {activeCount > 0 ? (
              <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-white/20 text-white text-[9.5px] font-mono font-black border border-white/30">
                {activeCount}/{layers.length}
              </span>
            ) : (
              <ChevronDown
                className={`w-3 h-3 text-slate-500 dark:text-slate-400 transition-transform duration-200 ${
                  open ? 'rotate-180 text-amber-500' : ''
                }`}
              />
            )}
          </>
        )}
      </button>

      {/* Compact Layer Cart Panel â€” opens to the LEFT so it never covers icons */}
      {open && (
        <div
          className="absolute top-0 right-full mr-2 w-56 bg-white/98 dark:bg-slate-900/98 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700/80 flex flex-col overflow-hidden z-50 animate-in fade-in slide-in-from-right-2 duration-150"
          style={{ maxHeight: '70vh' }}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-800 dark:text-white">Layer Cart</span>
              {activeCount > 0 && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40">
                  {activeCount}/{layers.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onToggleAll(true)}
                className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/50 hover:bg-emerald-100 cursor-pointer transition-colors"
                title="All On"
              >All On</button>
              <button
                type="button"
                onClick={() => onToggleAll(false)}
                className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700/50 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 cursor-pointer transition-colors"
                title="All Off"
              >All Off</button>
              <button
                type="button"
                onClick={handleOpenToggle}
                className="p-0.5 rounded text-slate-400 hover:text-rose-500 cursor-pointer transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Layer List */}
          <div className="overflow-y-auto flex-1 p-1.5 space-y-0.5">
            {filteredLayers.map((layer) => {
              const isVisible = !!activeCartLayers[layer.id];
              return (
                <div
                  key={layer.id}
                  onClick={() => onToggleLayer(layer.id)}
                  className={`w-full px-2 py-1.5 rounded-lg flex items-center gap-2 cursor-pointer transition-all border ${
                    isVisible
                      ? 'bg-amber-50 dark:bg-slate-800 border-amber-200 dark:border-slate-600'
                      : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  {/* Color swatch */}
                  <div className="shrink-0">
                    {layer.symbol === 'polygon' ? (
                      <span className="w-3 h-3 rounded-sm inline-block border border-slate-300 dark:border-slate-600" style={{ backgroundColor: layer.color, opacity: isVisible ? 1 : 0.4 }} />
                    ) : layer.symbol === 'line' ? (
                      <span className="w-4 h-1 rounded-full inline-block" style={{ backgroundColor: layer.color, opacity: isVisible ? 1 : 0.4 }} />
                    ) : (
                      <span className="w-2.5 h-2.5 rounded-full inline-block border border-white" style={{ backgroundColor: layer.color, opacity: isVisible ? 1 : 0.4 }} />
                    )}
                  </div>
                  {/* Label */}
                  <span className={`text-[11px] flex-1 truncate font-medium ${isVisible ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>
                    {layer.title}
                  </span>
                  {/* Toggle eye icon */}
                  {isVisible ? (
                    <Eye className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

