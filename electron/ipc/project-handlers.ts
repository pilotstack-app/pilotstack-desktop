/**
 * Project IPC Handlers
 *
 * Phase 5: Desktop App Integration
 * 
 * Handles project-related IPC communication:
 * - Fetching projects from API
 * - Project selection for recordings
 * - Auto-detection based on window titles
 * - Pattern storage for window title matching
 */

import { ipcMain } from "electron";
import { AppContext } from "../core/app-context";
import { handleWithValidation } from "./validation";
import {
  setProjectSelectionSchema,
  addProjectPatternSchema,
  removeProjectPatternSchema,
} from "./schemas";
import { buildApiUrl } from "../config/api";
import { secureAuthManager, projectStore } from "../config/store";
import { createSignedHeaders } from "../services/upload/auth-helpers";
import { logger } from "../utils/logger";
import type {
  Project,
  ProjectsListResponse,
  ProjectSelection,
  ProjectPattern,
} from "../config/types";

// =============================================================================
// In-memory state for current session
// =============================================================================

let currentProjectSelection: ProjectSelection = {
  projectId: projectStore.get("lastUsedProjectId") || null,
  projectName: projectStore.get("lastUsedProjectName") || null,
};

let projectPatterns: ProjectPattern[] = projectStore.get("windowPatterns") || [];
let cachedProjects: Project[] = [];
let lastProjectFetchTime = 0;
const PROJECT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// API Fetching
// =============================================================================

/**
 * Fetch projects from the web API
 */
