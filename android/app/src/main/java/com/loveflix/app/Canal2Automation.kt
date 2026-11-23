package com.loveflix.app

import org.json.JSONObject

object Canal2Automation {

    fun isAllowedCanal2Url(rawUrl: String?): Boolean {
        if (rawUrl.isNullOrBlank()) return false
        val lower = rawUrl.lowercase()
        return lower.startsWith("https://superflixapi.") ||
            lower.startsWith("http://superflixapi.")
    }

    fun buildEmbedWrapperHtml(targetUrl: String): String {
        val safeSrc = targetUrl
            .replace("&", "&amp;")
            .replace("\"", "&quot;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")

        return """
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
              <style>
                html, body {
                  margin: 0;
                  padding: 0;
                  width: 100%;
                  height: 100%;
                  background: #000000;
                  overflow: hidden;
                }
                iframe {
                  position: fixed;
                  inset: 0;
                  width: 100%;
                  height: 100%;
                  border: 0;
                  display: block;
                  background: #000000;
                }
              </style>
            </head>
            <body>
              <iframe
                id="sfFrame"
                src="$safeSrc"
                referrerpolicy="no-referrer"
                scrolling="no"
                frameborder="0"
                allow="autoplay *; encrypted-media *; picture-in-picture *; fullscreen *; clipboard-write *; accelerometer *; gyroscope *"
                allowfullscreen
                webkitallowfullscreen
                mozallowfullscreen>
              </iframe>
            </body>
            </html>
        """.trimIndent()
    }

