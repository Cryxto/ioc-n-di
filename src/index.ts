import 'reflect-metadata'

// ============================================================================
// Type Definitions
// ============================================================================

// biome-ignore lint/suspicious/noExplicitAny: Constructor args can be any type
export type Constructor<T = unknown> = new (...args: any[]) => T

// Injection token - can be a string, symbol, or constructor
export type InjectionToken<T = unknown> = string | symbol | Constructor<T>

// Provider types
export interface ClassProvider<T = unknown> {
	provide: InjectionToken<T>
	useClass: Constructor<T>
	onInit?: (instance: T) => Promise<void> | void
}

export interface ValueProvider<T = unknown> {
	provide: InjectionToken<T>
	useValue: T
}

export interface FactoryProvider<T = unknown> {
	provide: InjectionToken<T>
	// biome-ignore lint/suspicious/noExplicitAny: Factory function args can be any type
	useFactory: (...args: any[]) => T | Promise<T>
	// biome-ignore lint/suspicious/noExplicitAny: Dependencies can be of any type
	deps?: (InjectionToken | Constructor<any>)[]
	onInit?: (instance: T) => Promise<void> | void
}

export type Provider<T = unknown> =
	| Constructor<T>
	| ClassProvider<T>
	| ValueProvider<T>
	| FactoryProvider<T>

// ============================================================================
// Lazy Injection Support
// ============================================================================

/**
 * LazyRef wrapper for lazy dependency injection
 * Usage: @Lazy(ServiceB) private serviceB: LazyRef<ServiceB>
 */
export class LazyRef<T = unknown> {
	constructor(
		private readonly container: Container,
		private readonly token: Constructor<T> | InjectionToken<T>,
	) {}

	/**
	 * Get the resolved instance synchronously
	 * Throws if not yet resolved
	 */
	get(): T {
		return this.container.getInstanceOrThrow<T>(this.token)
	}

	/**
	 * Get the resolved instance synchronously
	 * Throws if not yet resolved
	 */
	get value(): T {
		return this.container.getInstanceOrThrow<T>(this.token)
	}

	/**
	 * Try to get the resolved instance synchronously
	 * Returns undefined if not yet resolved
	 */
	tryGetValue(): T | undefined {
		return this.container.getInstance<T>(this.token)
	}

	/**
	 * Check if the instance has been resolved yet
	 */
	isResolved(): boolean {
		return this.container.getInstance(this.token) !== undefined
	}

	/**
	 * Reset the lazy reference (for testing)
	 * Note: This clears the instance from the container cache
	 */
	reset(): void {
		// biome-ignore lint/suspicious/noExplicitAny: Accessing private property for testing
		const instances = (this.container as any).instances
		instances.delete(this.token)
	}
}

/**
 * Internal marker for lazy references (used by old lazy() function)
 */
export class LazyRefMarker<T = unknown> {
	constructor(public readonly ref: () => Constructor<T>) {}
}

/**
 * Old-style lazy reference (for backward compatibility)
 * Usage: @Inject(lazy(() => ServiceB))
 */
export function lazy<T>(fn: () => Constructor<T>): LazyRefMarker<T> {
	return new LazyRefMarker(fn)
}

/**
 * New-style Lazy decorator (RECOMMENDED)
 * Usage: @Lazy(ServiceB) private serviceB: LazyRef<ServiceB>
 */
export function Lazy<T>(
	token: Constructor<T> | InjectionToken<T>,
): ParameterDecorator {
	return (
		target: object,
		_propertyKey: string | symbol | undefined,
		parameterIndex: number,
	) => {
		const existingTokens = Reflect.getMetadata('inject:tokens', target) || []
		// Store a special marker that tells the container to inject a LazyRef
		existingTokens[parameterIndex] = { __lazyToken: token }
		Reflect.defineMetadata('inject:tokens', existingTokens, target)
	}
}

// Alias for NestJS compatibility
export const forwardRef: typeof lazy = lazy
export type ForwardRef<T = unknown> = LazyRefMarker<T>

// ============================================================================
// Decorators
// ============================================================================

/**
 * Options for @Injectable decorator
 * Stores metadata for future extensibility (similar to NestJS)
 */
