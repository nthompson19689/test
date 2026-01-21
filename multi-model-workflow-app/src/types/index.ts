/**
 * Core types for the Multi-Model Workflow App
 */

import { z } from 'zod';

// ============================================
// Provider Types
// ============================================

export type Provider = 'openai' | 'anthropic' | 'google' | 'perplexity';

export const ProviderSchema = z.enum(['openai', 'anthropic', 'google', 'perplexity']);

export interface ProviderModel {
  id: string;
  name: string;
  provider: Provider;
  supportsImages: boolean;
  supportsVision: boolean;
  maxTokens?: number;
}

export const PROVIDER_MODELS: Record<Provider, ProviderModel[]> = {
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', supportsImages: false, supportsVision: true },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', supportsImages: false, supportsVision: true },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', supportsImages: false, supportsVision: true },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai', supportsImages: false, supportsVision: false },
    { id: 'dall-e-3', name: 'DALL-E 3', provider: 'openai', supportsImages: true, supportsVision: false },
    { id: 'dall-e-2', name: 'DALL-E 2', provider: 'openai', supportsImages: true, supportsVision: false },
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', supportsImages: false, supportsVision: true },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic', supportsImages: false, supportsVision: true },
    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', provider: 'anthropic', supportsImages: false, supportsVision: true },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic', supportsImages: false, supportsVision: true },
  ],
  google: [
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google', supportsImages: false, supportsVision: true },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'google', supportsImages: false, supportsVision: true },
    { id: 'gemini-pro', name: 'Gemini Pro', provider: 'google', supportsImages: false, supportsVision: false },
    { id: 'gemini-pro-vision', name: 'Gemini Pro Vision', provider: 'google', supportsImages: false, supportsVision: true },
  ],
  perplexity: [
    { id: 'llama-3.1-sonar-small-128k-online', name: 'Sonar Small', provider: 'perplexity', supportsImages: false, supportsVision: false },
    { id: 'llama-3.1-sonar-large-128k-online', name: 'Sonar Large', provider: 'perplexity', supportsImages: false, supportsVision: false },
    { id: 'llama-3.1-sonar-huge-128k-online', name: 'Sonar Huge', provider: 'perplexity', supportsImages: false, supportsVision: false },
  ],
};

// ============================================
// Provider Interface Types
// ============================================

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[]; // URLs or base64
}

export interface TextGenerationParams {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  inputImageUrls?: string[];
  tools?: ToolDefinition[];
}

export interface TextGenerationResult {
  text: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  citations?: string[];
  raw?: unknown;
}

export interface ImageGenerationParams {
  prompt: string;
  size?: '256x256' | '512x512' | '1024x1024' | '1024x1792' | '1792x1024';
  quality?: 'standard' | 'hd';
  style?: 'natural' | 'vivid';
}

export interface ImageGenerationResult {
  imageUrl?: string;
  base64?: string;
  revisedPrompt?: string;
  raw?: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ProviderAdapter {
  generateText(params: TextGenerationParams): Promise<TextGenerationResult>;
  generateImage?(params: ImageGenerationParams): Promise<ImageGenerationResult>;
  streamText?(params: TextGenerationParams): AsyncGenerator<string, TextGenerationResult>;
}

// ============================================
// Workflow Node Types
// ============================================

export type NodeType = 'SCRAPE_URL' | 'RESEARCH' | 'ANALYZE' | 'GENERATE_TEXT' | 'GENERATE_IMAGE';

export const NodeTypeSchema = z.enum(['SCRAPE_URL', 'RESEARCH', 'ANALYZE', 'GENERATE_TEXT', 'GENERATE_IMAGE']);

// Scrape URL Node
export const ScrapeUrlConfigSchema = z.object({
  url: z.string().min(1, 'URL is required'),
});
export type ScrapeUrlConfig = z.infer<typeof ScrapeUrlConfigSchema>;

export const ScrapeUrlOutputSchema = z.object({
  raw_html: z.string(),
  clean_text: z.string(),
  title: z.string(),
});
export type ScrapeUrlOutput = z.infer<typeof ScrapeUrlOutputSchema>;

// Research Node
export const ResearchConfigSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  provider: ProviderSchema,
  model: z.string().min(1, 'Model is required'),
  apiKeyId: z.string().min(1, 'API Key is required'),
});
export type ResearchConfig = z.infer<typeof ResearchConfigSchema>;

