import express from 'express';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
// Server-side credential lookup: never exposed to client bundles
const FALLBACK_SERVER_KEY = '4b50180f870c7d5977cee36f9da052ec';
const SUPERCDN_BASE_URL = 'https://plenoflu.com';
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
// Deterministic HMAC secret across serverless instances (Vercel & Cloud Run)
function getHlsProxySecret() {
    const seed = process.env.HLS_PROXY_SECRET || process.env.TMDB_API_KEY || FALLBACK_SERVER_KEY;
    return crypto.createHash('sha256').update(`loveflix-hls-v1:${seed}`).digest('hex');
}
const tmdbServerCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_ENTRIES = 600;
function pruneCache() {
    const now = Date.now();
    for (const [key, entry] of tmdbServerCache.entries()) {
        if (entry.expiresAt <= now) {
            tmdbServerCache.delete(key);
        }
    }
    if (tmdbServerCache.size > MAX_CACHE_ENTRIES) {
        const excess = tmdbServerCache.size - MAX_CACHE_ENTRIES;
        let removed = 0;
        for (const key of tmdbServerCache.keys()) {
            tmdbServerCache.delete(key);
            removed += 1;
            if (removed >= excess)
                break;
        }
    }
}
const superCdnStreamCache = new Map();
const SUPERCDN_CACHE_TTL_MS = 90 * 1000; // 90 seconds
function signHlsProxyTarget(url, origin, kind) {
    return crypto
        .createHmac('sha256', getHlsProxySecret())
        .update(`${kind}|${origin}|${url}`)
        .digest('hex')
        .slice(0, 32);
}
function verifyHlsProxySignature(url, origin, kind, sig) {
    if (!sig || sig.length !== 32)
        return false;
    const expected = signHlsProxyTarget(url, origin, kind);
    try {
        return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    }
    catch {
        return false;
    }
}
function buildHlsProxyPath(targetUrl, origin, kind) {
    const sig = signHlsProxyTarget(targetUrl, origin, kind);
    const params = new URLSearchParams({
        kind,
        u: targetUrl,
        o: origin,
        s: sig,
    });
    return `/api/supercdn/hls-proxy?${params.toString()}`;
}
function rewriteHlsManifest(manifestText, manifestUrl, origin) {
    const rawLines = manifestText.split(/\r?\n/);
    const hasPortugueseAudio = rawLines.some((line) => line.startsWith('#EXT-X-MEDIA:') &&
        /TYPE=AUDIO/i.test(line) &&
        (/LANGUAGE="(por|pt|pt-BR)"/i.test(line) || /NAME="[^"]*(Portug|Dublado|Brasil)/i.test(line)));
    let nextBareUrlIsVariant = false;
    const rewritten = rawLines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed)
            return line;
        if (trimmed.startsWith('#')) {
            if (trimmed.startsWith('#EXT-X-STREAM-INF:')) {
                nextBareUrlIsVariant = true;
            }
            else if (trimmed.startsWith('#EXTINF:')) {
                nextBareUrlIsVariant = false;
            }
            let updatedTag = line;
            if (hasPortugueseAudio && trimmed.startsWith('#EXT-X-MEDIA:') && /TYPE=AUDIO/i.test(trimmed)) {
                const isPt = /LANGUAGE="(por|pt|pt-BR)"/i.test(trimmed) ||
                    /NAME="[^"]*(Portug|Dublado|Brasil)/i.test(trimmed);
                if (isPt) {
                    updatedTag = updatedTag.replace(/DEFAULT=NO/gi, 'DEFAULT=YES');
                    if (!/DEFAULT=/i.test(updatedTag)) {
                        updatedTag += ',DEFAULT=YES';
                    }
                }
                else {
                    updatedTag = updatedTag.replace(/DEFAULT=YES/gi, 'DEFAULT=NO');
                }
            }
            if (/URI="[^"]+"/i.test(updatedTag)) {
                const childKind = trimmed.startsWith('#EXT-X-MEDIA:') || trimmed.startsWith('#EXT-X-I-FRAME-STREAM-INF:')
                    ? 'manifest'
                    : 'segment';
                updatedTag = updatedTag.replace(/URI="([^"]+)"/gi, (_full, rawUri) => {
                    try {
                        const absUrl = new URL(rawUri.trim(), manifestUrl).toString();
                        return `URI="${buildHlsProxyPath(absUrl, origin, childKind)}"`;
                    }
                    catch {
                        return _full;
                    }
                });
            }
            return updatedTag;
        }
        const lineKind = nextBareUrlIsVariant ? 'manifest' : 'segment';
        nextBareUrlIsVariant = false;
        try {
            const absUrl = new URL(trimmed, manifestUrl).toString();
            return buildHlsProxyPath(absUrl, origin, lineKind);
        }
        catch {
            return line;
        }
    });
    return rewritten.join('\n');
}
function encodePackerBase(num, radix) {
    const prefix = num < radix ? '' : encodePackerBase(Math.floor(num / radix), radix);
    const rem = num % radix;
    const char = rem > 35 ? String.fromCharCode(rem + 29) : rem.toString(36);
    return prefix + char;
}
function unpackDeanEdwards(html) {
    const match = html.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('((?:\\.|[^'\\])*)',\s*(\d+),\s*(\d+),\s*'((?:\\.|[^'\\])*)'\.split\('\|'\)/);
    if (!match)
        return '';
    let payload = match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    const radix = Number(match[2]);
    let count = Number(match[3]);
    const symtab = match[4].split('|');
    if (!radix || !count || symtab.length === 0)
        return '';
    const dict = {};
    while (count--) {
        const token = encodePackerBase(count, radix);
        dict[token] = symtab[count] || token;
    }
    payload = payload.replace(/\b\w+\b/g, (word) => dict[word] ?? word);
    return payload;
}
function extractCookieHeader(headers) {
    const getSetCookie = headers.getSetCookie;
    const rawCookies = typeof getSetCookie === 'function'
        ? getSetCookie.call(headers)
        : headers.get('set-cookie')
            ? [headers.get('set-cookie')]
            : [];
    return rawCookies
        .map((c) => c.split(';')[0]?.trim())
        .filter(Boolean)
        .join('; ');
}
function decodeSuperCdnVideoUrl(raw) {
    const trimmed = raw.trim();
    if (/^https?:\/\//i.test(trimmed))
        return trimmed;
    if (trimmed.startsWith('//'))
        return `https:${trimmed}`;
    try {
        const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
        if (/^https?:\/\//i.test(decoded))
            return decoded;
        if (decoded.startsWith('//'))
            return `https:${decoded}`;
    }
    catch {
        // ignore invalid base64
    }
    return trimmed;
}
function renderStatusHtml(title, message) {
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
function renderDirectVideoHtml(streamUrl, captionTracks = [], posterUrl) {
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
    <video id="v" controls autoplay playsinline></video>
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
        tracks.forEach((t, idx) => {
          if (!t || !t.src) return;
          const tr = document.createElement('track');
          tr.kind = 'subtitles';
          tr.label = t.label || 'Português';
          tr.srclang = t.lang || 'pt';
          tr.src = t.src;
          if (idx === 0) tr.default = true;
          video.appendChild(tr);
        });
      }

      const hideSpinner = () => spinner.classList.add('hidden');
      const showSpinner = () => spinner.classList.remove('hidden');

      video.addEventListener('playing', () => {
        hideSpinner();
        tapPlay.classList.remove('visible');
      });
      video.addEventListener('canplay', hideSpinner);
      video.addEventListener('loadeddata', hideSpinner);
      video.addEventListener('waiting', showSpinner);

      const attemptAutoplay = () => {
        const p = video.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            hideSpinner();
            tapPlay.classList.add('visible');
          });
        }
      };

      tapPlay.addEventListener('click', () => {
        tapPlay.classList.remove('visible');
        video.muted = false;
        video.play().catch(() => {});
      });

      const isHlsSource = src.includes('.m3u8') || src.includes('/api/supercdn/hls-proxy');

      if (isHlsSource && window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls({
          enableWorker: true,
          maxBufferLength: 30,
          backBufferLength: 30,
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
          attemptAutoplay();
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
        video.addEventListener('loadedmetadata', attemptAutoplay, { once: true });
        attemptAutoplay();
      }
    })();
  </script>
</body>
</html>`;
}
async function resolveSuperCdnChannel(params) {
    const { type, imdb, tmdbId, season, episode, channel } = params;
    const cacheKey = `${type}:${imdb}:${season}:${episode}:${channel}`;
    const cached = superCdnStreamCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached;
    }
    const superCdnPageUrl = type === 'movie'
        ? `${SUPERCDN_BASE_URL}/movie/${imdb}`
        : `${SUPERCDN_BASE_URL}/tvshow/${imdb}/${season}/${episode}`;
    const pageController = new AbortController();
    const pageTimeout = setTimeout(() => pageController.abort(), 12000);
    let html = '';
    let cookieHeader = '';
    let pageOk = false;
    try {
        const pageRes = await fetch(superCdnPageUrl, {
            method: 'GET',
            headers: {
                Referer: `${SUPERCDN_BASE_URL}/`,
                'User-Agent': BROWSER_USER_AGENT,
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            },
            signal: pageController.signal,
        });
        pageOk = pageRes.ok;
        cookieHeader = extractCookieHeader(pageRes.headers);
        html = pageRes.ok ? await pageRes.text() : '';
    }
    finally {
        clearTimeout(pageTimeout);
    }
    const videoIds = [];
    if (pageOk && html) {
        const itemRegex = /<div[^>]*class="[^"]*player_select_item[^"]*"[^>]*data-id="(\d+)"[^>]*>|<div[^>]*data-id="(\d+)"[^>]*class="[^"]*player_select_item[^"]*"[^>]*>/gi;
        for (const match of html.matchAll(itemRegex)) {
            const vid = match[1] || match[2];
            if (vid && !videoIds.includes(vid)) {
                videoIds.push(vid);
            }
        }
        if (videoIds.length === 0 && type === 'tvshow') {
            let episodeContentId = '';
            const directEpMatch = html.match(/DIRECT_EPISODE_ID\s*=\s*['"]?(\d+)['"]?/i);
            if (directEpMatch && Number(directEpMatch[1]) > 0) {
                episodeContentId = directEpMatch[1];
            }
            else {
                const epMatches = [
                    ...html.matchAll(/data-epi-num="(\d+)"[^>]*data-contentid="(\d+)"|data-contentid="(\d+)"[^>]*data-epi-num="(\d+)"/gi),
                ];
                const exactEp = epMatches.find((m) => (m[1] && m[1] === episode) || (m[4] && m[4] === episode));
                if (exactEp) {
                    episodeContentId = exactEp[2] || exactEp[3] || '';
                }
                else {
                    const anyContentId = html.match(/data-contentid="(\d+)"/i);
                    if (anyContentId)
                        episodeContentId = anyContentId[1];
                }
            }
            if (episodeContentId) {
                const optRes = await fetch(`${SUPERCDN_BASE_URL}/api`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        Referer: superCdnPageUrl,
                        Origin: SUPERCDN_BASE_URL,
                        'X-Requested-With': 'XMLHttpRequest',
                        'User-Agent': BROWSER_USER_AGENT,
                        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
                    },
                    body: new URLSearchParams({
                        action: 'getOptions',
                        contentid: episodeContentId,
                    }).toString(),
                });
                if (optRes.ok) {
                    const optJson = (await optRes.json());
                    const rawOptions = optJson?.data?.options || [];
                    const dublado = rawOptions.filter((o) => String(o.type) === '1');
                    const legendado = rawOptions.filter((o) => String(o.type) !== '1');
                    for (const opt of [...dublado, ...legendado]) {
                        const idStr = String(opt.ID || '').trim();
                        if (idStr && !videoIds.includes(idStr)) {
                            videoIds.push(idStr);
                        }
                    }
                }
            }
        }
    }
    let resolvedStreamUrl = '';
    let resolvedCaptionUrl = null;
    if (videoIds.length > 0) {
        const selectedIndex = Math.min(channel - 1, videoIds.length - 1);
        const chosenVideoId = videoIds[selectedIndex];
        const playerRes = await fetch(`${SUPERCDN_BASE_URL}/api`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                Referer: superCdnPageUrl,
                Origin: SUPERCDN_BASE_URL,
                'X-Requested-With': 'XMLHttpRequest',
                'User-Agent': BROWSER_USER_AGENT,
                ...(cookieHeader ? { Cookie: cookieHeader } : {}),
            },
            body: new URLSearchParams({
                action: 'getPlayer',
                video_id: chosenVideoId,
            }).toString(),
        });
        if (playerRes.ok) {
            const playerJson = (await playerRes.json());
            if (playerJson?.data?.video_url) {
                resolvedStreamUrl = decodeSuperCdnVideoUrl(playerJson.data.video_url);
                resolvedCaptionUrl = playerJson.data.video_caption_url || null;
            }
        }
    }
    if (!resolvedStreamUrl && channel === 2) {
        if (type === 'movie') {
            resolvedStreamUrl = `https://superflixapi.fun/filme/${imdb}#noEpList`;
        }
        else if (tmdbId) {
            resolvedStreamUrl = `https://superflixapi.fun/serie/${tmdbId}/${season}/${episode}#noEpList`;
        }
    }
    if (!resolvedStreamUrl) {
        return {
            kind: 'html',
            html: renderStatusHtml(`Canal ${channel} indisponível para este título`, 'Selecione outra opção de canal no topo do reprodutor (Canal 1, Canal 2 ou Canal 3) para iniciar a transmissão.'),
            expiresAt: Date.now() + 30 * 1000,
        };
    }
    if (/\.(m3u8|mp4)(\?|$)/i.test(resolvedStreamUrl)) {
        const captionTracks = resolvedCaptionUrl && resolvedCaptionUrl.startsWith('http')
            ? [{ label: 'Português', lang: 'pt', src: resolvedCaptionUrl }]
            : [];
        const entry = {
            kind: 'html',
            html: renderDirectVideoHtml(resolvedStreamUrl, captionTracks),
            expiresAt: Date.now() + SUPERCDN_CACHE_TTL_MS,
        };
        superCdnStreamCache.set(cacheKey, entry);
        return entry;
    }
    let parsedUrl = null;
    try {
        parsedUrl = new URL(resolvedStreamUrl);
    }
    catch {
        parsedUrl = null;
    }
    const parsedHost = parsedUrl ? parsedUrl.hostname.toLowerCase() : '';
    if (parsedUrl && (parsedHost.includes('vaiquecol') || parsedHost.includes('plenoflu'))) {
        const embedOrigin = parsedUrl.origin;
        const embedRes = await fetch(resolvedStreamUrl, {
            method: 'GET',
            headers: {
                Referer: `${SUPERCDN_BASE_URL}/`,
                'User-Agent': BROWSER_USER_AGENT,
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });
        if (embedRes.ok) {
            const embedCookies = extractCookieHeader(embedRes.headers);
            const embedHtml = await embedRes.text();
            const unpacked = unpackDeanEdwards(embedHtml);
            const fpHashMatch = unpacked.match(/FirePlayer\(\s*["']([a-f0-9]{32})["']/i) ||
                embedHtml.match(/FirePlayer\(\s*["']([a-f0-9]{32})["']/i) ||
                embedHtml.match(/\|([a-f0-9]{32})\|/i);
            const fireHash = fpHashMatch?.[1] || '';
            const subtitleTracks = [];
            if (unpacked) {
                const tracksSection = unpacked.match(/"tracks"\s*:\s*(\[[\s\S]*?\])/);
                if (tracksSection?.[1]) {
                    try {
                        const parsedTracks = JSON.parse(tracksSection[1]);
                        for (const tr of parsedTracks) {
                            if (tr?.file) {
                                const absSub = new URL(tr.file, resolvedStreamUrl).toString();
                                subtitleTracks.push({
                                    label: tr.label || 'Português',
                                    lang: 'pt',
                                    src: buildHlsProxyPath(absSub, embedOrigin, 'subtitle'),
                                });
                            }
                        }
                    }
                    catch {
                        // ignore malformed tracks
                    }
                }
            }
            if (fireHash) {
                const videoApiRes = await fetch(`${embedOrigin}/player/index.php?data=${fireHash}&do=getVideo`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        Referer: resolvedStreamUrl,
                        Origin: embedOrigin,
                        'X-Requested-With': 'XMLHttpRequest',
                        'User-Agent': BROWSER_USER_AGENT,
                        ...(embedCookies ? { Cookie: embedCookies } : {}),
                    },
                    body: new URLSearchParams({
                        hash: fireHash,
                        r: `${SUPERCDN_BASE_URL}/`,
                    }).toString(),
                });
                if (videoApiRes.ok) {
                    const videoJson = (await videoApiRes.json());
                    const masterHlsUrl = (videoJson.videoSource || videoJson.securedLink || '').trim();
                    if (masterHlsUrl && /^https?:\/\//i.test(masterHlsUrl)) {
                        const proxiedMasterPath = buildHlsProxyPath(masterHlsUrl, embedOrigin, 'manifest');
                        const playerHtml = renderDirectVideoHtml(proxiedMasterPath, subtitleTracks, null);
                        const entry = {
                            kind: 'html',
                            html: playerHtml,
                            expiresAt: Date.now() + SUPERCDN_CACHE_TTL_MS,
                        };
                        superCdnStreamCache.set(cacheKey, entry);
                        return entry;
                    }
                }
            }
        }
        return {
            kind: 'html',
            html: renderStatusHtml('Canal 1 indisponível para este título', 'Toque em Canal 2 ou Canal 3 no topo da tela para assistir imediatamente.'),
            expiresAt: Date.now() + 30 * 1000,
        };
    }
    const entry = {
        kind: 'redirect',
        url: resolvedStreamUrl,
        expiresAt: Date.now() + SUPERCDN_CACHE_TTL_MS,
    };
    superCdnStreamCache.set(cacheKey, entry);
    return entry;
}
const ALLOWED_PREFIXES = [
    'trending/',
    'movie/',
    'tv/',
    'discover/',
    'search/',
    'genre/',
    'person/',
    'collection/',
    'configuration',
];
export function registerApiRoutes(app) {
    // Normalize Vercel rewrite paths if /api prefix was stripped
    app.use((req, _res, next) => {
        if (req.url.startsWith('/tmdb/') ||
            req.url.startsWith('/supercdn/') ||
            req.url === '/health' ||
            req.url.startsWith('/health?')) {
            req.url = `/api${req.url}`;
        }
        next();
    });
    app.get('/api/health', (_req, res) => {
        const apiKey = process.env.TMDB_API_KEY || FALLBACK_SERVER_KEY;
        res.json({ ok: true, tmdbConfigured: Boolean(apiKey) });
    });
    app.get('/api/tmdb/*', async (req, res) => {
        try {
            const apiKey = process.env.TMDB_API_KEY || FALLBACK_SERVER_KEY;
            if (!apiKey) {
                res.status(500).json({
                    error: 'TMDB_API_KEY não configurada no servidor.',
                });
                return;
            }
            const rawSubpath = req.params[0] || '';
            const cleanPath = rawSubpath.replace(/^\/+/, '').replace(/\.\./g, '');
            const isAllowed = ALLOWED_PREFIXES.some((prefix) => cleanPath === prefix || cleanPath.startsWith(prefix));
            if (!cleanPath || !isAllowed) {
                res.status(400).json({ error: 'Endpoint TMDB inválido ou não permitido.' });
                return;
            }
            const targetUrl = new URL(`${TMDB_BASE_URL}/${cleanPath}`);
            if (!req.query.language) {
                targetUrl.searchParams.set('language', 'pt-BR');
            }
            for (const [key, value] of Object.entries(req.query)) {
                if (key.toLowerCase() === 'api_key')
                    continue;
                if (Array.isArray(value)) {
                    targetUrl.searchParams.set(key, String(value[0]));
                }
                else if (value !== undefined && value !== null && String(value) !== '') {
                    targetUrl.searchParams.set(key, String(value));
                }
            }
            if (!targetUrl.searchParams.has('include_adult')) {
                targetUrl.searchParams.set('include_adult', 'false');
            }
            const cacheKey = `${cleanPath}?${targetUrl.searchParams.toString()}`;
            const cached = tmdbServerCache.get(cacheKey);
            if (cached && cached.expiresAt > Date.now()) {
                res.setHeader('X-LoveFlix-Cache', 'HIT');
                res.status(cached.status).json(cached.data);
                return;
            }
            targetUrl.searchParams.set('api_key', apiKey);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);
            const upstream = await fetch(targetUrl.toString(), {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                },
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            const contentType = upstream.headers.get('content-type') || '';
            const payload = contentType.includes('application/json')
                ? await upstream.json()
                : { error: await upstream.text() };
            if (upstream.ok) {
                pruneCache();
                tmdbServerCache.set(cacheKey, {
                    status: upstream.status,
                    data: payload,
                    expiresAt: Date.now() + CACHE_TTL_MS,
                });
            }
            res.setHeader('X-LoveFlix-Cache', 'MISS');
            res.status(upstream.status).json(payload);
        }
        catch (error) {
            const message = error instanceof Error && error.name === 'AbortError'
                ? 'Tempo limite excedido ao consultar a TMDB.'
                : 'Falha de comunicação com o serviço da TMDB.';
            res.status(502).json({ error: message });
        }
    });
    app.get('/api/supercdn/stream', async (req, res) => {
        try {
            const rawType = String(req.query.type || 'movie').toLowerCase();
            const type = rawType === 'tv' || rawType === 'tvshow' ? 'tvshow' : 'movie';
            const imdb = String(req.query.imdb || '').trim();
            const tmdbId = String(req.query.tmdbId || '').replace(/\D/g, '');
            const season = String(Math.max(1, Number(req.query.season) || 1));
            const episode = String(Math.max(1, Number(req.query.episode) || 1));
            const rawChannel = Number(req.query.channel) || 1;
            const channel = rawChannel === 2 ? 2 : rawChannel === 3 ? 3 : 1;
            if (!/^tt\d{4,12}$/i.test(imdb)) {
                res
                    .status(400)
                    .setHeader('Content-Type', 'text/html; charset=utf-8')
                    .send(renderStatusHtml('Identificador IMDb não encontrado', 'Este título ainda não possui código IMDb vinculado na base pública para reprodução.'));
                return;
            }
            const resolved = await resolveSuperCdnChannel({
                type,
                imdb,
                tmdbId: tmdbId || undefined,
                season,
                episode,
                channel,
            });
            if (resolved.kind === 'redirect' && resolved.url) {
                res.redirect(302, resolved.url);
                return;
            }
            res
                .status(200)
                .setHeader('Content-Type', 'text/html; charset=utf-8')
                .send(resolved.html ||
                renderStatusHtml('Canal temporariamente indisponível', 'Selecione outro canal no topo da tela para continuar assistindo.'));
        }
        catch {
            res
                .status(502)
                .setHeader('Content-Type', 'text/html; charset=utf-8')
                .send(renderStatusHtml('Falha ao conectar ao servidor de vídeo', 'Alternando ou tentando outro canal (Canal 1, Canal 2 ou Canal 3) você pode iniciar a reprodução imediatamente.'));
        }
    });
    app.get('/api/supercdn/hls-proxy', async (req, res) => {
        try {
            const kind = String(req.query.kind || 'segment');
            const targetUrl = String(req.query.u || '');
            const origin = String(req.query.o || 'https://vaiquecol.com');
            const sig = String(req.query.s || '');
            if (!targetUrl ||
                !/^https?:\/\//i.test(targetUrl) ||
                (kind !== 'manifest' && kind !== 'segment' && kind !== 'subtitle') ||
                !verifyHlsProxySignature(targetUrl, origin, kind, sig)) {
                res.status(403).end('Forbidden');
                return;
            }
            const upstreamHeaders = {
                Origin: origin,
                Referer: `${origin}/`,
                'User-Agent': BROWSER_USER_AGENT,
                Accept: '*/*',
            };
            if (req.headers.range) {
                upstreamHeaders.Range = String(req.headers.range);
            }
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);
            const upstream = await fetch(targetUrl, {
                method: 'GET',
                headers: upstreamHeaders,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!upstream.ok && upstream.status !== 206) {
                res.status(upstream.status).end();
                return;
            }
            if (kind === 'manifest') {
                const text = await upstream.text();
                if (text.trimStart().startsWith('#EXTM3U')) {
                    const rewritten = rewriteHlsManifest(text, targetUrl, origin);
                    res.status(200);
                    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
                    res.setHeader('Cache-Control', 'no-store');
                    res.send(rewritten);
                    return;
                }
            }
            if (kind === 'subtitle') {
                let subText = await upstream.text();
                if (!subText.trimStart().startsWith('WEBVTT')) {
                    subText = `WEBVTT\n\n${subText.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')}`;
                }
                res.status(200);
                res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
                res.send(subText);
                return;
            }
            res.status(upstream.status);
            res.setHeader('Content-Type', 'video/mp2t');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            const contentLen = upstream.headers.get('content-length');
            if (contentLen)
                res.setHeader('Content-Length', contentLen);
            const contentRange = upstream.headers.get('content-range');
            if (contentRange)
                res.setHeader('Content-Range', contentRange);
            if (upstream.body) {
                const nodeStream = Readable.fromWeb(upstream.body);
                nodeStream.on('error', () => {
                    if (!res.headersSent)
                        res.status(502);
                    res.end();
                });
                nodeStream.pipe(res);
            }
            else {
                const buf = Buffer.from(await upstream.arrayBuffer());
                res.end(buf);
            }
        }
        catch {
            if (!res.headersSent) {
                res.status(502);
            }
            res.end();
        }
    });
}
// Standalone Express app exported as default for Vercel Serverless Functions (/api/*)
const vercelApiApp = express();
vercelApiApp.disable('x-powered-by');
vercelApiApp.use(express.json());
registerApiRoutes(vercelApiApp);
export default vercelApiApp;
