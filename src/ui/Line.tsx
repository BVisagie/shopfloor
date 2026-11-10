import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { modelNote, providerLabel } from "../catalog";
import type { OutputFile } from "../generate";
import { LIMITS, PHASES, crossesProviders, describe, modelKey, type Advisor, type ModelRef, type Phase, type Recipe } from "../recipe";
import { Counter } from "./Counter";
import { Icon, MakerLogo, PlayIcon } from "./icons";

export const DRAG_TYPE = "application/x-shopfloor-model";

const STATIONS: Record<Phase, { title: string; job: string }> = {
  plan: { title: "Plan", job: "Plans the work, then waits for you" },
  build: { title: "Build", job: "Builds the plan once you say go" },
  review: { title: "Review", job: "Checks the change before it ships" },
};

/** What a step does. An empty step says its job; a filled one says how its models behave. */
function stationNote(recipe: Recipe, phase: Phase): string {
  if (recipe.phases[phase].length === 0) return STATIONS[phase].job;
  if (phase === "plan") return "The plan names the model to build with";
  if (phase === "build") return "Asks first if it is not on a model listed here";
  return recipe.phases.review.length === 1 ? "Ends as soon as the reviewer approves" : "Reviewers take turns until all approve";
}

export interface LineProps {
  recipe: Recipe;
  /** Key of the model that was clicked and is waiting to be added to a step. */
  picked: string | null;
  /** The generated files, or none while a step still needs a model. */
  files: OutputFile[];
  /** The steps that still need a model, as words, or an empty string when the line is complete. */
  missing: string;
  notes: string[];
  onPlace(phase: Phase, key: string): void;
  onRemove(phase: Phase, index: number): void;
  onMoveUp(phase: Phase, index: number): void;
  onOption(phase: Phase, index: number, option: string, value: string): void;
  /** Makes the model with this key the advisor. */
  onAdvise(key: string): void;
  /** Changes the advisor, or takes it away. */
  onAdvisor(advisor: Advisor | undefined): void;
  onViewFiles(): void;
  onDownload(): void;
  onInstall(): void;
  /** The preview started to play. The frames move the logo's eyes, and the animation that results is handed back. */
  onPlay(frames: Keyframe[], duration: number): Animation | undefined;
}

