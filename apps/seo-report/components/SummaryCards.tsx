'use client';

import type { ReportSummary } from '@/lib/types';

interface SummaryCardsProps {
  summary: ReportSummary;
  domain: string;
}

export default function SummaryCards({ summary, domain }: SummaryCardsProps) {
  const cards = [
    {
      label: 'Current Keywords',
      value: summary.totalCurrentKeywords.toLocaleString(),
      sub: `Avg position: ${summary.avgPosition}`,
      color: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'Est. Monthly Traffic',
      value: summary.estimatedMonthlyTraffic.toLocaleString(),
      sub: `Volume: ${summary.totalSearchVolume.toLocaleString()}`,
      color: 'bg-green-50 text-green-700',
    },
    {
      label: 'Top Competitor',
      value: summary.topCompetitor,
      sub: 'By keyword overlap',
      color: 'bg-orange-50 text-orange-700',
    },
    {
      label: 'Net New Opportunities',
      value: summary.netNewOpportunitiesCount.toLocaleString(),
      sub: 'Keywords not yet ranking',
      color: 'bg-purple-50 text-purple-700',
    },
    {
      label: 'Content Refreshes',
      value: summary.contentRefreshCount.toLocaleString(),
      sub: 'Pages to optimize',
      color: 'bg-yellow-50 text-yellow-700',
    },
    {
      label: 'Hub Topics',
      value: `${summary.hubTopicsCount} hubs`,
      sub: `${summary.totalSpokePages} spoke pages`,
      color: 'bg-indigo-50 text-indigo-700',
    },
    {
      label: 'Traffic Potential',
      value: `+${summary.estimatedTrafficPotential.toLocaleString()}`,
      sub: 'Est. monthly visits if executed',
      color: 'bg-emerald-50 text-emerald-700',
    },
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">
        Report Summary — <span className="text-blue-600">{domain}</span>
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {cards.map(card => (
          <div key={card.label} className={`rounded-lg p-3 ${card.color}`}>
            <p className="text-xs font-medium opacity-75">{card.label}</p>
            <p className="text-lg font-bold mt-1 truncate">{card.value}</p>
            <p className="text-xs opacity-60 mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
