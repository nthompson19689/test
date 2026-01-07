import { prisma } from "../lib/db";

async function main() {
  console.log("Seeding database...");

  // Create a demo user
  const demoUser = await prisma.user.upsert({
    where: { email: "demo@example.com" },
    update: {},
    create: {
      email: "demo@example.com",
      name: "Demo User",
    },
  });

  console.log(`Created demo user: ${demoUser.email}`);

  // Create default Brand Brain tables
  const brandVoiceTable = await prisma.table.upsert({
    where: {
      id: "seed-brand-voice",
    },
    update: {},
    create: {
      id: "seed-brand-voice",
      userId: demoUser.id,
      name: "Brand Voice Guidelines",
      description: "Rules and guidelines for brand voice and tone",
      schema: {
        columns: [
          {
            name: "guideline",
            type: "text",
            description: "The brand voice guideline or rule",
          },
          {
            name: "example",
            type: "text",
            description: "Example of this guideline in action",
          },
          {
            name: "category",
            type: "text",
            description: "Category (tone, style, formatting, etc.)",
          },
        ],
      },
    },
  });

  console.log(`Created table: ${brandVoiceTable.name}`);

  // Seed brand voice rows
  const brandVoiceRows = [
    {
      guideline: "Use conversational, friendly tone",
      example: "Instead of 'utilize', say 'use'. Instead of 'purchase', say 'buy'.",
      category: "tone",
    },
    {
      guideline: "Be direct and actionable",
      example: "Start sentences with verbs. 'Start your free trial' not 'You can start a free trial'",
      category: "style",
    },
    {
      guideline: "Avoid jargon and corporate speak",
      example: "Say 'work together' instead of 'synergize'. Say 'improve' instead of 'optimize'.",
      category: "tone",
    },
  ];

  for (const data of brandVoiceRows) {
    await prisma.tableRow.create({
      data: {
        tableId: brandVoiceTable.id,
        userId: demoUser.id,
        data,
        textContent: `Table: ${brandVoiceTable.name}\nguideline: ${data.guideline}\nexample: ${data.example}\ncategory: ${data.category}`,
      },
    });
  }

  console.log(`Created ${brandVoiceRows.length} brand voice rows`);

  // Create ICP/Audience table
  const icpTable = await prisma.table.upsert({
    where: {
      id: "seed-icp",
    },
    update: {},
    create: {
      id: "seed-icp",
      userId: demoUser.id,
      name: "ICP & Target Audience",
      description: "Ideal customer profile, pain points, and motivations",
      schema: {
        columns: [
          {
            name: "persona",
            type: "text",
            description: "Persona name or title",
          },
          {
            name: "pain_point",
            type: "text",
            description: "Key pain point or challenge",
          },
          {
            name: "motivation",
            type: "text",
            description: "What motivates them",
          },
        ],
      },
    },
  });

  console.log(`Created table: ${icpTable.name}`);

  const icpRows = [
    {
      persona: "Marketing Manager",
      pain_point: "Struggles to create content consistently across channels",
      motivation: "Wants to scale content production without hiring more writers",
    },
    {
      persona: "Content Creator",
      pain_point: "Spends hours repurposing video content into written formats",
      motivation: "Wants to maximize the ROI of every video produced",
    },
  ];

  for (const data of icpRows) {
    await prisma.tableRow.create({
      data: {
        tableId: icpTable.id,
        userId: demoUser.id,
        data,
        textContent: `Table: ${icpTable.name}\npersona: ${data.persona}\npain_point: ${data.pain_point}\nmotivation: ${data.motivation}`,
      },
    });
  }

  console.log(`Created ${icpRows.length} ICP rows`);

  // Create proof points table
  const proofTable = await prisma.table.upsert({
    where: {
      id: "seed-proof",
    },
    update: {},
    create: {
      id: "seed-proof",
      userId: demoUser.id,
      name: "Proof Points & Claims",
      description: "Facts, statistics, and validated claims to support messaging",
      schema: {
        columns: [
          {
            name: "claim",
            type: "text",
            description: "The claim or statement",
          },
          {
            name: "evidence",
            type: "text",
            description: "Evidence or data supporting the claim",
          },
          {
            name: "source",
            type: "text",
            description: "Source of the data",
          },
        ],
      },
    },
  });

  console.log(`Created table: ${proofTable.name}`);

  const proofRows = [
    {
      claim: "AI can reduce content creation time by 70%",
      evidence: "Internal study of 50 customers showed average time savings of 70%",
      source: "Q1 2024 customer survey",
    },
    {
      claim: "Video content gets 10x more engagement",
      evidence: "HubSpot 2023 Marketing Report shows video has 10x engagement vs text",
      source: "HubSpot Marketing Report 2023",
    },
  ];

  for (const data of proofRows) {
    await prisma.tableRow.create({
      data: {
        tableId: proofTable.id,
        userId: demoUser.id,
        data,
        textContent: `Table: ${proofTable.name}\nclaim: ${data.claim}\nevidence: ${data.evidence}\nsource: ${data.source}`,
      },
    });
  }

  console.log(`Created ${proofRows.length} proof point rows`);

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
