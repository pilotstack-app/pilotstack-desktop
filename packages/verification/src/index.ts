/**
 * pilotstack Verification Package
 * Anti-cheat algorithms for verifying human-created content
 */

export { calculateVerificationScore, isSessionVerified } from "./calculator";
export { analyzePasteEvents } from "./paste-analyzer";
export { analyzeActivityPattern } from "./activity-analyzer";
export type {
  VerificationInput,
  VerificationOutput,
  PasteAnalysis,
  ActivityAnalysis,
} from "./types";
