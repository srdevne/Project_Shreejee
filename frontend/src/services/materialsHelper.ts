
/**
 * Converts a 0-based column index to Excel/Google Sheets column letters (e.g., 0 -> A, 25 -> Z, 26 -> AA).
 */
export const getColumnLetter = (colIndex: number): string => {
    let temp = colIndex;
    let letter = '';
    while (temp >= 0) {
        letter = String.fromCharCode((temp % 26) + 65) + letter;
        temp = Math.floor(temp / 26) - 1;
    }
    return letter;
};

/**
 * Parses and formats inventory stock based on the "1 bag = 25 KG" rule.
 * Returns a human-readable string like "4 bags + 23.5 KG" or "10 KG".
 */
export const formatBagInventory = (stockKg: number): string => {
    if (stockKg <= 0) return 'Out of Stock';
    const bags = Math.floor(stockKg / 25);
    const looseKg = stockKg % 25;

    const parts: string[] = [];
    if (bags > 0) {
        parts.push(`${bags} bag${bags > 1 ? 's' : ''}`);
    }
    if (looseKg > 0 || bags === 0) {
        parts.push(`${looseKg.toFixed(1).replace(/\.0$/, '')} KG`);
    }
    return parts.join(' + ');
};

/**
 * Returns the price for a specific month, or the latest available monthly selling price,
 * falling back to the base selling rate.
 */
export const getSellingPriceForMonth = (
    materialRow: any[],
    headers: string[],
    targetMonth?: string // YYYY-MM format
): number => {
    // Standard columns: 0: ID, 1: Name, 2: Desc, 3: OpenBags, 4: OpenKG, 5: Tax, 6: Purchase, 7: Selling, 8: HSN, 9: LiveKg, 10: LiveBags
    // Monthly columns start at index 11 (Column L)
    const baseSellingPrice = parseFloat(materialRow[7] || '0');

    // If a specific target month is requested, look for it first
    if (targetMonth) {
        const colIdx = headers.findIndex(h => h === targetMonth);
        if (colIdx >= 11 && materialRow[colIdx]) {
            const price = parseFloat(materialRow[colIdx]);
            if (price > 0) return price;
        }
    }

    // Find the latest monthly price available
    let latestMonth = '';
    let latestPrice = 0;

    for (let i = 11; i < headers.length; i++) {
        const header = headers[i];
        if (header && /^\d{4}-\d{2}$/.test(header)) {
            const price = parseFloat(materialRow[i] || '0');
            if (price > 0) {
                if (!latestMonth || header > latestMonth) {
                    latestMonth = header;
                    latestPrice = price;
                }
            }
        }
    }

    return latestPrice > 0 ? latestPrice : baseSellingPrice;
};

/**
 * Calculates the latest buy price for all materials based on the Purchases history.
 */
export const getLatestBuyPrices = (
    purchases: any[],
    purchaseItems: any[]
): Record<string, number> => {
    const purchaseDateMap: Record<string, string> = {};
    purchases.forEach(p => {
        if (p[0] && p[2]) {
            purchaseDateMap[p[0]] = p[2]; // purchaseId -> date
        }
    });

    const latestPriceMap: Record<string, { date: string; rate: number }> = {};
    purchaseItems.forEach(item => {
        const purchaseId = item[1];
        const materialId = item[2];
        const rate = parseFloat(item[6] || '0');
        const date = purchaseDateMap[purchaseId] || '';

        if (materialId && rate > 0 && date) {
            const existing = latestPriceMap[materialId];
            if (!existing || date > existing.date) {
                latestPriceMap[materialId] = { date, rate };
            }
        }
    });

    const result: Record<string, number> = {};
    Object.keys(latestPriceMap).forEach(matId => {
        result[matId] = latestPriceMap[matId].rate;
    });
    return result;
};
