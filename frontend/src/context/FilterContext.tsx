import { createContext, useContext, useReducer, type ReactNode, type Dispatch, useCallback } from 'react';
import { format } from 'date-fns';

export type Preset = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'ytd' | 'custom';

interface FilterState {
  preset: Preset;
  startDate: string;
  endDate: string;
  registrationType: number | null; // 200, 250, or null for all
  department: string | null;
  school: string | null;
  year: string | null;
  event: string | null;
  paymentMethod: string | null;
}

type FilterAction =
  | { type: 'SET_PRESET'; preset: Preset; start: string; end: string }
  | { type: 'SET_DATE_RANGE'; start: string; end: string }
  | { type: 'SET_REGISTRATION_TYPE'; value: number | null }
  | { type: 'SET_DEPARTMENT'; value: string | null }
  | { type: 'SET_SCHOOL'; value: string | null }
  | { type: 'SET_YEAR'; value: string | null }
  | { type: 'SET_EVENT'; value: string | null }
  | { type: 'SET_PAYMENT_METHOD'; value: string | null }
  | { type: 'CLEAR_ALL' };

const initialState: FilterState = {
  preset: 'thisMonth',
  startDate: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
  registrationType: null,
  department: null,
  school: null,
  year: null,
  event: null,
  paymentMethod: null,
};

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'SET_PRESET':
      return { ...state, preset: action.preset, startDate: action.start, endDate: action.end };
    case 'SET_DATE_RANGE':
      return { ...state, preset: 'custom', startDate: action.start, endDate: action.end };
    case 'SET_REGISTRATION_TYPE':
      return { ...state, registrationType: action.value };
    case 'SET_DEPARTMENT':
      return { ...state, department: action.value };
    case 'SET_SCHOOL':
      return { ...state, school: action.value };
    case 'SET_YEAR':
      return { ...state, year: action.value };
    case 'SET_EVENT':
      return { ...state, event: action.value };
    case 'SET_PAYMENT_METHOD':
      return { ...state, paymentMethod: action.value };
    case 'CLEAR_ALL':
      return initialState;
    default:
      return state;
  }
}

interface FilterContextType {
  filters: FilterState;
  dispatch: Dispatch<FilterAction>;
  queryParams: Record<string, string>;
  activeFilterCount: number;
  clearAllFilters: () => void;
}

const FilterContext = createContext<FilterContextType | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, dispatch] = useReducer(filterReducer, initialState);

  const queryParams: Record<string, string> = {
    start: filters.startDate,
    end: filters.endDate,
  };
  if (filters.registrationType) queryParams.type = String(filters.registrationType);
  if (filters.department) queryParams.department = filters.department;
  if (filters.school) queryParams.school = filters.school;
  if (filters.year) queryParams.year = filters.year;
  if (filters.event) queryParams.event = filters.event;
  if (filters.paymentMethod) queryParams.payment = filters.paymentMethod;

  const activeFilterCount = [
    filters.registrationType,
    filters.department,
    filters.school,
    filters.year,
    filters.event,
    filters.paymentMethod,
  ].filter(Boolean).length;

  const clearAllFilters = useCallback(() => dispatch({ type: 'CLEAR_ALL' }), []);

  return (
    <FilterContext.Provider value={{ filters, dispatch, queryParams, activeFilterCount, clearAllFilters }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilters must be used within FilterProvider');
  return ctx;
}
