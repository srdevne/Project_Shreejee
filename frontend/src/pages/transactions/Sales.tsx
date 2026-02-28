import { useEffect, useState } from 'react';
import { FileText, Plus, X, CheckCircle, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchSheetData, appendRow, updateRow, getNextInvoiceNumber } from '../../services/googleSheets';
import { logNotification } from '../../services/notifications';
import { format, differenceInDays } from 'date-fns';
import InvoicePrint from './InvoicePrint';

const ORDER_TYPES = ['Verbal / In-Person', 'Phone Call', 'WhatsApp / Message', 'Email', 'Purchase Order (Written)', 'Standing Order'];

interface LineItem {
    materialId: string;
    materialName: string;
    bags: string;
    weight: string;
    rate: string;
    taxRate: number;
    amount: number;
    taxAmount: number;
}

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
        invoiceNo: 'INV-00001',
        date: new Date().toISOString().split('T')[0],
        customerId: '',
        orderType: ORDER_TYPES[0],
        paymentMode: 'Bank Transfer',
    });
    const [lineItems, setLineItems] = useState<LineItem[]>([]);
    const [currentItem, setCurrentItem] = useState({ materialId: '', bags: '', weight: '', rate: '' });

    // Payment confirmation modal
    const [confirmModal, setConfirmModal] = useState<{ open: boolean; rowIdx: number; invoiceNo: string } | null>(null);
    const [confirmForm, setConfirmForm] = useState({ refNo: '', payDate: new Date().toISOString().split('T')[0] });

    // Edit invoice modal (within 7 days)
    const [editModal, setEditModal] = useState<{ open: boolean; rowIdx: number; sheetRowNum: number; row: any[] } | null>(null);
    const [editForm, setEditForm] = useState({ weight: '', rate: '', paymentMode: '' });

    // Print / view invoice
    const [printInvoiceNo, setPrintInvoiceNo] = useState<string | null>(null);

    const loadData = async () => {
        if (!accessToken) return;
        setIsLoading(true);
        try {
            const [salesData, partiesData, materialsData] = await Promise.all([
                fetchSheetData(accessToken, 'Sales!A2:P'),   // col P = order type
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

    const openNewSaleModal = async () => {
        if (!accessToken) return;
        const invNo = await getNextInvoiceNumber(accessToken);
        setFormData({
            invoiceNo: invNo,
            date: new Date().toISOString().split('T')[0],
            customerId: '',
            orderType: ORDER_TYPES[0],
            paymentMode: 'Bank Transfer',
        });
        setLineItems([]);
        setCurrentItem({ materialId: '', bags: '', weight: '', rate: '' });
        setIsModalOpen(true);
    };

    const handleMaterialSelect = (matId: string) => {
        const mat = materials.find(m => m[0] === matId);
        setCurrentItem(prev => ({ ...prev, materialId: matId, rate: mat ? mat[7] : '' }));
    };

    const addLineItem = () => {
        const mat = materials.find(m => m[0] === currentItem.materialId);
        if (!mat || !currentItem.weight || !currentItem.rate) {
            alert('Please select a material and enter weight and rate.');
            return;
        }
        const weight = parseFloat(currentItem.weight);
        const rate = parseFloat(currentItem.rate);
        const taxRate = parseFloat(mat[5] || '0');
        const amount = weight * rate;
        const taxAmount = (amount * taxRate) / 100;

        const item: LineItem = {
            materialId: mat[0],
            materialName: mat[1],
            bags: currentItem.bags,
            weight: currentItem.weight,
            rate: currentItem.rate,
            taxRate,
            amount,
            taxAmount,
        };
        setLineItems(prev => [...prev, item]);
        setCurrentItem({ materialId: '', bags: '', weight: '', rate: '' });
    };

    const removeLineItem = (idx: number) => {
        setLineItems(prev => prev.filter((_, i) => i !== idx));
    };

    const invoiceTotals = lineItems.reduce((acc, item) => ({
        subTotal: acc.subTotal + item.amount,
        taxTotal: acc.taxTotal + item.taxAmount,
        grandTotal: acc.grandTotal + item.amount + item.taxAmount,
    }), { subTotal: 0, taxTotal: 0, grandTotal: 0 });

    // ── Create new invoice ──────────────────────────────────────────────────────
    const handleSubmit = async () => {
        if (!accessToken) return;
        if (!formData.customerId) return alert('Please select a customer.');
        if (lineItems.length === 0) return alert('Please add at least one material item.');
        setIsSubmitting(true);
        try {
            const selectedParty = parties.find(p => p[0] === formData.customerId);
            const { subTotal, taxTotal, grandTotal } = invoiceTotals;
            const cgst = taxTotal / 2;
            const sgst = taxTotal / 2;

            const saleRow = [
                formData.invoiceNo, '', formData.date, formData.date,
                selectedParty[0], selectedParty[1],
                subTotal.toFixed(2), cgst.toFixed(2), sgst.toFixed(2), '0',
                grandTotal.toFixed(2),
                formData.paymentMode,
                'Pending', '', '',
                formData.orderType,  // col P
            ];
            await appendRow(accessToken, 'Sales!A:P', [saleRow]);

            // Append each line item
            for (const item of lineItems) {
                const itemRow = [
                    `ITM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    formData.invoiceNo,
                    item.materialId, item.materialName,
                    item.bags, item.weight, item.rate,
                    item.taxRate, item.amount.toFixed(2)
                ];
                await appendRow(accessToken, 'Sale_Items!A:I', [itemRow]);
            }

            setIsModalOpen(false);
            await loadData();
        } catch (error) {
            console.error(error);
            alert('Failed to save invoice.');
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

    // ── Open edit modal ─────────────────────────────────────────────────────────
    const openEditModal = (idx: number, row: any[]) => {
        const sheetRowNum = sales.length - idx + 1;
        setEditForm({ weight: '', rate: '', paymentMode: row[11] || 'Bank Transfer' });
        setEditModal({ open: true, rowIdx: idx, sheetRowNum, row });
    };

    // ── Save edits + notify owner ───────────────────────────────────────────────
    const handleEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!accessToken || !editModal) return;
        if (!editForm.weight || !editForm.rate) return alert('Please enter both Weight and Rate to recalculate totals.');
        setIsSubmitting(true);
        const row = editModal.row;
        try {
            const mat = materials.find(m => m[1] === row[5]);
            const taxRate = mat ? parseFloat(mat[5] || '0') : 0;
            const amount = parseFloat(editForm.weight) * parseFloat(editForm.rate);
            const taxAmount = (amount * taxRate) / 100;
            const cgst = taxRate > 0 ? taxAmount / 2 : 0;
            const sgst = taxRate > 0 ? taxAmount / 2 : 0;
            const grandTotal = amount + taxAmount;

            await updateRow(accessToken, `Sales!G${editModal.sheetRowNum}:L${editModal.sheetRowNum}`, [[
                amount.toFixed(2), cgst.toFixed(2), sgst.toFixed(2), '0',
                grandTotal.toFixed(2), editForm.paymentMode
            ]]);
            await logNotification(accessToken, 'INVOICE_EDIT',
                `Invoice ${row[0]} for ${row[5]} edited by ${user?.name || 'a manager'}. New Total: \u20b9${grandTotal.toFixed(2)}, Mode: ${editForm.paymentMode}.`,
                user?.name || 'Unknown');
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
                <button className="btn btn-primary" onClick={openNewSaleModal}>
                    <Plus size={16} /> New Invoice
                </button>
            </div>

            {/* Sales Table */}
            <div className="table-container">
                {isLoading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading sales…</div>
                ) : sales.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <FileText size={48} style={{ opacity: 0.2, margin: '0 auto 1rem auto' }} />
                        <p style={{ fontWeight: 500 }}>No sales yet. Create your first invoice.</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Invoice No</th>
                                <th>Date</th>
                                <th>Customer</th>
                                <th>Order Via</th>
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
                                        <td><span className="badge badge-info" style={{ fontSize: '0.7rem' }}>{row[15] || '-'}</span></td>
                                        <td style={{ fontWeight: 600 }}>&#8377;{parseFloat(row[10] || '0').toLocaleString('en-IN')}</td>
                                        <td>{row[11]}</td>
                                        <td>
                                            <span className={`badge ${row[12] === 'Confirmed' ? 'badge-success' : 'badge-warning'}`}>
                                                {row[12] || 'Pending'}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                <button onClick={() => setPrintInvoiceNo(row[0])}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.78rem' }}>
                                                    <FileText size={13} /> View
                                                </button>
                                                {row[12] !== 'Confirmed' && (
                                                    <button onClick={() => setConfirmModal({ open: true, rowIdx: idx, invoiceNo: row[0] })}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-secondary)', display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.78rem' }}>
                                                        <CheckCircle size={14} /> Confirm
                                                    </button>
                                                )}
                                                {canEdit && (
                                                    <button onClick={() => openEditModal(idx, row)}
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

            {/* ── New Invoice Modal ─────────────────────────────────────────────── */}
            {isModalOpen && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', overflowY: 'auto', zIndex: 50, padding: '1.5rem 1rem' }}
                    onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}>
                    <div className="card" style={{ width: '100%', maxWidth: '620px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: '1.1rem' }}>New Invoice — <span style={{ color: 'var(--color-primary)' }}>{formData.invoiceNo}</span></h2>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>

                        {/* Invoice header fields */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <div className="input-group">
                                <label className="input-label">Invoice No</label>
                                <input className="input-field" value={formData.invoiceNo} readOnly style={{ opacity: 0.7 }} />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Invoice Date *</label>
                                <input required type="date" className="input-field" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                            </div>
                            <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                <label className="input-label">Customer *</label>
                                <select required className="input-field" value={formData.customerId} onChange={e => setFormData({ ...formData, customerId: e.target.value })}>
                                    <option value="">-- Select Customer --</option>
                                    {parties.map(p => <option key={p[0]} value={p[0]}>{p[1]}</option>)}
                                </select>
                            </div>
                            <div className="input-group">
                                <label className="input-label">Order Received Via</label>
                                <select className="input-field" value={formData.orderType} onChange={e => setFormData({ ...formData, orderType: e.target.value })}>
                                    {ORDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
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

                        {/* Add material line item */}
                        <div style={{ backgroundColor: 'var(--bg-app)', padding: '0.875rem', borderRadius: 'var(--radius-md)' }}>
                            <p style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Add Material Item</p>

                            {/* Row 1: Material (full width) */}
                            <div className="input-group" style={{ marginBottom: '0.5rem' }}>
                                <label className="input-label">Material</label>
                                <select className="input-field" value={currentItem.materialId} onChange={e => handleMaterialSelect(e.target.value)}>
                                    <option value="">-- Select Material --</option>
                                    {materials.map(m => <option key={m[0]} value={m[0]}>{m[1]}</option>)}
                                </select>
                            </div>

                            {/* Row 2: Bags | Weight | Rate */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <div className="input-group">
                                    <label className="input-label">Bags</label>
                                    <input type="number" className="input-field" value={currentItem.bags} onChange={e => setCurrentItem({ ...currentItem, bags: e.target.value })} placeholder="0" />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Weight (KG)</label>
                                    <input type="number" step="0.01" className="input-field" value={currentItem.weight} onChange={e => setCurrentItem({ ...currentItem, weight: e.target.value })} placeholder="0.00" />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Rate/KG (&#8377;)</label>
                                    <input type="number" step="0.01" className="input-field" value={currentItem.rate} onChange={e => setCurrentItem({ ...currentItem, rate: e.target.value })} placeholder="0.00" />
                                </div>
                            </div>

                            {/* Row 3: Preview + Add button */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    {currentItem.weight && currentItem.rate
                                        ? <>Total: <strong>&#8377;{(parseFloat(currentItem.weight) * parseFloat(currentItem.rate)).toFixed(2)}</strong></>
                                        : 'Enter weight & rate to see total'}
                                </span>
                                <button type="button" className="btn btn-primary" style={{ padding: '0.5rem 1.25rem' }} onClick={addLineItem}>
                                    <Plus size={15} /> Add Item
                                </button>
                            </div>
                        </div>

                        {/* Line items preview */}
                        {lineItems.length > 0 && (
                            <div>
                                <p style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Invoice Items ({lineItems.length})</p>
                                <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                                    <table style={{ fontSize: '0.82rem' }}>
                                        <thead>
                                            <tr>
                                                <th>Material</th>
                                                <th>Bags</th>
                                                <th>KG</th>
                                                <th>Rate</th>
                                                <th>Tax</th>
                                                <th style={{ textAlign: 'right' }}>Amount</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {lineItems.map((item, i) => (
                                                <tr key={i}>
                                                    <td style={{ fontWeight: 500 }}>{item.materialName}</td>
                                                    <td>{item.bags || '-'}</td>
                                                    <td>{item.weight}</td>
                                                    <td>&#8377;{item.rate}</td>
                                                    <td>{item.taxRate}%</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                                        &#8377;{(item.amount + item.taxAmount).toFixed(2)}
                                                    </td>
                                                    <td>
                                                        <button onClick={() => removeLineItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)' }}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr style={{ backgroundColor: 'var(--bg-app)' }}>
                                                <td colSpan={5} style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.875rem', padding: '0.75rem 1rem' }}>Grand Total</td>
                                                <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '1rem', color: 'var(--color-primary)', padding: '0.75rem 1rem' }}>
                                                    &#8377;{invoiceTotals.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSubmit} disabled={isSubmitting || lineItems.length === 0}>
                                {isSubmitting ? 'Saving…' : `Create Invoice (${lineItems.length} item${lineItems.length !== 1 ? 's' : ''})`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Payment Confirmation Modal ────────────────────────────────────── */}
            {confirmModal?.open && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', overflowY: 'auto', zIndex: 60, padding: '1.5rem 1rem' }}
                    onClick={(e) => { if (e.target === e.currentTarget) setConfirmModal(null); }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px', margin: '0 auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1.1rem' }}>Confirm Payment Received</h2>
                            <button onClick={() => setConfirmModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Invoice: <strong>{confirmModal.invoiceNo}</strong></p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div className="input-group">
                                <label className="input-label">Date Payment Received *</label>
                                <input required type="date" className="input-field" value={confirmForm.payDate} onChange={e => setConfirmForm({ ...confirmForm, payDate: e.target.value })} />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Transaction / Cheque Ref No.</label>
                                <input className="input-field" placeholder="e.g. UTR-123456 or CHQ-0045" value={confirmForm.refNo} onChange={e => setConfirmForm({ ...confirmForm, refNo: e.target.value })} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                <button className="btn btn-secondary" onClick={() => setConfirmModal(null)}>Cancel</button>
                                <button className="btn btn-primary" style={{ backgroundColor: 'var(--color-secondary)', borderColor: 'var(--color-secondary)' }} onClick={confirmPayment} disabled={isSubmitting}>
                                    <CheckCircle size={16} />
                                    {isSubmitting ? 'Saving…' : 'Mark Confirmed'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Edit Invoice Modal (within 7 days) ───────────────────────────── */}
            {editModal?.open && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', overflowY: 'auto', zIndex: 60, padding: '1.5rem 1rem' }}
                    onClick={(e) => { if (e.target === e.currentTarget) setEditModal(null); }}>
                    <div className="card" style={{ width: '100%', maxWidth: '420px', margin: '0 auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <h2 style={{ fontSize: '1.1rem' }}>Edit Invoice</h2>
                            <button onClick={() => setEditModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                            <strong>{editModal.row[0]}</strong> · {editModal.row[5]} ·&nbsp;
                            <span style={{ color: 'var(--color-warning)' }}>Editable within 7 days</span>
                        </p>
                        <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div className="input-group">
                                    <label className="input-label">New Weight (KG) *</label>
                                    <input required type="number" step="0.01" className="input-field" value={editForm.weight} onChange={e => setEditForm({ ...editForm, weight: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">New Rate/KG (&#8377;) *</label>
                                    <input required type="number" step="0.01" className="input-field" value={editForm.rate} onChange={e => setEditForm({ ...editForm, rate: e.target.value })} />
                                </div>
                                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="input-label">Payment Mode</label>
                                    <select className="input-field" value={editForm.paymentMode} onChange={e => setEditForm({ ...editForm, paymentMode: e.target.value })}>
                                        <option value="Cash">Cash</option>
                                        <option value="Cheque">Cheque</option>
                                        <option value="Bank Transfer">Bank Transfer (NEFT/UPI)</option>
                                    </select>
                                </div>
                            </div>
                            <div style={{ backgroundColor: 'rgba(198,40,40,0.07)', borderRadius: 'var(--radius-sm)', padding: '0.6rem 0.8rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                Owner will be automatically notified of this change.
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                    <Pencil size={16} /> {isSubmitting ? 'Saving…' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Invoice Print / Preview ───────────────────────────────────────── */}
            {printInvoiceNo && (
                <InvoicePrint invoiceNo={printInvoiceNo} onClose={() => setPrintInvoiceNo(null)} />
            )}
        </div>
    );
}
