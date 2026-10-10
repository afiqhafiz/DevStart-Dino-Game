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
const powerMeter = document.querySelector("#power-meter");
const powerFill = document.querySelector("#power-fill");
const leaderboardBody = document.querySelector("#leaderboard-body");
const leaderboardEmpty = document.querySelector("#leaderboard-empty");

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

// How high the top of a jump is: velocity² / (2 × gravity).
const jumpPeak = (jumpPower * jumpPower) / (2 * gravity);

// The things the dinosaur must jump over. Sizes are for level 1.
const hazards = [
  { emoji: "🪨", name: "rock", size: 58 },
  { emoji: "🌵", name: "cactus", size: 72 },
  { emoji: "🪵", name: "log", size: 58 },
];

// Obstacles grow a little every level, up to this many times their level 1 size.
const growthPerLevel = 0.04;
const maxGrowth = 1.25;

// Spacing between obstacles. Both numbers shrink every level (down to the
// minimums), so obstacles arrive more and more often.
const spacing = { extra: 220, extraMin: 70, random: 240, randomMin: 90, shrinkPerLevel: 15 };

// The flying obstacle. It flies at head height, so the dinosaur must duck.
const flyer = { emoji: "🦅", name: "pterodactyl", size: 50, fromLevel: 2, chance: 0.3 };

// Formations: groups of pterodactyls (sometimes mixed with ground obstacles)
// that force a particular move. They start at `fromLevel`, become more likely
// every level, and never take more than `maxChance` of all spawns.
const formations = {
  fromLevel: 4,
  comboFromLevel: 6, // pterodactyl + cactus/rock/log combos start here
  chancePerLevel: 0.06,
  maxChance: 0.5,
};

// The power-up. It floats at the top of a jump, right above a pterodactyl,
// so grabbing it means timing a jump over the bird.
const powerUp = {
  emoji: "⭐",
  name: "star",
  size: 34,
  fromLevel: 2,
  chance: 0.35, // chance that a pterodactyl carries a star
  minPointsBetween: 300, // stops stars from appearing too often
  duration: 6, // seconds of being big and unstoppable
  warningTime: 1.5, // the dinosaur blinks when the power is about to run out
  graceTime: 0.6, // short safety window after the power ends
};
const smashBonus = 10;

// Holding down while in the air pulls the dinosaur back to the ground faster.
const fastFallMultiplier = 3;

// Each level changes the sky: day, then sunset, then night, then day again.
const phases = ["day", "sunset", "night"];

// The personal scoreboard keeps this many runs.
const leaderboardSize = 5;
const leaderboardKey = "dino-run-scores";

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
let runTime = 0; // seconds survived in this run

// Power-up timers (in seconds).
let powerTimeLeft = 0;
let graceTimeLeft = 0;
let lastPowerUpScore = -Infinity;

// Every obstacle on screen is stored here as { el, x, width, kind, name }.
let obstacles = [];
let distanceToNextSpawn = 0;
let soundOn = true;

let topScores = loadScores();
bestText.textContent = topScores[0]?.score ?? 0;
renderLeaderboard(-1);

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
  runTime = 0;
  distanceToNextSpawn = 420;
  powerTimeLeft = 0;
  graceTimeLeft = 0;
  lastPowerUpScore = -Infinity;

  stage.dataset.phase = phases[0];
  stage.classList.add("is-running");
  stage.classList.remove("is-shaking");
  dino.className = "dino";
  dino.style.bottom = `${groundHeight}px`;
  powerMeter.hidden = true;
  overlay.hidden = true;
  startButton.textContent = "Restart";
  statusText.textContent = "Run started. Space or ↑ to jump, ↓ to duck.";
  renderLeaderboard(-1);
  updateScoreboard();

  stage.focus();
  lastTime = performance.now();
  frameId = requestAnimationFrame(gameLoop);
}

