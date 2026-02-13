import React, { useState, useEffect } from 'react'
import { Rocket, X, GitBranch, GitCommit, Package, Settings, AlertCircle, CheckCircle2, Loader2, Info, Zap, Shield, Clock } from 'lucide-react'
import axios from 'axios'
import { DeploymentConfig } from '../Types/ProjectTypes'

const formatTimeAgo = (dateString: string): string => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'N/A'
    const now = new Date()
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
}

interface Commit {
    sha: string
    message: string
    author: string
    date: string
    url: string
}

interface Branch {
    name: string
    commit: {
        sha: string
    }
    protected: boolean
}

interface DeployDialogProps {
    accessToken: string
    projectId: string
    gitRepoUrl: string
    builds: Array<{
        id: string
        commitHash: string
        branch: string
        status: string
        duration?: string
        createdAt?: string
    }>
    currentBranch: string
    deploymentStrategy: string
    onDeploy: (config: DeploymentConfig) => void
    onClose: () => void
}
const DeployDialog: React.FC<DeployDialogProps> = ({ accessToken, projectId, gitRepoUrl, builds, currentBranch, deploymentStrategy, onDeploy, onClose }) => {
    const [environment, setEnvironment] = useState<'production' | 'staging'>('production')
    const [source, setSource] = useState<'build' | 'branch'>('build')
    const [selectedBuild, setSelectedBuild] = useState('')
    const [selectedBranch, setSelectedBranch] = useState(currentBranch || 'main')
    const [selectedCommit, setSelectedCommit] = useState('')
    const [branches, setBranches] = useState<Branch[]>([])
    const [commits, setCommits] = useState<Commit[]>([])
    const [isLoadingBranches, setIsLoadingBranches] = useState(true)
    const [isLoadingCommits, setIsLoadingCommits] = useState(false)
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [strategy, setStrategy] = useState(deploymentStrategy || 'blue_green')
    const [enableMonitoring, setEnableMonitoring] = useState(true)
    const [autoScaling, setAutoScaling] = useState(false)
    const [isDeploying, setIsDeploying] = useState(false)

    const extractRepoInfo = (url: string) => {
        const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/)
        if (match) {
            return { owner: match[1], repo: match[2].replace('.git', '') }
        }
        return null
    }

    const repoInfo = extractRepoInfo(gitRepoUrl)

    useEffect(() => {
        const fetchBranches = async () => {
            if (!repoInfo) return
            
            try {
                const installationResp = await axios.get<{ installations: Array<{ installation_id: number }> }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/github/installations/${accessToken}`)
                const installations = installationResp.data.installations
                
                if (!installations || installations.length === 0) {
                    setIsLoadingBranches(false)
                    return
                }

                const installation = installations[0]
                const resp = await axios.get<{ success: boolean; branches: Branch[] }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/github/repository-branches/${accessToken}/${repoInfo.repo}/${repoInfo.owner}/${installation.installation_id}`)
                
                if (resp.data.success) {
                    setBranches(resp.data.branches)
                    if (resp.data.branches.length > 0) {
                        const defaultBranch = resp.data.branches.find((b: Branch) => b.name === currentBranch) || resp.data.branches[0]
                        setSelectedBranch(defaultBranch.name)
                    }
                }
            } catch (error) {
                console.error('Error fetching branches:', error)
            } finally {
                setIsLoadingBranches(false)
            }
        }

        fetchBranches()
    }, [gitRepoUrl, accessToken])

    useEffect(() => {
        const fetchCommits = async () => {
            if (!repoInfo || !selectedBranch) return
            
            setIsLoadingCommits(true)
            try {
                const installationResp = await axios.get<{ installations: Array<{ installation_id: number }> }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/github/installations/${accessToken}`)
                const installations = installationResp.data.installations
                
                if (!installations || installations.length === 0) {
                    setIsLoadingCommits(false)
                    return
                }

                const installation = installations[0]
                const resp = await axios.get<{ success: boolean; commits: Commit[] }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/github/repository-commits/${accessToken}/${repoInfo.repo}/${repoInfo.owner}/${installation.installation_id}/${selectedBranch}`)
                
                if (resp.data.success) {
                    setCommits(resp.data.commits)
                    if (resp.data.commits.length > 0 && !selectedCommit) {
                        setSelectedCommit(resp.data.commits[0].sha)
                    }
                }
            } catch (error) {
                console.error('Error fetching commits:', error)
            } finally {
                setIsLoadingCommits(false)
            }
        }

        fetchCommits()
    }, [selectedBranch, gitRepoUrl, accessToken])

    const successfulBuilds = builds.filter(b => b.status === 'completed' || b.status === 'success')

    const sortedBuilds = [...successfulBuilds].sort((a, b) => {
        return (b.createdAt || '').localeCompare(a.createdAt || '')
    })

    useEffect(() => {
        if (sortedBuilds.length > 0 && !selectedBuild) {
            setSelectedBuild(sortedBuilds[0].id)
        }
    }, [sortedBuilds, selectedBuild])

    const handleDeploy = () => {
        setIsDeploying(true)

        const config: DeploymentConfig = {
            environment,
            source,
            ...(source === 'build' ? { buildId: selectedBuild } : { branch: selectedBranch, commitHash: selectedCommit }),
            strategy: showAdvanced ? strategy : deploymentStrategy,
            enableMonitoring,
            autoScaling
        }

        onDeploy(config)
    }

    const getStrategyDescription = (strat: string) => {
        switch (strat) {
            case 'blue_green':
                return 'Zero-downtime deployment with instant rollback capability'
            case 'rolling':
                return 'Gradual replacement of instances with new version'
            case 'canary':
                return 'Progressive traffic shift to new version for testing'
            default:
                return 'Standard deployment strategy'
        }
    }

    const isValid = source === 'build' ? selectedBuild : (selectedBranch && selectedCommit)

    return (
        <div className="h-full w-full text-white">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 p-6">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10">
                        <Rocket className="text-orange-500" size={20} />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold">Deploy Application</h2>
                        <p className="text-sm text-zinc-400">Configure and deploy your application</p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-6">
                <div className="space-y-6">
                    <div>
                        <label className="mb-3 block text-sm font-medium">Deployment Environment</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setEnvironment('production')} className={`flex items-center gap-3 rounded-lg border p-4 transition-all ${environment === 'production' ? 'border-green-500 bg-green-500/10' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'}`}>
                                <Zap className={environment === 'production' ? 'text-green-500' : 'text-zinc-500'} size={20} />
                                <div className="text-left">
                                    <div className="font-medium">Production</div>
                                    <div className="text-xs text-zinc-400">Live environment</div>
                                </div>
                            </button>
                            <button onClick={() => setEnvironment('staging')} className={`flex items-center gap-3 rounded-lg border p-4 transition-all ${environment === 'staging' ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'}`}>
                                <Shield className={environment === 'staging' ? 'text-blue-500' : 'text-zinc-500'} size={20} />
                                <div className="text-left">
                                    <div className="font-medium">Staging</div>
                                    <div className="text-xs text-zinc-400">Test environment</div>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="mb-3 block text-sm font-medium">Deployment Source</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setSource('build')} className={`flex items-center gap-3 rounded-lg border p-4 transition-all ${source === 'build' ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'}`}>
                                <Package className={source === 'build' ? 'text-orange-500' : 'text-zinc-500'} size={20} />
                                <div className="text-left">
                                    <div className="font-medium">Existing Build</div>
                                    <div className="text-xs text-zinc-400">Deploy verified build</div>
                                </div>
                            </button>
                            <button onClick={() => setSource('branch')} className={`flex items-center gap-3 rounded-lg border p-4 transition-all ${source === 'branch' ? 'border-purple-500 bg-purple-500/10' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'}`}>
                                <GitBranch className={source === 'branch' ? 'text-purple-500' : 'text-zinc-500'} size={20} />
                                <div className="text-left">
                                    <div className="font-medium">Branch/Commit</div>
                                    <div className="text-xs text-zinc-400">Build & deploy</div>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Build Selection */}
                    {source === 'build' && (
                        <div>
                            <label className="mb-2 block text-sm font-medium">Select Build</label>
                            <select value={selectedBuild} onChange={e => setSelectedBuild(e.target.value)} className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white focus:border-orange-500 focus:outline-none">
                                {sortedBuilds.length === 0 ? (
                                    <option value="">No successful builds available</option>
                                ) : (
                                    sortedBuilds.map(build => (
                                        <option key={build.id} value={build.id}>
                                            #{build.id.substring(0, 8)} - {build.branch} ({build.commitHash.substring(0, 7)}) - {build.createdAt}
                                        </option>
                                    ))
                                )}
                            </select>
                            {sortedBuilds.length > 0 && selectedBuild && (
                                <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                                    <div className="grid grid-cols-3 gap-3 text-sm">
                                        <div>
                                            <div className="text-zinc-400">Built</div>
                                            <div className="flex items-center gap-1.5 font-medium">
                                                <Clock size={14} className="text-zinc-500" />
                                                                                                {sortedBuilds.find(b => b.id === selectedBuild)?.createdAt}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-zinc-400">Branch</div>
                                            <div className="font-medium">{sortedBuilds.find(b => b.id === selectedBuild)?.branch}</div>
                                        </div>
                                        <div>
                                            <div className="text-zinc-400">Commit</div>
                                            <div className="font-mono text-xs font-medium">{sortedBuilds.find(b => b.id === selectedBuild)?.commitHash.substring(0, 7)}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Branch Selection */}
                    {source === 'branch' && (
                        <div>
                            <label className="mb-2 block text-sm font-medium">Branch</label>
                            {isLoadingBranches ? (
                                <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-zinc-400">
                                    <Loader2 size={18} className="animate-spin" />
                                    Loading branches...
                                </div>
                            ) : branches.length === 0 ? (
                                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-zinc-400">
                                    No branches found
                                </div>
                            ) : (
                                <select 
                                    value={selectedBranch} 
                                    onChange={e => setSelectedBranch(e.target.value)}
                                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white focus:border-orange-500 focus:outline-none"
                                >
                                    {branches.map(branch => (
                                        <option key={branch.name} value={branch.name}>
                                            {branch.name} ({branch.commit.sha.substring(0, 7)})
                                        </option>
                                    ))}
                                </select>
                            )}
                            
                            <label className="mb-2 mt-4 block text-sm font-medium">Commit</label>
                            {isLoadingCommits ? (
                                <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-zinc-400">
                                    <Loader2 size={18} className="animate-spin" />
                                    Loading commits...
                                </div>
                            ) : commits.length === 0 ? (
                                <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-zinc-400">
                                    No commits found
                                </div>
                            ) : (
                                <select 
                                    value={selectedCommit} 
                                    onChange={e => setSelectedCommit(e.target.value)}
                                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white focus:border-orange-500 focus:outline-none"
                                >
                                    {commits.map(commit => (
                                        <option key={commit.sha} value={commit.sha}>
                                            {commit.sha.substring(0, 7)} - {commit.message.substring(0, 50)}
                                        </option>
                                    ))}
                                </select>
                            )}
                            
                            <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                                <Info className="mt-0.5 flex-shrink-0 text-blue-400" size={16} />
                                <p className="text-xs text-blue-300">This will trigger a new build from the selected commit before deploying.</p>
                            </div>
                        </div>
                    )}

                    {/* Advanced Options */}
                    <div className="border-t border-zinc-800 pt-6">
                        <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex w-full items-center justify-between text-sm font-medium text-zinc-300 hover:text-white">
                            <div className="flex items-center gap-2">
                                <Settings size={16} />
                                Advanced Options
                            </div>
                            <div className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>▼</div>
                        </button>

                        {showAdvanced && (
                            <div className="mt-4 space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
                                {/* Deployment Strategy */}
                                <div>
                                    <label className="mb-2 block text-sm font-medium">Deployment Strategy</label>
                                    <select value={strategy} onChange={e => setStrategy(e.target.value)} className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none">
                                        <option value="blue_green">Blue-Green Deployment</option>
                                        <option value="rolling">Rolling Update</option>
                                        <option value="canary">Canary Release</option>
                                    </select>
                                    <p className="mt-1.5 text-xs text-zinc-500">{getStrategyDescription(strategy)}</p>
                                </div>

                                {/* Monitoring */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm font-medium">Enable Monitoring</div>
                                        <div className="text-xs text-zinc-500">Real-time deployment metrics</div>
                                    </div>
                                    <button onClick={() => setEnableMonitoring(!enableMonitoring)} className={`relative h-6 w-11 rounded-full transition-colors ${enableMonitoring ? 'bg-orange-500' : 'bg-zinc-700'}`}>
                                        <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${enableMonitoring ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>

                                {/* Auto-scaling */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm font-medium">Auto-scaling</div>
                                        <div className="text-xs text-zinc-500">Automatically scale based on load</div>
                                    </div>
                                    <button onClick={() => setAutoScaling(!autoScaling)} className={`relative h-6 w-11 rounded-full transition-colors ${autoScaling ? 'bg-orange-500' : 'bg-zinc-700'}`}>
                                        <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${autoScaling ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Warning for Production */}
                    {environment === 'production' && (
                        <div className="flex items-start gap-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
                            <AlertCircle className="mt-0.5 flex-shrink-0 text-yellow-500" size={20} />
                            <div>
                                <div className="text-sm font-medium text-yellow-400">Production Deployment</div>
                                <p className="mt-1 text-xs text-yellow-300/80">You are about to deploy to the production environment. This will affect live users. Ensure all tests have passed and the changes have been reviewed.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-zinc-800 p-6">
                <button onClick={onClose} className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-900">
                    Cancel
                </button>
                <button onClick={handleDeploy} disabled={!isValid || isDeploying} className="flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">
                    {isDeploying ? (
                        <>
                            <Loader2 className="animate-spin" size={18} />
                            Deploying...
                        </>
                    ) : (
                        <>
                            <Rocket size={18} />
                            Deploy to {environment === 'production' ? 'Production' : 'Staging'}
                        </>
                    )}
                </button>
            </div>
        </div>
    )
}

export default DeployDialog
