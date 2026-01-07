import OpenAI from "openai";
import { getUserApiKey } from "./crypto";
import type { RetrievalResult } from "./retrieval";

const DEFAULT_MODEL = "gpt-4o-mini";

export interface AssetGenerationOutput {
  linkedin_posts: string[];
  blog_outline: string;
  newsletter: string;
  hooks: string[];
}

/**
 * Generates assets from transcript with retrieved context
 */
export async function generateAssets(
  userId: string,
  input: {
    transcriptText: string;
    retrievedContext: {
      brandVoice: RetrievalResult[];
      proof: RetrievalResult[];
      icp: RetrievalResult[];
    };
  }
): Promise<AssetGenerationOutput> {
  let apiKey = process.env.OPENAI_API_KEY || "";

  // Try to use user's API key
  const userKey = await getUserApiKey(userId, "openai");
  if (userKey) {
    apiKey = userKey;
  }

  if (!apiKey) {
    throw new Error("No OpenAI API key available");
  }

  const openai = new OpenAI({ apiKey });

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(input.transcriptText, input.retrievedContext);

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const response = await openai.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error("No content in response");
      }

      const parsed = JSON.parse(content);

      // Validate structure
      if (
        !Array.isArray(parsed.linkedin_posts) ||
        typeof parsed.blog_outline !== "string" ||
        typeof parsed.newsletter !== "string" ||
        !Array.isArray(parsed.hooks)
      ) {
        throw new Error("Invalid JSON structure");
      }

      return parsed as AssetGenerationOutput;
    } catch (error) {
      attempts++;
      if (attempts >= maxAttempts) {
        throw new Error(`Failed to generate valid assets after ${maxAttempts} attempts: ${error}`);
      }
    }
  }

  throw new Error("Failed to generate assets");
}

function buildSystemPrompt(): string {
  return `You are an expert content strategist and copywriter. Your task is to transform video/audio transcripts into compelling marketing assets.

You will be provided with:
1. Brand voice rules and guidelines
2. Target audience (ICP) information
3. Proof points and claims
4. A transcript to work with

Generate the following assets in strict JSON format:
{
  "linkedin_posts": ["post1", "post2", "post3"],
  "blog_outline": "markdown outline",
  "newsletter": "email newsletter content",
  "hooks": ["hook1", "hook2", "hook3", "hook4", "hook5"]
}

Requirements:
- LinkedIn posts: 3-5 posts, each 150-300 words, engaging and platform-appropriate
- Blog outline: Markdown format with H2/H3 structure, intro, body, conclusion
- Newsletter: Email-friendly format, compelling subject line, 300-500 words
- Hooks: 5-7 attention-grabbing opening lines suitable for various formats

Maintain brand voice throughout. Use proof points naturally. Address ICP pain points.`;
}

function buildUserPrompt(
  transcriptText: string,
  context: {
    brandVoice: RetrievalResult[];
    proof: RetrievalResult[];
    icp: RetrievalResult[];
  }
): string {
  let prompt = "";

  // Brand voice section
  if (context.brandVoice.length > 0) {
    prompt += "## Brand Voice & Guidelines\n\n";
    for (const item of context.brandVoice) {
      prompt += `${item.textContent}\n\n`;
    }
  }

  // ICP section
  if (context.icp.length > 0) {
    prompt += "## Target Audience (ICP)\n\n";
    for (const item of context.icp) {
      prompt += `${item.textContent}\n\n`;
    }
  }

  // Proof points section
  if (context.proof.length > 0) {
    prompt += "## Proof Points & Claims\n\n";
    for (const item of context.proof) {
      prompt += `${item.textContent}\n\n`;
    }
  }

  // Transcript
  prompt += "## Transcript to Transform\n\n";
  prompt += transcriptText;

  prompt += "\n\nGenerate the marketing assets in the specified JSON format.";

  return prompt;
}

/**
 * Simple LLM call for general purposes
 */
export async function callLLM(
  userId: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<string> {
  let apiKey = process.env.OPENAI_API_KEY || "";

  const userKey = await getUserApiKey(userId, "openai");
  if (userKey) {
    apiKey = userKey;
  }

  if (!apiKey) {
    throw new Error("No OpenAI API key available");
  }

  const openai = new OpenAI({ apiKey });

  const response = await openai.chat.completions.create({
    model: options.model || DEFAULT_MODEL,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens,
  });

  return response.choices[0].message.content || "";
}
