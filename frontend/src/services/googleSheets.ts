interface SheetResponse {
    range: string;
    majorDimension: string;
    values: string[][];
}

const getHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
});

const SPREADSHEET_ID = import.meta.env.VITE_GOOGLE_SHEET_ID;

export const fetchSheetData = async (
    accessToken: string,
    range: string
): Promise<string[][]> => {
    if (!SPREADSHEET_ID) throw new Error('Spreadsheet ID missing in environment variables');

    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}`,
        {
            headers: getHeaders(accessToken),
        }
    );

    if (!response.ok) {
        if (response.status === 401) {
            window.dispatchEvent(new Event('auth-expired'));
            throw new Error('UNAUTHORIZED');
        }
        throw new Error(`Failed to fetch data from sheet: ${response.statusText}`);
    }

    const data: SheetResponse = await response.json();
    return data.values || [];
};

export const fetchConfig = async (accessToken: string) => {
    const values = await fetchSheetData(accessToken, 'Config!A2:B');
    const config: Record<string, string> = {};
    values.forEach(row => {
        if (row.length >= 2) {
            config[row[0]] = row[1];
        }
    });
    return config;
};

export const appendRow = async (
    accessToken: string,
    range: string,
    values: any[][]
): Promise<boolean> => {
    if (!SPREADSHEET_ID) throw new Error('Spreadsheet ID missing in environment variables');

    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED`,
        {
            method: 'POST',
            headers: getHeaders(accessToken),
            body: JSON.stringify({ values }),
        }
    );

    if (!response.ok) {
        if (response.status === 401) {
            window.dispatchEvent(new Event('auth-expired'));
            throw new Error('UNAUTHORIZED');
        }
        console.error('Failed to append row', await response.text());
        return false;
    }
    return true;
};

export const updateRow = async (
    accessToken: string,
    range: string,
    values: any[][]
): Promise<boolean> => {
    if (!SPREADSHEET_ID) throw new Error('Spreadsheet ID missing in environment variables');

    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`,
        {
            method: 'PUT',
            headers: getHeaders(accessToken),
            body: JSON.stringify({ values }),
        }
    );

    if (!response.ok) {
        if (response.status === 401) {
            window.dispatchEvent(new Event('auth-expired'));
            throw new Error('UNAUTHORIZED');
        }
        console.error('Failed to update row', await response.text());
        return false;
    }
    return true;
};
/**
 * Returns the next serial invoice number in format INV-XXXXX
 * Reads all existing invoice numbers from Sales!A2:A and increments the max.
 */
export const getNextInvoiceNumber = async (accessToken: string): Promise<string> => {
    try {
        const rows = await fetchSheetData(accessToken, 'Sales!A2:A');
        let max = 0;
        rows.forEach(row => {
            const match = row[0]?.match(/INV-(\d+)/);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > max) max = num;
            }
        });
        const next = String(max + 1).padStart(5, '0');
        return `INV-${next}`;
    } catch {
        return `INV-${String(Date.now()).slice(-5)}`;
    }
};

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

/**
 * Uploads a File (photo) to Google Drive and returns its view URL.
 * The file is placed in the drive root and made readable by link.
 */
export const uploadFileToDrive = async (
    accessToken: string,
    file: File,
    fileName: string
): Promise<string> => {
    const metadata = { name: fileName, mimeType: file.type };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const uploadRes = await fetch(DRIVE_UPLOAD_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
    });
    if (!uploadRes.ok) throw new Error('Drive upload failed');
    const { id } = await uploadRes.json();

    // Make publicly readable by link
    await fetch(`https://www.googleapis.com/drive/v3/files/${id}/permissions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    return `https://drive.google.com/file/d/${id}/view`;
};
