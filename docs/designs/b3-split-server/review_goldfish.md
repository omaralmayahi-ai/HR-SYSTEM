# مراجعة Goldfish — B3 تقسيم `server.ts`

المراجَع: `design_draft.md` (مسودة v1، 2026-11-10) · المراجع: Goldfish (سياق جديد) · تاريخ المراجعة: 2026-11-10

> ملاحظة منهجية: شجرة العمل كانت تتغيّر أثناء المراجعة (بدأ تنفيذ PR شبكة الأمان والدفعة 1: ظهر `server/context.ts` و`server/routes/{trainers,salaries,attendance}.ts` و`server/routeInventory.test.ts`، ونزل `server.ts` من 11142 إلى 10620 سطراً). لذلك أرقام الأسطر أدناه تقريبية، والمعتمد أسماء الدوال والمسارات.

## الحكم
التقسيم نفسه وشبكة الأمان صحيحان في الاتجاه، لكن **القاعدة «حذف فروع الذاكرة الميتة أثناء النقل» مبنية على فرضية خاطئة**: مخازن الذاكرة ليست احتياطاً ميتاً فقط، بل هي **مصدر البيانات الوحيد** لمحرك الاستحقاق وفحص السلامة المرجعية والاستيراد الجماعي. تطبيق القاعدة بترتيب الدفعات الحالي يكسر هذه الوظائف بصمت بين الدفعة 2 والدفعة 5. **Blocker واحد، و6 Major.**

## التحقق من ادعاءات التصميم

| الادعاء | النتيجة |
|---|---|
| 11142 سطراً | صحيح عند البدء. |
| 206 مسارات | **غير دقيق.** 195 استدعاء حرفياً `app.<method>('…')` + المولّد العام (`genericEntitiesMap`، 21 نقطة × 4 أفعال، يُسجَّل منها ما لم يُعرَّف صراحة) = **221 مساراً فعلياً** في `server/route-inventory.snapshot.txt`. |
| 49 مخزن `let inMemory*` | 48 `let inMemory*` + `systemSettingsStore` + `genericMemoryStores` (const يُعدَّل في مكانه). قريب. |
| 127 خطأ في `tsc -p tsconfig.server.json` | قِستُ 125 (منها 4 × TS2304 على `inMemoryEvaluationForms` داخل `buildRefContext`)، ثم 119 بلا TS2304 بعد تعديلات المنفّذ. أي أن **شرط «صفر TS2304» كان سيفشل عند خط الأساس نفسه** لولا إصلاح لم يذكره التصميم. |
| خلل `validateEmployeeImportRow` غير مستورد (~1892) | **صحيح عند 995f0bf**: في `dist/server.cjs` المبني سابقاً تُستدعى الدالة (سطر ~6992) ولا تعريف لها في الحزمة. مُصلَح الآن في الشجرة (الاستيراد في سطر 24). ملاحظة مهمة: **esbuild بنى الحزمة بنجاح رغم الاسم غير المعرّف** ← `npm run build` ليس شبكة أمان، وهذا يؤيد بوابة `typecheck:server`. |
| خلل `id` داخل `try` في `DELETE /api/trainers/:id` (~3870) | **صحيح عند 995f0bf** (ظاهر في `dist/server.cjs`: `const id2` داخل `try`). مُصلَح الآن ونُقل إلى `server/routes/trainers.ts`. |
| اختبار لكل إصلاح | لم أجد اختباراً لأيٍّ منهما وقت المراجعة (انظر N4). |

---

## Blocker

### B-1 — مخازن الذاكرة مصدر بيانات حي لا احتياط ميت؛ حذفها حسب الدفعات يكسر المحرك والسلامة المرجعية والاستيراد بصمت

**الوقائع (من الكود):**
1. **محرك الاستحقاق** `triggerRecalculateEligibility` (28 موضع استدعاء، يُستدعى بعد كل كتابة على سجلات الموظف) يبني `EngineContextData` **كلياً من الذاكرة**:
   - العقوبات، الشكر، التقييمات، الإجازات، سجل الخدمة، الشهادات، لقطات مسار الشهادة، أرصدة الاختصاص ← `genericMemoryStores['penalties'|'appreciations'|'performance'|'annual-evaluations'|'leaves'|'service-records'|'service-credits'|'qualifications'|'degree-track-snapshots'|'specialization-credits']` و`inMemoryEmployeeCommendations`.
   - القواعد: `gradeRules: inMemoryGradePromotionRules`، `governingCourses: inMemoryGoverningCourses`، `governingAssignments: inMemoryEmployeeAssignments`، `inMemoryCommendationRulesSettings` (التسوية التلقائية)؛ و`loadPenaltyTypesForEngine` ترجع إلى `inMemoryPenaltyTypes` عند فراغ الجدول.
   - الموظف نفسه: `inMemoryEmployees.find(...)` **أولاً** ثم القاعدة. و`inMemoryEmployees` مبذور بموظف وهمي `id: 1` لا يُحذف أبداً ← حساب استحقاق الموظف الحقيقي ذي المعرّف 1 يتم على البذرة الوهمية.
