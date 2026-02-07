'use client'
import React, { useRef, useState } from 'react'
import { Rocket, Settings, Activity, Globe, GitBranch, Clock, CheckCircle2, XCircle, AlertCircle, Eye, Code, Server, Lock, RotateCcw, Play, Pause, Plus, Trash2, Copy, ExternalLink, TrendingUp, Zap, Shield, Layers, Package, Hammer, Upload, Calendar, Save, Loader2 } from 'lucide-react'
import { Build, BuildStatus, DeploymentConfig, Deployment, ProjectData } from './Types/ProjectTypes'
import EnvFileUpload from '../account/components/EnvFileUpload'
import DialogCanvas from '@/common-components/DialogCanvas'
import axios from 'axios'
import BuildDialog from './components/BuildDialog'
import BuildLogsViewer from './components/BuildLogsViewer'
import EnvVarsCard from './components/EnvVarCard'
import { useBuildUpdates } from '@/hooks/useBuildUpdates'
import DeployDialog from './components/DeployDialog'
import DeploymentLogsViewer from './components/DeploymentLogsViewer'
import { useDeploymentUpdates } from '@/hooks/useDeployuseDeploymentUpdates'

const ProjectDetails: React.FC<{ projectData: ProjectData; accessToken: string; services: { service_name: string; env_vars: Record<string, string> }[] }> = ({ projectData, accessToken, services }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'deployments' | 'deploymentHistory' | 'environment' | 'settings' | 'monitoring' | 'builds'>('overview')

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

    // Deploy dialog state
    const [showDeployDialog, setShowDeployDialog] = useState(false)
    const [deployEnvironment, setDeployEnvironment] = useState('')
    const [deploySource, setDeploySource] = useState<'build' | 'branch'>('build')
    const [deploySelectedBuild, setDeploySelectedBuild] = useState('')
    const [selectedBranch, setSelectedBranch] = useState(projectData.production?.branch || 'main')
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [deploymentStrategy, setDeploymentStrategy] = useState(projectData.production?.deploymentStrategy || 'blue_green')
    const [enableMonitoring, setEnableMonitoring] = useState(true)
    const [autoScaling, setAutoScaling] = useState(false)
    const [deploymentEnvironment, setDeploymentEnvironment] = useState<'production' | 'staging' | 'preview'>('production')

    const [showDeploymentLogs, setShowDeploymentLogs] = useState(false)
    const [currentDeploymentId, setCurrentDeploymentId] = useState<string | null>(null)

    const [deployments, setDeployments] = useState<Deployment[]>(
        projectData.deployments.map(deployment => ({
            id: deployment.id,
            environment: deployment.environment,
            status: deployment.status,
            deploymentStrategy: deployment.deploymentStrategy,
            branch: deployment.branch,
            commitHash: deployment.commitHash,
            deploymentUrl: deployment.deploymentUrl,
            deploymentTrigger: deployment.deploymentTrigger,
            trafficPercentage: deployment.trafficPercentage,
            replicaCount: deployment.replicaCount,
            framework: deployment.framework,
            deployedBy: deployment.deployedBy,
            startedAt: deployment.startedAt,
            completedAt: deployment.completedAt,
            duration: deployment.duration,
            buildTime: deployment.buildTime,
            strategyPhase: deployment.strategyPhase,
            trafficSwitchCount: deployment.trafficSwitchCount,
            errorMessage: deployment.errorMessage
        }))
    )
    const liveDeployments = useDeploymentUpdates(projectData.id, deployments)

    const [builds, setBuilds] = useState<Build[]>(
        projectData.builds.map(build => ({
            id: build.id,
            status: build.status === 'completed' ? 'success' : (build.status as BuildStatus),
            branch: build.branch,
            commitHash: build.commitHash,
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

    const handleDeploy = async (config: DeploymentConfig) => {
        try {
            setIsDeploying(true)

            const deployUrl = config.buildId ? `trigger-deploy?buildId=${config.buildId}` : `trigger-deploy`

            const resp = await axios.post<{ buildId: string; deploymentId: string; environment: string; branch: string; commitHash: string }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/projects-manager/${deployUrl}`, {
                accessToken: accessToken,
                projectId: projectData.id,
                environment: config.environment,
                strategy: config.strategy
            })

            if (resp.status !== 200) {
                alert("There's an error in your deployment configuration")
                setIsDeploying(false)
                return
            }

            // Add new deployment to state
            if (resp.data.deploymentId) {
                const newDeployment: Deployment = {
                    id: resp.data.deploymentId,
                    environment: resp.data.environment as 'production' | 'staging' | 'preview',
                    status: 'pending',
                    deploymentStrategy: config.strategy as 'blue_green' | 'rolling' | 'canary' | 'recreate',
                    branch: resp.data.branch,
                    commitHash: resp.data.commitHash,
                    deploymentUrl: '',
                    deploymentTrigger: 'manual',
                    trafficPercentage: 0,
                    replicaCount: 1,
                    framework: null,
                    deployedBy: null,
                    startedAt: 'Just now',
                    completedAt: null,
                    duration: null,
                    buildTime: null,
                    strategyPhase: 'preparing',
                    trafficSwitchCount: 0,
                    errorMessage: null
                }

                setDeployments(prev => [newDeployment, ...prev])

                // Show deployment logs viewer
                setCurrentDeploymentId(resp.data.deploymentId)
                setDeploymentEnvironment(config.environment || 'production')
                setDeploymentStrategy(config.strategy || 'blue_green')
                setShowDeploymentLogs(true)
                setShowDeployDialog(false)
            }

            setIsDeploying(false)
        } catch (error) {
            alert("There's an error in your deployment configuration")
            setIsDeploying(false)
        }
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
                commitHash: resp.data.commitHash?.substring(0, 7) || 'pending...',
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
        { id: 'deploymentHistory', label: 'History', icon: Calendar },
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

                            <button
                                disabled={isDeploying}
                                onClick={() => {
                                    setShowDeployDialog(true)
                                }}
                                className="flex cursor-pointer items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
                            >
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

            {showDeploymentLogs && currentDeploymentId && (
                <DialogCanvas closeDialog={() => setShowDeploymentLogs(false)}>
                    <DeploymentLogsViewer
                        deploymentId={currentDeploymentId}
                        projectId={projectData.id}
                        environment={deploymentEnvironment}
                        strategy={deploymentStrategy}
                        onClose={() => {
                            setShowDeploymentLogs(false)
                            setCurrentDeploymentId(null)
                        }}
                    />
                </DialogCanvas>
            )}

            {showDeployDialog && (
                <DialogCanvas closeDialog={() => setShowDeployDialog(false)}>
                    <DeployDialog accessToken={accessToken} projectId={projectData.id} builds={projectData.builds} currentBranch={projectData.production.branch || 'main'} deploymentStrategy={projectData.production.deploymentStrategy || 'blue_green'} onDeploy={handleDeploy} onClose={() => setShowDeployDialog(false)} />
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
                {activeTab === 'deployments' && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-xl font-semibold">Deployment Environments</h2>
                            <p className="text-sm text-zinc-400">Manage and monitor your production and staging deployments</p>
                        </div>

                        {(() => {
                            const deployments = []

                            if (projectData.production.url) {
                                deployments.push({
                                    type: 'production',
                                    icon: Globe,
                                    iconColor: 'text-green-500',
                                    iconBg: 'bg-green-500/10',
                                    statusColor: projectData.production.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500',
                                    ...projectData.production
                                })
                            }

                            if (projectData.staging.url) {
                                deployments.push({
                                    type: 'staging',
                                    icon: Server,
                                    iconColor: 'text-blue-500',
                                    iconBg: 'bg-blue-500/10',
                                    statusColor: projectData.staging.status === 'active' ? 'bg-blue-500/10 text-blue-500' : 'bg-zinc-500/10 text-zinc-500',
                                    ...projectData.staging
                                })
                            }

                            if (projectData.preview && projectData.preview.length > 0) {
                                projectData.preview.forEach(preview => {
                                    deployments.push({
                                        type: 'preview',
                                        icon: GitBranch,
                                        iconColor: 'text-purple-500',
                                        iconBg: 'bg-purple-500/10',
                                        statusColor: 'bg-purple-500/10 text-purple-500',
                                        url: preview.url,
                                        branch: preview.branch,
                                        lastDeployment: preview.createdAt,
                                        status: 'active',
                                        containers: [],
                                        totalContainers: 0,
                                        healthyContainers: 0,
                                        unhealthyContainers: 0,
                                        unresolvedAlerts: [],
                                        unresolvedAlertCount: 0
                                    })
                                })
                            }

                            if (deployments.length === 0) {
                                return (
                                    <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-12 text-center">
                                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900">
                                            <Rocket className="text-zinc-600" size={32} />
                                        </div>
                                        <h3 className="mb-2 text-lg font-semibold text-zinc-300">No Active Deployments</h3>
                                        <p className="mb-6 text-sm text-zinc-500">Deploy your project to production or staging to see deployment details here</p>
                                        <button className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-sm font-medium text-white hover:bg-orange-600">
                                            <Rocket size={18} />
                                            Deploy to Production
                                        </button>
                                    </div>
                                )
                            }

                            return deployments.map((deployment, index) => {
                                const Icon = deployment.icon
                                const isProduction = deployment.type === 'production'

                                return (
                                    <div key={`${deployment.type}-${index}`} className="space-y-6">
                                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-6">
                                            <div className="mb-6 flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${deployment.iconBg}`}>
                                                        <Icon className={deployment.iconColor} size={24} />
                                                    </div>
                                                    <div>
                                                        <a href={`https://${deployment.url}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-lg font-semibold">
                                                            {deployment.url}
                                                            <ExternalLink size={12} />
                                                        </a>
                                                        <div className="flex items-center gap-3">
                                                            <h3 className="text-sm text-zinc-400 capitalize hover:text-white">{deployment.type}</h3>
                                                            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${deployment.statusColor}`}>
                                                                <CheckCircle2 size={12} />
                                                                {deployment.status || 'Unknown'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <button className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
                                                        <Eye size={16} />
                                                        View Logs
                                                    </button>
                                                    <button disabled={isDeploying} className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
                                                        <RotateCcw size={16} />
                                                        Redeploy
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Only show detailed metrics for production/staging, not preview */}
                                            {deployment.type !== 'preview' && (
                                                <>
                                                    {/* Deployment Strategy & Metrics */}
                                                    {deployment.deploymentStrategy && (
                                                        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                                                            <div className="rounded-lg bg-zinc-900/50 p-4">
                                                                <div className="text-sm text-zinc-400">Strategy</div>
                                                                <div className="font-semibold text-blue-400">{deployment.deploymentStrategy || 'N/A'}</div>
                                                            </div>
                                                            <div className="rounded-lg bg-zinc-900/50 p-4">
                                                                <div className="text-sm text-zinc-400">Traffic</div>
                                                                <div className="font-semibold">{deployment.trafficPercentage || 0}%</div>
                                                            </div>
                                                            <div className="rounded-lg bg-zinc-900/50 p-4">
                                                                <div className="text-sm text-zinc-400">Requests/min</div>
                                                                <div className="font-semibold">{deployment.currentRequestsPerMinute || 0}</div>
                                                            </div>
                                                            <div className="rounded-lg bg-zinc-900/50 p-4">
                                                                <div className="text-sm text-zinc-400">Response Time</div>
                                                                <div className="font-semibold">{deployment.avgResponseTime}</div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Strategy Details */}
                                                    {deployment.strategyDetails && (
                                                        <div className="mb-6 rounded-lg border border-zinc-700 bg-zinc-900/30 p-4">
                                                            <h4 className="mb-3 font-semibold">Deployment Strategy Details</h4>
                                                            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                                                                <div>
                                                                    <div className="text-zinc-400">Phase</div>
                                                                    <div className="font-medium capitalize">{deployment.strategyDetails.currentPhase}</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-zinc-400">Active Group</div>
                                                                    <div className="font-medium">{deployment.strategyDetails.activeGroup || 'None'}</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-zinc-400">Total Replicas</div>
                                                                    <div className="font-medium">{deployment.strategyDetails.totalReplicas}</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-zinc-400">Healthy Replicas</div>
                                                                    <div className="font-medium text-green-500">{deployment.strategyDetails.healthyReplicas}</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Containers */}
                                                    {deployment.containers && deployment.containers.length > 0 && (
                                                        <div className="mb-6">
                                                            <h4 className="mb-3 font-semibold">Containers ({deployment.totalContainers})</h4>
                                                            <div className="space-y-3">
                                                                {deployment.containers.map(container => (
                                                                    <div key={container.id} className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
                                                                        <div className="flex items-center justify-between">
                                                                            <div className="flex items-center gap-3">
                                                                                <div className={`h-3 w-3 rounded-full ${container.healthStatus === 'healthy' ? 'bg-green-500' : container.healthStatus === 'unhealthy' ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
                                                                                <div>
                                                                                    <div className="font-medium">{container.name}</div>
                                                                                    <div className="text-xs text-zinc-400">ID: {container.id.slice(0, 8)}...</div>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex items-center gap-4 text-sm">
                                                                                <span className={`rounded-full px-2 py-1 text-xs ${container.isActive ? 'bg-green-500/10 text-green-500' : 'bg-zinc-500/10 text-zinc-500'}`}>{container.status}</span>
                                                                                <span className="text-zinc-400">{container.deploymentGroup}</span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="mt-3 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                                                                            <div>
                                                                                <div className="text-zinc-400">CPU Usage</div>
                                                                                <div className="font-medium">{container.cpuUsage ? `${container.cpuUsage}%` : 'N/A'}</div>
                                                                            </div>
                                                                            <div>
                                                                                <div className="text-zinc-400">Memory</div>
                                                                                <div className="font-medium">{container.memoryUsage ? `${container.memoryUsage}MB` : 'N/A'}</div>
                                                                            </div>
                                                                            <div>
                                                                                <div className="text-zinc-400">Started</div>
                                                                                <div className="font-medium">{new Date(container.startedAt).toLocaleString()}</div>
                                                                            </div>
                                                                            <div>
                                                                                <div className="text-zinc-400">Health</div>
                                                                                <div className={`font-medium capitalize ${container.healthStatus === 'healthy' ? 'text-green-500' : container.healthStatus === 'unhealthy' ? 'text-red-500' : 'text-yellow-500'}`}>{container.healthStatus}</div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Alerts */}
                                                    {deployment.unresolvedAlerts && deployment.unresolvedAlerts.length > 0 && (
                                                        <div className="mb-6">
                                                            <h4 className="mb-3 font-semibold text-red-400">Unresolved Alerts ({deployment.unresolvedAlertCount})</h4>
                                                            <div className="space-y-2">
                                                                {deployment.unresolvedAlerts.slice(0, 3).map(alert => (
                                                                    <div key={alert.id} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                                                                        <div className="flex items-center gap-3">
                                                                            <AlertCircle className="text-red-500" size={16} />
                                                                            <div className="flex-1">
                                                                                <div className="text-sm font-medium">{alert.message}</div>
                                                                                <div className="text-xs text-zinc-400">{new Date(alert.timestamp).toLocaleString()}</div>
                                                                            </div>
                                                                            <span
                                                                                className={`rounded-full px-2 py-1 text-xs ${alert.severity === 'critical' ? 'bg-red-500/10 text-red-500' : alert.severity === 'high' ? 'bg-orange-500/10 text-orange-500' : alert.severity === 'medium' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-blue-500/10 text-blue-500'}`}
                                                                            >
                                                                                {alert.severity}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {/* Deployment Info */}
                                            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                                                <div>
                                                    <div className="text-zinc-400">Last Deployment</div>
                                                    <div className="font-medium">{deployment.lastDeployment}</div>
                                                </div>
                                                <div>
                                                    <div className="text-zinc-400">Branch</div>
                                                    <div className="font-medium">{deployment.branch || 'N/A'}</div>
                                                </div>
                                                {deployment.buildTime && (
                                                    <div>
                                                        <div className="text-zinc-400">Build Time</div>
                                                        <div className="font-medium">{deployment.buildTime}</div>
                                                    </div>
                                                )}
                                                {deployment.framework && (
                                                    <div>
                                                        <div className="text-zinc-400">Framework</div>
                                                        <div className="font-medium">{deployment.framework}</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        })()}
                    </div>
                )}

                {activeTab === 'deploymentHistory' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-semibold">Deployment History</h2>
                                <p className="text-sm text-zinc-400">Showing {projectData.deployments.length} recent deployments</p>
                            </div>
                        </div>

                        {projectData.deployments.length === 0 ? (
                            <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-12 text-center">
                                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900">
                                    <Rocket className="text-zinc-600" size={32} />
                                </div>
                                <h3 className="mb-2 text-lg font-semibold text-zinc-300">No Deployments Yet</h3>
                                <p className="mb-6 text-sm text-zinc-500">Your deployment history will appear here</p>
                            </div>
                        ) : (
                            <div className="overflow-hidden rounded-lg border border-zinc-800 bg-[#1b1b1b]">
                                <table className="w-full">
                                    <thead className="border-b border-zinc-800 bg-zinc-900/50">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Status</th>
                                            <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Environment</th>
                                            <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Branch</th>
                                            <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Commit</th>
                                            <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Strategy</th>
                                            <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Deployed</th>
                                            <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Duration</th>
                                            <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Traffic</th>
                                            <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800">
                                        {liveDeployments.map(deployment => {
                                            const getStatusDisplay = () => {
                                                switch (deployment.status) {
                                                    case 'pending':
                                                        return { icon: Clock, text: 'Pending', color: 'text-blue-500', bgColor: 'bg-blue-500/10' }
                                                    case 'deploying':
                                                        return { icon: Loader2, text: 'Deploying', color: 'text-orange-500', bgColor: 'bg-orange-500/10', spin: true }
                                                    case 'active':
                                                        return { icon: CheckCircle2, text: 'Active', color: 'text-green-500', bgColor: 'bg-green-500/10' }
                                                    case 'failed':
                                                        return { icon: XCircle, text: 'Failed', color: 'text-red-500', bgColor: 'bg-red-500/10' }
                                                    case 'rolled_back':
                                                        return { icon: RotateCcw, text: 'Rolled Back', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' }
                                                    case 'terminated':
                                                        return { icon: XCircle, text: 'Terminated', color: 'text-zinc-500', bgColor: 'bg-zinc-500/10' }
                                                    default:
                                                        return { icon: Clock, text: 'Unknown', color: 'text-zinc-500', bgColor: 'bg-zinc-500/10' }
                                                }
                                            }

                                            const statusDisplay = getStatusDisplay()
                                            const StatusIcon = statusDisplay.icon

                                            const getEnvironmentColor = () => {
                                                switch (deployment.environment) {
                                                    case 'production':
                                                        return 'bg-green-500/10 text-green-500'
                                                    case 'staging':
                                                        return 'bg-blue-500/10 text-blue-500'
                                                    case 'preview':
                                                        return 'bg-purple-500/10 text-purple-500'
                                                    default:
                                                        return 'bg-zinc-500/10 text-zinc-500'
                                                }
                                            }

                                            return (
                                                <tr key={deployment.id} className="transition-colors hover:bg-zinc-900/50">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${statusDisplay.bgColor}`}>
                                                                <StatusIcon className={`${statusDisplay.color} ${statusDisplay.spin ? 'animate-spin' : ''}`} size={16} />
                                                            </div>
                                                            <span className={`text-sm font-medium ${statusDisplay.color}`}>{statusDisplay.text}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${getEnvironmentColor()}`}>{deployment.environment}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-1.5 text-sm text-zinc-300">
                                                            <GitBranch size={14} className="text-zinc-500" />
                                                            {deployment.branch}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="font-mono text-xs text-zinc-400">{deployment.commitHash.substring(0, 7)}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-sm text-zinc-400 capitalize">{deployment.deploymentStrategy.replace('_', ' ')}</div>
                                                        {deployment.strategyPhase && <div className="text-xs text-zinc-600">{deployment.strategyPhase}</div>}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-sm text-zinc-400">{deployment.startedAt}</div>
                                                        {deployment.deployedBy && <div className="text-xs text-zinc-600">{deployment.deployedBy}</div>}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-sm text-zinc-400">{deployment.duration || '-'}</div>
                                                        {deployment.buildTime && <div className="text-xs text-zinc-600">Build: {deployment.buildTime}</div>}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-sm text-zinc-400">{deployment.trafficPercentage}%</div>
                                                        {deployment.trafficSwitchCount > 0 && (
                                                            <div className="flex items-center gap-1 text-xs text-blue-400">
                                                                <TrendingUp size={12} />
                                                                {deployment.trafficSwitchCount} switch{deployment.trafficSwitchCount > 1 ? 'es' : ''}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <button
                                                            className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                                                            onClick={() => {
                                                                setCurrentDeploymentId(deployment.id)
                                                                setDeploymentEnvironment(deployment.environment)
                                                                setDeploymentStrategy(deployment.deploymentStrategy)
                                                                setShowDeploymentLogs(true)
                                                            }}
                                                        >
                                                            <Eye size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

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
                                    <button className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-sm font-medium text-white hover:bg-orange-600">
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
                                                    <div className="truncate font-medium">{projectData.production.commitHash || 'N/A'}</div>
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

                                                <button className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
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
                                                    <div className="truncate font-medium">{projectData.staging.commitHash || 'N/A'}</div>
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

                        {/* Key Metrics Overview */}
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

                        {/* Environment-Specific Monitoring */}
                        {projectData.production.url && (
                            <div className="space-y-6">
                                <h3 className="text-lg font-semibold">Production Environment</h3>

                                {/* Production Metrics */}
                                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                    <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                                        <h4 className="mb-4 font-semibold">Performance Metrics</h4>
                                        <div className="space-y-4">
                                            <div>
                                                <div className="mb-1 flex justify-between text-sm">
                                                    <span className="text-zinc-400">Requests/min</span>
                                                    <span className="font-medium">{projectData.production.currentRequestsPerMinute || 0}</span>
                                                </div>
                                                <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
                                                    <div className="h-full bg-blue-500" style={{ width: `${Math.min(((projectData.production.currentRequestsPerMinute || 0) / 100) * 100, 100)}%` }}></div>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="mb-1 flex justify-between text-sm">
                                                    <span className="text-zinc-400">Response Time</span>
                                                    <span className="font-medium">{projectData.production.avgResponseTime}</span>
                                                </div>
                                                <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
                                                    <div className="h-full bg-green-500" style={{ width: '85%' }}></div>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="mb-1 flex justify-between text-sm">
                                                    <span className="text-zinc-400">Error Rate</span>
                                                    <span className="font-medium">{projectData.production.errorRate}</span>
                                                </div>
                                                <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
                                                    <div className="h-full bg-red-500" style={{ width: '5%' }}></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                                        <h4 className="mb-4 font-semibold">Container Health</h4>
                                        <div className="space-y-3">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-zinc-400">Total Containers</span>
                                                <span className="font-medium">{projectData.production.totalContainers}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-zinc-400">Healthy</span>
                                                <span className="font-medium text-green-500">{projectData.production.healthyContainers}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-zinc-400">Unhealthy</span>
                                                <span className="font-medium text-red-500">{projectData.production.unhealthyContainers}</span>
                                            </div>
                                            <div className="mt-4">
                                                <div className="mb-2 text-sm text-zinc-400">Health Status</div>
                                                <div className="flex items-center gap-2">
                                                    <div className={`h-3 w-3 rounded-full ${projectData.production.healthyContainers === projectData.production.totalContainers ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                                                    <span className="text-sm font-medium">{projectData.production.healthyContainers === projectData.production.totalContainers ? 'All Healthy' : 'Issues Detected'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Active Alerts */}
                                {projectData.production.unresolvedAlerts.length > 0 && (
                                    <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                                        <h4 className="mb-4 font-semibold text-red-400">Active Alerts ({projectData.production.unresolvedAlertCount})</h4>
                                        <div className="space-y-3">
                                            {projectData.production.unresolvedAlerts.map(alert => (
                                                <div key={alert.id} className={`rounded-lg border p-3 ${alert.severity === 'critical' ? 'border-red-500/20 bg-red-500/5' : alert.severity === 'high' ? 'border-orange-500/20 bg-orange-500/5' : alert.severity === 'medium' ? 'border-yellow-500/20 bg-yellow-500/5' : 'border-blue-500/20 bg-blue-500/5'}`}>
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <AlertCircle className={`${alert.severity === 'critical' ? 'text-red-500' : alert.severity === 'high' ? 'text-orange-500' : alert.severity === 'medium' ? 'text-yellow-500' : 'text-blue-500'}`} size={20} />
                                                            <div>
                                                                <div className="text-sm font-medium">{alert.message}</div>
                                                                <div className="text-xs text-zinc-400">{new Date(alert.timestamp).toLocaleString()}</div>
                                                            </div>
                                                        </div>
                                                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${alert.severity === 'critical' ? 'bg-red-500/10 text-red-500' : alert.severity === 'high' ? 'bg-orange-500/10 text-orange-500' : alert.severity === 'medium' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                                            {alert.severity}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Staging Monitoring (if applicable) */}
                        {projectData.staging.url && projectData.staging.status === 'active' && (
                            <div className="space-y-6">
                                <h3 className="text-lg font-semibold">Staging Environment</h3>
                                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                    <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                                        <h4 className="mb-4 font-semibold">Performance Metrics</h4>
                                        <div className="space-y-4">
                                            <div>
                                                <div className="mb-1 flex justify-between text-sm">
                                                    <span className="text-zinc-400">Requests/min</span>
                                                    <span className="font-medium">{projectData.staging.currentRequestsPerMinute || 0}</span>
                                                </div>
                                                <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
                                                    <div className="h-full bg-blue-500" style={{ width: `${Math.min(((projectData.staging.currentRequestsPerMinute || 0) / 50) * 100, 100)}%` }}></div>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="mb-1 flex justify-between text-sm">
                                                    <span className="text-zinc-400">Response Time</span>
                                                    <span className="font-medium">{projectData.staging.avgResponseTime}</span>
                                                </div>
                                                <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
                                                    <div className="h-full bg-green-500" style={{ width: '90%' }}></div>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="mb-1 flex justify-between text-sm">
                                                    <span className="text-zinc-400">Error Rate</span>
                                                    <span className="font-medium">{projectData.staging.errorRate}</span>
                                                </div>
                                                <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
                                                    <div className="h-full bg-red-500" style={{ width: '2%' }}></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                                        <h4 className="mb-4 font-semibold">Container Health</h4>
                                        <div className="space-y-3">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-zinc-400">Total Containers</span>
                                                <span className="font-medium">{projectData.staging.totalContainers}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-zinc-400">Healthy</span>
                                                <span className="font-medium text-green-500">{projectData.staging.healthyContainers}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-zinc-400">Unhealthy</span>
                                                <span className="font-medium text-red-500">{projectData.staging.unhealthyContainers}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Logs Section */}
                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                            <h4 className="mb-4 font-semibold">Recent Application Logs</h4>
                            <div className="space-y-2 font-mono text-xs">
                                <div className="flex items-start gap-3 text-zinc-400">
                                    <span className="text-green-500">[INFO]</span>
                                    <span className="text-zinc-500">{new Date().toISOString().slice(0, 19).replace('T', ' ')}</span>
                                    <span>Application started successfully on port 3000</span>
                                </div>
                                <div className="flex items-start gap-3 text-zinc-400">
                                    <span className="text-blue-500">[DEBUG]</span>
                                    <span className="text-zinc-500">{new Date(Date.now() - 300000).toISOString().slice(0, 19).replace('T', ' ')}</span>
                                    <span>Database connection pool initialized</span>
                                </div>
                                <div className="flex items-start gap-3 text-zinc-400">
                                    <span className="text-yellow-500">[WARN]</span>
                                    <span className="text-zinc-500">{new Date(Date.now() - 600000).toISOString().slice(0, 19).replace('T', ' ')}</span>
                                    <span>High memory usage detected: 85%</span>
                                </div>
                                <div className="flex items-start gap-3 text-zinc-400">
                                    <span className="text-green-500">[INFO]</span>
                                    <span className="text-zinc-500">{new Date(Date.now() - 900000).toISOString().slice(0, 19).replace('T', ' ')}</span>
                                    <span>Health check passed for container blue-0</span>
                                </div>
                            </div>
                            <div className="mt-4 flex justify-center">
                                <button className="text-sm text-blue-400 hover:text-blue-300">View Full Logs →</button>
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
                                                    <span>Monorepo ({projectData.frameworks!.length} applications)</span>
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
                                        projectData.frameworks!.map((framework, idx) => (
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
                                                            <div className="font-mono text-xs text-zinc-400">{build.commitHash.substring(0, 7)}</div>
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
