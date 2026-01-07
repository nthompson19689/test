"use client";

import { useState, useEffect } from "react";
import { generateAssets } from "../actions/assets";
import { getTables } from "../actions/tables";

interface AssetGeneratorFormProps {
  transcriptId: string;
  initialStart?: number;
  initialEnd?: number;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AssetGeneratorForm({
  transcriptId,
  initialStart,
  initialEnd,
  onClose,
  onSuccess,
}: AssetGeneratorFormProps) {
  const [name, setName] = useState("");
  const [useRange, setUseRange] = useState(false);
  const [startSeconds, setStartSeconds] = useState(initialStart || 0);
  const [endSeconds, setEndSeconds] = useState(initialEnd || 0);
  const [tables, setTables] = useState<any[]>([]);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTables, setLoadingTables] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTables();
  }, []);

  async function loadTables() {
    try {
      const data = await getTables();
      setTables(data);
      // Auto-select all tables by default
      setSelectedTableIds(data.map((t) => t.id));
    } catch (err) {
      console.error("Error loading tables:", err);
    } finally {
      setLoadingTables(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (useRange && endSeconds <= startSeconds) {
      setError("End time must be after start time");
      return;
    }

    setLoading(true);

    try {
      await generateAssets({
        transcriptId,
        name: name.trim() || undefined,
        startSeconds: useRange ? startSeconds : undefined,
        endSeconds: useRange ? endSeconds : undefined,
        tableIds: selectedTableIds.length > 0 ? selectedTableIds : undefined,
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("Error generating assets:", err);
      setError(err instanceof Error ? err.message : "Failed to generate assets");
    } finally {
      setLoading(false);
    }
  }

  function toggleTable(tableId: string) {
    setSelectedTableIds((prev) =>
      prev.includes(tableId)
        ? prev.filter((id) => id !== tableId)
        : [...prev, tableId]
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Generate Marketing Assets</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Asset Set Name (optional)
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Q4 Campaign Assets"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useRange}
                onChange={(e) => setUseRange(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Use specific transcript range
              </span>
            </label>
            <p className="text-xs text-gray-500 ml-6 mt-1">
              If unchecked, the entire transcript will be used
            </p>
          </div>

          {useRange && (
            <div className="grid grid-cols-2 gap-4 ml-6 p-3 bg-gray-50 rounded">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Start (seconds)
                </label>
                <input
                  type="number"
                  value={startSeconds}
                  onChange={(e) => setStartSeconds(Number(e.target.value))}
                  min={0}
                  step={0.1}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  End (seconds)
                </label>
                <input
                  type="number"
                  value={endSeconds}
                  onChange={(e) => setEndSeconds(Number(e.target.value))}
                  min={0}
                  step={0.1}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Context Tables ({selectedTableIds.length} selected)
            </label>
            {loadingTables ? (
              <div className="text-sm text-gray-500 p-3 bg-gray-50 rounded">
                Loading tables...
              </div>
            ) : tables.length === 0 ? (
              <div className="text-sm text-gray-500 p-3 bg-gray-50 rounded">
                No tables found. Create tables in the Brand Brain section to provide context.
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded p-3">
                {tables.map((table) => (
                  <label
                    key={table.id}
                    className="flex items-start gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTableIds.includes(table.id)}
                      onChange={() => toggleTable(table.id)}
                      className="mt-0.5 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{table.name}</div>
                      {table.description && (
                        <div className="text-xs text-gray-500">{table.description}</div>
                      )}
                      <div className="text-xs text-gray-400 mt-0.5">
                        {table._count?.rows || 0} row(s)
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-2">
              Selected tables will be used to retrieve brand context, audience insights, and proof
              points for asset generation.
            </p>
          </div>

          <div className="p-3 bg-blue-50 rounded text-sm text-blue-800">
            <strong>Generating:</strong> LinkedIn posts, blog outline, newsletter content, and
            hooks based on your transcript and selected context.
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
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
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? "Generating..." : "Generate Assets"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
