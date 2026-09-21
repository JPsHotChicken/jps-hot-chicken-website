import { Dancing_Script } from "next/font/google";

/**
 * The cursive a typed signature is shown in on the rules slides. Loaded here
 * rather than in the root layout so only `/staff` ever downloads it.
 */
export const signatureFont = Dancing_Script({
  weight: ["600"],
  subsets: ["latin"],
  display: "swap",
});
