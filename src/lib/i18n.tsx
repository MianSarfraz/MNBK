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
  // ---- Phase 2–4 ----
  rehra: ["رہڑا", "Rehra"],
  nakasi: ["نکاسی", "Nakasi"],
  rehraKhatta: ["رہڑا کھاتہ", "Rehra khatta"],
  nakasiKhatta: ["نکاسی کھاتہ", "Nakasi khatta"],
  rehraHelp: ["بھٹے میں کچی اینٹوں کی بھرائی — ہفتہ وار (جمعرات تا بدھ)", "Raw bricks loaded into the kiln — weekly (Thu–Wed)"],
  nakasiHelp: ["بھٹے سے پکی اینٹوں کی نکاسی، کوالٹی کے حساب سے", "Baked bricks taken out of the kiln, by quality"],
  weeklyHelp: ["پہلے اندازہ، اگلے دن پکی گنتی۔ کمائی صرف پکی گنتی پر۔", "Estimate on the day, exact count later. Earnings use confirmed counts only."],
  workersAndLedgers: ["کاریگر اور کھاتے", "Workers & ledgers"],
  loadedThisWeek: ["اس ہفتے بھرائی", "Loaded this week"],
  bakedThisWeek: ["اس ہفتے نکاسی", "Baked out this week"],
  madeThisWeek: ["اس ہفتے تیار (پکی گنتی)", "Made this week (confirmed)"],
  madeMinusLoaded: ["تیار − بھرائی", "Made − loaded"],
  multipleEntries: ["ایک سے زیادہ اندراج — نیچے فہرست میں تبدیل کریں", "Several entries — edit them in the list below"],
  missingRate: ["ریٹ درج نہیں", "Rate missing"],
  addWorkersFirst: ["پہلے کاریگر شامل کریں", "Add workers first"],
  entries: ["اندراجات", "Entries"],
  quality: ["کوالٹی", "Quality"],
  sourcePatheer: ["کس پتھیر کی", "Source patheer"],
  chooseWorker: ["کاریگر چنیں", "Choose a worker"],
  wholeNumbers: ["صرف پورے عدد", "Whole numbers only"],
  wholeRupees: ["صرف پورے روپے", "Whole rupees only"],
  bricksLoaded: ["بھرائی (اینٹیں)", "Bricks loaded"],
  optional: ["اختیاری", "optional"],
  saved: ["محفوظ ہو گیا", "Saved"],
  voided: ["منسوخ شدہ", "Voided"],
  added: ["نیا اندراج", "Added"],
  edited: ["تبدیلی", "Edited"],
  nothingYet: ["ابھی کچھ نہیں", "Nothing yet"],
  addNew: ["نیا شامل کریں", "Add new"],
  address: ["پتہ", "Address"],
  showInactive: ["غیر فعال بھی دکھائیں", "Show inactive"],
  details: ["تفصیل", "Details"],
  detail: ["تفصیل", "Details"],
  monthlySalary: ["ماہانہ تنخواہ", "Monthly salary"],
  whoOwes: ["کس نے دینا ہے", "Who owes"],
  weOweCustomer: ["ہم نے دینا ہے (ایڈوانس)", "We owe him (advance)"],
  customerOwes: ["اس نے دینا ہے", "He owes us"],
  employees: ["ملازمین", "Employees"],
  customers: ["گاہک", "Customers"],
  customer: ["گاہک", "Customer"],
  vendors: ["دکاندار / سپلائر", "Vendors"],
  vendor: ["سپلائر", "Vendor"],
  owner: ["مالک", "Owner"],
  period: ["مدت", "Period"],
  allTime: ["شروع سے اب تک", "All time"],
  month: ["مہینہ", "Month"],
  custom: ["اپنی تاریخیں", "Custom"],
  anyDayOfWeek: ["ہفتے کا کوئی دن", "Any day of the week"],
  from: ["سے", "From"],
  to: ["تک", "To"],
  statement: ["حساب کا گوشوارہ", "Statement"],
  statements: ["گوشوارے", "Statements"],
  openStatement: ["گوشوارہ کھولیں", "Open statement"],
  broughtForward: ["سابقہ بقایا (پچھلا)", "Brought forward"],
  closingBalance: ["آخری بقایا", "Closing balance"],
  salaryPosted: ["تنخواہ (واجب)", "Salary due"],
  invoices: ["بل", "Invoices"],
  invoice: ["بل", "Invoice"],
  settleNow: ["حساب برابر کریں", "Settle now"],
  signHelp: ["مثبت = ہم نے دینا ہے، منفی (⇠) = اس نے دینا ہے", "Positive = we owe him; negative (⇠) = he owes us"],
  signHelpCustomer: ["بقایا گاہک کے ذمہ دکھایا گیا ہے (⇠)", "Balance shows what the customer owes us (⇠)"],
  creditBonus: ["اضافی رقم / انعام", "Credit / bonus"],
  salaryPaid: ["تنخواہ ادا", "Salary paid"],
  advance: ["ایڈوانس", "Advance"],
  paymentReceived: ["وصولی", "Payment received"],
  refund: ["واپسی", "Refund"],
  discountWriteOff: ["رعایت / معافی", "Discount / write-off"],
  extraCharge: ["اضافی چارج", "Extra charge"],
  expense: ["خرچ", "Expense"],
  moneyIn: ["آمد", "Money in"],
  moneyOut: ["ادائیگی", "Money out"],
  receiptPhoto: ["رسید کی تصویر", "Receipt photo"],
  receipt: ["رسید", "Receipt"],
  salaryFor: ["تنخواہ", "Salary for"],
  postSalary: ["مہینے کی تنخواہ درج کریں", "Post month's salary"],
  postSalaryHelp: ["پہلے مہینے کی تنخواہ درج کریں، پھر ادائیگی اوپر سے درج کریں۔ ایڈوانس اور کٹوتی خود حساب میں آ جائیں گے۔", "Post the month's salary first, then record the payment above. Advances and deductions are netted automatically."],
  salaryAlreadyPosted: ["اس مہینے کی تنخواہ پہلے سے درج ہے", "Salary for this month is already posted"],
  rateExists: ["اس تاریخ کا ریٹ پہلے سے موجود ہے", "A rate already exists for this date"],
  rateChangeHelp: ["نیا ریٹ صرف اس تاریخ سے لاگو ہوگا، پرانے ہفتے نہیں بدلیں گے۔", "The new rate applies from this date only; old weeks do not change."],
  rateVoidHelp: ["یہ ریٹ ہٹانے سے اس کی تاریخوں کی کمائی دوبارہ حساب ہوگی۔", "Removing this rate recalculates earnings for its dates."],
  employeesKhatta: ["ملازمین", "Employees"],
  expenseKhatta: ["خرچ کھاتہ", "Expense khatta"],
  expenseKhattaHelp: ["ہر ادائیگی اور وصولی ایک ہی جگہ — ہر کھاتہ اسی سے بنتا ہے", "Every payment in and out, in one place — every khatta is built from it"],
  newEntry: ["نیا اندراج", "New entry"],
  otherIncome: ["دیگر آمدن", "Other income"],
  otherExpense: ["دیگر خرچ", "Other expense"],
  ownerTransfer: ["بھائیوں میں رقم کی منتقلی", "Transfer between owners"],
  fromOwner: ["کس نے دیے", "From owner"],
  toOwner: ["کس کو دیے", "To owner"],
  chooseOtherOwner: ["دوسرا مالک چنیں", "Choose the other owner"],
  workerPaymentsHint: ["کاریگروں، ملازمین اور گاہکوں کی ادائیگیاں ان کے کھاتے سے درج کریں — وہ خود یہاں نظر آئیں گی۔", "Record worker, employee and customer payments from their ledger — they appear here automatically."],
  workerPayments: ["کاریگروں کی ادائیگیاں", "Worker payments"],
  adjustment: ["کٹوتی / ایڈجسٹمنٹ", "Adjustment"],
  adjustmentNote: ["کٹوتی / ایڈجسٹمنٹ نقد رقم نہیں، اس لیے آمد و خرچ کے کل میں شامل نہیں۔", "Adjustments move no cash, so they are left out of the cash totals."],
  all: ["سب", "All"],
  cashIn: ["آمد (نقد وغیرہ)", "Money in"],
  cashOut: ["خرچ / ادائیگی", "Money out"],
  net: ["خالص", "Net"],
  in: ["آمد", "In"],
  out: ["خرچ", "Out"],
  categories: ["خرچ کی اقسام", "Expense categories"],
  mCash: ["نقد", "Cash"],
  mBank: ["بینک", "Bank"],
  mEasypaisa: ["ایزی پیسہ", "Easypaisa"],
  mJazzcash: ["جاز کیش", "JazzCash"],
  mOther: ["دیگر", "Other"],
  ownersTitle: ["مالکان کا حساب", "Owners"],
  ownersHelp: ["ہر بھائی نے کیا دیا، کیا وصول کیا، اور ہاتھ میں نقد", "What each brother paid, received, and the cash in hand"],
  receivedTotal: ["کل وصولی", "Total received"],
  paidTotal: ["کل ادائیگی", "Total paid"],
  transfersIn: ["بھائی سے ملے", "Received from brother"],
  transfersOut: ["بھائی کو دیے", "Given to brother"],
  netPosition: ["خالص پوزیشن", "Net position"],
  netHelp: ["وصولی − ادائیگی ± منتقلی", "Received − paid ± transfers"],
  cashInHand: ["ہاتھ میں نقد (حساب سے)", "Cash in hand (expected)"],
  cashInHandHelp: ["صرف نقد طریقہ، شروع سے آج تک", "Cash method only, all time to today"],
  betweenBrothers: ["بھائیوں کے درمیان حساب", "Between the brothers"],
  betweenBrothersHelp: ["برابر شراکت (50/50) کے حساب سے: زیادہ رقم رکھنے والا بھائی فرق کا آدھا دوسرے کو دے تو دونوں برابر ہو جائیں۔", "Assumes equal (50/50) partners: the brother holding more business money gives the other half the difference so both are level."],
  cashCount: ["نقد کی گنتی (ملاپ)", "Cash count (reconciliation)"],
  cashCountHelp: ["گنی ہوئی نقد رقم محفوظ کریں؛ متوقع رقم سے فرق دکھایا جائے گا۔", "Save the counted cash; the difference from expected cash is shown."],
  countedCash: ["گنی ہوئی نقد", "Counted cash"],
  expectedCash: ["متوقع نقد", "Expected cash"],
  ownerEntries: ["مالک کے اندراجات", "Owner's entries"],
  sales: ["فروخت", "Sales"],
  newSale: ["نیا بل", "New sale"],
  bricksSold: ["فروخت شدہ اینٹیں", "Bricks sold"],
  salesTotal: ["کل فروخت", "Sales total"],
  receivedWithInvoice: ["بل پر وصولی", "Received on invoices"],
  received: ["وصول", "Received"],
  vehicle: ["گاڑی / ٹرالی نمبر", "Vehicle / trolley no."],
  driver: ["ڈرائیور", "Driver"],
  previousBalance: ["سابقہ بقایا", "Previous balance"],
  items: ["اینٹیں", "Items"],
  quantityBricks: ["تعداد (اینٹیں)", "Quantity (bricks)"],
  addLine: ["لائن شامل کریں", "Add line"],
  incompleteLine: ["ہر لائن میں کوالٹی، تعداد اور ریٹ لکھیں", "Each line needs quality, quantity and rate"],
  stockWarning: ["اسٹاک سے زیادہ فروخت!", "Selling more than stock!"],
  available: ["موجود", "available"],
  selling: ["فروخت", "selling"],
  discount: ["رعایت", "Discount"],
  deliveryCharges: ["کرایہ / ڈیلیوری", "Delivery charges"],
  gross: ["کل رقم", "Gross"],
  invoiceTotal: ["بل کی کل رقم", "Invoice total"],
  receivedNow: ["ابھی وصول", "Received now"],
  fullPayment: ["پوری رقم", "Full amount"],
  balanceAfter: ["اس بل کے بعد بقایا", "Balance after this invoice"],
  saveInvoice: ["بل محفوظ کریں", "Save invoice"],
  chooseCustomer: ["گاہک چنیں", "Choose a customer"],
  edit: ["تبدیل کریں", "Edit"],
  done: ["مکمل", "Done"],
  voidInvoice: ["بل منسوخ کریں", "Void invoice"],
  voidInvoiceHelp: ["بل اور اس کے ساتھ وصول شدہ رقم منسوخ ہو جائیں گے (ریکارڈ محفوظ رہے گا)۔", "The invoice and money received with it will be voided (the record is kept)."],
  invoiceBalance: ["اس بل کا بقایا", "Due on this invoice"],
  customerTotalBalance: ["گاہک کا کل بقایا", "Customer's total balance"],
  addPayment: ["وصولی درج کریں", "Record payment"],
  laterPaymentHint: ["پرانے بقایا کی عام وصولی گاہک کے کھاتے سے بھی درج ہو سکتی ہے:", "General payments against old balance can also be recorded from the customer ledger:"],
  discountTooBig: ["رعایت بل سے زیادہ نہیں ہو سکتی", "Discount can't exceed the invoice"],
  stock: ["اسٹاک", "Stock"],
  finishedStock: ["پکی اینٹوں کا اسٹاک", "Finished stock"],
  rawStock: ["کچی اینٹوں کا اسٹاک", "Raw stock"],
  bakedOut: ["نکاسی", "Baked out"],
  sold: ["فروخت", "Sold"],
  adjusted: ["ایڈجسٹ", "Adjusted"],
  inStock: ["موجود", "In stock"],
  catNormal: ["عام", "Normal"],
  cat9t: ["9T", "9T"],
  catSpecial: ["اسپیشل", "Special"],
  catOther: ["دیگر", "Other"],
  unmappedQualities: ["یہ فروخت کوالٹیز اسٹاک سے منسلک نہیں", "These sale qualities are not linked to stock"],
  madeConfirmed: ["تیار (پکی گنتی)", "Made (confirmed)"],
  madeEstimated: ["تیار (اندازہ)", "Made (estimated)"],
  loadedInKiln: ["بھٹے میں بھرائی", "Loaded in kiln"],
  rawAtYard: ["کچی اینٹیں پھڑ پر", "Raw at yard"],
  loadedFromHim: ["اس کی اینٹیں بھرائی", "Loaded from him"],
  noSource: ["پتھیر درج نہیں", "No source given"],
  rawBricks: ["کچی اینٹیں", "Raw bricks"],
  newAdjustment: ["اسٹاک ایڈجسٹمنٹ", "Stock adjustment"],
  adjustments: ["ایڈجسٹمنٹس", "Adjustments"],
  reduce: ["کمی (ٹوٹ پھوٹ / کمی)", "Reduce (breakage / shortage)"],
  increase: ["اضافہ", "Increase"],
  reason: ["وجہ", "Reason"],
  reasonExample: ["مثلاً ٹوٹ پھوٹ", "e.g. breakage"],
  reasonRequired: ["وجہ لکھنا ضروری ہے", "A reason is required"],
  stockChange: ["اس سے اسٹاک بدل جائے گا۔", "This changes the stock."],
  stockFrom: ["اسٹاک سے:", "Stock from:"],
  stockFromHelp: ["ہر فروخت کوالٹی کو نکاسی کی کوالٹی سے جوڑیں تاکہ اسٹاک صحیح کم ہو۔", "Link each sale quality to a nakasi quality so sales reduce the right stock."],
  notTracked: ["اسٹاک میں شامل نہیں", "Not stock-tracked"],
  reports: ["رپورٹس", "Reports"],
  profitLoss: ["نفع و نقصان", "Profit & loss"],
  income: ["آمدن", "Income"],
  costs: ["اخراجات", "Costs"],
  salaries: ["تنخواہیں", "Salaries"],
  profit: ["نفع", "Profit"],
  loss: ["نقصان", "Loss"],
  pnlHelp: ["کاریگروں کی کمائی خرچ میں شامل ہے؛ خرچہ (ایڈوانس) الگ سے نہیں گنا جاتا تاکہ دوہرا نہ ہو۔", "Worker earnings are counted as cost; kharcha is an advance against them, so it is not counted twice."],
  outstanding: ["بقایا جات", "Outstanding balances"],
  backupExport: ["بیک اپ اور مکمل ڈاؤن لوڈ", "Backup & full export"],
  backupHelp: ["ڈیٹا بیس کا روزانہ خودکار بیک اپ Lovable Cloud کرتا ہے۔ یہاں سے تمام ریکارڈ (JSON اور Excel) اپنے پاس محفوظ کریں۔ رسیدوں کی تصاویر اس میں شامل نہیں۔", "Lovable Cloud takes daily automatic database backups. Download every record here (JSON and Excel) to keep your own copy. Receipt photos are not included."],
  fullExport: ["مکمل ڈیٹا ڈاؤن لوڈ کریں", "Download full export"],
  exportDone: ["ڈاؤن لوڈ مکمل", "Export downloaded"],
  balances: ["بقایا جات", "Balances"],
  weOweWorkers: ["کاریگروں / ملازمین کو دینا", "We owe workers"],
  workersOweUs: ["کاریگروں سے لینا", "Workers owe us"],
  customersOweUs: ["گاہکوں سے لینا", "Customers owe us"],
  customerAdvances: ["گاہکوں کے ایڈوانس", "Customer advances"],
  historyHelp: ["ہر تبدیلی پرانی اور نئی قیمت کے ساتھ", "Every change, with old and new values"],
  loadMore: ["مزید دکھائیں", "Load more"],
} as const;

