// Find the HTML elements used by the game.
const stage = document.querySelector("#game-stage");
const dino = document.querySelector("#dino");
const obstacleLayer = document.querySelector("#obstacles");
const startButton = document.querySelector("#start-button");
const soundButton = document.querySelector("#sound-button");
const duckButton = document.querySelector("#duck-button");
const statusText = document.querySelector("#status");
const scoreText = document.querySelector("#score");
const bestText = document.querySelector("#best");
const levelText = document.querySelector("#level");
const toast = document.querySelector("#toast");
const overlay = document.querySelector("#overlay");
const overlayTitle = document.querySelector("#overlay-title");
const overlayText = document.querySelector("#overlay-text");
const overlayButton = document.querySelector("#overlay-button");

// Game settings. Change these numbers to make the game easier or harder.
const groundHeight = 42;
const gravity = 2100;
const jumpPower = 760;
const startSpeed = 330; // pixels per second
const speedPerLevel = 40;
const maxSpeed = 760;
const pointsPerLevel = 200;
const eggBonus = 25;
const eggHeight = 140; // close to the top of a jump, so you must jump to grab it

// The things the dinosaur must jump over.
const hazards = [
  { emoji: "🪨", name: "rock", size: 52 },
  { emoji: "🌵", name: "cactus", size: 62 },
  { emoji: "🪵", name: "log", size: 50 },
];

// The flying obstacle. It flies at head height, so the dinosaur must duck.
const flyer = { emoji: "🦅", name: "pterodactyl", size: 50, fromLevel: 2, chance: 0.3 };

// Holding down while in the air pulls the dinosaur back to the ground faster.
const fastFallMultiplier = 3;

// Each level changes the sky: day, then sunset, then night, then day again.
const phases = ["day", "sunset", "night"];

// Remember whether the game is active and where the dinosaur is in its jump.
let running = false;
let jumping = false;
let jumpVelocity = 0;
let jumpHeight = 0;
let duckHeld = false;
let lastTime = 0;
let frameId = 0;
let crashTime = 0;

// Score and difficulty.
let speed = startSpeed;
let distance = 0;
let score = 0;
let level = 1;
let best = loadBest();

// Every obstacle on screen is stored here as { el, x, width, kind, name }.
let obstacles = [];
let distanceToNextSpawn = 0;
let soundOn = true;

bestText.textContent = best;

// ---------- Starting and ending a run ----------

// Reset everything and ask the browser to draw the first frame.
function startGame() {
  cancelAnimationFrame(frameId);
  obstacles.forEach((obstacle) => obstacle.el.remove());
  obstacles = [];

  running = true;
  jumping = false;
  jumpVelocity = 0;
  jumpHeight = 0;
  duckHeld = false;
  speed = startSpeed;
  distance = 0;
  score = 0;
  level = 1;
  distanceToNextSpawn = 420;

  stage.dataset.phase = phases[0];
  stage.classList.add("is-running");
  stage.classList.remove("is-shaking");
  dino.className = "dino";
  dino.style.bottom = `${groundHeight}px`;
  overlay.hidden = true;
  startButton.textContent = "Restart";
  statusText.textContent = "Run started. Space or ↑ to jump, ↓ to duck.";
  updateScoreboard();

  stage.focus();
  lastTime = performance.now();
  frameId = requestAnimationFrame(gameLoop);
}

// Stop the run and show the game over panel.
function endGame(obstacle) {
  running = false;
  crashTime = performance.now();
  cancelAnimationFrame(frameId);

  stage.classList.remove("is-running");
  stage.classList.add("is-shaking");
  dino.classList.add("is-hit");
  obstacle.el.classList.add("is-hit");
  playSound("crash");

  const finalScore = Math.floor(score);
  const newBest = finalScore > best;
  if (newBest) {
    best = finalScore;
    saveBest(best);
    bestText.textContent = best;
  }

  overlayTitle.textContent = newBest ? "New best score!" : "Game over";
  overlayText.textContent = `You hit a ${obstacle.name} and scored ${finalScore} points.`;
  overlayButton.textContent = "Play again";
  overlay.hidden = false;
  startButton.textContent = "Play again";
  statusText.textContent = `Crashed into a ${obstacle.name}. Press Space to try again.`;
}

// ---------- Jumping ----------

// Ignore the input if the game has not started or a jump is already happening.
function jump() {
  if (!running || jumping) return;

  jumping = true;
  jumpVelocity = jumpPower;
  dino.classList.add("is-jumping");
  updateDuckPose();
  playSound("jump");
}

// ---------- Ducking ----------

// Called when ↓ or the Duck button is pressed (true) or released (false).
function setDuck(held) {
  duckHeld = held;
  updateDuckPose();
}

// The dinosaur only crouches while it is running on the ground.
// CSS squashes it with the is-ducking class, which also makes its hitbox smaller.
function updateDuckPose() {
  dino.classList.toggle("is-ducking", running && duckHeld && !jumping);
}

