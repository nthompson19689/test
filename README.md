# Transcript-to-Assets MVP

A production-minded MVP for transforming audio/video transcripts into marketing assets using AI, with brand-aware context retrieval via semantic search.

## Features

- **Media Upload & Transcription**: Upload audio/video files, transcribe with timestamps
- **Clip Generation**: Select transcript ranges to generate video clips in multiple aspect ratios (9:16, 1:1, 16:9)
- **Brand-Aware Asset Generation**: Generate LinkedIn posts, blog outlines, newsletters, and hooks
- **Semantic Tables**: Store brand voice, ICP, and proof points with pgvector embeddings for context retrieval
- **Background Worker**: Async processing for transcription, clips, assets, and embeddings
- **BYOK (Bring Your Own Key)**: Encrypted storage of user API keys for LLM and transcription services

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Server Actions
- **Database**: PostgreSQL with pgvector extension
- **ORM**: Prisma
- **Storage**: S3-compatible object storage
- **Media Processing**: FFmpeg
- **AI**: OpenAI (GPT-4, Whisper, text-embedding-3-small)
- **Worker**: Node.js background process

## Repository Structure

```
/apps/web          # Next.js web application
  /app             # App router pages
  /components      # React components
  /actions         # Server actions
  /lib             # Web-specific utilities
/apps/worker       # Background worker process
  worker.ts        # Main worker loop
  /processors      # Job processors
/lib               # Shared library modules
  db.ts            # Prisma client
  storage.ts       # S3 operations
  crypto.ts        # Encryption for API keys
  embeddings.ts    # Embedding generation
  retrieval.ts     # Semantic search
  llm.ts           # LLM interactions
  transcription.ts # Transcription API
  ffmpeg.ts        # Media processing
/prisma            # Database schema and migrations
/scripts           # Utility scripts
```

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ with pgvector extension
- FFmpeg installed
- S3-compatible storage (AWS S3, MinIO, etc.)
- OpenAI API key (or user BYOK)

## Local Development Setup

### 1. Install PostgreSQL with pgvector

```bash
# macOS
brew install postgresql@15
brew install pgvector

# Ubuntu/Debian
sudo apt-get install postgresql-15 postgresql-15-pgvector

# Start PostgreSQL
brew services start postgresql@15  # macOS
sudo systemctl start postgresql    # Linux
```

### 2. Create Database

```bash
createdb transcript_assets
psql transcript_assets -c "CREATE EXTENSION vector;"
```

### 3. Install FFmpeg

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg
```

### 4. Clone and Install Dependencies

```bash
git clone <repository-url>
cd transcript-to-assets-mvp
npm install
```

### 5. Configure Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

**Required variables:**

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/transcript_assets?schema=public"

# S3 Storage
S3_ENDPOINT="https://s3.amazonaws.com"
S3_REGION="us-east-1"
S3_ACCESS_KEY_ID="your_access_key"
S3_SECRET_ACCESS_KEY="your_secret_key"
S3_BUCKET="transcript-assets"

# Encryption (must be exactly 32 characters)
ENCRYPTION_KEY="your-32-character-encryption-key"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-nextauth-secret-key-here"

# Optional: System API keys (fallback if user doesn't provide BYOK)
OPENAI_API_KEY="sk-..."
```

### 6. Run Database Migrations

```bash
npm run db:generate
npm run db:migrate
```

### 7. Seed Database (Optional)

```bash
npm run db:seed
```

This creates:
- Demo user (`demo@example.com`)
- Default Brand Voice table with sample guidelines
- ICP/Audience table with sample personas
- Proof Points table with sample claims

### 8. Start Development Servers

**Terminal 1 - Web App:**
```bash
npm run dev
```

**Terminal 2 - Worker:**
```bash
npm run worker
```

The web app runs on `http://localhost:3000`.

## Usage

### 1. Sign In

- Navigate to `http://localhost:3000`
- Enter any email (MVP mode: no password required)
- User is auto-created on first sign-in

### 2. Create a Project

- Click "New Project"
- Enter project name and description
- Projects organize your media files

### 3. Upload Media

- In a project, click "Upload"
- Select audio or video file
- File is uploaded to S3 and transcription job is queued
- Worker processes transcription automatically

### 4. Set Up Tables (Brand Brain)

- Navigate to "Tables"
- Create tables for:
  - **Brand Voice**: Tone, style, formatting guidelines
  - **ICP/Audience**: Personas, pain points, motivations
  - **Proof Points**: Claims, evidence, sources
- Add rows to each table
- Embeddings are generated automatically

### 5. Generate Assets

- In a project with a transcribed media file
- Select transcript range (or use full transcript)
- Click "Generate Assets"
- System retrieves relevant context from tables
- Generates: LinkedIn posts, blog outline, newsletter, hooks

### 6. Create Clips

- In a project with media file
- Select transcript time range
- Choose aspect ratio (9:16, 1:1, 16:9)
- Toggle captions on/off
- Click "Generate Clip"
- Worker processes clip with FFmpeg

