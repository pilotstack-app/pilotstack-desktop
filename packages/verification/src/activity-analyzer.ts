/**
 * Activity Pattern Analyzer
 * Analyzes user activity patterns to detect human behavior
 */

import { VERIFICATION } from "@pilotstack/types";
import type { IdlePeriod } from "@pilotstack/types";
import type { ActivityAnalysis } from "./types";

/**
 * Analyze activity pattern to determine activity score
 */
export function analyzeActivityPattern(
  totalDuration: number,
  activeDuration: number,
  idlePeriods: IdlePeriod[]
): ActivityAnalysis {
  const flags: string[] = [];

  if (totalDuration === 0) {
    return {
      score: 0,
      activeRatio: 0,
      averageActiveSessionLength: 0,
      idleCount: 0,
      flags: ["No recorded duration"],
    };
  }

  // Calculate active ratio
  const activeRatio = activeDuration / totalDuration;

  // Calculate average active session length
  const activeSessions = calculateActiveSessions(totalDuration, idlePeriods);
  const averageActiveSessionLength =
    activeSessions.length > 0
      ? activeSessions.reduce((sum, s) => sum + s, 0) / activeSessions.length
      : activeDuration;

  // Add flags
  if (activeRatio < VERIFICATION.MIN_ACTIVITY_RATIO) {
    flags.push("Low activity ratio detected");
  }

  if (averageActiveSessionLength > 3600) {
    // > 1 hour continuous
    flags.push("Unusually long continuous session");
  }

  if (idlePeriods.length === 0 && totalDuration > 1800) {
    // No breaks in 30+ min session
    flags.push("No breaks detected in long session");
  }

  // Calculate score
  let score = 100;

  // Penalize very low activity ratio
  if (activeRatio < 0.2) {
    score -= 30;
  } else if (activeRatio < VERIFICATION.MIN_ACTIVITY_RATIO) {
    score -= 15;
  }

  // Penalize suspicious continuous work (no breaks)
  if (idlePeriods.length === 0 && totalDuration > 3600) {
    score -= 20; // 1+ hour with no breaks is suspicious
  }

  // Reward natural break patterns
  if (idlePeriods.length > 0 && activeRatio > 0.5) {
    score += 5; // Bonus for natural work patterns
  }

  // Ensure score is within bounds
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    activeRatio,
    averageActiveSessionLength,
    idleCount: idlePeriods.length,
    flags,
  };
}

/**
 * Calculate active session lengths between idle periods
 */
function calculateActiveSessions(
  totalDuration: number,
  idlePeriods: IdlePeriod[]
): number[] {
  if (idlePeriods.length === 0) {
    return [totalDuration];
  }

  // Sort idle periods by start time
  const sorted = [...idlePeriods].sort((a, b) => a.start - b.start);
  const sessions: number[] = [];

  let lastEnd = 0;
  for (const idle of sorted) {
    if (idle.start > lastEnd) {
      sessions.push(idle.start - lastEnd);
    }
    lastEnd = idle.end;
  }

  // Add final session if there's time after last idle
  if (lastEnd < totalDuration) {
    sessions.push(totalDuration - lastEnd);
  }

  return sessions;
}

/**
 * Format active duration for display
 */
export function formatActiveDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m focus`;
  }
  return `${minutes}m focus`;
}

/**
 * Format total duration for display
 */
export function formatTotalDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m session`;
  }
  return `${minutes}m session`;
}
