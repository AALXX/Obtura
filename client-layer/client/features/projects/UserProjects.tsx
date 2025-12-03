'use client'
import CompanyRequired from '@/common-components/CompayRequired'
import { useAccountStore } from '@/lib/store/accountStore'
import { Plus, Search, FolderKanban } from 'lucide-react'
import { useEffect } from 'react'

const projects = [
    { id: 1, name: 'E-commerce Platform', status: 'Active', deployments: 12, lastUpdated: '2 hours ago' },
    { id: 2, name: 'Marketing Website', status: 'Active', deployments: 8, lastUpdated: '1 day ago' },
    { id: 3, name: 'Mobile App Backend', status: 'Paused', deployments: 24, lastUpdated: '3 days ago' }
]

const UserProjects = () => {
    const { user, status, fetchAccount } = useAccountStore()

    useEffect(() => {
        if (status === 'idle') {
            fetchAccount()
        }
    }, [status, fetchAccount])

    if (!user?.hasCompany) {
        return <CompanyRequired featureAccess="projects" />
    }

    return (
        <div className="min-h-screen text-white">
            <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
                <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div>
                        <h1 className="mb-1 text-4xl font-bold">Projects</h1>
                        <p className="text-base text-gray-400">Manage and monitor your projects</p>
                    </div>
                    <button className="flex w-fit items-center gap-2 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-700">
                        <Plus className="h-4 w-4" />
                        New Project
                    </button>
                </div>

                <div className="relative mb-6">
                    <Search className="absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-gray-500" />
                    <input type="text" placeholder="mark" className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-3.5 pr-4 pl-12 text-white placeholder-gray-500 focus:border-transparent focus:ring-2 focus:ring-orange-400 focus:outline-none" />
                </div>

                <div className="grid gap-4">
                    {projects.map(project => (
                        <div key={project.id} className="cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900 p-6 transition-all hover:border-zinc-700">
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-4">
                                    <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-3">
                                        <FolderKanban className="h-6 w-6 text-orange-500" />
                                    </div>
                                    <div>
                                        <h3 className="mb-2 text-lg font-medium text-white">{project.name}</h3>
                                        <p className="text-sm text-gray-400">
                                            {project.deployments} deployments · Updated {project.lastUpdated}
                                        </p>
                                    </div>
                                </div>
                                <span className={`rounded-full px-3 py-1 text-xs font-medium ${project.status === 'Active' ? 'bg-green-500/10 text-green-400' : 'bg-zinc-800 text-gray-400'}`}>{project.status}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default UserProjects
