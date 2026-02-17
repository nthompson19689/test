import { NextRequest } from 'next/server';
import { z } from 'zod';
import { generateSEOReport } from '@/lib/analyzer';

const AnalyzeSchema = z.object({
  domain: z.string().min(3).transform(d => d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()),
  valueProposition: z.string().min(10).max(2000),
  dataforseoLogin: z.string().min(1),
  dataforseoPassword: z.string().min(1),
  locationCode: z.number().optional().default(2840),
  languageCode: z.string().optional().default('en'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = AnalyzeSchema.parse(body);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendProgress = (step: string, pct: number) => {
          const data = JSON.stringify({ type: 'progress', step, pct });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        };

        try {
          const report = await generateSEOReport(input, sendProgress);
          const data = JSON.stringify({ type: 'complete', report });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          const data = JSON.stringify({ type: 'error', message });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json({ error: 'Validation error', details: err.errors }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    return Response.json({ error: message }, { status: 500 });
  }
}
