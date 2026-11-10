# shopfloor

shopfloor is a static site. A user places models on Plan, Build and Review, with an advisor if they want one, and the site generates the rules, skills and install script that make coding agents in T3 Code follow that workflow. There is no server: everything runs in the browser.

These instructions are for every coding agent that works in this repository.

## Check your work

Needs Node 26 or newer.

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Run `npm run typecheck` and `npm test` before you hand work back. For a change you can see, also run `npm run dev` and look at it on a desktop screen and at 390 pixels wide.

## Where things are

| Path | What it holds |
| --- | --- |
| `src/recipe.ts` | The recipe format, its reader and the templates |
| `src/catalog.ts` | Models, providers and the skills the site offers |
| `src/generate.ts` | Every file a recipe produces, and the install command |
| `src/install.sh` | The install script. `src/installScript.ts` fills in its two lists |
| `src/ui/` | The page |
| `public/recipe.schema.json` | The published schema for recipes |

## Rules that are easy to break

### A recipe is untrusted input

People open recipes that other people made. Their values end up in instructions that agents follow and in a shell script.

- Every value is checked in `parseRecipe`. Values that reach the shell are checked again in `src/installScript.ts`.
- A new field needs a check in the reader, an entry in `public/recipe.schema.json`, and a row in the "rejects" table in `tests/recipe.test.ts`.
- Never build shell text or Markdown from a value that has not passed those checks.

### The install script changes files that belong to the user

- It adds one marked block to a rules file. It never replaces the file.
- It copies a file to the backup folder before it changes it.
- It removes only what it put there: its own block, and skill folders that carry its `.shopfloor` marker. No `rm -rf` outside its own temporary folder.
- It leaves symlinks alone, and never replaces a skill that is already installed.
- A machine install also clears its block and skills from a provider the recipe no longer uses. One place may be a link to another, so compare places as files, never by name.
- It must run with bash 3.2 and BSD tools, which is what macOS ships. No associative arrays, `mapfile`, `${var,,}` or GNU-only options. Expand a list that may be empty as `${list[@]+"${list[@]}"}`. CI runs the tests on macOS.
- The pasted install command stays one line, so that it works in bash, zsh and fish.

When you try the script by hand, set `HOME` and `XDG_STATE_HOME` to scratch folders first. Never run it against your real home folder.

### The generated text is the product

The rules and skills in `src/generate.ts` are instructions that other agents will follow. Changing a sentence there changes how they behave.

- Write them in plain words that any model can follow.
- A machine install puts skills where sessions outside T3 Code find them too. Every skill must say it is for T3 Code, in its description and its first lines.
- Model ids and option names must be the ones T3 Code uses. Do not guess one. Mark an id you cannot confirm as `unconfirmed` in `src/catalog.ts`.
- Update `CATALOG_DATE` when you change the model list.

### The site sends nothing

The README promises that nothing leaves the browser. Do not add analytics, remote fonts, a script from a CDN or any other request. Keep assets in `public/`.

### Skills from other projects are linked, never copied

They belong to their authors. Do not copy a skill's files into this repository. The install script downloads them from their own repositories when the user asks for that.

### Dependencies

React is the only runtime dependency. The zip writer is `src/zip.ts`, and compression uses the browser's own API. Ask before you add a package.

## Design

- True black, with the colours defined in `src/styles.css`. Each step has one colour, and so does the advisor. A colour shows state, not decoration.
- Spacing in multiples of 4 pixels. Sentence case. No glows or looping animation, and no gradients except the faint tint at the top of a lit card.
- At 1280 by 800 the whole page fits one screen with one model on each step, and at 1440 by 900 with two. Check both when you add a row. On a phone nothing scrolls sideways.
- Wording is short and plain. Say what a control does.
- Use each maker's official logo unchanged, and credit a new one in the README.

## Tests

- Unit tests only, with Vitest. Do not add browser or screenshot tests to CI.
- Tests run the real install script in temporary folders and never use the network. `tests/install.test.ts` shows how local repositories stand in for GitHub.
- Test what can break: reading recipes, the generated text and the install script. Add a row to an existing table where one fits.

## Commits and pull requests

This repository is public.

- Say what changed and why, in plain words.
- Keep credentials, home folder paths and private names out of commits, pull requests and comments.
- Do not commit plans, notes or screenshots made while working.
- When behaviour changes, update `README.md`, `docs/` and the text on the page in the same change. Keep the README short, and put detail in `docs/`.
