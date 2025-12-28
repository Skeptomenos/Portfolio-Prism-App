import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import GlassCard from '../GlassCard';
import { getTrueHoldings, getPipelineReport } from '../../lib/ipc';
import { 
  ResolutionHealthCard, 
  NeedsAttentionSection, 
  FilterBar,
  type FilterType,
  type SortType 
} from './xray';
import ResolutionStatusBadge from '../common/ResolutionStatusBadge';
import type { XRayHolding, ResolutionSummary } from '../../types';

const EMPTY_SUMMARY: ResolutionSummary = {
  total: 0,
  resolved: 0,
  unresolved: 0,
  skipped: 0,
  unknown: 0,
  bySource: {},
  healthScore: 1.0,
};

type EtfNameMap = Record<string, string>;

function getHoldingKey(holding: XRayHolding, index: number): string {
  return holding.isin || `${holding.stock}-${index}`;
}

function isHoldingSelected(selected: XRayHolding | null, holding: XRayHolding): boolean {
  if (!selected) return false;
  if (selected.isin && holding.isin) return selected.isin === holding.isin;
  return selected.stock === holding.stock && selected.ticker === holding.ticker;
}

function getEtfDisplayName(isin: string, nameMap: EtfNameMap): string {
  const name = nameMap[isin];
  return (name && name !== 'Unknown') ? name : isin;
}