function updateDino(deltaTime) {
  if (!jumping) return;

  // Move up using velocity, then reduce that velocity using gravity.
  // Holding down in the air makes gravity stronger, so the dinosaur drops faster.
  const pull = duckHeld ? gravity * fastFallMultiplier : gravity;
  jumpHeight += jumpVelocity * deltaTime;
  jumpVelocity -= pull * deltaTime;

  // Stop the jump when the dinosaur reaches the ground again.
  if (jumpHeight <= 0) {
    jumpHeight = 0;
    jumpVelocity = 0;
    jumping = false;
    dino.classList.remove("is-jumping");
    updateDuckPose();
  }

  // The ground is 42px tall. Add the current jump height to that base position.
  dino.style.bottom = `${groundHeight + jumpHeight}px`;
}

// ---------- Obstacles and eggs ----------

// Make a new element, put it at the right edge of the stage and remember it.
function addObstacle(kind, emoji, name, size, bottom, x) {
  const el = document.createElement("div");
  el.className = `item ${kind}`;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.fontSize = `${size * 0.85}px`;
  el.style.bottom = `${bottom}px`;
  el.style.transform = `translateX(${x}px)`;
  el.setAttribute("aria-hidden", "true");

  const emojiSpan = document.createElement("span");
  emojiSpan.textContent = emoji;
  el.append(emojiSpan);
  obstacleLayer.append(el);

  obstacles.push({ el, x, width: size, kind, name });
}

function spawnObstacles() {
  const startX = stage.clientWidth + 20;

  // From level 2, sometimes send a pterodactyl instead of a ground obstacle.
  if (level >= flyer.fromLevel && Math.random() < flyer.chance) {
    // Fly at the dinosaur's head height: low enough to hit it when standing,
    // high enough to pass over it when it ducks. Using the dinosaur's real
    // height keeps this working on small screens where the dinosaur is smaller.
    const flyHeight = groundHeight + dino.offsetHeight * 0.42;
    addObstacle("flyer", flyer.emoji, flyer.name, flyer.size, flyHeight, startX);
    distanceToNextSpawn = speed * 0.75 + 200 + Math.random() * 220;
    return;
  }

  const hazard = hazards[Math.floor(Math.random() * hazards.length)];
  addObstacle("hazard", hazard.emoji, hazard.name, hazard.size, groundHeight - 2, startX);

  // From level 3, sometimes place a second hazard right behind the first.
  if (level >= 3 && Math.random() < 0.3) {
    const extra = hazards[Math.floor(Math.random() * hazards.length)];
    addObstacle("hazard", extra.emoji, extra.name, extra.size, groundHeight - 2, startX + hazard.size * 0.8);
  }

  // Sometimes float a golden egg above the hazard as a reward for jumping.
  if (Math.random() < 0.35) {
    addObstacle("egg", "🥚", "egg", 38, groundHeight + eggHeight, startX + 6);
  }

  // Faster runs need bigger gaps so there is always time to land and jump again.
  distanceToNextSpawn = speed * 0.75 + 200 + Math.random() * 220;
}

function updateObstacles(deltaTime) {
  const moved = speed * deltaTime;
  distance += moved;
  distanceToNextSpawn -= moved;

  // CSS reads --scroll to slide the ground and hills (see styles.css).
  stage.style.setProperty("--scroll", distance.toFixed(1));

  if (distanceToNextSpawn <= 0) spawnObstacles();

  for (const obstacle of obstacles) {
    obstacle.x -= moved;
    obstacle.el.style.transform = `translateX(${obstacle.x}px)`;
  }

  // Remove anything that has left the screen on the left side.
  obstacles = obstacles.filter((obstacle) => {
    const offScreen = obstacle.x < -obstacle.width - 20;
    if (offScreen) obstacle.el.remove();
    return !offScreen;
  });
}

// ---------- Collision ----------

// Emoji have empty space around them, so shrink each box before comparing.
function getHitbox(el, inset) {
  const box = el.getBoundingClientRect();
  return {
    left: box.left + box.width * inset,
    right: box.right - box.width * inset,
    top: box.top + box.height * inset,
    bottom: box.bottom - box.height * inset,
  };
}

function boxesOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// Returns the hazard the dinosaur hit, or null. Eggs are collected on touch.
function checkCollisions() {
  const dinoBox = getHitbox(dino, 0.24);

  for (const obstacle of [...obstacles]) {
    const inset = obstacle.kind === "egg" ? 0.1 : 0.2;
    if (!boxesOverlap(dinoBox, getHitbox(obstacle.el, inset))) continue;

    if (obstacle.kind === "egg") {
      collectEgg(obstacle);
    } else {
      return obstacle;
    }
  }
  return null;
}

function collectEgg(egg) {
  score += eggBonus;
  egg.el.remove();
  obstacles = obstacles.filter((obstacle) => obstacle !== egg);
  showPopup(`+${eggBonus}`, egg.x, groundHeight + eggHeight + 30);
  playSound("egg");
}

