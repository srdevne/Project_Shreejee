import { useEffect, useState } from 'react';
import { Package, Plus, X, Pencil } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchSheetData, appendRow, updateRow } from '../../services/googleSheets';
import { getColumnLetter, formatBagInventory, getSellingPriceForMonth, getLatestBuyPrices } from '../../services/materialsHelper';

export default function Materials() {
    const { accessToken } = useAuth();
    const [materials, setMaterials] = useState<any[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [latestBuyPrices, setLatestBuyPrices] = useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Add Form State
    const [formData, setFormData] = useState({
        name: '', desc: '', tax: '18', purchase: '', selling: '',
        openBags: '0', openKg: '0', hsnCode: ''
    });

    // Edit Form State
    const [editModal, setEditModal] = useState<{ open: boolean; idx: number; row: any[] } | null>(null);
    const [editFormData, setEditFormData] = useState({
        name: '', desc: '', tax: '18', purchase: '', selling: '',
        openBags: '0', openKg: '0', hsnCode: '',
        month: new Date().toISOString().slice(0, 7), monthlySelling: ''
    });

    const loadMaterials = async () => {
        if (!accessToken) return;
        setIsLoading(true);
        try {
            const [purchasesData, purchaseItemsData, materialsData] = await Promise.all([
                fetchSheetData(accessToken, 'Purchases!A2:L'),
                fetchSheetData(accessToken, 'Purchase_Items!A2:H'),
                fetchSheetData(accessToken, 'Materials!A1:Z')
            ]);
            if (materialsData.length > 0) {
                setHeaders(materialsData[0]);
                setMaterials(materialsData.slice(1));
            }
            const buyPrices = getLatestBuyPrices(purchasesData, purchaseItemsData);
            setLatestBuyPrices(buyPrices);
        } catch (error) {
            console.error('Failed to load materials', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadMaterials();
    }, [accessToken]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!accessToken) return;
        setIsSubmitting(true);
        try {
            const rowData = [
                `MAT-${Date.now()}`,   // ID
                formData.name,
                formData.desc,
                formData.openBags || '0',  // Opening Stock Bags (col 3)
                formData.openKg || '0',    // Opening Stock KG   (col 4)
                formData.tax,
                formData.purchase,
                formData.selling,
                formData.hsnCode,          // HSN Code            (col 8)
            ];
            await appendRow(accessToken, 'Materials!A:I', [rowData]);
            setIsModalOpen(false);
            setFormData({ name: '', desc: '', tax: '18', purchase: '', selling: '', openBags: '0', openKg: '0', hsnCode: '' });
            await loadMaterials();
        } catch (error) {
            console.error(error);
            alert('Failed to save material.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const openEditModal = (idx: number, row: any[]) => {
        const name = row[1] || '';
        const desc = row[2] || '';
        const openBags = row[3] || '0';
        const openKg = row[4] || '0';
        const tax = row[5] || '18';
        const purchase = row[6] || '';
        const selling = row[7] || '';
        const hsnCode = row[8] || '';

        const currentMonth = new Date().toISOString().slice(0, 7);
        // Find if this month already has a price
        const colIdx = headers.findIndex(h => h === currentMonth);
        const monthlySelling = (colIdx >= 11 && row[colIdx]) ? row[colIdx] : '';

        setEditFormData({
            name, desc, tax, purchase, selling, openBags, openKg, hsnCode,
            month: currentMonth, monthlySelling
        });
        setEditModal({ open: true, idx, row });
    };

    const handleEditMonthChange = (month: string) => {
        if (!editModal) return;
        const colIdx = headers.findIndex(h => h === month);
        const monthlySelling = (colIdx >= 11 && editModal.row[colIdx]) ? editModal.row[colIdx] : '';
        setEditFormData(prev => ({ ...prev, month, monthlySelling }));
    };

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!accessToken || !editModal) return;
        setIsSubmitting(true);
        try {
            const sheetRowNum = editModal.idx + 2; // index 0 in materials is row 2

            // 1. Update main attributes (B to I)
            await updateRow(accessToken, `Materials!B${sheetRowNum}:I${sheetRowNum}`, [[
                editFormData.name,
                editFormData.desc,
                editFormData.openBags || '0',
                editFormData.openKg || '0',
                editFormData.tax,
                editFormData.purchase,
                editFormData.selling,
                editFormData.hsnCode
            ]]);

            // 2. Update monthly price if specified
            if (editFormData.monthlySelling) {
                let colIdx = headers.indexOf(editFormData.month);
                if (colIdx === -1) {
                    const newColLetter = getColumnLetter(headers.length);
                    await updateRow(accessToken, `Materials!${newColLetter}1`, [[editFormData.month]]);
                    // Add locally to avoid reload issues before second update
                    headers.push(editFormData.month);
                    colIdx = headers.length - 1;
                }
                const cellLetter = getColumnLetter(colIdx);
                await updateRow(accessToken, `Materials!${cellLetter}${sheetRowNum}`, [[editFormData.monthlySelling]]);
            }

            setEditModal(null);
            await loadMaterials();
        } catch (error) {
            console.error(error);
            alert('Failed to update material.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="animate-fade-in">
            <div className="page-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <Package size={24} color="var(--color-primary)" />
                        Materials Master
                    </h1>
                    <p>Manage your product catalogue and default prices.</p>
                </div>
                <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                    <Plus size={16} />
                    Add Material
                </button>
            </div>

            <div className="table-container">
                {isLoading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading raw materials...</div>
                ) : materials.length === 0 ? (
                    <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <Package size={48} style={{ opacity: 0.2, margin: '0 auto 1rem auto' }} />
                        <p style={{ fontWeight: 500 }}>No materials found.</p>
                        <p style={{ fontSize: '0.875rem' }}>Click "Add Material" to list your first product.</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Material Name</th>
                                <th>Remaining Stock (1 bag = 25kg)</th>
                                <th>Buy Price (₹/KG)</th>
                                <th>Sell Price (₹/KG)</th>
                                <th>Open. Stock</th>
                                <th>Tax %</th>
                                <th>HSN</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {materials.map((row, idx) => {
                                const liveKg = parseFloat(row[9] || '0');
                                const materialId = row[0];
                                const latestBuy = latestBuyPrices[materialId];
                                const latestSell = getSellingPriceForMonth(row, headers);
                                return (
                                    <tr key={idx}>
                                        <td style={{ fontWeight: 600 }}>
                                            {row[1]}
                                            {row[2] && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>{row[2]}</div>}
                                        </td>
                                        <td>
                                            <span className={`badge ${liveKg <= 0 ? 'badge-danger' : liveKg < 250 ? 'badge-warning' : 'badge-success'}`}>
                                                {formatBagInventory(liveKg)}
                                            </span>
                                        </td>
                                        <td style={{ fontWeight: 600 }}>
                                            ₹{latestBuy !== undefined ? latestBuy.toFixed(2) : parseFloat(row[6] || '0').toFixed(2)}
                                            {latestBuy !== undefined && <div style={{ fontSize: '0.65rem', color: 'var(--color-secondary)', fontWeight: 400 }}>Latest purchase</div>}
                                        </td>
                                        <td style={{ fontWeight: 600 }}>
                                            ₹{latestSell.toFixed(2)}
                                            {latestSell !== parseFloat(row[7] || '0') && <div style={{ fontSize: '0.65rem', color: 'var(--color-primary)', fontWeight: 400 }}>Monthly override</div>}
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                                            {parseInt(row[3] || '0') > 0 ? `${row[3]} bags + ` : ''}{row[4] || '0'} KG
                                        </td>
                                        <td>{row[5] || '0'}%</td>
                                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{row[8] || '—'}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }} onClick={() => openEditModal(idx, row)}>
                                                <Pencil size={12} /> Edit
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Add Material Modal */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}>
                    <div className="card" style={{ width: '100%', maxWidth: '480px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1.1rem' }}>Add New Material</h2>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="input-label">Material Name *</label>
                                    <input required className="input-field" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. HDPE Granules" />
                                </div>
                                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="input-label">Description / Grade</label>
                                    <input className="input-field" value={formData.desc} onChange={e => setFormData({ ...formData, desc: e.target.value })} placeholder="Grade, color, etc." />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">HSN Code</label>
                                    <input className="input-field" value={formData.hsnCode} onChange={e => setFormData({ ...formData, hsnCode: e.target.value })} placeholder="e.g. 3901" />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">GST Tax Rate (%)</label>
                                    <select className="input-field" value={formData.tax} onChange={e => setFormData({ ...formData, tax: e.target.value })}>
                                        <option value="0">0% (Exempt)</option>
                                        <option value="5">5%</option>
                                        <option value="12">12%</option>
                                        <option value="18">18%</option>
                                        <option value="28">28%</option>
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Purchase Rate (₹/KG)</label>
                                    <input type="number" step="0.01" className="input-field" value={formData.purchase} onChange={e => setFormData({ ...formData, purchase: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Selling Rate (₹/KG)</label>
                                    <input type="number" step="0.01" className="input-field" value={formData.selling} onChange={e => setFormData({ ...formData, selling: e.target.value })} />
                                </div>

                                {/* Opening stock section */}
                                <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                                    <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Opening Stock (current inventory before this app)</p>
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Opening Bags</label>
                                    <input type="number" className="input-field" value={formData.openBags} onChange={e => setFormData({ ...formData, openBags: e.target.value })} placeholder="0" />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Opening KG</label>
                                    <input type="number" step="0.01" className="input-field" value={formData.openKg} onChange={e => setFormData({ ...formData, openKg: e.target.value })} placeholder="0.00" />
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                    {isSubmitting ? 'Saving...' : 'Save Material'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Material Modal */}
            {editModal?.open && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditModal(null); }}>
                    <div className="card" style={{ width: '100%', maxWidth: '480px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1.1rem' }}>Edit Material details</h2>
                            <button onClick={() => setEditModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>

                        <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="input-label">Material Name *</label>
                                    <input required className="input-field" value={editFormData.name} onChange={e => setEditFormData({ ...editFormData, name: e.target.value })} />
                                </div>
                                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="input-label">Description / Grade</label>
                                    <input className="input-field" value={editFormData.desc} onChange={e => setEditFormData({ ...editFormData, desc: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">HSN Code</label>
                                    <input className="input-field" value={editFormData.hsnCode} onChange={e => setEditFormData({ ...editFormData, hsnCode: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">GST Tax Rate (%)</label>
                                    <select className="input-field" value={editFormData.tax} onChange={e => setEditFormData({ ...editFormData, tax: e.target.value })}>
                                        <option value="0">0% (Exempt)</option>
                                        <option value="5">5%</option>
                                        <option value="12">12%</option>
                                        <option value="18">18%</option>
                                        <option value="28">28%</option>
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Base Purchase Rate (₹/KG)</label>
                                    <input type="number" step="0.01" className="input-field" value={editFormData.purchase} onChange={e => setEditFormData({ ...editFormData, purchase: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Base Selling Rate (₹/KG)</label>
                                    <input type="number" step="0.01" className="input-field" value={editFormData.selling} onChange={e => setEditFormData({ ...editFormData, selling: e.target.value })} />
                                </div>

                                {/* Monthly price configuration */}
                                <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                                    <p style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Monthly Price overrides</p>
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Target Month</label>
                                    <input type="month" className="input-field" value={editFormData.month} onChange={e => handleEditMonthChange(e.target.value)} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Selling Price for this Month (₹/KG)</label>
                                    <input type="number" step="0.01" className="input-field" value={editFormData.monthlySelling} onChange={e => setEditFormData({ ...editFormData, monthlySelling: e.target.value })} placeholder="No override set" />
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
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
