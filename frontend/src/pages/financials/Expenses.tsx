import { useEffect, useState } from 'react';
import { Receipt, Plus, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchSheetData, appendRow } from '../../services/googleSheets';
import { format } from 'date-fns';

const EXPENSE_CATEGORIES = [
    'Transport / Freight',
    'Labour / Loading',
    'Office Supplies',
    'Telephone / Internet',
    'Vehicle Fuel',
    'Rent',
    'Electricity Bill',
    "Municipal Tax",
    "SICOF Tax",
    'Bank Charges',
    'Other',
];

export default function Expenses() {
    const { accessToken } = useAuth();
    const [expenses, setExpenses] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        category: EXPENSE_CATEGORIES[0],
        amount: '',
        description: '',
        paymentMode: 'Cash',
    });

    const loadExpenses = async () => {
        if (!accessToken) return;
        setIsLoading(true);
        try {
            const data = await fetchSheetData(accessToken, 'Expenses!A2:F');
            setExpenses(data);
        } catch (err) {
            console.error('Failed to load expenses', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadExpenses();
    }, [accessToken]);

    // Monthly total summary
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthlyTotal = expenses
        .filter(r => r[1]?.startsWith(currentMonth))
        .reduce((sum, r) => sum + parseFloat(r[3] || '0'), 0);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!accessToken) return;
        setIsSubmitting(true);
        try {
            const row = [
                `EXP-${Date.now()}`,
                formData.date,
                formData.category,
                formData.amount,
                formData.description,
                formData.paymentMode,
            ];
            await appendRow(accessToken, 'Expenses!A:F', [row]);
            setIsModalOpen(false);
            setFormData({
                date: new Date().toISOString().split('T')[0],
                category: EXPENSE_CATEGORIES[0],
                amount: '',
                description: '',
                paymentMode: 'Cash',
            });
            await loadExpenses();
        } catch (err) {
            console.error(err);
            alert('Failed to save expense.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <Receipt size={24} color="var(--color-primary)" />
                        Expense Tracker
                    </h1>
                    <p>Log operational costs to track profitability accurately.</p>
                </div>
                <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                    <Plus size={16} />
                    Add Expense
                </button>
            </div>

            {/* Monthly Summary Card */}
            <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>This Month's Total Expenses</p>
                    <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-danger)' }}>₹{monthlyTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                </div>
                <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '1.5rem' }}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Total Records</p>
                    <p style={{ fontSize: '2rem', fontWeight: 700 }}>{expenses.length}</p>
                </div>
            </div>

            <div className="table-container">
                {isLoading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading expenses...</div>
                ) : expenses.length === 0 ? (
                    <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <Receipt size={48} style={{ opacity: 0.2, margin: '0 auto 1rem auto' }} />
                        <p style={{ fontWeight: 500 }}>No expenses recorded yet.</p>
                        <p style={{ fontSize: '0.875rem' }}>Click "Add Expense" to log your first cost.</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Category</th>
                                <th>Description</th>
                                <th>Payment</th>
                                <th style={{ textAlign: 'right' }}>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {expenses.slice().reverse().map((row, idx) => (
                                <tr key={idx}>
                                    <td>{row[1] ? format(new Date(row[1]), 'dd MMM yyyy') : '-'}</td>
                                    <td><span className="badge badge-neutral">{row[2]}</span></td>
                                    <td style={{ color: 'var(--text-secondary)' }}>{row[4] || '-'}</td>
                                    <td>{row[5]}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-danger)' }}>₹{parseFloat(row[3] || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Add Expense Modal */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem'
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: '460px', maxHeight: '95vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1.1rem' }}>Add Expense</h2>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div className="input-group">
                                    <label className="input-label">Date</label>
                                    <input required type="date" className="input-field" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Amount (₹) *</label>
                                    <input required type="number" step="0.01" className="input-field" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} placeholder="0.00" />
                                </div>
                                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="input-label">Category *</label>
                                    <select required className="input-field" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                                        {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="input-label">Description</label>
                                    <input className="input-field" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Short note about this expense" />
                                </div>
                                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="input-label">Payment Mode</label>
                                    <select className="input-field" value={formData.paymentMode} onChange={e => setFormData({ ...formData, paymentMode: e.target.value })}>
                                        <option value="Cash">Cash</option>
                                        <option value="Cheque">Cheque</option>
                                        <option value="Bank Transfer">Bank Transfer (NEFT/UPI)</option>
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                    {isSubmitting ? 'Saving...' : 'Log Expense'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