// Stop the run, save it to the scoreboard and show the game over panel.
function endGame(obstacle) {
  running = false;
  crashTime = performance.now();
  cancelAnimationFrame(frameId);

  stage.classList.remove("is-running");
  stage.classList.add("is-shaking");
  dino.classList.add("is-hit");
  obstacle.el.classList.add("is-hit");
  powerMeter.hidden = true;
  playSound("crash");

  const finalScore = Math.floor(score);
  const time = Math.floor(runTime);
  const rank = saveScore({ score: finalScore, level, time, date: new Date().toISOString() });
  bestText.textContent = topScores[0]?.score ?? 0;
  renderLeaderboard(rank);

  let message = `You hit a ${obstacle.name} after ${formatTime(time)} and scored ${finalScore} points.`;
  if (rank > 0) message += ` That's #${rank + 1} on your top ${leaderboardSize}.`;

  overlayTitle.textContent = rank === 0 ? "New best score!" : "Game over";
  overlayText.textContent = message;
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

// ---------- Power-up ----------

function startPowerUp(star) {
  score += eggBonus;
  removeObstacle(star);
  showPopup("POWER!", star.x, star.bottom + 30);

  powerTimeLeft = powerUp.duration;
  graceTimeLeft = 0;
  dino.classList.add("is-powered");
  dino.classList.remove("is-power-ending");
  powerMeter.hidden = false;
  showToast("Power up! Smash everything!");
  statusText.textContent = "You're huge! Run through anything for a few seconds.";
  playSound("power");
}

function updatePowerUp(deltaTime) {
  if (powerTimeLeft > 0) {
    powerTimeLeft = Math.max(0, powerTimeLeft - deltaTime);
    powerFill.style.width = `${(powerTimeLeft / powerUp.duration) * 100}%`;
    dino.classList.toggle("is-power-ending", powerTimeLeft < powerUp.warningTime);

    if (powerTimeLeft === 0) {
      // Shrink back, but stay safe for a moment so you don't crash
      // into something you were standing inside when the power ran out.
      graceTimeLeft = powerUp.graceTime;
      dino.classList.remove("is-powered");
      powerMeter.hidden = true;
      statusText.textContent = "Power used up. Back to jumping!";
      playSound("powerdown");
    }
  } else if (graceTimeLeft > 0) {
    graceTimeLeft = Math.max(0, graceTimeLeft - deltaTime);
    if (graceTimeLeft === 0) dino.classList.remove("is-power-ending");
  }
}

function canSpawnPowerUp() {
  return (
    level >= powerUp.fromLevel &&
    powerTimeLeft === 0 &&
    score - lastPowerUpScore >= powerUp.minPointsBetween &&
    Math.random() < powerUp.chance
  );
}

// A big dinosaur knocks obstacles away instead of crashing.
function smashObstacle(obstacle) {
  score += smashBonus;
  removeObstacle(obstacle, true);
  showPopup(`+${smashBonus}`, obstacle.x, obstacle.bottom + obstacle.width);
  playSound("smash");
}

// ---------- Obstacles, eggs and stars ----------

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

  obstacles.push({ el, x, width: size, bottom, kind, name });
}

// Take an obstacle out of the game. Smashed ones fly away before disappearing.
function removeObstacle(obstacle, smashed = false) {
  obstacles = obstacles.filter((other) => other !== obstacle);
  if (smashed) {
    obstacle.el.classList.add("is-smashed");
    setTimeout(() => obstacle.el.remove(), 500);
  } else {
    obstacle.el.remove();
  }
}

// Ground obstacles get a little bigger every level.
function obstacleSize(baseSize) {
  const growth = Math.min(maxGrowth, 1 + (level - 1) * growthPerLevel);
  return Math.round(baseSize * growth);
}

// How far to run before the next obstacle. Higher levels use less extra
// space, so obstacles come more often. The `speed * 0.8` part is always
// kept, because that is roughly how far the dinosaur travels in one jump.
function nextGap(extraWidth = 0) {
  const shrink = (level - 1) * spacing.shrinkPerLevel;
  const extra = Math.max(spacing.extraMin, spacing.extra - shrink);
  const random = Math.max(spacing.randomMin, spacing.random - shrink);
  return speed * 0.8 + extraWidth + extra + Math.random() * random;
}

// ---------- Pterodactyl heights ----------

// Head height: hits a standing dinosaur, passes over a ducking one. Using the
// dinosaur's real height keeps this working on small screens.
function headHeight() {
  return groundHeight + dino.offsetHeight * 0.42;
}

// Skimming the ground: ducking does not help, you have to jump.
function lowHeight() {
  return groundHeight + 2;
}

// High up: only the very top of a jump would get above it. Stacked over a
// head-height pterodactyl it blocks every jump, so you have to duck.
function highHeight() {
  return groundHeight + jumpPeak - 20;
}

// ---------- Formations ----------

