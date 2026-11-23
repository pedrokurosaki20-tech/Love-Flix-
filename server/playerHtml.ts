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
    .actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 20px;
    }
    .btn {
      width: 100%;
      padding: 12px 18px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 700;
      border: none;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: inherit;
    }
    .btn-red {
      background: #E50914;
      color: #ffffff;
    }
    .btn-red:hover {
      background: #FF253A;
    }
    .btn-dark {
      background: #1b1b1b;
      color: #A1A1A1;
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
    .btn-dark:hover {
      color: #ffffff;
      background: #252525;
    }
  </style>
</head>
<body>
  <div class="box">
    <div class="dot"></div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="actions">
      <button type="button" class="btn btn-red" onclick="tryFallbackChannel()">Tentar outro canal</button>
      <button type="button" class="btn btn-dark" onclick="closePlayer()">Voltar ao catálogo</button>
    </div>
  </div>
  <script>
    function tryFallbackChannel() {
      try {
        window.parent.postMessage({ type: 'LOVEFLIX_CHANNEL_FALLBACK' }, '*');
      } catch (e) {}
    }
    function closePlayer() {
      try {
        window.parent.postMessage({ type: 'LOVEFLIX_CLOSE_PLAYER' }, '*');
      } catch (e) {}
    }
  </script>
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
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
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
      overflow: hidden;
      touch-action: none;
    }
    video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: center;
      background: #000000;
      outline: none;
      transform-origin: center center;
      transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
      pointer-events: none;
    }
    video.mode-fill {
      object-fit: cover;
    }
    video::-webkit-media-controls,
    video::-webkit-media-controls-enclosure {
      display: none !important;
    }
    video::cue {
      background: rgba(0, 0, 0, 0.68);
      color: #ffffff;
      font-family: 'Nunito Sans', system-ui, -apple-system, sans-serif;
      font-weight: 700;
      text-shadow: 0 2px 6px rgba(0, 0, 0, 0.95);
    }

    .spinner-wrap {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: rgba(8, 8, 8, 0.45);
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
      background: rgba(0, 0, 0, 0.52);
      z-index: 30;
      cursor: pointer;
    }
    .tap-play.visible {
      display: flex;
    }
    .tap-btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 14px 28px;
      border-radius: 999px;
      border: none;
      background: #E50914;
      color: #ffffff;
      font-size: 15px;
      font-weight: 800;
      box-shadow: 0 10px 30px rgba(229, 9, 20, 0.45);
      cursor: pointer;
    }

    /* Double-tap & HUD feedback badges */
    .seek-flash {
      position: absolute;
      top: 50%;
      transform: translateY(-50%) scale(0.92);
      padding: 10px 16px;
      border-radius: 999px;
      background: rgba(15, 15, 15, 0.78);
      border: 1px solid rgba(255, 255, 255, 0.16);
      color: #ffffff;
      font-size: 13px;
      font-weight: 800;
      pointer-events: none;
      opacity: 0;
      z-index: 25;
      backdrop-filter: blur(8px);
      transition: opacity 0.18s ease, transform 0.18s ease;
    }
    .seek-flash.left { left: 10%; }
    .seek-flash.right { right: 10%; }
    .seek-flash.center { left: 50%; transform: translate(-50%, -50%) scale(0.92); }
    .seek-flash.show { opacity: 1; transform: translateY(-50%) scale(1); }
    .seek-flash.center.show { opacity: 1; transform: translate(-50%, -50%) scale(1); }

    /* Custom Netflix/YouTube-style overlay controls */
    .controls-overlay {
      position: absolute;
      inset: 0;
      z-index: 20;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.22s ease;
    }
    .controls-overlay.visible {
      opacity: 1;
      pointer-events: auto;
    }

    .center-controls {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      align-items: center;
      gap: 24px;
      pointer-events: auto;
    }
    .center-btn {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: rgba(12, 12, 12, 0.65);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      backdrop-filter: blur(8px);
      transition: transform 0.14s ease, background 0.14s ease;
      font-size: 12px;
      font-weight: 800;
    }
    .center-btn:active { transform: scale(0.92); }
    .center-btn.primary {
      width: 60px;
      height: 60px;
      background: rgba(229, 9, 20, 0.9);
      border-color: rgba(255, 255, 255, 0.24);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.65);
    }
    .center-btn.primary:hover {
      background: #FF253A;
    }

    .bottom-bar {
      position: relative;
      width: 100%;
      padding: 36px 14px max(12px, env(safe-area-inset-bottom));
      background: linear-gradient(to top, rgba(0, 0, 0, 0.92) 0%, rgba(0, 0, 0, 0.55) 60%, transparent 100%);
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: auto;
    }

    .scrubber-wrap {
      position: relative;
      width: 100%;
      height: 26px;
      display: flex;
      align-items: center;
      cursor: pointer;
      touch-action: none;
    }
    .scrubber-track {
      position: relative;
      width: 100%;
      height: 4px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.24);
      overflow: visible;
      transition: height 0.12s ease;
    }
    .scrubber-wrap:hover .scrubber-track,
    .scrubber-wrap.dragging .scrubber-track {
      height: 6px;
    }
    .scrubber-buffered {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 0%;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.34);
    }
    .scrubber-progress {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 0%;
      border-radius: 999px;
      background: #E50914;
    }
    .scrubber-thumb {
      position: absolute;
      top: 50%;
      left: 0%;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #ffffff;
      border: 2px solid #E50914;
      transform: translate(-50%, -50%) scale(0.85);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.7);
      transition: transform 0.12s ease;
    }
    .scrubber-wrap:hover .scrubber-thumb,
    .scrubber-wrap.dragging .scrubber-thumb {
      transform: translate(-50%, -50%) scale(1.15);
    }

    .action-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .action-group {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .ctrl-btn {
      height: 34px;
      min-width: 34px;
      padding: 0 8px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(18, 18, 18, 0.72);
      color: #ffffff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      cursor: pointer;
      font-family: inherit;
      font-size: 11px;
      font-weight: 700;
      backdrop-filter: blur(6px);
      transition: background 0.14s ease, border-color 0.14s ease;
      white-space: nowrap;
    }
    .ctrl-btn:hover {
      background: rgba(255, 255, 255, 0.16);
    }
    .ctrl-btn.active {
      background: rgba(229, 9, 20, 0.85);
      border-color: rgba(255, 37, 58, 0.8);
    }
    .time-readout {
      font-size: 11px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.9);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      padding: 0 4px;
    }
    .vol-range {
      width: 64px;
      accent-color: #E50914;
      cursor: pointer;
      display: none;
    }
    @media (min-width: 640px) {
      .vol-range { display: inline-block; }
      .bottom-bar { padding: 40px 20px max(14px, env(safe-area-inset-bottom)); }
      .time-readout { font-size: 12px; }
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
</head>
<body>
  <div id="stage" class="stage">
    <video id="v" autoplay playsinline webkit-playsinline preload="auto"></video>

    <div id="spinner" class="spinner-wrap">
      <div class="ring"></div>
    </div>

    <div id="seekFlashLeft" class="seek-flash left">-10s</div>
    <div id="seekFlashRight" class="seek-flash right">+10s</div>
    <div id="hudFlashCenter" class="seek-flash center">Tela completa</div>

    <div id="controlsOverlay" class="controls-overlay">
      <div class="center-controls">
        <button id="centerRewBtn" type="button" class="center-btn" aria-label="Voltar 10 segundos" title="Voltar 10s">-10s</button>
        <button id="centerPlayBtn" type="button" class="center-btn primary" aria-label="Reproduzir ou pausar"></button>
        <button id="centerFwdBtn" type="button" class="center-btn" aria-label="Avançar 10 segundos" title="Avançar 10s">+10s</button>
      </div>

      <div id="bottomBar" class="bottom-bar">
        <div id="scrubberWrap" class="scrubber-wrap" role="slider" aria-label="Linha do tempo">
          <div class="scrubber-track">
            <div id="scrubberBuffered" class="scrubber-buffered"></div>
            <div id="scrubberProgress" class="scrubber-progress"></div>
            <div id="scrubberThumb" class="scrubber-thumb"></div>
          </div>
        </div>

        <div class="action-row">
          <div class="action-group">
            <button id="playPauseBtn" type="button" class="ctrl-btn" aria-label="Reproduzir ou pausar"></button>
            <button id="muteBtn" type="button" class="ctrl-btn" aria-label="Silenciar ou ativar áudio"></button>
            <input id="volRange" type="range" class="vol-range" min="0" max="1" step="0.05" value="1" aria-label="Volume" />
            <span id="timeReadout" class="time-readout">0:00 / 0:00</span>
          </div>

          <div class="action-group">
            <button id="subToggleBtn" type="button" class="ctrl-btn" style="display:none" title="Legendas">CC</button>
            <button id="fillToggleBtn" type="button" class="ctrl-btn" title="Alternar Preencher Tela / Original">
              <span id="fillLabel">Tela cheia</span>
            </button>
            <button id="fsToggleBtn" type="button" class="ctrl-btn" aria-label="Tela cheia" title="Tela cheia"></button>
          </div>
        </div>
      </div>
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
      const stage = document.getElementById('stage');
      const video = document.getElementById('v');
      const spinner = document.getElementById('spinner');
      const tapPlay = document.getElementById('tapPlay');
      const controlsOverlay = document.getElementById('controlsOverlay');
      const bottomBar = document.getElementById('bottomBar');
      const centerPlayBtn = document.getElementById('centerPlayBtn');
      const centerRewBtn = document.getElementById('centerRewBtn');
      const centerFwdBtn = document.getElementById('centerFwdBtn');
      const playPauseBtn = document.getElementById('playPauseBtn');
      const muteBtn = document.getElementById('muteBtn');
      const volRange = document.getElementById('volRange');
      const timeReadout = document.getElementById('timeReadout');
      const scrubberWrap = document.getElementById('scrubberWrap');
      const scrubberBuffered = document.getElementById('scrubberBuffered');
      const scrubberProgress = document.getElementById('scrubberProgress');
      const scrubberThumb = document.getElementById('scrubberThumb');
      const subToggleBtn = document.getElementById('subToggleBtn');
      const fillToggleBtn = document.getElementById('fillToggleBtn');
      const fillLabel = document.getElementById('fillLabel');
      const fsToggleBtn = document.getElementById('fsToggleBtn');
      const seekFlashLeft = document.getElementById('seekFlashLeft');
      const seekFlashRight = document.getElementById('seekFlashRight');
      const hudFlashCenter = document.getElementById('hudFlashCenter');

      if (poster) {
        video.poster = poster;
      }

      const ICON_PLAY = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>';
      const ICON_PLAY_LG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>';
      const ICON_PAUSE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      const ICON_PAUSE_LG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      const ICON_VOL_ON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
      const ICON_VOL_OFF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
      const ICON_FS_ENTER = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
      const ICON_FS_EXIT = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';

      let isParentFullscreen = false;
      let userFillOverride = null; // null = auto ('fill' in landscape/fullscreen, 'contain' in portrait/box)
      let fitCanvas = null;
      let fitCtx = null;
      let detectedBarFraction = 0;

      const isFillActive = () => {
        if (userFillOverride !== null) return userFillOverride === 'fill';
        const vw = window.innerWidth || 0;
        const vh = window.innerHeight || 0;
        const ratio = vh > 0 ? vw / vh : 0;
        const inFs = isParentFullscreen || Boolean(document.fullscreenElement);
        return inFs || (ratio >= 1.45 && vw >= 480);
      };

      const applySmartVideoScale = () => {
        try {
          const vw = window.innerWidth || 0;
          const vh = window.innerHeight || 0;
          const natW = video.videoWidth || 0;
          const natH = video.videoHeight || 0;
          const fillOn = isFillActive();

          video.classList.toggle('mode-fill', fillOn);
          fillToggleBtn.classList.toggle('active', fillOn);
          fillLabel.textContent = fillOn ? 'Preenchido' : 'Original';

          if (!fillOn || !vw || !vh || !natW || !natH) {
            video.style.transform = '';
            return;
          }

          // After object-fit: cover fills width/height proportionally without distortion,
          // check if baked-in letterbox bars still sit inside the visible viewport height.
          const coverScale = Math.max(vw / natW, vh / natH);
          const displayedH = natH * coverScale;
          const activeH = displayedH * Math.max(0.68, 1 - detectedBarFraction);
          if (detectedBarFraction > 0.04 && activeH < vh - 2) {
            const extraScale = Math.min(1.26, vh / activeH);
            video.style.transform = extraScale > 1.02 ? 'scale(' + extraScale.toFixed(3) + ')' : '';
          } else {
            video.style.transform = '';
          }
        } catch {}
      };

      const sampleLetterboxBars = () => {
        try {
          if (!video.videoWidth || !video.videoHeight || video.paused || video.readyState < 2) return;
          if (!fitCanvas) {
            fitCanvas = document.createElement('canvas');
            fitCanvas.width = 48;
            fitCanvas.height = 48;
            fitCtx = fitCanvas.getContext('2d', { willReadFrequently: true });
          }
          if (!fitCtx) return;
          fitCtx.drawImage(video, 0, 0, 48, 48);
          const data = fitCtx.getImageData(0, 0, 48, 48).data;
          const rowLuma = (y) => {
            let maxL = 0;
            for (let x = 8; x < 40; x += 2) {
              const i = (y * 48 + x) * 4;
              const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
              if (l > maxL) maxL = l;
            }
            return maxL;
          };
          let centerMax = 0;
          for (let y = 18; y < 30; y++) {
            const l = rowLuma(y);
            if (l > centerMax) centerMax = l;
          }
          if (centerMax < 22) return;

          let topBars = 0;
          for (let y = 0; y < 14; y++) {
            if (rowLuma(y) < 16) topBars++;
            else break;
          }
          let bottomBars = 0;
          for (let y = 47; y >= 34; y--) {
            if (rowLuma(y) < 16) bottomBars++;
            else break;
          }
          const frac = (Math.min(topBars, bottomBars) * 2) / 48;
          detectedBarFraction = frac >= 0.06 && frac <= 0.30 ? frac : 0;
          applySmartVideoScale();
        } catch {
          applySmartVideoScale();
        }
      };

      window.addEventListener('resize', applySmartVideoScale);
      document.addEventListener('fullscreenchange', applySmartVideoScale);
      video.addEventListener('loadedmetadata', applySmartVideoScale);
      video.addEventListener('loadeddata', () => {
        applySmartVideoScale();
        setTimeout(sampleLetterboxBars, 450);
      });
      video.addEventListener('playing', () => {
        applySmartVideoScale();
        setTimeout(sampleLetterboxBars, 900);
        setTimeout(sampleLetterboxBars, 3500);
      });
      applySmartVideoScale();

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
      let applyingRemoteSync = false;
      let remoteSyncTimer = null;
      let resumingFromGate = false;
      let isInitialAutoplay = true;
      let pendingRemoteState = null;
      let holdingForIntro = false;
      let activeHls = null;
      let audioPref = 'pt';
      let subPref = 'auto';
      let qualityPref = 'auto';

      const isPortugueseAudioTrack = (track) => {
        const s = (
          ((track && track.lang) || '') +
          ' ' +
          ((track && track.name) || '')
        ).toLowerCase();
        return (
          /\b(por|pt|pt-br)\b/.test(s) ||
          s.includes('portug') ||
          s.includes('dublado') ||
          s.includes('brasil')
        );
      };

      const syncSubtitleTrackMode = () => {
        const textTracks = video.textTracks;
        if (!textTracks || textTracks.length === 0) return;
        if (subPref === 'off') {
          for (let i = 0; i < textTracks.length; i++) {
            textTracks[i].mode = 'disabled';
          }
          return;
        }
        let activeAudioIsPt = audioPref === 'pt';
        if (activeHls && Array.isArray(activeHls.audioTracks) && activeHls.audioTracks.length > 0) {
          const curTrack = activeHls.audioTracks[activeHls.audioTrack];
          if (curTrack) {
            activeAudioIsPt = isPortugueseAudioTrack(curTrack);
          }
        }
        const shouldShow = subPref === 'always' || (subPref === 'auto' && !activeAudioIsPt);
        let ptTrackIndex = -1;
        for (let i = 0; i < textTracks.length; i++) {
          const meta = (
            (textTracks[i].language || '') +
            ' ' +
            (textTracks[i].label || '')
          ).toLowerCase();
          if (meta.includes('pt') || meta.includes('por') || meta.includes('portug')) {
            ptTrackIndex = i;
            break;
          }
        }
        const targetSubIdx = ptTrackIndex >= 0 ? ptTrackIndex : 0;
        for (let i = 0; i < textTracks.length; i++) {
          textTracks[i].mode = shouldShow && i === targetSubIdx ? 'showing' : 'disabled';
        }
      };

      const postToParent = (payload) => {
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage(payload, '*');
          }
        } catch {}
      };

      const markRemoteSync = (ms) => {
        applyingRemoteSync = true;
        if (remoteSyncTimer) clearTimeout(remoteSyncTimer);
        remoteSyncTimer = setTimeout(() => {
          applyingRemoteSync = false;
          remoteSyncTimer = null;
        }, ms || 450);
      };

      let initialStartPosition = -1;
      try {
        const initParams = new URLSearchParams(window.location.search);
        audioPref = initParams.get('audioPref') === 'original' ? 'original' : 'pt';
        const rawSubPref = initParams.get('subPref');
        subPref = rawSubPref === 'always' || rawSubPref === 'off' ? rawSubPref : 'auto';
        qualityPref = initParams.get('qualityPref') || 'auto';
        if (initParams.get('waitIntro') === '1') {
          holdingForIntro = true;
          video.autoplay = false;
          video.removeAttribute('autoplay');
        }
        const startAtRaw = Number(initParams.get('startAt'));
        const pausedParam = initParams.get('paused');
        if (Number.isFinite(startAtRaw) && startAtRaw > 0) {
          initialStartPosition = startAtRaw;
        }
        if ((Number.isFinite(startAtRaw) && startAtRaw > 0) || pausedParam === '1' || pausedParam === 'true') {
          pendingRemoteState = {
            type: 'LOVEFLIX_PLAYER_COMMAND',
            command: 'sync',
            positionSec: Number.isFinite(startAtRaw) && startAtRaw > 0 ? startAtRaw : 0,
            paused: pausedParam === '1' || pausedParam === 'true',
          };
        }
      } catch {}

      postToParent({ type: 'LOVEFLIX_PLAYER_IFRAME_BOOT' });

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
        if (holdingForIntro || gatePaused || userPaused || video.ended || streamEnded) return;
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
        if (holdingForIntro || playPending || userPaused || gatePaused) return;
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
          resumingFromGate = true;
          safePlay();
        }
      };

      setInterval(evaluateBufferGate, 250);

      const applyRemoteCommandNow = (cmd) => {
        if (!cmd || typeof cmd !== 'object') return;
        markRemoteSync(1200);
        isInitialAutoplay = false;

        if (typeof cmd.playbackRate === 'number' && cmd.playbackRate >= 0.25 && cmd.playbackRate <= 4) {
          if (Math.abs((video.playbackRate || 1) - cmd.playbackRate) > 0.04) {
            try { video.playbackRate = cmd.playbackRate; } catch {}
          }
        }

        if (typeof cmd.positionSec === 'number' && Number.isFinite(cmd.positionSec) && cmd.positionSec >= 0) {
          const drift = Math.abs((video.currentTime || 0) - cmd.positionSec);
          const threshold = cmd.command === 'seek' ? 0.35 : 1.35;
          if (drift > threshold) {
            try { video.currentTime = Math.max(0, cmd.positionSec); } catch {}
          }
        }

        if (cmd.command === 'pause' || cmd.paused === true) {
          userPaused = true;
          gatePaused = false;
          tapPlay.classList.remove('visible');
          spinner.classList.add('hidden');
          try { video.pause(); } catch {}
        } else if (cmd.command === 'play' || cmd.paused === false) {
          userPaused = false;
          safePlay();
        }
      };

      window.addEventListener('message', (ev) => {
        const d = ev && ev.data;
        if (!d || typeof d !== 'object') return;
        if (d.type === 'LOVEFLIX_FULLSCREEN_STATE') {
          isParentFullscreen = Boolean(d.fullscreen);
          applySmartVideoScale();
          updateControlIcons();
          return;
        }
        if (d.type === 'LOVEFLIX_END_INTRO') {
          if (holdingForIntro) {
            holdingForIntro = false;
            if (getBufferedAhead() >= MIN_START_BUFFER_SEC || streamEnded) {
              initialCushionDone = true;
            }
            if (!userPaused) {
              safePlay();
            }
          }
          return;
        }
        if (d.type === 'LOVEFLIX_PLAYER_GET_STATE') {
          postToParent({
            type: 'LOVEFLIX_PLAYER_STATE',
            positionSec: video.currentTime || 0,
            duration: Number.isFinite(video.duration) ? video.duration : 0,
            paused: Boolean(video.paused && !gatePaused),
            playbackRate: video.playbackRate || 1,
          });
          return;
        }
        if (d.type !== 'LOVEFLIX_PLAYER_COMMAND') return;
        if (video.readyState < 1) {
          pendingRemoteState = d;
          return;
        }
        applyRemoteCommandNow(d);
      });

      const formatClock = (sec) => {
        if (!Number.isFinite(sec) || sec < 0) return '0:00';
        const total = Math.floor(sec);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        const ss = String(s).padStart(2, '0');
        if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + ss;
        return m + ':' + ss;
      };

      let hideControlsTimer = null;
      let isSeekingScrubber = false;
      let controlsVisible = false;

      const setControlsVisible = (show, autoHide) => {
        controlsVisible = show;
        controlsOverlay.classList.toggle('visible', show);
        if (hideControlsTimer) {
          clearTimeout(hideControlsTimer);
          hideControlsTimer = null;
        }
        if (show && autoHide !== false && !video.paused && !isSeekingScrubber) {
          hideControlsTimer = setTimeout(() => {
            if (!video.paused && !isSeekingScrubber) {
              controlsVisible = false;
              controlsOverlay.classList.remove('visible');
            }
          }, 2800);
        }
      };

      const bumpControls = () => setControlsVisible(true, true);

      const updateControlIcons = () => {
        const paused = Boolean(video.paused && !gatePaused);
        centerPlayBtn.innerHTML = paused ? ICON_PLAY_LG : ICON_PAUSE_LG;
        playPauseBtn.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
        const muted = video.muted || video.volume === 0;
        muteBtn.innerHTML = muted ? ICON_VOL_OFF : ICON_VOL_ON;
        volRange.value = String(muted ? 0 : video.volume);
        const inFs = isParentFullscreen || Boolean(document.fullscreenElement);
        fsToggleBtn.innerHTML = inFs ? ICON_FS_EXIT : ICON_FS_ENTER;
        const hasSubs = video.textTracks && video.textTracks.length > 0;
        subToggleBtn.style.display = hasSubs ? 'inline-flex' : 'none';
        if (hasSubs) {
          let showingAny = false;
          for (let i = 0; i < video.textTracks.length; i++) {
            if (video.textTracks[i].mode === 'showing') showingAny = true;
          }
          subToggleBtn.classList.toggle('active', showingAny);
        }
      };

      const updateTimelineUI = () => {
        const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
        const ct = video.currentTime || 0;
        timeReadout.textContent = formatClock(ct) + ' / ' + formatClock(dur);
        if (!isSeekingScrubber && dur > 0) {
          const pct = Math.max(0, Math.min(100, (ct / dur) * 100));
          scrubberProgress.style.width = pct + '%';
          scrubberThumb.style.left = pct + '%';
        }
        if (dur > 0) {
          const ahead = getBufferedAhead();
          const bufPct = Math.max(0, Math.min(100, ((ct + ahead) / dur) * 100));
          scrubberBuffered.style.width = bufPct + '%';
        }
      };

      const flashHud = (el, text) => {
        if (!el) return;
        if (text) el.textContent = text;
        el.classList.add('show');
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('show'), 650);
      };

      const togglePlayPause = () => {
        if (video.paused || gatePaused) {
          userPaused = false;
          safePlay();
          bumpControls();
        } else {
          userPaused = true;
          gatePaused = false;
          try { video.pause(); } catch {}
          setControlsVisible(true, false);
        }
        updateControlIcons();
      };

      const seekRelative = (deltaSec) => {
        const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity;
        const next = Math.max(0, Math.min(dur, (video.currentTime || 0) + deltaSec));
        try { video.currentTime = next; } catch {}
        updateTimelineUI();
        flashHud(deltaSec < 0 ? seekFlashLeft : seekFlashRight, (deltaSec > 0 ? '+' : '') + deltaSec + 's');
        bumpControls();
      };

      const toggleFillMode = () => {
        const nextFill = !isFillActive();
        userFillOverride = nextFill ? 'fill' : 'contain';
        applySmartVideoScale();
        flashHud(hudFlashCenter, nextFill ? 'Tela completa' : 'Formato original');
        bumpControls();
      };

      const triggerFullscreen = () => {
        bumpControls();
        if (window.parent && window.parent !== window) {
          postToParent({ type: 'LOVEFLIX_TOGGLE_FULLSCREEN' });
          return;
        }
        try {
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else if (stage.requestFullscreen) {
            stage.requestFullscreen().catch(() => {});
          }
        } catch {}
      };

      const stopBtnEvent = (fn) => (ev) => {
        ev.stopPropagation();
        fn(ev);
      };

      centerPlayBtn.addEventListener('click', stopBtnEvent(togglePlayPause));
      playPauseBtn.addEventListener('click', stopBtnEvent(togglePlayPause));
      centerRewBtn.addEventListener('click', stopBtnEvent(() => seekRelative(-10)));
      centerFwdBtn.addEventListener('click', stopBtnEvent(() => seekRelative(10)));
      fillToggleBtn.addEventListener('click', stopBtnEvent(toggleFillMode));
      fsToggleBtn.addEventListener('click', stopBtnEvent(triggerFullscreen));
      muteBtn.addEventListener('click', stopBtnEvent(() => {
        if (video.muted || video.volume === 0) {
          video.muted = false;
          if (video.volume === 0) video.volume = 1;
        } else {
          video.muted = true;
        }
        updateControlIcons();
        bumpControls();
      }));
      volRange.addEventListener('input', (ev) => {
        ev.stopPropagation();
        const v = Number(volRange.value);
        video.volume = v;
        video.muted = v === 0;
        updateControlIcons();
        bumpControls();
      });
      subToggleBtn.addEventListener('click', stopBtnEvent(() => {
        const textTracks = video.textTracks;
        if (!textTracks || textTracks.length === 0) return;
        let showingAny = false;
        for (let i = 0; i < textTracks.length; i++) {
          if (textTracks[i].mode === 'showing') showingAny = true;
        }
        if (showingAny) {
          subPref = 'off';
          for (let i = 0; i < textTracks.length; i++) textTracks[i].mode = 'disabled';
        } else {
          subPref = 'always';
          syncSubtitleTrackMode();
        }
        updateControlIcons();
        bumpControls();
      }));

      // Scrubber touch + mouse drag support
      const seekFromClientX = (clientX, commit) => {
        const rect = scrubberWrap.getBoundingClientRect();
        const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
        if (!rect.width || !dur) return;
        const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        scrubberProgress.style.width = (frac * 100) + '%';
        scrubberThumb.style.left = (frac * 100) + '%';
        timeReadout.textContent = formatClock(frac * dur) + ' / ' + formatClock(dur);
        if (commit) {
          try { video.currentTime = frac * dur; } catch {}
        }
      };

      scrubberWrap.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        isSeekingScrubber = true;
        scrubberWrap.classList.add('dragging');
        if (scrubberWrap.setPointerCapture) {
          try { scrubberWrap.setPointerCapture(ev.pointerId); } catch {}
        }
        seekFromClientX(ev.clientX, false);
        setControlsVisible(true, false);
      });
      scrubberWrap.addEventListener('pointermove', (ev) => {
        if (!isSeekingScrubber) return;
        ev.stopPropagation();
        seekFromClientX(ev.clientX, false);
      });
      const finishScrub = (ev) => {
        if (!isSeekingScrubber) return;
        ev.stopPropagation();
        isSeekingScrubber = false;
        scrubberWrap.classList.remove('dragging');
        seekFromClientX(ev.clientX, true);
        bumpControls();
      };
      scrubberWrap.addEventListener('pointerup', finishScrub);
      scrubberWrap.addEventListener('pointercancel', finishScrub);
      bottomBar.addEventListener('click', (ev) => ev.stopPropagation());

      // Touch gestures: 2-finger pinch-to-fill, single-tap overlay toggle, double-tap -10s / +10s
      let pinchStartDist = 0;
      let pinchHandled = false;
      let lastTapAt = 0;
      let lastTapX = 0;
      let singleTapTimer = null;

      stage.addEventListener('touchstart', (ev) => {
        if (ev.touches.length === 2) {
          const dx = ev.touches[0].clientX - ev.touches[1].clientX;
          const dy = ev.touches[0].clientY - ev.touches[1].clientY;
          pinchStartDist = Math.hypot(dx, dy);
          pinchHandled = false;
        }
      }, { passive: true });

      stage.addEventListener('touchmove', (ev) => {
        if (ev.touches.length === 2 && pinchStartDist > 10 && !pinchHandled) {
          const dx = ev.touches[0].clientX - ev.touches[1].clientX;
          const dy = ev.touches[0].clientY - ev.touches[1].clientY;
          const dist = Math.hypot(dx, dy);
          const ratio = dist / pinchStartDist;
          if (ratio > 1.15) {
            pinchHandled = true;
            userFillOverride = 'fill';
            applySmartVideoScale();
            flashHud(hudFlashCenter, 'Tela completa');
          } else if (ratio < 0.85) {
            pinchHandled = true;
            userFillOverride = 'contain';
            applySmartVideoScale();
            flashHud(hudFlashCenter, 'Formato original');
          }
        }
      }, { passive: true });

      stage.addEventListener('click', (ev) => {
        if (tapPlay.classList.contains('visible')) return;
        const isTouchLike = ev.pointerType === 'touch' || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
        const now = Date.now();
        const rect = stage.getBoundingClientRect();
        const relX = rect.width ? (ev.clientX - rect.left) / rect.width : 0.5;

        if (isTouchLike) {
          if (now - lastTapAt < 280 && Math.abs(ev.clientX - lastTapX) < 90) {
            clearTimeout(singleTapTimer);
            lastTapAt = 0;
            if (relX < 0.38) {
              seekRelative(-10);
            } else if (relX > 0.62) {
              seekRelative(10);
            } else {
              togglePlayPause();
            }
            return;
          }
          lastTapAt = now;
          lastTapX = ev.clientX;
          clearTimeout(singleTapTimer);
          singleTapTimer = setTimeout(() => {
            setControlsVisible(!controlsVisible, true);
          }, 220);
        } else {
          togglePlayPause();
        }
      });

      stage.addEventListener('mousemove', () => {
        if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
          bumpControls();
        }
      });

      document.addEventListener('keydown', (ev) => {
        if (ev.key === ' ' || ev.key === 'k' || ev.key === 'K') {
          ev.preventDefault();
          togglePlayPause();
        } else if (ev.key === 'ArrowLeft') {
          ev.preventDefault();
          seekRelative(-10);
        } else if (ev.key === 'ArrowRight') {
          ev.preventDefault();
          seekRelative(10);
        } else if (ev.key === 'f' || ev.key === 'F') {
          ev.preventDefault();
          triggerFullscreen();
        } else if (ev.key === 'm' || ev.key === 'M') {
          ev.preventDefault();
          video.muted = !video.muted;
          updateControlIcons();
          bumpControls();
        }
      });

      updateControlIcons();

      video.addEventListener('loadedmetadata', () => {
        syncSubtitleTrackMode();
        updateControlIcons();
        updateTimelineUI();
        postToParent({
          type: 'LOVEFLIX_PLAYER_READY',
          duration: Number.isFinite(video.duration) ? video.duration : 0,
        });
        if (pendingRemoteState) {
          const queued = pendingRemoteState;
          pendingRemoteState = null;
          applyRemoteCommandNow(queued);
        }
      });

      video.addEventListener('pause', () => {
        updateControlIcons();
        if (!gatePaused && !video.ended && !playPending) {
          userPaused = true;
          isInitialAutoplay = false;
          spinner.classList.add('hidden');
          setControlsVisible(true, false);
          if (!applyingRemoteSync) {
            postToParent({
              type: 'LOVEFLIX_PLAYER_EVENT',
              action: 'pause',
              paused: true,
              positionSec: video.currentTime || 0,
              playbackRate: video.playbackRate || 1,
            });
          }
        }
      });

      video.addEventListener('play', () => {
        updateControlIcons();
        if (!gatePaused) {
          userPaused = false;
          const wasGateResume = resumingFromGate;
          resumingFromGate = false;
          if (controlsVisible) bumpControls();
          if (isInitialAutoplay) {
            isInitialAutoplay = false;
            return;
          }
          if (!applyingRemoteSync && !wasGateResume) {
            postToParent({
              type: 'LOVEFLIX_PLAYER_EVENT',
              action: 'play',
              paused: false,
              positionSec: video.currentTime || 0,
              playbackRate: video.playbackRate || 1,
            });
          }
        }
      });

      video.addEventListener('seeked', () => {
        isInitialAutoplay = false;
        updateTimelineUI();
        if (!applyingRemoteSync) {
          postToParent({
            type: 'LOVEFLIX_PLAYER_EVENT',
            action: 'seek',
            paused: Boolean(video.paused && !gatePaused),
            positionSec: video.currentTime || 0,
            playbackRate: video.playbackRate || 1,
          });
        }
      });

      video.addEventListener('ratechange', () => {
        if (!applyingRemoteSync) {
          postToParent({
            type: 'LOVEFLIX_PLAYER_EVENT',
            action: 'ratechange',
            paused: Boolean(video.paused && !gatePaused),
            positionSec: video.currentTime || 0,
            playbackRate: video.playbackRate || 1,
          });
        }
      });

      let lastReportedTimeAt = 0;
      video.addEventListener('timeupdate', () => {
        updateTimelineUI();
        const now = Date.now();
        if (now - lastReportedTimeAt > 2000) {
          lastReportedTimeAt = now;
          postToParent({
            type: 'LOVEFLIX_PLAYER_TIME',
            positionSec: video.currentTime || 0,
            paused: Boolean(video.paused && !gatePaused),
            playbackRate: video.playbackRate || 1,
          });
        }
      });

      video.addEventListener('playing', () => {
        tapPlay.classList.remove('visible');
        updateControlIcons();
        if (!gatePaused) {
          hideSpinner();
        }
      });

      video.addEventListener('progress', () => {
        evaluateBufferGate();
        updateTimelineUI();
      });
      video.addEventListener('canplaythrough', evaluateBufferGate);
      video.addEventListener('ended', () => {
        streamEnded = true;
        gatePaused = false;
        hideSpinner();
        updateControlIcons();
        setControlsVisible(true, false);
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

      tapPlay.addEventListener('click', (ev) => {
        ev.stopPropagation();
        tapPlay.classList.remove('visible');
        userPaused = false;
        gatePaused = false;
        video.muted = false;
        safePlay();
        updateControlIcons();
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
          startPosition: initialStartPosition > 0 ? initialStartPosition : -1,
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

        activeHls = hls;
        let initialAudioSelected = false;

        const applyPreferredAudioTrack = () => {
          const list = hls.audioTracks || [];
          if (!initialAudioSelected && list.length > 0) {
            if (list.length > 1) {
              const targetIdx =
                audioPref === 'original'
                  ? list.findIndex((t) => !isPortugueseAudioTrack(t))
                  : list.findIndex((t) => isPortugueseAudioTrack(t));
              if (targetIdx >= 0 && hls.audioTrack !== targetIdx) {
                hls.audioTrack = targetIdx;
              }
            }
            initialAudioSelected = true;
          }
          syncSubtitleTrackMode();
        };

        const applyPreferredQualityCap = () => {
          const levels = hls.levels || [];
          if (!levels.length) return;
          if (qualityPref === '720p' || qualityPref === 'saver') {
            const maxH = qualityPref === 'saver' ? 480 : 720;
            let bestCapIdx = -1;
            let bestHeight = -1;
            levels.forEach((lvl, idx) => {
              const h = Number(lvl && lvl.height) || 0;
              if (h > 0 && h <= maxH && h > bestHeight) {
                bestHeight = h;
                bestCapIdx = idx;
              }
            });
            if (bestCapIdx >= 0) {
              hls.autoLevelCapping = bestCapIdx;
            } else if (qualityPref === 'saver') {
              hls.autoLevelCapping = 0;
            }
          }
        };

        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          applyPreferredQualityCap();
          applyPreferredAudioTrack();
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

        hls.on(window.Hls.Events.AUDIO_TRACKS_UPDATED, applyPreferredAudioTrack);
        hls.on(window.Hls.Events.AUDIO_TRACK_SWITCHED, () => {
          syncSubtitleTrackMode();
        });

        let fatalRecoverAttempts = 0;
        hls.on(window.Hls.Events.ERROR, (_ev, data) => {
          if (!data || !data.fatal) return;
          fatalRecoverAttempts += 1;
          if (fatalRecoverAttempts <= 2) {
            if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
              hls.startLoad();
              return;
            }
            if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
              return;
            }
          }
          try {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({ type: 'LOVEFLIX_CHANNEL_FALLBACK' }, '*');
            }
          } catch {}
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