export interface InjectableOptions {
	/**
	 * Scope of the injectable service
	 * - singleton (default): Single instance shared across the container
	 * - transient: New instance created each time (future feature)
	 * - request: Instance scoped to request lifecycle (future feature)
	 */
	scope?: 'singleton' | 'transient' | 'request'

	/**
	 * Custom metadata for the injectable
	 */
	metadata?: Record<string, unknown>

	/**
	 * Additional options (for future extensibility)
	 */
	[key: string]: unknown
}

/**
 * Injectable decorator - marks a class as injectable and stores metadata
 * Usage:
 * - @Injectable() - Simple usage
 * - @Injectable({ scope: 'singleton' }) - With options
 * - @Injectable({ metadata: { role: 'service' } }) - With custom metadata
 */
export function Injectable(options?: InjectableOptions): ClassDecorator {
	return (target: object) => {
		// Store injectable metadata for future use
		const metadata = {
			scope: 'singleton',
			...(options || {}),
		}
		Reflect.defineMetadata('injectable:options', metadata, target)
	}
}

// Inject decorator for specifying tokens
export function Inject(
	token: InjectionToken | LazyRefMarker,
): ParameterDecorator {
	return (
		target: object,
		_propertyKey: string | symbol | undefined,
		parameterIndex: number,
	) => {
		const existingTokens = Reflect.getMetadata('inject:tokens', target) || []
		existingTokens[parameterIndex] = token
		Reflect.defineMetadata('inject:tokens', existingTokens, target)
	}
}

/**
 * Get injectable metadata from a class
 * @param target - The class to get metadata from
 * @returns The injectable options or undefined if not decorated with @Injectable
 */
export function getInjectableMetadata(
	target: Constructor<unknown>,
): InjectableOptions | undefined {
	return Reflect.getMetadata('injectable:options', target)
}

// ============================================================================
// Container with Injection Tokens
// ============================================================================

export class Container {
	private static instance: Container

	// Store providers by token
	private readonly providers = new Map<
		InjectionToken | Constructor<unknown>,
		Provider<unknown>
	>()

	// Cache instantiated services
	private readonly instances = new Map<
		InjectionToken | Constructor<unknown>,
		unknown
	>()

	// Track resolution to detect circular dependencies
	private readonly resolutionStack = new Set<
		InjectionToken | Constructor<unknown>
	>()

	// Cache for dependency weights
	private readonly weightCache = new Map<
		InjectionToken | Constructor<unknown>,
		number
	>()

	private constructor() {}

	public static createOrGet(): Container {
		if (!Container.instance) {
			Container.instance = new Container()
		}
		return Container.instance
	}

	/**
	 * @deprecated Use createOrGet() instead
	 */
	public static getContainer(): Container {
		return Container.createOrGet()
	}

	/**
	 * Clear all providers and instances (useful for testing)
	 */
	public clear(): void {
		this.providers.clear()
		this.instances.clear()
		this.resolutionStack.clear()
		this.weightCache.clear()
	}

	/**
	 * Get the key for a provider
	 */
	private getProviderKey<T = unknown>(
		provider: Provider<T>,
	): InjectionToken | Constructor<unknown> {
		if (
			this.isClassProvider(provider) ||
			this.isValueProvider(provider) ||
			this.isFactoryProvider(provider)
		) {
			return provider.provide
		}
		// Plain class constructor
		return provider as Constructor<T>
	}

	/**
	 * Register a provider with the container
	 */
	public register<T = unknown>(provider: Provider<T>): void {
		const key = this.getProviderKey(provider)

		if (this.isClassProvider(provider)) {
			console.log(`Registering class provider: ${String(key)}`)
		} else if (this.isValueProvider(provider)) {
			console.log(`Registering value provider: ${String(key)}`)
			this.instances.set(key, provider.useValue)
		} else if (this.isFactoryProvider(provider)) {
			console.log(`Registering factory provider: ${String(key)}`)
		} else {
			console.log(`Registering class: ${key.toString()}`)
		}

		// @ts-expect-error - Provider<unknown> doesn't match Provider<T>
		this.providers.set(key, provider)
	}

	/**
	 * Get an already-resolved instance (synchronous)
	 * Returns undefined if not yet resolved
	 */
	public getInstance<T = unknown>(
		token: InjectionToken<T> | Constructor<T>,
	): T | undefined {
		return this.instances.get(token) as T | undefined
	}

