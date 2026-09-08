import { useEffect, useState, useCallback, useMemo } from 'react';
import { useFilters, type Preset } from '../context/FilterContext';
import { useAuth } from '../context/AuthContext';
import { reportsApi, syncApi, exportApi, pdfApi, expensesApi } from '../api/client';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfQuarter, startOfYear } from 'date-fns';
import {
  FiUsers, FiDollarSign, FiTrendingUp, FiDownload, FiRefreshCw, FiLogOut,
  FiBarChart2, FiActivity, FiAlertTriangle,
  FiEdit2, FiLock, FiPlus, FiTrash2, FiSearch, FiCreditCard, FiTag
} from 'react-icons/fi';

const GOLD = '#D4A843';
const RED = '#8B1A1A';
const RED_LIGHT = '#A82828';
const GREEN = '#2ECC71';
const CHART_COLORS = [GOLD, RED_LIGHT, GREEN, '#3498DB', '#9B59B6', '#E67E22', '#1ABC9C', '#E74C3C'];

const CATEGORY_COLORS: Record<string, string> = {
  'Venue & Stage': '#E67E22',
  'Audio / Visual & Lighting': '#9B59B6',
  'Prizes & Shields': '#D4A843',
  'Food & Hospitality': '#2ECC71',
  'Printing & Badges': '#3498DB',
  'Operations & Logistics': '#E74C3C',
  'Marketing & Promotion': '#1ABC9C',
  'Miscellaneous': '#95A5A6',
};

const EXPENSE_CATEGORIES = [
  'Venue & Stage',
  'Audio / Visual & Lighting',
  'Prizes & Shields',
  'Food & Hospitality',
  'Printing & Badges',
  'Operations & Logistics',
  'Marketing & Promotion',
  'Miscellaneous',
];

interface SummaryData {
  dateRange: { start: string; end: string };
  summary: { total: number; type200: number; type250: number; delta: number; previousTotal: number };
  revenue: { total: number | null; type200: number | null; type250: number | null; byPaymentMethod: Record<string, number>; isRestricted?: boolean };
  paymentBreakdown: { method: string; count: number }[];
  departmentBreakdown: { department: string; count: number }[];
  yearBreakdown: { year: string; count: number }[];
  schoolComparison: { school: string; type200: number; type250: number; total: number; revenue: number | null }[];
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

interface ExpenseItem {
  id: string;
  title: string;
  category: string;
  amount: number;
  expenseDate: string;
  paymentMethod: string;
  vendor: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface FinancialSummary {
  dateRange: { start: string; end: string };
  financials: {
    grossRevenue: number;
    totalExpenses: number;
    netBalance: number;
    profitMargin: number;
    expenseRatio: number;
    totalRegistrations: number;
    tierRevenue: { type200: number; type250: number };
  };
  categoryBreakdown: { category: string; amount: number; count: number; percentage: number }[];
}

function resolvePresetDates(preset: Preset) {
  const now = new Date();
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
  switch (preset) {
    case 'all': return { start: '2026-08-01', end: fmt(now) };
    case 'today': return { start: fmt(now), end: fmt(now) };
    case 'yesterday': { const d = subDays(now, 1); return { start: fmt(d), end: fmt(d) }; }
    case 'last7': return { start: fmt(subDays(now, 6)), end: fmt(now) };
    case 'last30': return { start: fmt(subDays(now, 29)), end: fmt(now) };
    case 'thisMonth': return { start: fmt(startOfMonth(now)), end: fmt(now) };
    case 'lastMonth': { const lm = subMonths(now, 1); return { start: fmt(startOfMonth(lm)), end: fmt(endOfMonth(lm)) }; }
    case 'thisQuarter': return { start: fmt(startOfQuarter(now)), end: fmt(now) };
    case 'ytd': return { start: fmt(startOfYear(now)), end: fmt(now) };
    default: return { start: '2026-08-01', end: fmt(now) };
  }
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'all', label: 'All Time' },
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
  const [activeTab, setActiveTab] = useState<'analytics' | 'expenses'>('analytics');

  const hasFinancialAccess = user?.role === 'admin' || user?.role === 'overall';

  // Analytics states
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<{ status: string; completedAt: string | null } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [forecastHorizon, setForecastHorizon] = useState<number>(14);
  const [forecastData, setForecastData] = useState<ForecastData | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  // Expense states
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [financials, setFinancials] = useState<FinancialSummary | null>(null);
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('');
  const [expensePaymentFilter, setExpensePaymentFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);
  const [expenseForm, setExpenseForm] = useState({
    title: '',
    category: 'Venue & Stage',
    amount: '',
    expenseDate: format(new Date(), 'yyyy-MM-dd'),
    paymentMethod: 'GPAY',
    vendor: '',
    notes: '',
  });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

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

