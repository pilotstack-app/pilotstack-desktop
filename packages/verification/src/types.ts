/**
 * Verification Types
 */

import type { PasteEvent, IdlePeriod } from "@pilotstack/types";

export interface VerificationInput {
  totalDuration: number;
  activeDuration: number;
  frameCount: number;
  pasteEvents: PasteEvent[];
  idlePeriods: IdlePeriod[];
}

export interface VerificationOutput {
  score: number;
  isVerified: boolean;
  factors: {
    pasteScore: number;
    activityScore: number;
    consistencyScore: number;
    durationScore: number;
  };
  flags: string[];
}

export interface PasteAnalysis {
  score: number;
  totalPasteSize: number;
  largePasteCount: number;
  pasteFrequency: number;
  flags: string[];
}

export interface ActivityAnalysis {
  score: number;
  activeRatio: number;
  averageActiveSessionLength: number;
  idleCount: number;
  flags: string[];
}
