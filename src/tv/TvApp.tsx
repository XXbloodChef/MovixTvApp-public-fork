import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { TvLayout } from './TvLayout';
import TvHome from './TvHome';
import TvDetails from './TvDetails';
import TvCollection from './TvCollection';
import TvSearch from './TvSearch';
import TvSettings from './TvSettings';
import TvMovies from './TvMovies';
import TvSeries from './TvSeries';
import TvAnimes from './TvAnimes';
import TvProfiles from './TvProfiles';

/**
 * Racine de l'interface téléviseur, montée sur `/tvapp/*`.
 *
 * Les chemins des routes internes sont relatifs à ce préfixe. La page de
 * diagnostic reste volontairement en dehors : elle porte sa propre sonde de
 * navigation, qui se battrait avec le moteur de `TvLayout` pour les flèches.
 */
const TvApp: React.FC = () => (
  <TvLayout>
    <Routes>
      <Route path="/" element={<TvHome />} />
      <Route path="/search" element={<TvSearch />} />
      <Route path="/settings" element={<TvSettings />} />
      <Route path="/profiles" element={<TvProfiles />} />
      <Route path="/movies" element={<TvMovies />} />
      <Route path="/series" element={<TvSeries />} />
      <Route path="/animes" element={<TvAnimes />} />
      {/* Avant la route à deux segments dynamiques : « collection » y serait
          sinon lu comme un type de média. React Router classe déjà le statique
          avant le dynamique, mais l'ordre le rend lisible. */}
      <Route path="/collection/:rowId" element={<TvCollection />} />
      <Route path="/:mediaType/:id" element={<TvDetails />} />
      <Route path="*" element={<Navigate to="/tvapp" replace />} />
    </Routes>
  </TvLayout>
);

export default TvApp;
