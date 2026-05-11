/**
 * Overtime calculation business logic
 * Rules:
 * - Arrival <= 07:30 → morning bonus = 08:00 - arrival
 * - 07:30 < Arrival <= 08:00 → morning bonus = 0
 * - Arrival > 08:00 → morning penalty = 08:00 - arrival (negative)
 * - Departure > 16:20 → evening bonus = departure - 16:20
 * - Departure < 16:20 → evening penalty = departure - 16:20 (negative)
 */
const OvertimeCalc = {
    EARLY_THRESHOLD: 7 * 60 + 30, // 7:30
    WORK_START: 8 * 60,           // 8:00
    WORK_END: 16 * 60 + 20,       // 16:20

    timeToMinutes(timeStr) {
        if (!timeStr) return null;
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    },

    minutesToHHMM(mins) {
        const abs = Math.abs(mins);
        const h = Math.floor(abs / 60);
        const m = abs % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },

    calculate(arrivalStr, departureStr) {
        const arr = this.timeToMinutes(arrivalStr);
        const dep = this.timeToMinutes(departureStr);
        if (arr === null || dep === null) return { morning: 0, evening: 0, total: 0 };

        let morning = 0;
        if (arr <= this.EARLY_THRESHOLD) {
            morning = this.WORK_START - arr; // positive
        } else if (arr > this.WORK_START) {
            morning = this.WORK_START - arr; // negative
        }

        const evening = dep - this.WORK_END;
        return { morning, evening, total: morning + evening };
    },

    formatDelta(mins) {
        if (mins === 0) return '0:00';
        const sign = mins > 0 ? '+' : '−';
        return `${sign}${this.minutesToHHMM(mins)}`;
    },

    formatBalance(mins) {
        if (mins === 0) return '0:00';
        const sign = mins < 0 ? '−' : '';
        return `${sign}${this.minutesToHHMM(mins)}`;
    },

    isWeekend(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        return d.getDay() === 0 || d.getDay() === 6;
    },

    todayStr() {
        return new Date().toISOString().split('T')[0];
    },

    formatDate(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('uk-UA', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
    }
};