export type Key = keyof typeof dict;
const days: Record<Lang, string[]> = {
  ur: ["جمعرات", "جمعہ", "ہفتہ", "اتوار", "پیر", "منگل", "بدھ"],
  en: ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"],
};

export type Numerals = "en" | "ur";
let currentNumerals: Numerals = "en";

type Ctx = {
  lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string; days: string[];
  numerals: Numerals; setNumerals: (n: Numerals) => void;
};
const I18n = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ur");
  const [numerals, setNumState] = useState<Numerals>("en");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mnb-lang");
      if (saved === "en" || saved === "ur") setLangState(saved);
      const n = localStorage.getItem("mnb-numerals");
      if (n === "en" || n === "ur") { currentNumerals = n; setNumState(n); }
    } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ur" ? "rtl" : "ltr";
  }, [lang]);
  const setLang = (l: Lang) => {
    try { localStorage.setItem("mnb-lang", l); } catch { /* ignore */ }
    setLangState(l);
  };
  const setNumerals = (n: Numerals) => {
    try { localStorage.setItem("mnb-numerals", n); } catch { /* ignore */ }
    currentNumerals = n;
    setNumState(n);
  };
  const t = (k: Key) => dict[k][lang === "ur" ? 0 : 1];
  return <I18n.Provider value={{ lang, setLang, t, days: days[lang], numerals, setNumerals }}>{children}</I18n.Provider>;
}

export function useT() {
  const c = useContext(I18n);
  if (!c) throw new Error("I18nProvider missing");
  return c;
}

const URDU_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
/** Convert ASCII digits to Urdu digits when the Urdu-numeral option is on. */
export function digits(s: string) {
  return currentNumerals === "ur" ? s.replace(/[0-9]/g, (d) => URDU_DIGITS[Number(d)]!) : s;
}

/** Whole rupees / bricks with thousands separators (English or Urdu numerals). */
export function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return digits(n.toLocaleString("en-PK"));
}

/** ISO date → dd-mm-yyyy, as written in the paper register. */
export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return digits(`${day}-${m}-${y}`);
}
