"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { WorkflowCanvas, WorkflowNodeData } from "@/components/workflow/WorkflowCanvas";
import { RunsList } from "@/components/runs/RunsList";
import { RunDetail } from "@/components/runs/RunDetail";
import {
  MessageSquare,
  GitBranch,
  Play,
  Settings,
  Key,
  Plus,
  Trash2,
} from "lucide-react";
import { Node, Edge } from "reactflow";
import type { Provider } from "@/types";

interface ApiKey {
  id: string;
  provider: string;
  name: string;
  keyLastFour: string;
  isValid: boolean;
  createdAt: string;
}

interface Run {
  id: string;
  workflowId: string;
  workflowName: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  stepCount: number;
  completedSteps: number;
}

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  nodes: Array<{
    id: string;
    name: string;
    nodeType: string;
    config: Record<string, unknown>;
    positionX: number;
    positionY: number;
  }>;
  edges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
  }>;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState("chat");
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<unknown>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddKey, setShowAddKey] = useState(false);
  const [newKeyData, setNewKeyData] = useState({
    provider: "openai" as Provider,
    name: "",
    apiKey: "",
  });
  const [isAddingKey, setIsAddingKey] = useState(false);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState("New Workflow");

  // Load API keys
  const loadApiKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/keys");
      const data = await res.json();
      if (data.success) {
        setApiKeys(data.data);
      }
    } catch (error) {
      console.error("Failed to load API keys:", error);
    }
  }, []);

  // Load runs
  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/runs");
      const data = await res.json();
      if (data.success) {
        setRuns(data.data);
      }
    } catch (error) {
      console.error("Failed to load runs:", error);
    }
  }, []);

  // Load run detail
  const loadRunDetail = useCallback(async (runId: string) => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      const data = await res.json();
      if (data.success) {
        setRunDetail(data.data);
      }
    } catch (error) {
      console.error("Failed to load run detail:", error);
    }
  }, []);

  // Load workflows
  const loadWorkflows = useCallback(async () => {
    try {
      const res = await fetch("/api/workflows");
      const data = await res.json();
      if (data.success) {
        setWorkflows(data.data);
      }
    } catch (error) {
      console.error("Failed to load workflows:", error);
    }
  }, []);

  // Load workflow detail
  const loadWorkflowDetail = useCallback(async (workflowId: string) => {
    try {
      const res = await fetch(`/api/workflows/${workflowId}`);
      const data = await res.json();
      if (data.success) {
        return data.data;
      }
    } catch (error) {
      console.error("Failed to load workflow:", error);
    }
    return null;
  }, []);

  // Initial load
  useEffect(() => {
    loadApiKeys();
    loadRuns();
    loadWorkflows();
  }, [loadApiKeys, loadRuns, loadWorkflows]);

  // Poll for run updates
  useEffect(() => {
    if (activeTab === "runs") {
      const interval = setInterval(loadRuns, 3000);
      return () => clearInterval(interval);
    }
  }, [activeTab, loadRuns]);

  // Load run detail when selected
  useEffect(() => {
    if (selectedRunId) {
      loadRunDetail(selectedRunId);
      const interval = setInterval(() => loadRunDetail(selectedRunId), 2000);
      return () => clearInterval(interval);
    }
  }, [selectedRunId, loadRunDetail]);

  // Add API key
  const handleAddKey = async () => {
    console.log("handleAddKey called with:", { provider: newKeyData.provider, name: newKeyData.name, keyLength: newKeyData.apiKey.length });

    if (isAddingKey) {
      console.log("Already adding key, ignoring duplicate call");
      return;
    }

    if (!newKeyData.name || !newKeyData.apiKey) {
      alert("Please fill in all fields");
      return;
    }
    if (newKeyData.apiKey.length < 10) {
      alert("API key seems too short. Please check and try again.");
      return;
    }

    console.log("Validation passed, making fetch request...");
    setIsAddingKey(true);

    try {
      const requestBody = JSON.stringify({
        provider: newKeyData.provider,
        name: newKeyData.name,
        apiKey: newKeyData.apiKey,
      });
      console.log("Request body:", requestBody);

      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });

      console.log("Fetch completed, status:", res.status, "ok:", res.ok);

      // Read response as text first, then parse
      const responseText = await res.text();
      console.log("Response text:", responseText);

      let data;
      try {
        data = JSON.parse(responseText);
        console.log("Parsed data:", data);
      } catch (parseError) {
        console.error("Invalid JSON response:", responseText, parseError);
        alert("Failed to add API key: Server returned invalid response");
        setIsAddingKey(false);
        return;
      }

      if (data.success) {
        console.log("Success! Closing dialog and reloading keys...");
        setShowAddKey(false);
        setNewKeyData({ provider: "openai", name: "", apiKey: "" });
        await loadApiKeys();
        setTimeout(() => setShowSettings(true), 100);
      } else {
        console.log("API returned error:", data.error);
        alert(data.error?.message || "API returned an error");
      }
    } catch (error) {
      console.error("Fetch error:", error);
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      alert(`Network error: ${errorMsg}`);
    } finally {
      setIsAddingKey(false);
    }
  };

  // Delete API key
  const handleDeleteKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to delete this API key?")) return;
    try {
      const res = await fetch(`/api/keys/${keyId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        loadApiKeys();
      }
    } catch (error) {
      console.error("Failed to delete API key:", error);
    }
  };

  // Save workflow
  const handleSaveWorkflow = async (
    nodes: Node<WorkflowNodeData>[],
    edges: Edge[]
  ) => {
    try {
      const payload = {
        name: workflowName,
        nodes: nodes.map((n) => ({
          id: n.id,
          name: n.data.name,
          nodeType: n.data.nodeType,
          config: n.data.config,
          positionX: n.position.x,
          positionY: n.position.y,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          sourceNodeId: e.source,
          targetNodeId: e.target,
          sourceHandle: e.sourceHandle || undefined,
          targetHandle: e.targetHandle || undefined,
        })),
      };

      const url = selectedWorkflowId
        ? `/api/workflows/${selectedWorkflowId}`
        : "/api/workflows";
      const method = selectedWorkflowId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        if (!selectedWorkflowId) {
          setSelectedWorkflowId(data.data.id);
        }
        loadWorkflows();
        alert("Workflow saved!");
      } else {
        alert(data.error?.message || "Failed to save workflow");
      }
    } catch (error) {
      console.error("Failed to save workflow:", error);
      alert("Failed to save workflow");
    }
  };

  // Run workflow
  const handleRunWorkflow = async (
    nodes: Node<WorkflowNodeData>[],
    edges: Edge[]
  ) => {
    // First save if not saved
    if (!selectedWorkflowId) {
      await handleSaveWorkflow(nodes, edges);
    }

    if (!selectedWorkflowId) {
      alert("Please save the workflow first");
      return;
    }

    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId: selectedWorkflowId }),
      });

      const data = await res.json();
      if (data.success) {
        setActiveTab("runs");
        setSelectedRunId(data.data.runId);
        loadRuns();
      } else {
        alert(data.error?.message || "Failed to start run");
      }
    } catch (error) {
      console.error("Failed to start run:", error);
      alert("Failed to start run");
    }
  };

  // Get current workflow data
  const getCurrentWorkflowNodes = (): Node<WorkflowNodeData>[] => {
    const workflow = workflows.find((w) => w.id === selectedWorkflowId);
    if (!workflow) return [];
    return workflow.nodes.map((n) => ({
      id: n.id,
      type: "workflowNode",
      position: { x: n.positionX, y: n.positionY },
      data: {
        id: n.id,
        name: n.name,
        nodeType: n.nodeType as WorkflowNodeData["nodeType"],
        config: n.config,
      },
    }));
  };

  const getCurrentWorkflowEdges = (): Edge[] => {
    const workflow = workflows.find((w) => w.id === selectedWorkflowId);
    if (!workflow) return [];
    return workflow.edges.map((e) => ({
      id: e.id,
      source: e.sourceNodeId,
      target: e.targetNodeId,
      animated: true,
    }));
  };

  // Debug function to test API directly
  const testApiDirectly = async () => {
    console.log("Testing API directly...");
    try {
      const testData = {
        provider: "openai",
        name: "Direct Test " + Date.now(),
        apiKey: "sk-test-direct-api-call-12345678901234567890"
      };
      console.log("Sending:", testData);

      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testData),
      });

      console.log("Response status:", res.status);
      const text = await res.text();
      console.log("Response body:", text);

      const data = JSON.parse(text);
      if (data.success) {
        alert("SUCCESS! API key created: " + data.data.id);
        loadApiKeys();
      } else {
        alert("API Error: " + (data.error?.message || JSON.stringify(data.error)));
      }
    } catch (err) {
      console.error("Direct test error:", err);
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-white">
      {/* Header */}
      <header className="h-14 border-b border-slate-800 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <GitBranch className="w-6 h-6 text-blue-400" />
          <span className="font-semibold text-lg">Multi-Model Workflow</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={testApiDirectly}
            className="text-green-400 border-green-400 hover:bg-green-400/10"
          >
            Test API
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(true)}
          >
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="mx-4 mt-4 self-start">
            <TabsTrigger value="chat" className="gap-2">
              <MessageSquare className="w-4 h-4" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="workflows" className="gap-2">
              <GitBranch className="w-4 h-4" />
              Workflows
            </TabsTrigger>
            <TabsTrigger value="runs" className="gap-2">
              <Play className="w-4 h-4" />
              Runs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="flex-1 overflow-hidden m-0 mt-2">
            <ChatInterface apiKeys={apiKeys} />
          </TabsContent>

          <TabsContent value="workflows" className="flex-1 overflow-hidden m-0 mt-2">
            <div className="h-full flex flex-col">
              {/* Workflow selector */}
              <div className="px-4 pb-2 flex items-center gap-4">
                <Select
                  value={selectedWorkflowId || "new"}
                  onValueChange={(v) => {
                    if (v === "new") {
                      setSelectedWorkflowId(null);
                      setWorkflowName("New Workflow");
                    } else {
                      setSelectedWorkflowId(v);
                      const wf = workflows.find((w) => w.id === v);
                      if (wf) setWorkflowName(wf.name);
                    }
                  }}
                >
                  <SelectTrigger className="w-64 bg-slate-800 border-slate-700">
                    <SelectValue placeholder="Select workflow" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">+ New Workflow</SelectItem>
                    {workflows.map((wf) => (
                      <SelectItem key={wf.id} value={wf.id}>
                        {wf.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  placeholder="Workflow name"
                  className="w-64 bg-slate-800 border-slate-700"
                />
              </div>
              <div className="flex-1">
                <WorkflowCanvas
                  workflowId={selectedWorkflowId || undefined}
                  initialNodes={getCurrentWorkflowNodes()}
                  initialEdges={getCurrentWorkflowEdges()}
                  onSave={handleSaveWorkflow}
                  onRun={handleRunWorkflow}
                  apiKeys={apiKeys}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="runs" className="flex-1 overflow-hidden m-0 mt-2">
            <div className="h-full flex">
              <div className="w-80 border-r border-slate-800">
                <RunsList
                  runs={runs}
                  selectedRunId={selectedRunId || undefined}
                  onSelectRun={setSelectedRunId}
                />
              </div>
              <div className="flex-1">
                {runDetail ? (
                  <RunDetail run={runDetail as any} />
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-500">
                    Select a run to view details
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              API Keys
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-400">
                Manage your API keys for different providers
              </p>
              <Button size="sm" onClick={() => {
                setShowSettings(false);
                setTimeout(() => setShowAddKey(true), 100);
              }}>
                <Plus className="w-4 h-4 mr-1" />
                Add Key
              </Button>
            </div>

            {apiKeys.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No API keys configured. Add one to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex items-center justify-between p-3 bg-slate-800 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center text-xs font-semibold uppercase">
                        {key.provider.slice(0, 2)}
                      </div>
                      <div>
                        <div className="font-medium">{key.name}</div>
                        <div className="text-sm text-slate-400">
                          {key.provider} · ****{key.keyLastFour}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteKey(key.id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Key Dialog */}
      <Dialog open={showAddKey} onOpenChange={(open) => {
        setShowAddKey(open);
        if (!open) {
          // Reset form when closing
          setNewKeyData({ provider: "openai", name: "", apiKey: "" });
          setIsAddingKey(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add API Key</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Provider</Label>
              <Select
                value={newKeyData.provider}
                onValueChange={(v) =>
                  setNewKeyData({ ...newKeyData, provider: v as Provider })
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Select a provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="perplexity">Perplexity</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Name</Label>
              <Input
                value={newKeyData.name}
                onChange={(e) =>
                  setNewKeyData({ ...newKeyData, name: e.target.value })
                }
                placeholder="My API Key"
                className="mt-1.5"
              />
              <p className="text-xs text-slate-400 mt-1">A friendly name to identify this key</p>
            </div>

            <div>
              <Label>API Key</Label>
              <Input
                type="password"
                value={newKeyData.apiKey}
                onChange={(e) =>
                  setNewKeyData({ ...newKeyData, apiKey: e.target.value })
                }
                placeholder="sk-..."
                className="mt-1.5"
              />
              <p className="text-xs text-slate-400 mt-1">Your API key will be encrypted before storage</p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowAddKey(false)} disabled={isAddingKey}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAddKey}
              disabled={isAddingKey || !newKeyData.name || !newKeyData.apiKey || newKeyData.apiKey.length < 10}
            >
              {isAddingKey ? "Adding..." : "Add Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