	/**
	 * Get an already-resolved instance (synchronous)
	 * Throws if not yet resolved
	 */
	public getInstanceOrThrow<T = unknown>(
		token: InjectionToken<T> | Constructor<T>,
	): T {
		if (!this.instances.has(token)) {
			throw new Error(`Instance not resolved yet: ${this.getTokenName(token)}`)
		}
		return this.instances.get(token) as T
	}

	/**
	 * Get the instances map (for advanced usage)
	 */
	public getInstancesMap(): ReadonlyMap<
		InjectionToken | Constructor<unknown>,
		unknown
	> {
		return this.instances
	}

	/**
	 * Get the providers map (for advanced usage)
	 */
	public getProvidersMap(): ReadonlyMap<
		InjectionToken | Constructor<unknown>,
		Provider<unknown>
	> {
		return this.providers
	}

	/**
	 * Resolve a dependency by token or class
	 */
	public resolve<T = unknown>(
		ctor: Constructor<T>,
		skipCircularCheck?: boolean,
	): Promise<T>
	public resolve<T = unknown>(
		token: InjectionToken<T>,
		skipCircularCheck?: boolean,
	): Promise<T>
	public async resolve<T = unknown>(
		token: InjectionToken<T> | Constructor<T>,
		skipCircularCheck = false,
	): Promise<T> {
		console.log(`Resolving: ${this.getTokenName(token)}`)

		// Check if already instantiated
		if (this.instances.has(token)) {
			console.log(`  -> Returning cached instance`)
			return this.instances.get(token) as T
		}

		// Detect circular dependencies (skip for lazy references)
		if (!skipCircularCheck && this.resolutionStack.has(token)) {
			const chain = Array.from(this.resolutionStack)
				.map((t) => this.getTokenName(t))
				.join(' -> ')
			throw new Error(
				`Circular dependency detected!\n` +
					`Chain: ${chain} -> ${this.getTokenName(token)}`,
			)
		}

		// Only track in resolution stack if not skipping circular check
		if (!skipCircularCheck) {
			this.resolutionStack.add(token)
		}

		try {
			const provider = this.providers.get(token)

			if (!provider) {
				// If it's a class constructor and not registered, try to instantiate it
				if (typeof token === 'function') {
					return this.instantiateClass(token as Constructor<T>)
				}
				throw new Error(`No provider found for token: ${String(token)}`)
			}

			let instance: T | unknown

			if (this.isClassProvider(provider)) {
				instance = await this.instantiateClass(provider.useClass)
				// Call onInit lifecycle hook if provided
				if (provider.onInit) {
					console.log(`  -> Calling onInit for: ${this.getTokenName(token)}`)
					await provider.onInit(instance)
				}
			} else if (this.isValueProvider(provider)) {
				instance = provider.useValue
			} else if (this.isFactoryProvider(provider)) {
				instance = await this.instantiateFactory(provider)
				// Call onInit lifecycle hook if provided
				if (provider.onInit) {
					console.log(`  -> Calling onInit for: ${this.getTokenName(token)}`)
					await provider.onInit(instance)
				}
			} else {
				// Plain class constructor
				instance = await this.instantiateClass(provider as Constructor<T>)
			}

			this.instances.set(token, instance)
			return instance as T
		} finally {
			// Only remove from stack if we added it
			if (!skipCircularCheck) {
				this.resolutionStack.delete(token)
			}
		}
	}