export const ResearchOutputSchema = z.object({
  text: z.string(),
  citations: z.array(z.string()).optional(),
});
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

// Analyze Node
export const AnalyzeConfigSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  provider: ProviderSchema,
  model: z.string().min(1, 'Model is required'),
  apiKeyId: z.string().min(1, 'API Key is required'),
  outputSchema: z.string().optional(), // JSON schema string
});
export type AnalyzeConfig = z.infer<typeof AnalyzeConfigSchema>;

export const AnalyzeOutputSchema = z.object({
  json: z.record(z.unknown()),
  text: z.string(),
});
export type AnalyzeOutput = z.infer<typeof AnalyzeOutputSchema>;

// Generate Text Node
export const GenerateTextConfigSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  provider: ProviderSchema,
  model: z.string().min(1, 'Model is required'),
  apiKeyId: z.string().min(1, 'API Key is required'),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).optional(),
});
export type GenerateTextConfig = z.infer<typeof GenerateTextConfigSchema>;

export const GenerateTextOutputSchema = z.object({
  text: z.string(),
});
export type GenerateTextOutput = z.infer<typeof GenerateTextOutputSchema>;

// Generate Image Node
export const GenerateImageConfigSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  provider: ProviderSchema.default('openai'),
  apiKeyId: z.string().min(1, 'API Key is required'),
  size: z.enum(['256x256', '512x512', '1024x1024', '1024x1792', '1792x1024']).default('1024x1024'),
  quality: z.enum(['standard', 'hd']).optional(),
});
export type GenerateImageConfig = z.infer<typeof GenerateImageConfigSchema>;

export const GenerateImageOutputSchema = z.object({
  image: z.string(), // URL or base64
  revised_prompt: z.string().optional(),
});
export type GenerateImageOutput = z.infer<typeof GenerateImageOutputSchema>;

// Union types for all configs and outputs
export type NodeConfig =
  | ScrapeUrlConfig
  | ResearchConfig
  | AnalyzeConfig
  | GenerateTextConfig
  | GenerateImageConfig;

export type NodeOutput =
  | ScrapeUrlOutput
  | ResearchOutput
  | AnalyzeOutput
  | GenerateTextOutput
  | GenerateImageOutput;

// ============================================
// Workflow Execution Types
// ============================================

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type StepStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped';

export interface RunContext {
  runId: string;
  workflowId: string;
  outputs: Record<string, NodeOutput>; // nodeId/nodeName -> output
  apiKeys: Record<string, string>; // keyId -> decrypted key (in-memory only)
}

// ============================================
// Variable Reference Types
// ============================================

export interface VariableReference {
  raw: string; // Original token e.g., "#Step.summary | truncate:280"
  nodeName: string; // e.g., "Step"
  outputField?: string; // e.g., "summary" (undefined means whole object)
  transform?: {
    name: string;
    args?: string[];
  };
}

export interface AutocompleteOption {
  label: string; // Display text
  value: string; // Insertion value
  type: 'node' | 'field';
  nodeType?: NodeType;
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
}

// ============================================
// SSE Event Types
// ============================================

export interface RunEvent {
  type: 'run_started' | 'step_started' | 'step_progress' | 'step_completed' | 'step_failed' | 'run_completed' | 'run_failed';
  runId: string;
  stepId?: string;
  nodeId?: string;
  status?: RunStatus | StepStatus;
  output?: unknown;
  error?: string;
  timestamp: string;
}
