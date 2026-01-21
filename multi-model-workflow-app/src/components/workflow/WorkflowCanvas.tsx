"use client";

import React, { useCallback, useState } from "react";
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  NodeTypes,
  Panel,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";

import { WorkflowNode } from "./WorkflowNode";
import { NodeLibrary } from "./NodeLibrary";
import { NodeConfigPanel } from "./NodeConfigPanel";
import { Button } from "@/components/ui/button";
import { Play, Save } from "lucide-react";
import type { NodeType } from "@/types";

// Custom node types
const nodeTypes: NodeTypes = {
  workflowNode: WorkflowNode,
};

export interface WorkflowNodeData {
  id: string;
  name: string;
  nodeType: NodeType;
  config: Record<string, unknown>;
}

interface WorkflowCanvasProps {
  workflowId?: string;
  initialNodes?: Node<WorkflowNodeData>[];
  initialEdges?: Edge[];
  onSave?: (nodes: Node<WorkflowNodeData>[], edges: Edge[]) => void;
  onRun?: (nodes: Node<WorkflowNodeData>[], edges: Edge[]) => void;
  apiKeys?: Array<{ id: string; provider: string; name: string; keyLastFour: string }>;
}

export function WorkflowCanvas({
  workflowId,
  initialNodes = [],
  initialEdges = [],
  onSave,
  onRun,
  apiKeys = [],
}: WorkflowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Get selected node
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  // Handle new connections
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, animated: true }, eds));
    },
    [setEdges]
  );

  // Handle node selection
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  // Handle pane click (deselect)
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Add new node
  const onAddNode = useCallback(
    (nodeType: NodeType) => {
      const id = `node_${Date.now()}`;
      const name = `${nodeType.toLowerCase()}_${nodes.length + 1}`;

      const newNode: Node<WorkflowNodeData> = {
        id,
        type: "workflowNode",
        position: {
          x: 250 + Math.random() * 100,
          y: 100 + nodes.length * 120,
        },
        data: {
          id,
          name,
          nodeType,
          config: getDefaultConfig(nodeType),
        },
      };

      setNodes((nds) => [...nds, newNode]);
      setSelectedNodeId(id);
    },
    [nodes, setNodes]
  );

  // Update node config
  const onUpdateNodeConfig = useCallback(
    (nodeId: string, config: Record<string, unknown>, name?: string) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                config,
                name: name ?? node.data.name,
              },
            };
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  // Delete node
  const onDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
      );
      setSelectedNodeId(null);
    },
    [setNodes, setEdges]
  );

  // Get available nodes for variable references (nodes that come before the selected node)
  const getAvailableNodes = useCallback(() => {
    if (!selectedNodeId) return [];

    // Build dependency graph
    const dependsOn = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (!dependsOn.has(edge.target)) {
        dependsOn.set(edge.target, new Set());
      }
      dependsOn.get(edge.target)!.add(edge.source);
    }

    // Find all nodes that the selected node depends on (directly or indirectly)
    const ancestors = new Set<string>();
    const queue = [selectedNodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const dep of dependsOn.get(current) || []) {
        if (!ancestors.has(dep)) {
          ancestors.add(dep);
          queue.push(dep);
        }
      }
    }

    return nodes
      .filter((n) => ancestors.has(n.id))
      .map((n) => ({
        id: n.id,
        name: n.data.name,
        nodeType: n.data.nodeType,
      }));
  }, [nodes, edges, selectedNodeId]);

  return (
    <div className="flex h-full">
      {/* Node Library */}
      <NodeLibrary onAddNode={onAddNode} />

      {/* Canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          className="bg-slate-950"
        >
          <Controls className="bg-slate-800 border-slate-700" />
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#334155"
          />
          <Panel position="top-right" className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSave?.(nodes, edges)}
              className="bg-slate-800 border-slate-700 hover:bg-slate-700"
            >
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
            <Button
              size="sm"
              onClick={() => onRun?.(nodes, edges)}
              className="bg-green-600 hover:bg-green-700"
            >
              <Play className="w-4 h-4 mr-2" />
              Run
            </Button>
          </Panel>
        </ReactFlow>
      </div>

      {/* Config Panel */}
      {selectedNode && (
        <NodeConfigPanel
          node={selectedNode.data}
          availableNodes={getAvailableNodes()}
          apiKeys={apiKeys}
          onUpdateConfig={(config, name) =>
            onUpdateNodeConfig(selectedNode.id, config, name)
          }
          onDelete={() => onDeleteNode(selectedNode.id)}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}

// Default config for each node type
function getDefaultConfig(nodeType: NodeType): Record<string, unknown> {
  switch (nodeType) {
    case "SCRAPE_URL":
      return { url: "" };
    case "RESEARCH":
      return { prompt: "", provider: "openai", model: "gpt-4o", apiKeyId: "" };
    case "ANALYZE":
      return {
        prompt: "",
        provider: "openai",
        model: "gpt-4o",
        apiKeyId: "",
        outputSchema: "",
      };
    case "GENERATE_TEXT":
      return {
        prompt: "",
        provider: "openai",
        model: "gpt-4o",
        apiKeyId: "",
        temperature: 0.7,
      };
    case "GENERATE_IMAGE":
      return {
        prompt: "",
        provider: "openai",
        apiKeyId: "",
        size: "1024x1024",
      };
    default:
      return {};
  }
}
