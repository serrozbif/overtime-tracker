/**
 * File-based data sync: Export (JSON backup, CSV) and Import (JSON)
 */
const FileSync = {

    /* ── Export JSON backup ── */
    exportJSON() {
        const data = {
            version: 1,
            exportDate: new Date().toISOString(),
            settings: Storage.getSettings(),
            records: Storage.getRecords()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        this._download(blob, `overtime_backup_${this._dateStr()}.json`);
        App.showToast('Резервну копію збережено ✓', 'success');
    },

    /* ── Export CSV (Excel-compatible) ── */
    exportCSV() {
        const records = Storage.getRecords();
        const settings = Storage.getSettings();
        const balMap = Storage.runningBalance(records, settings.initialBalance);
        const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));

        const rows = [
            ['Дата', 'Прихід', 'Відхід', 'Зміна (хв)', 'Зміна (г:хв)', 'Баланс (хв)', 'Баланс (г:хв)'],
            ...sorted.map(r => {
                const bal = balMap[r.date] || 0;
                return [
                    r.date,
                    r.arrival || '',
                    r.departure || '',
                    r.overtimeMinutes || 0,
                    OvertimeCalc.formatDelta(r.overtimeMinutes || 0),
                    bal,
                    OvertimeCalc.formatBalance(bal)
                ];
            })
        ];

        const BOM = '\uFEFF'; // UTF-8 BOM for correct Excel encoding
        const csv = BOM + rows.map(row => row.join(';')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        this._download(blob, `overtime_${this._dateStr()}.csv`);
        App.showToast('CSV файл збережено ✓', 'success');
    },

    /* ── Import JSON backup ── */
    importJSON() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (!data.records || !Array.isArray(data.records)) {
                        App.showToast('Невірний формат файлу', 'error');
                        return;
                    }

                    const count = data.records.length;
                    const existing = Storage.getRecords().length;

                    // Ask merge or replace
                    let mode = 'merge';
                    if (existing > 0) {
                        const replace = confirm(
                            `У файлі ${count} записів.\n\nOK = Замінити всі існуючі записи\nСкасувати = Злити (нові + існуючі)`
                        );
                        mode = replace ? 'replace' : 'merge';
                    }

                    // Import settings (initial balance)
                    if (data.settings && data.settings.initialBalance !== undefined) {
                        const s = Storage.getSettings();
                        Storage.saveSettings({ ...s, initialBalance: data.settings.initialBalance });
                    }

                    // Import records
                    if (mode === 'replace') {
                        localStorage.setItem('ot_records', JSON.stringify(data.records));
                    } else {
                        data.records.forEach(r => Storage.saveRecord(r));
                    }

                    App.loadSettings();
                    App.refreshDashboard();
                    App.showToast(`Імпортовано ${count} записів ✓`, 'success');
                } catch (err) {
                    App.showToast('Помилка читання файлу: ' + err.message, 'error');
                }
            };
            reader.readAsText(file, 'utf-8');
        };
        input.click();
    },

    /* ── Helpers ── */
    _download(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    _dateStr() {
        return new Date().toISOString().split('T')[0];
    }
};