2. **السلامة المرجعية** `buildRefContext()` (19 استعمالاً) تقرأ الموظفين وتعيينات الوظائف والشهادات والعقوبات والتقييمات من الذاكرة؛ وحذف/تعطيل المخصصات والشهادات والمسؤوليات (`DELETE /api/allowances-deductions/:id`، `education-degrees`، `responsibility-allowances`) يعتمد عليها وحدها.
3. **الاستيراد الجماعي** `POST /api/employees/bulk-import`: `lookupData = { jobTitles: inMemoryJobTitles, educationDegrees: inMemoryEducationDegrees, shiftSystems: inMemoryShiftSystems }` رغم التعليق «authoritative settings tables».
4. هذه المخازن **لا تُملأ من القاعدة عند الإقلاع** (أُزيل `loadLocalDb` في B2e). تُملأ فقط بالكتابة اللاحقة لنجاح القاعدة (write-through)، مثل `genericMemoryStores[endpoint].push(memRecord)` في POST العام، وتحديث `inMemoryGradePromotionRules` داخل `if (updated)` في `PUT /api/grade-promotion-rules/:id`، و`syncEntityRecord`/`syncEmployeeRecord`. أي أن المحرك اليوم يرى «ما كُتب منذ آخر إعادة تشغيل» + بذوراً ثابتة. هذا خلل قائم بذاته (خارج B3)، لكنه يعني أن هذه الكتابات **ليست فروعاً ميتة**.

**سيناريو الفشل:**
- الدفعة 2 تنقل «قواعد الترفيع» و«أنواع العقوبات» و«العناوين/الشهادات/المناوبة» وتحذف «فروع الذاكرة» وفق القاعدة. المطوّر يحذف المخزن كاملاً أو يستبدله بـ«ثابت مُصدَّر» (كما يجيز القسم 3). النتيجة: المحرك (لم يُنقل بعد، الدفعة 5) يقرأ القواعد الافتراضية دائماً، والاستيراد الجماعي يتحقق على الثابت، و`buildRefContext` يرى قائمة ثابتة. **لا TS2304** لأن الاسم ما زال معرّفاً (ثابت) أو لأن `typeof X !== 'undefined'` استُبدل.
- الدفعة 3 تنقل العقوبات/الشهادات/التقييم وتحذف `genericMemoryStores[...].push` بعد نجاح القاعدة. المحرك يرى `penalties = []` ← **موظف معاقَب يظهر مستحقاً للترفيع/العلاوة** (يخالف «التقييم يحجب الترفيع» والانضباط 14/1991)، و`DELETE /api/allowances-deductions/:id` يمرّ على مخصص مستخدَم. لا اختبار ولا بوابة تلتقط ذلك؛ لقطة الجرد لا تتغير.
- العكس أيضاً خطير: «يُستبدل بقراءة من القاعدة» داخل PR نقل يغيّر نتائج الاستحقاق لكل الموظفين (يدخل التاريخ الكامل للعقوبات والإجازات). هذا **تغيير سلوك مالي** مخبّأ في PR يُفترض أنه «نقل حرفي».

**الإصلاح المطلوب في التصميم:**
1. أضف **دفعة 0 «مصادر البيانات»** قبل أي حذف ذاكرة، PR مستقل يُعامَل كتغيير سلوك:
   - `loadEngineContext(empId)` من القاعدة (كل الحقول أعلاه + الموظف من القاعدة دائماً، وتُحذف بذرة `inMemoryEmployees`).
   - `loadRefContext()` من القاعدة (أو استعلامات `EXISTS` موجهة بدل تحميل كل الموظفين).
   - `loadImportLookups()` من جداول الإعدادات.
   - اختبارات ذهبية: موظف بعقوبة نافذة ← غير مستحق؛ قواعد ترفيع معدّلة في القاعدة ← تُطبَّق بعد إعادة التشغيل؛ حذف مخصص مستخدَم ← 400.
   - تقرير أثر: كم موظفاً تتغير نتيجة استحقاقه على قاعدة التشغيل (القاعدة 9 بروحها).
