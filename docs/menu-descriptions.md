# Menu descriptions

`/admin/menu-descriptions` writes menu copy from what is actually in a dish.
Build a recipe from items in the [items database](./items-database.md) and from
other recipes, and press **Generate** to get a short and a long description, a
taste profile, texture notes and pairing suggestions.

Reached from the dashboard drawer, under the items database.

## The ingredients are the items database

There is no ingredient list of its own. A recipe line points at an **item**, and
what the generator reads — name, category, flavour tags, texture tags, intensity
1–5, notes — lives on that item's record along with its cost and pack size. Add
and edit them at `/admin/items`; the **Ingredients** tab here is a link to it.

That means:

- **A product is entered once.** The spec sheet that gives you a case price also
  gives you "crispy, tangy, intensity 4".
- **An item's own bill of materials comes with it.** Put `PRP-0001 Nashville
  dredge` in a recipe and the model is told what the dredge is made of, straight
  from the catalogue, without anybody retyping flour and cayenne.
- **Allergens roll up through both.** Through sub-recipes, and through what each
  item is built from.
- **Editing an item marks the copy stale.** Change a name, category, tag,
  intensity, note or build in the catalogue and every description written from it
  goes **out of date** — including through sub-recipes and through items built
  from it. The record says how many. A price change doesn't; the model never
  reads it.

Only items that can go in a dish are offered: raw, prepped, menu and modifier,
and nothing discontinued. Packaging, chemicals and smallwares are not.

## Setup

It uses the same Supabase project as the rest of the dashboard. The only new
setting is the Claude API key:

| Variable | Where |
|---|---|
| `ANTHROPIC_API_KEY` | `.env.local`, and Vercel → Project Settings → Environment Variables |

Without it, everything works except Generate, and the page says why.

## Screens

- **Recipes** — menu items and components (sauces, dredges, anything used
  inside something else) in two lists, with when each was last generated and an
  **Out of date** badge.
- **Recipe builder** — name, menu-item switch, yield, and component lines. Each
  line is an item *or* another recipe, with an amount, unit and prep note. The
  picker searches by name or item code, so you can type what's printed on the
  case. Allergens roll up live from every line. Below that, the description boxes
  (editable), the taste profile chart, and one Save for everything.

## Rules worth knowing

- **Nothing regenerates on its own.** Something changing only ever marks a
  description **out of date**. The owner decides when to spend a call, and a
  hand-edited description is never silently replaced.
- **A recipe can't contain itself**, directly or through a sub-recipe. The picker
  doesn't offer such a recipe, and a database trigger refuses it anyway.
- **Something in use can't be deleted.** An item or sub-recipe a recipe still
  uses has to be taken out of that recipe first — `recipe_components` references
  `items` with `on delete restrict`, same as the bill of materials does.
- **Generate works from the saved recipe.** With unsaved changes the button reads
  "Save & generate". A brand-new recipe has to be saved once before it can be
  generated.
- **The vocabulary is fixed in code.** Flavour, texture, intensity and allergens
  live in [`src/lib/items.ts`](../src/lib/items.ts); the component units, yield
  units and taste axes in
  [`src/lib/menu-descriptions.ts`](../src/lib/menu-descriptions.ts). Categories
  are the item's own free text, shared with the catalogue's filter.

## How generation works

`generateDescriptionAction` resolves the recipe's whole component tree into JSON
— sub-recipes expanded with their batch yield so the amount used can be weighed,
and each item carrying `made_from` where the catalogue says what it is built of
— and sends it to Claude (`claude-opus-5`) with the instructions in
[`src/lib/menu-descriptions-ai.ts`](../src/lib/menu-descriptions-ai.ts). The
reply is constrained to a JSON schema, checked again on arrival, and asked for
once more if it still can't be read. If Claude declines a request, the API
retries it on a fallback model automatically.

Allergens are **not** sent — the copy isn't meant to mention them.

## Tables

| Table | Holds |
|---|---|
| `recipes` | Name, menu-item flag, yield, and the stored generation: both descriptions, taste profile, texture notes, pairings, when it was generated, and whether it's out of date. |
| `recipe_components` | One line per part. Exactly one of `item_id` / `child_recipe_id` is set — a check constraint enforces it. |
| `items` | The ingredients. See the [items database](./items-database.md). |

`save_recipe(...)` saves a recipe's details and replaces its lines in one
transaction, so a line the loop trigger rejects never leaves half a recipe.
Like every other table, all have RLS on with no policies and are reached only
through the service role.

`ingredients` and `ingredient_categories` are the tables this used to keep. They
are no longer read or written — their 33 rows were moved into `items` — and are
left in place only so the move can be checked against them. They can be dropped
once you're satisfied.
