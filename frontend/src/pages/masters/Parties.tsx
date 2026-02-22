import { useEffect, useState } from 'react';
import { Users, Plus, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchSheetData, appendRow } from '../../services/googleSheets';

export default function Parties() {
    const { accessToken } = useAuth();
    const [parties, setParties] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        name: '', type: 'Customer', gstin: '', phone: '', email: '', address: ''
    });

    const loadParties = async () => {
        if (!accessToken) return;
        setIsLoading(true);
        try {
            const data = await fetchSheetData(accessToken, 'Parties!A2:H');
            setParties(data);
        } catch (error) {
            console.error('Failed to load parties', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadParties();
    }, [accessToken]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!accessToken) return;
        setIsSubmitting(true);
        try {
            const rowData = [
                `PTY-${Date.now()}`, // ID
                formData.name,
                formData.type,
                formData.gstin.toUpperCase(),
                formData.phone,
                formData.email,
                formData.address,
                'Active' // Status
            ];
            await appendRow(accessToken, 'Parties!A:H', [rowData]);
            setIsModalOpen(false);
            setFormData({ name: '', type: 'Customer', gstin: '', phone: '', email: '', address: '' });
            await loadParties();
        } catch (error) {
            console.error(error);
            alert('Failed to save party.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <Users size={24} color="var(--color-primary)" />
                        Parties Directory
                    </h1>
                    <p>Manage customers and suppliers.</p>
                </div>
                <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                    <Plus size={16} />
                    Add Party
                </button>
            </div>

            <div className="table-container">
                {isLoading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading parties...</div>
                ) : parties.length === 0 ? (
                    <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <Users size={48} style={{ opacity: 0.2, margin: '0 auto 1rem auto' }} />
                        <p style={{ fontWeight: 500 }}>No parties found.</p>
                        <p style={{ fontSize: '0.875rem' }}>Click "Add Party" to register a customer or supplier.</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Type</th>
                                <th>GSTIN</th>
                                <th>Contact</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {parties.map((row, idx) => (
                                <tr key={idx}>
                                    <td style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{row[0]}</td>
                                    <td style={{ fontWeight: 600 }}>{row[1]}</td>
                                    <td>
                                        <span className={`badge ${row[2]?.toLowerCase() === 'supplier' ? 'badge-warning' : 'badge-success'}`}>
                                            {row[2] || 'Unknown'}
                                        </span>
                                    </td>
                                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{row[3] || '-'}</td>
                                    <td>
                                        <div>{row[4]}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{row[5]}</div>
                                    </td>
                                    <td>
                                        <span className={`badge ${row[7] === 'Inactive' ? 'badge-danger' : 'badge-neutral'}`}>
                                            {row[7] || 'Active'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Add Party Modal */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem'
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: '500px', maxHeight: '95vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1.1rem' }}>Add New Party</h2>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="input-label">Company / Individual Name *</label>
                                    <input required className="input-field" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Type</label>
                                    <select className="input-field" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                                        <option value="Customer">Customer (Buyer)</option>
                                        <option value="Supplier">Supplier (Vendor)</option>
                                        <option value="Both">Both</option>
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label className="input-label">GSTIN (Optional)</label>
                                    <input className="input-field" value={formData.gstin} onChange={e => setFormData({ ...formData, gstin: e.target.value })} placeholder="27AADCB2230M1Z2" />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Phone Number</label>
                                    <input type="tel" className="input-field" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Email Address</label>
                                    <input type="email" className="input-field" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                                </div>
                                <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                    <label className="input-label">Billing Address</label>
                                    <input className="input-field" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} placeholder="Street, City, State" />
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                    {isSubmitting ? 'Saving...' : 'Save Party'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