2. عدّل القسم 3: «فرع ميت» = ما يُنفَّذ **فقط** بعد `respondIfDbWriteError`/فشل اتصال. الكتابة إلى الذاكرة بعد نجاح القاعدة ليست فرعاً ميتاً، ولا تُحذف إلا بعد أن يصبح كل قارئ لذلك المخزن (المحرك، `buildRefContext`، الاستيراد، `syncEntityRecord`) يقرأ من القاعدة.
3. أضف جدول «قرّاء كل مخزن» في التصميم (انظر الملحق) وشرطاً في كل PR: لا يُحذف مخزن له قارئ خارج المجال المنقول.

---

## Major

### M-1 — بوابة `typecheck:server` أضعف مما يُفترض
- تمنع `TS2304` فقط. لكن أخطاء ReferenceError وقت التشغيل تأتي أيضاً بـ **TS2552** («Cannot find name 'x'. Did you mean 'y'?» — الأرجح عند النقل لأن أسماء المخازن متشابهة: `inMemoryPenalties`/`inMemoryPenaltyTypes`)، و**TS2448/TS2454** (استعمال قبل التعريف/TDZ عند بناء `ctx` قبل `const` معرّف لاحقاً)، و**TS2663**.
- المقارنة **بالعدد** تسمح بالمقايضة: خطأ جديد حقيقي يُخفيه خطأ قديم أُصلح.
- `RouteContext` الحالي يعرّف `db: any; schema: any; pool: any` ← كل كود منقول يفقد فحص الأنواع على Drizzle؛ أغلب الـ 119 خطأ الحالية هي TS2345/TS2769 على `db.insert(...)` و«ستنخفض» بالنقل بسبب **محو الأنواع لا الإصلاح**، و`ctx.schema.trainrs` لن يُلتقط.
- **الإصلاح:** مجموعة ممنوعة `{2304, 2552, 2448, 2454, 2663}`؛ مقارنة بصمات الأخطاء (رمز + نص الرسالة بلا رقم السطر) لا عددها؛ `db: typeof db`، `schema: typeof schema`، `pool: Pool`، ودوال `ctx` بتواقيع حقيقية لا `any`.

### M-2 — لقطة الجرد لا تلتقط ما يهم أكثر من المسار
التنفيذ الفعلي (يشغّل الخادم بـ `ROUTE_INVENTORY_OUT` ويقرأ `routeRegistry.list()`) أفضل من وصف التصميم (استخراج نصي `app.<method>('<path>'` الذي **كان سيفوّت 84 مساراً مولّداً** في حلقة `genericEntitiesMap`) — حدّث التصميم. لكن ما زالت ثغرات:
1. **سلسلة الوسطاء غير مسجّلة:** نقل يُسقط `requireAdmin` أو يبدّله بـ `requireWriter` يمرّ (ثغرة صلاحيات).
2. **المسار المولّد لا يُميَّز عن الصريح:** المولّد يسجّل `if (!routeRegistry.has(...))`. لو نسي PR الدفعة 3 مساراً صريحاً مثل `GET /api/penalties` أو `POST /api/qualifications` (الصريح فيه تحقق ومزامنة وإعادة احتساب)، يملؤه المولّد العام بصمت بسلوك مختلف. اللقطة تُظهر فقط تغيّر الموضع (من ~30 إلى ~190)، والمطوّر سيشغّل `UPDATE_ROUTE_SNAPSHOT=1` معتقداً أنه أثر النقل. (اليوم: `PUT /api/career/:id` و`PUT /api/retirements/:id` و`PUT /api/documents/:id` عامة، والباقي صريح — خليط يسهل الخطأ فيه.)
3. **ترتيب `app.use` غير مسجّل** (انظر M-3).
- **الإصلاح:** سطر اللقطة `METHOD PATH [أسماء الوسطاء] {explicit|generic}`؛ استبدل `!routeRegistry.has` بقائمة صريحة ثابتة للمسارات العامة المسموح توليدها، ومسار عام خارجها = خطأ إقلاع؛ سجّل طبقات `app.use` في الجرد أيضاً.

