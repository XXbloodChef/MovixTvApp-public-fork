import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type Hls from 'hls.js';
import { getTvDetection, setTvOverride } from '@/utils/tv/isTvDevice';
import { useSpatialNavProbe } from './useSpatialNavProbe';
import { useFpsMeter } from './useFpsMeter';
import {
  probeCodecs,
  probeDrm,
  probeHls,
  type CodecProbe,
  type DrmProbe,
} from './mediaCapabilities';

/**
 * Page de validation matérielle — Phase 0 de l'adaptation TV.
 *
 * Elle ne fait partie d'aucun parcours utilisateur : elle sert à répondre sur le
 * vrai téléviseur aux questions qui conditionnent tout le reste du chantier.
 *   1. La détection TV fonctionne-t-elle ?
 *   2. Quel viewport CSS la WebView expose-t-elle réellement ?
 *   3. Les touches de la télécommande arrivent-elles, et avec quelle latence ?
 *   4. Quels codecs et quel niveau Widevine sont disponibles ?
 *   5. Le HLS joue-t-il, et à quel framerate l'interface tient-elle ?
 *
 * Accessible sur /tvapp/diag. Dans un navigateur de bureau : /tvapp/diag?tv=1
 *
 * Le préfixe est /tvapp et non /tv : `/tv/:id` est déjà la route des séries.
 */

// Flux de test public d'Apple : multi-débit, TS, sous-titres. Sert de référence
// « si ça ne passe pas ici, le problème n'est pas nos sources ».
const DEFAULT_TEST_STREAM =
  'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8';

const MAX_KEY_LOG = 14;

interface KeyLogEntry {
  id: number;
  label: string;
  detail: string;
  /** Délai entre l'appui et l'image suivante, en ms. */
  latencyMs: number | null;
}

interface PlaybackStats {
  droppedFrames: number;
  totalFrames: number;
  resolution: string;
  buffered: string;
  level: string;
}

const Panel: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({
  title,
  children,
  className = '',
}) => (
  <section
    className={`rounded-2xl border border-white/10 bg-white/[0.03] p-6 ${className}`}
  >
    <h2 className="mb-4 text-2xl font-bold tracking-tight text-movix-red-bright">{title}</h2>
    {children}
  </section>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-6 border-b border-white/5 py-2 last:border-b-0">
    <span className="text-lg text-white/60">{label}</span>
    <span className="text-right text-lg font-semibold tabular-nums">{children}</span>
  </div>
);

const Verdict: React.FC<{ ok: boolean; children?: React.ReactNode }> = ({ ok, children }) => (
  <span className={ok ? 'text-emerald-400' : 'text-red-400'}>
    {children ?? (ok ? 'oui' : 'non')}
  </span>
);

const TvButton: React.FC<{
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}> = ({ onClick, children, className = '' }) => (
  <button
    type="button"
    data-tv-focusable=""
    onClick={onClick}
    className={
      'rounded-xl border-2 border-white/15 bg-white/5 px-6 py-4 text-xl font-semibold ' +
      'outline-none transition-transform duration-100 ' +
      'focus:border-movix-red-bright focus:bg-movix-red/20 focus:scale-105 ' +
      'focus:ring-4 focus:ring-movix-red/50 ' +
      className
    }
  >
    {children}
  </button>
);

