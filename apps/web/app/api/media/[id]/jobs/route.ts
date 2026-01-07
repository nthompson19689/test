import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { prisma } from "../../../../../../lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get jobs related to this media file
    const jobs = await prisma.job.findMany({
      where: {
        userId: session.user.id,
        OR: [
          { payload: { path: ["mediaFileId"], equals: params.id } },
          { payload: { path: ["clipId"], string_contains: params.id } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json(jobs);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
