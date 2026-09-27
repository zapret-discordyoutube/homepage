/* Главная git.zapret.moe: заставка-презентация, музыка к ней и «Пульс разработки».
   Всё здесь — необязательное улучшение: без JS страница полностью работает. */
(function () {
  'use strict';

  var root = document.documentElement;
  var DAY = 86400;
  var MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var COLORS = { gui: '#4fd1ff', zsg: '#9b7bff', kvn: '#3b82ff', magisk: '#ff6bb3', vpn: '#37e39a', other: '#7b89b3', all: '#4fd1ff' };

  function fmt(n) { return Math.round(n).toLocaleString('ru-RU') }
  function short(n) {
    if (n >= 1e6) return (n / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн';
    if (n >= 1e4) return Math.round(n / 1e3).toLocaleString('ru-RU') + ' тыс.';
    return fmt(n);
  }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function ease(t) { return 1 - Math.pow(1 - t, 3) }
  function countUp(el, to, ms) {
    var t0 = performance.now();
    (function step(now) {
      var k = Math.min(1, (now - t0) / ms);
      el.textContent = fmt(to * (1 - Math.pow(2, -10 * k)) / (1 - Math.pow(2, -10)));
      if (k < 1) requestAnimationFrame(step); else el.textContent = fmt(to);
    })(t0);
  }
  function weekLabel(ts) {
    var a = new Date(ts * 1000), b = new Date((ts + 6 * DAY) * 1000);
    return a.getUTCDate() + (a.getUTCMonth() === b.getUTCMonth() ? '' : ' ' + MONTHS[a.getUTCMonth()]) +
      '–' + b.getUTCDate() + ' ' + MONTHS[b.getUTCMonth()];
  }

  /* ── Данные: готовый JSON с сервера, запасной вариант — heatmap API ───── */
  var pulse = document.getElementById('zpm-pulse');
  var statsPromise = null;
  function loadStats() {
    if (statsPromise) return statsPromise;
    if (!pulse || !window.fetch) return (statsPromise = Promise.reject());
    var bust = Math.floor(Date.now() / 1800000);
    statsPromise = fetch(pulse.getAttribute('data-stats') + '?h=' + bust)
      .then(function (r) { if (!r.ok) throw 0; return r.json() })
      .then(function (d) { d.source = 'commits'; return d })
      .catch(function () {
        return fetch(pulse.getAttribute('data-heatmap')).then(function (r) { return r.json() }).then(function (hm) {
          var now = Date.now() / 1000, monday = now - (now - 4 * DAY) % (7 * DAY), week0 = monday - 51 * 7 * DAY;
          var s = []; for (var i = 0; i < 52; i++) s.push(0);
          var t = { commits_year: 0, commits_7d: 0 };
          hm.forEach(function (p) {
            if (p.timestamp >= week0) s[Math.min(51, Math.floor((p.timestamp - week0) / (7 * DAY)))] += p.contributions;
            if (now - p.timestamp < 365 * DAY) t.commits_year += p.contributions;
            if (now - p.timestamp < 7 * DAY) t.commits_7d += p.contributions;
          });
          return { source: 'actions', week0: week0, order: ['all'], labels: { all: 'Все проекты' }, series: { all: s }, totals: t };
        });
      });
    return statsPromise;
  }

  /* ── Интерактивный график ─────────────────────────────────────────────── */
  function Chart(box, data) {
    var svg = box.querySelector('svg'), tip = box.querySelector('.zp-tip');
    var keys = data.order.filter(function (k) { return data.series[k] && data.series[k].some(Boolean) });
    var N = data.series[keys[0]].length;
    var on = {}; keys.forEach(function (k) { on[k] = true });
    var cur = {}, tgt = {};
    keys.forEach(function (k) { cur[k] = data.series[k].map(function () { return 0 }) });
    var wCur = 52, wTgt = 52, yCur = 1, reveal = 0, hover = -1, raf = 0;

    function targets() {
      keys.forEach(function (k) { tgt[k] = data.series[k].map(function (v) { return on[k] ? v : 0 }) });
    }
    function totalsOf(src, i) { var s = 0; keys.forEach(function (k) { s += src[k][i] }); return s }
    function niceMax(v) {
      if (v <= 0) return 10;
      var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
      return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
    }
    function yTarget(w) {
      var m = 0;
      for (var i = Math.max(0, N - Math.ceil(w)); i < N; i++) m = Math.max(m, totalsOf(tgt, i));
      return niceMax(m * 1.08);
    }

    function draw() {
      var W = box.clientWidth, H = box.clientHeight;
      if (!W || !H) return;
      var pl = 44, pr = 14, pt = 22, pb = 30, pw = W - pl - pr, ph = H - pt - pb;
      var s0 = N - wCur;
      var x = function (i) { return pl + (i - s0) / (wCur - 1) * pw };
      var y = function (v) { return pt + ph - v / yCur * ph };
      var out = '<defs><clipPath id="zp-clip"><rect x="' + pl + '" y="0" width="' + (pw * reveal).toFixed(1) + '" height="' + H + '"/></clipPath>';
      keys.forEach(function (k) {
        out += '<linearGradient id="zp-g-' + k + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + COLORS[k] + '" stop-opacity=".85"/><stop offset="1" stop-color="' + COLORS[k] + '" stop-opacity=".25"/></linearGradient>';
      });
      out += '</defs>';
      // сетка и подписи
      for (var g = 0; g <= 4; g++) {
        var gv = yCur * g / 4, gy = y(gv).toFixed(1);
        out += '<line class="zp-gl" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + gy + '" y2="' + gy + '"/>';
        out += '<text class="zp-yl" x="' + (pl - 8) + '" y="' + (+gy + 4) + '">' + short(gv) + '</text>';
      }
      var lastX = -99;
      for (var i = Math.max(0, Math.floor(s0)); i < N; i++) {
        var t = data.week0 + i * 7 * DAY, d = new Date(t * 1000), prev = new Date((t - 7 * DAY) * 1000);
        if (d.getUTCMonth() !== prev.getUTCMonth()) {
          var mx = x(i);
          if (mx >= pl && mx - lastX > 40) { out += '<text class="zp-xl" x="' + mx.toFixed(1) + '" y="' + (H - 8) + '">' + MONTHS[d.getUTCMonth()] + '</text>'; lastX = mx }
        }
      }
      // слои
      out += '<g clip-path="url(#zp-clip)">';
      var base = []; for (i = 0; i < N; i++) base.push(0);
      var i0 = Math.max(0, Math.floor(s0) - 1);
      keys.forEach(function (k) {
        var top = [], j;
        for (j = 0; j < N; j++) top.push(base[j] + cur[k][j]);
        var up = '', down = '';
        for (j = i0; j < N; j++) {
          var px = x(j).toFixed(1), py = y(top[j]).toFixed(1);
          if (j === i0) up = 'M' + px + ' ' + py;
          else { var mx2 = ((x(j - 1) + x(j)) / 2).toFixed(1); up += ' C' + mx2 + ' ' + y(top[j - 1]).toFixed(1) + ' ' + mx2 + ' ' + py + ' ' + px + ' ' + py }
        }
        for (j = N - 1; j >= i0; j--) {
          var bx = x(j).toFixed(1), by = y(base[j]).toFixed(1);
          if (j === N - 1) down = ' L' + bx + ' ' + by;
          else { var mx3 = ((x(j + 1) + x(j)) / 2).toFixed(1); down += ' C' + mx3 + ' ' + y(base[j + 1]).toFixed(1) + ' ' + mx3 + ' ' + by + ' ' + bx + ' ' + by }
        }
        out += '<path class="zp-ar" fill="url(#zp-g-' + k + ')" d="' + up + down + ' Z"/>';
        out += '<path class="zp-ln" stroke="' + COLORS[k] + '" d="' + up + '"/>';
        base = top;
      });
      out += '</g>';
      // рекордная неделя
      var best = -1, bestV = 0;
      for (i = Math.max(0, Math.ceil(s0)); i < N; i++) { var tv = totalsOf(tgt, i); if (tv > bestV) { bestV = tv; best = i } }
      if (best >= 0 && reveal > 0.98 && hover < 0) {
        var bx2 = x(best), by2 = y(base[best]);
        out += '<g class="zp-best"><circle cx="' + bx2.toFixed(1) + '" cy="' + by2.toFixed(1) + '" r="5"/><text x="' + Math.min(W - pr - 50, Math.max(pl + 50, bx2)).toFixed(1) + '" y="' + Math.max(14, by2 - 12).toFixed(1) + '">рекорд · ' + fmt(bestV) + '</text></g>';
      }
      // курсор
      if (hover >= 0) {
        var hx = x(hover).toFixed(1);
        out += '<line class="zp-cur" x1="' + hx + '" x2="' + hx + '" y1="' + pt + '" y2="' + (pt + ph) + '"/>';
        var acc = 0;
        keys.forEach(function (k) { if (!on[k]) return; acc += cur[k][hover]; out += '<circle class="zp-dot" cx="' + hx + '" cy="' + y(acc).toFixed(1) + '" r="4" stroke="' + COLORS[k] + '"/>' });
      }
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.innerHTML = out;
      svg.__x = x; svg.__s0 = s0; svg.__pl = pl; svg.__pw = pw;
    }

    function animate(ms, withReveal) {
      cancelAnimationFrame(raf);
      var from = {}, w0 = wCur, y0 = yCur, y1 = yTarget(wTgt), r0 = reveal, t0 = performance.now();
      keys.forEach(function (k) { from[k] = cur[k].slice() });
      (function step(now) {
        var k = Math.min(1, (now - t0) / ms), e = ease(k);
        keys.forEach(function (key) { for (var i = 0; i < N; i++) cur[key][i] = from[key][i] + (tgt[key][i] - from[key][i]) * e });
        wCur = w0 + (wTgt - w0) * e; yCur = y0 + (y1 - y0) * e;
        if (withReveal) reveal = r0 + (1 - r0) * ease(Math.min(1, (now - t0) / (ms * 0.9)));
        draw();
        if (k < 1) raf = requestAnimationFrame(step);
      })(t0);
    }

    // подсказка
    function showTip(ev) {
      if (!svg.__x) return;
      var r = svg.getBoundingClientRect(), px = ev.clientX - r.left;
      var i = Math.round(svg.__s0 + (px - svg.__pl) / svg.__pw * (wCur - 1));
      i = Math.max(Math.ceil(svg.__s0), Math.min(N - 1, i));
      if (i !== hover) { hover = i; draw() }
      var rows = keys.filter(function (k) { return on[k] && data.series[k][i] > 0 })
        .sort(function (a, b) { return data.series[b][i] - data.series[a][i] });
      var tot = 0; rows.forEach(function (k) { tot += data.series[k][i] });
      var word = data.source === 'commits' ? plural(tot, 'коммит', 'коммита', 'коммитов') : plural(tot, 'действие', 'действия', 'действий');
      tip.innerHTML = '<h4>' + weekLabel(data.week0 + i * 7 * DAY) + '</h4><p class="zp-tt">' + fmt(tot) + ' <small>' + word + '</small></p>' +
        (rows.length > 1 ? '<ul>' + rows.map(function (k) { return '<li><span><i style="--c:' + COLORS[k] + '"></i>' + data.labels[k] + '</span><b>' + fmt(data.series[k][i]) + '</b></li>' }).join('') + '</ul>' : '');
      tip.hidden = false;
      var tx = svg.__x(i), tw = tip.offsetWidth;
      tip.style.left = Math.max(tw / 2 + 4, Math.min(box.clientWidth - tw / 2 - 4, tx)) + 'px';
    }
    function hideTip() { hover = -1; tip.hidden = true; draw() }
    svg.addEventListener('pointermove', showTip);
    svg.addEventListener('pointerdown', showTip);
    svg.addEventListener('pointerleave', hideTip);

    // легенда
    var legend = document.getElementById('zp-legend');
    if (keys.length > 1) keys.forEach(function (k) {
      var b = document.createElement('button');
      var sum = data.series[k].reduce(function (a, v) { return a + v }, 0);
      b.type = 'button'; b.className = 'zp-lg'; b.style.setProperty('--c', COLORS[k]);
      b.setAttribute('aria-pressed', 'true');
      b.innerHTML = '<i></i>' + data.labels[k] + ' <small>' + short(sum) + '</small>';
      b.addEventListener('click', function () {
        var active = keys.filter(function (q) { return on[q] });
        if (on[k] && active.length === 1) { keys.forEach(function (q) { on[q] = true }) }   // последний — включить всё
        else on[k] = !on[k];
        legend.querySelectorAll('.zp-lg').forEach(function (el, idx) { el.setAttribute('aria-pressed', on[keys[idx]] ? 'true' : 'false') });
        targets(); animate(650);
      });
      legend.appendChild(b);
    });

    // период
    pulse.querySelectorAll('.zp-range button').forEach(function (b) {
      b.addEventListener('click', function () {
        pulse.querySelectorAll('.zp-range button').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false') });
        wTgt = +b.getAttribute('data-w'); animate(750);
      });
    });

    targets();
    yCur = yTarget(52);
    if (window.ResizeObserver) new ResizeObserver(function () { draw() }).observe(box);
    this.play = function () { animate(1400, true) };
    draw();
  }

  if (pulse) loadStats().then(function (data) {
    var totals = data.totals || {};
    pulse.querySelectorAll('dd[data-k]').forEach(function (el) {
      if (totals[el.getAttribute('data-k')] == null) el.closest('.zp-kpi').hidden = true;
    });
    if (data.source !== 'commits') {
      var main = pulse.querySelector('.zp-kpi-main dt'); if (main) main.textContent = 'действий в git за год';
    }
    pulse.hidden = false;
    var chart = new Chart(document.getElementById('zp-chart'), data);
    var started = false;
    function go() {
      if (started) return; started = true;
      pulse.querySelectorAll('[data-k]').forEach(function (el) {
        var v = totals[el.getAttribute('data-k')]; if (v != null) countUp(el, v, 1600);
      });
      chart.play();
    }
    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); go() } }, { threshold: 0.25 });
      io.observe(pulse);
    } else go();
  }).catch(function () {});

  /* ── Музыка: синтезируется на лету через Web Audio, без файлов ──────────
     Медленная часть — тёмный пэд, суб-бас и «сердцебиение», пока РКН душит
     провода. Быстрая — бочка, хэты, бас и арпеджио, когда появляется Запрет-тян. */
  var music = (function () {
    var ctx = null, master = null, noise = null, timer = null;
    var mode = 'slow', step16 = 0, bar = 0, next = 0;
    var CHORDS = [[45, 0], [41, 1], [48, 1], [43, 1]]; // Am F C G

    function hz(m) { return 440 * Math.pow(2, (m - 69) / 12) }
    function tones(c) { return [c[0], c[0] + (c[1] ? 4 : 3), c[0] + 7] }
    function env(g, t, a, peak, d) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    function osc(type, f, t, a, peak, d, cutoff) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (cutoff) { var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; o.connect(lp); lp.connect(g) } else o.connect(g);
      g.connect(master);
      env(g, t, a, peak, d);
      o.start(t); o.stop(t + a + d + 0.05);
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
        if (s === 0) {
          ch.forEach(function (m) {
            osc('sawtooth', hz(m + 12), t, 1.2, 0.045, dur16 * 16, 700);
            osc('sawtooth', hz(m + 12) * 1.004, t, 1.2, 0.03, dur16 * 16, 500);
          });
          osc('sine', hz(c[0] - 12), t, 0.6, 0.22, dur16 * 16, 0);
        }
        if (s === 0 || s === 3) kick(t, s === 0 ? 0.55 : 0.3);
        if (s === 8) osc('triangle', 1760, t, 0.005, 0.045, 0.12, 0);
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
      if (mode === 'end' || ctx.state !== 'running') return;
      var bpm = mode === 'fast' ? 132 : 72, dur16 = 60 / bpm / 4;
      if (next < ctx.currentTime) next = ctx.currentTime + 0.05;
      while (next < ctx.currentTime + 0.12) { tick(next, dur16); next += dur16 }
    }
    function finale() {
      var t = ctx.currentTime + 0.05;
      tones(CHORDS[0]).concat([57]).forEach(function (m) { osc('sawtooth', hz(m + 12), t, 0.05, 0.05, 2.4, 1800) });
      kick(t, 0.6);
    }
    return {
      running: function () { return !!(ctx && ctx.state === 'running') },
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
        var p = ctx.resume();
        mode = m || mode;
        next = ctx.currentTime + 0.05; step16 = 0; bar = 0;
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(0.55, ctx.currentTime, 0.3);
        clearInterval(timer); timer = setInterval(schedule, 25);
        return p;
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
  // длительность слайдов: 6–7 — полёт мимо проектов, 8 — год в цифрах
  var steps = [1800, 2300, 2300, 2700, 3000, 3800, 3300, 4300, 2600];
  var cur = 0, timer = null, running = false, muted = false;
  try { muted = localStorage.getItem('zpm-mute') === '1' } catch (e) {}

  function remember() { try { localStorage.setItem('zpm-intro', '1') } catch (e) {} }
  function musicMode(n) { return n <= 4 ? 'slow' : n <= 8 ? 'fast' : 'end' }

  function warp() {
    var w = intro.querySelector('.zi-warp');
    if (!w || w.childNodes.length) return;
    var out = '';
    for (var i = 0; i < 56; i++) {
      var a = Math.random() * Math.PI * 2, r0 = 60 + Math.random() * 80;
      out += '<line pathLength="1000" x1="' + (Math.cos(a) * r0).toFixed(0) + '" y1="' + (Math.sin(a) * r0).toFixed(0) +
        '" x2="' + (Math.cos(a) * 1000).toFixed(0) + '" y2="' + (Math.sin(a) * 1000).toFixed(0) +
        '" style="--wd:-' + (Math.random() * 1.2).toFixed(2) + 's;--ww:' + (1 + Math.random() * 2).toFixed(1) + '"/>';
    }
    w.innerHTML = out;
  }

  function introStats() {
    loadStats().then(function (d) {
      if (cur !== 8) return;
      var t = d.totals || {};
      intro.querySelectorAll('[data-z]').forEach(function (el) {
        var v = t[el.getAttribute('data-z')];
        if (v == null) el.parentNode.hidden = true; else countUp(el, v, 2200);
      });
      if (d.source === 'commits' && t.commits_year) {
        document.getElementById('zi-st-sub').textContent = fmt(t.commits_year) + ' ' + plural(t.commits_year, 'коммит', 'коммита', 'коммитов') +
          ', ' + fmt(t.releases) + ' ' + plural(t.releases, 'релиз', 'релиза', 'релизов') + ' и ' + short(t.downloads) + ' скачиваний. И это только начало.';
      }
      var svg = intro.querySelector('.zi-st-chart'), W = svg.clientWidth, H = svg.clientHeight;
      if (!W || !H) return;
      var tot = [], k, i, N;
      d.order.forEach(function (key) { var s = d.series[key]; if (!s) return; for (i = 0; i < s.length; i++) tot[i] = (tot[i] || 0) + s[i] });
      N = tot.length;
      var max = Math.max.apply(null, tot.concat([1]));
      var x = function (j) { return j / (N - 1) * W }, y = function (v) { return H - 6 - v / max * (H - 16) };
      var p = 'M0 ' + y(tot[0]).toFixed(1);
      for (k = 1; k < N; k++) { var mx = ((x(k - 1) + x(k)) / 2).toFixed(1); p += ' C' + mx + ' ' + y(tot[k - 1]).toFixed(1) + ' ' + mx + ' ' + y(tot[k]).toFixed(1) + ' ' + x(k).toFixed(1) + ' ' + y(tot[k]).toFixed(1) }
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      var line = svg.querySelector('.zi-st-line'), area = svg.querySelector('.zi-st-area');
      line.setAttribute('d', p); area.setAttribute('d', p + ' L' + W + ' ' + H + ' L0 ' + H + ' Z');
      var len = line.getTotalLength();
      line.style.transition = 'none'; line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
      area.style.transition = 'none'; area.style.opacity = 0;
      line.getBoundingClientRect();
      line.style.transition = 'stroke-dashoffset 2.6s cubic-bezier(.3,0,.2,1)'; line.style.strokeDashoffset = 0;
      area.style.transition = 'opacity 1.6s .9s'; area.style.opacity = 1;
    }).catch(function () {});
  }

  function finish() {
    if (!running) return;
    running = false;
    clearTimeout(timer);
    remember();
    music.stop(1.2);
    intro.classList.add('zi-out');
    document.removeEventListener('keydown', onKey);
    root.classList.remove('zpm-intro-lock');
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
    music.mode(musicMode(n));
    if (n === 8) introStats();
    timer = setTimeout(function () { go(n + 1) }, steps[n - 1]);
  }

  // Звук включён по умолчанию. Если браузер не дал запустить его без касания,
  // первое касание включает звук и не перелистывает слайд.
  function unlockSound() {
    if (muted || music.running()) return false;
    music.start(musicMode(cur));
    intro.classList.remove('zi-snd-wait');
    return true;
  }
  function syncSoundUi() {
    intro.classList.toggle('zi-muted', muted);
    setTimeout(function () { if (running) intro.classList.toggle('zi-snd-wait', !muted && !music.running()) }, 250);
  }

  function onKey(e) {
    if (e.key === 'Escape') return finish();
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); unlockSound(); go(cur + 1) }
  }

  function start() {
    var scene = intro.querySelector('.zi-scene');
    if (scene) scene.setAttribute('viewBox', innerWidth < innerHeight * 0.9 ? '420 20 760 700' : '0 0 1600 900');
    warp();
    loadStats().catch(function () {});
    intro.className = 'zi';
    root.classList.add('zpm-intro-on', 'zpm-intro-lock');
    void intro.offsetWidth; // перезапуск CSS-анимаций при повторном показе
    intro.classList.add('zi-run');
    running = true;
    document.addEventListener('keydown', onKey);
    go(1);
    if (!muted) music.start('slow');
    syncSoundUi();
  }

  if (intro) {
    intro.addEventListener('click', function (e) {
      if (e.target.closest('.zi-skip')) return finish();
      if (e.target.closest('.zi-sound')) {
        if (muted || !music.running()) { muted = false; music.start(musicMode(cur)) }
        else { muted = true; music.stop(0.3) }
        try { localStorage.setItem('zpm-mute', muted ? '1' : '0') } catch (err) {}
        syncSoundUi();
        return;
      }
      if (intro.classList.contains('zi-snd-wait') && unlockSound()) return;
      go(cur + 1);
    });
    if (root.classList.contains('zpm-intro-on')) start();
    else if (replay) replay.hidden = false;
    if (replay) replay.addEventListener('click', function () { window.scrollTo(0, 0); start() });
  }
})();
