/* ============================================================
   TrailMail — interactive landing
   3D scene (Three.js + bloom) · Lenis smooth scroll ·
   GSAP ScrollTrigger reveals · custom cursor · magnetic · tilt
   ============================================================ */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const Lenis = window.Lenis;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = window.matchMedia('(hover: none)').matches;
const isSmall = window.innerWidth < 760;

if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

/* ---------------------------------------------------------- */
/*  Preloader                                                 */
/* ---------------------------------------------------------- */
const preloader = document.getElementById('preloader');
const fill = document.getElementById('preloaderFill');
const pct = document.getElementById('preloaderPct');

function runPreloader(done) {
  if (reduceMotion) { preloader.classList.add('done'); done(); return; }
  let p = 0;
  const tick = () => {
    p += Math.random() * 16 + 6;
    if (p >= 100) p = 100;
    fill.style.width = p + '%';
    pct.textContent = Math.floor(p) + '%';
    if (p < 100) setTimeout(tick, 90 + Math.random() * 110);
    else setTimeout(() => { preloader.classList.add('done'); done(); }, 350);
  };
  tick();
}

/* ---------------------------------------------------------- */
/*  Smooth scroll (Lenis) + ScrollTrigger wiring              */
/* ---------------------------------------------------------- */
let lenis = null;
function initSmoothScroll() {
  if (reduceMotion || !Lenis) return;
  lenis = new Lenis({ duration: 1.15, smoothWheel: true, lerp: 0.09 });
  lenis.on('scroll', () => ScrollTrigger && ScrollTrigger.update());
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  // anchor links → lenis scroll
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el, { offset: -40 });
    });
  });
}

/* ---------------------------------------------------------- */
/*  3D Scene                                                  */
/* ---------------------------------------------------------- */
const palette = {
  blue: new THREE.Color('#0A84FF'),
  indigo: new THREE.Color('#5E5CE6'),
  violet: new THREE.Color('#7c5cff'),
  mint: new THREE.Color('#34d3a6'),
  white: new THREE.Color('#cfe0ff'),
};
let sceneState = { scrollT: 0 };

function softSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(180,200,255,0.7)');
  g.addColorStop(1, 'rgba(120,140,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function envelopeTexture() {
  const c = document.createElement('canvas');
  c.width = 160; c.height = 120;
  const ctx = c.getContext('2d');
  ctx.shadowColor = 'rgba(124,150,255,0.9)';
  ctx.shadowBlur = 22;
  const g = ctx.createLinearGradient(30, 24, 130, 88);
  g.addColorStop(0, '#d4e0ff');
  g.addColorStop(1, '#8ea6ff');
  rr(ctx, 30, 26, 100, 66, 12);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(36,54,130,0.85)';
  ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(36, 34); ctx.lineTo(80, 64); ctx.lineTo(124, 34);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  rr(ctx, 30, 26, 100, 66, 12);
  ctx.stroke();
  return new THREE.CanvasTexture(c);
}

