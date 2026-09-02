/**
 * frontend/utils/colorUtils.ts
 * ────────────────────────────
 * Centralized color palettes and styling tokens for GIS layers and UI components.
 */

import { GisLevel } from '../types';

export const MULTI_SELECTION_PALETTE = [
  '#0284c7', // Sky Blue
  '#8b5cf6', // Purple
  '#10b981', // Emerald Green
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#a855f7', // Violet
];

export const DEFAULT_LAYER_COLORS: Record<GisLevel | 'subdivision', string> = {
  district: '#0284c7',
  taluk: '#8b5cf6',
  village: '#10b981',
  parcel: '#f59e0b',
  subdivision: '#22c55e',
};

export const GIS_LEVEL_BADGE_COLORS: Record<GisLevel, { bg: string; text: string; border: string }> = {
  district: {
    bg: 'bg-sky-50 dark:bg-sky-950/40',
    text: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-200 dark:border-sky-800',
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
