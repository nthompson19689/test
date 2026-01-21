"use client";

import React, { useState } from "react";
import { formatDistanceToNow } from "@/lib/utils/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FileText,
  FileJson,
  Image,
  Link,
  FileCode,
} from "lucide-react";
import type { RunStatus, StepStatus } from "@/types";
import { cn } from "@/lib/utils/cn";

interface Artifact {
  id: string;
  name: string;
  type: "text" | "json" | "html" | "image" | "url";
  content: string;
  size: number;
}

interface RunStep {
  id: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: StepStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  error: string | null;
  artifacts: Artifact[];
}

interface RunDetailData {
  id: string;
  workflowId: string;
  workflowName: string;
  status: RunStatus;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  error: string | null;
  steps: RunStep[];
}

interface RunDetailProps {
  run: RunDetailData;
}

const statusConfig: Record<
  StepStatus,
  { icon: React.ElementType; color: string; bgColor: string }
> = {
  queued: { icon: Clock, color: "text-slate-400", bgColor: "bg-slate-700" },
  running: { icon: Loader2, color: "text-blue-400", bgColor: "bg-blue-500/20" },
  succeeded: { icon: CheckCircle, color: "text-green-400", bgColor: "bg-green-500/20" },
  failed: { icon: XCircle, color: "text-red-400", bgColor: "bg-red-500/20" },
  skipped: { icon: AlertCircle, color: "text-amber-400", bgColor: "bg-amber-500/20" },
};

const artifactIcons: Record<string, React.ElementType> = {
  text: FileText,
  json: FileJson,
  html: FileCode,
  image: Image,
  url: Link,
};

export function RunDetail({ run }: RunDetailProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const totalDuration = run.steps.reduce(
    (sum, step) => sum + (step.durationMs || 0),
    0
  );
  const totalTokens = run.steps.reduce(
    (sum, step) => sum + (step.tokensInput || 0) + (step.tokensOutput || 0),
    0
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {run.workflowName}
            </h2>
            <p className="text-sm text-slate-400">
              Started {formatDistanceToNow(new Date(run.createdAt))} ago
            </p>
          </div>
          <Badge
            variant={
              run.status === "completed"
                ? "success"
                : run.status === "failed"
                ? "destructive"
                : run.status === "running"
                ? "default"
                : "secondary"
            }
            className="text-sm"
          >
            {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
          </Badge>
        </div>

        {/* Summary stats */}
        <div className="flex gap-4 mt-4 text-sm">
          <div className="flex items-center gap-2 text-slate-400">
            <Clock className="w-4 h-4" />
            <span>{(totalDuration / 1000).toFixed(1)}s total</span>
          </div>
          {totalTokens > 0 && (
            <div className="text-slate-400">
              {totalTokens.toLocaleString()} tokens
            </div>
          )}
          <div className="text-slate-400">
            {run.steps.filter((s) => s.status === "succeeded").length}/
            {run.steps.length} steps
          </div>
        </div>
      </div>

      {/* Error message */}
      {run.error && (
        <div className="mx-4 mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {run.error}
        </div>
      )}

      {/* Steps timeline */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {run.steps.map((step, index) => {
            const config = statusConfig[step.status];
            const StatusIcon = config.icon;
            const isExpanded = expandedSteps.has(step.id);

            return (
              <Card
                key={step.id}
                className={cn(
                  "border transition-colors",
                  step.status === "running" && "border-blue-500",
                  step.status === "failed" && "border-red-500/50"
                )}
              >
                <CardHeader
                  className="p-3 cursor-pointer"
                  onClick={() => toggleStep(step.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 text-sm font-medium text-slate-300">
                      {index + 1}
                    </div>
                    <div
                      className={cn(
                        "p-1.5 rounded-lg",
                        config.bgColor
                      )}
                    >
                      <StatusIcon
                        className={cn(
                          "w-4 h-4",
                          config.color,
                          step.status === "running" && "animate-spin"
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm font-medium">
                        {step.nodeName}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {step.nodeType}
                        {step.durationMs && ` · ${(step.durationMs / 1000).toFixed(2)}s`}
                      </CardDescription>
                    </div>
                    {step.artifacts.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {step.artifacts.length} outputs
                      </Badge>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0 pb-3 px-3">
                    {/* Error */}
                    {step.error && (
                      <div className="mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-xs font-mono">
                        {step.error}
                      </div>
                    )}

                    {/* Token usage */}
                    {(step.tokensInput || step.tokensOutput) && (
                      <div className="mb-3 text-xs text-slate-400">
                        Tokens: {step.tokensInput?.toLocaleString() || 0} in /{" "}
                        {step.tokensOutput?.toLocaleString() || 0} out
                      </div>
                    )}

                    {/* Artifacts */}
                    {step.artifacts.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          Outputs
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {step.artifacts.map((artifact) => {
                            const Icon =
                              artifactIcons[artifact.type] || FileText;
                            return (
                              <button
                                key={artifact.id}
                                onClick={() => setSelectedArtifact(artifact)}
                                className="flex items-center gap-2 p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors text-left"
                              >
                                <Icon className="w-4 h-4 text-slate-400" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-white truncate">
                                    {artifact.name}
                                  </div>
                                  <div className="text-xs text-slate-400">
                                    {artifact.type} ·{" "}
                                    {formatSize(artifact.size)}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      {/* Artifact viewer dialog */}
      <Dialog
        open={selectedArtifact !== null}
        onOpenChange={(open) => !open && setSelectedArtifact(null)}
      >
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{selectedArtifact?.name}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {selectedArtifact && (
              <ArtifactViewer artifact={selectedArtifact} />
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Artifact viewer component
function ArtifactViewer({ artifact }: { artifact: Artifact }) {
  if (artifact.type === "image") {
    return (
      <img
        src={artifact.content}
        alt={artifact.name}
        className="max-w-full rounded-lg"
      />
    );
  }

  if (artifact.type === "json") {
    try {
      const formatted = JSON.stringify(JSON.parse(artifact.content), null, 2);
      return (
        <pre className="p-4 bg-slate-900 rounded-lg text-sm font-mono text-slate-300 overflow-x-auto">
          {formatted}
        </pre>
      );
    } catch {
      return (
        <pre className="p-4 bg-slate-900 rounded-lg text-sm font-mono text-slate-300 overflow-x-auto">
          {artifact.content}
        </pre>
      );
    }
  }

  if (artifact.type === "html") {
    return (
      <div>
        <div className="mb-2 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const blob = new Blob([artifact.content], { type: "text/html" });
              const url = URL.createObjectURL(blob);
              window.open(url, "_blank");
            }}
          >
            Preview HTML
          </Button>
        </div>
        <pre className="p-4 bg-slate-900 rounded-lg text-sm font-mono text-slate-300 overflow-x-auto max-h-[400px]">
          {artifact.content.slice(0, 5000)}
          {artifact.content.length > 5000 && "\n\n... (truncated)"}
        </pre>
      </div>
    );
  }

  if (artifact.type === "url") {
    return (
      <a
        href={artifact.content}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 hover:underline break-all"
      >
        {artifact.content}
      </a>
    );
  }

  // Default: text
  return (
    <pre className="p-4 bg-slate-900 rounded-lg text-sm font-mono text-slate-300 whitespace-pre-wrap">
      {artifact.content}
    </pre>
  );
}

// Format bytes to human readable
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
