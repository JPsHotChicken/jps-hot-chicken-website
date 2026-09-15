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

Without it, everything works except Generate and reading spec sheets, and the
page says why.

## Screens

- **Recipes** — menu items and components (sauces, dredges, anything used
  inside something else) in two lists, with when each was last generated and an
  **Out of date** badge.
- **Ingredients** — one table, search by name, add / edit / delete in place.
  **Categories** opens the category list: add, rename, delete. **Add from PDF**
  reads a supplier's spec sheet and opens a new ingredient already filled in;
  **Fill from PDF** inside an open row does the same for that row, keeping any
  name already typed.
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
- **Categories are the owner's; the other lists aren't.** Categories live in
  the `ingredient_categories` table. Renaming one moves every ingredient in it
  (a foreign key with `on update cascade`) and marks their descriptions out of
  date, since the model is told each ingredient's category. One still in use
  can't be deleted, and the last one can't either. The flavour, texture,
  allergen and unit lists stay **fixed in code** (`src/lib/menu-descriptions.ts`).
- **A spec sheet only fills the form.** Nothing is saved until Save is pressed,
  so the owner checks what was read, allergens especially.

## How generation works

`generateDescriptionAction` resolves the recipe's whole component tree into JSON
(sub-recipes expanded, with their batch yield so the amount used can be weighed)
and sends it to Claude (`claude-opus-5`) with the instructions in
`src/lib/menu-descriptions-ai.ts`. The reply is constrained to a JSON schema,
checked again on arrival, and asked for once more if it still can't be read.
If Claude declines a request, the API retries it on a fallback model automatically.

Allergens are **not** sent — the copy isn't meant to mention them.

## How reading a spec sheet works

The PDF is posted to `/api/admin/menu-descriptions/spec-sheet` (a route, not a
Server Action, because actions have a 1 MB body limit; the route caps files at
4 MB, under Vercel's 4.5 MB). It checks the session, checks the file really is a
PDF, and sends it to Claude with the owner's current category list.
`readSpecSheet` in `src/lib/menu-descriptions-ai.ts` holds the instructions;
the reply's shape is constrained to the form's own lists and checked again by
`parseSpecSheet`.

- **Allergens are what the product contains.** Rows marked "free from" are left
  out, with names mapped onto this tool's list (milk → dairy, wheat → gluten,
  crustacean → shellfish).
- **"May contain" and shared-equipment warnings are shown, not saved.** They
  appear in the notice after reading. They aren't put in the allergen list,
  which means "contains", or in notes, which the description writer reads.
- **Notes hold only what the sheet says**: what the product is, how it's made,
  brand and item number. There's no guessing at how the kitchen serves it.

Tested against a PFG sheet (West Creek breaded dill pickle chips, #873671): one
call, about six seconds.

## Tables

| Table | Holds |
|---|---|
| `ingredient_categories` | The category names, in the owner's order. `ingredients.category` points here. |
| `ingredients` | Name, category, flavour and texture tags, intensity 1–5, allergens, notes. |
| `recipes` | Name, menu-item flag, yield, and the stored generation: both descriptions, taste profile, texture notes, pairings, when it was generated, and whether it's out of date. |
| `recipe_components` | One line per part. Exactly one of `ingredient_id` / `child_recipe_id` is set — a check constraint enforces it. |

`save_recipe(...)` saves a recipe's details and replaces its lines in one
transaction, so a line the loop trigger rejects never leaves half a recipe.
Like every other table, all four have RLS on with no policies and are reached
only through the service role.

This is separate from the items database on purpose: that one is about cost and
purchasing, this one only about taste and allergens.

## Sample data

Shipped with 31 ingredients, **House Comeback Sauce** (a component) and
**Nashville Hot Chicken Sandwich** (a menu item that uses the sauce). They're
examples; edit or delete them freely. Delete the sandwich before the sauce.
