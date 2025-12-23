import 'reflect-metadata'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * A constructor function that creates instances of type T
 * @template T - The type of instance the constructor creates
 * @example
 * class MyService {}
 * const ctor: Constructor<MyService> = MyService
 */
// biome-ignore lint/suspicious/noExplicitAny: Constructor args can be any type
export type Constructor<T = unknown> = new (...args: any[]) => T

/**
 * Token used to identify a dependency in the container
 * Can be a string, symbol, or class constructor
 * @template T - The type of value associated with this token
 * @example
 * const TOKEN: InjectionToken<string> = 'MY_TOKEN'
 * const SYMBOL_TOKEN: InjectionToken<number> = Symbol('COUNT')
 * const CLASS_TOKEN: InjectionToken<MyService> = MyService
 */
export type InjectionToken<T = unknown> = string | symbol | Constructor<T>

/**
 * Provider that uses a class constructor to create instances
 * @template T - The type of instance to create
 * @example
 * {
 *   provide: 'MyService',
 *   useClass: MyServiceImpl,
 *   deps: [ConfigService], // Optional: for weight calculation
 *   onInit: async (instance) => await instance.initialize()
 * }
 */
export interface ClassProvider<T = unknown> {
	/** Token to identify this provider */
	provide: InjectionToken<T>
	/** Class constructor to instantiate */
	useClass: Constructor<T>
	/** Optional dependencies (affects resolution order/weight) */
	// biome-ignore lint/suspicious/noExplicitAny: Dependencies can be of any type
	deps?: (InjectionToken | Constructor<any>)[]
	/** Optional lifecycle hook called after instantiation */
	onInit?: (instance: T) => Promise<void> | void
}

/**
 * Provider that uses a pre-existing value
 * @template T - The type of the value
 * @example
 * {
 *   provide: 'CONFIG',
 *   useValue: { port: 3000, host: 'localhost' }
 * }
 */
export interface ValueProvider<T = unknown> {
	/** Token to identify this provider */
	provide: InjectionToken<T>
	/** The value to provide */
	useValue: T
}

/**
 * Provider that uses a factory function to create instances
 * @template T - The type of instance to create
 * @example
 * {
 *   provide: 'DATABASE',
 *   useFactory: (config: Config) => new Database(config),
 *   deps: [ConfigService],
 *   onInit: async (db) => await db.connect()
 * }
 */
export interface FactoryProvider<T = unknown> {
	/** Token to identify this provider */
	provide: InjectionToken<T>
	/** Factory function to create the instance */
	// biome-ignore lint/suspicious/noExplicitAny: Factory function args can be any type
	useFactory: (...args: any[]) => T | Promise<T>
	/** Optional dependencies to inject into the factory function */
	// biome-ignore lint/suspicious/noExplicitAny: Dependencies can be of any type
	deps?: (InjectionToken | Constructor<any>)[]
	/** Optional lifecycle hook called after instantiation */
	onInit?: (instance: T) => Promise<void> | void
}

/**
 * Union type of all possible provider configurations
 * @template T - The type of instance to create
 * @example
 * const providers: Provider[] = [
 *   MyService,  // Plain class
 *   { provide: 'TOKEN', useClass: MyServiceImpl },
 *   { provide: 'VALUE', useValue: 42 },
 *   { provide: 'FACTORY', useFactory: () => createService() }
 * ]
 */
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
 *
 * Allows breaking circular dependencies by deferring resolution until the dependency is accessed.
 * The dependency is resolved from the container only when you call `.get()` or `.value`.
 *
 * @template T - The type of the lazy dependency
 *
 * @example
 * class ServiceA {
 *   constructor(@Lazy(ServiceB) private serviceB: LazyRef<ServiceB>) {}
 *
 *   doSomething() {
 *     // ServiceB is resolved when you access it
 *     this.serviceB.value.someMethod()
 *   }
 * }
 */
