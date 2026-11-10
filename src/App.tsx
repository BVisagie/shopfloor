import { useEffect, useRef, useState } from "react";
import { PROVIDERS } from "./catalog";
import { generateFiles, uninstallable } from "./generate";
import {
  ADVISOR_CALLS,
  BLANK,
  SKILL_LIMIT,
  STARTERS,
  crossesProviders,
  describe,
  isComplete,
  missingSteps,
  modelKey,
  parseRecipe,
  sameModel,
  selfReviewers,
  serializeRecipe,
  shelf,
  type Advisor,
  type CustomModel,
  type Phase,
  type Recipe,
  type Skill,
} from "./recipe";
import { Rules, Shelf } from "./ui/Bench";
import { AddModelDialog, AddSkillDialog, FilesDialog, InstallDialog } from "./ui/Dialogs";
import { Mascot } from "./ui/icons";
import { Line } from "./ui/Line";
import { Tooltip } from "./ui/Tooltip";
import { zip } from "./zip";

const STORAGE_KEY = "shopfloor.recipe";
const LANE_LIMIT = 6;

function restore(): Recipe {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return parseRecipe(JSON.parse(saved));
  } catch {
    // Storage can be blocked or hold an older shape; either way, start from a starter.
  }
  return STARTERS.find((starter) => starter.name === "Professional") ?? BLANK;
}

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "recipe";

/** What the user should know about this recipe before installing it. */
function notesFor(recipe: Recipe): string[] {
  const { plan, build } = recipe.phases;
  const notes: string[] = [];
  if (crossesProviders(recipe)) {
    notes.push(
      "Plan and Build are on different providers. The builder will not see the whole conversation, so the rules ask for a plan that makes sense on its own.",
    );
  }
  for (const reviewer of selfReviewers(recipe)) {
    const alone = recipe.phases.review.length === 1 ? " It is the only reviewer, so when it builds, the review stops and asks you. Add another reviewer." : "";
    notes.push(`${describe(recipe, reviewer).name} is in both Build and Review. It will not review work it built itself.${alone}`);
  }
  const { advisor } = recipe;
  if (advisor && [...plan, ...build].some((model) => sameModel(model, advisor))) {
    notes.push(`${describe(recipe, advisor).name} is the advisor and also plans or builds. A second opinion is worth more from a different model.`);
  }
  const rulesFor = [...plan, ...build];
  for (const ref of rulesFor) {
    const caveat = PROVIDERS[ref.instanceId]?.caveat;
    if (caveat && !notes.includes(caveat)) notes.push(caveat);
  }
  const missing = uninstallable(recipe);
  if (missing.length > 0) {
    notes.push(`Rules for ${missing.join(" and ")} can only be installed into a project, not for the whole machine.`);
  }
  const unconfirmed = [...rulesFor, ...recipe.phases.review, ...(advisor ? [advisor] : [])].filter(
    (ref) => describe(recipe, ref).catalog?.status === "unconfirmed",
  );
  if (unconfirmed.length > 0) {
    const names = [...new Set(unconfirmed.map((ref) => describe(recipe, ref).name))];
    notes.push(`The id for ${names.join(" and ")} is a best guess. Check it in T3 Code's model picker before you install.`);
  }
  return notes;
}

