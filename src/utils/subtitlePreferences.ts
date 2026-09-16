export const SUBTITLE_STYLE_STORAGE_KEY = 'subtitleStyle';
export const SUBTITLE_STYLE_CHANGED_EVENT = 'movix:subtitle-style-changed';
export const SUBTITLE_STYLE_PREVIEW_EVENT = 'movix:subtitle-style-preview';
export const SUBTITLE_GUIDE_RATIOS = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4] as const;

export type SubtitleFontSizeMode = 'auto' | 'manual';
export type SubtitleEdgeStyle = 'shadow' | 'outline' | 'none';
export type SubtitleFontFamily =
  | 'standard'
  | 'atkinson'
  | 'lexend'
  | 'opendyslexic'
  | 'arial'
  | 'verdana'
  | 'trebuchet'
  | 'tahoma'
  | 'serif'
  | 'monospace';
export type SubtitleFontWeight = number;

export const SUBTITLE_FONT_FAMILIES: Readonly<Record<SubtitleFontFamily, string>> = Object.freeze({
  standard: 'Inter, ui-sans-serif, system-ui, sans-serif',
  atkinson: '"Atkinson Hyperlegible", Inter, ui-sans-serif, system-ui, sans-serif',
  lexend: 'Lexend, Inter, ui-sans-serif, system-ui, sans-serif',
  opendyslexic: 'OpenDyslexic, Inter, ui-sans-serif, system-ui, sans-serif',
  arial: 'Arial, Helvetica, sans-serif',
  verdana: 'Verdana, Geneva, sans-serif',
  trebuchet: '"Trebuchet MS", Tahoma, sans-serif',
  tahoma: 'Tahoma, Verdana, sans-serif',
  serif: 'Georgia, Cambria, "Times New Roman", serif',
  monospace: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
});

const SUBTITLE_FONT_FAMILY_VALUES = Object.keys(SUBTITLE_FONT_FAMILIES) as SubtitleFontFamily[];

export interface SubtitlePreferences {
  version: 3;
  fontSizeMode: SubtitleFontSizeMode;
  fontSizePx: number;
  bottomOffsetPx: number;
  positionXPercent: number;
  color: string;
  edgeStyle: SubtitleEdgeStyle;
  edgeColor: string;
  edgeSizePx: number;
  backgroundEnabled: boolean;
  backgroundOpacity: number;
  fontFamily: SubtitleFontFamily;
  fontWeight: SubtitleFontWeight;
}

export type SubtitlePreferencePatch = Partial<Omit<SubtitlePreferences, 'version'>>;

export const DEFAULT_SUBTITLE_PREFERENCES: Readonly<SubtitlePreferences> = Object.freeze({
  version: 3,
  fontSizeMode: 'auto',
  fontSizePx: 24,
  bottomOffsetPx: 96,
  positionXPercent: 50,
  color: '#ffffff',
  edgeStyle: 'none',
  backgroundEnabled: true,
  backgroundOpacity: 0.4,
  fontFamily: 'standard',
  edgeColor: '#000000',
  edgeSizePx: 2,
  fontWeight: 400,
});

// ---------------------------------------------------------------------------
// Décalage temporel
//
// Le délai n'est PAS une préférence : c'est une correction de synchronisation
// propre à un contenu. Il vivait ici, persisté avec le style et préservé par
// `resetSubtitleAppearance` — un +3 s posé sur un épisode mal calé
// s'appliquait au suivant. Il est désormais un état du lecteur, remis à zéro à
// chaque contenu. Seules ses bornes et son format restent partagés ici, pour
// que le panneau souris et les lignes TV affichent la même chose.
// Une valeur `delay` encore présente dans localStorage est simplement ignorée.
// ---------------------------------------------------------------------------

