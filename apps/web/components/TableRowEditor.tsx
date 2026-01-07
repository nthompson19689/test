"use client";

import { useState } from "react";
import { createTableRow, updateTableRow } from "../actions/tables";

interface TableSchema {
  columns: Array<{
    name: string;
    type: string;
    description?: string;
  }>;
}

interface TableRowEditorProps {
  tableId: string;
  tableName: string;
  schema: TableSchema;
  existingRow?: {
    id: string;
    data: any;
  };
  onClose: () => void;
  onSuccess?: () => void;
}

export function TableRowEditor({
  tableId,
  tableName,
  schema,
  existingRow,
  onClose,
  onSuccess,
}: TableRowEditorProps) {
  const [formData, setFormData] = useState<Record<string, any>>(
    existingRow?.data || {}
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (existingRow) {
        await updateTableRow(existingRow.id, formData);
      } else {
        await createTableRow(tableId, formData);
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("Error saving row:", err);
      setError(err instanceof Error ? err.message : "Failed to save row");
    } finally {
      setLoading(false);
    }
  }

  function handleFieldChange(fieldName: string, value: any) {
    setFormData((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  }

  function renderField(column: any) {
    const value = formData[column.name] || "";

    switch (column.type) {
      case "text":
      case "string":
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleFieldChange(column.name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={column.description || `Enter ${column.name}`}
          />
        );

      case "textarea":
      case "long_text":
        return (
          <textarea
            value={value}
            onChange={(e) => handleFieldChange(column.name, e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={column.description || `Enter ${column.name}`}
          />
        );

      case "number":
        return (
          <input
            type="number"
            value={value}
            onChange={(e) => handleFieldChange(column.name, Number(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={column.description || `Enter ${column.name}`}
          />
        );

      case "boolean":
        return (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => handleFieldChange(column.name, e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-600">
              {column.description || column.name}
            </span>
          </label>
        );

      default:
        return (
          <textarea
            value={typeof value === "object" ? JSON.stringify(value, null, 2) : value}
            onChange={(e) => handleFieldChange(column.name, e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            placeholder={column.description || `Enter ${column.name}`}
          />
        );
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-2">
          {existingRow ? "Edit Row" : "Add Row"} - {tableName}
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Fill in the fields below. Your data will be automatically embedded for semantic search.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {schema.columns.map((column) => (
            <div key={column.name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {column.name.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                {column.description && (
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    {column.description}
                  </span>
                )}
              </label>
              {renderField(column)}
            </div>
          ))}

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading
                ? "Saving..."
                : existingRow
                ? "Update Row"
                : "Create Row"}
            </button>
          </div>
        </form>

        <div className="mt-4 p-3 bg-blue-50 rounded text-xs text-blue-800">
          <strong>Note:</strong> After saving, a background job will generate an embedding for
          semantic search. This usually takes a few seconds.
        </div>
      </div>
    </div>
  );
}