export class LazyRef<T = unknown> {
	constructor(
		private readonly container: Container,
		private readonly token: Constructor<T> | InjectionToken<T>,
	) {}

	/**
	 * Get the resolved instance synchronously
	 *
	 * @returns The resolved instance
	 * @throws {Error} If the instance has not been resolved yet
	 *
	 * @example
	 * const instance = lazyRef.get()
	 */
	get(): T {
		return this.container.getInstanceOrThrow<T>(this.token)
	}

	/**
	 * Get the resolved instance synchronously via property accessor
	 *
	 * @returns The resolved instance
	 * @throws {Error} If the instance has not been resolved yet
	 *
	 * @example
	 * const result = lazyRef.value.someMethod()
	 */
	get value(): T {
		return this.container.getInstanceOrThrow<T>(this.token)
	}

	/**
	 * Try to get the resolved instance synchronously without throwing
	 *
	 * @returns The resolved instance or undefined if not yet resolved
	 *
	 * @example
	 * const instance = lazyRef.tryGetValue()
	 * if (instance) {
	 *   instance.doSomething()
	 * }
	 */
	tryGetValue(): T | undefined {
		return this.container.getInstance<T>(this.token)
	}

	/**
	 * Check if the instance has been resolved yet
	 *
	 * @returns True if the instance is available, false otherwise
	 *
	 * @example
	 * if (lazyRef.isResolved()) {
	 *   console.log('Instance is ready')
	 * }
	 */
	isResolved(): boolean {
		return this.container.getInstance(this.token) !== undefined
	}

	/**
	 * Reset the lazy reference (primarily for testing)
	 *
	 * Clears the instance from the container cache, allowing it to be re-resolved.
	 * Use with caution in production code.
	 *
	 * @example
	 * lazyRef.reset() // Instance will be re-created on next access
	 */
	reset(): void {
		// biome-ignore lint/suspicious/noExplicitAny: Accessing private property for testing
		const instances = (this.container as any).instances
		instances.delete(this.token)
	}
}

/**
 * Internal marker for lazy references (used by old lazy() function)
 *
 * @template T - The type of the lazy dependency
 * @internal
 */
export class LazyRefMarker<T = unknown> {
	constructor(public readonly ref: () => Constructor<T>) {}
}

/**
 * Old-style lazy reference function (for backward compatibility)
 *
 * Creates a lazy reference marker that defers dependency resolution.
 * Prefer using the `@Lazy()` decorator instead.
 *
 * @template T - The type of the lazy dependency
 * @param fn - Function that returns the constructor to be lazily resolved
 * @returns A lazy reference marker
 *
 * @deprecated Use @Lazy() decorator instead
 *
 * @example
 * class ServiceA {
 *   constructor(
 *     @Inject(lazy(() => ServiceB)) private serviceB: LazyRef<ServiceB>
 *   ) {}
 * }
 */
export function lazy<T>(fn: () => Constructor<T>): LazyRefMarker<T> {
	return new LazyRefMarker(fn)
}

/**
 * Lazy dependency injection decorator (RECOMMENDED)
 *
 * Injects a LazyRef wrapper that defers dependency resolution until accessed.
 * This is useful for breaking circular dependencies.
 *
 * @template T - The type of the lazy dependency
 * @param token - The injection token or class constructor to lazily resolve
 * @returns A parameter decorator
 *
 * @example
 * class ServiceA {
 *   constructor(
 *     @Lazy(ServiceB) private serviceB: LazyRef<ServiceB>
 *   ) {}
 *
 *   doSomething() {
 *     // ServiceB is resolved when accessed
 *     this.serviceB.value.method()
 *   }
 * }
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

/**
 * Alias for lazy() function (NestJS compatibility)
 *
 * @deprecated Use @Lazy() decorator instead
 */
export const forwardRef: typeof lazy = lazy

