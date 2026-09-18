/**
 * ============================================================
 * Calendar.js — Real-world clock + real astronomical seasons
 * ============================================================
 * قرار المنتج المقفل (Brief §0.3 / §0.4):
 *   • الساعة = وقت الجهاز الحقيقي. ثانية بثانية، دقيقة بدقيقة،
 *     ويوم = يوم تقويمي واحد.
 *   • الفصول تتبع فلك النصف الشمالي / مصر:
 *       صيف حتى الاعتدال الخريفي (23 سبتمبر 2026)
 *       ← خريف حتى الانقلاب الشتوي
 *       ← شتاء حتى الاعتدال الربيعي
 *       ← ربيع حتى الانقلاب الصيفي
 *
 * هذه الوحدة نقية (لا THREE ولا DOM ولا GameState) حتى يمكن
 * اختبارها في Node مباشرة — انظر tests/smoke.mjs.
 * ============================================================
 */

/* ============================================================
   THAWNAMES — أسماء عربية/إنجليزية ثابتة
   ============================================================ */

export const SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);

export const SEASON_LABELS = Object.freeze({
    spring: { ar: 'الربيع', en: 'Spring', icon: '🌸' },
    summer: { ar: 'الصيف',  en: 'Summer', icon: '☀️' },
    autumn: { ar: 'الخريف', en: 'Autumn', icon: '🍂' },
    winter: { ar: 'الشتاء', en: 'Winter', icon: '❄️' }
});

export const MONTHS_AR = Object.freeze([
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
]);

export const MONTHS_EN = Object.freeze([
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]);

export const WEEKDAYS_AR = Object.freeze([
    'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'
]);

export const WEEKDAYS_EN = Object.freeze([
    'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'
]);

/* ============================================================
   SOLAR TERMS — الاعتدالات والانقلابات
   ------------------------------------------------------------
   جدول موثّق 2024–2032 (تواريخ فلكية بالتوقيت المحلي التقريبي)،
   ومعادلة تقريبية لما خارج الجدول حتى لا يفشل أي تاريخ.
   الشكل: [اعتدال مارس، انقلاب يونيو، اعتدال سبتمبر، انقلاب ديسمبر]
   ============================================================ */

const SOLAR_TERMS = Object.freeze({
    2024: [[3, 20], [6, 20], [9, 22], [12, 21]],
    2025: [[3, 20], [6, 21], [9, 22], [12, 21]],
    2026: [[3, 20], [6, 21], [9, 23], [12, 21]],
    2027: [[3, 20], [6, 21], [9, 23], [12, 22]],
    2028: [[3, 19], [6, 20], [9, 22], [12, 21]],
    2029: [[3, 20], [6, 21], [9, 22], [12, 21]],
    2030: [[3, 20], [6, 21], [9, 23], [12, 21]],
    2031: [[3, 20], [6, 21], [9, 23], [12, 22]],
    2032: [[3, 19], [6, 20], [9, 22], [12, 21]]
});

/** ثوابت المعادلة التقريبية للقرن الحادي والعشرين (يوم من الشهر). */
const TERM_APPROX = Object.freeze({
    march: 20.646,
    june: 21.37,
    september: 22.83,
    december: 21.45
});

function approxTermDay(year, base) {
    const y = year - 2000;
    const leap = Math.floor((year - 2001) / 4);
    const day = Math.floor(y * 0.2422 + base) - leap;
    return Math.min(28, Math.max(19, day));
}

/**
 * تواريخ الفصول الأربعة لسنة معينة (شهر 0-أساسي + يوم).
 * @returns {{spring:Array, summer:Array, autumn:Array, winter:Array}}
 */
export function getSolarTerms(year) {
    const y = Number.isFinite(year) ? Math.floor(year) : new Date().getFullYear();
    const row = SOLAR_TERMS[y];

    // الشهور هنا 1-أساسية (كما في الجدول) — تُحوَّل عند المقارنة.
    const march = row ? row[0] : [3, approxTermDay(y, TERM_APPROX.march)];
    const june = row ? row[1] : [6, approxTermDay(y, TERM_APPROX.june)];
    const september = row ? row[2] : [9, approxTermDay(y, TERM_APPROX.september)];
    const december = row ? row[3] : [12, approxTermDay(y, TERM_APPROX.december)];

    return { spring: march, summer: june, autumn: september, winter: december };
}

/**
 * الموسم الفلكي الحقيقي لتاريخ معيّن (نصف شمالي).
 * @param {Date|number} [when]
 * @returns {'spring'|'summer'|'autumn'|'winter'}
 */
export function getSeasonForDate(when = new Date()) {
    const date = when instanceof Date ? when : new Date(when);
    if (Number.isNaN(date.getTime())) return 'summer';

    const year = date.getFullYear();
    const terms = getSolarTerms(year);
    /*
     * مفتاح قابل للمقارنة: شهر*100 + يوم.
     * انتبه: getMonth() صفر-أساسي بينما جدول الفصول 1-أساسي، لذلك
     * نوحّد الطرفين على الشهر الحقيقي (1..12) — بدون هذا كان
     * 23 سبتمبر يُقرأ صيفًا و21 ديسمبر خريفًا.
     */
    const key = (date.getMonth() + 1) * 100 + date.getDate();
    const of = (md) => md[0] * 100 + md[1];

    if (key < of(terms.spring)) return 'winter';
    if (key < of(terms.summer)) return 'spring';
    if (key < of(terms.autumn)) return 'summer';
    if (key < of(terms.winter)) return 'autumn';
    return 'winter';
}

