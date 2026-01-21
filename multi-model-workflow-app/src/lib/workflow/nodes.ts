/**
 * Workflow Node Executors
 * Each node type has an executor that handles its specific logic
 */

import type {
  NodeType,
  NodeOutput,
  ScrapeUrlConfig,
  ScrapeUrlOutput,
  ResearchConfig,
  ResearchOutput,
  AnalyzeConfig,
  AnalyzeOutput,
  GenerateTextConfig,
  GenerateTextOutput,
  GenerateImageConfig,
  GenerateImageOutput,
  Provider,
  RunContext,
} from '@/types';
import {
  ScrapeUrlConfigSchema,
  ResearchConfigSchema,
  AnalyzeConfigSchema,
  GenerateTextConfigSchema,
  GenerateImageConfigSchema,
} from '@/types';
import { createProvider } from '@/lib/providers';
import { scrapeUrl } from './scraper';
import { resolveVariablesInConfig, resolveVariablesInString, ResolveContext } from './variable-reference';

/**
 * Base node executor interface
 */
export interface NodeExecutor<TConfig, TOutput extends NodeOutput> {
  nodeType: NodeType;
  validateConfig(config: unknown): TConfig;
  execute(config: TConfig, context: ExecutionContext): Promise<TOutput>;
}

/**
 * Execution context passed to node executors
 */
export interface ExecutionContext {
  runContext: RunContext;
  resolveContext: ResolveContext;
  onProgress?: (message: string) => void;
}

/**
 * Utility to get decrypted API key from context
 */
function getApiKey(context: ExecutionContext, keyId: string): string {
  const key = context.runContext.apiKeys[keyId];
  if (!key) {
    throw new Error(`API key not found: ${keyId}`);
  }
  return key;
}

/**
 * SCRAPE_URL Node Executor
 */
export const scrapeUrlExecutor: NodeExecutor<ScrapeUrlConfig, ScrapeUrlOutput> = {
  nodeType: 'SCRAPE_URL',

  validateConfig(config: unknown): ScrapeUrlConfig {
    return ScrapeUrlConfigSchema.parse(config);
  },

  async execute(config: ScrapeUrlConfig, context: ExecutionContext): Promise<ScrapeUrlOutput> {
    // Resolve any variable references in the URL
    const resolvedUrl = resolveVariablesInString(config.url, context.resolveContext);

    context.onProgress?.(`Fetching ${resolvedUrl}...`);

    const result = await scrapeUrl(resolvedUrl);

    context.onProgress?.(`Extracted ${result.clean_text.length} characters from ${result.title}`);

    return {
      raw_html: result.raw_html,
      clean_text: result.clean_text,
      title: result.title,
    };
  },
};

/**
 * RESEARCH Node Executor
 * Uses an LLM to research a topic, can include citations (especially with Perplexity)
 */
export const researchExecutor: NodeExecutor<ResearchConfig, ResearchOutput> = {
  nodeType: 'RESEARCH',

  validateConfig(config: unknown): ResearchConfig {
    return ResearchConfigSchema.parse(config);
  },

  async execute(config: ResearchConfig, context: ExecutionContext): Promise<ResearchOutput> {
    // Resolve variable references
    const resolvedConfig = resolveVariablesInConfig(config, context.resolveContext);

    const apiKey = getApiKey(context, resolvedConfig.apiKeyId);
    const provider = createProvider(resolvedConfig.provider as Provider, apiKey);

    context.onProgress?.(`Researching with ${resolvedConfig.model}...`);

    const result = await provider.generateText({
      model: resolvedConfig.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a research assistant. Provide comprehensive, accurate information with citations when possible. Format your response clearly with relevant facts and sources.',
        },
        {
          role: 'user',
          content: resolvedConfig.prompt,
        },
      ],
      temperature: 0.7,
    });

    context.onProgress?.(`Research complete (${result.usage?.outputTokens || 0} tokens)`);

    return {
      text: result.text,
      citations: result.citations,
    };
  },
};

/**
 * ANALYZE Node Executor
 * Uses an LLM to analyze content and produce structured output
 */
export const analyzeExecutor: NodeExecutor<AnalyzeConfig, AnalyzeOutput> = {
  nodeType: 'ANALYZE',

  validateConfig(config: unknown): AnalyzeConfig {
    return AnalyzeConfigSchema.parse(config);
  },

  async execute(config: AnalyzeConfig, context: ExecutionContext): Promise<AnalyzeOutput> {
    // Resolve variable references
    const resolvedConfig = resolveVariablesInConfig(config, context.resolveContext);

    const apiKey = getApiKey(context, resolvedConfig.apiKeyId);
    const provider = createProvider(resolvedConfig.provider as Provider, apiKey);

    context.onProgress?.(`Analyzing with ${resolvedConfig.model}...`);

    // Build system prompt for structured output
    let systemPrompt =
      'You are an analysis assistant. Analyze the provided content and respond with structured insights.';

    if (resolvedConfig.outputSchema) {
      systemPrompt += `\n\nYou MUST respond with valid JSON matching this schema:\n${resolvedConfig.outputSchema}\n\nRespond ONLY with the JSON object, no additional text.`;
    } else {
      systemPrompt +=
        '\n\nRespond with a JSON object containing your analysis. Include relevant fields based on the analysis requested.';
    }

    const result = await provider.generateText({
      model: resolvedConfig.model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: resolvedConfig.prompt,
        },
      ],
      temperature: 0.3, // Lower temperature for more consistent structured output
    });

    context.onProgress?.(`Analysis complete (${result.usage?.outputTokens || 0} tokens)`);

    // Parse JSON from response
    let json: Record<string, unknown>;
    try {
      // Try to extract JSON from the response
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        json = JSON.parse(jsonMatch[0]);
      } else {
        // Wrap in object if not JSON
        json = { analysis: result.text };
      }
    } catch {
      // If parsing fails, wrap the text
      json = { analysis: result.text, parseError: true };
    }

    return {
      json,
      text: result.text,
    };
  },
};