/**
 * Type alias for LazyRefMarker (NestJS compatibility)
 *
 * @template T - The type of the lazy dependency
 */
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
 * Injectable class decorator
 *
 * Marks a class as injectable and stores metadata for dependency injection.
 * Classes decorated with @Injectable() can be registered in the container
 * and have their dependencies automatically resolved.
 *
 * @param options - Optional configuration for the injectable
 * @returns A class decorator
 *
 * @example
 * // Simple usage
 * &#64;Injectable()
 * class MyService {
 *   constructor(private dep: OtherService) {}
 * }
 *
 * @example
 * // With metadata
 * &#64;Injectable({ metadata: { role: 'service', layer: 'data' } })
 * class DatabaseService {
 *   // ...
 * }
 *
 * @example
 * // With scope (for future features)
 * &#64;Injectable({ scope: 'singleton' })
 * class ConfigService {
 *   // ...
 * }
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

/**
 * Inject parameter decorator
 *
 * Specifies which token to use for injecting a dependency.
 * Use this when you need to inject a value by token instead of by type.
 *
 * @param token - The injection token to use for this parameter
 * @returns A parameter decorator
 *
 * @example
 * // Inject by string token
 * class MyService {
 *   constructor(@Inject('CONFIG') private config: Config) {}
 * }
 *
 * @example
 * // Inject by symbol token
 * const LOGGER = Symbol('Logger')
 * class MyService {
 *   constructor(@Inject(LOGGER) private logger: Logger) {}
 * }
 *
 * @example
 * // Inject with lazy reference (old style)
 * class ServiceA {
 *   constructor(
 *     @Inject(lazy(() => ServiceB)) private serviceB: LazyRef<ServiceB>
 *   ) {}
 * }
 */
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
 *
 * Retrieves the metadata stored by the @Injectable() decorator.
 * Useful for inspecting or utilizing the metadata at runtime.
 *
 * @param target - The class to get metadata from
 * @returns The injectable options or undefined if not decorated with @Injectable
 *
 * @example
 * &#64;Injectable({ metadata: { role: 'service' } })
 * class MyService {}
 *
 * const metadata = getInjectableMetadata(MyService)
 * console.log(metadata?.scope) // 'singleton'
 * console.log(metadata?.metadata) // { role: 'service' }
 */
export function getInjectableMetadata(
	target: Constructor<unknown>,
): InjectableOptions | undefined {
	return Reflect.getMetadata('injectable:options', target)
}

// ============================================================================
// Group Decorator (for grouping providers)
// ============================================================================

/**
 * Options for @Group decorator
 * Used to group related providers together
 */
export interface GroupOptions {
	/**
	 * Providers that belong to this group
	 * Can include classes, providers, or other groups
	 */
	providers?: Provider[]

	/**
	 * Dependencies for weight calculation
	 * These affect resolution order even if not directly used
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Dependencies can be of any type
	deps?: (InjectionToken | Constructor<any>)[]

	/**
	 * Additional options (for future extensibility)
	 */
	[key: string]: unknown
}

/**
 * Group class decorator
 *
 * Marks a class as a provider group. Groups allow you to organize related
 * providers together and can be used in deps arrays or bootstrap.
 * Groups are flattened during resolution.
 *
 * @param options - Configuration for the group
 * @returns A class decorator
 *
 * @example
 * // Create a group of auth-related services
 * &#64;Group({
 *   providers: [AuthService, TokenService, UserService]
 * })
 * class AuthModule {}
 *
 * @example
 * // Use group in deps
 * container.register({
 *   provide: AppService,
 *   useFactory: () => new AppService(),
 *   deps: [AuthModule, ConfigService] // AuthModule gets flattened
 * })
 *
 * @example
 * // Bootstrap with groups
 * await container.bootstrap([
 *   ConfigModule,
 *   AuthModule,
 *   AppService
 * ])
 */
export function Group(options: GroupOptions = {}): ClassDecorator {
	return (target: object) => {
		// Store group metadata
		const metadata = {
			providers: [],
			deps: [],
			...options,
		}
		Reflect.defineMetadata('group:options', metadata, target)
	}
}

