/**
 * Paste Event Analyzer
 * Analyzes clipboard paste events to detect potential AI-generated content
 *
 * Uses tiered scoring to distinguish between:
 * - Small pastes (< 50 chars): No penalty - normal coding (variable names, imports)
 * - Medium pastes (50-300 chars): Minor penalty - could be normal code
 * - Large pastes (300-1000 chars): Moderate penalty - likely copied functions
 * - Very large pastes (> 1000 chars): Heavy penalty - likely AI-generated
 */

import { VERIFICATION } from "@pilotstack/types";
import type { PasteEvent } from "@pilotstack/types";
import type { PasteAnalysis } from "./types";

/**
 * Categorize a paste event by size tier
 */
export function categorizePaste(
  size: number
): "small" | "medium" | "large" | "very_large" {
  if (size < VERIFICATION.PASTE_THRESHOLD_SMALL) {
    return "small";
  }
  if (size < VERIFICATION.PASTE_THRESHOLD_MEDIUM) {
    return "medium";
  }
  if (size < VERIFICATION.PASTE_THRESHOLD_LARGE) {
    return "large";
  }
  return "very_large";
}

/**
 * Get penalty for a paste based on its size tier
 */
export function getPastePenalty(size: number): number {
  const tier = categorizePaste(size);
  switch (tier) {
    case "small":
      return VERIFICATION.PASTE_PENALTY_SMALL;
    case "medium":
      return VERIFICATION.PASTE_PENALTY_MEDIUM;
    case "large":
      return VERIFICATION.PASTE_PENALTY_LARGE;
    case "very_large":
      return VERIFICATION.PASTE_PENALTY_VERY_LARGE;
  }
}

/**
 * Analyze paste events to determine paste score using tiered penalties
 *
 * Small pastes (snippets, variable names) don't hurt the score
 * Only large pastes that suggest AI-generated content are penalized heavily
 */
export function analyzePasteEvents(
  pasteEvents: PasteEvent[],
  totalDuration: number
): PasteAnalysis {
  const flags: string[] = [];

  if (pasteEvents.length === 0) {
    return {
      score: 100,
      totalPasteSize: 0,
      largePasteCount: 0,
      pasteFrequency: 0,
      flags: [],
    };
  }

  // Calculate total paste size
  const totalPasteSize = pasteEvents.reduce(
    (sum, event) => sum + event.approximateSize,
    0
  );

  // Categorize pastes by tier
  const pasteCounts = {
    small: 0,
    medium: 0,
    large: 0,
    very_large: 0,
  };

  for (const event of pasteEvents) {
    const tier = categorizePaste(event.approximateSize);
    pasteCounts[tier]++;
  }

  // Count significant pastes (large + very_large) - these are the ones that matter
  const largePasteCount = pasteCounts.large + pasteCounts.very_large;
  const veryLargePasteCount = pasteCounts.very_large;

  // Calculate paste frequency (pastes per minute)
  const minutes = totalDuration / 60;
  const pasteFrequency = minutes > 0 ? pasteEvents.length / minutes : 0;

  // Add flags for suspicious activity (only for significant pastes)
  if (veryLargePasteCount > 0) {
    flags.push(
      `${veryLargePasteCount} very large paste(s) detected (possible AI content)`
    );
  }
  if (pasteCounts.large > 0) {
    flags.push(`${pasteCounts.large} large paste(s) detected`);
  }

  // High frequency is less concerning if it's all small pastes
  const significantPasteFrequency =
    minutes > 0 ? (pasteCounts.large + pasteCounts.very_large) / minutes : 0;

  if (significantPasteFrequency > 1) {
    flags.push("High frequency of large pastes detected");
  }

  if (totalPasteSize > 10000) {
    flags.push("Very large total paste volume detected");
  }

  // Calculate score using tiered penalties
  let score = 100;

  // Apply tiered penalties for each paste
  for (const event of pasteEvents) {
    score -= getPastePenalty(event.approximateSize);
  }

  // Additional penalty for very high frequency of significant pastes
  if (significantPasteFrequency > 2) {
    score -= 10;
  }
  if (significantPasteFrequency > 5) {
    score -= 15;
  }

  // Additional penalty for massive total volume (suggests bulk AI content)
  if (totalPasteSize > 5000) {
    score -= 5;
  }
  if (totalPasteSize > 10000) {
    score -= 10;
  }
  if (totalPasteSize > 20000) {
    score -= 15;
  }

  // Ensure score is within bounds
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    totalPasteSize,
    largePasteCount, // Now only counts large + very_large
    pasteFrequency,
    flags,
  };
}

/**
 * Check if a single paste event is suspicious (large or very large)
 * Small and medium pastes are not considered suspicious
 */
export function isPasteSuspicious(event: PasteEvent): boolean {
  const tier = categorizePaste(event.approximateSize);
  return tier === "large" || tier === "very_large";
}

/**
 * Check if a paste is very large (likely AI-generated)
 */
export function isPasteVeryLarge(event: PasteEvent): boolean {
  return event.approximateSize >= VERIFICATION.PASTE_THRESHOLD_LARGE;
}

/**
 * Get paste event summary for display
 */
export function getPasteSummary(pasteEvents: PasteEvent[]): string {
  if (pasteEvents.length === 0) {
    return "0 Copy-Pastes";
  }

  const veryLargePastes = pasteEvents.filter(isPasteVeryLarge).length;
  const suspiciousPastes = pasteEvents.filter(isPasteSuspicious).length;

  if (veryLargePastes > 0) {
    return `${pasteEvents.length} paste events (${veryLargePastes} flagged as suspicious)`;
  }

  if (suspiciousPastes > 0) {
    return `${pasteEvents.length} paste events (${suspiciousPastes} large)`;
  }

  return `${pasteEvents.length} paste events`;
}