export function App() {
  const [recipe, setRecipe] = useState(restore);
  const [picked, setPicked] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"files" | "install" | "model" | "skill" | null>(null);
  const [problem, setProblem] = useState("");
  // The logo's eyes, which the line moves while a preview plays.
  const eyes = useRef<SVGGElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Keeps the recipe across reloads; the browser's storage is outside React.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeRecipe({ ...recipe, name: recipe.name.trim() || BLANK.name }));
    } catch {
      // Without storage the recipe simply does not survive a reload.
    }
  }, [recipe]);

  // A line can be played, viewed, downloaded and saved only once every step has a model.
  const ready = isComplete(recipe);
  const files = ready ? generateFiles(recipe) : [];
  const missing = missingSteps(recipe).join(" and ").replace(/^(\w+) and (\w+) and /, "$1, $2 and ");
  const lane = (phase: Phase, change: (models: Recipe["phases"][Phase]) => Recipe["phases"][Phase]) =>
    setRecipe((current) => ({ ...current, phases: { ...current.phases, [phase]: change(current.phases[phase]) } }));

  const place = (phase: Phase, key: string) => {
    const model = shelf(recipe).find((candidate) => candidate.key === key);
    setPicked(null);
    if (!model || model.catalog?.status === "unreleased") return;
    lane(phase, (models) =>
      models.length >= LANE_LIMIT || models.some((existing) => sameModel(existing, model.ref)) ? models : [...models, model.ref],
    );
  };

  const advise = (key: string) => {
    const model = shelf(recipe).find((candidate) => candidate.key === key);
    setPicked(null);
    if (!model || model.catalog?.status === "unreleased") return;
    setRecipe((current) => ({ ...current, advisor: { ...model.ref, maxCalls: current.advisor?.maxCalls ?? ADVISOR_CALLS } }));
  };

  const setAdvisor = (advisor: Advisor | undefined) =>
    setRecipe(({ advisor: _former, ...rest }) => (advisor ? { ...rest, advisor } : rest));

  const load = (next: Recipe) => {
    setRecipe(structuredClone(next));
    setPicked(null);
    setProblem("");
  };

  const openRecipe = async (file: File | undefined) => {
    if (!file) return;
    try {
      load(parseRecipe(JSON.parse(await file.text())));
    } catch (error) {
      setProblem(`That file is not a recipe shopfloor can read. ${error instanceof SyntaxError ? "It is not valid JSON." : error instanceof Error ? error.message : ""}`);
    }
  };

  const downloadFiles = () => {
    const folder = `shopfloor-${slug(recipe.name)}`;
    download(`${folder}.zip`, zip(files.map((file) => ({ ...file, path: `${folder}/${file.path}` }))), "application/zip");
  };

  return (
    <div className="app">
      <header className="bar">
        <h1 className="wordmark mono">
          <Mascot eyes={eyes} />
          shopfloor
        </h1>
        <select
          className="starters"
          aria-label="Start from a template"
          value=""
          onChange={(event) => {
            const next = [...STARTERS, BLANK].find((starter) => starter.name === event.target.value);
            if (next) load(next);
          }}
        >
          <option value="" disabled>
            Templates
          </option>
          {STARTERS.map((starter) => (
            <option key={starter.name}>{starter.name}</option>
          ))}
          <option value={BLANK.name}>Empty</option>
        </select>
        <label className="name-field">
          <span className="hint">Name</span>
          <input
            className="recipe-name"
            value={recipe.name}
            maxLength={60}
            onChange={(event) => setRecipe({ ...recipe, name: event.target.value })}
            onBlur={() => recipe.name.trim() === "" && setRecipe({ ...recipe, name: BLANK.name })}
          />
        </label>
        <span className="hint mono file-name">Saves as {slug(recipe.name)}.recipe.json</span>
        <span className="spacer" />
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(event) => {
          void openRecipe(event.target.files?.[0]);
          event.target.value = "";
        }} />
        <button className="btn quiet" onClick={() => fileInput.current?.click()}>
          Open recipe
        </button>
        <button
          className="btn quiet"
          disabled={!ready}
          onClick={() => download(`${slug(recipe.name)}.recipe.json`, serializeRecipe({ ...recipe, name: recipe.name.trim() || BLANK.name }), "application/json")}
        >
          Save recipe
        </button>
      </header>

      <main>
        {problem && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}
        <Line
          recipe={recipe}
          picked={picked}
          files={files}
          missing={missing}
          notes={notesFor(recipe)}
          onPlace={place}
          onRemove={(phase, index) => lane(phase, (models) => models.filter((_, i) => i !== index))}
          onMoveUp={(phase, index) =>
            lane(phase, (models) => models.map((model, i) => (i === index - 1 ? models[index]! : i === index ? models[index - 1]! : model)))
          }
          onOption={(phase, index, option, value) =>
            lane(phase, (models) => models.map((model, i) => (i === index ? { ...model, options: { ...model.options, [option]: value } } : model)))
          }
          onAdvise={advise}
          onAdvisor={setAdvisor}
          onViewFiles={() => setDialog("files")}
          onInstall={() => setDialog("install")}
          onPlay={(frames, duration) => eyes.current?.animate(frames, { duration })}
          onDownload={downloadFiles}
        />
        <div className="bench">
          <Shelf
            recipe={recipe}
            picked={picked}
            onPick={setPicked}
            onAddModel={() => setDialog("model")}
            onRemoveModel={(key) =>
              setRecipe(({ advisor, ...current }) => ({
                ...current,
                ...(advisor && modelKey(advisor) !== key ? { advisor } : {}),
                models: current.models.filter((model) => modelKey(model) !== key),
                phases: {
                  plan: current.phases.plan.filter((model) => modelKey(model) !== key),
                  build: current.phases.build.filter((model) => modelKey(model) !== key),
                  review: current.phases.review.filter((model) => modelKey(model) !== key),
                },
              }))
            }
          />
          <Rules
            recipe={recipe}
            onLimit={(key, value) => setRecipe({ ...recipe, limits: { ...recipe.limits, [key]: value } })}
            onAddSkills={(skills: Skill[]) => setRecipe({ ...recipe, skills: [...recipe.skills, ...skills].slice(0, SKILL_LIMIT) })}
            onAddCustomSkill={() => setDialog("skill")}
            onRemoveSkill={(name) => setRecipe({ ...recipe, skills: recipe.skills.filter((skill) => skill.name !== name) })}
          />
        </div>
      </main>

      <footer>
        <span>Logos belong to their owners and are shown to identify their products. shopfloor is not affiliated with T3 Code or any model maker.</span>
        <a href="https://github.com/BVisagie/shopfloor">Source</a>
      </footer>

      <Tooltip />
      {dialog === "install" && <InstallDialog recipe={recipe} onDownload={downloadFiles} onClose={() => setDialog(null)} />}
      {dialog === "files" && <FilesDialog files={files} onDownload={downloadFiles} onClose={() => setDialog(null)} />}
      {dialog === "model" && (
        <AddModelDialog
          recipe={recipe}
          onClose={() => setDialog(null)}
          onAdd={(model: CustomModel) => {
            setRecipe({ ...recipe, models: [...recipe.models, model] });
            setDialog(null);
          }}
        />
      )}
      {dialog === "skill" && (
        <AddSkillDialog
          recipe={recipe}
          onClose={() => setDialog(null)}
          onAdd={(skill) => {
            setRecipe({ ...recipe, skills: [...recipe.skills, skill] });
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
