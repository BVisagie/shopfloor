import { KNOWN_SKILLS, MAKERS, MODELS, type CatalogModel, type Maker } from "./catalog";

export const PHASES = ["plan", "build", "review"] as const;
export type Phase = (typeof PHASES)[number];
export type OptionValue = string | boolean;

/** A model as T3 Code names it: provider instance, model id and options. */
export interface ModelRef {
  instanceId: string;
  model: string;
  options?: Record<string, OptionValue>;
}

/** A model the user added to the shelf. */
export interface CustomModel extends ModelRef {
  maker: Maker;
  name: string;
}

export interface Skill {
  name: string;
  repo: string;
  /** Completes the sentence "Use the skill ...", for example "on every coding task". */
  when: string;
}

/** A model the others ask for a second opinion. It reads and answers, and never edits. */
export interface Advisor extends ModelRef {
  /** The most times it may be asked during one task. */
  maxCalls: number;
}

export interface Recipe {
  version: 1;
  name: string;
  /** Ordered, preferred first. A draft may leave a step empty; see isComplete. */
  phases: Record<Phase, ModelRef[]>;
  /** Optional. A line works without one. */
  advisor?: Advisor;
  limits: { maxSubagents: number; maxReviewRounds: number };
  skills: Skill[];
  models: CustomModel[];
}

export const LIMITS = {
  maxSubagents: { min: 0, max: 16 },
  maxReviewRounds: { min: 1, max: 12 },
  advisorCalls: { min: 1, max: 12 },
} as const;

/** How often a new advisor may be asked, until the user changes it. */
export const ADVISOR_CALLS = 3;

export const SKILL_LIMIT = 12;

/** How many models of their own a user may add to the shelf. */
export const MODEL_LIMIT = 24;

export const SCHEMA_URL = "https://bvisagie.github.io/shopfloor/recipe.schema.json";

// Recipes are shared between people, and their values end up in a shell script and in
// instructions agents obey, so every field is checked against a narrow shape.
const ID = /^[\w.:/@+-]{1,100}$/;
const OPTION = /^[A-Za-z_]\w{0,39}$/;
const OPTION_VALUE = /^[\w.:+-]{1,40}$/;
const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const REPO = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

class RecipeError extends Error {}
const fail = (message: string): never => {
  throw new RecipeError(message);
};

