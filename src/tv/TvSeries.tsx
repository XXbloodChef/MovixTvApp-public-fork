import React from 'react';
import TvBrowse from './TvBrowse';
import { TV_SERIES_ROWS } from './data/tmdb';

/**
 * Page Séries : l'accueil, restreint aux séries.
 *
 * La bannière prend les cinq premiers titres de « Notre sélection du jour »,
 * la rangée reprend au sixième. L'ordre des rangées est dans `TV_SERIES_ROWS`.
 */
const TvSeries: React.FC = () => (
  <TvBrowse rowIds={TV_SERIES_ROWS} heroRowId="series-selection" />
);

export default TvSeries;
