import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TV_SCALE } from './tvScale';
import { readPerfRecord } from './devicePerformance';
import { getTvDetection } from '@/utils/tv/isTvDevice';
import { useFocusItem, useFocusScope } from './nav/hooks';
import { TvTopNav } from './components/TvTopNav';
import { optOutOfTvInterface } from './useTvAutoRedirect';
import {
  getNativeAdBlockState,
  hasNativeAdBlock,
  setNativeAdBlockEnabled,
  type NativeAdBlockState,
} from '@/utils/tv/nativeAdBlock';

/**
 * Réglages de l'interface téléviseur.
 *
 * Recueille ce qui n'a pas sa place sur l'accueil : le diagnostic matériel et
 * le retour à l'interface souris encombraient la première chose qu'on voit en
 * allumant la télé, alors qu'on s'en sert une fois sur cent.
 */
const TvSettings: React.FC = () => {
  const navigate = useNavigate();
  const detection = React.useMemo(() => getTvDetection(), []);

  // Bloqueur natif : présent uniquement dans l'application TV.
  const [adBlock, setAdBlock] = React.useState<NativeAdBlockState | null>(null);
  React.useEffect(() => {
    if (!hasNativeAdBlock()) return;
    getNativeAdBlockState().then(setAdBlock).catch(() => setAdBlock(null));
  }, []);

  const adBlockHint = !adBlock
    ? 'Indisponible'
    : !adBlock.enabled
      ? 'Désactivé — les lecteurs embarqués affichent leurs publicités'
      : adBlock.blocked === 0
        ? 'Activé · aucune requête bloquée depuis le démarrage'
        : `Activé · ${adBlock.blocked} requête${adBlock.blocked > 1 ? 's' : ''} bloquée${adBlock.blocked > 1 ? 's' : ''}`;

  const entries = [
    ...(hasNativeAdBlock()
      ? [
          {
            label: 'Bloqueur de publicités',
            hint: adBlockHint,
            onSelect: () => {
              setNativeAdBlockEnabled(!(adBlock?.enabled ?? true))
                .then(setAdBlock)
                .catch(() => {});
            },
          },
        ]
      : []),
    {
      label: 'Diagnostic matériel',
      hint: 'Codecs, DRM, télécommande, framerate',
      onSelect: () => navigate('/tvapp/diag'),
    },
    {
      label: 'Interface classique',
      hint: 'Revenir au site souris et tactile',
      onSelect: () => {
        optOutOfTvInterface();
        navigate('/');
      },
    },
  ];

  const scopeRef = useFocusScope({
    id: 'reglages',
    orientation: 'column',
    count: entries.length,
  });

  return (
    <div className="pb-[5%]">
      <TvTopNav />
      <h1 className="mb-8 px-[6%] text-3xl font-black tracking-tight">Paramètres</h1>

      <div ref={scopeRef} className="flex flex-col gap-3 px-[6%]">
        {entries.map((entry, index) => (
          <TvSettingsEntry key={entry.label} index={index} {...entry} />
        ))}
      </div>

      <p className="mt-10 px-[6%] text-sm text-white/30">
        Détection : {detection.isTv ? 'téléviseur' : 'non-TV'} via {detection.source}
        {' · '}viewport {window.innerWidth}×{window.innerHeight}
        {' · '}échelle {TV_SCALE === 1 ? '1 (gabarit natif)' : `${TV_SCALE}`}
        {' · '}palier {readPerfRecord() ? `${readPerfRecord()!.tier} (${readPerfRecord()!.fps} i/s)` : 'non mesuré'}
      </p>
    </div>
  );
};

const TvSettingsEntry: React.FC<{
  index: number;
  label: string;
  hint: string;
  onSelect: () => void;
}> = ({ index, label, hint, onSelect }) => {
  const { ref, focused, focusProps } = useFocusItem<HTMLButtonElement>('reglages', index);

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
        'w-[460px] rounded-xl border-2 p-4 text-left outline-none transition-transform duration-150 ' +
        (focused
          ? 'scale-[1.02] border-movix-red-bright bg-movix-red/20'
          : 'border-white/10 bg-white/5')
      }>
      <span className="block text-xl font-bold">{label}</span>
      <span className="mt-1 block text-sm text-white/50">{hint}</span>
    </button>
  );
};

export default TvSettings;