// How likely a formation is at the current level (0 = never, 0.5 = half the time).
function formationChance() {
  if (level < formations.fromLevel) return 0;
  const levelsIn = level - formations.fromLevel + 1;
  return Math.min(formations.maxChance, levelsIn * formations.chancePerLevel);
}

function randomHazard() {
  const hazard = hazards[Math.floor(Math.random() * hazards.length)];
  return { ...hazard, size: obstacleSize(hazard.size) };
}

// Each formation adds its obstacles starting at x and returns how wide it is,
// so the next spawn can wait until it has passed.
const formationTypes = [
  {
    name: "low pair", // JUMP: two pterodactyls skimming the ground
    combo: false,
    spawn(x) {
      addObstacle("flyer", flyer.emoji, flyer.name, flyer.size, lowHeight(), x);
      addObstacle("flyer", flyer.emoji, flyer.name, flyer.size, lowHeight(), x + flyer.size * 1.1);
      return flyer.size * 2.1;
    },
  },
  {
    name: "stacked pair", // DUCK: one at head height, one high above and a bit behind
    combo: false,
    spawn(x) {
      // The 40px offset closes the gap a jumping dinosaur could slip through.
      addObstacle("flyer", flyer.emoji, flyer.name, flyer.size, headHeight(), x);
      addObstacle("flyer", flyer.emoji, flyer.name, flyer.size, highHeight(), x + 40);
      return flyer.size + 40;
    },
  },
  {
    name: "jump then duck", // a ground obstacle, then a pterodactyl after you land
    combo: true,
    spawn(x) {
      const hazard = randomHazard();
      addObstacle("hazard", hazard.emoji, hazard.name, hazard.size, groundHeight - 2, x);
      // Leave about one jump's distance so there is time to land and duck.
      const birdX = x + hazard.size + speed * 0.75;
      addObstacle("flyer", flyer.emoji, flyer.name, flyer.size, headHeight(), birdX);
      return birdX - x + flyer.size;
    },
  },
  {
    name: "duck then jump", // a pterodactyl, then a ground obstacle right behind it
    combo: true,
    spawn(x) {
      addObstacle("flyer", flyer.emoji, flyer.name, flyer.size, headHeight(), x);
      // Just enough room to stand up after the bird passes and jump.
      const hazard = randomHazard();
      const hazardX = x + flyer.size + speed * 0.3 + 40;
      addObstacle("hazard", hazard.emoji, hazard.name, hazard.size, groundHeight - 2, hazardX);
      return hazardX - x + hazard.size;
    },
  },
  {
    name: "low bird and hazard", // JUMP: a low pterodactyl leading a ground obstacle
    combo: true,
    spawn(x) {
      addObstacle("flyer", flyer.emoji, flyer.name, flyer.size, lowHeight(), x);
      const hazard = randomHazard();
      addObstacle("hazard", hazard.emoji, hazard.name, hazard.size, groundHeight - 2, x + flyer.size * 0.9);
      return flyer.size * 0.9 + hazard.size;
    },
  },
];

function spawnFormation(x) {
  const unlocked = formationTypes.filter((type) => !type.combo || level >= formations.comboFromLevel);
  const type = unlocked[Math.floor(Math.random() * unlocked.length)];
  return type.spawn(x);
}

