'use client'
import React, { useState, useEffect } from 'react'
import { Hammer, X, GitBranch, GitCommit, Settings, Loader2, Info, Package, Cpu, Zap, Layers, AlertCircle } from 'lucide-react'
import axios from 'axios'

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

interface BuildConfigDialogProps {
    accessToken: string
    projectId: string
    gitRepoUrl: string
    currentBranch?: string
    onBuild: (config: {
        branch: string
        commit: string
        buildCommand?: string
        installCommand?: string
        rootDirectory?: string
        nodeVersion?: string
        enableCache?: boolean
    }) => void
    onClose: () => void
}

const BuildConfigDialog: React.FC<BuildConfigDialogProps> = ({ accessToken, projectId, gitRepoUrl, currentBranch = 'main', onBuild, onClose }) => {
    const [selectedBranch, setSelectedBranch] = useState(currentBranch)
    const [selectedCommit, setSelectedCommit] = useState('')
    const [branches, setBranches] = useState<Branch[]>([])
    const [commits, setCommits] = useState<Commit[]>([])
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [isLoadingBranches, setIsLoadingBranches] = useState(true)
    const [isLoadingCommits, setIsLoadingCommits] = useState(false)
    const [isBuilding, setIsBuilding] = useState(false)
    
    const [buildSettings, setBuildSettings] = useState({
        buildCommand: 'npm run build',
        installCommand: 'npm install',
        rootDirectory: '',
        nodeVersion: '18.x',
        enableCache: true,
    })

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
                const installationResp = await axios.get<{ installations: any[] }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/github/installations/${accessToken}`)
                const installations = installationResp.data.installations
                
                if (!installations || installations.length === 0) {
                    setIsLoadingBranches(false)
                    return
                }

                const installation = installations[0]
                const resp = await axios.get<{ success: boolean; branches: Branch[] }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/github/repository-branches/${accessToken}/${repoInfo.repo}/${repoInfo.owner}/${installation.installation_id}`)
                
                if (resp.data.success) {
                    setBranches(resp.data.branches)
                    if (resp.data.branches.length > 0 && !selectedBranch) {
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
                const installationResp = await axios.get<{ installations: any[] }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/github/installations/${accessToken}`)
                const installations = installationResp.data.installations
                
                if (!installations || installations.length === 0) {
                    setIsLoadingCommits(false)
                    return
                }

                const installation = installations[0]
                const resp = await axios.get<{ success: boolean; commits: any[] }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/github/repository-commits/${accessToken}/${repoInfo.repo}/${repoInfo.owner}/${installation.installation_id}/${selectedBranch}`)
                
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

    const handleBuild = () => {
        setIsBuilding(true)
        
        onBuild({
            branch: selectedBranch,
            commit: selectedCommit,
            ...(showAdvanced ? {
                buildCommand: buildSettings.buildCommand,
                installCommand: buildSettings.installCommand,
                rootDirectory: buildSettings.rootDirectory,
                nodeVersion: buildSettings.nodeVersion,
                enableCache: buildSettings.enableCache,
            } : {})
        })
    }

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        const now = new Date()
        const diff = now.getTime() - date.getTime()
        const days = Math.floor(diff / (1000 * 60 * 60 * 24))
        
        if (days === 0) return 'Today'
        if (days === 1) return 'Yesterday'
        if (days < 7) return `${days} days ago`
        return date.toLocaleDateString()
    }

    const formatCommitMessage = (message: string, maxLength = 60) => {
        const firstLine = message.split('\n')[0]
        return firstLine.length > maxLength ? firstLine.substring(0, maxLength) + '...' : firstLine
    }

    const isValid = selectedBranch && selectedCommit

    return (
        <div className="flex h-full w-full flex-col overflow-hidden text-white">
            {/* Header */}
            <div className="border-b border-zinc-800 bg-zinc-950 p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                            <Hammer className="text-blue-500" size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold">Build Application</h2>
                            <p className="text-sm text-zinc-400">Configure and build your application</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-6">
                    {/* Branch Selection */}
                    <div>
                        <label className="mb-3 block text-sm font-medium">Branch</label>
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
                            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 p-2">
                                {branches.map(branch => (
                                    <button
                                        key={branch.name}
                                        onClick={() => setSelectedBranch(branch.name)}
                                        className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${
                                            selectedBranch === branch.name
                                                ? 'border-blue-500 bg-blue-500/10'
                                                : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                                        }`}
                                    >
                                        <GitBranch size={16} className={selectedBranch === branch.name ? 'text-blue-500' : 'text-zinc-500'} />
                                        <div className="flex-1 overflow-hidden">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate font-medium">{branch.name}</span>
                                                {branch.protected && (
                                                    <span className="flex-shrink-0 rounded bg-yellow-500/10 px-1.5 py-0.5 text-xs text-yellow-500">
                                                        protected
                                                    </span>
                                                )}
                                            </div>
                                            <div className="truncate text-xs text-zinc-500">{branch.commit.sha.substring(0, 7)}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Commit Selection */}
                    <div>
                        <label className="mb-3 block text-sm font-medium">Commit</label>
                        {isLoadingCommits ? (
                            <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-zinc-400">
                                <Loader2 size={18} className="animate-spin" />
                                Loading commits...
                            </div>
                        ) : commits.length === 0 ? (
                            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-zinc-400">
                                No commits found on this branch
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 p-2">
                                {commits.map(commit => (
                                    <button
                                        key={commit.sha}
                                        onClick={() => setSelectedCommit(commit.sha)}
                                        className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                                            selectedCommit === commit.sha
                                                ? 'border-green-500 bg-green-500/10'
                                                : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                                        }`}
                                    >
                                        <GitCommit size={16} className={selectedCommit === commit.sha ? 'text-green-500 mt-0.5' : 'text-zinc-500 mt-0.5'} />
                                        <div className="flex-1 overflow-hidden">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xs text-zinc-400">{commit.sha.substring(0, 7)}</span>
                                                <span className="text-xs text-zinc-500">• {formatDate(commit.date)}</span>
                                            </div>
                                            <div className="mt-1 truncate text-sm">{formatCommitMessage(commit.message)}</div>
                                            <div className="mt-1 text-xs text-zinc-500">by {commit.author}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Selected Commit Info */}
                    {selectedCommit && (
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                            <div className="flex items-center gap-2 text-sm text-zinc-400">
                                <Info size={16} className="text-blue-400" />
                                Building from branch <span className="font-medium text-white">{selectedBranch}</span> at commit <span className="font-mono text-green-400">{selectedCommit.substring(0, 7)}</span>
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
                                {/* Node Version */}
                                <div>
                                    <label className="mb-2 block text-sm font-medium">Node.js Version</label>
                                    <select 
                                        value={buildSettings.nodeVersion} 
                                        onChange={e => setBuildSettings({ ...buildSettings, nodeVersion: e.target.value })}
                                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none"
                                    >
                                        <option value="16.x">16.x</option>
                                        <option value="18.x">18.x (Recommended)</option>
                                        <option value="20.x">20.x</option>
                                        <option value="22.x">22.x</option>
                                    </select>
                                </div>

                                {/* Install Command */}
                                <div>
                                    <label className="mb-2 block text-sm font-medium">Install Command</label>
                                    <input
                                        type="text"
                                        value={buildSettings.installCommand}
                                        onChange={e => setBuildSettings({ ...buildSettings, installCommand: e.target.value })}
                                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                                        placeholder="npm install"
                                    />
                                </div>

                                {/* Build Command */}
                                <div>
                                    <label className="mb-2 block text-sm font-medium">Build Command</label>
                                    <input
                                        type="text"
                                        value={buildSettings.buildCommand}
                                        onChange={e => setBuildSettings({ ...buildSettings, buildCommand: e.target.value })}
                                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                                        placeholder="npm run build"
                                    />
                                </div>

                                {/* Root Directory */}
                                <div>
                                    <label className="mb-2 block text-sm font-medium">Root Directory</label>
                                    <input
                                        type="text"
                                        value={buildSettings.rootDirectory}
                                        onChange={e => setBuildSettings({ ...buildSettings, rootDirectory: e.target.value })}
                                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                                        placeholder="Leave empty for root"
                                    />
                                    <p className="mt-1.5 text-xs text-zinc-500">For monorepo projects, specify the workspace root</p>
                                </div>

                                {/* Build Cache Toggle */}
                                <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                                    <div className="flex items-center gap-3">
                                        <Layers size={18} className="text-purple-400" />
                                        <div>
                                            <div className="text-sm font-medium">Build Cache</div>
                                            <div className="text-xs text-zinc-500">Use cache to speed up builds</div>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => setBuildSettings({ ...buildSettings, enableCache: !buildSettings.enableCache })} 
                                        className={`relative h-6 w-11 rounded-full transition-colors ${buildSettings.enableCache ? 'bg-blue-500' : 'bg-zinc-700'}`}
                                    >
                                        <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${buildSettings.enableCache ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>

                                {/* Framework Detection */}
                                <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                                    <Package size={18} className="text-green-400" />
                                    <div>
                                        <div className="text-sm font-medium">Framework Detection</div>
                                        <div className="text-xs text-zinc-500">Automatically detected from repository</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="border-t border-zinc-800 bg-zinc-950 p-6">
                <div className="flex items-center justify-between">
                    <button onClick={onClose} className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-900">
                        Cancel
                    </button>
                    <button 
                        onClick={handleBuild} 
                        disabled={!isValid || isBuilding} 
                        className="flex items-center gap-2 rounded-lg bg-blue-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isBuilding ? (
                            <>
                                <Loader2 className="animate-spin" size={18} />
                                Building...
                            </>
                        ) : (
                            <>
                                <Hammer size={18} />
                                Start Build
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default BuildConfigDialog
