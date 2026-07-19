import { useEffect, useState } from 'react';
import { Wallet, Plus, X, TrendingUp, TrendingDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchSheetData, appendRow } from '../../services/googleSheets';
import { format } from 'date-fns';

interface LedgerEntry {
    entryId: string;
    date: string;
    type: string;
    reference: string;
    amount: number;
    description: string;
}

const TYPE_COLORS: Record<string, string> = {
    'Opening Balance': 'badge-info',
    'Cash Sale': 'badge-success',
    'Cash-Invoice Sale': 'badge-success',
    'Cash Expense': 'badge-danger',
    'Cash Purchase Payment': 'badge-danger',
    'Adjustment': 'badge-neutral',
};

const OPENING_DATE = '2026-04-01';

export default function CashLedger() {
    const { accessToken } = useAuth();
    const [entries, setEntries] = useState<LedgerEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        type: 'Opening Balance' as 'Opening Balance' | 'Adjustment',
        date: OPENING_DATE,
        amount: '',
        description: '',
        sign: '+' as '+' | '-',
    });

    const loadData = async () => {
        if (!accessToken) return;
        setIsLoading(true);
        try {
            const rows = await fetchSheetData(accessToken, 'Cash_Ledger!A2:F');
            const parsed: LedgerEntry[] = rows.map(r => ({
                entryId: r[0] || '',
                date: r[1] || '',
                type: r[2] || '',
                reference: r[3] || '',
                amount: parseFloat(r[4] || '0'),
                description: r[5] || '',
            }));
            // Sort by date ascending
            parsed.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            setEntries(parsed);
        } catch (err) {
            console.error('Failed to load cash ledger', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadData(); }, [accessToken]);

    // Build running balance
    const withRunning = entries.map((e, i, arr) => ({
        ...e,
        runningBalance: arr.slice(0, i + 1).reduce((sum, x) => sum + x.amount, 0),
    }));

    const cashInHand = entries.reduce((sum, e) => sum + e.amount, 0);
    const totalInflows = entries.filter(e => e.amount > 0 && e.type !== 'Adjustment').reduce((sum, e) => sum + e.amount, 0);
    const totalOutflows = entries.filter(e => e.amount < 0 && e.type !== 'Adjustment').reduce((sum, e) => sum + Math.abs(e.amount), 0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!accessToken || !formData.amount) return;
        setIsSubmitting(true);
        try {
            const amt = parseFloat(formData.amount);
            const signedAmt = formData.type === 'Opening Balance' ? Math.abs(amt) : (formData.sign === '+' ? amt : -amt);
            const row = [
                `CL-${Date.now()}`,
                formData.type === 'Opening Balance' ? OPENING_DATE : formData.date,
                formData.type,
                '',
                signedAmt.toFixed(2),
                formData.description || (formData.type === 'Opening Balance' ? 'Opening Cash Balance — 1 Apr 2026' : 'Manual Adjustment'),
            ];
            await appendRow(accessToken, 'Cash_Ledger!A:F', [row]);
            setIsModalOpen(false);
            setFormData({ type: 'Opening Balance', date: OPENING_DATE, amount: '', description: '', sign: '+' });
            await loadData();
        } catch (err) {
            console.error(err);
            alert('Failed to save entry.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const fmt = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <Wallet size={24} color="var(--color-primary)" />
                        Cash Ledger
                    </h1>
                    <p>Track all cash inflows and outflows. Opening balance as of 1 Apr 2026.</p>
                </div>
                <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                    <Plus size={16} /> Add Entry
                </button>
            </div>

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="card" style={{ textAlign: 'center', borderTop: `3px solid ${cashInHand >= 0 ? 'var(--color-secondary)' : 'var(--color-danger)'}` }}>
                    <Wallet size={20} color={cashInHand >= 0 ? 'var(--color-secondary)' : 'var(--color-danger)'} style={{ margin: '0 auto 0.5rem' }} />
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Cash In Hand</p>
                    <p style={{ fontSize: '1.6rem', fontWeight: 700, color: cashInHand >= 0 ? 'var(--color-secondary)' : 'var(--color-danger)' }}>
                        {isLoading ? '…' : fmt(cashInHand)}
                    </p>
                </div>
                <div className="card" style={{ textAlign: 'center', borderTop: '3px solid var(--color-secondary)' }}>
                    <TrendingUp size={20} color="var(--color-secondary)" style={{ margin: '0 auto 0.5rem' }} />
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Total Inflows</p>
                    <p style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-secondary)' }}>
                        {isLoading ? '…' : fmt(totalInflows)}
                    </p>
                </div>
                <div className="card" style={{ textAlign: 'center', borderTop: '3px solid var(--color-danger)' }}>
                    <TrendingDown size={20} color="var(--color-danger)" style={{ margin: '0 auto 0.5rem' }} />
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Total Outflows</p>
                    <p style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-danger)' }}>
                        {isLoading ? '…' : fmt(totalOutflows)}
                    </p>
                </div>
            </div>

            {/* Ledger Table */}
            <div className="table-container">
                {isLoading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading ledger…</div>
                ) : entries.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <Wallet size={48} style={{ opacity: 0.15, margin: '0 auto 1rem auto' }} />
                        <p style={{ fontWeight: 500 }}>No entries yet.</p>
                        <p style={{ fontSize: '0.875rem' }}>Start by adding your Opening Cash Balance (1 Apr 2026).</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Reference</th>
                                <th>Description</th>
                                <th style={{ textAlign: 'right' }}>Amount</th>
                                <th style={{ textAlign: 'right' }}>Running Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {withRunning.map((entry, i) => (
                                <tr key={i}>
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                        {entry.date ? format(new Date(entry.date), 'dd MMM yyyy') : '-'}
                                    </td>
                                    <td>
                                        <span className={`badge ${TYPE_COLORS[entry.type] || 'badge-neutral'}`} style={{ fontSize: '0.68rem' }}>
                                            {entry.type}
                                        </span>
                                    </td>
                                    <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                        {entry.reference || '—'}
                                    </td>
                                    <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {entry.description || '—'}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 600, color: entry.amount >= 0 ? 'var(--color-secondary)' : 'var(--color-danger)', whiteSpace: 'nowrap' }}>
                                        {entry.amount >= 0 ? '+' : '−'} {fmt(entry.amount)}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: entry.runningBalance >= 0 ? 'var(--text-primary)' : 'var(--color-danger)' }}>
                                        {fmt(entry.runningBalance)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ backgroundColor: 'var(--bg-app)' }}>
                                <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, padding: '0.75rem 1rem', fontSize: '0.9rem' }}>Cash In Hand</td>
                                <td style={{ textAlign: 'right', fontWeight: 800, padding: '0.75rem 1rem', fontSize: '1.05rem', color: cashInHand >= 0 ? 'var(--color-secondary)' : 'var(--color-danger)' }}>
                                    {fmt(cashInHand)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                )}
            </div>

            {/* Add Entry Modal */}
            {isModalOpen && (
                <div className="modal-overlay" style={{ zIndex: 50 }}
                    onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}>
                    <div className="card" style={{ width: '100%', maxWidth: '440px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1.1rem' }}>Add Cash Entry</h2>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div className="input-group">
                                <label className="input-label">Entry Type</label>
                                <select className="input-field" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value as any })}>
                                    <option value="Opening Balance">Opening Balance (1 Apr 2026)</option>
                                    <option value="Adjustment">Manual Adjustment</option>
                                </select>
                            </div>

                            {formData.type === 'Adjustment' && (
                                <>
                                    <div className="input-group">
                                        <label className="input-label">Date</label>
                                        <input type="date" className="input-field" required value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                                    </div>
                                    <div className="input-group">
                                        <label className="input-label">Direction</label>
                                        <select className="input-field" value={formData.sign} onChange={e => setFormData({ ...formData, sign: e.target.value as '+' | '-' })}>
                                            <option value="+">+ Inflow (Cash received)</option>
                                            <option value="-">− Outflow (Cash paid)</option>
                                        </select>
                                    </div>
                                </>
                            )}

                            <div className="input-group">
                                <label className="input-label">Amount (₹) *</label>
                                <input required type="number" step="0.01" className="input-field" value={formData.amount}
                                    onChange={e => setFormData({ ...formData, amount: e.target.value })} placeholder="0.00" />
                            </div>

                            <div className="input-group">
                                <label className="input-label">Description</label>
                                <input className="input-field" value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    placeholder={formData.type === 'Opening Balance' ? 'Opening Cash Balance — 1 Apr 2026' : 'Notes…'} />
                            </div>

                            {formData.type === 'Opening Balance' && (
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'var(--bg-app)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)' }}>
                                    📅 This entry will be dated <strong>1 April 2026</strong> as the reference start date.
                                </p>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                    {isSubmitting ? 'Saving…' : 'Save Entry'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
