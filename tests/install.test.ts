import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { MODELS } from "../src/catalog";
import { RULES_START, generateFiles, installCommand, installPayload, installPlaces } from "../src/generate";
import { pack } from "../src/pack";
import { BLANK, STARTERS, refFor, type Recipe } from "../src/recipe";

const starter = (name: string) => STARTERS.find((r) => r.name === name) as Recipe;
const read = (...path: string[]) => readFileSync(join(...path), "utf8");
const blocks = (text: string) => text.split("\n").filter((line) => line === RULES_START).length;
/** A complete line with one model on each step. */
const lineUp = (plan: string, review = "gpt-6.1-sol"): Recipe => {
  const pick = (id: string) => refFor(MODELS.find((m) => m.model === id)!);
  return { ...BLANK, phases: { plan: [pick(plan)], build: [pick(plan)], review: [pick(review)] } };
};

/** Writes a recipe's files to a scratch folder and returns a runner for its install script. */
function bundle(recipe: Recipe, extraEnv: Record<string, string> = {}) {
  // macOS keeps its temporary folder behind a link, and the script reports real paths.
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "shopfloor-")));
  const home = join(scratch, "home");
  const repo = join(scratch, "repo");
  mkdirSync(home);
  mkdirSync(repo);
  for (const file of generateFiles(recipe)) {
    const path = join(scratch, "bundle", file.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.content, { mode: file.executable ? 0o755 : 0o644 });
  }
  const env = { PATH: process.env.PATH, HOME: home, XDG_STATE_HOME: join(scratch, "state"), ...extraEnv };
  const install = (...args: string[]) =>
    execFileSync("bash", [join(scratch, "bundle", "install.sh"), ...args], { env, encoding: "utf8" });
  return { home, repo, install, env };
}

/** Stands in for GitHub: local repositories that git is told to use for every github.com address. */
function fakeGitHub(repositories: Record<string, Record<string, string>>) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "shopfloor-github-")));
  for (const [name, files] of Object.entries(repositories)) {
    const folder = join(root, name);
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(folder, path)), { recursive: true });
      writeFileSync(join(folder, path), content);
    }
    const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { cwd: folder });
    git("init", "--quiet");
    git("add", "--all");
    git("commit", "--quiet", "--message", "skills");
  }
  return { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `url.file://${root}/.insteadOf`, GIT_CONFIG_VALUE_0: "https://github.com/" };
}

