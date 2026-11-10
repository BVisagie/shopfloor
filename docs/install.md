# Installing

## From the site

Click **Install** and choose where the workflow applies:

- **Every project.** For you, on the machine your agents run on. New threads in every project follow it. The files it writes are also read by agent sessions outside T3 Code, such as one started in a terminal, so the rules and each skill tell agents to ignore them there.
- **One project.** For everyone who works in the repository. The files are written into the project folder. Commit them: a thread that starts in a new worktree sees them only once they are on your default branch.

Then:

1. Open T3 Code's terminal with Cmd+J on a Mac, or Ctrl+J elsewhere. For one project, open that project first.
2. Paste the command and press Enter.
3. Start a new thread, because running threads keep what they loaded.

The command holds the rules, skills and install script that **View files** shows, packed into one line. T3 Code's terminal runs on the machine your agents run on, so the files land in the right place. If you use more than one T3 Code server, run the command on each.

## What it needs

The command needs bash, which macOS, Linux and WSL include. Downloading skills also needs git.

On Windows, T3 Code's own terminal is PowerShell, which cannot run the command. Choose a WSL distro in T3 Code under Settings → Sharing & access first, so that your projects and the terminal run there.

## What it changes

- It adds one marked block to a rules file. It never replaces the file. It leaves a symlinked rules file alone and says so, and then you add the contents of `rules.md` to that file yourself.
- It copies its own skills into the skills folder each agent reads.
- For one project where Claude plans or builds, it also writes a `CLAUDE.md` that points at `AGENTS.md` if there is none, and links `.claude/skills` to `.agents/skills`.
- It copies any file it changes to a backup folder first, and prints where.

Add `--dry-run` to the end of the command to see what would change without changing anything.

## Skills from other projects

A recipe can name skills that other people publish, such as ponytail or unslop. shopfloor does not carry copies of them:

- Each skill is its author's work, under its own licence.
- You get the version its author publishes today, not a copy that went stale here.
- A skill can pass a megabyte, and the command stays a few kilobytes.
- Each skill on the site links to its repository, so you can read it first.

With **Download the ones you are missing** switched on, the command fetches each of those skills from its own repository into the skills folders it installs to. It looks for a skill at `skills/<name>` in that repository, and tells you when it is not there. The switch starts on only when shopfloor lists every skill the recipe names. For a recipe with any other skill it starts off, so that nothing you have not read is downloaded. It never replaces a skill that is already there. For one project that means the project's own folder, so a skill you have machine-wide is still added there for the others who work in it. Switched off, it only tells you which ones are missing.

Two jobs need no extra skill. The Build and Review steps do what tstack's `full-stop`, `full-send`, `council` and `sol-loop` do, with the models you chose, so those four are not offered. shopfloor's reviewers take turns instead of running at once.

## Changing it

Change the recipe on the site and paste the new command. It replaces its own block and skills, and removes any of its skills the new recipe no longer has. Installed for every project, it also clears the rules and skills it gave an agent that the new recipe no longer uses.

## Removing it

Add `--uninstall` to the end of the same command. It removes the block and the skills shopfloor wrote, and a rules file that held nothing else. If a rules file is a link and its target still holds the block, it tells you, because it does not edit through links. Skills it downloaded from other projects stay, because other things may use them. So do a `CLAUDE.md` that points at `AGENTS.md` and the `.claude/skills` link, which are how Claude reads those folders whoever made them.

## From the download

**Download** gives you the same files as a zip. Unzip it, then install for one repository:

```bash
./install.sh project /path/to/repository
```

or for every project on the machine:

```bash
./install.sh machine
```

`--dry-run`, `--uninstall` and `--with-skills` work here too.

## What each agent reads

Files are installed for the agents that plan and build. Reviewers and the advisor need nothing installed, because they get a written brief each time.

| Agent | Project rules | Machine-wide rules | Skills | Status |
| --- | --- | --- | --- | --- |
| Claude | `CLAUDE.md`, pointing at `AGENTS.md` | `~/.claude/CLAUDE.md` | `.claude/skills`, `~/.claude/skills` | Tested |
| Codex | `AGENTS.md` | `~/.codex/AGENTS.md` | `.agents/skills`, `~/.agents/skills` | Tested |
| Antigravity | `AGENTS.md` | `~/.gemini/AGENTS.md` | `.agents/skills`, `~/.gemini/config/skills` | Tested: it found the skills but did not load the rules file, so it relies on `shopfloor-rules` |
| Muse Code | `AGENTS.md`, in a trusted workspace | None documented | `.agents/skills`, `~/.agents/skills` | Not tested |