const TvDiagnosticsPage: React.FC = () => {
  const detection = useMemo(() => getTvDetection(), []);
  const codecs = useMemo<CodecProbe[]>(() => probeCodecs(), []);
  const hlsSupport = useMemo(() => probeHls(), []);
  const [drm, setDrm] = useState<DrmProbe[] | null>(null);

  const [keyLog, setKeyLog] = useState<KeyLogEntry[]>([]);
  const keyIdRef = useRef(0);

  const [viewport, setViewport] = useState(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    screenWidth: window.screen?.width ?? 0,
    screenHeight: window.screen?.height ?? 0,
  }));

  const [streamUrl, setStreamUrl] = useState(DEFAULT_TEST_STREAM);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [stats, setStats] = useState<PlaybackStats | null>(null);
  const [stressEnabled, setStressEnabled] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const fps = useFpsMeter(true);

  useEffect(() => {
    void probeDrm().then(setDrm);
  }, []);

  useEffect(() => {
    const onResize = () =>
      setViewport({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        screenWidth: window.screen?.width ?? 0,
        screenHeight: window.screen?.height ?? 0,
      });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const pushKeyLog = useCallback((label: string, detail: string) => {
    const pressedAt = performance.now();
    keyIdRef.current += 1;
    const id = keyIdRef.current;
    setKeyLog(previous => [{ id, label, detail, latencyMs: null }, ...previous].slice(0, MAX_KEY_LOG));

    // La latence mesurée est « appui → image peinte » : c'est elle que
    // l'utilisateur ressent, pas le temps de traitement de l'événement.
    requestAnimationFrame(() => {
      const latencyMs = Math.round(performance.now() - pressedAt);
      setKeyLog(previous =>
        previous.map(entry => (entry.id === id ? { ...entry, latencyMs } : entry)),
      );
    });
  }, []);

  const onKeyEvent = useCallback(
    (event: KeyboardEvent) => {
      pushKeyLog(
        event.key === ' ' ? 'Space' : event.key,
        `code=${event.code || '—'} keyCode=${event.keyCode}`,
      );
    },
    [pushKeyLog],
  );

  useSpatialNavProbe(onKeyEvent);

  // Touches média relayées par le shell natif (tv-shim.ts). Chromium ne les
  // convertit pas en keydown, donc elles n'apparaissent que par ce canal.
  useEffect(() => {
    const onRemote = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string }>).detail;
      pushKeyLog(`⏯ ${detail?.action ?? '?'}`, 'via bridge natif movix-tv-remote');
    };
    window.addEventListener('movix-tv-remote', onRemote);
    return () => window.removeEventListener('movix-tv-remote', onRemote);
  }, [pushKeyLog]);

  const teardownPlayback = useCallback(() => {
    hlsRef.current?.destroy();
    hlsRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    setIsPlaying(false);
    setStats(null);
  }, []);

  useEffect(() => teardownPlayback, [teardownPlayback]);

  const startPlayback = useCallback(async () => {
    setPlaybackError(null);
    teardownPlayback();

    const video = videoRef.current;
    if (!video) return;

    try {
      // Le HLS natif est préféré quand il existe (Tizen/webOS/Safari) : moins de
      // JS dans la boucle, décodage entièrement délégué à la plateforme.
      if (hlsSupport.nativeHls) {
        video.src = streamUrl;
        await video.play();
        setIsPlaying(true);
        return;
      }

      const HlsModule = (await import('hls.js')).default;
      if (!HlsModule.isSupported()) {
        setPlaybackError('hls.js non supporté et pas de HLS natif : cette WebView ne peut pas lire de HLS.');
        return;
      }

      const hls = new HlsModule({ enableWorker: true, lowLatencyMode: false });
      hlsRef.current = hls;
      hls.on(HlsModule.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        setPlaybackError(`hls.js ${data.type} / ${data.details}`);
        setIsPlaying(false);
      });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      await video.play();
      setIsPlaying(true);
    } catch (error) {
      setPlaybackError(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      setIsPlaying(false);
    }
  }, [hlsSupport.nativeHls, streamUrl, teardownPlayback]);

  // Les frames droppées sont le seul indicateur fiable d'un décodage qui
  // n'arrive pas à suivre : le fps rAF mesure l'UI, pas la vidéo.
  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      const quality = video.getVideoPlaybackQuality?.();
      const buffered =
        video.buffered.length > 0
          ? `${(video.buffered.end(video.buffered.length - 1) - video.currentTime).toFixed(1)} s`
          : '—';
      const hls = hlsRef.current;
      const currentLevel = hls?.levels?.[hls.currentLevel];
      setStats({
        droppedFrames: quality?.droppedVideoFrames ?? 0,
        totalFrames: quality?.totalVideoFrames ?? 0,
        resolution: `${video.videoWidth}×${video.videoHeight}`,
        buffered,
        level: currentLevel
          ? `${currentLevel.height}p @ ${Math.round((currentLevel.bitrate ?? 0) / 1000)} kbps`
          : 'natif',
      });
    }, 500);
    return () => window.clearInterval(interval);
  }, [isPlaying]);

  const dropRate =
    stats && stats.totalFrames > 0
      ? (stats.droppedFrames / stats.totalFrames) * 100
      : 0;

  return (
    <div className="movix-tv-diag min-h-screen bg-[#0a0a0a] text-white">
      {/* Cadre de sûreté à 5 % : s'il est coupé, la TV applique de l'overscan et
          toute l'interface devra respecter cette marge. Étiqueté, parce que sans
          légende il se lit comme un curseur de focus. */}
      <div className="pointer-events-none fixed inset-[5%] z-50 rounded-lg border-2 border-dashed border-amber-400/40">
        <span className="absolute -top-3 left-4 bg-[#0a0a0a] px-2 text-sm font-semibold uppercase tracking-wider text-amber-400/70">
          zone de sûreté 5 % — pas un curseur
        </span>
      </div>

      {stressEnabled && (
        <>
          <div className="movix-tv-diag-stress pointer-events-none fixed inset-0 z-10" />
          <div className="pointer-events-none fixed inset-0 z-20 backdrop-blur-2xl" />
        </>
      )}
      <style>{`
        @keyframes movixTvDiagStress {
          0% { transform: translate3d(-10%, -10%, 0) rotate(0deg); }
          100% { transform: translate3d(10%, 10%, 0) rotate(360deg); }
        }
        .movix-tv-diag-stress {
          background: conic-gradient(from 0deg, #8b5cf6, #ec4899, #22d3ee, #8b5cf6);
          filter: blur(40px);
          opacity: 0.5;
          animation: movixTvDiagStress 6s linear infinite;
        }
      `}</style>

      <div className="relative z-30 mx-auto max-w-[1600px] px-[6%] py-12">
        <header className="mb-10">
          <h1 className="text-4xl font-black tracking-tight">Diagnostic TV — Movix</h1>
          <p className="mt-2 text-xl text-white/50">
            Phase 0 : validation matérielle avant construction de l'interface TV.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel title="1 · Détection">
            <Row label="Mode TV actif">
              <Verdict ok={detection.isTv} />
            </Row>
            <Row label="Source de la détection">{detection.source}</Row>
            <Row label="Bridge natif présent">
              <Verdict ok={detection.hasNativeBridge} />
            </Row>
            <Row label="Classe .movix-tv sur &lt;html&gt;">
              <Verdict ok={document.documentElement.classList.contains('movix-tv')} />
            </Row>
            <div className="mt-4 break-all rounded-lg bg-black/40 p-4 text-base text-white/70">
              {detection.userAgent || '—'}
            </div>
            <div className="mt-4 flex gap-4">
              <TvButton
                onClick={() => {
                  setTvOverride(!detection.isTv);
                  window.location.reload();
                }}
              >
                Forcer {detection.isTv ? 'OFF' : 'ON'}
              </TvButton>
              <TvButton
                onClick={() => {
                  setTvOverride(null);
                  window.location.reload();
                }}
              >
                Effacer l'override
              </TvButton>
            </div>
          </Panel>

          <Panel title="2 · Écran & viewport">
            <Row label="Viewport CSS">
              {viewport.innerWidth} × {viewport.innerHeight} px
            </Row>
            <Row label="devicePixelRatio">{viewport.devicePixelRatio}</Row>
            <Row label="screen">
              {viewport.screenWidth} × {viewport.screenHeight} px
            </Row>
            <Row label="Pixels physiques estimés">
              {Math.round(viewport.innerWidth * viewport.devicePixelRatio)} ×{' '}
              {Math.round(viewport.innerHeight * viewport.devicePixelRatio)}
            </Row>
            <p className="mt-4 text-base leading-relaxed text-white/50">
              C'est le viewport CSS qui détermine l'échelle de l'interface. Un
              1920×1080 physique exposé en 960×540 CSS impose de diviser par deux
              toutes les tailles prévues.
            </p>
          </Panel>

          <Panel title="3 · Codecs & DRM">
            {codecs.map(codec => (
              <Row key={codec.mimeType} label={codec.label}>
                <Verdict ok={codec.supported} />
              </Row>
            ))}
            <div className="my-4 h-px bg-white/10" />
            <Row label="HLS natif">
              <Verdict ok={hlsSupport.nativeHls} />
            </Row>
            <Row label="MediaSource (hls.js)">
              <Verdict ok={hlsSupport.mediaSource} />
            </Row>
            <Row label="MPEG-TS dans MSE">
              <Verdict ok={hlsSupport.mpegTsInMse}>
                {hlsSupport.mpegTsInMse ? 'oui' : 'non (transmux requis)'}
              </Verdict>
            </Row>
            <div className="my-4 h-px bg-white/10" />
            {/* EME exige un contexte sécurisé. http://localhost en est un : si
                cette ligne dit oui, un échec Widevine vient bien de la WebView
                et non de l'origine. */}
            <Row label="Contexte sécurisé (requis par EME)">
              <Verdict ok={window.isSecureContext} />
            </Row>
            <Row label="API requestMediaKeySystemAccess">
              <Verdict ok={typeof navigator.requestMediaKeySystemAccess === 'function'} />
            </Row>
            {drm === null ? (
              <p className="text-lg text-white/50">Sonde Widevine en cours…</p>
            ) : (
              drm.map(level => (
                <Row key={level.label} label={level.label}>
                  <Verdict ok={level.supported} />
                  {level.error && (
                    <span className="ml-2 block text-sm font-normal text-amber-400">
                      {level.error}
                    </span>
                  )}
                </Row>
              ))
            )}
          </Panel>

          <Panel title="4 · Télécommande">
            <p className="mb-4 text-base leading-relaxed text-white/50">
              Appuie sur les flèches, OK, Retour, puis sur lecture/pause et avance
              rapide. Les flèches doivent déplacer le focus ci-dessous ; les touches
              média doivent apparaître avec la mention « bridge natif ».
            </p>
            <div className="mb-6 grid grid-cols-4 gap-3">
              {Array.from({ length: 12 }, (_, index) => (
                <TvButton key={index} onClick={() => pushKeyLog('OK', `case ${index + 1}`)}>
                  {index + 1}
                </TvButton>
              ))}
            </div>
            <div className="max-h-[320px] overflow-y-auto rounded-lg bg-black/40 p-4">
              {keyLog.length === 0 ? (
                <p className="text-lg text-white/40">Aucune touche captée pour l'instant.</p>
              ) : (
                keyLog.map(entry => (
                  <div
                    key={entry.id}
                    className="flex items-baseline justify-between gap-4 border-b border-white/5 py-2 text-base last:border-b-0"
                  >
                    <span className="font-bold text-movix-red-bright">{entry.label}</span>
                    <span className="flex-1 text-white/50">{entry.detail}</span>
                    <span className="tabular-nums text-white/70">
                      {entry.latencyMs === null ? '…' : `${entry.latencyMs} ms`}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel title="5 · Lecture HLS & performance" className="lg:col-span-2">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr]">
              <div>
                <video
                  ref={videoRef}
                  playsInline
                  controls={false}
                  className="aspect-video w-full rounded-xl bg-black"
                />
                <input
                  type="url"
                  value={streamUrl}
                  onChange={event => setStreamUrl(event.target.value)}
                  data-tv-focusable=""
                  spellCheck={false}
                  className="mt-4 w-full rounded-lg border-2 border-white/15 bg-black/40 px-4 py-3 text-base outline-none focus:border-movix-red-bright"
                />
                <div className="mt-4 flex flex-wrap gap-4">
                  <TvButton onClick={() => void startPlayback()}>Lire</TvButton>
                  <TvButton onClick={teardownPlayback}>Arrêter</TvButton>
                  <TvButton onClick={() => setStressEnabled(value => !value)}>
                    Stress CSS : {stressEnabled ? 'ON' : 'OFF'}
                  </TvButton>
                </div>
                {playbackError && (
                  <p className="mt-4 rounded-lg bg-red-500/15 p-4 text-lg text-red-300">
                    {playbackError}
                  </p>
                )}
              </div>

              <div>
                <Row label="FPS interface">
                  <span className={fps.current >= 50 ? 'text-emerald-400' : fps.current >= 30 ? 'text-amber-400' : 'text-red-400'}>
                    {fps.current}
                  </span>
                </Row>
                <Row label="Pire seconde">{fps.worst}</Row>
                <Row label="Résolution vidéo">{stats?.resolution ?? '—'}</Row>
                <Row label="Palier HLS">{stats?.level ?? '—'}</Row>
                <Row label="Buffer d'avance">{stats?.buffered ?? '—'}</Row>
                <Row label="Frames droppées">
                  {stats ? (
                    <span className={dropRate > 2 ? 'text-red-400' : 'text-emerald-400'}>
                      {stats.droppedFrames} / {stats.totalFrames} ({dropRate.toFixed(1)} %)
                    </span>
                  ) : (
                    '—'
                  )}
                </Row>
                <p className="mt-4 text-base leading-relaxed text-white/50">
                  Active le stress CSS pendant la lecture : c'est le test décisif
                  pour savoir si l'interface TV peut se permettre des animations et
                  des flous. Une chute sous 30 fps, ou plus de 2 % de frames
                  droppées, condamne les effets.
                </p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
};

export default TvDiagnosticsPage;
