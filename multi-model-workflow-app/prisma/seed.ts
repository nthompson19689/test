/**
 * Database Seed Script
 * Creates example workflows for demonstration
 */

import { PrismaClient } from '@prisma/client';
import { v4 as uuid } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Example Workflow 1: Scrape URL -> Summarize -> Extract ICP pains -> Draft outbound email
  const workflow1Id = uuid();
  const scrapeNode1Id = uuid();
  const summarizeNode1Id = uuid();
  const analyzeNode1Id = uuid();
  const emailNode1Id = uuid();

  await prisma.workflow.create({
    data: {
      id: workflow1Id,
      name: 'Content to Cold Email Pipeline',
      description: 'Scrape a webpage, summarize it, extract ICP pains, and draft a personalized outbound email.',
      nodes: {
        create: [
          {
            id: scrapeNode1Id,
            name: 'scraper',
            nodeType: 'SCRAPE_URL',
            config: JSON.stringify({
              url: 'https://example.com/product-page',
            }),
            positionX: 100,
            positionY: 100,
          },
          {
            id: summarizeNode1Id,
            name: 'summarizer',
            nodeType: 'GENERATE_TEXT',
            config: JSON.stringify({
              prompt: 'Summarize the following webpage content in 2-3 paragraphs, focusing on the key value propositions and features:\n\n#scraper.clean_text',
              provider: 'openai',
              model: 'gpt-4o',
              apiKeyId: '', // User needs to set this
              temperature: 0.5,
            }),
            positionX: 100,
            positionY: 250,
          },
          {
            id: analyzeNode1Id,
            name: 'icp_analyzer',
            nodeType: 'ANALYZE',
            config: JSON.stringify({
              prompt: 'Based on this product summary, identify the Ideal Customer Profile (ICP) and their main pain points. Extract 3-5 specific pain points.\n\nSummary:\n#summarizer.text',
              provider: 'openai',
              model: 'gpt-4o',
              apiKeyId: '', // User needs to set this
              outputSchema: '{"icp_description": "string", "pain_points": ["string"], "value_alignment": ["string"]}',
            }),
            positionX: 100,
            positionY: 400,
          },
          {
            id: emailNode1Id,
            name: 'email_writer',
            nodeType: 'GENERATE_TEXT',
            config: JSON.stringify({
              prompt: 'Write a personalized cold outreach email for a prospect matching this ICP. Address their pain points and explain how the product solves them. Keep it under 150 words.\n\nICP Analysis:\n#icp_analyzer.json',
              provider: 'openai',
              model: 'gpt-4o',
              apiKeyId: '', // User needs to set this
              temperature: 0.7,
            }),
            positionX: 100,
            positionY: 550,
          },
        ],
      },
      edges: {
        create: [
          {
            id: uuid(),
            sourceNodeId: scrapeNode1Id,
            targetNodeId: summarizeNode1Id,
          },
          {
            id: uuid(),
            sourceNodeId: summarizeNode1Id,
            targetNodeId: analyzeNode1Id,
          },
          {
            id: uuid(),
            sourceNodeId: analyzeNode1Id,
            targetNodeId: emailNode1Id,
          },
        ],
      },
    },
  });

  console.log('Created workflow: Content to Cold Email Pipeline');

  // Example Workflow 2: Research topic -> Analyze pros/cons -> Generate LinkedIn post + Image prompt -> Generate image
  const workflow2Id = uuid();
  const researchNode2Id = uuid();
  const analyzeNode2Id = uuid();
  const postNode2Id = uuid();
  const imageNode2Id = uuid();

  await prisma.workflow.create({
    data: {
      id: workflow2Id,
      name: 'Research to LinkedIn Post with Image',
      description: 'Research a topic, analyze pros/cons, generate a LinkedIn post with an AI-generated image.',
      nodes: {
        create: [
          {
            id: researchNode2Id,
            name: 'researcher',
            nodeType: 'RESEARCH',
            config: JSON.stringify({
              prompt: 'Research the latest trends and developments in AI agents and autonomous AI systems. Include key companies, technologies, and use cases.',
              provider: 'perplexity',
              model: 'llama-3.1-sonar-large-128k-online',
              apiKeyId: '', // User needs to set this
            }),
            positionX: 100,
            positionY: 100,
          },
          {
            id: analyzeNode2Id,
            name: 'pros_cons',
            nodeType: 'ANALYZE',
            config: JSON.stringify({
              prompt: 'Analyze the following research on AI agents. Provide a balanced view of pros and cons, and identify the most important takeaways for business leaders.\n\nResearch:\n#researcher.text\n\nCitations:\n#researcher.citations',
              provider: 'openai',
              model: 'gpt-4o',
              apiKeyId: '', // User needs to set this
              outputSchema: '{"pros": ["string"], "cons": ["string"], "key_takeaways": ["string"], "recommended_image_prompt": "string"}',
            }),
            positionX: 100,
            positionY: 250,
          },
          {
            id: postNode2Id,
            name: 'linkedin_post',
            nodeType: 'GENERATE_TEXT',
            config: JSON.stringify({
              prompt: 'Write an engaging LinkedIn post about AI agents based on this analysis. Include:\n- A hook in the first line\n- 3-4 key insights\n- A call-to-action\n- Relevant hashtags\n\nAnalysis:\n#pros_cons.json\n\nKeep it under 280 characters for optimal engagement.',
              provider: 'anthropic',
              model: 'claude-3-5-sonnet-20241022',
              apiKeyId: '', // User needs to set this
              temperature: 0.8,
            }),
            positionX: 100,
            positionY: 400,
          },
          {
            id: imageNode2Id,
            name: 'post_image',
            nodeType: 'GENERATE_IMAGE',
            config: JSON.stringify({
              prompt: '#pros_cons.json | pick:recommended_image_prompt',
              provider: 'openai',
              apiKeyId: '', // User needs to set this
              size: '1792x1024',
            }),
            positionX: 350,
            positionY: 400,
          },
        ],
      },
      edges: {
        create: [
          {
            id: uuid(),
            sourceNodeId: researchNode2Id,
            targetNodeId: analyzeNode2Id,
          },
          {
            id: uuid(),
            sourceNodeId: analyzeNode2Id,
            targetNodeId: postNode2Id,
          },
          {
            id: uuid(),
            sourceNodeId: analyzeNode2Id,
            targetNodeId: imageNode2Id,
          },
        ],
      },
    },
  });

  console.log('Created workflow: Research to LinkedIn Post with Image');

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
