'use client';

import { useState } from 'react';
import type { HubTopic, SpokeKeyword } from '@/lib/types';

interface HubSpokeViewProps {
  hubs: HubTopic[];
}

export default function HubSpokeView({ hubs }: HubSpokeViewProps) {
  const [expandedHub, setExpandedHub] = useState<number | null>(0);

  const spokeTypeColors: Record<SpokeKeyword['type'], string> = {
    'how-to': 'bg-blue-100 text-blue-700',
    comparison: 'bg-orange-100 text-orange-700',
    list: 'bg-green-100 text-green-700',
    definition: 'bg-purple-100 text-purple-700',
    review: 'bg-yellow-100 text-yellow-700',
    guide: 'bg-indigo-100 text-indigo-700',
    general: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-base font-semibold text-gray-900">Hub &amp; Spoke Content Strategy</h3>
        <p className="text-xs text-gray-500 mt-1">
          Topic clusters organized by hub (pillar page) and spoke (supporting content) keywords.
          Each hub is a broad topic page linking to detailed spoke articles.
        </p>
      </div>

      <div className="divide-y divide-gray-100">
        {hubs.map((hub, hubIndex) => (
          <div key={hub.hubKeyword}>
            {/* Hub header */}
            <button
              onClick={() => setExpandedHub(expandedHub === hubIndex ? null : hubIndex)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                  H{hubIndex + 1}
                </div>
                <div>
                  <div className="font-semibold text-gray-900 text-sm">{hub.hubKeyword}</div>
                  <div className="text-xs text-gray-500">
                    {hub.spokeKeywords.length} spokes &middot;
                    Vol: {hub.hubSearchVolume.toLocaleString()} &middot;
                    KD: {hub.hubDifficulty} &middot;
                    Cluster vol: {hub.totalOpportunityVolume.toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-sm font-semibold text-green-600">
                    +{hub.estimatedTrafficPotential.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-gray-400">est. traffic</div>
                </div>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${expandedHub === hubIndex ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Spoke details */}
            {expandedHub === hubIndex && (
              <div className="px-4 pb-4">
                {/* Visual hub-spoke diagram */}
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <div className="px-3 py-1.5 bg-blue-600 text-white rounded-full text-xs font-semibold">
                      {hub.hubKeyword}
                    </div>
                    {hub.spokeKeywords.slice(0, 8).map(spoke => (
                      <div key={spoke.keyword} className="flex items-center gap-1">
                        <span className="text-gray-300">→</span>
                        <span className={`px-2 py-1 rounded-full text-[10px] font-medium ${spokeTypeColors[spoke.type]}`}>
                          {spoke.keyword}
                        </span>
                      </div>
                    ))}
                    {hub.spokeKeywords.length > 8 && (
                      <span className="text-xs text-gray-400">+{hub.spokeKeywords.length - 8} more</span>
                    )}
                  </div>
                </div>

                {/* Spoke table */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-3 py-2 font-medium text-gray-600 text-xs">Spoke Keyword</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-xs">Type</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-xs">Volume</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-xs">KD</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-xs">Current Rank</th>
                      <th className="px-3 py-2 font-medium text-gray-600 text-xs">Content Idea</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {hub.spokeKeywords.map((spoke, i) => (
                      <tr key={`${spoke.keyword}-${i}`} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-900 text-xs">{spoke.keyword}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${spokeTypeColors[spoke.type]}`}>
                            {spoke.type}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-700 text-xs">{spoke.searchVolume.toLocaleString()}</td>
                        <td className="px-3 py-2 text-gray-700 text-xs">{spoke.keywordDifficulty}</td>
                        <td className="px-3 py-2 text-xs">
                          {spoke.currentRanking ? (
                            <span className="text-blue-600">#{spoke.currentRanking}</span>
                          ) : (
                            <span className="text-green-600 font-medium">NEW</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{generateContentIdea(spoke)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function generateContentIdea(spoke: SpokeKeyword): string {
  switch (spoke.type) {
    case 'how-to':
      return `Step-by-step guide: "${spoke.keyword}"`;
    case 'comparison':
      return `Detailed comparison article with pros/cons`;
    case 'list':
      return `Curated list post with expert picks`;
    case 'definition':
      return `Comprehensive explainer with examples`;
    case 'review':
      return `In-depth review with user insights`;
    case 'guide':
      return `Ultimate guide covering all aspects`;
    default:
      return `Targeted article optimized for "${spoke.keyword}"`;
  }
}
