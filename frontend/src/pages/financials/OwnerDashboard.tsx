import { useEffect, useState, useMemo } from 'react';
import { TrendingUp, AlertTriangle, Package, DollarSign } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchSheetData } from '../../services/googleSheets';
import { format, differenceInDays } from 'date-fns';
import { formatBagInventory } from '../../services/materialsHelper';

interface OverdueInvoice {
    invoiceNo: string;
    customer: string;
    grandTotal: string;
    invoiceDate: string;
    daysOverdue: number;
}

interface InventoryItem {
    name: string;
    stockKg: number;
    stockBags: number;
    avgCostPerKg: number;
    stockValue: number;
}

// ── FY month helpers ─────────────────────────────────────────────────────────
const FY_MONTHS = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'] as const;
const MONTH_LABELS: Record<string, string> = {
    apr: 'Apr', may: 'May', jun: 'Jun', jul: 'Jul', aug: 'Aug', sep: 'Sep',
    oct: 'Oct', nov: 'Nov', dec: 'Dec', jan: 'Jan', feb: 'Feb', mar: 'Mar',
};

type PeriodType = 'month' | 'fy' | 'all' | typeof FY_MONTHS[number];

function getFYStart(now: Date) {
    return new Date(now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1, 3, 1);
}

function getFYMonthYear(monthKey: string, fyStartYear: number): { month: number; year: number } {
    const map: Record<string, number> = { apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11, jan: 0, feb: 1, mar: 2 };
    const m = map[monthKey];
    const y = m >= 3 ? fyStartYear : fyStartYear + 1;
    return { month: m, year: y };
}

function getMonthLabel(monthKey: string, fyStartYear: number): string {
    const { year } = getFYMonthYear(monthKey, fyStartYear);
    return `${MONTH_LABELS[monthKey]} ${String(year).slice(2)}`;
}