/**
 * Get group metadata from a class
 *
 * Retrieves the metadata stored by the @Group() decorator.
 *
 * @param target - The class to get metadata from
 * @returns The group options or undefined if not decorated with @Group
 *
 * @example
 * &#64;Group({ providers: [ServiceA, ServiceB] })
 * class MyModule {}
 *
 * const metadata = getGroupMetadata(MyModule)
 * console.log(metadata?.providers) // [ServiceA, ServiceB]
 */
export function getGroupMetadata(
	// biome-ignore lint/suspicious/noExplicitAny: Constructor can be of any type
	target: Constructor<any>,
): GroupOptions | undefined {
	return Reflect.getMetadata('group:options', target)
}

/**
 * Check if a constructor is decorated with @Group
 *
 * @param target - The constructor to check
 * @returns True if the constructor has @Group decorator
 *
 * @example
 * if (isGroup(MyModule)) {
 *   console.log('MyModule is a group')
 * }
 */
// biome-ignore lint/suspicious/noExplicitAny: Constructor can be of any type
export function isGroup(target: any): target is Constructor<any> {
	return (
		typeof target === 'function' && Reflect.hasMetadata('group:options', target)
	)
}

// ============================================================================
// Container with Injection Tokens
// ============================================================================

/**
 * Dependency Injection Container
 *
 * The Container manages dependency registration, resolution, and lifecycle.
 * It supports multiple provider types (class, value, factory), automatic dependency
 * resolution, circular dependency detection, lazy injection, and more.
 *
 * The container is a singleton - use `Container.createOrGet()` to access it.
 *
 * @example
 * // Get the container instance
 * const container = Container.createOrGet()
 *
 * @example
 * // Register and resolve services
 * container.register(MyService)
 * const instance = await container.resolve(MyService)
 *
 * @example
 * // Bootstrap with multiple providers
 * await container.bootstrap([
 *   ServiceA,
 *   ServiceB,
 *   { provide: 'CONFIG', useValue: config }
 * ])
 */
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

	/**
	 * Get or create the singleton container instance
	 *
	 * @returns The singleton container instance
	 *
	 * @example
	 * const container = Container.createOrGet()
	 */
	public static createOrGet(): Container {
		if (!Container.instance) {
			Container.instance = new Container()
		}
		return Container.instance
	}

	/**
	 * Get or create the singleton container instance
	 *
	 * @deprecated Use createOrGet() instead
	 * @returns The singleton container instance
	 */
	public static getContainer(): Container {
		return Container.createOrGet()
	}

	/**
	 * Clear all providers and instances
	 *
	 * Removes all registered providers and cached instances.
	 * Useful for testing or resetting the container state.
	 *
	 * @example
	 * container.clear()
	 */
	public clear(): void {
		this.providers.clear()
		this.instances.clear()
		this.resolutionStack.clear()
		this.weightCache.clear()
	}

	/**
	 * Get the key for a provider
	 *
	 * @private
	 * @template T - The provider type
	 * @param provider - The provider to get the key from
	 * @returns The injection token or constructor used as the key
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
	 *
	 * Stores the provider configuration for later resolution.
	 * Value providers are cached immediately.
	 *
	 * @template T - The type of instance to provide
	 * @param provider - The provider configuration
	 *
	 * @example
	 * // Register a class
	 * container.register(MyService)
	 *
	 * @example
	 * // Register with token
	 * container.register({ provide: 'CONFIG', useValue: config })
	 *
	 * @example
	 * // Register with factory
	 * container.register({
	 *   provide: 'DB',
	 *   useFactory: (config) => new Database(config),
	 *   deps: ['CONFIG']
	 * })
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
	 * Get an already-resolved instance synchronously
	 *
	 * Returns the cached instance if it has been resolved, otherwise returns undefined.
	 * Use this when you're not sure if an instance has been resolved yet.
	 *
	 * @template T - The type of instance to get
	 * @param token - The injection token or class constructor
	 * @returns The resolved instance or undefined if not yet resolved
	 *
	 * @example
	 * const instance = container.getInstance(MyService)
	 * if (instance) {
	 *   instance.doSomething()
	 * }
	 */
	public getInstance<T = unknown>(
		token: InjectionToken<T> | Constructor<T>,
	): T | undefined {
		return this.instances.get(token) as T | undefined
	}

	/**
	 * Get an already-resolved instance synchronously
	 *
	 * Returns the cached instance if it has been resolved, throws an error otherwise.
	 * Use this when you expect the instance to already be resolved.
	 *
	 * @template T - The type of instance to get
	 * @param token - The injection token or class constructor
	 * @returns The resolved instance
	 * @throws {Error} If the instance has not been resolved yet
	 *
	 * @example
	 * const instance = container.getInstanceOrThrow(MyService)
	 * instance.doSomething()
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
	 *
	 * Returns a read-only view of all resolved instances in the container.
	 *
	 * @returns Read-only map of all cached instances
	 *
	 * @example
	 * const instances = container.getInstancesMap()
	 * console.log(`Resolved ${instances.size} instances`)
	 */
	public getInstancesMap(): ReadonlyMap<
		InjectionToken | Constructor<unknown>,
		unknown
	> {
		return this.instances
	}

	/**
	 * Get the providers map (for advanced usage)
	 *
	 * Returns a read-only view of all registered providers in the container.
	 *
	 * @returns Read-only map of all registered providers
	 *
	 * @example
	 * const providers = container.getProvidersMap()
	 * console.log(`Registered ${providers.size} providers`)
	 */
	public getProvidersMap(): ReadonlyMap<
		InjectionToken | Constructor<unknown>,
		Provider<unknown>
	> {
		return this.providers
	}

	/**
	 * Resolve a dependency by token or class
	 *
	 * Resolves the dependency and all its transitive dependencies.
	 * The result is cached for subsequent calls.
	 * Detects circular dependencies and throws an error if found.
	 *
	 * @template T - The type of instance to resolve
	 * @param token - The injection token or class constructor to resolve
	 * @param skipCircularCheck - Internal flag to skip circular dependency detection
	 * @returns A promise that resolves to the instance
	 * @throws {Error} If circular dependency is detected or provider is not found
	 *
	 * @example
	 * const service = await container.resolve(MyService)
	 *
	 * @example
	 * const config = await container.resolve('CONFIG')
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
	 *
	 * @private
	 * @template T - The type of instance to create
	 * @param target - The class constructor to instantiate
	 * @returns A promise that resolves to the new instance
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
	 *
	 * @private
	 * @template T - The type of instance to create
	 * @param provider - The factory provider configuration
	 * @returns A promise that resolves to the new instance
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
	 *
	 * Weight represents the depth of the dependency tree.
	 * Higher weight = more dependencies = should be resolved later.
	 * Value providers and services with no dependencies have weight 0.
	 *
	 * @param token - The injection token or class to calculate weight for
	 * @returns The dependency weight (0 or higher)
	 *
	 * @example
	 * const weight = container.calculateWeight(MyService)
	 * console.log(`MyService has weight ${weight}`)
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
	 *
	 * @private
	 * @param token - The token to calculate weight for
	 * @param visited - Set of already visited tokens (to detect cycles)
	 * @returns The calculated weight
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
			// Factory provider: use explicit deps (flatten groups)
			deps = provider.deps ? this.flattenDeps(provider.deps) : []
		} else if (this.isClassProvider(provider)) {
			// Class provider: merge explicit deps with constructor dependencies
			const explicitDeps = provider.deps ? this.flattenDeps(provider.deps) : []
			const constructorDeps = this.getClassDependencies(provider.useClass)
			// Combine both, using Set to avoid duplicates
			const allDeps = [...new Set([...explicitDeps, ...constructorDeps])]
			deps = allDeps
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
	 *
	 * @private
	 * @param target - The class constructor to analyze
	 * @returns Array of dependency tokens
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
	 *
	 * Returns providers in optimal resolution order.
	 * Services with fewer dependencies (lower weight) come first.
	 *
	 * @returns Array of providers with their weights, sorted by weight ascending
	 *
	 * @example
	 * const sorted = container.getProvidersByWeight()
	 * sorted.forEach(({ token, weight }) => {
	 *   console.log(`${token}: weight ${weight}`)
	 * })
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
	 *
	 * Resolves all registered providers, starting with those that have fewer dependencies.
	 * Lazy-referenced services are resolved last (lower priority).
	 * This is useful for bulk initialization/bootstrapping.
	 *
	 * @returns A promise that resolves to a map of all resolved instances
	 *
	 * @example
	 * await container.resolveAll()
	 * console.log('All services initialized!')
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
	 *
	 * This is a convenient way to register and resolve multiple providers at once.
	 * All providers are registered first, then resolved in optimal order.
	 * Groups are automatically flattened during registration.
	 *
	 * @param providersOrConfig - Array of providers or config object with providers
	 * @returns The container instance (for chaining)
	 *
	 * @example
	 * // Simple usage with array
	 * await container.bootstrap([
	 *   ServiceA,
	 *   ServiceB,
	 *   { provide: 'CONFIG', useValue: { port: 3000 } }
	 * ])
	 *
	 * @example
	 * // With configuration object
	 * await container.bootstrap({
	 *   providers: [UserService, DatabaseService, AuthService]
	 * })
	 *
	 * @example
	 * // With groups
	 * await container.bootstrap([
	 *   ConfigModule,  // Group gets flattened
	 *   AuthModule,    // Group gets flattened
	 *   AppService
	 * ])
	 */
	public async bootstrap(
		providersOrConfig: Provider[] | { providers: Provider[] },
	): Promise<this> {
		console.log('\n🚀 Bootstrapping container...\n')

		// Handle both array and object format
		const providers = Array.isArray(providersOrConfig)
			? providersOrConfig
			: providersOrConfig.providers

		// Flatten groups in the providers array
		console.log('Flattening groups...')
		const flattenedProviders = this.flattenProviders(providers)
		console.log(
			`Flattened ${providers.length} items into ${flattenedProviders.length} providers\n`,
		)

		// Register all providers
		for (const provider of flattenedProviders) {
			this.register(provider)
		}

		// Resolve all providers
		await this.resolveAll()

		console.log('🎉 Container bootstrapped successfully!\n')
		return this
	}

	/**
	 * Get dependency graph for visualization/debugging
	 *
	 * Returns a map showing each provider's weight and its direct dependencies.
	 * Useful for understanding the dependency structure or generating visualizations.
	 *
	 * @returns Map of service names to their dependency information
	 *
	 * @example
	 * const graph = container.getDependencyGraph()
	 * graph.forEach((info, name) => {
	 *   console.log(`${name} (weight ${info.weight}):`, info.dependencies)
	 * })
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

	// ============================================================================
	// Type Guards and Helper Methods
	// ============================================================================

	/**
	 * Flatten groups in a providers array
	 *
	 * Recursively expands any groups found in the providers array.
	 * Groups are expanded to their constituent providers.
	 *
	 * @private
	 * @param providers - Array of providers that may contain groups
	 * @returns Flattened array of providers with groups expanded
	 */
	private flattenProviders(providers: Provider[]): Provider[] {
		const result: Provider[] = []
		const visited = new Set<Constructor<unknown>>()

		const flatten = (items: Provider[]) => {
			for (const item of items) {
				// Check if it's a group (plain constructor with @Group decorator)
				if (typeof item === 'function' && isGroup(item)) {
					// Prevent infinite recursion
					if (visited.has(item)) {
						continue
					}
					visited.add(item)

					const groupMeta = getGroupMetadata(item)
					if (groupMeta?.providers && groupMeta.providers.length > 0) {
						// Recursively flatten nested groups
						flatten(groupMeta.providers)
					}
				} else {
					// Regular provider, add it
					result.push(item)
				}
			}
		}

		flatten(providers)
		return result
	}

	/**
	 * Flatten groups in a deps array
	 *
	 * Expands any groups found in the deps array to their constituent providers.
	 * Also includes the group's own deps for weight calculation.
	 *
	 * @private
	 * @param deps - Array of dependencies that may contain groups
	 * @returns Flattened array of dependencies with groups expanded
	 */
	private flattenDeps(
		// biome-ignore lint/suspicious/noExplicitAny: Dependencies can be of any type
		deps: (InjectionToken | Constructor<any>)[],
		// biome-ignore lint/suspicious/noExplicitAny: Dependencies can be of any type
	): (InjectionToken | Constructor<any>)[] {
		// biome-ignore lint/suspicious/noExplicitAny: Dependencies can be of any type
		const result: (InjectionToken | Constructor<any>)[] = []
		const visited = new Set<Constructor<unknown>>()

		// biome-ignore lint/suspicious/noExplicitAny: Dependencies can be of any type
		const flatten = (items: (InjectionToken | Constructor<any>)[]) => {
			for (const item of items) {
				// Check if it's a group
				if (typeof item === 'function' && isGroup(item)) {
					// Prevent infinite recursion
					if (visited.has(item)) {
						continue
					}
					visited.add(item)

					const groupMeta = getGroupMetadata(item)
					if (groupMeta) {
						// Add the group's deps first (for weight calculation)
						if (groupMeta.deps && groupMeta.deps.length > 0) {
							flatten(groupMeta.deps)
						}

						// Then flatten the group's providers
						if (groupMeta.providers && groupMeta.providers.length > 0) {
							const flattenedProviders = this.flattenProviders(
								groupMeta.providers,
							)
							// Extract tokens from providers
							for (const provider of flattenedProviders) {
								const token = this.getProviderKey(provider)
								result.push(token)
							}
						}
					}
				} else {
					// Regular dependency, add it
					result.push(item)
				}
			}
		}

		flatten(deps)
		return result
	}

	/**
	 * Check if a provider is a class provider
	 *
	 * @private
	 * @template T - The provider type
	 * @param provider - The provider to check
	 * @returns True if the provider is a ClassProvider
	 */
	private isClassProvider<T = unknown>(
		provider: Provider<T>,
	): provider is ClassProvider<T> {
		return (provider as ClassProvider).useClass !== undefined
	}

	/**
	 * Check if a provider is a value provider
	 *
	 * @private
	 * @template T - The provider type
	 * @param provider - The provider to check
	 * @returns True if the provider is a ValueProvider
	 */
	private isValueProvider<T = unknown>(
		provider: Provider<T>,
	): provider is ValueProvider<T> {
		return (provider as ValueProvider).useValue !== undefined
	}

	/**
	 * Check if a provider is a factory provider
	 *
	 * @private
	 * @template T - The provider type
	 * @param provider - The provider to check
	 * @returns True if the provider is a FactoryProvider
	 */
	private isFactoryProvider<T = unknown>(
		provider: Provider<T>,
	): provider is FactoryProvider<T> {
		return (provider as FactoryProvider).useFactory !== undefined
	}

	/**
	 * Get a human-readable name for a token
	 *
	 * @private
	 * @param token - The injection token
	 * @returns A string representation of the token
	 */
	// biome-ignore lint/suspicious/noExplicitAny: Token can be constructor of any type
	private getTokenName(token: InjectionToken | Constructor<any>): string {
		if (typeof token === 'function') {
			return token.name
		}
		return String(token)
	}
}
