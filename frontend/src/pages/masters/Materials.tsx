import { useEffect, useState } from 'react';
import { Package, Plus, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchSheetData, appendRow } from '../../services/googleSheets';

export default function Materials() {
    const { accessToken } = useAuth();
    const [materials, setMaterials] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        name: '', desc: '', tax: '18', purchase: '', selling: '',
        openBags: '0', openKg: '0', hsnCode: ''
    });

    const loadMaterials = async () => {
        if (!accessToken) return;
        setIsLoading(true);
        try {
            const data = await fetchSheetData(accessToken, 'Materials!A2:K');
            setMaterials(data);
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

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
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
                                <th>Live Stock (Bags)</th>
                                <th>Live Stock (KG)</th>
                                <th>Buy Price (₹/KG)</th>
                                <th>Sell Price (₹/KG)</th>
                                <th>Open. Bags</th>
                                <th>Open. KG</th>
                                <th>Tax %</th>
                                <th>HSN</th>
                            </tr>
                        </thead>
                        <tbody>
                            {materials.map((row, idx) => {
                                const liveKg = parseFloat(row[9] || '0');
                                const liveBags = parseFloat(row[10] || '0');
                                return (
                                    <tr key={idx}>
                                        <td style={{ fontWeight: 600 }}>
                                            {row[1]}
                                            {row[2] && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>{row[2]}</div>}
                                        </td>
                                        <td>
                                            <span className={`badge ${liveBags <= 0 ? 'badge-danger' : liveBags < 10 ? 'badge-warning' : 'badge-success'}`}>
                                                {liveBags <= 0 ? 'Out' : liveBags.toFixed(0)}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`badge ${liveKg <= 0 ? 'badge-danger' : liveKg < 500 ? 'badge-warning' : 'badge-success'}`}>
                                                {liveKg <= 0 ? 'Out of Stock' : `${liveKg.toFixed(0)} KG`}
                                            </span>
                                        </td>
                                        <td style={{ fontWeight: 600 }}>₹{row[6] || '0'}</td>
                                        <td style={{ fontWeight: 600 }}>₹{row[7] || '0'}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{row[3] || '0'}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{row[4] || '0'}</td>
                                        <td>{row[5] || '0'}%</td>
                                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{row[8] || '—'}</td>
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
        </div>
    );
}
