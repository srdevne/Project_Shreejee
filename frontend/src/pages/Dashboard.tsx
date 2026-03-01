import { useEffect, useState } from 'react';
import { FileText, ShoppingCart, Receipt, TrendingUp, Package, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { fetchSheetData } from '../services/googleSheets';
import { format } from 'date-fns';

interface RecentItem {
    type: 'sale' | 'purchase';
    label: string;
    amount: string;
    date: string;
    party: string;
}

export default function Dashboard() {
    const { user, accessToken } = useAuth();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState({
        todaySales: 0,
        pendingReceivables: 0,
        inventoryHealth: 'Unknown',
        totalStockKg: 0,
        recentActivity: [] as RecentItem[]
    });

    useEffect(() => {
        const loadDashboardData = async () => {
            if (!accessToken) return;
            try {
                const [salesData, purchaseData, purchaseItemsData, saleItemsData, materialsData] = await Promise.all([
                    fetchSheetData(accessToken, 'Sales!A2:P'),
                    fetchSheetData(accessToken, 'Purchases!A2:K'),
                    fetchSheetData(accessToken, 'Purchase_Items!A2:H'),
                    fetchSheetData(accessToken, 'Sale_Items!A2:I'),
                    fetchSheetData(accessToken, 'Materials!A2:I'),
                ]);

                const today = new Date().toISOString().split('T')[0];
                let todaySales = 0;
                let pendingReceivables = 0;

                salesData.forEach(row => {
                    const amount = parseFloat(row[10] || '0');
                    if (row[2] === today) todaySales += amount;
                    if (row[12] !== 'Confirmed') pendingReceivables += amount;
                });

                // Inventory: Opening stock (from Materials) + Purchases - Sales
                let totalInward = 0;
                let totalOutward = 0;
                // Add opening stock from each material (col 4 = opening KG)
                materialsData.forEach(mat => totalInward += parseFloat(mat[4] || '0'));
                purchaseItemsData.forEach(row => totalInward += parseFloat(row[5] || '0'));
                saleItemsData.forEach(row => totalOutward += parseFloat(row[5] || '0'));
                const currentStock = Math.max(0, totalInward - totalOutward);
                const health = currentStock > 2000 ? 'Good' : currentStock > 500 ? 'Low Stock' : currentStock > 0 ? 'Very Low' : 'Empty';

                // Recent activity feed (last 5 combined)
                const recentSales: RecentItem[] = salesData.slice(-4).reverse().map(r => ({
                    type: 'sale', label: r[0], amount: r[10], date: r[2], party: r[5]
                }));
                const recentPurchases: RecentItem[] = purchaseData.slice(-4).reverse().map(r => ({
                    type: 'purchase', label: r[1], amount: r[7], date: r[2], party: r[4]
                }));
                const combined = [...recentSales, ...recentPurchases]
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .slice(0, 6);

                setStats({ todaySales, pendingReceivables, inventoryHealth: health, totalStockKg: currentStock, recentActivity: combined });
            } catch (err) {
                console.error('Failed to load dashboard data', err);
            } finally {
                setIsLoading(false);
            }
        };
        loadDashboardData();
    }, [accessToken]);

    const fmt = (n: number) => `\u20b9${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

    const statCards = [
        { label: "Today's Sales", value: fmt(stats.todaySales), badge: 'Live', badgeClass: 'badge-success', color: 'var(--color-primary)' },
        {
            label: 'Pending Receivables', value: fmt(stats.pendingReceivables),
            badge: stats.pendingReceivables > 0 ? 'Awaiting' : 'All Clear',
            badgeClass: stats.pendingReceivables > 0 ? 'badge-warning' : 'badge-success',
            color: stats.pendingReceivables > 0 ? 'var(--color-danger)' : 'var(--text-primary)'
        },
        {
            label: 'Inventory Health', value: stats.inventoryHealth,
            badge: `${stats.totalStockKg.toLocaleString('en-IN', { maximumFractionDigits: 0 })} KG`,
            badgeClass: stats.totalStockKg > 1000 ? 'badge-success' : stats.totalStockKg > 0 ? 'badge-warning' : 'badge-danger',
            color: 'var(--color-secondary)'
        },
    ];

    return (
        <div className="animate-fade-in">
            {/* Greeting header */}
            <div style={{ marginBottom: '2rem' }}>
                <h1 style={{ marginBottom: '0.25rem' }}>Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, {user?.name?.split(' ')[0]}! 👋</h1>
                <p style={{ fontSize: '0.875rem' }}>{format(new Date(), 'EEEE, dd MMMM yyyy')} &nbsp;·&nbsp; <span style={{ textTransform: 'capitalize', color: 'var(--color-primary)', fontWeight: 600 }}>{user?.role}</span></p>
            </div>

            {/* Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                {statCards.map(card => (
                    <div className="card" key={card.label}>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>{card.label}</p>
                        <p style={{ fontSize: '1.875rem', fontWeight: 700, color: card.color, marginBottom: '0.75rem' }}>
                            {isLoading ? '…' : card.value}
                        </p>
                        <span className={`badge ${card.badgeClass}`}>{isLoading ? '…' : card.badge}</span>
                    </div>
                ))}
            </div>

            {/* Quick Actions + Recent Activity */}
            <div className="dashboard-bottom">
                {/* Quick Actions */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    <h2 style={{ fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Quick Actions</h2>
                    {[
                        { label: 'New Sale Invoice', icon: <FileText size={16} />, path: '/sales', primary: true },
                        { label: 'Record Purchase', icon: <ShoppingCart size={16} />, path: '/purchases', primary: false },
                        { label: 'Log Expense', icon: <Receipt size={16} />, path: '/expenses', primary: false },
                        { label: 'Analytics', icon: <TrendingUp size={16} />, path: '/owner', primary: false },
                        { label: 'Materials', icon: <Package size={16} />, path: '/materials', primary: false },
                    ].map(action => (
                        <button key={action.path} className={`btn ${action.primary ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.82rem' }}
                            onClick={() => navigate(action.path)}>
                            {action.icon} {action.label}
                        </button>
                    ))}
                </div>

                {/* Recent Activity */}
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h2 style={{ fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Recent Activity</h2>
                        <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }} onClick={() => navigate('/sales')}>
                            View All <ArrowRight size={14} />
                        </button>
                    </div>
                    {isLoading ? (
                        <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem 0' }}>Loading activity…</p>
                    ) : stats.recentActivity.length === 0 ? (
                        <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem 0' }}>No recent transactions. Start by creating a sale.</p>
                    ) : (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {stats.recentActivity.map((item, i) => (
                                <li key={i} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '0.625rem 0',
                                    borderBottom: i < stats.recentActivity.length - 1 ? '1px solid var(--border-color)' : 'none'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <div style={{
                                            width: '32px', height: '32px', borderRadius: 'var(--radius-sm)',
                                            backgroundColor: item.type === 'sale' ? 'rgba(79,70,229,0.1)' : 'rgba(5,150,105,0.1)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {item.type === 'sale'
                                                ? <FileText size={15} color="var(--color-primary)" />
                                                : <ShoppingCart size={15} color="var(--color-secondary)" />}
                                        </div>
                                        <div>
                                            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{item.party}</p>
                                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                                {item.type === 'sale' ? 'Sale' : 'Purchase'} · {item.label} · {item.date ? format(new Date(item.date), 'dd MMM, h:mm a') : '-'}
                                            </p>
                                        </div>
                                    </div>
                                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: item.type === 'sale' ? 'var(--color-primary)' : 'var(--color-secondary)' }}>
                                        {item.type === 'sale' ? '+' : '-'}\u20b9{item.amount}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
