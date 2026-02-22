import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Package, LogOut, Menu, X, FileText, ShoppingCart, Receipt, TrendingUp, Bell } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchSheetData } from '../services/googleSheets';

interface LayoutProps {
    children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
    const { user, accessToken, logout } = useAuth();
    const navigate = useNavigate();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    useEffect(() => {
        const handleAuthExpired = () => {
            alert('Your session has expired. Please log in again.');
            handleLogout();
        };
        window.addEventListener('auth-expired', handleAuthExpired);
        return () => window.removeEventListener('auth-expired', handleAuthExpired);
    }, []);

    // Poll for new notifications (owner only)
    useEffect(() => {
        if (user?.role !== 'owner' || !accessToken) return;
        const fetchNotifications = async () => {
            try {
                const data = await fetchSheetData(accessToken, 'Notifications!A2:D');
                // Count notifications from last 7 days
                const recent = data.filter(r => {
                    if (!r[0]) return false;
                    const ms = Date.now() - new Date(r[0]).getTime();
                    return ms < 7 * 24 * 60 * 60 * 1000;
                });
                setUnreadCount(recent.length);
            } catch {
                // silent — notifications are best-effort
            }
        };
        fetchNotifications();
    }, [user, accessToken]);

    const navItems = [
        { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} /> },
        ...(user?.role === 'owner' ? [{ name: 'Analytics', path: '/owner', icon: <TrendingUp size={20} /> }] : []),
        { name: 'Sales', path: '/sales', icon: <FileText size={20} /> },
        { name: 'Purchases', path: '/purchases', icon: <ShoppingCart size={20} /> },
        { name: 'Expenses', path: '/expenses', icon: <Receipt size={20} /> },
        { name: 'Materials', path: '/materials', icon: <Package size={20} /> },
        { name: 'Parties', path: '/parties', icon: <Users size={20} /> },
    ];

    return (
        <div className="app-layout" style={{ display: 'flex', minHeight: '100vh', width: '100%', backgroundColor: 'var(--bg-app)' }}>
            {/* Sidebar for Desktop */}
            <aside className="sidebar desktop-only" style={{
                width: '250px', backgroundColor: 'var(--bg-card)', borderRight: '1px solid var(--border-color)',
                display: 'flex', flexDirection: 'column'
            }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                        <Package size={20} />
                    </div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Shreejee</h2>
                </div>

                <nav style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            style={({ isActive }) => ({
                                display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem',
                                borderRadius: 'var(--radius-md)',
                                textDecoration: 'none',
                                color: isActive ? 'var(--color-primary)' : 'var(--text-secondary)',
                                backgroundColor: isActive ? 'rgba(79, 70, 229, 0.1)' : 'transparent',
                                fontWeight: isActive ? 600 : 500,
                                transition: 'all var(--transition-fast)'
                            })}
                        >
                            {item.icon}
                            {item.name}
                        </NavLink>
                    ))}
                </nav>

                <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)' }}>
                    {/* Notification bell for owner */}
                    {user?.role === 'owner' && unreadCount > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(245,158,11,0.12)', color: 'var(--color-warning)' }}>
                            <Bell size={16} />
                            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{unreadCount} edit notification{unreadCount !== 1 ? 's' : ''} (7d)</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                        <img src={user?.picture} alt="Avatar" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                        <div style={{ overflow: 'hidden' }}>
                            <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{user?.name}</p>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>{user?.role}</p>
                        </div>
                    </div>
                    <button
                        className="btn btn-secondary"
                        style={{ width: '100%', justifyContent: 'center', padding: '0.5rem' }}
                        onClick={handleLogout}
                    >
                        <LogOut size={16} />
                        Logout
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
                {/* Mobile Header */}
                <header className="mobile-only" style={{
                    display: 'none',
                    padding: '1rem', backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)',
                    alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Package size={24} color="var(--color-primary)" />
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Shreejee</h2>
                    </div>
                    <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} style={{ background: 'none', border: 'none', color: 'var(--text-primary)' }}>
                        {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </header>

                {/* Dynamic Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', backgroundColor: 'var(--bg-app)' }}>
                    {children}
                </div>
            </main>
        </div>
    );
}
