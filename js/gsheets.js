/**
 * Google Sheets API integration via OAuth 2.0 (Google Identity Services)
 * User must provide: Client ID + Spreadsheet ID in Settings
 */
const GSheets = {
    SCOPE: 'https://www.googleapis.com/auth/spreadsheets',
    SHEET_NAME: 'НадгодиниТрекер',
    tokenClient: null,

    isConfigured() {
        const s = Storage.getSettings();
        return !!(s.googleClientId && s.googleSpreadsheetId);
    },

    isTokenValid() {
        const s = Storage.getSettings();
        return !!(s.googleAccessToken && s.googleTokenExpiry && Date.now() < s.googleTokenExpiry);
    },

    getToken() {
        return Storage.getSettings().googleAccessToken;
    },

    initTokenClient(callback) {
        const { googleClientId } = Storage.getSettings();
        if (!googleClientId) { App.showToast('Вкажіть Client ID у налаштуваннях', 'error'); return; }

        if (!window.google) { App.showToast('Google Identity Services не завантажено', 'error'); return; }

        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: googleClientId,
            scope: this.SCOPE,
            callback: (resp) => {
                if (resp.error) { App.showToast('Помилка авторизації: ' + resp.error, 'error'); return; }
                const settings = Storage.getSettings();
                settings.googleAccessToken = resp.access_token;
                settings.googleTokenExpiry = Date.now() + (resp.expires_in - 60) * 1000;
                Storage.saveSettings(settings);
                App.updateSyncStatus('connected');
                if (callback) callback();
            }
        });
        this.tokenClient.requestAccessToken();
    },

    async ensureAuth(callback) {
        if (this.isTokenValid()) { callback(); return; }
        this.initTokenClient(callback);
    },

    async ensureSheetExists() {
        const { googleSpreadsheetId } = Storage.getSettings();
        const token = this.getToken();
        // Get sheet list
        const resp = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${googleSpreadsheetId}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await resp.json();
        const sheets = data.sheets || [];
        const exists = sheets.some(s => s.properties.title === this.SHEET_NAME);

        if (!exists) {
            // Create sheet + headers
            await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${googleSpreadsheetId}:batchUpdate`,
                {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: this.SHEET_NAME } } }] })
                }
            );
            // Write headers
            await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${googleSpreadsheetId}/values/${this.SHEET_NAME}!A1:G1?valueInputOption=USER_ENTERED`,
                {
                    method: 'PUT',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ values: [['Дата', 'Прихід', 'Відхід', 'Хв (зміна)', 'Час (зміна)', 'Баланс (хв)', 'Баланс (г:хв)']] })
                }
            );
        }
    },

    async syncAll() {
        if (!this.isConfigured()) {
            App.showToast('Налаштуйте Google Sheets у налаштуваннях', 'warning');
            return;
        }

        await this.ensureAuth(async () => {
            try {
                App.showToast('Синхронізація...', 'info');
                await this.ensureSheetExists();

                const records = Storage.getRecords();
                const settings = Storage.getSettings();
                const balMap = Storage.runningBalance(records, settings.initialBalance);

                // Build rows (sorted by date ascending)
                const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
                const rows = sorted.map(r => {
                    const bal = balMap[r.date] || 0;
                    return [
                        r.date,
                        r.arrival,
                        r.departure,
                        r.overtimeMinutes,
                        OvertimeCalc.formatDelta(r.overtimeMinutes),
                        bal,
                        OvertimeCalc.formatBalance(bal)
                    ];
                });

                const { googleSpreadsheetId } = settings;
                const token = this.getToken();
                const range = `${this.SHEET_NAME}!A2:G${rows.length + 1}`;

                // Clear and rewrite
                await fetch(
                    `https://sheets.googleapis.com/v4/spreadsheets/${googleSpreadsheetId}/values/${this.SHEET_NAME}!A2:Z1000:clear`,
                    { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
                );

                if (rows.length > 0) {
                    await fetch(
                        `https://sheets.googleapis.com/v4/spreadsheets/${googleSpreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
                        {
                            method: 'PUT',
                            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ values: rows })
                        }
                    );
                }

                records.forEach(r => Storage.markSynced(r.date));
                App.showToast(`Синхронізовано ${rows.length} записів ✓`, 'success');
                App.renderRecords();
            } catch (e) {
                App.showToast('Помилка синхронізації: ' + e.message, 'error');
            }
        });
    }
};
