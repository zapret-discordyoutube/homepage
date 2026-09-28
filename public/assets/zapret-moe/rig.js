/* WebGL-риг персонажа: части (основа без рук и отдельные руки) натянуты на сетки,
   кости с плавными весами гнут их, а «корень» каждой руки поворачивает её от
   плеча. Арт тянется, а не рвётся: кисть гнётся от запястья, когти сжимаются,
   пряди качаются — без дыр и двоения. Веса строит tools/rig-weights.py.

   Прототип: включается адресом с ?gl (выключается ?gl=0). Без WebGL, при
   «меньше движения» и при любой ошибке остаются обычные CSS-слои.          */
(function () {
  'use strict';

  var q = location.search;
  try {
    if (/[?&]gl=0\b/.test(q)) localStorage.removeItem('zpm-gl');
    else if (/[?&]gl\b/.test(q)) localStorage.setItem('zpm-gl', '1');
  } catch (e) {}
  var on = false;
  try { on = localStorage.getItem('zpm-gl') === '1' } catch (e) { on = /[?&]gl\b/.test(q) && !/[?&]gl=0\b/.test(q) }
  if (!on || !window.IntersectionObserver) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var SRC = document.currentScript && document.currentScript.src || '';
  var ROOT = SRC.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  var VER = (SRC.match(/[?&]v=([^&#]+)/) || [])[1];   // тот же хеш, что у скрипта: данные рига не застрянут в кеше
  var CHARS = ROOT + 'chars/';
  var D = Math.PI / 180;

  /* ── ключевые кадры: [доля цикла, значение, изинг до следующего ключа] ── */
  var EASE = {
    io: function (k) { return k * k * (3 - 2 * k) },
    in: function (k) { return k * k * k },                                // разгон замаха
    out: function (k) { return 1 - Math.pow(1 - k, 3) }                   // резкий удар и торможение
  };
  function track(keys, u) {
    for (var i = 1; i < keys.length; i++) {
      if (u <= keys[i][0]) {
        var a = keys[i - 1], b = keys[i], k = (u - a[0]) / (b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * EASE[a[2] || 'io'](k);
      }
    }
    return keys[keys.length - 1][1];
  }

  // тот же цикл, что zr-claw-l в home.css: замах вверх → удар к зрителю → отдача.
  // Левая рука — по часовой, правая — зеркально: срез арта у края уходит за кадр.
  var CLAW = {
    r: [[0, 1], [0.22, 7, 'in'], [0.31, -2, 'out'], [0.4, -1], [0.58, 2], [1, 1]],
    s: [[0, 1.02], [0.22, 1.06, 'in'], [0.31, 1.15, 'out'], [0.4, 1.11], [0.58, 1.03], [1, 1.02]],
    // кисть отгибается назад на замахе и хлёстко доворачивается в ударе
    hand: [[0, 0], [0.22, -6, 'in'], [0.31, 8, 'out'], [0.45, 3], [0.7, 0], [1, 0]],
    // когти раскрыты на замахе, смыкаются в ударе
    fing: [[0, 0.1], [0.2, -0.4], [0.3, 1, 'out'], [0.46, 0.85], [0.7, 0.1], [1, 0.1]]
  };

  var MOTION = {
    rkn: function (t, B, el) {
      ['L', 'R'].forEach(function (s, i) {
        // в драке (home.js) удары запускает хореография: el._claw — момент начала замаха
        var cl = el && el._claw, st = cl && cl[s];
        var u = cl ? (st ? Math.min(1, (performance.now() - st) / 3200) : 0) : ((t / 3.2) + (i ? 0.5 : 0)) % 1;
        var sg = i ? -1 : 1, c = track(CLAW.fing, u);
        B.root['arm' + s] = { r: sg * track(CLAW.r, u) * D, s: track(CLAW.s, u) };
        B['hand' + s] = { r: sg * track(CLAW.hand, u) * D, s: 1 + 0.03 * Math.max(0, c) };
        B['fing' + s] = { r: sg * 8 * c * D, s: 1 - 0.07 * c };
      });
      B.hairL = { r: (1.8 * Math.sin(t * 2 * Math.PI / 4.6)) * D };
      B.hairR = { r: (-1.9 * Math.sin(t * 2 * Math.PI / 4.1 + 1.7)) * D };
      var f = (t / 3.4) % 1;   // контровой свет мерцает, как zr-rim-rkn в home.css
      B.rim = f > 0.18 && f < 0.22 ? 0.35 : f > 0.6 && f < 0.63 ? 0.5 : 0.9;
    }
  };

  /* ── WebGL ── */
  var VS = [
    'attribute vec2 a_p;attribute vec4 a_w0;attribute vec4 a_w1;',
    'uniform mat3 u_b[8];uniform mat3 u_root;uniform vec2 u_size;uniform vec4 u_rect;varying vec2 v_uv;',
    'vec2 ap(vec2 p,mat3 m,float w){return mix(p,(m*vec3(p,1.)).xy,w);}',
    'void main(){vec2 p=a_p;',
    'p=ap(p,u_b[0],a_w0.x);p=ap(p,u_b[1],a_w0.y);p=ap(p,u_b[2],a_w0.z);p=ap(p,u_b[3],a_w0.w);',
    'p=ap(p,u_b[4],a_w1.x);p=ap(p,u_b[5],a_w1.y);p=ap(p,u_b[6],a_w1.z);p=ap(p,u_b[7],a_w1.w);',
    'p=(u_root*vec3(p,1.)).xy;',
    'v_uv=(a_p-u_rect.xy)/u_rect.zw;',
    'gl_Position=vec4(p.x/u_size.x*2.-1.,1.-p.y/u_size.y*2.,0.,1.);}'
  ].join('');
  var FS = 'precision mediump float;uniform sampler2D u_t;uniform float u_a;varying vec2 v_uv;' +
    'void main(){if(v_uv.x<0.||v_uv.y<0.||v_uv.x>1.||v_uv.y>1.)discard;gl_FragColor=texture2D(u_t,v_uv)*u_a;}';

  var dataCache = {};
  function loadRig(name) {
    return dataCache[name] || (dataCache[name] = fetch(ROOT + 'rig/' + name + '.json' + (VER ? '?v=' + VER : '')).then(function (r) {
      if (!r.ok) throw new Error('rig ' + r.status);
      return r.json();
    }));
  }
  function loadImg(src) {
    return new Promise(function (ok, no) {
      var im = new Image(); im.decoding = 'async';
      im.onload = function () { ok(im) }; im.onerror = no; im.src = src;
    });
  }

  // p' = A(p − pivot) + pivot + t, A = поворот·масштаб; mat3 по столбцам
  function mat(m, o, px, py, r, s, tx, ty) {
    var c = Math.cos(r) * s, sn = Math.sin(r) * s;
    m[o] = c; m[o + 1] = sn; m[o + 2] = 0;
    m[o + 3] = -sn; m[o + 4] = c; m[o + 5] = 0;
    m[o + 6] = px - (c * px - sn * py) + (tx || 0);
    m[o + 7] = py - (sn * px + c * py) + (ty || 0);
    m[o + 8] = 1;
  }

  function Rig(el, name) {
    this.el = el; this.name = name; this.visible = false; this.raf = 0;
    this.t0 = performance.now();
  }

  Rig.prototype.init = function () {
    var self = this;
    if (this.ready) return this.ready;
    return (this.ready = loadRig(this.name).then(function (d) {
      var srcs = [d.rim[0]].concat(d.parts.map(function (p) { return p.tex }));
      return Promise.all(srcs.map(function (s) { return loadImg(CHARS + s) })).then(function (ims) { self.build(d, ims) });
    }).catch(function (e) { self.fail(e) }));
  };

  Rig.prototype.build = function (d, ims) {
    var cv = document.createElement('canvas');
    cv.className = 'zr-l zr-glc';
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = '--x:0;--y:0;--w:' + d.w + ';--h:' + d.h;
    var opt = { alpha: true, premultipliedAlpha: true, antialias: true };
    var gl = cv.getContext('webgl2', opt), gl2 = !!gl;
    if (!gl) gl = cv.getContext('webgl', opt) || cv.getContext('experimental-webgl', opt);
    if (!gl) throw new Error('no webgl');
    this.cv = cv; this.gl = gl; this.d = d;

    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    this.pr = pr;
    this.loc = {
      p: gl.getAttribLocation(pr, 'a_p'), w0: gl.getAttribLocation(pr, 'a_w0'), w1: gl.getAttribLocation(pr, 'a_w1'),
      b: gl.getUniformLocation(pr, 'u_b'), root: gl.getUniformLocation(pr, 'u_root'), size: gl.getUniformLocation(pr, 'u_size'),
      rect: gl.getUniformLocation(pr, 'u_rect'), a: gl.getUniformLocation(pr, 'u_a'), t: gl.getUniformLocation(pr, 'u_t')
    };

    function tex(im) {
      var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      // WebGL2 умеет мипмапы для любых размеров — без них на телефоне картинка «искрит»
      if (gl2) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR) }
      else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      return t;
    }
    function buf(target, data) { var bf = gl.createBuffer(); gl.bindBuffer(target, bf); gl.bufferData(target, data, gl.STATIC_DRAW); return bf }

    // сетка части: вершины в координатах кадра по её прямоугольнику
    this.parts = d.parts.map(function (p, k) {
      var C = p.cols, R = p.rows, r = p.rect, pos = new Float32Array(C * R * 2), idx = new Uint16Array((C - 1) * (R - 1) * 6), n = 0;
      for (var y = 0; y < R; y++) for (var x = 0; x < C; x++) {
        pos[(y * C + x) * 2] = r[0] + x / (C - 1) * r[2]; pos[(y * C + x) * 2 + 1] = r[1] + y / (R - 1) * r[3];
      }
      for (y = 0; y < R - 1; y++) for (x = 0; x < C - 1; x++) {
        var a = y * C + x, b = a + 1, c = a + C, e = c + 1;
        idx[n++] = a; idx[n++] = b; idx[n++] = c; idx[n++] = b; idx[n++] = e; idx[n++] = c;
      }
      var bin = atob(p.weights), w = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) w[i] = bin.charCodeAt(i);
      return { d: p, count: n, tex: tex(ims[k + 1]), pos: buf(gl.ARRAY_BUFFER, pos), w: buf(gl.ARRAY_BUFFER, w), idx: buf(gl.ELEMENT_ARRAY_BUFFER, idx) };
    });
    this.rimTex = tex(ims[0]);
    this.mats = new Float32Array(8 * 9);
    this.root = new Float32Array(9);
    gl.uniform2f(this.loc.size, d.w, d.h);
    gl.uniform1i(this.loc.t, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    var self = this;
    cv.addEventListener('webglcontextlost', function (ev) { ev.preventDefault(); self.fail(new Error('context lost')) });
    var inn = this.el.querySelector('.zr-in');
    inn.insertBefore(cv, inn.firstChild);
    this.size();
    this.ro = window.ResizeObserver ? new ResizeObserver(function () { self.size() }) : null;
    if (this.ro) this.ro.observe(this.el);
    this.draw(performance.now());
    this.el.classList.add('zr-gl-on');
    if (this.visible) this.start();
  };

  Rig.prototype.size = function () {
    var r = this.el.getBoundingClientRect(), k = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.min(1920, Math.round(r.width * k))), h = Math.max(1, Math.round(w * this.d.h / this.d.w));
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h }
  };

  Rig.prototype.drawPart = function (P, texture, rect, alpha, B) {
    var gl = this.gl, L = this.loc, m = this.mats, p = P.d;
    for (var k = 0; k < 8; k++) {
      var bn = p.bones[k];
      if (bn) { var o = B[bn.id] || {}; mat(m, k * 9, bn.pivot[0], bn.pivot[1], o.r || 0, o.s || 1, o.tx, o.ty) }
      else mat(m, k * 9, 0, 0, 0, 1);
    }
    var ro = p.root && B.root[p.id] || {};
    mat(this.root, 0, p.root ? p.root[0] : 0, p.root ? p.root[1] : 0, ro.r || 0, ro.s || 1, ro.tx, ro.ty);
    gl.uniformMatrix3fv(L.b, false, m);
    gl.uniformMatrix3fv(L.root, false, this.root);
    gl.uniform4f(L.rect, rect[0], rect[1], rect[2], rect[3]);
    gl.uniform1f(L.a, alpha);
    gl.bindBuffer(gl.ARRAY_BUFFER, P.pos);
    gl.enableVertexAttribArray(L.p); gl.vertexAttribPointer(L.p, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, P.w);
    gl.enableVertexAttribArray(L.w0); gl.vertexAttribPointer(L.w0, 4, gl.UNSIGNED_BYTE, true, p.stride, 0);
    if (L.w1 >= 0) {
      if (p.stride >= 8) { gl.enableVertexAttribArray(L.w1); gl.vertexAttribPointer(L.w1, 4, gl.UNSIGNED_BYTE, true, p.stride, 4) }
      else { gl.disableVertexAttribArray(L.w1); gl.vertexAttrib4f(L.w1, 0, 0, 0, 0) }
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, P.idx);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.drawElements(gl.TRIANGLES, P.count, gl.UNSIGNED_SHORT, 0);
  };

  Rig.prototype.draw = function (now) {
    var gl = this.gl, B = { root: {} };
    // window.zpmRigT — время в мс для покадровой записи ролика (tools, тесты)
    MOTION[this.name]((typeof window.zpmRigT === 'number' ? window.zpmRigT : now - this.t0) / 1000, B, this.el);
    gl.viewport(0, 0, this.cv.width, this.cv.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    // контровой свет — сеткой основы, чтобы он качался вместе с прядями
    this.drawPart(this.parts[0], this.rimTex, this.d.rim.slice(1), B.rim == null ? 0.9 : B.rim, B);
    for (var i = 0; i < this.parts.length; i++) this.drawPart(this.parts[i], this.parts[i].tex, this.parts[i].d.rect, 1, B);
  };

  Rig.prototype.start = function () {
    var self = this;
    if (this.raf || !this.gl) return;
    (function loop(now) {
      if (!self.visible || document.hidden || !self.gl) { self.raf = 0; return }
      self.draw(now);
      self.raf = requestAnimationFrame(loop);
    })(performance.now());
  };

  Rig.prototype.fail = function (e) {
    if (window.console) console.warn('zpm rig:', e && e.message || e);
    this.gl = null;
    this.el.classList.remove('zr-gl-on');
    if (this.cv && this.cv.parentNode) this.cv.parentNode.removeChild(this.cv);
    if (this.ro) this.ro.disconnect();
  };

  var list = [];
  document.querySelectorAll('.zrig').forEach(function (el) {
    for (var name in MOTION) if (el.classList.contains('zr-' + name)) list.push(new Rig(el, name));
  });
  if (!list.length) return;
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (en) {
      var r = list.filter(function (x) { return x.el === en.target })[0];
      if (!r) return;
      r.visible = en.isIntersecting;
      if (r.visible) { r.init(); r.start() }
    });
  }, { rootMargin: '100px' });
  list.forEach(function (r) { io.observe(r.el) });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) list.forEach(function (r) { if (r.visible) r.start() }) });
})();