/* ============================================================
   DAY PHASES — طور النهار من الساعة الحقيقية
   ============================================================ */

/** حدود الأطوار (ساعات عشرية). شروق/غروب تقريبي ثابت لمصر. */
export const DAY_PHASES = Object.freeze({
    DAWN_START: 4.5,
    SUNRISE: 6.0,
    SUNSET: 18.5,
    DUSK_END: 20.0
});

/**
 * @param {number} hourFloat ساعة عشرية (0..24)
 * @returns {'night'|'dawn'|'day'|'dusk'}
 */
export function getDayPhase(hourFloat) {
    const h = Number.isFinite(hourFloat) ? ((hourFloat % 24) + 24) % 24 : 12;
    if (h < DAY_PHASES.DAWN_START) return 'night';
    if (h < DAY_PHASES.SUNRISE) return 'dawn';
    if (h < DAY_PHASES.SUNSET) return 'day';
    if (h < DAY_PHASES.DUSK_END) return 'dusk';
    return 'night';
}

/** 0 (ليل) .. 1 (ظهر) — ارتفاع الشمس التقريبي، تُستخدم للضوء/السماء. */
export function getSunFactor(hourFloat) {
    const h = Number.isFinite(hourFloat) ? ((hourFloat % 24) + 24) % 24 : 12;
    const elevation = Math.sin(((h - DAY_PHASES.SUNRISE) / (DAY_PHASES.SUNSET - DAY_PHASES.SUNRISE)) * Math.PI);
    return Math.min(1, Math.max(0, (elevation + 0.06) / 0.62));
}

/** رمز الطقس/الوقت للـ HUD. */
export function getPhaseIcon(hourFloat, season = 'summer') {
    const phase = getDayPhase(hourFloat);
    if (phase === 'dawn') return '🌅';
    if (phase === 'dusk') return '🌇';
    if (phase === 'night') return '🌙';
    if (season === 'winter') return '🌨️';
    if (season === 'autumn') return '🌤️';
    return '☀️';
}

/* ============================================================
   FORMATTERS — ثنائية اللغة (عربي أساسي + إنجليزي مختصر)
   ============================================================ */

const pad2 = (n) => String(n).padStart(2, '0');

/** "08:05 ص" — 12 ساعة مع ص/م. */
export function formatClockLabel(hours, minutes) {
    const h = Math.floor(Number(hours) || 0) % 24;
    const m = Math.floor(Number(minutes) || 0) % 60;
    const suffix = h < 12 ? 'ص' : 'م';
    const h12 = ((h + 11) % 12) + 1;
    return `${pad2(h12)}:${pad2(m)} ${suffix}`;
}

/** "الجمعة 18 سبتمبر 2026" */
export function formatDateLabel(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const wd = WEEKDAYS_AR[d.getDay()];
    return `${wd} ${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Fri 18 Sep" — السطر الإنجليزي المختصر تحت التاريخ. */
export function formatDateLabelEn(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return `${WEEKDAYS_EN[d.getDay()]} ${d.getDate()} ${MONTHS_EN[d.getMonth()]}`;
}

/** "2026-09-18" — مفتاح اليوم التقويمي (لكشف تغيّر اليوم). */
export function getDateKey(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** نسبة اليوم المنقضية 0..1 (منتصف الليل ← منتصف الليل). */
export function getDayProgress(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return 0;
    return (
        d.getHours() * 3600 +
        d.getMinutes() * 60 +
        d.getSeconds()
    ) / 86400;
}

/**
 * لقطة كاملة للساعة الحقيقية — العقد الذي يقرأه TimeManager/الـ HUD/الإضاءة.
 * @param {Date} [now]
 */
export function readRealClock(now = new Date()) {
    const d = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const seconds = d.getSeconds();
    const hourFloat = hours + minutes / 60 + seconds / 3600;
    const season = getSeasonForDate(d);

    return {
        hours,
        minutes,
        seconds,
        hourFloat,
        dayProgress: getDayProgress(d),
        phase: getDayPhase(hourFloat),
        sunFactor: getSunFactor(hourFloat),
        isDaytime: getDayPhase(hourFloat) === 'day' || getDayPhase(hourFloat) === 'dawn',
        season,
        seasonAr: SEASON_LABELS[season].ar,
        seasonEn: SEASON_LABELS[season].en,
        seasonIcon: SEASON_LABELS[season].icon,
        phaseIcon: getPhaseIcon(hourFloat, season),
        clockLabel: formatClockLabel(hours, minutes),
        dateLabel: formatDateLabel(d),
        dateLabelEn: formatDateLabelEn(d),
        dateKey: getDateKey(d),
        day: d.getDate(),
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        weekday: d.getDay(),
        timestamp: d.getTime()
    };
}

export default {
    SEASONS,
    SEASON_LABELS,
    getSeasonForDate,
    getSolarTerms,
    getDayPhase,
    getSunFactor,
    getPhaseIcon,
    formatClockLabel,
    formatDateLabel,
    formatDateLabelEn,
    getDateKey,
    getDayProgress,
    readRealClock
};
