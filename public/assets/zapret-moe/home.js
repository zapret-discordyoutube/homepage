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
     Интернет — тревожный пэд. РКН-тян — хоррор: гул в тритон, «браам»,
     сердцебиение, скрежет. Запрет-тян — нарастание и барабаны.
     Финал — медная тема «ту-ду ту-ту-ту ду-ду-ду» в ре мажоре: мы справились. */
  var music = (function () {
    var ctx = null, master = null, wet = null, noise = null, loop = null;
    var mode = 'calm', held = [], next = 0, beat = 0, startId = 0;

    function hz(m) { return 440 * Math.pow(2, (m - 69) / 12) }
    function now() { return ctx.currentTime }

    function out(node, rev) {
      node.connect(master);
      if (rev) { var s = ctx.createGain(); s.gain.value = rev; node.connect(s); s.connect(wet) }
    }
    // голос: несколько расстроенных пил через фильтр — струнные, медь, пэды
    function voice(o) {
      var t = o.t, g = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.Q.value = o.q || 0.7;
      f.frequency.setValueAtTime(o.cut || 1200, t);
      if (o.cutTo) f.frequency.linearRampToValueAtTime(o.cutTo, t + (o.cutAt || o.a || 0.1));
      if (o.cutEnd) f.frequency.linearRampToValueAtTime(o.cutEnd, t + o.dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(o.vol, t + (o.a || 0.05));
      if (!o.hold) {
        g.gain.setValueAtTime(o.vol, t + Math.max(o.a || 0.05, o.dur - (o.r || 0.3)));
        g.gain.linearRampToValueAtTime(0.0001, t + o.dur);
      }
      f.connect(g); out(g, o.rev == null ? 0.35 : o.rev);
      var oscs = (o.det || [-7, 7]).map(function (c) {
        var s = ctx.createOscillator(); s.type = o.type || 'sawtooth';
        s.frequency.setValueAtTime(o.f, t); s.detune.value = c;
        if (o.glide) s.frequency.exponentialRampToValueAtTime(o.glide, t + o.dur);
        if (o.vib) {
          var l = ctx.createOscillator(), lg = ctx.createGain();
          l.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(o.vib, t + 0.25);
          l.connect(lg); lg.connect(s.detune); l.start(t); l.stop(t + o.dur + 0.1);
        }
        s.connect(f); s.start(t); if (!o.hold) s.stop(t + o.dur + 0.05);
        return s;
      });
      return { g: g, oscs: oscs };
    }
    function release(v, sec) {
      var t = now();
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(v.g.gain.value, t);
      v.g.gain.linearRampToValueAtTime(0.0001, t + sec);
      v.oscs.forEach(function (s) { s.stop(t + sec + 0.05) });
    }
    function hiss(t, type, f0, f1, vol, dur, q, rev) {
      var s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise; s.loop = true; fl.type = type; fl.Q.value = q || 0.8;
      fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      s.connect(fl); fl.connect(g); out(g, rev == null ? 0.4 : rev);
      s.start(t); s.stop(t + dur + 0.05);
    }
    // удар: тайко/литавра — синус с падением высоты и шумовая «кожа»
    function boom(t, vol, f) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(f || 90, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g); out(g, 0.3); o.start(t); o.stop(t + 1.2);
      var s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), ng = ctx.createGain();
      s.buffer = noise; fl.type = 'lowpass'; fl.frequency.value = 700;
      ng.gain.setValueAtTime(vol * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      s.connect(fl); fl.connect(ng); out(ng, 0.3); s.start(t); s.stop(t + 0.3);
    }
    function heart(t) {
      [0, 0.28].forEach(function (d, i) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(70, t + d); o.frequency.exponentialRampToValueAtTime(40, t + d + 0.15);
        g.gain.setValueAtTime(i ? 0.35 : 0.5, t + d); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.3);
        o.connect(g); out(g, 0.1); o.start(t + d); o.stop(t + d + 0.35);
      });
    }
    // «браам» — низкая медь с раскрывающимся фильтром, как в трейлерах
    function braam(t, vol) {
      [26, 38, 45].forEach(function (m, i) {
        voice({ t: t, f: hz(m), dur: 3.2, a: 0.08, r: 1.4, vol: (vol || 0.22) / (i + 1), cut: 120, cutTo: 1600, cutAt: 0.5, cutEnd: 180, det: [-12, 0, 12], rev: 0.5 });
      });
      voice({ t: t, f: hz(26), dur: 3, a: 0.05, r: 1.2, vol: 0.3, type: 'sine', det: [0], cut: 400, rev: 0.1 });
      boom(t, 0.6, 70);
    }
    function scrape(t) { hiss(t, 'bandpass', 3200, 700, 0.12, 1.6, 14, 0.6) }

    function stopHeld(sec) { held.forEach(function (v) { release(v, sec || 1.2) }); held = [] }

    function enter(m) {
      var t = now() + 0.05;
      stopHeld(m === 'triumph' ? 0.6 : 1.4);
      if (m === 'calm') {
        [50, 53, 57, 64].forEach(function (n) { held.push(voice({ t: t, f: hz(n), a: 1.6, vol: 0.05, cut: 900, hold: 1, det: [-8, 8], rev: 0.6 })) });
      }
      if (m === 'horror') {
        braam(t, 0.26);
        held.push(voice({ t: t, f: hz(26), a: 2, vol: 0.12, cut: 260, hold: 1, det: [-10, 10] }));
        held.push(voice({ t: t, f: hz(32), a: 2.5, vol: 0.07, cut: 300, hold: 1, det: [-14, 14] }));      // тритон
        held.push(voice({ t: t + 0.8, f: hz(74), a: 2.5, vol: 0.018, cut: 3000, hold: 1, det: [-4, 4], rev: 0.8 }));
        held.push(voice({ t: t + 0.8, f: hz(75), a: 2.5, vol: 0.015, cut: 3000, hold: 1, det: [-4, 4], rev: 0.8 })); // кластер полутоном
      }
      if (m === 'rise') {
        hiss(t, 'highpass', 200, 9000, 0.3, 1.7, 1, 0.3);
        voice({ t: t, f: hz(38), glide: hz(74), dur: 1.7, a: 1.4, r: 0.1, vol: 0.12, cut: 600, cutTo: 5000, cutAt: 1.6 });
      }
      if (m === 'drive') {
        boom(t, 0.9, 100); braam(t, 0.12);
        [38, 50, 53, 57].forEach(function (n) { held.push(voice({ t: t, f: hz(n), a: 0.8, vol: 0.05, cut: 1400, hold: 1, rev: 0.5 })) });
        next = t + 0.3; beat = 0;
      }
      if (m === 'triumph') triumph(t);
    }

    // полёт: барабаны и остинато баса, 100 ударов в минуту
    function tickDrive() {
      var s8 = 60 / 100 / 2;
      while (next < now() + 0.15) {
        var b = beat % 16, t = next;
        if (b === 0 || b === 3 || b === 6 || b === 8 || b === 11 || b === 14) boom(t, b === 0 || b === 8 ? 0.7 : 0.4, b % 8 ? 120 : 90);
        if (b % 2 === 1) hiss(t, 'highpass', 6000, 7000, 0.05, 0.08, 1, 0.1);
        var bass = [38, 38, 41, 38, 36, 38, 45, 38][b % 8];
        voice({ t: t, f: hz(bass), dur: s8 * 0.9, a: 0.01, r: 0.1, vol: 0.14, cut: 500, cutTo: 900, cutAt: 0.02, cutEnd: 300, rev: 0.1 });
        next += s8; beat++;
      }
    }
    function tickHorror() {
      while (next < now() + 0.15) {
        var t = next;
        heart(t);
        if (beat % 3 === 2) scrape(t + 0.6);
        if (beat % 2 === 1) voice({ t: t + 0.9, f: hz(86), dur: 0.5, a: 0.005, r: 0.45, vol: 0.02, type: 'sine', det: [0], cut: 8000, rev: 0.9 });
        next += 1.6; beat++;
      }
    }

    // финал: «ту-ду ту-ту-ту ду-ду-ду»
    function triumph(t) {
      var q = 0.36;
      boom(t, 1, 80); hiss(t, 'highpass', 5000, 9000, 0.12, 2.6, 0.7, 0.6);
      [50, 54, 57].forEach(function (n) { voice({ t: t, f: hz(n), dur: 1.9, a: 0.04, r: 0.6, vol: 0.07, cut: 500, cutTo: 2400, cutAt: 0.08, cutEnd: 1100, vib: 6 }) });
      var mel = [[62, 0, 1], [69, 1, 1], [66, 2, 1 / 3], [67, 2 + 1 / 3, 1 / 3], [69, 2 + 2 / 3, 1 / 3], [74, 3, 1], [73, 4, 1], [74, 5, 3.5]];
      mel.forEach(function (n) {
        voice({ t: t + n[1] * q, f: hz(n[0]), dur: n[2] * q * 0.95 + (n[2] > 1 ? 0.6 : 0), a: 0.03, r: n[2] > 1 ? 0.9 : 0.08, vol: 0.11, cut: 700, cutTo: 3200, cutAt: 0.06, cutEnd: 1500, vib: n[2] > 1 ? 10 : 0, rev: 0.45 });
      });
      boom(t + 3 * q, 0.6, 90);
      [43, 47, 50].forEach(function (n) { voice({ t: t + 3 * q, f: hz(n), dur: 0.8, a: 0.04, r: 0.3, vol: 0.06, cut: 600, cutTo: 2200, cutAt: 0.08 }) });
      boom(t + 5 * q, 1, 70); braam(t + 5 * q, 0.1);
      [38, 50, 54, 57, 62].forEach(function (n) { voice({ t: t + 5 * q, f: hz(n), dur: 2.6, a: 0.05, r: 1.4, vol: 0.06, cut: 600, cutTo: 2600, cutAt: 0.1, cutEnd: 900, vib: 8 }) });
    }

    function run() {
      clearInterval(loop);
      loop = setInterval(function () {
        if (!ctx || ctx.state !== 'running') return;
        if (mode === 'drive') tickDrive();
        else if (mode === 'horror') tickHorror();
      }, 40);
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
          // реверберация: свёртка со сгенерированным хвостом в 3 секунды
          var len = ctx.sampleRate * 3, ir = ctx.createBuffer(2, len, ctx.sampleRate);
          for (var ch = 0; ch < 2; ch++) { var d = ir.getChannelData(ch); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3) }
          var conv = ctx.createConvolver(); conv.buffer = ir;
          wet = ctx.createGain(); wet.gain.value = 0.8; wet.connect(conv); conv.connect(master);
          noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
          var nd = noise.getChannelData(0);
          for (var j = 0; j < nd.length; j++) nd[j] = Math.random() * 2 - 1;
        }
        var p = ctx.resume();
        mode = m || mode;
        master.gain.cancelScheduledValues(now());
        master.gain.setTargetAtTime(0.7, now(), 0.3);
        var id = ++startId;
        var go = function () { if (id !== startId) return; next = now() + 0.1; beat = 0; enter(mode); run() };
        if (ctx.state === 'running') go(); else if (p && p.then) p.then(go);
        return p;
      },
      mode: function (m) {
        if (m === mode) return;
        mode = m;
        if (!ctx || ctx.state !== 'running') return;
        next = now() + 0.1; beat = 0;
        enter(m);
      },
      stop: function (fade) {
        if (!ctx) return;
        clearInterval(loop);
        stopHeld(fade || 0.4);
        master.gain.cancelScheduledValues(now());
        master.gain.setTargetAtTime(0.0001, now(), (fade || 0.4) / 3);
        setTimeout(function () { if (ctx) ctx.suspend() }, (fade || 0.4) * 1000 + 300);
      }
    };
  })();

  /* ── Заставка-презентация ─────────────────────────────────────────────── */
  var intro = document.getElementById('zpm-intro');
  var replay = document.getElementById('zpm-replay');
  // длительность слайдов: 6–7 — полёт мимо проектов, 8 — год в цифрах
  var steps = [2200, 2600, 2400, 2800, 3000, 3800, 3300, 4300, 3900];
  var cur = 0, timer = null, running = false, muted = false;
  try { muted = localStorage.getItem('zpm-mute') === '1' } catch (e) {}

  function remember() { try { localStorage.setItem('zpm-intro', '1') } catch (e) {} }
  function musicMode(n) { return n === 1 ? 'calm' : n <= 4 ? 'horror' : n === 5 ? 'rise' : n <= 8 ? 'drive' : 'triumph' }

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

  // слой с персонажами повторяет масштаб и сдвиг SVG-сцены (preserveAspectRatio: meet)
  function layout() {
    var scene = intro.querySelector('.zi-scene'), stage = intro.querySelector('.zi-stage');
    var vb = innerWidth < innerHeight * 0.9 ? [420, 20, 760, 700] : [0, 0, 1600, 900];
    if (scene) scene.setAttribute('viewBox', vb.join(' '));
    if (!stage) return;
    var W = innerWidth, H = innerHeight, s = Math.min(W / vb[2], H / vb[3]);
    stage.style.setProperty('--rx', ((W - vb[2] * s) / 2 - vb[0] * s) + 'px');
    stage.style.setProperty('--ry', ((H - vb[3] * s) / 2 - vb[1] * s) + 'px');
    stage.style.setProperty('--rw', (1600 * s) + 'px');
  }

  function start() {
    layout();
    intro.querySelectorAll('.zi-stage img, .zi-hero img').forEach(function (im) { im.loading = 'eager' });
    warp();
    loadStats().catch(function () {});
    intro.className = 'zi';
    root.classList.add('zpm-intro-on', 'zpm-intro-lock');
    void intro.offsetWidth; // перезапуск CSS-анимаций при повторном показе
    intro.classList.add('zi-run');
    running = true;
    document.addEventListener('keydown', onKey);
    go(1);
    if (!muted) music.start('calm');
    syncSoundUi();
  }

  window.addEventListener('resize', function () { if (running) layout() });

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

  /* ── Дуэль на главной: персонажи выплывают с боков ─────────────────── */
  var duel = document.getElementById('zpm-duel');
  if (duel && window.IntersectionObserver && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    duel.classList.add('zd-js');
    var dio = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { duel.classList.add('zd-on'); dio.disconnect() }
    }, { threshold: 0.2 });
    dio.observe(duel);
  }
})();
