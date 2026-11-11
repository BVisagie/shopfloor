export type Maker = "anthropic" | "openai" | "google" | "meta" | "xai" | "other";

export const MAKERS: Record<Maker, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  meta: "Meta",
  xai: "xAI",
  other: "Other",
};

/** The install script knows where these four keep their rules and skills. */
export type InstallTarget = "claude" | "codex" | "antigravity" | "muse";

export interface Provider {
  label: string;
  install?: InstallTarget;
  /** Shown beside models that plan or build through this provider. */
  caveat?: string;
}

/** T3 Code provider instances, by their default instance id. */
export const PROVIDERS: Record<string, Provider> = {
  claudeAgent: { label: "Claude", install: "claude" },
  codex: { label: "Codex", install: "codex" },
  antigravity: {
    label: "Antigravity",
    install: "antigravity",
    caveat:
      "Antigravity did not load the rules file in testing. Its rules are added as a skill instead, which it may not always read.",
  },
  muse: {
    label: "Muse Code",
    install: "muse",
    caveat:
      "Muse Code is untested. Its rules only work when installed into a project, in a folder Muse Code trusts.",
  },
  cursor: { label: "Cursor" },
  grok: { label: "Grok" },
  opencode: { label: "OpenCode" },
  kiro: { label: "Kiro" },
  pi: { label: "Pi" },
  fx: { label: "fx" },
};

export const providerLabel = (instanceId: string) => PROVIDERS[instanceId]?.label ?? instanceId;

export interface Effort {
  /** The option name T3 Code uses for this provider. */
  option: string;
  values: readonly string[];
  default: string;
}

export interface CatalogModel {
  maker: Maker;
  name: string;
  instanceId: string;
  model: string;
  effort?: Effort;
  /** unconfirmed: the id is not verified in T3 Code. unreleased: it cannot be used yet. */
  status?: "unconfirmed" | "unreleased";
}

/** What a model's tooltip says: its id, how it runs, and whether the id needs checking. */
export function modelNote(instanceId: string, model: string, status?: CatalogModel["status"]): string {
  if (status === "unreleased") return "Announced, but not available yet.";
  const note = `Model id ${model}. Runs through ${providerLabel(instanceId)} in T3 Code.`;
  return status === "unconfirmed" ? `${note} The id is a best guess, so check it in T3 Code's model picker.` : note;
}

const claude: Effort = { option: "effort", values: ["low", "medium", "high", "xhigh", "max"], default: "high" };
const codex: Effort = {
  option: "reasoningEffort",
  values: ["low", "medium", "high", "xhigh", "max"],
  default: "high",
};
const antigravity: Effort = { option: "thinking_level", values: ["low", "medium", "high"], default: "high" };
const muse: Effort = {
  option: "reasoningEffort",
  values: ["low", "medium", "high", "xhigh", "max"],
  default: "high",
};
const cursor: Effort = {
  option: "reasoning_effort",
  values: ["low", "medium", "high", "xhigh"],
  default: "high",
};

export const CATALOG_DATE = "November 2026";

/** Most capable first within each maker. */
export const MODELS: readonly CatalogModel[] = [
  { maker: "anthropic", name: "Fable 5.2", instanceId: "claudeAgent", model: "claude-fable-5-2", effort: claude },
  { maker: "anthropic", name: "Opus 5.5", instanceId: "claudeAgent", model: "claude-opus-5-5", effort: claude },
  { maker: "anthropic", name: "Sonnet 5.5", instanceId: "claudeAgent", model: "claude-sonnet-5-5", effort: claude },
  { maker: "anthropic", name: "Haiku 5.5", instanceId: "claudeAgent", model: "claude-haiku-5-5", effort: claude },
  { maker: "openai", name: "GPT-6.1 Sol", instanceId: "codex", model: "gpt-6.1-sol", effort: codex },
  { maker: "openai", name: "GPT-6 Astra", instanceId: "codex", model: "gpt-6-astra", effort: codex },
  { maker: "openai", name: "GPT-6 Luna", instanceId: "codex", model: "gpt-6-luna", effort: codex },
  { maker: "google", name: "Gemini 4 Carbon", instanceId: "antigravity", model: "gemini-4-carbon" },
  { maker: "google", name: "Gemini 4 Argon", instanceId: "antigravity", model: "gemini-4-argon", effort: antigravity },
  { maker: "google", name: "Gemini 3.8 Flash", instanceId: "antigravity", model: "gemini-3.8-flash", effort: antigravity },
  { maker: "meta", name: "Muse Wonder Full", instanceId: "muse", model: "muse-wonder-full-1.0", effort: muse },
  { maker: "meta", name: "Muse Wonder", instanceId: "muse", model: "muse-wonder-1.0", effort: muse },
  { maker: "meta", name: "Muse Spark 1.3", instanceId: "muse", model: "muse-spark-1.3", effort: muse },
  { maker: "meta", name: "Muse Ember", instanceId: "muse", model: "muse-ember-1.0", effort: muse },
  { maker: "xai", name: "Grok 4.7", instanceId: "cursor", model: "grok-4.7", effort: cursor },
];

/** When a skill applies, which is how the site groups them. */
export const SKILL_GROUPS = {
  coding: "While coding",
  pr: "Pull requests",
  request: "On request",
} as const;

export interface KnownSkill {
  name: string;
  repo: string;
  when: string;
  about: string;
  group: keyof typeof SKILL_GROUPS;
  /** Other skills this one calls, which are added along with it. */
  needs?: readonly string[];
  /** A file in public/skills, for skills that publish a logo. */
  icon?: string;
}

const TSTACK = "https://github.com/t3dotgg/tstack";

export const KNOWN_SKILLS: readonly KnownSkill[] = [
  {
    name: "ponytail",
    repo: "https://github.com/DietrichGebert/ponytail",
    when: "on every coding task",
    about: "The smallest change that fully solves the task.",
    group: "coding",
    icon: "skills/ponytail.png",
  },
  {
    name: "unslop",
    repo: "https://github.com/heydamir/unslop",
    when: "when a change touches UI",
    about: "Turns AI-looking UI into a designed interface.",
    group: "coding",
  },
  {
    name: "file-pr",
    repo: TSTACK,
    when: "when you open a pull request",
    about: "Writes a short pull request that leads with the problem.",
    group: "pr",
    needs: ["leaving-pr-comments"],
  },
  {
    name: "babysit-pr",
    repo: TSTACK,
    when: "when asked to watch a pull request through checks and review",
    about: "Watches a pull request through checks and review bots, and fixes the real findings.",
    group: "pr",
    needs: ["leaving-pr-comments"],
  },
  {
    name: "leaving-pr-comments",
    repo: TSTACK,
    when: "whenever you comment on GitHub",
    about: "Formats the comments an agent posts for you.",
    group: "pr",
  },
  {
    name: "modernize",
    repo: TSTACK,
    when: "when asked to bring an old pull request up to date",
    about: "Rebases an old pull request and asks whether it should still exist.",
    group: "request",
    needs: ["leaving-pr-comments"],
  },
  {
    name: "takeover",
    repo: TSTACK,
    when: "when asked to take over a pull request, branch or thread",
    about: "Finishes someone else's pull request, branch or thread, and keeps their credit.",
    group: "request",
    needs: ["modernize", "file-pr", "babysit-pr", "leaving-pr-comments"],
  },
];
