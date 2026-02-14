'use client'
import React from 'react'
import { TeamData } from '../types/TeamTypes'
import { Users } from 'lucide-react'

const TeamCard: React.FC<TeamData> = ({ id, name, updated_at, memberCount, is_active }) => {
    return (
        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5 transition-colors hover:bg-[#1e1e1e]">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-opacity-20 rounded-lg bg-orange-500/10 p-2.5">
                        <Users className="text-orange-500" size={20} />
                    </div>

                    <div>
                        <h3 className="mb-0.5 text-base font-semibold">{name}</h3>
                        <p className="text-sm text-gray-400">
                            {memberCount} members · Updated {updated_at}
                        </p>
                    </div>
                </div>

                <span className={`rounded-full px-3 py-1 text-sm font-medium ${is_active === true ? 'bg-opacity-20 bg-green-500/10 text-green-500' : 'bg-opacity-20 bg-gray-500 text-gray-400'}`}>{is_active === true ? 'Active' : 'Paused'}</span>
            </div>
        </div>
    )
}

export default TeamCard
