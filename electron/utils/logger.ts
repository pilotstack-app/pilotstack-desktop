/**
 * Logger
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Project Structure §utils
 * 
 * Migrated from utils/logger.js
 * Maps to: utils/logger.js
 */

import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

const LOG_DIR = path.join(app.getPath("userData"), "logs");
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_LOG_FILES = 7; // Keep 7 days of logs

// Ensure log directory exists
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (error) {
  console.error("Failed to create log directory:", error);
}

/**
 * Get log file path for today
 */
function getLogFilePath(): string {
  const today = new Date().toISOString().split("T")[0];
  return path.join(LOG_DIR, `pilotstack-${today}.log`);
}

/**
 * Clean up old log files
 */
function cleanupOldLogs(): void {
  try {
    const files = fs.readdirSync(LOG_DIR);
    const logFiles = files
      .filter((f) => f.startsWith("pilotstack-") && f.endsWith(".log"))
      .map((f) => ({
        name: f,
        path: path.join(LOG_DIR, f),
        mtime: fs.statSync(path.join(LOG_DIR, f)).mtime,
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // Keep only the most recent MAX_LOG_FILES
    if (logFiles.length > MAX_LOG_FILES) {
      logFiles.slice(MAX_LOG_FILES).forEach((file) => {
        try {
          fs.unlinkSync(file.path);
        } catch (e) {
          // Ignore errors
        }
      });
    }
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Rotate log file if it's too large
 */
function rotateLogIfNeeded(logFile: string): void {
  try {
    if (fs.existsSync(logFile)) {
      const stats = fs.statSync(logFile);
      if (stats.size > MAX_LOG_SIZE) {
        const rotatedFile = logFile.replace(".log", `-${Date.now()}.log`);
        fs.renameSync(logFile, rotatedFile);
      }
    }
  } catch (error) {
    // Ignore rotation errors
  }
}

/**
 * Write log entry to file
 */
function writeLog(level: string, message: string, data: any = null): void {
  const timestamp = new Date().toISOString();
  const logFile = getLogFilePath();
  const logLine = `[${timestamp}] [${level}] ${message}${
    data ? `\n${JSON.stringify(data, null, 2)}` : ""
  }\n`;

  try {
    rotateLogIfNeeded(logFile);
    fs.appendFileSync(logFile, logLine, "utf8");
  } catch (error) {
    // Fallback to console if file write fails
    console.error("Failed to write log:", error);
    console.log(logLine);
  }

  // Also log to console
  if (level === "ERROR") {
    console.error(`[${level}] ${message}`, data || "");
  } else if (level === "WARN") {
    console.warn(`[${level}] ${message}`, data || "");
  } else {
    console.log(`[${level}] ${message}`, data || "");
  }
}

/**
 * Logger utility
 * 
 * Reference: ARCHITECTURE_DOCUMENTATION.md - Project Structure §utils
 */
export const logger = {
  info: (message: string, data?: any) => writeLog("INFO", message, data),
  warn: (message: string, data?: any) => writeLog("WARN", message, data),
  error: (message: string, data?: any) => writeLog("ERROR", message, data),
  debug: (message: string, data?: any) => writeLog("DEBUG", message, data),

  /**
   * Get recent log entries
   */
  getRecentLogs: (lines: number = 100): string => {
    try {
      const logFile = getLogFilePath();
      if (!fs.existsSync(logFile)) {
        return "No logs available yet.";
      }

      const content = fs.readFileSync(logFile, "utf8");
      const allLines = content.split("\n").filter((line) => line.trim());
      const recentLines = allLines.slice(-lines);
      return recentLines.join("\n");
    } catch (error: any) {
      return `Error reading logs: ${error.message}`;
    }
  },

  /**
   * Get log file path
   */
  getLogFilePath: (): string => getLogFilePath(),

  /**
   * Get all log files
   */
  getAllLogFiles: (): Array<{ name: string; path: string; size: number; mtime: Date }> => {
    try {
      const files = fs.readdirSync(LOG_DIR);
      return files
        .filter((f) => f.startsWith("pilotstack-") && f.endsWith(".log"))
        .map((f) => {
          const filePath = path.join(LOG_DIR, f);
          const stats = fs.statSync(filePath);
          return {
            name: f,
            path: filePath,
            size: stats.size,
            mtime: stats.mtime,
          };
        })
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    } catch (error) {
      return [];
    }
  },

  /**
   * Clear all logs
   */
  clearLogs: (): { success: boolean; error?: string } => {
    try {
      const files = logger.getAllLogFiles();
      files.forEach((file) => {
        try {
          fs.unlinkSync(file.path);
        } catch (e) {
          // Ignore errors
        }
      });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

// Clean up old logs on startup
cleanupOldLogs();

