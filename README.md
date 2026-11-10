<p align="center">
  <img src="public/logo.svg" width="72" height="72" alt="">
</p>

<h1 align="center">shopfloor</h1>

<p align="center">
  Arrange models on a production line, and get the rules and skills that make<br>
  coding agents in <a href="https://t3.codes">T3 Code</a> follow it.
</p>

<p align="center">
  <a href="https://bvisagie.github.io/shopfloor/"><b>Open shopfloor</b></a>
</p>

You decide which models plan, which build and which review, set a few limits, and pick the skills to use. shopfloor turns that into files your agents load. Nothing is sent anywhere: the site runs in your browser and has no server.

## How it works

1. Start from a template or a blank line, and place at least one model on each of Plan, Build and Review.
2. Set the limits and pick the skills. Add an advisor if you want a second opinion along the way.
3. Click **Install**, paste the command into T3 Code's terminal, and start a new thread.

After that you plan as usual. When you say "execute the plan", the agent builds it with the models you chose, has the reviewers read the change one at a time, and opens a pull request. It never merges one.

Your choices are a **recipe**: one small JSON file you can save, share and open again.

## What a recipe produces

| File | What it is |
| --- | --- |
| `rules.md` | The rules agents load at the start of every session |
| `skills/shopfloor-build` | Builds an agreed plan when you say "execute the plan" |
| `skills/shopfloor-review` | Has other models review a change, one at a time |
| `skills/shopfloor-advise` | How to ask the advisor, added when the line has one |
| `skills/shopfloor-rules` | The same rules as a skill, added for agents that do not load a rules file |
| `install.sh` | Puts the files where agents read them |
| `recipe.json` | The recipe, so the download can be opened in shopfloor again |

**Install** packs the rules, skills and script into one command. **View files** shows every file, and **Download** gives you a zip.

## Good to know

- **These are instructions, not limits.** Agents usually follow them, and nothing enforces them.
- **Read before you install.** Agents will follow a recipe's rules, so read a recipe someone else made with **View files** first.
- **Your other instruction files still apply.** An agent may follow rules it already has over the ones a recipe adds.
- **An advisor is optional.** It is a model the others ask for a second opinion: before a plan is shown to you, when the same check or fix has failed twice, and when the builder and a reviewer cannot agree. It reads and answers, and never edits.
- **Skills from other projects are fetched, not bundled.** A skill such as ponytail or unslop belongs to its author, so the install command downloads it from its own repository when you do not have it.
- **The command needs bash.** macOS, Linux and WSL include it. On Windows, run your T3 Code projects in WSL.
- **Model ids come from T3 Code.** Ids marked `check id` on the site are not confirmed. Check them in your model picker, and use **Add a model** for anything missing.

## More

- [Installing](docs/install.md): where the files go, what each agent reads, Windows, and how to remove everything again.
- [Recipe format](docs/recipe.md): the JSON file and its limits.

## Develop

Needs Node 26 or newer.

```bash
npm ci
npm run dev        # the site, with reload
npm test           # unit tests
npm run typecheck
npm run build      # static files in dist/
```

The model list is in [`src/catalog.ts`](src/catalog.ts). A pull request that confirms or corrects a model id is welcome. Coding agents that work on this repository read [`AGENTS.md`](AGENTS.md).

## Notices

shopfloor is not affiliated with T3 Code or with any model maker. Logos are trademarks of their owners and appear only to identify their products. The ponytail logo is from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) and the T3 Code icon is from [pingdotgg/t3code](https://github.com/pingdotgg/t3code). Both are MIT licensed, and their notices are in [NOTICE.md](NOTICE.md).

## License

[MIT](LICENSE)
