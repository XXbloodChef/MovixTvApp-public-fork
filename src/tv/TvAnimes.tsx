import React from 'react';
import TvBrowse from './TvBrowse';
import { TV_ANIME_ROWS } from './data/tmdb';

/**
 * Page Animés : films et séries mêlés, japonais d'abord.
 *
 * La bannière prend les cinq premiers titres de « Diffusion en cours » — ce
 * qui passe cette saison — et la rangée reprend au sixième. L'ordre des
 * rangées est dans `TV_ANIME_ROWS`.
 */
const TvAnimes: React.FC = () => (
  <TvBrowse rowIds={TV_ANIME_ROWS} heroRowId="animes-en-cours" />
);

export default TvAnimes;