	/**
	 * Instantiate a class by resolving its dependencies
	 */
	private async instantiateClass<T = unknown>(
		target: Constructor<T>,
	): Promise<T> {
		console.log(`  -> Instantiating class: ${target.name}`)

		// Get injection tokens if specified via @Inject decorator
		const injectionTokens: unknown[] =
			Reflect.getMetadata('inject:tokens', target) || []

		// Get constructor parameter types
		const paramTypes: Constructor<unknown>[] =
			Reflect.getMetadata('design:paramtypes', target) || []

		// Resolve dependencies SEQUENTIALLY to avoid false circular dependency errors
		// when multiple parameters depend on the same service
		const dependencies: unknown[] = []
		for (let index = 0; index < paramTypes.length; index++) {
			const paramType = paramTypes[index]
			const token = injectionTokens[index]

			if (token) {
				// Check if it's the new @Lazy decorator pattern
				if (token && typeof token === 'object' && '__lazyToken' in token) {
					console.log(`    -> Creating LazyRef wrapper`)
					// @ts-expect-error - token.__lazyToken is unknown but we know it's an InjectionToken
					dependencies.push(new LazyRef(this, token.__lazyToken))
					continue
				}

				// Check if it's the old lazy() function pattern (LazyRefMarker)
				if (token instanceof LazyRefMarker) {
					console.log(`    -> Creating LazyRef wrapper (old style)`)
					const actualClass = token.ref()
					dependencies.push(new LazyRef(this, actualClass))
					continue
				}

				console.log(`    -> Resolving @Inject token: ${String(token)}`)
				dependencies.push(await this.resolve(token as InjectionToken))
				continue
			}

			// Otherwise, use the parameter type
			if (paramType) {
				console.log(`    -> Resolving parameter type: ${paramType.name}`)
				dependencies.push(await this.resolve(paramType))
				continue
			}

			throw new Error(
				`Cannot resolve dependency at index ${index} for ${target.name}. ` +
					`Use @Inject decorator to specify a token.`,
			)
		}

		const instance = new target(...dependencies)
		console.log(`  -> Created instance of ${target.name}`)
		return instance
	}

	/**
	 * Instantiate using a factory function
	 */
	private async instantiateFactory<T>(
		provider: FactoryProvider<T>,
	): Promise<T> {
		console.log(`  -> Calling factory for: ${String(provider.provide)}`)

		// Resolve dependencies sequentially
		// biome-ignore lint/suspicious/noExplicitAny: Dependencies can be of any type
		const deps: any[] = []
		for (const dep of provider.deps || []) {
			deps.push(await this.resolve(dep))
		}
		const instance = await provider.useFactory(...deps)
		return instance
	}

	// ============================================================================
	// Dependency Weight Calculation
	// ============================================================================

	/**
	 * Calculate the dependency weight for a token
	 * Weight = depth of dependency tree (higher = more dependencies)
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Token can be constructor of any type
	public calculateWeight(token: InjectionToken | Constructor<any>): number {
		// Check cache first
		if (this.weightCache.has(token)) {
			// biome-ignore lint/style/noNonNullAssertion: We know the value exists from the has() check
			return this.weightCache.get(token)!
		}

		// Value providers have weight 0 (no dependencies)
		const provider = this.providers.get(token)
		if (!provider || this.isValueProvider(provider)) {
			this.weightCache.set(token, 0)
			return 0
		}

		// Track visited nodes to detect cycles
		// biome-ignore lint/suspicious/noExplicitAny: Constructor can be of any type
		const visited = new Set<InjectionToken | Constructor<any>>()
		const weight = this.calculateWeightRecursive(token, visited)
		this.weightCache.set(token, weight)
		return weight
	}

	/**
	 * Recursive helper for weight calculation
	 */
	private calculateWeightRecursive(
		// biome-ignore lint/suspicious/noExplicitAny: Constructor can be of any type
		token: InjectionToken | Constructor<any>,
		// biome-ignore lint/suspicious/noExplicitAny: Constructor can be of any type
		visited: Set<InjectionToken | Constructor<any>>,
	): number {
		// Circular dependency or already visited
		if (visited.has(token)) {
			return 0
		}

		visited.add(token)

		const provider = this.providers.get(token)
		if (!provider) {
			return 0
		}

		// Value providers have no dependencies
		if (this.isValueProvider(provider)) {
			return 0
		}

		// biome-ignore lint/suspicious/noExplicitAny: Constructor can be of any type
		let deps: (InjectionToken | Constructor<any>)[] = []

		// Get dependencies based on provider type
		if (this.isFactoryProvider(provider)) {
			// Factory provider: use explicit deps
			deps = provider.deps || []
		} else if (this.isClassProvider(provider)) {
			// Class provider: get constructor dependencies
			deps = this.getClassDependencies(provider.useClass)
		} else {
			// Plain constructor
			// biome-ignore lint/suspicious/noExplicitAny: Provider is a constructor of any type
			deps = this.getClassDependencies(provider as Constructor<any>)
		}

		// If no dependencies, weight is 0
		if (deps.length === 0) {
			return 0
		}

		// Otherwise, weight = max dependency weight + 1
		let maxDepWeight = 0
		for (const dep of deps) {
			const depWeight = this.calculateWeightRecursive(dep, new Set(visited))
			maxDepWeight = Math.max(maxDepWeight, depWeight)
		}

		return maxDepWeight + 1
	}

