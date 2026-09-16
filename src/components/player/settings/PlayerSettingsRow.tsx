import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Minus, Plus, Pin } from 'lucide-react';
import { S } from './playerSettings.tokens';
import { isTvBackKey } from './tvBackKeys';
import { type LanguagePaint, type SourceLanguage, paintFor } from './sourceLanguage';

/**
 * Kit de lignes du panneau de réglages — piste B.
 *
 * Six patterns, une seule hauteur (48 px, 56 px si sous-titre), une seule
 * grammaire de touches. Le focus est piloté par `SettingsRowList` (focus
 * tournant) et non par la pseudo-classe :focus, pour que le rendu soit
 * identique à la télécommande et au clavier.
 */

type IconComponent = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

export type RowTone = 'default' | 'danger';

interface RowCommon {
  id: string;
  label: string;
  disabled?: boolean;
  tone?: RowTone;
}

export type SettingsRowDescriptor =
  /** Descend d'un niveau. Affiche la valeur courante à droite. */
  | (RowCommon & {
      kind: 'nav';
      value?: string;
      badge?: string;
      icon?: IconComponent;
      onSelect: () => void;
    })
  /** Action immédiate sans descente (relancer la recherche, copier le lien). */
  | (RowCommon & {
      kind: 'action';
      icon?: IconComponent;
      onSelect: () => void;
    })
  /** Choix exclusif dans une liste (résolution, vitesse, piste audio). */
  | (RowCommon & {
      kind: 'choice';
      sublabel?: string;
      badge?: string;
      selected: boolean;
      pinned?: boolean;
      /** Teinte la barre active et le badge. Seule dimension colorée du panneau. */
      language?: SourceLanguage | null;
      /** Pastilles de langue à droite — résumé d'un sous-niveau (niveau 2 des sources). */
      languageDots?: SourceLanguage[];
      /** Mesure de qualité en cours : trait de balayage sous la ligne. */
      probing?: boolean;
      onSelect: () => void;
      onTogglePin?: () => void;
      /**
       * Appelé quand la ligne prend le focus, avant toute validation. Sert à
       * prévisualiser un choix pendant qu'on parcourt la liste (taille des
       * sous-titres) ; c'est au niveau de remettre les choses en ordre à la
       * sortie (`SectionLevel.onLeave`) si rien n'a été validé.
       */
      onFocus?: () => void;
    })
  | (RowCommon & {
      kind: 'toggle';
      checked: boolean;
      onToggle: (next: boolean) => void;
    })
  /** Gauche/droite ajustent la valeur quand la ligne est focusée. */
  | (RowCommon & {
      kind: 'slider';
      value: number;
      min: number;
      max: number;
      step: number;
      format?: (value: number) => string;
      onChange: (value: number) => void;
    })
  | (RowCommon & {
      kind: 'stepper';
      display: string;
      onStep: (direction: -1 | 1) => void;
    })
  | (RowCommon & {
      kind: 'segmented';
      options: ReadonlyArray<{ id: string; label: string }>;
      value: string;
      onChange: (optionId: string) => void;
    })
  | { kind: 'separator'; id: string }
  | { kind: 'caption'; id: string; label: string };

export const isFocusableRow = (row: SettingsRowDescriptor): boolean =>
  row.kind !== 'separator' && row.kind !== 'caption' && !row.disabled;

// ---------------------------------------------------------------------------
// Fragments partagés
// ---------------------------------------------------------------------------

const Badge: React.FC<{
  children: React.ReactNode;
  focused: boolean;
  /** Peinture de langue. Absente → badge neutre. */
  paint?: LanguagePaint;
}> = ({ children, focused, paint }) => (
  <span
    style={{
      fontSize: S.font.badge,
      lineHeight: 1.4,
      borderRadius: S.badge.radius,
      padding: `${S.badge.paddingY}px ${S.badge.paddingX}px`,
      whiteSpace: 'nowrap',
      color: paint
        ? focused
          ? paint.solidText
          : paint.soft
        : focused
          ? S.text.onFocus
          : S.text.value,
      background: paint
        ? focused
          ? paint.solidBackground
          : paint.softBackground
        : focused
          ? S.badge.backgroundOnFocus
          : S.badge.background,
    }}
  >
    {children}
  </span>
);

