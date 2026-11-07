// "Can you beat the model?" (ported from prototype E). Five real squares from the Indian TEST areas: the visitor names
// each one, then sees the hand label and the model's answer. Data: web/public/data/quiz/ (made by src/quiz.py, which
// checks that the model's score on these squares equals results/india_after.json). Nothing here is typed in by hand.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "../components/Button";
import { SourceMarker } from "../components/SourceMarker";
import { className } from "../lib/classes";
import { getJson, pct } from "../lib/data";
import { useSeen } from "../lib/motion";
import { loadImage, pixelSwap } from "../lib/pixelSwap";

export const ROUNDS = 5;
const BASE = "/data/quiz/";
const QZ = "web/public/data/quiz/quiz.json";

export type Quiz = {
  about: string;
  model_accuracy: number;
  model_accuracy_source: string;
  sprite: { file: string; cols: number; size: number };
  squares: { i: number; area: string; label: string; model: string; confidence: number }[];
};
type Square = Quiz["squares"][number];

const shuffle = <T,>(a: T[], rnd = Math.random) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const plain = (k: string) => className(k).plain;

// The four answer buttons: the right answer, the model's answer (if different), and random other classes.
export function options(q: Square, classes: string[], rnd = Math.random) {
  const opts = new Set([q.label, q.model]);
  for (const c of shuffle(classes, rnd)) { if (opts.size >= 4) break; opts.add(c); }
  return shuffle([...opts], rnd);
}

export function verdictText(you: number, model: number) {
  return you > model ? "You beat the model." : you === model ? "A draw." : "The model wins this time.";
}

export function Game({ colour }: { colour: Record<string, string> }) {
  const { ref, seen } = useSeen<HTMLElement>(0);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [sheet, setSheet] = useState<ImageBitmap | null>(null);
  const [failed, setFailed] = useState(false);
  // Load the squares only when the game is about to scroll into view.
  useEffect(() => {
    if (!seen || quiz) return;
    Promise.all([getJson<Quiz>(BASE + "quiz.json"), loadImage(BASE + "squares.webp")])
      .then(([q, s]) => { setQuiz(q); setSheet(s); })
      .catch(() => setFailed(true));
  }, [seen, quiz]);

  return (
    <section className="sec game" id="game" ref={ref} aria-labelledby="gameTitle">
      <div className="wrap game-grid">
        <div className="game-copy">
          <span className="eyebrow">Your turn</span>
          <h2 id="gameTitle">Can you beat the model?</h2>
          <p>{ROUNDS} real 640&nbsp;m squares from the Indian test areas, places the model never trained on. Name what you see, then see what the model said.</p>
          {quiz && <p className="cap">Answer key and model: {quiz.about}<SourceMarker file={QZ} field="about" note="Made by src/quiz.py." /></p>}
        </div>
        {failed ? <p className="cap" role="alert">The game's pictures could not be loaded.</p>
          : quiz && sheet ? <Play quiz={quiz} sheet={sheet} colour={colour} /> : <div className="game-card loading" aria-busy="true" />}
      </div>
    </section>
  );
}

