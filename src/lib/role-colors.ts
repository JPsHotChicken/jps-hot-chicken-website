import { isRoleColor, type RoleColor } from "@/lib/schedule";

/**
 * How each role colour is drawn. Solid and dark, where a person's colour is a
 * pale tint, so a role reads as a label sitting on somebody's shift rather than
 * as another person. Red is left out for the same reason the people's palette
 * leaves it out: the coverage heat map owns it.
 */
export type RoleColorClasses = {
  /** The small filled label on a shift bar or a schedule line. */
  pill: string;
  /** The round marker beside a role's name in a list. */
  dot: string;
  /** The label shown for this colour when picking one. */
  label: string;
};

export const ROLE_COLOR_CLASSES: Record<RoleColor, RoleColorClasses> = {
  blue: { pill: "bg-blue-600 text-white", dot: "bg-blue-600", label: "Blue" },
  emerald: { pill: "bg-emerald-600 text-white", dot: "bg-emerald-600", label: "Green" },
  amber: { pill: "bg-amber-500 text-amber-950", dot: "bg-amber-500", label: "Yellow" },
  violet: { pill: "bg-violet-600 text-white", dot: "bg-violet-600", label: "Purple" },
  pink: { pill: "bg-pink-600 text-white", dot: "bg-pink-600", label: "Pink" },
  orange: { pill: "bg-orange-600 text-white", dot: "bg-orange-600", label: "Orange" },
  teal: { pill: "bg-teal-600 text-white", dot: "bg-teal-600", label: "Teal" },
  slate: { pill: "bg-slate-700 text-white", dot: "bg-slate-700", label: "Gray" },
};

/** Classes for a stored colour, falling back to blue for one this build doesn't know. */
export function roleColorClasses(color: string): RoleColorClasses {
  return ROLE_COLOR_CLASSES[isRoleColor(color) ? color : "blue"];
}
