import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "ur" | "en";

const dict = {
  appName: ["میاں نواز برکس", "Mian Nawaz Bricks"],
  dashboard: ["ڈیش بورڈ", "Dashboard"],
  seasons: ["سیزن", "Seasons"],
  qualities: ["کوالٹیز", "Qualities"],
  patheer: ["پتھیر", "Patheer"],
  weekly: ["ہفتہ وار رجسٹر", "Weekly register"],
  signOut: ["لاگ آؤٹ", "Sign out"],
  signIn: ["لاگ ان", "Sign in"],
  signUp: ["نیا اکاؤنٹ", "Create account"],
  email: ["ای میل", "Email"],
  password: ["پاس ورڈ", "Password"],
  fullName: ["پورا نام", "Full name"],
  save: ["محفوظ کریں", "Save"],
  cancel: ["منسوخ", "Cancel"],
  add: ["شامل کریں", "Add"],
  name: ["نام", "Name"],
  phone: ["فون", "Phone"],
  type: ["قسم", "Type"],
  start: ["شروع", "Start"],
  end: ["اختتام", "End"],
  closed: ["بند", "Closed"],
  open: ["کھلا", "Open"],
  close: ["بند کریں", "Close"],
  reopen: ["دوبارہ کھولیں", "Reopen"],
  weeks: ["ہفتے", "Weeks"],
  week: ["ہفتہ", "Week"],
  season: ["سیزن", "Season"],
  active: ["فعال", "Active"],
  inactive: ["غیر فعال", "Inactive"],
  category: ["زمرہ", "Category"],
  kindSale: ["فروخت / اسٹاک", "Sales / stock"],
  kindNakasi: ["نکاسی", "Nakasi"],
  rate: ["ریٹ فی ہزار", "Rate / 1000"],
  kharchaRate: ["خرچہ ریٹ فی ہزار", "Kharcha rate / 1000"],
  effectiveFrom: ["تاریخ سے لاگو", "Effective from"],
  opening: ["سابقہ بقایا", "Opening balance"],
  openingHelp: ["مثبت = ہم نے دینا ہے، منفی = پیشگی (اس نے دینا ہے)", "Positive = we owe him, negative = advance (he owes us)"],
  estimated: ["اندازہ", "Estimated"],
  confirmed: ["پکی گنتی", "Confirmed"],
  pending: ["باقی", "Pending"],
  total: ["کل", "Total"],
  mizanKham: ["میزان خام", "Raw total"],
  amount: ["رقم", "Amount"],
  earnings: ["کمائی", "Earnings"],
  kharcha: ["خرچہ", "Kharcha"],
  giveKharcha: ["خرچہ دیں", "Give kharcha"],
  balance: ["بقایا", "Balance"],
  weOwe: ["ہم نے دینا ہے", "We owe him"],
  heOwes: ["اس نے دینا ہے", "He owes us"],
  settled: ["حساب برابر", "Settled"],
  paidBy: ["کس نے دیا", "Paid by"],
  receivedBy: ["کس نے وصول کیا", "Received by"],
  method: ["طریقہ", "Method"],
  note: ["نوٹ", "Note"],
  date: ["تاریخ", "Date"],
  ledger: ["کھاتہ", "Ledger"],
  settlement: ["سیزن کا حساب", "Season settlement"],
  print: ["پرنٹ", "Print"],
  payHim: ["ہم ادائیگی کریں", "We pay him"],
  hePays: ["وہ ادائیگی کرے", "He pays us"],
  deduction: ["کٹوتی", "Deduction"],
  remove: ["منسوخ کریں", "Void"],
  confirmAction: ["کیا آپ کو یقین ہے؟", "Are you sure?"],
  balanceChange: ["اس سے بقایا بدل جائے گا۔", "This changes the balance."],
  noAccess: ["آپ کو رسائی نہیں ہے", "You don't have access"],
  noAccessHelp: ["صرف دو مالکان کو رسائی ہے۔", "Only the two owners have access."],
  checkEmail: ["تصدیق کے لیے اپنی ای میل دیکھیں", "Check your email to confirm your account"],
  noSeason: ["پہلے سیزن بنائیں", "Create a season first"],
  bricks: ["اینٹیں", "bricks"],
  saving: ["محفوظ ہو رہا ہے…", "Saving…"],
  unsaved: ["غیر محفوظ — دوبارہ کوشش", "Unsaved — retrying"],
  allSaved: ["سب محفوظ", "All saved"],
  thisWeek: ["اس ہفتے", "This week"],
  totalOwedWorkers: ["پتھیروں کا کل بقایا (ہم نے دینا)", "Total we owe patheer"],
  totalOwedUs: ["پتھیروں سے لینا", "Patheer owe us"],
  rates: ["ریٹ", "Rates"],
  history: ["تبدیلیوں کا ریکارڈ", "Edit history"],
  search: ["نام سے تلاش", "Search by name"],
  simple: ["سادہ اینٹ", "Simple brick"],
  tile9t: ["9T ٹائل", "9T tile"],
  specialBrick: ["اسپیشل اینٹ", "Special brick"],
  generateWeeks: ["ہفتے بنائیں", "Generate weeks"],
  diff: ["فرق", "Difference"],
} as const;

export type Key = keyof typeof dict;
const days: Record<Lang, string[]> = {
  ur: ["جمعرات", "جمعہ", "ہفتہ", "اتوار", "پیر", "منگل", "بدھ"],
  en: ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"],
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string; days: string[] };
const I18n = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ur");
  useEffect(() => {
    const saved = localStorage.getItem("mnb-lang");
    if (saved === "en" || saved === "ur") setLangState(saved);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ur" ? "rtl" : "ltr";
  }, [lang]);
  const setLang = (l: Lang) => {
    localStorage.setItem("mnb-lang", l);
    setLangState(l);
  };
  const t = (k: Key) => dict[k][lang === "ur" ? 0 : 1];
  return <I18n.Provider value={{ lang, setLang, t, days: days[lang] }}>{children}</I18n.Provider>;
}

export function useT() {
  const c = useContext(I18n);
  if (!c) throw new Error("I18nProvider missing");
  return c;
}

/** Whole rupees / bricks with thousands separators, English numerals. */
export function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-PK");
}
