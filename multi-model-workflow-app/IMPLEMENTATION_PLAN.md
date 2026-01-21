# Multi-Model Workflow App - Implementation Plan

## Milestones Overview

### Milestone 1: Foundation (Day 1-2)
- [x] Project setup with Next.js 14, TypeScript, Tailwind
- [x] Prisma schema with SQLite
- [x] Encryption utilities for API key storage
- [x] Basic project structure

### Milestone 2: Provider Layer (Day 2-3)
- [x] Provider interface definition
- [x] OpenAI adapter (chat + images)
- [x] Anthropic Claude adapter
- [x] Google Gemini adapter
- [x] Perplexity adapter
- [x] API key management endpoints

### Milestone 3: Variable Reference System (Day 3-4)
- [x] Token parser for #Step.output syntax
- [x] Transform system (truncate, pick)
- [x] Resolver with run context
- [x] Autocomplete data generator

### Milestone 4: Workflow Nodes (Day 4-5)
- [x] Node type definitions with Zod schemas
- [x] SCRAPE_URL implementation
- [x] RESEARCH node
- [x] ANALYZE node (structured output)
- [x] GENERATE_TEXT node
- [x] GENERATE_IMAGE node

### Milestone 5: Workflow Runner (Day 5-6)
- [x] Topological sort for execution order
- [x] Step executor with error handling
- [x] Run log persistence
- [x] SSE streaming setup

### Milestone 6: UI - Chat (Day 6-7)
- [x] Provider/model selector
- [x] Message input with image upload
- [x] Response streaming display
- [x] Conversation history

### Milestone 7: UI - Workflow Builder (Day 7-9)
- [x] React Flow canvas setup
- [x] Node library sidebar
- [x] Node configuration panels
- [x] Variable reference autocomplete
- [x] Workflow save/load

### Milestone 8: UI - Runs (Day 9-10)
- [x] Runs list view
- [x] Run detail with timeline
- [x] Output artifact viewers
- [x] Real-time status updates

### Milestone 9: Polish & Examples (Day 10)
- [x] Example workflows
- [x] Documentation
- [x] Error handling improvements
- [x] Basic rate limiting

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                        │
├─────────────┬─────────────────────┬─────────────────────────────┤
│   Chat UI   │   Workflow Builder  │         Runs UI             │
│             │   (React Flow)      │                             │
└─────────────┴─────────────────────┴─────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API Routes (Next.js)                         │
├─────────────┬─────────────────────┬─────────────────────────────┤
│  /api/chat  │  /api/workflows     │    /api/runs                │
│  /api/keys  │  /api/runs/execute  │    /api/runs/[id]/stream    │
└─────────────┴─────────────────────┴─────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Service Layer                              │
├─────────────┬─────────────────────┬─────────────────────────────┤
│  Providers  │  Workflow Runner    │    Variable Resolver        │
│  (OpenAI,   │  (Topo Sort,        │    (Parser, Transforms)     │
│   Claude,   │   Executor,         │                             │
│   Gemini,   │   SSE Stream)       │                             │
│   Perplexity│                     │                             │
└─────────────┴─────────────────────┴─────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Data Layer (Prisma + SQLite)                  │
├─────────────┬─────────────────────┬─────────────────────────────┤
│  ApiKeys    │  Workflows, Nodes   │    Runs, RunSteps           │
│  (encrypted)│  Edges              │    Artifacts                │
└─────────────┴─────────────────────┴─────────────────────────────┘
```

## Key Design Decisions

### 1. Provider Abstraction
All LLM providers implement a common interface:
```typescript
interface ProviderAdapter {
  generateText(params: TextGenerationParams): Promise<TextGenerationResult>
  generateImage?(params: ImageGenerationParams): Promise<ImageGenerationResult>
}
```

### 2. Variable Reference System
- Syntax: `#NodeName.outputField` or `#NodeName` (full payload)
- Transforms: `#Node.field | transform:arg`
- Resolved at runtime from run context

### 3. Workflow Execution
1. Build dependency graph from edges
2. Topologically sort nodes
3. Execute in order, storing outputs
4. Stream progress via SSE
5. Handle errors with partial completion

### 4. Security
- API keys encrypted with libsodium sealed box
- Only masked keys returned to client
- Rate limiting on public endpoints
- Server-side validation of all inputs