export function Line(props: LineProps) {
  const { recipe, files, missing, notes } = props;
  const ready = missing === "";
  return (
    <section className="line" aria-label="Production line">
      <div className="stations">
        {PHASES.map((phase, index) => (
          <Station key={phase} phase={phase} index={index} {...props} />
        ))}
        <Rail {...props} />
        <article className={ready ? "station out lit" : "station out"} style={{ "--hue": "var(--out)" } as CSSProperties}>
          <header>
            <span className="dot" />
            <h2>Out</h2>
            <span className="idx mono">{ready ? `${files.length} files` : "04"}</span>
          </header>
          {ready ? (
            <ul className="files mono">
              {files.map((file) => (
                <li key={file.path}>{file.path}</li>
              ))}
            </ul>
          ) : (
            <p className="empty">Add a model to {missing} to get your files</p>
          )}
          <div className="out-actions">
            <button className="btn" onClick={props.onViewFiles} disabled={!ready}>
              View files
            </button>
            <button className="btn" onClick={props.onDownload} disabled={!ready}>
              Download
            </button>
            <button className="btn primary" onClick={props.onInstall} disabled={!ready}>
              Install
            </button>
          </div>
        </article>
      </div>
      {/* The preview starts over whenever the models on the line change. */}
      <Track key={JSON.stringify([recipe.phases, recipe.advisor])} recipe={recipe} fileCount={files.length} missing={missing} onPlay={props.onPlay} />
      {notes.length > 0 && (
        <ul className="notes">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Station({ phase, index, recipe, picked, onPlace, onRemove, onMoveUp, onOption }: LineProps & { phase: Phase; index: number }) {
  const [over, setOver] = useState(false);
  const models = recipe.phases[phase];
  const { title } = STATIONS[phase];
  const accepts = (event: DragEvent) => event.dataTransfer.types.includes(DRAG_TYPE);
  return (
    <article
      className={["station", models.length > 0 && "lit", over && "over"].filter(Boolean).join(" ")}
      style={{ "--hue": `var(--${phase})` } as CSSProperties}
      onDragOver={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        setOver(false);
        onPlace(phase, event.dataTransfer.getData(DRAG_TYPE));
      }}
    >
      <header>
        <span className="dot" />
        <h2>{title}</h2>
        <span className="idx mono">0{index + 1}</span>
      </header>
      {models.length > 0 && (
        <ul className="slots">
          {models.map((model, i) => (
            <Chip
              key={modelKey(model)}
              recipe={recipe}
              model={model}
              station={title}
              onMoveUp={i > 0 ? () => onMoveUp(phase, i) : undefined}
              onRemove={() => onRemove(phase, i)}
              onOption={(option, value) => onOption(phase, i, option, value)}
            />
          ))}
        </ul>
      )}
      {picked ? (
        <button className="place" aria-label={`Add the selected model to ${title}`} onClick={() => onPlace(phase, picked)}>
          Add here
        </button>
      ) : (
        models.length === 0 && <p className="empty">Add a model</p>
      )}
      <p className="note">{stationNote(recipe, phase)}</p>
    </article>
  );
}

const ADVISOR_TIP =
  "A second opinion from another model. It is asked before a plan is shown to you, when the same check or fix has failed twice, when the builder and a reviewer cannot agree, and when you ask for it. It reads and answers, and never edits.";

/** The advisor serves every step, so it sits in one strip under all three. */
function Rail({ recipe, picked, onAdvise, onAdvisor }: LineProps) {
  const [over, setOver] = useState(false);
  const { advisor } = recipe;
  const accepts = (event: DragEvent) => event.dataTransfer.types.includes(DRAG_TYPE);
  const about = advisor && describe(recipe, advisor);
  return (
    <aside
      className={["rail", advisor && "lit", over && "over"].filter(Boolean).join(" ")}
      aria-label="Advisor"
      onDragOver={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        setOver(false);
        onAdvise(event.dataTransfer.getData(DRAG_TYPE));
      }}
    >
      <span className="dot" />
      <h2>Advisor</h2>
      <button className="info" data-tip={ADVISOR_TIP} aria-label={`Advisor: ${ADVISOR_TIP}`}>
        <Icon name="info" />
      </button>
      {advisor && about ? (
        <>
          <span className="who">
            <MakerLogo maker={about.maker} />
            <span className="name">{about.name}</span>
            {about.catalog?.status === "unconfirmed" && <span className="flag mono">check id</span>}
          </span>
          <span className="meta mono">
            <Effort
              recipe={recipe}
              model={advisor}
              label={`Effort for ${about.name} as advisor`}
              onOption={(option, value) => onAdvisor({ ...advisor, options: { ...advisor.options, [option]: value } })}
            />
            <span>{providerLabel(advisor.instanceId)}</span>
          </span>
          <span className="spacer" />
          <span className="asks">
            Asked at most
            <Counter
              label="Advisor calls in one task"
              value={advisor.maxCalls}
              range={LIMITS.advisorCalls}
              onChange={(maxCalls) => onAdvisor({ ...advisor, maxCalls })}
            />
            {advisor.maxCalls === 1 ? "time" : "times"} a task
          </span>
        </>
      ) : (
        <>
          <span className="empty">Optional. A second opinion at any step</span>
          <span className="spacer" />
        </>
      )}
      {picked && (
        <button className="place" aria-label="Make the selected model the advisor" onClick={() => onAdvise(picked)}>
          {advisor ? "Use instead" : "Add here"}
        </button>
      )}
      {advisor && about && (
        <button className="ghost" aria-label={`Remove ${about.name} as advisor`} onClick={() => onAdvisor(undefined)}>
          <Icon name="close" />
        </button>
      )}
    </aside>
  );
}

/** The effort a model runs at, as a menu where the catalog knows its levels. */
function Effort(props: { recipe: Recipe; model: ModelRef; label: string; onOption(option: string, value: string): void }) {
  const { model } = props;
  const effort = describe(props.recipe, model).catalog?.effort;
  if (!effort) return <>{Object.values(model.options ?? {}).map(String).join(" ")}</>;
  const chosen = model.options?.[effort.option] !== undefined ? String(model.options[effort.option]) : "";
  return (
    <select aria-label={props.label} value={chosen} onChange={(event) => props.onOption(effort.option, event.target.value)}>
      {chosen === "" && <option value="">default</option>}
      {(chosen === "" || effort.values.includes(chosen) ? effort.values : [chosen, ...effort.values]).map((value) => (
        <option key={value}>{value}</option>
      ))}
    </select>
  );
}

function Chip(props: {
  recipe: Recipe;
  model: ModelRef;
  station: string;
  onMoveUp?: () => void;
  onRemove(): void;
  onOption(option: string, value: string): void;
}) {
  const { recipe, model, station } = props;
  const { maker, name, catalog } = describe(recipe, model);
  const unconfirmed = catalog?.status === "unconfirmed";
  const tip = modelNote(model.instanceId, model.model, catalog?.status);
  return (
    <li className="chip">
      <span className="who" tabIndex={0} role="note" aria-label={`${name}. ${tip}`} data-tip={tip}>
        <MakerLogo maker={maker} />
        <span className="name">{name}</span>
        {unconfirmed && <span className="flag mono">check id</span>}
      </span>
      <span className="acts">
        {props.onMoveUp && (
          <button className="ghost" aria-label={`Move ${name} up in ${station}`} onClick={props.onMoveUp}>
            <Icon name="up" />
          </button>
        )}
        <button className="ghost" aria-label={`Remove ${name} from ${station}`} onClick={props.onRemove}>
          <Icon name="close" />
        </button>
      </span>
      <span className="meta mono">
        <Effort recipe={recipe} model={model} label={`Effort for ${name} in ${station}`} onOption={props.onOption} />
        <span>{providerLabel(model.instanceId)}</span>
      </span>
    </li>
  );
}

interface Stop {
  x: number;
  hue: string;
  move: number;
  hold: number;
  text: string;
}

/** How long the logo's eyes take to find the work item when a preview starts. */
const GLANCE = 250;

/**
 * Where the logo's eyes sit to look at something this share of the way from the logo across to Review.
 * They rest looking at Review. Everything before it is further left and, being below the logo, lower.
 */
const gaze = (share: number) => `translate(${(-6 * (1 - share)).toFixed(2)}px, ${(2 * (1 - share)).toFixed(2)}px)`;

function Track({ recipe, fileCount, missing, onPlay }: { recipe: Recipe; fileCount: number; missing: string; onPlay: LineProps["onPlay"] }) {
  const ready = missing === "";
  const track = useRef<HTMLDivElement>(null);
  const item = useRef<HTMLSpanElement>(null);
  const running = useRef<{ animation?: Animation; eyes?: Animation; timers: number[] }>({ timers: [] });
  const [status, setStatus] = useState<string | null>(null);
  const { plan, build, review } = recipe.phases;
  const name = (model: ModelRef) => describe(recipe, model).name;

  const stop = () => {
    running.current.animation?.cancel();
    running.current.eyes?.cancel();
    running.current.timers.forEach(clearTimeout);
    running.current = { timers: [] };
  };
  // Stops the timers and the animation when the line goes away.
  useEffect(() => stop, []);

  const run = () => {
    const host = track.current;
    const dot = item.current;
    if (!host || !dot) return;
    stop();
    const segs = [...host.querySelectorAll<HTMLElement>(".seg")];
    const gate = host.querySelector<HTMLElement>(".gate");
    const [first, second, third, last] = segs;
    if (!first || !second || !third || !last || !gate) return;
    const centre = (element: HTMLElement) => {
      const box = element.getBoundingClientRect();
      return box.left + box.width / 2;
    };
    const x = (element: HTMLElement) => centre(element) - centre(first);
    const styles = getComputedStyle(host);
    const hue = (phase: Phase | "out" | "advisor") => styles.getPropertyValue(`--${phase}`).trim();

    const [planner, builder] = [plan[0], build[0]];
    if (!planner || !builder) return;
    const stops: Stop[] = [
      { x: 0, hue: hue("plan"), move: 0, hold: 700, text: `Planning on ${name(planner)}` },
      ...(recipe.advisor ? [{ x: 0, hue: hue("advisor"), move: 0, hold: 700, text: `${name(recipe.advisor)} checks the plan` }] : []),
      { x: x(gate), hue: hue("plan"), move: 500, hold: 800, text: "Waiting for your go-ahead" },
      { x: x(second), hue: hue("build"), move: 500, hold: 800, text: `Building on ${name(builder)}` },
      ...review.map((reviewer, i) => ({
        x: x(third) + (i - (review.length - 1) / 2) * 20,
        hue: hue("review"),
        move: i === 0 ? 500 : 300,
        hold: 600,
        text: `Review by ${name(reviewer)}`,
      })),
      { x: x(last), hue: hue("out"), move: 500, hold: 0, text: `Done. ${fileCount} files ready` },
    ];

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dot.style.transform = `translateX(${x(last)}px)`;
      dot.style.backgroundColor = hue("out");
      setStatus(`Done. ${fileCount} files ready`);
      return;
    }

    const total = stops.reduce((sum, s) => sum + s.move + s.hold, 0);
    const easing = "cubic-bezier(0.4, 0, 0.2, 1)";
    // The logo sits above the left end of the belt, so the eyes follow the work item from there across to Review.
    const left = host.getBoundingClientRect().left;
    const reach = centre(third) - left;
    const share = (stop: Stop) => Math.min(1, (centre(first) + stop.x - left) / reach);
    const frames: Keyframe[] = [];
    const eyes: Keyframe[] = [];
    let looking = gaze(1);
    let elapsed = 0;
    for (const s of stops) {
      // The eyes leave with the work item and get there a little sooner, so they are never behind it.
      const next = gaze(share(s));
      eyes.push({ transform: looking, offset: elapsed / total, easing });
      eyes.push({ transform: next, offset: (elapsed + (s.move > 0 ? s.move * 0.7 : GLANCE)) / total });
      looking = next;
      elapsed += s.move;
      const frame = { transform: `translateX(${s.x}px)`, backgroundColor: s.hue, easing };
      frames.push({ ...frame, offset: elapsed / total });
      running.current.timers.push(window.setTimeout(setStatus, elapsed, s.text));
      elapsed += s.hold;
      if (s.hold > 0) frames.push({ ...frame, offset: elapsed / total });
    }
    eyes.push({ transform: looking, offset: 1 });
    running.current.animation = dot.animate(frames, { duration: total, fill: "forwards" });
    // On a narrow screen the belt is hidden, and there is nothing for the eyes to follow.
    if (reach > 0) running.current.eyes = onPlay(eyes, total);
  };

  return (
    <div className="belt">
      <div className="track" ref={track} aria-hidden="true">
        <div className="segs">
          <span className={plan.length > 0 ? "seg lit" : "seg"} style={{ "--hue": "var(--plan)" } as CSSProperties} />
          <span className={build.length > 0 ? "seg lit" : "seg"} style={{ "--hue": "var(--build)" } as CSSProperties} />
          <span className={review.length > 0 ? "seg lit" : "seg"} style={{ "--hue": "var(--review)" } as CSSProperties} />
          <span className={ready ? "seg lit" : "seg"} style={{ "--hue": "var(--out)" } as CSSProperties} />
        </div>
        <span className={crossesProviders(recipe) ? "link one fresh" : "link one"} />
        <span className={review.length > 0 ? "link two fresh" : "link two"} />
        <span className="link three" />
        <span className="gate">
          <i />
          <b className="mono">Waits for you</b>
        </span>
        <span className="item" ref={item} style={plan.length > 0 ? { background: "var(--plan)" } : undefined}>
          <i />
          <i />
        </span>
      </div>
      <div className="trackbar">
        <button className="btn" onClick={run} disabled={!ready}>
          <PlayIcon />
          Play preview
        </button>
        <span className="readout mono" role="status">
          {status ?? (ready ? `${fileCount} files ready` : `Add a model to ${missing}`)}
        </span>
        <span className="spacer" />
        <span className="key mono">
          <i />
          Same conversation
        </span>
        <span className="key mono">
          <i className="fresh" />
          New conversation
        </span>
      </div>
    </div>
  );
}
