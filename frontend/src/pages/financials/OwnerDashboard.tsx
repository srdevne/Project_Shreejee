import { useEffect, useState } from 'react';
import { TrendingUp, AlertTriangle, Package, DollarSign } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchSheetData } from '../../services/googleSheets';
import { format, differenceInDays } from 'date-fns';

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
}

export default function OwnerDashboard() {
    const { accessToken } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const [pnl, setPnl] = useState({ revenue: 0, purchases: 0, expenses: 0, grossProfit: 0, netProfit: 0 });
    const [overdueInvoices, setOverdueInvoices] = useState<OverdueInvoice[]>([]);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [period, setPeriod] = useState<'month' | 'quarter' | 'all'>('month');

    useEffect(() => {
        const load = async () => {
            if (!accessToken) return;
            setIsLoading(true);
            try {
                const [salesData, purchasesData, saleItemsData, purchaseItemsData, materialsData, expensesData] = await Promise.all([
                    fetchSheetData(accessToken, 'Sales!A2:O'),
                    fetchSheetData(accessToken, 'Purchases!A2:J'),
                    fetchSheetData(accessToken, 'Sale_Items!A2:I'),
                    fetchSheetData(accessToken, 'Purchase_Items!A2:H'),
                    fetchSheetData(accessToken, 'Materials!A2:I'),
                    fetchSheetData(accessToken, 'Expenses!A2:F'),
                ]);

                const now = new Date();
                const filterDate = (dateStr: string) => {
                    if (!dateStr) return false;
                    const d = new Date(dateStr);
                    if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                    if (period === 'quarter') {
                        const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
                        return d >= qStart;
                    }
                    return true;
                };

                // --- Revenue & Gross Profit ---
                let revenue = 0;
                let costOfGoodsSold = 0;
                salesData.filter(r => filterDate(r[2])).forEach(sale => {
                    revenue += parseFloat(sale[10] || '0');
                });

                // Avg purchase cost per KG per material
                const matCost: Record<string, number> = {};
                const matTotalKg: Record<string, number> = {};
                purchaseItemsData.forEach(item => {
                    const matId = item[2];
                    const kg = parseFloat(item[5] || '0');
                    const amount = parseFloat(item[7] || '0');
                    matCost[matId] = (matCost[matId] || 0) + amount;
                    matTotalKg[matId] = (matTotalKg[matId] || 0) + kg;
                });
                const avgCostPerKg: Record<string, number> = {};
                Object.keys(matCost).forEach(id => {
                    avgCostPerKg[id] = matTotalKg[id] ? matCost[id] / matTotalKg[id] : 0;
                });

                saleItemsData.filter(item => {
                    // find the sale to check its date
                    const sale = salesData.find(s => s[0] === item[1]);
                    return sale ? filterDate(sale[2]) : false;
                }).forEach(item => {
                    const matId = item[2];
                    const kg = parseFloat(item[5] || '0');
                    const avgCost = avgCostPerKg[matId] || 0;
                    costOfGoodsSold += avgCost * kg;
                });

                // --- Expenses ---
                let expenses = 0;
                expensesData.filter(r => filterDate(r[1])).forEach(exp => {
                    expenses += parseFloat(exp[3] || '0');
                });

                // --- Purchase spend ---
                let purchaseSpend = 0;
                purchasesData.filter(r => filterDate(r[2])).forEach(p => {
                    purchaseSpend += parseFloat(p[7] || '0');
                });

                const grossProfit = revenue - costOfGoodsSold;
                const netProfit = grossProfit - expenses;

                setPnl({ revenue, purchases: purchaseSpend, expenses, grossProfit, netProfit });

                // --- Overdue Invoices (>30 days, unpaid) ---
                const overdue: OverdueInvoice[] = salesData
                    .filter(r => r[12] !== 'Confirmed' && r[2])
                    .map(r => ({ invoiceNo: r[0], customer: r[5], grandTotal: r[10], invoiceDate: r[2], daysOverdue: differenceInDays(now, new Date(r[2])) }))
                    .filter(r => r.daysOverdue > 30)
                    .sort((a, b) => b.daysOverdue - a.daysOverdue);
                setOverdueInvoices(overdue);

                // --- Inventory per material ---
                const inwardByMat: Record<string, { kg: number; bags: number }> = {};
                const outwardByMat: Record<string, { kg: number; bags: number }> = {};
                purchaseItemsData.forEach(item => {
                    const id = item[2];
                    if (!inwardByMat[id]) inwardByMat[id] = { kg: 0, bags: 0 };
                    inwardByMat[id].kg += parseFloat(item[5] || '0');
                    inwardByMat[id].bags += parseFloat(item[4] || '0');
                });
                saleItemsData.forEach(item => {
                    const id = item[2];
                    if (!outwardByMat[id]) outwardByMat[id] = { kg: 0, bags: 0 };
                    outwardByMat[id].kg += parseFloat(item[5] || '0');
                    outwardByMat[id].bags += parseFloat(item[4] || '0');
                });
                const invItems: InventoryItem[] = materialsData.map(mat => {
                    const id = mat[0];
                    const inKg = inwardByMat[id]?.kg || 0;
                    const outKg = outwardByMat[id]?.kg || 0;
                    const inBags = inwardByMat[id]?.bags || 0;
                    const outBags = outwardByMat[id]?.bags || 0;
                    return { name: mat[1], stockKg: Math.max(0, inKg - outKg), stockBags: Math.max(0, inBags - outBags) };
                }).filter(i => i.name);
                setInventory(invItems);
            } catch (err) {
                console.error('Owner dashboard load failed', err);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [accessToken, period]);

    const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <TrendingUp size={24} color="var(--color-primary)" />
                        Owner Dashboard
                    </h1>
                    <p>Profit & Loss, Inventory & Overdue Payment Alerts.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {(['month', 'quarter', 'all'] as const).map(p => (
                        <button key={p} className={`btn ${period === p ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }} onClick={() => setPeriod(p)}>
                            {p === 'month' ? 'This Month' : p === 'quarter' ? 'This Quarter' : 'All Time'}
                        </button>
                    ))}
                </div>
            </div>

            {/* P&L Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                {[
                    { label: 'Revenue', value: pnl.revenue, color: 'var(--color-primary)', icon: <DollarSign size={18} /> },
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

                {/* Inventory by Material */}
                <div className="card">
                    <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', marginBottom: '1rem' }}>
                        <Package size={18} color="var(--color-primary)" />
                        Inventory Status
                    </h2>
                    {isLoading ? <p style={{ color: 'var(--text-tertiary)' }}>Loading…</p>
                        : inventory.length === 0 ? (
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>No materials added yet.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {inventory.map((item, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: i < inventory.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                                        <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{item.name}</span>
                                        <div style={{ textAlign: 'right' }}>
                                            <span className={`badge ${item.stockKg <= 0 ? 'badge-danger' : item.stockKg < 500 ? 'badge-warning' : 'badge-success'}`}>
                                                {item.stockKg <= 0 ? 'Out of Stock' : `${item.stockKg.toFixed(0)} KG`}
                                            </span>
                                            {item.stockBags > 0 && <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginLeft: '0.4rem' }}>{item.stockBags.toFixed(0)} bags</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                </div>
            </div>
        </div>
    );
}
