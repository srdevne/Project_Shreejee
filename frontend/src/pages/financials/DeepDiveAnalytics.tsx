import { useEffect, useState, useMemo } from 'react';
import { TrendingUp, ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchSheetData } from '../../services/googleSheets';
// date-fns used for dateToFYMonth helper below
import { formatBagInventory } from '../../services/materialsHelper';

// ── FY helpers ───────────────────────────────────────────────────────────────
const FY_MONTHS = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'] as const;
const MONTH_LABELS: Record<string, string> = {
    apr: 'Apr', may: 'May', jun: 'Jun', jul: 'Jul', aug: 'Aug', sep: 'Sep',
    oct: 'Oct', nov: 'Nov', dec: 'Dec', jan: 'Jan', feb: 'Feb', mar: 'Mar',
};
const MONTH_INDEX: Record<string, number> = {
    apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11, jan: 0, feb: 1, mar: 2,
};

type PeriodType = 'month' | 'fy' | 'all' | typeof FY_MONTHS[number];
type TabType = 'materials' | 'customers' | 'suppliers' | 'trends';
type SortDir = 'asc' | 'desc';

function getFYMonthYear(mk: string, fyStartYear: number) {
    const m = MONTH_INDEX[mk];
    return { month: m, year: m >= 3 ? fyStartYear : fyStartYear + 1 };
}
function getMonthLabel(mk: string, fyStartYear: number) {
    const { year } = getFYMonthYear(mk, fyStartYear);
    return `${MONTH_LABELS[mk]} ${String(year).slice(2)}`;
}
function getFullMonthLabel(mk: string, fyStartYear: number) {
    const { year } = getFYMonthYear(mk, fyStartYear);
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${names[MONTH_INDEX[mk]]} ${year}`;
}
function dateToFYMonth(dateStr: string): string {
    const d = new Date(dateStr);
    const m = d.getMonth(); const y = d.getFullYear();
    return `${y}-${String(m + 1).padStart(2, '0')}`;
}

const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtRate = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Component ────────────────────────────────────────────────────────────────
export default function DeepDiveAnalytics() {
    const { accessToken } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const [period, setPeriod] = useState<PeriodType>('fy');
    const [tab, setTab] = useState<TabType>('materials');

    // Raw data
    const [salesData, setSalesData] = useState<any[][]>([]);
    const [saleItemsData, setSaleItemsData] = useState<any[][]>([]);
    const [purchasesData, setPurchasesData] = useState<any[][]>([]);
    const [purchaseItemsData, setPurchaseItemsData] = useState<any[][]>([]);
    const [materialsData, setMaterialsData] = useState<any[][]>([]);
    const [expensesData, setExpensesData] = useState<any[][]>([]);

    // Sort state
    const [matSort, setMatSort] = useState<{ col: string; dir: SortDir }>({ col: 'revenue', dir: 'desc' });
    const [custSort, setCustSort] = useState<{ col: string; dir: SortDir }>({ col: 'revenue', dir: 'desc' });
    const [suppSort, setSuppSort] = useState<{ col: string; dir: SortDir }>({ col: 'cost', dir: 'desc' });

    // Expand state for drill-down
    const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
    const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);

    const now = new Date();
    const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const currentFYStart = new Date(fyStartYear, 3, 1);

    useEffect(() => {
        const load = async () => {
            if (!accessToken) return;
            setIsLoading(true);
            try {
                const [sales, saleItems, purchases, purchaseItems, materials, expenses] = await Promise.all([
                    fetchSheetData(accessToken, 'Sales!A2:Q'),
                    fetchSheetData(accessToken, 'Sale_Items!A2:I'),
                    fetchSheetData(accessToken, 'Purchases!A2:L'),
                    fetchSheetData(accessToken, 'Purchase_Items!A2:H'),
                    fetchSheetData(accessToken, 'Materials!A2:I'),
                    fetchSheetData(accessToken, 'Expenses!A2:F'),
                ]);
                setSalesData(sales); setSaleItemsData(saleItems);
                setPurchasesData(purchases); setPurchaseItemsData(purchaseItems);
                setMaterialsData(materials); setExpensesData(expenses);
            } catch (err) { console.error(err); } finally { setIsLoading(false); }
        };
        load();
    }, [accessToken]);

    const filterDate = (dateStr: string): boolean => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        if (period === 'fy') return d >= currentFYStart;
        if (period === 'all') return true;
        const { month, year } = getFYMonthYear(period, fyStartYear);
        return d.getMonth() === month && d.getFullYear() === year;
    };

    // ── Sales/Purchase date maps for linking items to dates ──────────────────
    const saleDateMap = useMemo(() => {
        const m: Record<string, any[]> = {};
        salesData.forEach(s => { m[s[0]] = s; });
        return m;
    }, [salesData]);

    const purchaseDateMap = useMemo(() => {
        const m: Record<string, any[]> = {};
        purchasesData.forEach(p => { m[p[0]] = p; });
        return m;
    }, [purchasesData]);

    // ═══════════════════════════════════════════════════════════════════════════
    // TAB 1: MATERIAL ANALYTICS
    // ═══════════════════════════════════════════════════════════════════════════
    const materialAnalytics = useMemo(() => {
        if (isLoading) return [];

        // Weighted avg cost (all time, includes opening stock)
        const matCost: Record<string, number> = {};
        const matTotalKg: Record<string, number> = {};
        purchaseItemsData.forEach(item => {
            const id = item[2]; const kg = parseFloat(item[5] || '0'); const amt = parseFloat(item[7] || '0');
            matCost[id] = (matCost[id] || 0) + amt;
            matTotalKg[id] = (matTotalKg[id] || 0) + kg;
        });
        materialsData.forEach(mat => {
            const id = mat[0];
            const openKg = (parseFloat(mat[3] || '0') * 25) + parseFloat(mat[4] || '0');
            const openRate = parseFloat(mat[6] || '0');
            if (openKg > 0 && openRate > 0) {
                matCost[id] = (matCost[id] || 0) + openKg * openRate;
                matTotalKg[id] = (matTotalKg[id] || 0) + openKg;
            }
        });
        const avgCost: Record<string, number> = {};
        Object.keys(matCost).forEach(id => { avgCost[id] = matTotalKg[id] ? matCost[id] / matTotalKg[id] : 0; });

        // Per-material period aggregation
        const matMap: Record<string, { name: string; purchasedKg: number; purchaseCost: number; soldKg: number; salesRevenue: number }> = {};
        materialsData.forEach(mat => { matMap[mat[0]] = { name: mat[1], purchasedKg: 0, purchaseCost: 0, soldKg: 0, salesRevenue: 0 }; });

        purchaseItemsData.forEach(item => {
            const p = purchaseDateMap[item[1]];
            if (p && filterDate(p[2])) {
                const id = item[2];
                if (!matMap[id]) matMap[id] = { name: item[3], purchasedKg: 0, purchaseCost: 0, soldKg: 0, salesRevenue: 0 };
                matMap[id].purchasedKg += parseFloat(item[5] || '0');
                matMap[id].purchaseCost += parseFloat(item[7] || '0');
            }
        });
        saleItemsData.forEach(item => {
            const s = saleDateMap[item[1]];
            if (s && filterDate(s[2])) {
                const id = item[2];
                if (!matMap[id]) matMap[id] = { name: item[3], purchasedKg: 0, purchaseCost: 0, soldKg: 0, salesRevenue: 0 };
                matMap[id].soldKg += parseFloat(item[5] || '0');
                matMap[id].salesRevenue += parseFloat(item[8] || '0');
            }
        });

        // Stock (all time)
        const allInward: Record<string, number> = {};
        const allOutward: Record<string, number> = {};
        purchaseItemsData.forEach(item => { allInward[item[2]] = (allInward[item[2]] || 0) + parseFloat(item[5] || '0'); });
        saleItemsData.forEach(item => { allOutward[item[2]] = (allOutward[item[2]] || 0) + parseFloat(item[5] || '0'); });

        return Object.entries(matMap).map(([id, data]) => {
            const openKg = materialsData.find(m => m[0] === id) ? (parseFloat(materialsData.find(m => m[0] === id)![3] || '0') * 25) + parseFloat(materialsData.find(m => m[0] === id)![4] || '0') : 0;
            const stockKg = Math.max(0, openKg + (allInward[id] || 0) - (allOutward[id] || 0));
            const cost = avgCost[id] || 0;
            const profit = data.salesRevenue - (cost * data.soldKg);
            const margin = data.salesRevenue > 0 ? (profit / data.salesRevenue) * 100 : 0;
            return {
                id, name: data.name,
                purchasedKg: data.purchasedKg, purchaseCost: data.purchaseCost,
                soldKg: data.soldKg, salesRevenue: data.salesRevenue,
                avgBuyRate: data.purchasedKg > 0 ? data.purchaseCost / data.purchasedKg : 0,
                avgSellRate: data.soldKg > 0 ? data.salesRevenue / data.soldKg : 0,
                profit, margin, stockKg, stockValue: stockKg * cost,
            };
        }).filter(m => m.name);
    }, [isLoading, period, salesData, saleItemsData, purchasesData, purchaseItemsData, materialsData]);

    const sortedMaterials = useMemo(() => {
        const arr = [...materialAnalytics];
        const dir = matSort.dir === 'asc' ? 1 : -1;
        const key = matSort.col as keyof typeof arr[0];
        arr.sort((a, b) => {
            const av = a[key] ?? 0; const bv = b[key] ?? 0;
            return typeof av === 'number' ? (av as number - (bv as number)) * dir : String(av).localeCompare(String(bv)) * dir;
        });
        return arr;
    }, [materialAnalytics, matSort]);

    // ═══════════════════════════════════════════════════════════════════════════
    // TAB 2: CUSTOMER ANALYTICS
    // ═══════════════════════════════════════════════════════════════════════════
    const customerAnalytics = useMemo(() => {
        if (isLoading) return [];
        const custMap: Record<string, { name: string; invoices: number; revenue: number; kgSold: number; bankRev: number; cashRev: number; outstanding: number; monthly: Record<string, { invoices: number; revenue: number; kg: number }> }> = {};

        salesData.filter(s => filterDate(s[2])).forEach(sale => {
            const custId = sale[4]; const name = sale[5]; const amt = parseFloat(sale[10] || '0');
            const mode = sale[11] || '';
            if (!custMap[custId]) custMap[custId] = { name, invoices: 0, revenue: 0, kgSold: 0, bankRev: 0, cashRev: 0, outstanding: 0, monthly: {} };
            const c = custMap[custId];
            c.invoices++;
            c.revenue += amt;
            if (mode === 'Cash' || mode === 'Cash-Invoice') c.cashRev += amt;
            else c.bankRev += amt;
            if (sale[12] !== 'Confirmed') c.outstanding += amt;
            // Monthly
            const mk = dateToFYMonth(sale[2]);
            if (!c.monthly[mk]) c.monthly[mk] = { invoices: 0, revenue: 0, kg: 0 };
            c.monthly[mk].invoices++;
            c.monthly[mk].revenue += amt;
        });

        // KG sold per customer
        saleItemsData.forEach(item => {
            const sale = saleDateMap[item[1]];
            if (sale && filterDate(sale[2])) {
                const custId = sale[4];
                if (custMap[custId]) {
                    custMap[custId].kgSold += parseFloat(item[5] || '0');
                    const mk = dateToFYMonth(sale[2]);
                    if (custMap[custId].monthly[mk]) custMap[custId].monthly[mk].kg += parseFloat(item[5] || '0');
                }
            }
        });

        return Object.entries(custMap).map(([id, d]) => ({
            id, name: d.name, invoices: d.invoices, revenue: d.revenue, kgSold: d.kgSold,
            avgOrderValue: d.invoices > 0 ? d.revenue / d.invoices : 0,
            bankRev: d.bankRev, cashRev: d.cashRev, outstanding: d.outstanding,
            monthly: Object.entries(d.monthly).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ month: m, ...v })),
        }));
    }, [isLoading, period, salesData, saleItemsData]);

    const sortedCustomers = useMemo(() => {
        const arr = [...customerAnalytics];
        const dir = custSort.dir === 'asc' ? 1 : -1;
        const key = custSort.col as keyof typeof arr[0];
        arr.sort((a, b) => {
            const av = a[key] ?? 0; const bv = b[key] ?? 0;
            return typeof av === 'number' ? (av as number - (bv as number)) * dir : String(av).localeCompare(String(bv)) * dir;
        });
        return arr;
    }, [customerAnalytics, custSort]);

    // ═══════════════════════════════════════════════════════════════════════════
    // TAB 3: SUPPLIER ANALYTICS
    // ═══════════════════════════════════════════════════════════════════════════
    const supplierAnalytics = useMemo(() => {
        if (isLoading) return [];
        const suppMap: Record<string, { name: string; purchases: number; cost: number; kgBought: number; materials: Set<string>; monthly: Record<string, { purchases: number; cost: number; kg: number }> }> = {};

        purchasesData.filter(p => filterDate(p[2])).forEach(p => {
            const suppId = p[3]; const name = p[4]; const amt = parseFloat(p[7] || '0');
            if (!suppMap[suppId]) suppMap[suppId] = { name, purchases: 0, cost: 0, kgBought: 0, materials: new Set(), monthly: {} };
            const s = suppMap[suppId];
            s.purchases++;
            s.cost += amt;
            const mk = dateToFYMonth(p[2]);
            if (!s.monthly[mk]) s.monthly[mk] = { purchases: 0, cost: 0, kg: 0 };
            s.monthly[mk].purchases++;
            s.monthly[mk].cost += amt;
        });

        purchaseItemsData.forEach(item => {
            const p = purchaseDateMap[item[1]];
            if (p && filterDate(p[2])) {
                const suppId = p[3];
                if (suppMap[suppId]) {
                    suppMap[suppId].kgBought += parseFloat(item[5] || '0');
                    suppMap[suppId].materials.add(item[3] || '');
                    const mk = dateToFYMonth(p[2]);
                    if (suppMap[suppId].monthly[mk]) suppMap[suppId].monthly[mk].kg += parseFloat(item[5] || '0');
                }
            }
        });

        return Object.entries(suppMap).map(([id, d]) => ({
            id, name: d.name, purchases: d.purchases, cost: d.cost, kgBought: d.kgBought,
            avgRate: d.kgBought > 0 ? d.cost / d.kgBought : 0,
            materials: [...d.materials].filter(Boolean).join(', '),
            monthly: Object.entries(d.monthly).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ month: m, ...v })),
        }));
    }, [isLoading, period, purchasesData, purchaseItemsData]);

    const sortedSuppliers = useMemo(() => {
        const arr = [...supplierAnalytics];
        const dir = suppSort.dir === 'asc' ? 1 : -1;
        const key = suppSort.col as keyof typeof arr[0];
        arr.sort((a, b) => {
            const av = a[key] ?? 0; const bv = b[key] ?? 0;
            return typeof av === 'number' ? (av as number - (bv as number)) * dir : String(av).localeCompare(String(bv)) * dir;
        });
        return arr;
    }, [supplierAnalytics, suppSort]);

    // ═══════════════════════════════════════════════════════════════════════════
    // TAB 4: MONTHLY TRENDS
    // ═══════════════════════════════════════════════════════════════════════════
    const monthlyTrends = useMemo(() => {
        if (isLoading) return [];

        // Weighted avg cost (all time)
        const matCost: Record<string, number> = {};
        const matTotalKg: Record<string, number> = {};
        purchaseItemsData.forEach(item => {
            const id = item[2]; matCost[id] = (matCost[id] || 0) + parseFloat(item[7] || '0');
            matTotalKg[id] = (matTotalKg[id] || 0) + parseFloat(item[5] || '0');
        });
        materialsData.forEach(mat => {
            const id = mat[0]; const openKg = (parseFloat(mat[3] || '0') * 25) + parseFloat(mat[4] || '0');
            const openRate = parseFloat(mat[6] || '0');
            if (openKg > 0 && openRate > 0) { matCost[id] = (matCost[id] || 0) + openKg * openRate; matTotalKg[id] = (matTotalKg[id] || 0) + openKg; }
        });
        const avgCost: Record<string, number> = {};
        Object.keys(matCost).forEach(id => { avgCost[id] = matTotalKg[id] ? matCost[id] / matTotalKg[id] : 0; });

        const currentMonthIdx = FY_MONTHS.findIndex(m => {
            const { month, year } = getFYMonthYear(m, fyStartYear);
            return month === now.getMonth() && year === now.getFullYear();
        });
        const monthsToShow = FY_MONTHS.slice(0, currentMonthIdx + 1);

        return monthsToShow.map(mk => {
            const { month, year } = getFYMonthYear(mk, fyStartYear);
            const inMonth = (ds: string) => { if (!ds) return false; const d = new Date(ds); return d.getMonth() === month && d.getFullYear() === year; };

            let revenue = 0, cashSales = 0, bankSales = 0;
            const matKgSold: Record<string, number> = {};
            const custRevenue: Record<string, { name: string; revenue: number }> = {};

            salesData.filter(s => inMonth(s[2])).forEach(s => {
                const amt = parseFloat(s[10] || '0');
                revenue += amt;
                if (s[11] === 'Cash' || s[11] === 'Cash-Invoice') cashSales += amt; else bankSales += amt;
                if (!custRevenue[s[4]]) custRevenue[s[4]] = { name: s[5], revenue: 0 };
                custRevenue[s[4]].revenue += amt;
            });

            let cogs = 0;
            saleItemsData.forEach(item => {
                const s = saleDateMap[item[1]];
                if (s && inMonth(s[2])) {
                    const id = item[2]; const kg = parseFloat(item[5] || '0');
                    cogs += (avgCost[id] || 0) * kg;
                    matKgSold[id] = (matKgSold[id] || 0) + kg;
                }
            });

            let expenses = 0;
            expensesData.filter(e => inMonth(e[1])).forEach(e => { expenses += parseFloat(e[3] || '0'); });

            // Top material
            let topMat = '—';
            let topMatKg = 0;
            Object.entries(matKgSold).forEach(([id, kg]) => {
                if (kg > topMatKg) { topMatKg = kg; const mat = materialsData.find(m => m[0] === id); topMat = mat ? mat[1] : id; }
            });

            // Top customer
            let topCust = '—';
            let topCustRev = 0;
            Object.values(custRevenue).forEach(c => { if (c.revenue > topCustRev) { topCustRev = c.revenue; topCust = c.name; } });

            return {
                key: mk, label: getFullMonthLabel(mk, fyStartYear),
                revenue, cogs, grossProfit: revenue - cogs, expenses, netProfit: revenue - cogs - expenses,
                cashSales, bankSales, topMat, topCust,
            };
        });
    }, [isLoading, salesData, saleItemsData, purchasesData, purchaseItemsData, materialsData, expensesData, fyStartYear]);

    // ── Sort toggle helpers ──────────────────────────────────────────────────
    const toggleSort = (setter: Function, current: { col: string; dir: SortDir }, col: string) => {
        setter(current.col === col ? { col, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });
    };
    const sortIcon = (current: { col: string; dir: SortDir }, col: string) =>
        current.col === col ? (current.dir === 'asc' ? ' ▲' : ' ▼') : '';

    // ── Margin color helper ──────────────────────────────────────────────────
    const marginColor = (m: number) => m > 15 ? 'var(--color-secondary)' : m > 5 ? 'var(--color-warning)' : 'var(--color-danger)';
    const trendArrow = (curr: number, prev: number) => {
        if (prev === 0) return null;
        const diff = curr - prev;
        if (diff > 0) return <span style={{ color: 'var(--color-secondary)', fontSize: '0.75rem' }}> ▲</span>;
        if (diff < 0) return <span style={{ color: 'var(--color-danger)', fontSize: '0.75rem' }}> ▼</span>;
        return null;
    };

    const tabs: { key: TabType; label: string }[] = [
        { key: 'materials', label: 'Materials' },
        { key: 'customers', label: 'Customers' },
        { key: 'suppliers', label: 'Suppliers' },
        { key: 'trends', label: 'Monthly Trends' },
    ];

    // ── RENDER ───────────────────────────────────────────────────────────────
    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <TrendingUp size={24} color="var(--color-primary)" />
                        Deep-Dive Analytics
                    </h1>
                    <p>Material, customer, and supplier level breakdowns.</p>
                </div>
            </div>

            {/* Period Filter */}
            <div style={{ marginBottom: '1rem', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '0.25rem' }}>
                <div style={{ display: 'flex', gap: '0.35rem', whiteSpace: 'nowrap' }}>
                    <button className={`btn ${period === 'month' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem' }} onClick={() => setPeriod('month')}>This Month</button>
                    <span style={{ borderLeft: '1px solid var(--border-color)', margin: '0 0.15rem' }} />
                    {FY_MONTHS.map(m => (
                        <button key={m} className={`btn ${period === m ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ padding: '0.35rem 0.6rem', fontSize: '0.72rem' }} onClick={() => setPeriod(m)}>
                            {getMonthLabel(m, fyStartYear)}
                        </button>
                    ))}
                    <span style={{ borderLeft: '1px solid var(--border-color)', margin: '0 0.15rem' }} />
                    <button className={`btn ${period === 'fy' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem' }} onClick={() => setPeriod('fy')}>
                        FY {fyStartYear}-{String(fyStartYear + 1).slice(2)}
                    </button>
                    <button className={`btn ${period === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem' }} onClick={() => setPeriod('all')}>All Time</button>
                </div>
            </div>

            {/* Tab Bar */}
            <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--border-color)', marginBottom: '1.5rem' }}>
                {tabs.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)} style={{
                        padding: '0.6rem 1.25rem', fontSize: '0.85rem', fontWeight: tab === t.key ? 700 : 500,
                        color: tab === t.key ? 'var(--color-primary)' : 'var(--text-secondary)',
                        background: 'none', border: 'none', borderBottom: tab === t.key ? '3px solid var(--color-primary)' : '3px solid transparent',
                        cursor: 'pointer', transition: 'all var(--transition-fast)', marginBottom: '-2px',
                    }}>{t.label}</button>
                ))}
            </div>

            {isLoading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading analytics…</div>
            ) : (
                <>
                    {/* ═══ TAB 1: MATERIALS ═══ */}
                    {tab === 'materials' && (
                        <div className="card" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                            <table style={{ fontSize: '0.8rem', minWidth: '900px' }}>
                                <thead>
                                    <tr>
                                        <th style={{ cursor: 'pointer' }} onClick={() => toggleSort(setMatSort, matSort, 'name')}>Material{sortIcon(matSort, 'name')}</th>
                                        <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort(setMatSort, matSort, 'purchasedKg')}>Purchased KG{sortIcon(matSort, 'purchasedKg')}</th>
                                        <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort(setMatSort, matSort, 'purchaseCost')}>Purchase ₹{sortIcon(matSort, 'purchaseCost')}</th>
                                        <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort(setMatSort, matSort, 'soldKg')}>Sold KG{sortIcon(matSort, 'soldKg')}</th>
                                        <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort(setMatSort, matSort, 'salesRevenue')}>Revenue ₹{sortIcon(matSort, 'salesRevenue')}</th>
                                        <th style={{ textAlign: 'right' }}>Buy Rate</th>
                                        <th style={{ textAlign: 'right' }}>Sell Rate</th>
                                        <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort(setMatSort, matSort, 'profit')}>Profit ₹{sortIcon(matSort, 'profit')}</th>
                                        <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort(setMatSort, matSort, 'margin')}>Margin %{sortIcon(matSort, 'margin')}</th>
                                        <th style={{ textAlign: 'right' }}>Stock</th>
                                        <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort(setMatSort, matSort, 'stockValue')}>Stock Value{sortIcon(matSort, 'stockValue')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedMaterials.map(m => (
                                        <tr key={m.id}>
                                            <td style={{ fontWeight: 600 }}>{m.name}</td>
                                            <td style={{ textAlign: 'right' }}>{m.purchasedKg.toLocaleString('en-IN')}</td>
                                            <td style={{ textAlign: 'right' }}>{fmt(m.purchaseCost)}</td>
                                            <td style={{ textAlign: 'right' }}>{m.soldKg.toLocaleString('en-IN')}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(m.salesRevenue)}</td>
                                            <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{fmtRate(m.avgBuyRate)}</td>
                                            <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{fmtRate(m.avgSellRate)}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: m.profit >= 0 ? 'var(--color-secondary)' : 'var(--color-danger)' }}>{fmt(m.profit)}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 600, color: marginColor(m.margin) }}>{m.margin.toFixed(1)}%</td>
                                            <td style={{ textAlign: 'right' }}><span className={`badge ${m.stockKg <= 0 ? 'badge-danger' : m.stockKg < 250 ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '0.7rem' }}>{formatBagInventory(m.stockKg)}</span></td>
                                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(m.stockValue)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ fontWeight: 700, backgroundColor: 'var(--bg-app)' }}>
                                        <td>Total</td>
                                        <td style={{ textAlign: 'right' }}>{materialAnalytics.reduce((s, m) => s + m.purchasedKg, 0).toLocaleString('en-IN')}</td>
                                        <td style={{ textAlign: 'right' }}>{fmt(materialAnalytics.reduce((s, m) => s + m.purchaseCost, 0))}</td>
                                        <td style={{ textAlign: 'right' }}>{materialAnalytics.reduce((s, m) => s + m.soldKg, 0).toLocaleString('en-IN')}</td>
                                        <td style={{ textAlign: 'right' }}>{fmt(materialAnalytics.reduce((s, m) => s + m.salesRevenue, 0))}</td>
                                        <td style={{ textAlign: 'right' }}>—</td>
                                        <td style={{ textAlign: 'right' }}>—</td>
                                        <td style={{ textAlign: 'right', color: 'var(--color-secondary)' }}>{fmt(materialAnalytics.reduce((s, m) => s + m.profit, 0))}</td>
                                        <td style={{ textAlign: 'right' }}>{(() => { const r = materialAnalytics.reduce((s, m) => s + m.salesRevenue, 0); const p = materialAnalytics.reduce((s, m) => s + m.profit, 0); return r > 0 ? `${((p / r) * 100).toFixed(1)}%` : '—'; })()}</td>
                                        <td style={{ textAlign: 'right' }}>{formatBagInventory(materialAnalytics.reduce((s, m) => s + m.stockKg, 0))}</td>
                                        <td style={{ textAlign: 'right', color: 'var(--color-primary)' }}>{fmt(materialAnalytics.reduce((s, m) => s + m.stockValue, 0))}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

                    {/* ═══ TAB 2: CUSTOMERS ═══ */}
                    {tab === 'customers' && (
                        <div className="card" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                            {sortedCustomers.length === 0 ? <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem' }}>No customer data for this period.</p> : (
                                <table style={{ fontSize: '0.8rem', minWidth: '800px' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: '30px' }}></th>
                                            <th style={{ cursor: 'pointer' }} onClick={() => toggleSort(setCustSort, custSort, 'name')}>Customer{sortIcon(custSort, 'name')}</th>
                                            <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort(setCustSort, custSort, 'invoices')}>Invoices{sortIcon(custSort, 'invoices')}</th>
                                            <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort(setCustSort, custSort, 'revenue')}>Revenue{sortIcon(custSort, 'revenue')}</th>
                                            <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort(setCustSort, custSort, 'kgSold')}>KG Sold{sortIcon(custSort, 'kgSold')}</th>
                                            <th style={{ textAlign: 'right' }}>Avg Order</th>
                                            <th style={{ textAlign: 'right' }}>Bank</th>
                                            <th style={{ textAlign: 'right' }}>Cash</th>
                                            <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort(setCustSort, custSort, 'outstanding')}>Outstanding{sortIcon(custSort, 'outstanding')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedCustomers.map(c => (
                                            <>
                                                <tr key={c.id} onClick={() => setExpandedCustomer(expandedCustomer === c.id ? null : c.id)} style={{ cursor: 'pointer' }}>
                                                    <td>{expandedCustomer === c.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                                                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                                                    <td style={{ textAlign: 'right' }}>{c.invoices}</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(c.revenue)}</td>
                                                    <td style={{ textAlign: 'right' }}>{c.kgSold.toLocaleString('en-IN')}</td>
                                                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{fmt(c.avgOrderValue)}</td>
                                                    <td style={{ textAlign: 'right', color: 'var(--color-primary)' }}>{fmt(c.bankRev)}</td>
                                                    <td style={{ textAlign: 'right', color: 'var(--color-secondary)' }}>{fmt(c.cashRev)}</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600, color: c.outstanding > 0 ? 'var(--color-danger)' : 'var(--color-secondary)' }}>{fmt(c.outstanding)}</td>
                                                </tr>
                                                {expandedCustomer === c.id && c.monthly.length > 0 && (
                                                    <tr key={`${c.id}-detail`}>
                                                        <td colSpan={9} style={{ padding: '0.5rem 1rem 1rem 2.5rem', backgroundColor: 'var(--bg-app)' }}>
                                                            <table style={{ fontSize: '0.75rem', width: '100%' }}>
                                                                <thead><tr><th>Month</th><th style={{ textAlign: 'right' }}>Invoices</th><th style={{ textAlign: 'right' }}>Revenue</th><th style={{ textAlign: 'right' }}>KG</th><th style={{ textAlign: 'right' }}>Avg Rate/KG</th></tr></thead>
                                                                <tbody>
                                                                    {c.monthly.map(m => (
                                                                        <tr key={m.month}>
                                                                            <td>{m.month}</td>
                                                                            <td style={{ textAlign: 'right' }}>{m.invoices}</td>
                                                                            <td style={{ textAlign: 'right' }}>{fmt(m.revenue)}</td>
                                                                            <td style={{ textAlign: 'right' }}>{m.kg.toLocaleString('en-IN')}</td>
                                                                            <td style={{ textAlign: 'right' }}>{m.kg > 0 ? fmtRate(m.revenue / m.kg) : '—'}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ fontWeight: 700, backgroundColor: 'var(--bg-app)' }}>
                                            <td></td>
                                            <td>Total ({sortedCustomers.length})</td>
                                            <td style={{ textAlign: 'right' }}>{customerAnalytics.reduce((s, c) => s + c.invoices, 0)}</td>
                                            <td style={{ textAlign: 'right' }}>{fmt(customerAnalytics.reduce((s, c) => s + c.revenue, 0))}</td>
                                            <td style={{ textAlign: 'right' }}>{customerAnalytics.reduce((s, c) => s + c.kgSold, 0).toLocaleString('en-IN')}</td>
                                            <td style={{ textAlign: 'right' }}>—</td>
                                            <td style={{ textAlign: 'right' }}>{fmt(customerAnalytics.reduce((s, c) => s + c.bankRev, 0))}</td>
                                            <td style={{ textAlign: 'right' }}>{fmt(customerAnalytics.reduce((s, c) => s + c.cashRev, 0))}</td>
                                            <td style={{ textAlign: 'right', color: 'var(--color-danger)' }}>{fmt(customerAnalytics.reduce((s, c) => s + c.outstanding, 0))}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            )}
                        </div>
                    )}

                    {/* ═══ TAB 3: SUPPLIERS ═══ */}
                    {tab === 'suppliers' && (
                        <div className="card" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                            {sortedSuppliers.length === 0 ? <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem' }}>No supplier data for this period.</p> : (
                                <table style={{ fontSize: '0.8rem', minWidth: '700px' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: '30px' }}></th>
                                            <th style={{ cursor: 'pointer' }} onClick={() => toggleSort(setSuppSort, suppSort, 'name')}>Supplier{sortIcon(suppSort, 'name')}</th>
                                            <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort(setSuppSort, suppSort, 'purchases')}>Purchases{sortIcon(suppSort, 'purchases')}</th>
                                            <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort(setSuppSort, suppSort, 'cost')}>Total Cost{sortIcon(suppSort, 'cost')}</th>
                                            <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => toggleSort(setSuppSort, suppSort, 'kgBought')}>KG Bought{sortIcon(suppSort, 'kgBought')}</th>
                                            <th style={{ textAlign: 'right' }}>Avg Rate/KG</th>
                                            <th>Materials</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedSuppliers.map(s => (
                                            <>
                                                <tr key={s.id} onClick={() => setExpandedSupplier(expandedSupplier === s.id ? null : s.id)} style={{ cursor: 'pointer' }}>
                                                    <td>{expandedSupplier === s.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                                                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                                                    <td style={{ textAlign: 'right' }}>{s.purchases}</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(s.cost)}</td>
                                                    <td style={{ textAlign: 'right' }}>{s.kgBought.toLocaleString('en-IN')}</td>
                                                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{fmtRate(s.avgRate)}</td>
                                                    <td style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.materials || '—'}</td>
                                                </tr>
                                                {expandedSupplier === s.id && s.monthly.length > 0 && (
                                                    <tr key={`${s.id}-detail`}>
                                                        <td colSpan={7} style={{ padding: '0.5rem 1rem 1rem 2.5rem', backgroundColor: 'var(--bg-app)' }}>
                                                            <table style={{ fontSize: '0.75rem', width: '100%' }}>
                                                                <thead><tr><th>Month</th><th style={{ textAlign: 'right' }}>Purchases</th><th style={{ textAlign: 'right' }}>Cost</th><th style={{ textAlign: 'right' }}>KG</th><th style={{ textAlign: 'right' }}>Avg Rate</th></tr></thead>
                                                                <tbody>
                                                                    {s.monthly.map(m => (
                                                                        <tr key={m.month}>
                                                                            <td>{m.month}</td>
                                                                            <td style={{ textAlign: 'right' }}>{m.purchases}</td>
                                                                            <td style={{ textAlign: 'right' }}>{fmt(m.cost)}</td>
                                                                            <td style={{ textAlign: 'right' }}>{m.kg.toLocaleString('en-IN')}</td>
                                                                            <td style={{ textAlign: 'right' }}>{m.kg > 0 ? fmtRate(m.cost / m.kg) : '—'}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ fontWeight: 700, backgroundColor: 'var(--bg-app)' }}>
                                            <td></td>
                                            <td>Total ({sortedSuppliers.length})</td>
                                            <td style={{ textAlign: 'right' }}>{supplierAnalytics.reduce((s, x) => s + x.purchases, 0)}</td>
                                            <td style={{ textAlign: 'right' }}>{fmt(supplierAnalytics.reduce((s, x) => s + x.cost, 0))}</td>
                                            <td style={{ textAlign: 'right' }}>{supplierAnalytics.reduce((s, x) => s + x.kgBought, 0).toLocaleString('en-IN')}</td>
                                            <td style={{ textAlign: 'right' }}>—</td>
                                            <td>—</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            )}
                        </div>
                    )}

                    {/* ═══ TAB 4: MONTHLY TRENDS ═══ */}
                    {tab === 'trends' && (
                        <div className="card" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                            {monthlyTrends.length === 0 ? <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem' }}>No data for this financial year yet.</p> : (
                                <table style={{ fontSize: '0.8rem', minWidth: '950px' }}>
                                    <thead>
                                        <tr>
                                            <th>Month</th>
                                            <th style={{ textAlign: 'right' }}>Revenue</th>
                                            <th style={{ textAlign: 'right' }}>COGS</th>
                                            <th style={{ textAlign: 'right' }}>Gross Profit</th>
                                            <th style={{ textAlign: 'right' }}>Expenses</th>
                                            <th style={{ textAlign: 'right' }}>Net Profit</th>
                                            <th style={{ textAlign: 'right' }}>Cash Sales</th>
                                            <th style={{ textAlign: 'right' }}>Bank Sales</th>
                                            <th>Top Material</th>
                                            <th>Top Customer</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {monthlyTrends.map((m, i) => {
                                            const prev = i > 0 ? monthlyTrends[i - 1] : null;
                                            return (
                                                <tr key={m.key}>
                                                    <td style={{ fontWeight: 600 }}>{m.label}</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(m.revenue)}{prev && trendArrow(m.revenue, prev.revenue)}</td>
                                                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{fmt(m.cogs)}</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600, color: m.grossProfit >= 0 ? 'var(--color-secondary)' : 'var(--color-danger)' }}>{fmt(m.grossProfit)}{prev && trendArrow(m.grossProfit, prev.grossProfit)}</td>
                                                    <td style={{ textAlign: 'right', color: 'var(--color-danger)' }}>{fmt(m.expenses)}</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 700, color: m.netProfit >= 0 ? 'var(--color-secondary)' : 'var(--color-danger)' }}>{fmt(m.netProfit)}{prev && trendArrow(m.netProfit, prev.netProfit)}</td>
                                                    <td style={{ textAlign: 'right', color: 'var(--color-secondary)' }}>{fmt(m.cashSales)}</td>
                                                    <td style={{ textAlign: 'right', color: 'var(--color-primary)' }}>{fmt(m.bankSales)}</td>
                                                    <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{m.topMat}</td>
                                                    <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{m.topCust}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ fontWeight: 700, backgroundColor: 'var(--bg-app)' }}>
                                            <td>Total</td>
                                            <td style={{ textAlign: 'right' }}>{fmt(monthlyTrends.reduce((s, m) => s + m.revenue, 0))}</td>
                                            <td style={{ textAlign: 'right' }}>{fmt(monthlyTrends.reduce((s, m) => s + m.cogs, 0))}</td>
                                            <td style={{ textAlign: 'right', color: 'var(--color-secondary)' }}>{fmt(monthlyTrends.reduce((s, m) => s + m.grossProfit, 0))}</td>
                                            <td style={{ textAlign: 'right' }}>{fmt(monthlyTrends.reduce((s, m) => s + m.expenses, 0))}</td>
                                            <td style={{ textAlign: 'right', color: 'var(--color-secondary)' }}>{fmt(monthlyTrends.reduce((s, m) => s + m.netProfit, 0))}</td>
                                            <td style={{ textAlign: 'right' }}>{fmt(monthlyTrends.reduce((s, m) => s + m.cashSales, 0))}</td>
                                            <td style={{ textAlign: 'right' }}>{fmt(monthlyTrends.reduce((s, m) => s + m.bankSales, 0))}</td>
                                            <td>—</td>
                                            <td>—</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
