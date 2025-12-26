# Deploy with Vercel

> **Recommended for:** Fastest deployment, zero server management

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Vercel Edge                          │
│                                                             │
│   ┌──────────────────┐    ┌──────────────────┐              │
│   │   Edge Network   │    │  Serverless Fns  │              │
│   │   (CDN + SSL)    │    │  (API Routes)    │              │
│   └────────┬─────────┘    └────────┬─────────┘              │
│            │                       │                        │
│            └───────────┬───────────┘                        │
│                        │                                    │
│                        ▼                                    │
│              ┌──────────────────┐                           │
│              │    Next.js App   │                           │
│              │  (Auto-deployed) │                           │
│              └──────────────────┘                           │
└─────────────────────────────────────────────────────────────┘
           │                    │
           ▼                    ▼
    ┌─────────────┐      ┌─────────────┐
    │ PostgreSQL  │      │    Redis    │
    │   (Neon)    │      │  (Upstash)  │
    └─────────────┘      └─────────────┘
```

---

## Prerequisites

- GitHub/GitLab/Bitbucket account
- Vercel account (free tier available)
- Repository with your Next.js project

---

## Step-by-Step Deployment

### 1. Connect Repository

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New Project"**
3. Import your Git repository
4. Select the repository containing Mountify

### 2. Configure Project

**Framework Preset:** Next.js (auto-detected)

**Build Settings:**

```
Build Command: npm run build
Output Directory: .next
Install Command: npm ci
```

### 3. Environment Variables

Add all environment variables in Vercel dashboard:

| Variable                             | Value                             |
| ------------------------------------ | --------------------------------- |
| `DATABASE_URL`                       | `postgresql://...`                |
| `AUTH_SECRET`                        | `your-secret-key`                 |
| `NEXTAUTH_URL`                       | `https://your-project.vercel.app` |
| `STRIPE_SECRET_KEY`                  | `sk_live_...`                     |
| `STRIPE_WEBHOOK_SECRET`              | `whsec_...`                       |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...`                     |
| `UPSTASH_REDIS_REST_URL`             | `https://...`                     |
| `UPSTASH_REDIS_REST_TOKEN`           | `...`                             |
| `GOOGLE_CLIENT_ID`                   | `...`                             |
| `GOOGLE_CLIENT_SECRET`               | `...`                             |
| `RESEND_API_KEY`                     | `re_...`                          |
| `CLOUDINARY_CLOUD_NAME`              | `...`                             |
| `CLOUDINARY_API_KEY`                 | `...`                             |
| `CLOUDINARY_API_SECRET`              | `...`                             |

> **Tip:** Use "Add from .env" button to paste your entire `.env.production` file

### 4. Deploy

Click **"Deploy"** and wait for build to complete.

Your app is now live at: `https://your-project.vercel.app`

---

## Custom Domain

### 1. Add Domain in Vercel

1. Go to Project Settings → Domains
2. Add your domain: `yourdomain.com`
3. Vercel will show DNS records to configure

### 2. Configure DNS

Add these records at your domain registrar:

| Type  | Name | Value                  |
| ----- | ---- | ---------------------- |
| A     | @    | `76.76.21.21`          |
| CNAME | www  | `cname.vercel-dns.com` |

### 3. Update Environment Variable

Update `NEXTAUTH_URL` to your custom domain:

```
NEXTAUTH_URL=https://yourdomain.com
```

### 4. Update OAuth Redirect URIs

In Google Cloud Console, add:

- `https://yourdomain.com/api/auth/callback/google`

### 5. Update Stripe Webhook

In Stripe Dashboard, update webhook endpoint:

- `https://yourdomain.com/api/webhooks/stripe`

---

## Vercel Configuration

### vercel.json (Optional)

```json
{
  "framework": "nextjs",
  "regions": ["sfo1"],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "SAMEORIGIN"
        }
      ]
    }
  ],
  "redirects": [
    {
      "source": "/home",
      "destination": "/",
      "permanent": true
    }
  ]
}
```

### next.config.js

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
  // Optional: Reduce cold start time
  experimental: {
    serverComponentsExternalPackages: ["pg"],
  },
};

