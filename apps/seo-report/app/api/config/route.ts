export async function GET() {
  return Response.json({
    hasCredentials: !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_API_KEY),
  });
}
