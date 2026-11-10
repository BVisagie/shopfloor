import { PROVIDERS, providerLabel, type InstallTarget } from "./catalog";
import { installScript } from "./installScript";
import { crossesProviders, describe, isComplete, serializeRecipe, type Advisor, type ModelRef, type Recipe } from "./recipe";

export interface OutputFile {
  path: string;
  content: string;
  executable?: boolean;
}

/** The install script finds the rules by these two lines, so each must stay a whole line. */
export const RULES_START = "<!-- shopfloor:start -->";
export const RULES_END = "<!-- shopfloor:end -->";

const optionList = (ref: ModelRef) =>
  Object.entries(ref.options ?? {})
    .map(([key, value]) => ` · \`${key}: ${value}\``)
    .join("");

/** "Fable 5.2 (`claudeAgent` · `claude-fable-5-2` · `effort: xhigh`)" */
const named = (recipe: Recipe, ref: ModelRef) =>
  `${describe(recipe, ref).name} (\`${ref.instanceId}\` · \`${ref.model}\`${optionList(ref)})`;

const lane = (recipe: Recipe, refs: ModelRef[]) => refs.map((ref) => named(recipe, ref)).join("; ");

/** "Opus 5.5 with effort high", for a line a person reads. */
const spoken = (recipe: Recipe, ref: ModelRef) => {
  const options = Object.entries(ref.options ?? {}).map(([key, value]) => `${key} ${value}`);
  return `${describe(recipe, ref).name}${options.length > 0 ? ` with ${options.join(" and ")}` : ""}`;
};

/** Where the install script writes machine-wide files: the providers that plan or build. */
export function installTargets(recipe: Recipe): InstallTarget[] {
  const refs = [...recipe.phases.plan, ...recipe.phases.build];
  return [...new Set(refs.flatMap((ref) => PROVIDERS[ref.instanceId]?.install ?? []))];
}

/** Plan and build providers the install script has no machine-wide location for. */
export const uninstallable = (recipe: Recipe) => [
  ...new Set(
    [...recipe.phases.plan, ...recipe.phases.build]
      .filter((ref) => !PROVIDERS[ref.instanceId]?.install)
      .map((ref) => providerLabel(ref.instanceId)),
  ),
];

function subagentRules(recipe: Recipe): string[] {
  const max = recipe.limits.maxSubagents;
  if (max === 0) {
    const allowed = recipe.advisor ? "the reviewers the review skill starts and the advisor" : "the reviewers the review skill starts";
    return [`- Start no subagents, except ${allowed}. Do the work in this thread.`];
  }
  return [
    max === 1
      ? "- Run at most one subagent at a time. Wait for it to finish before you start another."
      : `- Run at most ${max} subagents at the same time.`,
    "- Tell every subagent that it may not start subagents of its own.",
  ];
}

const times = (count: number) => (count === 1 ? "once" : `${count} times`);

/** The moments an advisor is asked. The skills that run at those moments repeat their own. */
function advisorRules(recipe: Recipe): string[] {
  const { advisor } = recipe;
  if (!advisor) return [];
  return [
    "",
    "### Advisor",
    "",
    `- The advisor is ${named(recipe, advisor)}. It gives a second opinion. It reads and answers, and never edits.`,
    "- Ask it with the `shopfloor-advise` skill:",
    "  - before you show a plan to the user, once for each plan",
    "  - when the same check or fix has failed twice, before a third try",
    "  - when a reviewer still holds a finding after it has read your reasons, before you ask the user",
    "  - when the user asks for it",
    "- While you plan, your tools may be read-only and refuse to start it. Then write in the plan that the advisor has not read it. The build asks it first.",
    `- Ask at most ${times(advisor.maxCalls)} in one task. A task is one plan and its build.`,
    "- Its answer is advice. Weigh it and decide yourself. Tell the user what it said, and say so when you did not follow it.",
  ];
}