function spawnObstacles() {
  const startX = stage.clientWidth + 20;

  // From level 4, sometimes send a whole formation instead of one obstacle.
  if (Math.random() < formationChance()) {
    const width = spawnFormation(startX);
    distanceToNextSpawn = nextGap(width);
    return;
  }

  // From level 2, sometimes send a pterodactyl instead of a ground obstacle.
  if (level >= flyer.fromLevel && Math.random() < flyer.chance) {
    addObstacle("flyer", flyer.emoji, flyer.name, flyer.size, headHeight(), startX);

    // Sometimes the pterodactyl carries a star high above it. Only the top
    // few pixels of a jump reach it, so you must jump at exactly the right
    // moment: the top of your jump has to happen right above the bird.
    if (canSpawnPowerUp()) {
      const starHeight = groundHeight + jumpPeak + dino.offsetHeight * 0.62;
      const starX = startX + (flyer.size - powerUp.size) / 2;
      addObstacle("powerup", powerUp.emoji, powerUp.name, powerUp.size, starHeight, starX);
      lastPowerUpScore = score;
    }

    distanceToNextSpawn = nextGap();
    return;
  }

  const hazard = randomHazard();
  const size = hazard.size;
  addObstacle("hazard", hazard.emoji, hazard.name, size, groundHeight - 2, startX);
  let groupWidth = 0;

  // From level 3, sometimes place a second hazard right behind the first.
  if (level >= 3 && Math.random() < 0.3) {
    const extra = randomHazard();
    addObstacle("hazard", extra.emoji, extra.name, extra.size, groundHeight - 2, startX + size * 0.8);
    groupWidth = size * 0.8;
  }

  // Sometimes float a golden egg above the hazard as a reward for jumping.
  if (Math.random() < 0.35) {
    addObstacle("egg", "🥚", "egg", 38, groundHeight + eggHeight, startX + 6);
  }

  distanceToNextSpawn = nextGap(groupWidth);
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
  for (const obstacle of [...obstacles]) {
    if (obstacle.x < -obstacle.width - 20) removeObstacle(obstacle);
  }
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

// Returns the obstacle that ends the run, or null.
// Eggs and stars are collected on touch. A powered-up dinosaur smashes obstacles.
function checkCollisions() {
  const dinoBox = getHitbox(dino, 0.24);

  for (const obstacle of [...obstacles]) {
    const pickup = obstacle.kind === "egg" || obstacle.kind === "powerup";
    const inset = pickup ? 0.1 : 0.2;
    if (!boxesOverlap(dinoBox, getHitbox(obstacle.el, inset))) continue;

    if (obstacle.kind === "egg") {
      collectEgg(obstacle);
    } else if (obstacle.kind === "powerup") {
      startPowerUp(obstacle);
    } else if (powerTimeLeft > 0) {
      smashObstacle(obstacle);
    } else if (graceTimeLeft === 0) {
      return obstacle;
    }
  }
  return null;
}

function collectEgg(egg) {
  score += eggBonus;
  removeObstacle(egg);
  showPopup(`+${eggBonus}`, egg.x, egg.bottom + 30);
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

// ---------- Personal scoreboard (saved in the browser) ----------

// Each saved run looks like { score: 812, level: 5, time: 83, date: "2026-10-10T..." }.
// `time` is how many seconds the run lasted.
function loadScores() {
  try {
    const saved = JSON.parse(localStorage.getItem(leaderboardKey) || "[]");
    if (Array.isArray(saved) && saved.length > 0) {
      return saved.filter((run) => Number.isFinite(run.score)).slice(0, leaderboardSize);
    }
    // Older versions only saved one best score. Keep it as the first entry.
    const oldBest = Number(localStorage.getItem("dino-run-best")) || 0;
    return oldBest > 0 ? [{ score: oldBest, level: null, date: null }] : [];
  } catch {
    return [];
  }
}

// Adds a run, keeps the best five, and returns its place (0 = first),
// or -1 if it was not good enough to make the list.
function saveScore(run) {
  topScores.push(run);
  topScores.sort((a, b) => b.score - a.score);
  topScores = topScores.slice(0, leaderboardSize);

  try {
    localStorage.setItem(leaderboardKey, JSON.stringify(topScores));
  } catch {
    // Saving is optional, so ignore errors (for example in private windows).
  }
  return topScores.indexOf(run);
}

// Turn seconds into minutes:seconds, for example 83 → "1:23".
function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

// Draw the table. `highlight` is the row of the run that just finished.
function renderLeaderboard(highlight) {
  leaderboardBody.replaceChildren();
  leaderboardEmpty.hidden = topScores.length > 0;

  topScores.forEach((run, index) => {
    const row = document.createElement("tr");
    if (index === highlight) row.className = "is-new";

    const date = run.date
      ? new Date(run.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })
      : "—";
    // Runs saved before the time column existed show a dash.
    const time = Number.isFinite(run.time) ? formatTime(run.time) : "—";
    const cells = [index + 1, run.score, run.level ?? "—", time, date];

    for (const value of cells) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    leaderboardBody.append(row);
  });
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
    if (name === "power") { [523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, 0.09, i * 0.07)); }
    if (name === "powerdown") { beep(784, 0.08); beep(523, 0.12, 0.09); }
    if (name === "smash") beep(140, 0.1);
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
  runTime += deltaTime;

  updateDino(deltaTime);
  updatePowerUp(deltaTime);
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
