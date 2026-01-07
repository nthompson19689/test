import { getServerSession } from "next-auth";
import { authOptions } from "../lib/auth";
import { redirect } from "next/navigation";
import { getTables } from "../actions/tables";
import Link from "next/link";

export default async function TablesPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  const tables = await getTables();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-4">
              <Link href="/projects" className="text-sm text-gray-600 hover:text-gray-900">
                ← Back to Projects
              </Link>
              <h1 className="text-xl font-bold">Brand Brain Tables</h1>
            </div>
            <span className="text-sm text-gray-600">{session.user?.email}</span>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <p className="text-gray-600 mb-4">
            Tables store your brand voice, audience insights, and proof points. They're used to
            provide context when generating marketing assets.
          </p>

          <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
            New Table
          </button>
        </div>

        {tables.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">
              No tables yet. Create your first table to start building your brand brain.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tables.map((table) => (
              <Link
                key={table.id}
                href={`/tables/${table.id}`}
                className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
              >
                <h3 className="text-lg font-semibold mb-2">{table.name}</h3>
                {table.description && (
                  <p className="text-gray-600 text-sm mb-4">{table.description}</p>
                )}
                <div className="text-sm text-gray-500">{table._count.rows} row(s)</div>

                <div className="mt-4 text-xs text-gray-400">
                  Schema: {(table.schema as any).columns?.length || 0} column(s)
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-12 p-6 bg-blue-50 rounded-lg">
          <h3 className="font-semibold mb-2">How Tables Work</h3>
          <ul className="text-sm text-gray-700 space-y-2">
            <li>
              • <strong>Brand Voice:</strong> Store tone, style, and formatting guidelines
            </li>
            <li>
              • <strong>ICP/Audience:</strong> Define personas, pain points, and motivations
            </li>
            <li>
              • <strong>Proof Points:</strong> Track claims, evidence, and sources
            </li>
            <li>
              • Each row is automatically embedded for semantic search during asset generation
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
