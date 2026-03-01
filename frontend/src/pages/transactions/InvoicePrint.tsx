import { useEffect, useRef, useState } from 'react';
import { Printer, X, Bluetooth, BluetoothConnected, Loader, Share2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchSheetData } from '../../services/googleSheets';
import { format } from 'date-fns';
import {
    connectPrinter, disconnectPrinter, isPrinterConnected,
    printInvoice as btPrintInvoice, printTestPage
} from '../../services/bluetoothPrinter';
import html2canvas from 'html2canvas';

// ── Company constants ──────────────────────────────────────────────────────
const CO = {
    name: 'M/S. SHREEJEE ENTERPRISES',
    tagline: 'DEALERS IN: ALL TYPES OF PLASTIC RAW MATERIALS',
    office: '279, SICOF, Plot No. 69, M.I.D.C Area, Satpur, Nashik - 422 007.',
    reg: 'Silver Wood, Savarkar Nagar, Gangapur Road, Nashik - 422013.',
    email: 'shreejeeenterprises279@gmail.com',
    mob: '9890944818 / 9850063816',
    gstin: '27AAZPB1051B1Z2',
    bank: 'Saraswat Co. op. Bank, Mahatma Nagar Branch',
    acc: '61000000049912',
    ifsc: 'SRCB0000210',
};

// ── Amount in words ────────────────────────────────────────────────────────
const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function inWords(n: number): string {
    if (n === 0) return 'Zero';
    const crore = Math.floor(n / 10000000);
    const lakh = Math.floor((n % 10000000) / 100000);
    const thou = Math.floor((n % 100000) / 1000);
    const hund = Math.floor((n % 1000) / 100);
    const rem = n % 100;

    const chunk = (x: number): string => {
        if (x === 0) return '';
        if (x < 20) return ones[x] + ' ';
        return tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '') + ' ';
    };

    let result = '';
    if (crore) result += chunk(crore) + 'Crore ';
    if (lakh) result += chunk(lakh) + 'Lakh ';
    if (thou) result += chunk(thou) + 'Thousand ';
    if (hund) result += ones[hund] + ' Hundred ';
    if (rem) result += chunk(rem);
    return result.trim();
}

function amountInWords(total: number): string {
    const rupees = Math.floor(total);
    const paise = Math.round((total - rupees) * 100);
    let s = `Rs. ${inWords(rupees)} Rupees`;
    if (paise > 0) s += ` and ${inWords(paise)} Paise`;
    s += ' Only';
    return s;
}

// ── Types ──────────────────────────────────────────────────────────────────
interface InvoiceItem {
    materialName: string;
    hsnCode: string;
    bags: string;
    weight: string;
    rate: string;
    taxRate: string;
    amount: string;
}
interface InvoiceData {
    invoiceNo: string;
    invoiceDate: string;
    challanNo: string;
    orderType: string;
    orderDate: string;
    customerName: string;
    customerGstin: string;
    customerAddress: string;
    paymentMode: string;
    paymentStatus: string;
    payRef: string;
    payDate: string;
    grandTotal: string;
    cgst: string;
    sgst: string;
    taxRate: string;
    invoiceUid: string;  // verifiable UID stored in col Q
    items: InvoiceItem[];
}

// ── Cell style helpers ─────────────────────────────────────────────────────
const td = (extra?: React.CSSProperties): React.CSSProperties => ({
    border: '1px solid #333', padding: '4px 6px', fontSize: '0.78rem', color: '#111', ...extra
});