describe("install.sh project", () => {
  it("adds the rules to AGENTS.md, keeps what was there, and sets Claude up to read them", () => {
    const { repo, install } = bundle(starter("Simple"));
    writeFileSync(join(repo, "AGENTS.md"), "# Mine\n\nKeep this.\n");
    const output = install("project", repo);

    const agents = read(repo, "AGENTS.md");
    expect(agents.startsWith("# Mine\n\nKeep this.\n\n<!-- shopfloor:start -->\n## Workflow: Simple\n")).toBe(true);
    expect(read(repo, "CLAUDE.md")).toBe("@AGENTS.md\n");
    expect(read(repo, ".agents/skills/shopfloor-build/SKILL.md")).toContain("name: shopfloor-build");
    expect(read(repo, ".agents/skills/shopfloor-review/SKILL.md")).toContain("name: shopfloor-review");
    expect(lstatSync(join(repo, ".claude/skills")).isSymbolicLink()).toBe(true);
    expect(read(repo, ".claude/skills/shopfloor-build/SKILL.md")).toContain("name: shopfloor-build");
    expect(output).toContain("The ponytail skill is not installed. Get it from https://github.com/DietrichGebert/ponytail");
  });

  it("does not report a skill that is installed for the whole machine", () => {
    const { home, repo, install } = bundle(starter("Simple"));
    mkdirSync(join(home, ".claude/skills/ponytail"), { recursive: true });
    expect(install("project", repo)).not.toContain("ponytail");
  });

  it("changes nothing when run a second time", () => {
    const { repo, install } = bundle(starter("Simple"));
    writeFileSync(join(repo, "AGENTS.md"), "# Mine\n");
    install("project", repo);
    const first = read(repo, "AGENTS.md");
    install("project", repo);
    expect(read(repo, "AGENTS.md")).toBe(first);
    expect(blocks(first)).toBe(1);
  });

  it("removes what it added and nothing else", () => {
    const { repo, install } = bundle(starter("Simple"));
    writeFileSync(join(repo, "AGENTS.md"), "# Mine\n\nKeep this.\n");
    install("project", repo);
    install("project", repo, "--uninstall");
    expect(read(repo, "AGENTS.md")).toBe("# Mine\n\nKeep this.\n");
    expect(existsSync(join(repo, ".agents/skills/shopfloor-build"))).toBe(false);

    const fresh = bundle(starter("Simple"));
    fresh.install("project", fresh.repo);
    fresh.install("project", fresh.repo, "--uninstall");
    expect(existsSync(join(fresh.repo, "AGENTS.md"))).toBe(false);
  });

  it("removes a skill an earlier recipe installed when the new recipe leaves it out", () => {
    const { repo, install } = bundle(lineUp("gemini-3.8-flash"));
    install("project", repo);
    expect(existsSync(join(repo, ".agents/skills/shopfloor-rules/SKILL.md"))).toBe(true);
    bundle(starter("Simple")).install("project", repo);
    expect(existsSync(join(repo, ".agents/skills/shopfloor-rules"))).toBe(false);
    expect(existsSync(join(repo, ".agents/skills/shopfloor-build/SKILL.md"))).toBe(true);
  });

  it("keeps a file the user added to one of its skill folders", () => {
    const { repo, install } = bundle(starter("Simple"));
    install("project", repo);
    writeFileSync(join(repo, ".agents/skills/shopfloor-build/notes.md"), "mine\n");
    install("project", repo);
    expect(install("project", repo, "--uninstall")).toContain("holds other files");
    expect(read(repo, ".agents/skills/shopfloor-build/notes.md")).toBe("mine\n");
    expect(existsSync(join(repo, ".agents/skills/shopfloor-build/SKILL.md"))).toBe(false);
    expect(existsSync(join(repo, ".agents/skills/shopfloor-review"))).toBe(false);
  });

  it("leaves a skill folder alone when it is a link to a skill kept elsewhere", () => {
    const { home, repo, install } = bundle(starter("Simple"));
    install("machine");
    const shared = join(home, ".claude/skills/shopfloor-build/SKILL.md");
    writeFileSync(shared, "shared copy\n");
    mkdirSync(join(repo, ".agents/skills"), { recursive: true });
    symlinkSync(join(home, ".claude/skills/shopfloor-build"), join(repo, ".agents/skills/shopfloor-build"));
    expect(install("project", repo)).toContain("is a symlink");
    install("project", repo, "--uninstall");
    expect(read(shared)).toBe("shared copy\n");
    expect(existsSync(join(home, ".claude/skills/shopfloor-build/.shopfloor"))).toBe(true);
    expect(lstatSync(join(repo, ".agents/skills/shopfloor-build")).isSymbolicLink()).toBe(true);
  });

  it("refuses a rules file whose block has lost its end line", () => {
    const { repo, install } = bundle(starter("Simple"));
    const noEnd = "# Mine\n\n<!-- shopfloor:start -->\nold rules\n\n# Also mine\n";
    const wrongOrder = "# Mine\n<!-- shopfloor:end -->\n# Also mine\n<!-- shopfloor:start -->\n# Mine too\n";
    for (const damaged of [noEnd, wrongOrder]) {
      writeFileSync(join(repo, "AGENTS.md"), damaged);
      expect(install("project", repo)).toContain("Fix it by hand first");
      expect(install("project", repo, "--uninstall")).toContain("Fix it by hand first");
      expect(read(repo, "AGENTS.md")).toBe(damaged);
    }
  });

  it("keeps a copy of a skill file the user edited before replacing or removing it", () => {
    const { repo, install } = bundle(starter("Simple"));
    install("project", repo);
    expect(install("project", repo)).not.toContain("backup");
    const skill = join(repo, ".agents/skills/shopfloor-build/SKILL.md");
    writeFileSync(skill, "my edit\n");
    const output = install("project", repo);
    const backup = output.match(/^backup\s+(.+)$/m)?.[1];
    expect(read(backup!, skill)).toBe("my edit\n");
    expect(read(skill)).toContain("name: shopfloor-build");
  });

  it("writes nothing on a dry run", () => {
    const { repo, install } = bundle(starter("Simple"));
    expect(install("project", repo, "--dry-run")).toContain("Nothing was changed");
    expect(existsSync(join(repo, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(repo, ".agents"))).toBe(false);
    expect(existsSync(join(repo, "CLAUDE.md"))).toBe(false);
  });

  it("leaves a symlinked rules file alone", () => {
    const { repo, install } = bundle(starter("Simple"));
    writeFileSync(join(repo, "elsewhere.md"), "# Shared\n");
    symlinkSync("elsewhere.md", join(repo, "AGENTS.md"));
    const output = install("project", repo);
    expect(output).toContain("is a symlink, so the rules were not added");
    expect(output).toContain("Some rules files were left as they were");
    expect(output).not.toContain("Start a new thread");
    expect(read(repo, "elsewhere.md")).toBe("# Shared\n");
  });

  it("says so when an uninstall cannot take the rules out of a linked file", () => {
    const { repo, install } = bundle(starter("Simple"));
    const pasted = `# Shared\n\n${generateFiles(starter("Simple")).find((file) => file.path === "rules.md")!.content}`;
    writeFileSync(join(repo, "elsewhere.md"), pasted);
    symlinkSync("elsewhere.md", join(repo, "AGENTS.md"));
    const output = install("project", repo, "--uninstall");
    expect(output).toContain("is a symlink, so the rules were not removed");
    expect(output).toContain("Some rules files were left as they were");
    expect(output).not.toContain("Start a new thread");
    expect(read(repo, "elsewhere.md")).toBe(pasted);
  });

  it("accepts a CLAUDE.md that is a link to AGENTS.md", () => {
    const { repo, install } = bundle(starter("Simple"));
    symlinkSync("AGENTS.md", join(repo, "CLAUDE.md"));
    expect(install("project", repo)).not.toContain("does not load AGENTS.md");
    expect(lstatSync(join(repo, "CLAUDE.md")).isSymbolicLink()).toBe(true);
  });

  it("does not replace a skill folder it did not create", () => {
    const { repo, install } = bundle(starter("Simple"));
    mkdirSync(join(repo, ".agents/skills/shopfloor-build"), { recursive: true });
    writeFileSync(join(repo, ".agents/skills/shopfloor-build/SKILL.md"), "mine\n");
    expect(install("project", repo)).toContain("did not put it there");
    expect(read(repo, ".agents/skills/shopfloor-build/SKILL.md")).toBe("mine\n");
  });

  it("leaves Claude's files alone when Claude neither plans nor builds", () => {
    const codexOnly = lineUp("gpt-6.1-sol", "gemini-3.8-flash");
    const { repo, install } = bundle(codexOnly);
    install("project", repo);
    expect(existsSync(join(repo, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(repo, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(repo, ".claude"))).toBe(false);
  });
});

describe("install.sh machine", () => {
  it("writes each provider's own rules file and skills folder", () => {
    const { home, install } = bundle(starter("Crossover"));
    install("machine");
    expect(blocks(read(home, ".claude/CLAUDE.md"))).toBe(1);
    expect(blocks(read(home, ".codex/AGENTS.md"))).toBe(1);
    expect(existsSync(join(home, ".claude/skills/shopfloor-build/SKILL.md"))).toBe(true);
    expect(existsSync(join(home, ".agents/skills/shopfloor-review/SKILL.md"))).toBe(true);
    expect(existsSync(join(home, ".gemini"))).toBe(false);
  });

  it("uses Antigravity's locations for a Gemini model", () => {
    const gemini = lineUp("gemini-3.8-flash");
    const { home, install } = bundle(gemini);
    install("machine");
    expect(blocks(read(home, ".gemini/AGENTS.md"))).toBe(1);
    expect(existsSync(join(home, ".gemini/config/skills/shopfloor-build/SKILL.md"))).toBe(true);
  });

  it("backs a rules file up before changing it, and restores it on uninstall", () => {
    const { home, install } = bundle(starter("Lean"));
    mkdirSync(join(home, ".claude"));
    writeFileSync(join(home, ".claude/CLAUDE.md"), "# Mine\n");
    expect(install("machine")).toContain("backup");
    install("machine", "--uninstall");
    expect(read(home, ".claude/CLAUDE.md")).toBe("# Mine\n");
  });

  it("says so when no provider in the recipe has a machine-wide location", () => {
    const grok = lineUp("grok-4.7");
    expect(bundle(grok).install("machine")).toContain("Install it for one project instead");

    // An earlier install stays as it was, since this one has nowhere to put its own.
    const earlier = bundle(starter("Simple"));
    earlier.install("machine");
    const output = bundle(grok, { HOME: earlier.home, XDG_STATE_HOME: join(earlier.home, "state") }).install("machine");
    expect(output).toContain("nothing was changed");
    expect(read(earlier.home, ".claude/CLAUDE.md")).toContain("## Workflow: Simple");
    expect(existsSync(join(earlier.home, ".claude/skills/shopfloor-build/SKILL.md"))).toBe(true);
  });

  it("clears a provider the next recipe leaves out, and uninstalls whichever recipe the script is from", () => {
    const first = bundle(starter("Crossover"));
    first.install("machine");
    const { home } = first;
    const sameHome = { HOME: home, XDG_STATE_HOME: join(home, "state") };

    bundle(starter("Simple"), sameHome).install("machine");
    expect(read(home, ".claude/CLAUDE.md")).toContain("## Workflow: Simple");
    expect(existsSync(join(home, ".codex/AGENTS.md"))).toBe(false);
    expect(existsSync(join(home, ".agents/skills/shopfloor-build"))).toBe(false);

    bundle(lineUp("gemini-3.8-flash"), sameHome).install("machine", "--uninstall");
    expect(existsSync(join(home, ".claude/CLAUDE.md"))).toBe(false);
    expect(existsSync(join(home, ".claude/skills/shopfloor-build"))).toBe(false);
  });

  it("does not clear a place it installed into when another provider reaches it through a link", () => {
    // Claude's skills folder is a link to the one Codex reads, and Codex's rules file is a link to Claude's.
    const claude = bundle(starter("Simple"));
    mkdirSync(join(claude.home, ".agents/skills"), { recursive: true });
    mkdirSync(join(claude.home, ".claude"));
    symlinkSync(join(claude.home, ".agents/skills"), join(claude.home, ".claude/skills"));
    claude.install("machine");
    expect(existsSync(join(claude.home, ".claude/skills/shopfloor-build/SKILL.md"))).toBe(true);

    const codex = bundle(lineUp("gpt-6.1-sol"));
    mkdirSync(join(codex.home, ".claude"));
    mkdirSync(join(codex.home, ".codex"));
    const pasted = `# Mine\n\n${generateFiles(lineUp("gpt-6.1-sol")).find((file) => file.path === "rules.md")!.content}`;
    writeFileSync(join(codex.home, ".claude/CLAUDE.md"), pasted);
    symlinkSync(join(codex.home, ".claude/CLAUDE.md"), join(codex.home, ".codex/AGENTS.md"));
    expect(codex.install("machine")).toContain("is a symlink, so the rules were not added");
    expect(read(codex.home, ".claude/CLAUDE.md")).toBe(pasted);
  });
});

describe("install.sh", () => {
  it("prints how to use it when no mode is given", () => {
    const { install } = bundle(starter("Simple"));
    let shown = "";
    try {
      install();
    } catch (error) {
      shown = (error as { stdout: string }).stdout;
    }
    expect(shown).toContain("./install.sh project [folder]");
  });
});

describe("install.sh --with-skills", () => {
  const recipe: Recipe = {
    ...starter("Crossover"),
    skills: [
      { name: "ponytail", repo: "https://github.com/DietrichGebert/ponytail", when: "on every coding task" },
      { name: "unslop", repo: "https://github.com/heydamir/unslop", when: "when asked" },
      { name: "file-pr", repo: "https://github.com/t3dotgg/tstack", when: "when asked" },
      { name: "gone", repo: "https://github.com/nobody/nothing", when: "when asked" },
    ],
  };
  const github = () =>
    fakeGitHub({
      "DietrichGebert/ponytail": { "skills/ponytail/SKILL.md": "theirs\n", "assets/large.png": "not wanted\n" },
      "heydamir/unslop": { "skills/unslop/SKILL.md": "unslop\n", "skills/unslop/references/tokens.md": "tokens\n" },
      "t3dotgg/tstack": { "skills/other/SKILL.md": "another skill\n" },
    });

  it("adds each missing skill with all its files, keeps one that is there, and says which it could not get", () => {
    const { home, install } = bundle(recipe, github());
    mkdirSync(join(home, ".claude/skills/ponytail"), { recursive: true });
    writeFileSync(join(home, ".claude/skills/ponytail/SKILL.md"), "mine\n");
    const output = install("machine", "--with-skills");

    expect(read(home, ".claude/skills/ponytail/SKILL.md")).toBe("mine\n");
    expect(read(home, ".agents/skills/ponytail/SKILL.md")).toBe("theirs\n");
    expect(existsSync(join(home, ".agents/skills/ponytail/assets"))).toBe(false);
    for (const skills of [".claude/skills", ".agents/skills"]) {
      expect(read(home, skills, "unslop/SKILL.md")).toBe("unslop\n");
      expect(read(home, skills, "unslop/references/tokens.md")).toBe("tokens\n");
      expect(existsSync(join(home, skills, "file-pr"))).toBe(false);
      expect(existsSync(join(home, skills, "gone"))).toBe(false);
    }
    expect(output).toContain("The file-pr skill is not at skills/file-pr in its repository. Get it from https://github.com/t3dotgg/tstack");
    expect(output).toContain("The gone skill could not be downloaded. Get it from https://github.com/nobody/nothing");
    expect(install("machine", "--with-skills")).not.toContain("fetch");

    install("machine", "--uninstall");
    expect(read(home, ".agents/skills/unslop/SKILL.md")).toBe("unslop\n");
    expect(existsSync(join(home, ".agents/skills/shopfloor-build"))).toBe(false);
  });

  it("downloads nothing on a dry run or without being asked", () => {
    const { home, repo, install } = bundle(recipe, github());
    expect(install("project", repo, "--with-skills", "--dry-run")).toContain(`fetch    ${repo}/.agents/skills/unslop from https://github.com/heydamir/unslop`);
    expect(install("project", repo)).toContain("The unslop skill is not installed. Get it from https://github.com/heydamir/unslop");
    expect(existsSync(join(repo, ".agents/skills/unslop"))).toBe(false);
    expect(existsSync(join(home, ".agents"))).toBe(false);
  });
});

describe("the one-line install command", () => {
  const run = async (recipe: Recipe, mode: "machine" | "project") => {
    const { home, repo, env } = bundle(recipe);
    const command = installCommand(await pack(installPayload(recipe)), mode);
    const output = execFileSync("bash", ["-c", command], { cwd: repo, env, encoding: "utf8" });
    return { home, repo, env, command, output };
  };

  it("is a single line that installs into the folder it is run in", async () => {
    const { repo, command, output } = await run(starter("Simple"), "project");
    expect(command).not.toContain("\n");
    expect(read(repo, "AGENTS.md")).toContain("## Workflow: Simple");
    expect(read(repo, "CLAUDE.md")).toBe("@AGENTS.md\n");
    expect(read(repo, ".agents/skills/shopfloor-build/SKILL.md")).toContain("name: shopfloor-build");
    expect(read(repo, ".agents/skills/shopfloor-review/SKILL.md")).toContain("name: shopfloor-review");
    expect(output).toContain("Start a new thread");
  });

  it("installs for the whole machine when asked, and removes it again with --uninstall added", async () => {
    const { home, repo, env, command } = await run(starter("Crossover"), "machine");
    expect(blocks(read(home, ".claude/CLAUDE.md"))).toBe(1);
    expect(blocks(read(home, ".codex/AGENTS.md"))).toBe(1);
    expect(existsSync(join(home, ".agents/skills/shopfloor-build/SKILL.md"))).toBe(true);
    expect(existsSync(join(repo, "AGENTS.md"))).toBe(false);
    execFileSync("bash", ["-c", `${command} --uninstall`], { cwd: repo, env });
    expect(existsSync(join(home, ".claude/CLAUDE.md"))).toBe(false);
    expect(existsSync(join(home, ".agents/skills/shopfloor-build"))).toBe(false);
  });

  it("refuses to pack a file that would end its own block early", () => {
    const hostile = { ...starter("Simple"), name: "x\nSHOPFLOOR_FILE_END\nrm -rf ~" };
    expect(() => installPayload(hostile)).toThrow();
  });

  it("says which files and folders each kind of install touches", () => {
    expect(installPlaces(starter("Crossover"), "machine")).toEqual(["~/.claude/CLAUDE.md", "~/.claude/skills/", "~/.codex/AGENTS.md", "~/.agents/skills/"]);
    expect(installPlaces(starter("Simple"), "project")).toEqual(["AGENTS.md", ".agents/skills/", "CLAUDE.md, if there is none", ".claude/skills, as a link"]);
    expect(installPlaces(lineUp("gpt-6.1-sol"), "project")).toEqual(["AGENTS.md", ".agents/skills/"]);
  });
});