export const SUBTITLE_DELAY_MIN = -10;
export const SUBTITLE_DELAY_MAX = 10;
/** Pas d'un appui sur la télécommande ; les boutons souris proposent aussi ±3 s. */
export const SUBTITLE_DELAY_STEP = 0.5;

export function clampSubtitleDelay(value: number): number {
  const safe = Number.isFinite(value) ? value : 0;
  return Number(clamp(safe, SUBTITLE_DELAY_MIN, SUBTITLE_DELAY_MAX).toFixed(1));
}

/** « +1.5s », « -3s », « +0s ». */
export function formatSubtitleDelay(delayInSeconds: number): string {
  const sign = delayInSeconds >= 0 ? '+' : '';
  return `${sign}${Number(delayInSeconds.toFixed(1))}s`;
}

// ---------------------------------------------------------------------------
// Taille du texte
// ---------------------------------------------------------------------------

/**
 * Base du mode « auto », dans le repère 1920×1080 (elle est ensuite mise à
 * l'échelle par `getSubtitleResponsiveScale`). 24 px convient à un écran à
 * 60 cm ; sur téléviseur la distance de lecture est plus grande, et le mode
 * auto passe à 32 px — le mode manuel reste tel que l'utilisateur l'a réglé.
 */
export const SUBTITLE_AUTO_FONT_SIZE_PX = Object.freeze({ desktop: 24, tv: 32 });

/**
 * Tailles proposées à la télécommande. Une liste courte de valeurs
 * conventionnelles : en dessous de 20 px c'est illisible à distance, au-delà
 * de 40 px deux lignes ne tiennent plus dans l'image.
 */
export const SUBTITLE_FONT_SIZE_PRESETS_PX: readonly number[] = Object.freeze([20, 24, 28, 32, 36, 40]);

// ---------------------------------------------------------------------------
// Options discrètes, partagées par les contrôles souris et les lignes TV
// ---------------------------------------------------------------------------

export const SUBTITLE_EDGE_OPTIONS: ReadonlyArray<{ value: SubtitleEdgeStyle; labelKey: string }> = Object.freeze([
  { value: 'shadow', labelKey: 'settings.subtitles.edgeShadow' },
  { value: 'outline', labelKey: 'settings.subtitles.edgeOutline' },
  { value: 'none', labelKey: 'settings.subtitles.edgeNone' },
]);

export const SUBTITLE_WEIGHT_OPTIONS: ReadonlyArray<{ value: SubtitleFontWeight; labelKey: string }> = Object.freeze([
  { value: 400, labelKey: 'settings.subtitles.weightNormal' },
  { value: 700, labelKey: 'settings.subtitles.weightBold' },
]);

export const SUBTITLE_FONT_OPTIONS: ReadonlyArray<{ value: SubtitleFontFamily; labelKey: string }> = Object.freeze([
  { value: 'standard', labelKey: 'settings.subtitles.fontStandard' },
  { value: 'atkinson', labelKey: 'settings.subtitles.fontAtkinson' },
  { value: 'lexend', labelKey: 'settings.subtitles.fontLexend' },
  { value: 'opendyslexic', labelKey: 'settings.subtitles.fontOpenDyslexic' },
  { value: 'arial', labelKey: 'settings.subtitles.fontArial' },
  { value: 'verdana', labelKey: 'settings.subtitles.fontVerdana' },
  { value: 'trebuchet', labelKey: 'settings.subtitles.fontTrebuchet' },
  { value: 'tahoma', labelKey: 'settings.subtitles.fontTahoma' },
  { value: 'serif', labelKey: 'settings.subtitles.fontSerif' },
  { value: 'monospace', labelKey: 'settings.subtitles.fontMonospace' },
]);

