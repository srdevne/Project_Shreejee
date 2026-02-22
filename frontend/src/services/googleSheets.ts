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
