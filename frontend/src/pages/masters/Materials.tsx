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

    // Form State
    const [formData, setFormData] = useState({
        name: '', desc: '', tax: '18', purchase: '', selling: ''
    });

    const loadMaterials = async () => {
        if (!accessToken) return;
        setIsLoading(true);
        try {
            const data = await fetchSheetData(accessToken, 'Materials!A2:I');
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
                `MAT-${Date.now()}`, // ID
                formData.name,
                formData.desc,
                '0', // Init Stock Bags
                '0', // Init Stock KG
                formData.tax,
                formData.purchase,
                formData.selling,
                new Date().toISOString() // Last Updated
            ];
            await appendRow(accessToken, 'Materials!A:I', [rowData]);
            setIsModalOpen(false);
            setFormData({ name: '', desc: '', tax: '18', purchase: '', selling: '' });
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
                                <th>ID</th>
                                <th>Material Name</th>
                                <th>Stock (Bags)</th>
                                <th>Stock (KG)</th>
                                <th>Def. Purchase (₹)</th>
                                <th>Def. Selling (₹)</th>
                                <th>Tax %</th>
                            </tr>
                        </thead>
                        <tbody>
                            {materials.map((row, idx) => (
                                <tr key={idx}>
                                    <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{row[0]}</td>
                                    <td style={{ fontWeight: 600 }}>
                                        {row[1]}
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>{row[2]}</div>
                                    </td>
                                    <td>{row[3] || '0'}</td>
                                    <td>{row[4] || '0'}</td>
                                    <td>₹{row[6] || '0'}</td>
                                    <td>₹{row[7] || '0'}</td>
                                    <td>{row[5] || '0'}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Add Material Modal */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem'
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: '480px', maxHeight: '95vh', overflowY: 'auto' }}>
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
                                    <label className="input-label">Description</label>
                                    <input className="input-field" value={formData.desc} onChange={e => setFormData({ ...formData, desc: e.target.value })} placeholder="Grade, color, etc." />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Purchase Rate (₹/KG)</label>
                                    <input type="number" step="0.01" className="input-field" value={formData.purchase} onChange={e => setFormData({ ...formData, purchase: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Selling Rate (₹/KG)</label>
                                    <input type="number" step="0.01" className="input-field" value={formData.selling} onChange={e => setFormData({ ...formData, selling: e.target.value })} />
                                </div>
                                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="input-label">GST Tax Rate (%)</label>
                                    <select className="input-field" value={formData.tax} onChange={e => setFormData({ ...formData, tax: e.target.value })}>
                                        <option value="0">0% (Exempt)</option>
                                        <option value="5">5%</option>
                                        <option value="12">12%</option>
                                        <option value="18">18%</option>
                                        <option value="28">28%</option>
                                    </select>
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