/**
 * Barre verticale de la ligne active. Elle dit deux choses d'un coup : « c'est
 * celle qui joue » et « c'est cette langue ». Elle remplace la coche dans la
 * gouttière quand la ligne porte une langue — pas de coche ET de barre.
 */
const ActiveBar: React.FC<{ paint: LanguagePaint; focused: boolean; tall?: boolean }> = ({
  paint,
  focused,
  tall,
}) => (
  <span
    aria-hidden="true"
    style={{
      width: 3,
      height: tall ? 22 : 20,
      flexShrink: 0,
      borderRadius: 2,
      background: focused ? paint.solid : paint.soft,
    }}
  />
);

/** Résumé des langues disponibles dans un sous-niveau, sans y entrer. */
const LanguageDots: React.FC<{ languages: SourceLanguage[]; focused: boolean }> = ({
  languages,
  focused,
}) => (
  <span aria-hidden="true" style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
    {languages.map(language => {
      const paint = paintFor(language);
      return (
        <span
          key={language}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: focused ? paint.solid : paint.soft,
          }}
        />
      );
    })}
  </span>
);

/**
 * Trait de balayage pendant la mesure de qualité. Remplace le compteur « 2/9 » :
 * chaque ligne dit elle-même où elle en est, on n'a plus à faire la
 * correspondance entre un chiffre global et une liste.
 */
