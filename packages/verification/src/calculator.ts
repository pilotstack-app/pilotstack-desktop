/**
 * Verification Score Calculator
 * Combines all factors to determine if a session is verified
 *
 * Uses tiered paste scoring:
 * - Small pastes don't affect verification
 * - Medium pastes have minimal impact
 * - Large pastes are concerning
 * - Very large pastes (likely AI) can disqualify
 */

import { VERIFICATION } from "@pilotstack/types";
import { analyzePasteEvents, isPasteVeryLarge } from "./paste-analyzer";
import { analyzeActivityPattern } from "./activity-analyzer";
import type { VerificationInput, VerificationOutput } from "./types";

/**
 * Calculate the overall verification score for a session
 */
export function calculateVerificationScore(
  input: VerificationInput
): VerificationOutput {
  const flags: string[] = [];

  // Analyze paste events (40% weight)
  const pasteAnalysis = analyzePasteEvents(
    input.pasteEvents,
    input.totalDuration
  );
  flags.push(...pasteAnalysis.flags);

  // Count very large pastes (likely AI-generated content)
  const veryLargePasteCount = input.pasteEvents.filter(isPasteVeryLarge).length;

  // Analyze activity pattern (30% weight)
  const activityAnalysis = analyzeActivityPattern(
    input.totalDuration,
    input.activeDuration,
    input.idlePeriods
  );
  flags.push(...activityAnalysis.flags);

  // Calculate consistency score (20% weight)
  const consistencyScore = calculateConsistencyScore(input);

  // Calculate duration score (10% weight)
  const durationScore = calculateDurationScore(input.totalDuration);

  // Weighted final score
  const score = Math.round(
    pasteAnalysis.score * 0.4 +
      activityAnalysis.score * 0.3 +
      consistencyScore * 0.2 +
      durationScore * 0.1
  );

  // Determine if verified
  // Must meet score threshold AND not have too many large/very large pastes
  // Very large pastes (> 1000 chars) are treated more strictly as they suggest AI content
  const isVerified =
    score >= VERIFICATION.THRESHOLD &&
    pasteAnalysis.largePasteCount <= VERIFICATION.MAX_PASTE_EVENTS_FOR_VERIFIED &&
    veryLargePasteCount <= VERIFICATION.MAX_VERY_LARGE_PASTES_FOR_VERIFIED;

  return {
    score,
    isVerified,
    factors: {
      pasteScore: pasteAnalysis.score,
      activityScore: activityAnalysis.score,
      consistencyScore,
      durationScore,
    },
    flags,
  };
}

/**
 * Quick check if a session is verified
 */
export function isSessionVerified(input: VerificationInput): boolean {
  const result = calculateVerificationScore(input);
  return result.isVerified;
}

/**
 * Calculate consistency score based on frame capture rate
 */
function calculateConsistencyScore(input: VerificationInput): number {
  if (input.totalDuration === 0 || input.frameCount === 0) {
    return 0;
  }

  // Expected frames based on 1 frame per second during active time
  const expectedFrames = input.activeDuration;
  const actualFrames = input.frameCount;

  // Calculate ratio (capped at 1.0)
  const ratio = Math.min(actualFrames / expectedFrames, 1.0);

  // Score based on how close to expected frame count
  // 80%+ of expected frames = 100 score
  // Below 50% = lower scores
  if (ratio >= 0.8) return 100;
  if (ratio >= 0.6) return 80;
  if (ratio >= 0.4) return 60;
  if (ratio >= 0.2) return 40;
  return 20;
}

/**
 * Calculate duration score - longer sessions get higher scores
 */
function calculateDurationScore(totalDuration: number): number {
  const minutes = totalDuration / 60;

  // Very short sessions (< 5 min) get lower scores
  if (minutes < 5) return 40;
  if (minutes < 15) return 60;
  if (minutes < 30) return 80;
  if (minutes < 60) return 90;
  return 100;
}
