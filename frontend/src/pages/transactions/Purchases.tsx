import { useEffect, useState } from 'react';
import { ShoppingCart, Plus, X, CheckCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchSheetData, appendRow, updateRow } from '../../services/googleSheets';
import { format } from 'date-fns';

export default function Purchases() {
    const { accessToken } = useAuth();
    const [purchases, setPurchases] = useState<any[]>([]);
    const [parties, setParties] = useState<any[]>([]);
    const [materials, setMaterials] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Payment confirmation modal
    const [confirmModal, setConfirmModal] = useState<{ open: boolean; rowIdx: number; purchaseId: string; supplier: string } | null>(null);
    const [confirmForm, setConfirmForm] = useState({ refNo: '', payDate: new Date().toISOString().split('T')[0] });

    const [formData, setFormData] = useState({
        billNo: `PO-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString().split('T')[0],
        supplierId: '',
        materialId: '',
        bags: '',
        weight: '',
        rate: ''
    });

    const loadData = async () => {
        if (!accessToken) return;
        setIsLoading(true);
        try {
            const [purchasesData, partiesData, materialsData] = await Promise.all([
                fetchSheetData(accessToken, 'Purchases!A2:K'), // col K = payment ref
                fetchSheetData(accessToken, 'Parties!A2:H'),
                fetchSheetData(accessToken, 'Materials!A2:I')
            ]);
            setPurchases(purchasesData);
            setParties(partiesData.filter(p => p[2] !== 'Customer' && p[7] !== 'Inactive'));
            setMaterials(materialsData);
        } catch (error) {
            console.error('Failed to load purchases data', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [accessToken]);

    const handleMaterialChange = (matId: string) => {
        const mat = materials.find(m => m[0] === matId);
        setFormData(prev => ({ ...prev, materialId: matId, rate: mat ? mat[6] : '' }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!accessToken) return;

        const selectedParty = parties.find(p => p[0] === formData.supplierId);
        const selectedMat = materials.find(m => m[0] === formData.materialId);
        if (!selectedParty || !selectedMat) return alert('Invalid selection');

        setIsSubmitting(true);
        try {
            const amount = parseFloat(formData.weight) * parseFloat(formData.rate);
            const taxRate = parseFloat(selectedMat[5] || '0');
            const taxAmount = (amount * taxRate) / 100;
            const grandTotal = amount + taxAmount;
            const purchaseId = `PUR-${Date.now()}`;

            const purchaseRow = [
                purchaseId,
                formData.billNo,
                formData.date,
                selectedParty[0],
                selectedParty[1],
                amount.toFixed(2),
                taxAmount.toFixed(2),
                grandTotal.toFixed(2),
                'Unpaid', // Payment Status — starts as Unpaid
                '',        // Payment Date
                ''         // Payment Ref
            ];

            const itemRow = [
                `PITM-${Date.now()}`,
                purchaseId,
                selectedMat[0],
                selectedMat[1],
                formData.bags,
                formData.weight,
                formData.rate,
                amount.toFixed(2)
            ];

            await appendRow(accessToken, 'Purchases!A:K', [purchaseRow]);
            await appendRow(accessToken, 'Purchase_Items!A:H', [itemRow]);

            setIsModalOpen(false);
            setFormData({
                billNo: `PO-${Date.now().toString().slice(-6)}`,
                date: new Date().toISOString().split('T')[0],
                supplierId: '', materialId: '', bags: '', weight: '', rate: ''
            });
            await loadData();
        } catch (error) {
            console.error(error);
            alert('Failed to save purchase.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const confirmPayment = async () => {
        if (!accessToken || !confirmModal) return;
        setIsSubmitting(true);
        try {
            const totalRows = purchases.length;
            const sheetRowNum = totalRows - confirmModal.rowIdx + 1; // +1 for header row
            await updateRow(accessToken, `Purchases!I${sheetRowNum}:K${sheetRowNum}`, [[
                'Paid',
                confirmForm.payDate,
                confirmForm.refNo,
            ]]);
            setConfirmModal(null);
            setConfirmForm({ refNo: '', payDate: new Date().toISOString().split('T')[0] });
            await loadData();
        } catch (err) {
            console.error(err);
            alert('Failed to confirm payment.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <ShoppingCart size={24} color="var(--color-primary)" />
                        Purchases / Inward
                    </h1>
                    <p>Record inward supplies to track inventory.</p>
                </div>
                <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                    <Plus size={16} />
                    New Purchase
                </button>
            </div>

            <div className="table-container">
                {isLoading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading purchases...</div>
                ) : purchases.length === 0 ? (
                    <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <ShoppingCart size={48} style={{ opacity: 0.2, margin: '0 auto 1rem auto' }} />
                        <p style={{ fontWeight: 500 }}>No purchases recorded yet.</p>
                        <p style={{ fontSize: '0.875rem' }}>Click "New Purchase" to add inward stock.</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Bill No</th>
                                <th>Date</th>
                                <th>Supplier</th>
                                <th>Amount</th>
                                <th>Pay Status</th>
                                <th>Pay Ref</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {purchases.slice().reverse().map((row, idx) => (
                                <tr key={idx}>
                                    <td style={{ fontWeight: 600 }}>{row[1]}</td>
                                    <td>{row[2] ? format(new Date(row[2]), 'dd MMM yyyy') : '-'}</td>
                                    <td style={{ fontWeight: 500 }}>{row[4]}</td>
                                    <td style={{ fontWeight: 600 }}>₹{row[7]}</td>
                                    <td>
                                        <span className={`badge ${row[8] === 'Paid' ? 'badge-success' : 'badge-warning'}`}>
                                            {row[8] || 'Unpaid'}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                                        {row[10] || '-'}
                                    </td>
                                    <td>
                                        {row[8] !== 'Paid' && (
                                            <button
                                                onClick={() => setConfirmModal({ open: true, rowIdx: idx, purchaseId: row[0], supplier: row[4] })}
                                                title="Mark as Paid"
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem' }}
                                            >
                                                <CheckCircle size={16} /> Paid
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Add Purchase Modal */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem'
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: '560px', maxHeight: '95vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1.1rem' }}>Record Incoming Purchase</h2>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div className="input-group">
                                    <label className="input-label">Supplier Bill / Challan No</label>
                                    <input required className="input-field" value={formData.billNo} onChange={e => setFormData({ ...formData, billNo: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Date</label>
                                    <input required type="date" className="input-field" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                                </div>
                                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="input-label">Select Supplier *</label>
                                    <select required className="input-field" value={formData.supplierId} onChange={e => setFormData({ ...formData, supplierId: e.target.value })}>
                                        <option value="">-- Select Supplier --</option>
                                        {parties.map(p => <option key={p[0]} value={p[0]}>{p[1]}</option>)}
                                    </select>
                                </div>
                                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="input-label">Material *</label>
                                    <select required className="input-field" value={formData.materialId} onChange={e => handleMaterialChange(e.target.value)}>
                                        <option value="">-- Select Material --</option>
                                        {materials.map(m => <option key={m[0]} value={m[0]}>{m[1]}</option>)}
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label className="input-label">No. of Bags</label>
                                    <input required type="number" className="input-field" value={formData.bags} onChange={e => setFormData({ ...formData, bags: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Total Weight (KG)</label>
                                    <input required type="number" step="0.01" className="input-field" value={formData.weight} onChange={e => setFormData({ ...formData, weight: e.target.value })} />
                                </div>
                                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="input-label">Rate / KG (₹)</label>
                                    <input required type="number" step="0.01" className="input-field" value={formData.rate} onChange={e => setFormData({ ...formData, rate: e.target.value })} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                    {isSubmitting ? 'Saving...' : 'Record Purchase'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Payment Confirmation Modal */}
            {confirmModal?.open && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '1rem'
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1.1rem' }}>Confirm Payment to Vendor</h2>
                            <button onClick={() => setConfirmModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                            Supplier: <strong>{confirmModal.supplier}</strong>
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div className="input-group">
                                <label className="input-label">Date Payment Made *</label>
                                <input required type="date" className="input-field" value={confirmForm.payDate}
                                    onChange={e => setConfirmForm({ ...confirmForm, payDate: e.target.value })} />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Transaction / Cheque Ref No.</label>
                                <input className="input-field" placeholder="e.g. UTR-987654 or CHQ-0088"
                                    value={confirmForm.refNo} onChange={e => setConfirmForm({ ...confirmForm, refNo: e.target.value })} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <button className="btn btn-secondary" onClick={() => setConfirmModal(null)}>Cancel</button>
                                <button className="btn btn-primary" style={{ backgroundColor: 'var(--color-secondary)', borderColor: 'var(--color-secondary)' }}
                                    onClick={confirmPayment} disabled={isSubmitting}>
                                    <CheckCircle size={16} />
                                    {isSubmitting ? 'Saving...' : 'Mark as Paid'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
