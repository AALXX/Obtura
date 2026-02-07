'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { 
    Rocket, 
    Code2, 
    GitBranch, 
    Globe, 
    Shield, 
    Zap, 
    Users, 
    Clock, 
    ArrowRight,
    CheckCircle2,
    Server,
    Lock,
    Sparkles,
    Terminal,
    Cloud,
    Layout
} from 'lucide-react'
import { useSession } from 'next-auth/react'

const LandingPage = () => {
    const { data: session } = useSession()

    const features = [
        {
            icon: Code2,
            title: 'Browser-Based Code Editing',
            description: 'Edit your code directly in the browser with a powerful, VS Code-like experience. No local setup required.',
            color: 'text-blue-400',
            bgColor: 'bg-blue-500/10'
        },
        {
            icon: GitBranch,
            title: 'Git Workflows',
            description: 'Seamless Git integration with automatic deployments on push. Support for branches, pull requests, and merges.',
            color: 'text-purple-400',
            bgColor: 'bg-purple-500/10'
        },
        {
            icon: Rocket,
            title: 'One-Click Deployment',
            description: 'Deploy your applications with a single click. Choose from blue-green, rolling, canary, or recreate strategies.',
            color: 'text-orange-400',
            bgColor: 'bg-orange-500/10'
        },
        {
            icon: Globe,
            title: 'EU Data Residency',
            description: 'Your data stays in Europe. GDPR-compliant hosting with automatic SSL certificates and DDoS protection.',
            color: 'text-green-400',
            bgColor: 'bg-green-500/10'
        },
        {
            icon: Zap,
            title: '3x Faster Shipping',
            description: 'Streamlined workflows that help European SMEs ship software faster without the infrastructure complexity.',
            color: 'text-yellow-400',
            bgColor: 'bg-yellow-500/10'
        },
        {
            icon: Shield,
            title: 'Enterprise Security',
            description: 'Role-based access control, audit logs, and compliance features designed for growing teams.',
            color: 'text-red-400',
            bgColor: 'bg-red-500/10'
        }
    ]

    const benefits = [
        'No infrastructure management',
        'Automatic scaling',
        'Built-in CI/CD pipelines',
        'Team collaboration tools',
        'Environment management',
        'Real-time monitoring'
    ]

    const stats = [
        { value: '99.9%', label: 'Uptime SLA' },
        { value: 'Hands Off', label: 'Infra Management' },
        { value: '24/7', label: 'Support' },
        { value: 'GDPR', label: 'Compliant' }
    ]

    return (
        <div className="min-h-screen bg-[#0a0a0a]">
            {/* Hero Section */}
            <section className="relative overflow-hidden px-4 pt-20 pb-32 sm:px-6 lg:px-8">
                {/* Background gradient */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-orange-500/10 blur-3xl"></div>
                    <div className="absolute -bottom-40 -left-40 h-[600px] w-[600px] rounded-full bg-blue-500/10 blur-3xl"></div>
                </div>

                <div className="relative z-10 mx-auto max-w-7xl">
                    <div className="text-center">
                        {/* Badge */}
                        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/50 px-4 py-1.5">
                            <Sparkles size={14} className="text-orange-400" />
                            <span className="text-sm text-neutral-400">Now available for European SMEs</span>
                        </div>

                        {/* Main headline */}
                        <h1 className="mb-6 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-7xl">
                            Ship Software{' '}
                            <span className="bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">
                                3x Faster
                            </span>
                        </h1>

                        {/* Subheadline */}
                        <p className="mx-auto mb-10 max-w-2xl text-lg text-neutral-400 sm:text-xl">
                            The all-in-one platform for European SMEs. Code, deploy, and scale your applications 
                            with EU data residency and enterprise-grade security.
                        </p>

                        {/* CTA Buttons */}
                        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                            {session ? (
                                <Link 
                                    href="/projects"
                                    className="group flex items-center gap-2 rounded-lg bg-orange-500 px-8 py-4 text-base font-semibold text-white transition-all hover:bg-orange-600 hover:shadow-lg hover:shadow-orange-500/25"
                                >
                                    Go to Dashboard
                                    <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                                </Link>
                            ) : (
                                <>
                                    <Link 
                                        href="/account/login-register?mode=register"
                                        className="group flex items-center gap-2 rounded-lg bg-orange-500 px-8 py-4 text-base font-semibold text-white transition-all hover:bg-orange-600 hover:shadow-lg hover:shadow-orange-500/25"
                                    >
                                        Get Started Free
                                        <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                                    </Link>
                                    <Link 
                                        href="/account/login-register"
                                        className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900/50 px-8 py-4 text-base font-semibold text-white transition-all hover:bg-neutral-800"
                                    >
                                        Sign In
                                    </Link>
                                </>
                            )}
                        </div>

                        {/* Stats */}
                        <div className="mt-16 grid grid-cols-2 gap-8 border-t border-neutral-800 pt-16 sm:grid-cols-4">
                            {stats.map((stat, index) => (
                                <div key={index} className="text-center">
                                    <div className="text-2xl font-bold text-white sm:text-3xl">{stat.value}</div>
                                    <div className="mt-1 text-sm text-neutral-500">{stat.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section className="border-t border-neutral-900 bg-[#0f0f0f] px-4 py-24 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="mb-16 text-center">
                        <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl">
                            Everything you need to ship faster
                        </h2>
                        <p className="mx-auto max-w-2xl text-neutral-400">
                            A complete platform that combines all the tools modern teams need to build, 
                            deploy, and scale applications.
                        </p>
                    </div>

                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {features.map((feature, index) => {
                            const Icon = feature.icon
                            return (
                                <div 
                                    key={index}
                                    className="group rounded-xl border border-neutral-800 bg-[#1b1b1b] p-6 transition-all hover:border-neutral-700 hover:bg-neutral-800/50"
                                >
                                    <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg ${feature.bgColor}`}>
                                        <Icon size={24} className={feature.color} />
                                    </div>
                                    <h3 className="mb-2 text-lg font-semibold text-white">
                                        {feature.title}
                                    </h3>
                                    <p className="text-sm leading-relaxed text-neutral-400">
                                        {feature.description}
                                    </p>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </section>

            {/* Platform Preview */}
            <section className="border-t border-neutral-900 px-4 py-24 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="grid items-center gap-12 lg:grid-cols-2">
                        <div>
                            <h2 className="mb-6 text-3xl font-bold text-white sm:text-4xl">
                                Built for modern development teams
                            </h2>
                            <p className="mb-8 text-neutral-400">
                                Whether you are a startup or an established SME, Obtura provides the infrastructure 
                                and tooling you need to focus on building great products, not managing servers.
                            </p>
                            
                            <ul className="space-y-4">
                                {benefits.map((benefit, index) => (
                                    <li key={index} className="flex items-center gap-3">
                                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/10">
                                            <CheckCircle2 size={14} className="text-green-400" />
                                        </div>
                                        <span className="text-neutral-300">{benefit}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Code Preview Card */}
                        <div className="relative">
                            <div className="rounded-xl border border-neutral-800 bg-[#1b1b1b] p-6 shadow-2xl">
                                <div className="mb-4 flex items-center gap-2">
                                    <div className="h-3 w-3 rounded-full bg-red-500"></div>
                                    <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
                                    <div className="h-3 w-3 rounded-full bg-green-500"></div>
                                    <span className="ml-4 text-xs text-neutral-500">obtura.config.js</span>
                                </div>
                                <pre className="overflow-x-auto text-sm">
                                    <code className="text-neutral-300">
                                        <span className="text-purple-400">export default</span>{' '}
                                        <span className="text-blue-400">{'{'}</span>{'\n'}
                                        {'  '}<span className="text-neutral-500">// One-click deployment</span>{'\n'}
                                        {'  '}<span className="text-orange-400">deployment</span>: {'{'}{'\n'}
                                        {'    '}<span className="text-blue-400">strategy</span>:{' '}
                                        <span className="text-green-400">&apos;blue-green&apos;</span>,{'\n'}
                                        {'    '}<span className="text-blue-400">autoDeploy</span>:{' '}
                                        <span className="text-purple-400">true</span>,{'\n'}
                                        {'    '}<span className="text-blue-400">region</span>:{' '}
                                        <span className="text-green-400">&apos;eu-west&apos;</span>{'\n'}
                                        {'  '}{'}'},{'\n'}
                                        {'  '}<span className="text-neutral-500">// EU data residency</span>{'\n'}
                                        {'  '}<span className="text-orange-400">compliance</span>: {'{'}{'\n'}
                                        {'    '}<span className="text-blue-400">gdpr</span>:{' '}
                                        <span className="text-purple-400">true</span>,{'\n'}
                                        {'    '}<span className="text-blue-400">ssl</span>:{' '}
                                        <span className="text-purple-400">true</span>{'\n'}
                                        {'  '}{'}'}{'\n'}
                                        <span className="text-blue-400">{'}'}</span>
                                    </code>
                                </pre>
                            </div>
                            
                            {/* Floating badge */}
                            <div className="absolute -bottom-4 -right-4 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 shadow-xl">
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                                    <span className="text-xs text-neutral-400">Deploying in 45s...</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="border-t border-neutral-900 px-4 py-24 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-4xl">
                    <div className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 p-8 sm:p-12">
                        {/* Background decoration */}
                        <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-orange-500/20 blur-3xl"></div>
                        <div className="absolute -bottom-20 -left-20 h-40 w-40 rounded-full bg-blue-500/20 blur-3xl"></div>
                        
                        <div className="relative z-10 text-center">
                            <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl">
                                Ready to ship faster?
                            </h2>
                            <p className="mb-8 text-neutral-400">
                                Join European SMEs already using Obtura to deploy and scale their applications.
                                Start free today.
                            </p>
                            
                            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                                {session ? (
                                    <Link 
                                        href="/projects"
                                        className="group flex items-center gap-2 rounded-lg bg-orange-500 px-8 py-4 text-base font-semibold text-white transition-all hover:bg-orange-600"
                                    >
                                        Go to Dashboard
                                        <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                                    </Link>
                                ) : (
                                    <Link 
                                        href="/account/login-register?mode=register"
                                        className="group flex items-center gap-2 rounded-lg bg-orange-500 px-8 py-4 text-base font-semibold text-white transition-all hover:bg-orange-600"
                                    >
                                        Get Started Free
                                        <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                                    </Link>
                                )}
                            </div>
                            
                            <p className="mt-6 text-xs text-neutral-500">
                                No credit card required. 14-day free trial.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-neutral-900 bg-[#0a0a0a] px-4 py-12 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl">
                    <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
                        <div className="flex items-center gap-3">
                            <Image src="/logo.png" width={32} height={32} alt="Obtura Logo" className="h-8 w-8" />
                            <span className="text-lg font-semibold text-white">Obtura</span>
                        </div>
                        
                        <div className="flex items-center gap-6 text-sm text-neutral-500">
                            <span>© 2026 Obtura. All rights reserved.</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900">
                                <Globe size={14} className="text-neutral-500" />
                            </div>
                            <span className="text-xs text-neutral-500">Made in Europe</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    )
}

export default LandingPage
