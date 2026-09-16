import React from 'react';
import { motion } from 'framer-motion';

/**
 * Retour visuel d'un saut, version télécommande.
 *
 * La chrome souris affiche un pavé noir bordé, avec une icône de 52 px et une
 * barre de progression : à trente centimètres d'un écran d'ordinateur, ça se
 * justifie. À trois mètres, le même pavé masque un quart de l'image à chaque
 * pression de flèche, et les flèches se pressent en rafale.
 *
 * Ici, une pastille : la valeur cumulée du saut, une double chevronnée pour le
 * sens, rien d'autre. Le lecteur sait déjà ce qui se passe — il vient d'appuyer.
 * L'indicateur ne fait que confirmer de combien.
 *
 * Le composant ne porte pas de `AnimatePresence` : il est monté à l'intérieur de
 * celle de `HLSPlayer`, qui garde la main sur la sortie.
 */
interface TvSeekFlashProps {
  direction: 'forward' | 'rewind';
  /** Cumul du saut en cours, en secondes. Toujours positif. */
  seconds: number;
}

export const TvSeekFlash: React.FC<TvSeekFlashProps> = ({ direction, seconds }) => {
  const forward = direction === 'forward';

  return (
    <motion.div
      initial={{ opacity: 0, x: forward ? 12 : -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      // Aux deux tiers du centre, du côté où l'on va : la position dit le sens
      // avant même que l'œil ne lise le chiffre.
      className={
        'pointer-events-none absolute inset-y-0 z-50 flex items-center ' +
        (forward ? 'right-[18%]' : 'left-[18%]')
      }>
      <div className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-white">
        <SeekChevrons forward={forward} />
        {/* Le cumul, pas le pas : cinq pressions disent « +50 s », ce qui évite
            de compter les appuis pour savoir où l'on a atterri. */}
        <span className="text-sm font-bold tabular-nums tracking-wide">
          {forward ? '+' : '−'}
          {seconds}s
        </span>
      </div>
    </motion.div>
  );
};

/** Double chevron, dessiné plutôt qu'importé : deux triangles ne valent pas une icône de lucide. */
const SeekChevrons: React.FC<{ forward: boolean }> = ({ forward }) => (
  <svg
    viewBox="0 0 24 24"
    className={'h-4 w-4 ' + (forward ? '' : 'rotate-180')}
    fill="currentColor"
    aria-hidden="true">
    <path d="M4 6.2v11.6a1 1 0 0 0 1.54.84l8.7-5.8a1 1 0 0 0 0-1.68l-8.7-5.8A1 1 0 0 0 4 6.2Z" />
    <path d="M13.6 6.2v11.6a1 1 0 0 0 1.54.84l8.7-5.8a1 1 0 0 0 0-1.68l-8.7-5.8a1 1 0 0 0-1.54.84Z" />
  </svg>
);
