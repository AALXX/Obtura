import React, { useState, useEffect } from 'react'
import { X, GitBranch, Rocket, Users, Github, ChevronRight, Settings } from 'lucide-react'
import { ProjectResponse } from '../Types/ProjectTypes'
import axios from 'axios'
import { TeamData } from '@/features/teams/types/TeamTypes'

interface AddProjectDialogProps {
    closeDialog: () => void
    accessToken: string
    teams: TeamData[]
    setProjects: React.Dispatch<React.SetStateAction<ProjectResponse[]>>
}

interface GitHubInstallation {
    installation_id: number
    account_login: string
    account_type: string
    repositories: Array<{
        id: number
        name: string
        fullName: string
        private: boolean
        cloneUrl: string
        defaultBranch: string
    }>
}

interface FormData {
    name: string
    teamId: string
    installationId: string
    repositoryId: string
    repositoryFullName: string
    deploymentBranch: string // Simple mode
    productionBranch: string // Advanced mode
    stagingBranch: string
    developmentBranch: string
    createDeploymentNow: boolean
    autoDeployProduction: boolean
    autoDeployStaging: boolean
    autoDeployDevelopment: boolean
}

const AddProjectDialog: React.FC<AddProjectDialogProps> = ({ closeDialog, accessToken, teams, setProjects }) => {
    const [step, setStep] = useState<'select-repo' | 'configure'>('select-repo')
    const [mode, setMode] = useState<'simple' | 'advanced'>('simple')
    const [installations, setInstallations] = useState<GitHubInstallation[]>([])
    const [loadingInstallations, setLoadingInstallations] = useState(true)
    const [branches, setBranches] = useState<string[]>([])
    const [loadingBranches, setLoadingBranches] = useState(false)

    const [formData, setFormData] = useState<FormData>({
        name: '',
        teamId: '',
        installationId: '',
        repositoryId: '',
        repositoryFullName: '',
        deploymentBranch: '',
        productionBranch: '',
        stagingBranch: '',
        developmentBranch: '',
        createDeploymentNow: false,
        autoDeployProduction: true,
        autoDeployStaging: false,
        autoDeployDevelopment: false
    })

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        fetchInstallations()
    }, [])

    const fetchInstallations = async () => {
        try {
            setLoadingInstallations(true)
            const response = await axios.get<{ success: boolean; installations: GitHubInstallation[] }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/github/installations/${accessToken}`)
            if (response.data.success) {
                setInstallations(response.data.installations)
            }
        } catch (err) {
            console.error('Error fetching installations:', err)
            setError('Failed to load GitHub installations')
        } finally {
            setLoadingInstallations(false)
        }
    }

    const handleInstallGitHubApp = async () => {
        try {
            const response = await axios.get<{ success: boolean; installationURL: string }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/github/installation-url/${accessToken}`)

            if (response.data.success) {
                window.location.href = response.data.installationURL
            }
        } catch (err) {
            console.error('Error generating installation URL:', err)
            setError('Failed to start GitHub App installation')
        }
    }

    const handleRepositorySelect = async (repo: GitHubInstallation['repositories'][0], installationId: string) => {
        setFormData(prev => ({
            ...prev,
            name: repo.name,
            installationId: installationId,
            repositoryId: repo.id.toString(),
            repositoryFullName: repo.fullName,
            deploymentBranch: repo.defaultBranch,
            productionBranch: repo.defaultBranch
        }))

        await fetchRepoBranches(installationId, repo.fullName)

        setStep('configure')
    }

    const fetchRepoBranches = async (installationId: string, repoFullName: string) => {
        try {
            setLoadingBranches(true)
            const [owner, repo] = repoFullName.split('/')

            const response = await axios.get<{ success: boolean; branches: { name: string }[] }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/github/repository-branches/${accessToken}/${repo}/${owner}/${installationId}`)

            if (response.data.success) {
                const branchNames = response.data.branches.map((b: any) => b.name)
                setBranches(branchNames)

                if (branchNames.includes('staging') && !formData.stagingBranch) {
                    setFormData(prev => ({ ...prev, stagingBranch: 'staging' }))
                }
                if (branchNames.includes('dev') || branchNames.includes('develop')) {
                    setFormData(prev => ({
                        ...prev,
                        developmentBranch: branchNames.includes('dev') ? 'dev' : 'develop'
                    }))
                }
            }
        } catch (err) {
            console.error('Error fetching branches:', err)
        } finally {
            setLoadingBranches(false)
        }
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target
        const checked = (e.target as HTMLInputElement).checked

        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }))
    }

    const handleSubmit = async () => {
        setError('')

        if (!formData.teamId) {
            setError('Please select a team')
            return
        }

        if (mode === 'simple' && !formData.deploymentBranch) {
            setError('Please select a deployment branch')
            return
        }

        setLoading(true)

        try {
            const projectData = {
                name: formData.name,
                teamId: formData.teamId,
                gitRepoUrl: `https://github.com/${formData.repositoryFullName}`,
                githubInstallationId: formData.installationId,
                githubRepositoryId: formData.repositoryId,
                productionBranch: mode === 'simple' ? formData.deploymentBranch : formData.productionBranch,
                stagingBranch: mode === 'advanced' ? formData.stagingBranch : '',
                developmentBranch: mode === 'advanced' ? formData.developmentBranch : '',
                createDeploymentNow: formData.createDeploymentNow,
                autoDeployProduction: formData.autoDeployProduction,
                autoDeployStaging: mode === 'advanced' ? formData.autoDeployStaging : false,
                autoDeployDevelopment: mode === 'advanced' ? formData.autoDeployDevelopment : false,
                accessToken
            }

            const response = await axios.post<{ project: ProjectResponse }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/projects-manager/create-project`, projectData)

            if (response.status === 200) {
                const newProject = response.data.project
                setProjects(prev => [...(Array.isArray(prev) ? prev : []), newProject])
                closeDialog()
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to create project')
        } finally {
            setLoading(false)
        }
    }

    const activeTeams = teams.filter(team => team.is_active)

    return (
        <div className="flex h-full w-full flex-col">
            <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
                <div>
                    <h2 className="text-xl font-semibold text-white">{step === 'select-repo' ? 'Import from GitHub' : 'Configure Project'}</h2>
                    <p className="mt-1 text-sm text-gray-400">{step === 'select-repo' ? 'Select a repository from your GitHub account' : 'Set up deployment configuration'}</p>
                </div>
            </div>

            {error && <div className="mx-6 mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

            <div className="flex-1 overflow-y-auto p-6">
                {step === 'select-repo' ? (
                    <div className="space-y-6">
                        {loadingInstallations ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="text-center">
                                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-orange-500"></div>
                                    <p className="mt-4 text-sm text-gray-400">Loading repositories...</p>
                                </div>
                            </div>
                        ) : installations.length === 0 ? (
                            <div className="rounded-lg border border-zinc-800 bg-[#0d0d0d] p-8 text-center">
                                <Github className="mx-auto mb-4 text-gray-400" size={48} />
                                <h3 className="mb-2 text-lg font-semibold text-white">Connect GitHub Account</h3>
                                <p className="mb-6 text-sm text-gray-400">Install the Obtura GitHub App to import your repositories</p>
                                <button onClick={handleInstallGitHubApp} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-sm font-medium text-white hover:bg-orange-600">
                                    <Github size={18} />
                                    Install GitHub App
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {installations.map(installation => (
                                    <div key={installation.installation_id} className="space-y-3">
                                        <div className="flex items-center gap-2 text-sm font-medium text-gray-400">
                                            <Github size={16} />
                                            {installation.account_login}
                                            <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs">{installation.account_type}</span>
                                        </div>

                                        <div className="space-y-2">
                                            {installation.repositories.map((repo: any) => (
                                                <button key={repo.id} onClick={() => handleRepositorySelect(repo, installation.installation_id.toString())} className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-zinc-800 bg-[#0d0d0d] p-4 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium text-white">{repo.name}</span>
                                                            {repo.private && <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400">Private</span>}
                                                        </div>
                                                        <p className="mt-1 text-sm text-gray-400">{repo.fullName}</p>
                                                    </div>
                                                    <ChevronRight className="text-gray-400" size={20} />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}

                                <button onClick={handleInstallGitHubApp} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-[#0d0d0d] p-4 text-sm text-gray-400 transition-colors hover:border-zinc-600 hover:text-white">
                                    <Github size={16} />
                                    Add more repositories
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="rounded-lg border border-zinc-800 bg-[#0d0d0d] p-4">
                            <div className="text-sm text-gray-400">Selected Repository</div>
                            <div className="mt-1 font-medium text-white">{formData.repositoryFullName}</div>
                        </div>

                        <div>
                            <label htmlFor="teamId" className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
                                <Users size={16} />
                                Assigned Team
                            </label>
                            <select id="teamId" name="teamId" value={formData.teamId} onChange={handleInputChange} required className="w-full rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-2.5 text-sm text-white focus:border-zinc-700 focus:outline-none">
                                <option value="">Select a team</option>
                                {activeTeams.map(team => (
                                    <option key={team.id} value={team.id}>
                                        {team.name} ({team.memberCount} member{team.memberCount !== 1 ? 's' : ''})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-[#0d0d0d] p-4">
                            <Settings size={18} className="text-gray-400" />
                            <div className="flex-1">
                                <div className="text-sm font-medium text-white">Configuration Mode</div>
                                <div className="text-xs text-gray-400">{mode === 'simple' ? 'Single deployment branch' : 'Multiple environment branches'}</div>
                            </div>
                            <button onClick={() => setMode(mode === 'simple' ? 'advanced' : 'simple')} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800">
                                Switch to {mode === 'simple' ? 'Advanced' : 'Simple'}
                            </button>
                        </div>

                        <div className="space-y-4 border-t border-zinc-800 pt-6">
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                                <GitBranch size={16} />
                                {mode === 'simple' ? 'Deployment Branch' : 'Environment Branches'}
                            </h3>

                            {loadingBranches ? (
                                <div className="rounded-lg border border-zinc-800 bg-[#0d0d0d] p-4 text-center text-sm text-gray-400">Loading branches...</div>
                            ) : mode === 'simple' ? (
                                <div>
                                    <label htmlFor="deploymentBranch" className="mb-2 block text-sm font-medium text-white">
                                        Branch to Deploy
                                    </label>
                                    <select id="deploymentBranch" name="deploymentBranch" value={formData.deploymentBranch} onChange={handleInputChange} className="w-full rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-2.5 text-sm text-white focus:border-zinc-700 focus:outline-none">
                                        {branches.map(branch => (
                                            <option key={branch} value={branch}>
                                                {branch}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="mt-1.5 text-xs text-gray-500">Code pushed to this branch will be automatically deployed</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label htmlFor="productionBranch" className="mb-2 block text-sm font-medium text-white">
                                            Production
                                        </label>
                                        <select id="productionBranch" name="productionBranch" value={formData.productionBranch} onChange={handleInputChange} className="w-full rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-2.5 text-sm text-white focus:border-zinc-700 focus:outline-none">
                                            {branches.map(branch => (
                                                <option key={branch} value={branch}>
                                                    {branch}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label htmlFor="stagingBranch" className="mb-2 block text-sm font-medium text-white">
                                            Staging
                                        </label>
                                        <select id="stagingBranch" name="stagingBranch" value={formData.stagingBranch} onChange={handleInputChange} className="w-full rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-2.5 text-sm text-white focus:border-zinc-700 focus:outline-none">
                                            <option value="">None</option>
                                            {branches.map(branch => (
                                                <option key={branch} value={branch}>
                                                    {branch}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label htmlFor="developmentBranch" className="mb-2 block text-sm font-medium text-white">
                                            Development
                                        </label>
                                        <select id="developmentBranch" name="developmentBranch" value={formData.developmentBranch} onChange={handleInputChange} className="w-full rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-2.5 text-sm text-white focus:border-zinc-700 focus:outline-none">
                                            <option value="">None</option>
                                            {branches.map(branch => (
                                                <option key={branch} value={branch}>
                                                    {branch}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4 border-t border-zinc-800 pt-6">
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                                <Rocket size={16} />
                                Deployment Triggers
                            </h3>

                            <div className="space-y-3">
                                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-3 transition-colors hover:border-zinc-700">
                                    <input type="checkbox" name="createDeploymentNow" checked={formData.createDeploymentNow} onChange={handleInputChange} className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-orange-500" />
                                    <div className="flex-1">
                                        <div className="text-sm font-medium text-white">Deploy Now</div>
                                        <div className="text-xs text-gray-500">Create initial deployment immediately</div>
                                    </div>
                                </label>

                                {mode === 'simple' ? (
                                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-3 transition-colors hover:border-zinc-700">
                                        <input type="checkbox" name="autoDeployProduction" checked={formData.autoDeployProduction} onChange={handleInputChange} className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-orange-500" />
                                        <div className="flex-1">
                                            <div className="text-sm font-medium text-white">Auto-deploy on Push</div>
                                            <div className="text-xs text-gray-500">Automatically deploy when code is pushed to {formData.deploymentBranch || 'selected branch'}</div>
                                        </div>
                                    </label>
                                ) : (
                                    <>
                                        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-3 transition-colors hover:border-zinc-700">
                                            <input type="checkbox" name="autoDeployProduction" checked={formData.autoDeployProduction} onChange={handleInputChange} className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-orange-500" />
                                            <div className="flex-1">
                                                <div className="text-sm font-medium text-white">Auto-deploy Production</div>
                                                <div className="text-xs text-gray-500">Deploy on push to {formData.productionBranch || 'production'}</div>
                                            </div>
                                        </label>

                                        {formData.stagingBranch && (
                                            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-3 transition-colors hover:border-zinc-700">
                                                <input type="checkbox" name="autoDeployStaging" checked={formData.autoDeployStaging} onChange={handleInputChange} className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-orange-500" />
                                                <div className="flex-1">
                                                    <div className="text-sm font-medium text-white">Auto-deploy Staging</div>
                                                    <div className="text-xs text-gray-500">Deploy on push to {formData.stagingBranch}</div>
                                                </div>
                                            </label>
                                        )}

                                        {formData.developmentBranch && (
                                            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-3 transition-colors hover:border-zinc-700">
                                                <input type="checkbox" name="autoDeployDevelopment" checked={formData.autoDeployDevelopment} onChange={handleInputChange} className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-orange-500" />
                                                <div className="flex-1">
                                                    <div className="text-sm font-medium text-white">Auto-deploy Development</div>
                                                    <div className="text-xs text-gray-500">Deploy on push to {formData.developmentBranch}</div>
                                                </div>
                                            </label>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between border-t border-zinc-800 px-6 py-4">
                {step === 'configure' && (
                    <button onClick={() => setStep('select-repo')} className="text-sm font-medium text-gray-300 transition-colors hover:text-white">
                        ← Back to repositories
                    </button>
                )}
                <div className={`flex items-center gap-3 ${step === 'select-repo' ? 'ml-auto' : ''}`}>
                    <button onClick={closeDialog} className="cursor-pointer rounded-lg px-5 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:text-white">
                        Cancel
                    </button>
                    {step === 'configure' && (
                        <button onClick={handleSubmit} disabled={loading} className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer">
                            {loading ? 'Creating...' : 'Add Project'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

export default AddProjectDialog