### M-3 — موضع البوابة والـ catch-all غير محمي
- `app.use('/api', dbGate.middleware)` مُثبَّت بعد `/api/health` وقبل كل المسارات. وحدة تُسجَّل قبله (مثلاً نقل `registerAuthRoutes` إلى أعلى «للترتيب») **تتجاوز البوابة**، فتعود فروع الذاكرة المتبقية قابلة للبلوغ أثناء الانقطاع (قراءة قديمة/نجاح كاذب، خلاف ق-2). لقطة الجرد لا تتغير لأن ترتيب المسارات فيما بينها ثابت.
- في الإنتاج `app.use((req,res)=>res.sendFile(index.html))` آخر الملف. وحدة تُسجَّل بعده (مثلاً بعد `await` إضافي) تعيد **200 + HTML** لطلبات API بدل JSON؛ الجرد يمرّ.
- **الإصلاح:** اختبار يفحص `app._router.stack`: طبقة البوابة قبل أول مسار `/api` غير مستثنى، والـ catch-all آخر طبقة؛ أو إدخال `app.use` في الجرد (M-2).

### M-4 — حالة مشتركة قابلة لإعادة الإسناد ليست «مخزن احتياط»
- `systemSettingsStore` (`let`) يُعاد إسناده في مسارات الإعدادات (الدفعة 6) ويقرؤه الترحيل الشهري للإجازات (`resolveAccrualParams(systemSettingsStore)`، `GET /api/leave-accrual/status`، الدفعة 4) و`setTimeout`/`setInterval` كل ساعة. قاعدة «لا تُمرَّر `let` عبر ctx» تمنع نقل الدفعة 4 قبل 6 دون حل.
- `executeMonthlyLeaveAccrual` تُستدعى من مسار الإعدادات (~سطر 128) ومن المؤقّت.
- `inMemoryPenaltyTypes` يُعاد إسناده في الدفعة 2 ويُقرأ في المحرك (الدفعة 5).
- `genericMemoryStores` و`inMemory*` المسماة **أسماء مستعارة لنفس المصفوفات**؛ `filter` يكسر الربط ثم يعيده `syncEntityRecord`/مسار الاستعادة يدوياً. نقل جزء من هذا المنطق إلى وحدة يمرّر `genericMemoryStores` عبر ctx ويترك الأسماء المسماة في `server.ts` ← انفصال صامت.
- **الإصلاح:** `ctx.getSettings()` (من القاعدة مع ذاكرة مؤقتة قصيرة) بدل المتغير؛ المؤقتات في `server.ts` (`startJobs(ctx)`) لا داخل `register*` (وإلا تعمل في اختبار الجرد والاختبارات)؛ لا نقل جزئي لـ `genericMemoryStores`: إما يبقى كاملاً في `server.ts` حتى الدفعة 7 أو يُلغى بعد الدفعة 0.

### M-5 — محتوى `ctx` غير محدد، والدفعة 3 تحتاج ما ينتقل في الدفعة 5
الدوال المغلقة المستعملة عبر مجالات متباعدة (عدد الاستعمالات/المدى):
`saveLocalDb` (81)، `syncEntityRecord` (42)، `triggerRecalculateEligibility` (28)، `logRecalcError` (21)، `buildRefContext` (19)، `updateEmployeeCentralRecord` (14، مسار الكتابة الواحد — القاعدة 5)، `executeMonthlyLeaveAccrual`، `findMatchingJobTitleForPromotion`، `syncEmployeeRecord`، `syncEmployeeQualificationFromEmployee`، `enhanceEmployeeRecord`.
`ctx.recalculate` مطلوب في الدفعة 3، لكن تنفيذه يقرأ مخازن الدفعات 2/3/5. تمرير الدالة نفسها عبر ctx يعمل تقنياً (تحتفظ بالربط الحي)، لكنه يُبقي الاعتماد على المخازن التي تحذفها الدفعة 3.
- **الإصلاح:** قائمة صريحة في التصميم لكل دالة مشتركة ← وحدة خدمة (`server/services/eligibility.ts`، `employeeRecord.ts`، `refIntegrity.ts`) تُستخرج في الدفعة 0 أو قبل الدفعة 3، وترتيب جديد: 0 (مصادر البيانات + الخدمات) ← 1 ← 2 ← 3 ...

### M-6 — اختبار الإقلاع لن يعمل فعلياً
- `TEST_DATABASE_URL` غير مدعوم: الاتصال يُبنى من `SQL_HOST/SQL_PORT/SQL_DB_NAME/SQL_USER/SQL_PASSWORD` فقط، ولا CI في المستودع (لا `.github`). الاختبار سيُتخطّى دائماً، وتوقّع «401 لا 500» لن يُختبر.
- بلا قاعدة، البوابة تسبق `requireAuth` فالمتوقع 503 JSON لا 401.
- **الإصلاح:** اختبار بلا قاعدة يعمل دائماً: الإقلاع بقاعدة غير متاحة ← `/api/health` = 503، ومسار محمي = 503 **JSON** (لا HTML)، و`/api/auth/me` بلا رمز = 401. واختبار مع قاعدة عبر `SQL_*` يُشغَّل يدوياً قبل دمج الدفعات 3 و5 و6، وتدوين ذلك في وصف PR.

