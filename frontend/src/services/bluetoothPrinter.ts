/**
 * Shreejee Trading — Bluetooth Thermal Printer Service
 * ──────────────────────────────────────────────────────
 * Uses Web Bluetooth API + ESC/POS commands to print receipts
 * on standard 58mm/80mm USB-BT thermal printers (e.g. Xprinter, GOOJPRT, Rongta).
 *
 * Browser support: Chrome / Edge on Android & Desktop (requires HTTPS or localhost).
 * Not supported on Firefox or Safari.
 */

// ESC/POS standard command bytes
const ESC = 0x1b;
const GS = 0x1d;

const CMD = {
    init: [ESC, 0x40],                    // Initialise printer
    alignLeft: [ESC, 0x61, 0x00],
    alignCenter: [ESC, 0x61, 0x01],
    alignRight: [ESC, 0x61, 0x02],
    bold_on: [ESC, 0x45, 0x01],
    bold_off: [ESC, 0x45, 0x00],
    doubleH_on: [GS, 0x21, 0x11],              // Double height + width
    doubleH_off: [GS, 0x21, 0x00],
    feed: (n: number) => [ESC, 0x64, n],  // Feed n lines
    cut: [GS, 0x56, 0x42, 0x00],        // Full cut
    dashedLine: '-'.repeat(32) + '\n',
};

function encodeText(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

function buildBytes(...parts: (number[] | Uint8Array | string)[]): Uint8Array {
    const arrays = parts.map(p => {
        if (typeof p === 'string') return encodeText(p);
        if (Array.isArray(p)) return new Uint8Array(p);
        return p;
    });
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    arrays.forEach(a => { out.set(a, offset); offset += a.length; });
    return out;
}

/** Pads or truncates a string to exactly `len` characters */
function pad(str: string, len: number, right = false): string {
    const s = String(str ?? '').slice(0, len);
    return right ? s.padStart(len, ' ') : s.padEnd(len, ' ');
}

/** 32-char wide two-column row  e.g. "CGST         ₹120.00" */
function row(left: string, right: string, width = 32): string {
    const l = pad(left, width - right.length - 1);
    return `${l} ${right}\n`;
}

// ── Web Bluetooth connection ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _device: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _characteristic: any = null;

// Standard BT printer GATT UUIDs (works with most ESC/POS BT printers)
const PRINTER_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const PRINTER_CHAR_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

export async function connectPrinter(): Promise<string> {
    if (!(navigator as any).bluetooth) {
        throw new Error('Web Bluetooth is not supported in this browser. Please use Chrome on Android or Desktop.');
    }
    _device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: [PRINTER_SERVICE_UUID] }],
        optionalServices: [PRINTER_SERVICE_UUID],
    });
    const server = await _device.gatt!.connect();
    const service = await server.getPrimaryService(PRINTER_SERVICE_UUID);
    _characteristic = await service.getCharacteristic(PRINTER_CHAR_UUID);
    return _device.name ?? 'Bluetooth Printer';
}

export function isPrinterConnected(): boolean {
    return !!(_device?.gatt?.connected && _characteristic);
}

export async function disconnectPrinter() {
    _device?.gatt?.disconnect();
    _device = null;
    _characteristic = null;
}

/** Sends raw bytes to the printer in chunks (BT MTU ≈ 512 bytes) */
async function sendBytes(data: Uint8Array) {
    if (!_characteristic) throw new Error('Printer not connected. Please connect first.');
    const CHUNK = 512;
    for (let i = 0; i < data.length; i += CHUNK) {
        await _characteristic.writeValueWithoutResponse(data.slice(i, i + CHUNK));
        await new Promise(r => setTimeout(r, 20)); // small delay between chunks
    }
}

// ── Print functions ─────────────────────────────────────────────────────────

export interface PrintInvoiceData {
    invoiceNo: string;
    invoiceDate: string;
    customerName: string;
    orderType: string;
    paymentMode: string;
    items: { name: string; bags: string; weight: string; rate: string; amount: number; taxAmount: number }[];
    subTotal: number;
    cgst: number;
    sgst: number;
    grandTotal: number;
    payStatus: string;
    payRef?: string;
    payDate?: string;
}

export async function printInvoice(data: PrintInvoiceData) {
    const bytes = buildBytes(
        CMD.init,

        // Header
        CMD.alignCenter,
        CMD.bold_on,
        CMD.doubleH_on,
        'SHREEJEE TRADING\n',
        CMD.doubleH_off,
        CMD.bold_off,
        'Plastic Raw Material Traders\n',
        CMD.dashedLine,

        // Invoice meta
        CMD.alignLeft,
        `Invoice : ${data.invoiceNo}\n`,
        `Date    : ${data.invoiceDate}\n`,
        `Customer: ${data.customerName}\n`,
        `Order   : ${data.orderType || '-'}\n`,
        `Payment : ${data.paymentMode}\n`,
        CMD.dashedLine,

        // Items
        CMD.bold_on,
        `${'Material'.padEnd(16)}${'KG'.padEnd(7)}${'Rate'.padEnd(6)}Amt\n`,
        CMD.bold_off,
        CMD.dashedLine,

        ...data.items.map(item =>
            `${pad(item.name, 16)}${pad(item.weight, 7)}${pad(item.rate, 6)}${(item.amount + item.taxAmount).toFixed(0)}\n`
        ),

        CMD.dashedLine,

        // Totals
        row('Subtotal', `Rs.${data.subTotal.toFixed(2)}`),
        row('CGST', `Rs.${data.cgst.toFixed(2)}`),
        row('SGST', `Rs.${data.sgst.toFixed(2)}`),
        CMD.dashedLine,
        CMD.bold_on,
        row('GRAND TOTAL', `Rs.${data.grandTotal.toFixed(2)}`),
        CMD.bold_off,
        CMD.dashedLine,

        // Payment status
        CMD.alignCenter,
        data.payStatus === 'Confirmed'
            ? `PAID${data.payDate ? ` on ${data.payDate}` : ''}\n${data.payRef ? `Ref: ${data.payRef}\n` : ''}`
            : 'PAYMENT PENDING\n',

        CMD.dashedLine,
        'Thank you for your business!\n',
        CMD.feed(4),
        CMD.cut,
    );

    await sendBytes(bytes);
}

export async function printTestPage() {
    const bytes = buildBytes(
        CMD.init,
        CMD.alignCenter,
        CMD.bold_on,
        CMD.doubleH_on,
        'SHREEJEE TRADING\n',
        CMD.doubleH_off,
        CMD.bold_off,
        'Printer Test OK ✓\n',
        CMD.feed(3),
        CMD.cut,
    );
    await sendBytes(bytes);
}
