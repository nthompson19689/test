"use client";

import React from "react";
import { formatDistanceToNow } from "@/lib/utils/date";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { RunStatus } from "@/types";
import { cn } from "@/lib/utils/cn";

interface Run {
  id: string;
  workflowId: string;
  workflowName: string;
  status: RunStatus;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  stepCount: number;
  completedSteps: number;
}

interface RunsListProps {
  runs: Run[];
  selectedRunId?: string;
  onSelectRun: (runId: string) => void;
}

const statusConfig: Record<
  RunStatus,
  { icon: React.ElementType; color: string; label: string }
> = {
  pending: { icon: Clock, color: "text-slate-400", label: "Pending" },
  running: { icon: Loader2, color: "text-blue-400", label: "Running" },
  completed: { icon: CheckCircle, color: "text-green-400", label: "Completed" },
  failed: { icon: XCircle, color: "text-red-400", label: "Failed" },
  cancelled: { icon: AlertCircle, color: "text-amber-400", label: "Cancelled" },
};

export function RunsList({ runs, selectedRunId, onSelectRun }: RunsListProps) {
  if (runs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        <div className="text-center">
          <p className="text-lg">No runs yet</p>
          <p className="text-sm mt-1">Run a workflow to see results here</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-2">
        {runs.map((run) => {
          const config = statusConfig[run.status];
          const StatusIcon = config.icon;
          const isSelected = run.id === selectedRunId;

          return (
            <button
              key={run.id}
              onClick={() => onSelectRun(run.id)}
              className={cn(
                "w-full text-left p-4 rounded-lg border transition-colors",
                isSelected
                  ? "bg-slate-800 border-blue-500"
                  : "bg-slate-900 border-slate-700 hover:border-slate-600"
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusIcon
                      className={cn(
                        "w-4 h-4",
                        config.color,
                        run.status === "running" && "animate-spin"
                      )}
                    />
                    <span className="font-medium text-white truncate">
                      {run.workflowName}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {formatDistanceToNow(new Date(run.createdAt))} ago
                  </div>
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
                >
                  {config.label}
                </Badge>
              </div>

              {/* Progress bar */}
              {run.status === "running" && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Progress</span>
                    <span>
                      {run.completedSteps}/{run.stepCount} steps
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all"
                      style={{
                        width: `${(run.completedSteps / run.stepCount) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
