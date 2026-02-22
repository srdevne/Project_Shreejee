import { useEffect, useState } from 'react';
import { FileText, Plus, X, CheckCircle, Pencil } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchSheetData, appendRow, updateRow } from '../../services/googleSheets';
import { logNotification } from '../../services/notifications';
import { format, differenceInDays } from 'date-fns';

export default function Sales() {
    const { user, accessToken } = useAuth();
    const [sales, setSales] = useState<any[]>([]);
    const [parties, setParties] = useState<any[]>([]);
    const [materials, setMaterials] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // New sale modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        invoiceNo: `INV-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString().split('T')[0],
        customerId: '',
        materialId: '',
        bags: '',
        weight: '',
        rate: '',
        paymentMode: 'Bank Transfer'
    });

    // Payment confirmation modal
    const [confirmModal, setConfirmModal] = useState<{ open: boolean; rowIdx: number; invoiceNo: string } | null>(null);
    const [confirmForm, setConfirmForm] = useState({ refNo: '', payDate: new Date().toISOString().split('T')[0] });

    // Edit invoice modal (within 7 days)
    const [editModal, setEditModal] = useState<{ open: boolean; rowIdx: number; sheetRowNum: number; row: any[] } | null>(null);
    const [editForm, setEditForm] = useState({ weight: '', rate: '', paymentMode: '' });

    const loadData = async () => {
        if (!accessToken) return;
        setIsLoading(true);
        try {
            const [salesData, partiesData, materialsData] = await Promise.all([
                fetchSheetData(accessToken, 'Sales!A2:O'),
                fetchSheetData(accessToken, 'Parties!A2:H'),
                fetchSheetData(accessToken, 'Materials!A2:I')
            ]);
            setSales(salesData);
            setParties(partiesData.filter(p => p[2] !== 'Supplier' && p[7] !== 'Inactive'));
            setMaterials(materialsData);
        } catch (error) {
            console.error('Failed to load sales data', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadData(); }, [accessToken]);

    const handleMaterialChange = (matId: string) => {
        const mat = materials.find(m => m[0] === matId);
        setFormData(prev => ({ ...prev, materialId: matId, rate: mat ? mat[7] : '' }));
    };

    // ── Create new invoice ──────────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!accessToken) return;
        const selectedParty = parties.find(p => p[0] === formData.customerId);
        const selectedMat = materials.find(m => m[0] === formData.materialId);
        if (!selectedParty || !selectedMat) return alert('Invalid selection');
        setIsSubmitting(true);
        try {
            const amount = parseFloat(formData.weight) * parseFloat(formData.rate);
            const taxRate = parseFloat(selectedMat[5] || '0');
            const taxAmount = (amount * taxRate) / 100;
            const cgst = taxRate > 0 ? taxAmount / 2 : 0;
            const sgst = taxRate > 0 ? taxAmount / 2 : 0;
            const grandTotal = amount + taxAmount;

            const saleRow = [
                formData.invoiceNo, '', formData.date, formData.date,
                selectedParty[0], selectedParty[1],
                amount.toFixed(2), cgst.toFixed(2), sgst.toFixed(2), '0',
                grandTotal.toFixed(2), formData.paymentMode, 'Pending', '', ''
            ];
            const itemRow = [
                `ITM-${Date.now()}`, formData.invoiceNo,
                selectedMat[0], selectedMat[1],
                formData.bags, formData.weight, formData.rate,
                taxRate, amount.toFixed(2)
            ];
            await appendRow(accessToken, 'Sales!A:O', [saleRow]);
            await appendRow(accessToken, 'Sale_Items!A:I', [itemRow]);

            setIsModalOpen(false);
            setFormData({
                invoiceNo: `INV-${Date.now().toString().slice(-6)}`,
                date: new Date().toISOString().split('T')[0],
                customerId: '', materialId: '', bags: '', weight: '', rate: '', paymentMode: 'Bank Transfer'
            });
            await loadData();
        } catch (error) {
            console.error(error);
            alert('Failed to save sale.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── Confirm payment received ────────────────────────────────────────────────
    const confirmPayment = async () => {
        if (!accessToken || !confirmModal) return;
        setIsSubmitting(true);
        try {
            const sheetRowNum = sales.length - confirmModal.rowIdx + 1;
            await updateRow(accessToken, `Sales!M${sheetRowNum}:O${sheetRowNum}`, [[
                'Confirmed', confirmForm.refNo, confirmForm.payDate
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

    // ── Open edit modal pre-filled ──────────────────────────────────────────────
    const openEditModal = (idx: number, row: any[]) => {
        const sheetRowNum = sales.length - idx + 1;
        setEditForm({ weight: row[6] || '', rate: row[7] || '', paymentMode: row[11] || 'Bank Transfer' });
        setEditModal({ open: true, rowIdx: idx, sheetRowNum, row });
    };

    // ── Save invoice edits + notify owner ──────────────────────────────────────
    const handleEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!accessToken || !editModal) return;
        setIsSubmitting(true);
        const row = editModal.row;
        try {
            const mat = materials.find(m => m[1] === row[5]);
            const taxRate = mat ? parseFloat(mat[5] || '0') : 0;
            const weight = parseFloat(editForm.weight) || 0;
            const rate = parseFloat(editForm.rate) || 0;
            const amount = weight * rate;
            const taxAmount = (amount * taxRate) / 100;
            const cgst = taxRate > 0 ? taxAmount / 2 : 0;
            const sgst = taxRate > 0 ? taxAmount / 2 : 0;
            const grandTotal = amount + taxAmount;

            // Update cols G-L: Amount, CGST, SGST, IGST, GrandTotal, PayMode
            await updateRow(accessToken, `Sales!G${editModal.sheetRowNum}:L${editModal.sheetRowNum}`, [[
                amount.toFixed(2), cgst.toFixed(2), sgst.toFixed(2), '0',
                grandTotal.toFixed(2), editForm.paymentMode
            ]]);

            // Notify owner of the change
            await logNotification(
                accessToken,
                'INVOICE_EDIT',
                `Invoice ${row[0]} for ${row[5]} was edited by ${user?.name || 'a manager'}. New Total: \u20b9${grandTotal.toFixed(2)}, Mode: ${editForm.paymentMode}.`,
                user?.name || 'Unknown'
            );

            setEditModal(null);
            await loadData();
        } catch (err) {
            console.error(err);
            alert('Failed to save edits.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <FileText size={24} color="var(--color-primary)" />
                        Sales Register
                    </h1>
                    <p>Record invoices and track pending payments.</p>
                </div>
                <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                    <Plus size={16} /> New Sale
                </button>
            </div>

            <div className="table-container">
                {isLoading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading sales data...</div>
                ) : sales.length === 0 ? (
                    <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <FileText size={48} style={{ opacity: 0.2, margin: '0 auto 1rem auto' }} />
                        <p style={{ fontWeight: 500 }}>No sales recorded yet.</p>
                        <p style={{ fontSize: '0.875rem' }}>Click "New Sale" to create your first invoice.</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Invoice No</th>
                                <th>Date</th>
                                <th>Customer</th>
                                <th>Amount</th>
                                <th>Mode</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sales.slice().reverse().map((row, idx) => {
                                const daysOld = row[2] ? differenceInDays(new Date(), new Date(row[2])) : 999;
                                const canEdit = daysOld <= 7 && row[12] !== 'Confirmed';
                                return (
                                    <tr key={idx}>
                                        <td style={{ fontWeight: 600 }}>{row[0]}</td>
                                        <td>{row[2] ? format(new Date(row[2]), 'dd MMM yyyy') : '-'}</td>
                                        <td style={{ fontWeight: 500 }}>{row[5]}</td>
                                        <td style={{ fontWeight: 600 }}>&#8377;{row[10]}</td>
                                        <td>{row[11]}</td>
                                        <td>
                                            <span className={`badge ${row[12] === 'Confirmed' ? 'badge-success' : 'badge-warning'}`}>
                                                {row[12] || 'Pending'}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                {row[12] !== 'Confirmed' && (
                                                    <button onClick={() => setConfirmModal({ open: true, rowIdx: idx, invoiceNo: row[0] })}
                                                        title="Confirm payment received"
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-secondary)', display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.78rem' }}>
                                                        <CheckCircle size={14} /> Confirm
                                                    </button>
                                                )}
                                                {canEdit && (
                                                    <button onClick={() => openEditModal(idx, row)}
                                                        title="Edit invoice (within 7 days)"
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.78rem' }}>
                                                        <Pencil size={14} /> Edit
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── New Sale Modal ───────────────────────────────────────────────── */}
            {isModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '560px', maxHeight: '95vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1.1rem' }}>Create Sales Invoice</h2>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div className="input-group">
                                    <label className="input-label">Invoice Number</label>
                                    <input required className="input-field" value={formData.invoiceNo} onChange={e => setFormData({ ...formData, invoiceNo: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Date</label>
                                    <input required type="date" className="input-field" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                                </div>
                                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="input-label">Customer *</label>
                                    <select required className="input-field" value={formData.customerId} onChange={e => setFormData({ ...formData, customerId: e.target.value })}>
                                        <option value="">-- Select Customer --</option>
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
                                    <label className="input-label">Weight (KG)</label>
                                    <input required type="number" step="0.01" className="input-field" value={formData.weight} onChange={e => setFormData({ ...formData, weight: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Rate / KG (&#8377;)</label>
                                    <input required type="number" step="0.01" className="input-field" value={formData.rate} onChange={e => setFormData({ ...formData, rate: e.target.value })} />
                                </div>
                                <div className="input-group">
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
                                    {isSubmitting ? 'Saving...' : 'Create Invoice'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Payment Confirmation Modal ────────────────────────────────────── */}
            {confirmModal?.open && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '1rem' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1.1rem' }}>Confirm Payment Received</h2>
                            <button onClick={() => setConfirmModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                            Invoice: <strong>{confirmModal.invoiceNo}</strong>
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div className="input-group">
                                <label className="input-label">Date Payment Received *</label>
                                <input required type="date" className="input-field" value={confirmForm.payDate}
                                    onChange={e => setConfirmForm({ ...confirmForm, payDate: e.target.value })} />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Transaction / Cheque Ref No.</label>
                                <input className="input-field" placeholder="e.g. UTR-123456 or CHQ-0045"
                                    value={confirmForm.refNo} onChange={e => setConfirmForm({ ...confirmForm, refNo: e.target.value })} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                <button className="btn btn-secondary" onClick={() => setConfirmModal(null)}>Cancel</button>
                                <button className="btn btn-primary" style={{ backgroundColor: 'var(--color-secondary)', borderColor: 'var(--color-secondary)' }}
                                    onClick={confirmPayment} disabled={isSubmitting}>
                                    <CheckCircle size={16} />
                                    {isSubmitting ? 'Saving...' : 'Mark as Confirmed'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Edit Invoice Modal (within 7 days) ───────────────────────────── */}
            {editModal?.open && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '1rem' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '420px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <h2 style={{ fontSize: '1.1rem' }}>Edit Invoice</h2>
                            <button onClick={() => setEditModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                            <strong>{editModal.row[0]}</strong> &nbsp;·&nbsp; {editModal.row[5]} &nbsp;·&nbsp;
                            <span style={{ color: 'var(--color-warning)' }}>Edit window: 7 days from invoice date.</span>
                        </p>
                        <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div className="input-group">
                                    <label className="input-label">Weight (KG)</label>
                                    <input type="number" step="0.01" className="input-field" value={editForm.weight}
                                        onChange={e => setEditForm({ ...editForm, weight: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Rate / KG (&#8377;)</label>
                                    <input type="number" step="0.01" className="input-field" value={editForm.rate}
                                        onChange={e => setEditForm({ ...editForm, rate: e.target.value })} />
                                </div>
                                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="input-label">Payment Mode</label>
                                    <select className="input-field" value={editForm.paymentMode}
                                        onChange={e => setEditForm({ ...editForm, paymentMode: e.target.value })}>
                                        <option value="Cash">Cash</option>
                                        <option value="Cheque">Cheque</option>
                                        <option value="Bank Transfer">Bank Transfer (NEFT/UPI)</option>
                                    </select>
                                </div>
                            </div>
                            <div style={{ backgroundColor: 'rgba(79,70,229,0.07)', borderRadius: 'var(--radius-sm)', padding: '0.6rem 0.8rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                Owner will be automatically notified of this change.
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                    <Pencil size={16} />
                                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
