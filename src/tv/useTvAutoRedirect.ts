import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isTvDevice } from '@/utils/tv/isTvDevice';

const OPT_OUT_KEY = 'movix_tv_opt_out';

/**
 * Envoie les téléviseurs vers `/tvapp` en arrivant sur la racine.
 *
 * Uniquement depuis la racine : une TV qui ouvre un lien profond doit atterrir
 * sur la page demandée, pas être renvoyée à l'accueil. Et l'utilisateur peut
 * repasser volontairement sur l'interface souris — sans ce renoncement, il
 * serait renvoyé ici en boucle.
 */
export function useTvAutoRedirect(): void {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname !== '/') return;
    if (!isTvDevice()) return;
    try {
      if (sessionStorage.getItem(OPT_OUT_KEY) === 'true') return;
    } catch {
      // Stockage indisponible : on redirige, le renoncement ne durera que
      // le temps de la navigation en cours.
    }
    navigate('/tvapp', { replace: true });
  }, [location.pathname, navigate]);
}

/** Mémorise le choix de rester sur l'interface souris, pour cette session. */
export function optOutOfTvInterface(): void {
  try {
    sessionStorage.setItem(OPT_OUT_KEY, 'true');
  } catch {
    // Sans stockage, le renoncement ne survit pas à la navigation — acceptable.
  }
}
