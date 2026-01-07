"use client";

import { useState } from "react";
import { TableRowEditor } from "../../../components/TableRowEditor";
import { deleteTableRow } from "../../../actions/tables";

interface TableDetailClientProps {
  table: any;
}

export function TableDetailClient({ table }: TableDetailClientProps) {
  const [showEditor, setShowEditor] = useState(false);
  const [editingRow, setEditingRow] = useState<any>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  function handleEdit(row: any) {
    setEditingRow(row);
    setShowEditor(true);
  }

  function handleAdd() {
    setEditingRow(null);
    setShowEditor(true);
  }

  async function handleDelete(rowId: string) {
    if (!confirm("Are you sure you want to delete this row?")) {
      return;
    }

    try {
      await deleteTableRow(rowId);
      window.location.reload();
    } catch (error) {
      console.error("Error deleting row:", error);
      alert("Failed to delete row");
    }
  }

  function handleSuccess() {
    window.location.reload();
  }

  const columns = (table.schema as any).columns || [];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold">Rows ({table.rows.length})</h2>
          <p className="text-sm text-gray-600 mt-1">
            {columns.length} column(s) • Each row is automatically embedded for semantic search
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Add Row
        </button>
      </div>

      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <h3 className="font-semibold text-sm">Schema</h3>
          <div className="mt-2 space-y-1">
            {columns.map((col: any) => (
              <div key={col.name} className="text-sm">
                <span className="font-mono text-blue-600">{col.name}</span>
                <span className="text-gray-500 mx-2">({col.type})</span>
                {col.description && (
                  <span className="text-gray-600">- {col.description}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {table.rows.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500">
            No rows yet. Add your first row to start building your knowledge base.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {table.rows.map((row: any) => (
            <div key={row.id} className="bg-white rounded-lg shadow">
              <div className="p-4">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    {columns.slice(0, 2).map((col: any) => {
                      const value = row.data[col.name];
                      if (!value) return null;

                      return (
                        <div key={col.name} className="mb-2">
                          <span className="text-xs font-medium text-gray-500 uppercase">
                            {col.name}
                          </span>
                          <p className="text-sm text-gray-900 mt-0.5 break-words">
                            {typeof value === "object"
                              ? JSON.stringify(value)
                              : String(value).slice(0, 200)}
                            {String(value).length > 200 && "..."}
                          </p>
                        </div>
                      );
                    })}

                    {expandedRow === row.id && columns.length > 2 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        {columns.slice(2).map((col: any) => {
                          const value = row.data[col.name];
                          if (!value) return null;

                          return (
                            <div key={col.name} className="mb-2">
                              <span className="text-xs font-medium text-gray-500 uppercase">
                                {col.name}
                              </span>
                              <p className="text-sm text-gray-900 mt-0.5 break-words">
                                {typeof value === "object"
                                  ? JSON.stringify(value, null, 2)
                                  : String(value)}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleEdit(row)}
                      className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(row.id)}
                      className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {columns.length > 2 && (
                  <button
                    onClick={() =>
                      setExpandedRow(expandedRow === row.id ? null : row.id)
                    }
                    className="mt-3 text-xs text-blue-600 hover:text-blue-800"
                  >
                    {expandedRow === row.id
                      ? "Show less"
                      : `Show ${columns.length - 2} more field(s)`}
                  </button>
                )}
              </div>

              {row.textContent && (
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                  <details className="text-xs">
                    <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
                      View embedded text content
                    </summary>
                    <pre className="mt-2 text-gray-700 whitespace-pre-wrap font-mono">
                      {row.textContent}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showEditor && (
        <TableRowEditor
          tableId={table.id}
          tableName={table.name}
          schema={table.schema}
          existingRow={editingRow}
          onClose={() => {
            setShowEditor(false);
            setEditingRow(null);
          }}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