  const fetchExpenses = useCallback(async () => {
    if (!hasFinancialAccess) return;
    try {
      const [listRes, sumRes] = await Promise.all([
        expensesApi.list(queryParams),
        expensesApi.summary(queryParams),
      ]);
      setExpenses(listRes.data.data || []);
      setFinancials(sumRes.data);
    } catch (err) {
      console.error('Failed to fetch expenses:', err);
    }
  }, [queryParams, hasFinancialAccess]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, syncRes] = await Promise.all([
        reportsApi.summary(queryParams),
        syncApi.status(),
      ]);
      setData(summaryRes.data);
      setSyncStatus(syncRes.data.lastSync);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    fetchData();
    if (hasFinancialAccess) {
      fetchExpenses();
    }
  }, [fetchData, fetchExpenses, hasFinancialAccess]);

  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'overall' || user?.role === 'analyst') {
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
      if (hasFinancialAccess) fetchExpenses();
    } catch (err) {
      console.error('Sync failed:', err);
    }
  };

  // Expense modal handlers
  const handleOpenAddExpense = () => {
    setEditingExpense(null);
    setExpenseForm({
      title: '',
      category: 'Venue & Stage',
      amount: '',
      expenseDate: format(new Date(), 'yyyy-MM-dd'),
      paymentMethod: 'GPAY',
      vendor: '',
      notes: '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleOpenEditExpense = (expense: ExpenseItem) => {
    setEditingExpense(expense);
    setExpenseForm({
      title: expense.title,
      category: expense.category,
      amount: String(expense.amount),
      expenseDate: expense.expenseDate ? expense.expenseDate.split('T')[0] : format(new Date(), 'yyyy-MM-dd'),
      paymentMethod: expense.paymentMethod || 'GPAY',
      vendor: expense.vendor || '',
      notes: expense.notes || '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleDeleteExpense = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete expense "${title}"?`)) return;
    try {
      await expensesApi.delete(id);
      fetchExpenses();
    } catch (err) {
      console.error('Failed to delete expense:', err);
      alert('Failed to delete expense.');
    }
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!expenseForm.title.trim()) {
      setFormError('Please enter an expense title.');
      return;
    }
    const amt = parseFloat(expenseForm.amount);
    if (isNaN(amt) || amt <= 0) {
      setFormError('Please enter a valid positive amount in ₹.');
      return;
    }

    setFormSubmitting(true);
    try {
      if (editingExpense) {
        await expensesApi.update(editingExpense.id, {
          title: expenseForm.title.trim(),
          category: expenseForm.category,
          amount: amt,
          expenseDate: expenseForm.expenseDate,
          paymentMethod: expenseForm.paymentMethod,
          vendor: expenseForm.vendor.trim(),
          notes: expenseForm.notes.trim(),
        });
      } else {
        await expensesApi.create({
          title: expenseForm.title.trim(),
          category: expenseForm.category,
          amount: amt,
          expenseDate: expenseForm.expenseDate,
          paymentMethod: expenseForm.paymentMethod,
          vendor: expenseForm.vendor.trim(),
          notes: expenseForm.notes.trim(),
        });
      }
      setModalOpen(false);
      fetchExpenses();
    } catch (err: any) {
      setFormError(err.response?.data?.error || 'Failed to save expense.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Filtered expenses list
  const filteredExpenses = useMemo(() => {
    return expenses.filter(item => {
      if (expenseCategoryFilter && item.category !== expenseCategoryFilter) return false;
      if (expensePaymentFilter && item.paymentMethod !== expensePaymentFilter) return false;
      if (expenseSearch) {
        const s = expenseSearch.toLowerCase();
        return item.title.toLowerCase().includes(s) ||
               (item.vendor && item.vendor.toLowerCase().includes(s)) ||
               (item.notes && item.notes.toLowerCase().includes(s));
      }
      return true;
    });
  }, [expenses, expenseCategoryFilter, expensePaymentFilter, expenseSearch]);

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
          <img src="/pyros-logo.png" alt="FAC PYROS" className="app-header__logo" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div>
            <h1 className="app-header__title">FAC PYROS</h1>
            <p className="app-header__subtitle">Registration & Financial Analytics</p>
          </div>
        </div>

        <div className="app-header__actions">
          {/* Sync Status Badge */}
          {syncStatus && (
            <div className="sync-badge" onClick={handleSync} style={{ cursor: 'pointer' }} title="Click to trigger live sync">
              <span className={`sync-badge__dot ${syncStatus.status === 'success' ? 'sync-badge__dot--success' : syncStatus.status === 'running' ? 'sync-badge__dot--syncing' : 'sync-badge__dot--error'}`} />
              <FiRefreshCw className={syncStatus.status === 'running' ? 'animate-spin' : ''} style={{ fontSize: '0.8rem' }} />
              <span>{syncStatus.status === 'running' ? 'Syncing...' : 'Live Sheets'}</span>
            </div>
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
          {(user?.role === 'admin' || user?.role === 'overall' || user?.role === 'analyst') && (
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

          <span style={{ fontSize: '0.8rem', color: '#B0B0B0', background: 'rgba(255,255,255,0.06)', padding: '4px 10px', borderRadius: '6px' }}>
            {user?.displayName} <strong style={{ color: user?.role === 'overall' ? GOLD : '#E0E0E0' }}>({user?.role?.toUpperCase()})</strong>
          </span>
          <button className="btn btn--ghost btn--sm" onClick={logout} title="Sign Out"><FiLogOut /></button>
        </div>
      </header>

      <main className="app-main">
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div className="nav-tabs animate-fade-in">
            <button
              className={`nav-tab ${activeTab === 'analytics' ? 'nav-tab--active' : ''}`}
              onClick={() => setActiveTab('analytics')}
            >
              <FiBarChart2 /> Registration Analytics
            </button>

            {hasFinancialAccess && (
              <button
                className={`nav-tab ${activeTab === 'expenses' ? 'nav-tab--active' : ''}`}
                onClick={() => setActiveTab('expenses')}
              >
                <FiDollarSign /> Financials & Expenses
              </button>
            )}
          </div>

          {/* Right Action for Expenses */}
          {activeTab === 'expenses' && hasFinancialAccess && (
            <button
              className="btn btn--primary btn--md animate-fade-in"
              onClick={handleOpenAddExpense}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}
            >
              <FiPlus /> Add New Expense
            </button>
          )}
        </div>

        {/* Filter Bar (Shared Across Tabs) */}
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

        {/* ════════════════════════ TAB 1: REGISTRATION ANALYTICS ════════════════════════ */}
        {activeTab === 'analytics' && data && (
          <>
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
                <div className="kpi-card__label">₹200 Standard Tier</div>
                <div className="kpi-card__value">{data.summary.type200.toLocaleString()}</div>
                <div style={{ fontSize: '0.75rem', color: '#B0B0B0', marginTop: '4px' }}>
                  {hasFinancialAccess ? `Revenue: ₹${(data.revenue?.type200 || 0).toLocaleString()}` : 'Registrations Ingested'}
                </div>
              </div>

              <div className="kpi-card" onClick={() => handleDrillType(250)} style={{ cursor: 'pointer' }}>
                <div className="kpi-card__label">₹250 Premium Tier</div>
                <div className="kpi-card__value">{data.summary.type250.toLocaleString()}</div>
                <div style={{ fontSize: '0.75rem', color: '#B0B0B0', marginTop: '4px' }}>
                  {hasFinancialAccess ? `Revenue: ₹${(data.revenue?.type250 || 0).toLocaleString()}` : 'Registrations Ingested'}
                </div>
              </div>

              <div className="kpi-card">
                <FiDollarSign className="kpi-card__icon" />
                <div className="kpi-card__label">Total Gross Revenue</div>
                {hasFinancialAccess && data.revenue?.total !== null ? (
                  <div className="kpi-card__value kpi-card__value--gold">
                    ₹{data.revenue.total.toLocaleString()}
                  </div>
                ) : (
                  <div style={{ marginTop: '8px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', color: '#D4A843', background: 'rgba(212,168,67,0.12)', padding: '4px 10px', borderRadius: '6px' }}>
                      <FiLock /> Overall Login Only
                    </span>
                  </div>
                )}
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
                <div className="chart-card__title">🍩 Registration Tier Breakdown</div>
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
                    >
                      <Cell fill={GOLD} />
                      <Cell fill={RED} />
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1E1E1E', border: `1px solid ${GOLD}`, borderRadius: '8px' }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Department Breakdown Bar Chart */}
            <div className="chart-card animate-fade-in" style={{ marginTop: '24px' }}>
              <div className="chart-card__title">🏛️ Department Registrations Breakdown</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                {data.departmentBreakdown.map((dept, i) => (
                  <div key={dept.department} style={{ cursor: 'pointer' }} onClick={() => handleDrillDept(dept.department)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                      <span><strong>{dept.department}</strong></span>
                      <span style={{ color: GOLD }}>{dept.count} registrations</span>
                    </div>
                    <div style={{ background: '#2C2C2C', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          background: `linear-gradient(90deg, ${CHART_COLORS[i % CHART_COLORS.length]}, ${GOLD})`,
                          width: `${(dept.count / maxDeptCount) * 100}%`,
                          height: '100%',
                          borderRadius: '4px',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Event Popularity Leaderboard */}
            <div className="chart-card animate-fade-in" style={{ marginTop: '24px' }}>
              <div className="chart-card__title">🏆 Top Event Selections</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                {data.eventPopularity.slice(0, 8).map((ev, i) => (
                  <div key={ev.event} style={{ cursor: 'pointer' }} onClick={() => handleDrillEvent(ev.event)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                      <span><strong>#{i + 1} {ev.event}</strong></span>
                      <span style={{ color: '#2ECC71' }}>{ev.count} choices ({ev.percentage}%)</span>
                    </div>
                    <div style={{ background: '#2C2C2C', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          background: `linear-gradient(90deg, ${GOLD}, #2ECC71)`,
                          width: `${(ev.count / maxEventCount) * 100}%`,
                          height: '100%',
                          borderRadius: '4px',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Registration Predictive Forecast */}
            {forecastData && (
              <div className="chart-card animate-fade-in" style={{ marginTop: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                  <div className="chart-card__title" style={{ marginBottom: 0 }}>
                    🔮 Predictive Growth Forecast
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[7, 14, 30].map(h => (
                      <button
                        key={h}
                        className={`btn btn--sm ${forecastHorizon === h ? 'btn--primary' : 'btn--ghost'}`}
                        onClick={() => setForecastHorizon(h)}
                        disabled={forecastLoading}
                      >
                        {h} Days
                      </button>
                    ))}
                  </div>
                </div>

                <div className="kpi-grid" style={{ marginBottom: '16px' }}>
                  <div className="kpi-card" style={{ padding: '12px' }}>
                    <div className="kpi-card__label">Daily Velocity</div>
                    <div className="kpi-card__value" style={{ fontSize: '1.3rem' }}>~{forecastData.metrics.averageDailyRate} / day</div>
                  </div>
                  <div className="kpi-card" style={{ padding: '12px' }}>
                    <div className="kpi-card__label">Projected Total ({forecastHorizon}d)</div>
                    <div className="kpi-card__value kpi-card__value--gold" style={{ fontSize: '1.3rem' }}>{forecastData.metrics.projectedTotal}</div>
                  </div>
                  <div className="kpi-card" style={{ padding: '12px' }}>
                    <div className="kpi-card__label">Goal Completion Date</div>
                    <div className="kpi-card__value" style={{ fontSize: '1.2rem', color: '#2ECC71' }}>{forecastData.metrics.projectedGoalDate || 'Calculating...'}</div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════════════════════ TAB 2: FINANCIALS & EXPENSES ════════════════════════ */}
        {activeTab === 'expenses' && hasFinancialAccess && (
          <div className="animate-fade-in">
            {/* Executive Financial Metrics */}
            <div className="kpi-grid" style={{ marginBottom: '24px' }}>
              <div className="kpi-card">
                <FiDollarSign className="kpi-card__icon" />
                <div className="kpi-card__label">Total Gross Revenue</div>
                <div className="kpi-card__value kpi-card__value--gold">
                  ₹{(financials?.financials.grossRevenue || 0).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#B0B0B0', marginTop: '4px' }}>
                  From {financials?.financials.totalRegistrations || 0} Registrations
                </div>
              </div>

              <div className="kpi-card">
                <FiCreditCard className="kpi-card__icon" style={{ color: RED_LIGHT }} />
                <div className="kpi-card__label">Total Expenses</div>
                <div className="kpi-card__value" style={{ color: RED_LIGHT }}>
                  ₹{(financials?.financials.totalExpenses || 0).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#B0B0B0', marginTop: '4px' }}>
                  {expenses.length} Expense items recorded
                </div>
              </div>

              <div className="kpi-card" style={{ border: '1px solid rgba(46, 204, 113, 0.4)' }}>
                <FiTrendingUp className="kpi-card__icon" style={{ color: GREEN }} />
                <div className="kpi-card__label">Net Profit / Balance</div>
                <div className="kpi-card__value" style={{ color: GREEN }}>
                  ₹{(financials?.financials.netBalance || 0).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.75rem', color: GREEN, marginTop: '4px' }}>
                  {financials?.financials.profitMargin || 0}% Net Margin
                </div>
              </div>

              <div className="kpi-card">
                <FiTag className="kpi-card__icon" />
                <div className="kpi-card__label">Expense-to-Revenue Ratio</div>
                <div className="kpi-card__value">
                  {financials?.financials.expenseRatio || 0}%
                </div>
                <div style={{ fontSize: '0.75rem', color: '#B0B0B0', marginTop: '4px' }}>
                  Budget utilization
                </div>
              </div>
            </div>

            {/* Expenses Visual Breakdown */}
            <div className="charts-grid" style={{ marginBottom: '24px' }}>
              {/* Category Spending Donut Chart */}
              <div className="chart-card">
                <div className="chart-card__title">🍩 Categorical Spending Distribution</div>
                {financials && financials.categoryBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={financials.categoryBreakdown}
                        cx="50%" cy="50%"
                        innerRadius={60} outerRadius={95}
                        paddingAngle={4}
                        dataKey="amount"
                        nameKey="category"
                      >
                        {financials.categoryBreakdown.map((entry) => (
                          <Cell
                            key={entry.category}
                            fill={CATEGORY_COLORS[entry.category] || GOLD}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: any) => [`₹${Number(val).toLocaleString()}`, 'Amount']}
                        contentStyle={{ background: '#1E1E1E', border: `1px solid ${GOLD}`, borderRadius: '8px' }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
                    No expenses recorded in this period.
                  </div>
                )}
              </div>

              {/* Category Breakdown Bars */}
              <div className="chart-card">
                <div className="chart-card__title">📊 Spending by Department / Area</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
                  {financials?.categoryBreakdown.map((cat) => (
                    <div key={cat.category}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                        <span>
                          <span
                            style={{
                              display: 'inline-block',
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              backgroundColor: CATEGORY_COLORS[cat.category] || GOLD,
                              marginRight: '8px',
                            }}
                          />
                          <strong>{cat.category}</strong>
                        </span>
                        <span style={{ color: GOLD }}>₹{cat.amount.toLocaleString()} ({cat.percentage}%)</span>
                      </div>
                      <div style={{ background: '#2C2C2C', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            background: CATEGORY_COLORS[cat.category] || GOLD,
                            width: `${cat.percentage}%`,
                            height: '100%',
                            borderRadius: '4px',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  {(!financials || financials.categoryBreakdown.length === 0) && (
                    <div style={{ textAlign: 'center', color: '#888', padding: '40px 0' }}>
                      No categorical expenses logged yet.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Expenses Records Table & Manager */}
            <div className="chart-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div className="chart-card__title" style={{ marginBottom: 0 }}>
                  📋 Itemized Expenses Log ({filteredExpenses.length})
                </div>

                {/* Filters and Search */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative' }}>
                    <FiSearch style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '10px', color: '#808080' }} />
                    <input
                      type="text"
                      className="form-group__input"
                      placeholder="Search title, vendor..."
                      value={expenseSearch}
                      onChange={(e) => setExpenseSearch(e.target.value)}
                      style={{ paddingLeft: '32px', width: '180px', fontSize: '0.8rem', padding: '6px 10px 6px 32px' }}
                    />
                  </div>

                  <select
                    className="form-group__input"
                    value={expenseCategoryFilter}
                    onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                    style={{ width: '160px', fontSize: '0.8rem', padding: '6px 8px' }}
                  >
                    <option value="">All Categories</option>
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>

                  <select
                    className="form-group__input"
                    value={expensePaymentFilter}
                    onChange={(e) => setExpensePaymentFilter(e.target.value)}
                    style={{ width: '130px', fontSize: '0.8rem', padding: '6px 8px' }}
                  >
                    <option value="">All Modes</option>
                    <option value="GPAY">GPAY</option>
                    <option value="CASH">CASH</option>
                    <option value="BANK TRANSFER">BANK</option>
                    <option value="OTHER">OTHER</option>
                  </select>
                </div>
              </div>

              {/* Table */}
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Expense Item</th>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Category</th>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Vendor / Payee</th>
                      <th style={{ textAlign: 'left', padding: '10px' }}>Payment Mode</th>
                      <th style={{ textAlign: 'right', padding: '10px' }}>Amount (₹)</th>
                      <th style={{ textAlign: 'center', padding: '10px' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map((exp) => (
                      <tr key={exp.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '10px', whiteSpace: 'nowrap', color: '#B0B0B0' }}>
                          {exp.expenseDate ? format(new Date(exp.expenseDate), 'dd MMM yyyy') : '—'}
                        </td>
                        <td style={{ padding: '10px' }}>
                          <strong style={{ color: '#F5F5F5' }}>{exp.title}</strong>
                          {exp.notes && (
                            <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '2px' }}>
                              {exp.notes}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span
                            className="badge-cat"
                            style={{
                              backgroundColor: `${CATEGORY_COLORS[exp.category] || GOLD}22`,
                              color: CATEGORY_COLORS[exp.category] || GOLD,
                              border: `1px solid ${CATEGORY_COLORS[exp.category] || GOLD}55`,
                            }}
                          >
                            {exp.category}
                          </span>
                        </td>
                        <td style={{ padding: '10px', color: '#B0B0B0' }}>{exp.vendor || '—'}</td>
                        <td style={{ padding: '10px' }}>
                          <span style={{ fontSize: '0.75rem', background: '#252525', padding: '2px 6px', borderRadius: '4px', border: '1px solid #404040' }}>
                            {exp.paymentMethod}
                          </span>
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: GOLD }}>
                          ₹{exp.amount.toLocaleString()}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button
                              className="btn btn--ghost btn--sm"
                              style={{ padding: '4px 8px' }}
                              onClick={() => handleOpenEditExpense(exp)}
                              title="Edit Expense"
                            >
                              <FiEdit2 />
                            </button>
                            <button
                              className="btn btn--ghost btn--sm"
                              style={{ padding: '4px 8px', color: '#E74C3C' }}
                              onClick={() => handleDeleteExpense(exp.id, exp.title)}
                              title="Delete Expense"
                            >
                              <FiTrash2 />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredExpenses.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: '#888' }}>
                          No expenses matching the filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ════════════════════════ ADD / EDIT EXPENSE MODAL ════════════════════════ */}
      {modalOpen && (
        <div className="modal-backdrop animate-fade-in" onClick={() => setModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                {editingExpense ? <FiEdit2 /> : <FiPlus />}
                {editingExpense ? 'Edit Expense Record' : 'Record New Expense'}
              </div>
              <button className="modal-close" onClick={() => setModalOpen(false)}>×</button>
            </div>

            {formError && (
              <div className="alert-item alert-item--danger" style={{ marginBottom: '16px' }}>
                <FiAlertTriangle /> {formError}
              </div>
            )}

            <form onSubmit={handleSaveExpense}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-group__label">Expense Title / Item Description *</label>
                <input
                  type="text"
                  className="form-group__input"
                  placeholder="e.g. Auditorium Sound System & Stage Lighting"
                  value={expenseForm.title}
                  onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-group__label">Category *</label>
                  <select
                    className="form-group__input"
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                    required
                  >
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-group__label">Amount (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    className="form-group__input"
                    placeholder="e.g. 12000"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="form-group">
                  <label className="form-group__label">Expense Date *</label>
                  <input
                    type="date"
                    className="form-group__input"
                    value={expenseForm.expenseDate}
                    onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-group__label">Payment Method *</label>
                  <select
                    className="form-group__input"
                    value={expenseForm.paymentMethod}
                    onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}
                    required
                  >
                    <option value="GPAY">GPAY / UPI</option>
                    <option value="CASH">Cash</option>
                    <option value="BANK TRANSFER">Bank Transfer</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-group__label">Vendor / Payee Name</label>
                <input
                  type="text"
                  className="form-group__input"
                  placeholder="e.g. SoundPro Event Rentals"
                  value={expenseForm.vendor}
                  onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label className="form-group__label">Additional Notes / Receipt Details</label>
                <textarea
                  className="form-group__input"
                  rows={3}
                  placeholder="e.g. Advance paid on Sept 2, final settlement on Sept 4 with bill #1042"
                  value={expenseForm.notes}
                  onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setModalOpen(false)}
                  disabled={formSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={formSubmitting}
                >
                  {formSubmitting ? 'Saving...' : editingExpense ? 'Update Expense' : 'Save Expense Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