## How the Worker Works

The worker is a standalone Node.js process that:

1. **Polls** the `jobs` table every 5 seconds (configurable)
2. **Locks** jobs transactionally to prevent duplicate processing
3. **Processes** jobs by type:
   - `TRANSCRIBE`: Downloads media, calls Whisper API, stores transcript
   - `MAKE_CLIP`: Downloads media, runs FFmpeg, uploads clip
   - `GENERATE_ASSETS`: Retrieves context, calls LLM, stores output
   - `EMBED_TABLE_ROW`: Generates embedding, updates row
4. **Retries** failed jobs with exponential backoff (up to 3 attempts)
5. **Logs** progress and errors

**To run worker in production:**
```bash
npm run worker
```

**To run multiple workers:**
```bash
WORKER_ID=worker-1 npm run worker &
WORKER_ID=worker-2 npm run worker &
```

## How Tables Work

Tables are structured memory for brand context:

**Table Schema:**
- Defined as JSON with columns: `{columns: [{name, type, description}]}`
- Example: Brand Voice has columns: `guideline`, `example`, `category`

**Table Rows:**
- Each row is JSON data matching the schema
- On insert/update, row is flattened into text: `"Table: Brand Voice\nguideline: Use conversational tone\n..."`
- Text is embedded using OpenAI `text-embedding-3-small` (1536 dimensions)
- Embedding stored in pgvector column

**Semantic Retrieval:**
- Query text is embedded
- pgvector cosine similarity search finds top-K relevant rows
- Retrieved rows are injected into LLM prompt for asset generation

**Add New Table Type:**

1. Create table with appropriate schema
2. Add rows with relevant data
3. Embeddings are auto-generated by worker
4. Retrieval automatically includes your table

## API Key Management (BYOK)

Users can provide their own API keys for:
- OpenAI (GPT, Whisper, Embeddings)
- Anthropic (future)
- AssemblyAI (future)

**Storage:**
- Keys are encrypted using AES-256-CBC
- Encryption key from `ENCRYPTION_KEY` env var
- Each key has unique initialization vector (IV)
- Stored in `user_secrets` table

**Fallback:**
- If user doesn't provide key, system uses `OPENAI_API_KEY` from env

## Database Schema

Key tables:

- **users**: User accounts
- **user_secrets**: Encrypted API keys
- **projects**: User projects
- **media_files**: Uploaded audio/video
- **transcripts**: Timestamped transcript segments
- **clips**: Generated video clips
- **generated_assets**: AI-generated marketing assets
- **tables**: Brand Brain tables (schema definitions)
- **table_rows**: Table data with embeddings (pgvector)
- **jobs**: Background job queue

## Known Limitations

- **MVP Authentication**: Email-only (no password). Add proper auth for production.
- **No Real-Time Updates**: Job status requires page refresh. Add polling or websockets.
- **Single Worker**: For production, run multiple workers and add distributed locking.
- **No File Size Limits**: Add validation for file size and duration.
- **Minimal Error Handling**: Add comprehensive error boundaries and user feedback.
- **No Observability**: Add logging, metrics, and monitoring.
- **FFmpeg Subtitles**: May fail if system fonts missing. Test caption burning.

## Production Deployment

**Web App:**
- Deploy to Vercel, Railway, or similar
- Set environment variables
- Ensure `DATABASE_URL` points to production PostgreSQL with pgvector

**Worker:**
- Deploy as separate service (e.g., Railway background worker)
- Set same `DATABASE_URL` and other env vars
- Run multiple instances for redundancy
- Monitor job queue depth

**Database:**
- Use managed PostgreSQL with pgvector support
- Enable connection pooling
- Regular backups
- Index optimization for large datasets

**Storage:**
- Use production S3 or compatible service
- Enable bucket versioning
- Set up lifecycle policies for old files
- Configure CORS for direct uploads

## Adding New Job Types

1. **Define Job Payload Type** (in processor file)
2. **Add Processor** to `/apps/worker/processors/`
3. **Update Worker** to handle new job type in `worker.ts`
4. **Create Job** from web app using `prisma.job.create()`

Example:

```typescript
// processors/my-task.ts
export interface MyTaskPayload {
  someId: string;
  userId: string;
}

export async function processMyTask(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  const payload = job!.payload as MyTaskPayload;

  // Do work...

  return { success: true };
}

// worker.ts
case JobType.MY_TASK:
  result = await processMyTask(jobId);
  break;
```

## Development Scripts

```bash
npm run dev              # Start Next.js dev server
npm run build            # Build for production
npm run start            # Start production server
npm run worker           # Start worker process
npm run db:generate      # Generate Prisma client
npm run db:migrate       # Run migrations
npm run db:push          # Push schema (skip migrations)
npm run db:seed          # Seed database
npm run db:studio        # Open Prisma Studio
npm run lint             # Lint code
npm run type-check       # TypeScript check
```

## License

MIT

## Support

For issues, questions, or contributions, please open an issue on GitHub.