export default function HoldingsView() {
  const [holdings, setHoldings] = useState<XRayHolding[]>([]);
  const [summary, setSummary] = useState<ResolutionSummary>(EMPTY_SUMMARY);
  const [etfNameMap, setEtfNameMap] = useState<EtfNameMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStock, setSelectedStock] = useState<XRayHolding | null>(null);

  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortType>('value');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [holdingsRes, pipelineReport] = await Promise.all([
        getTrueHoldings(),
        getPipelineReport().catch(() => null)
      ]);
      
      setHoldings(holdingsRes.holdings || []);
      setSummary(holdingsRes.summary || EMPTY_SUMMARY);
      
      if (pipelineReport?.decomposition?.per_etf) {
        const nameMap: EtfNameMap = {};
        for (const etf of pipelineReport.decomposition.per_etf) {
          if (etf.isin && etf.name) {
            nameMap[etf.isin] = etf.name;
          }
        }
        setEtfNameMap(nameMap);
      }
      
      setError(null);
    } catch (err: unknown) {
      console.error('Failed to load true holdings', err);
      const message = err instanceof Error ? err.message : 'Failed to load holdings data';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredHoldings = useMemo(() => {
    let result = [...holdings];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (h) =>
          h.stock.toLowerCase().includes(query) ||
          h.ticker.toLowerCase().includes(query) ||
          (h.isin && h.isin.toLowerCase().includes(query))
      );
    }

    switch (filter) {
      case 'resolved':
        result = result.filter((h) => h.resolutionStatus === 'resolved');
        break;
      case 'unresolved':
        result = result.filter((h) => h.resolutionStatus === 'unresolved');
        break;
      case 'low-confidence':
        result = result.filter(
          (h) => h.resolutionStatus === 'resolved' && h.resolutionConfidence < 0.8
        );
        break;
    }

    switch (sort) {
      case 'value':
        result.sort((a, b) => b.totalValue - a.totalValue);
        break;
      case 'confidence':
        result.sort((a, b) => a.resolutionConfidence - b.resolutionConfidence);
        break;
      case 'name':
        result.sort((a, b) => a.stock.localeCompare(b.stock));
        break;
    }

    return result;
  }, [holdings, searchQuery, filter, sort]);

  const needsAttentionHoldings = useMemo(() => {
    return holdings
      .filter(
        (h) =>
          h.resolutionStatus === 'unresolved' ||
          (h.resolutionStatus === 'resolved' && h.resolutionConfidence < 0.8)
      )
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [holdings]);

  const handleAttentionClick = (holding: XRayHolding) => {
    setSelectedStock(holding);
    setFilter('all');
    setSearchQuery('');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '48px' }}>
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>Error Loading Data</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>{error}</p>
        <button 
          onClick={loadData}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>No Holdings Data</h3>
        <p style={{ color: 'var(--text-secondary)' }}>
          Run the deep analysis in the Health tab to generate your true holdings breakdown.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '4px' }}>
          True Holdings Explorer
        </h2>
        <p style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
          See exactly how you own each stock across your portfolio
        </p>
      </div>

      <ResolutionHealthCard summary={summary} />

      <NeedsAttentionSection 
        holdings={needsAttentionHoldings} 
        onHoldingClick={handleAttentionClick}
      />

      <FilterBar
        filter={filter}
        sort={sort}
        searchQuery={searchQuery}
        onFilterChange={setFilter}
        onSortChange={setSort}
        onSearchChange={setSearchQuery}
        totalCount={holdings.length}
        filteredCount={filteredHoldings.length}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '16px' }}>
        <GlassCard style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ 
            maxHeight: 'calc(100vh - 380px)', 
            overflowY: 'auto',
            overflowX: 'visible'
          }}>
            {filteredHoldings.map((holding, index) => (
              <div
                key={getHoldingKey(holding, index)}
                onClick={() => setSelectedStock(holding)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto auto',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  cursor: 'pointer',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                  background: isHoldingSelected(selectedStock, holding)
                    ? 'rgba(59, 130, 246, 0.1)'
                    : 'transparent',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isHoldingSelected(selectedStock, holding)) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isHoldingSelected(selectedStock, holding)) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ 
                    fontSize: '13px', 
                    fontWeight: '500',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {holding.stock}
                  </div>
                  <div style={{ 
                    fontSize: '11px', 
                    color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    {holding.ticker}
                  </div>
                </div>
                
                <div style={{ 
                  fontSize: '11px', 
                  color: 'var(--text-tertiary)',
                  whiteSpace: 'nowrap'
                }}>
                  {holding.sources.length} ETF{holding.sources.length > 1 ? 's' : ''}
                </div>
                
                <div style={{ position: 'relative', zIndex: 10 }}>
                  <ResolutionStatusBadge
                    status={holding.resolutionStatus}
                    source={holding.resolutionSource}
                    confidence={holding.resolutionConfidence}
                    originalTicker={holding.ticker}
                    resolvedIsin={holding.isin || undefined}
                    compact
                  />
                </div>
                
                <div 
                  className="metric-value" 
                  style={{ 
                    fontSize: '13px', 
                    color: 'var(--accent-cyan)',
                    textAlign: 'right',
                    minWidth: '70px'
                  }}
                >
                  €{holding.totalValue.toLocaleString()}
                </div>
              </div>
            ))}

            {filteredHoldings.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                No holdings match your filters
              </div>
            )}
          </div>
        </GlassCard>

        {selectedStock ? (
          <GlassCard style={{ padding: '16px', height: 'fit-content', position: 'sticky', top: '0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '2px' }}>{selectedStock.stock}</h3>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                  {selectedStock.ticker}
                </div>
              </div>
              <div style={{ position: 'relative', zIndex: 100 }}>
                <ResolutionStatusBadge
                  status={selectedStock.resolutionStatus}
                  source={selectedStock.resolutionSource}
                  confidence={selectedStock.resolutionConfidence}
                  originalTicker={selectedStock.ticker}
                  resolvedIsin={selectedStock.isin || undefined}
                />
              </div>
            </div>

            <div
              className="metric-value"
              style={{
                fontSize: '24px',
                color: 'var(--accent-emerald)',
                marginBottom: '16px',
              }}
            >
              €{selectedStock.totalValue.toLocaleString()}
            </div>

            {selectedStock.isin && (
              <div style={{ 
                marginBottom: '16px', 
                padding: '10px', 
                background: 'rgba(255, 255, 255, 0.03)', 
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.05)'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px' }}>
                  <div>
                    <span style={{ color: 'var(--text-tertiary)' }}>ISIN: </span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                      {selectedStock.isin}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-tertiary)' }}>Confidence: </span>
                    <span style={{ fontWeight: 600 }}>
                      {Math.round(selectedStock.resolutionConfidence * 100)}%
                    </span>
                  </div>
                  {selectedStock.resolutionSource && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={{ color: 'var(--text-tertiary)' }}>Source: </span>
                      <span>{selectedStock.resolutionSource}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <h4 style={{ 
              fontSize: '11px', 
              fontWeight: '600', 
              marginBottom: '10px', 
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              ETF Breakdown
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {selectedStock.sources.map((source, index) => {
                const etfName = getEtfDisplayName(source.etf, etfNameMap);
                const isIsin = etfName === source.etf;
                
                return (
                  <div
                    key={`${source.etf}-${index}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 10px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: '6px',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      gap: '10px',
                    }}
                  >
                    <ChevronRight size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ 
                        fontSize: '12px', 
                        fontWeight: '500',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {etfName}
                      </div>
                      {!isIsin && (
                        <div style={{ 
                          fontSize: '10px', 
                          color: 'var(--text-tertiary)', 
                          fontFamily: 'var(--font-mono)'
                        }}>
                          {source.etf}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: '600',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--accent-cyan)',
                        }}
                      >
                        €{source.value.toLocaleString()}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                        {(source.weight * 100).toFixed(2)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '6px' }}>
              <div style={{ 
                fontSize: '10px', 
                color: 'var(--text-tertiary)', 
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <TrendingUp size={12} aria-hidden="true" />
                Exposure Distribution
              </div>
              {selectedStock.sources.map((source, index) => {
                const percentage = (source.value / selectedStock.totalValue) * 100;
                const etfName = getEtfDisplayName(source.etf, etfNameMap);
                
                return (
                  <div key={`flow-${source.etf}-${index}`} style={{ marginBottom: '6px' }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      fontSize: '10px',
                      marginBottom: '3px'
                    }}>
                      <span style={{ 
                        color: 'var(--accent-blue)', 
                        fontWeight: '500',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '200px'
                      }}>
                        {etfName}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                        {percentage.toFixed(1)}%
                      </span>
                    </div>
                    <div style={{
                      height: '3px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      borderRadius: '2px',
                      overflow: 'hidden'
                    }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${percentage}%`,
                          background: 'linear-gradient(90deg, var(--accent-blue) 0%, var(--accent-cyan) 100%)',
                          borderRadius: '2px',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        ) : (
          <GlassCard
            style={{
              padding: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '200px',
            }}
          >
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>
              <AlertCircle size={32} style={{ marginBottom: '12px', opacity: 0.3 }} aria-hidden="true" />
              <p style={{ fontSize: '12px' }}>Select a stock to see its breakdown</p>
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
