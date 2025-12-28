package builder

func GenerateDockerfile(framework *Framework, projectPath string) (string, error) {
	switch framework.Name {
	case "Next.js":
		return generateNextJsDockerfile(framework)
	case "Express.js":
		return generateExpressDockerfile(framework)
	case "Django":
		return generateDjangoDockerfile(framework)
	case "Go":
		return generateGoDockerfile(framework)
	default:
		return generateGenericDockerfile(framework)
	}

}

func generateGenericDockerfile(framework *Framework) (string, error) {
	panic("unimplemented")
}

func generateGoDockerfile(framework *Framework) (string, error) {
	panic("unimplemented")
}

func generateDjangoDockerfile(framework *Framework) (string, error) {
	panic("unimplemented")
}

func generateNextJsDockerfile(framework *Framework) (string, error) {
	return `FROM node:20-alpine AS base


# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci


# Build application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build


# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production


COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static


EXPOSE 3000
ENV PORT=3000


CMD ["node", "server.js"]
`, nil
}

func generateExpressDockerfile(framework *Framework) (string, error) {
	return `FROM node:20-alpine
WORKDIR /app


COPY package*.json ./
RUN npm ci --only=production


COPY . .


EXPOSE 3000
ENV NODE_ENV=production


CMD ["node", "index.js"]
`, nil
}
