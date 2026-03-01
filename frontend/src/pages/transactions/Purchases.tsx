import { useEffect, useRef, useState } from 'react';
import { ShoppingCart, Plus, X, CheckCircle, Camera, ImageIcon, Loader } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchSheetData, appendRow, updateRow, uploadFileToDrive } from '../../services/googleSheets';
import { format } from 'date-fns';

export default function Purchases() {
    const { accessToken } = useAuth();
    const [purchases, setPurchases] = useState<any[]>([]);
    const [parties, setParties] = useState<any[]>([]);
    const [materials, setMaterials] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadStatus, setUploadStatus] = useState('');

    // Payment confirmation
    const [confirmModal, setConfirmModal] = useState<{ open: boolean; rowIdx: number; purchaseId: string; supplier: string } | null>(null);
    const [confirmForm, setConfirmForm] = useState({ refNo: '', payDate: new Date().toISOString().split('T')[0] });

    // Form
    const [formData, setFormData] = useState({
        billNo: `PO-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString().split('T')[0],
        supplierId: '',
        materialId: '',
        bags: '',
        weight: '',
        rate: '',
    });

    // Photo capture
    const [capturedPhotos, setCapturedPhotos] = useState<File[]>([]);
    const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    const loadData = async () => {
        if (!accessToken) return;
        setIsLoading(true);
        try {
            const [purchasesData, partiesData, materialsData] = await Promise.all([
                fetchSheetData(accessToken, 'Purchases!A2:L'),
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

    useEffect(() => { loadData(); }, [accessToken]);

    const handleMaterialChange = (matId: string) => {
        const mat = materials.find(m => m[0] === matId);
        setFormData(prev => ({ ...prev, materialId: matId, rate: mat ? mat[6] : '' }));
    };

    // ── Photo handling ──────────────────────────────────────────────────────────
    const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        const newPhotos = [...capturedPhotos, ...files];
        setCapturedPhotos(newPhotos);
        const newUrls = newPhotos.map(f => URL.createObjectURL(f));
        setPhotoPreviewUrls(newUrls);
        // Reset input so the same file can be captured again
        if (cameraInputRef.current) cameraInputRef.current.value = '';
    };

    const removePhoto = (idx: number) => {
        URL.revokeObjectURL(photoPreviewUrls[idx]);
        setCapturedPhotos(prev => prev.filter((_, i) => i !== idx));
        setPhotoPreviewUrls(prev => prev.filter((_, i) => i !== idx));
    };

    // ── Submit ──────────────────────────────────────────────────────────────────
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

            // Upload photos to Google Drive
            let photoUrls = '';
            if (capturedPhotos.length > 0) {
                setUploadStatus(`Uploading ${capturedPhotos.length} photo(s)…`);
                const urls: string[] = [];
                for (let i = 0; i < capturedPhotos.length; i++) {
                    setUploadStatus(`Uploading photo ${i + 1} of ${capturedPhotos.length}…`);
                    const url = await uploadFileToDrive(
                        accessToken,
                        capturedPhotos[i],
                        `${purchaseId}_page${i + 1}.jpg`
                    );
                    urls.push(url);
                }
                photoUrls = urls.join(', ');
                setUploadStatus('');
            }

            const purchaseRow = [
                purchaseId,
                formData.billNo,
                formData.date,
                selectedParty[0],
                selectedParty[1],
                amount.toFixed(2),
                taxAmount.toFixed(2),
                grandTotal.toFixed(2),
                'Unpaid',
                '',          // Payment Date
                '',          // Payment Ref
                photoUrls,   // col L
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

            await appendRow(accessToken, 'Purchases!A:L', [purchaseRow]);
            await appendRow(accessToken, 'Purchase_Items!A:H', [itemRow]);

            setIsModalOpen(false);
            setCapturedPhotos([]);
            setPhotoPreviewUrls([]);
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
            setUploadStatus('');
        }
    };

    // ── Confirm payment ─────────────────────────────────────────────────────────
    const confirmPayment = async () => {
        if (!accessToken || !confirmModal) return;
        setIsSubmitting(true);
        try {
            const sheetRowNum = purchases.length - confirmModal.rowIdx + 1;
            await updateRow(accessToken, `Purchases!I${sheetRowNum}:K${sheetRowNum}`, [[
                'Paid', confirmForm.payDate, confirmForm.refNo,
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
            <div className="page-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <ShoppingCart size={24} color="var(--color-primary)" />
                        Purchases / Inward
                    </h1>
                    <p>Record inward supplies. Attach invoice photos for reference.</p>
                </div>
                <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                    <Plus size={16} /> New Purchase
                </button>
            </div>

            <div className="table-container">
                {isLoading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading purchases…</div>
                ) : purchases.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <ShoppingCart size={48} style={{ opacity: 0.2, margin: '0 auto 1rem auto' }} />
                        <p style={{ fontWeight: 500 }}>No purchases recorded yet.</p>
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
                                <th>Photos</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {purchases.slice().reverse().map((row, idx) => (
                                <tr key={idx}>
                                    <td style={{ fontWeight: 600 }}>{row[1]}</td>
                                    <td>{row[2] ? format(new Date(row[2]), 'dd MMM yyyy') : '-'}</td>
                                    <td style={{ fontWeight: 500 }}>{row[4]}</td>
                                    <td style={{ fontWeight: 600 }}>&#8377;{parseFloat(row[7] || '0').toLocaleString('en-IN')}</td>
                                    <td>
                                        <span className={`badge ${row[8] === 'Paid' ? 'badge-success' : 'badge-warning'}`}>
                                            {row[8] || 'Unpaid'}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                                        {row[10] || '-'}
                                    </td>
                                    <td>
                                        {row[11] ? (
                                            <a href={row[11].split(', ')[0]} target="_blank" rel="noreferrer"
                                                style={{ color: 'var(--color-primary)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                <ImageIcon size={13} />
                                                {row[11].split(', ').length} photo{row[11].split(', ').length > 1 ? 's' : ''}
                                            </a>
                                        ) : <span style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>–</span>}
                                    </td>
                                    <td>
                                        {row[8] !== 'Paid' && (
                                            <button onClick={() => setConfirmModal({ open: true, rowIdx: idx, purchaseId: row[0], supplier: row[4] })}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem' }}>
                                                <CheckCircle size={14} /> Paid
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── New Purchase Modal ───────────────────────────────────────────── */}
            {isModalOpen && (
                <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}>
                    <div className="card" style={{ width: '100%', maxWidth: '540px' }}>
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
                                    <label className="input-label">Supplier *</label>
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
                                    <label className="input-label">Rate / KG (&#8377;)</label>
                                    <input required type="number" step="0.01" className="input-field" value={formData.rate} onChange={e => setFormData({ ...formData, rate: e.target.value })} />
                                </div>
                            </div>

                            {/* Photo Capture Section */}
                            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <p style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                                        Invoice / PO Photos ({capturedPhotos.length})
                                    </p>
                                    <button type="button"
                                        onClick={() => cameraInputRef.current?.click()}
                                        className="btn btn-secondary"
                                        style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}>
                                        <Camera size={14} /> {capturedPhotos.length === 0 ? 'Capture / Upload' : 'Add More'}
                                    </button>
                                </div>
                                {/* Hidden file input — accepts camera on mobile, file picker on desktop */}
                                <input
                                    ref={cameraInputRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    multiple
                                    style={{ display: 'none' }}
                                    onChange={handlePhotoCapture}
                                />
                                {photoPreviewUrls.length > 0 && (
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                                        {photoPreviewUrls.map((url, i) => (
                                            <div key={i} style={{ position: 'relative', width: '80px', height: '80px' }}>
                                                <img src={url} alt={`Page ${i + 1}`} style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }} />
                                                <button type="button" onClick={() => removePhoto(i)}
                                                    style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(220,38,38,0.85)', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                                    <X size={11} />
                                                </button>
                                                <span style={{ position: 'absolute', bottom: '2px', left: '3px', fontSize: '0.6rem', color: 'white', background: 'rgba(0,0,0,0.5)', borderRadius: '2px', padding: '0 3px' }}>p{i + 1}</span>
                                            </div>
                                        ))}
                                        <button type="button" onClick={() => cameraInputRef.current?.click()}
                                            style={{ width: '80px', height: '80px', border: '2px dashed var(--border-color)', borderRadius: 'var(--radius-sm)', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Plus size={20} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {uploadStatus && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--color-primary)' }}>
                                    <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                    {uploadStatus}
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                                    {isSubmitting ? uploadStatus || 'Saving…' : 'Record Purchase'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Payment Confirmation Modal ────────────────────────────────────── */}
            {confirmModal?.open && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '1rem' }}>
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
                                <input required type="date" className="input-field" value={confirmForm.payDate} onChange={e => setConfirmForm({ ...confirmForm, payDate: e.target.value })} />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Transaction / Cheque Ref No.</label>
                                <input className="input-field" placeholder="e.g. UTR-987654 or CHQ-0088" value={confirmForm.refNo} onChange={e => setConfirmForm({ ...confirmForm, refNo: e.target.value })} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                <button className="btn btn-secondary" onClick={() => setConfirmModal(null)}>Cancel</button>
                                <button className="btn btn-primary" style={{ backgroundColor: 'var(--color-secondary)', borderColor: 'var(--color-secondary)' }}
                                    onClick={confirmPayment} disabled={isSubmitting}>
                                    <CheckCircle size={16} />
                                    {isSubmitting ? 'Saving…' : 'Mark as Paid'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
