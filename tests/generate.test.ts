import { describe, expect, it } from "vitest";
import { MODELS } from "../src/catalog";
import { RULES_END, RULES_START, generateFiles, installTargets, needsRulesSkill, rules } from "../src/generate";
import { installScript } from "../src/installScript";
import { BLANK, STARTERS, refFor, type Recipe } from "../src/recipe";

const starter = (name: string) => STARTERS.find((r) => r.name === name) as Recipe;
const file = (recipe: Recipe, path: string) => generateFiles(recipe).find((f) => f.path === path)?.content;
const bytes = (text: string) => new TextEncoder().encode(text).length;
const model = (id: string) => MODELS.find((m) => m.model === id)!;
/** A complete line with one model on each step. */
const lineUp = (plan: string, build = plan, review = "gpt-6.1-sol"): Recipe => ({
  ...BLANK,
  phases: { plan: [refFor(model(plan))], build: [refFor(model(build))], review: [refFor(model(review))] },
});

describe("generateFiles", () => {
  it("wraps the rules in the two marker lines the install script looks for", () => {
    for (const recipe of [...STARTERS, BLANK]) {
      const lines = rules(recipe).split("\n");
      expect(lines[0]).toBe(RULES_START);
      expect(lines.at(-2)).toBe(RULES_END);
      expect(lines.filter((line) => line === RULES_START || line === RULES_END)).toHaveLength(2);
    }
  });

  it("lists the files a recipe with reviewers produces", () => {
    expect(generateFiles(starter("Simple")).map((f) => f.path)).toEqual([
      "README.md",
      "rules.md",
      "skills/shopfloor-build/SKILL.md",
      "skills/shopfloor-review/SKILL.md",
      "install.sh",
      "recipe.json",
    ]);
  });

  it("also ships the rules as a skill when an agent that may not load a rules file plans or builds", () => {
    const gemini = lineUp("gemini-3.8-flash");
    const skill = file(gemini, "skills/shopfloor-rules/SKILL.md");
    expect(skill).toContain("name: shopfloor-rules");
    expect(skill).toContain("- Models that build, preferred first: Gemini 3.8 Flash");
    expect(skill).not.toContain(RULES_START);
    expect(needsRulesSkill(lineUp("claude-opus-5-5", "gemini-3.8-flash"))).toBe(true);
    expect(needsRulesSkill(starter("Crossover"))).toBe(false);
    expect(file(starter("Crossover"), "skills/shopfloor-rules/SKILL.md")).toBeUndefined();
  });

  it("keeps a recipe's own text out of the skill headers agents parse", () => {
    const tricky: Recipe = { ...lineUp("gemini-3.8-flash"), name: 'x: "y" # z --- ' };
    for (const path of ["skills/shopfloor-rules/SKILL.md", "skills/shopfloor-build/SKILL.md"]) {
      const header = file(tricky, path)!.split("---")[1];
      expect(header).not.toContain("x:");
    }
  });

  it("writes the advisor into the rules and skills only when the recipe has one", () => {
    const advisor = { ...refFor(model("claude-fable-5-2"), "xhigh"), maxCalls: 2 };
    const advised: Recipe = { ...starter("Simple"), advisor };
    expect(rules(advised)).toContain("The advisor is Fable 5.2 (`claudeAgent` · `claude-fable-5-2` · `effort: xhigh`).");
    expect(rules(advised)).toContain("- Ask at most 2 times in one task.");
    expect(rules({ ...advised, advisor: { ...advisor, maxCalls: 1 } })).toContain("- Ask at most once in one task.");
    expect(rules({ ...advised, limits: { ...advised.limits, maxSubagents: 0 } })).toContain("the reviewers the review skill starts and the advisor");

    const skill = file(advised, "skills/shopfloor-advise/SKILL.md")!;
    expect(skill).toContain('`{"providerInstanceId":"claudeAgent","model":"claude-fable-5-2","options":{"effort":"xhigh"}}`');
    expect(skill).toContain("Ask at most 2 times in one task");
    expect(file(advised, "skills/shopfloor-build/SKILL.md")).toContain("ask the advisor with the `shopfloor-advise` skill before a third try");
    expect(file(advised, "skills/shopfloor-review/SKILL.md")).toContain("ask the advisor with the `shopfloor-advise` skill before you ask the user");

    for (const made of generateFiles(starter("Simple"))) expect(made.content.toLowerCase()).not.toContain("advis");
  });

  it("says in every skill that it is for T3 Code only", () => {
    const all: Recipe = { ...lineUp("gemini-3.8-flash"), advisor: { ...refFor(model("claude-fable-5-2")), maxCalls: 3 } };
    const skills = generateFiles(all).filter((made) => made.path.startsWith("skills/"));
    expect(skills.map((made) => made.path.split("/")[1])).toEqual(["shopfloor-rules", "shopfloor-build", "shopfloor-review", "shopfloor-advise"]);
    for (const skill of skills) {
      expect(skill.content.split("---")[1]).toContain("in T3 Code");
      expect(skill.content).toContain("In any other session");
    }
  });

  it("refuses a line that has a step with no model", () => {
    const solo = starter("Simple");
    expect(() => generateFiles(BLANK)).toThrow();
    for (const phase of ["plan", "build", "review"] as const) {
      expect(() => generateFiles({ ...solo, phases: { ...solo.phases, [phase]: [] } })).toThrow();
    }
  });

  it("names the build model with its options, so another effort on the same model is noticed", () => {
    expect(file(starter("Lean"), "rules.md")).toContain("`Build model: Sonnet 5.5 with effort high. Switch to it if this thread runs a model or a setting that is not listed under Build");
    // Professional plans and builds on one model at two efforts.
    expect(rules(starter("Professional"))).toContain("Build model: Opus 5.5 with effort high.");
    expect(file(starter("Professional"), "skills/shopfloor-build/SKILL.md")).toContain("or a listed model with other options");
  });

  it("asks for a stand-alone plan only when plan and build use different providers", () => {
    expect(file(starter("Crossover"), "rules.md")).toContain("stands alone");
    expect(file(starter("Lean"), "rules.md")).not.toContain("stands alone");
  });

  it("gives each reviewer as a delegate_task target with the provider's own option name", () => {
    const skill = file(starter("Professional"), "skills/shopfloor-review/SKILL.md");
    expect(skill).toContain('{"providerInstanceId":"codex","model":"gpt-6.1-sol","options":{"reasoningEffort":"max"}}');
    expect(skill).toContain('{"providerInstanceId":"cursor","model":"grok-4.7","options":{"reasoning_effort":"xhigh"}}');
    expect(skill).toContain("at most 6 rounds in total");
  });

  it("words the subagent limit for none, one and several", () => {
    const withLimit = (maxSubagents: number) =>
      rules({ ...starter("Simple"), limits: { ...starter("Simple").limits, maxSubagents } });
    expect(withLimit(0)).toContain("Start no subagents, except the reviewers the review skill starts.");
    expect(withLimit(1)).toContain("at most one subagent at a time");
    expect(withLimit(3)).toContain("at most 3 subagents at the same time");
  });

  it("writes one rule per skill", () => {
    const text = rules(starter("Professional"));
    expect(text).toContain("- Use the `ponytail` skill on every coding task.");
    expect(text).toContain("- Use the `unslop` skill when a change touches UI.");
  });

  it("keeps the rules far below the size at which agents cut a rules file off", () => {
    for (const recipe of STARTERS) expect(bytes(rules(recipe))).toBeLessThan(4_000);
    const lane = Array(6).fill(refFor(model("gpt-6.1-sol")));
    const largest: Recipe = {
      ...BLANK,
      name: "n".repeat(60),
      phases: { plan: Array(6).fill(refFor(model("claude-fable-5-2"))), build: lane, review: lane },
      skills: Array.from({ length: 12 }, (_, i) => ({
        name: `skill-${i}`,
        repo: "https://github.com/owner/repo",
        when: "w".repeat(120),
      })),
    };
    // Antigravity cuts a rules file off at 24,000 bytes; other agents allow more.
    expect(bytes(rules(largest))).toBeLessThan(12_000);
  });
});

describe("installTargets", () => {
  it("covers only the providers that plan or build", () => {
    expect(installTargets(starter("Crossover"))).toEqual(["claude", "codex"]);
    expect(installTargets(starter("Lean"))).toEqual(["claude"]);
  });

  it("is empty when the only provider has no known rules location", () => {
    expect(installTargets(lineUp("grok-4.7"))).toEqual([]);
  });
});

describe("installScript", () => {
  it("fills in the providers and the skills to check for", () => {
    const script = installScript(["claude", "codex"], starter("Simple").skills);
    expect(script).toContain("PROVIDERS=(claude codex)");
    expect(script).toContain("SKILLS=('ponytail https://github.com/DietrichGebert/ponytail')");
  });

  it("refuses values that could break out of the script", () => {
    const bad = { name: "x'; rm -rf ~; '", repo: "https://github.com/a/b", when: "always" };
    expect(() => installScript(["claude"], [bad])).toThrow();
    expect(() => installScript(["claude"], [{ ...bad, name: "ok", repo: "https://github.com/a/b'; id; '" }])).toThrow();
    expect(() => installScript(["claude; id" as never], [])).toThrow();
  });
});
