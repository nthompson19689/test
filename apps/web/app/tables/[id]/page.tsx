import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import { redirect } from "next/navigation";
import { getTable } from "../../actions/tables";
import Link from "next/link";
import { TableDetailClient } from "./TableDetailClient";

export default async function TableDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/auth/signin");
  }

  const table = await getTable(params.id);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-4">
              <Link href="/tables" className="text-sm text-gray-600 hover:text-gray-900">
                ← Back to Tables
              </Link>
              <h1 className="text-xl font-bold">{table.name}</h1>
            </div>
            <span className="text-sm text-gray-600">{session.user?.email}</span>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {table.description && (
          <p className="text-gray-600 mb-6">{table.description}</p>
        )}

        <TableDetailClient table={JSON.parse(JSON.stringify(table))} />
      </main>
    </div>
  );
}
