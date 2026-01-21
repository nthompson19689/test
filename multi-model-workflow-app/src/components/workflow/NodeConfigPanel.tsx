"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NodeType, Provider, AutocompleteOption } from "@/types";
import { PROVIDER_MODELS } from "@/types";
import { generateAutocompleteOptions, getNodeOutputFields } from "@/lib/workflow/variable-reference";
import { cn } from "@/lib/utils/cn";

interface NodeConfigPanelProps {
  node: {
    id: string;
    name: string;
    nodeType: NodeType;
    config: Record<string, unknown>;
  };
  availableNodes: Array<{ id: string; name: string; nodeType: NodeType }>;
  apiKeys: Array<{ id: string; provider: string; name: string; keyLastFour: string }>;
  onUpdateConfig: (config: Record<string, unknown>, name?: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function NodeConfigPanel({
  node,
  availableNodes,
  apiKeys,
  onUpdateConfig,
  onDelete,
  onClose,
}: NodeConfigPanelProps) {
  const [config, setConfig] = useState(node.config);
  const [name, setName] = useState(node.name);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteOptions, setAutocompleteOptions] = useState<AutocompleteOption[]>([]);
  const [activeField, setActiveField] = useState<string | null>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  // Update local state when node changes
  useEffect(() => {
    setConfig(node.config);
    setName(node.name);
  }, [node.id, node.config, node.name]);

  // Save changes
  const handleSave = useCallback(() => {
    onUpdateConfig(config, name);
  }, [config, name, onUpdateConfig]);

  // Update config field
  const updateField = useCallback((field: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Handle text change with autocomplete
  const handleTextChange = useCallback(
    (field: string, value: string) => {
      updateField(field, value);

      // Check for # trigger
      const hashIndex = value.lastIndexOf("#");
      if (hashIndex !== -1) {
        const afterHash = value.slice(hashIndex);
        if (!afterHash.includes(" ") || afterHash.includes(".")) {
          const options = generateAutocompleteOptions(availableNodes, afterHash);
          setAutocompleteOptions(options);
          setShowAutocomplete(options.length > 0);
          setActiveField(field);
          return;
        }
      }
      setShowAutocomplete(false);
    },
    [availableNodes, updateField]
  );

  // Insert autocomplete option
  const insertAutocomplete = useCallback(
    (option: AutocompleteOption) => {
      if (!activeField) return;

      const currentValue = String(config[activeField] || "");
      const hashIndex = currentValue.lastIndexOf("#");
      if (hashIndex !== -1) {
        const newValue = currentValue.slice(0, hashIndex) + option.value;
        updateField(activeField, newValue);
      }
      setShowAutocomplete(false);
    },
    [activeField, config, updateField]
  );

  // Filter API keys by provider
  const getFilteredApiKeys = (provider: string) => {
    return apiKeys.filter((key) => key.provider === provider);
  };

  // Render config fields based on node type
  const renderConfigFields = () => {
    switch (node.nodeType) {
      case "SCRAPE_URL":
        return renderScrapeUrlConfig();
      case "RESEARCH":
        return renderResearchConfig();
      case "ANALYZE":
        return renderAnalyzeConfig();
      case "GENERATE_TEXT":
        return renderGenerateTextConfig();
      case "GENERATE_IMAGE":
        return renderGenerateImageConfig();
      default:
        return null;
    }
  };

  const renderScrapeUrlConfig = () => (
    <div className="space-y-4">
      <div>
        <Label>URL</Label>
        <Input
          value={String(config.url || "")}
          onChange={(e) => handleTextChange("url", e.target.value)}
          placeholder="https://example.com or #Step.url"
          className="mt-1.5 bg-slate-800 border-slate-600"
        />
        <p className="text-xs text-slate-400 mt-1">
          Use #NodeName.field to reference outputs from previous steps
        </p>
      </div>
      <OutputsInfo nodeType="SCRAPE_URL" />
    </div>
  );

  const renderResearchConfig = () => (
    <div className="space-y-4">
      <ProviderModelSelector
        provider={String(config.provider || "openai")}
        model={String(config.model || "")}
        apiKeyId={String(config.apiKeyId || "")}
        apiKeys={apiKeys}
        onProviderChange={(v) => updateField("provider", v)}
        onModelChange={(v) => updateField("model", v)}
        onApiKeyChange={(v) => updateField("apiKeyId", v)}
      />
      <div>
        <Label>Research Prompt</Label>
        <div className="relative">
          <Textarea
            value={String(config.prompt || "")}
            onChange={(e) => handleTextChange("prompt", e.target.value)}
            placeholder="Research the topic: #scraper.clean_text"
            rows={4}
            className="mt-1.5 bg-slate-800 border-slate-600"
          />
          {showAutocomplete && activeField === "prompt" && (
            <AutocompleteDropdown
              options={autocompleteOptions}
              onSelect={insertAutocomplete}
              ref={autocompleteRef}
            />
          )}
        </div>
      </div>
      <OutputsInfo nodeType="RESEARCH" />
    </div>
  );

  const renderAnalyzeConfig = () => (
    <div className="space-y-4">
      <ProviderModelSelector
        provider={String(config.provider || "openai")}
        model={String(config.model || "")}
        apiKeyId={String(config.apiKeyId || "")}
        apiKeys={apiKeys}
        onProviderChange={(v) => updateField("provider", v)}
        onModelChange={(v) => updateField("model", v)}
        onApiKeyChange={(v) => updateField("apiKeyId", v)}
      />
      <div>
        <Label>Analysis Prompt</Label>
        <div className="relative">
          <Textarea
            value={String(config.prompt || "")}
            onChange={(e) => handleTextChange("prompt", e.target.value)}
            placeholder="Analyze the following and extract key insights: #research.text"
            rows={4}
            className="mt-1.5 bg-slate-800 border-slate-600"
          />
          {showAutocomplete && activeField === "prompt" && (
            <AutocompleteDropdown
              options={autocompleteOptions}
              onSelect={insertAutocomplete}
              ref={autocompleteRef}
            />
          )}
        </div>
      </div>
      <div>
        <Label>Output Schema (JSON, optional)</Label>
        <Textarea
          value={String(config.outputSchema || "")}
          onChange={(e) => updateField("outputSchema", e.target.value)}
          placeholder='{"insights": ["string"], "sentiment": "string"}'
          rows={3}
          className="mt-1.5 bg-slate-800 border-slate-600 font-mono text-xs"
        />
      </div>
      <OutputsInfo nodeType="ANALYZE" />
    </div>
  );

  const renderGenerateTextConfig = () => (
    <div className="space-y-4">
      <ProviderModelSelector
        provider={String(config.provider || "openai")}
        model={String(config.model || "")}
        apiKeyId={String(config.apiKeyId || "")}
        apiKeys={apiKeys}
        onProviderChange={(v) => updateField("provider", v)}
        onModelChange={(v) => updateField("model", v)}
        onApiKeyChange={(v) => updateField("apiKeyId", v)}
      />
      <div>
        <Label>Prompt</Label>
        <div className="relative">
          <Textarea
            value={String(config.prompt || "")}
            onChange={(e) => handleTextChange("prompt", e.target.value)}
            placeholder="Write a compelling email based on: #analyze.json"
            rows={5}
            className="mt-1.5 bg-slate-800 border-slate-600"
          />
          {showAutocomplete && activeField === "prompt" && (
            <AutocompleteDropdown
              options={autocompleteOptions}
              onSelect={insertAutocomplete}
              ref={autocompleteRef}
            />
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Temperature</Label>
          <Input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={Number(config.temperature || 0.7)}
            onChange={(e) => updateField("temperature", parseFloat(e.target.value))}
            className="mt-1.5 bg-slate-800 border-slate-600"
          />
        </div>
        <div>
          <Label>Max Tokens</Label>
          <Input
            type="number"
            min={1}
            value={Number(config.maxTokens || "")}
            onChange={(e) =>
              updateField("maxTokens", e.target.value ? parseInt(e.target.value) : undefined)
            }
            placeholder="Auto"
            className="mt-1.5 bg-slate-800 border-slate-600"
          />
        </div>
      </div>
      <OutputsInfo nodeType="GENERATE_TEXT" />
    </div>
  );

  const renderGenerateImageConfig = () => (
    <div className="space-y-4">
      <div>
        <Label>Provider</Label>
        <Select value="openai" disabled>
          <SelectTrigger className="mt-1.5 bg-slate-800 border-slate-600">
            <SelectValue placeholder="OpenAI (DALL-E)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai">OpenAI (DALL-E)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-400 mt-1">
          Only OpenAI DALL-E is currently supported
        </p>
      </div>
      <div>
        <Label>API Key</Label>
        <Select
          value={String(config.apiKeyId || "")}
          onValueChange={(v) => updateField("apiKeyId", v)}
        >
          <SelectTrigger className="mt-1.5 bg-slate-800 border-slate-600">
            <SelectValue placeholder="Select API key" />
          </SelectTrigger>
          <SelectContent>
            {getFilteredApiKeys("openai").map((key) => (
              <SelectItem key={key.id} value={key.id}>
                {key.name} (****{key.keyLastFour})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Image Prompt</Label>
        <div className="relative">
          <Textarea
            value={String(config.prompt || "")}
            onChange={(e) => handleTextChange("prompt", e.target.value)}
            placeholder="A professional illustration showing: #analyze.json | pick:imagePrompt"
            rows={4}
            className="mt-1.5 bg-slate-800 border-slate-600"
          />
          {showAutocomplete && activeField === "prompt" && (
            <AutocompleteDropdown
              options={autocompleteOptions}
              onSelect={insertAutocomplete}
              ref={autocompleteRef}
            />
          )}
        </div>
      </div>
      <div>
        <Label>Size</Label>
        <Select
          value={String(config.size || "1024x1024")}
          onValueChange={(v) => updateField("size", v)}
        >
          <SelectTrigger className="mt-1.5 bg-slate-800 border-slate-600">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1024x1024">1024x1024 (Square)</SelectItem>
            <SelectItem value="1024x1792">1024x1792 (Portrait)</SelectItem>
            <SelectItem value="1792x1024">1792x1024 (Landscape)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <OutputsInfo nodeType="GENERATE_IMAGE" />
    </div>
  );

  return (
    <div className="w-80 bg-slate-900 border-l border-slate-700 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <h3 className="font-semibold text-white">Configure Node</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-800 rounded"
        >
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Node Name */}
        <div>
          <Label>Node Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="unique_name"
            className="mt-1.5 bg-slate-800 border-slate-600"
          />
          <p className="text-xs text-slate-400 mt-1">
            Used for variable references: #{name}.output
          </p>
        </div>

        {/* Node-specific config */}
        {renderConfigFields()}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-700 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onDelete}
          className="border-red-700 text-red-400 hover:bg-red-950"
        >
          <Trash2 className="w-4 h-4 mr-1" />
          Delete
        </Button>
        <Button size="sm" onClick={handleSave} className="flex-1">
          Save Changes
        </Button>
      </div>
    </div>
  );
}

// Provider/Model selector component
function ProviderModelSelector({
  provider,
  model,
  apiKeyId,
  apiKeys,
  onProviderChange,
  onModelChange,
  onApiKeyChange,
}: {
  provider: string;
  model: string;
  apiKeyId: string;
  apiKeys: Array<{ id: string; provider: string; name: string; keyLastFour: string }>;
  onProviderChange: (v: string) => void;
  onModelChange: (v: string) => void;
  onApiKeyChange: (v: string) => void;
}) {
  const models = PROVIDER_MODELS[provider as Provider]?.filter((m) => !m.supportsImages) || [];
  const filteredKeys = apiKeys.filter((k) => k.provider === provider);

  return (
    <>
      <div>
        <Label>Provider</Label>
        <Select value={provider} onValueChange={onProviderChange}>
          <SelectTrigger className="mt-1.5 bg-slate-800 border-slate-600">
            <SelectValue />
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
        <Label>Model</Label>
        <Select value={model} onValueChange={onModelChange}>
          <SelectTrigger className="mt-1.5 bg-slate-800 border-slate-600">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>API Key</Label>
        <Select value={apiKeyId} onValueChange={onApiKeyChange}>
          <SelectTrigger className="mt-1.5 bg-slate-800 border-slate-600">
            <SelectValue placeholder="Select API key" />
          </SelectTrigger>
          <SelectContent>
            {filteredKeys.map((key) => (
              <SelectItem key={key.id} value={key.id}>
                {key.name} (****{key.keyLastFour})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filteredKeys.length === 0 && (
          <p className="text-xs text-amber-400 mt-1">
            No API keys for {provider}. Add one in Settings.
          </p>
        )}
      </div>
    </>
  );
}

// Autocomplete dropdown
const AutocompleteDropdown = React.forwardRef<
  HTMLDivElement,
  { options: AutocompleteOption[]; onSelect: (opt: AutocompleteOption) => void }
>(({ options, onSelect }, ref) => (
  <div
    ref={ref}
    className="absolute z-10 bottom-full mb-1 left-0 right-0 bg-slate-800 border border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto"
  >
    {options.map((opt, i) => (
      <button
        key={i}
        onClick={() => onSelect(opt)}
        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-700 flex items-center justify-between"
      >
        <span className="font-mono text-green-400">{opt.value}</span>
        <span className="text-xs text-slate-400">{opt.type}</span>
      </button>
    ))}
  </div>
));
AutocompleteDropdown.displayName = "AutocompleteDropdown";

// Outputs info component
function OutputsInfo({ nodeType }: { nodeType: NodeType }) {
  const outputs = getNodeOutputFields(nodeType);
  return (
    <div className="bg-slate-800/50 rounded-lg p-3">
      <div className="text-xs font-semibold text-slate-400 mb-2">Outputs</div>
      <div className="flex flex-wrap gap-1">
        {outputs.map((output) => (
          <span
            key={output}
            className="px-2 py-0.5 bg-slate-700 text-green-400 rounded text-xs font-mono"
          >
            .{output}
          </span>
        ))}
      </div>
    </div>
  );
}