export function rules(recipe: Recipe): string {
  const { plan, build } = recipe.phases;
  const lines = [
    RULES_START,
    `## Workflow: ${recipe.name}`,
    "",
    "These rules come from a shopfloor recipe and apply to work in T3 Code, which tells you in your instructions when you are running in it. In any other session, ignore them. To change them, change the recipe and install it again.",
    "",
    "### Plan",
    "",
    `- Models that plan, preferred first: ${lane(recipe, plan)}.`,
    "- If this thread runs a model that is not on that list, say so once and plan all the same.",
    "- When asked to plan, research, diagnose or design, change no files. End with a written plan, then stop and wait for the user.",
    `- End every plan by naming the build model: \`Build model: ${build[0] ? spoken(recipe, build[0]) : ""}. Switch to it if this thread runs a model or a setting that is not listed under Build, then say "execute the plan".\``,
  ];
  if (crossesProviders(recipe)) {
    lines.push(
      "- The build can run on another provider, which starts without this conversation. Write each plan so it stands alone: name the files, give each decision with its reason, say what is out of scope, and list the checks to run.",
    );
  }
  lines.push(
    "",
    "### Build",
    "",
    `- Models that build, preferred first: ${lane(recipe, build)}.`,
    '- "Execute the plan", or close wording, starts the `shopfloor-build` skill.',
    "",
    "### Review",
    "",
    "- Before you open a pull request or push to a default branch, run the `shopfloor-review` skill. Only the user can skip it, in their current message.",
    ...advisorRules(recipe),
    "",
    "### Limits",
    "",
    ...subagentRules(recipe),
  );
  if (recipe.skills.length > 0) {
    lines.push(
      "",
      "### Skills",
      "",
      ...recipe.skills.map((skill) => `- Use the \`${skill.name}\` skill ${skill.when}.`),
      "- If a skill named here is not installed, say so once and carry on without it.",
    );
  }
  lines.push(RULES_END, "");
  return lines.join("\n");
}

/** Claude and Codex load a rules file at the start of every session. Other agents may not. */
const LOADS_RULES_FILE = new Set(["claudeAgent", "codex"]);

/** True when some agent that plans or builds may never see the rules file, so the rules must also travel as a skill. */
export function needsRulesSkill(recipe: Recipe): boolean {
  return [...recipe.phases.plan, ...recipe.phases.build].some((ref) => !LOADS_RULES_FILE.has(ref.instanceId));
}

/** The same rules as a skill, for agents that find skills but do not load a rules file. */
export function rulesSkill(recipe: Recipe): string {
  const body = rules(recipe)
    .split("\n")
    .filter((line) => line !== RULES_START && line !== RULES_END)
    .join("\n");
  return `---
name: shopfloor-rules
description: Read first on every task in T3 Code, before you plan, build, review or start a subagent, unless your instructions already hold a section headed "Workflow:". Holds the workflow rules for this work, such as which models plan, build and review, the limits, and the skills to use.
---

# Workflow rules

Follow these rules for the rest of this thread.

${body}`;
}

/** A machine install puts the skills where sessions outside T3 Code find them too, so each skill says where it applies. */
const ONLY_IN_T3 =
  "This skill is for work in T3 Code, which tells you in your instructions when you are running in it. In any other session, do not follow it. Say in one line that it needs T3 Code, and carry on as you would without it.";