function initScene() {
  const canvas = document.getElementById('scene');
  if (reduceMotion) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !isSmall, alpha: false, powerPreference: 'high-performance' });
  } catch (e) {
    canvas.style.display = 'none';
    return; // CSS fallback gradient remains
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isSmall ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x05060d, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060d, 0.022);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 0, 16);

  const root = new THREE.Group();
  scene.add(root);

  // ---- lights ----
  scene.add(new THREE.AmbientLight(0x4455aa, 0.6));
  const key = new THREE.PointLight(0x6a8bff, 2.2, 120);
  key.position.set(10, 12, 18);
  scene.add(key);
  const rim = new THREE.PointLight(0x7c5cff, 1.6, 120);
  rim.position.set(-14, -6, 6);
  scene.add(rim);

  /* ---- Particle haze ---- */
  const PCOUNT = isSmall ? 1100 : 2400;
  const pPos = new Float32Array(PCOUNT * 3);
  const pCol = new Float32Array(PCOUNT * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < PCOUNT; i++) {
    const r = 6 + Math.random() * 34;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pPos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.7;
    pPos[i * 3 + 2] = r * Math.cos(ph) - 6;
    tmp.copy(palette.blue).lerp(palette.violet, Math.random());
    if (Math.random() > 0.85) tmp.copy(palette.mint);
    pCol[i * 3] = tmp.r; pCol[i * 3 + 1] = tmp.g; pCol[i * 3 + 2] = tmp.b;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const sprite = softSprite();
  const pMat = new THREE.PointsMaterial({
    size: isSmall ? 0.14 : 0.12, map: sprite, vertexColors: true,
    transparent: true, opacity: 0.85, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const points = new THREE.Points(pGeo, pMat);
  root.add(points);

  /* ---- Central hub (the destination) ---- */
  const hub = new THREE.Group();
  root.add(hub);

  const icoGeo = new THREE.IcosahedronGeometry(3.2, 1);
  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(icoGeo),
    new THREE.LineBasicMaterial({ color: 0x6f8bff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending })
  );
  hub.add(wire);

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.5, 2),
    new THREE.MeshStandardMaterial({
      color: 0x14204a, emissive: 0x2a4dff, emissiveIntensity: 1.5,
      metalness: 0.6, roughness: 0.25, flatShading: true,
    })
  );
  hub.add(core);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sprite, color: 0x5e7bff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.set(11, 11, 1);
  hub.add(glow);

  /* ---- Orbiting light rings around the hub ---- */
  const rings = new THREE.Group();
  root.add(rings);
  const ringDefs = [
    { r: 5.2, tube: 0.045, col: 0x6f8bff, op: 0.55, rx: Math.PI * 0.5, ry: 0, spin: 0.25 },
    { r: 6.5, tube: 0.03, col: 0x7c5cff, op: 0.4, rx: Math.PI * 0.42, ry: 0.5, spin: -0.16 },
    { r: 7.9, tube: 0.02, col: 0x34d3a6, op: 0.28, rx: Math.PI * 0.6, ry: -0.4, spin: 0.1 },
  ];
  const ringMeshes = ringDefs.map((d) => {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(d.r, d.tube, 14, 180),
      new THREE.MeshBasicMaterial({ color: d.col, transparent: true, opacity: d.op, blending: THREE.AdditiveBlending })
    );
    m.rotation.set(d.rx, d.ry, 0);
    m.userData.spin = d.spin;
    m.userData.baseOp = d.op;
    m.userData.seed = Math.random() * 6;
    rings.add(m);
    return m;
  });

  /* ---- Parallax float layer (envelopes + near sparks) ---- */
  const floatGroup = new THREE.Group();
  scene.add(floatGroup);

  const NEAR = isSmall ? 130 : 260;
  const nPos = new Float32Array(NEAR * 3);
  const nCol = new Float32Array(NEAR * 3);
  for (let i = 0; i < NEAR; i++) {
    nPos[i * 3] = (Math.random() - 0.5) * 40;
    nPos[i * 3 + 1] = (Math.random() - 0.5) * 26;
    nPos[i * 3 + 2] = 2 + Math.random() * 12;
    tmp.copy(palette.violet).lerp(palette.mint, Math.random() * 0.5);
    nCol[i * 3] = tmp.r; nCol[i * 3 + 1] = tmp.g; nCol[i * 3 + 2] = tmp.b;
  }
  const nGeo = new THREE.BufferGeometry();
  nGeo.setAttribute('position', new THREE.BufferAttribute(nPos, 3));
  nGeo.setAttribute('color', new THREE.BufferAttribute(nCol, 3));
  const nearPoints = new THREE.Points(nGeo, new THREE.PointsMaterial({
    size: 0.32, map: sprite, vertexColors: true, transparent: true, opacity: 0.6,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  floatGroup.add(nearPoints);

  const envTex = envelopeTexture();
  const envelopes = [];
  const ENV = isSmall ? 4 : 7;
  for (let i = 0; i < ENV; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: envTex, transparent: true, opacity: 0, depthWrite: false,
    }));
    const base = new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 17, -3 - Math.random() * 16);
    s.position.copy(base);
    const sc = 1.2 + Math.random() * 1.5;
    s.scale.set(sc * 1.33, sc, 1);
    floatGroup.add(s);
    envelopes.push({ s, base, phase: Math.random() * Math.PI * 2, speed: 0.25 + Math.random() * 0.4, amp: 0.5 + Math.random() * 0.9, fade: 0, target: 0.55 + Math.random() * 0.3 });
  }

  /* ---- Email trails (comets flying to the hub) ---- */
  const TRAILS = isSmall ? 5 : 8;
  const TAIL = 26;
  const trails = [];
  for (let i = 0; i < TRAILS; i++) {
    // start far on a sphere, curve in toward the hub
    const a = (i / TRAILS) * Math.PI * 2 + Math.random();
    const rad = 13 + Math.random() * 7;
    const start = new THREE.Vector3(Math.cos(a) * rad, (Math.random() - 0.5) * 12, Math.sin(a) * rad - 4);
    const mid = new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    const end = new THREE.Vector3(0, 0, 0);
    const curve = new THREE.CatmullRomCurve3([start, start.clone().lerp(mid, 0.5), mid, mid.clone().lerp(end, 0.6), end]);

    // faint full arc
    const arcPts = curve.getPoints(60);
    const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPts);
    const arcCol = palette.blue.clone().lerp(palette.violet, Math.random());
    const arc = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({
      color: arcCol, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending,
    }));
    root.add(arc);

    // bright moving tail
    const tailGeo = new THREE.BufferGeometry();
    const tailPos = new Float32Array(TAIL * 3);
    const tailColArr = new Float32Array(TAIL * 3);
    const headCol = Math.random() > 0.7 ? palette.mint.clone() : arcCol.clone();
    for (let k = 0; k < TAIL; k++) {
      const f = k / (TAIL - 1);
      tailColArr[k * 3] = headCol.r * f; tailColArr[k * 3 + 1] = headCol.g * f; tailColArr[k * 3 + 2] = headCol.b * f;
    }
    tailGeo.setAttribute('position', new THREE.BufferAttribute(tailPos, 3));
    tailGeo.setAttribute('color', new THREE.BufferAttribute(tailColArr, 3));
    const tail = new THREE.Line(tailGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending,
    }));
    root.add(tail);

    // head spark
    const head = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sprite, color: headCol, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    head.scale.set(0.9, 0.9, 1);
    root.add(head);

    trails.push({
      curve, tail, tailGeo, head,
      t: Math.random(), speed: 0.05 + Math.random() * 0.05, tailLen: 0.10 + Math.random() * 0.05,
    });
  }

  /* ---- Bloom ---- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  let bloom = null;
  if (!isSmall) {
    bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.95, 0.62, 0.0);
    composer.addPass(bloom);
  }

  /* ---- Interaction state ---- */
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
  });

  // scroll progress → sceneState.scrollT (0..1)
  if (ScrollTrigger) {
    ScrollTrigger.create({
      trigger: document.body, start: 'top top', end: 'bottom bottom',
      onUpdate: (self) => { sceneState.scrollT = self.progress; },
    });
  }

  /* ---- Resize ---- */
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h); composer.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  /* ---- Pause when hidden ---- */
  let running = true;
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) clock.start(); });

  /* ---- Loop ---- */
  const clock = new THREE.Clock();
  const v = new THREE.Vector3();
  function animate() {
    requestAnimationFrame(animate);
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const et = clock.elapsedTime;
    const sT = sceneState.scrollT;

    // mouse ease + parallax
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
    root.rotation.y = mouse.x * 0.35 + et * 0.02;
    root.rotation.x = mouse.y * 0.2;

    // scroll: drift camera + intensify, with subtle breathing
    camera.position.z = 16 + sT * 6;
    camera.position.y = sT * -2.5 + Math.sin(et * 0.5) * 0.15;
    camera.position.x = Math.sin(et * 0.18) * 0.5;
    camera.lookAt(0, 0, 0);

    // parallax float layer reacts more strongly to the pointer (depth)
    floatGroup.rotation.y = mouse.x * 0.55 + et * 0.01;
    floatGroup.rotation.x = mouse.y * 0.32;
    nearPoints.rotation.y = -et * 0.02;

    points.rotation.y = et * 0.01;
    hub.rotation.y = et * 0.18;
    hub.rotation.x = et * 0.08;
    wire.material.opacity = 0.45 + Math.sin(et * 1.2) * 0.12;
    core.material.emissiveIntensity = 1.3 + Math.sin(et * 2) * 0.4 + sT * 0.6;
    glow.material.opacity = 0.75 + Math.sin(et * 1.5) * 0.12;
    if (bloom) bloom.strength = 0.85 + sT * 0.5 + Math.sin(et) * 0.05;

    // rings spin independently, opacity pulses around each ring's base
    for (const m of ringMeshes) {
      m.rotation.z += m.userData.spin * dt;
      m.material.opacity = m.userData.baseOp * (0.78 + Math.sin(et * 1.3 + m.userData.seed) * 0.22) + sT * 0.12;
    }
    rings.rotation.y = et * 0.05;

    // floating envelopes drift + fade in
    for (const e of envelopes) {
      e.fade += (e.target - e.fade) * 0.02;
      e.s.material.opacity = e.fade * (0.7 + Math.sin(et * 0.5 + e.phase) * 0.3);
      e.s.position.y = e.base.y + Math.sin(et * e.speed + e.phase) * e.amp;
      e.s.position.x = e.base.x + Math.cos(et * e.speed * 0.7 + e.phase) * e.amp * 0.5;
      e.s.material.rotation = Math.sin(et * 0.3 + e.phase) * 0.16;
    }

    // trails
    for (const tr of trails) {
      tr.t += tr.speed * dt;
      if (tr.t > 1) tr.t -= 1;
      const pos = tr.tailGeo.attributes.position.array;
      for (let k = 0; k < TAIL; k++) {
        const f = k / (TAIL - 1);
        let tt = tr.t - (1 - f) * tr.tailLen;
        if (tt < 0) tt += 1;
        tr.curve.getPointAt(tt, v);
        pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z;
      }
      tr.tailGeo.attributes.position.needsUpdate = true;
      tr.curve.getPointAt(tr.t, v);
      tr.head.position.copy(v);
      const pulse = 0.7 + Math.sin(et * 6 + tr.t * 10) * 0.25;
      tr.head.scale.set(pulse, pulse, 1);
    }

    composer.render();
  }
  animate();

  // intro
  if (gsap) {
    gsap.from(root.scale, { x: 0.4, y: 0.4, z: 0.4, duration: 2.2, ease: 'power3.out' });
    gsap.from(camera.position, { z: 30, duration: 2.4, ease: 'power3.out' });
  }
}

