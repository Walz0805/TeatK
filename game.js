const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const hpFill = document.getElementById('hpFill');
const levelText = document.getElementById('levelText');
const scoreText = document.getElementById('scoreText');
const killText = document.getElementById('killText');
const startPanel = document.getElementById('startPanel');
const gameOverPanel = document.getElementById('gameOverPanel');
const finalText = document.getElementById('finalText');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const attackBtn = document.getElementById('attackBtn');
const joystick = document.getElementById('joystick');
const stick = document.getElementById('stick');

const DPR = () => Math.max(1, Math.min(2, window.devicePixelRatio || 1));
let W = 0, H = 0;
function resize() {
  const dpr = DPR();
  const vv = window.visualViewport;
  W = Math.floor(vv ? vv.width : window.innerWidth);
  H = Math.floor(vv ? vv.height : window.innerHeight);
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
window.visualViewport && window.visualViewport.addEventListener('resize', resize);
resize();

const spriteKinds = ['tangtang', 'kengkeng'];
const spriteStates = ['idle', 'move', 'charge', 'bite'];
const sprites = {};
for (const kind of spriteKinds) {
  sprites[kind] = {};
  for (const state of spriteStates) {
    const img = new Image();
    img.src = `assets/sprites/${kind}_${state}.png`;
    sprites[kind][state] = img;
  }
}

const input = { x: 0, y: 0, active: false };
const keys = new Set();
let running = false;
let gameOver = false;
let time = 0;
let score = 0;
let kills = 0;
let particles = [];
let enemies = [];
let foods = [];
let bubbles = [];
const isTouchDevice = matchMedia('(pointer: coarse)').matches;
function isLandscape() { return window.innerWidth > window.innerHeight; }

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const angleDiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

function createFish({kind, x, y, level = 1, isPlayer = false}) {
  const radius = isPlayer ? (isTouchDevice ? (isLandscape() ? 48 : 50) : 54) : 26 + level * 3;
  const maxHp = isPlayer ? 180 : 26 + level * 15;
  return {
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    dir: isPlayer ? 0 : Math.PI,
    radius,
    level,
    hp: maxHp,
    maxHp,
    atk: isPlayer ? 34 : 3 + level * 3,
    speed: isPlayer ? (isTouchDevice ? (isLandscape() ? 2.45 : 2.65) : 2.9) : 0.30 + Math.random() * 0.16 + level * 0.03,
    isPlayer,
    attackTimer: 0,
    cooldown: 0,
    hitDone: false,
    hurtTimer: 0,
    stunTimer: 0,
    exp: 0,
    nextExp: 60,
    name: isPlayer ? '糖糖' : '坑坑',
    wobble: rand(0, Math.PI * 2),
    dead: false,
    eatTimer: 0,
    eatFromPlayer: false,
    rewardDone: false,
  };
}

let player = createFish({kind: 'tangtang', x: W * .5, y: H * .5, isPlayer: true});

function resetGame() {
  time = 0;
  score = 0;
  kills = 0;
  gameOver = false;
  running = true;
  player = createFish({kind: 'tangtang', x: W * .5, y: H * .55, isPlayer: true});
  enemies = [];
  foods = [];
  particles = [];
  bubbles = [];
  for (let i = 0; i < 2; i++) spawnEnemy(true);
  for (let i = 0; i < 30; i++) spawnFood();
  for (let i = 0; i < 65; i++) {
    bubbles.push({x: rand(0, W), y: rand(0, H), r: rand(1, 5), s: rand(.25, 1.05), a: rand(.15, .55)});
  }
  startPanel.classList.add('hidden');
  gameOverPanel.classList.add('hidden');
}

function enemyTargetCount() {
  return Math.min(2 + Math.floor(player.level / 3), 5);
}

function spawnEnemy(initial = false) {
  const side = Math.floor(rand(0, 4));
  let x, y;
  const margin = initial ? 140 : 80;
  if (side === 0) { x = -margin; y = rand(120, H - 80); }
  if (side === 1) { x = W + margin; y = rand(120, H - 80); }
  if (side === 2) { x = rand(80, W - 80); y = 90 - margin; }
  if (side === 3) { x = rand(80, W - 80); y = H + margin; }
  const level = clamp(Math.floor(rand(player.level - 2, player.level + 1.15)), 1, 8);
  enemies.push(createFish({kind: 'kengkeng', x, y, level}));
}

function spawnFood() {
  foods.push({x: rand(35, W - 35), y: rand(isLandscape() ? 65 : 90, H - 35), r: rand(5, 10), t: rand(0, 10)});
}

function mouthPos(fish) {
  return {
    x: fish.x + Math.cos(fish.dir) * fish.radius * 1.05,
    y: fish.y + Math.sin(fish.dir) * fish.radius * 0.3,
  };
}

function tryAttack(fish) {
  if (fish.cooldown > 0 || fish.attackTimer > 0 || fish.stunTimer > 0 || fish.dead) return;
  fish.attackTimer = 18;
  fish.cooldown = fish.isPlayer ? 24 : 96;
  fish.hitDone = false;
  fish.stunTimer = fish.isPlayer ? 2 : 12;
  fish.vx += Math.cos(fish.dir) * (fish.isPlayer ? 4.2 : 1.6);
  fish.vy += Math.sin(fish.dir) * (fish.isPlayer ? 4.2 : 1.6);
  const m = mouthPos(fish);
  makeBurst(m.x, m.y, fish.isPlayer ? '#ffd7ec' : '#ffe2a8', 9);
}

function attackHit(attacker, target) {
  if (attacker.dead || target.dead) return false;
  const dx = target.x - attacker.x;
  const dy = target.y - attacker.y;
  const d = Math.hypot(dx, dy);
  const reach = attacker.radius * (attacker.isPlayer ? 2.15 : 1.1) + target.radius * .55;
  if (d > reach) return false;
  const a = Math.atan2(dy, dx);
  return Math.abs(angleDiff(a, attacker.dir)) < Math.PI * (attacker.isPlayer ? .62 : .30);
}

function rewardKill(e) {
  if (e.rewardDone) return;
  e.rewardDone = true;
  score += e.level * 100;
  kills += 1;
  player.exp += e.level * 18;
  player.hp = Math.min(player.maxHp, player.hp + 24 + e.level * 8);
  makeBurst(e.x, e.y, '#ffe66d', 22);
  while (player.exp >= player.nextExp) {
    player.exp -= player.nextExp;
    player.level++;
    player.maxHp += 36;
    player.hp = player.maxHp;
    player.atk += 9;
    player.radius += 2.5;
    player.nextExp = Math.floor(player.nextExp * 1.35 + 25);
    makeText(player.x, player.y - 90, '糖糖升级！', '#fff176');
  }
}

function startEat(target, attacker) {
  if (target.dead) return;
  target.dead = true;
  target.eatTimer = 14;
  target.eatFromPlayer = attacker.isPlayer;
  target.vx = 0;
  target.vy = 0;
  target.targetFish = attacker;
  if (attacker.isPlayer) rewardKill(target);
}

function damage(target, amount, from) {
  if (target.dead) return;
  target.hp -= amount;
  target.hurtTimer = 12;
  target.vx += Math.cos(from.dir) * 3.8;
  target.vy += Math.sin(from.dir) * 3.8;
  makeBurst(target.x, target.y, target.isPlayer ? '#ff5d9a' : '#ffd166', 10);
}

function makeBurst(x, y, color, n = 10) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(1, 5);
    particles.push({x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(18, 36), max: 36, r: rand(2, 6), color, text: null});
  }
}

