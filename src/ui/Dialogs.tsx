import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { KNOWN_SKILLS, MAKERS, PROVIDERS } from "../catalog";
import { installCommand, installPayload, installPlaces, installTargets, type InstallMode, type OutputFile } from "../generate";
import { pack } from "../pack";
import { MODEL_LIMIT, parseRecipe, sameModel, shelf, type CustomModel, type Recipe, type Skill } from "../recipe";
import { Icon, SkillLogo } from "./icons";

function Modal(props: { label: string; className?: string; onClose(): void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  // The modal state lives in the browser's dialog element, so it is opened once it exists.
  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={props.className}
      aria-label={props.label}
      onClose={props.onClose}
      onClick={(event) => {
        // The backdrop belongs to the dialog element; its content sits in a child.
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      {props.children}
    </dialog>
  );
}

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function FormActions({ submit }: { submit: string }) {
  return (
    <div className="form-actions">
      <button type="button" className="btn" onClick={(event) => event.currentTarget.closest("dialog")?.close()}>
        Cancel
      </button>
      <button className="btn primary">{submit}</button>
    </div>
  );
}

export function AddModelDialog(props: { recipe: Recipe; onAdd(model: CustomModel): void; onClose(): void }) {
  const { recipe } = props;
  const [error, setError] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const option = field(form, "option");
    const value = field(form, "value");
    try {
      if (Boolean(option) !== Boolean(value)) throw new Error("Give both the setting name and its value, or leave both empty.");
      const draft = {
        maker: field(form, "maker"),
        name: field(form, "name"),
        instanceId: field(form, "provider"),
        model: field(form, "model"),
        ...(option ? { options: { [option]: value } } : {}),
      };
      // The recipe reader is the one place that decides what a valid model is.
      const model = parseRecipe({ ...recipe, models: [draft] }).models[0]!;
      if (shelf(recipe).some((existing) => sameModel(existing.ref, model))) {
        throw new Error("That model is already in the list.");
      }
      if (recipe.models.length >= MODEL_LIMIT) throw new Error(`A recipe holds at most ${MODEL_LIMIT} added models. Remove one first.`);
      // The whole list is read once more, so that every rule for a recipe also holds with the new model in it.
      parseRecipe({ ...recipe, models: [...recipe.models, model] });
      props.onAdd(model);
    } catch (problem) {
      setError(message(problem));
    }
  };
  return (
    <Modal label="Add a model" onClose={props.onClose}>
      <form className="sheet" onSubmit={submit}>
        <h2>Add a model</h2>
        <p className="hint">Find the provider and model id in the model picker in T3 Code.</p>
        <label>
          Made by
          <select name="maker" defaultValue="other">
            {Object.entries(MAKERS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input name="name" required maxLength={40} placeholder="Sonnet 5.5" autoComplete="off" />
        </label>
        <label>
          Provider in T3 Code
          <input name="provider" required list="provider-ids" pattern="[\w.:\/@+\-]{1,100}" placeholder="claudeAgent" autoComplete="off" title="A provider instance id: letters, digits and . : / @ + -" />
          <datalist id="provider-ids">
            {Object.entries(PROVIDERS).map(([id, provider]) => (
              <option key={id} value={id}>
                {provider.label}
              </option>
            ))}
          </datalist>
        </label>
        <label>
          Model id
          <input name="model" required pattern="[\w.:\/@+\-]{1,100}" placeholder="claude-sonnet-5-5" autoComplete="off" title="Letters, digits and . : / @ + -" />
        </label>
        <div className="pair-fields">
          <label>
            Setting name (optional)
            <input name="option" pattern="[A-Za-z_]\w{0,39}" placeholder="effort" autoComplete="off" title="For example effort or reasoningEffort" />
          </label>
          <label>
            Setting value
            <input name="value" pattern="[\w.:+\-]{1,40}" placeholder="high" autoComplete="off" title="Letters, digits and . : + -" />
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <FormActions submit="Add model" />
      </form>
    </Modal>
  );
}

export function AddSkillDialog(props: { recipe: Recipe; onAdd(skill: Skill): void; onClose(): void }) {
  const { recipe } = props;
  const [error, setError] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const repo = field(form, "repo").replace(/\/+$/, "");
    const draft = { repo, name: field(form, "name") || (repo.split("/").pop() ?? "").toLowerCase(), when: field(form, "when") };
    try {
      props.onAdd(parseRecipe({ ...recipe, skills: [...recipe.skills, draft] }).skills.at(-1)!);
    } catch (problem) {
      setError(message(problem));
    }
  };
  return (
    <Modal label="Add a skill" onClose={props.onClose}>
      <form className="sheet" onSubmit={submit}>
        <h2>Add a skill</h2>
        <p className="hint">The rules will tell agents to use this skill. The install command can download it when the repository keeps it at skills/&lt;name&gt;.</p>
        <label>
          GitHub repository
          <input name="repo" required type="url" pattern="https://github\.com/[\w.\-]+/[\w.\-]+/?" placeholder="https://github.com/owner/skill" autoComplete="off" title="A link such as https://github.com/owner/skill" />
        </label>
        <label>
          Skill name (optional)
          <input name="name" pattern="[a-z0-9][a-z0-9\-]{0,63}" placeholder="Uses the repository name" autoComplete="off" title="Lower-case letters, digits and hyphens" />
        </label>
        <label>
          When to use it
          <input name="when" required maxLength={120} placeholder="on every coding task" autoComplete="off" />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <FormActions submit="Add skill" />
      </form>
    </Modal>
  );
}

export function FilesDialog(props: { files: OutputFile[]; onDownload(): void; onClose(): void }) {
  const { files } = props;
  const [path, setPath] = useState("rules.md");
  const [copied, setCopied] = useState("");
  const file = files.find((candidate) => candidate.path === path) ?? files[0];
  if (!file) return null;
  const copy = () => {
    navigator.clipboard.writeText(file.content).then(
      () => setCopied(file.path),
      () => setCopied(""),
    );
  };
  return (
    <Modal label="Generated files" className="drawer" onClose={props.onClose}>
      <div className="sheet">
        <header>
          <h2>Files</h2>
          <span className="spacer" />
          <button className="btn" onClick={copy}>
            {copied === file.path ? "Copied" : "Copy"}
          </button>
          <button className="btn primary" onClick={props.onDownload}>
            Download
          </button>
          <button className="ghost" aria-label="Close" onClick={(event) => event.currentTarget.closest("dialog")?.close()}>
            <Icon name="close" />
          </button>
        </header>
        <div className="viewer">
          <ul className="mono">
            {files.map((candidate) => (
              <li key={candidate.path}>
                <button aria-current={candidate.path === file.path} onClick={() => setPath(candidate.path)}>
                  {candidate.path}
                </button>
              </li>
            ))}
          </ul>
          <pre className="mono" tabIndex={0}>
            {file.content}
          </pre>
        </div>
      </div>
    </Modal>
  );
}

// The sheet is worded for the system it is opened on, which is usually the one T3 Code is on.
const SYSTEM = /Windows/.test(navigator.userAgent) ? "windows" : /Mac|iPhone|iPad/.test(navigator.userAgent) ? "mac" : "other";
// T3 Code binds its terminal to mod+J: Command on a Mac, Control everywhere else.
const MOD = SYSTEM === "mac" ? "⌘" : "Ctrl";

const MODES: Record<InstallMode, { label: string; about: string; open: string; where: string }> = {
  machine: {
    label: "Every project",
    about: "For you, on the machine your agents run on",
    open: "Open the terminal in T3 Code",
    where: "in any project",
  },
  project: {
    label: "One project",
    about: "For everyone who works in the repository, once committed",
    open: "Open the project’s terminal in T3 Code",
    where: "with the project open",
  },
};

export function InstallDialog(props: { recipe: Recipe; onDownload(): void; onClose(): void }) {
  const { recipe } = props;
  // A line whose agents have no machine-wide rules file can only be installed into a project.
  const [mode, setMode] = useState<InstallMode>(() => (installTargets(recipe).length > 0 ? "machine" : "project"));
  const [packed, setPacked] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // A recipe someone else made can name any repository, and View files does not show what is in it.
  // So only the skills this site lists are downloaded without being asked for.
  const unlisted = recipe.skills.filter((skill) => !KNOWN_SKILLS.some((known) => known.name === skill.name && known.repo === skill.repo));
  const [wanted, setWanted] = useState(unlisted.length === 0);
  const withSkills = wanted && recipe.skills.length > 0;
  const sources = [...new Set(recipe.skills.map((skill) => skill.repo.replace("https://github.com/", "")))];

  // Compressing the files uses the browser's own stream API, which only answers later.
  useEffect(() => {
    let current = true;
    void pack(installPayload(recipe)).then((result) => current && setPacked(result));
    return () => {
      current = false;
    };
  }, [recipe]);

  const command = packed === null ? "" : installCommand(packed, mode, withSkills);
  const copy = () => {
    navigator.clipboard.writeText(command).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <Modal label="Install in T3 Code" className="install" onClose={props.onClose}>
      <div className="sheet">
        <header>
          <img src="logos/t3code-nightly.webp" alt="" width="40" height="40" />
          <div>
            <h2>Install in T3 Code</h2>
            <p>One command puts the rules and skills where your agents read them</p>
          </div>
          <button className="ghost" aria-label="Close" onClick={(event) => event.currentTarget.closest("dialog")?.close()}>
            <Icon name="close" />
          </button>
        </header>
        <fieldset className="choice">
          <legend>Apply to</legend>
          <div className="options">
            {(Object.keys(MODES) as InstallMode[]).map((each) => (
              <label key={each}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === each}
                  onChange={() => {
                    setMode(each);
                    setCopied(false);
                  }}
                />
                <span>
                  {MODES[each].label}
                  <small>{MODES[each].about}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {recipe.skills.length > 0 && (
          <section className="needs">
            <h3>Skills from other projects</h3>
            <div className="card">
              <label>
                <span>
                  Download the ones you are missing
                  <small>
                    {wanted
                      ? mode === "machine"
                        ? "From each skill’s own repository, keeping any you already have"
                        : "From each skill’s own repository, into the project so that everyone gets them"
                      : "The command will only list the ones you are missing"}
                  </small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={wanted}
                  onChange={(event) => {
                    setWanted(event.currentTarget.checked);
                    setCopied(false);
                  }}
                />
              </label>
              <div className="models">
                {recipe.skills.map((skill) => (
                  <a key={skill.name} className="model" href={skill.repo} target="_blank" rel="noreferrer">
                    <SkillLogo skill={skill} />
                    {skill.name}
                  </a>
                ))}
              </div>
              {unlisted.length > 0 && (
                <p className="caveat">
                  shopfloor does not list {unlisted.map((skill) => skill.name).join(", ")}. Read {unlisted.length === 1 ? "it" : "them"} at{" "}
                  {unlisted.length === 1 ? "its repository" : "their repositories"} before you download.
                </p>
              )}
            </div>
          </section>
        )}
        <ol className="steps">
          <li>
            <div>
              <h3>{MODES[mode].open}</h3>
              <p>
                Press <kbd>{MOD}</kbd> <kbd>J</kbd> {MODES[mode].where}
              </p>
              {SYSTEM === "windows" && (
                <p className="caveat">
                  On Windows the command needs WSL, because T3 Code’s own terminal is PowerShell. Choose a distro in T3 Code under Settings →
                  Sharing &amp; access first.
                </p>
              )}
            </div>
          </li>
          <li>
            <div>
              <h3>Paste the command and press Enter</h3>
              <div className="command">
                <input
                  className="mono"
                  readOnly
                  aria-label="Install command"
                  value={command || "Preparing the command"}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button className="btn primary" disabled={command === ""} onClick={copy}>
                  {copied ? (
                    <>
                      <Icon name="check" />
                      Copied
                    </>
                  ) : (
                    "Copy command"
                  )}
                </button>
              </div>
              <p>It is long because the files travel inside it</p>
            </div>
          </li>
          {mode === "project" && (
            <li>
              <div>
                <h3>Commit the new files</h3>
                <p>A thread that starts in a new worktree sees them once they are on your default branch</p>
              </div>
            </li>
          )}
          <li>
            <div>
              <h3>Start a new thread</h3>
              <p>Plan as usual, then say “execute the plan”</p>
            </div>
          </li>
        </ol>
        <div className="more">
          <details name="more">
            <summary>
              What the command changes
              <Icon name="chevron" />
            </summary>
            <dl>
              <dt>Writes</dt>
              <dd className="lines">
                {installPlaces(recipe, mode).map((place) => (
                  <span key={place} className="mono">
                    {place}
                  </span>
                ))}
              </dd>
              {withSkills && (
                <>
                  <dt>Downloads</dt>
                  <dd className="lines">
                    {sources.map((source) => (
                      <span key={source} className="mono">
                        github.com/{source}
                      </span>
                    ))}
                    <span>Only skills the folders above do not hold yet</span>
                  </dd>
                </>
              )}
              <dt>Keeps</dt>
              <dd>Your rules files: it adds its own block and never replaces one</dd>
              <dt>Backs up</dt>
              <dd>Every file it changes, before it changes it</dd>
              <dt>Runs on</dt>
              <dd>The machine your T3 Code agents run on</dd>
              <dt>Needs</dt>
              <dd>bash, which macOS, Linux and WSL include{withSkills && ", and git for the downloads"}</dd>
              <dt>Preview</dt>
              <dd>
                Add <code>--dry-run</code> to the end of the command
              </dd>
              <dt>Remove</dt>
              <dd>
                Add <code>--uninstall</code> to the end{withSkills ? ", which keeps downloaded skills" : " of the command"}
              </dd>
            </dl>
          </details>
          {recipe.skills.length > 0 && (
            <details name="more">
              <summary>
                Why these skills are not built in
                <Icon name="chevron" />
              </summary>
              <dl>
                <dt>Ownership</dt>
                <dd>Each skill is its author’s work, under its own licence</dd>
                <dt>Updates</dt>
                <dd>You get today’s version from its author, never a stale copy</dd>
                <dt>Size</dt>
                <dd>A skill can pass a megabyte, and the command stays a few kilobytes</dd>
                <dt>Trust</dt>
                <dd>Each name links to its repository, so you can read it first</dd>
              </dl>
            </details>
          )}
          <footer>
            Prefer the files?
            <button className="text-link" onClick={props.onDownload}>
              Download the zip
            </button>
          </footer>
        </div>
      </div>
    </Modal>
  );
}
