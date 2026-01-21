"use client";

import React from "react";
import {
  Globe,
  Search,
  BarChart3,
  FileText,
  Image,
} from "lucide-react";
import type { NodeType } from "@/types";
import { cn } from "@/lib/utils/cn";

interface NodeLibraryProps {
  onAddNode: (nodeType: NodeType) => void;
}

interface NodeItem {
  type: NodeType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const nodeItems: NodeItem[] = [
  {
    type: "SCRAPE_URL",
    label: "Scrape URL",
    description: "Fetch and extract content from a webpage",
    icon: Globe,
    color: "bg-blue-600 hover:bg-blue-500",
  },
  {
    type: "RESEARCH",
    label: "Research",
    description: "AI-powered research with citations",
    icon: Search,
    color: "bg-purple-600 hover:bg-purple-500",
  },
  {
    type: "ANALYZE",
    label: "Analyze",
    description: "Structured analysis with JSON output",
    icon: BarChart3,
    color: "bg-amber-600 hover:bg-amber-500",
  },
  {
    type: "GENERATE_TEXT",
    label: "Generate Text",
    description: "Generate text content with AI",
    icon: FileText,
    color: "bg-green-600 hover:bg-green-500",
  },
  {
    type: "GENERATE_IMAGE",
    label: "Generate Image",
    description: "Create images with DALL-E",
    icon: Image,
    color: "bg-pink-600 hover:bg-pink-500",
  },
];

export function NodeLibrary({ onAddNode }: NodeLibraryProps) {
  return (
    <div className="w-64 bg-slate-900 border-r border-slate-700 p-4 overflow-y-auto">
      <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">
        Node Library
      </h3>
      <div className="space-y-2">
        {nodeItems.map((item) => (
          <button
            key={item.type}
            onClick={() => onAddNode(item.type)}
            className={cn(
              "w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors",
              "bg-slate-800 hover:bg-slate-700 border border-slate-700"
            )}
          >
            <div className={cn("p-2 rounded-lg", item.color)}>
              <item.icon className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white">{item.label}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {item.description}
              </div>
            </div>
          </button>
        ))}
      </div>
      <div className="mt-6 pt-4 border-t border-slate-700">
        <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
          Instructions
        </h4>
        <ul className="text-xs text-slate-500 space-y-1">
          <li>Click a node to add it to the canvas</li>
          <li>Drag between nodes to connect them</li>
          <li>Click a node to configure it</li>
          <li>Use #NodeName.field to reference outputs</li>
        </ul>
      </div>
    </div>
  );
}
