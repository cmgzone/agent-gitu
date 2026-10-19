
import * as THREE from '/vendor/three.module.js';
(function () {
  var canvas = document.getElementById('mascotCanvas');
  if (!canvas) return;
  canvas.width = 120;
  canvas.height = 85;
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
  } catch (e) {
    return;
  }
  renderer.setClearColor(0x000000, 0);
  var scene = new THREE.Scene();
  var cam = new THREE.OrthographicCamera(-12, 12, 8.5, -8.5, 0.1, 100);
  cam.position.set(0, 2, 30);
  cam.lookAt(0, 2.4, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 1.7));
  var dl = new THREE.DirectionalLight(0xffffff, 1.1);
  dl.position.set(4, 8, 10);
  scene.add(dl);

  function box(w, h, d, c) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c }));
  }
  var SKIN = 0xe8b98a, SUIT = 0x23231f, PANT = 0x1a1a17, GUN = 0x3a3a36, ACC = 0x7c6cf0;

  var root = new THREE.Group();
  scene.add(root);

  var legL = new THREE.Group(); legL.position.set(-0.45, 1.7, 0);
  var legLM = box(0.7, 1.7, 0.7, PANT); legLM.position.y = -0.85; legL.add(legLM); root.add(legL);
  var legR = new THREE.Group(); legR.position.set(0.45, 1.7, 0);
  var legRM = box(0.7, 1.7, 0.7, PANT); legRM.position.y = -0.85; legR.add(legRM); root.add(legR);

  var torso = box(1.9, 1.9, 1.0, SUIT); torso.position.y = 2.75; root.add(torso);
  var tie = box(0.3, 1.1, 0.12, ACC); tie.position.set(0, 2.8, 0.55); root.add(tie);

  var head = box(1.5, 1.5, 1.5, SKIN); head.position.y = 4.5; root.add(head);
  var shades = box(1.52, 0.35, 0.25, 0x111111); shades.position.set(0, 4.65, 0.7); root.add(shades);
  var hat = box(1.7, 0.5, 1.7, 0x111111); hat.position.y = 5.45; root.add(hat);
  var brim = box(1.7, 0.12, 0.9, 0x111111); brim.position.set(0, 5.25, 1.15); root.add(brim);

  var armL = new THREE.Group(); armL.position.set(-1.25, 3.6, 0);
  var armLM = box(0.55, 1.6, 0.55, SUIT); armLM.position.y = -0.7; armL.add(armLM); root.add(armL);
  var armR = new THREE.Group(); armR.position.set(1.25, 3.6, 0);
  var armRM = box(0.55, 1.6, 0.55, SUIT); armRM.position.y = -0.7; armR.add(armRM);
  var gun = new THREE.Group(); gun.position.set(0, -1.5, 0.2);
  var g1 = box(0.35, 0.5, 1.7, GUN); g1.position.set(0, 0, 0.6); gun.add(g1);
  var g2 = box(0.3, 0.7, 0.4, GUN); g2.position.set(0, -0.45, 0.1); gun.add(g2);
  var flash = box(0.55, 0.55, 0.6, 0xffd23a); flash.position.set(0, 0.05, 1.7); flash.visible = false; gun.add(flash);
  armR.add(gun); root.add(armR);

  var mode = 'walk';
  var modeT = 0;
  var t = 0;
  var nameX = -11;
  var nameEl = document.getElementById('mascotName');
  window.__mascot = {
    setMode: function (m) {
      if (m !== mode) { mode = m; modeT = 0; }
    }
  };

  var clock = new THREE.Clock();
  // Render gating: an endless rAF that draws every frame wastes CPU/GPU when
  // the mascot is hidden (small screens hide #mascotWrap via CSS) or the tab
  // is in the background. The loop fully STOPS while hidden and restarts on
  // visibility/resize so typing and streaming stay smooth.
  var rafId = 0;
  var mascotVisible = true;
  var mascotMq = window.matchMedia ? window.matchMedia('(max-width: 720px)') : null;
  function mascotIsHidden() {
    if (document.hidden) return true;
    if (mascotMq && mascotMq.matches) return true;
    var w = document.getElementById('mascotWrap');
    return !w || getComputedStyle(w).display === 'none';
  }
  function updateMascotVisibility() {
    var hidden = mascotIsHidden();
    if (hidden === mascotVisible) return;
    mascotVisible = !hidden;
    if (mascotVisible) {
      clock.getDelta(); // drop the time accumulated while hidden
      rafId = requestAnimationFrame(tick);
    } else if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }
  if (mascotMq) {
    if (mascotMq.addEventListener) mascotMq.addEventListener('change', updateMascotVisibility);
    else if (mascotMq.addListener) mascotMq.addListener(updateMascotVisibility);
  }
  document.addEventListener('visibilitychange', updateMascotVisibility);
  window.addEventListener('resize', updateMascotVisibility);
  function tick() {
    rafId = requestAnimationFrame(tick);
    if (!mascotVisible) return;
    var dt = Math.min(0.05, clock.getDelta());
    t += dt;
    modeT += dt;

    if (mode === 'walk') {
      var s = Math.sin(t * 9);
      legL.rotation.x = s * 0.7; legR.rotation.x = -s * 0.7;
      armL.rotation.x = -s * 0.5;
      armR.rotation.x = -0.5; armR.rotation.z = -0.12;
      root.position.x = Math.min(2, -9 + modeT * 3.2);
      root.position.y = Math.abs(Math.cos(t * 9)) * 0.15;
      if (modeT > 4.0) { mode = 'idle'; modeT = 0; }
    } else if (mode === 'thinking') {
      legL.rotation.x = 0; legR.rotation.x = 0;
      armL.rotation.x = -1.2; armL.rotation.z = 0.4;
      armR.rotation.x = -0.5; armR.rotation.z = -0.1;
      head.rotation.z = 0.15; head.rotation.x = Math.sin(t * 3) * 0.05;
      root.position.x = 2;
      root.position.y = Math.sin(t * 2) * 0.04;
      if (modeT > 1.8) { mode = 'idle'; modeT = 0; head.rotation.z = 0; head.rotation.x = 0; }
    } else if (mode === 'coding') {
      legL.rotation.x = 0; legR.rotation.x = 0;
      armL.rotation.x = -1.1 + Math.sin(t * 20) * 0.15; armL.rotation.z = 0.15;
      armR.rotation.x = -1.1 + Math.cos(t * 20) * 0.15; armR.rotation.z = -0.15;
      root.position.x = 2;
      root.position.y = Math.sin(t * 2) * 0.04;
      if (modeT > 1.8) { mode = 'idle'; modeT = 0; }
    } else if (mode === 'testing') {
      legL.rotation.x = 0; legR.rotation.x = 0;
      armL.rotation.x = -0.3; armL.rotation.z = 0;
      armR.rotation.x = -1.35 + Math.sin(t * 6) * 0.05; armR.rotation.z = -0.05;
      root.position.x = 2;
      root.position.y = Math.sin(t * 2) * 0.04;
      if (modeT > 1.8) { mode = 'idle'; modeT = 0; }
    } else if (mode === 'celebrate') {
      legL.rotation.x = 0.15; legR.rotation.x = -0.15;
      armL.rotation.x = -2.2 + Math.sin(t * 12) * 0.1; armL.rotation.z = 0.3;
      armR.rotation.x = -2.2 + Math.sin(t * 12) * 0.1; armR.rotation.z = -0.3;
      root.position.x = 2;
      root.position.y = 0.3 + Math.abs(Math.sin(t * 10)) * 0.25;
      if (modeT > 1.8) { mode = 'idle'; modeT = 0; }
    } else if (mode === 'shield') {
      legL.rotation.x = 0.2; legR.rotation.x = -0.2;
      armL.rotation.x = -1.5; armL.rotation.z = 0.6;
      armR.rotation.x = -1.5; armR.rotation.z = -0.6;
      root.position.x = 2;
      root.position.y = Math.sin(t * 2) * 0.03;
      if (modeT > 1.8) { mode = 'idle'; modeT = 0; }
    } else if (mode === 'shoot') {
      legL.rotation.x = 0.25; legR.rotation.x = -0.25;
      armR.rotation.x = -1.35 + Math.sin(t * 28) * 0.07;
      armR.rotation.z = 0;
      armL.rotation.x = 0.35;
      flash.visible = (Math.floor(t * 14) % 2 === 0);
      root.position.x = 2;
      root.position.y = Math.sin(t * 28) * 0.04;
      if (modeT > 1.8) { mode = 'idle'; modeT = 0; }
    } else {
      legL.rotation.x = 0; legR.rotation.x = 0;
      armR.rotation.x = -0.85; armR.rotation.z = -0.08;
      armL.rotation.x = 0; armL.rotation.z = 0;
      head.rotation.z = 0; head.rotation.x = 0;
      flash.visible = false;
      root.position.x = 2;
      root.position.y = Math.sin(t * 2) * 0.06;
    }
    // The name tag hangs BELOW the character (never over its face) and
    // follows it with easing, clamped so it stays inside the wrap.
    var targetX = root.position.x;
    nameX += (targetX - nameX) * 0.05;
    if (nameEl) {
      var charPx = Math.max(44, Math.min(196, Math.round((nameX + 12) / 24 * 240)));
      nameEl.style.left = charPx + 'px';
      nameEl.style.opacity = mode === 'idle' ? '0.85' : '1';
    }
    renderer.render(scene, cam);
  }
  mascotVisible = !mascotIsHidden();
  if (mascotVisible) rafId = requestAnimationFrame(tick);
})();