	/**
	 * Get dependencies for a class constructor
	 */
	private getClassDependencies(
		// biome-ignore lint/suspicious/noExplicitAny: Constructor can be of any type
		target: Constructor<any>,
	): (InjectionToken | Constructor<unknown>)[] {
		// biome-ignore lint/suspicious/noExplicitAny: Metadata can be of any type
		const injectionTokens: any[] =
			Reflect.getMetadata('inject:tokens', target) || []

		// biome-ignore lint/suspicious/noExplicitAny: Constructor parameters can be of any type
		const paramTypes: Constructor<any>[] =
			Reflect.getMetadata('design:paramtypes', target) || []

		const dependencies: (InjectionToken | Constructor<unknown>)[] = []

		paramTypes.forEach((paramType, index) => {
			const token = injectionTokens[index]
			if (token) {
				// Skip both new @Lazy and old lazy() patterns for weight calculation
				const isNewLazy = typeof token === 'object' && '__lazyToken' in token
				const isOldLazy = token instanceof LazyRefMarker

				if (!isNewLazy && !isOldLazy) {
					dependencies.push(token as InjectionToken)
				}
			} else if (paramType) {
				// Use parameter type
				dependencies.push(paramType)
			}
		})

		return dependencies
	}

	/**
	 * Get all providers sorted by weight (lowest first)
	 * This gives you the optimal resolution order
	 */
	public getProvidersByWeight(): Array<{
		// biome-ignore lint/suspicious/noExplicitAny: Token can be constructor of any type
		token: InjectionToken | Constructor<any>
		weight: number
	}> {
		const result: Array<{
			// biome-ignore lint/suspicious/noExplicitAny: Token can be constructor of any type
			token: InjectionToken | Constructor<any>
			weight: number
		}> = []

		for (const token of this.providers.keys()) {
			const weight = this.calculateWeight(token)
			result.push({ token, weight })
		}

		// Sort by weight (ascending)
		result.sort((a, b) => a.weight - b.weight)

		return result
	}

	/**
	 * Resolve all providers in optimal order (by weight)
	 * Lazy-referenced services are resolved last (lower priority)
	 * Useful for bulk initialization/bootstrapping
	 */
	public async resolveAll(): Promise<
		// biome-ignore lint/suspicious/noExplicitAny: Can contain constructors and instances of any type
		Map<InjectionToken | Constructor<any>, any>
	> {
		console.log('\n🔄 Resolving all providers in optimal order...\n')

		const sorted = this.getProvidersByWeight()
		// biome-ignore lint/suspicious/noExplicitAny: Lazy targets can be of any type
		const lazyTargets = new Set<InjectionToken | Constructor<any>>()

		// Collect all lazy-referenced targets
		for (const token of this.providers.keys()) {
			const provider = this.providers.get(token)
			if (provider && !this.isValueProvider(provider)) {
				const target = this.isClassProvider(provider)
					? provider.useClass
					: // biome-ignore lint/suspicious/noExplicitAny: Provider is a constructor of any type
						(provider as Constructor<any>)
				// biome-ignore lint/suspicious/noExplicitAny: Injection tokens can be of any type
				const injectionTokens: any[] =
					Reflect.getMetadata('inject:tokens', target) || []

				injectionTokens.forEach((injectToken) => {
					// Check for new @Lazy pattern
					if (
						injectToken &&
						typeof injectToken === 'object' &&
						'__lazyToken' in injectToken
					) {
						lazyTargets.add(injectToken.__lazyToken)
					}
					// Check for old lazy() pattern
					if (injectToken instanceof LazyRefMarker) {
						lazyTargets.add(injectToken.ref())
					}
				})
			}
		}

		// First pass: resolve non-lazy services
		for (const { token, weight } of sorted) {
			if (!this.instances.has(token) && !lazyTargets.has(token)) {
				console.log(`[Weight ${weight}] Resolving: ${this.getTokenName(token)}`)
				try {
					// biome-ignore lint/suspicious/noExplicitAny: Token can be constructor or string/symbol
					await this.resolve(token as any)
					// biome-ignore lint/suspicious/noExplicitAny: Error can be of any type
				} catch (error: any) {
					console.log(`  ✗ Failed: ${error.message}`)
				}
			}
		}

		// Second pass: resolve lazy-referenced services (low priority)
		console.log('\nResolving lazy-referenced services (low priority)...\n')
		for (const { token, weight } of sorted) {
			if (!this.instances.has(token) && lazyTargets.has(token)) {
				console.log(
					`[Lazy, Weight ${weight}] Resolving: ${this.getTokenName(token)}`,
				)
				try {
					// biome-ignore lint/suspicious/noExplicitAny: Token can be constructor or string/symbol
					await this.resolve(token as any)
					// biome-ignore lint/suspicious/noExplicitAny: Error can be of any type
				} catch (error: any) {
					console.log(`  ✗ Failed: ${error.message}`)
				}
			}
		}

		console.log('\n✅ All providers resolved!\n')
		return this.instances
	}