function object(value: unknown, at: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${at} must be an object`);
  return value as Record<string, unknown>;
}

function list(value: unknown, at: string, max: number): unknown[] {
  if (!Array.isArray(value)) return fail(`${at} must be a list`);
  if (value.length > max) fail(`${at} holds more than ${max} entries`);
  return value;
}

function text(value: unknown, at: string, max: number): string {
  if (typeof value !== "string") return fail(`${at} must be text`);
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) fail(`${at} must be 1 to ${max} characters`);
  if (CONTROL.test(trimmed)) fail(`${at} must be a single line`);
  return trimmed;
}

function match(value: unknown, at: string, shape: RegExp): string {
  if (typeof value !== "string" || !shape.test(value)) fail(`${at} has an unexpected value`);
  return value as string;
}

function int(value: unknown, at: string, range: { min: number; max: number }): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < range.min || value > range.max) {
    fail(`${at} must be a whole number from ${range.min} to ${range.max}`);
  }
  return value as number;
}

function modelRef(value: unknown, at: string): ModelRef {
  const raw = object(value, at);
  const ref: ModelRef = {
    instanceId: match(raw.instanceId, `${at}.instanceId`, ID),
    model: match(raw.model, `${at}.model`, ID),
  };
  if (raw.options !== undefined) {
    // fromEntries keeps every key an own property, whatever its name.
    const options = Object.fromEntries(
      Object.entries(object(raw.options, `${at}.options`)).map(([key, option]): [string, OptionValue] => [
        match(key, `${at}.options`, OPTION),
        typeof option === "boolean" ? option : match(option, `${at}.options.${key}`, OPTION_VALUE),
      ]),
    );
    if (Object.keys(options).length > 0) ref.options = options;
  }
  return ref;
}

function skill(value: unknown, index: number): Skill {
  const raw = object(value, `skills[${index}]`);
  const name = match(raw.name, `skills[${index}].name`, SKILL_NAME);
  if (name.startsWith("shopfloor-")) fail(`skills[${index}].name is reserved`);
  return {
    name,
    repo: match(raw.repo, `skills[${index}].repo`, REPO),
    when: text(raw.when, `skills[${index}].when`, 120),
  };
}

function customModel(value: unknown, index: number): CustomModel {
  const raw = object(value, `models[${index}]`);
  if (typeof raw.maker !== "string" || !Object.hasOwn(MAKERS, raw.maker)) fail(`models[${index}].maker is not a known maker`);
  return {
    ...modelRef(raw, `models[${index}]`),
    maker: raw.maker as Maker,
    name: text(raw.name, `models[${index}].name`, 40),
  };
}

function advisorOf(value: unknown): Advisor {
  const raw = object(value, "advisor");
  return {
    ...modelRef(raw, "advisor"),
    maxCalls: raw.maxCalls === undefined ? ADVISOR_CALLS : int(raw.maxCalls, "advisor.maxCalls", LIMITS.advisorCalls),
  };
}

/** Checks untrusted JSON and returns a clean recipe, or throws with a message for the user. */
export function parseRecipe(input: unknown): Recipe {
  const raw = object(input, "The recipe");
  if (raw.version !== 1) fail("version must be 1");
  const phases = object(raw.phases, "phases");
  const limits = object(raw.limits, "limits");
  const once = <T extends ModelRef>(refs: T[], at: string): T[] =>
    new Set(refs.map(modelKey)).size === refs.length ? refs : fail(`${at} lists the same model twice`);
  const lane = (phase: Phase) =>
    once(
      list(phases[phase] ?? [], `phases.${phase}`, 6).map((ref, i) => modelRef(ref, `phases.${phase}[${i}]`)),
      `phases.${phase}`,
    );
  const skills = list(raw.skills ?? [], "skills", SKILL_LIMIT).map(skill);
  if (new Set(skills.map((s) => s.name)).size !== skills.length) fail("skills lists the same name twice");
  return {
    version: 1,
    name: text(raw.name, "name", 60),
    phases: { plan: lane("plan"), build: lane("build"), review: lane("review") },
    ...(raw.advisor === undefined ? {} : { advisor: advisorOf(raw.advisor) }),
    limits: {
      maxSubagents: int(limits.maxSubagents, "limits.maxSubagents", LIMITS.maxSubagents),
      maxReviewRounds: int(limits.maxReviewRounds, "limits.maxReviewRounds", LIMITS.maxReviewRounds),
    },
    skills,
    models: once(list(raw.models ?? [], "models", MODEL_LIMIT).map(customModel), "models"),
  };
}

/** The recipe as a file. The fields are written in one order, however the recipe was put together. */
export function serializeRecipe({ version, name, phases, advisor, limits, skills, models }: Recipe): string {
  const fields = { $schema: SCHEMA_URL, version, name, phases, ...(advisor ? { advisor } : {}), limits, skills, models };
  return `${JSON.stringify(fields, null, 2)}\n`;
}

export const sameModel = (a: ModelRef, b: ModelRef) => a.instanceId === b.instanceId && a.model === b.model;

export interface Described {
  maker: Maker;
  name: string;
  catalog?: CatalogModel;
}

/** The maker and display name for a model reference: from the catalog, then the recipe's own models. */
export function describe(recipe: Pick<Recipe, "models">, ref: ModelRef): Described {
  const catalog = MODELS.find((m) => sameModel(m, ref));
  if (catalog) return { maker: catalog.maker, name: catalog.name, catalog };
  const custom = recipe.models.find((m) => sameModel(m, ref));
  return custom ? { maker: custom.maker, name: custom.name } : { maker: "other", name: ref.model };
}

/** A recipe can be played, viewed, downloaded and saved once every step has a model. */
export const isComplete = (recipe: Recipe) => PHASES.every((phase) => recipe.phases[phase].length > 0);

/** The steps that still need a model, by their titles. */
export const missingSteps = (recipe: Recipe) =>
  PHASES.filter((phase) => recipe.phases[phase].length === 0).map((phase) => phase[0]!.toUpperCase() + phase.slice(1));

/** A reference to a catalog model at the given effort, or its default. */
export function refFor(model: CatalogModel, effort?: string): ModelRef {
  const ref: ModelRef = { instanceId: model.instanceId, model: model.model };
  if (model.effort) ref.options = { [model.effort.option]: effort ?? model.effort.default };
  return ref;
}

/** True when plan and build can land on different provider instances, where the conversation does not carry over. */
export const crossesProviders = (recipe: Recipe) =>
  recipe.phases.plan.some((plan) => recipe.phases.build.some((build) => build.instanceId !== plan.instanceId));

/** Reviewers that could end up reading their own work. */
export const selfReviewers = (recipe: Recipe) =>
  recipe.phases.review.filter((reviewer) => recipe.phases.build.some((build) => sameModel(build, reviewer)));

function pick(model: string, effort: string): ModelRef {
  const found = MODELS.find((m) => m.model === model);
  if (!found?.effort?.values.includes(effort)) throw new Error(`${model} has no effort ${effort}`);
  return refFor(found, effort);
}

function known(name: string): Skill {
  const found = KNOWN_SKILLS.find((s) => s.name === name);
  if (!found) throw new Error(`unknown skill ${name}`);
  return { name: found.name, repo: found.repo, when: found.when };
}

export const BLANK: Recipe = {
  version: 1,
  name: "Untitled",
  phases: { plan: [], build: [], review: [] },
  limits: { maxSubagents: 1, maxReviewRounds: 4 },
  skills: [],
  models: [],
};

const template = (
  name: string,
  phases: Recipe["phases"],
  limits: Recipe["limits"],
  skills: string[],
  advisor?: ModelRef,
): Recipe => ({
  version: 1,
  name,
  phases,
  ...(advisor ? { advisor: { ...advisor, maxCalls: ADVISOR_CALLS } } : {}),
  limits,
  skills: skills.map(known),
  models: [],
});

/** Ready-made lines, from the plainest to the most thorough. */
export const STARTERS: readonly Recipe[] = [
  template(
    "Simple",
    { plan: [pick("claude-opus-5-5", "high")], build: [pick("claude-opus-5-5", "high")], review: [pick("gpt-6.1-sol", "xhigh")] },
    { maxSubagents: 1, maxReviewRounds: 3 },
    ["ponytail"],
  ),
  template(
    "Lean",
    { plan: [pick("claude-opus-5-5", "high")], build: [pick("claude-sonnet-5-5", "high")], review: [pick("gpt-6.1-sol", "high")] },
    { maxSubagents: 1, maxReviewRounds: 3 },
    ["ponytail"],
  ),
  template(
    "Professional",
    {
      plan: [pick("claude-opus-5-5", "xhigh")],
      build: [pick("claude-opus-5-5", "high")],
      review: [pick("gpt-6.1-sol", "max"), pick("grok-4.7", "xhigh")],
    },
    { maxSubagents: 2, maxReviewRounds: 6 },
    ["ponytail", "unslop"],
    pick("claude-fable-5-2", "high"),
  ),
  template(
    "Spender",
    {
      plan: [pick("claude-fable-5-2", "max")],
      build: [pick("claude-fable-5-2", "xhigh")],
      review: [pick("gpt-6-astra", "max"), pick("grok-4.7", "xhigh"), pick("claude-opus-5-5", "xhigh")],
    },
    { maxSubagents: 4, maxReviewRounds: 12 },
    ["ponytail", "unslop"],
    pick("gpt-6.1-sol", "max"),
  ),
  // The one line that plans and builds on different providers.
  template(
    "Crossover",
    { plan: [pick("claude-opus-5-5", "high")], build: [pick("gpt-6.1-sol", "high")], review: [pick("claude-sonnet-5-5", "max")] },
    { maxSubagents: 1, maxReviewRounds: 3 },
    ["ponytail"],
  ),
];

/** One model on the shelf: a catalog entry or one the recipe added. */
export interface ShelfModel {
  key: string;
  maker: Maker;
  name: string;
  /** The reference a station gets when this model is placed on it. */
  ref: ModelRef;
  catalog?: CatalogModel;
}

/** One text for a model. Neither id can hold a space, so no two different models share a key. */
export const modelKey = (ref: ModelRef) => `${ref.instanceId} ${ref.model}`;

export function shelf(recipe: Pick<Recipe, "models">): ShelfModel[] {
  const custom = recipe.models
    .filter((model) => !MODELS.some((known) => sameModel(known, model)))
    .map(({ maker, name, ...ref }) => ({ key: modelKey(ref), maker, name, ref }));
  return [
    ...MODELS.map((model) => ({ key: modelKey(model), maker: model.maker, name: model.name, ref: refFor(model), catalog: model })),
    ...custom,
  ];
}
