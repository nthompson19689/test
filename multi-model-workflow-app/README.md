# Multi-Model Workflow App

A powerful web application featuring a multi-model chat interface and drag-and-drop workflow builder. Connect to OpenAI, Anthropic Claude, Google Gemini, and Perplexity with your own API keys.

## Features

### Multi-Model Chat
- Chat with multiple LLM providers (OpenAI, Anthropic, Google, Perplexity)
- Vision support for models that support images
- Streaming responses
- Provider/model selection per message

### Workflow Builder
- Drag-and-drop workflow creation with React Flow
- 5 node types: Scrape URL, Research, Analyze, Generate Text, Generate Image
- Variable reference system (#NodeName.output)
- Real-time execution with progress streaming

### Security
- API keys encrypted at rest using libsodium
- Only masked keys shown in UI
- Server-side execution

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

1. Clone and install dependencies:
```bash
cd multi-model-workflow-app
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```

3. Generate a secure encryption key:
```bash
openssl rand -hex 32
```

4. Edit `.env` and set:
```
DATABASE_URL="file:./dev.db"
ENCRYPTION_KEY="your-64-character-hex-key"
```

5. Initialize the database:
```bash
npm run db:push
```

6. (Optional) Seed example workflows:
```bash
npm run db:seed
```

7. Start the development server:
```bash
npm run dev
```

8. Open http://localhost:3000

### Adding API Keys

1. Click "Settings" in the top-right
2. Click "Add Key"
3. Select provider, enter a name, and paste your API key
4. The key is encrypted before storage

## Architecture

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── chat/          # Chat endpoint
│   │   ├── keys/          # API key management
│   │   ├── workflows/     # Workflow CRUD
│   │   └── runs/          # Run management
│   ├── page.tsx           # Main page
│   └── layout.tsx         # Root layout
├── components/
│   ├── ui/                # Base UI components
│   ├── chat/              # Chat interface
│   ├── workflow/          # Workflow builder
│   └── runs/              # Run views
├── lib/
│   ├── providers/         # LLM provider adapters
│   ├── workflow/          # Workflow execution
│   └── utils/             # Utilities (encryption, etc.)
└── types/                 # TypeScript types
```

## Node Types

### SCRAPE_URL
Fetches and extracts content from a webpage.
- **Inputs**: `url`
- **Outputs**: `raw_html`, `clean_text`, `title`

### RESEARCH
AI-powered research with optional citations (Perplexity).
- **Inputs**: `prompt`, `provider`, `model`, `apiKeyId`
- **Outputs**: `text`, `citations`

### ANALYZE
Structured analysis with JSON output.
- **Inputs**: `prompt`, `provider`, `model`, `apiKeyId`, `outputSchema?`
- **Outputs**: `json`, `text`

### GENERATE_TEXT
General text generation.
- **Inputs**: `prompt`, `provider`, `model`, `apiKeyId`, `temperature?`, `maxTokens?`
- **Outputs**: `text`

### GENERATE_IMAGE
Image generation (OpenAI DALL-E).
- **Inputs**: `prompt`, `apiKeyId`, `size?`, `quality?`
- **Outputs**: `image`, `revised_prompt`

## Variable Reference System

Reference outputs from previous nodes using `#NodeName.outputField` syntax.

### Examples
```
#scraper.clean_text          # Get clean text from scraper node
#analyzer.json               # Get full JSON output
#analyzer.json | pick:title  # Pick specific field
#text.text | truncate:280    # Truncate to 280 chars
```

### Available Transforms
- `truncate:N` - Truncate string to N characters
- `pick:field` - Pick field from object
- `json` - Convert to JSON string
- `first` - Get first array item
- `last` - Get last array item
- `count` - Get array length or string length
- `lower` - Convert to lowercase
- `upper` - Convert to uppercase
- `trim` - Trim whitespace

## Example Workflows

### 1. Content to Cold Email Pipeline
```
Scrape URL → Summarize → Extract ICP pains → Draft email
```

### 2. Research to LinkedIn Post
```
Research topic → Analyze pros/cons → Generate post + Image prompt → Generate image
```

## API Routes

### API Keys
- `GET /api/keys` - List all keys (masked)
- `POST /api/keys` - Create new key
- `DELETE /api/keys/[id]` - Delete key

### Chat
- `POST /api/chat` - Send message (supports streaming)

### Workflows
- `GET /api/workflows` - List workflows
- `POST /api/workflows` - Create workflow
- `GET /api/workflows/[id]` - Get workflow
- `PUT /api/workflows/[id]` - Update workflow
- `DELETE /api/workflows/[id]` - Delete workflow

### Runs
- `GET /api/runs` - List runs
- `POST /api/runs` - Start new run
- `GET /api/runs/[id]` - Get run details

## Provider Models

### OpenAI
- gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo
- dall-e-3, dall-e-2 (images)

### Anthropic
- claude-3-5-sonnet-20241022
- claude-3-opus-20240229
- claude-3-sonnet-20240229
- claude-3-haiku-20240307

### Google
- gemini-1.5-pro, gemini-1.5-flash
- gemini-pro, gemini-pro-vision

### Perplexity
- llama-3.1-sonar-small-128k-online
- llama-3.1-sonar-large-128k-online
- llama-3.1-sonar-huge-128k-online

## Security Considerations

1. **API Key Encryption**: Keys are encrypted using libsodium secretbox before storage
2. **Key Masking**: Only the last 4 characters are shown in the UI
3. **Server-Side Execution**: All LLM calls happen server-side
4. **Input Validation**: All inputs validated with Zod schemas

## Development

### Database Commands
```bash
npm run db:generate    # Generate Prisma client
npm run db:push        # Push schema changes
npm run db:studio      # Open Prisma Studio
npm run db:seed        # Seed example data
```

### Build for Production
```bash
npm run build
npm start
```

## Future Enhancements

- [ ] User authentication (NextAuth)
- [ ] BullMQ/Redis for job queue
- [ ] Webhook triggers
- [ ] More node types (Email, API call, etc.)
- [ ] Conditional branching
- [ ] Loop nodes
- [ ] Version control for workflows
- [ ] Team collaboration
- [ ] Puppeteer-based JS rendering for scraper

## License

MIT
