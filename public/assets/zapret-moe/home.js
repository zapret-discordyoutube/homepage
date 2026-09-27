/* Главная git.zapret.moe: заставка-презентация, музыка к ней и «Пульс разработки».
   Всё здесь — необязательное улучшение: без JS страница полностью работает. */
(function () {
  'use strict';

  var root = document.documentElement;

  /* ── Музыка: синтезируется на лету через Web Audio, без файлов ──────────
     Медленная часть — тёмный пэд и «сердцебиение», пока РКН душит провода.
     Быстрая — бочка, хэты, бас и арпеджио, когда на сцену выходят проекты. */
  var music = (function () {
    var ctx = null, master = null, noise = null, timer = null;
    var mode = 'slow', step16 = 0, bar = 0, next = 0;
    var CHORDS = [[45, 0], [41, 1], [48, 1], [43, 1]]; // Am F C G: [midi корня, мажор?]

    function hz(m) { return 440 * Math.pow(2, (m - 69) / 12) }
    function tones(c) { return [c[0], c[0] + (c[1] ? 4 : 3), c[0] + 7] }

    function env(g, t, a, peak, d) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    function osc(type, f, t, a, peak, d, cutoff, dest) {
      var o = ctx.createOscillator(), g = ctx.createGain(), out = g;
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (cutoff) { var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; o.connect(lp); lp.connect(g) } else o.connect(g);
      out.connect(dest || master);
      env(g, t, a, peak, d);
      o.start(t); o.stop(t + a + d + 0.05);
      return o;
    }
    function kick(t, peak) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      o.connect(g); g.connect(master);
      env(g, t, 0.004, peak, 0.28);
      o.start(t); o.stop(t + 0.35);
    }
    function hiss(t, type, f, peak, d) {
      var s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise; fl.type = type; fl.frequency.value = f;
      s.connect(fl); fl.connect(g); g.connect(master);
      env(g, t, 0.002, peak, d);
      s.start(t); s.stop(t + d + 0.05);
    }

    function tick(t, dur16) {
      var s = step16 % 16, c = CHORDS[bar % 4], ch = tones(c);
      if (mode === 'slow') {
        if (s === 0) ch.forEach(function (m, i) {
          osc('sawtooth', hz(m + 12), t, 1.2, 0.05, dur16 * 16, 700);
          osc('sawtooth', hz(m + 12) * 1.004, t, 1.2, 0.035, dur16 * 16, 500);
        });
        if (s === 0 || s === 3) kick(t, s === 0 ? 0.55 : 0.3);
        if (s === 8) osc('triangle', 1760, t, 0.005, 0.05, 0.12, 0);
        if (s === 10) osc('triangle', 1318.5, t, 0.005, 0.03, 0.1, 0);
      } else if (mode === 'fast') {
        if (s % 4 === 0) kick(t, 0.7);
        if (s === 4 || s === 12) hiss(t, 'bandpass', 1600, 0.25, 0.16);
        if (s % 2 === 1) hiss(t, 'highpass', 7500, s % 4 === 3 ? 0.08 : 0.04, 0.05);
        if (s % 2 === 0) osc('sawtooth', hz(c[0] + (s % 8 === 6 ? 12 : 0)), t, 0.005, 0.16, dur16 * 1.6, 900);
        var arp = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[1] + 24];
        osc('square', hz(arp[s % 4]), t, 0.004, 0.035, dur16 * 0.9, 2600);
        if (s === 0) ch.forEach(function (m) { osc('sawtooth', hz(m + 12), t, 0.3, 0.025, dur16 * 15, 1200) });
      }
      step16++;
      if (step16 % 16 === 0) bar++;
    }

    function schedule() {
      if (mode === 'end') return;
      var bpm = mode === 'fast' ? 132 : 72, dur16 = 60 / bpm / 4;
      while (next < ctx.currentTime + 0.12) { tick(next, dur16); next += dur16 }
    }

    function finale() {
      var t = ctx.currentTime + 0.05;
      tones(CHORDS[0]).concat([57]).forEach(function (m) { osc('sawtooth', hz(m + 12), t, 0.05, 0.05, 2.4, 1800) });
      kick(t, 0.6);
    }

    return {
      on: function () { return !!(ctx && ctx.state === 'running' && master.gain.value > 0.01) },
      start: function (m) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        if (!ctx) {
          ctx = new AC();
          var comp = ctx.createDynamicsCompressor();
          master = ctx.createGain(); master.gain.value = 0.0001;
          master.connect(comp); comp.connect(ctx.destination);
          noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
          var d = noise.getChannelData(0);
          for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        ctx.resume();
        mode = m || mode;
        next = ctx.currentTime + 0.05; step16 = 0;
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(0.55, ctx.currentTime, 0.3);
        clearInterval(timer); timer = setInterval(schedule, 25);
        return true;
      },
      mode: function (m) {
        if (m === mode) return;
        var was = mode; mode = m;
        if (!ctx || ctx.state !== 'running') return;
        if (m === 'fast' && was === 'slow') { step16 = 0; bar = 0; next = ctx.currentTime + 0.05; hiss(next, 'highpass', 900, 0.3, 0.6) }
        if (m === 'end') finale();
      },
      stop: function (fade) {
        if (!ctx) return;
        clearInterval(timer);
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(0.0001, ctx.currentTime, (fade || 0.4) / 3);
        setTimeout(function () { if (ctx) ctx.suspend() }, (fade || 0.4) * 1000 + 200);
      }
    };
  })();

  /* ── Заставка-презентация ─────────────────────────────────────────────── */
  var intro = document.getElementById('zpm-intro');
  var replay = document.getElementById('zpm-replay');
  // длительность каждого слайда; 5–7 — проекты, 9 — финал
  var steps = [1800, 2000, 2200, 2600, 2900, 2900, 2900, 2600, 2400];
  var cur = 0, timer = null, running = false;

  function remember() { try { localStorage.setItem('zpm-intro', '1') } catch (e) {} }

  function finish() {
    if (!running) return;
    running = false;
    clearTimeout(timer);
    remember();
    music.stop(1.2);
    intro.classList.add('zi-out');
    document.removeEventListener('keydown', onKey);
    setTimeout(function () {
      root.classList.remove('zpm-intro-on');
      intro.className = 'zi';
      intro.removeAttribute('data-cur');
    }, 750);
    if (replay) replay.hidden = false;
  }

  function go(n) {
    clearTimeout(timer);
    if (n > steps.length) return finish();
    cur = n;
    intro.classList.add('s' + n);
    intro.setAttribute('data-cur', n);
    intro.style.setProperty('--step', steps[n - 1] + 'ms');
    music.mode(n <= 4 ? 'slow' : n <= 8 ? 'fast' : 'end');
    timer = setTimeout(function () { go(n + 1) }, steps[n - 1]);
  }

  function onKey(e) {
    if (e.key === 'Escape') finish();
    else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); go(cur + 1) }
  }

  function start() {
    // в портретной ориентации показываем центральную часть сцены крупнее
    var scene = intro.querySelector('.zi-scene');
    if (scene) scene.setAttribute('viewBox', innerWidth < innerHeight * 0.9 ? '420 20 760 700' : '0 0 1600 900');
    intro.className = 'zi';
    root.classList.add('zpm-intro-on');
    void intro.offsetWidth; // перезапуск CSS-анимаций при повторном показе
    intro.classList.add('zi-run');
    running = true;
    document.addEventListener('keydown', onKey);
    go(1);
  }

  if (intro) {
    intro.addEventListener('click', function (e) {
      if (e.target.closest('.zi-skip')) return finish();
      if (e.target.closest('.zi-sound')) {
        if (music.on()) { music.stop(0.3); intro.classList.remove('zi-snd') }
        else if (music.start(cur <= 4 ? 'slow' : cur <= 8 ? 'fast' : 'end')) intro.classList.add('zi-snd');
        return;
      }
      go(cur + 1);
    });
    if (root.classList.contains('zpm-intro-on')) start();
    else if (replay) replay.hidden = false;
    if (replay) replay.addEventListener('click', function () { window.scrollTo(0, 0); start() });
  }

  /* ── Пульс разработки ─────────────────────────────────────────────────── */
  var stats = document.getElementById('zpm-stats');
  if (stats && window.fetch) {
    fetch(stats.getAttribute('data-api')).then(function (r) { return r.json() }).then(function (data) {
      var now = Date.now() / 1000, day = 86400, w = 0, m = 0, y = 0, weeks = [];
      for (var k = 0; k < 26; k++) weeks.push(0);
      data.forEach(function (p) {
        var age = now - p.timestamp;
        if (age < 7 * day) w += p.contributions;
        if (age < 30 * day) m += p.contributions;
        if (age < 365 * day) y += p.contributions;
        var wi = Math.floor(age / (7 * day));
        if (wi >= 0 && wi < 26) weeks[25 - wi] += p.contributions;
      });
      var fmt = function (n) { return n.toLocaleString('ru-RU') };
      document.getElementById('zpm-st-week').textContent = fmt(w);
      document.getElementById('zpm-st-month').textContent = fmt(m);
      document.getElementById('zpm-st-year').textContent = fmt(y);
      var max = Math.max.apply(null, weeks.concat([1])), pts = [];
      weeks.forEach(function (v, i) { pts.push([+(i * 520 / 25).toFixed(1), +(112 - v / max * 100).toFixed(1)]) });
      var d = 'M' + pts[0][0] + ' ' + pts[0][1];
      for (var i = 1; i < pts.length; i++) {
        var mx = ((pts[i - 1][0] + pts[i][0]) / 2).toFixed(1);
        d += ' C' + mx + ' ' + pts[i - 1][1] + ' ' + mx + ' ' + pts[i][1] + ' ' + pts[i][0] + ' ' + pts[i][1];
      }
      document.getElementById('zpm-st-line').setAttribute('d', d);
      document.getElementById('zpm-st-area').setAttribute('d', d + ' L520 120 L0 120 Z');
      stats.hidden = false;
    }).catch(function () {});
  }
})();