	/**
	 * Bootstrap the container with a list of providers (NestJS-style)
	 * This is a convenient way to register and resolve multiple providers at once
	 *
	 * @param providers - Array of providers (classes or provider objects)
	 * @returns The container instance (for chaining)
	 *
	 * @example
	 * // Simple usage
	 * await container.bootstrap([
	 *   ServiceA,
	 *   ServiceB,
	 *   { provide: 'CONFIG', useValue: { port: 3000 } }
	 * ])
	 *
	 * @example
	 * // With configuration
	 * const container = await Container.getContainer().bootstrap({
	 *   providers: [UserService, DatabaseService, AuthService]
	 * })
	 */
	public async bootstrap(
		providersOrConfig: Provider[] | { providers: Provider[] },
	): Promise<this> {
		console.log('\n🚀 Bootstrapping container...\n')

		// Handle both array and object format
		const providers = Array.isArray(providersOrConfig)
			? providersOrConfig
			: providersOrConfig.providers

		// Register all providers
		for (const provider of providers) {
			this.register(provider)
		}

		// Resolve all providers
		await this.resolveAll()

		console.log('🎉 Container bootstrapped successfully!\n')
		return this
	}

	/**
	 * Get dependency graph for visualization/debugging
	 */
	public getDependencyGraph(): Map<
		string,
		{ weight: number; dependencies: string[] }
	> {
		const graph = new Map<string, { weight: number; dependencies: string[] }>()

		for (const token of this.providers.keys()) {
			const tokenName = this.getTokenName(token)
			const weight = this.calculateWeight(token)
			const dependencies: string[] = []

			const provider = this.providers.get(token)
			if (provider && !this.isValueProvider(provider)) {
				if (this.isFactoryProvider(provider)) {
					const deps = provider.deps || []
					dependencies.push(...deps.map((d) => this.getTokenName(d)))
				} else if (this.isClassProvider(provider)) {
					const deps = this.getClassDependencies(provider.useClass)
					dependencies.push(...deps.map((d) => this.getTokenName(d)))
				} else {
					// biome-ignore lint/suspicious/noExplicitAny: Provider is a constructor of any type
					const deps = this.getClassDependencies(provider as Constructor<any>)
					dependencies.push(...deps.map((d) => this.getTokenName(d)))
				}
			}

			graph.set(tokenName, { weight, dependencies })
		}

		return graph
	}

	// Type guards
	private isClassProvider<T = unknown>(
		provider: Provider<T>,
	): provider is ClassProvider<T> {
		return (provider as ClassProvider).useClass !== undefined
	}

	private isValueProvider<T = unknown>(
		provider: Provider<T>,
	): provider is ValueProvider<T> {
		return (provider as ValueProvider).useValue !== undefined
	}

	private isFactoryProvider<T = unknown>(
		provider: Provider<T>,
	): provider is FactoryProvider<T> {
		return (provider as FactoryProvider).useFactory !== undefined
	}

	// biome-ignore lint/suspicious/noExplicitAny: Token can be constructor of any type
	private getTokenName(token: InjectionToken | Constructor<any>): string {
		if (typeof token === 'function') {
			return token.name
		}
		return String(token)
	}
}
