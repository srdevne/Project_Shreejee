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
    const [pnl, setPnl] = useState({
        revenue: 0, purchases: 0, expenses: 0, grossProfit: 0, netProfit: 0,
        realizedRevenue: 0, unrealizedRevenue: 0,
        realizedProfit: 0, unrealizedProfit: 0,
    });
    const [overdueInvoices, setOverdueInvoices] = useState<OverdueInvoice[]>([]);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [period, setPeriod] = useState<'month' | 'fy' | 'all'>('fy');

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

                // ── India Financial Year: April 1 → March 31 ──────────────────────
                const currentFYStart = new Date(
                    now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1,
                    3, 1 // April = month index 3
                );
                const filterDate = (dateStr: string) => {
                    if (!dateStr) return false;
                    const d = new Date(dateStr);
                    if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                    if (period === 'fy') return d >= currentFYStart;
                    return true; // 'all'
                };
                const fyLabel = `FY ${currentFYStart.getFullYear()}-${String(currentFYStart.getFullYear() + 1).slice(2)}`;

                // ── Revenue split: Realized (confirmed) vs Unrealized (pending) ──
                let revenue = 0;
                let realizedRevenue = 0;
                let unrealizedRevenue = 0;
                let costOfGoodsSold = 0;
                let realizedCOGS = 0;
                salesData.filter(r => filterDate(r[2])).forEach(sale => {
                    const amt = parseFloat(sale[10] || '0');
                    revenue += amt;
                    if (sale[12] === 'Confirmed') realizedRevenue += amt;
                    else unrealizedRevenue += amt;
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
                // Also factor in opening stock cost from Materials sheet (col 7 = default purchase rate)
                materialsData.forEach(mat => {
                    const id = mat[0];
                    const openKg = parseFloat(mat[4] || '0'); // opening stock KG
                    const openRate = parseFloat(mat[6] || '0'); // default purchase rate
                    if (openKg > 0 && openRate > 0) {
                        matCost[id] = (matCost[id] || 0) + openKg * openRate;
                        matTotalKg[id] = (matTotalKg[id] || 0) + openKg;
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
                    // Find sale to check confirmation
                    const sale = salesData.find(s => s[0] === item[1]);
                    if (sale?.[12] === 'Confirmed') realizedCOGS += c;
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
                const realizedProfit = realizedRevenue - realizedCOGS;
                const unrealizedProfit = unrealizedRevenue - (costOfGoodsSold - realizedCOGS);

                // Store fyLabel in state to show in UI
                (window as any).__fyLabel = fyLabel;

                setPnl({ revenue, purchases: purchaseSpend, expenses, grossProfit, netProfit, realizedRevenue, unrealizedRevenue, realizedProfit, unrealizedProfit });

                // --- Overdue Invoices (>30 days, unpaid) ---
                const overdue: OverdueInvoice[] = salesData
                    .filter(r => r[12] !== 'Confirmed' && r[2])
                    .map(r => ({ invoiceNo: r[0], customer: r[5], grandTotal: r[10], invoiceDate: r[2], daysOverdue: differenceInDays(now, new Date(r[2])) }))
                    .filter(r => r.daysOverdue > 30)
                    .sort((a, b) => b.daysOverdue - a.daysOverdue);
                setOverdueInvoices(overdue);

                // ── Inventory: Opening Stock + Purchases - Sales (all-time, not period-filtered) ──
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
                    // Opening stock from Materials master (set when material is created)
                    const openKg = parseFloat(mat[4] || '0');
                    const openBags = parseFloat(mat[3] || '0');
                    const inKg = openKg + (inwardByMat[id]?.kg || 0);
                    const inBags = openBags + (inwardByMat[id]?.bags || 0);
                    const outKg = outwardByMat[id]?.kg || 0;
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
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {(['month', 'fy', 'all'] as const).map(p => (
                        <button key={p} className={`btn ${period === p ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }} onClick={() => setPeriod(p)}>
                            {p === 'month' ? 'This Month'
                                : p === 'fy' ? `FY ${new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1}-${String((new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1) + 1).slice(2)}`
                                    : 'All Time'}
                        </button>
                    ))}
                </div>
            </div>

            {/* P&L Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
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
