'use client'
import React, { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useAccountStore } from '@/lib/store/accountStore'
import { FolderKanban, Rocket, Users, Menu, X, ChevronDown, Settings, LogOut, User, Bell, Search } from 'lucide-react'
import { signOut, useSession } from 'next-auth/react'
import axios from 'axios'

const NavBar = () => {
    const { data: session } = useSession()

    const { user, authenticated, status, fetchAccount } = useAccountStore()
    const pathname = usePathname()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const [userMenuOpen, setUserMenuOpen] = useState(false)
    const [searchFocused, setSearchFocused] = useState(false)
    const userMenuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (status === 'idle') {
            fetchAccount()
        }
    }, [status, fetchAccount])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
                setUserMenuOpen(false)
            }
        }

        if (userMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [userMenuOpen])

    const handleSignOut = async () => {
        try {
            const resp = await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/account-manager/logout`, {
                accessToken: session?.backendToken
            })

            if (resp.status !== 200) {
                window.alert('Failed to sign out. Please try again.')
                return
            }

            await signOut({ callbackUrl: '/account/login-register' })
        } catch (error) {
            console.error('Error during sign out:', error)
        }
    }

    const navItems = [
        { href: '/projects', label: 'Projects', icon: FolderKanban },
        { href: '/deployments', label: 'Deployments', icon: Rocket },
        { href: '/employees', label: 'Employees', icon: Users },
        { href: '/team', label: 'Team', icon: Users }
    ]

    const userMenuItems = [
        {
            label: 'Profile',
            icon: User,
            href: '/account',
            onClick: () => {
                setUserMenuOpen(false)
            }
        },
        {
            label: 'Sign Out',
            icon: LogOut,
            divider: true,
            onClick: () => {
                setUserMenuOpen(false)
                handleSignOut()
            }
        }
    ]

    return (
        <>
            <nav className="bg-navbar-grey relative flex h-20 w-full items-center border-b border-neutral-800/60 px-8 backdrop-blur-xl">
                <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-neutral-900/50 via-transparent to-neutral-900/50"></div>

                <div className="relative z-10 flex w-full items-center">
                    <div className="flex items-center">
                        <Link href="/" className="group flex items-center">
                            <div className="flex items-center gap-2">
                                <Image src="/logo.png" width={1000} height={100} alt="Obtura Logo " className="h-12 w-12" />

                                <h1 className="text-lg font-semibold tracking-tight text-white transition-colors group-hover:text-neutral-100">Obtura</h1>
                            </div>
                        </Link>
                    </div>

                    <div className="mx-6 hidden h-6 w-px bg-neutral-800 md:block"></div>

                    <div className="hidden flex-1 items-center md:flex">
                        <div className="flex items-center gap-0.5">
                            {navItems.map(item => {
                                const Icon = item.icon
                                const isActive = pathname === item.href
                                return (
                                    <Link key={item.href} href={item.href} className={`group relative flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${isActive ? 'bg-neutral-800/80 text-white' : 'text-neutral-400 hover:bg-neutral-800/40 hover:text-white'}`}>
                                        <Icon size={16} strokeWidth={2} className={isActive ? 'text-white' : 'text-neutral-500 group-hover:text-neutral-300'} />
                                        <span className="tracking-wide">{item.label}</span>
                                    </Link>
                                )
                            })}
                        </div>
                    </div>

                    <div className="mx-6 hidden max-w-md flex-1 items-center lg:flex">
                        <div className={`flex w-full items-center rounded-lg border bg-neutral-900/50 transition-all ${searchFocused ? 'border-neutral-600 ring-1 ring-neutral-600/50' : 'border-neutral-800 hover:border-neutral-700'}`}>
                            <Search size={16} className="ml-3 text-neutral-500" />
                            <input type="text" placeholder="Search projects, deployments..." className="w-full bg-transparent px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none" onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} />
                            <kbd className="mr-3 hidden rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-xs font-semibold text-neutral-500 sm:inline-block">⌘K</kbd>
                        </div>
                    </div>

                    <div className="ml-auto flex items-center gap-3">
                        {authenticated && (
                            <button className="relative hidden rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800/50 hover:text-white sm:flex">
                                <Bell size={16} strokeWidth={2} />
                                <span className="ring-navbar-grey absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-red-500 ring-2"></span>
                            </button>
                        )}

                        {authenticated ? (
                            <div className="relative" ref={userMenuRef}>
                                <button onClick={() => setUserMenuOpen(!userMenuOpen)} className="group hidden items-center gap-2 rounded-lg px-2 py-1 transition-all hover:bg-neutral-800/50 sm:flex">
                                    <Image className="h-7 w-7 rounded-full ring-1 ring-neutral-700 transition-all group-hover:ring-neutral-600" src={user?.image || `/no_account_icon.svg`} alt="User Avatar" width={28} height={28} />
                                    {user?.name && <span className="max-w-[120px] truncate text-xs font-medium text-white">{user.name}</span>}
                                    <ChevronDown size={14} className={`text-neutral-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {userMenuOpen && (
                                    <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl">
                                        <div className="border-b border-neutral-800 px-3 py-2">
                                            <p className="text-xs font-medium text-white">{user?.name || 'User'}</p>
                                            <p className="truncate text-[10px] text-neutral-500">{user?.email || 'user@example.com'}</p>
                                        </div>
                                        <div className="py-1">
                                            {userMenuItems.map((item, index) => (
                                                <React.Fragment key={item.label}>
                                                    {item.divider && <div className="my-1 border-t border-neutral-800"></div>}
                                                    {item.href ? (
                                                        <Link href={item.href} onClick={item.onClick} className="flex items-center gap-3 px-3 py-2 text-xs text-neutral-300 transition-colors hover:bg-neutral-800/50 hover:text-white">
                                                            <item.icon size={14} strokeWidth={2} />
                                                            <span>{item.label}</span>
                                                        </Link>
                                                    ) : (
                                                        <button onClick={item.onClick} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-xs text-neutral-300 transition-colors hover:bg-neutral-800/50 hover:text-white">
                                                            <item.icon size={14} strokeWidth={2} />
                                                            <span>{item.label}</span>
                                                        </button>
                                                    )}
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <Link href="/account/login-register" className="hidden items-center gap-2 rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-700 sm:flex">
                                Sign In
                            </Link>
                        )}

                        <Link href="/account" className="sm:hidden">
                            <Image className="h-7 w-7 rounded-full ring-1 ring-neutral-700" src={authenticated && user?.image ? user.image : `/no_account_icon.svg`} alt="User Avatar" width={28} height={28} />
                        </Link>

                        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800/50 hover:text-white md:hidden" aria-label="Toggle menu">
                            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
                        </button>
                    </div>
                </div>
            </nav>

            {mobileMenuOpen && (
                <div className="bg-navbar-grey border-b border-neutral-800/60 backdrop-blur-xl md:hidden">
                    <div className="px-4 pt-3 pb-2">
                        <div className="flex w-full items-center rounded-lg border border-neutral-800 bg-neutral-900/50">
                            <Search size={14} className="ml-3 text-neutral-500" />
                            <input type="text" placeholder="Search..." className="w-full bg-transparent px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none" />
                        </div>
                    </div>

                    <div className="px-4 pb-3">
                        {navItems.map(item => {
                            const Icon = item.icon
                            const isActive = pathname === item.href
                            return (
                                <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)} className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-neutral-800/80 text-white' : 'text-neutral-400 hover:bg-neutral-800/40 hover:text-white'}`}>
                                    <Icon size={16} strokeWidth={2} />
                                    <span>{item.label}</span>
                                </Link>
                            )
                        })}
                    </div>
                </div>
            )}
        </>
    )
}

export default NavBar
