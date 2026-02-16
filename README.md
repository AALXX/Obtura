<p align="center">
  <a href="https://obtura.dev">
    <img src="./client-layer/client/public/logo.png" alt="Obtura Logo" width="200"/>
  </a>
</p>

<h1 align="center">Obtura</h1>
<h3 align="center">Autonomous DevOps Platform for European SMEs</h3>

<p align="center">
  <strong>Deploy production code in 5 minutes. Maintain it autonomously.</strong><br/>
  The first truly autonomous DevOps platform with 80% workflow automation and AI-powered operational intelligence.
</p>

<p align="center">
  <a href="https://obtura.dev"><strong>🌐 obtura.dev</strong></a>
</p>

<p align="center">
  <a href="https://obtura.dev"><strong>Website</strong></a> •
  <a href="#-the-problem">Problem</a> •
  <a href="#-our-solution">Solution</a> •
  <a href="#-key-features">Features</a> •
  <a href="#-why-obtura">Why Obtura</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-contact">Contact</a>
</p>

---

## 🎯 The Problem

European SMEs with 5-25 person development teams face a **€70,000+/year DevOps bottleneck**:

- ❌ Cannot justify dedicated DevOps engineers (€50-85K annually)
- ❌ 40-60 hours spent on infrastructure setup per project
- ❌ 20-30% of developer time wasted on infrastructure instead of features
- ❌ Unpredictable costs with platforms like Replit ($20 → $350+ daily spikes)
- ❌ Current solutions still require DevOps knowledge

**Developers should build features, not manage infrastructure.**

---

## 💡 Our Solution

Obtura is an **autonomous DevOps platform** that enables SMEs to ship production software **without DevOps teams or expertise**.

### 🎁 The Promise
- **Push code** → Production in **5 minutes** (not 60 hours)
- **80-85% workflow automation** (highest in industry)
- **AI agent** handles monitoring, optimization, and incident response
- **Predictable flat pricing** (no surprise bills)
- **EU data residency** (GDPR-native)

### 💰 Value Proposition
**Traditional DevOps Cost**: €76,300/year  
**With Obtura**: €9,588/year  
**💰 Savings**: €66,712/year (87% reduction)

---

## 🚀 Key Features

### 1️⃣ Zero-Config Deployment
**What competitors make you do**: Write Dockerfile, set up CI/CD, configure environments, SSL, monitoring, logging, backups...  
**Time required**: 40-60 hours per project

**What Obtura does**: Connect your GitHub repo + push code  
**Time required**: 5 minutes

```bash
# 1. Connect your GitHub repository in Obtura dashboard
# 2. Configure branch deployment rules (e.g., main → production, dev → staging)
# 3. Push to GitHub as usual

git push origin main

# Obtura automatically detects the push and:
# ✅ Framework detected: Next.js
# ✅ Build configured automatically
# ✅ SSL certificate provisioned
# ✅ Monitoring enabled
# ✅ Deployed to production
# 🎉 https://your-app.obtura.eu
```

**GitHub Integration Features:**
- Automatic deployments on push to configured branches
- Branch-based environments (main → production, dev → staging)
- Pull request preview deployments
- Deployment status synced to GitHub commits
- Automatic rollback on failed deployments

**Smart framework detection** auto-configures:
- Build process & runtime environment
- Database connections & environment variables
- Health checks & process management
- SSL certificates & security headers
- DDoS protection & monitoring

---

### 2️⃣ AI DevOps Agent 🤖
**The Problem**: DevOps teams spend 60-70% of time firefighting instead of building.

**Our Solution**: Autonomous AI agent that handles operational intelligence 24/7.

#### What the AI Agent Does:

**📊 Log Analysis & Pattern Recognition**
- Continuously analyzes application logs in real-time
- Identifies patterns indicating emerging issues
- Correlates errors across services
- Detects anomalies before they become critical

**⚡ Performance Optimization**
- Monitors resource utilization (CPU, memory, disk, network)
- Identifies bottleneck queries
- Suggests code-level optimizations
- Auto-scales resources when needed

**🚨 Critical Incident Response**
- Detects production incidents immediately
- Performs automated triage (severity assessment)
- Suggests remediation steps based on historical data
- Executes pre-approved fixes automatically

**💡 Proactive Recommendations**
> "Your database queries are 40% slower this week - investigate index on users table"

> "Error rate increased 3x after deployment #284 - consider rollback"

> "Memory usage trending up - potential memory leak in payment service"

**💬 Natural Language Interaction**
```
You: Why is the API slow today?

AI Agent: API response time increased 2.3x. Root cause: 
Database connection pool exhausted. Recommend increasing 
max_connections from 20 to 40.
```

#### Impact Metrics:
- ✅ **85% reduction** in time to detect issues
- ✅ **70% reduction** in mean time to resolution (MTTR)
- ✅ **90%** of routine issues handled without human intervention
- ✅ **Zero pager alerts** for known, fixable issues

---

