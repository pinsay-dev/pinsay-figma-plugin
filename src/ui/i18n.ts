export type Lang = 'en' | 'ar';

const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    'signin.title': 'Connect to your {product} workspace',
    'signin.body': 'Attach Figma frames to {product} comments, or pin them on your live site.',
    'signin.button': 'Sign in with {product}',
    'signin.code': 'Your code',
    'signin.open': 'Open {product} in browser ↗',
    'signin.waiting': 'Waiting for approval in the browser…',
    'signin.cancel': 'Cancel',
    'signin.denied': 'Sign-in was declined, or the Figma plugin is not enabled for this workspace.',
    'signin.expired': 'The code expired. Sign in again.',
    'signin.error': 'Could not reach {product}. Check your connection and try again.',
    'header.signout': 'Sign out',
    'ws.menuLabel': 'Switch workspace',
    'ws.signedInAs': 'Signed in as {name}',
    'ws.heading': 'Workspaces',
    'ws.off': 'Not enabled for this workspace',
    'ws.addKey': 'Sign in again to add',
    'ws.blocked': 'Figma integration is not enabled for this workspace.',
    'ws.blockedHint': 'Choose another workspace from the menu above.',
    'sel.none': 'Select a frame, component or group on the canvas.',
    'sel.multiple': 'Select only one frame.',
    'sel.nested': 'Select the whole frame or component, not a layer inside an instance.',
    'sel.unsupported': 'This layer type cannot be sent. Select a frame, component or group.',
    'sel.size': '{w} × {h}',
    'file.label': "This file's Figma link",
    'file.help': 'In Figma: Share → Copy link, then paste it here. Asked once per file.',
    'file.save': 'Save',
    'file.invalid': 'Paste a figma.com link to this file.',
    'file.change': 'Change',
    'file.linked': 'Figma file linked',
    'project.label': 'Project',
    'project.none': 'No projects in this workspace.',
    'tab.attach': 'Attach to comment',
    'tab.pin': 'Pin on live site',
    'search.placeholder': 'Search comments or #number',
    'search.empty': 'No open comments match.',
    'note.label': 'Note (optional)',
    'note.placeholder': 'e.g. Updated padding to 24px',
    'attach.button': 'Attach frame & reply',
    'attach.done': 'Frame attached to #{n}.',
    'attach.noImage': 'The frame image was too large, so only the link and specs were attached.',
    'env.label': 'Site',
    'env.none': 'This project has no site URL. Add one in the {product} project settings.',
    'pin.button': 'Pin on live site ↗',
    'pin.done': 'Click the element on the page to pin the frame.',
    'pin.doneTitle': 'Site opened in your browser',
    'pin.openAgain': 'Open site again ↗',
    'result.again': 'Send another frame',
    loading: 'Loading your projects…',
    busy: 'Sending frame…',
    'error.generic': 'Something went wrong. Try again.',
    'error.signedOut': 'Your session ended. Sign in again.',
    'lang.toggle': 'عربي',
  },
  ar: {
    'signin.title': 'اربط حسابك بمساحة عمل {product}',
    'signin.body': 'أرفق إطارات Figma بتعليقات {product}، أو ثبّتها على موقعك المباشر.',
    'signin.button': 'تسجيل الدخول عبر {product}',
    'signin.code': 'رمزك',
    'signin.open': 'فتح {product} في المتصفح ↗',
    'signin.waiting': 'بانتظار الموافقة في المتصفح…',
    'signin.cancel': 'إلغاء',
    'signin.denied': 'تم رفض تسجيل الدخول، أو أن إضافة Figma غير مفعّلة لمساحة العمل هذه.',
    'signin.expired': 'انتهت صلاحية الرمز. سجّل الدخول مرة أخرى.',
    'signin.error': 'تعذّر الوصول إلى {product}. تحقق من اتصالك وحاول مرة أخرى.',
    'header.signout': 'تسجيل الخروج',
    'ws.menuLabel': 'تبديل مساحة العمل',
    'ws.signedInAs': 'تم تسجيل الدخول باسم {name}',
    'ws.heading': 'مساحات العمل',
    'ws.off': 'غير مفعّلة لمساحة العمل هذه',
    'ws.addKey': 'سجّل الدخول مرة أخرى لإضافتها',
    'ws.blocked': 'تكامل Figma غير مفعل لمساحة العمل هذه.',
    'ws.blockedHint': 'اختر مساحة عمل أخرى من القائمة في الأعلى.',
    'sel.none': 'حدّد إطارًا أو مكوّنًا أو مجموعة على اللوحة.',
    'sel.multiple': 'حدّد إطارًا واحدًا فقط.',
    'sel.nested': 'حدّد الإطار أو المكوّن كاملًا، لا طبقة داخل نسخة.',
    'sel.unsupported': 'لا يمكن إرسال هذا النوع من الطبقات. حدّد إطارًا أو مكوّنًا أو مجموعة.',
    'sel.size': '{w} × {h}',
    'file.label': 'رابط ملف Figma هذا',
    'file.help': 'في Figma: مشاركة ← نسخ الرابط، ثم الصقه هنا. يُطلب مرة واحدة لكل ملف.',
    'file.save': 'حفظ',
    'file.invalid': 'الصق رابط figma.com لهذا الملف.',
    'file.change': 'تغيير',
    'file.linked': 'ملف Figma مرتبط',
    'project.label': 'المشروع',
    'project.none': 'لا توجد مشاريع في مساحة العمل هذه.',
    'tab.attach': 'إرفاق بتعليق',
    'tab.pin': 'تثبيت على الموقع',
    'search.placeholder': 'ابحث في التعليقات أو #رقم',
    'search.empty': 'لا توجد تعليقات مفتوحة مطابقة.',
    'note.label': 'ملاحظة (اختياري)',
    'note.placeholder': 'مثال: تم تحديث الحشوة إلى 24px',
    'attach.button': 'إرفاق الإطار والرد',
    'attach.done': 'تم إرفاق الإطار بالتعليق #{n}.',
    'attach.noImage': 'الصورة كبيرة جدًا، لذا أُرفق الرابط والمواصفات فقط.',
    'env.label': 'الموقع',
    'env.none': 'لا يوجد رابط موقع لهذا المشروع. أضفه من إعدادات المشروع في {product}.',
    'pin.button': 'تثبيت على الموقع ↗',
    'pin.done': 'انقر العنصر في الصفحة لتثبيت الإطار.',
    'pin.doneTitle': 'تم فتح الموقع في متصفحك',
    'pin.openAgain': 'فتح الموقع مرة أخرى ↗',
    'result.again': 'إرسال إطار آخر',
    loading: 'جارٍ تحميل مشاريعك…',
    busy: 'جارٍ إرسال الإطار…',
    'error.generic': 'حدث خطأ ما. حاول مرة أخرى.',
    'error.signedOut': 'انتهت جلستك. سجّل الدخول مرة أخرى.',
    'lang.toggle': 'English',
  },
};

let lang: Lang = 'en';

export function detectLang(stored: unknown, navLang: string | undefined): Lang {
  if (stored === 'en' || stored === 'ar') return stored;
  return (navLang ?? '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function setLang(l: Lang): void {
  lang = l;
}

export function getLang(): Lang {
  return lang;
}

export function dir(): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

export function t(key: string, vars: Record<string, string | number> = {}): string {
  const s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export const KEYS_EN = Object.keys(STRINGS.en);
export const KEYS_AR = Object.keys(STRINGS.ar);
export const ALL_AR = Object.values(STRINGS.ar);
