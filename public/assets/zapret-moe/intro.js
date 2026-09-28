/* Заставка-история git.zapret.moe: движок слайдов, главы, управление и саундтрек.
   Подключается после home.js и берёт у него window.zpm (статистика и форматирование). */
(function () {
  'use strict';

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
      if (n === 10) {                                       // приёмы обхода: тихое напряжение, «план»
        var s8 = 60 / 96 / 2, seq = [62, 65, 69, 65, 62, 64, 65, 69];
        for (k = 0; k * s8 < D; k++) {
          tone({ t: t + k * s8, f: hz(seq[k % 8]), dur: s8 * 0.9, a: 0.004, r: s8 * 0.8, vol: 0.05, type: 'triangle', cut: 3000, wet: 0.45 });
          if (k % 4 === 0) tone({ t: t + k * s8, f: hz(38), dur: s8 * 3.8, a: 0.02, r: 0.4, vol: 0.12, type: 'sine', cut: 400, wet: 0.1 });
          if (k % 8 === 4) hiss(t + k * s8, 0.08, 'highpass', 6000, 7000, 0.04, 1, 0.2);
        }
        strings(t, 50, D + 0.8, 0.02, { a: 0.8, cut: 1500 }); strings(t, 57, D + 0.8, 0.016, { a: 0.8, cut: 1500 });
      }
      if (n === 11) {                                       // битва: брааамы, тайко, тремоло
        braam(t, 0.14); crash(t, 0.1, 2);
        for (k = 0; k * 0.3 < D; k++) drum(t + k * 0.3, k % 4 === 0 ? 0.7 : 0.35, k % 2 ? 130 : 90, 42, 0.3);
        [38, 41, 45].forEach(function (m) { strings(t, m + 12, D + 0.5, 0.035, { a: 0.2, trem: 12, cut: 2200 }) });
        brass(t + 0.2, 62, 0.8, 0.08); brass(t + 1.1, 65, 0.8, 0.08); brass(t + 2, 69, 1.6, 0.09);
        if (D > 4) braam(t + D * 0.55, 0.16);
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

  /* ── Сценарий ────────────────────────────────────────────────────────────
     act — номер акта, dur — длительность (мс, 0 — ждать действий), m — музыкальная
     сцена, rig — что показать на слое персонажей, cap/sub — подпись.            */
  var ACTS = ['Свободный интернет', 'РКН-тян', 'Обход'];
  var SL = {
    net: { act: 0, dur: 5500, m: 1, cap: 'Жил-был интернет.', sub: 'Быстрый, общий и ничей: любой сайт — в один клик.' },
    env: { act: 0, dur: 6500, m: 1, cap: 'Каждый пакет — это конверт.', sub: 'Письмо внутри зашифровано, но адрес получателя написан снаружи.' },
    rkn: { act: 1, dur: 4500, m: 2, rig: 'rkn', cap: 'Потом пришла РКН-тян.', sub: 'Цифровой надзор с когтями, болгаркой и реестром.' },
    stamp: { act: 1, dur: 4600, m: 3, rig: 'stamp', cap: 'Сначала — реестр.', sub: 'Один штамп — и сайт закрыт для всей страны.' },
    reg: { act: 1, dur: 6200, m: 3, cap: 'В реестре — сотни тысяч адресов.', sub: 'Видео, соцсети, мессенджеры, СМИ, VPN… и каждый день новые.' },
    map: { act: 1, dur: 6800, m: 3, cap: 'Потом — ТСПУ у каждого провайдера.', sub: 'Коробки встали на провода от Калининграда до Анадыря.' },
    xray: { act: 1, dur: 6800, m: 3, cap: 'ТСПУ читает адрес на каждом конверте.', sub: 'Адреса нет в реестре — пропускает. Есть — рвёт соединение.' },
    claw: { act: 1, dur: 6800, m: 3, rig: 'claw', cap: 'Она хватает пакеты прямо на проводе.', sub: 'Подозрительный — в когти. Но всех ей не поймать: часть всё равно проскакивает.' },
    slow: { act: 1, dur: 6200, m: 3, cap: 'Что не запретили — замедлили.', sub: 'Видео грузится по минуте, а виноватым якобы оказывается «сервис».' },
    loss: { act: 1, dur: 6200, m: 4, cap: 'VPN удаляют из магазинов. Сайты пропадают.', sub: 'Кажется, что сделать уже ничего нельзя.' },
    fake: { act: 2, dur: 6800, m: 10, cap: 'Но у пакетов есть приёмы. Первый — подделка.', sub: 'Вперёд летит фейковый пакет, которому не хватит «жизни» дойти до сервера. ТСПУ проверяет его — и пропускает настоящий следом.' },
    split: { act: 2, dur: 6400, m: 10, cap: 'Второй — разрезать адрес.', sub: '«you» и «tube.com» по отдельности ТСПУ не узнаёт, а сервер склеит.' },
    disorder: { act: 2, dur: 6400, m: 10, cap: 'Третий — перепутать порядок.', sub: 'Части приходят задом наперёд: ТСПУ сбивается, сервер собирает правильно.' },
    tunnel: { act: 2, dur: 5800, m: 4, cap: 'Четвёртый — спрятать в туннель.', sub: 'Снаружи — обычный HTTPS к безобидному адресу. Внутри — то, что вам нужно.' },
    zt: { act: 2, dur: 5000, m: 5, rig: 'splice', cap: 'А провода сращивает Запрет-тян.', sub: 'И собирает все эти приёмы в инструменты для людей.' },
    'p-gui': { act: 2, dur: 5800, m: 6 },
    'p-kvn': { act: 2, dur: 5800, m: 7 },
    'p-zsg': { act: 2, dur: 5800, m: 6 },
    'p-mag': { act: 2, dur: 5800, m: 7 },
    infra: { act: 2, dur: 7000, m: 7, cap: 'Нас не убрать одной жалобой.', sub: 'Свой git-сервер, свои сборки, зеркала и F-Droid.' },
    num: { act: 2, dur: 6500, m: 8, cap: 'Наш год в цифрах.', sub: 'Коммиты, релизы и скачивания за последние двенадцать месяцев.' },
    battle: { act: 2, dur: 7000, m: 11, rig: 'both', cap: 'РКН-тян не сдаётся.', sub: 'Но против открытого кода её когти бессильны.' },
    defeat: { act: 2, dur: 4600, m: 11, rig: 'defeat', cap: 'Блокировки падают одна за другой.', sub: 'Пока есть люди, которые делают и поддерживают такие инструменты.' },
    final: { act: 2, dur: 0, m: 9, rig: 'victory' },
    fly: { act: 2, dur: 6000, m: 6, cap: 'Её инструменты — для всех.', sub: 'Zapret 2 GUI, Zapret KVN, ZaStoGram и Magisk Zapret 2.' }
  };
  var FULL = ['net', 'env', 'rkn', 'stamp', 'reg', 'map', 'xray', 'claw', 'slow', 'loss', 'fake', 'split', 'disorder', 'tunnel', 'zt', 'p-gui', 'p-kvn', 'p-zsg', 'p-mag', 'infra', 'num', 'battle', 'defeat', 'final'];
  var SHORT = ['net', 'rkn', 'xray', 'fake', 'zt', 'fly', 'num', 'final'];

  var Z = window.zpm || {};
  var root = document.documentElement;
  var intro = document.getElementById('zpm-intro');
  if (!intro) return;
  var music = makeMusic();
  var stage = intro.querySelector('.zx-stage'), rigs = intro.querySelector('.zx-rigs');
  var capEl = intro.querySelector('.zx-cap'), capT = capEl.querySelector('strong'), capS = capEl.querySelector('span');
  var actsEl = intro.querySelector('.zx-acts');
  var list = FULL, idx = -1, timer = 0, left = 0, t0 = 0, running = false, paused = false, muted = false;
  try { muted = localStorage.getItem('zpm-mute') === '1' } catch (e) {}

  /* ── раскладка: сцена «contain» над подписями, персонажи — «cover» во весь экран ── */
  function layout() {
    var W = innerWidth, H = innerHeight, top = W < 760 ? 92 : 64, bottom = W < 760 ? 190 : 170;
    var portrait = W < H * 0.9;
    intro.classList.toggle('portrait', portrait);
    // на телефоне сцена уже: видимая ширина 1250 единиц, контент для неё переставлен в intro.css
    var s = portrait ? W / 1250 : Math.min(W / 1600, (H - top - bottom) / 900);
    var sx = (W - 1600 * s) / 2, sy = top + (H - top - bottom - 900 * s) / 2;
    intro.style.setProperty('--st-s', s); intro.style.setProperty('--st-x', sx + 'px'); intro.style.setProperty('--st-y', sy + 'px');
    var r = Math.max(W / 1600, H / 900);
    if (portrait && intro.getAttribute('data-rig') === 'both') r = H * 0.46 / 900;   // битва: две девушки друг над другом
    var ry = (H - 900 * r) / 2;
    // когти над проводом: кадр вписан над подписью, как схемы, — провод не уходит под подпись и кнопки
    if (intro.getAttribute('data-rig') === 'claw') { r = Math.min(W / (portrait ? 1250 : 1450), (H - top - bottom) / 900); ry = top + (H - top - bottom - 900 * r) / 2 }
    intro.style.setProperty('--rg-s', r); intro.style.setProperty('--rg-x', (W - 1600 * r) / 2 + 'px'); intro.style.setProperty('--rg-y', ry + 'px');
  }

  function buildActs() {
    actsEl.innerHTML = ACTS.map(function (name, a) {
      var n = list.filter(function (id) { return SL[id].act === a }).length;
      if (!n) return '';
      var ticks = '';
      list.forEach(function (id, i) { if (SL[id].act === a) ticks += '<i data-i="' + i + '"></i>' });
      return '<div class="zx-act" data-act="' + a + '" style="flex:' + n + '"><span>' + name + '</span><div class="zx-ticks">' + ticks + '</div></div>';
    }).join('');
  }

  function ticks() {
    actsEl.querySelectorAll('.zx-ticks i').forEach(function (t) {
      var i = +t.getAttribute('data-i');
      t.className = i < idx ? 'done' : i === idx ? 'cur' : '';
    });
    actsEl.querySelectorAll('.zx-act').forEach(function (a) { a.classList.toggle('cur', +a.getAttribute('data-act') === SL[list[idx]].act) });
  }

  function arm(ms) {
    clearTimeout(timer);
    left = ms; t0 = Date.now();
    if (ms > 0 && !paused) timer = setTimeout(function () { go(idx + 1) }, ms);
  }

  function go(i) {
    if (i >= list.length) return finish();
    if (i < 0) i = 0;
    var id = list[i], s = SL[id];
    var prev = intro.querySelector('.zx-s.on');
    if (prev) prev.classList.remove('on');
    var el = intro.querySelector('.zx-s[data-s="' + id + '"]');
    void el.offsetWidth;                  // перезапуск CSS-анимаций слайда
    el.classList.add('on');
    idx = i;
    intro.setAttribute('data-cur', id);
    intro.setAttribute('data-rig', s.rig || '');
    layout();
    capEl.classList.remove('in'); void capEl.offsetWidth;
    capT.textContent = s.cap || ''; capS.textContent = s.sub || '';
    capEl.hidden = !s.cap;
    if (s.cap) capEl.classList.add('in');
    intro.style.setProperty('--dur', (s.dur || 1) + 'ms');
    ticks();
    if (music.running()) music.play(s.m, (s.dur || 6000) / 1000);
    if (id === 'reg') counter(el.querySelector('.zx-count'), 500000, 4500, '+');
    if (id === 'map') counter(el.querySelector('.zx-count'), el.querySelectorAll('.zx-city').length, 5000, '');
    if (id === 'num') numbers(el);
    if (id === 'battle') bolt(el.querySelector('.zx-bolt'), s.dur);
    if (id === 'fly') warp(el.querySelector('.zi-warp'));
    arm(s.dur);
  }

  function counter(el, to, ms, suf) {
    if (!el) return;
    var st = performance.now();
    (function step(now) {
      if (!el.closest('.on')) return;
      var k = Math.min(1, (now - st) / ms), v = Math.round(to * (1 - Math.pow(1 - k, 3)));
      el.textContent = (Z.fmt ? Z.fmt(v) : v) + (k === 1 ? suf : '');
      if (k < 1) requestAnimationFrame(step);
    })(st);
  }

  function numbers(el) {
    if (!Z.loadStats) return;
    Z.loadStats().then(function (d) {
      var t = d.totals || {};
      el.querySelectorAll('[data-z]').forEach(function (b) {
        var v = t[b.getAttribute('data-z')];
        if (v == null) b.parentNode.hidden = true; else Z.countUp(b, v, 2200);
      });
      if (d.source === 'commits' && t.commits_year && list[idx] === 'num') {
        capS.textContent = Z.fmt(t.commits_year) + ' ' + Z.plural(t.commits_year, 'коммит', 'коммита', 'коммитов') + ', ' + Z.fmt(t.releases) + ' ' + Z.plural(t.releases, 'релиз', 'релиза', 'релизов') + ' и ' + Z.short(t.downloads) + ' скачиваний. И это только начало.';
      }
      var tot = [];
      d.order.forEach(function (k) { var s = d.series[k]; if (s) s.forEach(function (v, i) { tot[i] = (tot[i] || 0) + v }) });
      var N = tot.length, max = Math.max.apply(null, tot.concat([1])), W = 1200, H = 240;
      var x = function (j) { return j / (N - 1) * W }, y = function (v) { return H - 8 - v / max * (H - 20) };
      var p = 'M0 ' + y(tot[0]).toFixed(1);
      for (var k = 1; k < N; k++) { var mx = ((x(k - 1) + x(k)) / 2).toFixed(1); p += ' C' + mx + ' ' + y(tot[k - 1]).toFixed(1) + ' ' + mx + ' ' + y(tot[k]).toFixed(1) + ' ' + x(k).toFixed(1) + ' ' + y(tot[k]).toFixed(1) }
      var line = el.querySelector('.zx-ch-line'), area = el.querySelector('.zx-ch-area');
      line.setAttribute('d', p); area.setAttribute('d', p + ' L' + W + ' ' + H + ' L0 ' + H + ' Z');
      var len = line.getTotalLength();
      line.style.transition = 'none'; line.style.strokeDasharray = len; line.style.strokeDashoffset = len; area.style.opacity = 0; area.style.transition = 'none';
      line.getBoundingClientRect();
      line.style.transition = 'stroke-dashoffset 2.6s cubic-bezier(.3,0,.2,1)'; line.style.strokeDashoffset = 0;
      area.style.transition = 'opacity 1.6s .9s'; area.style.opacity = 1;
    }).catch(function () {});
  }

  function warp(w) {
    if (!w || w.childNodes.length) return;
    var out = '';
    for (var i = 0; i < 56; i++) {
      var a = Math.random() * Math.PI * 2, r0 = 60 + Math.random() * 80;
      out += '<line pathLength="1000" x1="' + (Math.cos(a) * r0).toFixed(0) + '" y1="' + (Math.sin(a) * r0).toFixed(0) + '" x2="' + (Math.cos(a) * 1000).toFixed(0) + '" y2="' + (Math.sin(a) * 1000).toFixed(0) + '" style="--wd:-' + (Math.random() * 1.9).toFixed(2) + 's;--ww:' + (1 + Math.random() * 2).toFixed(1) + '"/>';
    }
    w.innerHTML = out;
  }

  // молния битвы: тот же фрактальный разряд, что в дуэли на главной
  function bolt(cv, dur) {
    if (!cv || !cv.getContext) return;
    var g = cv.getContext('2d'), W = 200, H = 900, st = performance.now(), next = 0, pts = [];
    cv.width = W; cv.height = H;
    function crack(x1, y1, x2, y2, r, d, out) {
      if (!d) { out.push([x2, y2]); return }
      var mx = (x1 + x2) / 2, my = (y1 + y2) / 2, len = Math.hypot(x2 - x1, y2 - y1), off = (Math.random() - 0.5) * len * r;
      mx += -(y2 - y1) / len * off; my += (x2 - x1) / len * off;
      crack(x1, y1, mx, my, r, d - 1, out); crack(mx, my, x2, y2, r, d - 1, out);
    }
    (function frame(now) {
      if (!cv.closest('.on') || now - st > dur) { g.clearRect(0, 0, W, H); return }
      if (paused) { requestAnimationFrame(frame); return }
      if (now > next) {
        pts = [[W / 2, -10]]; crack(W / 2, -10, W / 2, H + 10, 0.3, 8, pts);
        pts.forEach(function (p) { p[0] = W / 2 + (p[0] - W / 2) * 0.8 });
        next = now + 60 + Math.random() * 60;
      }
      g.clearRect(0, 0, W, H); g.lineCap = 'round'; g.lineJoin = 'round'; g.globalCompositeOperation = 'lighter';
      // свечение — несколько широких полупрозрачных штрихов вместо shadowBlur (он дорогой)
      [[30, 'rgba(79,209,255,.07)'], [18, 'rgba(79,209,255,.12)'], [9, 'rgba(255,90,120,.25)'], [4, 'rgba(200,235,255,.8)'], [1.8, '#fff']].forEach(function (s) {
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); pts.forEach(function (p) { g.lineTo(p[0], p[1]) });
        g.lineWidth = s[0]; g.strokeStyle = s[1]; g.stroke();
      });
      requestAnimationFrame(frame);
    })(st);
  }

  /* ── звук ── */
  function unlockSound() {
    if (muted || music.running()) return false;
    music.start(SL[list[idx]].m, (SL[list[idx]].dur || 6000) / 1000);
    intro.classList.remove('snd-wait');
    return true;
  }
  function syncSound() {
    intro.classList.toggle('muted', muted);
    setTimeout(function () { if (running) intro.classList.toggle('snd-wait', !muted && !music.running()) }, 250);
  }

  function setPaused(p) {
    if (p === paused) return;
    paused = p;
    intro.classList.toggle('paused', p);
    if (p) { clearTimeout(timer); left = Math.max(0, left - (Date.now() - t0)) } else arm(left);
  }

  function finish(target) {
    if (!running) return;
    running = false; clearTimeout(timer);
    try { localStorage.setItem('zpm-intro', '1') } catch (e) {}
    music.stop(1.2);
    intro.classList.add('zx-out');
    document.removeEventListener('keydown', onKey);
    root.classList.remove('zpm-intro-lock');
    setTimeout(function () {
      root.classList.remove('zpm-intro-on');
      intro.className = 'zx'; intro.removeAttribute('data-cur'); intro.removeAttribute('data-rig');
      var on = intro.querySelector('.zx-s.on'); if (on) on.classList.remove('on');
      if (target) { var t = document.querySelector(target); if (t) t.scrollIntoView({ behavior: 'smooth' }) }
    }, 750);
    var rp = document.getElementById('zpm-replay'); if (rp) rp.hidden = false;
  }

  function onKey(e) {
    if (e.key === 'Escape') return finish();
    if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); unlockSound(); go(idx + 1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1) }
    else if (e.key === ' ') { e.preventDefault(); unlockSound(); setPaused(!paused) }
  }

  function nextAct() {
    var a = SL[list[idx]].act;
    for (var i = idx + 1; i < list.length; i++) if (SL[list[i]].act !== a) return go(i);
    go(list.length - 1);
  }

  function start(mode) {
    // заставка — прямой потомок body: ни один родитель не обрежет и не сместит её слой
    if (intro.parentNode !== document.body) document.body.appendChild(intro);
    list = mode === 'short' ? SHORT : FULL;
    layout();
    intro.querySelectorAll('img[loading="lazy"]').forEach(function (im) { im.loading = 'eager' });
    if (Z.loadStats) Z.loadStats().catch(function () {});
    buildActs();
    intro.className = 'zx';
    root.classList.add('zpm-intro-on', 'zpm-intro-lock');
    void intro.offsetWidth;
    intro.classList.add('zx-run');
    running = true; paused = false;
    document.addEventListener('keydown', onKey);
    idx = -1; go(0);
    if (!muted) music.start(SL[list[0]].m, SL[list[0]].dur / 1000);
    syncSound();
  }

  addEventListener('resize', function () { if (running) layout() });

  intro.addEventListener('click', function (e) {
    var b = e.target.closest('[data-a]');
    if (b) {
      var a = b.getAttribute('data-a');
      if (a === 'skip') return finish();
      if (a === 'prev') return go(idx - 1);
      if (a === 'next') { unlockSound(); return go(idx + 1) }
      if (a === 'act') { unlockSound(); return nextAct() }
      if (a === 'pause') return setPaused(!paused);
      if (a === 'sound') {
        if (muted || !music.running()) { muted = false; music.start(SL[list[idx]].m, (SL[list[idx]].dur || 6000) / 1000) }
        else { muted = true; music.stop(0.3) }
        try { localStorage.setItem('zpm-mute', muted ? '1' : '0') } catch (err) {}
        return syncSound();
      }
    }
    var tk = e.target.closest('.zx-ticks i');
    if (tk) { unlockSound(); return go(+tk.getAttribute('data-i')) }
    var gt = e.target.closest('[data-go]');
    if (gt) return finish(gt.getAttribute('data-go'));
    if (e.target.closest('a')) return;
    if (intro.classList.contains('snd-wait') && unlockSound()) return;
    if (list[idx] !== 'final') go(idx + 1);
  });

  window.zpmIntro = { start: start };
  var rp = document.getElementById('zpm-replay');
  if (rp) rp.addEventListener('click', function (e) {
    var m = e.target.closest('[data-mode]'); if (!m) return;
    window.scrollTo(0, 0); start(m.getAttribute('data-mode'));
  });
  if (root.classList.contains('zpm-intro-on')) start('full');
  else if (rp) rp.hidden = false;
})();