/* ---------------------------------------------------------- */
/*  Custom cursor                                             */
/* ---------------------------------------------------------- */
function initCursor() {
  if (isTouch || reduceMotion) return;
  const cur = document.getElementById('cursor');
  const dot = document.getElementById('cursorDot');
  let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
  window.addEventListener('pointermove', (e) => {
    x = e.clientX; y = e.clientY;
    dot.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
  });
  (function loop() {
    cx += (x - cx) * 0.18; cy += (y - cy) * 0.18;
    cur.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-50%)`;
    requestAnimationFrame(loop);
  })();
  document.addEventListener('mouseleave', () => cur.classList.add('is-hidden'));
  document.addEventListener('mouseenter', () => cur.classList.remove('is-hidden'));

  document.querySelectorAll('[data-cursor]').forEach((el) => {
    const type = el.getAttribute('data-cursor');
    el.addEventListener('mouseenter', () => {
      cur.classList.add(type === 'cta' ? 'is-cta' : 'is-hover');
    });
    el.addEventListener('mouseleave', () => cur.classList.remove('is-cta', 'is-hover'));
  });
}

/* ---------------------------------------------------------- */
/*  Magnetic buttons                                          */
/* ---------------------------------------------------------- */
function initMagnetic() {
  if (isTouch || reduceMotion || !gsap) return;
  document.querySelectorAll('[data-magnetic]').forEach((el) => {
    const strength = 0.4;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const mx = e.clientX - (r.left + r.width / 2);
      const my = e.clientY - (r.top + r.height / 2);
      gsap.to(el, { x: mx * strength, y: my * strength, duration: 0.5, ease: 'power3.out' });
    });
    el.addEventListener('pointerleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1,0.4)' });
    });
  });
}

/* ---------------------------------------------------------- */
/*  3D tilt cards                                             */
/* ---------------------------------------------------------- */
function initTilt() {
  if (isTouch || reduceMotion || !gsap) return;
  document.querySelectorAll('[data-tilt]').forEach((el) => {
    const max = 9;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(el, { rotationY: px * max, rotationX: -py * max, transformPerspective: 900, duration: 0.4, ease: 'power2.out' });
    });
    el.addEventListener('pointerleave', () => {
      gsap.to(el, { rotationY: 0, rotationX: 0, duration: 0.7, ease: 'elastic.out(1,0.5)' });
    });
  });
}

/* ---------------------------------------------------------- */
/*  Text splitting + scroll reveals                          */
/* ---------------------------------------------------------- */
function splitWords(el) {
  const text = el.textContent;
  el.innerHTML = '';
  // keep <em> styling by re-parsing simple cases: split on spaces of raw text
  text.split(/(\s+)/).forEach((chunk) => {
    if (/^\s+$/.test(chunk)) { el.appendChild(document.createTextNode(' ')); return; }
    if (!chunk) return;
    const w = document.createElement('span'); w.className = 'word';
    const inner = document.createElement('span'); inner.textContent = chunk;
    w.appendChild(inner); el.appendChild(w);
  });
  return el.querySelectorAll('.word > span');
}

function initReveals() {
  if (!gsap || !ScrollTrigger) return;

  if (reduceMotion) {
    document.querySelectorAll('.reveal-fade').forEach((e) => e.classList.add('is-in'));
    return;
  }

  // word reveals (preserve <em> by wrapping its words too)
  document.querySelectorAll('.reveal-words').forEach((el) => {
    // flatten <em> into marker so we can recolor after split
    const ems = [...el.querySelectorAll('em')].map((e) => e.textContent.trim());
    const spans = splitWords(el);
    // re-apply em styling to matching words
    el.querySelectorAll('.word > span').forEach((s) => {
      if (ems.some((t) => t.split(/\s+/).includes(s.textContent))) {
        s.style.background = 'linear-gradient(120deg,var(--blue),var(--violet))';
        s.style.webkitBackgroundClip = 'text';
        s.style.backgroundClip = 'text';
        s.style.color = 'transparent';
      }
    });
    gsap.set(spans, { yPercent: 115 });
    gsap.to(spans, {
      yPercent: 0, duration: 1, ease: 'power4.out', stagger: 0.045,
      scrollTrigger: { trigger: el, start: 'top 88%' },
    });
  });

  // fade-ups
  document.querySelectorAll('.reveal-fade').forEach((el) => {
    ScrollTrigger.create({
      trigger: el, start: 'top 90%',
      onEnter: () => el.classList.add('is-in'),
    });
  });

  // parallax on step media + showcase
  document.querySelectorAll('.step__media, .showcase__frame').forEach((el) => {
    gsap.fromTo(el, { y: 60 }, {
      y: -60, ease: 'none',
      scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });

  // pain / feature cards stagger
  gsap.utils.toArray('.pain-grid, .feat-grid').forEach((grid) => {
    gsap.from(grid.children, {
      y: 40, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08,
      scrollTrigger: { trigger: grid, start: 'top 85%' },
    });
  });

  // compare columns
  gsap.from('.compare__col', {
    y: 50, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.15,
    scrollTrigger: { trigger: '.compare', start: 'top 80%' },
  });
}

/* ---------------------------------------------------------- */
/*  Counters                                                  */
/* ---------------------------------------------------------- */
function initCounters() {
  if (!gsap || !ScrollTrigger) {
    document.querySelectorAll('.count').forEach((el) => el.textContent = el.dataset.to);
    return;
  }
  document.querySelectorAll('.count').forEach((el) => {
    const to = parseInt(el.dataset.to, 10);
    const obj = { v: 0 };
    gsap.to(obj, {
      v: to, duration: 1.6, ease: 'power2.out',
      onUpdate: () => { el.textContent = Math.round(obj.v); },
      scrollTrigger: { trigger: el, start: 'top 88%' },
    });
  });
}

/* ---------------------------------------------------------- */
/*  Nav scroll state + scroll progress                       */
/* ---------------------------------------------------------- */
function initChrome() {
  const nav = document.getElementById('nav');
  const bar = document.getElementById('scrollProgress');
  const onScroll = () => {
    const y = window.scrollY || document.documentElement.scrollTop;
    nav.classList.toggle('scrolled', y > 40);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ---------------------------------------------------------- */
/*  Hero intro (after preloader)                             */
/* ---------------------------------------------------------- */
function heroIntro() {
  if (!gsap) return;
  if (reduceMotion) {
    document.querySelectorAll('.hero .reveal-fade').forEach((e) => e.classList.add('is-in'));
    return;
  }
  const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
  tl.from('.nav', { y: -40, opacity: 0, duration: 0.9 })
    .from('.hero__title .line > span', { yPercent: 120, duration: 1.1, stagger: 0.12 }, '-=0.4')
    .to('.hero .reveal-fade', { opacity: 1, y: 0, duration: 0.9, stagger: 0.12, onStart() {
        document.querySelectorAll('.hero .reveal-fade').forEach((e) => e.classList.add('is-in'));
      } }, '-=0.7');
}

/* ---------------------------------------------------------- */
/*  Boot                                                      */
/* ---------------------------------------------------------- */
function boot() {
  initSmoothScroll();
  initScene();
  initCursor();
  initMagnetic();
  initTilt();
  initReveals();
  initCounters();
  initChrome();
  heroIntro();
  if (ScrollTrigger) ScrollTrigger.refresh();
}

runPreloader(boot);
window.addEventListener('load', () => ScrollTrigger && ScrollTrigger.refresh());
