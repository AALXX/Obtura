import React, { useState, useEffect, useRef } from 'react'
import { Mail, X, UserPlus, Loader2, Search } from 'lucide-react'
import axios from 'axios'
import { getInitials } from '@/lib/utils'
import { TeamMemberData } from '../types/TeamTypes'

interface AddMember {
    id: string
    email: string
    name: string
    rolename: string
}

interface AddMemberDialogProps {
    accessToken: string
    teamId: string
    onMembersAdded?: (members: TeamMemberData[]) => void
}

const AddMemberDialog: React.FC<AddMemberDialogProps> = ({ accessToken, teamId, onMembersAdded }) => {
    const [members, setMembers] = useState<AddMember[]>([])
    const [currentEmail, setCurrentEmail] = useState('')
    const [emailError, setEmailError] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [successMessage, setSuccessMessage] = useState('')

    const [searchResults, setSearchResults] = useState<AddMember[]>([])
    const [isSearchLoading, setIsSearchLoading] = useState(false)
    const [showDropdown, setShowDropdown] = useState(false)
    const [selectedUser, setSelectedUser] = useState<AddMember | null>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const validateEmail = (email: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return emailRegex.test(email)
    }

    const handleAddMember = () => {
        setEmailError('')
        setSuccessMessage('')

        if (!currentEmail.trim()) {
            setEmailError('Please enter an email address')
            return
        }

        if (!validateEmail(currentEmail)) {
            setEmailError('Please enter a valid email address')
            return
        }

        if (members.some(m => m.email.toLowerCase() === currentEmail.toLowerCase())) {
            setEmailError('This email has already been added')
            return
        }

        if (!selectedUser) {
            setEmailError('Please select a user')
            return
        }

        const newMember: AddMember = {
            email: currentEmail,
            name: selectedUser?.name,
            rolename: selectedUser?.rolename,
            id: selectedUser?.id!
        }

        setMembers([...members, newMember])
        setCurrentEmail('')
        setSelectedUser(null)
    }

    const handleRemoveMember = (id: string) => {
        setMembers(members.filter(m => m.id !== id))
        setSuccessMessage('')
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleAddMember()
        }
    }

    const handleAddMembers = async () => {
        if (members.length === 0) {
            setEmailError('Please add at least one member')
            return
        }

        setIsLoading(true)
        setSuccessMessage('')

        try {
            const resp = await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/teams-manager/add-team-members`, {
                accessToken: accessToken,
                teamId: teamId,
                members: members.map(m => ({
                    id: m.id
                }))
            })

            if (resp.status !== 200) {
                setEmailError('Something went wrong while adding members')
                setIsLoading(false)
                return
            }

            setIsLoading(false)
            setSuccessMessage(`Invitation${members.length > 1 ? 's' : ''} sent successfully to ${members.length} member${members.length > 1 ? 's' : ''}!`)

            const newTeamMembers: TeamMemberData[] = members.map(m => ({
                id: m.id,
                name: m.name,
                email: m.email,
                teamname: '',
                rolename: m.rolename,
                can_edit: false,
                is_you: false
            }))

            if (onMembersAdded) {
                setTimeout(() => {
                    onMembersAdded(newTeamMembers)
                    setMembers([])
                    setSuccessMessage('')
                }, 1500)
            } else {
                setTimeout(() => {
                    setMembers([])
                    setSuccessMessage('')
                }, 2000)
            }
        } catch (error) {
            setEmailError('Failed to add members. Please try again.')
            setIsLoading(false)
        }
    }

    const handleSelectUser = (user: any) => {
        setSelectedUser(user)
        setCurrentEmail(user.useremail || user.email || '')
        setShowDropdown(false)
    }

    useEffect(() => {
        const handleSearch = async () => {
            if (currentEmail && currentEmail.trim().length > 0) {
                setIsSearchLoading(true)
                setEmailError('')

                try {
                    const results = await axios.get<{ usersData: AddMember[] }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/company-manager/search-users/${accessToken}/${currentEmail}`)

                    const usersData = results.data?.usersData
                    if (Array.isArray(usersData)) {
                        setSearchResults(usersData)
                        setShowDropdown(usersData.length > 0)
                    } else {
                        console.warn('usersData is not an array:', usersData)
                        setSearchResults([])
                        setShowDropdown(false)
                    }
                } catch (err) {
                    console.error('Search error:', err)
                    setSearchResults([])
                    setShowDropdown(false)
                } finally {
                    setIsSearchLoading(false)
                }
            } else {
                setSearchResults([])
                setShowDropdown(false)
            }
        }

        const timeoutId = setTimeout(handleSearch, 300)
        return () => clearTimeout(timeoutId)
    }, [currentEmail, accessToken])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [])

    return (
        <div className="flex h-full w-full flex-col">
            <div className="pb-4">
                <div className="flex items-center gap-2 text-2xl font-bold text-white">
                    <UserPlus className="h-6 w-6" />
                    Add Team Members
                </div>
                <p className="text-gray-300">Add team members to your team</p>
            </div>

            <div className="my-4 h-px w-full border-b border-neutral-800" />

            <div className="flex-1 space-y-6">
                <div className="space-y-4">
                    <div>
                        <label className="mb-2 block text-white">Search User</label>
                        <div className="relative">
                            <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-500" size={18} />
                            <input
                                type="email"
                                placeholder="Search by email"
                                value={currentEmail || ''}
                                onChange={e => {
                                    setCurrentEmail(e.target.value || '')
                                    setEmailError('')
                                    setSelectedUser(null)
                                }}
                                onKeyPress={handleKeyPress}
                                className="w-full rounded-md bg-[#0a0a0a] py-2 pr-10 pl-10 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-gray-500 focus:outline-none"
                            />
                            {isSearchLoading && (
                                <div className="absolute top-1/2 right-3 -translate-y-1/2">
                                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                                </div>
                            )}

                            {showDropdown && searchResults.length > 0 && (
                                <div ref={dropdownRef} className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-600 bg-[#2a2a2a] shadow-lg">
                                    {searchResults.map(user => (
                                        <div key={user.id} className="flex cursor-pointer items-center gap-3 border-b border-gray-600 p-3 last:border-b-0 hover:bg-[#3a3a3a]" onClick={() => handleSelectUser(user)}>
                                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-500/10 text-sm font-semibold text-orange-500">{getInitials(user.name)}</div>

                                            <div>
                                                <p className="text-sm font-medium text-white">{user.name}</p>
                                                <p className="text-xs text-gray-400">{user.email}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {showDropdown && currentEmail && searchResults.length === 0 && !isSearchLoading && (
                                <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-600 bg-[#2a2a2a] p-3 text-center shadow-lg">
                                    <p className="text-sm text-gray-400">No users found</p>
                                </div>
                            )}
                        </div>

                        {selectedUser && (
                            <div className="mt-2 rounded-md bg-[#3a3a3a] p-2">
                                <div className="flex items-center gap-2">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-500/10 text-sm font-semibold text-orange-500">{getInitials(selectedUser.name)}</div>
                                    <span className="text-sm text-white">{selectedUser.name}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <button onClick={handleAddMember} className="w-full cursor-pointer rounded-md border border-white px-6 py-2 text-white transition-colors hover:bg-[#ffffff1a]">
                        Select Member
                    </button>

                    {emailError && <p className="text-sm text-red-400">{emailError}</p>}
                </div>

                {members.length > 0 && (
                    <div className="flex-1">
                        <div className="mb-3">
                            <p className="text-white">
                                {members.length} member{members.length > 1 ? 's' : ''} to invite
                            </p>
                        </div>
                        <div className="max-h-[300px] space-y-2 overflow-y-auto rounded-md bg-[#0a0a0a] p-4">
                            {members.map(member => (
                                <div key={member.id} className="flex items-center justify-between rounded-md border border-neutral-800 bg-[#1b1b1b] p-3 transition-colors hover:border-neutral-700">
                                    <div className="flex items-center gap-3">
                                        <div>
                                            <p className="text-white">{member.name}</p>
                                            <p className="text-xs text-gray-400">{member.email}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => handleRemoveMember(member.id)} className="rounded p-1 text-gray-400 transition-colors hover:bg-neutral-800 hover:text-white">
                                        <X size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {successMessage && (
                    <div className="rounded-md border border-green-500/20 bg-green-500/10 p-3">
                        <p className="text-sm text-green-400">{successMessage}</p>
                    </div>
                )}
            </div>

            <div className="mt-auto space-y-4 pt-6">
                <div className="my-4 h-px w-full border-b border-neutral-800" />

                <div className="flex justify-end gap-3">
                    <button
                        className="cursor-pointer rounded-md border border-white px-6 py-2 text-white transition-colors hover:bg-[#ffffff1a]"
                        onClick={() => {
                            setMembers([])
                            setCurrentEmail('')
                            setEmailError('')
                            setSuccessMessage('')
                            setSelectedUser(null)
                        }}
                    >
                        Cancel
                    </button>
                    <button onClick={handleAddMembers} disabled={isLoading || members.length === 0} className="flex cursor-pointer items-center gap-2 rounded-md bg-orange-500 px-6 py-2 text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-70">
                        {isLoading ? (
                            <>
                                <Loader2 className="animate-spin" size={18} />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Mail size={18} />
                                Add Member{members.length > 1 ? 's' : ''}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default AddMemberDialog
