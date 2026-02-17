'use client';

import { useState, useMemo } from 'react';
import type { RankedKeyword } from '@/lib/types';

interface RankingsTableProps {
  rankings: RankedKeyword[];
}

type SortKey = 'position' | 'searchVolume' | 'estimatedTraffic' | 'keywordDifficulty' | 'cpc';

export default function RankingsTable({ rankings }: RankingsTableProps) {
  const [sortBy, setSortBy] = useState<SortKey>('searchVolume');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const perPage = 25;

  const filtered = useMemo(() => {
    let result = rankings;
    if (filter) {
      const q = filter.toLowerCase();
      result = result.filter(k => k.keyword.toLowerCase().includes(q) || k.url.toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      const diff = (a[sortBy] as number) - (b[sortBy] as number);
      return sortDir === 'asc' ? diff : -diff;
    });
    return result;
  }, [rankings, filter, sortBy, sortDir]);

  const paged = filtered.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir('desc');
    }
    setPage(0);
  };

  const sortIcon = (key: SortKey) => {
    if (sortBy !== key) return '↕';
    return sortDir === 'asc' ? '↑' : '↓';
  };

  const positionBadge = (pos: number) => {
    if (pos <= 3) return 'bg-green-100 text-green-800';
    if (pos <= 10) return 'bg-blue-100 text-blue-800';
    if (pos <= 20) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Current Rankings ({filtered.length})</h3>
          <input
            type="text"
            value={filter}
            onChange={e => { setFilter(e.target.value); setPage(0); }}
            placeholder="Filter keywords..."
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md w-64 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-2 font-medium text-gray-600">Keyword</th>
              <th className="px-4 py-2 font-medium text-gray-600 cursor-pointer whitespace-nowrap" onClick={() => toggleSort('position')}>
                Pos {sortIcon('position')}
              </th>
              <th className="px-4 py-2 font-medium text-gray-600 cursor-pointer whitespace-nowrap" onClick={() => toggleSort('searchVolume')}>
                Volume {sortIcon('searchVolume')}
              </th>
              <th className="px-4 py-2 font-medium text-gray-600 cursor-pointer whitespace-nowrap" onClick={() => toggleSort('estimatedTraffic')}>
                Est. Traffic {sortIcon('estimatedTraffic')}
              </th>
              <th className="px-4 py-2 font-medium text-gray-600 cursor-pointer whitespace-nowrap" onClick={() => toggleSort('keywordDifficulty')}>
                KD {sortIcon('keywordDifficulty')}
              </th>
              <th className="px-4 py-2 font-medium text-gray-600 cursor-pointer whitespace-nowrap" onClick={() => toggleSort('cpc')}>
                CPC {sortIcon('cpc')}
              </th>
              <th className="px-4 py-2 font-medium text-gray-600">Intent</th>
              <th className="px-4 py-2 font-medium text-gray-600">URL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paged.map((kw, i) => (
              <tr key={`${kw.keyword}-${i}`} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-900 max-w-[250px] truncate">{kw.keyword}</td>
                <td className="px-4 py-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${positionBadge(kw.position)}`}>
                    #{kw.position}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-700">{kw.searchVolume.toLocaleString()}</td>
                <td className="px-4 py-2 text-gray-700">{kw.estimatedTraffic.toLocaleString()}</td>
                <td className="px-4 py-2">
                  <DifficultyBar value={kw.keywordDifficulty} />
                </td>
                <td className="px-4 py-2 text-gray-700">${kw.cpc.toFixed(2)}</td>
                <td className="px-4 py-2">
                  <IntentBadges intents={kw.intent} />
                </td>
                <td className="px-4 py-2 text-gray-500 max-w-[200px] truncate text-xs">{kw.url}</td>
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

function DifficultyBar({ value }: { value: number }) {
  const color = value <= 30 ? 'bg-green-500' : value <= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-gray-200 rounded-full">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-gray-600">{value}</span>
    </div>
  );
}

function IntentBadges({ intents }: { intents: string[] }) {
  const intentColors: Record<string, string> = {
    informational: 'bg-blue-100 text-blue-700',
    commercial: 'bg-green-100 text-green-700',
    transactional: 'bg-orange-100 text-orange-700',
    navigational: 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="flex gap-1">
      {intents.slice(0, 2).map(intent => (
        <span
          key={intent}
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${intentColors[intent] || 'bg-gray-100 text-gray-600'}`}
        >
          {intent?.slice(0, 4)}
        </span>
      ))}
    </div>
  );
}
