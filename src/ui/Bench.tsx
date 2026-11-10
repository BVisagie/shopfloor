import { CATALOG_DATE, KNOWN_SKILLS, MAKERS, SKILL_GROUPS, modelNote, type KnownSkill, type Maker } from "../catalog";
import { needsRulesSkill } from "../generate";
import { LIMITS, SKILL_LIMIT, shelf, type Recipe, type Skill } from "../recipe";
import { Counter } from "./Counter";
import { Icon, MakerLogo, SkillLogo } from "./icons";
import { DRAG_TYPE } from "./Line";

const MAKER_ORDER = Object.keys(MAKERS) as Maker[];

export function Shelf(props: {
  recipe: Recipe;
  picked: string | null;
  onPick(key: string | null): void;
  onRemoveModel(key: string): void;
  onAddModel(): void;
}) {
  const { recipe, picked } = props;
  const models = shelf(recipe);
  const makers = MAKER_ORDER.filter((maker) => models.some((model) => model.maker === maker));
  const pickedName = models.find((model) => model.key === picked)?.name;
  return (
    <section className="panel shelf" aria-label="Models">
      <header>
        <h2>Models</h2>
        <span className="hint" role="status">
          {pickedName
            ? `${pickedName} selected. Click “Add here” under Plan, Build, Review or Advisor.`
            : "Drag a model onto Plan, Build, Review or Advisor, or click it first"}
        </span>
      </header>
      {makers.map((maker) => (
        <div className="row" key={maker}>
          <span className="maker">
            <MakerLogo maker={maker} />
            {MAKERS[maker]}
          </span>
          <span className="models">
            {models
              .filter((model) => model.maker === maker)
              .map((model) => {
                const status = model.catalog?.status;
                const tip = modelNote(model.ref.instanceId, model.ref.model, status);
                return (
                  <span className="pair" key={model.key}>
                    <button
                      className={picked === model.key ? "model picked" : "model"}
                      data-tip={tip}
                      aria-label={`${model.name}. ${tip}`}
                      aria-pressed={picked === model.key}
                      aria-disabled={status === "unreleased"}
                      draggable={status !== "unreleased"}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(DRAG_TYPE, model.key);
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => status !== "unreleased" && props.onPick(picked === model.key ? null : model.key)}
                    >
                      {model.name}
                      {status === "unconfirmed" && <span className="flag mono">check id</span>}
                    </button>
                    {!model.catalog && (
                      <button className="ghost" aria-label={`Remove ${model.name} from the list`} onClick={() => props.onRemoveModel(model.key)}>
                        <Icon name="close" />
                      </button>
                    )}
                  </span>
                );
              })}
          </span>
        </div>
      ))}
      <div className="row">
        <span />
        <span className="models">
          <button
            className="model add"
            data-tip="Add a model that is not listed here, or one that runs through a different provider."
            aria-label="Add a model"
            onClick={props.onAddModel}
          >
            <Icon name="plus" />
            Add a model
          </button>
          <span className="hint">Model list from {CATALOG_DATE}</span>
        </span>
      </div>
    </section>
  );
}

function Stepper(props: {
  label: string;
  tip: string;
  value: number;
  range: { min: number; max: number };
  onChange(value: number): void;
}) {
  const { label, tip, value, range } = props;
  return (
    <div className="rule">
      <span className="label">
        {label}
        <button className="info" data-tip={tip} aria-label={`${label}: ${tip}`}>
          <Icon name="info" />
        </button>
      </span>
      <Counter label={label} value={value} range={range} onChange={props.onChange} />
    </div>
  );
}

const NOT_BUNDLED =
  "shopfloor writes the skills listed under Built in. The others belong to their authors, so your rules name them and Install can download the current version from each repository. Nothing of theirs is copied into this site.";

const NOT_ENFORCED = "These rules are written into the instructions agents read. Agents usually follow them, but nothing forces them to.";

/** The skills every recipe generates, so the user can see what is already covered. */
function builtIn(recipe: Recipe): { name: string; tip: string }[] {
  const skills = [
    {
      name: "Build the plan",
      tip: "Built in. Runs when you say “execute the plan”: it builds, checks the result, has it reviewed and opens a pull request. It never merges. This does the job of full-stop and full-send from tstack, so those are not offered.",
    },
    {
      name: "Review the change",
      tip: "Built in. The models on Review read the change one at a time until all approve. This does the job of council and sol-loop from tstack, so those are not offered.",
    },
  ];
  if (needsRulesSkill(recipe)) {
    skills.push({ name: "Workflow rules", tip: "Built in. The same rules as a skill, for agents that do not load a rules file." });
  }
  if (recipe.advisor) {
    skills.push({ name: "Ask the advisor", tip: "Built in. Added because this line has an advisor. It tells agents when to ask it, and how." });
  }
  return skills;
}

const known = (skill: Skill) => KNOWN_SKILLS.find((k) => k.name === skill.name && k.repo === skill.repo);