function makeText(x, y, text, color) {
  particles.push({x, y, vx: 0, vy: -1.5, life: 60, max: 60, r: 0, color, text});
}

function updatePlayer() {
  let mx = input.x, my = input.y;
  let kx = 0, ky = 0;
  if (keys.has('arrowleft') || keys.has('a')) kx -= 1;
  if (keys.has('arrowright') || keys.has('d')) kx += 1;
  if (keys.has('arrowup') || keys.has('w')) ky -= 1;
  if (keys.has('arrowdown') || keys.has('s')) ky += 1;
  if (kx || ky) {
    const l = Math.hypot(kx, ky) || 1;
    mx = kx / l;
    my = ky / l;
  }
  if (player.stunTimer <= 0) {
    player.vx += mx * player.speed * .40;
    player.vy += my * player.speed * .40;
  }
  if (Math.hypot(mx, my) > .05) player.dir = Math.atan2(my, mx);
  player.vx *= .80;
  player.vy *= .80;
  if (player.attackTimer > 10) {
    player.vx += Math.cos(player.dir) * .5;
    player.vy += Math.sin(player.dir) * .5;
  }
  player.x += player.vx;
  player.y += player.vy;
  player.x = clamp(player.x, player.radius + 10, W - player.radius - 10);
  player.y = clamp(player.y, (isLandscape() ? 54 : 88) + player.radius, H - player.radius - 10);
}

