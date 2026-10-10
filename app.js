const stage = document.querySelector("#game-stage");
const dino = document.querySelector("#dino");
const startButton = document.querySelector("#start-button");
const statusText = document.querySelector("#status");

let running = false;
let jumping = false;
let jumpVelocity = 0;
let jumpHeight = 0;
let lastTime = 0;

const gravity = 2100;
const jumpPower = 760;

function startGame() {
  running = true;
  jumping = false;
  jumpVelocity = 0;
  jumpHeight = 0;
  lastTime = performance.now();
  dino.classList.add("running");
  dino.style.bottom = "42px";
  statusText.textContent = "Run started. Press Space or ↑ to jump.";
  stage.focus();
  requestAnimationFrame(gameLoop);
}

function jump() {
  if (!running || jumping) return;

  jumping = true;
  jumpVelocity = jumpPower;
}

function gameLoop(now) {
  if (!running) return;

  const deltaTime = Math.min((now - lastTime) / 1000, 0.04);
  lastTime = now;

  if (jumping) {
    jumpHeight += jumpVelocity * deltaTime;
    jumpVelocity -= gravity * deltaTime;

    if (jumpHeight <= 0) {
      jumpHeight = 0;
      jumpVelocity = 0;
      jumping = false;
    }

    dino.style.bottom = `${42 + jumpHeight}px`;
  }

  requestAnimationFrame(gameLoop);
}

startButton.addEventListener("click", startGame);

document.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "ArrowUp") {
    event.preventDefault();
    jump();
  }
});
