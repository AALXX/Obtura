'use client'
import React, { useState } from 'react'
import { Search, Users, Plus } from 'lucide-react'
import { TeamData } from './types/TeamTypes'
import TeamCard from './components/TeamCard'
import DialogCanvas from '@/common-components/DialogCanvas'
import CreateNewTeamDialog from './components/CreateTeamDialog'

const Teams: React.FC<{ teams: TeamData[]; accessToken: string }> = props => {
    const [searchQuery, setSearchQuery] = useState('')
    const [teams, setTeams] = useState(props.teams)

    const [showCreateTeamDialog, setShowCreateTeamDialog] = useState(false)

    const filteredTeams = teams.filter(team => team.name.toLowerCase().includes(searchQuery.toLowerCase()))



    return (
        <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
            <div className="mb-8 flex items-start justify-between">
                <div>
                    <h1 className="mb-2 text-4xl font-bold">Teams</h1>
                    <p className="text-lg text-gray-400">Manage and organize your teams</p>
                </div>
                <button onClick={() => setShowCreateTeamDialog(true)} className="flex cursor-pointer items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 font-medium text-white transition-colors hover:bg-orange-600">
                    <Plus size={20} />
                    New Team
                </button>
            </div>

            <div className="relative mb-6">
                <Search className="absolute top-1/2 left-4 -translate-y-1/2 transform text-gray-400" size={20} />
                <input type="text" placeholder="Search teams..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full rounded-lg border border-zinc-800 bg-[#1b1b1b] py-3 pr-4 pl-12 text-white placeholder-gray-500 focus:border-zinc-700 focus:outline-none" />
            </div>

            {showCreateTeamDialog && (
                <DialogCanvas closeDialog={() => setShowCreateTeamDialog(false)}>
                    <CreateNewTeamDialog accessToken={props.accessToken} closeDialog={() => setShowCreateTeamDialog(false)} setTeams={setTeams} />
                </DialogCanvas>
            )}

            <div className="space-y-4">
                {filteredTeams.map(team => (
                    <TeamCard key={team.id} {...team} />
                ))}

                {filteredTeams.length === 0 && (
                    <div className="py-12 text-center text-gray-400">
                        <Users size={48} className="mx-auto mb-4 opacity-50" />
                        <p className="text-lg">No teams found</p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default Teams