/**
 * GENERATE_TEXT Node Executor
 * General-purpose text generation
 */
export const generateTextExecutor: NodeExecutor<GenerateTextConfig, GenerateTextOutput> = {
  nodeType: 'GENERATE_TEXT',

  validateConfig(config: unknown): GenerateTextConfig {
    return GenerateTextConfigSchema.parse(config);
  },

  async execute(config: GenerateTextConfig, context: ExecutionContext): Promise<GenerateTextOutput> {
    // Resolve variable references
    const resolvedConfig = resolveVariablesInConfig(config, context.resolveContext);

    const apiKey = getApiKey(context, resolvedConfig.apiKeyId);
    const provider = createProvider(resolvedConfig.provider as Provider, apiKey);

    context.onProgress?.(`Generating text with ${resolvedConfig.model}...`);

    const result = await provider.generateText({
      model: resolvedConfig.model,
      messages: [
        {
          role: 'user',
          content: resolvedConfig.prompt,
        },
      ],
      temperature: resolvedConfig.temperature ?? 0.7,
      maxTokens: resolvedConfig.maxTokens,
    });

    context.onProgress?.(`Text generation complete (${result.usage?.outputTokens || 0} tokens)`);

    return {
      text: result.text,
    };
  },
};

/**
 * GENERATE_IMAGE Node Executor
 * Image generation (currently OpenAI DALL-E only)
 */
export const generateImageExecutor: NodeExecutor<GenerateImageConfig, GenerateImageOutput> = {
  nodeType: 'GENERATE_IMAGE',

  validateConfig(config: unknown): GenerateImageConfig {
    return GenerateImageConfigSchema.parse(config);
  },

  async execute(config: GenerateImageConfig, context: ExecutionContext): Promise<GenerateImageOutput> {
    // Resolve variable references
    const resolvedConfig = resolveVariablesInConfig(config, context.resolveContext);

    // Currently only OpenAI supports image generation
    if (resolvedConfig.provider !== 'openai') {
      throw new Error(`Image generation is only supported with OpenAI. Provider: ${resolvedConfig.provider}`);
    }

    const apiKey = getApiKey(context, resolvedConfig.apiKeyId);
    const provider = createProvider('openai', apiKey);

    if (!provider.generateImage) {
      throw new Error('Provider does not support image generation');
    }

    context.onProgress?.(`Generating image with DALL-E...`);

    const result = await provider.generateImage({
      prompt: resolvedConfig.prompt,
      size: resolvedConfig.size,
      quality: resolvedConfig.quality,
    });

    context.onProgress?.('Image generation complete');

    return {
      image: result.imageUrl || result.base64 || '',
      revised_prompt: result.revisedPrompt,
    };
  },
};

/**
 * Node executor registry
 */
const executors: Record<NodeType, NodeExecutor<unknown, NodeOutput>> = {
  SCRAPE_URL: scrapeUrlExecutor as NodeExecutor<unknown, NodeOutput>,
  RESEARCH: researchExecutor as NodeExecutor<unknown, NodeOutput>,
  ANALYZE: analyzeExecutor as NodeExecutor<unknown, NodeOutput>,
  GENERATE_TEXT: generateTextExecutor as NodeExecutor<unknown, NodeOutput>,
  GENERATE_IMAGE: generateImageExecutor as NodeExecutor<unknown, NodeOutput>,
};

/**
 * Get executor for a node type
 */
export function getNodeExecutor(nodeType: NodeType): NodeExecutor<unknown, NodeOutput> {
  const executor = executors[nodeType];
  if (!executor) {
    throw new Error(`Unknown node type: ${nodeType}`);
  }
  return executor;
}

/**
 * Validate node config
 */
export function validateNodeConfig(nodeType: NodeType, config: unknown): unknown {
  const executor = getNodeExecutor(nodeType);
  return executor.validateConfig(config);
}

/**
 * Execute a node
 */
export async function executeNode(
  nodeType: NodeType,
  config: unknown,
  context: ExecutionContext
): Promise<NodeOutput> {
  const executor = getNodeExecutor(nodeType);
  const validatedConfig = executor.validateConfig(config);
  return executor.execute(validatedConfig, context);
}