export function buildSkill(recipe: Recipe): string {
  return `---
name: shopfloor-build
description: Use in T3 Code when the user says "execute the plan" or close wording. Builds the plan agreed in this thread, proves it works, gets it reviewed, and opens a pull request.
---

# Build the plan

${ONLY_IN_T3}

The user agreed a plan and wants it built without approving each step. Work through the steps in order, then stop.

1. **Find the plan.** It is the plan agreed in this thread. If you cannot see all of it, which happens after a switch of provider, read it from this thread with \`t3_thread_read\` before anything else. \`orchestrator_capabilities\` gives this thread's id as \`parentThreadId\`. If there is no plan, or it leaves open a choice that changes the result, ask.${
    recipe.advisor
      ? " If the plan says the advisor has not read it, ask the advisor now with the `shopfloor-advise` skill. If its answer changes the plan, stop and tell the user before you build."
      : ""
  }
2. **Check the model.** These models may build, preferred first: ${lane(recipe, recipe.phases.build)}. If this thread runs a model that is not on the list, or a listed model with other options, name what it runs and ask whether to continue or switch. Never switch it yourself. \`orchestrator_capabilities\` reports this thread's model as \`inheritedModel\` and its options as \`inheritedOptions\`.
3. **Start clean.** Fetch the remote and branch from its default branch. If the working tree holds changes you did not make, ask before you touch them.
4. **Build** the smallest change that delivers the plan. Commit in logical steps.
5. **Prove it.** Run the checks the repository's CI runs. For a reported problem, reproduce it first, then watch the same reproduction pass. Note anything you could not prove.${
    recipe.advisor ? " When the same check or fix has failed twice, ask the advisor with the `shopfloor-advise` skill before a third try." : ""
  }
6. **Read your own diff** against the plan and cut what the plan did not ask for.
7. **Review.** Run the \`shopfloor-review\` skill. Continue only when it finds every reviewer done, or the user settles a disagreement.
8. **Open a pull request** that says what changed and how it was tested. Never merge it.
9. **Stop and report:** the review state first, then the link, what you proved, what you could not, and each decision you made for the user.
`;
}

const target = (ref: ModelRef) =>
  JSON.stringify({ providerInstanceId: ref.instanceId, model: ref.model, ...(ref.options ? { options: ref.options } : {}) });

export function reviewSkill(recipe: Recipe): string {
  const reviewers = recipe.phases.review
    .map((ref, i) => `${i + 1}. ${describe(recipe, ref).name}: \`${target(ref)}\``)
    .join("\n");
  const rounds = recipe.limits.maxReviewRounds;
  return `---
name: shopfloor-review
description: Use in T3 Code before opening a pull request or pushing to a default branch, when the user asks for a review, and from shopfloor-build. Other models read the change one at a time until each approves.
---

# Review the change

${ONLY_IN_T3}

Reviewers read; you fix. Each reviewer runs as a child task on its own model, so it reads the change cold.

## Reviewers, in order

Each line gives the reviewer and its \`target\` for \`delegate_task\`.

${reviewers}

## Rules

- A model never reviews its own work. Skip a reviewer that is the model running this thread, and say that you did. If that leaves no reviewer, stop and ask the user.
- One reviewer runs at a time. Do not edit files while it runs.
- One round is one run of one reviewer. Use at most ${rounds} ${rounds === 1 ? "round" : "rounds"} in total, counted across all reviewers.
- A reviewer is done when it approves, or when all it has left are nits that you fixed or declined. A clean first read needs no second round. It stays done when a later reviewer leads to changes.
- When the rounds run out before every reviewer is done, stop and ask the user.
- If \`delegate_task\` is not available, stop and tell the user. Do not skip the review, and do not review the change yourself.

## Each round

1. Before the first round, call \`orchestrator_capabilities\` and check that every reviewer's provider is listed. Its list of models is short, so pass a model's id as \`search\` before you call that model missing. If one is missing, tell the user. Do not swap in another model.
2. Start the reviewer with \`delegate_task\`: \`mode: "wait"\`, its \`target\` from the list above, and the brief below as \`task\`.
3. Answer its findings. Fix a real problem with the smallest change. Decline a nit, or anything outside the change's intent, and say why.
4. Run the same reviewer again if you changed behaviour, or if you disagree with a finding it marked blocker or should. Fill in the last line of the brief, so that it reads what you fixed and your reasons. Otherwise move to the next reviewer, who reads the fixed code and not the earlier findings.
5. If a reviewer still holds a blocker or should after it has read your reasons, ${
    recipe.advisor ? "ask the advisor with the `shopfloor-advise` skill before you ask the user" : "stop and ask the user"
  }.

## Brief

\`\`\`text
Review only. Do not edit files, commit, push, or start subagents.
Repository: <absolute path>
Base: <the commit the change started from>
Intent: <what the change is for, in one or two sentences>
Out of scope: <what the change leaves alone>
Read the diff from the base, any untracked files, and the code around the change.
Report bugs, callers the change breaks, and places where it does not match the intent.
Leave style alone unless it hides a bug.
blocker: the change does not do what it is for. should: a real bug within that intent. nit: everything else.
Reply with one line, VERDICT: APPROVE or VERDICT: CHANGES, then one line per finding:
[blocker|should|nit] <file>:<line> <what is wrong>. Fix: <suggestion>
Earlier round: <leave this line out on a first read. On a second, what you fixed, and each finding you disagree with and why>
\`\`\`

## When it ends

Report the reviewers that ran, the rounds used, each verdict, and every finding you declined with its reason.
`;
}

