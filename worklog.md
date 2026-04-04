# MUMAA Platform - Worklog

## Context
Continuing from a previous session. Bug fix (nannies.map) applied. Now implementing production-ready features.

---
Task ID: 0
Agent: Main
Task: Fix nannies.map runtime error + install packages

Work Log:
- Fixed FindNannies.tsx line 80-81: Added `Array.isArray()` check before `setNannies()`
- Installed production packages: nodemailer, stripe, rate-limiter-flexible, jsonwebtoken, web-push
- Installed dev type packages: @types/nodemailer, @types/jsonwebtoken, @types/web-push

Stage Summary:
- Bug fixed with defensive `Array.isArray()` guard
- All production dependency packages installed successfully
- Ready for feature implementation

---
Task ID: 1
Agent: email-service
Task: Implement production email service with Nodemailer

Work Log:
- Created `src/lib/email.ts` — comprehensive EmailService class with:
  - Configurable SMTP transport via env vars (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM)
  - Console fallback logging when no SMTP is configured (dev mode)
  - Connection pooling for production throughput (max 5 connections, rate limiting)
  - `sendWelcomeEmail()` — Welcome to MUMAA with feature list and CTA
  - `sendOTPEmail()` — 6-digit OTP with prominent display and expiry warning
  - `sendPasswordResetEmail()` — Reset link with expiry notice and URL fallback
  - `sendCallReminderEmail()` — Call details table with nanny/parent names, tips, and join link
  - `sendSubscriptionEmail()` — Plan confirmation with ₹ pricing, feature list, trial badge
  - Generic `sendEmail()` dispatcher method for API routing
  - Branded HTML email templates with MUMAA colors (rose-500 #f43f5e, pink-600 #db2777, emerald-500 #10b981), gradient header, inline CSS, MSO compatibility
  - In-memory OTP store with 5-minute expiry, auto-cleanup interval
  - `generateOTP()`, `verifyOTP()`, `hasActiveOTP()` methods for OTP lifecycle
  - Full TypeScript types exported: EmailType, EmailPayload, WelcomeEmailData, OTPEmailData, PasswordResetEmailData, CallReminderEmailData, SubscriptionEmailData
  - Exported as singleton `emailService` instance

- Created `src/app/api/email/send/route.ts` — POST endpoint:
  - Accepts `{ userId, type, data }` body
  - Validates email type against whitelist
  - Looks up user from DB via Prisma
  - Dispatches to email service
  - Returns messageId on success

- Created `src/app/api/email/send-otp/route.ts` — POST endpoint:
  - Accepts `{ email, purpose }` (purpose: signup, reset-password, login)
  - Email format validation, purpose validation
  - Rate limiting: 1 OTP per minute per email/purpose combo
  - Checks for existing active OTP before generating new one
  - Looks up user name for personalization (fallback for new signups)
  - OTP included in response only in non-production environments
  - Sends via email service with purpose-specific description

- Created `src/app/api/email/verify-otp/route.ts` — POST endpoint:
  - Accepts `{ email, otp, purpose }`
  - Validates 6-digit OTP format and purpose
  - Verifies and consumes OTP (single-use, deleted on success)
  - Returns verified boolean

- All new files pass ESLint (no lint errors from new code; pre-existing error in analytics/route.ts is unrelated)
- Used `import { db } from '@/lib/db'` for database access throughout
- MUMAA branding throughout — no z.ai references
- Indian Rupee ₹ used for subscription pricing

Stage Summary:
- Complete production email service with 5 email types, branded templates, SMTP + console fallback
- 3 API routes: general send, OTP send (with rate limiting), OTP verify
- In-memory OTP store with 5-minute expiry and auto-cleanup
- Singleton export pattern, full TypeScript types
- Ready for SMTP configuration via environment variables

---
Task ID: 2
Agent: stripe-integration
Task: Implement real Stripe payment integration

Work Log:
- Created `src/lib/stripe.ts` — Stripe client singleton and helpers:
  - Lazy Stripe instance initialization with `process.env.STRIPE_SECRET_KEY`
  - `isStripeConfigured` flag for graceful mock-mode fallback when keys absent
  - `getStripe()` returns configured instance or `null`
  - `createCheckoutSession()` — creates Stripe Checkout Session with line items, 7-day trial, success/cancel URLs, metadata (userId, plan)
  - `createPortalSession()` — creates Stripe Customer Portal session for subscription management
  - `verifyWebhookSignature()` — verifies raw body + stripe-signature header using `STRIPE_WEBHOOK_SECRET`
  - Exports: `PLAN_PRICES_INR` (BASIC ₹499, PRO ₹999), `PLAN_PRICE_IDS` (from env vars), `PLAN_LABELS`, `TRIAL_DAYS` (7)
  - TypeScript types: `PlanType`, `CreateCheckoutSessionParams`, `CreatePortalSessionParams`, `WebhookVerificationParams`
  - API version: `2025-06-30.basil`, `typescript: true`
  - Console warning logged when Stripe keys not configured

- Modified `src/app/api/payments/checkout/route.ts` — Real Stripe checkout with fallback:
  - When Stripe configured: calls `createCheckoutSession()`, returns real `session.url`, `stripe_payment_intent_id`, `stripe_customer_id`
  - When not configured: uses existing mock behavior (`cs_mock_` session IDs) — fully backward compatible
  - Stores Stripe IDs in notification `data` JSON field (`stripeCustomerId`, `stripeSubscriptionId`, `stripePaymentIntentId`)
  - 7-day free trial on both real and mock paths
  - Creates notification with mode indicator (`stripe` vs `mock`)

- Created `src/app/api/payments/webhook/route.ts` — Stripe webhook handler:
  - Uses `req.text()` for raw body (critical for signature verification in Next.js)
  - Verifies webhook signature via `verifyWebhookSignature()`
  - Handles 5 event types:
    - `checkout.session.completed` — activates subscription, creates success notification
    - `customer.subscription.updated` — maps Stripe statuses (active/trialing/canceled/unpaid/past_due) to DB statuses (ACTIVE/EXPIRED/CANCELLED), updates trial/period dates
    - `customer.subscription.deleted` — marks subscription CANCELLED, creates FREE fallback subscription with 7-day trial
    - `invoice.payment_succeeded` — creates "Payment Received" notification with ₹ amount
    - `invoice.payment_failed` — marks subscription EXPIRED, creates "Payment Failed" notification with retry info
  - Returns 200 for all events (including unhandled ones) per Stripe best practices
  - Graceful handling when Stripe not configured

- Created `src/app/api/payments/portal/route.ts` — Customer portal endpoint:
  - POST with `{ userId }` body
  - Looks up Stripe customer ID from notification `data` JSON
  - Creates Stripe Customer Portal session via `createPortalSession()`
  - Returns portal URL for subscription management, payment method updates, invoice viewing
  - Returns 503 when Stripe not configured (portal requires real Stripe)

- Created `src/app/api/payments/verify/route.ts` — Payment verification endpoint:
  - GET with `session_id` query parameter
  - When Stripe configured: retrieves real session from Stripe API with expanded `subscription` and `customer`
  - Returns comprehensive payment details: paymentStatus, sessionStatus, subscriptionStatus, trialEnd, currentPeriodEnd, dbSubscription
  - When not configured: mock verification (checks `cs_mock_` prefix)

- Updated `src/app/api/payments/success/route.ts` — Stripe-aware success handler:
  - When Stripe configured: verifies session via Stripe API, returns plan/subscription/customer details
  - When not configured: mock verification (backward compatible)
  - Returns user-friendly welcome message with plan name

- Updated `src/app/api/subscriptions/upgrade/route.ts` — Stripe-aware upgrade:
  - When Stripe configured: creates new Checkout Session for upgraded plan with trial
  - Reuses existing Stripe customer ID from notifications if available
  - Stores upgrade metadata in notification data
  - When not configured: existing mock behavior preserved

- Updated `src/app/api/subscriptions/cancel/route.ts` — Stripe-aware cancellation:
  - When Stripe configured: cancels subscription on Stripe via `stripe.subscriptions.cancel()`
  - Searches notification data for `stripeSubscriptionId` across recent notifications
  - Always performs local DB cancellation regardless of Stripe status
  - Graceful error handling if Stripe subscription already cancelled

- All new/modified files pass ESLint with zero errors
- Currency: INR (₹) throughout — BASIC ₹499/mo, PRO ₹999/mo
- No z.ai branding — MUMAA platform branding only
- Full backward compatibility: all existing functionality works when Stripe not configured

Stage Summary:
- Complete Stripe integration with 8 files created/modified
- 5 API routes: checkout, webhook, portal, verify, success
- 2 subscription routes updated: upgrade, cancel
- Stripe client singleton with 3 helper functions
- Graceful fallback to mock mode when `STRIPE_SECRET_KEY` not set
- Webhook handles 5 Stripe event types with proper DB updates and notifications
- Customer Portal support for subscription self-service
- 7-day free trial support on all checkout flows
- Indian Rupee (INR) currency throughout

---
Task ID: 5
Agent: rate-limiting
Task: Implement API rate limiting

Work Log:
- Created `src/lib/rate-limit.ts` — Rate limiting system:
  - Uses `rate-limiter-flexible` with `RateLimiterMemory` store (no Redis needed)
  - 5 rate limiter types with different thresholds:
    - **auth**: 5 requests/minute (login, signup, forgot-password) with 2-min block
    - **search**: 30 requests/minute (nannies, browse) with 30-sec block
    - **general**: 60 requests/minute (calls, misc) with 15-sec block
    - **payment**: 10 requests/minute (Stripe/checkout) with 2-min block
    - **upload**: 5 requests/minute (file uploads) with 2-min block
  - `checkRateLimit(req, type)` function returns `{ success, headers }` for use in route handlers
  - Dual-key identification: userId (from Bearer token if UUID) or IP fallback
  - IP extraction from `X-Forwarded-For`, `X-Real-IP`, or fallback
  - Standard rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
  - `Retry-After` header in 429 responses
  - `console.warn` logging on rate limit violations
  - Graceful fallback to allow request on unexpected errors
  - `isExemptFromRateLimit()` utility for health checks and static routes
  - Exported TypeScript types: `RateLimitType`, `RateLimitResult`

- Created `src/lib/security-headers.ts` — Security headers utility:
  - `getSecurityHeaders()`: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, CSP, Permissions-Policy, HSTS
  - `getCorsHeaders()`: Allow-Origin, Allow-Methods, Allow-Headers, Allow-Credentials, Max-Age
  - `getStandardHeaders()`: Combined security + CORS headers

- Created `src/middleware.ts` — Next.js global middleware:
  - Applies security headers to all responses
  - Handles CORS preflight (OPTIONS) with 204 No Content
  - Adds CORS headers to all `/api/` routes
  - Non-blocking: never rejects requests, only adds headers
  - Matcher excludes static assets (_next/static, _next/image, favicon, images)

- Applied rate limiting to 7 existing API routes:
  - `src/app/api/auth/login/route.ts` — auth rate limit (5/min)
  - `src/app/api/auth/signup/route.ts` — auth rate limit (5/min)
  - `src/app/api/auth/forgot-password/route.ts` — auth rate limit (5/min)
  - `src/app/api/nannies/route.ts` — search rate limit (30/min)
  - `src/app/api/calls/instant/route.ts` — general rate limit (60/min)
  - `src/app/api/calls/schedule/route.ts` — general rate limit (60/min)
  - `src/app/api/payments/checkout/route.ts` — payment rate limit (10/min)

- Each route follows consistent pattern:
  ```typescript
  const { success, headers } = await checkRateLimit(req, 'auth');
  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers }
    );
  }
  ```
- Rate limit headers also included in successful responses

- Fixed pre-existing TypeScript error in `src/app/api/admin/analytics/route.ts` (select field types)

Stage Summary:
- 3 new utility files created: rate-limit.ts, security-headers.ts, middleware.ts
- 7 API routes updated with rate limiting protection
- Memory-based rate limiting with no external dependencies
- Dual identification (userId + IP) for precise per-user and per-IP limiting
- Standard HTTP rate limit headers on all responses
- Global security and CORS headers via middleware
- All new/modified code passes ESLint with zero new errors
- No z.ai branding, MUMAA platform only

---
Task ID: 3
Agent: jitsi-integration
Task: Implement real WebRTC video calls with Jitsi Meet

Work Log:
- Created `src/lib/jitsi.ts` — Jitsi Meet configuration module:
  - `JITSI_DOMAIN` configurable via `NEXT_PUBLIC_JITSI_DOMAIN` (defaults to `meet.jit.si`)
  - `generateRoomName(callId)` — generates `mumaa-{callId}` room names
  - `getJitsiScriptSrc()` — builds CDN URL for `external_api.js`
  - `JITSI_CONFIG_OVERWRITE` — disables recording, enables chat/screen sharing/tile view/captions, VP9 preferred, no pre-join page
  - `JITSI_INTERFACE_OVERWRITE` — shows only essential toolbar buttons (mic, camera, desktop, tileview, chat, hangup, settings, raisehand, fullscreen), hides Jitsi watermark and promotional close page
  - `JITSI_EVENTS` — all Jitsi event constants used by the wrapper
  - `JitsiMeetExternalAPI` interface definition for type safety
  - `JITSI_BRANDING` configuration object

- Created `src/components/videocall/JitsiCall.tsx` — Jitsi Meet wrapper component:
  - Dynamic script loading from CDN with cache check (`window.JitsiMeetExternalAPI`)
  - Loading states: `idle` → `loading-script` → `initializing` → `ready` (or `error`)
  - Loading UI with MUMAA-branded spinner (rose-500) and contextual messages
  - Error UI with retry button (max 2 retries) and cancel option
  - Full Jitsi event handling: video conference joined, participant joined/left, audio/video mute, screen sharing, conference left, ready to close
  - Participant count tracking via `getNumberOfParticipants()`
  - Proper cleanup: `dispose()` on unmount, container innerHTML cleared
  - Page visibility tracking: warns user when they switch tabs during active call
  - Exposes `endCall` method via DOM element ref pattern for parent component access
  - Call duration calculated from join time to end time
  - Props: roomName, userName, userEmail, userAvatar, onCallEnd, onError, onParticipantsChange, onAudioMutedChange, onVideoMutedChange, onScreenShareChange, onMeetingReady

- Replaced `src/components/videocall/VideoCallScreen.tsx` — Full Jitsi integration:
  - Connecting state: preserved existing UI with pulse animation and cancel button
  - Active state: `JitsiCall` component fills entire viewport; overlay top bar shows CallTimer, participant count, and copyable room name; overlay bottom bar shows chat toggle, end call, and camera toggle buttons
  - Jitsi handles all media (audio, video, screen sharing) internally — no manual `getUserMedia` needed
  - On call end: persists duration to database via PUT `/api/calls/{id}/end`, transitions to ended state
  - Ended state: preserved existing review/rating UI with StarRating, Textarea, submit to POST `/api/calls/{id}/review`
  - Room name resolution: uses `callRoomId` directly if already `mumaa-` prefixed, otherwise wraps with `generateRoomName()`
  - Back to dashboard resets all state cleanly
  - User display name pulled from `useAuthStore`

- Updated `src/app/api/calls/instant/route.ts` — Room ID generation:
  - Changed from raw UUID to `mumaa-{shortened-uuid}` format (12-char hex from UUID, hyphens stripped)
  - Callers on both sides join the same Jitsi room

- Updated `src/app/api/calls/[id]/end/route.ts` — Accept duration from frontend:
  - Accepts `{ duration }` from request body (frontend-provided, more accurate from Jitsi)
  - Falls back to server-side calculation (endedAt - startedAt) if duration not provided
  - Calculates price based on nanny hourly rate × duration in hours
  - Updates nanny stats (totalSessions, totalEarnings)
  - Creates notifications for both parent and nanny with formatted duration display
  - Duration display: "X minutes" for ≥60s, "X seconds" for <60s

- All new/modified files pass ESLint with zero new errors
- No z.ai branding — MUMAA platform only with rose-500 primary color
- Preserved existing components: IncomingCallDialog, CallTimer, StarRating, ChatPanel, VideoPlaceholder
- Mobile-responsive design
- Page visibility change handling
- Framer motion animations preserved

Stage Summary:
- Real WebRTC video calls via Jitsi Meet External API
- 3 files created: jitsi.ts config, JitsiCall.tsx wrapper, updated VideoCallScreen.tsx
- 2 API routes updated: instant call (room ID format), end call (duration from frontend)
- Dynamic CDN script loading with retry logic and fallback error UI
- Full event system for participants, mute, screen sharing, and call lifecycle
- Room naming convention: `mumaa-{shortened-uuid}`
- Database persistence of call duration, price calculation, and notifications on call end
- Review/rating submission to API on call ended screen

---
Task ID: 7
Agent: admin-analytics
Task: Enhance admin analytics dashboard

Work Log:
- Created `src/app/api/admin/analytics/route.ts` — Comprehensive analytics API:
  - GET endpoint with query params: `period` (daily/weekly/monthly), `from`, `to` for date range filtering
  - Returns 14+ data categories in a single response for efficiency
  - Overview stats: total users, parents/nannies count, revenue (total/this month/last month), growth %, conversion rate, avg call duration, avg rating, retention rate, calls this month
  - Call stats: total, completed, cancelled, active, pending, no-show counts
  - Subscription distribution (FREE/BASIC/PRO) with colors for pie charts
  - Call status distribution with colors for pie charts
  - User growth data grouped by period with parent/nanny/total split
  - Revenue data grouped by period
  - Call volume over time with completed/cancelled/total per period
  - Busiest hours (24-hour histogram from completed call start times)
  - Top 10 rated nannies with name, email, rating, sessions, earnings, experience
  - Recent 20 activity events (latest signups)
  - Retention rate calculated from users with 2+ completed calls
  - Growth percentages computed vs previous period

- Created `src/lib/export-csv.ts` — CSV export utility:
  - `objectsToCsv()` — converts array of objects to CSV string with proper escaping
  - `downloadCsv()` — triggers browser download via Blob URL
  - `exportToCsv()` — all-in-one convenience function with custom header support
  - Handles commas, quotes, and newlines in CSV values correctly

- Rewrote `src/components/dashboard/admin/AdminDashboard.tsx` — Enhanced overview dashboard:
  - 6 stat cards (up from 4): Total Users (with growth %), Active Subscriptions (with conversion rate), Total Revenue (with growth %), Avg Call Duration, Calls This Month, Platform Rating
  - Growth indicators with TrendingUp/TrendingDown icons and color-coded percentages
  - User Growth LineChart with parent/nanny/total split (3 lines)
  - Revenue BarChart with rose-colored bars and rounded tops
  - Subscription Breakdown donut PieChart with legend (FREE/BASIC/PRO)
  - Call Statuses donut PieChart with legend (Completed/Cancelled/Active/Pending)
  - Top Nannies table with name, rating badge, sessions count, earnings
  - Recent Activity timeline with role badges and relative timestamps
  - Custom Tooltip component for all recharts with styled popover
  - Export Report button (generates CSV of top nannies)
  - "Detailed Analytics" navigation button linking to analytics page
  - Full loading skeleton state
  - Error state with retry button
  - Framer Motion staggered animations on stat cards

- Created `src/components/dashboard/admin/AdminAnalytics.tsx` — Detailed analytics page:
  - Date range picker (from/to date inputs)
  - Period selector (Daily/Weekly/Monthly) using shadcn/ui Select
  - 4 KPI summary cards with growth indicators
  - Revenue Over Time BarChart
  - User Growth LineChart (parent/nanny/total)
  - Call Volume AreaChart (total/completed/cancelled as stacked areas)
  - Busiest Hours BarChart (filtered to hours with activity)
  - Subscription Breakdown PieChart
  - Call Statuses PieChart
  - Engagement Metrics card with progress bars (conversion rate, retention rate, avg rating) and summary stats
  - Top Nannies table with column sorting (name/rating/sessions/earnings/experience) and sort direction indicators
  - Recent Activity timeline
  - 3 export buttons: Full Report CSV, Nannies CSV, Revenue CSV
  - Back navigation to admin dashboard
  - Responsive grid layout (1-col mobile, 2-col desktop)
  - Loading skeletons and error state with retry

- Updated `src/app/page.tsx`:
  - Added `import AdminAnalytics from '@/components/dashboard/admin/AdminAnalytics'`
  - Changed `case 'analytics'` in AdminDashboardRouter to render `<AdminAnalytics />` instead of `<AdminDashboard />`

Stage Summary:
- 4 new/modified files created for comprehensive admin analytics
- Analytics API returns 14+ data categories with date range and period filtering
- AdminDashboard (overview) now has 6 stat cards, 4 chart types, nannies table, activity timeline
- AdminAnalytics (detailed page) has full filtering, 6 chart types, sortable table, engagement metrics, 3 export options
- CSV export utility supports custom headers and proper value escaping
- All new code passes TypeScript type checking and ESLint with zero new errors
- Uses ₹ (Indian Rupee) throughout, MUMAA branding only
- recharts library used: BarChart, LineChart, PieChart, AreaChart, all wrapped in ResponsiveContainer

---
Task ID: 6
Agent: media-upload
Task: Implement CDN-ready media upload system

Work Log:
- Created `src/lib/storage.ts` — Storage abstraction layer:
  - `StorageService` class with `upload()`, `delete()`, `getSignedUrl()`, `getFileUrl()`, `exists()` methods
  - CDN mode switchable via `STORAGE_TYPE=cdn` env var with `STORAGE_CDN_URL` prefix
  - Local mode: saves to `public/uploads/{folder}/{uniqueName.ext}`
  - URL format: `/uploads/{folder}/{uniqueName.ext}` (local) or `{CDN_URL}/{folder}/{uniqueName.ext}` (CDN)
  - Image processing via `sharp`: resize to max 800x800, compress to quality 80, convert to WebP
  - Document support: PDF passthrough (no processing)
  - Dual validation: both MIME type and file extension checked
  - Max file size: 5MB images, 10MB documents
  - UUID-based unique filenames with timestamp prefix to avoid conflicts
  - Path traversal protection in delete()
  - Singleton pattern with `getStorageService()` export
  - TypeScript types: `UploadOptions`, `UploadResult`, `StorageConfig`

- Created `src/app/api/upload/route.ts` — File upload endpoint:
  - POST multipart/form-data with `file` field and optional `folder` field
  - Single and batch upload support (up to 10 files per request)
  - Returns 413 for oversized files, 415 for unsupported types
  - For single file: returns `{ url, key, size }` flat response
  - For batch: returns `{ results, errors }` array response
  - Image processing via StorageService (resize + compress)

- Created `src/app/api/upload/delete/route.ts` — File deletion endpoint:
  - POST with `{ key, userId }` body
  - Authorization check (requires userId)
  - Key format validation and path traversal protection
  - Delegates to StorageService.delete()

- Created `public/uploads/` directory with `.gitkeep`

- Updated `src/components/dashboard/Settings.tsx` — Avatar upload in profile settings:
  - Interactive avatar with click-to-upload and drag-and-drop
  - Drag visual feedback: ring highlight + scale animation
  - Hover overlay with upload icon
  - XHR-based upload with real-time progress tracking (XMLHttpRequest)
  - Progress bar with percentage indicator
  - Client-side validation: file type (MIME + extension), file size (5MB max)
  - Preview before saving (instant via FileReader)
  - "Change Photo" button and "Remove" button (when avatar exists)
  - Upload confirmation card with CheckCircle2 icon
  - Disabled state during upload with spinning loader
  - Accessible: keyboard navigation, aria-label, role="button"
  - File size indicator in helper text
  - Avatar URL saved to user profile via `/api/auth/profile` PUT
  - Preserves all existing Settings functionality intact

- Updated `src/app/api/auth/profile/route.ts` — Profile API enhancement:
  - Accepts `userId` from request body OR `Authorization: Bearer {id}` header
  - Added `avatar` field support (was already present, confirmed working)
  - Added empty update guard (returns 400 if no fields to update)
  - Replaced `any` type with `Record<string, unknown>` for update data

Stage Summary:
- Complete CDN-ready file upload system with storage abstraction layer
- 2 new API routes: upload (POST), delete (POST)
- 1 new utility library: storage.ts with StorageService class
- Settings.tsx enhanced with interactive avatar upload (drag-drop, progress, preview)
- Profile API route hardened with dual userId resolution
- All new/modified files pass ESLint with zero errors
- No z.ai branding — MUMAA platform only
- CDN migration path: set `STORAGE_TYPE=cdn` + `STORAGE_CDN_URL` env vars

---
Task ID: 4
Agent: push-notifications
Task: Implement web push notifications system

Work Log:
- Generated VAPID keys using `web-push generate-vapid-keys` and added to `.env` (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)
- Added `PushSubscription` model to Prisma schema with fields: id, userId, endpoint (unique), p256dh, auth, createdAt
- Added `pushSubscriptions` relation to `User` model
- Ran `npm run db:push` to sync database with new schema

- Created `src/lib/push.ts` — Push notification utility library:
  - Configures web-push VAPID credentials from environment variables
  - Graceful disable when VAPID keys not configured (logs warning)
  - `getVapidPublicKey()` — returns public key for frontend use
  - `sendPushNotification(subscription, payload)` — sends push to a specific subscription endpoint, with TTL 24h, urgency-based on notification type (high for CALL_REQUEST)
  - `sendPushToUser(userId, payload)` — sends to all of a user's subscriptions concurrently via Promise.allSettled
  - Automatic invalid subscription cleanup (deletes from DB on 410 Gone or 404 Not Found)
  - Helper payload creators: `createIncomingCallPayload()`, `createCallScheduledPayload()`, `createCallCompletedPayload()`, `createSubscriptionPayload()`, `createSystemPayload()`
  - Support for notification actions (Accept/Decline for calls), tags, requireInteraction, click URLs
  - TypeScript types: PushSubscriptionData, PushNotificationType, PushNotificationPayload
  - `isPushAvailable()` — check if push is configured

- Created `src/app/api/push/subscribe/route.ts` — POST endpoint:
  - Accepts `{ userId, subscription: { endpoint, keys: { p256dh, auth } } }`
  - Validates subscription format (endpoint string, p256dh string, auth string)
  - Upsert pattern: deletes existing subscription for same endpoint, creates new
  - Sends welcome notification on successful subscribe
  - Returns VAPID public key in response
  - 503 if push not configured on server

- Created `src/app/api/push/unsubscribe/route.ts` — POST endpoint:
  - Accepts `{ userId, endpoint }`
  - Deletes matching subscription from database
  - Returns count of removed subscriptions

- Created `src/app/api/push/vapid-key/route.ts` — GET endpoint:
  - Returns `{ publicKey: string }` for frontend subscription
  - 503 if push not configured

- Created `public/sw.js` — Service Worker for push notifications:
  - Install event with skipWaiting for immediate activation
  - Activate event cleans old caches and claims all clients
  - Push event handler: parses JSON payload, shows notification with title/body/icon/badge/actions/vibration
  - Incoming call notifications: special vibration pattern, Accept/Decline actions, requireInteraction: true
  - Notification click handler: focuses existing window or opens new one
  - Call action handler: posts PUSH_CALL_ACTION message to focused window for in-app handling
  - Message handler for SKIP_WAITING

- Created `src/hooks/usePushNotifications.ts` — React hook for push notifications:
  - `usePushNotifications()` returns: isSupported, permissionStatus, isSubscribed, isLoading, vapidPublicKey, subscribe(), unsubscribe(), requestPermission(), sendTestNotification()
  - Browser support detection via useMemo (serviceWorker + PushManager + Notification)
  - Permission status tracking via useMemo + useState
  - VAPID key fetching on mount via useEffect with async .then() pattern
  - Existing subscription check on mount via serviceWorker.ready Promise chain
  - Service worker registration via `navigator.serviceWorker.register('/sw.js')`
  - Subscribe: requests permission, registers SW, subscribes via PushManager, sends subscription to server API
  - Unsubscribe: removes from server API, unsubscribes via browser PushManager
  - Test notification: attempts server test endpoint, falls back to local SW showNotification
  - Base64-to-Uint8Array conversion for VAPID applicationServerKey

- Updated `src/components/dashboard/Settings.tsx` — Push notification UI section:
  - New `PushNotificationSettings` sub-component with full push notification management
  - Status indicator card: Not Supported (gray), Active (green), Blocked (red), Inactive (amber)
  - Toggle switch to enable/disable push notifications
  - Test notification button (visible when subscribed)
  - Permission denied help text with browser settings guidance
  - Notification types list when subscribed (calls, reminders, completion, subscriptions)
  - Removed old generic "Push Notifications" toggle from notification preferences
  - Added imports: BellRing, WifiOff, XCircle, HelpCircle, Send from lucide-react
  - Added usePushNotifications hook import
  - Mobile-friendly responsive layout

Stage Summary:
- Complete web push notification system with 7 files created/modified
- 3 API routes: subscribe, unsubscribe, vapid-key
- 1 utility library: push.ts with send functions and payload helpers
- 1 service worker: sw.js with push/notification click handling
- 1 React hook: usePushNotifications with full lifecycle management
- Settings UI with status indicators, toggle, test button, and help text
- Prisma PushSubscription model for server-side subscription storage
- Automatic invalid subscription cleanup
- VAPID key configuration via environment variables
- All new code passes ESLint with zero new errors
- No z.ai branding — MUMAA platform only
