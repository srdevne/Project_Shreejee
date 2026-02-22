import { LogOut, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Dashboard() {
    const { user, logout } = useAuth();

    return (
        <div className="main-content">
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        width: '40px', height: '40px', borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--color-primary)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', color: 'white'
                    }}>
                        <LayoutDashboard size={20} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.5rem' }}>Dashboard</h1>
                        <p style={{ fontSize: '0.875rem' }}>Welcome back, {user?.name}</p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <img
                        src={user?.picture}
                        alt="Profile"
                        style={{ width: '40px', height: '40px', borderRadius: '50%' }}
                    />
                    <button className="btn btn-secondary" onClick={logout} style={{ padding: '0.5rem' }}>
                        <LogOut size={16} />
                    </button>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                <div className="card">
                    <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Today's Sales</h3>
                    <p style={{ fontSize: '1.875rem', fontWeight: 600 }}>₹0.00</p>
                    <div style={{ marginTop: '0.5rem' }}>
                        <span className="badge badge-neutral">No data configured yet</span>
                    </div>
                </div>

                <div className="card">
                    <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Pending Receivables</h3>
                    <p style={{ fontSize: '1.875rem', fontWeight: 600, color: 'var(--color-danger)' }}>₹0.00</p>
                    <div style={{ marginTop: '0.5rem' }}>
                        <span className="badge badge-success">All clear!</span>
                    </div>
                </div>

                <div className="card">
                    <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Inventory Health</h3>
                    <p style={{ fontSize: '1.875rem', fontWeight: 600, color: 'var(--color-secondary)' }}>Good</p>
                    <div style={{ marginTop: '0.5rem' }}>
                        <span className="badge badge-neutral">Awaiting DB hookup</span>
                    </div>
                </div>
            </div>

            {/* Quick Actions and Recent Activity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', marginTop: '1rem' }}>
                <div className="card">
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Quick Actions</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'flex-start' }}>+ New Sale Invoice</button>
                        <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'flex-start' }}>+ Record Purchase</button>
                        <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'flex-start' }}>+ Add Expense</button>
                    </div>
                </div>

                <div className="card">
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Recent Activity</h2>
                    <div style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem 0' }}>
                        No recent activity. Connect Google Sheet to see transactions.
                    </div>
                </div>
            </div>
        </div>
    );
}
