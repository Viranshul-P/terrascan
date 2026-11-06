// "Can you beat the model?" (prototype E). Five real Indian TEST squares: the visitor names each one, then sees the
// hand label and the model's answer. Data: web/public/data/quiz/ (made by src/quiz.py, which checks that the
// model's score on these squares equals results/india_after.json). Nothing here is typed in by hand.
import { LABEL, pct } from "../shared/data.js";
import { src } from "./shell.js";
import { loadImage, onceVisible, pixelSwap } from "./motion.js";

const ROUNDS = 5;
const BASE = "../../public/data/quiz/";
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function initGame({ colour }) {
  const $ = (s) => document.querySelector(s);
  // Load the 81 squares only when the game is about to scroll into view.
  onceVisible($("#game"), () => start($, colour), 0);
}

async function start($, colour) {
  const [quiz, sheet] = await Promise.all([fetch(BASE + "quiz.json").then((r) => r.json()), loadImage(BASE + "squares.webp")]);
  const { cols, size } = quiz.sprite;
  const classes = [...new Set(quiz.squares.flatMap((q) => [q.label, q.model]))];
  const QZ = "web/public/data/quiz/quiz.json";
  $("#gameAbout").innerHTML = `Answer key: labelled by hand (Claude first, every one reviewed by the author). The model is the fine-tuned EfficientNet-B0 behind the maps.${src(QZ, "about", "Made by src/quiz.py.")}`;

  // One 64 x 64 canvas per square, cut from the sprite sheet.
  const squareCanvas = (q) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    cv.getContext("2d", { willReadFrequently: true }).drawImage(sheet, (q.i % cols) * size, Math.floor(q.i / cols) * size, size, size, 0, 0, size, size);
    return cv;
  };
  const canvas = $("#gCanvas");
  let shown = null; // canvas currently on screen
  let rounds = [], k = 0, you = 0, model = 0, answered = false;

  function newGame() {
    rounds = shuffle([...quiz.squares]).slice(0, ROUNDS);
    k = 0; you = 0; model = 0;
    $("#gameCard").dataset.done = "false";
    show();
  }

  function show() {
    const q = rounds[k];
    answered = false;
    // Options: the right answer, the model's answer (if different), and random others, four in all.
    const opts = new Set([q.label, q.model]);
    for (const c of shuffle([...classes])) { if (opts.size >= 4) break; opts.add(c); }
    $("#gOpts").innerHTML = shuffle([...opts]).map((c, n) =>
      `<button type="button" class="g-opt" data-c="${c}" style="--c:${colour[c]};--n:${n}"><i></i><span>${LABEL[c]}</span><kbd>${n + 1}</kbd><em class="tag"></em></button>`).join("");
    $("#gResult").innerHTML = "";
    $("#gNext").hidden = true;
    $("#gArea").textContent = "Gujarat · test area";
    $("#sRound").textContent = k + 1;
    score();
    // The new square dissolves in block by block (8 x 8 blocks of 8 px).
    const next = squareCanvas(q);
    pixelSwap(canvas, shown ?? next, next, 8, 8, { ms: 420, seed: q.i + 3 }).to(1);
    shown = next;
  }

  function score() {
    for (const [id, v] of [["#sYou", you], ["#sModel", model]]) {
      const el = $(id);
      if (el.textContent !== String(v)) { el.textContent = v; el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
    }
  }

  function answer(c) {
    if (answered) return;
    answered = true;
    const q = rounds[k];
    const youRight = c === q.label, modelRight = q.model === q.label;
    you += youRight; model += modelRight;
    $("#gOpts").dataset.answered = "true";
    document.querySelectorAll(".g-opt").forEach((b) => {
      b.disabled = true;
      if (b.dataset.c === q.label) b.dataset.state = "right";
      else if (b.dataset.c === c) b.dataset.state = "wrong";
      if (b.dataset.c === c) b.dataset.you = "true";
      if (b.dataset.c === q.model) b.querySelector(".tag").textContent = `Model · ${pct(q.confidence, 0)}%`;
    });
    $("#gResult").innerHTML = `<b>${youRight ? "You got it." : `It's ${LABEL[q.label].toLowerCase()}.`}</b>
      The model said ${LABEL[q.model].toLowerCase()}, ${pct(q.confidence, 0)}% sure${modelRight ? ", and was right" : ", and was wrong"}.
      <span class="conf-bar ${modelRight ? "ok" : "no"}"><i style="--w:${q.confidence}"></i></span>`;
    score();
    const last = k === ROUNDS - 1;
    $("#gNext").hidden = false;
    $("#gNext").firstChild.textContent = last ? "See the result " : "Next square ";
    $("#gNext").focus({ preventScroll: true });
  }

  function finish() {
    $("#gameCard").dataset.done = "true";
    $("#gOpts").innerHTML = "";
    const verdict = you > model ? "You beat the model." : you === model ? "A draw." : "The model wins this time.";
    $("#gResult").innerHTML = `<div class="g-final"><b>${verdict}</b>
      <span>You ${you} of ${ROUNDS} · Model ${model} of ${ROUNDS}</span>
      <p>Across all ${quiz.squares.length} Indian test squares the model is right <b>${pct(quiz.model_accuracy)}%</b>${src(QZ, "model_accuracy", `Equals ${quiz.model_accuracy_source}.`)} of the time. Five squares is a tiny sample, so luck plays a big part.</p>
      <button class="btn btn-quiet" type="button" id="gAgain">Play again</button></div>`;
    $("#gNext").hidden = true;
    $("#gAgain").addEventListener("click", () => { delete $("#gOpts").dataset.answered; newGame(); });
  }

  $("#gOpts").addEventListener("click", (e) => { const b = e.target.closest(".g-opt"); if (b) answer(b.dataset.c); });
  $("#gNext").addEventListener("click", () => {
    delete $("#gOpts").dataset.answered;
    if (k === ROUNDS - 1) finish(); else { k++; show(); }
  });
  // Keys 1-4 answer while the game is on screen.
  let inView = false;
  new IntersectionObserver((es) => (inView = es[0].isIntersecting), { threshold: 0.5 }).observe($("#gameCard"));
  document.addEventListener("keydown", (e) => {
    if (!inView || answered || e.target.closest("input, textarea")) return;
    const b = document.querySelectorAll(".g-opt")[Number(e.key) - 1];
    if (/^[1-4]$/.test(e.key) && b) answer(b.dataset.c);
  });
  newGame();
}