function readme(recipe: Recipe): string {
  const notes = [
    "Read `rules.md` and the skills before you install a recipe someone else made. Agents will follow them.",
    "These are instructions, not limits. Agents usually follow them, and nothing enforces them.",
    "Instruction files you already have still apply, and an agent may follow them over these rules.",
    ...[...recipe.phases.plan, ...recipe.phases.build].flatMap((ref) => PROVIDERS[ref.instanceId]?.caveat ?? []),
  ];
  const missing = uninstallable(recipe);
  if (missing.length > 0) {
    notes.push(
      `The machine install has no known place for ${missing.join(" or ")} rules. Use the project install, which writes \`AGENTS.md\`.`,
    );
  }
  const skills =
    recipe.skills.length > 0
      ? `\n## Skills from other projects\n\nThe rules name these skills. They belong to their authors, so they are not in this folder. Add \`--with-skills\` to the install command to download the ones you are missing from the repositories below. Without it, the script only tells you which are missing.\n\n${recipe.skills.map((skill) => `- \`${skill.name}\`: ${skill.repo}`).join("\n")}\n`
      : "";
  return `# ${recipe.name}

Rules and skills for coding agents in T3 Code, generated by shopfloor.

- \`rules.md\`: the rules agents load at the start of every session.
- \`skills/\`: the skills those rules name.
- \`recipe.json\`: the recipe. Open it in shopfloor to change it.
- \`install.sh\`: puts the files where agents read them.

## Install

For one repository:

    ./install.sh project /path/to/repository

For every project on this machine:

    ./install.sh machine

Add \`--dry-run\` to see what would change, or \`--uninstall\` to remove the rules and skills the script added. Start a new thread afterwards, because running threads keep what they loaded.

## Good to know

${[...new Set(notes)].map((note) => `- ${note}`).join("\n")}
${skills}`;
}

/** How to ask the advisor. Written only for a recipe that has one. */
export function adviseSkill(recipe: Recipe, advisor: Advisor): string {
  return `---
name: shopfloor-advise
description: Use in T3 Code to get a second opinion from the advisor model. Ask before you show a plan to the user, when the same check or fix has failed twice, when you and a reviewer cannot agree, and when the user says "ask the advisor". The advisor reads and answers. It never edits.
---

# Ask the advisor

${ONLY_IN_T3}

The advisor is ${describe(recipe, advisor).name}. It runs as a child task on its own model, so it knows only what your question tells it.

Its \`target\` for \`delegate_task\`:

\`${target(advisor)}\`

## Rules

- Ask at most ${times(advisor.maxCalls)} in one task, counted across every reason. A task is one plan and its build. When that is used up, carry on without the advisor and say so.
- Ask one question at a time. Do not edit files while the advisor runs.
- Its answer is advice. Weigh it and decide yourself. Tell the user in a line or two what it said, and say so when you did not follow it.
- If \`delegate_task\` is not available, tell the user and carry on without the advisor.
- If you are not allowed to start it, which can happen while you plan with read-only tools, do not insist. Write in the plan that the advisor has not read it.

## Ask

1. Before the first question, call \`orchestrator_capabilities\` and check that the advisor's provider is listed. Its list of models is short, so pass the model's id as \`search\` before you call it missing. If it is missing, tell the user and carry on without it. Do not swap in another model.
2. Start the advisor with \`delegate_task\`: \`mode: "wait"\`, \`interactionMode: "plan"\`, the \`target\` above, and the question below as \`task\`.
3. Use the answer, then carry on with your own work.

## Question

\`\`\`text
Advise only. Do not edit files, commit, push, or start subagents.
Repository: <absolute path>
Question: <the one decision or problem you want a second opinion on>
What I know: <the plan, or what you tried and what happened, with file paths and exact errors>
What I lean towards: <your current answer, and why>
Read what you need in the repository before you answer.
Reply briefly with: what you would do, the main risk in my current answer, and anything I have missed.
\`\`\`
`;
}