### 3️⃣ Native GitHub Integration
**Seamless CI/CD with your existing GitHub workflow:**
- Connect any GitHub repository (public or private)
- Automatic deployments on push to configured branches
- Branch-based deployment strategies:
  - `main` → Production environment
  - `dev`/`staging` → Staging environment
  - Pull requests → Preview environments
- Deployment status updates in GitHub commits
- One-click rollback to previous deployments
- Automatic build logs synced to dashboard

**No configuration files needed** - just connect and push.

---

### 4️⃣ Complete Observability
**Built-in monitoring suite** (no need for Sentry, Datadog, Logtail):
- Real-time application logs
- Performance metrics & APM
- Error tracking & alerting
- User analytics
- Infrastructure monitoring

---

### 5️⃣ Team Management
- Easy developer onboarding
- Role-based access control
- Deployment approvals workflow
- Activity audit logs
- Team collaboration tools

---

### 6️⃣ Predictable Flat Pricing
**No usage surprises. No daily cost spikes.**

| Plan | Price/mo | Target | Best For |
|------|----------|--------|----------|
| **Starter** | €79 | 1-3 devs | Hobby projects, MVPs |
| **Team** | €199 | 5-10 devs | Growing startups |
| **Business** | €399 | 10-25 devs | Established SMEs |
| **Enterprise** | €799+ | 25+ devs | Custom needs |

*50% discount for annual plans*

---

## 🏆 Why Obtura?

### vs. Replit
| | Replit | Obtura |
|---|---|---|
| **Pricing** | $20-40/user + unpredictable usage ($350+ spikes) | Flat €79-799/mo |
| **Automation** | Manual DevOps required | 80% automated |
| **AI Agent** | Code assistance only | Full operational intelligence |
| **Data Location** | US-based | EU data residency |
| **Target** | Individuals, education | SME development teams |

### vs. Vercel
| | Vercel | Obtura |
|---|---|---|
| **Pricing** | $20/user → $20K/yr enterprise gap | €79-799/mo (SME-focused) |
| **DevOps** | Requires DevOps knowledge | Zero DevOps required |
| **Framework** | Next.js optimized | Any framework |
| **Monitoring** | Limited, requires add-ons | Complete observability built-in |
| **AI Operations** | None | Autonomous AI agent |

### vs. AWS/Azure/GCP
| | Cloud Providers | Obtura |
|---|---|---|
| **Complexity** | High learning curve | 5-minute deployment |
| **Setup Time** | 40-60 hours | 5 minutes |
| **Expertise** | DevOps team required | Zero expertise needed |
| **Pricing** | Complex, unpredictable | Flat, predictable |
| **AI Automation** | None | 80% workflow automation |

---

## 🌍 EU-First Approach

**Built for European SMEs:**
- ✅ **GDPR-native design** from Day 1
- ✅ **EU data residency** (Hetzner infrastructure)
- ✅ **Data sovereignty** controls
- ✅ **Exportable audit logs**
- ✅ **GDPR-compliant data handling**
- ✅ **Local support** in European time zones

*All competitors (Replit, Vercel, GitHub) are US-based.*

---

## 🏗️ Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, TypeScript, Tailwind CSS, Monaco Editor |
| **Backend** | Node.js (API), Go (deployment engine), PostgreSQL, Redis |
| **AI/ML** | Claude API (Anthropic), custom ML models |
| **Infrastructure** | Docker, Kubernetes, Traefik, Hetzner Cloud |
| **Monitoring** | Custom observability stack, integrated logging |
| **Security** | JWT auth, AES-256 encryption, container isolation, automated vulnerability scanning |

---

## 🎯 Market Opportunity

| Metric | Value |
|--------|-------|
| **Global App Dev Software Market (2024)** | $257.94B → $862.67B by 2030 (22.8% CAGR) |
| **European Software Dev Market (2025)** | €490B (6.9% CAGR) |
| **EU Custom Software Development** | 26.2% CAGR (2025-2030) |
| **Target SMEs (10-100 employees)** | 107,000+ companies |
| **Serviceable Market** | 53,500 companies |

---

## 📈 Our Vision

### Year 1: Product-Market Fit
- 25 customers
- €64,500 ARR
- Romanian market focus
- Prove 80% automation value

### Year 2: Growth Phase
- 80 customers
- €243,816 ARR
- Expand to Poland + Czech Republic
- Break-even in Month 18

### Year 3: Scale Phase
- 160 customers
- €492,480 ARR
- Enter Germany + France
- Establish as leading EU DevOps platform

---


## 📞 Contact

**Alexandru-Nicolae Șerban** – Founder & CEO  
📧 alexserbwork@gmail.com  
🔗 [LinkedIn](https://www.linkedin.com/in/alexandru-serban-nicolae/)

**Rareș Ștefan Miu** – Head of Marketing & COO  
📧 raresmiu27@gmail.com

**Company**: MRSA SRL  
📍 Bucharest, Romania

---

<p align="center">
  <strong>We're not just building another dev tool.</strong><br/>
  We're eliminating the €70,000/year DevOps tax for European SMEs.
</p>

<p align="center">
  <em>"Developers should never think about infrastructure."</em>
</p>