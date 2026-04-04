---
## Task ID: fix-8, fix-10
### Work Task
Add Stripe payment mock flow and static pages (Terms of Service, Privacy Policy, About Us) to MUMAA.

### Work Summary

#### PART 1: Stripe Payment Mock Flow

**1. Updated AppView type (`src/types/index.ts`)**
- Added `'terms' | 'privacy' | 'about'` to the `AppView` union type

**2. Created API Route: `src/app/api/payments/checkout/route.ts`**
- POST endpoint accepting `{ userId, plan, amount }`
- Validates userId exists and plan is BASIC or PRO
- Generates mock Stripe session ID (`cs_mock_timestamp_random`)
- Expires existing active subscriptions
- Creates new subscription with 7-day free trial (`isTrial: true`, `trialEndsAt: now + 7d`)
- Creates subscription notification
- Returns `{ sessionId, url, subscription }`

**3. Created API Route: `src/app/api/payments/success/route.ts`**
- GET endpoint accepting `session_id` query parameter
- Mock verification (checks `cs_mock_` prefix)
- Returns `{ success: true, plan, sessionId }`

**4. Created CheckoutDialog Component (`src/components/payment/CheckoutDialog.tsx`)**
- Dialog/modal simulating Stripe checkout flow
- Order Summary section (dark card): plan name, price, top 3 features with icons, 7-day free trial badge
- Payment Form with mock fields: cardholder name, card number (auto-formatted), expiry (MM/YY), CVV
- All inputs styled with dark bg (slate-900) for professional look
- Validation: checks all fields before enabling submit
- Payment simulation: 2-second loading spinner, then calls /api/payments/checkout
- Success animation: green checkmark with spring animation, auto-closes after 1.5s
- Error handling: displays error message if payment fails
- SSL security badge at bottom
- Uses shadcn Dialog, Input, Button, Badge

**5. Modified SubscriptionPage (`src/components/dashboard/parent/SubscriptionPage.tsx`)**
- Replaced direct API call in handleUpgrade with opening CheckoutDialog
- Added checkoutPlan state to track which plan to subscribe
- Changed button text from "Upgrade" to "Start Free Trial"
- Renders CheckoutDialog with planId, userId, and onSuccess callback

#### PART 2: Static Pages (Terms, Privacy, About)

**6. Created LegalPages Component (`src/components/common/LegalPages.tsx`)**
- Single component rendering different pages based on `page` prop
- Terms of Service: 10 sections with realistic legal text
- Privacy Policy: 9 sections with realistic privacy text
- About Page: hero, stats (12K+ parents, 850+ nannies, 45K+ calls, 98.5% satisfaction), values, team (4 members), contact info
- Consistent styling: white cards with rounded borders, staggered animations

**7. Modified Footer (`src/components/landing/Footer.tsx`)**
- Imported useAppStore and AppView type
- "Privacy Policy" navigates to privacy view
- "Terms of Service" navigates to terms view
- "About Us" navigates to about view

**8. Modified page.tsx**
- Imported LegalPages component
- Added terms, privacy, about to public pages render condition
- Added terms, privacy, about to redirect guard
- Renders LegalPages with appropriate page prop and onBack callback

#### Files Summary
| Action | File | Purpose |
|--------|------|---------|
| Created | src/app/api/payments/checkout/route.ts | Mock Stripe checkout session API |
| Created | src/app/api/payments/success/route.ts | Mock payment success verification API |
| Created | src/components/payment/CheckoutDialog.tsx | Stripe-style checkout dialog with payment form |
| Created | src/components/common/LegalPages.tsx | Terms, Privacy Policy, About page content |
| Modified | src/types/index.ts | Added terms, privacy, about to AppView |
| Modified | src/components/dashboard/parent/SubscriptionPage.tsx | Wired CheckoutDialog for payment flow |
| Modified | src/components/landing/Footer.tsx | Made legal/company links navigate properly |
| Modified | src/app/page.tsx | Added legal page views and routing |