/** Every file a recipe produces, in the order the site lists them. Every step must have a model. */
export function generateFiles(recipe: Recipe): OutputFile[] {
  if (!isComplete(recipe)) throw new Error("Plan, Build and Review each need at least one model.");
  const files: OutputFile[] = [
    { path: "README.md", content: readme(recipe) },
    { path: "rules.md", content: rules(recipe) },
  ];
  if (needsRulesSkill(recipe)) files.push({ path: "skills/shopfloor-rules/SKILL.md", content: rulesSkill(recipe) });
  files.push(
    { path: "skills/shopfloor-build/SKILL.md", content: buildSkill(recipe) },
    { path: "skills/shopfloor-review/SKILL.md", content: reviewSkill(recipe) },
    ...(recipe.advisor ? [{ path: "skills/shopfloor-advise/SKILL.md", content: adviseSkill(recipe, recipe.advisor) }] : []),
    { path: "install.sh", content: installScript(installTargets(recipe), recipe.skills), executable: true },
    { path: "recipe.json", content: serializeRecipe(recipe) },
  );
  return files;
}

export type InstallMode = "machine" | "project";

const FILE_END = "SHOPFLOOR_FILE_END";

/**
 * A script that carries the files it installs: it writes them to a temporary folder and runs
 * their install script with the arguments it was given. The README and the recipe stay out,
 * because installing does not need them.
 */
export function installPayload(recipe: Recipe): string {
  const files = generateFiles(recipe).filter((file) => file.path !== "README.md" && file.path !== "recipe.json");
  const folders = new Set(files.flatMap((file) => (file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : [])));
  const written = files.map((file) => {
    // The file must end its last line and never hold the closing marker on a line of its own.
    if (!file.content.endsWith("\n") || file.content.split("\n").includes(FILE_END)) {
      throw new Error(`${file.path} cannot be packed into an install command`);
    }
    return `cat >"$dir/${file.path}" <<'${FILE_END}'\n${file.content}${FILE_END}`;
  });
  return [
    "set -euo pipefail",
    'dir=$(mktemp -d "${TMPDIR:-/tmp}/shopfloor.XXXXXX")',
    `trap 'rm -rf "$dir"' EXIT`,
    `mkdir -p ${[...folders].map((folder) => `"$dir/${folder}"`).join(" ")}`,
    ...written,
    'bash "$dir/install.sh" "$@"',
    "",
  ].join("\n");
}

/** One line to paste into a terminal. It works in bash, zsh and fish, which a multi-line script would not. */
export const installCommand = (packed: string, mode: InstallMode, withSkills = false) =>
  `echo '${packed}' | base64 --decode | gunzip | bash -s -- ${mode}${withSkills ? " --with-skills" : ""}`;

const MACHINE_PLACES: Record<InstallTarget, string[]> = {
  claude: ["~/.claude/CLAUDE.md", "~/.claude/skills/"],
  codex: ["~/.codex/AGENTS.md", "~/.agents/skills/"],
  antigravity: ["~/.gemini/AGENTS.md", "~/.gemini/config/skills/"],
  muse: ["~/.agents/skills/"],
};

/** The files and folders an install touches, for showing before the user runs it. */
export function installPlaces(recipe: Recipe, mode: InstallMode): string[] {
  const targets = installTargets(recipe);
  if (mode === "machine") return [...new Set(targets.flatMap((target) => MACHINE_PLACES[target]))];
  return ["AGENTS.md", ".agents/skills/", ...(targets.includes("claude") ? ["CLAUDE.md, if there is none", ".claude/skills, as a link"] : [])];
}
