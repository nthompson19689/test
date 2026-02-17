'use client';

import type { ContentRefreshSuggestion } from '@/lib/types';

interface RefreshSuggestionsProps {
  suggestions: ContentRefreshSuggestion[];
}

export default function RefreshSuggestions({ suggestions }: RefreshSuggestionsProps) {
  const priorityColors: Record<string, string> = {
    high: 'bg-red-100 text-red-700 border-red-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low: 'bg-gray-100 text-gray-600 border-gray-200',
  };

  const actionLabels: Record<string, string> = {
    optimize_title: 'Optimize Title & Meta',
    expand_content: 'Expand Content',
    add_sections: 'Add New Sections',
    update_freshness: 'Update for Freshness',
    improve_internal_links: 'Improve Internal Links',
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-base font-semibold text-gray-900">Content Refresh Suggestions ({suggestions.length})</h3>
        <p className="text-xs text-gray-500 mt-1">Existing pages that can be optimized for higher rankings and more traffic</p>
      </div>
      <div className="divide-y divide-gray-100">
        {suggestions.slice(0, 30).map((suggestion, i) => (
          <div key={`${suggestion.keyword}-${i}`} className="p-4 hover:bg-gray-50">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-900 text-sm">{suggestion.keyword}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${priorityColors[suggestion.priority]}`}>
                    {suggestion.priority}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">
                    {actionLabels[suggestion.action]}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-1.5">{suggestion.reason}</p>
                <p className="text-xs text-gray-400 truncate">{suggestion.url}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-gray-900">
                  +{suggestion.potentialTraffic.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">
                  potential visits/mo
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Vol: {suggestion.searchVolume.toLocaleString()} &middot; Pos #{suggestion.currentPosition}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
