import React, { useState } from 'react'
import { Settings, Globe, GitBranch, Shield, Zap, Server, Clock, AlertTriangle, Plus, Trash2, Save, RotateCcw } from 'lucide-react'

interface DeploymentSettingsProps {
    projectId: string
    accessToken: string
    onClose?: () => void
}

interface EnvironmentConfig {
    name: string
    domain: string
    buildCommand: string
    outputDirectory: string
    nodeVersion: string
    installCommand: string
    environmentVariables: { key: string; value: string }[]
}

interface DeploymentRule {
    id: string
    name: string
    branch: string
    environment: 'production' | 'staging' | 'preview'
    autoDeploy: boolean
    framework: string
}

const DeploymentSettings: React.FC<DeploymentSettingsProps> = ({ projectId, accessToken }) => {
    const [activeTab, setActiveTab] = useState('general')
    const [isLoading, setIsLoading] = useState(false)

    const [generalSettings, setGeneralSettings] = useState({
        framework: 'nextjs',
        buildCommand: 'npm run build',
        outputDirectory: '.next',
        nodeVersion: '18.x',
        installCommand: 'npm install',
        rootDirectory: '',
        monorepo: false
    })

    const [environmentVariables, setEnvironmentVariables] = useState([
        { key: 'NODE_ENV', value: 'production', environment: 'all' },
        { key: 'PORT', value: '3000', environment: 'all' }
    ])

    const [domains, setDomains] = useState([
        { name: 'primary', domain: 'example.com', type: 'production', sslEnabled: true }
    ])

    const [deploymentRules, setDeploymentRules] = useState<DeploymentRule[]>([
        { id: '1', name: 'Production Deploy', branch: 'main', environment: 'production', autoDeploy: true, framework: 'nextjs' },
        { id: '2', name: 'Staging Deploy', branch: 'develop', environment: 'staging', autoDeploy: true, framework: 'nextjs' }
    ])

    const [performanceSettings, setPerformanceSettings] = useState({
        enableCaching: true,
        cacheTTL: '3600',
        enableCompression: true,
        enableImageOptimization: true,
        enableCDN: true,
        minifyAssets: true
    })

    const [securitySettings, setSecuritySettings] = useState({
        enableHTTPS: true,
        enforceHTTPS: true,
        enableCORS: true,
        allowedOrigins: '*',
        enableRateLimit: false,
        rateLimit: '100',
        enableSecurityHeaders: true
    })

    const [buildSettings, setBuildSettings] = useState({
        enableBuildCache: true,
        parallelBuilds: true,
        buildTimeout: '600',
        enableBuildOptimization: true,
        failOnBuildWarnings: false
    })

    const handleSaveSettings = async () => {
        setIsLoading(true)
        try {
            // API call to save settings
            console.log('Saving deployment settings...')
            // await saveDeploymentSettings(projectId, accessToken, settings)
        } catch (error) {
            console.error('Error saving settings:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const addEnvironmentVariable = () => {
        setEnvironmentVariables([...environmentVariables, { key: '', value: '', environment: 'all' }])
    }

    const removeEnvironmentVariable = (index: number) => {
        setEnvironmentVariables(environmentVariables.filter((_, i) => i !== index))
    }

    const addDomain = () => {
        setDomains([...domains, { name: '', domain: '', type: 'production', sslEnabled: true }])
    }

    const removeDomain = (index: number) => {
        setDomains(domains.filter((_, i) => i !== index))
    }

    const addDeploymentRule = () => {
        const newRule: DeploymentRule = {
            id: Date.now().toString(),
            name: 'New Rule',
            branch: '',
            environment: 'staging',
            autoDeploy: false,
            framework: 'nextjs'
        }
        setDeploymentRules([...deploymentRules, newRule])
    }

    const removeDeploymentRule = (id: string) => {
        setDeploymentRules(deploymentRules.filter(rule => rule.id !== id))
    }

    return (
        <div className="w-full text-white">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-semibold">Deployment Settings</h2>
                        <p className="text-sm text-zinc-400">Configure deployment behavior and environment settings</p>
                    </div>
                    <button 
                        onClick={handleSaveSettings}
                        disabled={isLoading}
                        className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isLoading ? (
                            <>
                                <RotateCcw className="animate-spin" size={16} />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save size={16} />
                                Save Changes
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="mb-6 border-b border-zinc-800">
                <div className="flex gap-6">
                    {[
                        { id: 'general', label: 'General', icon: Settings },
                        { id: 'environment', label: 'Environment Variables', icon: Globe },
                        { id: 'domains', label: 'Domains', icon: Globe },
                        { id: 'rules', label: 'Deployment Rules', icon: GitBranch },
                        { id: 'performance', label: 'Performance', icon: Zap },
                        { id: 'security', label: 'Security', icon: Shield },
                        { id: 'build', label: 'Build', icon: Server }
                    ].map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            onClick={() => setActiveTab(id)}
                            className={`relative flex items-center gap-2 py-3 text-sm font-medium transition-colors ${
                                activeTab === id ? 'text-white' : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            <Icon size={16} />
                            {label}
                            {activeTab === id && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="space-y-6">
                {/* General Settings */}
                {activeTab === 'general' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                            <div>
                                <label className="mb-2 block text-sm font-medium">Framework</label>
                                <select 
                                    value={generalSettings.framework}
                                    onChange={e => setGeneralSettings({...generalSettings, framework: e.target.value})}
                                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none"
                                >
                                    <option value="nextjs">Next.js</option>
                                    <option value="react">React</option>
                                    <option value="vue">Vue.js</option>
                                    <option value="angular">Angular</option>
                                    <option value="node">Node.js</option>
                                    <option value="python">Python</option>
                                    <option value="go">Go</option>
                                    <option value="static">Static Site</option>
                                </select>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium">Node Version</label>
                                <select 
                                    value={generalSettings.nodeVersion}
                                    onChange={e => setGeneralSettings({...generalSettings, nodeVersion: e.target.value})}
                                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none"
                                >
                                    <option value="16.x">16.x</option>
                                    <option value="18.x">18.x</option>
                                    <option value="20.x">20.x</option>
                                    <option value="22.x">22.x</option>
                                </select>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium">Build Command</label>
                                <input 
                                    type="text"
                                    value={generalSettings.buildCommand}
                                    onChange={e => setGeneralSettings({...generalSettings, buildCommand: e.target.value})}
                                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
                                    placeholder="npm run build"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium">Install Command</label>
                                <input 
                                    type="text"
                                    value={generalSettings.installCommand}
                                    onChange={e => setGeneralSettings({...generalSettings, installCommand: e.target.value})}
                                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
                                    placeholder="npm install"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium">Output Directory</label>
                                <input 
                                    type="text"
                                    value={generalSettings.outputDirectory}
                                    onChange={e => setGeneralSettings({...generalSettings, outputDirectory: e.target.value})}
                                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
                                    placeholder=".next"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium">Root Directory</label>
                                <input 
                                    type="text"
                                    value={generalSettings.rootDirectory}
                                    onChange={e => setGeneralSettings({...generalSettings, rootDirectory: e.target.value})}
                                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
                                    placeholder="Leave empty if not monorepo"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-sm font-medium">Monorepo</div>
                                <div className="text-xs text-zinc-500">Enable for monorepo projects</div>
                            </div>
                            <button 
                                onClick={() => setGeneralSettings({...generalSettings, monorepo: !generalSettings.monorepo})}
                                className={`relative h-6 w-11 rounded-full transition-colors ${generalSettings.monorepo ? 'bg-orange-500' : 'bg-zinc-700'}`}
                            >
                                <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${generalSettings.monorepo ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Environment Variables */}
                {activeTab === 'environment' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-medium">Environment Variables</h3>
                            <button 
                                onClick={addEnvironmentVariable}
                                className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-white transition-colors hover:bg-zinc-800"
                            >
                                <Plus size={16} />
                                Add Variable
                            </button>
                        </div>

                        {environmentVariables.map((envVar, index) => (
                            <div key={index} className="grid grid-cols-12 gap-3">
                                <input
                                    type="text"
                                    placeholder="Key"
                                    value={envVar.key}
                                    onChange={e => {
                                        const newVars = [...environmentVariables]
                                        newVars[index].key = e.target.value
                                        setEnvironmentVariables(newVars)
                                    }}
                                    className="col-span-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
                                />
                                <input
                                    type="text"
                                    placeholder="Value"
                                    value={envVar.value}
                                    onChange={e => {
                                        const newVars = [...environmentVariables]
                                        newVars[index].value = e.target.value
                                        setEnvironmentVariables(newVars)
                                    }}
                                    className="col-span-6 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
                                />
                                <select
                                    value={envVar.environment}
                                    onChange={e => {
                                        const newVars = [...environmentVariables]
                                        newVars[index].environment = e.target.value
                                        setEnvironmentVariables(newVars)
                                    }}
                                    className="col-span-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
                                >
                                    <option value="all">All</option>
                                    <option value="production">Production</option>
                                    <option value="staging">Staging</option>
                                    <option value="preview">Preview</option>
                                </select>
                                <button
                                    onClick={() => removeEnvironmentVariable(index)}
                                    className="col-span-1 flex items-center justify-center rounded-lg border border-red-800 bg-red-950/20 p-2 text-red-400 transition-colors hover:bg-red-950/40"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}

                        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="mt-0.5 flex-shrink-0 text-blue-400" size={16} />
                                <p className="text-xs text-blue-300">
                                    Environment variables are encrypted and stored securely. Variables marked as "All" will be available in all environments.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Domains */}
                {activeTab === 'domains' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-medium">Custom Domains</h3>
                            <button 
                                onClick={addDomain}
                                className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-white transition-colors hover:bg-zinc-800"
                            >
                                <Plus size={16} />
                                Add Domain
                            </button>
                        </div>

                        {domains.map((domain, index) => (
                            <div key={index} className="grid grid-cols-12 gap-3">
                                <input
                                    type="text"
                                    placeholder="Name"
                                    value={domain.name}
                                    onChange={e => {
                                        const newDomains = [...domains]
                                        newDomains[index].name = e.target.value
                                        setDomains(newDomains)
                                    }}
                                    className="col-span-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
                                />
                                <input
                                    type="text"
                                    placeholder="domain.com"
                                    value={domain.domain}
                                    onChange={e => {
                                        const newDomains = [...domains]
                                        newDomains[index].domain = e.target.value
                                        setDomains(newDomains)
                                    }}
                                    className="col-span-5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
                                />
                                <select
                                    value={domain.type}
                                    onChange={e => {
                                        const newDomains = [...domains]
                                        newDomains[index].type = e.target.value as 'production' | 'staging' | 'preview'
                                        setDomains(newDomains)
                                    }}
                                    className="col-span-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
                                >
                                    <option value="production">Production</option>
                                    <option value="staging">Staging</option>
                                    <option value="preview">Preview</option>
                                </select>
                                <div className="col-span-2 flex items-center gap-3">
                                    <button
                                        onClick={() => {
                                            const newDomains = [...domains]
                                            newDomains[index].sslEnabled = !newDomains[index].sslEnabled
                                            setDomains(newDomains)
                                        }}
                                        className={`relative h-6 w-11 rounded-full transition-colors ${domain.sslEnabled ? 'bg-green-500' : 'bg-zinc-700'}`}
                                    >
                                        <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${domain.sslEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </button>
                                    <span className="text-xs text-zinc-400">SSL</span>
                                </div>
                                <button
                                    onClick={() => removeDomain(index)}
                                    className="col-span-1 flex items-center justify-center rounded-lg border border-red-800 bg-red-950/20 p-2 text-red-400 transition-colors hover:bg-red-950/40"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Deployment Rules */}
                {activeTab === 'rules' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-medium">Deployment Rules</h3>
                            <button 
                                onClick={addDeploymentRule}
                                className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-white transition-colors hover:bg-zinc-800"
                            >
                                <Plus size={16} />
                                Add Rule
                            </button>
                        </div>

                        {deploymentRules.map((rule) => (
                            <div key={rule.id} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="mb-2 block text-sm font-medium">Rule Name</label>
                                        <input
                                            type="text"
                                            value={rule.name}
                                            onChange={e => {
                                                const newRules = deploymentRules.map(r => 
                                                    r.id === rule.id ? {...r, name: e.target.value} : r
                                                )
                                                setDeploymentRules(newRules)
                                            }}
                                            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-sm font-medium">Branch Pattern</label>
                                        <input
                                            type="text"
                                            value={rule.branch}
                                            onChange={e => {
                                                const newRules = deploymentRules.map(r => 
                                                    r.id === rule.id ? {...r, branch: e.target.value} : r
                                                )
                                                setDeploymentRules(newRules)
                                            }}
                                            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
                                            placeholder="main, feature/*"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-sm font-medium">Target Environment</label>
                                        <select
                                            value={rule.environment}
                                            onChange={e => {
                                                const newRules = deploymentRules.map(r => 
                                                    r.id === rule.id ? {...r, environment: e.target.value as 'production' | 'staging' | 'preview'} : r
                                                )
                                                setDeploymentRules(newRules)
                                            }}
                                            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
                                        >
                                            <option value="production">Production</option>
                                            <option value="staging">Staging</option>
                                            <option value="preview">Preview</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-sm font-medium">Auto Deploy</div>
                                            <div className="text-xs text-zinc-500">Automatically deploy on push</div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const newRules = deploymentRules.map(r => 
                                                    r.id === rule.id ? {...r, autoDeploy: !r.autoDeploy} : r
                                                )
                                                setDeploymentRules(newRules)
                                            }}
                                            className={`relative h-6 w-11 rounded-full transition-colors ${rule.autoDeploy ? 'bg-orange-500' : 'bg-zinc-700'}`}
                                        >
                                            <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${rule.autoDeploy ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-4 flex justify-end">
                                    <button
                                        onClick={() => removeDeploymentRule(rule.id)}
                                        className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/20 px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-950/40"
                                    >
                                        <Trash2 size={16} />
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Performance Settings */}
                {activeTab === 'performance' && (
                    <div className="space-y-6">
                        {[
                            { key: 'enableCaching', label: 'Enable Caching', desc: 'Cache static assets and responses' },
                            { key: 'enableCompression', label: 'Enable Compression', desc: 'Gzip compression for assets' },
                            { key: 'enableImageOptimization', label: 'Image Optimization', desc: 'Automatic image optimization and resizing' },
                            { key: 'enableCDN', label: 'CDN Integration', desc: 'Serve content through global CDN' },
                            { key: 'minifyAssets', label: 'Minify Assets', desc: 'Minify CSS, JS, and HTML' }
                        ].map(({ key, label, desc }) => (
                            <div key={key} className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm font-medium">{label}</div>
                                    <div className="text-xs text-zinc-500">{desc}</div>
                                </div>
                                <button
                                    onClick={() => setPerformanceSettings({...performanceSettings, [key]: !performanceSettings[key as keyof typeof performanceSettings]})}
                                    className={`relative h-6 w-11 rounded-full transition-colors ${performanceSettings[key as keyof typeof performanceSettings] ? 'bg-orange-500' : 'bg-zinc-700'}`}
                                >
                                    <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${performanceSettings[key as keyof typeof performanceSettings] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                </button>
                            </div>
                        ))}

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label className="mb-2 block text-sm font-medium">Cache TTL (seconds)</label>
                                <input
                                    type="text"
                                    value={performanceSettings.cacheTTL}
                                    onChange={e => setPerformanceSettings({...performanceSettings, cacheTTL: e.target.value})}
                                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Security Settings */}
                {activeTab === 'security' && (
                    <div className="space-y-6">
                        {[
                            { key: 'enableHTTPS', label: 'Enable HTTPS', desc: 'Force HTTPS connections' },
                            { key: 'enforceHTTPS', label: 'Enforce HTTPS', desc: 'Redirect HTTP to HTTPS' },
                            { key: 'enableCORS', label: 'Enable CORS', desc: 'Cross-origin resource sharing' },
                            { key: 'enableRateLimit', label: 'Rate Limiting', desc: 'Limit requests per IP' },
                            { key: 'enableSecurityHeaders', label: 'Security Headers', desc: 'Add security headers' }
                        ].map(({ key, label, desc }) => (
                            <div key={key} className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm font-medium">{label}</div>
                                    <div className="text-xs text-zinc-500">{desc}</div>
                                </div>
                                <button
                                    onClick={() => setSecuritySettings({...securitySettings, [key]: !securitySettings[key as keyof typeof securitySettings]})}
                                    className={`relative h-6 w-11 rounded-full transition-colors ${securitySettings[key as keyof typeof securitySettings] ? 'bg-orange-500' : 'bg-zinc-700'}`}
                                >
                                    <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${securitySettings[key as keyof typeof securitySettings] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                </button>
                            </div>
                        ))}

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label className="mb-2 block text-sm font-medium">Allowed Origins</label>
                                <input
                                    type="text"
                                    value={securitySettings.allowedOrigins}
                                    onChange={e => setSecuritySettings({...securitySettings, allowedOrigins: e.target.value})}
                                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
                                    placeholder="* or https://example.com"
                                />
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-medium">Rate Limit (req/min)</label>
                                <input
                                    type="text"
                                    value={securitySettings.rateLimit}
                                    onChange={e => setSecuritySettings({...securitySettings, rateLimit: e.target.value})}
                                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Build Settings */}
                {activeTab === 'build' && (
                    <div className="space-y-6">
                        {[
                            { key: 'enableBuildCache', label: 'Build Cache', desc: 'Cache dependencies and build artifacts' },
                            { key: 'parallelBuilds', label: 'Parallel Builds', desc: 'Run build steps in parallel when possible' },
                            { key: 'enableBuildOptimization', label: 'Build Optimization', desc: 'Optimize build process for faster builds' },
                            { key: 'failOnBuildWarnings', label: 'Fail on Warnings', desc: 'Treat warnings as build failures' }
                        ].map(({ key, label, desc }) => (
                            <div key={key} className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm font-medium">{label}</div>
                                    <div className="text-xs text-zinc-500">{desc}</div>
                                </div>
                                <button
                                    onClick={() => setBuildSettings({...buildSettings, [key]: !buildSettings[key as keyof typeof buildSettings]})}
                                    className={`relative h-6 w-11 rounded-full transition-colors ${buildSettings[key as keyof typeof buildSettings] ? 'bg-orange-500' : 'bg-zinc-700'}`}
                                >
                                    <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${buildSettings[key as keyof typeof buildSettings] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                </button>
                            </div>
                        ))}

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label className="mb-2 block text-sm font-medium">Build Timeout (seconds)</label>
                                <input
                                    type="text"
                                    value={buildSettings.buildTimeout}
                                    onChange={e => setBuildSettings({...buildSettings, buildTimeout: e.target.value})}
                                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default DeploymentSettings