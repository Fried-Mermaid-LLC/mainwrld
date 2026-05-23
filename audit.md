# Аудит MainWRLD и план публикации в Apple App Store

**Заказ:** Get My App IOS Ready (Upwork)
**Дата:** 2026-05-22
**Цель:** оценить готовность веб-приложения MainWRLD к упаковке через Capacitor и публикации в App Store.

---

## 0. Контекст сделки и расхождение со словами клиента

Перед тем как обсуждать код, нужно зафиксировать, во что я подписался и где есть рассинхрон с тем, что клиент говорит:

**Что я предложил в чате Upwork:**
- Полная упаковка в App Store через Capacitor;
- Performance pass, App Store assets, TestFlight, Apple compliance review;
- Цена — **$200 fixed**, срок — **1 неделя до submit** (плюс 24-48 часов на ревью Apple).

**Что сказала клиент (Mocha Mattel):**
1. «Notifications and in-app purchases **are in the app**».
2. «Apple developer account ready».
3. Работать на **ветке `dev`, не на `main`**.

**Что я фактически вижу в коде (и на main, и на dev):**

1. **IAP в приложении НЕТ.** Ни на одной из веток. Покупки идут через `window.location.href = "https://buy.stripe.com/test_..."` — это прямой редирект на внешний Stripe Checkout ([App.tsx:2880 на main](App.tsx#L2880), [app/config.ts на dev](app/config.ts)). В `package.json` нет ни `@capacitor-community/in-app-purchases`, ни `@revenuecat/purchases-capacitor`, ни какого-либо StoreKit-моста. Apple отклонит сабмит по 3.1.1 в первый же день.
2. **На ветке `dev` появился свой localhost-сервер на Express** ([server.js](server.js)) для отправки писем через Resend. URL захардкожен как `http://localhost:3001/send-welcome-email` ([app/config.ts](app/config.ts) — функция `sendWelcomeEmail`). В production это не работает — клиент об этом, похоже, не знает.
3. На `dev` App.tsx стал **больше**, а не меньше (9567 строк против 6961 на main); началось разделение на `app/CustomizationView.tsx`, `app/threeComponents.tsx` и т.д., но процесс не доведён до конца.
4. **API-ключ Resend печатается в консоль** (`console.log(RESEND_API_KEY)` в [app/config.ts](app/config.ts)).

**Вывод по сделке:** оценка «$200 за неделю» была дана до просмотра кода. Реалистичная оценка работы — **70-110 часов** (см. раздел 5).

**Принятое решение: идём по сценарию B — полноценный сабмит с IAP.** Заказ берётся ради положительного отзыва на Upwork, а не ради денег, поэтому переплата своим временем приемлема. Это значит:

- Цена и срок («$200 / ~1 неделя до submit») остаются как есть — без попыток ренеговейта.
- Скоуп — полный: Stripe Payment Links заменяются на IAP, фиксятся все блокеры из раздела 4, выполняются все 8 этапов плана из раздела 5.
- Календарно неделя нереалистична для полного плана; нужно либо договариваться с клиенткой о реалистичном сроке (ориентир: 4-6 недель работы + 1-2 недели на ревью Apple), либо переводить срок «1 неделя до submit» как «1 неделя для первого прохода на TestFlight», что более достижимо.
- Что НЕ делаем (исключено из плана B сознательно): полная декомпозиция App.tsx с разносом по модулям, COPPA-флоу (если клиентка подтвердит, что 13+), переписывание Three.js-сцены с нуля. Это либо overkill для прохождения ревью, либо темы для фазы 2.

Альтернативы A (минимальный сабмит без IAP) и C (отказ) — отвергнуты.

---

## 0.5. Прогресс реализации

Раздел обновляется по мере работы. Декомпозиция из §5 разбита на подэтапы; коммиты — на ветке `upwork-iamursky` (ответвление от `dev`).

### Зафиксированные решения по ходу работы

| Решение | Что выбрали | Почему |
| --- | --- | --- |
| Рабочая ветка | `upwork-iamursky` от `dev` | Клиент работает на dev, не трогаем её историю |
| Bundle ID | `com.example.mainwrld` (placeholder) | До подтверждения клиенткой реального ID; переименование после `cap add ios` болезненно |
| Стек IAP | **`cordova-plugin-purchase`** (ревизия — `@capacitor-community/in-app-purchases` не существует на npm) | Без SaaS-зависимости; receipt validation в нашем Cloud Function через App Store Server API. ~15ч моего времени vs 0ч у клиентки на регистрацию RevenueCat |
| Папка `docs/` | Убрана из репо, gitignored | Build output не место в репо; перед мержем в main нужны GitHub Actions для деплоя mainwrld.com |
| Стиль коммитов | По одному на подэтап | Лёгкий ревью и откаты |
| Tailwind v3 vs v4 | v3 | Совпадает 1:1 с инлайн-конфигом из старого CDN; v4 имеет другую модель конфига |
| Capacitor 8 | SPM вместо CocoaPods | Дефолт в Capacitor 8 (с конца 2024); чище, без `pod install` |

### Статус этапов

| Этап | Статус | Коммитов | Примечания |
| --- | --- | --- | --- |
| 0. Подготовка (доступы клиента) | ⏳ Ждём клиентку | — | Apple Developer, Firebase Editor, реальный bundle ID, Stripe |
| 1a. Чистка кода | ✅ | 1 | `import {on} from 'events'` убран, `.DS_Store`/`docs/` gitignored, `console.log(RESEND_API_KEY)` убран |
| 1b. Секреты в `.env` | ✅ | 1 | Firebase + Stripe pk + Resend URL в env; `.env.example` создан; `vite.config.ts` подчищен |
| 1c. Локальный Tailwind | ✅ | 1 | `cdn.tailwindcss.com` → npm-pipeline (Tailwind v3 + PostCSS + autoprefixer); +44 кБ CSS, минус runtime JIT |
| 1d. Бандлинг Stripe.js | ✅ | 1 | `js.stripe.com/v3/` CDN → `@stripe/stripe-js` с `loadStripe` (lazy); +2.7 кБ JS |
| 1e. Безопасность зависимостей | ✅ | 1 | `npm audit`: 5 уязвимостей (1 critical) → 0; protobufjs 7.5.4 → 7.6.1 через `overrides`, picomatch + vite обновлены |
| 6a. Установка Capacitor | ✅ | 1 | `@capacitor/core@8.3.4 + ios + cli`; `capacitor.config.ts` с placeholder bundle ID |
| 6b. `npx cap add ios` | ✅ | (вместе с 6a) | iOS Xcode-проект на SPM создан; собирается через `xcodebuild` для iphonesimulator |
| 6 (фикс). Firebase Auth iframe | ✅ | 1 | Критический iOS-блокер: `getAuth(app)` → `initializeAuth(app, {persistence: [...]})` без `browserPopupRedirectResolver` |
| 6c. Capacitor-плагины | ✅ | 1 | Установлены 6 плагинов (Preferences, StatusBar, SplashScreen, Keyboard, App, Share); подключены SplashScreen.hide + StatusBar.setStyle |
| 6d. `localStorage` → Preferences | ❌ Пропущен сознательно | — | См. ниже «Решение по 6d». localStorage в WKWebView работает; миграция не даёт выгоды для App Store |
| 6e. Иконки + сплеш | ✅ | 1 | `assets/icon.png` (1024×1024 white-padded) + `assets/splash.png` (2732×2732); generated через `@capacitor/assets` |
| 5. Мобильная UI baseline | 🟡 Частично | 1 | Safe-area top/bottom + `100dvh`. Полировка (input-zoom, keyboard plugin, tap targets) — в следующей итерации |
| 2a. Firebase project + Firestore Rules | ✅ (\*) | 1 | `firebase.json`, `.firebaserc`, `firestore.rules` (9 коллекций, default-deny), `firestore.indexes.json`. (\*) код готов, deploy ждёт Editor-доступ |
| 2b. Cloud Function `deleteAccount` (App Store 5.1.1) | ✅ (\*) | 1 | Реальное удаление вместо фейкового logout; scrub user-доков из 8 коллекций + `auth.deleteUser` |
| 2c. setUsernameClaim + setAdmin (claims вместо `ADMIN_USERNAMES`) | ✅ (\*) | 1 | onCreate trigger ставит `username` claim; setAdmin callable + зеркало в users/{uid}.isAdmin |
| 2d. UGC moderation (App Store 1.2) | ✅ (\*) | 1 | OpenAI Moderation API; onCreate comments + onUpdate books; flagged → delete + лог в reports |
| 3a. IAP plugin install + service module | ✅ | 1 | `cordova-plugin-purchase` (не `@capacitor-community/in-app-purchases` — не существует). `app/iap.ts` с lazy-загрузкой |
| 3b. Wire IAP в points + premium флоу | ✅ | 1 | На iOS — `iap.purchase(sku)`; на web — старый Stripe Checkout |
| 3c. Cloud Function verifyAppleReceipt | ✅ (\*) | 1 | App Store Server API через `@apple/app-store-server-library`; идемпотентный credit в Firestore transaction |
| 3d. Restore Purchases UI | ✅ | 1 | Кнопка в Settings → Account & Privacy (только на iOS) |
| 4. Архитектурный рефакторинг | ⏳ | — | Минимальный набор (Context, lazy routes), без полной декомпозиции |
| 7. Юридическое | ✅ (\*) | 1 | `PrivacyInfo.xcprivacy` (зарегистрирован в pbxproj), `ITSAppUsesNonExemptEncryption=false`, шаблоны Privacy Policy + EULA в `legal/`. (\*) клиенту нужно заполнить плейсхолдеры + захостить policy |
| 8. TestFlight + сабмит | ⏳ Требует Stage 0 | — | Внутренний TestFlight → App Review |

### Ключевые технические находки/решения по ходу работы

#### iOS-блокер: Firebase Auth iframe в WKWebView

Самый болезненный неочевидный баг этой стадии. По умолчанию Firebase Web SDK при вызове `getAuth(app)` регистрирует popup/redirect resolver, который грузит скрытый iframe на `<project>.firebaseapp.com/__/auth/iframe` для OAuth-флоу. Из `capacitor://localhost` (схема WKWebView в Capacitor на iOS) cross-origin postMessage с этим iframe **никогда не завершается**, и `onAuthStateChanged` callback **никогда не вызывается** → splash зависает.

**Симптомы:**
- На вебе всё работает; в iOS Simulator — белый экран после React-сплеша;
- В JS-console на экране (debug-оверлей): `[BOOT] splash useEffect mounted` → `1.5s timer fired, subscribing onAuthStateChanged` → cross-origin masked «Script error.» × 2 → callback не приходит никогда;
- Из `xcrun simctl spawn ... log stream` ничего не видно — WKWebView не пробрасывает JS-консоль в `os_log` по умолчанию.

**Фикс** в [firebase.ts](firebase.ts):
```ts
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence } from 'firebase/auth'
// БЕЗ browserPopupRedirectResolver — приложение не использует OAuth
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
})
```

Это работает потому что email/password auth не требует iframe. Проверено `grep -n "signInWithPopup\|signInWithRedirect\|GoogleAuthProvider" — ни одного использования.

Если потом понадобится OAuth (Google Sign-In / Sign In with Apple), нужно будет переходить на native-плагин `@capacitor-firebase/authentication`, который вместо Web SDK дёргает нативный Firebase Auth SDK iOS, и iframe не нужен в принципе.

#### Firestore «permission-denied» при загрузке

После починки iframe-бага сразу выяснилось, что Firestore snapshot listeners (на `books`, `users`, `relationships` и т.д.) валятся с `Missing or insufficient permissions` для неаутентифицированных пользователей. Это **корректное поведение**, если Firestore Security Rules настроены правильно — публичный доступ к чтению пользовательских коллекций не должен быть открыт. UI продолжает работать, ошибки только в консоли.

**Действия:** Stage 2 пропишет правила, разрешающие чтение `books` (опубликованных), но требующие auth для всего остального. Сейчас правила в проекте — неизвестно какие; нужен доступ Editor в Firebase Console (см. Stage 0).

#### Bundle ID

Решено использовать `com.example.mainwrld` как placeholder до подтверждения клиенткой. Реальный bundle ID должен соответствовать:
- Reverse DNS домена клиента (если он есть, например `com.mochamattel.mainwrld`);
- Не использовать `com.example.*` в проде — Apple отклоняет.
- Будет переименовано перед TestFlight upload, для этого требуется пересоздать iOS-проект (`npx cap add ios` после правки `appId`).

#### Деплой Stage 2 (Firebase) — что должен будет сделать клиент

Весь код для Firebase Security Rules и четырёх Cloud Functions написан и проходит локальную сборку. Деплой требует Editor-доступа к проекту `mainwrld-f7acf` (или мне, или клиентке).

**Команды деплоя** (выполнять из корня репозитория):
```bash
# 1. Авторизация (один раз)
firebase login

# 2. Установить секрет для модерации (один раз)
firebase functions:secrets:set OPENAI_API_KEY
# вставить ключ из https://platform.openai.com/api-keys

# 3. Деплой
firebase deploy --only firestore:rules,firestore:indexes,functions
```

**Bootstrap первого администратора** (один раз). Поскольку `setAdmin` требует, чтобы вызывающий уже был админом, первого админа нужно создать локально через Firebase Admin SDK:
```bash
cd functions
node -e "
  const admin = require('firebase-admin');
  admin.initializeApp({credential: admin.credential.applicationDefault()});
  admin.auth().setCustomUserClaims('<UID-of-mochamattel>', {admin: true, username: 'mochamattel'})
    .then(() => admin.firestore().collection('users').doc('<UID-of-mochamattel>').set({isAdmin: true}, {merge: true}))
    .then(() => { console.log('done'); process.exit(0); });
"
```
Где `<UID-of-mochamattel>` — Firebase UID существующего админ-аккаунта (взять из Firebase Console → Authentication).

**Ожидаемые эффекты после деплоя:**
- Firestore `permission-denied` ошибки, которые сейчас видны в JS-консоли iOS-сборки, пропадут (rules разрешают чтение публичного контента аутентифицированным).
- Если live-правила сейчас открыты (`allow read/write: if true`) — деплой их закроет. Это безопасностный win, но клиент должен быть в курсе.
- Кнопка «Permanently Delete Account» в Settings начнёт реально удалять данные (раньше — фейк).
- Админ-панель будет видна только пользователям с custom claim `admin`. Существующие админы из `ADMIN_USERNAMES` продолжают работать через fallback в [App.tsx:262](App.tsx#L262) — но это deprecated и должно быть убрано после миграции.

#### Setup для Stage 3 (IAP) — что должен будет сделать клиент

Чтобы заработали покупки на iOS после деплоя, клиентке нужно:

**1. В App Store Connect (https://appstoreconnect.apple.com):**

В разделе **My App → In-App Purchases** создать 5 продуктов с точно такими identifier'ами (они захардкожены в [app/iap.ts](app/iap.ts) и [functions/src/verifyAppleReceipt.ts](functions/src/verifyAppleReceipt.ts)):

| Identifier | Тип | Назначение |
| --- | --- | --- |
| `mainwrld.points_100` | Consumable | 100 points за $0.99 |
| `mainwrld.points_300` | Consumable | 300 points за $2.99 |
| `mainwrld.points_500` | Consumable | 500 points за $4.99 |
| `mainwrld.points_1000` | Consumable | 1000 points за $9.99 |
| `mainwrld.premium_monthly` | Auto-Renewable Subscription | MainWRLD+ |

Цены настраиваются в Apple's pricing tiers (точные доллары зависят от региона). Каждый продукт нужно подать на review вместе с приложением; до первого approve они в статусе «Waiting for Review».

**2. App Store Connect → Users and Access → Integrations → In-App Purchase:**

Сгенерировать API Key:
- **Key Name:** MainWRLD Server
- **Access:** In-App Purchase (это всё, что нужно)

После создания сохранить:
- **Issuer ID** (UUID, виден в верхней части страницы Keys)
- **Key ID** (например `2X9Y8Z7A6B`)
- **Private Key (.p8 file)** — Apple даёт скачать только один раз!

**3. Firebase secrets** (выполнять из корня репо после `firebase login`):

```bash
firebase functions:secrets:set APPLE_ISSUER_ID
# вставить Issuer ID
firebase functions:secrets:set APPLE_KEY_ID
# вставить Key ID
firebase functions:secrets:set APPLE_BUNDLE_ID
# например com.mochamattel.mainwrld (= реальный bundle ID, не placeholder)
firebase functions:secrets:set APPLE_PRIVATE_KEY
# вставить ВЕСЬ файл .p8 включая строки -----BEGIN PRIVATE KEY----- и -----END PRIVATE KEY-----
firebase functions:secrets:set APPLE_ENV
# "Sandbox" пока работаем в TestFlight, "Production" после live
```

**4. Bundle ID:** placeholder `com.example.mainwrld` в [capacitor.config.ts](capacitor.config.ts) и в Info.plist должен быть заменён на реальный (например `com.mochamattel.mainwrld`). После замены — `npx cap sync ios`. IAP **не работает** с `com.example.*` — Apple отклоняет.

**5. Sandbox testing** (до TestFlight): можно тестировать на устройстве с Sandbox Tester аккаунтом из App Store Connect → Users and Access → Sandbox → Testers. На симуляторе IAP полностью не работает — нужен реальный iPhone.

**Что произойдёт после полной конфигурации:**
- Кнопки покупки points / Premium на iOS откроют родной Apple StoreKit popup.
- После approve — `verifyAppleReceipt` Cloud Function проверит подпись Apple's JWS, сверит productId/transactionId/bundleId, идемпотентно начислит points в Firestore (через `iapTransactions` коллекцию-журнал).
- «Restore Purchases» в Settings восстанавливает Premium подписку при реинсталле.
- Web-версия mainwrld.com продолжает использовать Stripe Checkout (branch по `Capacitor.isNativePlatform()`).

#### Решение по 6d: пропускаем миграцию localStorage → Preferences

В первоначальном плане Stage 6d предполагал замену всех вызовов `localStorage.*` на `@capacitor/preferences` API. После аудита фактического использования это решение пересмотрено.

**Аргументы за миграцию:**
- «Capacitor-style» — нативное хранилище вместо браузерного.

**Аргументы против:**
- `localStorage` **полноценно работает** в WKWebView (часть стандарта WebView, хранится в `Library/WebKit/` контейнера приложения, переживает рестарт).
- Apple App Privacy Manifest (iOS 17+) требует декларации только для `UserDefaults` API; `localStorage` под манифест не подпадает.
- На dev-ветке есть `loadPositions()` в [app/avatar.tsx:41-49](app/avatar.tsx#L41-L49), вызываемый **синхронно** при импорте модуля для инициализации экспортируемых констант `HAIR_POSITIONS` / `FACE_POSITIONS`. Конвертация в async = top-level await или ломаются константы — оба варианта инвазивны.
- Ключи `mainwrld_pending_purchase`, `mainwrld_pending_points`, `mainwrld_pending_premium`, `mainwrld_pending_coupon` — это temporary redirect-state для веб-Stripe-флоу через `window.location.href`. В iOS-сборке весь Stripe-флоу заменяется на IAP в Stage 3, эти ключи перестанут использоваться.

**Решение:** оставляем `localStorage` как есть. `@capacitor/preferences` остаётся установленным на случай, если в Stage 3 для IAP receipt cache понадобится нативное хранилище (это правильное место для async API).

#### Capacitor 8 на SPM

Capacitor 8.x (с конца 2024) перешёл с CocoaPods на Swift Package Manager. Это означает:
- Нет `Podfile`, нет `pod install`;
- Плагины подключаются через [ios/App/CapApp-SPM/Package.swift](ios/App/CapApp-SPM/Package.swift), который Capacitor генерирует автоматически при `cap sync ios`;
- В CI достаточно `npm i && npm run build && npx cap sync ios && xcodebuild`.

#### Что НЕ закоммичено в `ios/`

Игнорятся:
- `ios/App/App/public/` — туда `cap sync` копирует `docs/`. Регенерируется каждый раз, нет смысла хранить.
- `ios/App/App/capacitor.config.json` и `config.xml` — синкятся из корневого `capacitor.config.ts`.
- `App/build`, `App/Pods`, `DerivedData`, `xcuserdata`.

Что трекается: `.xcodeproj`, `Package.swift` (SPM container), `AppDelegate.swift`, `Assets.xcassets` (заглушки иконок и сплеша — заменим в Stage 6e), `Info.plist`, `LaunchScreen.storyboard`, `Main.storyboard`, `debug.xcconfig`.

---

## 1. Что это за приложение

- **Стек:** React 19 + Vite 6 + TypeScript + Three.js / @react-three/fiber + Firebase (Auth, Firestore) + Stripe Payment Links + EmailJS (на main) / Resend через localhost Express-сервер (на dev).
- **Хостинг:** GitHub Pages (`docs/` собирается локально и коммитится; домен — [docs/CNAME](docs/CNAME) → `mainwrld.com`). Репозиторий: `mochamattel/mochamattel.github.io`.
- **Происхождение:** проект экспортирован из Google AI Studio ([metadata.json](metadata.json) до сих пор содержит описание из шаблона про splash screen). Стиль кода и характерные артефакты (мёртвый `import { on } from 'events';`, монолитные функции, шаблонные комментарии) указывают на то, что значительная часть писалась AI-ассистентом — учитывая, что в задании клиент явно просит «little to no AI generated code», это нужно иметь в виду.
- **Активные ветки:** `main` ([App.tsx](App.tsx) 6961 строк) и `dev` (App.tsx **9567 строк** + начатая декомпозиция в `app/`). Клиент просит работать на `dev`.
- **Размер фронтенда:** монолит на ~350-500 КБ исходника в одном файле плюс [firebaseService.ts](firebaseService.ts) (505 строк).
- **Активов:** ~14 МБ PNG-слоёв аватара + один [avatar.glb](public/avatar.glb) 509 КБ.

Это не «почти готовое к мобильной упаковке приложение». Это монолитный веб-SPA, в котором есть критические блокеры по App Store Review Guidelines и серьёзный архитектурный долг.

---

## 2. Жёсткие блокеры для App Store

Это пункты, по которым ревью Apple **гарантированно** или **с очень высокой вероятностью** отклонит сборку как есть.

### 2.1. Платежи через внешний Stripe Checkout — нарушение 3.1.1

Покупки внутренней валюты («points») и Premium-подписки сейчас идут через `window.location.href = ...buy.stripe.com/...`:

- [App.tsx:39-44](App.tsx#L39-L44) — захардкоженные тестовые Stripe Payment Links для пакетов points (`points_100`, `points_300`, `points_500`, `points_1000`).
- [App.tsx:47](App.tsx#L47) — placeholder для Premium-подписки (`buy.stripe.com/test_premium` — даже не настоящая ссылка).
- [App.tsx:2880](App.tsx#L2880), [App.tsx:2965](App.tsx#L2965) — переход на внешний Stripe Checkout через `window.location.href`.
- [App.tsx:19](App.tsx#L19) — тестовый Stripe publishable key `pk_test_...` в исходниках (для prod-сборки нужно `pk_live_`).

**Почему блокер:** Guideline 3.1.1 требует использовать In-App Purchase для любого цифрового контента, потребляемого внутри приложения (валюта, премиум-подписки, разблокировка книг). Редирект на внешний платёжный сайт через `window.location` для in-app потребления — отклонение.

**Что делать:** перевести *все* покупки внутри приложения на StoreKit 2 / `@capacitor-community/in-app-purchases` или RevenueCat. Stripe можно оставить только для веб-версии или для физических товаров (если такие есть).

### 2.2. Удалённо загружаемый код — нарушение 4.7 / 2.5.2

[index.html:7](index.html#L7), [index.html:81](index.html#L81), [index.html:82](index.html#L82) подгружают с CDN:

- `https://cdn.tailwindcss.com` — **критично**. Tailwind CDN это JIT-компилятор CSS, который меняет поведение приложения в рантайме. Ревью Apple в последний год массово режет такое.
- `https://js.stripe.com/v3/` — Stripe SDK. Допустим только если используется на веб-страницах вне приложения; внутри iOS-сборки нельзя.
- `https://cdn.jsdelivr.net/npm/@emailjs/browser@4/...` — тоже SDK, грузящийся с чужого CDN.
- Google Fonts и Material Icons по `<link>` — формально проходят, но лучше бандлить.

**Что делать:** перевести Tailwind на локальную сборку (PostCSS), EmailJS установить через npm, Stripe SDK либо убрать, либо подгружать только в веб-версии. Google Fonts и иконки локализовать.

### 2.3. Нет встроенного удаления аккаунта — нарушение 5.1.1(v)

- [App.tsx:1982](App.tsx#L1982) — комментарий `// Note: User account deletion from Firebase Auth would require admin SDK`. То есть автор знал, что фичи нет.
- В `SettingsView` ([App.tsx:5356+](App.tsx#L5356)) кнопки «Удалить аккаунт» нет.

**Что делать:** обязательно добавить in-app удаление аккаунта. Реализация: Cloud Function, которая принимает идентифицированный запрос, удаляет документы пользователя из Firestore (`users`, `usernames`, `relationships`, его комментарии и сообщения) и зовёт `admin.auth().deleteUser()`. Из UI — экран подтверждения с reauth.

### 2.4. Слабая модерация UGC — нарушение 1.2

В приложении пользователи публикуют книги, главы, комментарии, чаты и аватары — это полноценный UGC.

- [App.tsx:252-254](App.tsx#L252-L254) — есть фильтр `BAD_WORDS`, но это всё.
- Comments ([firebaseService.ts:436-487](firebaseService.ts#L436-L487)) и чаты ([firebaseService.ts:366-401](firebaseService.ts#L366-L401)) пишутся в Firestore без премодерации.
- Жалобы (`reports`) и блок пользователей есть ([App.tsx:1929](App.tsx#L1929), [App.tsx:863](App.tsx#L863)), но процесса разбора нет — только админка для просмотра.

Apple требует от UGC-приложений:
1. Метод фильтрации недопустимого контента;
2. Механизм репорта (есть);
3. Возможность блокировки пользователей (есть);
4. **Действия по жалобам в течение 24 часов**;
5. EULA с явным нулевым допуском к objectionable content.

**Что делать:** добавить серверную проверку контента (минимум перерасширенный фильтр; в идеале — Perspective API / OpenAI Moderation), задокументировать SLA на разбор жалоб, добавить чек-бокс согласия с EULA при регистрации.

### 2.5. Админ-роль проверяется только на клиенте

- [App.tsx:249](App.tsx#L249) — `ADMIN_USERNAMES = ['admin', 'mochamattel']` захардкожено во фронте.
- [App.tsx:814](App.tsx#L814) — `isAdmin = ADMIN_USERNAMES.includes(user.username)`.

Любой может через DevTools переписать массив и получить админскую панель с возможностью удалять чужие книги, выдавать страйки, менять цены.

**Что делать:** перенести проверку в Firestore Security Rules (custom claim или коллекция `admins`) и Cloud Functions.

### 2.6. Firestore Security Rules не видны

В репозитории нет файла `firestore.rules`. Если в боевом проекте стоит open-rule (`allow read, write: if true`) — это критическая дыра.

**Что делать:** запросить у клиента доступ к проекту Firebase, проверить правила, написать строгие правила, добавить их в репозиторий, настроить деплой через `firebase deploy --only firestore:rules`.

---

## 3. Архитектура и читаемость кода

### 3.1. Монолит на 6961 строку

Весь UI, бизнес-логика и 3D-сцена живут в одном файле [App.tsx](App.tsx). Внутри:

- ~25 view-компонентов определены inline: Splash, Login, Signup, Home (3D-мир), Explore, Library, BookDetail, Reading, Comments, Write, Publishing, MonetizationRequest, SelfProfile, Customization, OtherProfile, Notifications, NotificationSettings, BlockedUsers, DailyRewards, Cart, ChatList, ChatConversation, AdminDashboard, Settings.
- Корневой компонент `App` ([App.tsx:730+](App.tsx#L730)) держит **27 `useState`** и десятки `useCallback`.
- Нет контекста, Redux, Zustand — всё через prop drilling. `ExploreView`, `OtherProfileView`, `ReadingView` принимают по 11-12 пропсов.
- 121 вхождение `any` или `: any` — типобезопасность фактически отсутствует.
- [App.tsx:8](App.tsx#L8) — мёртвый импорт `import { on } from 'events';` (нодовский модуль, в браузере не работает; видимо, автокомплит навёл).

### 3.2. Перформанс

- На главной 3D-сцене рендерится один и тот же 509 КБ GLB на каждого онлайн-пользователя.
- Нет `React.memo` ни на одном из крупных view — любое изменение состояния (например, прилёт нотификации) перерисовывает всё дерево.
- Tailwind через CDN добавляет 150-300 мс к холодному старту.
- Нет code-splitting / `React.lazy` — весь 1.9 МБ JS грузится сразу.

### 3.3. Безопасность и приватность

- [App.tsx:4578](App.tsx#L4578) — `dangerouslySetInnerHTML` рендерит контент книги. Если HTML формируется из пользовательского текста и не санитайзится — XSS.
- [App.tsx:762-776](App.tsx#L762-L776) — глобальный перехват Cmd+C/X/V. Это анти-копипаст, но Apple может посчитать это нарушением accessibility (хотя обычно пропускают).
- Дата рождения хранится в Firestore в открытом виде ([firebaseService.ts:52](firebaseService.ts#L52)). Для приложения, доступного несовершеннолетним, нужен COPPA-флоу: parental consent, минимальный возраст 13 (или 16 для EU), App Privacy Manifest со списком собираемых данных.

### 3.4. Зависимости и уязвимости

`npm audit` (на текущих lock-файлах):

- **CRITICAL:** `protobufjs` ≤ 7.5.7 — RCE (GHSA-xq3m-2v4x-88gg). Транзитивная зависимость Firebase.
- **HIGH:** `vite` ≤ 6.4.1 — path traversal, чтение файлов через WebSocket.
- **HIGH:** `picomatch` — ReDoS.
- **MODERATE:** `postcss` < 8.5.10 — XSS.

`@react-three/fiber` и `@react-three/drei` отстают на 5-7 минорных версий от актуальных. React 19 и Three 0.174 — современные.

### 3.5. Гигиена репозитория

- Папка [docs/](docs/) (build output) закоммичена вместе с минифицированным [docs/assets/index-tEQQtIA3.js](docs/assets/index-tEQQtIA3.js) (1.9 МБ). Туда уже встроены все «секреты» — Firebase config, Stripe pk_test, EmailJS public key. Файл публично доступен на mainwrld.com — это ок для веб-сборки, но не как «исходник iOS».
- В корне валяется [docs/.DS_Store](docs/.DS_Store) и [public/.DS_Store](public/.DS_Store) — нужно почистить и добавить в `.gitignore`.
- Коммит-история короткая, ветка `dev` существует, но не используется.
- Существующий [.gitignore](.gitignore) скудный (`node_modules`, `dist/`, `.DS_Store`, `*.local`, `.env`). Нет паттернов для iOS (`ios/Pods`, `ios/build/`, `*.xcuserstate`, и т.д.).

---

## 4. Соответствие App Store — чек-лист

| Требование | Статус | Что нужно |
| --- | --- | --- |
| In-App Purchase для цифровых товаров (3.1.1) | ❌ | Заменить Stripe Payment Links на StoreKit |
| Нет удалённо загружаемого кода (4.7) | ❌ | Локализовать Tailwind/EmailJS, бандлить SDK |
| Удаление аккаунта внутри приложения (5.1.1(v)) | ❌ | Cloud Function + UI |
| Модерация UGC (1.2) | ⚠️ | Премодерация контента, разбор жалоб за 24ч, EULA |
| Privacy Policy URL | ❌ | Создать и захостить |
| Terms of Service / EULA | ❌ | Создать и подписать в флоу регистрации |
| App Privacy «Nutrition Label» | ❌ | Заполнить в App Store Connect |
| Privacy Manifest (`PrivacyInfo.xcprivacy`) | ❌ | Сгенерировать |
| Серверная авторизация роли админа | ❌ | Firestore Rules + Cloud Functions |
| Firestore Security Rules | ❓ | Проверить, есть ли в проекте Firebase вообще |
| App Tracking Transparency, если есть трекинг | ⚠️ | Уточнить у клиента (Google AdSense `ads.txt` в репо, но это веб) |
| Безопасные зоны iPhone (notch / Dynamic Island) | ⚠️ | CSS использует `100vh`, нужно `env(safe-area-inset-*)` |
| Иконки и сплеш для iOS | ❌ | Сгенерировать из логотипа |
| Бандл-ID / Apple Developer аккаунт | ❌ | Запросить у клиента |

---

## 5. План публикации через Capacitor

Делю на этапы. Время — реалистичная оценка по чистым часам (а не по календарю), при условии что у клиента уже есть платный Apple Developer Program ($99/год) и доступ к проекту Firebase.

### Этап 0. Подготовка (1-2 ч)
1. Получить от клиента: Apple Developer аккаунт, доступ к Firebase Console (Editor), доступ к Stripe Dashboard, желаемый bundle ID (например, `com.mocha.mainwrld`).
2. Создать App ID и provisioning profiles в Apple Developer.
3. Завести новую запись приложения в App Store Connect.
4. Перенести репозиторий в новую ветку `feature/capacitor`, отделить от GitHub Pages.

### Этап 1. Чистка и стабилизация веб-сборки (8-12 ч)
1. Удалить мёртвый импорт [App.tsx:8](App.tsx#L8).
2. Локализовать Tailwind: установить `tailwindcss`, `postcss`, `autoprefixer` через npm, переписать [index.html](index.html), удалить CDN-скрипт, перенести конфиг из `<script>` в `tailwind.config.js`.
3. Установить EmailJS через npm (`@emailjs/browser`), удалить CDN.
4. Решить со Stripe.js: для iOS-сборки убрать; для веба оставить.
5. Локализовать Google Fonts (`@fontsource/inter`, `@fontsource/fredoka-one`) и Material Icons.
6. Вынести все секреты в `.env`: `VITE_FIREBASE_*`, `VITE_STRIPE_PK`, `VITE_EMAILJS_*`. Перестать коммитить `docs/`.
7. Обновить уязвимые зависимости: Vite до 6.4.x+ или 7.x; принудительно `firebase`'s peer protobufjs до 7.5.8+ через `overrides` в package.json.
8. Запустить `npm audit`, добиться нуля HIGH/CRITICAL.

### Этап 2. Серверная безопасность Firebase (8-12 ч)
1. Написать `firestore.rules`: чтение `users` только аутентифицированным, запись только владельцу, админский доступ через custom claim `admin`.
2. Перенести `ADMIN_USERNAMES` в Firebase custom claims, выставить через Cloud Function.
3. Cloud Function `deleteAccount` — для требования 5.1.1(v).
4. Cloud Function `moderateContent` — для UGC: проверка комментариев/глав через OpenAI Moderation API или Perspective API при `onCreate`.
5. Firestore indices для запросов вида `where('admirer', '==', x)`.

### Этап 3. Платежи через IAP (16-24 ч)
1. Создать в App Store Connect IAP-продукты: `points_100`, `points_300`, `points_500`, `points_1000`, `premium_monthly`.
2. Установить `@capacitor-community/in-app-purchases` (или RevenueCat для упрощения receipt validation).
3. Заменить ветку оплаты points / premium на нативный IAP: при тапе вызывать `Purchases.purchase(productId)`, по успеху — Cloud Function `creditPoints` с верификацией receipt у Apple.
4. На вебе оставить Stripe (через `Capacitor.getPlatform() === 'web'`).
5. Учесть Apple commission 30% (или 15% для small business) при ценообразовании.

### Этап 4. Архитектурный минимум для устойчивости (опционально, см. вопрос клиенту в разделе 6)
Без полноценного рефакторинга App Store пропустит, но дальнейшее сопровождение будет болезненным. Минимальный набор:
1. Разбить [App.tsx](App.tsx) хотя бы на 5-7 файлов: `views/`, `components/`, `hooks/`, `services/firebase.ts`, `services/payments.ts`, `state/`.
2. Завести React Context для `user`, `books`, `notifications` — убрать prop drilling.
3. `React.memo` на тяжёлые view, `useMemo` на отсортированные списки.
4. `React.lazy` + Suspense для view-роутов — сократит cold start.
5. Постепенно вырезать `any` и подставлять типы из Firestore-схемы.

Полный рефакторинг — 60-100 часов. Минимальная чистка — 16-24 часа.

### Этап 5. Мобильная адаптация UI (8-12 ч)
1. Safe-area insets: заменить `100vh` на `100dvh` + `env(safe-area-inset-*)`, проверить notch на iPhone 14/15/16 Pro.
2. Tap targets ≥ 44pt, убрать `:hover`-only состояния где они эксклюзивны.
3. Хардварная клавиатура / iOS keyboard: обработать `Keyboard.willShow`.
4. Жесты iOS back-swipe против в-апп-навигации.
5. Производительность Three.js: уменьшить количество онлайн-аватаров на сцене, переиспользовать инстансы (`instancedMesh`), снизить разрешение текстур.
6. Оптимизация ассетов: 14 МБ PNG → конвертация в WebP или PNG-крашинг (`pngquant`); пересборка `avatar.glb` через Draco/Meshopt.

### Этап 6. Упаковка Capacitor (4-6 ч)
1. `npm i @capacitor/core @capacitor/cli @capacitor/ios`.
2. `npx cap init MainWRLD com.mocha.mainwrld --web-dir=docs`.
3. `npx cap add ios`, добавить `ios/` в `.gitignore` (только Pods/build).
4. Подобрать плагины: `@capacitor/preferences` (вместо localStorage), `@capacitor/keyboard`, `@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/share`, `@capacitor/app` (для back-кнопки и deep links).
5. Заменить вызовы `localStorage` ([App.tsx:302, 1412, и т.д.](App.tsx#L302)) на `Preferences` API.
6. Прописать `Info.plist`: `NSCameraUsageDescription` (если будет), `NSPhotoLibraryUsageDescription`, `ITSAppUsesNonExemptEncryption=false`, `NSAppTransportSecurity` (Firebase нужен).
7. Сгенерировать иконки и сплеш через `@capacitor/assets` (нужен 1024×1024 PNG).
8. Подключить Privacy Manifest (`PrivacyInfo.xcprivacy`) — описать использование `UserDefaults`, `FileTimestamp`, `SystemBootTime`.

### Этап 7. Юридическая обвязка (4-6 ч, в основном силами клиента)
1. Privacy Policy (захостить на mainwrld.com/privacy).
2. EULA / Terms of Service (можно стандартный Apple EULA + addendum по UGC).
3. App Privacy Nutrition Label в App Store Connect: email, имя, дата рождения, content, identifiers, usage data.
4. Поддержка-email, маркетинг-URL, скриншоты под все iPhone-размеры (6.7", 6.5", 5.5").

### Этап 8. Тестирование и сабмит (8-12 ч)
1. TestFlight Internal с реальным устройством.
2. Прогон чек-листа App Store: IAP в sandbox, удаление аккаунта, репорт+блок, модерация, доступ без логина (если нужен Demo Account для Apple-ревьювера).
3. Подготовить демо-аккаунт с парой опубликованных книг — Apple часто отказывает, если ревьювер не может зайти.
4. Отвечать на запросы App Review (обычно 1-3 итерации, 24-48ч между ними).

### Итоговая оценка часов
| Этап | Часы |
| --- | --- |
| 0. Подготовка | 1-2 |
| 1. Чистка веба | 8-12 |
| 2. Firebase security | 8-12 |
| 3. IAP | 16-24 |
| 4. Архитектура (минимум) | 16-24 |
| 5. Мобильная UI | 8-12 |
| 6. Capacitor | 4-6 |
| 7. Юридическое | 4-6 |
| 8. Тест + сабмит | 8-12 |
| **Всего** | **73-110 часов** |

Календарно: при 20 часах в неделю — 4-6 недель, плюс 1-2 недели на ревью Apple. Без рефакторинга (этап 4) — нижняя граница ~60 часов, но проект останется в плохом состоянии для дальнейшей поддержки.

---

## 6. Вопросы клиенту перед стартом

Главное — **до начала кодинга** проговорить расхождение по IAP и срокам. Остальные вопросы — второй приоритет.

1. **«In-app purchases are in the app» — на самом деле это не IAP, а ссылки на Stripe Checkout.** На ветке `dev` это [app/config.ts](app/config.ts) (`STRIPE_PAYMENT_LINKS`, `STRIPE_PREMIUM_PAYMENT_LINK`). Это нарушение 3.1.1 — Apple отклонит. Для iOS-сборки нужно либо:
   - (a) полноценно переписать на StoreKit / RevenueCat (+25-35 часов работы, +15-30% комиссии Apple), или
   - (b) **в iOS-версии скрыть кнопки покупки и оставить приложение как «reader-only»**, а монетизацию оставить только на mainwrld.com.
   Что предпочтительнее?
2. **Хочет ли клиент рефакторинг кода для улучшения читаемости?** [App.tsx](App.tsx) на 6961 строку (на dev уже 9567) с 27 useState в корне и 121 `any` — App Store такое пропустит, но любая будущая правка будет стоить в 3-5 раз дороже, чем после декомпозиции. Варианты:
   - (a) **минимальная чистка** в рамках iOS-проекта (~16-24 ч): только то, что нужно для прохождения App Store;
   - (b) **полная декомпозиция** отдельным этапом (~60-100 ч): разбиение на модули, контексты вместо prop drilling, типизация, удаление `any`;
   - (c) **оставить как есть** и не трогать чужую структуру.
   На dev ветке уже виден начатый рефакторинг (папка `app/`), но процесс не завершён, и App.tsx стал не меньше, а больше — это значит, что без явного плана декомпозиция может затянуться.
3. **Доступ к Firebase Console:** Можно ли получить роль Editor, чтобы добавить Firestore Security Rules и Cloud Functions? Сейчас в репозитории правил нет, и неясно, какие правила стоят на проде.
4. **Apple Developer:** клиент написала «I have the apple developer account ready». Нужно: подтверждение, что аккаунт платный ($99/год), доступ через App Store Connect (роль Admin или Developer), желаемый Bundle ID (`com.mochamattel.mainwrld`?).
5. **Стандарт «no AI generated code» из задания vs текущий код.** В задании клиент явно просит избегать AI-генерации, но существующий код несёт характерные признаки AI-кодинга (мёртвые импорты, дубли, монолитность). Это её собственный код или результат работы предыдущего AI-помощника? И как клиент относится к тому, что я буду местами использовать AI-инструменты для рефакторинга? Если строго руками — это +20-30% времени.
6. **Модерация UGC:** готов ли клиент платить за OpenAI Moderation API (несколько центов на 1000 проверок)? Кто будет разбирать жалобы — она лично или модератор?
7. **Возраст:** есть ли пользователи младше 13? Если да — нужен COPPA-флоу (parental consent), это +20-30 часов и серьёзная переделка регистрации.
8. **Что делать с веб-версией mainwrld.com?** Поддерживаем одну кодовую базу с ветвлением по `Capacitor.getPlatform()`, или iOS отделяется в отдельный пакет?
9. **Тестовые Stripe-ключи и Firebase config в публичном [docs/assets/index-tEQQtIA3.js](docs/assets/index-tEQQtIA3.js).** Эти ключи открыты на mainwrld.com прямо сейчас. По Stripe pk_test это не критично, по Firebase API key — тоже не «секрет», но в любом случае нужно навести порядок с .env.
10. **AdSense:** в `ads.txt` есть Google AdSense publisher ID. Показывается ли реклама внутри приложения? Это требует ATT-промпта и отдельной декларации в App Privacy.
11. **Resend-сервер на `localhost:3001` на ветке `dev`** ([server.js](server.js), [app/config.ts](app/config.ts)). Где он будет хоститься в production? Это блокер не для App Store, но для работы welcome-писем — иначе при первом запуске после деплоя сломается регистрация.

---

## 7. Что бы я сказал клиенту в первой переписке (после аудита)

Драфт ответа на Upwork. Тон — конструктивный, без попыток ренеговейта по цене. Цель — выровнять ожидания и получить нужные доступы.

> Hey Mocha, finished going through the repo (dev branch). Quick rundown of what I found and what I'm planning to do.
>
> **What's actually in the code today.** The current «in-app purchases» are Stripe Checkout links (`window.location.href = "https://buy.stripe.com/..."`) for points and Premium. Apple rejects that under rule 3.1.1 — digital goods inside the app have to go through StoreKit. So as part of this job I'll be rebuilding the points and Premium purchase flow on top of Apple IAP (likely via RevenueCat for cleaner receipt validation). Apple will take 15-30% of those transactions, just so you're aware of the economics.
>
> **A few more App Store blockers I'll fix:**
> - Tailwind, Stripe.js, and EmailJS are loaded from CDN at runtime — Apple rejects that (rule 4.7). I'll bundle them locally.
> - There's no in-app account deletion (rule 5.1.1) — I'll add a Settings → Delete Account flow backed by a Cloud Function.
> - The admin check (`ADMIN_USERNAMES.includes(user.username)`) lives only in the browser, so anyone could grant themselves admin in DevTools. I'll move that to Firestore Security Rules + custom claims.
> - UGC moderation: I'll add an automatic content filter at write-time plus an EULA acceptance step at signup (rule 1.2).
> - Safe-area + dynamic viewport handling for iPhone notch/Dynamic Island.
>
> **About the code structure.** App.tsx is around 9.5k lines on dev with most views and state inlined. App Store will pass it as-is, but maintenance is painful. Do you want me to refactor for readability while I'm in there (split into modules, add a Context for shared state, remove the `any` types), or only touch what's strictly required for the iOS submission? Either works — I just want to be transparent because it does affect time. Default is «only what's required.»
>
> **A heads-up on timing.** When I quoted «1 week to submit,» I was thinking of a standard web→Capacitor wrap. The compliance work I described above plus the IAP rebuild realistically takes longer than a calendar week. I'm still committing to the $200 — I want this in my portfolio — but I'd ask for a more realistic delivery window: ~1 week to get a working TestFlight build, then 2-3 more weeks of polish + Apple review iterations (Apple usually wants a couple of back-and-forths). Total ~4-6 weeks from kickoff to live in the Store. Does that work?
>
> **What I need from you to start:**
> 1. Confirm the iOS scope: full IAP rebuild + everything above. ✅ / ❌
> 2. Apple Developer access: invite `[my Apple ID]` to your App Store Connect team as Admin or App Manager.
> 3. Firebase Console: add me as Editor on the `mainwrld-f7acf` project (I need to add Security Rules and Cloud Functions).
> 4. Stripe: keep the existing Stripe for web only — confirm.
> 5. Bundle ID preference: I was going to use `com.mochamattel.mainwrld` unless you have something else in mind.
> 6. UGC age: any users under 13? If yes, COPPA changes scope significantly.
> 7. The Resend server on dev is running on `localhost:3001` — where are you planning to host it in production?
>
> Once I have these, I'll create a `feature/ios` branch off `dev` and start with the compliance fixes.
