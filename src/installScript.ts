import type { InstallTarget } from "./catalog";
import script from "./install.sh?raw";
import type { Skill } from "./recipe";

// These two values reach a shell, so they are checked here as well as when a recipe is read.
const SAFE_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SAFE_REPO = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/;
const TARGETS: readonly InstallTarget[] = ["claude", "codex", "antigravity", "muse"];

/** The install script for one recipe: the fixed script with its provider and skill lists filled in. */
export function installScript(targets: readonly InstallTarget[], skills: readonly Skill[]): string {
  for (const target of targets) {
    if (!TARGETS.includes(target)) throw new Error(`Unknown install target: ${target}`);
  }
  for (const skill of skills) {
    if (!SAFE_NAME.test(skill.name) || !SAFE_REPO.test(skill.repo)) {
      throw new Error(`Skill ${skill.name} cannot be written to the install script`);
    }
  }
  const named = skills.map((skill) => `'${skill.name} ${skill.repo}'`).join(" ");
  return script
    .replace("PROVIDERS=()", () => `PROVIDERS=(${targets.join(" ")})`)
    .replace("SKILLS=()", () => `SKILLS=(${named})`);
}