export function Rules(props: {
  recipe: Recipe;
  onLimit(key: keyof Recipe["limits"], value: number): void;
  onAddSkills(skills: Skill[]): void;
  onAddCustomSkill(): void;
  onRemoveSkill(name: string): void;
}) {
  const { recipe } = props;
  const chosen = new Set(recipe.skills.map((skill) => skill.name));
  const full = recipe.skills.length >= SKILL_LIMIT;

  // Adding a skill also adds the skills it calls, so it works once installed.
  const withNeeds = (skill: KnownSkill): Skill[] =>
    [skill, ...KNOWN_SKILLS.filter((other) => skill.needs?.includes(other.name))]
      .filter((each) => !chosen.has(each.name))
      .map(({ name, repo, when }) => ({ name, repo, when }));

  const added = (skill: Skill) => {
    const about = known(skill)?.about;
    const tip = `${about ? `${about} ` : ""}Used ${skill.when}. Click to open ${skill.repo.replace("https://github.com/", "")} on GitHub.`;
    return (
      <span className="pair" key={skill.name}>
        <a className="model" href={skill.repo} target="_blank" rel="noreferrer" data-tip={tip} aria-label={`${skill.name}. ${tip}`}>
          <SkillLogo skill={skill} />
          {skill.name}
        </a>
        <button className="ghost" aria-label={`Remove the ${skill.name} skill`} onClick={() => props.onRemoveSkill(skill.name)}>
          <Icon name="close" />
        </button>
      </span>
    );
  };

  const offered = (skill: KnownSkill) => {
    const extra = withNeeds(skill).slice(1).map((each) => each.name);
    const tip = `${skill.about} Used ${skill.when}.${extra.length > 0 ? ` Also adds ${extra.join(", ")}, which it uses.` : ""} Click to add it.`;
    return (
      <button
        key={skill.name}
        className="model add"
        data-tip={tip}
        aria-label={`Add the ${skill.name} skill. ${tip}`}
        onClick={() => props.onAddSkills(withNeeds(skill))}
      >
        <Icon name="plus" />
        {skill.name}
      </button>
    );
  };

  const groups = (Object.keys(SKILL_GROUPS) as (keyof typeof SKILL_GROUPS)[]).map((group) => ({
    label: SKILL_GROUPS[group],
    added: recipe.skills.filter((skill) => known(skill)?.group === group),
    offered: full ? [] : KNOWN_SKILLS.filter((skill) => skill.group === group && !chosen.has(skill.name)),
  }));
  const own = recipe.skills.filter((skill) => !known(skill));

  return (
    <section className="panel" aria-label="Rules">
      <header>
        <h2>Rules</h2>
        <span className="hint" tabIndex={0} role="note" aria-label={`Not enforced. ${NOT_ENFORCED}`} data-tip={NOT_ENFORCED}>
          Not enforced
        </span>
      </header>
      <Stepper
        label="Max subagents at once"
        tip="How many helper agents may run at the same time. 1 means one at a time. 0 means none, except reviewers and an advisor."
        value={recipe.limits.maxSubagents}
        range={LIMITS.maxSubagents}
        onChange={(value) => props.onLimit("maxSubagents", value)}
      />
      <Stepper
        label="Max review rounds"
        tip="The most times reviewers may read the change, counted across all reviewers. Review ends as soon as everyone approves. If the limit comes first, the agent stops and asks you."
        value={recipe.limits.maxReviewRounds}
        range={LIMITS.maxReviewRounds}
        onChange={(value) => props.onLimit("maxReviewRounds", value)}
      />
      <h3>
        Skills
        <button className="info" data-tip={NOT_BUNDLED} aria-label={`Skills: ${NOT_BUNDLED}`}>
          <Icon name="info" />
        </button>
      </h3>
      <div className="row">
        <span className="maker">Built in</span>
        <span className="models">
          {builtIn(recipe).map((skill) => (
            <span key={skill.name} className="model builtin" tabIndex={0} role="note" data-tip={skill.tip} aria-label={`${skill.name}. ${skill.tip}`}>
              <Icon name="lock" />
              {skill.name}
            </span>
          ))}
        </span>
      </div>
      {groups
        .filter((group) => group.added.length + group.offered.length > 0)
        .map((group) => (
          <div className="row" key={group.label}>
            <span className="maker">{group.label}</span>
            <span className="models">
              {group.added.map(added)}
              {group.offered.map(offered)}
            </span>
          </div>
        ))}
      <div className="row">
        <span className="maker">{own.length > 0 ? "Your own" : ""}</span>
        <span className="models">
          {own.map(added)}
          {!full && (
            <button
              className="model add"
              data-tip="Add any skill from GitHub, with a short note on when to use it."
              aria-label="Add a skill"
              onClick={props.onAddCustomSkill}
            >
              <Icon name="plus" />
              Add a skill
            </button>
          )}
        </span>
      </div>
    </section>
  );
}
