/*  Enzo 3D Car Game (pseudo-3D / arcade road renderer)
    - No frameworks
    - Single canvas
    - Smooth UI, shop, night mode, sfx via WebAudio
    - “3D” feel using perspective projection of road segments (OutRun-style)
*/

(() => {
  "use strict";

  // ---------- DOM ----------
  const menu = document.getElementById("menu");
  const gameScreen = document.getElementById("game");
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  const previewCanvas = document.getElementById("previewCanvas");
  const pctx = previewCanvas.getContext("2d", { alpha: false });

  const btnStart = document.getElementById("btnStart");
  const btnShop = document.getElementById("btnShop");
  const btnCredits = document.getElementById("btnCredits");
  const btnCreditsBack = document.getElementById("btnCreditsBack");
  const creditsModal = document.getElementById("creditsModal");

  const shopModal = document.getElementById("shopModal");
  const btnShopBack = document.getElementById("btnShopBack");
  const btnShopStart = document.getElementById("btnShopStart");
  const shopCoins = document.getElementById("shopCoins");

  const btnBackToMenu = document.getElementById("btnBackToMenu");

  const btnNightToggle = document.getElementById("btnNightToggle");
  const nightLabel = document.getElementById("nightLabel");
  const btnNightToggleMenu = document.getElementById("btnNightToggleMenu");
  const nightLabelMenu = document.getElementById("nightLabelMenu");

  const scoreText = document.getElementById("scoreText");
  const coinsText = document.getElementById("coinsText");
  const speedText = document.getElementById("speedText");
  const speedFill = document.getElementById("speedFill");

  const btnLeft = document.getElementById("btnLeft");
  const btnRight = document.getElementById("btnRight");
  const mobileControls = document.getElementById("mobileControls");

  const toast = document.getElementById("toast");

  const colorChoicesEl = document.getElementById("colorChoices");
  const wheelChoicesEl = document.getElementById("wheelChoices");
  const styleChoicesEl = document.getElementById("styleChoices");

  // ---------- UTIL ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const now = () => performance.now();

  function setScreen(which) {
    menu.classList.toggle("active", which === "menu");
    gameScreen.classList.toggle("active", which === "game");
  }

  function showModal(modalEl, show) {
    modalEl.classList.toggle("hidden", !show);
  }

  function showToast(msg, ms = 1200) {
    toast.textContent = msg;
    toast.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.add("hidden"), ms);
  }

  // ---------- AUDIO (no external assets) ----------
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  }

  function beep({ freq = 440, dur = 0.06, type = "square", gain = 0.06, slide = 0 } = {}) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide !== 0) o.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.01);
  }

  const sfx = {
    click() { ensureAudio(); beep({ freq: 560, dur: 0.05, type: "square", gain: 0.05, slide: -80 }); },
    coin()  { ensureAudio(); beep({ freq: 880, dur: 0.07, type: "triangle", gain: 0.06, slide: 220 }); },
    hit()   { ensureAudio(); beep({ freq: 160, dur: 0.08, type: "sawtooth", gain: 0.05, slide: -40 }); },
    reset() { ensureAudio(); beep({ freq: 240, dur: 0.09, type: "square", gain: 0.05, slide: 120 }); },
  };

  // ---------- STORAGE ----------
  const STORAGE_KEY = "enzo3dcar_save_v1";
  function loadSave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  function saveSave(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  }

  // ---------- SHOP DATA ----------
  const COLORS = [
    { id:"mint",  name:"MINT",  hex:"#7cffb3" },
    { id:"sky",   name:"SKY",   hex:"#66a3ff" },
    { id:"sun",   name:"SUN",   hex:"#ffd36b" },
    { id:"rose",  name:"ROSE",  hex:"#ff6fa3" },
    { id:"white", name:"WHITE", hex:"#eaf2ff" },
    { id:"lava",  name:"LAVA",  hex:"#ff5e4d" },
  ];

  const WHEELS = [
    { id:"classic", name:"CLASSIC" },
    { id:"sport",   name:"SPORT" },
    { id:"chunky",  name:"CHUNKY" },
  ];

  const STYLES = [
    { id:"hatch",  name:"HATCH",   price: 0,   desc:"Starter car" },
    { id:"coupe",  name:"COUPE",   price: 120, desc:"Fast look" },
    { id:"truck",  name:"TRUCK",   price: 220, desc:"Big body" },
    { id:"super",  name:"SUPER",   price: 400, desc:"Rare style" },
  ];

  // Save state defaults
  const save = loadSave() || {
    coinsTotal: 0,
    selectedColor: COLORS[0].id,
    selectedWheel: WHEELS[0].id,
    selectedStyle: STYLES[0].id,
    unlockedStyles: { hatch: true }
  };

  // ---------- INPUT ----------
  const input = {
    left: false,
    right: false,
    steer: 0, // -1..1 smoothed
  };

  window.addEventListener("keydown", (e) => {
    if (["ArrowLeft","ArrowRight","a","A","d","D"].includes(e.key)) e.preventDefault();
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") input.left = true;
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") input.right = true;
  }, { passive: false });

  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") input.left = false;
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") input.right = false;
  });

  function bindHold(btn, prop) {
    const on = (ev) => { ev.preventDefault(); ensureAudio(); input[prop] = true; };
    const off = (ev) => { ev.preventDefault(); input[prop] = false; };
    btn.addEventListener("pointerdown", on);
    btn.addEventListener("pointerup", off);
    btn.addEventListener("pointercancel", off);
    btn.addEventListener("pointerleave", off);
  }
  bindHold(btnLeft, "left");
  bindHold(btnRight, "right");

  // ---------- GAME STATE ----------
  const game = {
    running: false,
    night: false,

    // player
    playerX: 0,        // lateral position on road (-1..1)
    speed: 0,
    baseSpeed: 220,    // world units per second
    maxSpeed: 720,
    accel: 12,         // speed increase per second
    shake: 0,

    // scoring
    score: 0,
    runCoins: 0,
    distance: 0,

    // road / camera
    z: 0,
    roadWidth: 2200,
    segLength: 160,
    drawDist: 220,
    lanes: 2,

    // objects
    coins: [],
    obstacles: [],
    popups: [],

    // timers
    lastT: 0,
  };

  // ---------- RESIZE ----------
  function resize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels

    // preview canvas responsive draw scaling is handled via CSS; keep internal res fixed
  }
  window.addEventListener("resize", resize);

  // ---------- PSEUDO-3D PROJECTION ----------
  function project(worldX, worldY, worldZ, camX, camY, camZ, camDepth, screenW, screenH) {
    const dz = (worldZ - camZ);
    const scale = camDepth / Math.max(0.0001, dz);
    const x = (1 + scale * (worldX - camX) / screenW) * (screenW / 2);
    const y = (1 - scale * (worldY - camY) / screenH) * (screenH / 2);
    return { x, y, scale };
  }

  function lerpColor(a, b, t) {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
    const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
    const rr = Math.round(lerp(ar, br, t));
    const rg = Math.round(lerp(ag, bg, t));
    const rb = Math.round(lerp(ab, bb, t));
    return `rgb(${rr},${rg},${rb})`;
  }

  // ---------- WORLD GENERATION ----------
  // We generate “events” ahead of the camera based on segment index.
  // Deterministic-ish randomness per segment for consistency without storing infinite arrays.
  function hash(n) {
    // simple deterministic hash [0..1)
    const s = Math.sin(n * 999.1337) * 10000;
    return s - Math.floor(s);
  }

  function spawnAhead() {
    const camSeg = Math.floor(game.z / game.segLength);
    const ahead = camSeg + game.drawDist;

    // Keep lists small by removing far-behind items
    const behindZ = game.z - game.segLength * 10;
    game.coins = game.coins.filter(o => o.z > behindZ);
    game.obstacles = game.obstacles.filter(o => o.z > behindZ);
    game.popups = game.popups.filter(p => p.t < 1);

    // Spawn coins/obstacles in the next range if missing
    for (let i = camSeg; i < ahead; i++) {
      // coin lines
      if (hash(i * 3.1) < 0.08) {
        const lane = hash(i * 7.7) < 0.5 ? -0.5 : 0.5;
        const spread = (hash(i * 2.9) - 0.5) * 0.2;
        const z = (i + 1) * game.segLength + rand(20, 120);
        if (!game.coins.some(c => Math.abs(c.z - z) < 40)) {
          game.coins.push({
            x: clamp(lane + spread, -0.75, 0.75),
            y: 0,
            z,
            r: 26,
            rot: rand(0, Math.PI * 2),
            taken: false
          });
        }
      }

      // obstacles
      if (hash(i * 5.2) < 0.055) {
        const lane = hash(i * 11.2) < 0.5 ? -0.55 : 0.55;
        const z = (i + 1) * game.segLength + rand(30, 140);
        if (!game.obstacles.some(o => Math.abs(o.z - z) < 80)) {
          const type = hash(i * 13.3) < 0.5 ? "cone" : "block";
          game.obstacles.push({
            x: clamp(lane + (hash(i * 4.4) - 0.5) * 0.25, -0.8, 0.8),
            y: 0,
            z,
            w: type === "cone" ? 40 : 80,
            h: type === "cone" ? 58 : 50,
            type,
            hit: false
          });
        }
      }
    }
  }

  // ---------- RENDER HELPERS ----------
  function drawQuad(x1,y1,x2,y2,x3,y3,x4,y4, fill, stroke = null) {
    ctx.beginPath();
    ctx.moveTo(x1,y1);
    ctx.lineTo(x2,y2);
    ctx.lineTo(x3,y3);
    ctx.lineTo(x4,y4);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawPoly(points, fill, stroke = null) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i=1;i<points.length;i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // ---------- ENV COLORS ----------
  function envPalette(night) {
    if (!night) {
      return {
        skyTop: "#89d5ff",
        skyBot: "#fff0c6",
        fog: "#ffe8c9",
        road1: "#2a2f3a",
        road2: "#262b34",
        lane: "rgba(255,255,255,.35)",
        grass1: "#56c27a",
        grass2: "#4ab06d",
        curb1: "#dfe6f5",
        curb2: "#b9c5df",
        bld1: "#a8b7d6",
        bld2: "#8ea1c6",
        tree1: "#2f7a4b",
        tree2: "#3f9a5f",
        sunGlow: "rgba(255,210,120,.35)"
      };
    }
    return {
      skyTop: "#071024",
      skyBot: "#0b1a3c",
      fog: "#0b1833",
      road1: "#131722",
      road2: "#10141e",
      lane: "rgba(200,220,255,.22)",
      grass1: "#1f3b2e",
      grass2: "#193226",
      curb1: "#7f8fb5",
      curb2: "#5d6a8a",
      bld1: "#2d3550",
      bld2: "#1f263d",
      tree1: "#153425",
      tree2: "#1e4a35",
      sunGlow: "rgba(120,160,255,.18)"
    };
  }

  // ---------- DRAW BACKGROUND ----------
  function drawSky(pal, w, h) {
    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0, pal.skyTop);
    g.addColorStop(1, pal.skyBot);
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);

    // warm “sun” glow for morning / moon glow at night
    ctx.fillStyle = pal.sunGlow;
    ctx.beginPath();
    ctx.arc(w*0.72, h*0.18, Math.min(w,h)*0.22, 0, Math.PI*2);
    ctx.fill();
  }

  // ---------- DRAW ROAD & SCENERY (pseudo 3D) ----------
  function renderWorld(dt) {
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const pal = envPalette(game.night);

    // camera setup (behind & above car)
    const camH = 820;              // camera height
    const camDepth = 1.25;         // perspective strength
    const camX = game.playerX * game.roadWidth * 0.5;
    const camZ = game.z - 260;     // behind
    const camY = camH;

    // Sky
    drawSky(pal, W, H);

    // Fog overlay (distance haze)
    // We'll draw fog later as a subtle screen blend.
    // Road horizon line
    const horizon = H * 0.43;

    // Draw segments from far -> near for correct overlap
    const baseSeg = Math.floor(game.z / game.segLength);
    const maxSeg = baseSeg + game.drawDist;

    // subtle camera shake at high speed
    const shakeMag = game.shake * (0.6 + 0.4*Math.random());
    const shakeX = (Math.random()-0.5) * shakeMag;
    const shakeY = (Math.random()-0.5) * shakeMag;

    // Road curvature: keep mostly straight with tiny drift
    const curve = (Math.sin((game.z/3200)) * 0.08);

    let prev = null;
    for (let n = maxSeg; n >= baseSeg; n--) {
      const z1 = n * game.segLength;
      const z2 = (n + 1) * game.segLength;

      // make long straight road with minimal curve
      const xCenter1 = (n - baseSeg) * curve * 560;
      const xCenter2 = (n + 1 - baseSeg) * curve * 560;

      const p1 = project(xCenter1, 0, z1, camX, camY, camZ, camDepth * 1000, W, H);
      const p2 = project(xCenter2, 0, z2, camX, camY, camZ, camDepth * 1000, W, H);

      // offscreen / behind check
      if (p2.y >= H + 30) continue;
      if (p1.y < -200 && p2.y < -200) continue;

      const roadW1 = p1.scale * game.roadWidth;
      const roadW2 = p2.scale * game.roadWidth;

      const rumbleW1 = roadW1 * 0.13;
      const rumbleW2 = roadW2 * 0.13;

      const grassW1 = roadW1 * 2.2;
      const grassW2 = roadW2 * 2.2;

      // alternate stripes for depth
      const stripe = (n % 2 === 0);

      const y1 = p1.y + shakeY;
      const y2 = p2.y + shakeY;

      // Grass (left+right as one big quad)
      drawQuad(
        (W/2 - grassW1) + shakeX, y1,
        (W/2 + grassW1) + shakeX, y1,
        (W/2 + grassW2) + shakeX, y2,
        (W/2 - grassW2) + shakeX, y2,
        stripe ? pal.grass1 : pal.grass2
      );

      // Sidewalk / curb strips
      drawQuad(
        (W/2 - roadW1 - rumbleW1) + shakeX, y1,
        (W/2 - roadW1) + shakeX, y1,
        (W/2 - roadW2) + shakeX, y2,
        (W/2 - roadW2 - rumbleW2) + shakeX, y2,
        stripe ? pal.curb1 : pal.curb2
      );
      drawQuad(
        (W/2 + roadW1) + shakeX, y1,
        (W/2 + roadW1 + rumbleW1) + shakeX, y1,
        (W/2 + roadW2 + rumbleW2) + shakeX, y2,
        (W/2 + roadW2) + shakeX, y2,
        stripe ? pal.curb2 : pal.curb1
      );

      // Road
      drawQuad(
        (W/2 - roadW1) + shakeX, y1,
        (W/2 + roadW1) + shakeX, y1,
        (W/2 + roadW2) + shakeX, y2,
        (W/2 - roadW2) + shakeX, y2,
        stripe ? pal.road1 : pal.road2
      );

      // Lane center line
      ctx.strokeStyle = pal.lane;
      ctx.lineWidth = Math.max(1, p1.scale * 4);
      ctx.beginPath();
      ctx.moveTo((W/2 + shakeX), y1);
      ctx.lineTo((W/2 + shakeX), y2);
      ctx.stroke();

      // Buildings & trees as low-poly shapes on both sides
      // (place them every few segments)
      if (n % 6 === 0) {
        const depthT = clamp((n - baseSeg) / game.drawDist, 0, 1);
        const fogMix = depthT * 0.85;

        const bcol1 = lerpColor(pal.bld1, pal.fog, fogMix);
        const bcol2 = lerpColor(pal.bld2, pal.fog, fogMix);
        const tcol1 = lerpColor(pal.tree1, pal.fog, fogMix);
        const tcol2 = lerpColor(pal.tree2, pal.fog, fogMix);

        const sideOffset = roadW2 * 1.25;

        // left building
        const bx = (W/2 - sideOffset) + shakeX;
        const by = y2;
        const bw = roadW2 * 0.55;
        const bh = p2.scale * rand(420, 820);
        drawPoly([
          {x: bx - bw*0.62, y: by},
          {x: bx - bw*0.12, y: by},
          {x: bx - bw*0.16, y: by - bh},
          {x: bx - bw*0.68, y: by - bh*0.92},
        ], bcol1);

        // right building
        const rx = (W/2 + sideOffset) + shakeX;
        drawPoly([
          {x: rx + bw*0.12, y: by},
          {x: rx + bw*0.62, y: by},
          {x: rx + bw*0.68, y: by - bh*0.92},
          {x: rx + bw*0.16, y: by - bh},
        ], bcol2);

        // trees
        if (n % 12 === 0) {
          const th = p2.scale * rand(220, 340);
          const tw = p2.scale * rand(100, 140);
          // left tree
          drawPoly([
            {x: bx - bw*0.95, y: by},
            {x: bx - bw*0.80, y: by},
            {x: bx - bw*0.88, y: by - th},
          ], tcol1);
          // right tree
          drawPoly([
            {x: rx + bw*0.80, y: by},
            {x: rx + bw*0.95, y: by},
            {x: rx + bw*0.88, y: by - th},
          ], tcol2);
        }
      }

      prev = { p1, p2, roadW1, roadW2 };
    }

    // Draw coins & obstacles (near -> far sorting by z descending for correct overlap)
    const camDepthPx = camDepth * 1000;

    // COINS
    for (const c of game.coins) {
      if (c.taken) continue;
      const px = c.x * game.roadWidth * 0.5;
      const pr = project(px, 120, c.z, camX, camY, camZ, camDepthPx, W, H);
      if (pr.y < -80 || pr.y > H + 80) continue;

      const size = pr.scale * c.r * 4.0;
      const rot = c.rot;

      // “rotation” as a squished ellipse
      const squash = Math.abs(Math.cos(rot)) * 0.85 + 0.15;

      ctx.save();
      ctx.translate(pr.x + shakeX, pr.y + shakeY);
      ctx.scale(1, squash);

      // glow
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = game.night ? "rgba(120,180,255,.65)" : "rgba(255,220,120,.75)";
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.68, 0, Math.PI * 2);
      ctx.fill();

      // coin body
      ctx.globalAlpha = 1;
      ctx.fillStyle = game.night ? "#bcd6ff" : "#ffd36b";
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
      ctx.fill();

      // inner ring
      ctx.strokeStyle = "rgba(0,0,0,.25)";
      ctx.lineWidth = Math.max(1, size * 0.08);
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.28, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    // OBSTACLES
    for (const o of game.obstacles) {
      const px = o.x * game.roadWidth * 0.5;
      const pr = project(px, 0, o.z, camX, camY, camZ, camDepthPx, W, H);
      if (pr.y < -80 || pr.y > H + 100) continue;

      const ww = pr.scale * o.w * 3.3;
      const hh = pr.scale * o.h * 3.3;

      const fogT = clamp((o.z - game.z) / (game.drawDist * game.segLength), 0, 1);
      const fogMix = fogT * 0.75;
      const baseCol = (o.type === "cone") ? (game.night ? "#ff8aa3" : "#ff6a4d") : (game.night ? "#8fb0ff" : "#66a3ff");
      const col = lerpColor(baseCol, envPalette(game.night).fog, fogMix);

      ctx.save();
      ctx.translate(pr.x, pr.y);
      ctx.globalAlpha = o.hit ? 0.65 : 1;

      if (o.type === "cone") {
        // triangle cone
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(-ww*0.5, 0);
        ctx.lineTo(ww*0.5, 0);
        ctx.lineTo(0, -hh);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "rgba(0,0,0,.25)";
        ctx.lineWidth = Math.max(1, ww*0.06);
        ctx.beginPath();
        ctx.moveTo(-ww*0.28, -hh*0.35);
        ctx.lineTo(ww*0.28, -hh*0.35);
        ctx.stroke();
      } else {
        // block
        ctx.fillStyle = col;
        ctx.fillRect(-ww*0.5, -hh, ww, hh);
        ctx.strokeStyle = "rgba(0,0,0,.25)";
        ctx.lineWidth = Math.max(1, ww*0.05);
        ctx.strokeRect(-ww*0.5, -hh, ww, hh);

        // top bevel
        ctx.fillStyle = "rgba(255,255,255,.10)";
        ctx.fillRect(-ww*0.5, -hh, ww, hh*0.18);
      }

      ctx.restore();
    }

    // Fog overlay for depth (subtle)
    ctx.save();
    ctx.globalAlpha = game.night ? 0.18 : 0.14;
    const fg = ctx.createLinearGradient(0, horizon, 0, H);
    fg.addColorStop(0, "rgba(255,255,255,0)");
    fg.addColorStop(1, pal.fog);
    ctx.fillStyle = fg;
    ctx.fillRect(0,0,W,H);
    ctx.restore();

    // Motion blur hint at high speed (screen smear)
    const spdNorm = clamp((game.speed - 260) / (game.maxSpeed - 260), 0, 1);
    if (spdNorm > 0.25) {
      ctx.save();
      ctx.globalAlpha = 0.06 * spdNorm;
      ctx.fillStyle = game.night ? "#8fb0ff" : "#ffd36b";
      // diagonal streaks
      const streaks = 8;
      for (let i=0;i<streaks;i++){
        const x = (i/(streaks-1)) * W;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 80, H);
        ctx.lineTo(x + 105, H);
        ctx.lineTo(x + 25, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // Draw player car (screen space) — “third-person” view
    drawPlayerCar(W, H, pal, spdNorm);

    // Score popups
    for (const p of game.popups) {
      p.t += dt * 1.4;
      const a = 1 - clamp(p.t, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.col;
      ctx.font = `bold 14px ${getComputedStyle(document.body).fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.text, p.x, p.y - p.t * 26);
      ctx.restore();
    }
  }

  function drawPlayerCar(W, H, pal, spdNorm) {
    const color = COLORS.find(c => c.id === save.selectedColor)?.hex || "#7cffb3";
    const wheel = save.selectedWheel;
    const style = save.selectedStyle;

    const baseY = H * 0.76;
    const carW = Math.min(220, W * 0.26);
    const carH = carW * 0.62;

    const x = (W / 2) + game.playerX * (W * 0.22);
    const y = baseY + (Math.random() - 0.5) * (game.shake * 0.25);

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(x, y + carH*0.32, carW*0.42, carH*0.16, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // body shape based on style
    ctx.save();
    ctx.translate(x, y);

    // tiny wobble from speed
    const wobble = (Math.random()-0.5) * (0.8 + spdNorm*2.6);
    ctx.rotate(wobble * Math.PI/180);

    // body
    const bodyCol = color;
    const roofCol = lerpColor(color, "#000000", game.night ? 0.35 : 0.18);

    if (style === "truck") {
      // truck: longer back
      drawPoly([
        {x:-carW*0.46,y: carH*0.22},
        {x: carW*0.46,y: carH*0.22},
        {x: carW*0.40,y:-carH*0.30},
        {x:-carW*0.40,y:-carH*0.30},
      ], bodyCol, "rgba(0,0,0,.18)");

      drawPoly([
        {x:-carW*0.20,y:-carH*0.06},
        {x: carW*0.22,y:-carH*0.06},
        {x: carW*0.14,y:-carH*0.30},
        {x:-carW*0.14,y:-carH*0.30},
      ], roofCol);

      // bed
      ctx.fillStyle = "rgba(0,0,0,.18)";
      ctx.fillRect(-carW*0.34, -carH*0.08, carW*0.68, carH*0.18);
    } else if (style === "super") {
      // super: low sleek
      drawPoly([
        {x:-carW*0.48,y: carH*0.18},
        {x: carW*0.48,y: carH*0.18},
        {x: carW*0.34,y:-carH*0.34},
        {x:-carW*0.34,y:-carH*0.34},
      ], bodyCol, "rgba(0,0,0,.18)");
      drawPoly([
        {x:-carW*0.14,y:-carH*0.18},
        {x: carW*0.16,y:-carH*0.18},
        {x: carW*0.08,y:-carH*0.34},
        {x:-carW*0.08,y:-carH*0.34},
      ], roofCol);
      // spoiler
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.fillRect(-carW*0.18, -carH*0.38, carW*0.36, carH*0.06);
    } else if (style === "coupe") {
      // coupe: compact
      drawPoly([
        {x:-carW*0.44,y: carH*0.22},
        {x: carW*0.44,y: carH*0.22},
        {x: carW*0.34,y:-carH*0.30},
        {x:-carW*0.34,y:-carH*0.30},
      ], bodyCol, "rgba(0,0,0,.18)");
      drawPoly([
        {x:-carW*0.16,y:-carH*0.05},
        {x: carW*0.18,y:-carH*0.05},
        {x: carW*0.10,y:-carH*0.30},
        {x:-carW*0.10,y:-carH*0.30},
      ], roofCol);
    } else {
      // hatch: default
      drawPoly([
        {x:-carW*0.45,y: carH*0.24},
        {x: carW*0.45,y: carH*0.24},
        {x: carW*0.36,y:-carH*0.26},
        {x:-carW*0.36,y:-carH*0.26},
      ], bodyCol, "rgba(0,0,0,.18)");
      drawPoly([
        {x:-carW*0.18,y:-carH*0.02},
        {x: carW*0.20,y:-carH*0.02},
        {x: carW*0.12,y:-carH*0.26},
        {x:-carW*0.12,y:-carH*0.26},
      ], roofCol);
    }

    // headlights
    ctx.fillStyle = game.night ? "rgba(220,235,255,.95)" : "rgba(255,255,255,.55)";
    ctx.fillRect(-carW*0.34, -carH*0.28, carW*0.16, carH*0.08);
    ctx.fillRect( carW*0.18, -carH*0.28, carW*0.16, carH*0.08);

    // wheels
    const wheelCol = wheel === "sport" ? "#0a0c10" : wheel === "chunky" ? "#10151e" : "#0f1218";
    const rimCol = wheel === "sport" ? "#eaf2ff" : wheel === "chunky" ? "#b8c6ff" : "#cfd8ff";
    const wW = carW * (wheel === "chunky" ? 0.18 : 0.14);
    const wH = carH * (wheel === "chunky" ? 0.22 : 0.18);

    function wheelAt(wx, wy) {
      ctx.fillStyle = wheelCol;
      ctx.beginPath();
      ctx.ellipse(wx, wy, wW, wH, 0, 0, Math.PI*2);
      ctx.fill();

      ctx.strokeStyle = "rgba(0,0,0,.35)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.strokeStyle = rimCol;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(wx, wy, wW*0.55, wH*0.55, 0, 0, Math.PI*2);
      ctx.stroke();

      // spokes
      if (wheel !== "classic") {
        ctx.strokeStyle = "rgba(255,255,255,.25)";
        ctx.lineWidth = 1;
        for (let i=0;i<5;i++){
          const a = (i/5) * Math.PI*2 + (now()*0.008);
          ctx.beginPath();
          ctx.moveTo(wx, wy);
          ctx.lineTo(wx + Math.cos(a)*wW*0.62, wy + Math.sin(a)*wH*0.62);
          ctx.stroke();
        }
      }
    }

    wheelAt(-carW*0.28, carH*0.18);
    wheelAt( carW*0.28, carH*0.18);

    // rear lights
    ctx.fillStyle = "rgba(255,94,122,.55)";
    ctx.fillRect(-carW*0.34, carH*0.12, carW*0.16, carH*0.06);
    ctx.fillRect( carW*0.18, carH*0.12, carW*0.16, carH*0.06);

    // subtle outline
    ctx.strokeStyle = "rgba(0,0,0,.22)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  // ---------- COLLISIONS ----------
  function checkCollisions() {
    // Player “hitbox” in road coordinates
    const px = game.playerX; // -1..1
    const pz = game.z + 380; // car is ahead of camera; tune to feel right

    // coin pickup
    for (const c of game.coins) {
      if (c.taken) continue;
      const dz = Math.abs(c.z - pz);
      if (dz < 120 && Math.abs(c.x - px) < 0.22) {
        c.taken = true;
        game.runCoins += 1;
        game.score += 35;
        sfx.coin();
        game.popups.push({ text:"+35", x: canvas.clientWidth*0.5, y: canvas.clientHeight*0.55, t: 0, col: "#7cffb3" });
      }
    }

    // obstacle hit
    for (const o of game.obstacles) {
      if (o.hit) continue;
      const dz = Math.abs(o.z - pz);
      if (dz < 140 && Math.abs(o.x - px) < 0.25) {
        o.hit = true;
        sfx.hit();
        game.speed = Math.max(120, game.speed * 0.65);
        game.score = Math.max(0, game.score - 60);
        game.popups.push({ text:"-60", x: canvas.clientWidth*0.5, y: canvas.clientHeight*0.57, t: 0, col: "#ff5e7a" });
      }
    }

    // falling off road
    if (Math.abs(game.playerX) > 1.05) {
      resetRun("Off road! Run reset.");
    }
  }

  // ---------- UPDATE ----------
  function update(dt) {
    // steer smoothing
    const target = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    input.steer = lerp(input.steer, target, 1 - Math.pow(0.0001, dt)); // smooth exponential
    game.playerX = clamp(game.playerX + input.steer * dt * 1.15, -1.35, 1.35);

    // speed ramp
    const desiredBase = clamp(game.baseSpeed + game.distance * 0.06, game.baseSpeed, game.maxSpeed);
    game.speed = lerp(game.speed, desiredBase, 1 - Math.pow(0.001, dt));

    // subtle shake when fast
    const spdNorm = clamp((game.speed - 260) / (game.maxSpeed - 260), 0, 1);
    game.shake = lerp(game.shake, spdNorm * 10, 1 - Math.pow(0.001, dt));

    // advance world
    const dz = game.speed * dt;
    game.z += dz;
    game.distance += dz;
    game.score += dz * 0.02;

    // animate coins rotation
    for (const c of game.coins) c.rot += dt * 5.2;

    spawnAhead();
    checkCollisions();

    // UI
    scoreText.textContent = Math.floor(game.score).toString();
    coinsText.textContent = game.runCoins.toString();
    speedText.textContent = Math.floor(game.speed * 0.14).toString(); // “km/h style”
    speedFill.style.width = `${clamp((game.speed - 160) / (game.maxSpeed - 160), 0, 1) * 100}%`;
  }

  // ---------- LOOP ----------
  function loop(t) {
    if (!game.running) return;
    const dt = clamp((t - game.lastT) / 1000, 0, 0.033);
    game.lastT = t;

    update(dt);
    renderWorld(dt);

    requestAnimationFrame(loop);
  }

  // ---------- RUN CONTROL ----------
  function startRun() {
    ensureAudio();
    game.running = true;
    game.lastT = performance.now();

    // reset run stats but keep shop selections
    game.playerX = 0;
    game.speed = game.baseSpeed;
    game.score = 0;
    game.runCoins = 0;
    game.distance = 0;
    game.z = 0;

    game.coins = [];
    game.obstacles = [];
    game.popups = [];

    spawnAhead();

    setScreen("game");
    resize();
    requestAnimationFrame(loop);
  }

  function resetRun(msg = "Run reset!") {
    sfx.reset();
    // add earned coins to total
    save.coinsTotal += game.runCoins;
    saveSave(save);
    showToast(msg, 1200);
    // quick restart
    game.playerX = 0;
    game.speed = game.baseSpeed;
    game.score = 0;
    game.runCoins = 0;
    game.distance = 0;
    game.z = 0;
    game.coins = [];
    game.obstacles = [];
    game.popups = [];
    spawnAhead();
  }

  function stopRunToMenu() {
    // bank coins
    save.coinsTotal += game.runCoins;
    saveSave(save);
    game.running = false;
    setScreen("menu");
    renderMenuNightLabels();
  }

  // ---------- NIGHT MODE ----------
  function setNightMode(on) {
    game.night = !!on;
    nightLabel.textContent = game.night ? "ON" : "OFF";
    nightLabelMenu.textContent = game.night ? "ON" : "OFF";
  }
  function toggleNight() {
    setNightMode(!game.night);
    sfx.click();
    if (game.running) showToast(game.night ? "Night Mode ON" : "Night Mode OFF", 900);
  }
  function renderMenuNightLabels() {
    nightLabel.textContent = game.night ? "ON" : "OFF";
    nightLabelMenu.textContent = game.night ? "ON" : "OFF";
  }

  // ---------- SHOP UI ----------
  function elChoice(label, sub = "", locked = false) {
    const div = document.createElement("div");
    div.className = "choice" + (locked ? " locked" : "");
    div.innerHTML = `<div>${label}</div>${sub ? `<div class="tiny">${sub}</div>` : ""}`;
    return div;
  }

  function rebuildShop() {
    shopCoins.textContent = save.coinsTotal.toString();

    // colors
    colorChoicesEl.innerHTML = "";
    for (const c of COLORS) {
      const div = elChoice(c.name);
      div.style.borderColor = "rgba(255,255,255,.18)";
      div.style.boxShadow = `0 0 0 2px ${c.hex}22 inset`;
      div.addEventListener("click", () => {
        sfx.click();
        save.selectedColor = c.id;
        saveSave(save);
        rebuildShop();
      });
      if (save.selectedColor === c.id) div.classList.add("selected");

      // tiny swatch
      const sw = document.createElement("div");
      sw.style.marginTop = "8px";
      sw.style.height = "10px";
      sw.style.borderRadius = "999px";
      sw.style.background = c.hex;
      sw.style.border = "1px solid rgba(0,0,0,.25)";
      div.appendChild(sw);

      colorChoicesEl.appendChild(div);
    }

    // wheels
    wheelChoicesEl.innerHTML = "";
    for (const w of WHEELS) {
      const div = elChoice(w.name);
      div.addEventListener("click", () => {
        sfx.click();
        save.selectedWheel = w.id;
        saveSave(save);
        rebuildShop();
      });
      if (save.selectedWheel === w.id) div.classList.add("selected");
      wheelChoicesEl.appendChild(div);
    }

    // styles (unlock)
    styleChoicesEl.innerHTML = "";
    for (const s of STYLES) {
      const unlocked = !!save.unlockedStyles[s.id] || s.price === 0;
      if (s.price === 0) save.unlockedStyles[s.id] = true;

      const priceTag = s.price === 0 ? "FREE" : `${s.price} COINS`;
      const div = elChoice(s.name, priceTag, !unlocked);

      div.addEventListener("click", () => {
        ensureAudio();
        if (unlocked) {
          sfx.click();
          save.selectedStyle = s.id;
          saveSave(save);
          rebuildShop();
          return;
        }
        // try unlock
        if (save.coinsTotal >= s.price) {
          sfx.click();
          save.coinsTotal -= s.price;
          save.unlockedStyles[s.id] = true;
          save.selectedStyle = s.id;
          saveSave(save);
          rebuildShop();
          showToast(`Unlocked ${s.name}!`, 1000);
        } else {
          sfx.click();
          showToast("Not enough coins.", 900);
        }
      });

      if (save.selectedStyle === s.id) div.classList.add("selected");
      styleChoicesEl.appendChild(div);
    }

    drawPreview();
  }

  // ---------- PREVIEW RENDER ----------
  function drawPreview() {
    const W = previewCanvas.width;
    const H = previewCanvas.height;

    // draw a mini version of the scene + car
    const pal = envPalette(game.night);

    // background
    const g = pctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, pal.skyTop);
    g.addColorStop(1, pal.skyBot);
    pctx.fillStyle = g;
    pctx.fillRect(0,0,W,H);

    // horizon fog
    pctx.fillStyle = pal.sunGlow;
    pctx.beginPath();
    pctx.arc(W*0.78, H*0.20, 90, 0, Math.PI*2);
    pctx.fill();

    // road trapezoid
    pctx.fillStyle = pal.road1;
    pctx.beginPath();
    pctx.moveTo(W*0.30, H);
    pctx.lineTo(W*0.70, H);
    pctx.lineTo(W*0.58, H*0.52);
    pctx.lineTo(W*0.42, H*0.52);
    pctx.closePath();
    pctx.fill();

    // sidewalks
    pctx.fillStyle = pal.curb1;
    pctx.beginPath();
    pctx.moveTo(W*0.26, H);
    pctx.lineTo(W*0.30, H);
    pctx.lineTo(W*0.42, H*0.52);
    pctx.lineTo(W*0.38, H*0.52);
    pctx.closePath();
    pctx.fill();

    pctx.beginPath();
    pctx.moveTo(W*0.70, H);
    pctx.lineTo(W*0.74, H);
    pctx.lineTo(W*0.62, H*0.52);
    pctx.lineTo(W*0.58, H*0.52);
    pctx.closePath();
    pctx.fill();

    // buildings
    pctx.fillStyle = pal.bld1;
    pctx.fillRect(W*0.08, H*0.40, W*0.16, H*0.44);
    pctx.fillStyle = pal.bld2;
    pctx.fillRect(W*0.76, H*0.36, W*0.16, H*0.48);

    // trees
    pctx.fillStyle = pal.tree2;
    pctx.beginPath();
    pctx.moveTo(W*0.26, H*0.70);
    pctx.lineTo(W*0.22, H*0.86);
    pctx.lineTo(W*0.30, H*0.86);
    pctx.closePath();
    pctx.fill();

    pctx.beginPath();
    pctx.moveTo(W*0.74, H*0.70);
    pctx.lineTo(W*0.70, H*0.86);
    pctx.lineTo(W*0.78, H*0.86);
    pctx.closePath();
    pctx.fill();

    // car (reuse simplified draw)
    const color = COLORS.find(c => c.id === save.selectedColor)?.hex || "#7cffb3";
    const wheel = save.selectedWheel;
    const style = save.selectedStyle;

    const cx = W*0.5;
    const cy = H*0.78;
    const carW = 170;
    const carH = 110;

    // shadow
    pctx.globalAlpha = 0.35;
    pctx.fillStyle = "#000";
    pctx.beginPath();
    pctx.ellipse(cx, cy + carH*0.25, carW*0.38, carH*0.14, 0, 0, Math.PI*2);
    pctx.fill();
    pctx.globalAlpha = 1;

    const roofCol = lerpColor(color, "#000000", game.night ? 0.35 : 0.18);

    function poly(points, fill, stroke=null){
      pctx.beginPath();
      pctx.moveTo(points[0].x, points[0].y);
      for(let i=1;i<points.length;i++) pctx.lineTo(points[i].x, points[i].y);
      pctx.closePath();
      pctx.fillStyle = fill; pctx.fill();
      if(stroke){ pctx.strokeStyle = stroke; pctx.lineWidth = 2; pctx.stroke(); }
    }

    if (style === "truck") {
      poly([{x:cx-carW*0.46,y:cy+carH*0.18},{x:cx+carW*0.46,y:cy+carH*0.18},{x:cx+carW*0.40,y:cy-carH*0.26},{x:cx-carW*0.40,y:cy-carH*0.26}], color, "rgba(0,0,0,.18)");
      poly([{x:cx-carW*0.20,y:cy-carH*0.04},{x:cx+carW*0.22,y:cy-carH*0.04},{x:cx+carW*0.14,y:cy-carH*0.26},{x:cx-carW*0.14,y:cy-carH*0.26}], roofCol);
      pctx.fillStyle = "rgba(0,0,0,.18)";
      pctx.fillRect(cx-carW*0.34, cy-carH*0.02, carW*0.68, carH*0.16);
    } else if (style === "super") {
      poly([{x:cx-carW*0.48,y:cy+carH*0.14},{x:cx+carW*0.48,y:cy+carH*0.14},{x:cx+carW*0.34,y:cy-carH*0.32},{x:cx-carW*0.34,y:cy-carH*0.32}], color, "rgba(0,0,0,.18)");
      poly([{x:cx-carW*0.14,y:cy-carH*0.16},{x:cx+carW*0.16,y:cy-carH*0.16},{x:cx+carW*0.08,y:cy-carH*0.32},{x:cx-carW*0.08,y:cy-carH*0.32}], roofCol);
      pctx.fillStyle = "rgba(0,0,0,.25)";
      pctx.fillRect(cx-carW*0.18, cy-carH*0.36, carW*0.36, carH*0.05);
    } else if (style === "coupe") {
      poly([{x:cx-carW*0.44,y:cy+carH*0.18},{x:cx+carW*0.44,y:cy+carH*0.18},{x:cx+carW*0.34,y:cy-carH*0.26},{x:cx-carW*0.34,y:cy-carH*0.26}], color, "rgba(0,0,0,.18)");
      poly([{x:cx-carW*0.16,y:cy-carH*0.04},{x:cx+carW*0.18,y:cy-carH*0.04},{x:cx+carW*0.10,y:cy-carH*0.26},{x:cx-carW*0.10,y:cy-carH*0.26}], roofCol);
    } else {
      poly([{x:cx-carW*0.45,y:cy+carH*0.20},{x:cx+carW*0.45,y:cy+carH*0.20},{x:cx+carW*0.36,y:cy-carH*0.22},{x:cx-carW*0.36,y:cy-carH*0.22}], color, "rgba(0,0,0,.18)");
      poly([{x:cx-carW*0.18,y:cy-carH*0.02},{x:cx+carW*0.20,y:cy-carH*0.02},{x:cx+carW*0.12,y:cy-carH*0.22},{x:cx-carW*0.12,y:cy-carH*0.22}], roofCol);
    }

    // wheels
    const wheelCol = wheel === "sport" ? "#0a0c10" : wheel === "chunky" ? "#10151e" : "#0f1218";
    const rimCol = wheel === "sport" ? "#eaf2ff" : wheel === "chunky" ? "#b8c6ff" : "#cfd8ff";
    const wW = carW * (wheel === "chunky" ? 0.18 : 0.14);
    const wH = carH * (wheel === "chunky" ? 0.22 : 0.18);

    function wheelAt(wx, wy){
      pctx.fillStyle = wheelCol;
      pctx.beginPath();
      pctx.ellipse(wx, wy, wW, wH, 0, 0, Math.PI*2);
      pctx.fill();
      pctx.strokeStyle = "rgba(0,0,0,.35)";
      pctx.lineWidth = 2;
      pctx.stroke();
      pctx.strokeStyle = rimCol;
      pctx.lineWidth = 2;
      pctx.beginPath();
      pctx.ellipse(wx, wy, wW*0.55, wH*0.55, 0, 0, Math.PI*2);
      pctx.stroke();
    }
    wheelAt(cx-carW*0.28, cy+carH*0.16);
    wheelAt(cx+carW*0.28, cy+carH*0.16);

    // headline text
    pctx.fillStyle = "rgba(0,0,0,.25)";
    pctx.fillRect(0,0,W,34);
    pctx.fillStyle = "#eaf2ff";
    pctx.font = "bold 14px " + getComputedStyle(document.body).fontFamily;
    pctx.textAlign = "left";
    pctx.fillText("Preview", 12, 22);
  }

  // ---------- UI BUTTONS ----------
  function wireButtons() {
    const clicky = (fn) => () => { sfx.click(); fn(); };

    btnStart.addEventListener("click", clicky(() => startRun()));
    btnBackToMenu.addEventListener("click", clicky(() => stopRunToMenu()));

    btnCredits.addEventListener("click", clicky(() => showModal(creditsModal, true)));
    btnCreditsBack.addEventListener("click", clicky(() => showModal(creditsModal, false)));
    creditsModal.addEventListener("click", (e) => {
      if (e.target === creditsModal) { sfx.click(); showModal(creditsModal, false); }
    });

    btnShop.addEventListener("click", clicky(() => {
      rebuildShop();
      showModal(shopModal, true);
    }));
    btnShopBack.addEventListener("click", clicky(() => showModal(shopModal, false)));
    btnShopStart.addEventListener("click", clicky(() => {
      showModal(shopModal, false);
      startRun();
    }));
    shopModal.addEventListener("click", (e) => {
      if (e.target === shopModal) { sfx.click(); showModal(shopModal, false); }
    });

    btnNightToggle.addEventListener("click", toggleNight);
    btnNightToggleMenu.addEventListener("click", toggleNight);
  }

  // ---------- INIT ----------
  function init() {
    // default: show menu
    setScreen("menu");
    setNightMode(false);
    renderMenuNightLabels();
    wireButtons();

    // Make sure canvas matches viewport
    // (need a tick so layout exists)
    requestAnimationFrame(() => {
      resize();
      // render a still preview of the world behind menu (nice polish)
      // We'll draw a static “world” by temporarily rendering once.
      game.running = false;
      ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);
      renderWorld(0.016);
    });

    // Keep preview synced when shop closed/opened and on resize
    window.addEventListener("resize", () => {
      if (!shopModal.classList.contains("hidden")) drawPreview();
    });

    // Prevent context menu on mobile controls
    [btnLeft, btnRight].forEach(b => b.addEventListener("contextmenu", e => e.preventDefault()));

    // Save any default unlocks
    for (const s of STYLES) if (s.price === 0) save.unlockedStyles[s.id] = true;
    saveSave(save);
  }

  init();

})();
