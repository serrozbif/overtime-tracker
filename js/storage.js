const Storage = {
    KEYS: { RECORDS: 'ot_records', SETTINGS: 'ot_settings' },

    getSettings() {
        const defaults = {
            initialBalance: 484,
            googleClientId: '',
            googleSpreadsheetId: '',
            googleAccessToken: '',
            googleTokenExpiry: null
        };
        try {
            return { ...defaults, ...JSON.parse(localStorage.getItem(this.KEYS.SETTINGS) || '{}') };
        } catch { return defaults; }
    },

    saveSettings(s) {
        localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(s));
    },

    getRecords() {
        try { return JSON.parse(localStorage.getItem(this.KEYS.RECORDS) || '[]'); }
        catch { return []; }
    },

    saveRecord(record) {
        const records = this.getRecords();
        const idx = records.findIndex(r => r.date === record.date);
        if (idx >= 0) {
            records[idx] = { ...records[idx], ...record, synced: false };
        } else {
            records.push({ ...record, id: Date.now().toString(), synced: false });
        }
        records.sort((a, b) => b.date.localeCompare(a.date));
        localStorage.setItem(this.KEYS.RECORDS, JSON.stringify(records));
        return records;
    },

    deleteRecord(date) {
        const records = this.getRecords().filter(r => r.date !== date);
        localStorage.setItem(this.KEYS.RECORDS, JSON.stringify(records));
        return records;
    },

    markSynced(date) {
        const records = this.getRecords();
        const idx = records.findIndex(r => r.date === date);
        if (idx >= 0) records[idx].synced = true;
        localStorage.setItem(this.KEYS.RECORDS, JSON.stringify(records));
    },

    getStats() {
        const settings = this.getSettings();
        const records = this.getRecords();
        const totalFromRecords = records.reduce((s, r) => s + (r.overtimeMinutes || 0), 0);
        const total = settings.initialBalance + totalFromRecords;

        const now = new Date();
        const dow = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
        const monStr = monday.toISOString().split('T')[0];
        const todayStr = now.toISOString().split('T')[0];
        const monthStr = todayStr.substring(0, 7);

        const week = records
            .filter(r => r.date >= monStr && r.date <= todayStr)
            .reduce((s, r) => s + (r.overtimeMinutes || 0), 0);

        const month = records
            .filter(r => r.date.startsWith(monthStr))
            .reduce((s, r) => s + (r.overtimeMinutes || 0), 0);

        return { total, week, month, count: records.length };
    },

    runningBalance(records, initialBalance) {
        const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
        let bal = initialBalance;
        const balMap = {};
        sorted.forEach(r => {
            bal += r.overtimeMinutes || 0;
            balMap[r.date] = bal;
        });
        return balMap;
    }
};
