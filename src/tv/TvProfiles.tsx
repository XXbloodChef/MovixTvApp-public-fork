import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '@/context/ProfileContext';
import type { Profile } from '@/types/profile';
import { TvTopNav } from './components/TvTopNav';
import { useFocusItem, useFocusScope } from './nav/hooks';

const PROFILES_SCOPE = 'profils';

const TvProfiles: React.FC = () => {
  const navigate = useNavigate();
  const { currentProfile, profiles, selectProfile, isLoading } = useProfile();
  const [switchingId, setSwitchingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState('');
  const activeIndex = Math.max(
    0,
    profiles.findIndex(profile => profile.id === currentProfile?.id),
  );

  const scopeRef = useFocusScope({
    id: PROFILES_SCOPE,
    orientation: 'grid',
    count: profiles.length,
    columns: 4,
    entry: activeIndex,
    neighbors: { up: 'nav' },
  });

  const activate = async (profile: Profile) => {
    if (switchingId || profile.id === currentProfile?.id) return;
    setError('');
    setSwitchingId(profile.id);
    try {
      const selected = await selectProfile(profile.id);
      if (!selected) {
        setError('Le profil n’a pas pu être chargé. Réessaie dans quelques secondes.');
        return;
      }
      navigate(-1);
    } catch {
      setError('Le profil n’a pas pu être chargé. Vérifie la connexion puis réessaie.');
    } finally {
      setSwitchingId(null);
    }
  };

  return (
    <div className="min-h-[var(--tv-screen-height)] bg-[#0a0a0a] pb-[5%]">
      <TvTopNav neighbors={{ down: profiles.length > 0 ? PROFILES_SCOPE : null }} />

      <main className="px-[6%] pt-8">
        <h1 className="text-3xl font-black tracking-tight">Profils</h1>
        <p className="mt-2 text-base text-white/55">
          Choisis le profil utilisé pour l’historique, la liste et les restrictions d’âge.
        </p>

        {isLoading && profiles.length === 0 ? (
          <p className="mt-12 text-lg text-white/65">Chargement des profils…</p>
        ) : profiles.length === 0 ? (
          <div className="mt-12 max-w-[620px] rounded-xl border border-white/10 bg-white/5 p-6">
            <p className="text-xl font-bold">Aucun profil disponible</p>
            <p className="mt-2 text-white/55">
              Les profils apparaîtront ici dès qu’un compte Movix avec des profils sera connecté.
            </p>
          </div>
        ) : (
          <div ref={scopeRef} className="mt-10 flex flex-wrap gap-5">
            {profiles.map((profile, index) => (
              <TvProfileCard
                key={profile.id}
                index={index}
                profile={profile}
                active={profile.id === currentProfile?.id}
                switching={profile.id === switchingId}
                onSelect={() => void activate(profile)}
              />
            ))}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-8 text-base font-medium text-red-400">
            {error}
          </p>
        )}
      </main>
    </div>
  );
};

const TvProfileCard: React.FC<{
  index: number;
  profile: Profile;
  active: boolean;
  switching: boolean;
  onSelect: () => void;
}> = ({ index, profile, active, switching, onSelect }) => {
  const { ref, focused, focusProps } = useFocusItem<HTMLButtonElement>(
    PROFILES_SCOPE,
    index,
  );
  const initial = profile.name.trim().slice(0, 1).toLocaleUpperCase() || '?';
  const restriction = profile.ageRestriction
    ? `${profile.ageRestriction}+`
    : 'Tous publics';

  return (
    <button
      ref={ref}
      {...focusProps}
      type="button"
      onClick={onSelect}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={
        'flex w-[210px] items-center gap-4 rounded-xl border-2 p-4 text-left outline-none transition-transform duration-150 ' +
        (focused
          ? 'scale-[1.04] border-white bg-white text-black'
          : active
            ? 'border-movix-red-bright bg-movix-red/20 text-white'
            : 'border-white/10 bg-white/5 text-white')
      }>
      <span
        aria-hidden
        className={
          'flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl font-black ' +
          (focused ? 'bg-black/10' : active ? 'bg-movix-red' : 'bg-white/10')
        }>
        {initial}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-lg font-bold">{profile.name}</span>
        <span className={focused ? 'text-sm text-black/55' : 'text-sm text-white/45'}>
          {switching ? 'Activation…' : active ? 'Profil actuel' : restriction}
        </span>
      </span>
    </button>
  );
};

export default TvProfiles;