export const SUBTITLE_COLOR_OPTIONS: ReadonlyArray<{ color: string; labelKey: string }> = Object.freeze([
  { color: '#ffffff', labelKey: 'settings.subtitles.colorWhite' },
  { color: '#fcd34d', labelKey: 'settings.subtitles.colorYellow' },
  { color: '#3b82f6', labelKey: 'settings.subtitles.colorBlue' },
  { color: '#06b6d4', labelKey: 'settings.subtitles.colorCyan' },
  { color: '#22c55e', labelKey: 'settings.subtitles.colorGreen' },
  { color: '#ef4444', labelKey: 'settings.subtitles.colorRed' },
  { color: '#d946ef', labelKey: 'settings.subtitles.colorMagenta' },
  { color: '#000000', labelKey: 'settings.subtitles.colorBlack' },
]);

/** Taille effective avant mise à l'échelle, selon le mode et l'appareil. */
export function getSubtitleBaseFontSizePx(
  preferences: Pick<SubtitlePreferences, 'fontSizeMode' | 'fontSizePx'>,
  tv = false,
): number {
  if (tv && preferences.fontSizeMode === 'auto') return SUBTITLE_AUTO_FONT_SIZE_PX.tv;
  return preferences.fontSizePx;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function getSubtitleSafeWidthCss(maxWidthPercent: number): string {
  const normalized = clamp(Number.isFinite(maxWidthPercent) ? maxWidthPercent : 100, 20, 100);
  const width = Number(normalized.toFixed(2));
  const safeInset = Number((24 * normalized / 100).toFixed(2));
  return `calc(${width}% - ${safeInset}px)`;
}
const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);
const isHexColor = (value: unknown): value is string => (
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
);

export interface SubtitleGuideSnap {
  index: number;
  ratio: number;
  positionPx: number;
}

export function getSubtitleGuideSnap(
  coordinatePx: number,
  extentPx: number,
  thresholdPx: number,
): SubtitleGuideSnap | null {
  if (![coordinatePx, extentPx, thresholdPx].every(Number.isFinite) || extentPx <= 0 || thresholdPx < 0) return null;
  let nearest: SubtitleGuideSnap | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  SUBTITLE_GUIDE_RATIOS.forEach((ratio, index) => {
    const positionPx = extentPx * ratio;
    const distance = Math.abs(coordinatePx - positionPx);
    if (distance < nearestDistance) {
      nearest = { index, ratio, positionPx };
      nearestDistance = distance;
    }
  });

  return nearestDistance <= thresholdPx ? nearest : null;
}

export function scaleSubtitleFontSizeFromPointer(
  startFontSizePx: number,
  startDistancePx: number,
  currentDistancePx: number,
): number {
  const safeStartSize = Number.isFinite(startFontSizePx) ? startFontSizePx : DEFAULT_SUBTITLE_PREFERENCES.fontSizePx;
  if (!Number.isFinite(startDistancePx) || !Number.isFinite(currentDistancePx) || startDistancePx <= 0) {
    return Math.round(clamp(safeStartSize, 8, 48));
  }
  return Math.round(clamp(safeStartSize * (currentDistancePx / startDistancePx), 8, 48));
}

export function parseSubtitlePixelInput(
  rawValue: string,
  min: number,
  max: number,
  step = 1,
): number | null {
  const text = rawValue.trim().replace(/\s*px\s*$/i, '').replace(',', '.').trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  const lowerBound = Math.min(min, max);
  const upperBound = Math.max(min, max);
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
  const clamped = clamp(parsed, lowerBound, upperBound);
  const snapped = lowerBound + Math.round((clamped - lowerBound) / safeStep) * safeStep;
  return Number(clamp(snapped, lowerBound, upperBound).toFixed(4));
}

