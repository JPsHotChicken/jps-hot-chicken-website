/**
 * A colour per person, so a name is recognisable on the grid at a glance.
 *
 * The old grid tinted cells by shift group, which meant every morning person
 * looked identical. These are keyed to the individual instead: two people never
 * share a shade until there are more of them than there are colours.
 */

export type EmployeeColor = {
  /** The filled cell on the schedule grid. */
  cell: string;
  /** The small round marker beside a name in a list. */
  dot: string;
};

/**
 * Sixteen tints, light enough to read near-black text on. Red is left out — the
 * coverage heat map owns it, and a person shouldn't look like a busy hour.
 */
export const EMPLOYEE_COLORS: EmployeeColor[] = [
  { cell: "bg-amber-200 text-amber-950 hover:bg-amber-300", dot: "bg-amber-400" },
  { cell: "bg-sky-200 text-sky-950 hover:bg-sky-300", dot: "bg-sky-400" },
  { cell: "bg-rose-200 text-rose-950 hover:bg-rose-300", dot: "bg-rose-400" },
  { cell: "bg-lime-200 text-lime-950 hover:bg-lime-300", dot: "bg-lime-400" },
  { cell: "bg-violet-200 text-violet-950 hover:bg-violet-300", dot: "bg-violet-400" },
  { cell: "bg-teal-200 text-teal-950 hover:bg-teal-300", dot: "bg-teal-400" },
  { cell: "bg-orange-200 text-orange-950 hover:bg-orange-300", dot: "bg-orange-400" },
  { cell: "bg-blue-200 text-blue-950 hover:bg-blue-300", dot: "bg-blue-400" },
  { cell: "bg-pink-200 text-pink-950 hover:bg-pink-300", dot: "bg-pink-400" },
  { cell: "bg-emerald-200 text-emerald-950 hover:bg-emerald-300", dot: "bg-emerald-400" },
  { cell: "bg-indigo-200 text-indigo-950 hover:bg-indigo-300", dot: "bg-indigo-400" },
  { cell: "bg-yellow-200 text-yellow-950 hover:bg-yellow-300", dot: "bg-yellow-400" },
  { cell: "bg-cyan-200 text-cyan-950 hover:bg-cyan-300", dot: "bg-cyan-400" },
  { cell: "bg-fuchsia-200 text-fuchsia-950 hover:bg-fuchsia-300", dot: "bg-fuchsia-400" },
  { cell: "bg-green-200 text-green-950 hover:bg-green-300", dot: "bg-green-400" },
  { cell: "bg-purple-200 text-purple-950 hover:bg-purple-300", dot: "bg-purple-400" },
];

/** FNV-1a, so a given id always reaches for the same colour first. */
function hashOf(value: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/**
 * The colour each person gets.
 *
 * Two passes, so hiring somebody doesn't repaint the people already on the
 * grid. Everyone reaches for the shade their id hashes to; where several want
 * the same one only the loser moves along, and everybody else is untouched by
 * who else happens to be on the roster.
 */
export function employeeColors(employees: { id: string }[]): Map<string, EmployeeColor> {
  const colors = new Map<string, EmployeeColor>();
  const holder: (string | null)[] = EMPLOYEE_COLORS.map(() => null);
  const bumped: { id: string; preferred: number }[] = [];

  // First pass: claim the preferred shade. Ties go to the lower id — an
  // arbitrary but fixed rule, so the same roster always paints the same way.
  for (const { id } of employees) {
    const preferred = hashOf(id) % EMPLOYEE_COLORS.length;
    const sitting = holder[preferred];
    if (sitting === null) {
      holder[preferred] = id;
    } else if (id < sitting) {
      holder[preferred] = id;
      bumped.push({ id: sitting, preferred });
    } else {
      bumped.push({ id, preferred });
    }
  }

  // Second pass: whoever lost a tie walks on to the next free shade. Once every
  // colour is out they start repeating, which only happens past 16 people.
  bumped.sort((a, b) => a.id.localeCompare(b.id));
  for (const { id, preferred } of bumped) {
    let index = preferred;
    for (let step = 1; holder[index] !== null && step <= EMPLOYEE_COLORS.length; step++) {
      index = (preferred + step) % EMPLOYEE_COLORS.length;
    }
    if (holder[index] === null) holder[index] = id;
    else colors.set(id, EMPLOYEE_COLORS[preferred]);
  }

  holder.forEach((id, index) => {
    if (id !== null) colors.set(id, EMPLOYEE_COLORS[index]);
  });

  return colors;
}
