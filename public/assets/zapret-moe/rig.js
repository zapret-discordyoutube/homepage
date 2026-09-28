/* WebGL-риг персонажа: основа, натянутая на сетку, и кости с плавными весами.
   Кость поворачивает и масштабирует вершины со своим весом 0…1, поэтому арт
   тянется, а не рвётся: руки гнутся от запястья, когти подгибаются, пряди
   качаются — без дыр и без копии руки под слоем. Веса строит tools/rig-weights.py.

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

  /* ── движение: по имени рига — функция, возвращающая кости на момент t ── */
  var D = Math.PI / 180;

  // кусочная кривая по ключам [доля, значение] со сглаживанием между ними
  function curve(keys, u) {
    for (var i = 1; i < keys.length; i++) {
      if (u <= keys[i][0]) {
        var a = keys[i - 1], b = keys[i], k = (u - a[0]) / (b[0] - a[0]);
        k = k * k * (3 - 2 * k);
        return a[1] + (b[1] - a[1]) * k;
      }
    }
    return keys[keys.length - 1][1];
  }
  var GRAB = [[0, 0], [0.34, 1], [0.44, 0.74], [0.52, 1.06], [0.74, 0.16], [1, 0]];
  var CLENCH = [[0, 0], [0.28, 0.1], [0.42, 1], [0.6, 0.92], [0.78, 0], [1, 0]];

  var MOTION = {
    // РКН-тян тянется когтями к зрителю: рука подаётся вперёд и внутрь,
    // кисть доворачивается, когти сжимаются в хватке; руки — вразнобой
    rkn: function (t, B) {
      ['L', 'R'].forEach(function (s, i) {
        var sg = i ? -1 : 1, u = (t / 2.9 + i * 0.5) % 1;
        var g = curve(GRAB, u), c = curve(CLENCH, u);
        var idle = Math.sin(t * 0.83 + i * 2.1), idle2 = Math.sin(t * 1.37 + i);
        // рука выбрасывается к зрителю: растёт наружу от тела (опора кости — у тела),
        // так срез арта у края кадра всегда уходит за кадр, а не внутрь
        B['arm' + s] = { r: sg * (1.5 * idle - 1.5 * g) * D, s: 1 + 0.07 * g + 0.012 * idle2, ty: -4 * idle };
        // кисть доворачивается в хватке, когти сжимаются к ладони
        B['hand' + s] = { r: sg * (-2.5 + 6 * g) * D, s: 1 + 0.03 * g };
        B['fing' + s] = { r: sg * 7 * c * D, s: 1 - 0.06 * c };
      });
      B.hairL = { r: 1.4 * Math.sin(t * 2 * Math.PI / 4.6) * D };
      B.hairR = { r: -1.5 * Math.sin(t * 2 * Math.PI / 4.1 + 1.7) * D };
      B.hairT = { r: 0.9 * Math.sin(t * 2 * Math.PI / 3.3 + 0.8) * D };
      // контровой свет мерцает, как zr-rim-rkn в home.css
      var f = (t / 3.4) % 1;
      B.rim = f > 0.18 && f < 0.22 ? 0.35 : f > 0.6 && f < 0.63 ? 0.5 : 0.9;
    }
  };

  /* ── WebGL ── */
  var VS = [
    'attribute vec2 a_p;attribute vec4 a_w0;attribute vec4 a_w1;attribute vec4 a_w2;',
    'uniform mat3 u_b[12];uniform vec2 u_size;uniform vec4 u_rect;varying vec2 v_uv;',
    'vec2 ap(vec2 p,mat3 m,float w){return mix(p,(m*vec3(p,1.)).xy,w);}',
    'void main(){vec2 p=a_p;',
    // цепочка по каждой руке: пальцы → кисть → рука; потом пряди
    'p=ap(p,u_b[0],a_w0.x);p=ap(p,u_b[1],a_w0.y);p=ap(p,u_b[2],a_w0.z);',
    'p=ap(p,u_b[3],a_w0.w);p=ap(p,u_b[4],a_w1.x);p=ap(p,u_b[5],a_w1.y);',
    'p=ap(p,u_b[6],a_w1.z);p=ap(p,u_b[7],a_w1.w);p=ap(p,u_b[8],a_w2.x);',
    'p=ap(p,u_b[9],a_w2.y);p=ap(p,u_b[10],a_w2.z);p=ap(p,u_b[11],a_w2.w);',
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

  function Rig(el, name) {
    this.el = el; this.name = name; this.visible = false; this.raf = 0;
    this.t0 = performance.now() - Math.random() * 3000;
  }

  Rig.prototype.init = function () {
    var self = this;
    if (this.ready) return this.ready;
    return (this.ready = loadRig(this.name).then(function (d) {
      return Promise.all([loadImg(CHARS + d.base), loadImg(CHARS + d.rim[0])]).then(function (ims) { self.build(d, ims[0], ims[1]) });
    }).catch(function (e) { self.fail(e) }));
  };

  Rig.prototype.build = function (d, base, rim) {
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

    // сетка: вершины в координатах кадра, треугольники ячейками
    var C = d.cols, R = d.rows, pos = new Float32Array(C * R * 2), idx = new Uint16Array((C - 1) * (R - 1) * 6), n = 0;
    for (var y = 0; y < R; y++) for (var x = 0; x < C; x++) {
      pos[(y * C + x) * 2] = x / (C - 1) * d.w; pos[(y * C + x) * 2 + 1] = y / (R - 1) * d.h;
    }
    for (y = 0; y < R - 1; y++) for (x = 0; x < C - 1; x++) {
      var a = y * C + x, b = a + 1, c = a + C, e = c + 1;
      idx[n++] = a; idx[n++] = b; idx[n++] = c; idx[n++] = b; idx[n++] = e; idx[n++] = c;
    }
    this.count = n;
    var bin = atob(d.weights), w = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) w[i] = bin.charCodeAt(i);

    function buf(target, data) { var bf = gl.createBuffer(); gl.bindBuffer(target, bf); gl.bufferData(target, data, gl.STATIC_DRAW); return bf }
    buf(gl.ARRAY_BUFFER, pos);
    var ap = gl.getAttribLocation(pr, 'a_p'); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
    buf(gl.ARRAY_BUFFER, w);
    ['a_w0', 'a_w1', 'a_w2'].forEach(function (nm, k) {
      var l = gl.getAttribLocation(pr, nm); if (l < 0) return;
      if (k * 4 < d.stride) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.UNSIGNED_BYTE, true, d.stride, k * 4) }
      else gl.vertexAttrib4f(l, 0, 0, 0, 0);
    });
    buf(gl.ELEMENT_ARRAY_BUFFER, idx);

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
    this.tBase = tex(base); this.tRim = tex(rim);
    this.u = {};
    ['u_size', 'u_rect', 'u_a', 'u_t'].forEach(function (k) { this.u[k] = gl.getUniformLocation(pr, k) }, this);
    this.uB = gl.getUniformLocation(pr, 'u_b');
    this.idx = {}; d.bones.forEach(function (bn, k) { this.idx[bn.id] = k }, this);
    this.mats = new Float32Array(12 * 9);
    gl.uniform2f(this.u.u_size, d.w, d.h);
    gl.uniform1i(this.u.u_t, 0);
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

  Rig.prototype.draw = function (now) {
    var gl = this.gl, d = this.d, B = {}, m = this.mats;
    // window.zpmRigT — время в мс для покадровой записи ролика (tools, тесты)
    MOTION[this.name]((typeof window.zpmRigT === 'number' ? window.zpmRigT : now - this.t0) / 1000, B);
    d.bones.forEach(function (bn, k) {
      var o = B[bn.id] || {}, r = o.r || 0, s = o.s || 1, c = Math.cos(r) * s, sn = Math.sin(r) * s;
      var px = bn.pivot[0], py = bn.pivot[1];
      // p' = A(p − pivot) + pivot + t;   mat3 по столбцам
      m[k * 9] = c; m[k * 9 + 1] = sn; m[k * 9 + 2] = 0;
      m[k * 9 + 3] = -sn; m[k * 9 + 4] = c; m[k * 9 + 5] = 0;
      m[k * 9 + 6] = px - (c * px - sn * py) + (o.tx || 0);
      m[k * 9 + 7] = py - (sn * px + c * py) + (o.ty || 0);
      m[k * 9 + 8] = 1;
    });
    for (var k = d.bones.length; k < 12; k++) { m[k * 9] = m[k * 9 + 4] = m[k * 9 + 8] = 1 }
    gl.viewport(0, 0, this.cv.width, this.cv.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix3fv(this.uB, false, m);
    gl.activeTexture(gl.TEXTURE0);
    // контровой свет — той же сеткой, иначе свечение отставало бы от рук
    var rr = d.rim;
    gl.bindTexture(gl.TEXTURE_2D, this.tRim);
    gl.uniform4f(this.u.u_rect, rr[1], rr[2], rr[3], rr[4]);
    gl.uniform1f(this.u.u_a, B.rim == null ? 0.9 : B.rim);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    gl.bindTexture(gl.TEXTURE_2D, this.tBase);
    gl.uniform4f(this.u.u_rect, 0, 0, d.w, d.h);
    gl.uniform1f(this.u.u_a, 1);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
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
