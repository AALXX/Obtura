'use client'
import Link from 'next/link'
import { ArrowRight, CheckCircle, Zap, Shield, Users, Database, Globe, Clock, Code, GitBranch, Rocket, Lock } from 'lucide-react'

export default function Home() {
    return (
        <div className="min-h-screen bg-white">
            {/* Hero Section */}
            <section className="relative overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 text-white">
                <div className="relative container mx-auto px-6 py-24 lg:py-32">
                    <div className="mx-auto max-w-5xl text-center">
                        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-neutral-600/50 bg-neutral-800/50 px-4 py-2 text-sm text-neutral-300 backdrop-blur-sm">
                            <Zap className="h-4 w-4 text-emerald-400" />
                            <span>Now accepting early access signups</span>
                        </div>

                        <h1 className="mb-6 bg-gradient-to-r from-white to-neutral-300 bg-clip-text text-5xl leading-tight font-bold text-transparent lg:text-7xl">
                            The EU-Native
                            <br />
                            <span className="text-emerald-400">Development Platform</span>
                        </h1>

                        <p className="mx-auto mb-12 max-w-3xl text-xl leading-relaxed text-neutral-400 lg:text-2xl">Code, deploy, and host web applications 3x faster. Built for European SME teams with GDPR compliance, predictable pricing, and zero DevOps required.</p>

                        <div className="mb-12 grid grid-cols-2 gap-8 md:grid-cols-4">
                            <div className="rounded-lg border border-neutral-700/50 bg-neutral-800/30 p-4 text-center backdrop-blur-sm">
                                <div className="mb-1 text-3xl font-bold text-emerald-400">5-min</div>
                                <div className="text-sm text-neutral-400">deployment</div>
                            </div>
                            <div className="rounded-lg border border-neutral-700/50 bg-neutral-800/30 p-4 text-center backdrop-blur-sm">
                                <div className="mb-1 text-3xl font-bold text-blue-400">Built-in</div>
                                <div className="text-sm text-neutral-400">monitoring</div>
                            </div>
                            <div className="rounded-lg border border-neutral-700/50 bg-neutral-800/30 p-4 text-center backdrop-blur-sm">
                                <div className="mb-1 text-3xl font-bold text-purple-400">GDPR</div>
                                <div className="text-sm text-neutral-400">compliant</div>
                            </div>
                            <div className="rounded-lg border border-neutral-700/50 bg-neutral-800/30 p-4 text-center backdrop-blur-sm">
                                <div className="mb-1 text-3xl font-bold text-orange-400">94%</div>
                                <div className="text-sm text-neutral-400">cost savings</div>
                            </div>
                        </div>

                        <div className="flex flex-col justify-center gap-4 sm:flex-row">
                            <Link href="/account/login-register" className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-8 py-4 font-semibold text-white shadow-lg transition-all hover:bg-emerald-600 hover:shadow-emerald-500/25">
                                Start Free Trial
                                <ArrowRight className="h-5 w-5" />
                            </Link>

                            <Link href="mailto:alexserbwork@gmail.com" className="inline-flex items-center gap-2 rounded-lg border border-neutral-600 px-8 py-4 font-semibold text-neutral-300 transition-all hover:bg-neutral-800/50">
                                Schedule Demo
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Showcase */}
            <section className="bg-neutral-50 py-20 lg:py-24">
                <div className="container mx-auto px-6">
                    <div className="mb-16 text-center">
                        <h2 className="mb-4 text-4xl font-bold text-neutral-900 lg:text-5xl">Everything Your Team Needs to Ship</h2>
                        <p className="mx-auto max-w-3xl text-xl text-neutral-600">One platform that replaces a dozen DevOps tools. Built for speed, security, and compliance.</p>
                    </div>

                    <div className="mb-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                        <div className="rounded-xl border border-neutral-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-lg">
                            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100">
                                <Code className="h-6 w-6 text-emerald-600" />
                            </div>
                            <h3 className="mb-3 text-xl font-semibold text-neutral-900">Browser-Based IDE</h3>
                            <p className="mb-4 text-neutral-600">VSCode-powered editor in your browser. No setup required for JavaScript, TypeScript, Python, PHP.</p>
                            <ul className="space-y-2 text-sm text-neutral-500">
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    Monaco Editor with autocomplete
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    Built-in terminal & file explorer
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    Real-time collaboration
                                </li>
                            </ul>
                        </div>

                        <div className="rounded-xl border border-neutral-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-lg">
                            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
                                <GitBranch className="h-6 w-6 text-blue-600" />
                            </div>
                            <h3 className="mb-3 text-xl font-semibold text-neutral-900">Git-Native Workflows</h3>
                            <p className="mb-4 text-neutral-600">Built-in Git server with GitHub/GitLab sync. Your existing workflow, streamlined.</p>
                            <ul className="space-y-2 text-sm text-neutral-500">
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    Built-in Git hosting
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    GitHub/GitLab import & sync
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    Branch-based deployments
                                </li>
                            </ul>
                        </div>

                        <div className="rounded-xl border border-neutral-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-lg">
                            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
                                <Rocket className="h-6 w-6 text-purple-600" />
                            </div>
                            <h3 className="mb-3 text-xl font-semibold text-neutral-900">One-Click Deploy</h3>
                            <p className="mb-4 text-neutral-600">Deploy to staging or production with one click. Auto-detects framework and configures everything.</p>
                            <ul className="space-y-2 text-sm text-neutral-500">
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    Framework auto-detection
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    Auto-generated Dockerfiles
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    Preview URLs for every branch
                                </li>
                            </ul>
                        </div>

                        <div className="rounded-xl border border-neutral-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-lg">
                            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100">
                                <Database className="h-6 w-6 text-orange-600" />
                            </div>
                            <h3 className="mb-3 text-xl font-semibold text-neutral-900">Managed Infrastructure</h3>
                            <p className="mb-4 text-neutral-600">Docker containers, databases, and Redis - all managed. No infrastructure headaches.</p>
                            <ul className="space-y-2 text-sm text-neutral-500">
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    PostgreSQL & MySQL included
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    Redis for caching
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    Custom domains with SSL
                                </li>
                            </ul>
                        </div>

                        <div className="rounded-xl border border-neutral-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-lg">
                            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-red-100">
                                <Shield className="h-6 w-6 text-red-600" />
                            </div>
                            <h3 className="mb-3 text-xl font-semibold text-neutral-900">Enterprise Security</h3>
                            <p className="mb-4 text-neutral-600">GDPR-compliant by default. EU data residency, encryption, and audit logs.</p>
                            <ul className="space-y-2 text-sm text-neutral-500">
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    EU-based hosting (Hetzner)
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    Daily backups & encryption
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    Audit logs & SSO ready
                                </li>
                            </ul>
                        </div>

                        <div className="rounded-xl border border-neutral-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-lg">
                            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-100">
                                <Users className="h-6 w-6 text-indigo-600" />
                            </div>
                            <h3 className="mb-3 text-xl font-semibold text-neutral-900">Team Collaboration</h3>
                            <p className="mb-4 text-neutral-600">Built for teams. Role-based access, shared projects, and integrated workflows.</p>
                            <ul className="space-y-2 text-sm text-neutral-500">
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    Role-based permissions
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    Linear & Jira integration
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    Team dashboards
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* ROI Calculator Section */}
            <section className="bg-gradient-to-br from-neutral-900 to-neutral-800 py-20 text-white lg:py-24">
                <div className="container mx-auto px-6">
                    <div className="mb-16 text-center">
                        <h2 className="mb-4 text-4xl font-bold lg:text-5xl">Stop Paying the DevOps Tax</h2>
                        <p className="mx-auto max-w-3xl text-xl text-neutral-300">European SMEs waste €76K+ yearly on DevOps. With Obtura, you get enterprise-grade infrastructure for 6% of the cost.</p>
                    </div>

                    <div className="mb-12 grid gap-12 lg:grid-cols-2">
                        <div className="space-y-6">
                            <h3 className="mb-6 text-2xl font-semibold">The Hidden Costs You're Paying</h3>

                            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-6">
                                <div className="mb-4 flex items-center justify-between">
                                    <span className="font-medium text-red-300">DevOps Engineer (50%)</span>
                                    <span className="text-2xl font-bold text-red-400">€32,500/year</span>
                                </div>
                                <p className="text-sm text-neutral-400">Junior devops salary in Western Europe</p>
                            </div>

                            <div className="rounded-lg border border-orange-500/20 bg-orange-500/10 p-6">
                                <div className="mb-4 flex items-center justify-between">
                                    <span className="font-medium text-orange-300">Setup & Maintenance</span>
                                    <span className="text-2xl font-bold text-orange-400">€13,000/year</span>
                                </div>
                                <p className="text-sm text-neutral-400">200+ hours of developer time on infrastructure</p>
                            </div>

                            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-6">
                                <div className="mb-4 flex items-center justify-between">
                                    <span className="font-medium text-yellow-300">Third-Party Tools</span>
                                    <span className="text-2xl font-bold text-yellow-400">€4,800/year</span>
                                </div>
                                <p className="text-sm text-neutral-400">Sentry, Datadog, Logtail, and monitoring tools</p>
                            </div>

                            <div className="rounded-lg border border-neutral-600 bg-neutral-700/50 p-6">
                                <div className="mb-4 flex items-center justify-between">
                                    <span className="font-medium text-neutral-300">Developer Context Switching</span>
                                    <span className="text-2xl font-bold text-neutral-300">€26,000/year</span>
                                </div>
                                <p className="text-sm text-neutral-400">400 hours lost to infrastructure instead of features</p>
                            </div>

                            <div className="rounded-lg border border-white/20 bg-white/10 p-6 backdrop-blur-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-xl font-bold text-white">Total Annual DevOps Cost</span>
                                    <span className="text-3xl font-bold text-red-400">€76,300</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <h3 className="mb-6 text-2xl font-semibold">The Obtura Advantage</h3>

                            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-8">
                                <div className="mb-6 text-center">
                                    <div className="mb-2 text-4xl font-bold text-emerald-400">€4,788/year</div>
                                    <p className="text-neutral-300">Business Plan for 10-person team</p>
                                </div>

                                <div className="mb-6 space-y-3">
                                    <div className="flex items-center gap-3">
                                        <CheckCircle className="h-5 w-5 text-emerald-400" />
                                        <span className="text-neutral-200">All DevOps tools included</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <CheckCircle className="h-5 w-5 text-emerald-400" />
                                        <span className="text-neutral-200">Unlimited deployments</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <CheckCircle className="h-5 w-5 text-emerald-400" />
                                        <span className="text-neutral-200">Built-in monitoring & logging</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <CheckCircle className="h-5 w-5 text-emerald-400" />
                                        <span className="text-neutral-200">GDPR compliant by default</span>
                                    </div>
                                </div>

                                <div className="rounded-lg bg-emerald-500/20 p-4 text-center">
                                    <div className="mb-1 text-2xl font-bold text-emerald-400">94% Cost Savings</div>
                                    <div className="text-sm text-emerald-300">€71,512 back in your budget annually</div>
                                </div>
                            </div>

                            <div className="text-center">
                                <div className="mb-2 text-sm text-neutral-400">ROI Calculation</div>
                                <div className="text-3xl font-bold text-emerald-400">1,494% ROI</div>
                                <div className="text-sm text-neutral-400">in the first year</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* EU Compliance Section */}
            <section className="bg-gradient-to-br from-blue-50 to-indigo-50 py-20 lg:py-24">
                <div className="container mx-auto px-6">
                    <div className="mb-16 text-center">
                        <h2 className="mb-4 text-4xl font-bold text-neutral-900 lg:text-5xl">Built for Europe, by Europeans</h2>
                        <p className="mx-auto max-w-3xl text-xl text-neutral-600">GDPR isn't an afterthought—it's in our DNA. EU data residency, privacy by design, and compliance you can trust.</p>
                    </div>

                    <div className="mb-12 grid gap-8 md:grid-cols-3">
                        <div className="text-center">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                                <Globe className="h-8 w-8 text-blue-600" />
                            </div>
                            <h3 className="mb-2 text-xl font-semibold text-neutral-900">EU Data Residency</h3>
                            <p className="text-neutral-600">All data hosted in European data centers (Hetzner Cloud). Never leaves the EU.</p>
                        </div>

                        <div className="text-center">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                                <Shield className="h-8 w-8 text-emerald-600" />
                            </div>
                            <h3 className="mb-2 text-xl font-semibold text-neutral-900">GDPR Compliant</h3>
                            <p className="text-neutral-600">Privacy by design with data processing agreements, audit logs, and data export tools.</p>
                        </div>

                        <div className="text-center">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-100">
                                <Lock className="h-8 w-8 text-purple-600" />
                            </div>
                            <h3 className="mb-2 text-xl font-semibold text-neutral-900">Enterprise Security</h3>
                            <p className="text-neutral-600">SOC 2 Type II compliant with encryption, SSO, and comprehensive audit trails.</p>
                        </div>
                    </div>

                    <div className="mx-auto max-w-4xl rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
                        <div className="mb-6 text-center">
                            <h3 className="mb-2 text-2xl font-bold text-neutral-900">Compliance Certifications</h3>
                            <p className="text-neutral-600">Meeting EU standards for data protection and security</p>
                        </div>

                        <div className="grid grid-cols-2 gap-6 text-center md:grid-cols-4">
                            <div className="p-4">
                                <div className="mb-1 text-2xl font-bold text-emerald-500">✓</div>
                                <div className="text-sm text-neutral-600">GDPR</div>
                            </div>
                            <div className="p-4">
                                <div className="mb-1 text-2xl font-bold text-emerald-500">✓</div>
                                <div className="text-sm text-neutral-600">ePrivacy</div>
                            </div>
                            <div className="p-4">
                                <div className="mb-1 text-2xl font-bold text-emerald-500">✓</div>
                                <div className="text-sm text-neutral-600">ISO 27001</div>
                            </div>
                            <div className="p-4">
                                <div className="mb-1 text-2xl font-bold text-emerald-500">✓</div>
                                <div className="text-sm text-neutral-600">SOC 2 Type II</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="relative overflow-hidden bg-gradient-to-br from-neutral-900 to-neutral-800 py-20 text-white lg:py-24">
                <div className="relative container mx-auto px-6 text-center">
                    <div className="mx-auto max-w-4xl">
                        <h2 className="mb-6 text-4xl font-bold lg:text-5xl">Ship Faster. Save More. Stay Compliant.</h2>
                        <p className="mb-12 text-xl text-neutral-300">Join hundreds of European SME development teams who've eliminated their DevOps bottleneck. Get early access and start saving €71K+ annually.</p>

                        <div className="mb-8 flex flex-col justify-center gap-4 sm:flex-row">
                            <Link href="/account/login-register" className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-8 py-4 font-semibold text-white shadow-lg transition-all hover:bg-emerald-600 hover:shadow-emerald-500/25">
                                Start Your Free Trial
                                <ArrowRight className="h-5 w-5" />
                            </Link>

                            <Link href="mailto:alexserbwork@gmail.com" className="inline-flex items-center gap-2 rounded-lg border border-neutral-600 px-8 py-4 font-semibold text-neutral-300 transition-all hover:bg-neutral-800/50">
                                Schedule Enterprise Demo
                            </Link>
                        </div>

                        <div className="flex items-center justify-center gap-8 text-sm text-neutral-400">
                            <div className="flex items-center gap-2">
                                <Globe className="h-4 w-4 text-emerald-400" />
                                <span>🇪🇺 EU-first platform</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4 text-emerald-400" />
                                <span>GDPR compliant</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Zap className="h-4 w-4 text-emerald-400" />
                                <span>Setup in 5 minutes</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-neutral-900 py-16 text-neutral-400">
                <div className="container mx-auto px-6">
                    <div className="mb-12 grid gap-8 md:grid-cols-5">
                        <div className="md:col-span-2">
                            <div className="mb-4 flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500">
                                    <span className="text-xl font-bold text-white">O</span>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Obtura</h3>
                                    <p className="text-xs text-neutral-500">European SME Development Platform</p>
                                </div>
                            </div>
                            <p className="mb-4 max-w-md text-sm text-neutral-400">Code, deploy, and host web applications 3x faster. Built for European SME teams with GDPR compliance and zero DevOps required.</p>
                            <div className="flex items-center gap-4 text-xs">
                                <div className="flex items-center gap-1">
                                    <Globe className="h-3 w-3 text-emerald-400" />
                                    <span>🇪🇺 EU-first</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Shield className="h-3 w-3 text-emerald-400" />
                                    <span>GDPR</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h4 className="mb-4 font-semibold text-white">Product</h4>
                            <ul className="space-y-2 text-sm">
                                <li>
                                    <Link href="#features" className="transition-colors hover:text-emerald-400">
                                        Features
                                    </Link>
                                </li>
                                <li>
                                    <Link href="#pricing" className="transition-colors hover:text-emerald-400">
                                        Pricing
                                    </Link>
                                </li>
                                <li>
                                    <Link href="#changelog" className="transition-colors hover:text-emerald-400">
                                        Changelog
                                    </Link>
                                </li>
                                <li>
                                    <Link href="#docs" className="transition-colors hover:text-emerald-400">
                                        Documentation
                                    </Link>
                                </li>
                            </ul>
                        </div>

                        <div>
                            <h4 className="mb-4 font-semibold text-white">Company</h4>
                            <ul className="space-y-2 text-sm">
                                <li>
                                    <Link href="#about" className="transition-colors hover:text-emerald-400">
                                        About
                                    </Link>
                                </li>
                                <li>
                                    <Link href="#blog" className="transition-colors hover:text-emerald-400">
                                        Blog
                                    </Link>
                                </li>
                                <li>
                                    <Link href="#careers" className="transition-colors hover:text-emerald-400">
                                        Careers
                                    </Link>
                                </li>
                                <li>
                                    <Link href="#contact" className="transition-colors hover:text-emerald-400">
                                        Contact
                                    </Link>
                                </li>
                            </ul>
                        </div>

                        <div>
                            <h4 className="mb-4 font-semibold text-white">Legal</h4>
                            <ul className="space-y-2 text-sm">
                                <li>
                                    <Link href="#privacy" className="transition-colors hover:text-emerald-400">
                                        Privacy Policy
                                    </Link>
                                </li>
                                <li>
                                    <Link href="#terms" className="transition-colors hover:text-emerald-400">
                                        Terms of Service
                                    </Link>
                                </li>
                                <li>
                                    <Link href="#gdpr" className="transition-colors hover:text-emerald-400">
                                        GDPR
                                    </Link>
                                </li>
                                <li>
                                    <Link href="#security" className="transition-colors hover:text-emerald-400">
                                        Security
                                    </Link>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div className="border-t border-neutral-800 pt-8">
                        <div className="mb-8 grid gap-8 md:grid-cols-2">
                            <div>
                                <h4 className="mb-3 font-semibold text-white">Contact Us</h4>
                                <div className="space-y-2 text-sm">
                                    <div>
                                        <strong className="text-white">Alexandru-Nicolae Șerban</strong>
                                        <br />
                                        <span className="text-neutral-500">Founder & CEO</span>
                                        <br />
                                        <a href="mailto:alexserbwork@gmail.com" className="text-emerald-400 hover:text-emerald-300">
                                            alexserbwork@gmail.com
                                        </a>
                                    </div>
                                    <div className="mt-3">
                                        <strong className="text-white">Rareș Ștefan Miu</strong>
                                        <br />
                                        <span className="text-neutral-500">Head of Marketing & CFO</span>
                                        <br />
                                        <a href="mailto:raresmiu27@gmail.com" className="text-emerald-400 hover:text-emerald-300">
                                            raresmiu27@gmail.com
                                        </a>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h4 className="mb-3 font-semibold text-white">Start Building Today</h4>
                                <p className="mb-4 text-sm text-neutral-400">Join hundreds of European SMEs who've eliminated their DevOps bottleneck.</p>
                                <Link href="/account/login-register" className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-2 text-sm font-medium text-white transition-all hover:bg-emerald-600">
                                    Get Started Free
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            </div>
                        </div>

                        <div className="border-t border-neutral-800 pt-6 text-center text-sm text-neutral-500">
                            <p>&copy; 2026 MRSA SRL. All rights reserved.</p>
                            <p className="mt-2">🇪🇺 EU Data Residency • GDPR Compliant • SOC 2 Type II</p>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    )
}
