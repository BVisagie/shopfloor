# Recipe format

A recipe is one JSON file. **Save recipe** on the site writes it, and **Open recipe** reads it back.

```json
{
  "$schema": "https://bvisagie.github.io/shopfloor/recipe.schema.json",
  "version": 1,
  "name": "My line",
  "phases": {
    "plan": [{ "instanceId": "claudeAgent", "model": "claude-opus-5-5", "options": { "effort": "high" } }],
    "build": [{ "instanceId": "claudeAgent", "model": "claude-opus-5-5", "options": { "effort": "high" } }],
    "review": [{ "instanceId": "codex", "model": "gpt-6.1-sol", "options": { "reasoningEffort": "xhigh" } }]
  },
  "advisor": { "instanceId": "claudeAgent", "model": "claude-fable-5-2", "options": { "effort": "high" }, "maxCalls": 3 },
  "limits": { "maxSubagents": 1, "maxReviewRounds": 3 },
  "skills": [{ "name": "ponytail", "repo": "https://github.com/DietrichGebert/ponytail", "when": "on every coding task" }],
  "models": []
}
```

| Field | What it holds |
| --- | --- |
| `phases` | The models allowed on each step, preferred first. Each step needs at least one and takes up to six, each model once. |
| `advisor` | Optional. One model the others ask for a second opinion. `maxCalls` is the most times it may be asked in one task, from 1 to 12, and 3 when left out. |
| `limits.maxSubagents` | The most subagents a thread may run at once, from 0 to 16. |
| `limits.maxReviewRounds` | A ceiling on reviewer runs, from 1 to 12. Review ends as soon as every reviewer is done. |
| `skills` | Up to 12 skills from other projects. `when` completes the sentence "Use the skill ...". |
| `models` | Up to 24 models you added by hand with **Add a model**. |

Each model is named the way T3 Code names it: provider instance, model id and options.

The site checks a recipe before it opens it, because its values end up in instructions that agents follow. A skill's `repo` must be a `https://github.com/owner/name` address, its `name` uses lower-case letters, digits and hyphens, and names that start with `shopfloor-` are reserved.

The full schema is [`public/recipe.schema.json`](../public/recipe.schema.json).
