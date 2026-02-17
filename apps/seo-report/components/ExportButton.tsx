'use client';

import type { SEOReport } from '@/lib/types';

interface ExportButtonProps {
  report: SEOReport;
}

export default function ExportButton({ report }: ExportButtonProps) {
  const exportCSV = (section: string) => {
    let csvContent = '';
    let filename = '';

    switch (section) {
      case 'rankings': {
        csvContent = 'Keyword,Position,Search Volume,Est. Traffic,KD,CPC,Intent,URL\n';
        for (const kw of report.currentRankings) {
          csvContent += `"${kw.keyword}",${kw.position},${kw.searchVolume},${kw.estimatedTraffic},${kw.keywordDifficulty},${kw.cpc},"${kw.intent.join(', ')}","${kw.url}"\n`;
        }
        filename = `${report.domain}-current-rankings.csv`;
        break;
      }
      case 'opportunities': {
        csvContent = 'Keyword,Search Volume,KD,CPC,Competition,Source,Relevance Score,Intent\n';
        for (const kw of report.netNewOpportunities) {
          csvContent += `"${kw.keyword}",${kw.searchVolume},${kw.keywordDifficulty},${kw.cpc},${kw.competition},"${kw.source}",${kw.relevanceScore.toFixed(2)},"${kw.intent.join(', ')}"\n`;
        }
        filename = `${report.domain}-net-new-opportunities.csv`;
        break;
      }
      case 'competitors': {
        csvContent = 'Keyword,Competitor,Position,Search Volume,KD,CPC\n';
        for (const kw of report.competitorKeywords) {
          csvContent += `"${kw.keyword}","${kw.competitorDomain}",${kw.position},${kw.searchVolume},${kw.keywordDifficulty},${kw.cpc}\n`;
        }
        filename = `${report.domain}-competitor-gaps.csv`;
        break;
      }
      case 'refresh': {
        csvContent = 'Keyword,Current Position,URL,Search Volume,Potential Traffic,Action,Priority,Reason\n';
        for (const s of report.contentRefreshSuggestions) {
          csvContent += `"${s.keyword}",${s.currentPosition},"${s.url}",${s.searchVolume},${s.potentialTraffic},"${s.action}","${s.priority}","${s.reason}"\n`;
        }
        filename = `${report.domain}-content-refresh.csv`;
        break;
      }
      case 'hub-spoke': {
        csvContent = 'Hub Keyword,Hub Volume,Hub KD,Spoke Keyword,Spoke Volume,Spoke KD,Spoke Type,Current Rank\n';
        for (const hub of report.hubAndSpoke) {
          for (const spoke of hub.spokeKeywords) {
            csvContent += `"${hub.hubKeyword}",${hub.hubSearchVolume},${hub.hubDifficulty},"${spoke.keyword}",${spoke.searchVolume},${spoke.keywordDifficulty},"${spoke.type}",${spoke.currentRanking ?? 'N/A'}\n`;
          }
        }
        filename = `${report.domain}-hub-spoke-strategy.csv`;
        break;
      }
      case 'all': {
        // Export a summary of everything
        csvContent = 'Section,Metric,Value\n';
        csvContent += `"Summary","Total Current Keywords",${report.summary.totalCurrentKeywords}\n`;
        csvContent += `"Summary","Avg Position",${report.summary.avgPosition}\n`;
        csvContent += `"Summary","Est. Monthly Traffic",${report.summary.estimatedMonthlyTraffic}\n`;
        csvContent += `"Summary","Top Competitor","${report.summary.topCompetitor}"\n`;
        csvContent += `"Summary","Net New Opportunities",${report.summary.netNewOpportunitiesCount}\n`;
        csvContent += `"Summary","Content Refreshes",${report.summary.contentRefreshCount}\n`;
        csvContent += `"Summary","Hub Topics",${report.summary.hubTopicsCount}\n`;
        csvContent += `"Summary","Total Spoke Pages",${report.summary.totalSpokePages}\n`;
        csvContent += `"Summary","Est. Traffic Potential",${report.summary.estimatedTrafficPotential}\n`;
        filename = `${report.domain}-seo-report-summary.csv`;
        break;
      }
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <span className="text-sm text-gray-500 self-center mr-1">Export:</span>
      {[
        { key: 'rankings', label: 'Rankings' },
        { key: 'opportunities', label: 'Opportunities' },
        { key: 'competitors', label: 'Competitor Gaps' },
        { key: 'refresh', label: 'Content Refresh' },
        { key: 'hub-spoke', label: 'Hub & Spoke' },
        { key: 'all', label: 'Summary' },
      ].map(item => (
        <button
          key={item.key}
          onClick={() => exportCSV(item.key)}
          className="px-2.5 py-1 text-xs font-medium bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 transition-colors"
        >
          {item.label} CSV
        </button>
      ))}
    </div>
  );
}
