/**
 * Sonde les capacités de lecture de la WebView de la TV.
 *
 * Les WebView des TV constructeur sont souvent figées sur une version ancienne
 * et le décodage matériel varie d'un modèle à l'autre : il faut mesurer sur
 * l'appareil, pas supposer.
 */

export interface CodecProbe {
  label: string;
  mimeType: string;
  supported: boolean;
}

export interface DrmProbe {
  label: string;
  keySystem: string;
  robustness: string;
  supported: boolean;
  /** Renseigné quand la demande échoue pour une raison inattendue. */
  error?: string;
}

export interface HlsProbe {
  /** La TV lit le HLS nativement dans <video src> (Safari/Tizen). */
  nativeHls: boolean;
  /** Media Source Extensions dispo — requis par hls.js. */
  mediaSource: boolean;
  /** MPEG-TS accepté directement dans MSE : sinon hls.js doit transmuxer. */
  mpegTsInMse: boolean;
}

const CODECS: Array<{ label: string; mimeType: string }> = [
  { label: 'H.264 baseline', mimeType: 'video/mp4; codecs="avc1.42E01E"' },
  { label: 'H.264 high 4.0', mimeType: 'video/mp4; codecs="avc1.640028"' },
  { label: 'HEVC / H.265', mimeType: 'video/mp4; codecs="hvc1.1.6.L93.B0"' },
  { label: 'AV1', mimeType: 'video/mp4; codecs="av01.0.04M.08"' },
  { label: 'VP9', mimeType: 'video/webm; codecs="vp9"' },
  { label: 'AAC-LC', mimeType: 'audio/mp4; codecs="mp4a.40.2"' },
  { label: 'Dolby Digital+ (E-AC-3)', mimeType: 'audio/mp4; codecs="ec-3"' },
];

export function probeCodecs(): CodecProbe[] {
  const isSupported = (mimeType: string): boolean => {
    if (typeof MediaSource === 'undefined') return false;
    try {
      return MediaSource.isTypeSupported(mimeType);
    } catch {
      return false;
    }
  };

  return CODECS.map(codec => ({ ...codec, supported: isSupported(codec.mimeType) }));
}

export function probeHls(): HlsProbe {
  const video = document.createElement('video');
  const nativeHls =
    video.canPlayType('application/vnd.apple.mpegurl') !== '' ||
    video.canPlayType('application/x-mpegURL') !== '';

  const mediaSource = typeof MediaSource !== 'undefined';
  let mpegTsInMse = false;
  if (mediaSource) {
    try {
      mpegTsInMse = MediaSource.isTypeSupported('video/mp2t; codecs="avc1.42E01E"');
    } catch {
      mpegTsInMse = false;
    }
  }

  return { nativeHls, mediaSource, mpegTsInMse };
}

const DRM_LEVELS: Array<{ label: string; robustness: string }> = [
  // Robustesse vide = aucune contrainte, la demande la plus permissive qui
  // existe. C'est le discriminant : si même celle-ci échoue, la WebView n'a pas
  // de CDM Widevine du tout, et le problème n'est pas un niveau de sécurité.
  { label: 'Widevine — sans contrainte', robustness: '' },
  // HW_SECURE_ALL ≈ Widevine L1 : décodage et rendu dans le TEE. Requis par
  // certains catalogues pour la HD ; absent des dongles bas de gamme.
  { label: 'Widevine L1 (HW_SECURE_ALL)', robustness: 'HW_SECURE_ALL' },
  { label: 'Widevine L2 (HW_SECURE_DECODE)', robustness: 'HW_SECURE_DECODE' },
  { label: 'Widevine L3 (SW_SECURE_DECODE)', robustness: 'SW_SECURE_DECODE' },
];

export async function probeDrm(): Promise<DrmProbe[]> {
  if (typeof navigator === 'undefined' || !navigator.requestMediaKeySystemAccess) {
    return DRM_LEVELS.map(level => ({
      ...level,
      keySystem: 'com.widevine.alpha',
      supported: false,
      error: 'requestMediaKeySystemAccess indisponible (contexte non sécurisé ?)',
    }));
  }

  return Promise.all(
    DRM_LEVELS.map(async level => {
      const probe: DrmProbe = {
        ...level,
        keySystem: 'com.widevine.alpha',
        supported: false,
      };
      try {
        await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [
          {
            initDataTypes: ['cenc'],
            videoCapabilities: [
              {
                contentType: 'video/mp4; codecs="avc1.42E01E"',
                robustness: level.robustness,
              },
            ],
          },
        ]);
        probe.supported = true;
      } catch (error) {
        // NotSupportedError est le cas normal « ce niveau n'existe pas ici ».
        // Tout autre nom mérite d'être affiché : souvent un problème de contexte
        // non sécurisé (http) plutôt qu'une absence de capacité.
        const name = error instanceof DOMException ? error.name : '';
        if (name !== 'NotSupportedError') {
          probe.error = error instanceof Error ? `${name || 'Error'}: ${error.message}` : String(error);
        }
      }
      return probe;
    }),
  );
}
