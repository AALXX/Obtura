'use client'
import React, { useState } from 'react'
import { Rocket, Settings, Activity, Database, Globe, GitBranch, Clock, CheckCircle2, XCircle, AlertCircle, Eye, Code, Server, Lock, RotateCcw, Play, Pause, Plus, Trash2, Copy, ExternalLink, TrendingUp, Zap, Shield, Layers, Package, Hammer, Upload } from 'lucide-react'
import { ProjectData } from './Types/ProjectTypes'
import EnvFileUpload from '../account/components/EnvFileUpload'
import DialogCanvas from '@/common-components/DialogCanvas'
import axios from 'axios'

const ProjectDetails: React.FC<{ projectData: ProjectData, accessToken: string }> = ({ projectData, accessToken }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'deployments' | 'environment' | 'settings' | 'monitoring'>('overview')
    const [envVars, setEnvVars] = useState([
        { key: 'DATABASE_URL', value: '••••••••••••', isSecret: false },
        { key: 'API_KEY', value: '••••••••••••', isSecret: true },
        { key: 'NODE_ENV', value: 'production', isSecret: false }
    ])
    const [showAddEnv, setShowAddEnv] = useState(false)
    const [newEnvKey, setNewEnvKey] = useState('')
    const [newEnvValue, setNewEnvValue] = useState('')
    const [isDeploying, setIsDeploying] = useState(false)
    const [isBuilding, setIsBuilding] = useState(false)
    const [showEnvFileDialog, setShowEnvFileDialog] = useState(false)

    const handleDeploy = (environment: string) => {
        setIsDeploying(true)
        setTimeout(() => {
            setIsDeploying(false)
            alert(`Deployment to ${environment} initiated!`)
        }, 2000)
    }
    const handleBuild = () => {
        setIsBuilding(true)
        setTimeout(() => {
            setIsBuilding(false)
        }, 2000)
    }

    const handleAddEnvVar = () => {
        if (newEnvKey && newEnvValue) {
            setEnvVars([...envVars, { key: newEnvKey, value: newEnvValue, isSecret: true }])
            setNewEnvKey('')
            setNewEnvValue('')
            setShowAddEnv(false)
        }
    }

    const handleEnvFileUpload = async (data: { envLocation: string; envFile: File }) => {
        let formData = new FormData()
        formData.append('envLocation', data.envLocation)
        formData.append('file', data.envFile)
        formData.append('projectId', projectData.id)
        formData.append('accessToken', accessToken)

        const resp = await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/projects-manager/env-config`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        })

        if (resp.status === 200) {
            alert('Environment file uploaded successfully!')
        }
    }

    const tabs = [
        { id: 'overview', label: 'Overview', icon: Activity },
        { id: 'deployments', label: 'Deployments', icon: Rocket },
        { id: 'environment', label: 'Environment', icon: Lock },
        { id: 'settings', label: 'Settings', icon: Settings },
        { id: 'monitoring', label: 'Monitoring', icon: TrendingUp }
    ]

    const hasDeployments = projectData.production.url || projectData.staging.url || projectData.preview.length > 0

    return (
        <div className="min-h-screen text-white">
            <div className="border-b border-zinc-800">
                <div className="container mx-auto px-6 py-6">
                    <div className="mb-4 flex items-center gap-2 text-sm text-zinc-400">
                        <span className="cursor-pointer hover:text-white">Projects</span>
                        <span>/</span>
                        <span className="text-white">{projectData.name}</span>
                    </div>

                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="mb-2 text-3xl font-bold">{projectData.name}</h1>
                            <div className="flex items-center gap-4 text-sm text-zinc-400">
                                <span className="flex items-center gap-1.5">
                                    <GitBranch size={14} />
                                    {projectData.slug}
                                </span>
                                {projectData.isMonorepo ? (
                                    <span className="flex items-center gap-1.5">
                                        <Layers size={14} className="text-purple-500" />
                                        <span className="text-purple-400">Monorepo</span>
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1.5">
                                        <Code size={14} />
                                        {projectData.framework}
                                    </span>
                                )}
                                <span className="flex items-center gap-1.5">
                                    <Shield size={14} className="text-green-500" />
                                    {projectData.teamName}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button onClick={() => handleBuild()} disabled={isBuilding} className="flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50">
                                {isBuilding ? (
                                    <>
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        Building...
                                    </>
                                ) : (
                                    <>
                                        <Hammer size={18} />
                                        Build
                                    </>
                                )}
                            </button>

                            <button onClick={() => handleDeploy('production')} disabled={isDeploying} className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50">
                                {isDeploying ? (
                                    <>
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        Deploying...
                                    </>
                                ) : (
                                    <>
                                        <Rocket size={18} />
                                        Deploy to Production
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="border-b border-zinc-800">
                <div className="container mx-auto px-6">
                    <div className="flex gap-1">
                        {tabs.map(tab => {
                            const Icon = tab.icon
                            return (
                                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === tab.id ? 'border-orange-500 text-white' : 'border-transparent text-zinc-400 hover:text-white'}`}>
                                    <Icon size={16} />
                                    {tab.label}
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="container mx-auto px-6 py-8">
                {activeTab === 'overview' && (
                    <div className="space-y-6">
                        {/* Monorepo Frameworks Section */}
                        {projectData.isMonorepo && projectData.frameworks && projectData.frameworks.length > 0 && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <Layers className="text-purple-500" size={20} />
                                    <h2 className="text-xl font-semibold">Monorepo Applications</h2>
                                </div>
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    {projectData.frameworks.map((framework, idx) => (
                                        <div key={idx} className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                                            <div className="mb-4 flex items-start justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                                                        <Package className="text-purple-500" size={20} />
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold">{framework.Name}</div>
                                                        <div className="text-sm text-zinc-400">{framework.Path}</div>
                                                    </div>
                                                </div>
                                                <span className="rounded-full bg-purple-500/10 px-2 py-1 text-xs text-purple-400">Port {framework.Port}</span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                <div>
                                                    <div className="text-zinc-400">Runtime</div>
                                                    <div className="font-medium">{framework.Runtime}</div>
                                                </div>
                                                {framework.Version && (
                                                    <div>
                                                        <div className="text-zinc-400">Version</div>
                                                        <div className="font-medium">{framework.Version}</div>
                                                    </div>
                                                )}
                                                <div className="col-span-2">
                                                    <div className="text-zinc-400">Build Command</div>
                                                    <div className="font-mono text-xs font-medium text-orange-400">{framework.BuildCmd}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Status Cards */}
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-4">
                                <div className="mb-1 flex items-center gap-2 text-sm text-zinc-400">
                                    <Activity size={16} />
                                    Uptime
                                </div>
                                <div className="text-2xl font-bold text-green-500">{projectData.metrics.uptime}</div>
                            </div>

                            <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-4">
                                <div className="mb-1 flex items-center gap-2 text-sm text-zinc-400">
                                    <Zap size={16} />
                                    Response Time
                                </div>
                                <div className="text-2xl font-bold">{projectData.metrics.avgResponseTime}</div>
                            </div>

                            <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-4">
                                <div className="mb-1 flex items-center gap-2 text-sm text-zinc-400">
                                    <TrendingUp size={16} />
                                    Requests (24h)
                                </div>
                                <div className="text-2xl font-bold">{projectData.metrics.requests24h}</div>
                            </div>

                            <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-4">
                                <div className="mb-1 flex items-center gap-2 text-sm text-zinc-400">
                                    <AlertCircle size={16} />
                                    Errors (24h)
                                </div>
                                <div className="text-2xl font-bold text-yellow-500">{projectData.metrics.errors24h}</div>
                            </div>
                        </div>

                        {/* Environment Status */}
                        <div className="space-y-4">
                            <h2 className="text-xl font-semibold">Environments</h2>

                            {!hasDeployments ? (
                                <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-12 text-center">
                                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900">
                                        <Rocket className="text-zinc-600" size={32} />
                                    </div>
                                    <h3 className="mb-2 text-lg font-semibold text-zinc-300">No Deployments Yet</h3>
                                    <p className="mb-6 text-sm text-zinc-500">Get started by deploying your project to production or staging</p>
                                    <button onClick={() => handleDeploy('production')} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-sm font-medium text-white hover:bg-orange-600">
                                        <Rocket size={18} />
                                        Deploy Now
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {/* Production */}
                                    {projectData.production.url && (
                                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                                            <div className="mb-4 flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                                                        <Globe className="text-green-500" size={20} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold">Production</span>
                                                            <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-500">
                                                                <CheckCircle2 size={12} />
                                                                Live
                                                            </span>
                                                        </div>
                                                        <a href={projectData.production.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
                                                            {projectData.production.url}
                                                            <ExternalLink size={12} />
                                                        </a>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <button className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800">
                                                        <Eye size={16} />
                                                    </button>
                                                    <button className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800">
                                                        <RotateCcw size={16} />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                                                <div>
                                                    <div className="text-zinc-400">Last Deploy</div>
                                                    <div className="font-medium">{projectData.production.lastDeployment}</div>
                                                </div>
                                                <div>
                                                    <div className="text-zinc-400">Branch</div>
                                                    <div className="font-medium">{projectData.production.branch || 'N/A'}</div>
                                                </div>
                                                <div>
                                                    <div className="text-zinc-400">Build Time</div>
                                                    <div className="font-medium">{projectData.production.buildTime || 'N/A'}</div>
                                                </div>
                                                <div>
                                                    <div className="text-zinc-400">Commit</div>
                                                    <div className="truncate font-medium">{projectData.production.commit || 'N/A'}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Staging */}
                                    {projectData.staging.url && (
                                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                                            <div className="mb-4 flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                                                        <Server className="text-blue-500" size={20} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold">Staging</span>
                                                            <span className="flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-500">
                                                                <CheckCircle2 size={12} />
                                                                Ready
                                                            </span>
                                                        </div>
                                                        <a href={projectData.staging.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
                                                            {projectData.staging.url}
                                                            <ExternalLink size={12} />
                                                        </a>
                                                    </div>
                                                </div>

                                                <button onClick={() => handleDeploy('staging')} className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
                                                    <Rocket size={16} />
                                                    Deploy
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                                                <div>
                                                    <div className="text-zinc-400">Last Deploy</div>
                                                    <div className="font-medium">{projectData.staging.lastDeployment}</div>
                                                </div>
                                                <div>
                                                    <div className="text-zinc-400">Branch</div>
                                                    <div className="font-medium">{projectData.staging.branch || 'N/A'}</div>
                                                </div>
                                                <div>
                                                    <div className="text-zinc-400">Build Time</div>
                                                    <div className="font-medium">{projectData.staging.buildTime || 'N/A'}</div>
                                                </div>
                                                <div>
                                                    <div className="text-zinc-400">Commit</div>
                                                    <div className="truncate font-medium">{projectData.staging.commit || 'N/A'}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Preview Environments */}
                                    {projectData.preview.length > 0 && (
                                        <div>
                                            <h3 className="mb-3 text-lg font-semibold">Preview Deployments</h3>
                                            {projectData.preview.map((preview, idx) => (
                                                <div key={idx} className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-4">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <GitBranch className="text-purple-500" size={18} />
                                                            <div>
                                                                <div className="font-medium">{preview.branch}</div>
                                                                <a href={preview.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
                                                                    {preview.url}
                                                                    <ExternalLink size={12} />
                                                                </a>
                                                            </div>
                                                        </div>
                                                        <div className="text-sm text-zinc-400">{preview.createdAt}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'environment' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-semibold">Environment Variables</h2>
                                <p className="text-sm text-zinc-400">Manage environment variables for your deployments</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => {
                                        setShowEnvFileDialog(true)
                                    }}
                                    className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                                >
                                    <Upload size={16} />
                                    Upload .env File
                                </button>
                                <button onClick={() => setShowAddEnv(true)} className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
                                    <Plus size={16} />
                                    Add Variable
                                </button>
                            </div>
                        </div>

                        {showEnvFileDialog && (
                            <DialogCanvas closeDialog={() => setShowEnvFileDialog(false)}>
                                <EnvFileUpload onClose={() => setShowEnvFileDialog(false)} onUpload={handleEnvFileUpload} />
                            </DialogCanvas>
                        )}
                        {showAddEnv && (
                            <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                                <h3 className="mb-4 font-semibold">New Environment Variable</h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="mb-1 block text-sm text-zinc-400">Key</label>
                                        <input type="text" value={newEnvKey} onChange={e => setNewEnvKey(e.target.value)} placeholder="DATABASE_URL" className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-zinc-700 focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm text-zinc-400">Value</label>
                                        <input type="password" value={newEnvValue} onChange={e => setNewEnvValue(e.target.value)} placeholder="postgresql://..." className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-zinc-700 focus:outline-none" />
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={handleAddEnvVar} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
                                            Add Variable
                                        </button>
                                        <button onClick={() => setShowAddEnv(false)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-white hover:bg-zinc-900">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            {envVars.map((env, idx) => (
                                <div key={idx} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-[#1b1b1b] p-4">
                                    <div className="flex items-center gap-3">
                                        <Lock className="text-zinc-500" size={16} />
                                        <div>
                                            <div className="font-mono text-sm font-medium">{env.key}</div>
                                            <div className="font-mono text-xs text-zinc-500">{env.value}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button className="rounded-lg border border-zinc-700 p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white">
                                            <Copy size={16} />
                                        </button>
                                        <button className="rounded-lg border border-zinc-700 p-2 text-zinc-400 hover:bg-zinc-900 hover:text-red-500">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'monitoring' && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-xl font-semibold">Real-time Monitoring</h2>
                            <p className="text-sm text-zinc-400">Built-in observability with zero setup required</p>
                        </div>

                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                                <h3 className="mb-4 font-semibold">Error Tracking</h3>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between rounded-lg bg-red-500/5 p-3">
                                        <div className="flex items-center gap-3">
                                            <XCircle className="text-red-500" size={20} />
                                            <div>
                                                <div className="text-sm font-medium">TypeError: Cannot read property</div>
                                                <div className="text-xs text-zinc-400">12 occurrences • 2h ago</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between rounded-lg bg-yellow-500/5 p-3">
                                        <div className="flex items-center gap-3">
                                            <AlertCircle className="text-yellow-500" size={20} />
                                            <div>
                                                <div className="text-sm font-medium">Slow database query detected</div>
                                                <div className="text-xs text-zinc-400">3 occurrences • 5h ago</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                                <h3 className="mb-4 font-semibold">Performance Metrics</h3>
                                <div className="space-y-4">
                                    <div>
                                        <div className="mb-1 flex justify-between text-sm">
                                            <span className="text-zinc-400">CPU Usage</span>
                                            <span className="font-medium">24%</span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
                                            <div className="h-full w-1/4 bg-green-500"></div>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="mb-1 flex justify-between text-sm">
                                            <span className="text-zinc-400">Memory Usage</span>
                                            <span className="font-medium">68%</span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
                                            <div className="h-full w-2/3 bg-blue-500"></div>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="mb-1 flex justify-between text-sm">
                                            <span className="text-zinc-400">Disk Usage</span>
                                            <span className="font-medium">45%</span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
                                            <div className="h-full w-1/2 bg-purple-500"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                            <h3 className="mb-4 font-semibold">Recent Logs</h3>
                            <div className="space-y-2 font-mono text-xs">
                                <div className="flex items-start gap-3 text-zinc-400">
                                    <span className="text-green-500">[INFO]</span>
                                    <span className="text-zinc-500">2025-12-31 14:23:45</span>
                                    <span>GET /api/products - 200 OK (142ms)</span>
                                </div>
                                <div className="flex items-start gap-3 text-zinc-400">
                                    <span className="text-green-500">[INFO]</span>
                                    <span className="text-zinc-500">2025-12-31 14:23:42</span>
                                    <span>Database connection established</span>
                                </div>
                                <div className="flex items-start gap-3 text-zinc-400">
                                    <span className="text-yellow-500">[WARN]</span>
                                    <span className="text-zinc-500">2025-12-31 14:23:38</span>
                                    <span>Slow query detected: SELECT * FROM orders (2.3s)</span>
                                </div>
                                <div className="flex items-start gap-3 text-zinc-400">
                                    <span className="text-red-500">[ERROR]</span>
                                    <span className="text-zinc-500">2025-12-31 14:23:35</span>
                                    <span>Failed to process payment: stripe_error</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-xl font-semibold">Project Settings</h2>
                            <p className="text-sm text-zinc-400">Configure your project deployment settings</p>
                        </div>

                        <div className="space-y-4">
                            <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                                <h3 className="mb-4 font-semibold">Build Settings</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="mb-2 block text-sm text-zinc-400">Project Type</label>
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                            {projectData.isMonorepo ? (
                                                <>
                                                    <Layers className="text-purple-500" size={16} />
                                                    <span>Monorepo ({projectData.frameworks.length} applications)</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Code size={16} />
                                                    <span>{projectData.framework}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {projectData.isMonorepo &&
                                        projectData.frameworks.map((framework, idx) => (
                                            <div key={idx} className="rounded border border-zinc-800 bg-zinc-900/50 p-4">
                                                <div className="mb-3 font-medium text-purple-400">
                                                    {framework.Name} - {framework.Path}
                                                </div>
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="mb-1 block text-xs text-zinc-400">Build Command</label>
                                                        <input type="text" defaultValue={framework.BuildCmd} className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm text-white focus:border-zinc-700 focus:outline-none" />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="mb-1 block text-xs text-zinc-400">Runtime</label>
                                                            <input type="text" defaultValue={framework.Runtime} className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm text-white focus:border-zinc-700 focus:outline-none" />
                                                        </div>
                                                        <div>
                                                            <label className="mb-1 block text-xs text-zinc-400">Port</label>
                                                            <input type="text" defaultValue={framework.Port} className="w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm text-white focus:border-zinc-700 focus:outline-none" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>

                            <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                                <h3 className="mb-4 font-semibold">Domain Settings</h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="mb-2 block text-sm text-zinc-400">Production Domain</label>
                                        <input type="text" defaultValue={projectData.production.url || 'Not configured'} className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-zinc-700 focus:outline-none" />
                                    </div>
                                    <button className="text-sm text-orange-500 hover:text-orange-400">+ Add Custom Domain</button>
                                </div>
                            </div>

                            <div className="rounded-lg border border-red-900/50 bg-red-500/5 p-5">
                                <h3 className="mb-2 font-semibold text-red-500">Danger Zone</h3>
                                <p className="mb-4 text-sm text-zinc-400">Irreversible actions for this project</p>
                                <button className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600">Delete Project</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ProjectDetails
