'use client';

import type { CompetitorDomain, CompetitorKeyword } from '@/lib/types';
import { useState } from 'react';

interface CompetitorTableProps {
  competitors: CompetitorDomain[];
  competitorKeywords: CompetitorKeyword[];
  clientDomain: string;
}

export default function CompetitorTable({ competitors, competitorKeywords, clientDomain }: CompetitorTableProps) {
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);
  const [showGaps, setShowGaps] = useState(false);

  const filteredGaps = selectedCompetitor
    ? competitorKeywords.filter(k => k.competitorDomain === selectedCompetitor)
    : competitorKeywords;

  return (
    <div className="space-y-4">
      {/* Competitor overview */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">Top Competitors for {clientDomain}</h3>
          <p className="text-xs text-gray-500 mt-1">Domains competing for the same keywords, ordered by average ranking position</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-2 font-medium text-gray-600">Competitor</th>
                <th className="px-4 py-2 font-medium text-gray-600">Avg Position</th>
                <th className="px-4 py-2 font-medium text-gray-600">Common Keywords</th>
                <th className="px-4 py-2 font-medium text-gray-600">Organic Traffic</th>
                <th className="px-4 py-2 font-medium text-gray-600">Total Keywords</th>
                <th className="px-4 py-2 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {competitors.map(comp => (
                <tr key={comp.domain} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{comp.domain}</td>
                  <td className="px-4 py-2 text-gray-700">{comp.avgPosition.toFixed(1)}</td>
                  <td className="px-4 py-2 text-gray-700">{comp.commonKeywords.toLocaleString()}</td>
                  <td className="px-4 py-2 text-gray-700">{comp.organicTraffic.toLocaleString()}</td>
                  <td className="px-4 py-2 text-gray-700">{comp.organicKeywords.toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => {
                        setSelectedCompetitor(comp.domain);
                        setShowGaps(true);
                      }}
                      className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                    >
                      View gaps
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Keyword gaps */}
      {showGaps && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  Keyword Gaps {selectedCompetitor && `— ${selectedCompetitor}`}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Keywords competitors rank for that {clientDomain} does not ({filteredGaps.length} keywords)
                </p>
              </div>
              <div className="flex gap-2">
                {selectedCompetitor && (
                  <button
                    onClick={() => setSelectedCompetitor(null)}
                    className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1 border rounded"
                  >
                    Show all
                  </button>
                )}
                <button
                  onClick={() => setShowGaps(false)}
                  className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1 border rounded"
                >
                  Hide
                </button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium text-gray-600">Keyword</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Competitor Pos</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Volume</th>
                  <th className="px-4 py-2 font-medium text-gray-600">KD</th>
                  <th className="px-4 py-2 font-medium text-gray-600">CPC</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Competitor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredGaps.slice(0, 100).map((kw, i) => (
                  <tr key={`${kw.keyword}-${i}`} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{kw.keyword}</td>
                    <td className="px-4 py-2 text-gray-700">#{kw.position}</td>
                    <td className="px-4 py-2 text-gray-700">{kw.searchVolume.toLocaleString()}</td>
                    <td className="px-4 py-2 text-gray-700">{kw.keywordDifficulty}</td>
                    <td className="px-4 py-2 text-gray-700">${kw.cpc.toFixed(2)}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{kw.competitorDomain}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
