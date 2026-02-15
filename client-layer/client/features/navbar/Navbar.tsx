'use client'
import React, { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useAccountStore } from '@/lib/store/accountStore'
import { FolderCodeIcon, Rocket, Users, Menu, X, ChevronDown, Settings, LogOut, User, Bell, Search, Folder, Building2 } from 'lucide-react'
import { signOut, useSession } from 'next-auth/react'
import axios from 'axios'
import { ProjectResponse } from '@/features/projects/Types/ProjectTypes'

const NavBar = () => {
    const { data: session } = useSession()

    const { user, authenticated, status, fetchAccount } = useAccountStore()
    const pathname = usePathname()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const [userMenuOpen, setUserMenuOpen] = useState(false)
    const [searchFocused, setSearchFocused] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<{ projects: ProjectResponse[]; accounts: any[] }>({ projects: [], accounts: [] })
    const [isSearching, setIsSearching] = useState(false)
    const [showSearchResults, setShowSearchResults] = useState(false)
    const searchInputRef = useRef<HTMLInputElement>(null)
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

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault()
                searchInputRef.current?.focus()
                setSearchFocused(true)
            }
            if (e.key === 'Escape') {
                setSearchFocused(false)
                setShowSearchResults(false)
                searchInputRef.current?.blur()
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [])

    const performSearch = useCallback(async (query: string) => {
        if (!query.trim() || !session?.backendToken) {
            setSearchResults({ projects: [], accounts: [] })
            setShowSearchResults(false)
            return
        }

        setIsSearching(true)
        setShowSearchResults(true)

        try {
            const [projectsRes, accountsRes] = await Promise.all([
                axios.get<{ projects: ProjectResponse[] }>(`${process.env.BACKEND_URL}/projects-manager/get-projects/${session.backendToken}`),
                axios.get<{ users: any[] }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/account-manager/search-users?query=${encodeURIComponent(query)}&accessToken=${session.backendToken}`)
            ])

            const filteredProjects = projectsRes.data.projects?.filter(p => 
                p.projectName.toLowerCase().includes(query.toLowerCase()) ||
                p.slug?.toLowerCase().includes(query.toLowerCase())
            ) || []

            const filteredAccounts = accountsRes.data.users?.filter(a =>
                a.name?.toLowerCase().includes(query.toLowerCase()) ||
                a.email?.toLowerCase().includes(query.toLowerCase())
            ) || []

            setSearchResults({ projects: filteredProjects, accounts: filteredAccounts })
        } catch (error) {
            console.error('Search error:', error)
            setSearchResults({ projects: [], accounts: [] })
        } finally {
            setIsSearching(false)
        }
    }, [session?.backendToken])

    useEffect(() => {
        const debounceTimer = setTimeout(() => {
            performSearch(searchQuery)
        }, 300)

        return () => clearTimeout(debounceTimer)
    }, [searchQuery, performSearch])

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
        { href: '/projects', label: 'Projects', icon: FolderCodeIcon },
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
            <nav className="bg-navbar-grey relative flex h-20 w-full items-center border-b border-neutral-800/60 px-8 backdrop-blur-xl z-20">
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
                        <div className={`relative flex w-full items-center rounded-lg border bg-neutral-900/50 transition-all ${searchFocused ? 'border-neutral-600 ring-1 ring-neutral-600/50' : 'border-neutral-800 hover:border-neutral-700'}`}>
                            <Search size={16} className="ml-3 text-neutral-500" />
                            <input 
                                ref={searchInputRef}
                                type="text" 
                                placeholder="Search projects, accounts..." 
                                className="w-full bg-transparent px-3 py-2 text-sm text-white placeholder-neutral-500 outline-none" 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => { setSearchFocused(true); setShowSearchResults(true); }}
                                onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                            />
                            <kbd className="mr-3 hidden rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-xs font-semibold text-neutral-500 sm:inline-block">Ctrl+K</kbd>
                        </div>
                        
                        {showSearchResults && (searchQuery || searchFocused) && (
                            <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 w-[500px] overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 shadow-2xl">
                                {isSearching ? (
                                    <div className="p-4 text-center text-sm text-neutral-500">Searching...</div>
                                ) : searchResults.projects.length === 0 && searchResults.accounts.length === 0 ? (
                                    <div className="p-4 text-center text-sm text-neutral-500">No results found</div>
                                ) : (
                                    <div className="max-h-96 overflow-y-auto">
                                        {searchResults.accounts.length > 0 && (
                                            <div className="border-b border-neutral-800">
                                                <div className="px-3 py-2 text-xs font-medium text-neutral-500">Accounts</div>
                                                {searchResults.accounts.map((account: any) => (
                                                    <Link 
                                                        key={account.id} 
                                                        href={`/account/${account.id}`}
                                                        onClick={() => { setShowSearchResults(false); setSearchQuery(''); }}
                                                        className="flex items-center gap-3 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800/50 hover:text-white"
                                                    >
                                                        <Building2 size={16} className="text-neutral-500" />
                                                        <span>{account.name || account.email}</span>
                                                        <span className="ml-auto text-xs text-neutral-500">{account.email}</span>
                                                    </Link>
                                                ))}
                                            </div>
                                        )}
                                        {searchResults.projects.length > 0 && (
                                            <div>
                                                <div className="px-3 py-2 text-xs font-medium text-neutral-500">Projects</div>
                                                {searchResults.projects.map((project: ProjectResponse) => (
                                                    <Link 
                                                        key={project.id} 
                                                        href={`/projects/${project.id}`}
                                                        onClick={() => { setShowSearchResults(false); setSearchQuery(''); }}
                                                        className="flex items-center gap-3 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800/50 hover:text-white"
                                                    >
                                                        <Folder size={16} className="text-neutral-500" />
                                                        <span>{project.projectName}</span>
                                                        <span className="ml-auto text-xs text-neutral-500">{project.slug}</span>
                                                    </Link>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
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
