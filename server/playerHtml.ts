import type { SubtitleTrackItem } from './hlsEngine.js';

export function renderStatusHtml(title: string, message: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      background: #080808;
      color: #ffffff;
      font-family: 'Nunito Sans', system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      text-align: center;
    }
    .box {
      max-width: 440px;
      background: #121212;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 28px 24px;
    }
    .dot {
      width: 40px;
      height: 4px;
      border-radius: 999px;
      background: #E50914;
      margin: 0 auto 16px;
    }
    h1 { font-size: 18px; font-weight: 800; margin-bottom: 8px; }
    p { font-size: 14px; line-height: 1.55; color: #A1A1A1; }
  </style>
</head>
<body>
  <div class="box">
    <div class="dot"></div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

export function renderDirectVideoHtml(
  streamUrl: string,
  captionTracks: SubtitleTrackItem[] = [],
  posterUrl?: string | null
): string {
  const safeStream = JSON.stringify(streamUrl);
  const safeTracks = JSON.stringify(captionTracks);
  const safePoster = posterUrl ? JSON.stringify(posterUrl) : 'null';

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <meta name="referrer" content="no-referrer" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      background: #000000;
      color: #ffffff;
      font-family: 'Nunito Sans', system-ui, -apple-system, sans-serif;
      overflow: hidden;
      user-select: none;
    }
    .stage {
      position: relative;
      width: 100%;
      height: 100%;
      background: #000000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    video {
      width: 100%;
      height: 100%;
      background: #000000;
      outline: none;
    }
    .spinner-wrap {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: rgba(8, 8, 8, 0.55);
      pointer-events: none;
      z-index: 10;
      transition: opacity 0.2s ease;
    }
    .spinner-wrap.hidden {
      opacity: 0;
    }
    .ring {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 3px solid rgba(255, 255, 255, 0.16);
      border-top-color: #E50914;
      animation: spin 0.75s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .tap-play {
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.45);
      z-index: 15;
      cursor: pointer;
    }
    .tap-play.visible {
      display: flex;
    }
    .tap-btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 14px 26px;
      border-radius: 999px;
      border: none;
      background: #E50914;
      color: #ffffff;
      font-size: 15px;
      font-weight: 800;
      box-shadow: 0 10px 30px rgba(229, 9, 20, 0.45);
      cursor: pointer;
    }
    .audio-bar {
      position: absolute;
      top: 12px;
      right: 12px;
      z-index: 12;
      display: none;
      align-items: center;
      gap: 6px;
      background: rgba(18, 18, 18, 0.88);
      border: 1px solid rgba(255, 255, 255, 0.14);
      padding: 4px;
      border-radius: 10px;
      backdrop-filter: blur(8px);
    }
    .audio-bar.visible {
      display: flex;
    }
    .audio-btn {
      border: none;
      background: transparent;
      color: #A1A1A1;
      font-size: 12px;
      font-weight: 700;
      padding: 5px 10px;
      border-radius: 7px;
      cursor: pointer;
    }
    .audio-btn.active {
      background: #E50914;
      color: #ffffff;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
</head>
<body>
  <div class="stage">
    <video id="v" controls autoplay playsinline preload="auto"></video>
    <div id="audioBar" class="audio-bar"></div>
    <div id="spinner" class="spinner-wrap">
      <div class="ring"></div>
    </div>
    <div id="tapPlay" class="tap-play">
      <button type="button" class="tap-btn">&#9654; Reproduzir</button>
    </div>
  </div>
  <script>
    (function() {
      const src = ${safeStream};
      const tracks = ${safeTracks};
      const poster = ${safePoster};
      const video = document.getElementById('v');
      const spinner = document.getElementById('spinner');
      const tapPlay = document.getElementById('tapPlay');
      const audioBar = document.getElementById('audioBar');

      if (poster) {
        video.poster = poster;
      }

      if (Array.isArray(tracks)) {
        tracks.forEach((t) => {
          if (!t || !t.src) return;
          const tr = document.createElement('track');
          tr.kind = 'subtitles';
          tr.label = t.label || 'Português';
          tr.srclang = t.lang || 'pt';
          tr.src = t.src;
          if (t.isDefault) tr.default = true;
          video.appendChild(tr);
        });
      }

      const MIN_START_BUFFER_SEC = 12;
      const MIN_REBUFFER_SEC = 10;

      let initialCushionDone = false;
      let gatePaused = false;
      let gateStartedAt = 0;
      let userPaused = false;
      let playPending = false;
      let streamEnded = false;
      let waitingTimer = null;

      const showSpinner = () => {
        spinner.classList.remove('hidden');
      };

      const hideSpinner = () => {
        if (waitingTimer) {
          clearTimeout(waitingTimer);
          waitingTimer = null;
        }
        if (!gatePaused) {
          spinner.classList.add('hidden');
        }
      };

      const getBufferedAhead = () => {
        const ct = video.currentTime || 0;
        const buf = video.buffered;
        let bestAhead = 0;
        for (let i = 0; i < buf.length; i++) {
          const start = buf.start(i);
          const end = buf.end(i);
          if (ct >= start - 0.85 && ct <= end + 0.15) {
            bestAhead = Math.max(bestAhead, Math.max(0, end - Math.max(ct, start)));
          }
        }
        return bestAhead;
      };

      const enterBufferGate = () => {
        if (gatePaused || userPaused || video.ended || streamEnded) return;
        gatePaused = true;
        gateStartedAt = Date.now();
        showSpinner();
        if (!playPending && !video.paused) {
          try {
            video.pause();
          } catch {}
        }
      };

      const safePlay = () => {
        if (playPending || userPaused || gatePaused) return;
        playPending = true;
        const p = video.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            playPending = false;
            tapPlay.classList.remove('visible');
            const ahead = getBufferedAhead();
            if (!initialCushionDone && ahead < MIN_START_BUFFER_SEC && !streamEnded) {
              enterBufferGate();
            } else {
              initialCushionDone = true;
              hideSpinner();
            }
          }).catch((err) => {
            playPending = false;
            if (err && err.name === 'NotAllowedError') {
              gatePaused = false;
              spinner.classList.add('hidden');
              tapPlay.classList.add('visible');
            }
          });
        } else {
          playPending = false;
        }
      };

      const evaluateBufferGate = () => {
        if (!gatePaused) return;
        if (userPaused) {
          gatePaused = false;
          spinner.classList.add('hidden');
          return;
        }
        const ahead = getBufferedAhead();
        const waitedMs = Date.now() - gateStartedAt;
        const targetSec = initialCushionDone ? MIN_REBUFFER_SEC : MIN_START_BUFFER_SEC;
        const ready =
          ahead >= targetSec ||
          streamEnded ||
          video.ended ||
          (ahead >= 6 && waitedMs > 9500) ||
          (ahead >= 3 && waitedMs > 16000);

        if (ready) {
          initialCushionDone = true;
          gatePaused = false;
          hideSpinner();
          safePlay();
        }
      };

      setInterval(evaluateBufferGate, 250);

      video.addEventListener('pause', () => {
        if (!gatePaused && !video.ended && !playPending) {
          userPaused = true;
          spinner.classList.add('hidden');
        }
      });

      video.addEventListener('play', () => {
        if (!gatePaused) {
          userPaused = false;
        }
      });

      video.addEventListener('playing', () => {
        tapPlay.classList.remove('visible');
        if (!gatePaused) {
          hideSpinner();
        }
      });

      video.addEventListener('progress', evaluateBufferGate);
      video.addEventListener('canplaythrough', evaluateBufferGate);
      video.addEventListener('ended', () => {
        streamEnded = true;
        gatePaused = false;
        hideSpinner();
      });

      video.addEventListener('waiting', () => {
        if (userPaused || video.ended || streamEnded) return;
        const ahead = getBufferedAhead();
        if (ahead < 1.5 && !playPending) {
          enterBufferGate();
          return;
        }
        if (!waitingTimer) {
          waitingTimer = setTimeout(() => {
            waitingTimer = null;
            if (!video.paused && video.readyState < 3) {
              showSpinner();
            }
          }, 400);
        }
      });

      tapPlay.addEventListener('click', () => {
        tapPlay.classList.remove('visible');
        userPaused = false;
        gatePaused = false;
        video.muted = false;
        safePlay();
      });

      const isHlsSource = src.includes('.m3u8') || src.includes('/api/supercdn/hls-proxy');

      if (isHlsSource && window.Hls && window.Hls.isSupported()) {
        const LOOKAHEAD_WINDOW_SEC = 110;
        const FAST_BURST_URLS = 12;
        const CRUISE_BATCH_URLS = 14;
        const WARM_TTL_MS = 210 * 1000;

        const warmedMap = new Map();
        let inFlightWarmCtrl = null;
        let warmPendingImmediate = false;
        let initialWarmTimer = null;
        let videoFrags = [];
        let audioFrags = [];

        const toProxyRelUrl = (rawUrl) => {
          try {
            const u = new URL(rawUrl, window.location.origin);
            if (!u.pathname.startsWith('/api/supercdn/hls-proxy')) return null;
            return u.pathname + u.search;
          } catch {
            return null;
          }
        };

        const pruneWarmedMap = () => {
          const cutoff = Date.now() - WARM_TTL_MS;
          for (const [k, ts] of warmedMap.entries()) {
            if (ts < cutoff) warmedMap.delete(k);
          }
        };

        const collectNextColdUrls = (anchorSec, urgentBurst) => {
          pruneWarmedMap();
          const maxTotal = urgentBurst ? FAST_BURST_URLS : CRUISE_BATCH_URLS;
          const maxAudio = urgentBurst ? 2 : 3;
          const windowEnd = anchorSec + (urgentBurst ? 24 : LOOKAHEAD_WINDOW_SEC);
          const batch = [];
          const seen = new Set();

          for (let i = 0; i < audioFrags.length; i++) {
            if (batch.length >= maxAudio) break;
            const f = audioFrags[i];
            const fStart = f.start || 0;
            const fEnd = fStart + (f.duration || 10);
            if (fEnd < anchorSec - 1) continue;
            if (fStart > anchorSec + 50) break;
            const rel = toProxyRelUrl(f.url);
            if (rel && !warmedMap.has(rel) && !seen.has(rel)) {
              seen.add(rel);
              batch.push(rel);
            }
          }

          for (let i = 0; i < videoFrags.length; i++) {
            if (batch.length >= maxTotal) break;
            const f = videoFrags[i];
            const fStart = f.start || 0;
            const fEnd = fStart + (f.duration || 2);
            if (fEnd < anchorSec - 0.5) continue;
            if (fStart > windowEnd) break;
            const rel = toProxyRelUrl(f.url);
            if (rel && !warmedMap.has(rel) && !seen.has(rel)) {
              seen.add(rel);
              batch.push(rel);
            }
          }

          return batch;
        };

        const pumpServerWarm = (forceResetInFlight) => {
          if (forceResetInFlight && inFlightWarmCtrl) {
            inFlightWarmCtrl.abort();
            inFlightWarmCtrl = null;
          }
          if (inFlightWarmCtrl) {
            warmPendingImmediate = true;
            return;
          }

          const anchor = video.currentTime || 0;
          const isUrgent = !initialCushionDone || gatePaused || getBufferedAhead() < 14;
          let batchUrls = collectNextColdUrls(anchor, isUrgent);
          if (batchUrls.length === 0 && isUrgent) {
            batchUrls = collectNextColdUrls(anchor, false);
          }
          if (batchUrls.length === 0) return;

          const ctrl = new AbortController();
          inFlightWarmCtrl = ctrl;
          const sentAt = Date.now();
          batchUrls.forEach((u) => warmedMap.set(u, sentAt));

          fetch('/api/supercdn/hls-warm-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: batchUrls }),
            signal: ctrl.signal,
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (!data || !Array.isArray(data.warmed)) {
                batchUrls.forEach((u) => warmedMap.delete(u));
                return;
              }
              const okSet = new Set(data.warmed);
              const doneAt = Date.now();
              batchUrls.forEach((u, idx) => {
                if (okSet.has(idx)) {
                  warmedMap.set(u, doneAt);
                } else {
                  warmedMap.delete(u);
                }
              });
            })
            .catch(() => {
              batchUrls.forEach((u) => warmedMap.delete(u));
            })
            .finally(() => {
              if (inFlightWarmCtrl === ctrl) {
                inFlightWarmCtrl = null;
              }
              const remaining = collectNextColdUrls(video.currentTime || 0, false);
              if (warmPendingImmediate || remaining.length >= 6) {
                warmPendingImmediate = false;
                setTimeout(() => pumpServerWarm(false), 60);
              }
            });
        };

        let initialPlaylistsReady = false;

        const scheduleInitialWarm = () => {
          if (initialWarmTimer) clearTimeout(initialWarmTimer);
          const hasAudioTracks = (hls.audioTracks || []).length > 0;
          const bothReady = videoFrags.length > 0 && (!hasAudioTracks || audioFrags.length > 0);
          if (bothReady) {
            initialPlaylistsReady = true;
            pumpServerWarm(false);
            return;
          }
          initialWarmTimer = setTimeout(() => {
            initialWarmTimer = null;
            initialPlaylistsReady = true;
            pumpServerWarm(false);
          }, 80);
        };

        video.addEventListener('seeking', () => {
          streamEnded = false;
          if (!userPaused && getBufferedAhead() < 2) {
            enterBufferGate();
          }
          pumpServerWarm(true);
        });

        let lastWarmTick = 0;
        video.addEventListener('timeupdate', () => {
          if (!gatePaused) hideSpinner();
          const now = Date.now();
          if (now - lastWarmTick > 3500) {
            lastWarmTick = now;
            pumpServerWarm(false);
          }
        });

        const hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 90,
          maxMaxBufferLength: 180,
          backBufferLength: 30,
          maxBufferSize: 120 * 1000 * 1000,
          maxBufferHole: 0.5,
          highBufferWatchdogPeriod: 2,
          nudgeOffset: 0.2,
          nudgeMaxRetry: 10,
          startFragPrefetch: true,
          fragLoadPolicy: {
            default: {
              maxTimeToFirstByteMs: 35000,
              maxLoadTimeMs: 45000,
              timeoutRetry: {
                maxNumRetry: 6,
                retryDelayMs: 500,
                maxRetryDelayMs: 4000,
              },
              errorRetry: {
                maxNumRetry: 6,
                retryDelayMs: 500,
                maxRetryDelayMs: 4000,
              },
            },
          },
          playlistLoadPolicy: {
            default: {
              maxTimeToFirstByteMs: 20000,
              maxLoadTimeMs: 25000,
              timeoutRetry: {
                maxNumRetry: 4,
                retryDelayMs: 400,
                maxRetryDelayMs: 3000,
              },
              errorRetry: {
                maxNumRetry: 4,
                retryDelayMs: 400,
                maxRetryDelayMs: 3000,
              },
            },
          },
          manifestLoadPolicy: {
            default: {
              maxTimeToFirstByteMs: 20000,
              maxLoadTimeMs: 25000,
              timeoutRetry: {
                maxNumRetry: 4,
                retryDelayMs: 400,
                maxRetryDelayMs: 3000,
              },
              errorRetry: {
                maxNumRetry: 4,
                retryDelayMs: 400,
                maxRetryDelayMs: 3000,
              },
            },
          },
        });

        let initialAudioSelected = false;

        const renderAudioButtons = () => {
          const list = hls.audioTracks || [];
          if (list.length <= 1) {
            audioBar.classList.remove('visible');
            return;
          }
          audioBar.innerHTML = '';
          list.forEach((track, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            const rawName = (track.name || track.lang || ('Áudio ' + (idx + 1))).toLowerCase();
            let label = track.name || ('Áudio ' + (idx + 1));
            if (rawName.includes('por') || rawName.includes('pt')) label = 'Dublado (PT)';
            else if (rawName.includes('eng') || rawName.includes('en')) label = 'Original (EN)';
            else if (rawName.includes('jpn') || rawName.includes('ja')) label = 'Original (JP)';
            else if (rawName.includes('kor') || rawName.includes('ko')) label = 'Original (KR)';
            btn.textContent = label;
            btn.className = 'audio-btn' + (hls.audioTrack === idx ? ' active' : '');
            btn.addEventListener('click', () => {
              audioFrags = [];
              hls.audioTrack = idx;
              renderAudioButtons();
            });
            audioBar.appendChild(btn);
          });
          audioBar.classList.add('visible');
        };

        const preferPortugueseTrack = () => {
          const list = hls.audioTracks || [];
          if (!initialAudioSelected && list.length > 1) {
            const ptIdx = list.findIndex((t) => {
              const s = ((t.lang || '') + ' ' + (t.name || '')).toLowerCase();
              return s.includes('por') || s.includes('portug') || s === 'pt';
            });
            if (ptIdx >= 0 && hls.audioTrack !== ptIdx) {
              hls.audioTrack = ptIdx;
            }
            initialAudioSelected = true;
          }
          renderAudioButtons();
        };

        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          preferPortugueseTrack();
          safePlay();
        });

        hls.on(window.Hls.Events.LEVEL_LOADED, (_ev, data) => {
          if (data && data.details && Array.isArray(data.details.fragments)) {
            videoFrags = data.details.fragments;
            scheduleInitialWarm();
          }
        });

        hls.on(window.Hls.Events.AUDIO_TRACK_LOADED, (_ev, data) => {
          if (data && data.details && Array.isArray(data.details.fragments)) {
            audioFrags = data.details.fragments;
            if (!initialPlaylistsReady) {
              scheduleInitialWarm();
            } else {
              pumpServerWarm(true);
            }
          }
        });

        hls.on(window.Hls.Events.FRAG_BUFFERED, evaluateBufferGate);
        hls.on(window.Hls.Events.BUFFER_EOS, () => {
          streamEnded = true;
          evaluateBufferGate();
        });

        hls.on(window.Hls.Events.AUDIO_TRACKS_UPDATED, preferPortugueseTrack);
        hls.on(window.Hls.Events.AUDIO_TRACK_SWITCHED, renderAudioButtons);

        hls.on(window.Hls.Events.ERROR, (_ev, data) => {
          if (!data || !data.fatal) return;
          if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          }
        });
      } else {
        video.src = src;
        video.addEventListener('loadedmetadata', safePlay, { once: true });
        safePlay();
      }
    })();
  </script>
</body>
</html>`;
}
