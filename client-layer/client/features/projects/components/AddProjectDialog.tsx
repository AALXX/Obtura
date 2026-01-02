import React, { useState } from 'react'
import { X, GitBranch, Globe, Rocket, RefreshCw, AlertCircle, Users } from 'lucide-react'
import { ProjectResponse } from '../Types/ProjectTypes'
import axios from 'axios'
import { TeamData } from '@/features/teams/types/TeamTypes'

interface AddProjectDialogProps {
    closeDialog: () => void
    accessToken: string
    teams: TeamData[]
    setProjects: React.Dispatch<React.SetStateAction<ProjectResponse[]>>
}

interface FormData {
    name: string
    teamId: string
    gitRepoUrl: string
    productionBranch: string
    stagingBranch: string
    developmentBranch: string
    createDeploymentNow: boolean
    autoDeployProduction: boolean
    autoDeployStaging: boolean
    autoDeployDevelopment: boolean
}

interface ParsedGitUrl {
    provider: 'github' | 'gitlab'
    owner: string
    repo: string
}

interface GitBranch {
    name: string
}

const AddProjectDialog: React.FC<AddProjectDialogProps> = ({ closeDialog, accessToken, teams, setProjects }) => {
    const [formData, setFormData] = useState<FormData>({
        name: '',
        teamId: '',
        gitRepoUrl: '',
        productionBranch: '',
        stagingBranch: '',
        developmentBranch: '',
        createDeploymentNow: false,
        autoDeployProduction: true,
        autoDeployStaging: true,
        autoDeployDevelopment: false
    })

    const [loading, setLoading] = useState<boolean>(false)
    const [fetchingBranches, setFetchingBranches] = useState<boolean>(false)
    const [branches, setBranches] = useState<string[]>([])
    const [branchError, setBranchError] = useState<string>('')
    const [error, setError] = useState<string>('')
    const [validationErrors, setValidationErrors] = useState<{
        name?: string
        teamId?: string
        gitRepoUrl?: string
    }>({})

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target
        const checked = (e.target as HTMLInputElement).checked

        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }))

        if (validationErrors[name as keyof typeof validationErrors]) {
            setValidationErrors(prev => ({
                ...prev,
                [name]: undefined
            }))
        }

        if (name === 'gitRepoUrl') {
            setBranches([])
            setBranchError('')
        }
    }

    const validateForm = (): boolean => {
        const errors: typeof validationErrors = {}

        if (!formData.name.trim()) {
            errors.name = 'Project name is required'
        }

        if (!formData.teamId) {
            errors.teamId = 'Team selection is required'
        }

        if (!formData.gitRepoUrl.trim()) {
            errors.gitRepoUrl = 'Git repository URL is required'
        }

        setValidationErrors(errors)
        return Object.keys(errors).length === 0
    }

    const parseGitUrl = (url: string): ParsedGitUrl | null => {
        const githubMatch = url.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)(\.git)?/)
        const gitlabMatch = url.match(/gitlab\.com[\/:]([^\/]+)\/([^\/\.]+)(\.git)?/)

        if (githubMatch) {
            return { provider: 'github', owner: githubMatch[1], repo: githubMatch[2] }
        } else if (gitlabMatch) {
            return { provider: 'gitlab', owner: gitlabMatch[1], repo: gitlabMatch[2] }
        }
        return null
    }

    const fetchBranches = async (): Promise<void> => {
        if (!formData.gitRepoUrl) {
            setBranchError('Please enter a Git repository URL first')
            return
        }

        const parsed = parseGitUrl(formData.gitRepoUrl)
        if (!parsed) {
            setBranchError('Invalid GitHub or GitLab URL')
            return
        }

        setFetchingBranches(true)
        setBranchError('')
        setBranches([])

        try {
            let apiUrl: string
            if (parsed.provider === 'github') {
                apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/branches`
            } else {
                const projectId = encodeURIComponent(`${parsed.owner}/${parsed.repo}`)
                apiUrl = `https://gitlab.com/api/v4/projects/${projectId}/repository/branches`
            }

            const response = await fetch(apiUrl)

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Repository not found or not accessible')
                } else if (response.status === 403) {
                    throw new Error('Rate limit exceeded or private repository')
                } else {
                    throw new Error('Failed to fetch branches')
                }
            }

            const data: GitBranch[] = await response.json()
            const branchNames = data.map(branch => branch.name)
            setBranches(branchNames)

            if (branchNames.includes('main') && !formData.productionBranch) {
                setFormData(prev => ({ ...prev, productionBranch: 'main' }))
            } else if (branchNames.includes('master') && !formData.productionBranch) {
                setFormData(prev => ({ ...prev, productionBranch: 'master' }))
            }

            if (branchNames.includes('staging') && !formData.stagingBranch) {
                setFormData(prev => ({ ...prev, stagingBranch: 'staging' }))
            }

            if (branchNames.includes('dev') && !formData.developmentBranch) {
                setFormData(prev => ({ ...prev, developmentBranch: 'dev' }))
            } else if (branchNames.includes('develop') && !formData.developmentBranch) {
                setFormData(prev => ({ ...prev, developmentBranch: 'develop' }))
            }
        } catch (err) {
            setBranchError((err as Error).message)
        } finally {
            setFetchingBranches(false)
        }
    }

    const handleSubmit = async (e: React.MouseEvent<HTMLButtonElement>): Promise<void> => {
        e.preventDefault()
        setError('')

        if (!validateForm()) {
            return
        }

        setLoading(true)

        try {
            const projectData = {
                ...formData
            }

            const response = await axios.post<{ project: ProjectResponse }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/projects-manager/create-project`, {
                ...projectData,
                accessToken
            })

            if (response.status !== 200) {
                setError('Failed to create project')
                return
            }
            const newProject: ProjectResponse = response.data.project
            setProjects((prev: ProjectResponse[]) => {
                const currentProjects = Array.isArray(prev) ? prev : []
                return [...currentProjects, newProject]
            })

            closeDialog()
        } catch (err) {
            setError((err as Error).message || 'Failed to create project')
        } finally {
            setLoading(false)
        }
    }

    const activeTeams = teams.filter(team => team.is_active)

    return (
        <div className="flex h-full w-full flex-col">
            <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
                <h2 className="text-xl font-semibold text-white">Create New Project</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-6">
                    {error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-white">Basic Information</h3>

                        <div>
                            <label htmlFor="name" className="mb-2 block text-sm font-medium text-white">
                                Project Name
                            </label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                value={formData.name}
                                onChange={handleInputChange}
                                required
                                placeholder="My Awesome Project"
                                className={`w-full rounded-lg border ${validationErrors.name ? 'border-red-500' : 'border-zinc-800'} bg-[#0d0d0d] px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-zinc-700 focus:outline-none`}
                            />
                            {validationErrors.name && <p className="mt-1.5 text-xs text-red-400">{validationErrors.name}</p>}
                        </div>

                        <div>
                            <label htmlFor="teamId" className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
                                <Users size={16} />
                                Assigned Team
                            </label>
                            <select id="teamId" name="teamId" value={formData.teamId} onChange={handleInputChange} required className={`w-full rounded-lg border ${validationErrors.teamId ? 'border-red-500' : 'border-zinc-800'} bg-[#0d0d0d] px-4 py-2.5 text-sm text-white focus:border-zinc-700 focus:outline-none`}>
                                <option value="">Select a team</option>
                                {activeTeams.map(team => (
                                    <option key={team.id} value={team.id}>
                                        {team.name} ({team.memberCount} member{team.memberCount !== 1 ? 's' : ''})
                                    </option>
                                ))}
                            </select>
                            {validationErrors.teamId && <p className="mt-1.5 text-xs text-red-400">{validationErrors.teamId}</p>}
                            {activeTeams.length === 0 && <p className="mt-1.5 text-xs text-yellow-400">No active teams available. Please create a team first.</p>}
                        </div>
                    </div>

                    <div className="space-y-4 border-t border-zinc-800 pt-6">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                            <GitBranch size={16} />
                            Git Configuration
                        </h3>

                        <div>
                            <label htmlFor="gitRepoUrl" className="mb-2 block text-sm font-medium text-white">
                                Repository URL
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="url"
                                    id="gitRepoUrl"
                                    name="gitRepoUrl"
                                    value={formData.gitRepoUrl}
                                    onChange={handleInputChange}
                                    required
                                    placeholder="https://github.com/username/repo.git"
                                    className={`flex-1 rounded-lg border ${validationErrors.gitRepoUrl ? 'border-red-500' : 'border-zinc-800'} bg-[#0d0d0d] px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-zinc-700 focus:outline-none`}
                                />
                                <button type="button" onClick={fetchBranches} disabled={fetchingBranches || !formData.gitRepoUrl} className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-[#0d0d0d] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50">
                                    <RefreshCw size={16} className={fetchingBranches ? 'animate-spin' : ''} />
                                    {fetchingBranches ? 'Fetching...' : 'Fetch Branches'}
                                </button>
                            </div>
                            {validationErrors.gitRepoUrl && <p className="mt-1.5 text-xs text-red-400">{validationErrors.gitRepoUrl}</p>}
                            <p className="mt-1.5 text-xs text-gray-500">Supports public GitHub and GitLab repositories</p>

                            {branchError && (
                                <div className="mt-2 flex items-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
                                    <AlertCircle size={14} />
                                    {branchError}
                                </div>
                            )}

                            {branches.length > 0 && (
                                <div className="mt-2 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-400">
                                    Found {branches.length} branch{branches.length !== 1 ? 'es' : ''}: {branches.slice(0, 5).join(', ')}
                                    {branches.length > 5 && ` and ${branches.length - 5} more`}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label htmlFor="productionBranch" className="mb-2 block text-sm font-medium text-white">
                                    Production Branch
                                </label>
                                {branches.length > 0 ? (
                                    <select id="productionBranch" name="productionBranch" value={formData.productionBranch} onChange={handleInputChange} className="w-full rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-2.5 text-sm text-white focus:border-zinc-700 focus:outline-none">
                                        <option value="">Select branch</option>
                                        {branches.map(branch => (
                                            <option key={branch} value={branch}>
                                                {branch}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input type="text" id="productionBranch" name="productionBranch" value={formData.productionBranch} onChange={handleInputChange} placeholder="main" className="w-full rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-zinc-700 focus:outline-none" />
                                )}
                            </div>

                            <div>
                                <label htmlFor="stagingBranch" className="mb-2 block text-sm font-medium text-white">
                                    Staging Branch
                                </label>
                                {branches.length > 0 ? (
                                    <select id="stagingBranch" name="stagingBranch" value={formData.stagingBranch} onChange={handleInputChange} className="w-full rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-2.5 text-sm text-white focus:border-zinc-700 focus:outline-none">
                                        <option value="">Select branch</option>
                                        {branches.map(branch => (
                                            <option key={branch} value={branch}>
                                                {branch}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input type="text" id="stagingBranch" name="stagingBranch" value={formData.stagingBranch} onChange={handleInputChange} placeholder="staging" className="w-full rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-zinc-700 focus:outline-none" />
                                )}
                            </div>

                            <div>
                                <label htmlFor="developmentBranch" className="mb-2 block text-sm font-medium text-white">
                                    Development Branch
                                </label>
                                {branches.length > 0 ? (
                                    <select id="developmentBranch" name="developmentBranch" value={formData.developmentBranch} onChange={handleInputChange} className="w-full rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-2.5 text-sm text-white focus:border-zinc-700 focus:outline-none">
                                        <option value="">Select branch</option>
                                        {branches.map(branch => (
                                            <option key={branch} value={branch}>
                                                {branch}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input type="text" id="developmentBranch" name="developmentBranch" value={formData.developmentBranch} onChange={handleInputChange} placeholder="dev" className="w-full rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-zinc-700 focus:outline-none" />
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 border-t border-zinc-800 pt-6">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                            <Rocket size={16} />
                            Deployment Triggers
                        </h3>
                        <p className="text-xs text-gray-500">Configure when deployments should be triggered automatically</p>

                        <div className="space-y-3">
                            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-3 transition-colors hover:border-zinc-700">
                                <input type="checkbox" name="createDeploymentNow" checked={formData.createDeploymentNow} onChange={handleInputChange} className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-2 focus:ring-orange-500 focus:ring-offset-0" />
                                <div className="flex-1">
                                    <div className="text-sm font-medium text-white">Create Deployment Right Now</div>
                                    <div className="text-xs text-gray-500">Create a deployment right now with {formData.productionBranch || 'production'} branch</div>
                                </div>
                            </label>
                            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-3 transition-colors hover:border-zinc-700">
                                <input type="checkbox" name="autoDeployProduction" checked={formData.autoDeployProduction} onChange={handleInputChange} className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-2 focus:ring-orange-500 focus:ring-offset-0" />
                                <div className="flex-1">
                                    <div className="text-sm font-medium text-white">Auto-deploy Production</div>
                                    <div className="text-xs text-gray-500">Deploy automatically on push to {formData.productionBranch || 'production'} branch</div>
                                </div>
                            </label>

                            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-3 transition-colors hover:border-zinc-700">
                                <input type="checkbox" name="autoDeployStaging" checked={formData.autoDeployStaging} onChange={handleInputChange} className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-2 focus:ring-orange-500 focus:ring-offset-0" />
                                <div className="flex-1">
                                    <div className="text-sm font-medium text-white">Auto-deploy Staging</div>
                                    <div className="text-xs text-gray-500">Deploy automatically on push to {formData.stagingBranch || 'staging'} branch</div>
                                </div>
                            </label>

                            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-3 transition-colors hover:border-zinc-700">
                                <input type="checkbox" name="autoDeployDevelopment" checked={formData.autoDeployDevelopment} onChange={handleInputChange} className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-2 focus:ring-orange-500 focus:ring-offset-0" />
                                <div className="flex-1">
                                    <div className="text-sm font-medium text-white">Auto-deploy Development</div>
                                    <div className="text-xs text-gray-500">Deploy automatically on push to {formData.developmentBranch || 'development'} branch</div>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-zinc-800 px-6 py-4">
                <button type="button" onClick={closeDialog} className="rounded-lg px-5 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:text-white">
                    Cancel
                </button>
                <button onClick={handleSubmit} disabled={loading} className="cursor-pointer rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">
                    {loading ? 'Creating...' : 'Create Project'}
                </button>
            </div>
        </div>
    )
}

export default AddProjectDialog