export function getDirectionalResizeDistance(
  pointerX: number,
  pointerY: number,
  anchorX: number,
  anchorY: number,
  directionX: number,
  directionY: number,
  startWidth: number,
  startHeight: number,
): number {
  if (![pointerX, pointerY, anchorX, anchorY, directionX, directionY, startWidth, startHeight].every(Number.isFinite)) {
    return 0;
  }

  const signedX = Math.sign(directionX);
  const signedY = Math.sign(directionY);
  if (signedY === 0) return Math.max(0, (pointerX - anchorX) * signedX);
  if (signedX === 0) return Math.max(0, (pointerY - anchorY) * signedY);

  const diagonal = Math.hypot(startWidth, startHeight);
  if (diagonal <= 0) return 0;
  const projectedDistance = (pointerX - anchorX) * signedX * startWidth / diagonal
    + (pointerY - anchorY) * signedY * startHeight / diagonal;
  return Math.max(0, projectedDistance);
}

const migrateLegacyFontSize = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value <= 4 ? value * 16 : value;
  if (value === 'small') return 16;
  if (value === 'large') return 32;
  if (value === 'medium') return 24;
  return DEFAULT_SUBTITLE_PREFERENCES.fontSizePx;
};

const migrateLegacyColor = (value: unknown): string => {
  if (value === 'yellow') return '#fcd34d';
  if (value === 'white') return '#ffffff';
  return isHexColor(value) ? value.toLowerCase() : DEFAULT_SUBTITLE_PREFERENCES.color;
};

