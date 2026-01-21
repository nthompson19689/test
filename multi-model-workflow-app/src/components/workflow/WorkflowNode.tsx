"use client";

import React, { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import {
  Globe,
  Search,
  BarChart3,
  FileText,
  Image,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import type { NodeType } from "@/types";
import type { WorkflowNodeData } from "./WorkflowCanvas";
import { cn } from "@/lib/utils/cn";

interface NodeStatusProps {
  status?: "queued" | "running" | "succeeded" | "failed" | "skipped";
}

const nodeIcons: Record<NodeType, React.ComponentType<{ className?: string }>> = {
  SCRAPE_URL: Globe,
  RESEARCH: Search,
  ANALYZE: BarChart3,
  GENERATE_TEXT: FileText,
  GENERATE_IMAGE: Image,
};

const nodeColors: Record<NodeType, string> = {
  SCRAPE_URL: "bg-blue-600 border-blue-500",
  RESEARCH: "bg-purple-600 border-purple-500",
  ANALYZE: "bg-amber-600 border-amber-500",
  GENERATE_TEXT: "bg-green-600 border-green-500",
  GENERATE_IMAGE: "bg-pink-600 border-pink-500",
};

const nodeLabels: Record<NodeType, string> = {
  SCRAPE_URL: "Scrape URL",
  RESEARCH: "Research",
  ANALYZE: "Analyze",
  GENERATE_TEXT: "Generate Text",
  GENERATE_IMAGE: "Generate Image",
};

function NodeStatus({ status }: NodeStatusProps) {
  if (!status) return null;

  switch (status) {
    case "running":
      return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
    case "succeeded":
      return <CheckCircle className="w-4 h-4 text-green-400" />;
    case "failed":
      return <XCircle className="w-4 h-4 text-red-400" />;
    case "skipped":
      return <div className="w-4 h-4 rounded-full bg-gray-500" />;
    default:
      return <div className="w-4 h-4 rounded-full bg-gray-700" />;
  }
}

export const WorkflowNode = memo(function WorkflowNode({
  data,
  selected,
}: NodeProps<WorkflowNodeData & { status?: NodeStatusProps["status"] }>) {
  const Icon = nodeIcons[data.nodeType];
  const colorClass = nodeColors[data.nodeType];
  const label = nodeLabels[data.nodeType];

  return (
    <div
      className={cn(
        "px-4 py-3 rounded-lg border-2 shadow-lg min-w-[180px]",
        colorClass,
        selected && "ring-2 ring-white ring-offset-2 ring-offset-slate-950"
      )}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-white border-2 border-slate-800"
      />

      {/* Node Content */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-white/20 rounded-lg">
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="text-xs text-white/70 font-medium">{label}</div>
          <div className="text-sm text-white font-semibold truncate max-w-[120px]">
            {data.name}
          </div>
        </div>
        <NodeStatus status={data.status} />
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-white border-2 border-slate-800"
      />
    </div>
  );
});