function Play({ quiz, sheet, colour }: { quiz: Quiz; sheet: ImageBitmap; colour: Record<string, string> }) {
  const classes = [...new Set(quiz.squares.flatMap((q) => [q.label, q.model]))];
  const newRounds = useCallback(() => shuffle(quiz.squares).slice(0, ROUNDS), [quiz]);
  const [rounds, setRounds] = useState(newRounds);
  const [k, setK] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ you: 0, model: 0 });
  const [done, setDone] = useState(false);
  const q = rounds[k];
  const [opts, setOpts] = useState(() => options(q, classes));
  const canvas = useRef<HTMLCanvasElement>(null);
  const shown = useRef<HTMLCanvasElement | null>(null);
  const nextBtn = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);

  // Show the square: cut it from the sprite sheet, then dissolve the old square into it block by block.
  useEffect(() => {
    const { cols, size } = quiz.sprite;
    const next = document.createElement("canvas");
    next.width = next.height = size;
    next.getContext("2d", { willReadFrequently: true })!.drawImage(sheet, (q.i % cols) * size, Math.floor(q.i / cols) * size, size, size, 0, 0, size, size);
    if (canvas.current) pixelSwap(canvas.current, shown.current ?? next, next, 8, 8, { ms: 420, seed: q.i + 3 }).to(1);
    shown.current = next;
  }, [q, quiz, sheet]);

  const answer = useCallback((c: string) => {
    if (picked) return;
    setPicked(c);
    setScore((s) => ({ you: s.you + Number(c === q.label), model: s.model + Number(q.model === q.label) }));
    requestAnimationFrame(() => nextBtn.current?.querySelector("button")?.focus({ preventScroll: true }));
  }, [picked, q]);
  const next = () => {
    if (k === ROUNDS - 1) { setDone(true); return; }
    setK(k + 1); setPicked(null); setOpts(options(rounds[k + 1], classes));
  };
  const again = () => {
    const r = newRounds();
    setRounds(r); setK(0); setPicked(null); setScore({ you: 0, model: 0 }); setDone(false); setOpts(options(r[0], classes));
  };

  // Keys 1-4 answer while the game is on screen.
  useEffect(() => {
    let inView = false;
    const io = new IntersectionObserver((es) => (inView = es[0].isIntersecting), { threshold: 0.5 });
    if (card.current) io.observe(card.current);
    const key = (e: KeyboardEvent) => {
      if (!inView || done || picked || (e.target as HTMLElement).closest("input, textarea")) return;
      const n = Number(e.key) - 1;
      if (/^[1-4]$/.test(e.key) && opts[n]) answer(opts[n]);
    };
    document.addEventListener("keydown", key);
    return () => { io.disconnect(); document.removeEventListener("keydown", key); };
  }, [opts, picked, done, answer]);

  const youRight = picked === q.label, modelRight = q.model === q.label;
  return (
    <div className="game-card" ref={card} data-done={done}>
      <div className="g-img">
        <canvas ref={canvas} width={64} height={64} role="img" aria-label="Satellite square to name" />
        <span className="g-scale"><i />640 m</span>
        <span className="g-area">Gujarat · test area</span>
      </div>
      <div className="g-side">
        <div className="scoreboard" aria-live="polite">
          <div><span>You</span><b key={`y${score.you}`}>{score.you}</b></div>
          <div><span>Model</span><b key={`m${score.model}`}>{score.model}</b></div>
          <div className="round"><span>Square</span><b>{done ? ROUNDS : k + 1}</b><small>/ {ROUNDS}</small></div>
        </div>
        {done ? (
          <div className="g-final" aria-live="polite">
            <b>{verdictText(score.you, score.model)}</b>
            <span>You {score.you} of {ROUNDS} · Model {score.model} of {ROUNDS}</span>
            <p>Across all {quiz.squares.length} Indian test squares this model is right <b>{pct(quiz.model_accuracy)}%</b><SourceMarker file={QZ} field="model_accuracy" note={`Equals ${quiz.model_accuracy_source}. The model behind the maps (one training run).`} /> of the time. {ROUNDS} squares is a tiny sample, so luck plays a big part.</p>
            <Button variant="quiet" onClick={again}>Play again</Button>
          </div>
        ) : <>
          <span className="label">What is this square?</span>
          <div className="g-opts" role="group" aria-label="Your answer" data-answered={picked ? "true" : undefined}>
            {opts.map((c, n) => {
              const state = picked ? (c === q.label ? "right" : c === picked ? "wrong" : undefined) : undefined;
              return (
                <button key={`${k}-${c}`} type="button" className="g-opt" disabled={!!picked} data-state={state} data-you={picked === c ? "true" : undefined}
                  style={{ "--c": colour[c], "--n": n } as CSSProperties} onClick={() => answer(c)}>
                  <i /><span>{plain(c)}</span><kbd>{n + 1}</kbd><em className="tag">{picked && c === q.model ? `Model · ${pct(q.confidence, 0)}%` : ""}</em>
                </button>
              );
            })}
          </div>
          <div className="g-result" aria-live="polite">
            {picked && <p><b>{youRight ? "You got it." : `It's ${plain(q.label).toLowerCase()}.`}</b> The model said {plain(q.model).toLowerCase()}, {pct(q.confidence, 0)}% sure{modelRight ? ", and was right" : ", and was wrong"}.
              <span className={`conf-bar ${modelRight ? "ok" : "no"}`}><i style={{ "--w": q.confidence } as CSSProperties} /></span></p>}
          </div>
          <div className="g-actions" ref={nextBtn}>
            {picked && <Button onClick={next} arrow="right">{k === ROUNDS - 1 ? "See the result" : "Next square"}</Button>}
            <span className="g-keys"><kbd>1</kbd>–<kbd>4</kbd> to answer</span>
          </div>
        </>}
      </div>
    </div>
  );
}
