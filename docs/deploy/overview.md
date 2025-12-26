# Deployment Guide

Choose the deployment method that best fits your needs.

---

## Deployment Options

| Method             | Difficulty      | Cost          | Best For                     |
| ------------------ | --------------- | ------------- | ---------------------------- |
| [Vercel](./vercel) | ⭐ Easy         | Free - $20/mo | Quick launch, no DevOps      |
| [Docker](./docker) | ⭐⭐⭐ Advanced | ~$6/mo VPS    | Full control, consistent env |
| [PM2](./pm2)       | ⭐⭐ Medium     | ~$6/mo VPS    | Simple VPS, no containers    |

---

## Quick Comparison

### Setup Time

```
Vercel:  ████░░░░░░  ~5 minutes
PM2:     ██████░░░░  ~30 minutes
Docker:  ████████░░  ~1 hour
```

### Control vs Convenience

```
                    More Control
                         ▲
                         │
              Docker ────┼──── More Work
                         │
                PM2 ─────┤
                         │
             Vercel ─────┼──── Less Work
                         │
                         ▼
                   More Convenient
```

---

## Decision Guide

### Choose Vercel if:

- ✅ You want the fastest deployment
- ✅ You don't want to manage servers
- ✅ Your app fits within serverless constraints
- ✅ You need automatic scaling
- ✅ Preview deployments are important

### Choose Docker if:

- ✅ You need full control over infrastructure
- ✅ You want consistent environments (dev = prod)
- ✅ You plan to scale to multiple servers
- ✅ You need custom server configuration
- ✅ You want to avoid vendor lock-in

### Choose PM2 if:

- ✅ You have a simple VPS
- ✅ You don't need containerization
- ✅ You want minimal overhead
- ✅ You're comfortable with Node.js
- ✅ You want easy debugging

---

## External Services (All Methods)

Regardless of deployment method, you'll need:

| Service                                          | Purpose    | Free Tier              |
| ------------------------------------------------ | ---------- | ---------------------- |
| [Neon](https://neon.tech)                        | PostgreSQL | ✅ Generous            |
| [Upstash](https://upstash.com)                   | Redis      | ✅ 10K commands/day    |
| [Stripe](https://stripe.com)                     | Payments   | Pay per transaction    |
| [Resend](https://resend.com)                     | Email      | ✅ 100 emails/day      |
| [Cloudinary](https://cloudinary.com)             | Images     | ✅ 25K transformations |
| [Google Cloud](https://console.cloud.google.com) | OAuth      | ✅ Free                |

---

## Environment Variables

All deployment methods require these environment variables:

```bash
# Database
DATABASE_URL="postgresql://..."

# Auth
AUTH_SECRET="..."
NEXTAUTH_URL="https://yourdomain.com"

# Stripe
STRIPE_SECRET_KEY="sk_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_..."

# Redis
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="..."

# OAuth
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# Email
RESEND_API_KEY="re_..."

# Images
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."
```

---

## Post-Deployment Checklist

- [ ] Site loads over HTTPS
- [ ] User registration works
- [ ] Google OAuth works
- [ ] Test checkout completes (use `4242 4242 4242 4242`)
- [ ] Webhook receives events (check Stripe dashboard)
- [ ] Admin panel accessible
- [ ] Emails sending correctly
- [ ] Images loading from Cloudinary

---

## Stripe Webhook Setup

After deployment, configure Stripe webhook:

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/webhooks)
2. Click **"Add endpoint"**
3. Enter URL: `https://yourdomain.com/api/webhooks/stripe`
4. Select events:
   - `checkout.session.completed`
   - `checkout.session.expired`
5. Copy webhook signing secret to your environment variables

---

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create or select a project
3. Enable "Google+ API"
4. Go to Credentials → Create OAuth Client ID
5. Add authorized redirect URI:
   - `https://yourdomain.com/api/auth/callback/google`
6. Copy Client ID and Secret to environment variables

---

## Troubleshooting

### Common Issues

| Issue         | Cause                     | Solution                    |
| ------------- | ------------------------- | --------------------------- |
| 500 errors    | Missing env vars          | Check all variables are set |
| OAuth fails   | Wrong redirect URI        | Update Google Console       |
| Payments fail | Wrong webhook URL         | Update Stripe Dashboard     |
| Images broken | Cloudinary not configured | Check cloud name            |
| Auth loops    | NEXTAUTH_URL mismatch     | Match your actual domain    |

### Debug Checklist

```bash
# 1. Check environment variables are loaded
# 2. Check database connection
# 3. Check Redis connection
# 4. Check Stripe webhook logs
# 5. Check application logs
```
