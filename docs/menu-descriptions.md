# Menu descriptions

`/admin/menu-descriptions` writes menu copy from what is actually in a dish.
Keep a list of ingredients with their flavour, texture, intensity and allergens,
build recipes from them, and press **Generate** to get a short and a long
description, a taste profile, texture notes and pairing suggestions.

Reached from the dashboard drawer, under the items database.

## Setup

It uses the same Supabase project as the rest of the dashboard. The only new
setting is the Claude API key:

| Variable | Where |
|---|---|
| `ANTHROPIC_API_KEY` | `.env.local`, and Vercel → Project Settings → Environment Variables |

Without it, everything works except Generate, and the builder says why.

## Screens

- **Recipes** — menu items and components (sauces, dredges, anything used
  inside something else) in two lists, with when each was last generated and an
  **Out of date** badge.
- **Ingredients** — one table, search by name, add / edit / delete in place.
- **Recipe builder** — name, menu-item switch, yield, and component lines. Each
  line is an ingredient *or* another recipe, with an amount, unit and prep note.
  Allergens roll up live from every line, including what's inside sub-recipes.
  Below that, the description boxes (editable), the taste profile chart, and one
  Save for everything.

## Rules worth knowing

- **Nothing regenerates on its own.** Editing an ingredient, or a recipe's name,
  yield or lines, marks every description written from it **out of date** —
  including recipes that use it through a sub-recipe. The owner decides when to
  spend a call, and a hand-edited description is never silently replaced.
- **A recipe can't contain itself**, directly or through a sub-recipe. The picker
  doesn't offer such a recipe, and a database trigger refuses it anyway.
- **Something in use can't be deleted.** An ingredient or sub-recipe that a
  recipe still uses has to be taken out of that recipe first.
- **Generate works from the saved recipe.** With unsaved changes the button reads
  "Save & generate". A brand-new recipe has to be saved once before it can be
  generated.
- The flavour, texture, allergen, category and unit lists are **fixed in code**
  (`src/lib/menu-descriptions.ts`). There is deliberately no screen for editing
  them.

## How generation works

`generateDescriptionAction` resolves the recipe's whole component tree into JSON
(sub-recipes expanded, with their batch yield so the amount used can be weighed)
and sends it to Claude (`claude-opus-5`) with the instructions in
`src/lib/menu-descriptions-ai.ts`. The reply is constrained to a JSON schema,
checked again on arrival, and asked for once more if it still can't be read.
If Claude declines a request, the API retries it on a fallback model automatically.

Allergens are **not** sent — the copy isn't meant to mention them.

## Tables

| Table | Holds |
|---|---|
| `ingredients` | Name, category, flavour and texture tags, intensity 1–5, allergens, notes. |
| `recipes` | Name, menu-item flag, yield, and the stored generation: both descriptions, taste profile, texture notes, pairings, when it was generated, and whether it's out of date. |
| `recipe_components` | One line per part. Exactly one of `ingredient_id` / `child_recipe_id` is set — a check constraint enforces it. |

`save_recipe(...)` saves a recipe's details and replaces its lines in one
transaction, so a line the loop trigger rejects never leaves half a recipe.
Like every other table, all three have RLS on with no policies and are reached
only through the service role.

This is separate from the items database on purpose: that one is about cost and
purchasing, this one only about taste and allergens.

## Sample data

Shipped with 31 ingredients, **House Comeback Sauce** (a component) and
**Nashville Hot Chicken Sandwich** (a menu item that uses the sauce). They're
examples; edit or delete them freely. Delete the sandwich before the sauce.