export default function OwnerDashboard() {
    const { accessToken } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const [period, setPeriod] = useState<PeriodType>('fy');

    // Raw data
    const [salesData, setSalesData] = useState<any[][]>([]);
    const [purchasesData, setPurchasesData] = useState<any[][]>([]);
    const [saleItemsData, setSaleItemsData] = useState<any[][]>([]);
    const [purchaseItemsData, setPurchaseItemsData] = useState<any[][]>([]);
    const [materialsData, setMaterialsData] = useState<any[][]>([]);
    const [expensesData, setExpensesData] = useState<any[][]>([]);
    const [cashLedgerData, setCashLedgerData] = useState<any[][]>([]);

    const now = new Date();
    const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const currentFYStart = getFYStart(now);

    useEffect(() => {
        const load = async () => {
            if (!accessToken) return;
            setIsLoading(true);
            try {
                const [sales, purchases, saleItems, purchaseItems, materials, expenses, cashLedger] = await Promise.all([
                    fetchSheetData(accessToken, 'Sales!A2:O'),
                    fetchSheetData(accessToken, 'Purchases!A2:J'),
                    fetchSheetData(accessToken, 'Sale_Items!A2:I'),
                    fetchSheetData(accessToken, 'Purchase_Items!A2:H'),
                    fetchSheetData(accessToken, 'Materials!A2:I'),
                    fetchSheetData(accessToken, 'Expenses!A2:F'),
                    fetchSheetData(accessToken, 'Cash_Ledger!A2:F'),
                ]);
                setSalesData(sales);
                setPurchasesData(purchases);
                setSaleItemsData(saleItems);
                setPurchaseItemsData(purchaseItems);
                setMaterialsData(materials);
                setExpensesData(expenses);
                setCashLedgerData(cashLedger);
            } catch (err) {
                console.error('Owner dashboard load failed', err);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [accessToken]);

    // ── Period filter ────────────────────────────────────────────────────────────
    const filterDate = (dateStr: string): boolean => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        if (period === 'fy') return d >= currentFYStart;
        if (period === 'all') return true;
        // Individual FY month
        const { month, year } = getFYMonthYear(period, fyStartYear);
        return d.getMonth() === month && d.getFullYear() === year;
    };

    // ── Computed analytics ───────────────────────────────────────────────────────
    const analytics = useMemo(() => {
        if (isLoading) return null;

        let revenue = 0, realizedRevenue = 0, unrealizedRevenue = 0;
        let invoiceRevenue = 0, cashRevenue = 0;
        let costOfGoodsSold = 0, realizedCOGS = 0;

        salesData.filter(r => filterDate(r[2])).forEach(sale => {
            const amt = parseFloat(sale[10] || '0');
            const mode = sale[11] || '';
            revenue += amt;
            if (sale[12] === 'Confirmed') realizedRevenue += amt;
            else unrealizedRevenue += amt;
            if (mode === 'Cash' || mode === 'Cash-Invoice') cashRevenue += amt;
            else invoiceRevenue += amt;
        });

        // Avg purchase cost per KG per material (including opening stock)
        const matCost: Record<string, number> = {};
        const matTotalKg: Record<string, number> = {};
        purchaseItemsData.forEach(item => {
            const matId = item[2];
            const kg = parseFloat(item[5] || '0');
            const amount = parseFloat(item[7] || '0');
            matCost[matId] = (matCost[matId] || 0) + amount;
            matTotalKg[matId] = (matTotalKg[matId] || 0) + kg;
        });
        // Factor in opening stock cost
        let openingStockValue = 0;
        materialsData.forEach(mat => {
            const id = mat[0];
            const openBags = parseFloat(mat[3] || '0');
            const openKg = parseFloat(mat[4] || '0');
            const openRate = parseFloat(mat[6] || '0');
            const totalOpenKg = (openBags * 25) + openKg;
            if (totalOpenKg > 0 && openRate > 0) {
                const openValue = totalOpenKg * openRate;
                matCost[id] = (matCost[id] || 0) + openValue;
                matTotalKg[id] = (matTotalKg[id] || 0) + totalOpenKg;
                openingStockValue += openValue;
            }
        });
        const avgCostPerKg: Record<string, number> = {};
        Object.keys(matCost).forEach(id => {
            avgCostPerKg[id] = matTotalKg[id] ? matCost[id] / matTotalKg[id] : 0;
        });

        saleItemsData.filter(item => {
            const sale = salesData.find(s => s[0] === item[1]);
            return sale ? filterDate(sale[2]) : false;
        }).forEach(item => {
            const matId = item[2];
            const kg = parseFloat(item[5] || '0');
            const avgCost = avgCostPerKg[matId] || 0;
            const c = avgCost * kg;
            costOfGoodsSold += c;
            const sale = salesData.find(s => s[0] === item[1]);
            if (sale?.[12] === 'Confirmed') realizedCOGS += c;
        });

        let expenses = 0;
        expensesData.filter(r => filterDate(r[1])).forEach(exp => {
            expenses += parseFloat(exp[3] || '0');
        });

        let purchaseSpend = 0;
        purchasesData.filter(r => filterDate(r[2])).forEach(p => {
            purchaseSpend += parseFloat(p[7] || '0');
        });

        const grossProfit = revenue - costOfGoodsSold;
        const netProfit = grossProfit - expenses;
        const realizedProfit = realizedRevenue - realizedCOGS;
        const unrealizedProfit = unrealizedRevenue - (costOfGoodsSold - realizedCOGS);

        // Cash Position
        const cashInHand = cashLedgerData.reduce((sum, r) => sum + parseFloat(r[4] || '0'), 0);
        const bankReceivables = salesData
            .filter(r => r[12] !== 'Confirmed' && (r[11] === 'Bank Transfer' || r[11] === 'Cheque'))
            .reduce((sum, r) => sum + parseFloat(r[10] || '0'), 0);
        const periodCashSales = salesData
            .filter(r => filterDate(r[2]) && (r[11] === 'Cash' || r[11] === 'Cash-Invoice'))
            .reduce((sum, r) => sum + parseFloat(r[10] || '0'), 0);
        const periodCashExpenses = expensesData
            .filter(r => filterDate(r[1]) && r[5] === 'Cash')
            .reduce((sum, r) => sum + parseFloat(r[3] || '0'), 0);
        const periodSupplierCash = cashLedgerData
            .filter(r => filterDate(r[1]) && r[2] === 'Cash Purchase Payment')
            .reduce((sum, r) => sum + Math.abs(parseFloat(r[4] || '0')), 0);

        // Overdue Invoices (>30 days, unpaid)
        const overdue: OverdueInvoice[] = salesData
            .filter(r => r[12] !== 'Confirmed' && r[2])
            .map(r => ({ invoiceNo: r[0], customer: r[5], grandTotal: r[10], invoiceDate: r[2], daysOverdue: differenceInDays(now, new Date(r[2])) }))
            .filter(r => r.daysOverdue > 30)
            .sort((a, b) => b.daysOverdue - a.daysOverdue);

        // Inventory with valuation
        const inwardByMat: Record<string, number> = {};
        const outwardByMat: Record<string, number> = {};
        purchaseItemsData.forEach(item => {
            const id = item[2];
            inwardByMat[id] = (inwardByMat[id] || 0) + parseFloat(item[5] || '0');
        });
        saleItemsData.forEach(item => {
            const id = item[2];
            outwardByMat[id] = (outwardByMat[id] || 0) + parseFloat(item[5] || '0');
        });
        const invItems: InventoryItem[] = materialsData.map(mat => {
            const id = mat[0];
            const openBags = parseFloat(mat[3] || '0');
            const openKg = parseFloat(mat[4] || '0');
            const totalOpenKg = (openBags * 25) + openKg;
            const inKg = inwardByMat[id] || 0;
            const outKg = outwardByMat[id] || 0;
            const stockKg = Math.max(0, totalOpenKg + inKg - outKg);
            const cost = avgCostPerKg[id] || 0;
            return {
                name: mat[1],
                stockKg,
                stockBags: Math.floor(stockKg / 25),
                avgCostPerKg: cost,
                stockValue: stockKg * cost,
            };
        }).filter(i => i.name);

        const totalInventoryValue = invItems.reduce((sum, i) => sum + i.stockValue, 0);

        return {
            pnl: { revenue, purchases: purchaseSpend, expenses, grossProfit, netProfit, realizedRevenue, unrealizedRevenue, realizedProfit, unrealizedProfit, invoiceRevenue, cashRevenue, openingStockValue },
            cashPosition: { cashInHand, bankReceivables, periodCashSales, periodCashExpenses, periodSupplierCash },
            overdueInvoices: overdue,
            inventory: invItems,
            totalInventoryValue,
        };
    }, [isLoading, period, salesData, purchasesData, saleItemsData, purchaseItemsData, materialsData, expensesData, cashLedgerData]);

    const pnl = analytics?.pnl ?? { revenue: 0, purchases: 0, expenses: 0, grossProfit: 0, netProfit: 0, realizedRevenue: 0, unrealizedRevenue: 0, realizedProfit: 0, unrealizedProfit: 0, invoiceRevenue: 0, cashRevenue: 0, openingStockValue: 0 };
    const cashPosition = analytics?.cashPosition ?? { cashInHand: 0, bankReceivables: 0, periodCashSales: 0, periodCashExpenses: 0, periodSupplierCash: 0 };
    const overdueInvoices = analytics?.overdueInvoices ?? [];
    const inventory = analytics?.inventory ?? [];
    const totalInventoryValue = analytics?.totalInventoryValue ?? 0;

    const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <TrendingUp size={24} color="var(--color-primary)" />
                        Owner Dashboard
                    </h1>
                    <p>Profit & Loss, Inventory & Overdue Payment Alerts.</p>
                </div>
            </div>

            {/* ── Period Filter ────────────────────────────────────────────────────── */}
            <div style={{ marginBottom: '1.5rem', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '0.25rem' }}>
                <div style={{ display: 'flex', gap: '0.35rem', whiteSpace: 'nowrap' }}>
                    <button className={`btn ${period === 'month' ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem' }} onClick={() => setPeriod('month')}>
                        This Month
                    </button>
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
                        style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem' }} onClick={() => setPeriod('all')}>
                        All Time
                    </button>
                </div>
            </div>

            {/* P&L Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                {[
                    { label: 'Total Revenue', value: pnl.revenue, color: 'var(--color-primary)', icon: <DollarSign size={18} /> },
                    { label: 'Purchase Cost', value: pnl.purchases, color: 'var(--text-secondary)', icon: <Package size={18} /> },
                    { label: 'Expenses', value: pnl.expenses, color: 'var(--color-danger)', icon: <DollarSign size={18} /> },
                    { label: 'Gross Profit', value: pnl.grossProfit, color: pnl.grossProfit >= 0 ? 'var(--color-secondary)' : 'var(--color-danger)', icon: <TrendingUp size={18} /> },
                    { label: 'Net Profit', value: pnl.netProfit, color: pnl.netProfit >= 0 ? 'var(--color-secondary)' : 'var(--color-danger)', icon: <TrendingUp size={18} /> },
                ].map(card => (
                    <div key={card.label} className="card" style={{ textAlign: 'center' }}>
                        <div style={{ color: card.color, display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>{card.icon}</div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>{card.label}</p>
                        <p style={{ fontSize: '1.4rem', fontWeight: 700, color: card.color }}>{isLoading ? '…' : fmt(card.value)}</p>
                    </div>
                ))}
            </div>

            {/* Opening Stock + Inventory Value row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="card" style={{ borderLeft: '4px solid var(--color-primary)', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>📦 Opening Stock Worth</p>
                    <p style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>{isLoading ? '…' : fmt(pnl.openingStockValue)}</p>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>Capital tied in inventory at start (Bags×25+KG) × Purchase Rate</p>
                </div>
                <div className="card" style={{ borderLeft: '4px solid var(--color-secondary)', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>📊 Current Inventory Value</p>
                    <p style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-secondary)' }}>{isLoading ? '…' : fmt(totalInventoryValue)}</p>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>Unsold stock × Weighted Avg Cost/KG</p>
                </div>
            </div>

            {/* Cash Position Section */}
            <div className="card" style={{ marginBottom: '1.5rem', borderTop: '3px solid var(--color-secondary)' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-secondary)', marginBottom: '1rem' }}>💵 Cash Position</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                    {[
                        { label: 'Cash In Hand', value: cashPosition.cashInHand, color: cashPosition.cashInHand >= 0 ? 'var(--color-secondary)' : 'var(--color-danger)', note: 'All time running balance' },
                        { label: 'Bank Receivables', value: cashPosition.bankReceivables, color: 'var(--color-warning)', note: 'Unpaid bank invoices' },
                        { label: 'Cash Sales (Period)', value: cashPosition.periodCashSales, color: 'var(--color-secondary)', note: 'Cash + Cash-Invoice' },
                        { label: 'Cash Expenses (Period)', value: cashPosition.periodCashExpenses, color: 'var(--color-danger)', note: 'Expenses paid in cash' },
                        { label: 'Supplier Paid (Cash)', value: cashPosition.periodSupplierCash, color: 'var(--color-danger)', note: 'Purchases paid in cash' },
                    ].map(card => (
                        <div key={card.label} style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--bg-app)', borderRadius: 'var(--radius-md)' }}>
                            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>{card.label}</p>
                            <p style={{ fontSize: '1.2rem', fontWeight: 700, color: card.color }}>{isLoading ? '…' : fmt(card.value)}</p>
                            <p style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', marginTop: '0.15rem' }}>{card.note}</p>
                        </div>
                    ))}
                </div>
                {/* Revenue Breakdown */}
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <div>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Invoice Revenue (Bank)</p>
                        <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)' }}>{isLoading ? '…' : fmt(pnl.invoiceRevenue)}</p>
                    </div>
                    <div>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Cash Revenue (Cash + Cash-Invoice)</p>
                        <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-secondary)' }}>{isLoading ? '…' : fmt(pnl.cashRevenue)}</p>
                    </div>
                </div>
            </div>

            {/* Realized vs Unrealized */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="card" style={{ borderLeft: '4px solid var(--color-secondary)' }}>
                    <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-secondary)', marginBottom: '0.5rem' }}>✅ Realized P&L (Payment Confirmed)</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Revenue Received</p>
                            <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-secondary)' }}>{isLoading ? '…' : fmt(pnl.realizedRevenue)}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Profit Booked</p>
                            <p style={{ fontSize: '1.2rem', fontWeight: 700, color: pnl.realizedProfit >= 0 ? 'var(--color-secondary)' : 'var(--color-danger)' }}>
                                {isLoading ? '…' : fmt(pnl.realizedProfit)}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="card" style={{ borderLeft: '4px solid var(--color-warning)' }}>
                    <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-warning)', marginBottom: '0.5rem' }}>⏳ Unrealized P&L (Payment Pending)</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Revenue Billed</p>
                            <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-warning)' }}>{isLoading ? '…' : fmt(pnl.unrealizedRevenue)}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Profit Estimated</p>
                            <p style={{ fontSize: '1.2rem', fontWeight: 700, color: pnl.unrealizedProfit >= 0 ? 'var(--color-warning)' : 'var(--color-danger)' }}>
                                {isLoading ? '…' : fmt(pnl.unrealizedProfit)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                {/* Overdue Invoices */}
                <div className="card">
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', marginBottom: '1rem', color: overdueInvoices.length > 0 ? 'var(--color-danger)' : 'inherit' }}>
                        <AlertTriangle size={18} color={overdueInvoices.length > 0 ? 'var(--color-danger)' : 'var(--text-secondary)'} />
                        Overdue Payments ({overdueInvoices.length})
                    </h2>
                    {isLoading ? <p style={{ color: 'var(--text-tertiary)' }}>Loading…</p>
                        : overdueInvoices.length === 0 ? (
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>✅ No invoices overdue by more than 30 days.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {overdueInvoices.map((inv, i) => (
                                    <div key={i} style={{ padding: '0.75rem', backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-danger)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{inv.invoiceNo}</span>
                                            <span style={{ fontWeight: 700, color: 'var(--color-danger)' }}>₹{inv.grandTotal}</span>
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                            {inv.customer} · Due {format(new Date(inv.invoiceDate), 'dd MMM yyyy')} · <strong style={{ color: 'var(--color-danger)' }}>{inv.daysOverdue} days overdue</strong>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                </div>

                {/* Inventory by Material — Enhanced */}
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
                            <Package size={18} color="var(--color-primary)" />
                            Inventory Status
                        </h2>
                        <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>
                            Total: {isLoading ? '…' : fmt(totalInventoryValue)}
                        </span>
                    </div>
                    {isLoading ? <p style={{ color: 'var(--text-tertiary)' }}>Loading…</p>
                        : inventory.length === 0 ? (
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>No materials added yet.</p>
                        ) : (
                            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                <table style={{ fontSize: '0.8rem', minWidth: '400px' }}>
                                    <thead>
                                        <tr>
                                            <th>Material</th>
                                            <th>Stock</th>
                                            <th style={{ textAlign: 'right' }}>Avg Cost/KG</th>
                                            <th style={{ textAlign: 'right' }}>Value (₹)</th>
                                            <th style={{ textAlign: 'right' }}>% of Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {inventory.map((item, i) => (
                                            <tr key={i}>
                                                <td style={{ fontWeight: 500 }}>{item.name}</td>
                                                <td>
                                                    <span className={`badge ${item.stockKg <= 0 ? 'badge-danger' : item.stockKg < 250 ? 'badge-warning' : 'badge-success'}`}>
                                                        {formatBagInventory(item.stockKg)}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>₹{item.avgCostPerKg.toFixed(2)}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(item.stockValue)}</td>
                                                <td style={{ textAlign: 'right' }}>
                                                    {totalInventoryValue > 0 ? `${((item.stockValue / totalInventoryValue) * 100).toFixed(1)}%` : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ fontWeight: 700, backgroundColor: 'var(--bg-app)' }}>
                                            <td>Total</td>
                                            <td>{formatBagInventory(inventory.reduce((s, i) => s + i.stockKg, 0))}</td>
                                            <td style={{ textAlign: 'right' }}>—</td>
                                            <td style={{ textAlign: 'right', color: 'var(--color-primary)' }}>{fmt(totalInventoryValue)}</td>
                                            <td style={{ textAlign: 'right' }}>100%</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                </div>
            </div>
        </div>
    );
}
