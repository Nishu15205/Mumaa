---
## Task ID: fix-6, fix-7, fix-9
### Work Task
Add Forgot Password flow, Email Verification simulation, and New User Onboarding to the MUMAA platform.

### Work Summary

#### PART 1: Forgot Password Flow
- Created API routes: forgot-password (OTP generation), reset-password (password update)
- Created ForgotPasswordForm with 3-step wizard (email, OTP+password, success)
- Wired Forgot Password button in LoginForm

#### PART 2: New User Onboarding
- Created OnboardingFlow with 4 steps for Parents and 4 steps for Nannies
- AI-generated illustrations for welcome and completion screens
- Triggered after successful signup via SignupForm modification

#### PART 3: AppView & Routing
- Added forgot-password to AppView type union
- Added forgot-password view rendering in page.tsx

#### Files Created/Modified
| Action | File |
|--------|------|
| Created | src/app/api/auth/forgot-password/route.ts |
| Created | src/app/api/auth/reset-password/route.ts |
| Created | src/components/auth/ForgotPasswordForm.tsx |
| Created | src/components/onboarding/OnboardingFlow.tsx |
| Created | public/onboarding-parent.png |
| Created | public/onboarding-nanny.png |
| Created | public/onboarding-complete.png |
| Modified | src/types/index.ts |
| Modified | src/components/auth/LoginForm.tsx |
| Modified | src/components/auth/SignupForm.tsx |
| Modified | src/app/page.tsx |

### Verification
- ESLint: zero errors
- All components use use client, shadcn/ui, Lucide icons
- Brand colors: Rose primary, Emerald secondary (nanny), Amber (OTP demo)
