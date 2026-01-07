import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "../../../../lib/db";
import Link from "next/link";
import { ProjectDetailClient } from "./ProjectDetailClient";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  // Fetch project with all related data
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      mediaFiles: {
        include: {
          transcripts: {
            include: {
              generatedAssets: {
                orderBy: { createdAt: "desc" },
              },
            },
          },
          clips: {
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { uploadedAt: "desc" },
      },
    },
  });

  if (!project || project.userId !== session.user.id) {
    redirect("/projects");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-4">
              <Link href="/projects" className="text-sm text-gray-600 hover:text-gray-900">
                ← Back to Projects
              </Link>
              <h1 className="text-xl font-bold">{project.name}</h1>
            </div>
            <span className="text-sm text-gray-600">{session.user?.email}</span>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {project.description && (
          <p className="text-gray-600 mb-6">{project.description}</p>
        )}

        <ProjectDetailClient project={JSON.parse(JSON.stringify(project))} />
      </main>
    </div>
  );
}
