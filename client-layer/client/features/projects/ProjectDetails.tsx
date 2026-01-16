'use client'
import React, { useRef, useState } from 'react'
import { Rocket, Settings, Activity, Database, Globe, GitBranch, Clock, CheckCircle2, XCircle, AlertCircle, Eye, Code, Server, Lock, RotateCcw, Play, Pause, Plus, Trash2, Copy, ExternalLink, TrendingUp, Zap, Shield, Layers, Package, Hammer, Upload, Calendar, Save, Loader2 } from 'lucide-react'
import { Build, BuildStatus, ProjectData } from './Types/ProjectTypes'
import EnvFileUpload from '../account/components/EnvFileUpload'
import DialogCanvas from '@/common-components/DialogCanvas'
import axios from 'axios'
import BuildDialog from './components/BuildDialog'
import BuildLogsViewer from './components/BuildLogsViewer'
import EnvVarsCard from './components/EnvVarCard'
import { useBuildUpdates } from '@/hooks/useBuildUpdates'

const ProjectDetails: React.FC<{ projectData: ProjectData; accessToken: string; services: { service_name: string; env_vars: Record<string, string> }[] }> = ({ projectData, accessToken, services }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'deployments' | 'environment' | 'settings' | 'monitoring' | 'builds'>('overview')

    const [envVars, setEnvVars] = useState<{ key: string; value: string; service: string }[]>(
        services.flatMap(service =>
            Object.entries(service.env_vars).map(([key, value]) => ({
                key,
                value,
                service: service.service_name
            }))
        )
    )
    const [hasChanges, setHasChanges] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [selectedService, setSelectedService] = useState('')

    const serviceNames = Array.from(new Set(services.map(s => s.service_name)))

    const [showAddEnv, setShowAddEnv] = useState(false)
    const [newEnvKey, setNewEnvKey] = useState('')
    const [newEnvValue, setNewEnvValue] = useState('')
    const [newEnvService, setNewEnvService] = useState('')
    const [isDeploying, setIsDeploying] = useState(false)
    const [openBuildDialog, setOpenBuildDialog] = useState(false)
    const [showEnvFileDialog, setShowEnvFileDialog] = useState(false)

    const [currentBuildId, setCurrentBuildId] = useState<string | null>(null)

    const [builds, setBuilds] = useState<Build[]>(
        projectData.builds.map(build => ({
            id: build.id,
            status: build.status === 'completed' ? 'success' : (build.status as BuildStatus),
            branch: build.branch,
            commit: build.commit,
            startTime: build.createdAt,
            duration: build.buildTime || undefined,
            framework: build.framework || undefined,
            initiatedBy: build.initiatedBy || undefined,
            errorMessage: build.errorMessage || undefined
        }))
    )
    const liveBuilds = useBuildUpdates(projectData.id, builds)

    const [selectedBuild, setSelectedBuild] = useState<Build | null>(null)
    const [showBuildLogs, setShowBuildLogs] = useState(false)

    const [currentPage, setCurrentPage] = useState(1)
    const buildsPerPage = 10

    const indexOfLastBuild = currentPage * buildsPerPage
    const indexOfFirstBuild = indexOfLastBuild - buildsPerPage
    const currentBuilds = liveBuilds.slice(indexOfFirstBuild, indexOfLastBuild)
    const totalPages = Math.ceil(liveBuilds.length / buildsPerPage)

    const handlePageChange = (page: number) => {
        setCurrentPage(page)
    }

    const handleDeploy = (environment: string) => {
        setIsDeploying(true)
        setTimeout(() => {
            setIsDeploying(false)
            alert(`Deployment to ${environment} initiated!`)
        }, 2000)
    }

    const handleAddEnvVar = () => {
        if (newEnvKey && newEnvValue && (selectedService !== '__new__' ? selectedService : newEnvService)) {
            const service = selectedService === '__new__' ? newEnvService : selectedService
            setEnvVars(prev => [...prev, { key: newEnvKey, value: newEnvValue, service }])
            setNewEnvKey('')
            setNewEnvValue('')
            setNewEnvService('')
            setSelectedService('')
            setShowAddEnv(false)
            setHasChanges(true)
        }
    }

    const handleEnvFileUpload = async (data: { envLocation: string; envFile: File }) => {
        try {
            let formData = new FormData()
            formData.append('envLocation', data.envLocation)
            formData.append('envFile', data.envFile)
            formData.append('projectId', projectData.id)
            formData.append('accessToken', accessToken)

            const resp = await axios.post<{ vars: { service: string; envVars: Record<string, string> } }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/projects-manager/env-config`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            })

            if (resp.status === 200 && resp.data.vars) {
                const { service, envVars } = resp.data.vars

                const newEnvVars = Object.entries(envVars).map(([key, value]) => ({
                    key,
                    value: value as string,
                    service
                }))

                setEnvVars(prev => {
                    const filtered = prev.filter(env => env.service !== service)
                    return [...filtered, ...newEnvVars]
                })

                setShowEnvFileDialog(false)
            }
        } catch (error) {
            console.error('Error uploading env file:', error)
            alert('Failed to upload environment file')
        }
    }

    const handleUpdateEnvVar = (index: number, field: 'key' | 'value', newValue: string) => {
        setEnvVars(prev => {
            const updated = [...prev]
            updated[index] = { ...updated[index], [field]: newValue }
            return updated
        })
        setHasChanges(true)
    }

    const handleDeleteEnvVar = (index: number) => {
        setEnvVars(prev => prev.filter((_, i) => i !== index))
        setHasChanges(true)
    }

    const handleSaveAllChanges = async () => {
        setIsSaving(true)
        try {
            const groupedByService: Record<string, Record<string, string>> = {}

            serviceNames.forEach(serviceName => {
                groupedByService[serviceName] = {}
            })

            envVars.forEach(env => {
                if (!groupedByService[env.service]) {
                    groupedByService[env.service] = {}
                }
                groupedByService[env.service][env.key] = env.value
            })

            const response = await axios.put(`${process.env.NEXT_PUBLIC_BACKEND_URL}/projects-manager/update-env-config`, {
                projectId: projectData.id,
                accessToken: accessToken,
                services: Object.entries(groupedByService).map(([serviceName, vars]) => ({
                    service_name: serviceName,
                    env_vars: vars
                }))
            })

            if (response.status === 200) {
                setHasChanges(false)
            }
        } catch (error) {
            console.error('Error updating env variables:', error)
            alert('Failed to update environment variables')
        } finally {
            setIsSaving(false)
        }
    }

    const handleStartBuild = async () => {
        try {
            const resp = await axios.post<{ buildId: string; commitHash: string; branch: string; status: string }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/projects-manager/trigger-build`, {
                projectId: projectData.id,
                accessToken: accessToken
            })

            console.log('Build triggered:', resp.data)

            if (resp.status !== 200 || !resp.data.buildId) {
                window.alert('Failed to start build. Please try again.')
                return
            }

            const newBuildId = resp.data.buildId
            setCurrentBuildId(newBuildId)
            setOpenBuildDialog(true)

            const newBuild: Build = {
                id: newBuildId,
                status: 'queued',
                branch: resp.data.branch || 'main',
                commit: resp.data.commitHash?.substring(0, 7) || 'pending...',
                startTime: new Date().toLocaleString(),
                duration: undefined
            }

            setBuilds(prev => [newBuild, ...prev])

            setCurrentPage(1)
        } catch (error) {
            console.error('Error starting build:', error)
            window.alert('Failed to start build. Please try again.')
        }
    }

    const handleDeleteBuild = async (buildId: string) => {
        if (!confirm('Are you sure you want to delete this build?')) {
            return
        }

        try {
            const response = await axios.delete(`${process.env.NEXT_PUBLIC_BACKEND_URL}/projects-manager/delete-build/${buildId}`, {
                data: {
                    projectId: projectData.id,
                    accessToken: accessToken
                }
            })

            if (response.status === 200) {
                setBuilds(prev => prev.filter(build => build.id !== buildId))
            }
        } catch (error) {
            console.error('Error deleting build:', error)
            alert('Failed to delete build. Please try again.')
        }
    }

    const handleBuildStatusChange = (buildData: any) => {
        setBuilds(prev =>
            prev.map(build => {
                if (build.id === buildData.buildId) {
                    let normalizedStatus = buildData.status
                    if (buildData.status === 'completed') normalizedStatus = 'success'

                    return {
                        ...build,
                        status: normalizedStatus as BuildStatus,
                        duration: buildData.duration || build.duration,
                        errorMessage: buildData.errorMessage || build.errorMessage
                    }
                }
                return build
            })
        )
    }

    const tabs = [
        { id: 'overview', label: 'Overview', icon: Activity },
        { id: 'deployments', label: 'Deployments', icon: Rocket },
        { id: 'environment', label: 'Environment', icon: Lock },
        { id: 'settings', label: 'Settings', icon: Settings },
        { id: 'monitoring', label: 'Monitoring', icon: TrendingUp },
        { id: 'builds', label: 'Builds', icon: Hammer }
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
                            <button onClick={handleStartBuild} className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50">
                                <Hammer size={18} />
                                Build
                            </button>

                            <button onClick={() => handleDeploy('production')} disabled={isDeploying} className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50 cursor-pointer">
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
            {openBuildDialog && currentBuildId && (
                <DialogCanvas closeDialog={() => setOpenBuildDialog(false)}>
                    <BuildDialog
                        accessToken={accessToken}
                        projectId={projectData.id}
                        gitRepoUrl={projectData.gitRepoUrl}
                        buildId={currentBuildId}
                        onBuildStatusChange={handleBuildStatusChange}
                        onClose={() => {
                            setOpenBuildDialog(false)
                            setCurrentBuildId(null)
                        }}
                    />
                </DialogCanvas>
            )}
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

            <div className="container mx-auto px-6 py-8">
                {activeTab === 'overview' && (
                    <div className="space-y-6">
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
                                <button onClick={() => setShowEnvFileDialog(true)} className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
                                    <Upload size={16} />
                                    Upload .env File
                                </button>
                                <button onClick={() => setShowAddEnv(true)} className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
                                    <Plus size={16} />
                                    Add Variable
                                </button>
                                {hasChanges && (
                                    <button onClick={handleSaveAllChanges} disabled={isSaving} className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50">
                                        {isSaving ? (
                                            <>
                                                <div className="h-4 w-4 animate-spin cursor-pointer rounded-full border-2 border-white border-t-transparent" />
                                                Saving...
                                            </>
                                        ) : (
                                            <>
                                                <Save size={16} />
                                                Update Variables
                                            </>
                                        )}
                                    </button>
                                )}
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
                                        <label className="mb-1 block text-sm text-zinc-400">Service/Location</label>
                                        <select value={selectedService} onChange={e => setSelectedService(e.target.value)} className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-zinc-700 focus:outline-none">
                                            <option value="">Select service...</option>
                                            {serviceNames.map(name => (
                                                <option key={name} value={name}>
                                                    {name}
                                                </option>
                                            ))}
                                            <option value="__new__">+ Add new service</option>
                                        </select>
                                    </div>

                                    {selectedService === '__new__' && (
                                        <div>
                                            <label className="mb-1 block text-sm text-zinc-400">New Service Name</label>
                                            <input type="text" value={newEnvService} onChange={e => setNewEnvService(e.target.value)} placeholder="backend, frontend, etc." className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-zinc-700 focus:outline-none" />
                                        </div>
                                    )}

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
                                        <button
                                            onClick={() => {
                                                setShowAddEnv(false)
                                                setSelectedService('')
                                                setNewEnvService('')
                                            }}
                                            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-white hover:bg-zinc-900"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            {envVars.map((env, idx) => (
                                <EnvVarsCard EnvVar={env} key={idx} id={idx} onUpdate={(field, value) => handleUpdateEnvVar(idx, field, value)} onDelete={() => handleDeleteEnvVar(idx)} />
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
                {showBuildLogs && selectedBuild && (
                    <DialogCanvas closeDialog={() => setShowBuildLogs(false)}>
                        <BuildLogsViewer build={selectedBuild} onClose={() => setShowBuildLogs(false)} />
                    </DialogCanvas>
                )}

                {activeTab === 'builds' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-semibold">Build History</h2>
                                <p className="text-sm text-zinc-400">
                                    Showing {indexOfFirstBuild + 1}-{Math.min(indexOfLastBuild, liveBuilds.length)} of {liveBuilds.length} builds
                                </p>
                            </div>
                            <button onClick={handleStartBuild} className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50">
                                <Hammer size={18} />
                                Build
                            </button>
                        </div>

                        {liveBuilds.length === 0 ? (
                            <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-12 text-center">
                                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900">
                                    <Hammer className="text-zinc-600" size={32} />
                                </div>
                                <h3 className="mb-2 text-lg font-semibold text-zinc-300">No Builds Yet</h3>
                                <p className="mb-6 text-sm text-zinc-500">Start your first build to see it here</p>
                                <button onClick={handleStartBuild} className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50">
                                    <Hammer size={18} />
                                    Build
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="overflow-hidden rounded-lg border border-zinc-800 bg-[#1b1b1b]">
                                    <table className="w-full">
                                        <thead className="border-b border-zinc-800 bg-zinc-900/50">
                                            <tr>
                                                <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Status</th>
                                                <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Build ID</th>
                                                <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Branch</th>
                                                <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Commit</th>
                                                <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Started</th>
                                                <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Duration</th>
                                                <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800">
                                            {currentBuilds.map(build => {
                                                const getStatusDisplay = () => {
                                                    switch (build.status) {
                                                        case 'queued':
                                                            return { icon: Clock, text: 'Queued', color: 'text-blue-500', bgColor: 'bg-blue-500/10' }
                                                        case 'cloning':
                                                            return { icon: Loader2, text: 'Cloning', color: 'text-blue-500', bgColor: 'bg-blue-500/10', spin: true }
                                                        case 'installing':
                                                            return { icon: Loader2, text: 'Installing', color: 'text-blue-500', bgColor: 'bg-blue-500/10', spin: true }
                                                        case 'building':
                                                            return { icon: Loader2, text: 'Building', color: 'text-blue-500', bgColor: 'bg-blue-500/10', spin: true }
                                                        case 'deploying':
                                                            return { icon: Loader2, text: 'Deploying', color: 'text-orange-500', bgColor: 'bg-orange-500/10', spin: true }
                                                        case 'success':
                                                            return { icon: CheckCircle2, text: 'Success', color: 'text-green-500', bgColor: 'bg-green-500/10' }
                                                        case 'failed':
                                                            return { icon: XCircle, text: 'Failed', color: 'text-red-500', bgColor: 'bg-red-500/10' }
                                                        case 'cancelled':
                                                            return { icon: XCircle, text: 'Cancelled', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' }
                                                        default:
                                                            return { icon: Clock, text: 'Unknown', color: 'text-zinc-500', bgColor: 'bg-zinc-500/10' }
                                                    }
                                                }

                                                const statusDisplay = getStatusDisplay()
                                                const StatusIcon = statusDisplay.icon
                                                const isBuilding = ['queued', 'cloning', 'installing', 'building', 'deploying'].includes(build.status)

                                                return (
                                                    <tr key={build.id} className="transition-colors hover:bg-zinc-900/50">
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-2">
                                                                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${statusDisplay.bgColor}`}>
                                                                    <StatusIcon className={`${statusDisplay.color} ${statusDisplay.spin ? 'animate-spin' : ''}`} size={16} />
                                                                </div>
                                                                <span className={`text-sm font-medium ${statusDisplay.color}`}>{statusDisplay.text}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="font-mono text-sm text-white">#{build.id.substring(0, 8)}</div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-1.5 text-sm text-zinc-300">
                                                                <GitBranch size={14} className="text-zinc-500" />
                                                                {build.branch}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="font-mono text-xs text-zinc-400">{build.commit.substring(0, 7)}</div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="text-sm text-zinc-400">{build.startTime}</div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="text-sm text-zinc-400">
                                                                {build.duration ||
                                                                    (isBuilding ? (
                                                                        <span className="flex items-center gap-1 text-orange-400">
                                                                            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
                                                                            In progress
                                                                        </span>
                                                                    ) : (
                                                                        '-'
                                                                    ))}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={() => {
                                                                        setSelectedBuild(build)
                                                                        setShowBuildLogs(true)
                                                                    }}
                                                                    className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                                                                >
                                                                    <Eye size={14} />
                                                                    View Logs
                                                                </button>
                                                                <button onClick={() => handleDeleteBuild(build.id)} className="flex cursor-pointer items-center gap-2 rounded-lg border border-red-700 bg-red-900/20 px-3 py-1.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-900/40">
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
                                        <div className="text-sm text-zinc-400">
                                            Page {currentPage} of {totalPages}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50">
                                                Previous
                                            </button>

                                            <div className="flex items-center gap-1">
                                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                                                    if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                                                        return (
                                                            <button key={page} onClick={() => handlePageChange(page)} className={`h-10 w-10 rounded-lg text-sm font-medium transition-colors ${currentPage === page ? 'bg-orange-500 text-white' : 'border border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800'}`}>
                                                                {page}
                                                            </button>
                                                        )
                                                    } else if (page === currentPage - 2 || page === currentPage + 2) {
                                                        return (
                                                            <span key={page} className="text-zinc-500">
                                                                ...
                                                            </span>
                                                        )
                                                    }
                                                    return null
                                                })}
                                            </div>

                                            <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50">
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export default ProjectDetails
