import { useEffect, useState, useCallback } from 'react';
import { useFilters, type Preset } from '../context/FilterContext';
import { useAuth } from '../context/AuthContext';
import { reportsApi, syncApi, exportApi, pdfApi, settingsApi } from '../api/client';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, Legend
} from 'recharts';
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfQuarter, startOfYear } from 'date-fns';
import { FiUsers, FiDollarSign, FiTrendingUp, FiDownload, FiRefreshCw, FiLogOut, FiBarChart2, FiActivity, FiTarget, FiAlertTriangle, FiCheckCircle, FiClock, FiEdit2 } from 'react-icons/fi';

const GOLD = '#D4A843';
const RED = '#8B1A1A';
const RED_LIGHT = '#A82828';
const CHART_COLORS = [GOLD, RED, '#2ECC71', '#3498DB', '#9B59B6', '#E67E22', '#1ABC9C', '#E74C3C'];

interface SummaryData {
  dateRange: { start: string; end: string };
  summary: { total: number; type200: number; type250: number; delta: number; previousTotal: number };
  revenue: { total: number; type200: number; type250: number; byPaymentMethod: Record<string, number> };
  paymentBreakdown: { method: string; count: number }[];
  departmentBreakdown: { department: string; count: number }[];
  yearBreakdown: { year: string; count: number }[];
  schoolComparison: { school: string; type200: number; type250: number; total: number; revenue: number }[];
  eventPopularity: { event: string; count: number; percentage: number }[];
  eventCombinations: { combination: string; count: number }[];
  dailyVolume: { date: string; type200: number; type250: number; total: number }[];
  cumulativeGrowth: { date: string; count: number; cumulative: number }[];
  dataQuality: { missingMobile: number; missingPayment: number; duplicates: { name: string; mobile: string }[] };
  velocity: { date: string; count: number }[];
  goal: { target: number; current: number; percentage: number; remaining: number };
}

interface ForecastData {
  historical: { date: string; count: number }[];
  forecast: { date: string; predicted: number; lower: number; upper: number; cumulativePredicted: number }[];
  metrics: {
    averageDailyRate: number;
    trendSlope: number;
    rSquared: number;
    projectedTotal: number;
    currentTotal: number;
    goalTarget: number;
    projectedGoalDate: string | null;
    confidenceScore: number;
  };
  horizonDays: number;
}

function resolvePresetDates(preset: Preset) {
  const now = new Date();
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
  switch (preset) {
    case 'today': return { start: fmt(now), end: fmt(now) };
    case 'yesterday': { const d = subDays(now, 1); return { start: fmt(d), end: fmt(d) }; }
    case 'last7': return { start: fmt(subDays(now, 6)), end: fmt(now) };
    case 'last30': return { start: fmt(subDays(now, 29)), end: fmt(now) };
    case 'thisMonth': return { start: fmt(startOfMonth(now)), end: fmt(now) };
    case 'lastMonth': { const lm = subMonths(now, 1); return { start: fmt(startOfMonth(lm)), end: fmt(endOfMonth(lm)) }; }
    case 'thisQuarter': return { start: fmt(startOfQuarter(now)), end: fmt(now) };
    case 'ytd': return { start: fmt(startOfYear(now)), end: fmt(now) };
    default: return { start: fmt(startOfMonth(now)), end: fmt(now) };
  }
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 Days' },
  { key: 'last30', label: 'Last 30 Days' },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'thisQuarter', label: 'This Quarter' },
  { key: 'ytd', label: 'YTD' },
];