function updateEnemy(e) {
  if (e.dead) return;
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const toPlayer = Math.atan2(dy, dx);

  let desired = toPlayer;
  if (e.level <= player.level && d < 280) {
    desired = toPlayer + Math.PI; // weaker fish flee when close
  } else if (Math.abs(e.level - player.level) <= 1) {
    desired = toPlayer + Math.sin(time * .03 + e.wobble) * 0.85; // circle around
  }

  e.dir += angleDiff(desired, e.dir) * .05;
  if (e.stunTimer <= 0) {
    let throttle = 0.28;
    if (e.level > player.level + 2) throttle = 0.34;
    if (e.level <= player.level && d < 280) throttle = 0.30;
    if (d > 350) throttle *= 1.12;
    e.vx += Math.cos(e.dir) * e.speed * throttle;
    e.vy += Math.sin(e.dir) * e.speed * throttle;
  }
  if (e.level > player.level + 1 && d < e.radius * 1.45 + player.radius * .65 && Math.abs(angleDiff(toPlayer, e.dir)) < .45) {
    tryAttack(e);
  }
  e.vx *= .92;
  e.vy *= .92;
  e.x += e.vx;
  e.y += e.vy;
  e.x = clamp(e.x, -90, W + 90);
  e.y = clamp(e.y, -90, H + 90);
}

function updateCombat() {
  if (player.attackTimer > 0 && !player.hitDone && player.attackTimer <= 12) {
    let hitAny = false;
    for (const e of enemies) {
      if (attackHit(player, e)) {
        damage(e, player.atk, player);
        if (e.hp <= 0) startEat(e, player);
        hitAny = true;
      }
    }
    player.hitDone = true;
    if (!hitAny) {
      const m = mouthPos(player);
      makeText(m.x + 20, m.y, '咬空！', '#ffffff');
    }
  }

  for (const e of enemies) {
    if (e.attackTimer > 0 && !e.hitDone && e.attackTimer <= 12 && !e.dead) {
      if (attackHit(e, player)) damage(player, e.atk, e);
      e.hitDone = true;
    }
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) {
      e.eatTimer--;
      const target = e.targetFish;
      if (target) {
        const m = mouthPos(target);
        e.x += (m.x - e.x) * 0.28;
        e.y += (m.y - e.y) * 0.28;
      }
      if (e.eatTimer <= 0) {
        enemies.splice(i, 1);
      }
    }
  }

  if (player.hp <= 0 && !gameOver) {
    gameOver = true;
    running = false;
    finalText.textContent = `最终分数：${score}，糖糖击败了 ${kills} 只坑坑。`;
    gameOverPanel.classList.remove('hidden');
  }
}

function updateFoods() {
  for (let i = foods.length - 1; i >= 0; i--) {
    const f = foods[i];
    f.t += .05;
    if (Math.hypot(player.x - f.x, player.y - f.y) < player.radius * .8 + f.r) {
      score += 8;
      player.hp = Math.min(player.maxHp, player.hp + 5);
      foods.splice(i, 1);
      spawnFood();
      makeBurst(f.x, f.y, '#b8f7ff', 5);
    }
  }
}