export function getRelativeLuminance(hex: string): number {
  const safe = isHexColor(hex) ? hex : '#ffffff';
  const channels = [1, 3, 5].map((offset) => parseInt(safe.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export interface SubtitleEdgeStyles {
  textShadow: string;
  WebkitTextStroke: string;
  paintOrder?: 'stroke fill';
}

export function getSubtitleEdgeStyles(
  edgeStyle: SubtitleEdgeStyle,
  edgeColor: string,
  edgeSizePx = DEFAULT_SUBTITLE_PREFERENCES.edgeSizePx,
  scale = 1,
): SubtitleEdgeStyles {
  const safeColor = isHexColor(edgeColor) ? edgeColor.toLowerCase() : DEFAULT_SUBTITLE_PREFERENCES.edgeColor;
  const safeScale = clamp(Number.isFinite(scale) ? scale : 1, 0.1, 1);
  const visualSize = Number(clamp(edgeSizePx * safeScale, 0.5, 6).toFixed(2));

  if (edgeStyle === 'shadow') {
    return {
      textShadow: `0 ${visualSize}px ${Number((visualSize * 3).toFixed(2))}px ${safeColor}, 0 0 ${Number((visualSize * 1.5).toFixed(2))}px ${safeColor}`,
      WebkitTextStroke: '0 transparent',
    };
  }

  if (edgeStyle === 'outline') {
    return {
      textShadow: 'none',
      WebkitTextStroke: `${visualSize}px ${safeColor}`,
      paintOrder: 'stroke fill',
    };
  }

  return {
    textShadow: 'none',
    WebkitTextStroke: '0 transparent',
  };
}

export function normalizeSubtitlePreferences(value: unknown): SubtitlePreferences {
  const raw = isRecord(value) ? value : {};
  const hasStoredFontSize = raw.fontSizePx !== undefined || raw.fontSize !== undefined;
  const migrateV2AutoFontSize = raw.version === 2 && raw.fontSizeMode === 'auto' && raw.fontSizePx === 32;
  const migrateV2DefaultHeight = raw.version === 2 && raw.bottomOffsetPx === 275;
  const fontSizePx = migrateV2AutoFontSize
    ? DEFAULT_SUBTITLE_PREFERENCES.fontSizePx
    : typeof raw.fontSizePx === 'number'
      ? raw.fontSizePx
    : migrateLegacyFontSize(raw.fontSize);
  const legacyBackground = raw.backgroundColor === 'transparent'
    ? 0.1
    : raw.backgroundColor === 'dark'
      ? 0.7
      : raw.backgroundColor === 'semi'
        ? 0.4
        : undefined;
  const backgroundOpacity = typeof raw.backgroundOpacity === 'number'
    ? raw.backgroundOpacity
    : legacyBackground ?? DEFAULT_SUBTITLE_PREFERENCES.backgroundOpacity;
  const normalizedBackgroundOpacity = clamp(Number.isFinite(backgroundOpacity) ? backgroundOpacity : 0.4, 0, 1);
  const fontWeight = raw.fontWeight === 'bold'
    ? 700
    : raw.fontWeight === 'normal'
      ? 400
      : typeof raw.fontWeight === 'number' && Number.isFinite(raw.fontWeight)
        ? raw.fontWeight
        : DEFAULT_SUBTITLE_PREFERENCES.fontWeight;
  return {
    version: 3,
    fontSizeMode: raw.fontSizeMode === 'manual' || (raw.fontSizeMode === undefined && hasStoredFontSize) ? 'manual' : 'auto',
    fontSizePx: clamp(Number.isFinite(fontSizePx) ? fontSizePx : DEFAULT_SUBTITLE_PREFERENCES.fontSizePx, 8, 48),
    bottomOffsetPx: clamp(migrateV2DefaultHeight
      ? DEFAULT_SUBTITLE_PREFERENCES.bottomOffsetPx
      : typeof raw.bottomOffsetPx === 'number' && Number.isFinite(raw.bottomOffsetPx)
        ? raw.bottomOffsetPx
        : DEFAULT_SUBTITLE_PREFERENCES.bottomOffsetPx, 25, 900),
    positionXPercent: clamp(typeof raw.positionXPercent === 'number' && Number.isFinite(raw.positionXPercent) ? raw.positionXPercent : 50, 0, 100),
    color: migrateLegacyColor(raw.color),
    edgeStyle: raw.edgeStyle === 'shadow' || raw.edgeStyle === 'outline' ? raw.edgeStyle : DEFAULT_SUBTITLE_PREFERENCES.edgeStyle,
    edgeColor: isHexColor(raw.edgeColor) ? raw.edgeColor.toLowerCase() : DEFAULT_SUBTITLE_PREFERENCES.edgeColor,
    edgeSizePx: clamp(typeof raw.edgeSizePx === 'number' && Number.isFinite(raw.edgeSizePx)
      ? raw.edgeSizePx
      : DEFAULT_SUBTITLE_PREFERENCES.edgeSizePx, 0.5, 6),
    backgroundEnabled: typeof raw.backgroundEnabled === 'boolean'
      ? raw.backgroundEnabled
      : normalizedBackgroundOpacity > 0,
    backgroundOpacity: normalizedBackgroundOpacity,
    fontFamily: typeof raw.fontFamily === 'string' && SUBTITLE_FONT_FAMILY_VALUES.includes(raw.fontFamily as SubtitleFontFamily)
      ? raw.fontFamily as SubtitleFontFamily
      : 'standard',
    fontWeight: clamp(Math.round(fontWeight), 100, 900),
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const getBrowserStorage = (): StorageLike | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export function loadSubtitlePreferences(storage: StorageLike | null = getBrowserStorage()): SubtitlePreferences {
  if (!storage) return { ...DEFAULT_SUBTITLE_PREFERENCES };
  try {
    const saved = storage.getItem(SUBTITLE_STYLE_STORAGE_KEY);
    return normalizeSubtitlePreferences(saved ? JSON.parse(saved) : null);
  } catch {
    return { ...DEFAULT_SUBTITLE_PREFERENCES };
  }
}

export function saveSubtitlePreferences(
  value: unknown,
  storage: StorageLike | null = getBrowserStorage(),
  eventTarget: EventTarget | null = typeof window === 'undefined' ? null : window,
): SubtitlePreferences {
  const normalized = normalizeSubtitlePreferences(value);
  try {
    storage?.setItem(SUBTITLE_STYLE_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Preferences stay usable in memory when storage is unavailable.
  }
  if (eventTarget && typeof CustomEvent !== 'undefined') {
    eventTarget.dispatchEvent(new CustomEvent(SUBTITLE_STYLE_CHANGED_EVENT, { detail: normalized }));
  }
  return normalized;
}

/**
 * Le paramètre est conservé pour les appelants existants ; il ne sert plus
 * depuis que le délai a quitté les préférences.
 */
export function resetSubtitleAppearance(_current?: SubtitlePreferences): SubtitlePreferences {
  return { ...DEFAULT_SUBTITLE_PREFERENCES };
}

export interface SubtitleViewport {
  width: number;
  height: number;
  blockWidth: number;
  blockHeight: number;
  controlsInset?: number;
  minScale?: number;
  /** Téléviseur : le mode « auto » prend une base plus grande (cf. `getSubtitleBaseFontSizePx`). */
  tv?: boolean;
}

export interface SubtitlePlacement {
  scale: number;
  fontSizePx: number;
  leftPx: number;
  bottomPx: number;
}

export function getSubtitleResponsiveScale(width: number, height: number, minScale = 0.35): number {
  const safeMinScale = clamp(Number.isFinite(minScale) ? minScale : 0.35, 0.1, 1);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return safeMinScale;
  return clamp(Math.min(width / 1920, height / 1080), safeMinScale, 1);
}

function getSubtitleVerticalScale(height: number, minScale = 0.35): number {
  const safeMinScale = clamp(Number.isFinite(minScale) ? minScale : 0.35, 0.1, 1);
  if (!Number.isFinite(height) || height <= 0) return safeMinScale;
  return clamp(height / 1080, safeMinScale, 1);
}

export function calculateSubtitlePlacement(
  preferences: SubtitlePreferences,
  viewport: SubtitleViewport,
): SubtitlePlacement {
  const scale = getSubtitleResponsiveScale(viewport.width, viewport.height, viewport.minScale);
  const verticalScale = getSubtitleVerticalScale(viewport.height, viewport.minScale);
  const edgePadding = 12;
  const halfWidth = viewport.blockWidth / 2;
  const desiredLeft = viewport.width * (preferences.positionXPercent / 100);
  const minLeft = Math.min(viewport.width / 2, halfWidth + edgePadding);
  const maxLeft = Math.max(viewport.width / 2, viewport.width - halfWidth - edgePadding);
  const minBottom = Math.max(edgePadding, viewport.controlsInset ?? 0);
  const maxBottom = Math.max(minBottom, viewport.height - viewport.blockHeight - edgePadding);

  return {
    scale,
    fontSizePx: getSubtitleBaseFontSizePx(preferences, viewport.tv) * scale,
    leftPx: clamp(desiredLeft, minLeft, maxLeft),
    bottomPx: clamp(preferences.bottomOffsetPx * verticalScale, minBottom, maxBottom),
  };
}

export function preferencesFromDrag(
  _preferences: SubtitlePreferences,
  viewport: SubtitleViewport,
  centerX: number,
  centerY: number,
): Pick<SubtitlePreferences, 'positionXPercent' | 'bottomOffsetPx'> {
  const verticalScale = getSubtitleVerticalScale(viewport.height, viewport.minScale);
  const minCenterX = viewport.blockWidth / 2 + 12;
  const maxCenterX = viewport.width - viewport.blockWidth / 2 - 12;
  const safeCenterX = clamp(centerX, Math.min(minCenterX, viewport.width / 2), Math.max(maxCenterX, viewport.width / 2));
  const minBottom = Math.max(12, viewport.controlsInset ?? 0);
  const maxBottom = Math.max(minBottom, viewport.height - viewport.blockHeight - 12);
  const actualBottom = clamp(viewport.height - centerY - viewport.blockHeight / 2, minBottom, maxBottom);

  return {
    positionXPercent: clamp((safeCenterX / viewport.width) * 100, 0, 100),
    bottomOffsetPx: clamp(actualBottom / verticalScale, 25, 900),
  };
}
