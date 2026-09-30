/**
 * frontend/utils/colorUtils.ts
 * ────────────────────────────
 * Centralized color palettes and styling tokens for GIS layers and UI components.
 */

import { GisLevel } from '../types';

export const MULTI_SELECTION_PALETTE = [
  '#06b6d4', // Vibrant Electric Cyan (Item 1)
  '#f59e0b', // Vibrant Gold / Amber (Item 2)
  '#ec4899', // Vivid Hot Pink (Item 3)
  '#3b82f6', // Bright Royal Blue (Item 4)
  '#f97316', // Vibrant Orange (Item 5)
  '#10b981', // Emerald Green (Item 6)
  '#a855f7', // Vivid Purple (Item 7)
  '#e11d48', // Crimson Rose (Item 8)
];

export const DEFAULT_LAYER_COLORS: Record<GisLevel | 'subdivision', string> = {
  district: '#facc15',
  taluk: '#9333ea',
  village: '#06b6d4',
  parcel: '#22c55e',
  subdivision: '#22c55e',
};

export const GIS_LEVEL_BADGE_COLORS: Record<GisLevel, { bg: string; text: string; border: string }> = {
  district: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/40',
    text: 'text-yellow-700 dark:text-yellow-300',
    border: 'border-yellow-200 dark:border-yellow-800',
  },
  taluk: {
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    text: 'text-purple-700 dark:text-purple-300',
    border: 'border-purple-200 dark:border-purple-800',
  },
  village: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800',
  },
  parcel: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
  },
};