    fun buildDocumentStartScript(initialAudioPref: String, initialIntroActive: Boolean): String {
        val safeAudio = if (initialAudioPref == "original") "original" else "pt"
        val introBool = if (initialIntroActive) "true" else "false"

        return """
            (function() {
                try {
                    var host = (location.hostname || '').toLowerCase();
                    if (
                        host.indexOf('cloudflare') !== -1 ||
                        host.indexOf('turnstile') !== -1 ||
                        host.indexOf('hcaptcha') !== -1 ||
                        host.indexOf('recaptcha') !== -1
                    ) {
                        return;
                    }

                    if (window.__lfCanal2Injected) {
                        return;
                    }
                    window.__lfCanal2Injected = true;

                    var isWrapperFrame = (window === window.top && host === 'love-flix.vercel.app');
                    var isControlFrame = (host.indexOf('superflixapi') !== -1);

                    window.__LF_AUDIO_PREF = ${JSONObject.quote(safeAudio)};
                    window.__LF_INTRO_PLAYING = $introBool;

                    if (isWrapperFrame) {
                        function pushStateToChildren() {
                            var frames = document.querySelectorAll('iframe');
                            for (var i = 0; i < frames.length; i++) {
                                try {
                                    frames[i].contentWindow.postMessage({
                                        type: 'LF_CANAL2_STATE',
                                        introPlaying: !!window.__LF_INTRO_PLAYING,
                                        audioPref: window.__LF_AUDIO_PREF
                                    }, '*');
                                } catch (e) {}
                            }
                        }

                        window.__lfSetIntroState = function(active) {
                            window.__LF_INTRO_PLAYING = !!active;
                            pushStateToChildren();
                        };

                        window.__lfSetAudioPref = function(pref) {
                            window.__LF_AUDIO_PREF = (pref === 'original') ? 'original' : 'pt';
                            pushStateToChildren();
                        };

                        window.addEventListener('message', function(ev) {
                            var d = ev && ev.data;
                            if (!d || typeof d !== 'object') return;
                            if (d.type === 'LF_CANAL2_QUERY_STATE') {
                                try {
                                    ev.source && ev.source.postMessage({
                                        type: 'LF_CANAL2_STATE',
                                        introPlaying: !!window.__LF_INTRO_PLAYING,
                                        audioPref: window.__LF_AUDIO_PREF
                                    }, '*');
                                } catch (e) {}
                            } else if (d.type === 'LF_CANAL2_VIDEO_ALIVE') {
                                try { window.LoveFlixCanal2Bridge && window.LoveFlixCanal2Bridge.onVideoAlive(); } catch (e) {}
                                var sf = document.getElementById('sfFrame');
                                try { sf && sf.contentWindow && sf.contentWindow.postMessage({ type: 'LF_CANAL2_VIDEO_ALIVE' }, '*'); } catch (e) {}
                            } else if (d.type === 'LF_CANAL2_CHALLENGE_VISIBLE') {
                                try { window.LoveFlixCanal2Bridge && window.LoveFlixCanal2Bridge.onChallengeVisible(); } catch (e) {}
                            } else if (d.type === 'LF_CANAL2_UNAVAILABLE') {
                                try { window.LoveFlixCanal2Bridge && window.LoveFlixCanal2Bridge.onUnavailable(); } catch (e) {}
                            } else if (d.type === 'LF_CANAL2_IFRAME_ERROR') {
                                var sf2 = document.getElementById('sfFrame');
                                try { sf2 && sf2.contentWindow && sf2.contentWindow.postMessage({ type: 'LF_CANAL2_IFRAME_ERROR' }, '*'); } catch (e) {}
                            }
                        });
                        return;
                    }

                    // 1. Block popups / new tabs inside player and subframes
                    try {
                        window.open = function() { return null; };
                    } catch (e) {}

                    // 2. Inject CSS to hide SuperFlixAPI watermark/selo, episode list & ad overlays
                    function injectCleanCss() {
                        try {
                            if (document.getElementById('__lf_clean_css')) return;
                            var style = document.createElement('style');
                            style.id = '__lf_clean_css';
                            style.textContent = [
                                '[class*="watermark" i], [id*="watermark" i],',
                                '[class*="selo" i], [id*="selo" i],',
                                '[class*="oferecimento" i], [id*="oferecimento" i],',
                                '[class*="superflix-logo" i], [class*="superflix-watermark" i],',
                                '[class*="superflix-badge" i], [class*="superflix-selo" i],',
                                'img[src*="superflix" i], img[alt*="superflix" i],',
                                '.episode-list, #episode-list, .ep-list, #epList {',
                                '  display: none !important;',
                                '  opacity: 0 !important;',
                                '  visibility: hidden !important;',
                                '  pointer-events: none !important;',
                                '}'
                            ].join('\n');
                            var target = document.head || document.documentElement;
                            if (target) target.appendChild(style);
                        } catch (e) {}
                    }

                    function isSuperFlixBadgeNode(el) {
                        if (!el || el.nodeType !== 1) return false;
                        var tag = (el.tagName || '').toUpperCase();
                        if (tag === 'HTML' || tag === 'BODY' || tag === 'HEAD' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'VIDEO' || tag === 'AUDIO' || tag === 'IFRAME' || tag === 'BUTTON') {
                            return false;
                        }
                        if (el.querySelector && (el.querySelector('video') || el.querySelector('iframe') || el.querySelector('button'))) {
                            return false;
                        }
                        var cls = (typeof el.className === 'string' ? el.className : '') + ' ' + (el.id || '');
                        if (/\b(watermark|selo|oferecimento|superflix[-_ ]?(logo|badge|selo|watermark|brand))\b/i.test(cls)) {
                            return true;
                        }
                        var txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
                        if (!txt || txt.length > 90) return false;
                        return /um\s+oferecimento|oferecimento\s*:?\s*superflix|superflix\s*api|superflixapi/i.test(txt);
                    }

                    function isTransparentClickShield(el) {
                        if (!el || el.nodeType !== 1) return false;
                        var tag = (el.tagName || '').toUpperCase();
                        if (tag !== 'DIV' && tag !== 'A' && tag !== 'SPAN') return false;
                        if (el.querySelector && (el.querySelector('video') || el.querySelector('iframe') || el.querySelector('button') || el.querySelector('input'))) {
                            return false;
                        }
                        var txt = (el.innerText || '').trim();
                        if (txt.length > 0) return false;
                        var cs = window.getComputedStyle(el);
                        if (!cs) return false;
                        if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
                        var z = parseInt(cs.zIndex || '0', 10);
                        if (!(z >= 50)) return false;
                        var rect = el.getBoundingClientRect();
                        if (rect.width < window.innerWidth * 0.65 || rect.height < window.innerHeight * 0.65) {
                            return false;
                        }
                        var bg = cs.backgroundColor || '';
                        var isTransparent = bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)' || parseFloat(cs.opacity || '1') < 0.08;
                        return isTransparent;
                    }

                    function cleanBrandingAndOverlays(root) {
                        injectCleanCss();
                        var scope = root && root.querySelectorAll ? root : document;
                        if (!scope || !scope.querySelectorAll) return;
                        try {
                            var nodes = scope.querySelectorAll('div, span, p, a, img, small, label, section, header');
                            for (var i = 0; i < nodes.length; i++) {
                                var node = nodes[i];
                                if (node.dataset && node.dataset.lfHidden === '1') continue;
                                if (isSuperFlixBadgeNode(node) || isTransparentClickShield(node)) {
                                    node.style.setProperty('display', 'none', 'important');
                                    node.style.setProperty('opacity', '0', 'important');
                                    node.style.setProperty('visibility', 'hidden', 'important');
                                    node.style.setProperty('pointer-events', 'none', 'important');
                                    if (node.dataset) node.dataset.lfHidden = '1';
                                }
                            }
                        } catch (e) {}
                    }

                    // 3. Intro Mute / Resume Sync across control frame & nested player frames
                    var heldVideos = [];
                    function enforceIntroMediaState() {
                        var active = !!window.__LF_INTRO_PLAYING;
                        var medias = document.querySelectorAll('video, audio');
                        for (var i = 0; i < medias.length; i++) {
                            var m = medias[i];
                            if (active) {
                                if (!m.muted) m.muted = true;
                                if (!m.paused) {
                                    try { m.pause(); } catch (e) {}
                                    if (heldVideos.indexOf(m) === -1) heldVideos.push(m);
                                }
                                if (m.dataset) m.dataset.lfIntroMuted = '1';
                            } else {
                                if (m.dataset && m.dataset.lfIntroMuted === '1') {
                                    m.muted = false;
                                    m.dataset.lfIntroMuted = '';
                                }
                                if (heldVideos.indexOf(m) !== -1) {
                                    try { m.play(); } catch (e) {}
                                }
                            }
                        }
                        if (!active) heldVideos = [];
                    }

                    function broadcastStateToIframes() {
                        var frames = document.querySelectorAll('iframe');
                        for (var i = 0; i < frames.length; i++) {
                            try {
                                frames[i].contentWindow.postMessage({
                                    type: 'LF_CANAL2_STATE',
                                    introPlaying: !!window.__LF_INTRO_PLAYING,
                                    audioPref: window.__LF_AUDIO_PREF
                                }, '*');
                            } catch (e) {}
                        }
                    }

                    // Watch media elements for alive state & intro hold
                    var reportedAlive = false;
                    function reportVideoAlive() {
                        if (reportedAlive) return;
                        reportedAlive = true;
                        try { window.top.postMessage({ type: 'LF_CANAL2_VIDEO_ALIVE' }, '*'); } catch (e) {}
                        if (!isControlFrame) {
                            try { window.parent.postMessage({ type: 'LF_CANAL2_VIDEO_ALIVE' }, '*'); } catch (e) {}
                        }
                    }

                    function wireMediaWatchers() {
                        var videos = document.querySelectorAll('video');
                        for (var i = 0; i < videos.length; i++) {
                            var v = videos[i];
                            if (v.dataset && v.dataset.lfWatched === '1') {
                                if (v.readyState >= 2 && (v.videoWidth > 0 || !v.paused)) {
                                    reportVideoAlive();
                                }
                                continue;
                            }
                            if (v.dataset) v.dataset.lfWatched = '1';
                            v.addEventListener('play', function() {
                                if (window.__LF_INTRO_PLAYING) {
                                    enforceIntroMediaState();
                                }
                            });
                            v.addEventListener('loadeddata', function() {
                                reportVideoAlive();
                                enforceIntroMediaState();
                            });
                            v.addEventListener('playing', function() {
                                if (window.__LF_INTRO_PLAYING) {
                                    enforceIntroMediaState();
                                } else {
                                    reportVideoAlive();
                                }
                            });
                            if (v.readyState >= 2 && v.videoWidth > 0) {
                                reportVideoAlive();
                            }
                        }
                        enforceIntroMediaState();
                    }

                    // Request authoritative state from top wrapper frame
                    try {
                        window.top.postMessage({ type: 'LF_CANAL2_QUERY_STATE' }, '*');
                    } catch (e) {}

                    // 4. Control-Frame Automation: Turnstile -> Audio Pref -> Server Priority
                    var STORAGE_KEY = 'lf_c2_tried_' + (location.pathname || '');
                    function getTriedServers() {
                        try {
                            var raw = sessionStorage.getItem(STORAGE_KEY);
                            if (!raw) return [];
                            var parsed = JSON.parse(raw);
                            if (parsed && parsed.ts && (Date.now() - parsed.ts) < 45000 && Array.isArray(parsed.list)) {
                                return parsed.list;
                            }
                        } catch (e) {}
                        return [];
                    }
                    function addTriedServer(key) {
                        try {
                            var list = getTriedServers();
                            if (list.indexOf(key) === -1) list.push(key);
                            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now(), list: list }));
                        } catch (e) {}
                    }
                    function clearTriedServers() {
                        try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
                    }

                    window.addEventListener('message', function(ev) {
                        var d = ev && ev.data;
                        if (!d || typeof d !== 'object') return;
                        if (d.type === 'LF_CANAL2_STATE') {
                            window.__LF_INTRO_PLAYING = !!d.introPlaying;
                            if (d.audioPref === 'original' || d.audioPref === 'pt') {
                                window.__LF_AUDIO_PREF = d.audioPref;
                            }
                            enforceIntroMediaState();
                            broadcastStateToIframes();
                        } else if (d.type === 'LF_CANAL2_INTRO_STATE') {
                            window.__LF_INTRO_PLAYING = !!d.active;
                            enforceIntroMediaState();
                            broadcastStateToIframes();
                        } else if (isControlFrame && d.type === 'LF_CANAL2_QUERY_STATE') {
                            try {
                                ev.source && ev.source.postMessage({
                                    type: 'LF_CANAL2_STATE',
                                    introPlaying: !!window.__LF_INTRO_PLAYING,
                                    audioPref: window.__LF_AUDIO_PREF
                                }, '*');
                            } catch (e) {}
                        } else if (isControlFrame && d.type === 'LF_CANAL2_VIDEO_ALIVE') {
                            window.__lfPlaybackConfirmed = true;
                            clearTriedServers();
                            reportVideoAlive();
                        } else if (isControlFrame && d.type === 'LF_CANAL2_IFRAME_ERROR') {
                            window.__lfSubframeError = true;
                        }
                    });

                    function isVisibleEl(el) {
                        if (!el) return false;
                        var cs = window.getComputedStyle(el);
                        if (!cs || cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') === 0) {
                            return false;
                        }
                        var rect = el.getBoundingClientRect();
                        return rect.width > 10 && rect.height > 10;
                    }

                    function isDisabledEl(el) {
                        if (!el) return true;
                        if (el.disabled) return true;
                        if (el.getAttribute && el.getAttribute('aria-disabled') === 'true') return true;
                        var cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
                        if (/(disabled|unavailable|offline|locked|bloqueado|indisponivel|cursor-not-allowed)/.test(cls)) return true;
                        var cs = window.getComputedStyle(el);
                        if (cs && (cs.pointerEvents === 'none' || cs.cursor === 'not-allowed' || parseFloat(cs.opacity || '1') < 0.55)) return true;
                        if (el.querySelector && el.querySelector('.fa-ban, .fa-lock, .fa-times-circle, .fa-circle-xmark, [class*="ban" i], [class*="disabled" i]')) {
                            return true;
                        }
                        return false;
                    }

                    function isActiveEl(el) {
                        if (!el) return false;
                        if (el.getAttribute) {
                            if (el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-pressed') === 'true') return true;
                            if (el.getAttribute('data-active') === 'true' || el.getAttribute('data-selected') === 'true') return true;
                        }
                        var cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
                        if (/\b(active|selected|current)\b/.test(cls) || /bg-red|bg-\[#e50914\]|border-red/.test(cls)) return true;
                        var cs = window.getComputedStyle(el);
                        if (cs && cs.backgroundColor) {
                            var m = cs.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                            if (m) {
                                var r = parseInt(m[1], 10);
                                var g = parseInt(m[2], 10);
                                var b = parseInt(m[3], 10);
                                if (r >= 175 && g <= 65 && b <= 75) return true;
                            }
                        }
                        return false;
                    }

                    function getClickableNodes() {
                        var sel = 'button, a, [role="button"], li, div[onclick], span[onclick], [data-server], [data-player], [data-id], [data-lang], [data-audio], [class*="server" i], [class*="player" i], [class*="audio" i], [class*="lang" i], [class*="btn" i]';
                        var raw = document.querySelectorAll(sel);
                        var out = [];
                        for (var i = 0; i < raw.length; i++) {
                            var el = raw[i];
                            if (!isVisibleEl(el)) continue;
                            var txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
                            if (!txt || txt.length > 55) continue;
                            out.push({ el: el, text: txt, lower: txt.toLowerCase() });
                        }
                        return out;
                    }

                    function hasDirectPlayerMounted() {
                        var v = document.querySelector('video');
                        if (v && (v.readyState >= 2 || v.currentSrc || v.src)) return true;
                        var iframes = document.querySelectorAll('iframe');
                        for (var i = 0; i < iframes.length; i++) {
                            var s = (iframes[i].getAttribute('src') || '').toLowerCase();
                            if (s && s.indexOf('cloudflare') === -1 && s.indexOf('about:blank') === -1) {
                                return true;
                            }
                        }
                        return false;
                    }

                    function findServerCandidates(nodes) {
                        var candidates = [];
                        for (var i = 0; i < nodes.length; i++) {
                            var n = nodes[i];
                            if (isDisabledEl(n.el)) continue;
                            if (/^(dublado|legendado|original|voltar|reportar|fechar|tentar novamente|copiar)$/i.test(n.lower)) continue;

                            var priority = 99;
                            if (/servidor\s*principal|\bprincipal\b|player\s*1\b|servidor\s*1\b/.test(n.lower)) {
                                priority = 1;
                            } else if (/servidor\s*alternativo|\balternativo\b|servidor\s*2\b|player\s*2\b|\bbackup\b|secund[aá]rio/.test(n.lower)) {
                                priority = 2;
                            } else if (/(servidor|player|streamtape|filemoon|mixdrop|dood|vidhide|embed|op[cç][aã]o\s*\d)/.test(n.lower)) {
                                priority = 3;
                            }
                            if (priority < 99) {
                                candidates.push({ el: n.el, key: n.lower, priority: priority, order: i });
                            }
                        }
                        candidates.sort(function(a, b) {
                            if (a.priority !== b.priority) return a.priority - b.priority;
                            return a.order - b.order;
                        });
                        return candidates;
                    }

                    function findBackButton(nodes) {
                        for (var i = 0; i < nodes.length; i++) {
                            if (/^(voltar|trocar servidor|servidores)$/i.test(nodes[i].lower) || /\bvoltar\b/.test(nodes[i].lower)) {
                                return nodes[i].el;
                            }
                        }
                        return null;
                    }

                    function hasTurnstileGate() {
                        var cfFrame = document.querySelector('.cf-turnstile, iframe[src*="challenges.cloudflare.com"]');
                        if (cfFrame && isVisibleEl(cfFrame)) {
                            return true;
                        }
                        var txt = (document.body && document.body.innerText) || '';
                        if (/valida[cç][aã]o\s+segura|confirme\s+que\s+voc[eê]\s+[eé]\s+humano/i.test(txt)) {
                            return true;
                        }
                        var cfInput = document.querySelector('input[name="cf-turnstile-response"]');
                        if (cfInput && !hasDirectPlayerMounted() && findServerCandidates(getClickableNodes()).length === 0) {
                            return true;
                        }
                        return false;
                    }

                    function hasExplicitUnavailablePage() {
                        var txt = ((document.body && document.body.innerText) || '').trim();
                        if (!txt) return false;
                        if (/acesso\s+restrito[\s\S]*visualiza[cç][aã]o\s+externa/i.test(txt)) {
                            return true;
                        }
                        var hasPlayerOrBtns = !!document.querySelector('video, iframe:not([src*="cloudflare"]), button');
                        if (!hasPlayerOrBtns && /\b404\b.*not\s*found|conte[uú]do\s+(n[aã]o\s+encontrado|indispon[ií]vel)/i.test(txt)) {
                            return true;
                        }
                        return false;
                    }

                    function hasPlayerErrorBanner() {
                        var txt = ((document.body && document.body.innerText) || '').toLowerCase();
                        return /(servidor\s+indispon[ií]vel|erro\s+ao\s+carregar|n[aã]o\s+foi\s+poss[ií]vel\s+reproduzir|tente\s+outro\s+servidor|file\s+was\s+deleted|video\s+not\s+found|404\s+not\s+found)/.test(txt);
                    }

                    var audioHandled = false;
                    var audioLastClickAt = 0;
                    var audioClickAttempts = 0;
                    var serverClickedAt = 0;
                    var activeServerKey = null;
                    var unavailableNotified = false;
                    var challengeNotified = false;
                    var subframeErrorSent = false;
                    window.__lfPlaybackConfirmed = false;
                    window.__lfSubframeError = false;

                    function trySelectAudio(nodes) {
                        var dubNodes = [];
                        var origNodes = [];
                        for (var i = 0; i < nodes.length; i++) {
                            var n = nodes[i];
                            if (/servidor|player|voltar|reportar|fechar|tentar|copiar/i.test(n.lower)) continue;
                            if (/^(dublado|portugu[eê]s|pt-?br|dub)(\s+.*)?$/i.test(n.lower) || /\bdublado\b/.test(n.lower)) {
                                if (!isDisabledEl(n.el)) dubNodes.push(n);
                            } else if (/^(legendado|original|leg)(\s+.*)?$/i.test(n.lower) || /\blegendado\b/.test(n.lower)) {
                                if (!isDisabledEl(n.el)) origNodes.push(n);
                            }
                        }

                        if (dubNodes.length === 0 && origNodes.length === 0) {
                            if (findServerCandidates(nodes).length > 0 || hasDirectPlayerMounted()) {
                                audioHandled = true;
                            }
                            return false;
                        }

                        var pref = (window.__LF_AUDIO_PREF === 'original') ? 'original' : 'pt';
                        var preferredList = (pref === 'original')
                            ? (origNodes.length > 0 ? origNodes : dubNodes)
                            : (dubNodes.length > 0 ? dubNodes : origNodes);

                        for (var j = 0; j < preferredList.length; j++) {
                            if (isActiveEl(preferredList[j].el)) {
                                audioHandled = true;
                                return false;
                            }
                        }

                        if (preferredList.length > 0) {
                            if (audioClickAttempts >= 2) {
                                audioHandled = true;
                                return false;
                            }
                            if ((Date.now() - audioLastClickAt) > 650) {
                                audioLastClickAt = Date.now();
                                audioClickAttempts += 1;
                                try { preferredList[0].el.click(); } catch (e) {}
                                return true;
                            }
                            return true;
                        }

                        audioHandled = true;
                        return false;
                    }

                    function notifyUnavailable() {
                        if (unavailableNotified) return;
                        unavailableNotified = true;
                        clearTriedServers();
                        try { window.top.postMessage({ type: 'LF_CANAL2_UNAVAILABLE' }, '*'); } catch (e) {}
                    }

                    function checkSubframeHealth() {
                        if (isControlFrame || subframeErrorSent || reportedAlive) return;
                        if (!document.querySelector('video') && hasPlayerErrorBanner()) {
                            subframeErrorSent = true;
                            try { window.parent.postMessage({ type: 'LF_CANAL2_IFRAME_ERROR' }, '*'); } catch (e) {}
                            try { window.top.postMessage({ type: 'LF_CANAL2_IFRAME_ERROR' }, '*'); } catch (e) {}
                        }
                    }

                    function runControlAutomationTick() {
                        if (!isControlFrame || unavailableNotified) return;

                        if (hasTurnstileGate()) {
                            if (!challengeNotified) {
                                challengeNotified = true;
                                try { window.top.postMessage({ type: 'LF_CANAL2_CHALLENGE_VISIBLE' }, '*'); } catch (e) {}
                            }
                            return;
                        }

                        if (hasExplicitUnavailablePage()) {
                            notifyUnavailable();
                            return;
                        }

                        var nodes = getClickableNodes();

                        if (!audioHandled) {
                            var clickedAudio = trySelectAudio(nodes);
                            if (clickedAudio) return;
                        }

                        var servers = findServerCandidates(nodes);
                        var tried = getTriedServers();

                        if (activeServerKey && !window.__lfPlaybackConfirmed) {
                            var elapsed = Date.now() - serverClickedAt;
                            var iframeMounted = hasDirectPlayerMounted();
                            var timedOut = iframeMounted ? (elapsed > 13000) : (elapsed > 8500);
                            if (hasPlayerErrorBanner() || window.__lfSubframeError || timedOut) {
                                addTriedServer(activeServerKey);
                                activeServerKey = null;
                                window.__lfSubframeError = false;
                                var backBtn = findBackButton(nodes);
                                if (backBtn) {
                                    try { backBtn.click(); } catch (e) {}
                                    return;
                                }
                                var freshServers = findServerCandidates(nodes);
                                var hasMore = freshServers.some(function(s) { return getTriedServers().indexOf(s.key) === -1; });
                                if (hasMore) {
                                    location.reload();
                                    return;
                                } else {
                                    notifyUnavailable();
                                    return;
                                }
                            }
                        }

                        if (!activeServerKey && servers.length > 0) {
                            var nextServer = null;
                            for (var k = 0; k < servers.length; k++) {
                                if (tried.indexOf(servers[k].key) === -1) {
                                    nextServer = servers[k];
                                    break;
                                }
                            }
                            if (!nextServer) {
                                notifyUnavailable();
                                return;
                            }
                            activeServerKey = nextServer.key;
                            serverClickedAt = Date.now();
                            window.__lfSubframeError = false;
                            try { nextServer.el.click(); } catch (e) {}
                            return;
                        }

                        if (!activeServerKey && servers.length === 0 && hasDirectPlayerMounted()) {
                            var videosNow = document.querySelectorAll('video');
                            for (var x = 0; x < videosNow.length; x++) {
                                if (videosNow[x].readyState >= 2) {
                                    window.__lfPlaybackConfirmed = true;
                                    clearTriedServers();
                                    reportVideoAlive();
                                    break;
                                }
                            }
                        }
                    }

                    function startLoop() {
                        cleanBrandingAndOverlays(document);
                        wireMediaWatchers();
                        if (isControlFrame) runControlAutomationTick();
                        else checkSubframeHealth();
                    }

                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', startLoop);
                    } else {
                        startLoop();
                    }

                    try {
                        var mo = new MutationObserver(function() {
                            cleanBrandingAndOverlays(document);
                            wireMediaWatchers();
                        });
                        mo.observe(document.documentElement || document, { childList: true, subtree: true });
                    } catch (e) {}

                    setInterval(function() {
                        cleanBrandingAndOverlays(document);
                        wireMediaWatchers();
                        if (isControlFrame) runControlAutomationTick();
                        else checkSubframeHealth();
                    }, 450);
                } catch (err) {}
            })();
        """.trimIndent()
    }
}