const ProbeSweep: React.FC<{ focused: boolean }> = ({ focused }) => (
  <span
    aria-hidden="true"
    style={{
      position: 'absolute',
      left: S.row.paddingX,
      right: S.row.paddingX,
      bottom: 6,
      height: 1,
      overflow: 'hidden',
      borderRadius: 1,
      background: focused ? 'rgba(11, 14, 18, 0.10)' : 'rgba(255, 255, 255, 0.06)',
    }}
  >
    <span
      style={{
        display: 'block',
        width: '34%',
        height: '100%',
        background: focused ? S.text.onFocusMuted : S.accent.solid,
        animation: 'movix-probe-sweep 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }}
    />
  </span>
);

const rowShellStyle = (focused: boolean, twoLine: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: S.row.gap,
  width: '100%',
  height: twoLine ? S.row.heightTwoLine : S.row.height,
  padding: `0 ${S.row.paddingX}px`,
  borderRadius: S.row.radius,
  background: focused ? S.focus.background : 'transparent',
  textAlign: 'left',
  border: 'none',
  outline: 'none',
  cursor: 'pointer',
  position: 'relative',
  transition: 'background 120ms linear',
});

const labelStyle = (focused: boolean, tone: RowTone, disabled?: boolean): React.CSSProperties => ({
  flex: 1,
  minWidth: 0,
  fontSize: S.font.label,
  fontWeight: focused ? 500 : 400,
  color: focused
    ? S.text.onFocus
    : disabled
      ? S.text.inactive
      : tone === 'danger'
        ? S.danger.text
        : S.text.label,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

const valueStyle = (focused: boolean): React.CSSProperties => ({
  fontSize: S.font.value,
  color: focused ? S.text.onFocusMuted : S.text.value,
  whiteSpace: 'nowrap',
});

// ---------------------------------------------------------------------------
// Ligne
// ---------------------------------------------------------------------------

interface SettingsRowProps {
  row: SettingsRowDescriptor;
  focused: boolean;
  onFocus: () => void;
}

export const SettingsRow = React.forwardRef<HTMLButtonElement, SettingsRowProps>(
  ({ row, focused, onFocus }, ref) => {
    if (row.kind === 'separator') {
      return (
        <div
          aria-hidden="true"
          style={{
            height: S.separator.thickness,
            background: S.separator.color,
            margin: `${S.separator.marginY}px ${S.separator.marginX}px`,
          }}
        />
      );
    }

    if (row.kind === 'caption') {
      return (
        <p
          style={{
            margin: `0 0 4px ${S.row.paddingX}px`,
            fontSize: S.font.caption,
            color: S.text.inactive,
            letterSpacing: '0.03em',
          }}
        >
          {row.label}
        </p>
      );
    }

    const tone: RowTone = row.tone ?? 'default';
    const iconColor = focused ? S.text.onFocus : tone === 'danger' ? S.danger.icon : S.icon.idle;

    const activate = () => {
      if (row.disabled) return;
      switch (row.kind) {
        case 'nav':
        case 'action':
        case 'choice':
          row.onSelect();
          break;
        case 'toggle':
          row.onToggle(!row.checked);
          break;
        default:
          break;
      }
    };

    const twoLine = row.kind === 'choice' && Boolean(row.sublabel);

    return (
      <button
        ref={ref}
        type="button"
        role={row.kind === 'choice' ? 'radio' : row.kind === 'toggle' ? 'switch' : undefined}
        aria-checked={
          row.kind === 'choice' ? row.selected : row.kind === 'toggle' ? row.checked : undefined
        }
        aria-disabled={row.disabled || undefined}
        tabIndex={focused ? 0 : -1}
        data-settings-row={row.id}
        data-settings-row-kind={row.kind}
        data-settings-row-focused={focused || undefined}
        onFocus={onFocus}
        onMouseEnter={onFocus}
        onClick={activate}
        style={rowShellStyle(focused, twoLine)}
      >
        {/* Gouttière gauche : icône de section, coche, ou vide pour l'alignement */}
        {row.kind === 'choice' ? (
          row.language ? (
            // Ligne porteuse d'une langue : la barre remplace la coche.
            <span style={{ width: 3, display: 'flex', flexShrink: 0 }}>
              {row.selected && (
                <ActiveBar paint={paintFor(row.language)} focused={focused} tall={twoLine} />
              )}
            </span>
          ) : (
            <span style={{ width: 16, display: 'flex', flexShrink: 0 }}>
              {row.selected && <Check size={16} style={{ color: iconColor }} />}
            </span>
          )
        ) : (row.kind === 'nav' || row.kind === 'action') && row.icon ? (
          <row.icon className="shrink-0" style={{ width: 19, height: 19, color: iconColor }} />
        ) : null}

        {twoLine ? (
          <span style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{ ...labelStyle(focused, tone, row.disabled), display: 'block', flex: 'none' }}
            >
              {row.label}
            </span>
            <span
              style={{
                display: 'block',
                marginTop: 1,
                fontSize: S.font.sublabel,
                color: focused ? S.text.onFocusMuted : S.text.inactive,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {(row as Extract<SettingsRowDescriptor, { kind: 'choice' }>).sublabel}
            </span>
          </span>
        ) : (
          <span style={labelStyle(focused, tone, row.disabled)}>{row.label}</span>
        )}

        {/* Partie droite, spécifique au pattern */}
        {row.kind === 'nav' && (
          <>
            {row.badge && <Badge focused={focused}>{row.badge}</Badge>}
            {row.value && <span style={valueStyle(focused)}>{row.value}</span>}
            <ChevronRight
              size={16}
              style={{ flexShrink: 0, color: focused ? S.text.onFocusMuted : S.icon.faint }}
            />
          </>
        )}

        {row.kind === 'choice' && (
          <>
            {row.badge && (
              <Badge focused={focused} paint={row.language ? paintFor(row.language) : undefined}>
                {row.badge}
              </Badge>
            )}
            {row.languageDots && row.languageDots.length > 0 && (
              <LanguageDots languages={row.languageDots} focused={focused} />
            )}
            {row.onTogglePin && (
              <Pin
                size={15}
                onClick={(event: React.MouseEvent) => {
                  event.stopPropagation();
                  row.onTogglePin?.();
                }}
                style={{
                  flexShrink: 0,
                  color: focused ? S.text.onFocus : row.pinned ? S.accent.solid : S.icon.fainter,
                  fill: row.pinned ? 'currentColor' : 'none',
                }}
              />
            )}
          </>
        )}

        {row.kind === 'toggle' && <ToggleTrack checked={row.checked} focused={focused} />}

        {row.kind === 'slider' && (
          <SliderTrack
            value={row.value}
            min={row.min}
            max={row.max}
            focused={focused}
            display={row.format ? row.format(row.value) : String(row.value)}
          />
        )}

        {row.kind === 'stepper' && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            <Minus size={15} style={{ color: focused ? S.text.onFocusMuted : S.icon.idle }} />
            <span
              style={{
                fontSize: 14,
                minWidth: 52,
                textAlign: 'center',
                color: focused ? S.text.onFocus : S.text.title,
              }}
            >
              {row.display}
            </span>
            <Plus size={15} style={{ color: focused ? S.text.onFocusMuted : S.icon.idle }} />
          </span>
        )}

        {row.kind === 'segmented' && (
          <span
            style={{
              display: 'flex',
              flexShrink: 0,
              borderRadius: 9,
              padding: 3,
              background: focused ? S.badge.backgroundOnFocus : S.badge.background,
            }}
          >
            {row.options.map(option => {
              const active = option.id === row.value;
              return (
                <span
                  key={option.id}
                  style={{
                    fontSize: S.font.value,
                    padding: '4px 12px',
                    borderRadius: 7,
                    whiteSpace: 'nowrap',
                    background: active ? (focused ? S.text.onFocus : '#E8EAED') : 'transparent',
                    color: active
                      ? focused
                        ? S.focus.background
                        : S.text.onFocus
                      : focused
                        ? S.text.onFocusMuted
                        : S.text.value,
                  }}
                >
                  {option.label}
                </span>
              );
            })}
          </span>
        )}

        {row.kind === 'choice' && row.probing && <ProbeSweep focused={focused} />}

        {/* Rappel des flèches, uniquement sur les lignes à axe horizontal focusées */}
        {focused && (row.kind === 'slider' || row.kind === 'stepper' || row.kind === 'segmented') && (
          <span
            style={{ fontSize: 12, color: S.text.onFocusMuted, flexShrink: 0 }}
            aria-hidden="true"
          >
            ‹ ›
          </span>
        )}
      </button>
    );
  },
);

SettingsRow.displayName = 'SettingsRow';

const ToggleTrack: React.FC<{ checked: boolean; focused: boolean }> = ({ checked, focused }) => (
  <span
    aria-hidden="true"
    style={{
      position: 'relative',
      width: 38,
      height: 22,
      flexShrink: 0,
      borderRadius: 11,
      background: checked
        ? focused
          ? S.text.onFocus
          : '#E8EAED'
        : focused
          ? S.badge.backgroundOnFocus
          : 'rgba(255, 255, 255, 0.14)',
      transition: 'background 140ms linear',
    }}
  >
    <span
      style={{
        position: 'absolute',
        top: 3,
        left: checked ? 19 : 3,
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: checked ? (focused ? S.focus.background : '#0D1015') : '#8B93A0',
        transition: 'left 140ms cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    />
  </span>
);

const SliderTrack: React.FC<{
  value: number;
  min: number;
  max: number;
  focused: boolean;
  display: string;
}> = ({ value, min, max, focused, display }) => {
  const ratio = max === min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  const percent = `${(ratio * 100).toFixed(1)}%`;
  const fill = focused ? S.text.onFocus : '#E8EAED';

  return (
    <>
      <span
        aria-hidden="true"
        style={{
          flex: 1,
          minWidth: 60,
          position: 'relative',
          height: 4,
          borderRadius: 2,
          background: focused ? 'rgba(11, 14, 18, 0.16)' : 'rgba(255, 255, 255, 0.16)',
        }}
      >
        <span
          style={{
            position: 'absolute',
            insetBlock: 0,
            left: 0,
            width: percent,
            borderRadius: 2,
            background: fill,
          }}
        />
        <span
          style={{
            position: 'absolute',
            top: -5,
            left: percent,
            marginLeft: -7,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: fill,
          }}
        />
      </span>
      <span style={{ ...valueStyle(focused), minWidth: 40, textAlign: 'right' }}>{display}</span>
    </>
  );
};

// ---------------------------------------------------------------------------
// Liste à focus tournant
// ---------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Arrondit sur la grille du pas pour éviter les 0.30000000000000004. */
const snap = (value: number, min: number, step: number) => {
  const steps = Math.round((value - min) / step);
  const raw = min + steps * step;
  const decimals = (String(step).split('.')[1] ?? '').length;
  return Number(raw.toFixed(decimals));
};

interface SettingsRowListProps {
  rows: SettingsRowDescriptor[];
  /** Id de ligne à focuser au montage (mémoire de focus). */
  initialFocusId?: string | null;
  /** Appelé à chaque changement de focus — alimente la mémoire du niveau. */
  onFocusChange?: (rowId: string) => void;
  /** Flèche gauche / Retour sur une ligne sans axe horizontal. */
  onBack?: () => void;
}

export const SettingsRowList: React.FC<SettingsRowListProps> = ({
  rows,
  initialFocusId,
  onFocusChange,
  onBack,
}) => {
  const focusable = useMemo(() => rows.filter(isFocusableRow), [rows]);
  const refs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const [focusedId, setFocusedId] = useState<string>(() => {
    const remembered = initialFocusId
      ? focusable.find(row => row.id === initialFocusId)
      : undefined;
    return (remembered ?? focusable[0])?.id ?? '';
  });

  // Si la liste change sous nos pieds (une source finit de charger), on garde le
  // focus s'il existe encore, sinon on retombe sur la première ligne.
  useEffect(() => {
    if (focusable.length === 0) return;
    if (!focusable.some(row => row.id === focusedId)) {
      setFocusedId(focusable[0].id);
    }
  }, [focusable, focusedId]);

  useLayoutEffect(() => {
    const node = refs.current.get(focusedId);
    if (!node) return;
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: 'nearest' });
  }, [focusedId]);

  const focus = useCallback(
    (rowId: string) => {
      setFocusedId(rowId);
      onFocusChange?.(rowId);
      const row = focusable.find(item => item.id === rowId);
      if (row?.kind === 'choice') row.onFocus?.();
    },
    [focusable, onFocusChange],
  );

  const move = useCallback(
    (delta: 1 | -1) => {
      const index = focusable.findIndex(row => row.id === focusedId);
      if (index === -1) return;
      const next = focusable[clamp(index + delta, 0, focusable.length - 1)];
      if (next && next.id !== focusedId) focus(next.id);
    },
    [focusable, focusedId, focus],
  );

  /** Retourne true si la ligne a consommé la flèche horizontale. */
  const horizontal = useCallback(
    (direction: -1 | 1): boolean => {
      const row = focusable.find(item => item.id === focusedId);
      if (!row) return false;

      switch (row.kind) {
        case 'slider': {
          const next = snap(
            clamp(row.value + direction * row.step, row.min, row.max),
            row.min,
            row.step,
          );
          if (next !== row.value) row.onChange(next);
          return true;
        }
        case 'stepper':
          row.onStep(direction);
          return true;
        case 'segmented': {
          const index = row.options.findIndex(option => option.id === row.value);
          const next = row.options[clamp(index + direction, 0, row.options.length - 1)];
          if (next && next.id !== row.value) row.onChange(next.id);
          return true;
        }
        case 'nav':
          // Droite = entrer, gauche = remonter.
          if (direction === 1) {
            row.onSelect();
            return true;
          }
          return false;
        default:
          return false;
      }
    },
    [focusable, focusedId],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Retour d'abord : sur Tizen et webOS il arrive avec un keyCode
      // propriétaire (10009 / 461) que `useTvPlayerRemote` ne traite pas.
      if (isTvBackKey(event.nativeEvent)) {
        event.preventDefault();
        event.stopPropagation();
        onBack?.();
        return;
      }

      // Entrée et Espace : on laisse le bouton s'activer nativement, mais on
      // coupe la propagation pour que `navigateDialog` ne déclenche pas un
      // second `current.click()` depuis window.
      if (event.key === 'Enter' || event.key === ' ') {
        event.stopPropagation();
        return;
      }

      if (!event.key.startsWith('Arrow')) return;

      // `useTvPlayerRemote` écoute les flèches sur window et y refait une
      // navigation géométrique. Sans ce stopPropagation, chaque appui
      // déplacerait le focus deux fois : une par la liste, une par le hook.
      // Les blocs historiques, eux, ne passent pas par ici — le hook continue
      // donc de les piloter exactement comme aujourd'hui.
      event.stopPropagation();

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          move(1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          move(-1);
          break;
        case 'ArrowRight':
          if (horizontal(1)) event.preventDefault();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          if (!horizontal(-1)) onBack?.();
          break;
        default:
          break;
      }
    },
    [move, horizontal, onBack],
  );

  return (
    <div role="menu" onKeyDown={onKeyDown}>
      {rows.map(row => (
        <SettingsRow
          key={row.id}
          row={row}
          focused={isFocusableRow(row) && row.id === focusedId}
          onFocus={() => isFocusableRow(row) && focus(row.id)}
          ref={node => {
            if (node) refs.current.set(row.id, node);
            else refs.current.delete(row.id);
          }}
        />
      ))}
    </div>
  );
};
