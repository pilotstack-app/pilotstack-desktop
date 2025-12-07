/**
 * Project Selector Component
 *
 * Phase 5: Desktop App Integration
 * 
 * Allows users to select a project for their recording.
 * Features:
 * - Dropdown to select from available projects
 * - Auto-detect suggestion based on window title
 * - Remember last used project
 * - Create new project link
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderOpen,
  ChevronDown,
  Check,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import type { Project, ProjectSelection } from "../types/electron";

interface ProjectSelectorProps {
  selectedSource: { id: string; name: string } | null;
  onProjectChange?: (selection: ProjectSelection) => void;
  compact?: boolean;
}

export function ProjectSelector({
  selectedSource,
  onProjectChange,
  compact = false,
}: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [currentSelection, setCurrentSelection] = useState<ProjectSelection>({
    projectId: null,
    projectName: null,
  });
  const [suggestedProject, setSuggestedProject] = useState<ProjectSelection | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load projects and current selection on mount
  useEffect(() => {
    loadProjects();
    loadCurrentSelection();
  }, []);

  // Auto-detect project when source changes
  useEffect(() => {
    if (selectedSource?.name) {
      autoDetectProject(selectedSource.name);
    }
  }, [selectedSource?.name]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const result = await window.pilotstack.getProjects();
      if (result.success) {
        setProjects(result.projects.filter((p) => !p.isArchived));
      }
    } catch (error) {
      console.error("Failed to load projects:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCurrentSelection = async () => {
    try {
      const selection = await window.pilotstack.getProjectSelection();
      setCurrentSelection(selection);
    } catch (error) {
      console.error("Failed to load project selection:", error);
    }
  };

  const autoDetectProject = async (sourceTitle: string) => {
    try {
      const detected = await window.pilotstack.autoDetectProject(sourceTitle);
      if (detected.projectId && detected.projectId !== currentSelection.projectId) {
        setSuggestedProject(detected);
      } else {
        setSuggestedProject(null);
      }
    } catch (error) {
      console.error("Failed to auto-detect project:", error);
    }
  };

  const handleSelectProject = async (project: Project | null) => {
    const selection: ProjectSelection = project
      ? { projectId: project.id, projectName: project.name }
      : { projectId: null, projectName: null };

    setCurrentSelection(selection);
    setSuggestedProject(null);
    setIsOpen(false);

    try {
      await window.pilotstack.setProjectSelection(selection);
      onProjectChange?.(selection);
    } catch (error) {
      console.error("Failed to save project selection:", error);
    }
  };

  const handleAcceptSuggestion = async () => {
    if (suggestedProject) {
      setCurrentSelection(suggestedProject);
      setSuggestedProject(null);
      try {
        await window.pilotstack.setProjectSelection(suggestedProject);
        onProjectChange?.(suggestedProject);
      } catch (error) {
        console.error("Failed to save project selection:", error);
      }
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      const result = await window.pilotstack.refreshProjects();
      if (result.success) {
        setProjects(result.projects.filter((p) => !p.isArchived));
      }
    } catch (error) {
      console.error("Failed to refresh projects:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedProject = projects.find((p) => p.id === currentSelection.projectId);

  // Render project icon/emoji
  const renderProjectIcon = (project: Project) => {
    if (project.icon) {
      return <span className="text-base">{project.icon}</span>;
    }
    return (
      <div
        className="w-4 h-4 rounded-sm"
        style={{ backgroundColor: project.color || "#6366f1" }}
      />
    );
  };

  if (compact) {
    // Compact inline version for the recording view
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-chrono-card/50 border border-chrono-border/30 hover:bg-chrono-card/70 transition-colors text-sm"
        >
          {selectedProject ? (
            <>
              {renderProjectIcon(selectedProject)}
              <span className="text-chrono-text truncate max-w-[120px]">
                {selectedProject.name}
              </span>
            </>
          ) : (
            <>
              <FolderOpen className="w-4 h-4 text-chrono-muted" />
              <span className="text-chrono-muted">No Project</span>
            </>
          )}
          <ChevronDown
            className={`w-4 h-4 text-chrono-muted transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute top-full mt-1 left-0 w-56 bg-chrono-card border border-chrono-border rounded-lg shadow-xl z-50 overflow-hidden"
            >
              <div className="max-h-64 overflow-y-auto">
                {/* No project option */}
                <button
                  onClick={() => handleSelectProject(null)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-chrono-hover transition-colors ${
                    !currentSelection.projectId ? "bg-chrono-hover" : ""
                  }`}
                >
                  <FolderOpen className="w-4 h-4 text-chrono-muted" />
                  <span className="text-chrono-muted">No Project</span>
                  {!currentSelection.projectId && (
                    <Check className="w-4 h-4 text-chrono-accent ml-auto" />
                  )}
                </button>

                {/* Project list */}
                {projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => handleSelectProject(project)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-chrono-hover transition-colors ${
                      currentSelection.projectId === project.id ? "bg-chrono-hover" : ""
                    }`}
                  >
                    {renderProjectIcon(project)}
                    <span className="text-chrono-text truncate">{project.name}</span>
                    {currentSelection.projectId === project.id && (
                      <Check className="w-4 h-4 text-chrono-accent ml-auto flex-shrink-0" />
                    )}
                  </button>
                ))}

                {projects.length === 0 && !isLoading && (
                  <div className="px-3 py-4 text-center text-chrono-muted text-sm">
                    No projects yet
                  </div>
                )}

                {isLoading && (
                  <div className="px-3 py-4 flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-chrono-muted" />
                  </div>
                )}
              </div>

              {/* Refresh button */}
              <div className="border-t border-chrono-border/30 p-2">
                <button
                  onClick={handleRefresh}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs text-chrono-muted hover:text-chrono-text transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Full version with suggestion banner
  return (
    <div className="space-y-3">
      {/* Auto-detect suggestion banner */}
      <AnimatePresence>
        {suggestedProject && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-chrono-accent/10 border border-chrono-accent/30">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-chrono-accent" />
                <span className="text-sm text-chrono-text">
                  Assign to <strong>{suggestedProject.projectName}</strong>?
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAcceptSuggestion}
                  className="px-2 py-1 text-xs font-medium bg-chrono-accent text-white rounded hover:bg-chrono-accent/90 transition-colors"
                >
                  Yes
                </button>
                <button
                  onClick={() => setSuggestedProject(null)}
                  className="p-1 text-chrono-muted hover:text-chrono-text transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main selector */}
      <div className="relative" ref={dropdownRef}>
        <label className="block text-xs font-medium text-chrono-muted mb-1.5">
          Project
        </label>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-lg bg-chrono-card/50 border border-chrono-border/30 hover:bg-chrono-card/70 transition-colors"
        >
          <div className="flex items-center gap-3">
            {selectedProject ? (
              <>
                {renderProjectIcon(selectedProject)}
                <span className="text-chrono-text">{selectedProject.name}</span>
              </>
            ) : (
              <>
                <FolderOpen className="w-5 h-5 text-chrono-muted" />
                <span className="text-chrono-muted">Select a project (optional)</span>
              </>
            )}
          </div>
          <ChevronDown
            className={`w-5 h-5 text-chrono-muted transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute top-full mt-2 left-0 right-0 bg-chrono-card border border-chrono-border rounded-lg shadow-xl z-50 overflow-hidden"
            >
              <div className="max-h-72 overflow-y-auto">
                {/* No project option */}
                <button
                  onClick={() => handleSelectProject(null)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-chrono-hover transition-colors ${
                    !currentSelection.projectId ? "bg-chrono-hover" : ""
                  }`}
                >
                  <FolderOpen className="w-5 h-5 text-chrono-muted" />
                  <span className="text-chrono-muted">No Project</span>
                  {!currentSelection.projectId && (
                    <Check className="w-5 h-5 text-chrono-accent ml-auto" />
                  )}
                </button>

                <div className="border-t border-chrono-border/30" />

                {/* Project list */}
                {projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => handleSelectProject(project)}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-chrono-hover transition-colors ${
                      currentSelection.projectId === project.id ? "bg-chrono-hover" : ""
                    }`}
                  >
                    {renderProjectIcon(project)}
                    <div className="flex-1 text-left">
                      <div className="text-chrono-text">{project.name}</div>
                      {project.description && (
                        <div className="text-xs text-chrono-muted truncate">
                          {project.description}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-chrono-muted">
                      {project.totalRecordings} rec
                    </div>
                    {currentSelection.projectId === project.id && (
                      <Check className="w-5 h-5 text-chrono-accent flex-shrink-0" />
                    )}
                  </button>
                ))}

                {projects.length === 0 && !isLoading && (
                  <div className="px-4 py-6 text-center">
                    <FolderOpen className="w-8 h-8 mx-auto mb-2 text-chrono-muted/50" />
                    <div className="text-chrono-muted text-sm">No projects yet</div>
                    <div className="text-chrono-muted/60 text-xs mt-1">
                      Create projects on pilotstack.app
                    </div>
                  </div>
                )}

                {isLoading && (
                  <div className="px-4 py-6 flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-chrono-muted" />
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-chrono-border/30 p-2 flex justify-between items-center">
                <button
                  onClick={handleRefresh}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-chrono-muted hover:text-chrono-text transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
                <span className="text-xs text-chrono-muted/50">
                  {projects.length} projects
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
