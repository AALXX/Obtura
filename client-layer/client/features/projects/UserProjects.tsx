'use client'
import React, { useEffect, useState } from 'react'
import { Search, Users, Plus } from 'lucide-react'
import DialogCanvas from '@/common-components/DialogCanvas'
import { ProjectResponse } from './Types/ProjectTypes'
import AddProjectDialog from './components/AddProjectDialog'
import { TeamData } from '@/features/teams/types/TeamTypes'
import axios from 'axios'
import Link from 'next/link'
import ProjectCard from './components/ProjectCard'

const UserProjects: React.FC<{ projects: ProjectResponse[]; accessToken: string }> = props => {
    const [searchQuery, setSearchQuery] = useState('')
    const [projects, setProjects] = useState(props.projects)
    const [teams, setTeams] = useState<TeamData[]>([])

    const [showAddProjectDialog, setShowAddProjectDialog] = useState(false)

    useEffect(() => {
        ;(async () => {
            const teams = await axios.get<{ teams: TeamData[] }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/teams-manager/get-teams/${props.accessToken}`)
            setTeams(teams.data.teams)
        })()
    }, [])

    return (
        <div className="container mx-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
            <div className="mb-6 flex items-start justify-between">
                <div>
                    <h1 className="mb-1.5 text-3xl font-bold">Projects</h1>
                    <p className="text-base text-gray-400">Manage your projects</p>
                </div>
                <button onClick={() => setShowAddProjectDialog(true)} className="flex cursor-pointer items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-600">
                    <Plus size={20} />
                    New Project
                </button>
            </div>

            <div className="relative mb-5">
                <Search className="absolute top-1/2 left-3.5 -translate-y-1/2 transform text-gray-400" size={20} />
                <input type="text" placeholder="Search projects..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full rounded-lg border border-zinc-800 bg-[#1b1b1b] py-2.5 pr-3.5 pl-11 text-sm text-white placeholder-gray-500 focus:border-zinc-700 focus:outline-none" />
            </div>

            {showAddProjectDialog && (
                <DialogCanvas closeDialog={() => setShowAddProjectDialog(false)}>
                    <AddProjectDialog accessToken={props.accessToken} closeDialog={() => setShowAddProjectDialog(false)} setProjects={setProjects} teams={teams} />
                </DialogCanvas>
            )}

            <div className="space-y-3">
                <div className="space-y-3">
                    {projects
                        .filter(project => project.projectName.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map(project => (
                            <Link href={`/projects/${project.id}`} key={project.id}>
                                <ProjectCard id={project.id} projectName={project.projectName} slug={project.slug} teamName={project.teamName} createdAt={project.createdAt} memberCount={project.memberCount} />
                            </Link>
                        ))}

                    {projects.filter(project => project.projectName.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                        <div className="py-10 text-center text-gray-400">
                            <Users size={44} className="mx-auto mb-3 opacity-50" />
                            <p className="text-base">No projects found</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default UserProjects
