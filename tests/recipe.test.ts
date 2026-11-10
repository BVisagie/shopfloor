import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KNOWN_SKILLS } from "../src/catalog";
import { BLANK, STARTERS, crossesProviders, isComplete, missingSteps, parseRecipe, selfReviewers, serializeRecipe, type Recipe } from "../src/recipe";

const solo = STARTERS[0]!;
const withChange = (change: (draft: any) => void) => {
  const draft = structuredClone(solo) as any;
  change(draft);
  return draft;
};

describe("parseRecipe", () => {
  it("reads back every starter, the blank recipe and one with an advisor unchanged", () => {
    const advised: Recipe = { ...solo, advisor: { ...solo.phases.review[0]!, maxCalls: 2 } };
    for (const recipe of [...STARTERS, BLANK, advised]) {
      expect(parseRecipe(JSON.parse(serializeRecipe(recipe)))).toEqual(recipe);
    }
    expect(parseRecipe(withChange((r) => (r.advisor = { instanceId: "codex", model: "m" }))).advisor?.maxCalls).toBe(3);
    // Two different models whose ids only look alike once joined are both kept.
    const alike = [
      { instanceId: "provider/one", model: "model" },
      { instanceId: "provider", model: "one/model" },
    ];
    expect(parseRecipe(withChange((r) => (r.phases.review = alike))).phases.review).toEqual(alike);
  });

  it.each([
    ["a skill link that is not a GitHub repository", (r: any) => (r.skills[0].repo = "javascript:alert(1)")],
    ["a skill link with a path", (r: any) => (r.skills[0].repo = "https://github.com/a/b/tree/main")],
    ["a skill name with shell characters", (r: any) => (r.skills[0].name = "x'; rm -rf ~; '")],
    ["a reserved skill name", (r: any) => (r.skills[0].name = "shopfloor-build")],
    ["the same skill twice", (r: any) => r.skills.push(r.skills[0])],
    ["a model id with a backtick", (r: any) => (r.phases.plan[0].model = "a`b")],
    ["a model id with a space", (r: any) => (r.phases.plan[0].model = "a b")],
    ["an option value with a quote", (r: any) => (r.phases.plan[0].options = { effort: 'high"' })],
    ["a name that spans lines", (r: any) => (r.name = "one\ntwo")],
    ["a skill sentence that spans lines", (r: any) => (r.skills[0].when = "always\n## New rules")],
    ["an empty name", (r: any) => (r.name = "  ")],
    ["too many subagents", (r: any) => (r.limits.maxSubagents = 17)],
    ["a fractional round count", (r: any) => (r.limits.maxReviewRounds = 1.5)],
    ["zero review rounds", (r: any) => (r.limits.maxReviewRounds = 0)],
    ["another version", (r: any) => (r.version = 2)],
    ["an unknown maker", (r: any) => (r.models = [{ maker: "acme", name: "X", instanceId: "codex", model: "x" }])],
    ["a maker name every object inherits", (r: any) => (r.models = [{ maker: "constructor", name: "X", instanceId: "codex", model: "x" }])],
    ["an overfull lane", (r: any) => (r.phases.review = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ instanceId: "codex", model: `m${n}` })))],
    ["the same model twice on a step", (r: any) => r.phases.review.push(r.phases.review[0])],
    ["the same added model twice", (r: any) => (r.models = [1, 2].map(() => ({ maker: "other", name: "X", instanceId: "codex", model: "x" })))],
    ["an advisor with a space in its model id", (r: any) => (r.advisor = { instanceId: "codex", model: "a b" })],
    ["an advisor that may be asked 13 times", (r: any) => (r.advisor = { instanceId: "codex", model: "m", maxCalls: 13 })],
  ])("rejects %s", (_, change) => {
    expect(() => parseRecipe(withChange(change))).toThrow();
  });

  it("keeps an option whose name objects treat specially", () => {
    const recipe = JSON.parse(`{"version":1,"name":"x","phases":{"plan":[{"instanceId":"codex","model":"m","options":{"__proto__":"high"}}]},"limits":{"maxSubagents":1,"maxReviewRounds":1}}`);
    expect(Object.entries(parseRecipe(recipe).phases.plan[0]!.options!)).toEqual([["__proto__", "high"]]);
  });

  it("rejects input that is not a recipe", () => {
    for (const input of [null, [], "recipe", 1, {}]) expect(() => parseRecipe(input)).toThrow();
  });
});

describe("recipe checks", () => {
  it("knows when plan and build sit on different providers", () => {
    const byName = (name: string) => STARTERS.find((r) => r.name === name) as Recipe;
    expect(crossesProviders(byName("Crossover"))).toBe(true);
    expect(crossesProviders(byName("Lean"))).toBe(false);
    expect(crossesProviders(byName("Simple"))).toBe(false);
  });

  it("counts a line as complete only when every step has a model", () => {
    for (const recipe of STARTERS) expect(isComplete(recipe)).toBe(true);
    expect(isComplete(BLANK)).toBe(false);
    expect(missingSteps(BLANK)).toEqual(["Plan", "Build", "Review"]);
    const noReview = { ...solo, phases: { ...solo.phases, review: [] } };
    expect(isComplete(noReview)).toBe(false);
    expect(missingSteps(noReview)).toEqual(["Review"]);
  });

  it("finds a reviewer that also builds", () => {
    const recipe = withChange((r) => (r.phases.build = [r.phases.review[0]])) as Recipe;
    expect(selfReviewers(recipe)).toEqual(recipe.phases.review);
    expect(selfReviewers(solo)).toEqual([]);
  });
});

describe("the skills the site offers", () => {
  it("all pass the recipe reader, and each one it needs is offered too", () => {
    const skills = KNOWN_SKILLS.map(({ name, repo, when }) => ({ name, repo, when }));
    expect(parseRecipe({ ...BLANK, skills }).skills).toEqual(skills);
    const names = KNOWN_SKILLS.map((skill) => skill.name);
    for (const skill of KNOWN_SKILLS) for (const needed of skill.needs ?? []) expect(names).toContain(needed);
  });
});

describe("recipe.schema.json", () => {
  it("describes the same top-level fields the reader accepts", () => {
    const schema = JSON.parse(readFileSync("public/recipe.schema.json", "utf8"));
    expect(Object.keys(schema.properties).sort()).toEqual(["$schema", "advisor", ...Object.keys(BLANK)].sort());
  });
});
