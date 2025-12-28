import { Search, Filter, ArrowUpDown } from 'lucide-react';
import GlassCard from '../../GlassCard';
import './FilterBar.css';

export type FilterType = 'all' | 'resolved' | 'unresolved' | 'low-confidence';
export type SortType = 'value' | 'confidence' | 'name';

interface FilterBarProps {
  filter: FilterType;
  sort: SortType;
  searchQuery: string;
  onFilterChange: (filter: FilterType) => void;
  onSortChange: (sort: SortType) => void;
  onSearchChange: (query: string) => void;
  totalCount: number;
  filteredCount: number;
}

const filterLabels: Record<FilterType, string> = {
  all: 'All',
  resolved: 'Resolved',
  unresolved: 'Unresolved',
  'low-confidence': 'Low Confidence',
};

export default function FilterBar({
  filter,
  sort,
  searchQuery,
  onFilterChange,
  onSortChange,
  onSearchChange,
  totalCount,
  filteredCount,
}: FilterBarProps) {
  return (
    <GlassCard className="filter-bar">
      <div className="filter-bar-row">
        <div className="search-wrapper">
          <Search size={18} className="search-icon" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search holdings..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="search-input"
            aria-label="Search holdings"
          />
        </div>

        <div className="filter-group" role="group" aria-label="Filter holdings">
          <Filter size={16} className="filter-group-icon" aria-hidden="true" />
          {(['all', 'resolved', 'unresolved', 'low-confidence'] as FilterType[]).map((f) => (
            <button
              key={f}
              className={`filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => onFilterChange(f)}
              type="button"
              aria-pressed={filter === f}
            >
              {filterLabels[f]}
            </button>
          ))}
        </div>

        <div className="sort-group">
          <ArrowUpDown size={16} className="sort-icon" aria-hidden="true" />
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortType)}
            className="sort-select"
            aria-label="Sort holdings"
          >
            <option value="value">Sort by Value</option>
            <option value="confidence">Sort by Confidence</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>
      </div>

      <div className="results-count" aria-live="polite">
        Showing {filteredCount.toLocaleString()} of {totalCount.toLocaleString()} holdings
      </div>
    </GlassCard>
  );
}
