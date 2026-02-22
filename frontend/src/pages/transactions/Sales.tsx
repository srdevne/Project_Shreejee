import { useEffect, useState } from 'react';
import { FileText, Plus, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchSheetData, appendRow } from '../../services/googleSheets';
import { format } from 'date-fns';

export default function Sales() {
    const { accessToken } = useAuth();
    const [sales, setSales] = useState<any[]>([]);
    const [parties, setParties] = useState<any[]>([]);
    const [materials, setMaterials] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form State
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

    useEffect(() => {
        loadData();
    }, [accessToken]);

    // Handle auto-filling rate when material changes
    const handleMaterialChange = (matId: string) => {
        const mat = materials.find(m => m[0] === matId);
        setFormData(prev => ({
            ...prev,
            materialId: matId,
            rate: mat ? mat[7] : '' // Default Selling Price
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!accessToken) return;

        const selectedParty = parties.find(p => p[0] === formData.customerId);
        const selectedMat = materials.find(m => m[0] === formData.materialId);
        if (!selectedParty || !selectedMat) return alert('Invalid selection');

        setIsSubmitting(true);
        try {
            // 1. Calculate Totals
            const amount = parseFloat(formData.weight) * parseFloat(formData.rate);
            const taxRate = parseFloat(selectedMat[5] || '0');

            const taxAmount = (amount * taxRate) / 100;
            let cgst = 0, sgst = 0, igst = 0;

            // Simplified tax logic for MVP: if tax > 0, split it as CGST/SGST 
            if (taxRate > 0) {
                cgst = taxAmount / 2;
                sgst = taxAmount / 2;
            }

            const grandTotal = amount + taxAmount;

            // 2. Append to Sales (Header)
            const saleRow = [
                formData.invoiceNo, // Invoice No
                '', // Challan
                formData.date, // Inv Date
                formData.date, // Order Date
                selectedParty[0], // Cust ID
                selectedParty[1], // Cust Name
                amount.toFixed(2), // Total
                cgst.toFixed(2), // CGST
                sgst.toFixed(2), // SGST
                igst.toFixed(2), // IGST
                grandTotal.toFixed(2), // Grand Total
                formData.paymentMode, // Pay mode
                'Pending', // Status
                '', // details
                '' // confirm date
            ];

            // 3. Append to Sale_Items
            const itemRow = [
                `ITM-${Date.now()}`,
                formData.invoiceNo,
                selectedMat[0],
                selectedMat[1],
                formData.bags,
                formData.weight,
                formData.rate,
                taxRate,
                amount.toFixed(2)
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
                    <Plus size={16} />
                    New Sale
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
                                <th>Payment Mode</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sales.slice().reverse().map((row, idx) => (
                                <tr key={idx}>
                                    <td style={{ fontWeight: 600 }}>{row[0]}</td>
                                    <td>{row[2] ? format(new Date(row[2]), 'dd MMM yyyy') : '-'}</td>
                                    <td style={{ fontWeight: 500 }}>{row[5]}</td>
                                    <td style={{ fontWeight: 600 }}>₹{row[10]}</td>
                                    <td>{row[11]}</td>
                                    <td>
                                        <span className={`badge ${row[12] === 'Confirmed' ? 'badge-success' : 'badge-warning'}`}>
                                            {row[12] || 'Pending'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Add Sale Modal */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 50, padding: '1rem', overflowY: 'auto'
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: '600px', margin: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ fontSize: '1.25rem' }}>Create Sales Invoice</h2>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="input-group">
                                    <label className="input-label">Invoice Number</label>
                                    <input required className="input-field" value={formData.invoiceNo} onChange={e => setFormData({ ...formData, invoiceNo: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Date</label>
                                    <input required type="date" className="input-field" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Select Customer *</label>
                                <select required className="input-field" value={formData.customerId} onChange={e => setFormData({ ...formData, customerId: e.target.value })}>
                                    <option value="">-- Select Customer --</option>
                                    {parties.map(p => (
                                        <option key={p[0]} value={p[0]}>{p[1]} {p[3] ? `(${p[3]})` : ''}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ backgroundColor: 'var(--bg-app)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                                <h3 style={{ fontSize: '0.875rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>Item Details</h3>
                                <div className="input-group">
                                    <label className="input-label">Material *</label>
                                    <select required className="input-field" value={formData.materialId} onChange={e => handleMaterialChange(e.target.value)}>
                                        <option value="">-- Select Material --</option>
                                        {materials.map(m => (
                                            <option key={m[0]} value={m[0]}>{m[1]}</option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                                    <div className="input-group">
                                        <label className="input-label">No. of Bags</label>
                                        <input required type="number" className="input-field" value={formData.bags} onChange={e => setFormData({ ...formData, bags: e.target.value })} />
                                    </div>
                                    <div className="input-group">
                                        <label className="input-label">Total Weight (KG)</label>
                                        <input required type="number" step="0.01" className="input-field" value={formData.weight} onChange={e => setFormData({ ...formData, weight: e.target.value })} />
                                    </div>
                                    <div className="input-group">
                                        <label className="input-label">Rate / KG (₹)</label>
                                        <input required type="number" step="0.01" className="input-field" value={formData.rate} onChange={e => setFormData({ ...formData, rate: e.target.value })} />
                                    </div>
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Payment Mode</label>
                                <select className="input-field" value={formData.paymentMode} onChange={e => setFormData({ ...formData, paymentMode: e.target.value })}>
                                    <option value="Cash">Cash</option>
                                    <option value="Cheque">Cheque</option>
                                    <option value="Bank Transfer">Bank Transfer (NEFT/RTGS/UPI)</option>
                                </select>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                    {isSubmitting ? 'Saving...' : 'Create Invoice'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
