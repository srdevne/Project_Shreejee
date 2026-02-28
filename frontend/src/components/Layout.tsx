import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, Users, Package, LogOut, Menu, X,
    FileText, ShoppingCart, Receipt, TrendingUp, Bell
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchSheetData } from '../services/googleSheets';

interface LayoutProps { children: ReactNode; }

export default function Layout({ children }: LayoutProps) {
    const { user, accessToken, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    // Close mobile menu on route change
    useEffect(() => { setIsMobileMenuOpen(false); }, [location.pathname]);

    const handleLogout = () => { logout(); navigate('/login'); };

    useEffect(() => {
        const handleAuthExpired = () => { alert('Session expired. Please log in again.'); handleLogout(); };
        window.addEventListener('auth-expired', handleAuthExpired);
        return () => window.removeEventListener('auth-expired', handleAuthExpired);
    }, []);

    // Poll notifications for owner
    useEffect(() => {
        if (user?.role !== 'owner' || !accessToken) return;
        const load = async () => {
            try {
                const data = await fetchSheetData(accessToken, 'Notifications!A2:D');
                const recent = data.filter(r => r[0] && (Date.now() - new Date(r[0]).getTime()) < 7 * 86400000);
                setUnreadCount(recent.length);
            } catch { /* silent */ }
        };
        load();
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

    const navLinkStyle = (isActive: boolean) => ({
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)',
        textDecoration: 'none',
        color: isActive ? 'var(--color-primary)' : 'var(--text-secondary)',
        backgroundColor: isActive ? 'rgba(79,70,229,0.1)' : 'transparent',
        fontWeight: isActive ? 600 : 500,
        transition: 'all var(--transition-fast)',
    });

    const SidebarContent = () => (
        <>
            {/* Logo */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-sm)', background: 'linear-gradient(135deg, #C62828, #8B0000)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
                    <Package size={18} />
                </div>
                <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', lineHeight: 1.2 }}>Shreejee</p>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Trading Management</p>
                </div>
            </div>

            {/* Nav links */}
            <nav style={{ flex: 1, padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto' }}>
                {navItems.map(item => (
                    <NavLink key={item.path} to={item.path} style={({ isActive }) => navLinkStyle(isActive)}>
                        {item.icon}
                        {item.name}
                    </NavLink>
                ))}
            </nav>

            {/* Footer */}
            <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)' }}>
                {user?.role === 'owner' && unreadCount > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(217,119,6,0.1)', color: 'var(--color-warning)', fontSize: '0.8rem', fontWeight: 600 }}>
                        <Bell size={15} />
                        {unreadCount} edit notification{unreadCount !== 1 ? 's' : ''} (7d)
                    </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <img src={user?.picture} alt="Avatar" style={{ width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</p>
                        <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>{user?.role}</p>
                    </div>
                </div>
                <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', fontSize: '0.82rem', padding: '0.5rem' }} onClick={handleLogout}>
                    <LogOut size={15} /> Logout
                </button>
            </div>
        </>
    );

    return (
        <div className="app-layout" style={{ display: 'flex', minHeight: '100vh', width: '100%', backgroundColor: 'var(--bg-app)' }}>

            {/* ── Desktop Sidebar ─────────────────────────────────────────────── */}
            <aside className="desktop-only" style={{ width: '240px', backgroundColor: 'var(--bg-card)', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0, flexShrink: 0 }}>
                <SidebarContent />
            </aside>

            {/* ── Mobile Slide-in Drawer ───────────────────────────────────────── */}
            {isMobileMenuOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex' }} onClick={() => setIsMobileMenuOpen(false)}>
                    {/* Backdrop */}
                    <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} />
                    {/* Drawer */}
                    <aside style={{ position: 'relative', width: '260px', backgroundColor: 'var(--bg-card)', display: 'flex', flexDirection: 'column', height: '100%', zIndex: 1, animation: 'slideIn 0.2s ease-out' }}
                        onClick={e => e.stopPropagation()}>
                        <SidebarContent />
                    </aside>
                </div>
            )}

            {/* ── Main Content ─────────────────────────────────────────────────── */}
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', overflow: 'hidden' }}>
                {/* Mobile top bar */}
                <header className="mobile-only" style={{
                    display: 'none', padding: '0.875rem 1rem',
                    backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)',
                    alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', background: 'linear-gradient(135deg, #C62828, #8B0000)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                            <Package size={16} />
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '1rem' }}>Shreejee</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {user?.role === 'owner' && unreadCount > 0 && (
                            <div style={{ position: 'relative' }}>
                                <Bell size={20} color="var(--color-warning)" />
                                <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: 'var(--color-danger)', color: 'white', borderRadius: '50%', width: '14px', height: '14px', fontSize: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{unreadCount}</span>
                            </div>
                        )}
                        <button onClick={() => setIsMobileMenuOpen(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', padding: '0.25rem' }}>
                            {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
                        </button>
                    </div>
                </header>

                {/* Page content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', backgroundColor: 'var(--bg-app)' }}>
                    {children}
                </div>
            </main>
        </div>
    );
}
