'use client'
import React from 'react'
import { Users, Calendar, MoreVertical } from 'lucide-react'
import { ProjectResponse } from '../Types/ProjectTypes'

const ProjectCard: React.FC<ProjectResponse> = ({ id, projectName, createdAt, slug, teamName, memberCount }) => {
    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        })
    }

    return (
        <div className="group relative rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5 transition-all hover:border-zinc-700 hover:bg-[#202020] mt-6">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10 text-lg font-semibold text-orange-500">{projectName.charAt(0).toUpperCase()}</div>
                        <div className="flex-1">
                            <h3 className="mb-0.5 text-lg font-semibold text-white">{projectName}</h3>
                            {teamName && <p className="text-xs text-gray-500">{teamName}</p>}
                        </div>
                    </div>

                    {slug && <p className="mb-4 line-clamp-2 text-sm text-gray-400">{slug}</p>}

                    <div className="flex items-center gap-4 text-xs text-gray-500">
                        <div className="flex items-center gap-1.5">
                            <Users size={14} />
                            <span>
                                {memberCount} {memberCount === 1 ? 'member' : 'members'}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Calendar size={14} />
                            <span>Created {formatDate(createdAt)}</span>
                        </div>
                    </div>
                </div>

                <button
                    className="rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-800"
                    onClick={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        // Handle menu click
                    }}
                >
                    <MoreVertical size={18} className="text-gray-400" />
                </button>
            </div>
        </div>
    )
}

export default ProjectCard