export default function InvoicePrint({ invoiceNo, onClose }: { invoiceNo: string; onClose: () => void }) {
    const { accessToken } = useAuth();
    const [invoice, setInvoice] = useState<InvoiceData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [btConnected, setBtConnected] = useState(false);
    const [btPrinting, setBtPrinting] = useState(false);
    const [btMsg, setBtMsg] = useState('');
    const [isSharing, setIsSharing] = useState(false);
    const invoiceRef = useRef<HTMLDivElement>(null);

    useEffect(() => { setBtConnected(isPrinterConnected()); }, []);

    useEffect(() => {
        const load = async () => {
            if (!accessToken) return;
            try {
                const [salesData, itemsData, partiesData, matsData] = await Promise.all([
                    fetchSheetData(accessToken, 'Sales!A2:Q'),  // Q = invoice UID
                    fetchSheetData(accessToken, 'Sale_Items!A2:I'),
                    fetchSheetData(accessToken, 'Parties!A2:H'),
                    fetchSheetData(accessToken, 'Materials!A2:I'),
                ]);
                const sr = salesData.find(r => r[0] === invoiceNo);
                if (!sr) return;
                const party = partiesData.find(p => p[0] === sr[4]);
                const items: InvoiceItem[] = itemsData.filter(r => r[1] === invoiceNo).map(r => {
                    const mat = matsData.find(m => m[0] === r[2]);
                    return {
                        materialName: r[3], bags: r[4], weight: r[5], rate: r[6],
                        taxRate: r[7], amount: r[8],
                        hsnCode: mat ? (mat[8] || '') : '',
                    };
                });
                setInvoice({
                    invoiceNo: sr[0], challanNo: sr[1] || sr[0],
                    invoiceDate: sr[2], orderDate: sr[3] || sr[2],
                    orderType: sr[15] || 'Verbal',
                    customerName: sr[5],
                    paymentMode: sr[11], paymentStatus: sr[12],
                    payRef: sr[13], payDate: sr[14],
                    grandTotal: sr[10], cgst: sr[7], sgst: sr[8],
                    taxRate: items[0]?.taxRate || '0',
                    customerGstin: party ? (party[3] || '') : '',
                    customerAddress: party ? (party[6] || '') : '',
                    invoiceUid: sr[16] || '',  // col Q
                    items,
                });
            } catch (e) { console.error(e); }
            finally { setIsLoading(false); }
        };
        load();
    }, [invoiceNo, accessToken]);

    const handleBtConnect = async () => {
        setBtMsg('');
        try { const n = await connectPrinter(); setBtConnected(true); setBtMsg(`Connected: ${n}`); }
        catch (e: any) { setBtMsg(e.message); }
    };

    // ── Share invoice via native share sheet ────────────────────────────────
    const handleShare = async () => {
        if (!invoice || !invoiceRef.current) return;
        setIsSharing(true);
        setBtMsg('');

        // Build a compact text fallback (WhatsApp-friendly)
        const subTot = invoice.items.reduce((s, i) => s + parseFloat(i.amount || '0'), 0);
        const grandTot = parseFloat(invoice.grandTotal || '0');
        const cgst = parseFloat(invoice.cgst || '0');
        const sgst = parseFloat(invoice.sgst || '0');
        const fmtD = (d: string) => d ? format(new Date(d), 'dd/MM/yyyy') : '';

        const itemLines = invoice.items
            .filter(i => i.materialName)
            .map(i => `  • ${i.materialName}: ${i.weight} KG @ ₹${i.rate}/KG = ₹${parseFloat(i.amount || '0').toFixed(2)}`)
            .join('\n');

        const textSummary =
            `*M/S. SHREEJEE ENTERPRISES*
_Dealers in: All Types of Plastic Raw Materials_

*TAX INVOICE*
━━━━━━━━━━━━━━━━━━━━━━
*Invoice No:* ${invoice.invoiceNo}   *Date:* ${fmtD(invoice.invoiceDate)}
*Challan No:* ${invoice.challanNo}
*Bill To:* ${invoice.customerName}
${invoice.customerGstin ? `*GSTIN:* ${invoice.customerGstin}` : ''}

*Items:*
${itemLines}

━━━━━━━━━━━━━━━━━━━━━━
Subtotal:   ₹${subTot.toFixed(2)}
CGST:       ₹${cgst.toFixed(2)}
SGST:       ₹${sgst.toFixed(2)}
*GRAND TOTAL: ₹${grandTot.toFixed(2)}*
━━━━━━━━━━━━━━━━━━━━━━
*Payment:* ${invoice.paymentMode} · ${invoice.paymentStatus}
${invoice.payRef ? `*Ref:* ${invoice.payRef}` : ''}

GSTIN: ${CO.gstin} | 📞 ${CO.mob}`;

        try {
            // Step 1 — try sharing as image (best for mobile)
            const canvas = await html2canvas(invoiceRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
            });
            const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
            if (blob) {
                const file = new File([blob], `${invoice.invoiceNo}.png`, { type: 'image/png' });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: `Invoice ${invoice.invoiceNo} — Shreejee Enterprises`,
                        text: textSummary,
                        files: [file],
                    });
                    setIsSharing(false);
                    return;
                }
            }

            // Step 2 — fallback: share text only
            if (navigator.share) {
                await navigator.share({
                    title: `Invoice ${invoice.invoiceNo} — Shreejee Enterprises`,
                    text: textSummary,
                });
            } else {
                // Step 3 — copy to clipboard for desktop
                await navigator.clipboard.writeText(textSummary);
                setBtMsg('📋 Invoice details copied to clipboard!');
            }
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                // User dismissed share sheet — silent
            } else if (err?.name === 'NotAllowedError') {
                // iOS/browser context restriction—copy text fallback
                try { await navigator.clipboard.writeText(textSummary); } catch { }
                setBtMsg('⚠ Sharing blocked by browser. Invoice text copied to clipboard instead. On iOS, open in Safari for full sharing.');
            } else {
                setBtMsg(err?.message || 'Share failed.');
            }
        } finally {
            setIsSharing(false);
        }
    };
    const handleBtPrint = async () => {
        if (!invoice) return;
        setBtPrinting(true); setBtMsg('');
        try {
            const subTotal = invoice.items.reduce((s, i) => s + parseFloat(i.amount || '0'), 0);
            await btPrintInvoice({
                invoiceNo: invoice.invoiceNo, invoiceDate: invoice.invoiceDate,
                customerName: invoice.customerName, orderType: invoice.orderType,
                paymentMode: invoice.paymentMode, payStatus: invoice.paymentStatus,
                payRef: invoice.payRef, payDate: invoice.payDate,
                subTotal, cgst: parseFloat(invoice.cgst || '0'), sgst: parseFloat(invoice.sgst || '0'),
                grandTotal: parseFloat(invoice.grandTotal || '0'),
                items: invoice.items.map(i => ({
                    name: i.materialName, bags: i.bags, weight: i.weight, rate: i.rate,
                    amount: parseFloat(i.amount || '0'),
                    taxAmount: parseFloat(i.amount || '0') * parseFloat(i.taxRate || '0') / 100,
                })),
            });
            setBtMsg('✅ Printed!');
        } catch (e: any) { setBtMsg(e.message); }
        finally { setBtPrinting(false); }
    };

    if (isLoading) return null;
    if (!invoice) return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="card"><p>Invoice not found.</p><button className="btn btn-secondary" onClick={onClose}>Close</button></div>
        </div>
    );

    const subTotal = invoice.items.reduce((s, i) => s + parseFloat(i.amount || '0'), 0);
    const cgstAmt = parseFloat(invoice.cgst || '0');
    const sgstAmt = parseFloat(invoice.sgst || '0');
    const grand = parseFloat(invoice.grandTotal || '0');
    const roundOff = grand - (subTotal + cgstAmt + sgstAmt);
    const taxPct = invoice.taxRate || '9';
    const fmtDate = (d: string) => d ? format(new Date(d), 'dd/MM/yyyy') : '';
    const fmt2 = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2 });

    // Build empty rows for the items section (minimum 8 rows for print look)
    const printRows = [...invoice.items];
    while (printRows.length < 8) printRows.push({ materialName: '', hsnCode: '', bags: '', weight: '', rate: '', taxRate: '', amount: '' });

    return (
        <div className="invoice-modal-backdrop" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 70, overflowY: 'auto' }}>
            <div id="invoice-print-root" style={{ width: '100%', maxWidth: '820px', margin: '0 auto', padding: '0.75rem' }}>

                {/* ── Toolbar (no-print) ── */}
                <div className="invoice-toolbar no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 1rem', backgroundColor: '#1a1a1a', borderRadius: '8px', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#e0e0e0' }}>{invoice.invoiceNo} — Preview</span>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {!btConnected
                            ? <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem' }} onClick={handleBtConnect}><Bluetooth size={13} /> BT Print</button>
                            : <>
                                <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem', color: '#059669' }} onClick={handleBtPrint} disabled={btPrinting}>
                                    {btPrinting ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <BluetoothConnected size={13} />}
                                    {btPrinting ? 'Printing…' : 'Print Receipt'}
                                </button>
                                <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.5rem' }} onClick={() => printTestPage().catch(e => setBtMsg(e.message))}>Test</button>
                                <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.5rem', color: '#C62828' }} onClick={() => { disconnectPrinter(); setBtConnected(false); }}><X size={11} /></button>
                            </>
                        }
                        <button
                            className="btn"
                            style={{ fontSize: '0.8rem', padding: '0.35rem 0.8rem', backgroundColor: '#25D366', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                            onClick={handleShare}
                            disabled={isSharing}
                        >
                            {isSharing
                                ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                : <Share2 size={14} />}
                            {isSharing ? 'Preparing…' : 'Share'}
                        </button>
                        <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.8rem' }} onClick={() => window.print()}>
                            <Printer size={14} /> Print / PDF
                        </button>
                        <button onClick={onClose} style={{
                            background: 'white', border: '1px solid #ccc',
                            borderRadius: '4px', cursor: 'pointer',
                            padding: '0.3rem 0.5rem', color: '#111',
                            display: 'flex', alignItems: 'center'
                        }}><X size={18} /></button>
                    </div>
                    {btMsg && <p style={{ width: '100%', margin: 0, fontSize: '0.75rem', color: btMsg.startsWith('✅') || btMsg.startsWith('Connected') ? '#059669' : '#C62828' }}>{btMsg}</p>}
                </div>

                {/* ── Invoice Body (captured by html2canvas + A4 print) ── */}
                <div id="invoice-print" ref={invoiceRef}
                    className="invoice-print-area"
                    style={{ padding: '1.25rem 1.5rem', fontFamily: '"Times New Roman", Times, serif', fontSize: '0.82rem', color: '#111', backgroundColor: 'white', overflowX: 'hidden' }}>

                    {/* Company Header — centered, no competing elements on same row */}
                    <div style={{ textAlign: 'center', borderBottom: '3px double #8B0000', paddingBottom: '0.5rem', marginBottom: '0.4rem' }}>
                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#444' }}>JAI MATA DI</p>
                        <h1 style={{ margin: '0.1rem 0', fontSize: '1.6rem', fontWeight: 900, color: '#8B0000', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'center' }}>
                            M/S. SHREEJEE ENTERPRISES
                        </h1>
                        <p style={{ margin: '0.1rem auto 0.25rem', display: 'inline-block', padding: '0.15rem 1.25rem', border: '1.5px solid #8B0000', fontSize: '0.72rem', fontWeight: 700, color: '#8B0000', letterSpacing: '0.04em' }}>
                            DEALERS IN: ALL TYPES OF PLASTIC RAW MATERIALS
                        </p>
                        {/* Contact row BELOW h1 so it doesn’t pull heading off-center */}
                        <div style={{ fontSize: '0.68rem', color: '#444', marginTop: '0.15rem' }}>
                            <div>📞 Mob.: {CO.mob} &nbsp;&nbsp; ✉ {CO.email}</div>
                            <div>Office : {CO.office}</div>
                            <div>Reg Add : {CO.reg}</div>
                        </div>
                    </div>

                    {/* TAX INVOICE + GSTIN bar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0.4rem 0', padding: '0.2rem 0.5rem', border: '1px solid #8B0000' }}>
                        <span style={{ backgroundColor: '#8B0000', color: 'white', fontWeight: 800, fontSize: '0.85rem', padding: '0.1rem 0.9rem', letterSpacing: '0.08em' }}>TAX INVOICE</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>GSTIN No. <strong style={{ color: '#8B0000' }}>{CO.gstin}</strong></span>
                    </div>

                    {/* Bill To + Invoice Meta */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0.4rem' }}>
                        <tbody>
                            <tr>
                                {/* Left: Bill To */}
                                <td style={{ ...td({ verticalAlign: 'top', width: '55%', padding: '6px 8px' }) }}>
                                    <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>M/s.&nbsp;
                                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{invoice.customerName}</span>
                                    </div>
                                    {invoice.customerAddress && (
                                        <div style={{ color: '#333', fontSize: '0.72rem', whiteSpace: 'pre-line', marginBottom: '0.3rem' }}>{invoice.customerAddress}</div>
                                    )}
                                    {invoice.customerGstin && (
                                        <div style={{ fontSize: '0.72rem' }}><strong>GSTIN No.</strong> {invoice.customerGstin}</div>
                                    )}
                                </td>
                                {/* Right: Invoice details */}
                                <td style={{ ...td({ verticalAlign: 'top', width: '45%' }) }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                        <tbody>
                                            <tr>
                                                <td style={{ padding: '2px 4px', whiteSpace: 'nowrap' }}>Invoice No.</td>
                                                <td style={{ padding: '2px 4px', fontWeight: 700 }}>: {invoice.invoiceNo}</td>
                                                <td style={{ padding: '2px 4px' }}>Date</td>
                                                <td style={{ padding: '2px 4px', fontWeight: 700 }}>: {fmtDate(invoice.invoiceDate)}</td>
                                            </tr>
                                            <tr>
                                                <td style={{ padding: '2px 4px' }}>Challan No.</td>
                                                <td style={{ padding: '2px 4px', fontWeight: 600 }}>: {invoice.challanNo || '-'}</td>
                                                <td style={{ padding: '2px 4px' }}>Date</td>
                                                <td style={{ padding: '2px 4px' }}>: {fmtDate(invoice.invoiceDate)}</td>
                                            </tr>
                                            <tr>
                                                <td style={{ padding: '2px 4px' }}>Order No.</td>
                                                <td style={{ padding: '2px 4px', fontWeight: 600, color: '#8B0000' }}>: {invoice.orderType}</td>
                                                <td style={{ padding: '2px 4px' }}>Date</td>
                                                <td style={{ padding: '2px 4px' }}>: {fmtDate(invoice.orderDate)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Items Table */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0.4rem' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f5e6e6' }}>
                                <th style={{ ...td({ textAlign: 'center', width: '4%' }) }}>Sr. No.</th>
                                <th style={{ ...td({ textAlign: 'left', width: '30%' }) }}>Particulars</th>
                                <th style={{ ...td({ textAlign: 'center', width: '10%' }) }}>HSN CODE</th>
                                <th style={{ ...td({ textAlign: 'center', width: '8%' }) }} colSpan={2}>Quantity</th>
                                <th style={{ ...td({ textAlign: 'center', width: '12%' }) }}>Rate Per Kg.</th>
                                <th style={{ ...td({ textAlign: 'right', width: '13%' }) }}>Amount Rs.</th>
                            </tr>
                            <tr style={{ backgroundColor: '#f5e6e6' }}>
                                <th style={td({ textAlign: 'center' })}></th>
                                <th style={td()}></th>
                                <th style={td({ textAlign: 'center' })}></th>
                                <th style={{ ...td({ textAlign: 'center', width: '8%', fontSize: '0.7rem' }) }}>No. of Bags</th>
                                <th style={{ ...td({ textAlign: 'center', width: '8%', fontSize: '0.7rem' }) }}>Kgs</th>
                                <th style={td()}></th>
                                <th style={td()}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {printRows.map((row, i) => (
                                <tr key={i} style={{ height: '30px' }}>
                                    <td style={{ ...td({ textAlign: 'center' }) }}>{row.materialName ? i + 1 : ''}</td>
                                    <td style={td({ fontWeight: row.materialName ? 600 : 400 })}>{row.materialName}</td>
                                    <td style={{ ...td({ textAlign: 'center', fontFamily: 'monospace' }) }}>{row.hsnCode}</td>
                                    <td style={{ ...td({ textAlign: 'center' }) }}>{row.bags}</td>
                                    <td style={{ ...td({ textAlign: 'center' }) }}>{row.weight}</td>
                                    <td style={{ ...td({ textAlign: 'right' }) }}>{row.rate ? `${row.rate}` : ''}</td>
                                    <td style={{ ...td({ textAlign: 'right', fontWeight: 600 }) }}>
                                        {row.amount ? fmt2(parseFloat(row.amount)) : ''}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Totals section */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0.4rem' }}>
                        <tbody>
                            <tr>
                                {/* Left: Amount in words + Bank Details */}
                                <td style={{ ...td({ verticalAlign: 'top', width: '55%' }) }}>
                                    <div style={{ marginBottom: '0.5rem' }}>
                                        <strong style={{ fontSize: '0.72rem' }}>Rs. (in words):</strong>&nbsp;
                                        <em style={{ fontSize: '0.78rem' }}>{amountInWords(grand)}</em>
                                    </div>
                                    <div style={{ fontSize: '0.7rem', lineHeight: 1.6, borderTop: '1px solid #ccc', paddingTop: '0.3rem' }}>
                                        <strong>BANK DETAILS</strong><br />
                                        {CO.bank}<br />
                                        A/c : {CO.acc}<br />
                                        IFSC CODE - {CO.ifsc}
                                    </div>
                                    {invoice.payRef && (
                                        <div style={{ marginTop: '0.4rem', fontSize: '0.7rem', color: '#059669' }}>
                                            ✅ Paid on {fmtDate(invoice.payDate)} · Ref: {invoice.payRef}
                                        </div>
                                    )}
                                </td>
                                {/* Right: Numeric totals */}
                                <td style={{ ...td({ verticalAlign: 'top', width: '45%', padding: 0 }) }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <tbody>
                                            {[
                                                { label: 'TOTAL', value: subTotal, bold: false },
                                                { label: `CGST ${taxPct}%`, value: cgstAmt, bold: false },
                                                { label: `SGST ${taxPct}%`, value: sgstAmt, bold: false },
                                                { label: 'R.O.', value: roundOff, bold: false },
                                            ].map(row => (
                                                <tr key={row.label}>
                                                    <td style={{ ...td({ textAlign: 'right', padding: '4px 8px', fontWeight: row.bold ? 700 : 500 }) }}>{row.label}</td>
                                                    <td style={{ ...td({ textAlign: 'right', padding: '4px 8px', fontWeight: row.bold ? 700 : 500, width: '45%' }) }}>
                                                        {Math.abs(row.value) > 0.005 ? fmt2(row.value) : '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr style={{ backgroundColor: '#8B0000' }}>
                                                <td style={{ ...td({ textAlign: 'right', padding: '6px 8px', fontWeight: 800, fontSize: '0.85rem', color: 'white', border: '1px solid #8B0000' }) }}>GRAND TOTAL</td>
                                                <td style={{ ...td({ textAlign: 'right', padding: '6px 8px', fontWeight: 800, fontSize: '0.9rem', color: 'white', border: '1px solid #8B0000' }) }}>
                                                    {fmt2(grand)}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {/* E.&O.E. + Signature + Terms */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}>
                        <tbody>
                            <tr>
                                <td style={{ ...td({ width: '60%', verticalAlign: 'top', padding: '6px 8px' }) }}>
                                    <ol style={{ margin: 0, paddingLeft: '1.1rem', color: '#444', lineHeight: 1.7 }}>
                                        <li>Goods once sold will not be taken back.</li>
                                        <li>All claims regarding this bill should be preferred on transporters and we are not responsible for breakage, shortage or loss in transit.</li>
                                        <li>Any claims in respect of this bill is subject to jurisdiction of Bombay court only.</li>
                                    </ol>
                                </td>
                                <td style={{ ...td({ width: '40%', verticalAlign: 'bottom', textAlign: 'right', padding: '6px 12px' }) }}>
                                    <div style={{ fontSize: '0.7rem', marginBottom: '0.25rem', fontWeight: 700 }}>For M/s. SHREEJEE ENTERPRISES</div>
                                    <div style={{ height: '40px' }}></div>{/* Signature space */}
                                    <div style={{ borderTop: '1px solid #333', marginTop: '0.5rem', paddingTop: '0.2rem', fontWeight: 700 }}>Proprietor</div>
                                </td>
                            </tr>
                            <tr>
                                <td colSpan={2} style={{ ...td({ textAlign: 'center', fontStyle: 'italic', color: '#666', padding: '4px' }) }}>
                                    E. &amp; O. E.&nbsp;&nbsp;·&nbsp;&nbsp;Payment Mode: {invoice.paymentMode}&nbsp;&nbsp;·&nbsp;&nbsp;Thank you for your business!
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    {/* UID Verification Strip */}
                    {invoice.invoiceUid && (
                        <div style={{ marginTop: '0.4rem', padding: '0.2rem 0.5rem', backgroundColor: '#f9f9f9', border: '1px dashed #bbb', borderRadius: '2px', textAlign: 'center' }}>
                            <span style={{ fontSize: '0.62rem', color: '#888', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                                VERIFICATION ID: {invoice.invoiceUid} &nbsp;···&nbsp; This number is recorded in Shreejee Enterprises’ system. Any invoice without a valid ID is a forgery.
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