// ---------- Score, levels and messages ----------

function updateScore(deltaTime) {
  // Running further gives points. Faster speed means points arrive faster.
  score += speed * deltaTime * 0.06;

  const newLevel = 1 + Math.floor(score / pointsPerLevel);
  if (newLevel > level) {
    level = newLevel;
    speed = Math.min(maxSpeed, startSpeed + (level - 1) * speedPerLevel);
    stage.dataset.phase = phases[(level - 1) % phases.length];
    showToast(`Level ${level}! Faster!`);
    playSound("level");
  }

  updateScoreboard();
}

function updateScoreboard() {
  scoreText.textContent = Math.floor(score);
  levelText.textContent = level;
}

function showToast(message) {
  toast.textContent = message;
  // Remove and re-add the class so the CSS animation plays again.
  toast.classList.remove("show");
  void toast.offsetWidth;
  toast.classList.add("show");
}

function showPopup(text, x, bottom) {
  const popup = document.createElement("span");
  popup.className = "popup";
  popup.textContent = text;
  popup.style.left = `${x}px`;
  popup.style.bottom = `${bottom}px`;
  popup.addEventListener("animationend", () => popup.remove());
  stage.append(popup);
}

// ---------- Best score (saved in the browser) ----------

function loadBest() {
  try {
    return Number(localStorage.getItem("dino-run-best")) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    localStorage.setItem("dino-run-best", String(value));
  } catch {
    // Saving is optional, so ignore errors (for example in private windows).
  }
}

// ---------- Sound effects (made with the Web Audio API, no files needed) ----------

let audioContext = null;

function beep(frequency, duration, delay = 0) {
  audioContext = audioContext || new AudioContext();
  const start = audioContext.currentTime + delay;
  const oscillator = audioContext.createOscillator();
  const volume = audioContext.createGain();

  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(frequency, start);
  volume.gain.setValueAtTime(0.04, start);
  volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(volume).connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

function playSound(name) {
  if (!soundOn) return;
  try {
    if (name === "jump") beep(620, 0.08);
    if (name === "egg") { beep(990, 0.06); beep(1320, 0.1, 0.07); }
    if (name === "level") { beep(660, 0.08); beep(880, 0.08, 0.09); beep(1100, 0.14, 0.18); }
    if (name === "crash") { beep(180, 0.12); beep(110, 0.25, 0.1); }
  } catch {
    // Sound is optional.
  }
}

// ---------- The game loop ----------

// requestAnimationFrame supplies `now` before the browser draws each frame.
function gameLoop(now) {
  if (!running) return;

  // Convert the time between frames from milliseconds to seconds.
  const deltaTime = Math.min((now - lastTime) / 1000, 0.04);
  lastTime = now;

  updateDino(deltaTime);
  updateObstacles(deltaTime);

  const hitObstacle = checkCollisions();
  if (hitObstacle) {
    endGame(hitObstacle);
    return;
  }

  updateScore(deltaTime);

  // Continue the animation on the next browser frame.
  frameId = requestAnimationFrame(gameLoop);
}

// ---------- Controls ----------

// One action for "jump" that also starts or restarts the game.
function pressJump() {
  if (running) {
    jump();
  } else if (performance.now() - crashTime > 500) {
    // The short wait stops a panicked jump from instantly restarting.
    startGame();
  }
}

startButton.addEventListener("click", startGame);
overlayButton.addEventListener("click", startGame);

soundButton.addEventListener("click", () => {
  soundOn = !soundOn;
  soundButton.textContent = soundOn ? "🔊" : "🔇";
  soundButton.setAttribute("aria-pressed", String(soundOn));
  soundButton.setAttribute("aria-label", soundOn ? "Sound on" : "Sound off");
});

// Space and Arrow Up jump. Arrow Down (or S) ducks while it is held.
document.addEventListener("keydown", (event) => {
  if (event.code === "ArrowDown" || event.code === "KeyS") {
    // Prevent Arrow Down from scrolling the page.
    event.preventDefault();
    setDuck(true);
    return;
  }

  // Let buttons handle their own Space and Enter presses.
  if (event.target.closest("button")) return;

  if (event.code === "Space" || event.code === "ArrowUp") {
    // Prevent Space from scrolling the page.
    event.preventDefault();
    if (!event.repeat) pressJump();
  }
});

document.addEventListener("keyup", (event) => {
  if (event.code === "ArrowDown" || event.code === "KeyS") setDuck(false);
});

// If the window loses focus while ↓ is held, we never get the keyup, so stand up.
window.addEventListener("blur", () => setDuck(false));

// The Duck button (shown on touch screens) works while it is held down.
duckButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  setDuck(true);
});
for (const type of ["pointerup", "pointerleave", "pointercancel"]) {
  duckButton.addEventListener(type, () => setDuck(false));
}

// Tapping or clicking the stage also jumps (useful on phones).
stage.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button")) return;
  pressJump();
});
