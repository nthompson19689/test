'use client';

import { useState, useMemo } from 'react';
import type { KeywordOpportunity } from '@/lib/types';

interface OpportunitiesTableProps {
  opportunities: KeywordOpportunity[];
}

export default function OpportunitiesTable({ opportunities }: OpportunitiesTableProps) {
  const [filter, setFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'gap' | 'suggestion' | 'related'>('all');
  const [page, setPage] = useState(0);
  const perPage = 25;

  const filtered = useMemo(() => {
    let result = opportunities;
    if (sourceFilter !== 'all') {
      result = result.filter(k => k.source === sourceFilter);
    }
    if (filter) {
      const q = filter.toLowerCase();
      result = result.filter(k => k.keyword.toLowerCase().includes(q));
    }
    return result;
  }, [opportunities, filter, sourceFilter]);

  const paged = filtered.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  const sourceCounts = useMemo(() => ({
    all: opportunities.length,
    gap: opportunities.filter(k => k.source === 'gap').length,
    suggestion: opportunities.filter(k => k.source === 'suggestion').length,
    related: opportunities.filter(k => k.source === 'related').length,
  }), [opportunities]);

  const sourceColors: Record<string, string> = {
    gap: 'bg-red-100 text-red-700',
    suggestion: 'bg-blue-100 text-blue-700',
    related: 'bg-green-100 text-green-700',
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Net New Opportunities ({filtered.length})</h3>
            <p className="text-xs text-gray-500 mt-1">Keywords you don&apos;t currently rank for with high potential</p>
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex gap-1">
              {(['all', 'gap', 'suggestion', 'related'] as const).map(source => (
                <button
                  key={source}
                  onClick={() => { setSourceFilter(source); setPage(0); }}
                  className={`px-2 py-1 text-xs rounded-md font-medium transition-colors ${
                    sourceFilter === source
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {source === 'all' ? 'All' : source.charAt(0).toUpperCase() + source.slice(1)} ({sourceCounts[source]})
                </button>
              ))}
            </div>
            <input
              type="text"
              value={filter}
              onChange={e => { setFilter(e.target.value); setPage(0); }}
              placeholder="Filter..."
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md w-48 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-2 font-medium text-gray-600">Keyword</th>
              <th className="px-4 py-2 font-medium text-gray-600">Volume</th>
              <th className="px-4 py-2 font-medium text-gray-600">KD</th>
              <th className="px-4 py-2 font-medium text-gray-600">CPC</th>
              <th className="px-4 py-2 font-medium text-gray-600">Competition</th>
              <th className="px-4 py-2 font-medium text-gray-600">Source</th>
              <th className="px-4 py-2 font-medium text-gray-600">Relevance</th>
              <th className="px-4 py-2 font-medium text-gray-600">Intent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paged.map((kw, i) => (
              <tr key={`${kw.keyword}-${i}`} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-900 max-w-[300px] truncate">{kw.keyword}</td>
                <td className="px-4 py-2 text-gray-700">{kw.searchVolume.toLocaleString()}</td>
                <td className="px-4 py-2 text-gray-700">{kw.keywordDifficulty}</td>
                <td className="px-4 py-2 text-gray-700">${kw.cpc.toFixed(2)}</td>
                <td className="px-4 py-2 text-gray-700">{(kw.competition * 100).toFixed(0)}%</td>
                <td className="px-4 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${sourceColors[kw.source] || 'bg-gray-100'}`}>
                    {kw.source}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <RelevanceBar value={kw.relevanceScore} />
                </td>
                <td className="px-4 py-2">
                  <span className="text-xs text-gray-500">{kw.intent[0]?.slice(0, 5) || '—'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="p-3 border-t border-gray-200 flex items-center justify-between">
          <span className="text-sm text-gray-500">Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50"
            >
              Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 text-sm border rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RelevanceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-gray-400';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-10 h-1.5 bg-gray-200 rounded-full">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-600">{pct}%</span>
    </div>
  );
}
