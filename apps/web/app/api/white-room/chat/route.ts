import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const MODEL = 'gpt-4o-mini';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { context, userMessage, apiKey } = body;

    if (!context || !userMessage) {
      return NextResponse.json(
        { error: 'Missing context or message' },
        { status: 400 }
      );
    }

    // Use provided API key or fall back to environment variable
    const effectiveApiKey = apiKey || process.env.OPENAI_API_KEY;

    if (!effectiveApiKey) {
      return NextResponse.json(
        { error: 'No API key available' },
        { status: 401 }
      );
    }

    const openai = new OpenAI({ apiKey: effectiveApiKey });

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: context },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 150, // Keep responses short - creature speaks in 1-2 sentences
    });

    const creatureResponse = response.choices[0].message.content || 'Noted.';

    // Validate response doesn't break character
    // The system prompt should handle this, but we can add a safety check
    let finalResponse = creatureResponse;

    // Strip any exclamation points that slip through
    finalResponse = finalResponse.replace(/!/g, '.');

    // Trim to reasonable length
    if (finalResponse.length > 200) {
      const sentences = finalResponse.split(/(?<=[.?])\s+/);
      finalResponse = sentences.slice(0, 2).join(' ');
    }

    return NextResponse.json({ response: finalResponse.trim() });
  } catch (error) {
    console.error('WHITE ROOM chat error:', error);

    // Return in-character error
    return NextResponse.json({
      response: '...',
    });
  }
}