async function fetchProjectsFromApi(): Promise<ProjectsListResponse | null> {
  const accessToken = secureAuthManager.getAccessToken();
  if (!accessToken) {
    logger.debug("Cannot fetch projects: not authenticated");
    return null;
  }

  try {
    const signedHeaders = createSignedHeaders("");
    const response = await fetch(buildApiUrl("PROJECTS"), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...signedHeaders,
      },
    });

    if (!response.ok) {
      logger.warn("Failed to fetch projects", {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const data = (await response.json()) as ProjectsListResponse;
    cachedProjects = data.projects;
    lastProjectFetchTime = Date.now();
    
    logger.info("Projects fetched successfully", {
      count: data.projects.length,
      uncategorizedCount: data.uncategorizedCount,
    });
    
    return data;
  } catch (error: any) {
    logger.error("Error fetching projects", { error: error.message });
    return null;
  }
}

/**
 * Get projects with caching
 */
async function getProjects(forceRefresh = false): Promise<Project[]> {
  const now = Date.now();
  const cacheValid = now - lastProjectFetchTime < PROJECT_CACHE_TTL;
  
  if (!forceRefresh && cacheValid && cachedProjects.length > 0) {
    return cachedProjects;
  }
  
  const response = await fetchProjectsFromApi();
  return response?.projects || cachedProjects;
}

// =============================================================================
// Window Title Pattern Matching
// =============================================================================

/**
 * Match a window title against project patterns
 * Returns the best matching project ID or null
 */
function matchWindowTitle(title: string): string | null {
  if (!title || projectPatterns.length === 0) {
    return null;
  }

  // Sort by priority (higher first)
  const sortedPatterns = [...projectPatterns].sort(
    (a, b) => b.priority - a.priority
  );

  for (const pattern of sortedPatterns) {
    try {
      // Try regex match first
      const regex = new RegExp(pattern.pattern, "i");
      if (regex.test(title)) {
        return pattern.projectId;
      }
    } catch {
      // Fall back to simple string includes
      if (title.toLowerCase().includes(pattern.pattern.toLowerCase())) {
        return pattern.projectId;
      }
    }
  }

  return null;
}

/**
 * Auto-detect project from source name/window title
 */
export function autoDetectProject(sourceTitle: string): ProjectSelection {
  const matchedProjectId = matchWindowTitle(sourceTitle);
  
  if (matchedProjectId) {
    const project = cachedProjects.find((p) => p.id === matchedProjectId);
    if (project) {
      logger.debug("Auto-detected project from window title", {
        sourceTitle,
        projectId: project.id,
        projectName: project.name,
      });
      return {
        projectId: project.id,
        projectName: project.name,
      };
    }
  }
  
  return { projectId: null, projectName: null };
}

/**
 * Get the current project selection
 */
export function getCurrentProjectSelection(): ProjectSelection {
  return currentProjectSelection;
}

/**
 * Set the current project selection
 */
export function setCurrentProjectSelection(selection: ProjectSelection): void {
  currentProjectSelection = selection;
  // Persist to store
  projectStore.set("lastUsedProjectId", selection.projectId);
  projectStore.set("lastUsedProjectName", selection.projectName);
}

// =============================================================================
// IPC Handler Registration
// =============================================================================

export function registerProjectHandlers(_context: AppContext): void {
  // List all projects
  ipcMain.handle("projects:list", async () => {
    try {
      const projects = await getProjects();
      return {
        success: true,
        projects,
      };
    } catch (error: any) {
      logger.error("projects:list failed", { error: error.message });
      return {
        success: false,
        projects: [],
        error: error.message,
      };
    }
  });

  // Refresh projects from API
  ipcMain.handle("projects:refresh", async () => {
    try {
      const projects = await getProjects(true);
      return {
        success: true,
        projects,
      };
    } catch (error: any) {
      logger.error("projects:refresh failed", { error: error.message });
      return {
        success: false,
        projects: cachedProjects,
        error: error.message,
      };
    }
  });

  // Get current project selection
  ipcMain.handle("projects:getSelection", () => {
    return currentProjectSelection;
  });

  // Set current project selection
  handleWithValidation(
    "projects:setSelection",
    setProjectSelectionSchema,
    async (_event, data) => {
      currentProjectSelection = {
        projectId: data.projectId,
        projectName: data.projectName,
      };
      
      // Persist to store
      projectStore.set("lastUsedProjectId", data.projectId);
      projectStore.set("lastUsedProjectName", data.projectName);
      
      logger.info("Project selection updated", {
        projectId: data.projectId,
        projectName: data.projectName,
      });
      
      return { success: true };
    }
  );

  // Auto-detect project from source title
  ipcMain.handle("projects:autoDetect", (_event, { sourceTitle }: { sourceTitle: string }) => {
    return autoDetectProject(sourceTitle);
  });

  // Add a pattern for auto-detection
  handleWithValidation(
    "projects:addPattern",
    addProjectPatternSchema,
    async (_event, data) => {
      const existingIndex = projectPatterns.findIndex(
        (p) => p.projectId === data.projectId && p.pattern === data.pattern
      );
      
      if (existingIndex >= 0) {
        projectPatterns[existingIndex].priority = data.priority;
      } else {
        projectPatterns.push({
          projectId: data.projectId,
          pattern: data.pattern,
          priority: data.priority,
        });
      }
      
      // Persist to store
      projectStore.set("windowPatterns", projectPatterns);
      
      logger.info("Project pattern added", {
        projectId: data.projectId,
        pattern: data.pattern,
        priority: data.priority,
      });
      
      return { success: true };
    }
  );

  // Remove a pattern
  handleWithValidation(
    "projects:removePattern",
    removeProjectPatternSchema,
    async (_event, data) => {
      projectPatterns = projectPatterns.filter(
        (p) => !(p.projectId === data.projectId && p.pattern === data.pattern)
      );
      
      // Persist to store
      projectStore.set("windowPatterns", projectPatterns);
      
      logger.info("Project pattern removed", {
        projectId: data.projectId,
        pattern: data.pattern,
      });
      
      return { success: true };
    }
  );

  // Get all patterns
  ipcMain.handle("projects:getPatterns", () => {
    return { patterns: projectPatterns };
  });

  // Clear project cache
  ipcMain.handle("projects:clearCache", () => {
    cachedProjects = [];
    lastProjectFetchTime = 0;
    return { success: true };
  });
}
