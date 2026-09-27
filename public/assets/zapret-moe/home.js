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

  /* ── Музыка: саундтрек заставки, синтезируется Web Audio, без файлов ────
     У каждого слайда своя фраза длиной ровно в слайд (ре минор → ре мажор):
     1 шкатулка · 2 «браам» и диссонанс РКН-тян · 3 сканер и сердцебиение ·
     4 нарастание · 5 удар и призыв валторн · 6–7 полёт: тайко, остинато ·
     8 дробь и подъём · 9 медная тема «ту-ду ту-ту-ту ду-ду-ду».
     makeMusic(ctx) работает и с OfflineAudioContext — так саундтрек можно
     отрендерить в файл целиком.                                             */
  function makeMusic(ctxArg) {
    var ctx = ctxArg || null, master = null, rev = null, noise = null, bus = null;

    function hz(m) { return 440 * Math.pow(2, (m - 69) / 12) }

    function init() {
      if (!ctx) { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false; ctx = new AC() }
      if (master) return true;
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
      var lim = ctx.createDynamicsCompressor();   // лимитер против клиппинга
      lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.1;
      master = ctx.createGain(); master.gain.value = 0.7;
      master.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
      var sr = ctx.sampleRate, len = Math.floor(sr * 3.6), ir = ctx.createBuffer(2, len, sr);
      for (var ch = 0; ch < 2; ch++) {
        var d = ir.getChannelData(ch), pre = Math.floor(sr * 0.02);
        for (var i = pre; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - (i - pre) / (len - pre), 2.6);
      }
      var conv = ctx.createConvolver(); conv.buffer = ir;
      var damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 5200;
      rev = ctx.createGain(); rev.gain.value = 0.55;
      rev.connect(damp); damp.connect(conv); conv.connect(master);
      noise = ctx.createBuffer(1, sr * 2, sr);
      var nd = noise.getChannelData(0);
      for (var j = 0; j < nd.length; j++) nd[j] = Math.random() * 2 - 1;
      return true;
    }

    // шина сцены: всё, что звучит в слайде, идёт через неё, чтобы сцену можно было погасить
    function newBus(t, fadeOld) {
      if (bus) {
        var old = bus;
        old.gain.cancelScheduledValues(t);
        old.gain.setValueAtTime(old.gain.value, t);
        old.gain.linearRampToValueAtTime(0.0001, t + fadeOld);
        if (!(window.OfflineAudioContext && ctx instanceof OfflineAudioContext)) setTimeout(function () { try { old.disconnect() } catch (e) {} }, (fadeOld + 4) * 1000);
      }
      bus = ctx.createGain(); bus.gain.value = 1;
      bus.connect(master);
      bus._dry = master;
      return bus;
    }
    function to(node, wet) {
      var g = ctx.createGain(); g.gain.value = 1; node.connect(g); g.connect(bus._dry ? bus : master);
      if (wet) { var w = ctx.createGain(); w.gain.value = wet; node.connect(w); w.connect(rev) }
    }

    /* инструменты */
    function tone(o) {
      var t = Math.max(o.t, ctx.currentTime), dur = o.dur, g = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = o.ft || 'lowpass'; f.Q.value = o.q || 0.7;
      f.frequency.setValueAtTime(o.cut || 2000, t);
      if (o.cutTo) { f.frequency.linearRampToValueAtTime(o.cutTo, t + (o.cutAt || 0.08)); f.frequency.linearRampToValueAtTime(o.cutEnd || o.cutTo, t + dur) }
      var a = o.a || 0.02, r = Math.min(o.r || 0.2, dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(o.vol, t + a);
      if (o.sus != null) g.gain.linearRampToValueAtTime(o.vol * o.sus, t + a + (o.dec || 0.2));
      g.gain.setValueAtTime(o.vol * (o.sus != null ? o.sus : 1), t + Math.max(a, dur - r));
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      if (o.trem) {
        var tl = ctx.createOscillator(), tg = ctx.createGain(), tm = ctx.createGain();
        tl.frequency.value = o.trem; tg.gain.value = 0.5; tl.connect(tg); tm.gain.value = 0.5; tg.connect(tm.gain);
        f.connect(tm); tm.connect(g); tl.start(t); tl.stop(t + dur + 0.05);
      } else f.connect(g);
      to(g, o.wet == null ? 0.3 : o.wet);
      (o.det || [0]).forEach(function (c) {
        var s = ctx.createOscillator(); s.type = o.type || 'sawtooth';
        s.frequency.setValueAtTime(o.f * (o.bend ? 0.97 : 1), t);
        if (o.bend) s.frequency.exponentialRampToValueAtTime(o.f, t + 0.06);
        if (o.glide) s.frequency.exponentialRampToValueAtTime(o.glide, t + dur);
        s.detune.value = c;
        if (o.vib) {
          var l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.2;
          lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(o.vib, t + Math.min(0.35, dur));
          l.connect(lg); lg.connect(s.detune); l.start(t); l.stop(t + dur + 0.05);
        }
        s.connect(f); s.start(t); s.stop(t + dur + 0.05);
      });
    }
    function brass(t, m, dur, vol) {
      tone({ t: t, f: hz(m), dur: dur, a: 0.04, r: Math.min(0.35, dur * 0.5), vol: vol || 0.09, det: [-9, 0, 9], cut: 500, cutTo: 3400, cutAt: 0.07, cutEnd: 1500, bend: 1, vib: dur > 0.6 ? 12 : 0, wet: 0.35 });
      tone({ t: t, f: hz(m - 12), dur: dur, a: 0.05, r: 0.3, vol: (vol || 0.09) * 0.45, det: [-6, 6], cut: 900, wet: 0.3 });
    }
    function strings(t, m, dur, vol, o) {
      o = o || {};
      tone({ t: t, f: hz(m), dur: dur, a: o.a || 0.5, r: o.r || 0.8, vol: vol, det: [-16, -8, 0, 8, 16], cut: o.cut || 2400, trem: o.trem, wet: 0.5 });
    }
    function choir(t, m, dur, vol) {
      [730, 1090, 2440].forEach(function (fm, i) {
        tone({ t: t, f: hz(m), dur: dur, a: 0.8, r: 1, vol: vol * [1, 0.6, 0.25][i], det: [-10, 0, 10], ft: 'bandpass', cut: fm, q: 6, vib: 8, wet: 0.7 });
      });
    }
    function box(t, m, vol) {  // музыкальная шкатулка
      tone({ t: t, f: hz(m), dur: 1.4, a: 0.004, r: 1.3, vol: vol || 0.06, type: 'sine', cut: 8000, wet: 0.6 });
      tone({ t: t, f: hz(m) * 3.01, dur: 0.5, a: 0.002, r: 0.45, vol: (vol || 0.06) * 0.25, type: 'sine', cut: 9000, wet: 0.6 });
    }
    function hiss(t, dur, type, f0, f1, vol, q, wet, shape) {
      if (t < ctx.currentTime) { dur -= ctx.currentTime - t; t = ctx.currentTime; if (dur < 0.05) return }
      var s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise; s.loop = true; fl.type = type; fl.Q.value = q || 0.8;
      fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      if (shape === 'swell') { g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.95); g.gain.linearRampToValueAtTime(0.0001, t + dur) }
      else { g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur) }
      s.connect(fl); fl.connect(g); to(g, wet == null ? 0.3 : wet);
      s.start(t); s.stop(t + dur + 0.05);
    }
    function drum(t, vol, f0, f1, len) {  // тайко / литавра
      t = Math.max(t, ctx.currentTime);
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(f0 || 110, t); o.frequency.exponentialRampToValueAtTime(f1 || 42, t + (len || 0.45));
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (len || 0.45) * 2.2);
      o.connect(g); to(g, 0.25); o.start(t); o.stop(t + (len || 0.45) * 2.3);
      hiss(t, 0.18, 'lowpass', 900, 300, vol * 0.45, 0.7, 0.25);
    }
    function snare(t, vol) { hiss(t, 0.16, 'bandpass', 2200, 1600, vol, 1.1, 0.25); tone({ t: t, f: 190, dur: 0.08, a: 0.002, r: 0.07, vol: vol * 0.5, type: 'triangle', cut: 3000, wet: 0.1 }) }
    function crash(t, vol, len) { hiss(t, len || 2.4, 'highpass', 5000, 7000, vol, 0.5, 0.6) }
    function subdrop(t, vol) { tone({ t: t, f: 90, glide: 28, dur: 1.6, a: 0.01, r: 1.2, vol: vol, type: 'sine', cut: 400, wet: 0.1 }) }
    function braam(t, vol) {
      [26, 38, 45, 50].forEach(function (m, i) {
        tone({ t: t, f: hz(m), dur: 2.6, a: 0.05, r: 1.5, vol: vol / (1 + i * 0.6), det: [-14, -5, 5, 14], cut: 110, cutTo: 1300, cutAt: 0.45, cutEnd: 160, q: 2, wet: 0.5 });
      });
      subdrop(t, vol * 1.2); drum(t, vol * 2.4, 80, 32, 0.6);
    }
    function heart(t, vol) { drum(t, vol, 70, 38, 0.12); drum(t + 0.26, vol * 0.7, 66, 36, 0.12) }
    function ping(t, m, vol) { tone({ t: t, f: hz(m), dur: 0.35, a: 0.002, r: 0.33, vol: vol, type: 'sine', cut: 9000, wet: 0.8 }) }

    /* сцены: n — номер слайда, t — начало, D — длительность */
    var CH = { Dm: [50, 53, 57], Bb: [46, 50, 53], F: [53, 57, 60], C: [48, 52, 55], Gm: [55, 58, 62], A: [45, 49, 52], D: [50, 54, 57] };
    function scene(n, t, D) {
      var i, k, b;
      if (n === 1) {                                        // жил-был интернет
        [50, 57, 62, 65].forEach(function (m) { strings(t, m, D + 1.2, 0.032, { a: 0.9, r: 1.2, cut: 1600 }) });
        var mel = [74, 77, 81, 79, 77, 76, 74, 69];
        for (i = 0; i < mel.length; i++) { if (i * 0.26 < D - 0.1) box(t + 0.1 + i * 0.26, mel[i], 0.08) }
      }
      if (n === 2) {                                        // РКН-тян
        hiss(t - 0.9, 0.9, 'highpass', 1500, 7000, 0.12, 0.7, 0.3, 'swell');
        braam(t, 0.12);
        [38, 39, 44].forEach(function (m) { strings(t + 0.3, m + 12, D + 1.5, 0.03, { a: 1.2, trem: 11, cut: 1400 }) });
        choir(t + 0.6, 62, D, 0.03); choir(t + 0.6, 63, D, 0.025);
        heart(t + 0.9, 0.3); if (D > 2.2) heart(t + 2, 0.3);
      }
      if (n === 3) {                                        // смотрит в каждый пакет
        for (k = 0; k * 0.3 < D; k++) { ping(t + k * 0.3, k % 4 === 3 ? 87 : 86, 0.018); tone({ t: t + k * 0.3, f: hz(k % 2 ? 39 : 38), dur: 0.28, a: 0.01, r: 0.2, vol: 0.12, det: [-6, 6], cut: 500, wet: 0.2 }) }
        for (k = 0; k * 0.8 < D; k++) heart(t + k * 0.8, 0.45);
        hiss(t + 0.4, 1.3, 'bandpass', 3400, 700, 0.07, 14, 0.6);
        strings(t, 51, D + 1, 0.04, { a: 0.4, trem: 13, cut: 1800 }); strings(t, 50, D + 1, 0.045, { a: 0.4, trem: 13, cut: 1800 });
      }
      if (n === 4) {                                        // хитрый пакет: нарастание
        tone({ t: t, f: hz(38), glide: hz(62), dur: D, a: D * 0.8, r: 0.1, vol: 0.1, det: [-12, 0, 12], cut: 500, cutTo: 4000, cutAt: D, wet: 0.4 });
        hiss(t, D, 'highpass', 300, 9000, 0.22, 0.9, 0.3, 'swell');
        for (k = 0; k < 8; k++) snare(t + D - 0.8 + k * 0.1, 0.05 + k * 0.02);
        for (k = 0; k * 0.4 < D - 0.9; k++) heart(t + k * 0.4, 0.4 + k * 0.03);
      }
      if (n === 5) {                                        // Запрет-тян
        drum(t, 0.9, 120, 40, 0.5); crash(t, 0.14, 2.6); subdrop(t, 0.25);
        for (k = 0; k < 6; k++) tone({ t: t + 0.15 + k * 0.06, f: hz(62 + (k % 2) * 13), dur: 0.05, a: 0.002, r: 0.04, vol: 0.05, type: 'square', cut: 3000, wet: 0.2 }); // глитч РКН
        brass(t + 0.55, 62, 0.45, 0.1); brass(t + 1.0, 69, 1.3, 0.11);  // ту-ду!
        brass(t + 1.0, 62, 1.3, 0.06);
        CH.Dm.forEach(function (m) { strings(t + 0.5, m + 12, D, 0.03, { a: 0.6 }) });
        drum(t + 1.0, 0.6, 100, 45, 0.4);
      }
      if (n === 6 || n === 7) {                             // полёт
        var bpm = 112, s16 = 60 / bpm / 4, prog = n === 6 ? ['Dm', 'Bb', 'F', 'C'] : ['Dm', 'Bb', 'Gm', 'A'];
        var bar = s16 * 16, half = bar / 2;
        for (k = 0; k * s16 < D; k++) {
          var tt = t + k * s16, st = k % 16, ch = CH[prog[Math.floor(k * s16 / half) % 4]];
          if (st === 0 || st === 6 || st === 8 || st === 11 || st === 14) drum(tt, st === 0 || st === 8 ? 0.6 : 0.35, st % 8 ? 130 : 95, 45, 0.35);
          if (st === 4 || st === 12) snare(tt, 0.12);
          if (st % 2 === 0) hiss(tt, 0.05, 'highpass', 7000, 8000, 0.03, 1, 0.1);
          if (st % 2 === 0) tone({ t: tt, f: hz(ch[0] - 12 + (st === 14 ? 12 : 0)), dur: s16 * 1.8, a: 0.005, r: 0.08, vol: 0.12, det: [-8, 8], cut: 600, cutTo: 1100, cutAt: 0.02, cutEnd: 400, wet: 0.1 });
          tone({ t: tt, f: hz(ch[st % 3] + 12), dur: s16 * 0.9, a: 0.005, r: s16 * 0.6, vol: 0.022, det: [-10, 10], cut: 2600, wet: 0.35 }); // струнное остинато
          if (k % 8 === 0) ch.forEach(function (m) { strings(tt, m + 12, half + 0.2, 0.022, { a: 0.15, r: 0.3 }) });
        }
        if (n === 6) { brass(t + 0.1, 62, 0.9, 0.08); brass(t + 1.1, 65, 0.4, 0.07); brass(t + 1.55, 69, 1.4, 0.08) }
        else { brass(t + 0.1, 74, 0.5, 0.07); brass(t + 0.65, 72, 0.5, 0.07); brass(t + 1.2, 70, 0.9, 0.07); brass(t + 2.2, 69, 1.0, 0.08) }
        choir(t, 62, D, 0.02);
      }
      if (n === 8) {                                        // наш год в цифрах
        var roll = Math.floor((D - 0.4) / 0.07);
        for (k = 0; k < roll; k++) snare(t + k * 0.07, 0.02 + 0.1 * k / roll);
        ['Bb', 'C'].forEach(function (c, j) {
          CH[c].forEach(function (m) { strings(t + j * D / 2, m + 12, D / 2 + 0.4, 0.03, { a: 0.3, r: 0.4 }); brass(t + j * D / 2, m, D / 2, 0.035) });
          drum(t + j * D / 2, 0.55, 100, 45, 0.5);
        });
        hiss(t + D * 0.5, D * 0.5, 'highpass', 800, 9000, 0.12, 0.8, 0.3, 'swell');
      }
      if (n === 9) {                                        // мы справились
        var q = 0.34;
        drum(t, 1, 90, 38, 0.6); crash(t, 0.18, 3.5);
        var mel = [[62, 0, 1], [69, 1, 1], [66, 2, 1 / 3], [67, 2 + 1 / 3, 1 / 3], [69, 2 + 2 / 3, 1 / 3], [74, 3, 2.2]];
        mel.forEach(function (x) { brass(t + x[1] * q, x[0], x[2] * q * 0.95 + (x[2] > 1 ? 0.9 : 0), 0.12) });
        mel.forEach(function (x) { brass(t + x[1] * q, x[0] - 12, x[2] * q * 0.95 + (x[2] > 1 ? 0.9 : 0), 0.05) });
        [[0, 'D'], [2, 'Bb'], [3, 'D']].forEach(function (c) {
          CH[c[1]].forEach(function (m) { strings(t + c[0] * q, m + 12, (c[0] === 3 ? 3 : 1) * q + 0.6, 0.035, { a: 0.08, r: 0.6 }) });
        });
        for (k = 0; k < 6; k++) drum(t + 3 * q - 0.3 + k * 0.05, 0.12 + k * 0.05, 90, 45, 0.12);
        drum(t + 3 * q, 1, 80, 34, 0.7); crash(t + 3 * q, 0.2, 3.5);
        CH.D.concat([62, 66, 69]).forEach(function (m) { brass(t + 3 * q, m, 2.6, 0.045) });
        choir(t + 3 * q, 66, 2.8, 0.04); choir(t + 3 * q, 69, 2.8, 0.03);
      }
    }

    var cur = 0, on = false;
    return {
      ctx: function () { return ctx },
      running: function () { return !!(ctx && ctx.state === 'running' && on) },
      // запустить сцену n сразу (прошлая плавно гаснет)
      play: function (n, dur, when) {
        if (!init()) return;
        var t = when != null ? when : ctx.currentTime + 0.03;
        newBus(t, n === cur + 1 ? 0.6 : 0.15);
        cur = n; scene(n, t, dur);
      },
      start: function (n, dur) {
        if (!init()) return false;
        on = true;
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(0.7, ctx.currentTime);
        var self = this, p = ctx.resume && ctx.resume();
        var go = function () { if (on) self.play(n, dur) };
        if (ctx.state === 'running') go(); else if (p && p.then) p.then(go);
        return p;
      },
      stop: function (fade) {
        on = false;
        if (!ctx || !master) return;
        var t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(0.0001, t + (fade || 0.4));
        setTimeout(function () { if (!on && ctx && ctx.suspend) ctx.suspend() }, (fade || 0.4) * 1000 + 300);
      }
    };
  }
  window.zpmMakeMusic = makeMusic;   // для рендера саундтрека в файл
  var music = makeMusic();

  /* ── Заставка-презентация ─────────────────────────────────────────────── */
  var intro = document.getElementById('zpm-intro');
  var replay = document.getElementById('zpm-replay');
  // длительность слайдов: 6–7 — полёт мимо проектов, 8 — год в цифрах
  var steps = [2200, 2800, 3600, 4200, 3200, 9000, 5600, 4300, 3900];
  var cur = 0, timer = null, running = false, muted = false;
  try { muted = localStorage.getItem('zpm-mute') === '1' } catch (e) {}

  function remember() { try { localStorage.setItem('zpm-intro', '1') } catch (e) {} }
  function sceneLen(n) { return steps[n - 1] / 1000 }

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
    if (music.running()) music.play(n, sceneLen(n));
    if (n === 8) introStats();
    timer = setTimeout(function () { go(n + 1) }, steps[n - 1]);
  }

  // Звук включён по умолчанию. Если браузер не дал запустить его без касания,
  // первое касание включает звук и не перелистывает слайд.
  function unlockSound() {
    if (muted || music.running()) return false;
    music.start(cur, sceneLen(cur));
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
    if (!muted) music.start(1, sceneLen(1));
    syncSoundUi();
  }

  window.addEventListener('resize', function () { if (running) layout() });

  if (intro) {
    intro.addEventListener('click', function (e) {
      if (e.target.closest('.zi-skip')) return finish();
      if (e.target.closest('.zi-sound')) {
        if (muted || !music.running()) { muted = false; music.start(cur, sceneLen(cur)) }
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
      if (es[0].isIntersecting) { duel.classList.add('zd-on'); duel._onAt = performance.now(); dio.disconnect() }
    }, { threshold: 0.2 });
    dio.observe(duel);
  }

  /* ── Появление блоков при прокрутке ─────────────────────────────────── */
  (function () {
    if (!window.IntersectionObserver || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var groups = [
      ['.zsec-head', ''], ['.zp-kpi', 'rv-pop'], ['.zp-panel', ''], ['.zc', 'rv-card'],
      ['.zt-list li', 'rv-side'], ['.zbox', 'rv-drop'], ['.zfd', ''], ['.zci-term', 'rv-card'], ['.zci-hash', 'rv-card'],
      ['.zci-points > div', ''], ['.zj-help', 'rv-card'], ['.zj-join > h2', ''], ['.zj-steps li', 'rv-pop'], ['.zj-cta', ''],
      ['.zci > .zs > .zb', 'rv-pop']
    ];
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.remove('rv-wait'); e.target.classList.add('rv-in'); io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    function words(h) {
      var w = 0;
      h.innerHTML = h.textContent.split(/(\s+)/).map(function (p) {
        return /^\s+$/.test(p) || !p ? p : '<span class="rw" style="--w:' + (w++) + '">' + p + '</span>';
      }).join('');
      h.classList.add('rv-words');
    }
    groups.forEach(function (g) {
      document.querySelectorAll('.zpm-home ' + g[0]).forEach(function (el) {
        if (el.getBoundingClientRect().top < innerHeight) return;   // уже на экране — не прячем
        var sib = el.parentNode ? Array.prototype.filter.call(el.parentNode.children, function (c) { return c.matches(g[0].split(' ').pop()) }) : [el];
        el.style.setProperty('--rv', Math.min(8, sib.indexOf(el)));
        if (g[1]) el.classList.add(g[1]);
        var h = el.matches('h2') ? el : el.querySelector(':scope > h2');
        if (h && !h.querySelector('*')) words(h);
        el.classList.add('rv-wait');
        io.observe(el);
      });
    });
  })();

  /* ── Живые цифры в шапке ───────────────────────────────────────────── */
  var hs = document.getElementById('zh-stats');
  if (hs) loadStats().then(function (d) {
    if (d.source !== 'commits') return;
    var t = d.totals || {};
    hs.hidden = false;
    hs.querySelectorAll('[data-hs]').forEach(function (b) {
      var v = t[b.getAttribute('data-hs')];
      if (v == null) { b.parentNode.hidden = true; return }
      var go = function () { countUp(b, v, 1800) };
      if (root.classList.contains('zpm-intro-on')) {
        var wait = setInterval(function () { if (!root.classList.contains('zpm-intro-on')) { clearInterval(wait); go() } }, 300);
      } else setTimeout(go, 1500);
    });
  }).catch(function () {});

  /* ── Персонажи: следят за курсором и реагируют на касание ────────────── */
  (function () {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var rigs = Array.prototype.slice.call(document.querySelectorAll('.zrig'));
    if (!rigs.length) return;
    var mx = innerWidth / 2, my = innerHeight / 2, raf = 0;
    var state = rigs.map(function () { return { x: 0, y: 0 } });
    function tick() {
      raf = 0;
      var moving = false;
      rigs.forEach(function (r, i) {
        var b = r.getBoundingClientRect();
        if (!b.width || b.bottom < 0 || b.top > innerHeight) return;
        var tx = Math.max(-1, Math.min(1, (mx - (b.left + b.width / 2)) / (b.width * 0.6)));
        var ty = Math.max(-1, Math.min(1, (my - (b.top + b.height / 2)) / (b.height * 0.6)));
        var s = state[i];
        s.x += (tx - s.x) * 0.08; s.y += (ty - s.y) * 0.08;
        if (Math.abs(tx - s.x) > 0.002 || Math.abs(ty - s.y) > 0.002) moving = true;
        r.style.setProperty('--px', s.x.toFixed(3));
        r.style.setProperty('--py', s.y.toFixed(3));
      });
      if (moving) raf = requestAnimationFrame(tick);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(tick) }
    addEventListener('pointermove', function (e) { mx = e.clientX; my = e.clientY; kick() }, { passive: true });
    addEventListener('scroll', kick, { passive: true });
    function poke(r) {
      if (r.classList.contains('zr-poke')) return;
      r.classList.add('zr-poke');
      setTimeout(function () { r.classList.remove('zr-poke') }, 800);
    }
    rigs.forEach(function (r) {
      var last = 0;
      r.addEventListener('pointerenter', function () { if (Date.now() - last > 1500) { last = Date.now(); poke(r) } });
      r.addEventListener('pointerdown', function () { poke(r) });
    });
  })();

  /* ── Молния дуэли: фрактальный разряд на canvas ─────────────────────── */
  (function () {
    var duel = document.getElementById('zpm-duel');
    var cv = duel && duel.querySelector('.zd-canvas');
    if (!cv || !cv.getContext || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var g = cv.getContext('2d'), W = 0, H = 0, dpr = 1, horiz = false, visible = false, raf = 0, nextShape = 0, bolts = [], flick = 1;
    duel.classList.add('zd-live');

    function size() {
      var r = cv.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      horiz = W > H;
    }
    // смещение средней точки: ломаная с убывающим разбросом
    function crack(x1, y1, x2, y2, rough, depth, out) {
      if (depth === 0) { out.push([x2, y2]); return }
      var mx = (x1 + x2) / 2, my = (y1 + y2) / 2, len = Math.hypot(x2 - x1, y2 - y1);
      var nx = -(y2 - y1) / len, ny = (x2 - x1) / len, off = (Math.random() - 0.5) * len * rough;
      mx += nx * off; my += ny * off;
      crack(x1, y1, mx, my, rough, depth - 1, out);
      crack(mx, my, x2, y2, rough, depth - 1, out);
    }
    function shape(boost) {
      var L = horiz ? W : H, T = horiz ? H : W, main = [];
      var a = horiz ? [-10, H / 2] : [W / 2, -10], b = horiz ? [W + 10, H / 2] : [W / 2, H + 10];
      main.push(a); crack(a[0], a[1], b[0], b[1], 0.32, 8, main);
      // держим ствол в пределах полосы
      var ax = horiz ? 1 : 0, c = T / 2, dev = 1;
      main.forEach(function (p) { dev = Math.max(dev, Math.abs(p[ax] - c)) });
      var f = Math.min(1, T * 0.38 / dev);      // сжимаем разброс равномерно, а не обрезаем по краю
      main.forEach(function (p) { p[ax] = c + (p[ax] - c) * f });
      var list = [{ pts: main, w: 1 }];
      var nb = (boost ? 7 : 3) + Math.floor(Math.random() * 3);
      for (var i = 0; i < nb; i++) {
        var s = main[4 + Math.floor(Math.random() * (main.length - 8))];
        var ang = (horiz ? Math.PI / 2 : 0) + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.9) + (horiz ? 0 : (Math.random() < 0.5 ? 0 : Math.PI));
        var bl = L * (0.08 + Math.random() * (boost ? 0.22 : 0.14));
        var e = [s[0] + Math.sin(ang) * bl * (horiz ? 1 : 0.9), s[1] + Math.cos(ang) * bl];
        if (!horiz) e = [s[0] + (Math.random() < 0.5 ? -1 : 1) * bl * 0.6, s[1] + bl * (Math.random() < 0.3 ? -0.5 : 0.8)];
        else e = [s[0] + bl * (Math.random() < 0.5 ? -0.6 : 0.8), s[1] + (Math.random() < 0.5 ? -1 : 1) * bl * 0.6];
        var pts = [s]; crack(s[0], s[1], e[0], e[1], 0.45, 5, pts);
        list.push({ pts: pts, w: 0.45 });
      }
      return list;
    }
    function stroke(pts, width, color, blur) {
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.lineWidth = width; g.strokeStyle = color; g.shadowBlur = blur; g.shadowColor = color; g.stroke();
    }
    function frame(now) {
      raf = 0;
      if (!visible || document.hidden) return;
      if (root.classList.contains('zpm-intro-on')) { setTimeout(kick, 500); return }
      var boost = false;
      if (duel._onAt) { var ph = (now - duel._onAt - 1500) % 6000; boost = ph > 5230 && ph < 5750 }
      if (now > nextShape) {
        bolts = shape(boost);
        nextShape = now + (boost ? 45 : 70 + Math.random() * 60);
        flick = Math.random() < 0.06 ? 0.25 : 0.75 + Math.random() * 0.25;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.globalCompositeOperation = 'lighter';
      var k = (boost ? 1.9 : 1.2) * flick, sh = horiz ? [0, 2] : [2, 0];
      bolts.forEach(function (b) {
        var w = b.w * k;
        g.save(); g.translate(-sh[0], -sh[1]); stroke(b.pts, 9 * w, 'rgba(79,209,255,' + (0.22 * k) + ')', 26); g.restore();
        g.save(); g.translate(sh[0], sh[1]); stroke(b.pts, 9 * w, 'rgba(255,59,92,' + (0.2 * k) + ')', 26); g.restore();
        stroke(b.pts, 3.2 * w, 'rgba(190,225,255,' + (0.8 * k) + ')', 12);
        stroke(b.pts, 1.3 * w + 0.4, 'rgba(255,255,255,' + Math.min(1, k) + ')', 4);
      });
      g.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf && visible) raf = requestAnimationFrame(frame) }
    size();
    addEventListener('resize', function () { size(); nextShape = 0 });
    document.addEventListener('visibilitychange', kick);
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) { size(); kick() } }).observe(duel);
  })();

  /* ── Стеллаж сборок: последние релизы из API ────────────────────────── */
  (function () {
    var shelf = document.getElementById('zr-shelf');
    if (!shelf || !window.fetch) return;
    function ago(ts) {
      var d = Math.floor((Date.now() - ts) / 864e5);
      if (d < 1) return 'сегодня';
      if (d < 2) return 'вчера';
      if (d < 14) return d + ' ' + plural(d, 'день', 'дня', 'дней') + ' назад';
      if (d < 60) { var w = Math.floor(d / 7); return w + ' ' + plural(w, 'неделю', 'недели', 'недель') + ' назад' }
      var m = Math.floor(d / 30); return m + ' ' + plural(m, 'месяц', 'месяца', 'месяцев') + ' назад';
    }
    function load() {
      shelf.querySelectorAll('.zbox[data-repo]').forEach(function (b) {
        fetch(shelf.getAttribute('data-api') + b.getAttribute('data-repo') + '/releases/latest')
          .then(function (r) { return r.ok ? r.json() : null })
          .then(function (r) {
            if (!r || !r.tag_name) return;
            var ver = String(r.tag_name).replace(/^(zsg-|v)/i, '');
            var ts = Date.parse(r.published_at || r.created_at);
            var dl = (r.assets || []).reduce(function (a, x) { return a + (x.download_count || 0) }, 0);
            b.querySelector('[data-f="ver"]').textContent = 'v' + ver;
            if (ts) b.querySelector('[data-f="age"]').textContent = ago(ts);
            if (dl) b.querySelector('[data-f="dl"]').textContent = '↓ ' + short(dl);
            if (ts && Date.now() - ts < 3 * 864e5) b.classList.add('zbox-fresh');
          }).catch(function () {});
      });
    }
    if (window.IntersectionObserver) {
      var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); load() } }, { rootMargin: '600px 0px' });
      io.observe(shelf);
    } else load();
  })();

  /* ── Лаборатория доверия: сборка по шагам и сверка sha256 ───────────── */
  (function () {
    var lab = document.getElementById('zci-lab');
    if (!lab || !window.IntersectionObserver || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var items = lab.querySelectorAll('.zci-log li'), codes = lab.querySelectorAll('.zci-h code'), stamp = lab.querySelector('.zci-stamp');
    var HEX = '0123456789abcdef', visible = false, busy = false, timers = [];
    function later(fn, ms) { timers.push(setTimeout(fn, ms)) }
    function hex(n) { var s = ''; for (var i = 0; i < n; i++) s += HEX[Math.floor(Math.random() * 16)]; return s }
    function run() {
      if (busy || !visible) return;
      busy = true;
      lab.classList.add('zci-live'); lab.classList.remove('zci-match'); stamp.classList.remove('on');
      var hash = hex(64);
      codes.forEach(function (c) { c.innerHTML = hash.split('').map(function (_, n) { return '<i style="--n:' + n + '">·</i>' }).join('') });
      items.forEach(function (li) { li.className = 'pending' });
      var t = 300;
      items.forEach(function (li, i) {
        later(function () { li.className = 'run' }, t);
        t += i === 2 ? 1500 : 600 + Math.random() * 300;
        later(function () { li.className = 'ok' }, t);
      });
      later(function () { scramble(hash) }, t + 200);
    }
    function scramble(hash) {
      var spans = [codes[0].children, codes[1].children], locked = [0, -14], tick = setInterval(function () {
        for (var k = 0; k < 2; k++) {
          locked[k] += 2;
          for (var i = 0; i < 64; i++) {
            var s = spans[k][i];
            if (i < locked[k]) { if (!s.classList.contains('lk')) { s.textContent = hash[i]; s.classList.add('lk') } }
            else s.textContent = HEX[Math.floor(Math.random() * 16)];
          }
        }
        if (locked[1] >= 64) {
          clearInterval(tick);
          lab.classList.add('zci-match');
          later(function () { stamp.classList.add('on') }, 250);
          later(function () { busy = false; run() }, 5200);
        }
      }, 45);
      timers.push({ clear: function () { clearInterval(tick) } });
    }
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible) run();
    }, { threshold: 0.35 }).observe(lab);
  })();

  /* ── Мини-игра «Спасите пакеты» ──────────────────────────────────────── */
  (function () {
    var box = document.getElementById('zg-packets');
    var cv = box && box.querySelector('canvas');
    if (!cv || !cv.getContext || !window.IntersectionObserver) return;
    var g = cv.getContext('2d'), W = 0, H = 0, dpr = 1, wireY = 0, visible = false, raf = 0, last = 0;
    var pk = [], claws = [], fx = [], nextPk = 0, nextClaw = 1.5, clock = 0;
    var score = { saved: 0, lost: 0, best: 0 }, toast = box.querySelector('.zg-toast'), shown = {};
    try { score.best = +localStorage.getItem('zg-best') || 0 } catch (e) {}
    function ui() { for (var k in score) box.querySelector('[data-g="' + k + '"]').textContent = score[k] }
    ui();
    function size() {
      var r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
      W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); wireY = H * 0.68;
    }
    function spawn() { pk.push({ x: -20, v: 70 + Math.random() * 60 + Math.min(60, score.saved * 1.5), s: 0, out: 0, grab: null }) }
    function attack() {
      var cand = pk.filter(function (p) { return !p.s && !p.grab && p.x > W * 0.25 && p.x < W * 0.8 });
      if (!cand.length) return;
      var t = cand[Math.floor(Math.random() * cand.length)];
      claws.push({ target: t, x: t.x + t.v * 0.9, st: 'warn', t: 0 });
    }
    function burst(x, y, col, n) { for (var i = 0; i < n; i++) { var a = Math.random() * 6.28, v = 60 + Math.random() * 140; fx.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6, col: col }) } }
    function milestone() {
      var m = [10, 25, 50, 100].filter(function (n) { return score.saved >= n && !shown[n] })[0];
      if (!m) return;
      shown[m] = 1;
      toast.querySelector('b').textContent = m + ' ' + plural(m, 'пакет спасён!', 'пакета спасены!', 'пакетов спасено!');
      toast.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { toast.hidden = true }, 7000);
    }
    function drawClaw(x, y, a) {
      g.save(); g.translate(x, y); g.globalAlpha = a;
      g.shadowColor = '#ff2b4f'; g.shadowBlur = 18;
      g.fillStyle = '#e9b8a4'; g.beginPath(); g.ellipse(0, -46, 26, 30, 0, 0, 6.28); g.fill();
      [-18, -6, 6, 18].forEach(function (dx, i) {
        g.fillStyle = '#e9b8a4'; g.beginPath(); g.ellipse(dx, -18, 6, 16, dx / 60, 0, 6.28); g.fill();
        g.fillStyle = '#1a0a18'; g.beginPath(); g.moveTo(dx - 5, -6); g.quadraticCurveTo(dx + dx * 0.15, 14, dx + dx * 0.25, 20); g.quadraticCurveTo(dx + 6, 6, dx + 5, -6); g.fill();
      });
      g.restore();
    }
    function frame(now) {
      raf = 0; if (!visible || document.hidden) { last = 0; return }
      if (root.classList.contains('zpm-intro-on')) { last = 0; setTimeout(function () { if (!raf) raf = requestAnimationFrame(frame) }, 500); return }
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now; clock += dt;
      if (clock > nextPk) { spawn(); nextPk = clock + 0.55 + Math.random() * 0.6 }
      if (clock > nextClaw) { attack(); nextClaw = clock + Math.max(0.9, 2.6 - score.saved * 0.03) + Math.random() * 1.2 }
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      // провод
      var grd = g.createLinearGradient(0, 0, W, 0); grd.addColorStop(0, 'rgba(79,209,255,0)'); grd.addColorStop(0.1, 'rgba(79,209,255,.7)'); grd.addColorStop(0.9, 'rgba(155,123,255,.7)'); grd.addColorStop(1, 'rgba(155,123,255,0)');
      g.strokeStyle = grd; g.lineWidth = 3; g.beginPath(); g.moveTo(0, wireY); g.lineTo(W, wireY); g.stroke();
      // когти
      claws.forEach(function (c) {
        c.t += dt;
        if (c.st === 'warn') {
          g.strokeStyle = 'rgba(255,59,92,' + (0.4 + 0.4 * Math.sin(c.t * 30)) + ')'; g.setLineDash([6, 6]); g.lineWidth = 2;
          g.beginPath(); g.moveTo(c.x, 0); g.lineTo(c.x, wireY); g.stroke(); g.setLineDash([]);
          if (c.t > 0.9) { c.st = 'down'; c.t = 0 }
        } else if (c.st === 'down') {
          var y = -40 + (wireY + 40) * Math.min(1, c.t / 0.22);
          drawClaw(c.x, y, 1);
          if (c.t >= 0.22) {
            c.st = 'up'; c.t = 0;
            pk.forEach(function (p) { if (!p.grab && !p.s && Math.abs(p.x - c.x) < 34) { p.grab = c; c.got = p; score.lost++; ui(); burst(p.x, wireY, '#ff3b5c', 14) } });
            pk.forEach(function (p) { if (p.s && Math.abs(p.x - c.x) < 34) { burst(p.x, wireY, '#4fd1ff', 10); c.blocked = 1 } });
          }
        } else {
          var y2 = wireY - (wireY + 60) * Math.min(1, c.t / 0.5);
          drawClaw(c.x, y2, 1);
          if (c.got) c.got.y = y2 + 16;
          if (c.t > 0.5) c.dead = 1;
        }
      });
      claws = claws.filter(function (c) { if (c.dead && c.got) c.got.gone = 1; return !c.dead });
      // пакеты
      pk.forEach(function (p) {
        if (!p.grab) p.x += p.v * dt * (p.s ? 1.6 : 1);
        var y = p.grab ? p.y : wireY;
        if (p.s) {
          g.strokeStyle = 'rgba(79,209,255,.9)'; g.lineWidth = 2; g.shadowColor = '#4fd1ff'; g.shadowBlur = 14;
          g.beginPath(); g.arc(p.x, y, 17, 0, 6.28); g.stroke();
        }
        g.shadowColor = p.grab ? '#ff3b5c' : '#4fd1ff'; g.shadowBlur = 12;
        g.fillStyle = p.grab ? '#ff5a74' : (p.s ? '#bff0ff' : '#4fd1ff');
        g.beginPath(); g.roundRect ? g.roundRect(p.x - 9, y - 7, 18, 14, 4) : g.rect(p.x - 9, y - 7, 18, 14); g.fill(); g.shadowBlur = 0;
        if (p.x > W + 20) { p.gone = 1; if (p.s) { score.saved++; if (score.saved > score.best) { score.best = score.saved; try { localStorage.setItem('zg-best', score.best) } catch (e) {} } ui(); milestone() } }
      });
      pk = pk.filter(function (p) { return !p.gone });
      // искры
      fx.forEach(function (f) { f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 300 * dt; g.globalAlpha = Math.max(0, f.life / 0.6); g.fillStyle = f.col; g.fillRect(f.x - 2, f.y - 2, 4, 4) });
      g.globalAlpha = 1; fx = fx.filter(function (f) { return f.life > 0 });
      raf = requestAnimationFrame(frame);
    }
    cv.addEventListener('pointerdown', function (e) {
      var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null, d = 40;
      pk.forEach(function (p) { var dd = Math.hypot(p.x - x, (p.grab ? p.y : wireY) - y); if (!p.s && !p.grab && dd < d) { d = dd; best = p } });
      if (best) { best.s = 1; burst(best.x, wireY, '#4fd1ff', 12) }
      claws.forEach(function (c) { if (c.st !== 'warn' && Math.abs(c.x - x) < 40 && y < wireY + 10) { if (c.got) { c.got.grab = null; c.got.s = 1; c.got = null } c.st = 'up'; c.t = 0.3; burst(c.x, y, '#ffcf5a', 16) } });
    });
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) { size(); if (!raf) raf = requestAnimationFrame(frame) } }).observe(box);
    addEventListener('resize', size);
    document.addEventListener('visibilitychange', function () { if (visible && !raf) raf = requestAnimationFrame(frame) });
  })();

  /* ── Мини-игра «Сломайте замок РКН» ─────────────────────────────────── */
  (function () {
    var lock = document.getElementById('zlock');
    if (!lock) return;
    var btn = lock.querySelector('.zlock-hit'), fx = lock.querySelector('.zlock-fx'), bar = lock.querySelector('.zlock-hp i');
    var hpEl = lock.querySelector('[data-l="hp"]'), name = lock.querySelector('.zlock-name'), label = lock.querySelector('.zl-label');
    var win = lock.querySelector('.zlock-win'), cracks = lock.querySelectorAll('.zl-crack');
    var LEVELS = [['Сломайте замок РКН', 'РКН', 15], ['Теперь замок ТСПУ', 'ТСПУ', 25], ['Финальный босс: реестр', 'РЕЕСТР', 40]];
    var lvl = 0, hp = 0, max = 0;
    function set(l) {
      lvl = l; max = hp = LEVELS[Math.min(l, 2)][2] + Math.max(0, l - 2) * 15;
      name.textContent = LEVELS[Math.min(l, 2)][0] + (l > 2 ? ' ×' + (l - 1) : '');
      label.textContent = LEVELS[Math.min(l, 2)][1];
      lock.classList.remove('broken'); win.hidden = true; upd();
    }
    function upd() {
      hpEl.textContent = hp; bar.style.width = (hp / max * 100) + '%';
      var k = hp / max; cracks.forEach(function (c) { c.classList.toggle('on', k <= +c.getAttribute('data-at')) });
    }
    function add(el, ms) { fx.appendChild(el); setTimeout(function () { el.remove() }, ms) }
    function hit() {
      if (hp <= 0) return;
      var crit = Math.random() < 0.15, dmg = crit ? 3 : 1;
      hp = Math.max(0, hp - dmg); upd();
      lock.classList.remove('hit'); void lock.offsetWidth; lock.classList.add('hit');
      var n = document.createElement('b'); n.textContent = crit ? 'КРИТ −3!' : '−1'; if (crit) n.className = 'crit';
      n.style.setProperty('--dx', (Math.random() * 60 - 30) + 'px'); add(n, 800);
      for (var i = 0; i < (crit ? 12 : 6); i++) {
        var s = document.createElement('i'), a = Math.random() * 6.28, v = 40 + Math.random() * 70;
        s.style.setProperty('--dx', Math.cos(a) * v + 'px'); s.style.setProperty('--dy', Math.sin(a) * v + 'px'); add(s, 600);
      }
      if (navigator.vibrate) try { navigator.vibrate(crit ? 30 : 10) } catch (e) {}
      if (hp === 0) boom();
    }
    function boom() {
      lock.classList.add('broken');
      var cols = ['#4fd1ff', '#9b7bff', '#37e39a', '#ffcf5a', '#ff6bb3'];
      for (var i = 0; i < 60; i++) {
        var c = document.createElement('i'), a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, v = 90 + Math.random() * 220;
        c.className = 'cf'; c.style.setProperty('--c', cols[i % 5]);
        c.style.setProperty('--dx', Math.cos(a) * v + 'px'); c.style.setProperty('--dy', (Math.sin(a) * v + 160) + 'px'); c.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
        add(c, 1600);
      }
      setTimeout(function () { win.hidden = false }, 500);
      try { localStorage.setItem('zlock-lvl', lvl + 1) } catch (e) {}
    }
    btn.addEventListener('click', hit);
    lock.querySelector('.zlock-again').addEventListener('click', function () { set(lvl + 1) });
    var saved = 0; try { saved = +localStorage.getItem('zlock-lvl') || 0 } catch (e) {}
    set(Math.min(saved, 2));
  })();

  /* ── Своё контекстное меню ──────────────────────────────────────────── */
  (function () {
    if (window.matchMedia && matchMedia('(pointer: coarse)').matches) return;   // на телефонах — системное
    var sub = (pulse && pulse.getAttribute('data-heatmap') || '/api/').split('/api/')[0];
    var I = {
      back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
      fwd: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
      reload: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
      top: '<svg viewBox="0 0 24 24"><path d="M12 19V5m-6 6 6-6 6 6"/></svg>',
      open: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
      copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
      link: '<svg viewBox="0 0 24 24"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
      search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
      img: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
      play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>',
      heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11z"/></svg>',
      repo: '<svg viewBox="0 0 24 24"><path d="M5 4h11l3 3v13H5z"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>',
      status: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z"/><path d="M8 12h2l1.5-3 2 6 1.5-3h1"/></svg>',
      lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0"/></svg>'
    };
    var menu = document.createElement('div'); menu.className = 'zcm'; menu.hidden = true; menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    var items = [], cur = -1;
    function toast(msg) { var t = document.createElement('div'); t.className = 'zcm-toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove() }, 1900) }
    function copy(s, msg) {
      (navigator.clipboard ? navigator.clipboard.writeText(s) : Promise.reject()).then(function () { toast(msg || 'Скопировано') }, function () {
        var ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(msg || 'Скопировано') } catch (e) {} ta.remove();
      });
    }
    function close() { menu.hidden = true; cur = -1 }
    function build(e) {
      var a = e.target.closest('a[href]'), im = e.target.closest('img'), sel = String(getSelection() || '').trim();
      var h = '<div class="zcm-head"><img src="' + sub + '/zapretdiscordyoutube.png" alt=""><div><b>Zapret.Moe</b><small>git-сервер сообщества</small></div></div>';
      h += '<div class="zcm-row"><button data-a="back" title="Назад"' + (history.length < 2 ? ' disabled' : '') + '>' + I.back + '</button><button data-a="fwd" title="Вперёд">' + I.fwd + '</button><button data-a="reload" title="Обновить">' + I.reload + '</button><button data-a="top" title="Наверх">' + I.top + '</button></div>';
      var body = [];
      if (sel) body.push('<div class="zcm-lbl">«' + sel.slice(0, 40).replace(/</g, '&lt;') + (sel.length > 40 ? '…' : '') + '»</div>', it('copysel', I.copy, 'Копировать', 'Ctrl+C'), it('search', I.search, 'Найти в интернете'));
      else if (a) body.push('<div class="zcm-lbl">' + a.href.replace(/^https?:\/\//, '').slice(0, 44) + '</div>', it('go', I.open, 'Открыть'), it('tab', I.open, 'Открыть в новой вкладке'), it('copylink', I.link, 'Копировать адрес ссылки'));
      else if (im && im.currentSrc) body.push(it('imgopen', I.img, 'Открыть картинку'), it('imgcopy', I.link, 'Копировать адрес картинки'));
      if (body.length) h += body.join('') + '<div class="zcm-sep"></div>';
      h += it('intro', I.play, 'Посмотреть заставку') + it('lock', I.lock, 'Сломать замок РКН') + it('repos', I.repo, 'Все репозитории') + it('status', I.status, 'Статус сервисов');
      h += '<div class="zcm-sep"></div>' + it('donate', I.heart, 'Поддержать проект', '', 'hot');
      h += '<div class="zcm-foot">Shift + ПКМ — меню браузера</div>';
      menu.innerHTML = h;
      menu._ctx = { a: a, im: im, sel: sel };
      items = Array.prototype.slice.call(menu.querySelectorAll('.zcm-it'));
    }
    function it(act, ico, label, kbd, cls) { return '<button class="zcm-it' + (cls ? ' ' + cls : '') + '" role="menuitem" data-a="' + act + '">' + ico + '<span>' + label + '</span>' + (kbd ? '<kbd>' + kbd + '</kbd>' : '') + '</button>' }
    function act(name) {
      var c = menu._ctx || {}; close();
      var go = function (u, blank) { if (blank) open(u, '_blank', 'noopener'); else location.href = u };
      switch (name) {
        case 'back': history.back(); break;
        case 'fwd': history.forward(); break;
        case 'reload': location.reload(); break;
        case 'top': scrollTo({ top: 0, behavior: 'smooth' }); break;
        case 'copysel': copy(c.sel); break;
        case 'search': go('https://duckduckgo.com/?q=' + encodeURIComponent(c.sel), 1); break;
        case 'go': c.a.click(); break;
        case 'tab': go(c.a.href, 1); break;
        case 'copylink': copy(c.a.href, 'Ссылка скопирована'); break;
        case 'imgopen': go(c.im.currentSrc, 1); break;
        case 'imgcopy': copy(c.im.currentSrc, 'Адрес картинки скопирован'); break;
        case 'intro': var r = document.getElementById('zpm-replay'); if (r) r.click(); break;
        case 'lock': var l = document.getElementById('zlock'); if (l) l.scrollIntoView({ behavior: 'smooth', block: 'center' }); break;
        case 'repos': go(sub + '/explore/repos'); break;
        case 'status': go('https://status.zapret.moe/', 1); break;
        case 'donate': go('https://t.me/zapretvpns_bot', 1); break;
      }
    }
    function focusIt(i) { items.forEach(function (x, k) { x.classList.toggle('on', k === i) }); cur = i; if (items[i]) items[i].focus({ preventScroll: true }) }
    document.addEventListener('contextmenu', function (e) {
      if (e.shiftKey || e.target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .zcm')) return;
      if (document.documentElement.classList.contains('zpm-intro-on')) return;
      e.preventDefault();
      build(e);
      menu.hidden = false;
      var w = menu.offsetWidth, hh = menu.offsetHeight;
      var x = Math.min(e.clientX, innerWidth - w - 8), y = Math.min(e.clientY, innerHeight - hh - 8);
      menu.style.left = Math.max(8, x) + 'px'; menu.style.top = Math.max(8, y) + 'px';
      menu.style.setProperty('--ox', (e.clientX - x) + 'px'); menu.style.setProperty('--oy', (e.clientY - y) + 'px');
      menu.style.animation = 'none'; void menu.offsetWidth; menu.style.animation = '';
    });
    menu.addEventListener('click', function (e) { var b = e.target.closest('[data-a]'); if (b) act(b.getAttribute('data-a')) });
    menu.addEventListener('mousemove', function (e) { var b = e.target.closest('.zcm-it'); if (b) focusIt(items.indexOf(b)) });
    document.addEventListener('mousedown', function (e) { if (!menu.hidden && !menu.contains(e.target)) close() }, true);
    addEventListener('scroll', function () { if (!menu.hidden) close() }, { passive: true });
    addEventListener('blur', close); addEventListener('resize', close);
    document.addEventListener('keydown', function (e) {
      if (menu.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); focusIt((cur + 1) % items.length) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); focusIt((cur - 1 + items.length) % items.length) }
      else if (e.key === 'Enter' && items[cur]) { e.preventDefault(); act(items[cur].getAttribute('data-a')) }
    });
  })();

  /* ── Курсор-пакет и анимация «блокировка → обход» по клику ─────────── */
  (function () {
    if (!window.matchMedia || !matchMedia('(pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var root = document.documentElement, body = document.body;
    var dot = document.createElement('div'), ring = document.createElement('div'), cv = document.createElement('canvas');
    dot.className = 'zcur-dot'; ring.className = 'zcur-ring'; cv.className = 'zcur-fx';
    body.appendChild(cv); body.appendChild(ring); body.appendChild(dot);
    root.classList.add('zcur-on', 'zcur-hide');
    var g = cv.getContext('2d'), dpr = 1, W = 0, H = 0;
    function size() { dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr }
    size(); addEventListener('resize', size);
    var mx = -100, my = -100, rx = -100, ry = -100, trail = [], fx = [], raf = 0, idle = 0;
    function state(t) {
      var c = root.classList, el = t && t.closest ? t : null;
      c.toggle('zcur-link', !!(el && el.closest('a, button, [role="button"], .zbox, .zc-dl, .zp-lg, .zlock-hit, .zg-canvas, summary, label')));
      c.toggle('zcur-rkn', !!(el && el.closest('.zr-rkn, .zi-rig-rkn')));
      c.toggle('zcur-text', !!(el && !el.closest('a, button') && el.closest('p, h1, h2, h3, li span, dd, code, .zt-t') && !el.closest('.zr-rkn')));
    }
    addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      mx = e.clientX; my = e.clientY; root.classList.remove('zcur-hide');
      trail.push({ x: mx, y: my, t: performance.now() });
      state(e.target); kick();
    }, { passive: true });
    document.addEventListener('mouseleave', function () { root.classList.add('zcur-hide') });
    addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      root.classList.add('zcur-down');
      var hot = e.target.closest && e.target.closest('a, button, [role="button"], .zbox, .zlock-hit, .zg-canvas, input, textarea, select');
      if (hot) ripple(e.clientX, e.clientY); else block(e.clientX, e.clientY);
      kick();
    });
    addEventListener('pointerup', function () { root.classList.remove('zcur-down') });
    function ripple(x, y) {
      fx.push({ k: 'ring', x: x, y: y, t: 0, dur: 0.5, col: '79,209,255' });
      for (var i = 0; i < 8; i++) { var a = i / 8 * 6.28; fx.push({ k: 'spark', x: x, y: y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, t: 0, dur: 0.4, col: '191,240,255' }) }
    }
    // «блокировка»: красная рамка ТСПУ схлопывается — пакет раскалывается и уходит в обход
    function block(x, y) { fx.push({ k: 'block', x: x, y: y, t: 0, dur: 0.75, ang: Math.random() * 1.2 - 0.6 }) }
    function kick() { if (!raf) raf = requestAnimationFrame(frame) }
    var last = 0;
    function frame(now) {
      raf = 0;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;
      rx += (mx - rx) * Math.min(1, dt * 18); ry += (my - ry) * Math.min(1, dt * 18);
      dot.style.transform = 'translate(' + mx + 'px,' + my + 'px)';
      ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px)';
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      // шлейф-провод
      while (trail.length && now - trail[0].t > 260) trail.shift();
      if (trail.length > 1) {
        g.lineCap = 'round'; g.lineJoin = 'round';
        for (var i = 1; i < trail.length; i++) {
          var p = trail[i - 1], q = trail[i], a = 1 - (now - q.t) / 260;
          g.strokeStyle = 'rgba(' + (79 + (1 - a) * 76 | 0) + ',' + (209 - (1 - a) * 86 | 0) + ',255,' + (a * 0.55) + ')';
          g.lineWidth = 1 + a * 2.5; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
        }
      }
      fx.forEach(function (f) {
        f.t += dt; var k = f.t / f.dur;
        if (f.k === 'ring') {
          g.strokeStyle = 'rgba(' + f.col + ',' + (1 - k) + ')'; g.lineWidth = 2;
          g.beginPath(); g.arc(f.x, f.y, 8 + k * 40, 0, 6.28); g.stroke();
        } else if (f.k === 'spark') {
          f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.9; f.vy *= 0.9;
          g.fillStyle = 'rgba(' + f.col + ',' + (1 - k) + ')'; g.fillRect(f.x - 1.5, f.y - 1.5, 3, 3);
        } else if (f.k === 'block') {
          g.save(); g.translate(f.x, f.y);
          var s, close = Math.min(1, k / 0.3);
          if (k < 0.42) {
            // рамка схлопывается вокруг пакета
            s = 44 - close * 26;
            g.rotate(f.ang * (1 - close));
            g.strokeStyle = 'rgba(255,59,92,' + (0.4 + close * 0.6) + ')'; g.lineWidth = 2.5; g.shadowColor = '#ff3b5c'; g.shadowBlur = 12;
            g.strokeRect(-s / 2, -s / 2, s, s);
            g.shadowBlur = 0; g.fillStyle = 'rgba(255,107,131,' + close + ')'; g.font = '700 9px ui-monospace, monospace'; g.textAlign = 'center';
            g.fillText('ТСПУ', 0, -s / 2 - 5);
            g.fillStyle = '#4fd1ff'; g.fillRect(-6, -4.5, 12, 9);
            if (k > 0.3) { g.fillStyle = 'rgba(255,255,255,' + (1 - (k - 0.3) / 0.12) + ')'; g.beginPath(); g.arc(0, 0, 16, 0, 6.28); g.fill() }
          } else {
            // пакет раскалывается и уходит в обход, рамка ломается
            var e = (k - 0.42) / 0.58, ease = 1 - Math.pow(1 - e, 3), d = ease * 46;
            g.rotate(f.ang);
            g.globalAlpha = 1 - e;
            g.strokeStyle = '#ff3b5c'; g.lineWidth = 2.5;
            [[-1, -1, 1, 0], [1, -1, 0, 1], [1, 1, -1, 0], [-1, 1, 0, -1]].forEach(function (c, j) {
              g.save(); g.translate(c[0] * (9 + d * 0.8), c[1] * (9 + d * 0.8)); g.rotate((j % 2 ? 1 : -1) * ease * 1.2);
              g.beginPath(); g.moveTo(-9, 0); g.lineTo(9, 0); g.stroke(); g.restore();
            });
            g.globalAlpha = 1 - e * 0.8;
            g.fillStyle = '#4fd1ff'; g.shadowColor = '#4fd1ff'; g.shadowBlur = 10;
            g.fillRect(-6 - d * 1.2, -4.5 - d * 0.5, 5.5, 9);
            g.fillRect(0.5 + d * 1.2, -4.5 + d * 0.5, 5.5, 9);
            g.shadowBlur = 0; g.fillStyle = 'rgba(79,209,255,' + (1 - e) + ')'; g.font = '700 10px ui-monospace, monospace'; g.textAlign = 'center';
            g.fillText('обход ✓', 0, -20 - d * 0.4);
          }
          g.restore();
        }
      });
      fx = fx.filter(function (f) { return f.t < f.dur });
      if (Math.abs(mx - rx) + Math.abs(my - ry) > 0.3 || trail.length || fx.length) raf = requestAnimationFrame(frame);
      else last = 0;
    }
  })();
})();
