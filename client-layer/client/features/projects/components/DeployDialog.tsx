import React, { useState, useEffect } from 'react'
import { Rocket, X, GitBranch, Package, Settings, AlertCircle, CheckCircle2, Loader2, Info, Zap, Shield } from 'lucide-react'
import { DeploymentConfig } from '../Types/ProjectTypes'

interface DeployDialogProps {
    accessToken: string
    projectId: string
    builds: Array<{
        id: string
        commitHash: string
        branch: string
        status: string
        buildTime: string | null
        createdAt: string
    }>
    currentBranch: string
    deploymentStrategy: string
    onDeploy: (config: DeploymentConfig) => void
    onClose: () => void
}
const DeployDialog: React.FC<DeployDialogProps> = ({ accessToken, projectId, builds, currentBranch, deploymentStrategy, onDeploy, onClose }) => {
    const [environment, setEnvironment] = useState<'production' | 'staging'>('production')
    const [source, setSource] = useState<'build' | 'branch'>('build')
    const [selectedBuild, setSelectedBuild] = useState('')
    const [selectedBranch, setSelectedBranch] = useState(currentBranch || 'main')
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [strategy, setStrategy] = useState(deploymentStrategy || 'blue_green')
    const [enableMonitoring, setEnableMonitoring] = useState(true)
    const [autoScaling, setAutoScaling] = useState(false)
    const [isDeploying, setIsDeploying] = useState(false)

    // Filter successful builds
    const successfulBuilds = builds.filter(b => b.status === 'completed' || b.status === 'success')

    useEffect(() => {
        if (successfulBuilds.length > 0 && !selectedBuild) {
            setSelectedBuild(successfulBuilds[0].id)
        }
    }, [successfulBuilds])

    const handleDeploy = () => {
        setIsDeploying(true)

        const config: DeploymentConfig = {
            environment,
            source,
            ...(source === 'build' ? { buildId: selectedBuild } : { branch: selectedBranch }),
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

    const isValid = source === 'build' ? selectedBuild : selectedBranch

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
                                {successfulBuilds.length === 0 ? (
                                    <option value="">No successful builds available</option>
                                ) : (
                                    successfulBuilds.map(build => (
                                        <option key={build.id} value={build.id}>
                                            #{build.id.substring(0, 8)} - {build.branch} ({build.commitHash.substring(0, 7)}) - {build.createdAt}
                                        </option>
                                    ))
                                )}
                            </select>
                            {successfulBuilds.length > 0 && selectedBuild && (
                                <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                                    <div className="grid grid-cols-3 gap-3 text-sm">
                                        <div>
                                            <div className="text-zinc-400">Build Time</div>
                                            <div className="font-medium">{successfulBuilds.find(b => b.id === selectedBuild)?.buildTime || 'N/A'}</div>
                                        </div>
                                        <div>
                                            <div className="text-zinc-400">Branch</div>
                                            <div className="font-medium">{successfulBuilds.find(b => b.id === selectedBuild)?.branch}</div>
                                        </div>
                                        <div>
                                            <div className="text-zinc-400">Commit</div>
                                            <div className="font-mono text-xs font-medium">{successfulBuilds.find(b => b.id === selectedBuild)?.commitHash.substring(0, 7)}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Branch Selection */}
                    {source === 'branch' && (
                        <div>
                            <label className="mb-2 block text-sm font-medium">Branch Name</label>
                            <input type="text" value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} placeholder="main, develop, feature/..." className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-orange-500 focus:outline-none" />
                            <div className="mt-2 flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                                <Info className="mt-0.5 flex-shrink-0 text-blue-400" size={16} />
                                <p className="text-xs text-blue-300">This will trigger a new build from the latest commit on the selected branch before deploying.</p>
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
