import React from 'react';
import TvBrowse from './TvBrowse';
import { TV_MOVIE_ROWS } from './data/tmdb';

/**
 * Page Films : l'accueil, restreint aux films.
 *
 * La bannière prend les cinq premiers titres de « Notre sélection du jour »,
 * la rangée reprend au sixième. Pas de reprise de lecture ici : elle est
 * transverse, et l'accueil la porte déjà. L'ordre des rangées est dans
 * `TV_MOVIE_ROWS`.
 */
const TvMovies: React.FC = () => (
  <TvBrowse rowIds={TV_MOVIE_ROWS} heroRowId="films-selection" />
);

export default TvMovies;
