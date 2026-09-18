/* =========================
   date-range.js（日付範囲ユーティリティ）
   ========================= */

(() => {
    function parseIsoDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
        const date = new Date(`${value}T00:00:00Z`);
        if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
        return date;
    }

    function enumerateDateRange(startDate, endDate) {
        const start = parseIsoDate(startDate);
        const end = parseIsoDate(endDate);
        if (!start || !end || end < start) return [];

        const dates = [];
        for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
            dates.push(cursor.toISOString().slice(0, 10));
        }
        return dates;
    }

    window.App = window.App || {};
    window.App.enumerateDateRange = enumerateDateRange;
})();