module.exports = nextConfig;
```

---

## Automatic Deployments

Vercel automatically deploys:

| Trigger                | Environment |
| ---------------------- | ----------- |
| Push to `main`         | Production  |
| Push to other branches | Preview     |
| Pull Request           | Preview     |

### Preview Deployments

Every PR gets a unique preview URL:

```
https://mountify-git-feature-branch-username.vercel.app
```

---

## Environment Variables per Branch

Set different variables for different environments:

| Variable            | Production               | Preview                      | Development             |
| ------------------- | ------------------------ | ---------------------------- | ----------------------- |
| `NEXTAUTH_URL`      | `https://yourdomain.com` | `https://preview.vercel.app` | `http://localhost:3000` |
| `STRIPE_SECRET_KEY` | `sk_live_...`            | `sk_test_...`                | `sk_test_...`           |

---

## Vercel CLI (Optional)

### Installation

```bash
npm i -g vercel
```

### Commands

```bash
# Login
vercel login

# Deploy preview
vercel

# Deploy production
vercel --prod

# Pull environment variables to local
vercel env pull .env.local

# View logs
vercel logs your-project.vercel.app
```

---

## Monitoring

### Built-in Analytics

Enable in Project Settings → Analytics

Tracks:

- Web Vitals (LCP, FID, CLS)
- Page views
- Unique visitors

### Logs

View real-time logs:

1. Go to Project → Deployments
2. Click on deployment
3. View "Functions" tab for API logs

---

## Serverless Function Limits

| Resource          | Hobby (Free) | Pro       |
| ----------------- | ------------ | --------- |
| Execution timeout | 10s          | 60s       |
| Memory            | 1024 MB      | 3008 MB   |
| Deployments/day   | 100          | Unlimited |
| Bandwidth         | 100 GB       | 1 TB      |

### Handling Long Operations

For operations exceeding timeout:

```typescript
// Use streaming for long responses
export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Process in chunks
      for (const chunk of data) {
        controller.enqueue(encoder.encode(JSON.stringify(chunk)));
      }
      controller.close();
    },
  });

  return new Response(stream);
}
```

---

## Troubleshooting

### Build Failures

```bash
# Check build logs in Vercel dashboard
# Common issues:

# 1. Missing environment variables
Error: DATABASE_URL is not defined

# 2. TypeScript errors
Type error: Property 'x' does not exist

# 3. ESLint errors
npm run lint -- --fix
```

### Function Errors

```bash
# Check function logs
# Common issues:

# 1. Timeout (increase or optimize)
# 2. Memory exceeded
# 3. Cold start delays (use edge runtime if possible)
```

### Database Connection Issues

```javascript
// Use connection pooling for serverless
// Neon supports this natively with ?sslmode=require
DATABASE_URL = "postgresql://...?sslmode=require&pgbouncer=true";
```

---

## Pros & Cons

| Pros                   | Cons                       |
| ---------------------- | -------------------------- |
| ✅ Zero configuration  | ❌ Vendor lock-in          |
| ✅ Automatic SSL       | ❌ Function timeout limits |
| ✅ Global CDN          | ❌ Cold starts             |
| ✅ Preview deployments | ❌ Pricing at scale        |
| ✅ Built-in analytics  | ❌ Less control            |
| ✅ Auto-scaling        | ❌ No persistent storage   |

---

## Cost Comparison

| Tier       | Price     | Best For          |
| ---------- | --------- | ----------------- |
| Hobby      | Free      | Personal projects |
| Pro        | $20/month | Production apps   |
| Enterprise | Custom    | Large teams       |

### What's Included in Free Tier

- Unlimited deployments
- 100 GB bandwidth/month
- SSL certificates
- Preview deployments
- Basic analytics

---

## Vercel vs Self-Hosted

| Aspect              | Vercel     | Self-Hosted (Docker/PM2) |
| ------------------- | ---------- | ------------------------ |
| Setup time          | 5 minutes  | 1-2 hours                |
| Maintenance         | None       | Regular updates          |
| Scaling             | Automatic  | Manual                   |
| Cost (low traffic)  | Free       | ~$5-10/month             |
| Cost (high traffic) | $20+/month | Fixed server cost        |
| Control             | Limited    | Full                     |
| Cold starts         | Yes        | No                       |
