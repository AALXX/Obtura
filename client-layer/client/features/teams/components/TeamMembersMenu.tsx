'use client'
import React, { useState, useRef, useEffect } from 'react'
import { MoreVertical, Trash2, Crown, UserMinus } from 'lucide-react'
import { TeamMemberData } from '../types/TeamTypes'

interface MemberActionMenuProps {
    member: TeamMemberData
    onRemove: (memberId: string) => void
    onPromote: (memberId: string) => void
    onDemote: (memberId: string) => void
}

const MemberActionMenu: React.FC<MemberActionMenuProps> = ({ member, onRemove, onPromote, onDemote }) => {
    const [isOpen, setIsOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isOpen])

    return (
        <div className="relative" ref={menuRef}>
            <button onClick={() => setIsOpen(!isOpen)} className="cursor-pointer rounded p-1 text-gray-400 transition-colors hover:bg-zinc-800 hover:text-white">
                <MoreVertical className="h-5 w-5" />
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 z-10 mt-2 w-48 rounded-lg border border-zinc-800 bg-[#1b1b1b] py-2 shadow-xl">
                    {member.can_edit && (
                        <button
                            onClick={() => {
                                onPromote(member.id)
                                setIsOpen(false)
                            }}
                            className="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left text-sm text-white transition-colors hover:bg-zinc-800"
                        >
                            <Crown className="h-4 w-4 text-orange-500" />
                            Promote to Leader
                        </button>
                    )}

                    {member.can_edit && (
                        <button
                            onClick={() => {
                                onDemote(member.id)
                                setIsOpen(false)
                            }}
                            className="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left text-sm text-white transition-colors hover:bg-zinc-800"
                        >
                            <UserMinus className="h-4 w-4 text-gray-400" />
                            Demote to Member
                        </button>
                    )}

                    <div className="my-1 border-t border-zinc-800"></div>

                    <button
                        onClick={() => {
                            onRemove(member.id)
                            setIsOpen(false)
                        }}
                        className="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left text-sm text-red-500 transition-colors hover:bg-zinc-800"
                    >
                        <Trash2 className="h-4 w-4" />
                        Remove Member
                    </button>
                </div>
            )}
        </div>
    )
}

export default MemberActionMenu