function tickTimers(fish) {
  if (fish.attackTimer > 0) fish.attackTimer--;
  if (fish.cooldown > 0) fish.cooldown--;
  if (fish.hurtTimer > 0) fish.hurtTimer--;
  if (fish.stunTimer > 0) fish.stunTimer--;
}

function update() {
  if (!running) return;
  time++;
  updatePlayer();
  for (const e of enemies) updateEnemy(e);
  updateCombat();
  updateFoods();
  tickTimers(player);
  for (const e of enemies) tickTimers(e);

  if (attackHeld && player.cooldown <= 0 && player.attackTimer <= 0) tryAttack(player);
  if (time % 260 === 0 && enemies.length < enemyTargetCount()) spawnEnemy();
  if (time % 240 === 0 && foods.length < 28) spawnFood();

  for (const b of bubbles) {
    b.y -= b.s;
    b.x += Math.sin(time * .015 + b.y * .02) * .18;
    if (b.y < -20) { b.y = H + 20; b.x = rand(0, W); }
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life--;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += .03;
    if (p.life <= 0) particles.splice(i, 1);
  }

  levelText.textContent = player.level;
  scoreText.textContent = score;
  killText.textContent = kills;
  hpFill.style.width = `${clamp(player.hp / player.maxHp, 0, 1) * 100}%`;
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#69e4f6');
  g.addColorStop(.5, '#12a1d3');
  g.addColorStop(1, '#07527d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = .18;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.ellipse(W * (i / 8) + Math.sin(time * .01 + i) * 40, H * .15 + i * 30, W * .18, 34, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  for (const b of bubbles) {
    ctx.globalAlpha = b.a;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFood(f) {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(Math.sin(f.t) * .2);
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.ellipse(0, 0, f.r * 1.6, f.r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff9f1c';
  ctx.beginPath();
  ctx.moveTo(-f.r * 1.6, 0);
  ctx.lineTo(-f.r * 2.4, -f.r * .8);
  ctx.lineTo(-f.r * 2.4, f.r * .8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1d3557';
  ctx.beginPath();
  ctx.arc(f.r * .7, -f.r * .25, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function getSpriteState(f) {
  if (f.attackTimer > 11) return 'charge';
  if (f.attackTimer > 0) return 'bite';
  if (Math.hypot(f.vx, f.vy) > 0.65) return 'move';
  return 'idle';
}

function drawFish(f) {
  const state = getSpriteState(f);
  const img = sprites[f.kind][state];
  const moveMag = Math.hypot(f.vx, f.vy);
  const bob = Math.sin(time * .11 + f.wobble) * 4;
  const flip = Math.cos(f.dir) >= 0 ? 1 : -1;
  const baseH = f.isPlayer ? f.radius * (isLandscape() ? 2.8 : 3.05) : f.radius * (isLandscape() ? 2.5 : 2.75);
  const deadScale = f.dead ? Math.max(0.1, f.eatTimer / 14) : 1;
  const drawH = baseH * deadScale;
  const drawW = (img.width && img.height) ? drawH * (img.width / img.height) : drawH;

  ctx.save();
  ctx.translate(f.x, f.y + bob);
  if (f.hurtTimer > 0) ctx.globalAlpha = .65 + Math.sin(time) * .22;

  ctx.save();
  ctx.globalAlpha = .18 * deadScale;
  ctx.fillStyle = '#001a2b';
  ctx.beginPath();
  ctx.ellipse(0, f.radius * .95, f.radius * 1.1 * deadScale, f.radius * .22 * deadScale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.scale(flip, 1);
  if (img.complete && img.naturalWidth) {
    ctx.drawImage(img, -drawW * .52, -drawH * .58, drawW, drawH);
  } else {
    ctx.fillStyle = f.kind === 'tangtang' ? '#ffb6d1' : '#9b6f3e';
    ctx.beginPath();
    ctx.ellipse(0, 0, f.radius, f.radius * .7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (state === 'bite' && !f.dead) {
    const m = {x: f.radius * 0.98 * flip, y: -f.radius * 0.02};
    ctx.save();
    ctx.globalAlpha = .8;
    ctx.strokeStyle = f.isPlayer ? '#ffe47a' : '#fff6b4';
    ctx.lineWidth = 4;
    for (let i = -2; i <= 2; i++) {
      const a = i * 0.18;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x + Math.cos(a) * f.radius * 1.15, m.y + Math.sin(a) * f.radius * 1.15);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.restore();

  ctx.save();
  ctx.font = `900 ${Math.max(12, f.radius * .32)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.fillStyle = '#fff';
  const label = `${f.name} Lv.${f.level}`;
  ctx.strokeText(label, f.x, f.y - f.radius * 1.5 + bob);
  ctx.fillText(label, f.x, f.y - f.radius * 1.5 + bob);
  ctx.restore();

  ctx.save();
  const bw = f.radius * 1.7, bh = 7;
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(f.x - bw / 2, f.y - f.radius * 1.28 + bob, bw, bh);
  ctx.fillStyle = f.kind === 'tangtang' ? '#ff5d9a' : '#ffd166';
  ctx.fillRect(f.x - bw / 2, f.y - f.radius * 1.28 + bob, bw * clamp(f.hp / f.maxHp, 0, 1), bh);
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    if (p.text) {
      ctx.font = '900 22px system-ui';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.fillStyle = p.color;
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillText(p.text, p.x, p.y);
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function render() {
  drawBackground();
  for (const f of foods) drawFood(f);
  const all = [...enemies, player].sort((a, b) => a.y - b.y);
  for (const f of all) drawFish(f);
  drawParticles();
  if (!running && !gameOver) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.font = '900 28px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('准备好让糖糖咬坑坑了吗？', W / 2, H * .22);
    ctx.restore();
  }
}

function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}
loop();

let joyPointer = null;
let attackHeld = false;
function setStick(clientX, clientY) {
  const rect = joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = clientX - cx, dy = clientY - cy;
  const max = rect.width * (isLandscape() ? .42 : .38);
  const len = Math.hypot(dx, dy);
  if (len > max) { dx = dx / len * max; dy = dy / len * max; }
  stick.style.transform = `translate(${dx}px, ${dy}px)`;
  input.x = dx / max;
  input.y = dy / max;
  input.active = true;
}
joystick.addEventListener('pointerdown', e => {
  joyPointer = e.pointerId;
  joystick.setPointerCapture(joyPointer);
  setStick(e.clientX, e.clientY);
});
joystick.addEventListener('pointermove', e => {
  if (e.pointerId === joyPointer) setStick(e.clientX, e.clientY);
});
function releaseJoy(e) {
  if (e.pointerId !== joyPointer) return;
  joyPointer = null;
  input.x = input.y = 0;
  input.active = false;
  stick.style.transform = 'translate(0, 0)';
}
joystick.addEventListener('pointerup', releaseJoy);
joystick.addEventListener('pointercancel', releaseJoy);

attackBtn.addEventListener('pointerdown', e => {
  e.preventDefault();
  attackHeld = true;
  attackBtn.classList.add('pressed');
  if (running) tryAttack(player);
});
function releaseAttack() {
  attackHeld = false;
  attackBtn.classList.remove('pressed');
}
attackBtn.addEventListener('pointerup', releaseAttack);
attackBtn.addEventListener('pointercancel', releaseAttack);

window.addEventListener('keydown', e => {
  keys.add(e.key.toLowerCase());
  if (e.code === 'Space') {
    e.preventDefault();
    if (running) tryAttack(player);
  }
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
function startGameFromButton(e) {
  if (e) e.preventDefault();
  resetGame();
}
startBtn.addEventListener('click', startGameFromButton);
startBtn.addEventListener('pointerup', startGameFromButton);
restartBtn.addEventListener('click', startGameFromButton);
restartBtn.addEventListener('pointerup', startGameFromButton);


// Mobile browser gesture guards: keep the game from scrolling/zooming while using the joystick.
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
