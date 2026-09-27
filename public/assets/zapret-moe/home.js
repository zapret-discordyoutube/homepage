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
  var steps = [2200, 2600, 2400, 2800, 3000, 3800, 3300, 4300, 3900];
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
      ['.zt-list li', 'rv-side'], ['.zr-fdroid', ''], ['.zr-row li', 'rv-pop'], ['.zci-pipe', ''],
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
})();