---

## Nit

- **N1 — أرقام مقادة:** حدّث 206 ← 221 (195 حرفي + مولّد)، 127 ← خط الأساس الفعلي بعد إصلاح `inMemoryEvaluationForms`، وصِف الاستخراج كما نُفِّذ (جرد وقت التشغيل) لا كاستخراج نصي. واذكر صراحة أن `npm run build` (esbuild) لا يلتقط الأسماء غير المعرّفة.
- **N2 — جدول الدفعات ناقص:** لا يذكر: `trainings` (8 مسارات، مع التسجيلات)، `salaries`، `training-courses`، `job-assignments`، `salary-allowances`، `career`، `service-credits`، `specialization-credits`، `degree-track-*`، `commendation-types`/`commendation-rules-settings`/`employee-commendations`، `org-units`، `archive`، `logs`، `leave-accrual`، `admin/schema-health`، **والمولّد العام نفسه**. أضف جدولاً يربط كل سطر في اللقطة بدفعة واحدة.
- **N3 — تغييرات سلوك B2g مرئية للمستخدم:** (قائمة فارغة كانت تُملأ من الذاكرة، 201 كاذب ← خطأ). رأس `server/routes/trainers.ts` يوثّقها جيداً؛ اجعله شرطاً لكل PR مع اختبار لكل تغيير. وأيضاً مسار استعادة الموظف المؤرشف يُبقي الجداول «في الذاكرة فقط» عند **أي** خطأ قاعدة لكل جدول ويرد `success: true` — نجاح كاذب (القاعدة 1) لا يجوز نقله حرفياً؛ ضعه في الدفعة 6 كإصلاح مُعلَن.
- **N4 — اختبارا الخللين:** لم أجد وقت المراجعة اختباراً لـ `DELETE /api/trainers/:id` ولا لاستدعاء `validateEmployeeImportRow` من مسار الاستيراد (الموجود يختبر الدالة في `src/lib` لا المسار).
- **N5 — `catch (e) {}` فارغ** في مزامنة أسباب التأخير داخل `triggerRecalculateEligibility` (كتابة على `promotionDelayReasons`) — يخالف القاعدة 1؛ يُعالَج عند استخراج خدمة الاستحقاق.
- **N6 — `typeof X !== 'undefined'`** في `buildRefContext` نمط صُمم لتحمّل غياب المتغير؛ أزِله عند الاستخراج حتى لا يُخفي مخزناً محذوفاً (TS يلتقطه اليوم بـ TS2304، لكن لا بعد استبداله بثابت).
- **N7 — ترتيب `status-counts`:** `GET /api/employees/status-counts` يجب أن يبقى قبل `GET /api/employees/:id` (هو كذلك اليوم، واللقطة تحفظه). المسارات اللاحقة للمولّد (`/api/promotions/due-list`، `approve-batch`، `promotion-delay-reasons/:id/hide` …) لا تُظلَّل اليوم لاختلاف الفعل/العمق؛ أبقِ المولّد في موضعه.

---

## ملحق: قرّاء المخازن خارج مجالها (أهم ما يجب أن يحسمه التصميم)

| المخزن | الكاتب (دفعة) | قارئ خارج المجال |
|---|---|---|
| `genericMemoryStores['penalties'/'leaves'/'qualifications'/'performance'/'annual-evaluations'/'service-*'/'appreciations'/'degree-track-snapshots'/'specialization-credits']` | 3، 4، العام | المحرك (5)، `buildRefContext` |
| `inMemoryGradePromotionRules` | 2 | المحرك (5) |
| `inMemoryPenaltyTypes` | 2 | المحرك (5) |
| `inMemoryGoverningCourses`، `inMemoryEmployeeAssignments` | 5 | المحرك (5)، `buildRefContext` |
| `inMemoryCommendationRulesSettings`، `inMemoryEmployeeCommendations` | 2/3 | المحرك (5) |
| `inMemoryJobTitles`، `inMemoryEducationDegrees`، `inMemoryShiftSystems` | 2 | الاستيراد الجماعي (6)، `buildRefContext` |
| `inMemoryEmployees` (مع بذرة وهمية id 1) | 6 | المحرك، `buildRefContext`، تعديل العناوين (2) |
| `systemSettingsStore` | 6 | الترحيل الشهري والمؤقّت (4) |
