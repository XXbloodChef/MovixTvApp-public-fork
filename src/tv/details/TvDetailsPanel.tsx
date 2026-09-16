import React from 'react';
import type { TvMediaDetails } from '../data/tmdbDetails';

/**
 * Onglet Détails.
 *
 * C'est ici qu'atterrit tout ce que le hero ne peut plus porter : le synopsis
 * entier, la fiche technique, et l'avertissement légal qui flottait jusqu'ici
 * en bas de l'écran sans rattachement.
 *
 * Aucune portée de focus : il n'y a rien à activer. Bas depuis les onglets ne
 * mène donc nulle part, et le moteur laisse filer la touche — c'est le
 * comportement voulu, à condition que le contenu tienne sans défilement. Deux
 * colonnes et un synopsis borné à six lignes y suffisent sur 960×540.
 */

interface TvDetailsPanelProps {
  details: TvMediaDetails;
  height: number;
}

export const TvDetailsPanel: React.FC<TvDetailsPanelProps> = ({ details, height }) => (
  <div className="flex gap-[48px] overflow-hidden" style={{ height }}>
    <div className="max-w-[440px] flex-1">
      <h2 className="text-[20px] font-bold leading-tight">{details.title}</h2>
      <p className="mt-[12px] text-[14px] leading-[1.6] text-white/75 line-clamp-6">
        {details.overview || 'Aucun résumé disponible.'}
      </p>
      <p className="mt-[16px] text-[12px] leading-[1.5] text-white/40">
        Les sources de lecture sont fournies par des services tiers. Movix n'héberge aucun
        contenu.
      </p>
    </div>

    <div className="flex flex-1 gap-[36px] text-[13px]">
      <dl className="space-y-[14px]">
        <Field label="Date de sortie" value={details.years} />
        <Field label="Genres" value={details.genres.join(', ')} />
        <Field label="Classification" value={details.certification} />
      </dl>
      <dl className="space-y-[14px]">
        <Field
          label={details.mediaType === 'tv' ? 'Création' : 'Réalisation'}
          value={details.creators.join(', ')}
        />
        <Field label="Distribution" value={details.cast.join(', ')} />
        <Field
          label={details.mediaType === 'tv' ? 'Saisons' : 'Durée'}
          value={
            details.mediaType === 'tv'
              ? `${details.seasonCount} saison${details.seasonCount > 1 ? 's' : ''}`
              : details.runtime
          }
        />
      </dl>
    </div>
  </div>
);

/** Un champ absent est masqué, jamais rendu avec un tiret ou « inconnu ». */
const Field: React.FC<{ label: string; value: string | null }> = ({ label, value }) =>
  value ? (
    <div>
      <dt className="text-white/40">{label}</dt>
      <dd className="mt-[2px] max-w-[200px] leading-[1.4] text-white/85">{value}</dd>
    </div>
  ) : null;