export default function DashboardPage() {
  const { filters, dispatch, queryParams } = useFilters();
  const { user, logout } = useAuth();
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<{ status: string; completedAt: string | null } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [recentRegs, setRecentRegs] = useState<any[]>([]);
  const [forecastHorizon, setForecastHorizon] = useState<number>(14);
  const [forecastData, setForecastData] = useState<ForecastData | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  const fetchForecast = useCallback(async (days: number) => {
    setForecastLoading(true);
    try {
      const res = await reportsApi.forecast(days);
      setForecastData(res.data);
    } catch (err) {
      console.error('Forecast fetch failed:', err);
    } finally {
      setForecastLoading(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, syncRes, recentRes] = await Promise.all([
        reportsApi.summary(queryParams),
        syncApi.status(),
        reportsApi.recent(10),
      ]);
      setData(summaryRes.data);
      setSyncStatus(syncRes.data.lastSync);
      setRecentRegs(recentRes.data);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'analyst') {
      fetchForecast(forecastHorizon);
    }
  }, [forecastHorizon, fetchForecast, user]);

  const handlePreset = (preset: Preset) => {
    const dates = resolvePresetDates(preset);
    dispatch({ type: 'SET_PRESET', preset, start: dates.start, end: dates.end });
  };

  const handleDrillType = (type: number | null) => {
    dispatch({ type: 'SET_REGISTRATION_TYPE', value: filters.registrationType === type ? null : type });
  };

  const handleDrillDept = (dept: string | null) => {
    dispatch({ type: 'SET_DEPARTMENT', value: filters.department === dept ? null : dept });
  };

  const handleDrillEvent = (event: string | null) => {
    dispatch({ type: 'SET_EVENT', value: filters.event === event ? null : event });
  };

  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const [newGoalInput, setNewGoalInput] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);

  const handleSaveGoal = async () => {
    const num = parseInt(newGoalInput, 10);
    if (isNaN(num) || num <= 0) return;
    setSavingGoal(true);
    try {
      await settingsApi.updateGoal(num);
      setEditingGoal(false);
      await Promise.all([
        fetchData(),
        fetchForecast(forecastHorizon)
      ]);
    } catch (err) {
      console.error('Failed to update goal:', err);
      alert('Failed to update registration goal. Please try again.');
    } finally {
      setSavingGoal(false);
    }
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const res = await pdfApi.report(queryParams);
      const blob = res.data instanceof Blob
        ? res.data
        : new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.setAttribute('download', `FAC_PYROS_Report_${filters.endDate || filters.startDate}.pdf`);
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (document.body.contains(a)) document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 1500);
    } catch (err) {
      console.error('PDF download failed:', err);
      alert('Failed to generate PDF report. Please try again.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleExport = async (format: 'csv' | 'xlsx' | 'pdf') => {
    if (format === 'pdf') {
      await handleDownloadPdf();
      setExportOpen(false);
      return;
    }

    try {
      const res = format === 'csv'
        ? await exportApi.csv(queryParams)
        : await exportApi.xlsx(queryParams);
      const mimeType = format === 'csv'
        ? 'text/csv'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const blob = res.data instanceof Blob
        ? res.data
        : new Blob([res.data], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.setAttribute('download', `FAC_PYROS_${filters.startDate}_to_${filters.endDate}.${format}`);
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (document.body.contains(a)) document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 1500);
    } catch (err) {
      console.error('Export failed:', err);
      alert(`Export failed for ${format.toUpperCase()}. Please try again.`);
    }
    setExportOpen(false);
  };

  const handleSync = async () => {
    try {
      await syncApi.trigger();
      fetchData();
    } catch (err) {
      console.error('Sync failed:', err);
    }
  };

  const maxDeptCount = data ? Math.max(...data.departmentBreakdown.map(d => d.count), 1) : 1;
  const maxEventCount = data ? Math.max(...data.eventPopularity.map(e => e.count), 1) : 1;

  if (loading && !data) {
    return (
      <div className="app-layout">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: GOLD }}>
          <FiActivity style={{ animation: 'pulse 1.5s infinite', fontSize: '2rem', marginRight: '12px' }} />
          Loading dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header">
        <div className="app-header__brand">
          <img src="/pyros-logo.png" alt="FAC PYROS" className="app-header__logo" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          <div>
            <div className="app-header__title">FAC PYROS</div>
            <div className="app-header__subtitle">Registration Analytics Dashboard</div>
          </div>
        </div>
        <div className="app-header__actions">
          {/* Sync Status */}
          <div className={`sync-status sync-status--${syncStatus?.status === 'success' ? 'ok' : syncStatus?.status === 'failed' ? 'error' : 'running'}`}>
            {syncStatus?.status === 'success' ? '✅' : syncStatus?.status === 'failed' ? '⚠️' : '🔄'}
            {syncStatus?.completedAt
              ? ` Synced ${formatTimeAgo(syncStatus.completedAt)}`
              : ' No sync yet'}
          </div>

          {user?.role === 'admin' && (
            <button className="btn btn--secondary btn--sm" onClick={handleSync} title="Manual Sync">
              <FiRefreshCw /> Sync
            </button>
          )}

          {/* Quick PDF Report Download */}
          <button
            className="btn btn--secondary btn--sm"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            title="Download Daily PDF Report"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <FiDownload /> {downloadingPdf ? 'Generating PDF...' : 'Download PDF'}
          </button>

          {/* Export Menu */}
          {(user?.role === 'admin' || user?.role === 'analyst') && (
            <div className="export-menu">
              <button className="btn btn--primary btn--sm" onClick={() => setExportOpen(!exportOpen)}>
                <FiDownload /> Export
              </button>
              {exportOpen && (
                <div className="export-menu__dropdown">
                  <button className="export-menu__item" onClick={() => handleExport('pdf')}>📑 Download Daily PDF</button>
                  <button className="export-menu__item" onClick={() => handleExport('csv')}>📄 Export CSV</button>
                  <button className="export-menu__item" onClick={() => handleExport('xlsx')}>📊 Export Excel</button>
                </div>
              )}
            </div>
          )}

          <span style={{ fontSize: '0.8rem', color: '#808080' }}>{user?.displayName} ({user?.role})</span>
          <button className="btn btn--ghost btn--sm" onClick={logout}><FiLogOut /></button>
        </div>
      </header>

      <main className="app-main">
        {/* Filter Bar */}
        <div className="filter-bar animate-fade-in">
          <div className="filter-bar__presets">
            {PRESETS.map(p => (
              <button
                key={p.key}
                className={`preset-btn ${filters.preset === p.key ? 'preset-btn--active' : ''}`}
                onClick={() => handlePreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => dispatch({ type: 'SET_DATE_RANGE', start: e.target.value, end: filters.endDate })}
              className="form-group__input"
              style={{ width: '150px', padding: '4px 8px', fontSize: '0.8rem' }}
            />
            <span style={{ color: '#808080' }}>to</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => dispatch({ type: 'SET_DATE_RANGE', start: filters.startDate, end: e.target.value })}
              className="form-group__input"
              style={{ width: '150px', padding: '4px 8px', fontSize: '0.8rem' }}
            />
          </div>
        </div>

        {/* Active Filters */}
        {(filters.registrationType || filters.department || filters.event) && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {filters.registrationType && (
              <span className="filter-chip">
                ₹{filters.registrationType} Tier
                <span className="filter-chip__close" onClick={() => handleDrillType(null)}>×</span>
              </span>
            )}
            {filters.department && (
              <span className="filter-chip">
                {filters.department}
                <span className="filter-chip__close" onClick={() => handleDrillDept(null)}>×</span>
              </span>
            )}
            {filters.event && (
              <span className="filter-chip">
                {filters.event}
                <span className="filter-chip__close" onClick={() => handleDrillEvent(null)}>×</span>
              </span>
            )}
            <button className="btn btn--ghost btn--sm" onClick={() => dispatch({ type: 'CLEAR_ALL' })}>Clear all</button>
          </div>
        )}

        {data && (
          <>
            {/* KPI Cards */}
            <div className="kpi-grid animate-fade-in">
              <div className="kpi-card" onClick={() => handleDrillType(null)} style={{ cursor: 'pointer' }}>
                <FiUsers className="kpi-card__icon" />
                <div className="kpi-card__label">Total Registrations</div>
                <div className="kpi-card__value">{data.summary.total.toLocaleString()}</div>
                <div className={`kpi-card__delta ${data.summary.delta >= 0 ? 'kpi-card__delta--up' : 'kpi-card__delta--down'}`}>
                  {data.summary.delta >= 0 ? '↑' : '↓'} {Math.abs(data.summary.delta)}% vs previous period
                </div>
              </div>

              <div className="kpi-card" onClick={() => handleDrillType(200)} style={{ cursor: 'pointer' }}>
                <div className="kpi-card__label">₹200 Tier</div>
                <div className="kpi-card__value">{data.summary.type200.toLocaleString()}</div>
                <div style={{ fontSize: '0.75rem', color: '#B0B0B0', marginTop: '4px' }}>
                  Revenue: ₹{data.revenue.type200.toLocaleString()}
                </div>
              </div>

              <div className="kpi-card" onClick={() => handleDrillType(250)} style={{ cursor: 'pointer' }}>
                <div className="kpi-card__label">₹250 Tier</div>
                <div className="kpi-card__value">{data.summary.type250.toLocaleString()}</div>
                <div style={{ fontSize: '0.75rem', color: '#B0B0B0', marginTop: '4px' }}>
                  Revenue: ₹{data.revenue.type250.toLocaleString()}
                </div>
              </div>

              <div className="kpi-card">
                <FiDollarSign className="kpi-card__icon" />
                <div className="kpi-card__label">Total Revenue</div>
                <div className="kpi-card__value kpi-card__value--gold">₹{data.revenue.total.toLocaleString()}</div>
              </div>
            </div>

            {/* Charts Row 1 */}
            <div className="charts-grid">
              {/* Daily Volume Trend */}
              <div className="chart-card animate-fade-in">
                <div className="chart-card__title">📈 Daily Registration Trend</div>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={data.dailyVolume}>
                    <defs>
                      <linearGradient id="gradGold" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={GOLD} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={GOLD} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradRed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={RED_LIGHT} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={RED_LIGHT} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="date" tick={{ fill: '#808080', fontSize: 11 }} tickFormatter={(d) => format(new Date(d), 'dd MMM')} />
                    <YAxis tick={{ fill: '#808080', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#1E1E1E', border: `1px solid ${GOLD}`, borderRadius: '8px', color: '#F5F5F5' }} />
                    <Area type="monotone" dataKey="type200" name="₹200" stroke={GOLD} fill="url(#gradGold)" strokeWidth={2} />
                    <Area type="monotone" dataKey="type250" name="₹250" stroke={RED_LIGHT} fill="url(#gradRed)" strokeWidth={2} />
                    <Legend />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Registration Type Donut */}
              <div className="chart-card animate-fade-in">
                <div className="chart-card__title">🍩 Registration Type Distribution</div>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: '₹200 Tier', value: data.summary.type200 },
                        { name: '₹250 Tier', value: data.summary.type250 },
                      ]}
                      cx="50%" cy="50%"
                      innerRadius={65} outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      onClick={(entry) => {
                        if (entry && typeof entry.name === 'string') {
                          handleDrillType(entry.name.includes('200') ? 200 : 250);
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <Cell fill={GOLD} />
                      <Cell fill={RED} />
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1E1E1E', border: `1px solid ${GOLD}`, borderRadius: '8px', color: '#F5F5F5' }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Payment Breakdown */}
              <div className="chart-card animate-fade-in">
                <div className="chart-card__title">💳 Payment Method Breakdown</div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.paymentBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="method" tick={{ fill: '#808080', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#808080', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#1E1E1E', border: `1px solid ${GOLD}`, borderRadius: '8px', color: '#F5F5F5' }} />
                    <Bar dataKey="count" name="Registrations" radius={[4, 4, 0, 0]}>
                      {data.paymentBreakdown.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Cumulative Growth */}
              <div className="chart-card animate-fade-in">
                <div className="chart-card__title">📊 Cumulative Growth</div>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={data.cumulativeGrowth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="date" tick={{ fill: '#808080', fontSize: 11 }} tickFormatter={(d) => format(new Date(d), 'dd MMM')} />
                    <YAxis tick={{ fill: '#808080', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#1E1E1E', border: `1px solid ${GOLD}`, borderRadius: '8px', color: '#F5F5F5' }} />
                    <Line type="monotone" dataKey="cumulative" name="Cumulative Total" stroke={GOLD} strokeWidth={3} dot={{ fill: GOLD, r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Department Leaderboard + Event Popularity */}
            <div className="charts-grid" style={{ marginBottom: '24px' }}>
              <div className="card animate-fade-in">
                <div className="section-title"><FiBarChart2 /> Department Leaderboard</div>
                <ul className="leaderboard">
                  {data.departmentBreakdown.slice(0, 8).map((dept, i) => (
                    <li key={dept.department} className="leaderboard__item" onClick={() => handleDrillDept(dept.department)} style={{ cursor: 'pointer' }}>
                      <span className="leaderboard__rank">{i + 1}</span>
                      <span className="leaderboard__name">{dept.department}</span>
                      <div className="leaderboard__bar-container">
                        <div className="leaderboard__bar" style={{ width: `${(dept.count / maxDeptCount) * 100}%` }}>
                          {dept.count}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card animate-fade-in">
                <div className="section-title"><FiTrendingUp /> Event Popularity</div>
                <ul className="leaderboard">
                  {data.eventPopularity.slice(0, 8).map((evt, i) => (
                    <li key={evt.event} className="leaderboard__item" onClick={() => handleDrillEvent(evt.event)} style={{ cursor: 'pointer' }}>
                      <span className="leaderboard__rank">{i + 1}</span>
                      <span className="leaderboard__name">{evt.event}</span>
                      <div className="leaderboard__bar-container">
                        <div className="leaderboard__bar" style={{ width: `${(evt.count / maxEventCount) * 100}%` }}>
                          {evt.count} ({evt.percentage}%)
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <p style={{ fontSize: '0.7rem', color: '#808080', marginTop: '8px' }}>
                  Percentages may exceed 100% — students register for multiple events
                </p>
              </div>
            </div>

            {/* Year-wise + School Comparison + Event Combos */}
            <div className="charts-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '24px' }}>
              {/* Year-wise */}
              <div className="card animate-fade-in">
                <div className="section-title">🎓 Year-wise Breakdown</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.yearBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis type="number" tick={{ fill: '#808080', fontSize: 11 }} />
                    <YAxis type="category" dataKey="year" tick={{ fill: '#B0B0B0', fontSize: 12 }} width={60} />
                    <Tooltip contentStyle={{ background: '#1E1E1E', border: `1px solid ${GOLD}`, borderRadius: '8px', color: '#F5F5F5' }} />
                    <Bar dataKey="count" name="Registrations" fill={GOLD} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* School Comparison Table */}
              <div className="card animate-fade-in">
                <div className="section-title">🏫 School Comparison</div>
                <div className="data-table-wrapper" style={{ maxHeight: '240px', overflow: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>School</th>
                        <th>₹200</th>
                        <th>₹250</th>
                        <th>Total</th>
                        <th>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.schoolComparison.map(s => (
                        <tr key={s.school}>
                          <td>{s.school}</td>
                          <td>{s.type200}</td>
                          <td>{s.type250}</td>
                          <td style={{ fontWeight: 700 }}>{s.total}</td>
                          <td style={{ color: GOLD }}>₹{s.revenue.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Event Combinations */}
              <div className="card animate-fade-in">
                <div className="section-title">🔗 Top Event Combos</div>
                <div className="data-table-wrapper" style={{ maxHeight: '240px', overflow: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Combination</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.eventCombinations.slice(0, 8).map((c, i) => (
                        <tr key={c.combination}>
                          <td>{i + 1}</td>
                          <td>{c.combination}</td>
                          <td style={{ fontWeight: 700 }}>{c.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Goal Tracker + Data Quality + Revenue by Payment */}
            <div className="charts-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '24px' }}>
              {/* Goal Tracker */}
              <div className="card animate-fade-in">
                <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><FiTarget /> Registration Goal</span>
                  {user?.role === 'admin' && !editingGoal && (
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => { setEditingGoal(true); setNewGoalInput(String(data.goal.target)); }}
                      title="Edit Target Goal"
                      style={{ fontSize: '0.75rem', padding: '2px 8px', color: GOLD }}
                    >
                      <FiEdit2 style={{ marginRight: '4px' }} /> Edit Goal
                    </button>
                  )}
                </div>

                {editingGoal ? (
                  <div style={{ margin: '12px 0' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                      <input
                        type="number"
                        min="1"
                        value={newGoalInput}
                        onChange={(e) => setNewGoalInput(e.target.value)}
                        className="form-group__input"
                        placeholder="e.g. 1000"
                        style={{ width: '130px', padding: '6px 10px', fontSize: '0.9rem' }}
                        autoFocus
                      />
                      <button className="btn btn--primary btn--sm" onClick={handleSaveGoal} disabled={savingGoal}>
                        {savingGoal ? 'Saving...' : 'Save'}
                      </button>
                      <button className="btn btn--secondary btn--sm" onClick={() => setEditingGoal(false)} disabled={savingGoal}>
                        Cancel
                      </button>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#808080' }}>Updates progress bars and predictive forecast targets</span>
                  </div>
                ) : (
                  <>
                    <div className="progress-bar">
                      <div className="progress-bar__fill" style={{ width: `${Math.min(data.goal.percentage, 100)}%` }}>
                        {data.goal.current}/{data.goal.target} ({data.goal.percentage}%)
                      </div>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: '#B0B0B0', marginTop: '8px', textAlign: 'center' }}>
                      {data.goal.remaining > 0
                        ? `${data.goal.remaining} more registrations needed`
                        : '🎉 Goal reached!'}
                    </p>
                  </>
                )}
              </div>

              {/* Data Quality Alerts */}
              <div className="card animate-fade-in">
                <div className="section-title"><FiAlertTriangle /> Data Quality</div>
                <div className="alert-list">
                  {data.dataQuality.missingMobile > 0 && (
                    <div className="alert-item alert-item--warning">⚠️ {data.dataQuality.missingMobile} rows missing Mobile No</div>
                  )}
                  {data.dataQuality.missingPayment > 0 && (
                    <div className="alert-item alert-item--warning">⚠️ {data.dataQuality.missingPayment} rows missing Payment Method</div>
                  )}
                  {data.dataQuality.duplicates.length > 0 ? (
                    <div className="alert-item alert-item--danger">🔴 {data.dataQuality.duplicates.length} potential duplicate(s) found</div>
                  ) : (
                    <div className="alert-item alert-item--success"><FiCheckCircle /> No duplicates detected</div>
                  )}
                  {data.dataQuality.missingMobile === 0 && data.dataQuality.missingPayment === 0 && (
                    <div className="alert-item alert-item--success"><FiCheckCircle /> All data fields complete</div>
                  )}
                </div>
              </div>

              {/* Registration Velocity */}
              <div className="card animate-fade-in">
                <div className="section-title"><FiActivity /> Registration Velocity</div>
                {data.velocity.length > 0 && (
                  <>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: GOLD, marginBottom: '4px' }}>
                      {data.velocity[0]?.count || 0}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#B0B0B0', marginBottom: '12px' }}>
                      registrations on most recent day
                    </div>
                    <ResponsiveContainer width="100%" height={80}>
                      <AreaChart data={[...data.velocity].reverse()}>
                        <Area type="monotone" dataKey="count" stroke={GOLD} fill="url(#gradGold)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </>
                )}
              </div>
            </div>

            {/* Revenue by Payment + Recent Feed */}
            <div className="charts-grid" style={{ marginBottom: '24px' }}>
              {/* Revenue by Payment Method */}
              <div className="card animate-fade-in">
                <div className="section-title"><FiDollarSign /> Revenue by Payment Method</div>
                <div className="data-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Payment Method</th>
                        <th>Count</th>
                        <th>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.paymentBreakdown.map(p => (
                        <tr key={p.method}>
                          <td>{p.method}</td>
                          <td>{p.count}</td>
                          <td style={{ color: GOLD, fontWeight: 700 }}>
                            ₹{(data.revenue.byPaymentMethod[p.method] || 0).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Registrations Feed */}
              <div className="card animate-fade-in">
                <div className="section-title"><FiClock /> Recent Registrations</div>
                <div className="feed-list">
                  {recentRegs.map((reg, i) => (
                    <div key={i} className="feed-item" style={{ animationDelay: `${i * 0.05}s` }}>
                      <span className="feed-item__name">{reg.name}</span>
                      <span className="feed-item__dept">{reg.department}</span>
                      <div className="feed-item__events">
                        {reg.events.map((e: string) => <span key={e} className="event-tag">{e}</span>)}
                      </div>
                      <span className="feed-item__type">₹{reg.type}</span>
                    </div>
                  ))}
                  {recentRegs.length === 0 && (
                    <p style={{ color: '#808080', fontSize: '0.85rem' }}>No recent registrations</p>
                  )}
                </div>
              </div>
            </div>

            {/* Predictive Analytics & Forecast (Phase 6) */}
            {(user?.role === 'admin' || user?.role === 'analyst') && (
              <div className="card animate-fade-in" style={{ marginBottom: '24px', border: `1px solid ${GOLD}40` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div className="section-title" style={{ margin: 0, fontSize: '1.1rem', color: GOLD }}>
                      🔮 Predictive Registration Forecast (Phase 6)
                    </div>
                    <p style={{ fontSize: '0.8rem', color: '#888', margin: '4px 0 0 0' }}>
                      Statistical trend model with blended moving-average and 95% confidence intervals
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: '#B0B0B0' }}>Horizon:</span>
                    {[7, 14, 30].map(h => (
                      <button
                        key={h}
                        className={`preset-btn ${forecastHorizon === h ? 'preset-btn--active' : ''}`}
                        onClick={() => setForecastHorizon(h)}
                        style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                      >
                        {h} Days
                      </button>
                    ))}
                  </div>
                </div>

                {forecastLoading && (
                  <div style={{ padding: '32px', textAlign: 'center', color: '#888' }}>Calculating forecast models...</div>
                )}

                {!forecastLoading && forecastData && (
                  <>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '12px',
                      marginBottom: '20px'
                    }}>
                      <div className="stat-card" style={{ padding: '12px 16px' }}>
                        <div className="stat-card__label">Projected Final Volume</div>
                        <div className="stat-card__value" style={{ fontSize: '1.4rem', color: GOLD }}>
                          {forecastData.metrics.projectedTotal}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#888' }}>
                          +{forecastData.metrics.projectedTotal - forecastData.metrics.currentTotal} expected
                        </div>
                      </div>

                      <div className="stat-card" style={{ padding: '12px 16px' }}>
                        <div className="stat-card__label">Avg Daily Velocity</div>
                        <div className="stat-card__value" style={{ fontSize: '1.4rem', color: '#2ECC71' }}>
                          {forecastData.metrics.averageDailyRate} <span style={{ fontSize: '0.8rem' }}>/ day</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#888' }}>
                          Trend slope: {forecastData.metrics.trendSlope >= 0 ? '+' : ''}{forecastData.metrics.trendSlope}
                        </div>
                      </div>

                      <div className="stat-card" style={{ padding: '12px 16px' }}>
                        <div className="stat-card__label">Goal Completion Date</div>
                        <div className="stat-card__value" style={{ fontSize: '1.2rem', color: '#3498DB' }}>
                          {forecastData.metrics.projectedGoalDate || 'N/A'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#888' }}>
                          Target: {forecastData.metrics.goalTarget} registrations
                        </div>
                      </div>

                      <div className="stat-card" style={{ padding: '12px 16px' }}>
                        <div className="stat-card__label">Model Confidence</div>
                        <div className="stat-card__value" style={{ fontSize: '1.4rem', color: '#E67E22' }}>
                          {forecastData.metrics.confidenceScore}%
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#888' }}>
                          R² goodness-of-fit: {forecastData.metrics.rSquared}
                        </div>
                      </div>
                    </div>

                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart
                        data={[
                          ...forecastData.historical.map(h => ({
                            date: h.date,
                            actual: h.count,
                            predicted: null,
                            lower: null,
                            upper: null,
                          })),
                          ...forecastData.forecast.map(f => ({
                            date: f.date,
                            actual: null,
                            predicted: f.predicted,
                            lower: f.lower,
                            upper: f.upper,
                          })),
                        ]}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="date" tick={{ fill: '#808080', fontSize: 10 }} />
                        <YAxis tick={{ fill: '#808080', fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: '#1E1E1E', border: `1px solid ${GOLD}`, borderRadius: '8px', color: '#F5F5F5' }} />
                        <Legend />
                        <Area type="monotone" dataKey="upper" name="Upper 95% Bound" stroke="none" fill="#D4A843" fillOpacity={0.15} />
                        <Area type="monotone" dataKey="lower" name="Lower 95% Bound" stroke="none" fill="#1E1E1E" fillOpacity={0.8} />
                        <Line type="monotone" dataKey="actual" name="Historical Actual" stroke="#2ECC71" strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="predicted" name="Predicted Trend" stroke={GOLD} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
                      </AreaChart>
                    </ResponsiveContainer>

                    <div style={{
                      marginTop: '12px',
                      padding: '8px 12px',
                      background: '#242424',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      color: '#888',
                      borderLeft: `3px solid ${GOLD}`
                    }}>
                      💡 <strong>Statistical Projection Note:</strong> Estimates use past registration velocity and Ordinary Least Squares trend fitting with a 95% confidence band. Spikes around campaign deadlines or on-spot registrations may cause actual numbers to deviate.
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        background: '#1A1A1A', borderTop: `2px solid ${GOLD}`, padding: '12px 32px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#808080'
      }}>
        <span style={{ color: GOLD, fontWeight: 700 }}>FAC PYROS — That's How We Rock It!</span>
        <span>Registration Analytics Dashboard v1.0</span>
      </footer>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
